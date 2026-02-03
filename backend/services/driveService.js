const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const AWS = require('aws-sdk');
const { getDatabase } = require('./database');
const { trackUsage } = require('./usageTracker');
const path = require('path');
const stream = require('stream');
require('dotenv').config();

// IMPORT THE FCS SERVICE
const fcsService = require('./fcsService');
const { getDriveFolderId, isServiceEnabled } = require('../middleware/serviceAccess');

// CONFIGURATION
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// S3 Setup
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
});

// AUTHENTICATION
let credentials;
try {
    const rawVar = process.env.GOOGLE_CREDENTIALS_JSON;
    if (!rawVar) throw new Error("Missing GOOGLE_CREDENTIALS_JSON");
    
    let jsonString = rawVar;
    if (!rawVar.trim().startsWith('{')) {
        jsonString = Buffer.from(rawVar, 'base64').toString('utf8');
    }
    credentials = JSON.parse(jsonString);
} catch (err) {
    console.error("❌ Google Auth Error:", err.message);
    credentials = null;
}

const auth = new google.auth.GoogleAuth({
    credentials: credentials,
    scopes: SCOPES,
});
const drive = google.drive({ version: 'v3', auth });

async function syncDriveFiles(conversationId, businessName, userId = null) {
    const db = getDatabase();

    // Check if service is enabled for this user
    if (userId && !(await isServiceEnabled(userId, 'driveSync'))) {
        console.log(`⏸️ Drive sync disabled for user ${userId}`);
        return { success: false, error: 'Drive sync disabled for this user' };
    }

    // Get user-specific folder ID (or fall back to env var)
    const FOLDER_ID = await getDriveFolderId(userId);
    console.log(`📂 [${businessName}] Drive sync starting...`);

    function extractFolderId(input) {
        if (!input) return null;
        const match = input.match(/\/folders\/([a-zA-Z0-9-_]+)/);
        return match ? match[1] : input;
    }

    try {
        if (!FOLDER_ID) throw new Error("Missing GDRIVE_PARENT_FOLDER_ID");

        const cleanFolderId = extractFolderId(FOLDER_ID);

        // A. LIST ALL SUB-FOLDERS
        let folders = [];
        let pageToken = null;

        do {
            const res = await drive.files.list({
                q: `'${cleanFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                fields: 'nextPageToken, files(id, name)',
                pageSize: 1000,
                pageToken: pageToken,
            });
            if (res.data.files) folders = folders.concat(res.data.files);
            pageToken = res.data.nextPageToken;
        } while (pageToken);

        if (folders.length === 0) {
            console.log("❌ No sub-folders found.");
            return { success: false, error: "Master folder appears empty" };
        }

        console.log(`📂 [${businessName}] Searching ${folders.length} folders...`);

        // B. AI MATCHING WITH GEMINI
        const prompt = `
I have a business named: "${businessName}".

Here are the Google Drive folders:
${JSON.stringify(folders.map(f => f.name))}

MATCHING RULES:
1. Ignore case (ABC = abc)
2. Ignore spaces and special characters (faithfulroofingllc = Faithful Roofing LLC)
3. Ignore suffixes: LLC, Inc, Corp, Co, Company, Holdings, Group
4. Handle concatenated/compressed names (projectcapital = Project Capital)
5. Handle typos and minor misspellings

EXAMPLES:
- "Faith Full Roofing LLC" → "faithfulroofingllc" ✓
- "ABC Trucking Inc" → "abctrucking" ✓
- "Joe's Pizza" → "joespizza" ✓

USE YOUR BEST JUDGMENT. If the core business name is recognizable, it's a match. Only return "NO_MATCH" if there's truly no reasonable connection.

Return ONLY the exact folder name as it appears in the list, or "NO_MATCH". No explanation, no quotes, just the folder name.
`;

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const matchedName = response.text().trim().replace(/['"]/g, "");

        // Track Gemini usage
        if (result.response.usageMetadata) {
            const usage = result.response.usageMetadata;
            await trackUsage({
                userId: userId,
                conversationId,
                type: 'llm_call',
                service: 'google',
                model: 'gemini-2.5-pro',
                inputTokens: usage.promptTokenCount,
                outputTokens: usage.candidatesTokenCount,
                metadata: { function: 'driveSync' }
            });
        }

        if (matchedName === "NO_MATCH") {
            console.log(`⚠️ [${businessName}] No folder match found`);
            return { success: false, error: "No matching folder found" };
        }

        const targetFolder = folders.find(f => f.name === matchedName);

        console.log(`✅ [${businessName}] Matched → "${matchedName}"`);

        // C. PEEK INSIDE
        const fileRes = await drive.files.list({
            q: `'${targetFolder.id}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType, size)',
        });

        const files = fileRes.data.files || [];
        const usefulFiles = files.filter(f =>
            f.mimeType === 'application/pdf' ||
            f.name.toLowerCase().endsWith('.pdf')
        );

        if (usefulFiles.length === 0) {
            console.log(`⚠️ Folder "${matchedName}" exists but is empty.`);
            return { success: true, count: 0, message: "Folder empty" };
        }

        console.log(`📄 [${businessName}] Found ${usefulFiles.length} PDFs, downloading...`);

        // D. DOWNLOAD & SAVE
        let uploadedCount = 0;
        for (const file of usefulFiles) {
            try {
                // 🔒 DUPLICATE CHECK - Skip if already synced
                const existingDoc = await db.query(`
                    SELECT id FROM documents
                    WHERE conversation_id = $1 AND original_filename = $2
                `, [conversationId, file.name]);

                if (existingDoc.rows.length > 0) {
                    console.log(`⏭️ Skipping duplicate: ${file.name}`);
                    continue;
                }

                // Download to buffer first (for classification)
                const driveRes = await drive.files.get(
                    { fileId: file.id, alt: 'media' },
                    { responseType: 'arraybuffer' }
                );
                const fileBuffer = Buffer.from(driveRes.data);

                const s3Key = `documents/${conversationId}/${Date.now()}_${file.name.replace(/\s/g, '_')}`;

                // Upload to S3
                await s3.upload({
                    Bucket: process.env.S3_DOCUMENTS_BUCKET,
                    Key: s3Key,
                    Body: fileBuffer,
                    ContentType: file.mimeType || 'application/pdf'
                }).promise();

                // Insert into DB with classification metadata
                const fileSize = file.size ? parseInt(file.size) : 0;

                await db.query(`
                    INSERT INTO documents (
                        conversation_id, 
                        s3_key, 
                        filename, 
                        original_filename, 
                        mime_type, 
                        file_size,
                        document_type,
                        created_at
                    )
                    VALUES ($1, $2, $3, $3, $4, $5, 'Bank Statement', NOW())
                `, [
                    conversationId,
                    s3Key,
                    file.name,
                    file.mimeType,
                    fileSize
                ]);

                uploadedCount++;

            } catch (err) {
                console.error(`❌ Failed to save ${file.name}:`, err.message);
            }
        }

        if (uploadedCount > 0) {
            console.log(`✅ [${businessName}] Synced ${uploadedCount} docs`);

            // --- ⚡ AUTO-TRIGGER FCS ANALYSIS ---
            if (await isServiceEnabled(userId, 'fcs')) {
                console.log(`⚡ [${businessName}] Running FCS...`);
                try {
                    await fcsService.generateAndSaveFCS(conversationId, businessName, db);
                    console.log(`✅ [${businessName}] FCS complete`);

                    // --- 🧠 AUTO-TRIGGER COMMANDER ---
                    if (await isServiceEnabled(userId, 'commander')) {
                        const commanderService = require('./commanderService');
                        const gamePlan = await commanderService.analyzeAndStrategize(conversationId);
                        if (gamePlan) {
                            console.log(`🎖️ [${businessName}] Strategy: Grade ${gamePlan.lead_grade} | ${gamePlan.strategy_type}`);
                        }
                    }
                } catch (fcsErr) {
                    console.error("⚠️ Auto-FCS/Commander Failed:", fcsErr.message);
                }
            } else {
                console.log("⏸️ FCS disabled for this user, skipping auto-analysis");
            }
        }

        return { success: true, count: uploadedCount };

    } catch (err) {
        console.error("❌ Drive Sync Error:", err.message);
        return { success: false, error: err.message };
    }
}

module.exports = { syncDriveFiles };
