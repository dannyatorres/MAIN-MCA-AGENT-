// frontend/js/intelligence-tabs/email-tab.js

export class EmailTab {
    constructor(parent) {
        this.parent = parent;
        this.emails = [];
        this.selectedEmail = null;
        this.refreshInterval = null;
    }

    render(container) {
        console.log('📧 Rendering Email tab...');
        this.container = container;
        this.fetchAndRender();
    }

    async fetchAndRender() {
        try {
            await this.fetchEmails();

            this.container.innerHTML = `
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

            this.attachEventListeners();
            this.startAutoRefresh();

        } catch (error) {
            console.error('Error rendering Email tab:', error);
            this.container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">❌</div>
                    <p>Error loading emails: ${error.message}</p>
                </div>
            `;
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
                            <button class="analyze-email-btn"
                                    data-email-id="${email.id}"
                                    style="padding: 6px 12px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
                                <i class="fas fa-robot"></i> AI Analyze
                            </button>
                            ${email.isUnread ? `
                                <button class="mark-read-btn"
                                        data-email-id="${email.id}"
                                        style="padding: 6px 12px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
                                    <i class="fas fa-check"></i> Mark Read
                                </button>
                            ` : `
                                <button class="mark-unread-btn"
                                        data-email-id="${email.id}"
                                        style="padding: 6px 12px; background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-size: 13px;">
                                    <i class="fas fa-envelope"></i> Mark Unread
                                </button>
                            `}
                            <button class="delete-email-btn"
                                    data-email-id="${email.id}"
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
        return [
            {
                id: 1,
                subject: 'Re: MCA Application for ABC Corp - $150K Request',
                from: { name: 'Sarah Johnson', email: 'sjohnson@capitalfund.com' },
                date: new Date(now - 2 * 60 * 60 * 1000),
                text: 'Hi,\n\nI reviewed the bank statements for ABC Corp. The monthly deposits look strong at $85K average. We can offer $150K at 1.28 factor with 9-month term.\n\nPlease let me know if the client wants to proceed.\n\nBest regards,\nSarah',
                snippet: 'I reviewed the bank statements for ABC Corp. The monthly deposits look strong at $85K average...',
                isUnread: true,
                hasAttachments: false,
                attachments: []
            },
            {
                id: 2,
                subject: 'New Lead: Restaurant Equipment Financing',
                from: { name: 'Michael Chen', email: 'mchen@leadsource.com' },
                date: new Date(now - 5 * 60 * 60 * 1000),
                text: 'Hello,\n\nI have a warm lead for you:\n\nBusiness: Downtown Bistro LLC\nOwner: James Martinez\nPhone: (555) 123-4567\nMonthly Revenue: $45,000\nRequesting: $75,000 for new equipment\n\nOwner is ready to submit application.',
                snippet: 'I have a warm lead for you: Business: Downtown Bistro LLC, Owner: James Martinez...',
                isUnread: true,
                hasAttachments: false,
                attachments: []
            },
            {
                id: 3,
                subject: 'FCS Report Ready - Project Capital LLC',
                from: { name: 'Analytics Team', email: 'reports@fcsanalytics.com' },
                date: new Date(now - 8 * 60 * 60 * 1000),
                text: 'Your FCS report for Project Capital LLC is ready.\n\nKey Findings:\n- Average Monthly Deposits: $127,000\n- Negative Days: 3\n- NSF Count: 1\n- Recommended Position: $180,000 - $200,000',
                html: '<p>Your FCS report for <strong>Project Capital LLC</strong> is ready.</p><p><strong>Key Findings:</strong></p><ul><li>Average Monthly Deposits: $127,000</li><li>Negative Days: 3</li><li>NSF Count: 1</li><li>Recommended Position: $180,000 - $200,000</li></ul>',
                snippet: 'Your FCS report for Project Capital LLC is ready. Key Findings: Average Monthly Deposits: $127,000...',
                isUnread: false,
                hasAttachments: true,
                attachments: [{ filename: 'ProjectCapital_FCS_Report.pdf', size: 245000 }]
            },
            {
                id: 4,
                subject: 'URGENT: Client wants to close today - Tech Solutions Inc',
                from: { name: 'Robert Kim', email: 'rkim@fastfunding.com' },
                date: new Date(now - 3 * 60 * 60 * 1000),
                text: 'URGENT!\n\nTech Solutions Inc wants to close their $120K position TODAY.\n\nEverything is approved. Just need:\n- Signed contract\n- ACH authorization form\n\nCan you get these signed and returned within 2 hours?',
                snippet: 'Tech Solutions Inc wants to close their $120K position TODAY. Everything is approved...',
                isUnread: true,
                hasAttachments: true,
                attachments: [
                    { filename: 'TechSolutions_Contract.pdf', size: 185000 },
                    { filename: 'ACH_Authorization.pdf', size: 95000 }
                ]
            },
            {
                id: 5,
                subject: 'Renewal Opportunity - Happy Donuts (Previous Client)',
                from: { name: 'Jennifer Lee', email: 'jlee@renewalcapital.com' },
                date: new Date(now - 6 * 60 * 60 * 1000),
                text: 'Hi there,\n\nHappy Donuts is eligible for a renewal. They paid off their previous $50K position in 7 months.\n\nCurrent offer: $85K at 1.25 factor, 10-month term\n\nOwner mentioned wanting to expand to a second location.',
                snippet: 'Happy Donuts is eligible for a renewal. They paid off their previous $50K position in 7 months...',
                isUnread: true,
                hasAttachments: false,
                attachments: []
            }
        ];
    }

    async fetchEmails(options = {}) {
        console.log('📧 Using mock email data for demo...');
        const { unreadOnly = false } = options;

        let allEmails = this.generateMockEmails();

        if (unreadOnly) {
            allEmails = allEmails.filter(email => email.isUnread);
        }

        this.emails = allEmails;
        console.log(`✅ Loaded ${this.emails.length} mock emails`);
        return this.emails;
    }

    async selectEmail(emailId) {
        const email = this.emails.find(e => e.id == emailId);
        if (email) {
            this.selectedEmail = email;
            this.updateEmailViewer();
            this.attachViewerEventListeners();
        }
    }

    async markAsRead(emailId) {
        const email = this.emails.find(e => e.id == emailId);
        if (email) email.isUnread = false;
        if (this.selectedEmail && this.selectedEmail.id == emailId) {
            this.selectedEmail.isUnread = false;
        }
        this.updateEmailList();
        this.updateEmailViewer();
        this.attachViewerEventListeners();
    }

    async markAsUnread(emailId) {
        const email = this.emails.find(e => e.id == emailId);
        if (email) email.isUnread = true;
        if (this.selectedEmail && this.selectedEmail.id == emailId) {
            this.selectedEmail.isUnread = true;
        }
        this.updateEmailList();
        this.updateEmailViewer();
        this.attachViewerEventListeners();
    }

    async deleteEmail(emailId) {
        if (!confirm('Are you sure you want to delete this email?')) return;

        this.emails = this.emails.filter(e => e.id != emailId);
        if (this.selectedEmail && this.selectedEmail.id == emailId) {
            this.selectedEmail = null;
        }
        this.updateEmailList();
        this.updateEmailViewer();
        this.updateEmailCount();
    }

    async analyzeEmail(emailId) {
        const email = this.emails.find(e => e.id == emailId) || this.selectedEmail;
        if (!email) return;

        const aiButton = document.querySelector(`.analyze-email-btn[data-email-id="${emailId}"]`);
        if (aiButton) {
            const originalHTML = aiButton.innerHTML;
            aiButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
            aiButton.disabled = true;

            await new Promise(resolve => setTimeout(resolve, 1500));

            let analysis = this.generateAnalysis(email);
            this.showEmailAnalysis(analysis);

            aiButton.innerHTML = originalHTML;
            aiButton.disabled = false;
        }
    }

    generateAnalysis(email) {
        if (email.subject.includes('URGENT')) {
            return `📊 SUMMARY\nTime-sensitive email requiring immediate action.\n\n🔑 KEY POINTS\n• Client wants to finalize deal today\n• All approvals in place\n• Pending: signed contract and ACH form\n\n✅ ACTION ITEMS\n1. Contact client immediately\n2. Send documents within 2 hours\n\n⚡ PRIORITY: CRITICAL`;
        } else if (email.subject.includes('FCS Report')) {
            return `📊 SUMMARY\nFCS report completed with favorable results.\n\n🔑 KEY POINTS\n• Monthly deposits: $127K\n• Low risk factors\n• Recommended: $180K-$200K\n\n✅ ACTION ITEMS\n1. Review full report\n2. Contact client with options\n\n⚡ PRIORITY: MEDIUM`;
        } else if (email.subject.includes('New Lead')) {
            return `📊 SUMMARY\nWarm lead referral for equipment financing.\n\n🔑 KEY POINTS\n• Business: Downtown Bistro LLC\n• Revenue: $45K/month\n• Requesting: $75K\n\n✅ ACTION ITEMS\n1. Call owner today\n2. Qualify and request docs\n\n⚡ PRIORITY: HIGH`;
        } else if (email.subject.includes('Renewal')) {
            return `📊 SUMMARY\nRenewal opportunity with excellent payment history.\n\n🔑 KEY POINTS\n• Previous: $50K paid in 7 months\n• New offer: $85K at 1.25 factor\n• Expansion plans\n\n✅ ACTION ITEMS\n1. Contact owner within 24 hours\n2. Fast-track application\n\n⚡ PRIORITY: HIGH`;
        }
        return `📊 SUMMARY\n${email.snippet}\n\n⚡ PRIORITY: MEDIUM`;
    }

    showEmailAnalysis(analysis) {
        const emailBody = document.querySelector('.email-body');
        if (!emailBody) return;

        const existing = emailBody.querySelector('.email-ai-analysis');
        if (existing) existing.remove();

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

    updateEmailCount() {
        const emailCount = document.getElementById('emailCount');
        if (emailCount) {
            emailCount.innerHTML = `<strong>${this.emails.length}</strong> emails`;
        }
    }

    attachEventListeners() {
        const refreshBtn = document.getElementById('refreshEmailBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.disabled = true;
                refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
                await this.fetchEmails();
                this.updateEmailList();
                this.updateEmailCount();
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
            });
        }

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

        const searchInput = document.getElementById('emailSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.searchEmails(e.target.value));
        }

        this.attachEmailItemListeners();
    }

    attachEmailItemListeners() {
        document.querySelectorAll('.email-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectEmail(item.getAttribute('data-email-id'));
            });
        });
    }

    attachViewerEventListeners() {
        document.querySelectorAll('.analyze-email-btn').forEach(btn => {
            btn.onclick = () => this.analyzeEmail(btn.dataset.emailId);
        });
        document.querySelectorAll('.mark-read-btn').forEach(btn => {
            btn.onclick = () => this.markAsRead(btn.dataset.emailId);
        });
        document.querySelectorAll('.mark-unread-btn').forEach(btn => {
            btn.onclick = () => this.markAsUnread(btn.dataset.emailId);
        });
        document.querySelectorAll('.delete-email-btn').forEach(btn => {
            btn.onclick = () => this.deleteEmail(btn.dataset.emailId);
        });
    }

    searchEmails(query) {
        if (!query.trim()) {
            this.emails = this.generateMockEmails();
        } else {
            const allEmails = this.generateMockEmails();
            const q = query.toLowerCase();
            this.emails = allEmails.filter(email =>
                email.subject.toLowerCase().includes(q) ||
                email.from.name.toLowerCase().includes(q) ||
                email.text.toLowerCase().includes(q)
            );
        }
        this.updateEmailList();
        this.updateEmailCount();
    }

    formatDate(date) {
        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        if (days === 1) return 'Yesterday';
        if (days < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    startAutoRefresh() {
        console.log('📧 Auto-refresh disabled for mock email data');
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
