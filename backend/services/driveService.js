const { google } = require('googleapis');
const { OpenAI } = require('openai');
const AWS = require('aws-sdk');
const { getDatabase } = require('./database');
const path = require('path');
const stream = require('stream');
require('dotenv').config();

// CONFIGURATION
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const FOLDER_ID = process.env.GDRIVE_PARENT_FOLDER_ID;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

async function syncDriveFiles(conversationId, businessName) {
    const db = getDatabase();
    console.log(`📂 Starting Drive Sync for: "${businessName}"...`);

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

        console.log(`📚 Found ${folders.length} candidate folders. Asking AI to match "${businessName}"...`);

        // B. AI MATCHING
        const prompt = `
            I have a business named: "${businessName}".
            Here are the Google Drive folders:
            ${JSON.stringify(folders.map(f => f.name))}

            Rules:
            1. Find the folder that best matches the business name.
            2. Fuzzy match is okay (e.g. "Project Capital LLC" -> "Project").
            3. Return ONLY the exact folder name. If no match, return "NO_MATCH".
        `;

        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [{ role: "system", content: prompt }],
            temperature: 0
        });

        const matchedName = completion.choices[0].message.content.trim().replace(/['"]/g, "");

        if (matchedName === "NO_MATCH") {
            console.log(`⚠️ AI could not link "${businessName}" to any folder.`);
            return { success: false, error: "No matching folder found" };
        }

        const targetFolder = folders.find(f => f.name === matchedName);
        console.log(`✅ AI Match: "${businessName}" -> Folder: "${matchedName}" (${targetFolder.id})`);

        // C. PEEK INSIDE
        const fileRes = await drive.files.list({
            q: `'${targetFolder.id}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType, size)',
        });

        const files = fileRes.data.files || [];
        const usefulFiles = files.filter(f => !f.mimeType.includes('folder'));

        if (usefulFiles.length === 0) {
            console.log(`⚠️ Folder "${matchedName}" exists but is empty.`);
            return { success: true, count: 0, message: "Folder empty" };
        }

        console.log(`👀 Peek successful: Found ${usefulFiles.length} files. Downloading...`);

        // D. DOWNLOAD & SAVE (Fixed DB Insert)
        let uploadedCount = 0;
        for (const file of usefulFiles) {
            try {
                const driveStream = await drive.files.get(
                    { fileId: file.id, alt: 'media' },
                    { responseType: 'stream' }
                );

                const pass = new stream.PassThrough();
                driveStream.data.pipe(pass);

                const s3Key = `documents/${conversationId}/${Date.now()}_${file.name.replace(/\s/g, '_')}`;

                // 1. Upload to S3
                await s3.upload({
                    Bucket: process.env.S3_DOCUMENTS_BUCKET,
                    Key: s3Key,
                    Body: pass,
                    ContentType: file.mimeType || 'application/pdf'
                }).promise();

                // 2. Insert into DB (✅ FIXED: Added filename and file_size)
                // We use 'file.size' from Google Drive. If missing, default to 0.
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
                `, [conversationId, s3Key, file.name, file.mimeType, fileSize]);

                uploadedCount++;
                console.log(`✅ Saved: ${file.name}`);

            } catch (err) {
                console.error(`❌ Failed to save ${file.name}:`, err.message);
            }
        }

        if (uploadedCount > 0) {
            await db.query("UPDATE conversations SET state = 'FCS_READY' WHERE id = $1", [conversationId]);
            console.log(`🎉 Success! Synced ${uploadedCount} documents. Lead is FCS_READY.`);
        }

        return { success: true, count: uploadedCount };

    } catch (err) {
        console.error("❌ Drive Sync Error:", err.message);
        return { success: false, error: err.message };
    }
}

module.exports = { syncDriveFiles };
