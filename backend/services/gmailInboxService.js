const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const path = require('path');

// Load environment variables
const rootPath = path.resolve(__dirname, '../../.env');
const backendPath = path.resolve(__dirname, '../.env');
const currentPath = path.resolve('.env');

if (require('fs').existsSync(rootPath)) {
    require('dotenv').config({ path: rootPath });
} else if (require('fs').existsSync(backendPath)) {
    require('dotenv').config({ path: backendPath });
} else if (require('fs').existsSync(currentPath)) {
    require('dotenv').config({ path: currentPath });
} else {
    require('dotenv').config();
}

// 🛡️ HELPER: Smartly decodes Base64 variables or returns raw text
const getEnvVar = (key) => {
    const value = process.env[key];
    if (!value) return null;

    // 1. If it looks like a raw Refresh Token (starts with 1//), return it raw
    if (value.startsWith('1//')) return value.trim();

    // 2. If it looks like a raw Client ID (ends with .com), return it raw
    if (value.endsWith('.com')) return value.trim();

    // 3. Otherwise, try to auto-detect Base64
    try {
        const decoded = Buffer.from(value, 'base64').toString('utf8');
        if (/^[\x20-\x7E]*$/.test(decoded)) {
            return decoded.trim();
        }
        return value.trim();
    } catch (e) {
        return value.trim();
    }
};


class GmailInboxService {
    constructor() {
        this.connection = null;
        this.isFetching = false;

        // Use the helper to get clean credentials
        const user = getEnvVar('EMAIL_USER');
        const clientId = getEnvVar('GMAIL_CLIENT_ID');
        const clientSecret = getEnvVar('GMAIL_CLIENT_SECRET');
        const refreshToken = getEnvVar('GMAIL_REFRESH_TOKEN');

        // 🚨 CRITICAL: Check for all OAuth components
        if (!user || !clientId || !clientSecret || !refreshToken) {
            console.error('❌ IMAP Connection Failed: OAuth credentials missing.');
            this.config = null; // Prevent connection attempts
            return;
        }

        // ✅ Use OAuth2 for IMAP (Gmail requires this over password)
        this.config = {
            imap: {
                user: user,
                xoauth2: { // ⬅️ THIS IS THE CRITICAL CHANGE
                    user: user,
                    clientId: clientId,
                    clientSecret: clientSecret,
                    refreshToken: refreshToken
                },
                host: 'imap.gmail.com',
                port: 993,
                tls: true,
                authTimeout: 10000,
                // Gmail requires this if we use the same scope for IMAP/SMTP
                // If you get an error here, you might need to revert this to the basic object
                auth: { 
                    xoauth2: { 
                        user: user,
                        clientId: clientId,
                        clientSecret: clientSecret,
                        refreshToken: refreshToken
                    }
                },
                tlsOptions: { rejectUnauthorized: false }
            }
        };
    }

    /**
     * Connects to Gmail. If a connection exists, it ends it first.
     */
    async connect() {
        try {
            if (!this.config || !this.config.imap.user) {
                throw new Error('Gmail credentials not configured.');
            }

            if (this.connection) {
                try { await this.connection.end(); } catch (e) { /* ignore */ }
                this.connection = null;
            }

            console.log('🔌 Connecting to Gmail IMAP...');
            this.connection = await imaps.connect(this.config);

            this.connection.on('error', (err) => {
                console.log('⚠️ IMAP Connection Error:', err.message);
                this.connection = null;
                this.isFetching = false; // Reset lock on error
            });

            console.log('✅ Connected to Gmail successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to connect to Gmail:', error.message);
            this.connection = null;
            this.isFetching = false; // Reset lock on error
            return false;
        }
    }

    async ensureConnection() {
        if (!this.connection || this.connection.imap.state !== 'authenticated') {
            console.log('🔄 Reconnecting to Gmail...');
            await this.connect();
        }
    }

    /**
     * 🛡️ FIXED FETCH: Prevents Infinite Loops with 'isFetching' Lock
     */
    async fetchEmails(options = {}) {
        // 1. STOP if we are already fetching (The Fix)
        if (this.isFetching) {
            console.warn('⚠️ Fetch already in progress. Skipping this request to prevent loops.');
            return []; // Return empty to calm the system down
        }

        this.isFetching = true; // 🔒 LOCK THE DOOR

        try {
            return await this.retryOperation(async () => {
                await this.ensureConnection();

                const { folder = 'INBOX', limit = 50, offset = 0, unreadOnly = false, since = null } = options;

                await this.connection.openBox(folder);

                const searchCriteria = [];
                if (unreadOnly) searchCriteria.push('UNSEEN');
                else searchCriteria.push('ALL');
                if (since) searchCriteria.push(['SINCE', since]);

                const initialFetchOptions = { bodies: [], markSeen: false };
                const allMessages = await this.connection.search(searchCriteria, initialFetchOptions);

                if (allMessages.length === 0) return [];

                // Sort & Pagination
                allMessages.sort((a, b) => b.attributes.uid - a.attributes.uid);
                const recentMessages = allMessages.slice(offset, offset + limit);
                const uidsToFetch = recentMessages.map(m => m.attributes.uid);

                if (uidsToFetch.length === 0) return [];

                // Fetch Content
                const minUid = Math.min(...uidsToFetch);
                const maxUid = Math.max(...uidsToFetch);

                if (offset === 0) console.log(`📥 Fetching ${uidsToFetch.length} emails (UIDs ${minUid}-${maxUid})...`);

                const fetchCriteria = [['UID', `${minUid}:${maxUid}`]];
                const fullFetchOptions = { bodies: ['HEADER', 'TEXT', ''], markSeen: false, struct: true };

                const rawMessages = await this.connection.search(fetchCriteria, fullFetchOptions);

                const targetUidSet = new Set(uidsToFetch);
                const validMessages = rawMessages.filter(m => targetUidSet.has(m.attributes.uid));
                validMessages.sort((a, b) => b.attributes.uid - a.attributes.uid);

                const emails = [];
                for (const message of validMessages) {
                    try {
                        emails.push(await this.parseMessage(message));
                    } catch (e) { console.error('Parse error:', e.message); }
                }
                return emails;
            });

        } catch (err) {
            console.error("❌ Error in fetchEmails:", err.message);
            return [];
        } finally {
            this.isFetching = false; // 🔓 UNLOCK THE DOOR (Always happens)
        }
    }

    async searchEmails(query) {
        // Search usually triggers on user action, so we allow it even if sync is running
        // But we wrap it in try/catch to be safe
        try {
            return await this.retryOperation(async () => {
                await this.ensureConnection();
                await this.connection.openBox('INBOX');

                const searchCriteria = [['OR', ['SUBJECT', query], ['FROM', query], ['TO', query], ['TEXT', query]]];
                const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], markSeen: false, struct: true };

                const messages = await this.connection.search(searchCriteria, fetchOptions);
                const limitedMessages = messages.slice(0, 50);

                const emails = [];
                for (const message of limitedMessages) {
                    try {
                        emails.push(await this.parseMessage(message));
                    } catch (e) { console.error('Search parse error:', e.message); }
                }
                return emails;
            });
        } catch (err) {
            console.error("Search failed:", err.message);
            return [];
        }
    }

    async retryOperation(operation, maxRetries = 1) {
        for (let i = 0; i <= maxRetries; i++) {
            try {
                return await operation();
            } catch (error) {
                const isAuthError = error.message.includes('Not authenticated') ||
                                    error.message.includes('closed') ||
                                    error.message.includes('ended');

                if (isAuthError && i < maxRetries) {
                    console.log(`⚠️ IMAP Error: ${error.message}. Retrying (${i + 1}/${maxRetries})...`);
                    this.connection = null;
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
                throw error;
            }
        }
    }

    async parseMessage(message) {
        const all = message.parts.find(part => part.which === '');
        const id = message.attributes.uid;
        const idHeader = 'Imap-Id: ' + id + '\r\n';

        const mail = await simpleParser(idHeader + (all ? all.body : ''));

        return {
            id: id,
            uid: id,
            messageId: mail.messageId,
            subject: mail.subject || '(No Subject)',
            from: this.formatAddress(mail.from),
            to: this.formatAddress(mail.to),
            date: mail.date,
            timestamp: mail.date ? new Date(mail.date).getTime() : Date.now(),
            text: mail.text || '',
            html: mail.html || '',
            snippet: (mail.text || '').substring(0, 150).replace(/\s+/g, ' ').trim() + '...',            attachments: mail.attachments ? mail.attachments.map(att => ({
                filename: att.filename,
                contentType: att.contentType,
                size: att.size
            })) : [],
            isUnread: !message.attributes.flags.includes('\Seen')
        };
    }

    formatAddress(addressObj) {
        if (!addressObj) return { name: 'Unknown', email: '' };
        const rawValue = addressObj.value || addressObj;
        const firstSender = Array.isArray(rawValue) ? rawValue[0] : rawValue;
        return {
            name: firstSender.name || '',
            email: firstSender.address || ''
        };
    }

    // Pass-through methods that also need retry protection
    async markAsRead(emailId) {
        return this.retryOperation(async () => {
            await this.ensureConnection();
            await this.connection.openBox('INBOX');
            await this.connection.addFlags(emailId, '\Seen');
        });
    }

    async markAsUnread(emailId) {
        return this.retryOperation(async () => {
            await this.ensureConnection();
            await this.connection.openBox('INBOX');
            await this.connection.delFlags(emailId, '\Seen');
        });
    }

    async deleteEmail(emailId) {
        return this.retryOperation(async () => {
            await this.ensureConnection();
            await this.connection.openBox('INBOX');
            await this.connection.addFlags(emailId, '\Deleted');
            await this.connection.imap.expunge();
        });
    }

    async getUnreadCount() {
        return this.retryOperation(async () => {
            await this.ensureConnection();
            await this.connection.openBox('INBOX');
            const searchCriteria = ['UNSEEN'];
            const results = await this.connection.search(searchCriteria, { bodies: [] });
            return results.length;
        });
    }
}

module.exports = GmailInboxService;