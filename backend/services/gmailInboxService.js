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

class GmailInboxService {
    constructor() {
        this.connection = null;
        this.config = {
            imap: {
                user: process.env.EMAIL_USER,
                password: process.env.EMAIL_PASSWORD,
                host: 'imap.gmail.com',
                port: 993,
                tls: true,
                authTimeout: 10000,
                tlsOptions: { rejectUnauthorized: false }
            }
        };
    }

    /**
     * Connects to Gmail. If a connection exists, it ends it first.
     */
    async connect() {
        try {
            if (!this.config.imap.user || !this.config.imap.password) {
                throw new Error('Gmail credentials not configured. Please set EMAIL_USER and EMAIL_PASSWORD in .env');
            }

            // Force disconnect if we think we have a stale connection
            if (this.connection) {
                try { await this.connection.end(); } catch (e) { /* ignore */ }
                this.connection = null;
            }

            console.log('🔌 Connecting to Gmail IMAP...');
            this.connection = await imaps.connect(this.config);

            // --- 🛡️ CRITICAL FIX STARTS HERE ---

            // 1. CATCH THE SOCKET ERROR (The one crashing your server)
            // The library re-emits socket errors on the main object. We MUST catch them.
            this.connection.on('error', (err) => {
                console.log('⚠️ IMAP Connection Error (Handled):', err.message);
                // Silently reset connection so we can reconnect later
                this.connection = null;
            });

            // 2. Handle underlying Protocol errors
            this.connection.imap.once('close', () => {
                console.log('⚠️ IMAP connection closed by server.');
                this.connection = null;
            });

            this.connection.imap.once('error', (err) => {
                console.log('⚠️ IMAP internal error:', err.message);
                this.connection = null;
            });

            // --- CRITICAL FIX ENDS HERE ---

            console.log('✅ Connected to Gmail successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to connect to Gmail:', error.message);
            this.connection = null;
            // Return false instead of throwing so the app stays alive
            return false;
        }
    }

    /**
     * Ensures we have a valid, authenticated connection.
     */
    async ensureConnection() {
        // If no connection object, or the underlying imap state is not 'authenticated'
        if (!this.connection || this.connection.imap.state !== 'authenticated') {
            console.log('🔄 Connection lost or not authenticated. Reconnecting...');
            await this.connect();
        }
    }

    async fetchEmails(options = {}) {
        return this.retryOperation(async () => {
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
    }

    async searchEmails(query) {
        return this.retryOperation(async () => {
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
    }

    /**
     * Generic retry wrapper for IMAP operations
     */
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
                    this.connection = null; // Force reset
                    await new Promise(r => setTimeout(r, 1000)); // Wait 1s
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

    // Pass-through methods that also need retry protection
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
}

module.exports = GmailInboxService;
