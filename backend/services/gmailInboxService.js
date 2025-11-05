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
                tlsOptions: {
                    rejectUnauthorized: false
                }
            }
        };
    }

    async connect() {
        try {
            if (!this.config.imap.user || !this.config.imap.password) {
                throw new Error('Gmail credentials not configured. Please set EMAIL_USER and EMAIL_PASSWORD in .env');
            }

            console.log('🔌 Connecting to Gmail IMAP...');
            this.connection = await imaps.connect(this.config);
            console.log('✅ Connected to Gmail successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to connect to Gmail:', error.message);
            throw error;
        }
    }

    async disconnect() {
        if (this.connection) {
            try {
                this.connection.end();
                this.connection = null;
                console.log('🔌 Disconnected from Gmail');
            } catch (error) {
                console.error('Error disconnecting from Gmail:', error.message);
            }
        }
    }

    async fetchEmails(options = {}) {
        const {
            folder = 'INBOX',
            limit = 50,
            unreadOnly = false,
            since = null
        } = options;

        try {
            if (!this.connection) {
                await this.connect();
            }

            await this.connection.openBox(folder);
            console.log(`📧 Fetching emails from ${folder}...`);

            // Build search criteria
            const searchCriteria = [];

            if (unreadOnly) {
                searchCriteria.push('UNSEEN');
            } else {
                searchCriteria.push('ALL');
            }

            if (since) {
                searchCriteria.push(['SINCE', since]);
            }

            const fetchOptions = {
                bodies: ['HEADER', 'TEXT', ''],
                markSeen: false,
                struct: true
            };

            const messages = await this.connection.search(searchCriteria, fetchOptions);
            console.log(`📬 Found ${messages.length} messages`);

            // Parse and format emails
            const emails = [];
            const messagesToParse = messages.slice(0, limit);

            for (const message of messagesToParse) {
                try {
                    const email = await this.parseMessage(message);
                    emails.push(email);
                } catch (parseError) {
                    console.error('Error parsing message:', parseError.message);
                }
            }

            console.log(`✅ Successfully parsed ${emails.length} emails`);
            return emails;

        } catch (error) {
            console.error('Error fetching emails:', error.message);
            throw error;
        }
    }

    async parseMessage(message) {
        const all = message.parts.find(part => part.which === '');
        const id = message.attributes.uid;
        const idHeader = 'Imap-Id: ' + id + '\r\n';

        const mail = await simpleParser(idHeader + all.body);

        return {
            id: id,
            uid: id,
            messageId: mail.messageId,
            subject: mail.subject || '(No Subject)',
            from: this.formatAddress(mail.from),
            to: this.formatAddress(mail.to),
            cc: this.formatAddress(mail.cc),
            date: mail.date,
            timestamp: mail.date ? new Date(mail.date).getTime() : Date.now(),
            text: mail.text || '',
            html: mail.html || '',
            snippet: this.createSnippet(mail.text || mail.html || ''),
            attachments: mail.attachments ? mail.attachments.map(att => ({
                filename: att.filename,
                contentType: att.contentType,
                size: att.size
            })) : [],
            flags: message.attributes.flags || [],
            isUnread: !message.attributes.flags.includes('\\Seen'),
            hasAttachments: mail.attachments && mail.attachments.length > 0,
            labels: message.attributes['x-gm-labels'] || []
        };
    }

    formatAddress(addressObj) {
        if (!addressObj) return null;

        if (Array.isArray(addressObj)) {
            return addressObj.map(addr => ({
                name: addr.name || '',
                email: addr.address || ''
            }));
        }

        return {
            name: addressObj.name || '',
            email: addressObj.address || ''
        };
    }

    createSnippet(text, maxLength = 150) {
        // Remove HTML tags if present
        const cleanText = text.replace(/<[^>]*>/g, '');
        // Remove extra whitespace
        const normalized = cleanText.replace(/\s+/g, ' ').trim();
        // Truncate
        return normalized.length > maxLength
            ? normalized.substring(0, maxLength) + '...'
            : normalized;
    }

    async getEmailById(emailId) {
        try {
            if (!this.connection) {
                await this.connect();
            }

            await this.connection.openBox('INBOX');

            const searchCriteria = [['UID', emailId]];
            const fetchOptions = {
                bodies: ['HEADER', 'TEXT', ''],
                markSeen: false,
                struct: true
            };

            const messages = await this.connection.search(searchCriteria, fetchOptions);

            if (messages.length === 0) {
                throw new Error('Email not found');
            }

            return await this.parseMessage(messages[0]);

        } catch (error) {
            console.error('Error fetching email by ID:', error.message);
            throw error;
        }
    }

    async markAsRead(emailId) {
        try {
            if (!this.connection) {
                await this.connect();
            }

            await this.connection.openBox('INBOX');
            await this.connection.addFlags(emailId, '\\Seen');
            console.log(`✅ Marked email ${emailId} as read`);
            return true;

        } catch (error) {
            console.error('Error marking email as read:', error.message);
            throw error;
        }
    }

    async markAsUnread(emailId) {
        try {
            if (!this.connection) {
                await this.connect();
            }

            await this.connection.openBox('INBOX');
            await this.connection.delFlags(emailId, '\\Seen');
            console.log(`✅ Marked email ${emailId} as unread`);
            return true;

        } catch (error) {
            console.error('Error marking email as unread:', error.message);
            throw error;
        }
    }

    async deleteEmail(emailId) {
        try {
            if (!this.connection) {
                await this.connect();
            }

            await this.connection.openBox('INBOX');
            await this.connection.addFlags(emailId, '\\Deleted');
            await this.connection.imap.expunge();
            console.log(`🗑️ Deleted email ${emailId}`);
            return true;

        } catch (error) {
            console.error('Error deleting email:', error.message);
            throw error;
        }
    }

    async searchEmails(query) {
        try {
            if (!this.connection) {
                await this.connect();
            }

            await this.connection.openBox('INBOX');

            const searchCriteria = [
                ['OR',
                    ['SUBJECT', query],
                    ['FROM', query],
                    ['TO', query],
                    ['TEXT', query]
                ]
            ];

            const fetchOptions = {
                bodies: ['HEADER', 'TEXT', ''],
                markSeen: false,
                struct: true
            };

            const messages = await this.connection.search(searchCriteria, fetchOptions);
            console.log(`🔍 Found ${messages.length} emails matching "${query}"`);

            const emails = [];
            for (const message of messages) {
                try {
                    const email = await this.parseMessage(message);
                    emails.push(email);
                } catch (parseError) {
                    console.error('Error parsing search result:', parseError.message);
                }
            }

            return emails;

        } catch (error) {
            console.error('Error searching emails:', error.message);
            throw error;
        }
    }

    async getUnreadCount() {
        try {
            if (!this.connection) {
                await this.connect();
            }

            await this.connection.openBox('INBOX');
            const searchCriteria = ['UNSEEN'];
            const messages = await this.connection.search(searchCriteria, { bodies: [] });

            return messages.length;

        } catch (error) {
            console.error('Error getting unread count:', error.message);
            throw error;
        }
    }
}

module.exports = GmailInboxService;
