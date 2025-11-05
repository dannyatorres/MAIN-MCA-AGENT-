// Email Tab Module
class EmailTab {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = 'http://localhost:3001';
        this.emails = [];
        this.selectedEmail = null;
        this.refreshInterval = null;
    }

    async render() {
        console.log('📧 Rendering Email tab...');

        try {
            // Fetch emails
            await this.fetchEmails();

            const html = `
                <div class="email-container" style="display: flex; flex-direction: column; height: 100%; gap: 12px;">
                    <!-- Email Toolbar -->
                    <div class="email-toolbar" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: white; border-radius: 8px; border: 1px solid #e5e7eb;">
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <button id="refreshEmailBtn" class="btn btn-sm" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                                <i class="fas fa-sync-alt"></i> Refresh
                            </button>
                            <button id="unreadOnlyBtn" class="btn btn-sm" style="padding: 8px 16px; background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer;">
                                Show Unread Only
                            </button>
                            <div id="emailCount" style="padding: 6px 12px; background: #f3f4f6; border-radius: 6px; font-size: 14px; color: #6b7280;">
                                <strong>${this.emails.length}</strong> emails
                            </div>
                        </div>
                        <div style="position: relative;">
                            <input type="text" id="emailSearchInput" placeholder="Search emails..."
                                   style="padding: 8px 12px 8px 36px; border: 1px solid #d1d5db; border-radius: 6px; width: 250px; font-size: 14px;">
                            <i class="fas fa-search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #9ca3af;"></i>
                        </div>
                    </div>

                    <!-- Email Content Area -->
                    <div class="email-content-area" style="display: flex; flex: 1; gap: 12px; overflow: hidden;">
                        <!-- Email List -->
                        <div class="email-list-container" style="flex: 0 0 400px; display: flex; flex-direction: column; background: white; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden;">
                            <div class="email-list-header" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #111827;">
                                Inbox
                            </div>
                            <div id="emailList" class="email-list" style="flex: 1; overflow-y: auto;">
                                ${this.renderEmailList()}
                            </div>
                        </div>

                        <!-- Email Viewer -->
                        <div class="email-viewer-container" style="flex: 1; background: white; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden; display: flex; flex-direction: column;">
                            <div id="emailViewer" class="email-viewer" style="flex: 1; overflow-y: auto;">
                                ${this.renderEmailViewer()}
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const intelligenceContent = document.getElementById('intelligenceContent');
            if (intelligenceContent) {
                intelligenceContent.innerHTML = html;
                this.attachEventListeners();
                this.startAutoRefresh();
            }

        } catch (error) {
            console.error('Error rendering Email tab:', error);
            const intelligenceContent = document.getElementById('intelligenceContent');
            if (intelligenceContent) {
                intelligenceContent.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">❌</div>
                        <p>Error loading emails: ${error.message}</p>
                        <button onclick="window.commandCenter?.emailTab?.render()" class="btn btn-primary">Retry</button>
                    </div>
                `;
            }
        }
    }

    renderEmailList() {
        if (this.emails.length === 0) {
            return `
                <div style="padding: 40px; text-align: center; color: #6b7280;">
                    <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
                    <p>No emails found</p>
                </div>
            `;
        }

        return this.emails.map(email => {
            const fromName = email.from?.name || email.from?.email || 'Unknown';
            const fromEmail = email.from?.email || '';
            const date = new Date(email.date);
            const formattedDate = this.formatDate(date);
            const isUnread = email.isUnread;

            return `
                <div class="email-item ${isUnread ? 'unread' : ''} ${this.selectedEmail?.id === email.id ? 'selected' : ''}"
                     data-email-id="${email.id}"
                     style="padding: 12px 16px; border-bottom: 1px solid #f3f4f6; cursor: pointer; transition: background 0.2s; ${isUnread ? 'background: #eff6ff; border-left: 3px solid #3b82f6;' : ''} ${this.selectedEmail?.id === email.id ? 'background: #f9fafb;' : ''}">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px;">
                        <div style="font-weight: ${isUnread ? '600' : '500'}; color: #111827; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${fromName}
                        </div>
                        <div style="font-size: 12px; color: #6b7280; white-space: nowrap; margin-left: 8px;">
                            ${formattedDate}
                        </div>
                    </div>
                    <div style="font-size: 14px; font-weight: ${isUnread ? '600' : '400'}; color: #374151; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${email.subject}
                    </div>
                    <div style="font-size: 13px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${email.snippet}
                    </div>
                    ${email.hasAttachments ? '<div style="margin-top: 4px; font-size: 12px; color: #3b82f6;"><i class="fas fa-paperclip"></i> Has attachments</div>' : ''}
                </div>
            `;
        }).join('');
    }

    renderEmailViewer() {
        if (!this.selectedEmail) {
            return `
                <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #9ca3af;">
                    <div style="text-align: center;">
                        <div style="font-size: 64px; margin-bottom: 16px;">📧</div>
                        <p>Select an email to read</p>
                    </div>
                </div>
            `;
        }

        const email = this.selectedEmail;
        const fromName = email.from?.name || email.from?.email || 'Unknown';
        const fromEmail = email.from?.email || '';
        const date = new Date(email.date);
        const formattedDate = date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="email-detail" style="display: flex; flex-direction: column; height: 100%;">
                <!-- Email Header -->
                <div class="email-header" style="padding: 20px; border-bottom: 1px solid #e5e7eb;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
                        <h3 style="margin: 0; font-size: 20px; font-weight: 600; color: #111827; flex: 1;">
                            ${email.subject}
                        </h3>
                        <div style="display: flex; gap: 8px;">
                            <button onclick="window.commandCenter?.emailTab?.analyzeEmail('${email.id}')"
                                    class="btn btn-sm"
                                    style="padding: 6px 12px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
                                <i class="fas fa-robot"></i> AI Analyze
                            </button>
                            ${email.isUnread ? `
                                <button onclick="window.commandCenter?.emailTab?.markAsRead('${email.id}')"
                                        class="btn btn-sm"
                                        style="padding: 6px 12px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
                                    <i class="fas fa-check"></i> Mark Read
                                </button>
                            ` : `
                                <button onclick="window.commandCenter?.emailTab?.markAsUnread('${email.id}')"
                                        class="btn btn-sm"
                                        style="padding: 6px 12px; background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-size: 13px;">
                                    <i class="fas fa-envelope"></i> Mark Unread
                                </button>
                            `}
                            <button onclick="window.commandCenter?.emailTab?.deleteEmail('${email.id}')"
                                    class="btn btn-sm"
                                    style="padding: 6px 12px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </div>
                    <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 8px;">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 16px;">
                            ${fromName.charAt(0).toUpperCase()}
                        </div>
                        <div style="flex: 1;">
                            <div style="font-weight: 600; color: #111827;">${fromName}</div>
                            <div style="font-size: 14px; color: #6b7280;">${fromEmail}</div>
                        </div>
                    </div>
                    <div style="font-size: 13px; color: #6b7280;">
                        ${formattedDate}
                    </div>
                    ${email.hasAttachments ? `
                        <div style="margin-top: 12px; padding: 12px; background: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb;">
                            <div style="font-weight: 600; color: #374151; margin-bottom: 8px; font-size: 13px;">
                                <i class="fas fa-paperclip"></i> Attachments (${email.attachments.length})
                            </div>
                            ${email.attachments.map(att => `
                                <div style="font-size: 13px; color: #6b7280; padding: 4px 0;">
                                    📎 ${att.filename} (${this.formatFileSize(att.size)})
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>

                <!-- Email Body -->
                <div class="email-body" style="flex: 1; padding: 20px; overflow-y: auto;">
                    ${email.html ? email.html : `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${email.text}</pre>`}
                </div>
            </div>
        `;
    }

    generateMockEmails() {
        const now = new Date();
        const mockEmails = [
            {
                id: 1,
                messageId: '<msg1@example.com>',
                subject: 'Re: MCA Application for ABC Corp - $150K Request',
                from: { name: 'Sarah Johnson', email: 'sjohnson@capitalfund.com' },
                to: [{ name: 'MCA Agent', email: 'agent@mcacompany.com' }],
                date: new Date(now - 2 * 60 * 60 * 1000), // 2 hours ago
                text: 'Hi,\n\nI reviewed the bank statements for ABC Corp. The monthly deposits look strong at $85K average. We can offer $150K at 1.28 factor with 9-month term.\n\nPlease let me know if the client wants to proceed.\n\nBest regards,\nSarah',
                snippet: 'I reviewed the bank statements for ABC Corp. The monthly deposits look strong at $85K average...',
                isUnread: true,
                hasAttachments: false,
                attachments: [],
                flags: [],
                labels: []
            },
            {
                id: 2,
                messageId: '<msg2@example.com>',
                subject: 'New Lead: Restaurant Equipment Financing',
                from: { name: 'Michael Chen', email: 'mchen@leadsource.com' },
                to: [{ name: 'MCA Agent', email: 'agent@mcacompany.com' }],
                date: new Date(now - 5 * 60 * 60 * 1000), // 5 hours ago
                text: 'Hello,\n\nI have a warm lead for you:\n\nBusiness: Downtown Bistro LLC\nOwner: James Martinez\nPhone: (555) 123-4567\nMonthly Revenue: $45,000\nRequesting: $75,000 for new equipment\n\nOwner is ready to submit application. Can you reach out today?\n\nThanks,\nMichael',
                snippet: 'I have a warm lead for you: Business: Downtown Bistro LLC, Owner: James Martinez...',
                isUnread: true,
                hasAttachments: false,
                attachments: [],
                flags: [],
                labels: []
            },
            {
                id: 3,
                messageId: '<msg3@example.com>',
                subject: 'FCS Report Ready - Project Capital LLC',
                from: { name: 'Analytics Team', email: 'reports@fcsanalytics.com' },
                to: [{ name: 'MCA Agent', email: 'agent@mcacompany.com' }],
                date: new Date(now - 8 * 60 * 60 * 1000), // 8 hours ago
                text: 'Your FCS report for Project Capital LLC is ready.\n\nKey Findings:\n- Average Monthly Deposits: $127,000\n- Negative Days: 3\n- NSF Count: 1\n- Recommended Position: $180,000 - $200,000\n- Risk Level: Low-Medium\n\nFull report attached.\n\nFCS Analytics',
                html: '<p>Your FCS report for <strong>Project Capital LLC</strong> is ready.</p><p><strong>Key Findings:</strong></p><ul><li>Average Monthly Deposits: $127,000</li><li>Negative Days: 3</li><li>NSF Count: 1</li><li>Recommended Position: $180,000 - $200,000</li><li>Risk Level: Low-Medium</li></ul><p>Full report attached.</p><p>FCS Analytics</p>',
                snippet: 'Your FCS report for Project Capital LLC is ready. Key Findings: Average Monthly Deposits: $127,000...',
                isUnread: false,
                hasAttachments: true,
                attachments: [
                    { filename: 'ProjectCapital_FCS_Report.pdf', size: 245000, contentType: 'application/pdf' }
                ],
                flags: ['\\Seen'],
                labels: []
            },
            {
                id: 4,
                messageId: '<msg4@example.com>',
                subject: 'Document Request - XYZ Manufacturing',
                from: { name: 'Lisa Anderson', email: 'landerson@quickcapital.com' },
                to: [{ name: 'MCA Agent', email: 'agent@mcacompany.com' }],
                date: new Date(now - 24 * 60 * 60 * 1000), // Yesterday
                text: 'Hi,\n\nTo move forward with XYZ Manufacturing\'s $250K application, we\'ll need:\n\n1. Last 4 months bank statements\n2. Voided check\n3. Driver\'s license (owner)\n4. Business tax return (last year)\n\nCan you get these to me by EOD tomorrow?\n\nThanks,\nLisa',
                snippet: 'To move forward with XYZ Manufacturing\'s $250K application, we\'ll need: Last 4 months bank statements...',
                isUnread: false,
                hasAttachments: false,
                attachments: [],
                flags: ['\\Seen'],
                labels: []
            },
            {
                id: 5,
                messageId: '<msg5@example.com>',
                subject: 'URGENT: Client wants to close today - Tech Solutions Inc',
                from: { name: 'Robert Kim', email: 'rkim@fastfunding.com' },
                to: [{ name: 'MCA Agent', email: 'agent@mcacompany.com' }],
                date: new Date(now - 3 * 60 * 60 * 1000), // 3 hours ago
                text: 'URGENT!\n\nTech Solutions Inc wants to close their $120K position TODAY.\n\nEverything is approved. Just need:\n- Signed contract\n- ACH authorization form\n\nCan you get these signed and returned within 2 hours?\n\nRobert',
                snippet: 'Tech Solutions Inc wants to close their $120K position TODAY. Everything is approved. Just need: Signed contract...',
                isUnread: true,
                hasAttachments: true,
                attachments: [
                    { filename: 'TechSolutions_Contract.pdf', size: 185000, contentType: 'application/pdf' },
                    { filename: 'ACH_Authorization.pdf', size: 95000, contentType: 'application/pdf' }
                ],
                flags: [],
                labels: []
            },
            {
                id: 6,
                messageId: '<msg6@example.com>',
                subject: 'Meeting Request: Discuss Partnership Opportunities',
                from: { name: 'David Martinez', email: 'dmartinez@lendingtree.com' },
                to: [{ name: 'MCA Agent', email: 'agent@mcacompany.com' }],
                date: new Date(now - 2 * 24 * 60 * 60 * 1000), // 2 days ago
                text: 'Good afternoon,\n\nI\'d like to schedule a call to discuss potential partnership opportunities between our companies.\n\nWe specialize in working with businesses that have:\n- 6+ months in business\n- $20K+ monthly revenue\n- Credit scores 550+\n\nWould next Tuesday at 2 PM work for a 30-minute call?\n\nBest,\nDavid Martinez\nSenior Partnership Manager',
                snippet: 'I\'d like to schedule a call to discuss potential partnership opportunities between our companies...',
                isUnread: false,
                hasAttachments: false,
                attachments: [],
                flags: ['\\Seen'],
                labels: []
            },
            {
                id: 7,
                messageId: '<msg7@example.com>',
                subject: 'Renewal Opportunity - Happy Donuts (Previous Client)',
                from: { name: 'Jennifer Lee', email: 'jlee@renewalcapital.com' },
                to: [{ name: 'MCA Agent', email: 'agent@mcacompany.com' }],
                date: new Date(now - 6 * 60 * 60 * 1000), // 6 hours ago
                text: 'Hi there,\n\nHappy Donuts is eligible for a renewal. They paid off their previous $50K position in 7 months (excellent payment history).\n\nCurrent offer: $85K at 1.25 factor, 10-month term\n\nOwner mentioned wanting to expand to a second location. Very motivated.\n\nInterested in working this deal?\n\nJennifer',
                snippet: 'Happy Donuts is eligible for a renewal. They paid off their previous $50K position in 7 months...',
                isUnread: true,
                hasAttachments: false,
                attachments: [],
                flags: [],
                labels: []
            },
            {
                id: 8,
                messageId: '<msg8@example.com>',
                subject: 'Weekly Funding Report - November',
                from: { name: 'Operations Team', email: 'ops@mcacompany.com' },
                to: [{ name: 'MCA Agent', email: 'agent@mcacompany.com' }],
                date: new Date(now - 3 * 24 * 60 * 60 * 1000), // 3 days ago
                text: 'Weekly Funding Summary:\n\nTotal Funded: $1.2M\nDeals Closed: 8\nAverage Deal Size: $150K\nTop Lender: Capital Fund (4 deals)\n\nTop Performing Agent: Sarah J. ($480K funded)\n\nGreat week team! Keep it up.\n\n- Operations',
                snippet: 'Weekly Funding Summary: Total Funded: $1.2M, Deals Closed: 8, Average Deal Size: $150K...',
                isUnread: false,
                hasAttachments: false,
                attachments: [],
                flags: ['\\Seen'],
                labels: []
            }
        ];

        return mockEmails;
    }

    async fetchEmails(options = {}) {
        try {
            console.log('📧 Using mock email data for demo...');
            const { unreadOnly = false } = options;

            // Use mock data instead of API call
            let allEmails = this.generateMockEmails();

            // Filter for unread only if requested
            if (unreadOnly) {
                allEmails = allEmails.filter(email => email.isUnread);
            }

            this.emails = allEmails;
            console.log(`✅ Loaded ${this.emails.length} mock emails`);
            return this.emails;

        } catch (error) {
            console.error('Error fetching emails:', error);
            throw error;
        }
    }

    async selectEmail(emailId) {
        try {
            console.log(`📧 Loading email ${emailId}...`);

            // Use mock data - find email by ID
            const email = this.emails.find(e => e.id == emailId);

            if (email) {
                this.selectedEmail = email;
                this.updateEmailViewer();
            } else {
                throw new Error('Email not found');
            }

        } catch (error) {
            console.error('Error loading email:', error);
            alert('Failed to load email: ' + error.message);
        }
    }

    async markAsRead(emailId) {
        try {
            // Update local state (mock mode)
            const email = this.emails.find(e => e.id == emailId);
            if (email) email.isUnread = false;
            if (this.selectedEmail && this.selectedEmail.id == emailId) {
                this.selectedEmail.isUnread = false;
            }
            this.updateEmailList();
            this.updateEmailViewer();
            console.log('✅ Email marked as read (mock)');

        } catch (error) {
            console.error('Error marking email as read:', error);
            alert('Failed to mark email as read');
        }
    }

    async markAsUnread(emailId) {
        try {
            // Update local state (mock mode)
            const email = this.emails.find(e => e.id == emailId);
            if (email) email.isUnread = true;
            if (this.selectedEmail && this.selectedEmail.id == emailId) {
                this.selectedEmail.isUnread = true;
            }
            this.updateEmailList();
            this.updateEmailViewer();
            console.log('✅ Email marked as unread (mock)');

        } catch (error) {
            console.error('Error marking email as unread:', error);
            alert('Failed to mark email as unread');
        }
    }

    async deleteEmail(emailId) {
        if (!confirm('Are you sure you want to delete this email?')) {
            return;
        }

        try {
            // Remove from local state (mock mode)
            this.emails = this.emails.filter(e => e.id != emailId);
            if (this.selectedEmail && this.selectedEmail.id == emailId) {
                this.selectedEmail = null;
            }
            this.updateEmailList();
            this.updateEmailViewer();
            this.updateEmailCount();
            console.log('✅ Email deleted (mock)');

        } catch (error) {
            console.error('Error deleting email:', error);
            alert('Failed to delete email');
        }
    }

    async analyzeEmail(emailId) {
        const email = this.emails.find(e => e.id == emailId) || this.selectedEmail;
        if (!email) return;

        // Show loading state
        const aiButton = event.target.closest('button');
        const originalHTML = aiButton.innerHTML;
        aiButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
        aiButton.disabled = true;

        try {
            // Simulate AI analysis delay
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Generate mock analysis based on email content
            let analysis = '';

            if (email.subject.includes('URGENT')) {
                analysis = `📊 SUMMARY
This is a time-sensitive email requiring immediate action to close a funding deal.

🔑 KEY POINTS
• Client wants to finalize $120K position today
• All approvals already in place
• Only pending items: signed contract and ACH form
• 2-hour deadline for turnaround

✅ ACTION ITEMS
1. Contact client immediately to arrange document signing
2. Send signed contract and ACH authorization within 2 hours
3. Coordinate with lender for same-day funding

😊 SENTIMENT: Urgent but positive (deal ready to close)

⚡ PRIORITY: CRITICAL - Immediate response required

💬 SUGGESTED RESPONSE
"Hi Robert, I'm on it! Reaching out to the client now to arrange e-signature for both documents. Will have them back to you within the hour. Thanks for the quick approval!"`;
            } else if (email.subject.includes('FCS Report')) {
                analysis = `📊 SUMMARY
FCS report completed for Project Capital LLC with favorable results indicating strong funding potential.

🔑 KEY POINTS
• Monthly deposits averaging $127K (healthy cash flow)
• Minimal risk factors (3 negative days, 1 NSF)
• Recommended funding range: $180K-$200K
• Low-medium risk classification

✅ ACTION ITEMS
1. Review full FCS report attachment
2. Contact client to present funding options
3. Submit to 2-3 lenders for competitive offers
4. Target 1.25-1.30 factor rate based on profile

😊 SENTIMENT: Positive, professional

⚡ PRIORITY: MEDIUM - Follow up within 24 hours

💬 SUGGESTED RESPONSE
"Thank you for the report! The numbers look great for Project Capital. I'll review the full PDF and reach out to the client today to discuss their $180-200K funding options. Will submit to our top lenders for competitive offers."`;
            } else if (email.subject.includes('New Lead')) {
                analysis = `📊 SUMMARY
Warm lead referral for restaurant equipment financing with immediate interest.

🔑 KEY POINTS
• Business: Downtown Bistro LLC
• Monthly revenue: $45,000 (decent for restaurant)
• Requesting $75,000 for equipment upgrade
• Owner is motivated and ready to apply

✅ ACTION ITEMS
1. Call James Martinez at (555) 123-4567 today
2. Qualify the lead (time in business, credit score, etc.)
3. Request bank statements and application
4. Set expectations on funding timeline (7-10 days)

😊 SENTIMENT: Positive, opportunity-focused

⚡ PRIORITY: HIGH - Contact within 4 hours

💬 SUGGESTED RESPONSE
"Thanks Michael! Great lead - restaurant equipment financing is perfect for us. I'll reach out to James this afternoon. Do you know their time in business and approximate credit score? Will keep you posted on progress!"`;
            } else if (email.subject.includes('Renewal')) {
                analysis = `📊 SUMMARY
Renewal opportunity for previous client with excellent payment history.

🔑 KEY POINTS
• Client: Happy Donuts (proven performer)
• Paid off $50K in 7 months (ahead of schedule)
• New offer: $85K at 1.25 factor, 10-month term
• Expansion plans = strong motivation to close

✅ ACTION ITEMS
1. Contact Happy Donuts owner within 24 hours
2. Present renewal offer and expansion benefits
3. Fast-track application (prior docs on file)
4. Target 48-hour funding for competitive advantage

😊 SENTIMENT: Very positive, partnership-oriented

⚡ PRIORITY: HIGH - Strong probability of close

💬 SUGGESTED RESPONSE
"Definitely interested Jennifer! Happy Donuts was a great client. The renewal terms look perfect, especially with their expansion plans. I'll reach out to the owner today. Since we have their prior docs, we can move fast. Let's get this closed!"`;
            } else {
                analysis = `📊 SUMMARY
${email.snippet}

🔑 KEY POINTS
• Email from ${email.from.name}
• ${email.hasAttachments ? 'Contains ' + email.attachments.length + ' attachment(s)' : 'No attachments'}
• ${email.isUnread ? 'Unread - needs attention' : 'Already reviewed'}

✅ ACTION ITEMS
1. Review email content and determine next steps
2. Respond if action is required
3. File or archive as appropriate

😊 SENTIMENT: Professional

⚡ PRIORITY: MEDIUM

💬 SUGGESTED RESPONSE
Based on the email content, craft a professional response addressing the key points raised.`;
            }

            // Show analysis
            this.showEmailAnalysis(email, analysis);

        } catch (error) {
            console.error('Error analyzing email:', error);
            alert('Failed to analyze email: ' + error.message);
        } finally {
            aiButton.innerHTML = originalHTML;
            aiButton.disabled = false;
        }
    }

    showEmailAnalysis(email, analysis) {
        // Insert analysis into the email viewer
        const emailBody = document.querySelector('.email-body');
        if (!emailBody) return;

        const analysisHTML = `
            <div class="email-ai-analysis" style="margin-bottom: 20px; padding: 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; color: white;">
                <h4 style="margin: 0 0 12px 0; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-robot"></i> AI Analysis
                </h4>
                <div style="background: rgba(255, 255, 255, 0.1); padding: 12px; border-radius: 6px; white-space: pre-wrap; line-height: 1.6;">
                    ${analysis}
                </div>
            </div>
        `;

        emailBody.insertAdjacentHTML('afterbegin', analysisHTML);
    }

    updateEmailList() {
        const emailList = document.getElementById('emailList');
        if (emailList) {
            emailList.innerHTML = this.renderEmailList();
            this.attachEmailItemListeners();
        }
    }

    updateEmailViewer() {
        const emailViewer = document.getElementById('emailViewer');
        if (emailViewer) {
            emailViewer.innerHTML = this.renderEmailViewer();
        }
    }

    attachEventListeners() {
        // Refresh button
        const refreshBtn = document.getElementById('refreshEmailBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.disabled = true;
                refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
                try {
                    await this.fetchEmails();
                    this.updateEmailList();
                    this.updateEmailCount();
                } finally {
                    refreshBtn.disabled = false;
                    refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
                }
            });
        }

        // Unread only toggle
        const unreadOnlyBtn = document.getElementById('unreadOnlyBtn');
        if (unreadOnlyBtn) {
            let showingUnreadOnly = false;
            unreadOnlyBtn.addEventListener('click', async () => {
                showingUnreadOnly = !showingUnreadOnly;
                unreadOnlyBtn.textContent = showingUnreadOnly ? 'Show All' : 'Show Unread Only';
                unreadOnlyBtn.style.background = showingUnreadOnly ? '#3b82f6' : '#f3f4f6';
                unreadOnlyBtn.style.color = showingUnreadOnly ? 'white' : '#374151';
                await this.fetchEmails({ unreadOnly: showingUnreadOnly });
                this.updateEmailList();
                this.updateEmailCount();
            });
        }

        // Search
        const searchInput = document.getElementById('emailSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchEmails(e.target.value);
            });
        }

        // Email item click listeners
        this.attachEmailItemListeners();
    }

    attachEmailItemListeners() {
        const emailItems = document.querySelectorAll('.email-item');
        emailItems.forEach(item => {
            item.addEventListener('click', () => {
                const emailId = item.getAttribute('data-email-id');
                this.selectEmail(emailId);
            });
        });
    }

    async searchEmails(query) {
        if (!query.trim()) {
            // Restore all mock emails
            this.emails = this.generateMockEmails();
            this.updateEmailList();
            this.updateEmailCount();
            return;
        }

        try {
            // Search through mock data locally
            const allEmails = this.generateMockEmails();
            const searchQuery = query.toLowerCase();

            this.emails = allEmails.filter(email => {
                return email.subject.toLowerCase().includes(searchQuery) ||
                       email.from.name.toLowerCase().includes(searchQuery) ||
                       email.from.email.toLowerCase().includes(searchQuery) ||
                       email.text.toLowerCase().includes(searchQuery) ||
                       email.snippet.toLowerCase().includes(searchQuery);
            });

            this.updateEmailList();
            this.updateEmailCount();
            console.log(`🔍 Found ${this.emails.length} emails matching "${query}"`);

        } catch (error) {
            console.error('Error searching emails:', error);
        }
    }

    updateEmailCount() {
        const emailCount = document.getElementById('emailCount');
        if (emailCount) {
            emailCount.innerHTML = `<strong>${this.emails.length}</strong> emails`;
        }
    }

    formatDate(date) {
        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) {
            return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        } else if (days === 1) {
            return 'Yesterday';
        } else if (days < 7) {
            return date.toLocaleDateString('en-US', { weekday: 'short' });
        } else {
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    startAutoRefresh() {
        // Disabled for mock mode
        console.log('📧 Auto-refresh disabled for mock email data');
        // Auto-refresh every 2 minutes (disabled in mock mode)
        // if (this.refreshInterval) {
        //     clearInterval(this.refreshInterval);
        // }
        // this.refreshInterval = setInterval(async () => {
        //     console.log('🔄 Auto-refreshing emails...');
        //     try {
        //         await this.fetchEmails();
        //         this.updateEmailList();
        //         this.updateEmailCount();
        //     } catch (error) {
        //         console.error('Auto-refresh failed:', error);
        //     }
        // }, 120000); // 2 minutes
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    cleanup() {
        this.stopAutoRefresh();
    }
}

// Export for use in command-center
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EmailTab;
}
