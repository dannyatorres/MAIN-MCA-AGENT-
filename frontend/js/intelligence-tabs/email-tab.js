// frontend/js/intelligence-tabs/email-tab.js

export class EmailTab {
    constructor(parent) {
        this.parent = parent;
        this.emails = [];
        this.selectedEmail = null;
        this.refreshInterval = null;
        this.searchTimeout = null;
    }

    render(container) {
        console.log('📧 Rendering Email tab...');
        this.container = container;
        this.fetchAndRender();
    }

    async fetchAndRender() {
        try {
            // Initial render
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
        // NOTE: We use display:none/flex to toggle between List and Viewer
        return `
            <div class="email-container" style="display: flex; flex-direction: column; height: 100%; gap: 12px; background: #161b22;">
                <div id="emailToolbar" class="email-toolbar" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #161b22; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button id="refreshEmailBtn" class="btn btn-sm" style="padding: 8px 16px; background: #21262d; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                        <button id="unreadOnlyBtn" class="btn btn-sm" style="padding: 8px 16px; background: #21262d; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; cursor: pointer;">
                            Show Unread Only
                        </button>
                        <div id="emailCount" style="padding: 6px 12px; background: #21262d; border-radius: 6px; font-size: 14px; color: #8b949e;">
                            <strong>0</strong> emails
                        </div>
                    </div>
                    <div style="position: relative;">
                        <input type="text" id="emailSearchInput" placeholder="Search emails..."
                               style="padding: 8px 12px 8px 36px; background: #0d1117; border: 1px solid #30363d; color: #e6edf3; border-radius: 6px; width: 250px; font-size: 14px;">
                        <i class="fas fa-search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #8b949e;"></i>
                    </div>
                </div>

                <div class="email-content-area" style="flex: 1; position: relative; overflow: hidden; background: #161b22; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                    
                    <div id="emailListContainer" style="width: 100%; height: 100%; display: flex; flex-direction: column;">
                        <div class="email-list-header" style="padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.1); font-weight: 600; color: #e6edf3; background: #161b22;">
                            Inbox
                        </div>
                        <div id="emailList" class="email-list" style="flex: 1; overflow-y: auto;">
                            <div style="padding: 20px; text-align: center; color: #6b7280;">Loading emails...</div>
                        </div>
                    </div>

                    <div id="emailViewerContainer" style="width: 100%; height: 100%; display: none; flex-direction: column; background: #161b22;">
                        </div>
                </div>
            </div>
        `;
    }

    renderEmailViewer() {
        if (!this.selectedEmail) return '';

        const email = this.selectedEmail;
        
        let fromName = 'Unknown';
        let fromEmail = '';
        if (email.from) {
             fromName = email.from.name || email.from.email || 'Unknown';
             fromEmail = email.from.email || '';
        }

        const date = new Date(email.date || email.timestamp);
        const formattedDate = date.toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        // Safe HTML body or text fallback
        const bodyContent = email.html 
            ? email.html 
            : `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0; color: #e6edf3;">${email.text || ''}</pre>`;

        return `
            <div class="email-detail" style="display: flex; flex-direction: column; height: 100%;">
                
                <div style="padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; gap: 10px;">
                    <button id="backToInboxBtn" style="background: transparent; border: none; color: #3b82f6; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 14px; padding: 4px 8px; border-radius: 4px;">
                        <i class="fas fa-arrow-left"></i> Back to Inbox
                    </button>
                </div>

                <div class="email-header" style="padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
                        <h3 style="margin: 0; font-size: 20px; font-weight: 600; color: #e6edf3; flex: 1;">
                            ${email.subject || '(No Subject)'}
                        </h3>
                        <div style="display: flex; gap: 8px;">
                            <button class="analyze-email-btn" data-email-id="${email.id}" style="padding: 6px 12px; background: #238636; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
                                <i class="fas fa-robot"></i> AI Analyze
                            </button>
                            <button class="delete-email-btn" data-email-id="${email.id}" style="padding: 6px 12px; background: #da3633; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </div>

                    <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 8px;">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 16px;">
                            ${fromName.charAt(0).toUpperCase()}
                        </div>
                        <div style="flex: 1;">
                            <div style="font-weight: 600; color: #e6edf3;">${fromName}</div>
                            <div style="font-size: 14px; color: #8b949e;">${fromEmail}</div>
                        </div>
                    </div>
                    <div style="font-size: 13px; color: #8b949e;">
                        ${formattedDate}
                    </div>
                    
                    ${email.hasAttachments ? `
                        <div style="margin-top: 12px; padding: 12px; background: rgba(255,255,255,0.04); border-radius: 6px; border: 1px solid rgba(255,255,255,0.1);">
                            <div style="font-weight: 600; color: #c9d1d9; margin-bottom: 8px; font-size: 13px;">
                                <i class="fas fa-paperclip"></i> Attachments (${email.attachments.length})
                            </div>
                            ${email.attachments.map(att => `
                                <div style="font-size: 13px; color: #8b949e; padding: 4px 0;">
                                    📎 ${att.filename} (${this.formatFileSize(att.size)})
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>

                <div class="email-body" style="flex: 1; padding: 20px; overflow-y: auto; color: #e6edf3;">
                    ${bodyContent}
                </div>
            </div>
        `;
    }

    // --- VIEW SWITCHING LOGIC ---

    async selectEmail(emailId) {
        const email = this.emails.find(e => e.id == emailId);
        if (email) {
            this.selectedEmail = email;
            
            // 1. Mark as read immediately (optimistic)
            if (email.isUnread) {
                this.markAsRead(emailId);
            }

            // 2. Populate Viewer
            const viewerContainer = document.getElementById('emailViewerContainer');
            viewerContainer.innerHTML = this.renderEmailViewer();

            // 3. Switch Views (Hide List, Show Viewer)
            document.getElementById('emailListContainer').style.display = 'none';
            // Optional: Hide global toolbar if you want a cleaner look, or keep it.
            // document.getElementById('emailToolbar').style.display = 'none'; 
            viewerContainer.style.display = 'flex';

            // 4. Attach Listeners (Back button, etc)
            this.attachViewerEventListeners();
        }
    }

    showInbox() {
        // Switch Views (Show List, Hide Viewer)
        document.getElementById('emailViewerContainer').style.display = 'none';
        document.getElementById('emailListContainer').style.display = 'flex';
        // document.getElementById('emailToolbar').style.display = 'flex';
        
        this.selectedEmail = null;
    }

    // --- EXISTING FETCH & ACTIONS ---

    async fetchEmails(options = {}) {
        const { unreadOnly = false, query = null } = options;
        const listEl = document.getElementById('emailList');
        if (listEl) listEl.style.opacity = '0.5';

        try {
            let url = '/api/email/list?limit=50';
            if (unreadOnly) url += '&unreadOnly=true';
            if (query) url = `/api/email/search?q=${encodeURIComponent(query)}`;

            const res = await fetch(url);
            const data = await res.json();

            if (data.success) {
                this.emails = data.emails;
                this.updateEmailList();
                this.updateEmailCount();
            }
        } catch (err) {
            console.error('Network error:', err);
        } finally {
            if (listEl) listEl.style.opacity = '1';
        }
    }

    // --- ACTION HANDLERS ---

    async markAsRead(emailId) {
        this.updateLocalReadState(emailId, false);
        try { await fetch(`/api/email/${emailId}/mark-read`, { method: 'POST' }); } catch (e) {}
    }

    async markAsUnread(emailId) {
        this.updateLocalReadState(emailId, true);
        try { await fetch(`/api/email/${emailId}/mark-unread`, { method: 'POST' }); } catch (e) {}
    }

    updateLocalReadState(emailId, isUnread) {
        const email = this.emails.find(e => e.id == emailId);
        if (email) email.isUnread = isUnread;
        this.updateEmailList();
    }

    async deleteEmail(emailId) {
        if (!confirm('Delete this email?')) return;
        this.emails = this.emails.filter(e => e.id != emailId);
        this.showInbox(); // Go back to inbox after delete
        this.updateEmailList();
        this.updateEmailCount();
        try { await fetch(`/api/email/${emailId}`, { method: 'DELETE' }); } catch (e) {}
    }

    async analyzeEmail(emailId) {
        const btn = document.querySelector(`.analyze-email-btn[data-email-id="${emailId}"]`);
        if (!btn) return;
        
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
        btn.disabled = true;

        await new Promise(r => setTimeout(r, 1500)); // Mock delay
        
        // Show mock analysis
        const analysis = this.generateAnalysis(this.emails.find(e => e.id == emailId));
        this.showEmailAnalysis(analysis);

        btn.innerHTML = originalText;
        btn.disabled = false;
    }

    generateAnalysis(email) {
        // (Same analysis logic as before)
        return `📊 SUMMARY\n${email.snippet || 'General communication.'}\n\n⚡ PRIORITY: NORMAL`;
    }

    showEmailAnalysis(analysis) {
        const emailBody = document.querySelector('.email-body');
        if (!emailBody) return;
        // Insert analysis at top of body
        const analysisHTML = `
            <div style="margin-bottom: 20px; padding: 16px; background: linear-gradient(135deg, #1f2937 0%, #111827 100%); border: 1px solid #30363d; border-radius: 8px; color: #e6edf3;">
                <h4 style="margin: 0 0 12px 0; color: #58a6ff;"><i class="fas fa-robot"></i> AI Analysis</h4>
                <div style="white-space: pre-wrap; line-height: 1.6; font-size: 13px;">${analysis}</div>
            </div>
        `;
        emailBody.insertAdjacentHTML('afterbegin', analysisHTML);
    }

    // --- UI UTILS & LISTENERS ---

    updateEmailList() {
        const emailList = document.getElementById('emailList');
        if (emailList) {
            emailList.innerHTML = this.renderEmailList();
            this.attachEmailItemListeners();
        }
    }
    
    updateEmailCount() {
        const el = document.getElementById('emailCount');
        if (el) el.innerHTML = `<strong>${this.emails.length}</strong> emails`;
    }

    renderEmailList() {
        if (!this.emails.length) return `<div style="padding:40px; text-align:center; color:#8b949e;">📭 No emails found</div>`;
        
        return this.emails.map(email => {
            const isUnread = email.isUnread;
            const fromName = email.from?.name || email.from?.email || email.from || 'Unknown';
            const dateStr = this.formatDate(new Date(email.date || email.timestamp));

            return `
                <div class="email-item ${isUnread ? 'unread' : ''}" 
                     data-email-id="${email.id}"
                     style="padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; transition: background 0.2s; ${isUnread ? 'background: rgba(255,255,255,0.04); border-left: 3px solid #3b82f6;' : 'border-left: 3px solid transparent;'}">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px;">
                        <div style="font-weight: ${isUnread ? '600' : '500'}; color: ${isUnread ? '#e6edf3' : '#8b949e'}; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${fromName}
                        </div>
                        <div style="font-size: 12px; color: #6b7280; white-space: nowrap; margin-left: 8px;">${dateStr}</div>
                    </div>
                    <div style="font-size: 14px; font-weight: ${isUnread ? '600' : '400'}; color: #c9d1d9; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${email.subject || '(No Subject)'}
                    </div>
                    <div style="font-size: 13px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${email.snippet || ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    renderErrorState(msg) {
        if(this.container) this.container.innerHTML = `<div style="padding:20px; color:#ef4444; text-align:center;">Error: ${msg}</div>`;
    }

    attachEventListeners() {
        // Toolbar listeners
        const refreshBtn = document.getElementById('refreshEmailBtn');
        if (refreshBtn) refreshBtn.onclick = async () => {
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            await this.fetchEmails();
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
        };

        const unreadOnlyBtn = document.getElementById('unreadOnlyBtn');
        if (unreadOnlyBtn) {
            let active = false;
            unreadOnlyBtn.onclick = () => {
                active = !active;
                unreadOnlyBtn.style.background = active ? '#1f6feb' : '#21262d';
                unreadOnlyBtn.style.color = active ? 'white' : '#c9d1d9';
                this.fetchEmails({ unreadOnly: active });
            };
        }

        const searchInput = document.getElementById('emailSearchInput');
        if (searchInput) searchInput.oninput = (e) => this.handleSearchInput(e.target.value);

        this.attachEmailItemListeners();
    }

    attachEmailItemListeners() {
        document.querySelectorAll('.email-item').forEach(item => {
            item.onclick = () => this.selectEmail(item.getAttribute('data-email-id'));
        });
    }

    attachViewerEventListeners() {
        // 1. THE BACK BUTTON
        const backBtn = document.getElementById('backToInboxBtn');
        if (backBtn) backBtn.onclick = () => this.showInbox();

        // 2. Action Buttons
        document.querySelectorAll('.analyze-email-btn').forEach(btn => 
            btn.onclick = () => this.analyzeEmail(btn.dataset.emailId));
        
        document.querySelectorAll('.delete-email-btn').forEach(btn => 
            btn.onclick = () => this.deleteEmail(btn.dataset.emailId));
    }

    handleSearchInput(query) {
        if (this.searchTimeout) clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.fetchEmails(query ? { query } : {});
        }, 600);
    }

    formatDate(date) {
        const now = new Date();
        if (now - date < 86400000 && now.getDate() === date.getDate()) {
            return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        }
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    
    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
        return (bytes/(1024*1024)).toFixed(1) + ' MB';
    }

    startAutoRefresh() {
        this.refreshInterval = setInterval(() => {
            const searchInput = document.getElementById('emailSearchInput');
            if (!searchInput || !searchInput.value) this.fetchEmails();
        }, 120000);
    }

    cleanup() {
        if (this.refreshInterval) clearInterval(this.refreshInterval);
    }
}
