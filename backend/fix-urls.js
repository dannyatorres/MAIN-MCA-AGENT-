// fix-urls.js
// Run this to switch your frontend from Absolute URLs to Relative URLs
const fs = require('fs');
const path = require('path');

// Configuration
const FRONTEND_DIR = path.join(__dirname, '../frontend');
const TARGETS = [
    'https://api.mcagent.io',
    'http://api.mcagent.io',
    'https://mcagent-production.up.railway.app' // Just in case
];

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function(file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            // Only look at code files
            if (file.endsWith('.js') || file.endsWith('.html') || file.endsWith('.css')) {
                arrayOfFiles.push(path.join(dirPath, "/", file));
            }
        }
    });
    return arrayOfFiles;
}

try {
    console.log(`🔍 Scanning directory: ${FRONTEND_DIR}`);
    const files = getAllFiles(FRONTEND_DIR);
    let modifiedCount = 0;

    files.forEach(file => {
        let content = fs.readFileSync(file, 'utf8');
        let originalContent = content;

        TARGETS.forEach(target => {
            // Global replace of the domain with an empty string
            // Example: "https://api.mcagent.io/api/login" -> "/api/login"
            const regex = new RegExp(target, 'g');
            content = content.replace(regex, ''); 
        });

        if (content !== originalContent) {
            fs.writeFileSync(file, content, 'utf8');
            console.log(`✅ Fixed: ${path.basename(file)}`);
            modifiedCount++;
        }
    });

    console.log(`\n🎉 Complete! Updated ${modifiedCount} files.`);
    console.log('Your frontend is now using relative paths (Monolith style).');

} catch (err) {
    console.error("❌ Error:", err.message);
    console.log("Make sure your '../frontend' folder exists relative to this script.");
}
