const { google } = require('googleapis');
const { OpenAI } = require('openai');
const AWS = require('aws-sdk');
const { getDatabase } = require('./database');
const path = require('path');
const stream = require('stream');
const fs = require('fs');
require('dotenv').config();

// 1. CONFIGURATION
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const FOLDER_ID = process.env.GDRIVE_PARENT_FOLDER_ID; // This pulls your '1fjB...' ID from Railway
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// S3 Setup
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
});

// 2. AUTHENTICATION (Smart Parsing: JSON or Base64)
let credentials;
try {
    const rawVar = process.env.GOOGLE_CREDENTIALS_JSON;
    
    if (!rawVar) {
        throw new Error("Missing GOOGLE_CREDENTIALS_JSON in environment variables.");
    }

    let jsonString = rawVar;

    // CHECK: Is this Base64? (Simple regex check)
    // If it starts with 'ey' (common for Base64 JSON) and doesn't start with '{'
    if (!rawVar.trim().startsWith('{')) {
        console.log("🔐 Detected Base64 credentials. Decoding...");
        jsonString = Buffer.from(rawVar, 'base64').toString('utf8');
    }

    credentials = JSON.parse(jsonString);
    console.log("✅ Google Credentials loaded successfully.");

} catch (err) {
    console.error("❌ Google Auth Error:", err.message);
    // Log the first 5 chars so you can debug what it's trying to parse (without leaking keys)
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
        console.error("   DEBUG: Variable starts with:", process.env.GOOGLE_CREDENTIALS_JSON.substring(0, 5) + "...");
    }
    credentials = null;
}

const auth = new google.auth.GoogleAuth({
    credentials: credentials,
    scopes: SCOPES,
});
const drive = google.drive({ version: 'v3', auth });

/**
 * THE MASTER FUNCTION
 * 1. Scans ALL folders (handling pagination)
 * 2. Uses AI to find the best match for the business name
 * 3. Downloads files & uploads to S3
 */
async function syncDriveFiles(conversationId, businessName) {
    const db = getDatabase();
    console.log(`📂 Starting Drive Sync for: "${businessName}"...`);

    try {
        if (!FOLDER_ID) {
            throw new Error("Missing GDRIVE_PARENT_FOLDER_ID in environment variables.");
        }

        // A. LIST ALL FOLDERS (With Pagination Loop)
        let folders = [];
        let pageToken = null;
        let pageCount = 0;

        do {
            const res = await drive.files.list({
                q: `'${FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                fields: 'nextPageToken, files(id, name)', // Get ID and Name
                pageSize: 1000,                           // Max allowed per page
                pageToken: pageToken,                     // Current page marker
            });

            if (res.data.files && res.data.files.length > 0) {
                folders = folders.concat(res.data.files);
            }

            pageToken = res.data.nextPageToken; // Set up next loop
            pageCount++;
            if (pageCount % 5 === 0) console.log(`...scanned ${folders.length} folders so far...`);

        } while (pageToken); // Keep going until no pages left

        if (folders.length === 0) {
            console.log("❌ No folders found in the Master Drive Folder.");
            return { success: false, error: "Drive empty" };
        }

        console.log(`📚 Indexing complete. Found ${folders.length} total folders.`);

        // B. AI FUZZY MATCHING
        // We send the folder names to GPT-4 to find the best match
        const prompt = `
            I have a business lead named: "${businessName}".
            
            Here is a list of folder names from Google Drive:
            ${JSON.stringify(folders.map(f => f.name))}
            
            TASK: Identify the folder that belongs to this business.
            RULES:
            - "Project Capital LLC" matches "Project".
            - "Danny Torres" matches "Danny T".
            - Return ONLY the exact folder name string.
            - If there is no reasonable match, return "NO_MATCH".
        `;

        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [{ role: "system", content: prompt }],
            temperature: 0 // Strict logic
        });

        const matchedName = completion.choices[0].message.content.trim().replace(/['"]/g, "");

        if (matchedName === "NO_MATCH") {
            console.log(`⚠️ AI could not find a matching folder for "${businessName}"`);
            return { success: false, error: "No matching folder found" };
        }

        const targetFolder = folders.find(f => f.name === matchedName);
        console.log(`✅ MATCH FOUND: "${businessName}" -> Folder: "${matchedName}" (ID: ${targetFolder.id})`);

        // C. LIST FILES IN TARGET FOLDER
        const fileRes = await drive.files.list({
            q: `'${targetFolder.id}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType)',
        });

        const files = fileRes.data.files;
        if (!files || files.length === 0) {
            console.log("⚠️ Folder found, but it is empty.");
            return { success: true, count: 0, message: "Folder empty" };
        }

        console.log(`📄 Found ${files.length} files. Starting transfer...`);

        // D. DOWNLOAD & UPLOAD TO S3
        let uploadedCount = 0;

        for (const file of files) {
            // Skip sub-folders (we only want actual documents)
            if (file.mimeType.includes('folder')) continue;

            console.log(`⬇️ Processing: ${file.name}`);

            try {
                // 1. Create Stream from Google
                const driveStream = await drive.files.get(
                    { fileId: file.id, alt: 'media' },
                    { responseType: 'stream' }
                );

                // 2. Pass-through to S3
                const pass = new stream.PassThrough();
                driveStream.data.pipe(pass);

                // 3. Upload to S3
                const s3Key = `documents/${conversationId}/${Date.now()}_${file.name.replace(/\s/g, '_')}`;
                
                await s3.upload({
                    Bucket: process.env.S3_DOCUMENTS_BUCKET,
                    Key: s3Key,
                    Body: pass,
                    ContentType: file.mimeType || 'application/pdf'
                }).promise();

                // 4. Save Record to Database
                await db.query(`
                    INSERT INTO documents (conversation_id, s3_key, original_filename, mime_type, created_at)
                    VALUES ($1, $2, $3, $4, NOW())
                `, [conversationId, s3Key, file.name, file.mimeType]);

                uploadedCount++;

            } catch (err) {
                console.error(`❌ Failed to upload ${file.name}:`, err.message);
            }
        }

        // E. UPDATE LEAD STATUS
        if (uploadedCount > 0) {
            await db.query("UPDATE conversations SET state = 'FCS_READY' WHERE id = $1", [conversationId]);
            console.log(`🎉 Success! Synced ${uploadedCount} documents. Lead is FCS_READY.`);
        }

        return { success: true, count: uploadedCount };

    } catch (err) {
        console.error("❌ Drive Sync System Error:", err);
        return { success: false, error: err.message };
    }
}

module.exports = { syncDriveFiles };