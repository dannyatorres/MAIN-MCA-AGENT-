// middleware/serviceAccess.js
// Check if a service is enabled for a user

const { getDatabase } = require('../services/database');

// Cache user settings to avoid constant DB hits
const settingsCache = new Map();
const CACHE_TTL = 60000; // 1 minute

async function getUserServiceSettings(userId) {
    if (!userId) return getDefaultSettings();

    const cached = settingsCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.settings;
    }

    try {
        const db = getDatabase();
        const result = await db.query(
            'SELECT service_settings FROM users WHERE id = $1',
            [userId]
        );

        const settings = result.rows[0]?.service_settings || getDefaultSettings();
        settingsCache.set(userId, { settings, timestamp: Date.now() });
        return settings;
    } catch (err) {
        console.error('Error fetching user service settings:', err);
        return getDefaultSettings();
    }
}

function getDefaultSettings() {
    return {
        drive_folder_id: null,
        services: {
            aiAgent: true,
            commander: true,
            fcs: true,
            driveSync: true,
            lenderMatcher: true,
            successPredictor: true
        }
    };
}

async function isServiceEnabled(userId, serviceName) {
    const settings = await getUserServiceSettings(userId);
    return settings.services?.[serviceName] !== false; // Default to enabled
}

async function getDriveFolderId(userId) {
    const settings = await getUserServiceSettings(userId);
    // Fall back to env var if user doesn't have custom folder
    return settings.drive_folder_id || process.env.GDRIVE_PARENT_FOLDER_ID;
}

// Clear cache when settings are updated
function clearSettingsCache(userId) {
    if (userId) {
        settingsCache.delete(userId);
    } else {
        settingsCache.clear();
    }
}

module.exports = {
    getUserServiceSettings,
    isServiceEnabled,
    getDriveFolderId,
    clearSettingsCache,
    getDefaultSettings
};
