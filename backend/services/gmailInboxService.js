const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const path = require('path');
const https = require('https');
const querystring = require('querystring'); // Built-in Node module

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
    if (value.startsWith('1//')) return value.trim();
    if (value.endsWith('.com')) return value.trim();
    try {
        const decoded = Buffer.from(value, 'base64').toString('utf8');
        if (/^[\x20-\x7E]*$/.test(decoded)) return decoded.trim();
        return value.trim();
    } catch (e) {
        return value.trim();
    }
};

class GmailInboxService {
    constructor() {
        this.connection = null;
        this.isFetching = false;

        // Load Credentials
        this.user = getEnvVar('EMAIL_USER');
        this.clientId = getEnvVar('GMAIL_CLIENT_ID');
        this.clientSecret = getEnvVar('GMAIL_CLIENT_SECRET');
        this.refreshToken = getEnvVar('GMAIL_REFRESH_TOKEN');

        if (!this.user || !this.clientId || !this.clientSecret || !this.refreshToken) {
            console.error('❌ IMAP Connection Failed: OAuth credentials missing.');
            this.config = null;
            return;
        }

        // Base Configuration (xoauth2 string will be added dynamically on connect)
        this.config = {
            imap: {
                user: this.user,
                host: 'imap.gmail.com',
                port: 993,
                tls: true,
                authTimeout: 20000,
                tlsOptions: { rejectUnauthorized: false }
            }
        };
    }

    /**
     * 🔑 Generates a fresh Access Token using the Refresh Token
     */
    async getAccessToken() {
        return new Promise((resolve, reject) => {
            const postData = querystring.stringify({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                refresh_token: this.refreshToken,
                grant_type: 'refresh_token',
            });

            const req = https.request({
                hostname: 'oauth2.googleapis.com',
                path: '/token',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': postData.length,
                },
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            const json = JSON.parse(data);
                            resolve(json.access_token);
                        } catch (e) { reject(e); }
                    } else {
                        reject(new Error(`Google Auth Failed: ${data}`));
                    }
                });
            });

            req.on('error', (e) => reject(e));
            req.write(postData);
            req.end();
        });
    }

    /**
     * 🛠 Builds the specific XOAUTH2 string required by IMAP
     */
    buildXOAuth2Token(user, accessToken) {
        const authData = `user=${user}\x01auth=Bearer ${accessToken}\x01\x01`;
        return Buffer.from(authData, 'utf-8').toString('base64');
    }

    /**
     * Connects to Gmail. Generates a fresh token first.
     */
    async connect() {
        try {
            if (!this.config) throw new Error('Gmail credentials not configured.');

            if (this.connection) {
                try { await this.connection.end(); } catch (e) { /* ignore */ }
                this.connection = null;
            }

            console.log('🔌 Generating OAuth Token for IMAP...');
            const accessToken = await this.getAccessToken();
            
            // Inject the raw XOAUTH2 string into the config
            // This prevents node-imap from trying to use a password
            this.config.imap.xoauth2 = this.buildXOAuth2Token(this.user, accessToken);

            console.log('🔌 Connecting to Gmail IMAP...');
            this.connection = await imaps.connect(this.config);

            this.connection.on('error', (err) => {
                console.log('⚠️ IMAP Connection Error:', err.message);
                this.connection = null;
                this.isFetching = false;
            });

            console.log('✅ Connected to Gmail successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to connect to Gmail:', error.message);
            this.connection = null;
            this.isFetching = false;
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
        if (this.isFetching) {
            console.warn('⚠️ Fetch already in progress. Skipping.');
            return [];
        }

        this.isFetching = true;

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

                allMessages.sort((a, b) => b.attributes.uid - a.attributes.uid);
                const recentMessages = allMessages.slice(offset, offset + limit);
                const uidsToFetch = recentMessages.map(m => m.attributes.uid);

                if (uidsToFetch.length === 0) return [];

                const minUid = Math.min(...uidsToFetch);
                const maxUid = Math.max(...uidsToFetch);

                if (offset === 0) console.log(`📥 Fetching ${uidsToFetch.length} emails (UIDs ${minUid}-${maxUid})...`);

                const fetchCriteria = [['UID', `${minUid}:${maxUid}`]];
                const fullFetchOptions = { bodies: ['HEADER', 'TEXT', ''], markSeen: false, struct: true };

                const rawMessages = await this.connection.search(fetchCriteria, fullFetchOptions);

                const targetUidSet = new Set(uidsToFetch);
                const validMessages = rawMessages.filter(m => targetUidSet.has(m.attributes.uid));
                validMessages.sort((a, b) => b.attributes.uid - a.attributes.uid);

                // --- 🚀 PERFORMANCE FIX: PARALLEL PROCESSING ---
                // Old way: Processed 1-by-1 (Slow)
                // New way: Processes all 50 concurrently (Fast)

                const emailPromises = validMessages.map(async (message) => {
                    try {
                        return await this.parseMessage(message);
                    } catch (e) {
                        console.error('Parse error for specific message:', e.message);
                        return null;
                    }
                });

                // Wait for all to finish, then remove any failed ones (nulls)
                const emails = (await Promise.all(emailPromises)).filter(e => e !== null);

                console.log(`✅ Successfully processed ${emails.length} emails.`);
                return emails;
                // -----------------------------------------------
            });

        } catch (err) {
            console.error("❌ Error in fetchEmails:", err.message);
            return [];
        } finally {
            this.isFetching = false;
        }
    }

    async searchEmails(query) {
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
            snippet: (mail.text || '').substring(0, 150).replace(/\s+/g, ' ').trim() + '...',
            attachments: mail.attachments ? mail.attachments.map(att => ({
                filename: att.filename,
                contentType: att.contentType,
                size: att.size
            })) : [],
            isUnread: !message.attributes.flags.includes('\\Seen')
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

    async markAsRead(emailId) {
        return this.retryOperation(async () => {
            await this.ensureConnection();
            await this.connection.openBox('INBOX');
            await this.connection.addFlags(emailId, '\\Seen');
        });
    }

    async markAsUnread(emailId) {
        return this.retryOperation(async () => {
            await this.ensureConnection();
            await this.connection.openBox('INBOX');
            await this.connection.delFlags(emailId, '\\Seen');
        });
    }

    async deleteEmail(emailId) {
        return this.retryOperation(async () => {
            await this.ensureConnection();
            await this.connection.openBox('INBOX');
            await this.connection.addFlags(emailId, '\\Deleted');
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
