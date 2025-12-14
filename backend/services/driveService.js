// backend/services/driveService.js
const { google } = require('googleapis');
const { OpenAI } = require('openai');
const AWS = require('aws-sdk');
const { getDatabase } = require('./database');
const path = require('path');
const stream = require('stream');
require('dotenv').config();

// 1. CONFIG
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const FOLDER_ID = process.env.GDRIVE_PARENT_FOLDER_ID; // ID of the folder holding all lead folders
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// S3 Setup
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

// Auth Google
const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, '../google-service-account.json'),
    scopes: SCOPES,
});
const drive = google.drive({ version: 'v3', auth });

/**
 * The Master Function: Finds folder, downloads files, uploads to S3
 */
async function syncDriveFiles(conversationId, businessName) {
    const db = getDatabase();
    console.log(`📂 Starting Drive Sync for: ${businessName}`);

    try {
        // A. LIST ALL FOLDERS
        const res = await drive.files.list({
            q: `'${FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 1000 // Adjust if you have tons of folders
        });
        
        const folders = res.data.files;
        if (!folders || folders.length === 0) {
            console.log("❌ No folders found in Drive.");
            return { success: false, error: "Drive empty" };
        }

        // B. AI FUZZY MATCHING (The "Magic" Step)
        // We give GPT the list and ask it to pick the winner.
        const prompt = `
            I have a business named "${businessName}".
            Here is a list of Google Drive folders:
            ${JSON.stringify(folders.map(f => f.name))}
            
            Find the folder name that best matches the business name. 
            - "Project Capital LLC" matches "Project".
            - "JMS Global Inc" matches "JMS".
            - Return ONLY the exact folder name from the list. 
            - If no good match is found, return "NO_MATCH".
        `;

        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [{ role: "system", content: prompt }],
        });

        const matchedName = completion.choices[0].message.content.trim().replace(/['"]/g, "");

        if (matchedName === "NO_MATCH") {
            console.log(`⚠️ AI could not find a folder for "${businessName}"`);
            return { success: false, error: "No matching folder" };
        }

        const targetFolder = folders.find(f => f.name === matchedName);
        console.log(`✅ AI Matched "${businessName}" -> Folder: "${matchedName}" (${targetFolder.id})`);

        // C. LIST FILES IN THAT FOLDER
        const fileRes = await drive.files.list({
            q: `'${targetFolder.id}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType)',
        });

        const files = fileRes.data.files;
        console.log(`📄 Found ${files.length} files. Downloading...`);

        // D. DOWNLOAD & UPLOAD TO S3
        let uploadedCount = 0;

        for (const file of files) {
            // Skip sub-folders, only grab PDFs/Images/Excel
            if (file.mimeType.includes('folder')) continue;

            console.log(`⬇️ streaming ${file.name}...`);
            
            // 1. Stream from Google
            const driveStream = await drive.files.get(
                { fileId: file.id, alt: 'media' },
                { responseType: 'stream' }
            );

            // 2. Pass-through stream to S3
            const pass = new stream.PassThrough();
            driveStream.data.pipe(pass);

            // 3. Upload to S3
            const s3Key = `documents/${conversationId}/${Date.now()}_${file.name}`;
            await s3.upload({
                Bucket: process.env.S3_DOCUMENTS_BUCKET,
                Key: s3Key,
                Body: pass,
                ContentType: file.mimeType || 'application/pdf'
            }).promise();

            // 4. Save to DB
            await db.query(`
                INSERT INTO documents (conversation_id, s3_key, original_filename, mime_type, created_at)
                VALUES ($1, $2, $3, $4, NOW())
            `, [conversationId, s3Key, file.name, file.mimeType]);

            uploadedCount++;
        }

        // E. UPDATE STATUS (Ready for FCS)
        if (uploadedCount > 0) {
            await db.query("UPDATE conversations SET state = 'FCS_READY' WHERE id = $1", [conversationId]);
            console.log(`✅ Synced ${uploadedCount} files. Lead is ready for FCS.`);
        }

        return { success: true, count: uploadedCount };

    } catch (err) {
        console.error("❌ Drive Sync Error:", err);
        return { success: false, error: err.message };
    }
}

module.exports = { syncDriveFiles };