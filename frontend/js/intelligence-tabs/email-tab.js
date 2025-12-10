// frontend/js/intelligence-tabs/email-tab.js

export class EmailTab {
    constructor(parent) {
        this.parent = parent;
        this.emails = [];
        this.selectedEmail = null;
        this.refreshInterval = null;
        this.searchTimeout = null; // For debouncing search
    }

    render(container) {
        console.log('📧 Rendering Email tab...');
        this.container = container;
        this.fetchAndRender();
    }

    async fetchAndRender() {
        try {
            // Initial render with loading skeleton or empty state
            this.container.innerHTML = this.getLayoutHTML();
            
            // Fetch real data
            await this.fetchEmails();

            this.attachEventListeners();
            this.startAutoRefresh();

        } catch (error) {
            console.error('Error rendering Email tab:', error);
            this.renderErrorState(error.message);
        }
    }

    getLayoutHTML() {
        return `
            <div class="email-container" style="display: flex; flex-direction: column; height: 100%; gap: 12px;">
                <div class="email-toolbar" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: white; border-radius: 8px; border: 1px solid #e5e7eb;">
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button id="refreshEmailBtn" class="btn btn-sm" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                        <button id="unreadOnlyBtn" class="btn btn-sm" style="padding: 8px 16px; background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer;">
                            Show Unread Only
                        </button>
                        <div id="emailCount" style="padding: 6px 12px; background: #f3f4f6; border-radius: 6px; font-size: 14px; color: #6b7280;">
                            <strong>0</strong> emails
                        </div>
                    </div>
                    <div style="position: relative;">
                        <input type="text" id="emailSearchInput" placeholder="Search emails..."
                               style="padding: 8px 12px 8px 36px; border: 1px solid #d1d5db; border-radius: 6px; width: 250px; font-size: 14px;">
                        <i class="fas fa-search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #9ca3af;"></i>
                    </div>
                </div>

                <div class="email-content-area" style="display: flex; flex: 1; gap: 12px; overflow: hidden;">
                    <div class="email-list-container" style="flex: 0 0 400px; display: flex; flex-direction: column; background: white; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden;">
                        <div class="email-list-header" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #111827;">
                            Inbox
                        </div>
                        <div id="emailList" class="email-list" style="flex: 1; overflow-y: auto;">
                            <div style="padding: 20px; text-align: center; color: #6b7280;">Loading emails...</div>
                        </div>
                    </div>

                    <div class="email-viewer-container" style="flex: 1; background: white; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden; display: flex; flex-direction: column;">
                        <div id="emailViewer" class="email-viewer" style="flex: 1; overflow-y: auto;">
                            ${this.renderEmailViewer()}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderErrorState(msg) {
        if (!this.container) return;
        this.container.innerHTML = `
            <div class="empty-state" style="padding: 2rem; text-align: center; color: #ef4444;">
                <div class="empty-icon" style="font-size: 2rem; margin-bottom: 1rem;">❌</div>
                <p>Error loading emails: ${msg}</p>
                <button onclick="window.location.reload()" style="margin-top:1rem; padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">Retry</button>
            </div>
        `;
    }

    renderEmailList() {
        if (!this.emails || this.emails.length === 0) {
            return `
                <div style="padding: 40px; text-align: center; color: #6b7280;">
                    <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
                    <p>No emails found</p>
                </div>
            `;
        }

        return this.emails.map(email => {
            // Robust check for from name/email
            let fromName = 'Unknown';
            if (email.from) {
                if (typeof email.from === 'string') fromName = email.from;
                else if (email.from.name) fromName = email.from.name;
                else if (email.from.email) fromName = email.from.email;
            }
            
            const date = new Date(email.date || email.timestamp);
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
                        ${email.subject || '(No Subject)'}
                    </div>
                    <div style="font-size: 13px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${email.snippet || ''}
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
        
        let fromName = 'Unknown';
        let fromEmail = '';
        if (email.from) {
             fromName = email.from.name || email.from.email || 'Unknown';
             fromEmail = email.from.email || '';
        }

        const date = new Date(email.date || email.timestamp);
        const formattedDate = date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Use backend HTML if available, otherwise fallback to text in pre
        const bodyContent = email.html 
            ? email.html 
            : `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0; color: #374151;">${email.text || ''}</pre>`;

        return `
            <div class="email-detail" style="display: flex; flex-direction: column; height: 100%;">
                <div class="email-header" style="padding: 20px; border-bottom: 1px solid #e5e7eb;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
                        <h3 style="margin: 0; font-size: 20px; font-weight: 600; color: #111827; flex: 1;">
                            ${email.subject || '(No Subject)'}
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

                <div class="email-body" style="flex: 1; padding: 20px; overflow-y: auto;">
                    ${bodyContent}
                </div>
            </div>
        `;
    }

    // --- Data Fetching Logic ---

    async fetchEmails(options = {}) {
        const { unreadOnly = false, query = null } = options;
        
        // Visual indicator in list
        const listEl = document.getElementById('emailList');
        if (listEl) listEl.style.opacity = '0.5';

        try {
            let url = '/api/email/list?limit=50';
            if (unreadOnly) url += '&unreadOnly=true';
            
            // If we are searching, switch endpoint
            if (query) {
                url = `/api/email/search?q=${encodeURIComponent(query)}`;
            }

            const res = await fetch(url);
            const data = await res.json();

            if (data.success) {
                this.emails = data.emails;
                this.updateEmailList();
                this.updateEmailCount();
            } else {
                console.error('API responded with failure:', data.error);
                // Optional: show toast notification
            }
        } catch (err) {
            console.error('Network error fetching emails:', err);
        } finally {
            if (listEl) listEl.style.opacity = '1';
        }
    }

    // --- Action Handlers ---

    async selectEmail(emailId) {
        // Find email in local state
        const email = this.emails.find(e => e.id == emailId);
        if (email) {
            this.selectedEmail = email;
            this.updateEmailViewer();
            this.attachViewerEventListeners();
            
            // Optional: Automatically mark as read on selection?
            // if (email.isUnread) { this.markAsRead(emailId); }
        }
    }

    async markAsRead(emailId) {
        // Optimistic Update
        this.updateLocalReadState(emailId, false);

        try {
            await fetch(`/api/email/${emailId}/mark-read`, { method: 'POST' });
        } catch (err) {
            console.error('Error marking read:', err);
            // Revert on fail
            this.updateLocalReadState(emailId, true);
        }
    }

    async markAsUnread(emailId) {
        // Optimistic Update
        this.updateLocalReadState(emailId, true);

        try {
            await fetch(`/api/email/${emailId}/mark-unread`, { method: 'POST' });
        } catch (err) {
            console.error('Error marking unread:', err);
            // Revert on fail
            this.updateLocalReadState(emailId, false);
        }
    }

    updateLocalReadState(emailId, isUnread) {
        const email = this.emails.find(e => e.id == emailId);
        if (email) email.isUnread = isUnread;
        if (this.selectedEmail && this.selectedEmail.id == emailId) {
            this.selectedEmail.isUnread = isUnread;
        }
        this.updateEmailList();
        this.updateEmailViewer();
        this.attachViewerEventListeners();
    }

    async deleteEmail(emailId) {
        if (!confirm('Are you sure you want to delete this email?')) return;

        // Optimistic UI Removal
        const previousEmails = [...this.emails];
        this.emails = this.emails.filter(e => e.id != emailId);
        
        if (this.selectedEmail && this.selectedEmail.id == emailId) {
            this.selectedEmail = null;
        }
        
        this.updateEmailList();
        this.updateEmailViewer();
        this.updateEmailCount();

        try {
            await fetch(`/api/email/${emailId}`, { method: 'DELETE' });
        } catch (err) {
            console.error('Error deleting email:', err);
            // Revert
            this.emails = previousEmails;
            this.updateEmailList();
            alert('Failed to delete email');
        }
    }

    // Client-side AI simulation (keeping this from your code as requested)
    // Eventually this can point to /api/email/analyze
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

    // Logic kept from your file for demo purposes
    generateAnalysis(email) {
        const subject = (email.subject || '').toUpperCase();
        if (subject.includes('URGENT')) {
            return `📊 SUMMARY\nTime-sensitive email requiring immediate action.\n\n🔑 KEY POINTS\n• Client wants to finalize deal today\n• All approvals in place\n• Pending: signed contract\n\n✅ ACTION ITEMS\n1. Contact client immediately\n2. Send documents\n\n⚡ PRIORITY: CRITICAL`;
        } else if (subject.includes('REPORT') || subject.includes('FCS')) {
            return `📊 SUMMARY\nFinancial report received.\n\n🔑 KEY POINTS\n• Review attached data\n• Check for negative days/NSF\n\n✅ ACTION ITEMS\n1. Review full report\n2. Update file\n\n⚡ PRIORITY: MEDIUM`;
        }
        return `📊 SUMMARY\n${email.snippet || 'General email communication.'}\n\n⚡ PRIORITY: NORMAL`;
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

    // --- UI Utilities ---

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
            });
        }

        const searchInput = document.getElementById('emailSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.handleSearchInput(e.target.value));
        }

        this.attachEmailItemListeners();
    }

    // Debounce search to avoid spamming IMAP
    handleSearchInput(query) {
        if (this.searchTimeout) clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            if (!query.trim()) {
                this.fetchEmails();
            } else {
                this.fetchEmails({ query });
            }
        }, 600);
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

    formatDate(date) {
        if (!date) return '';
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
        console.log('📧 Starting auto-refresh (every 2 mins)...');
        // Refresh every 2 minutes
        this.refreshInterval = setInterval(() => {
            // Only refresh if not searching
            const searchInput = document.getElementById('emailSearchInput');
            if (!searchInput || !searchInput.value) {
                this.fetchEmails();
            }
        }, 120000);
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
