// frontend/js/intelligence-tabs/email-tab.js

export class EmailTab {
    constructor(parent) {
        this.parent = parent;
        this.emails = [];
        this.selectedEmail = null;
        this.offset = 0;
        this.limit = 50;
        this.isLoading = false;
        this.searchTimeout = null;
        this.unreadOnly = false;
        this.query = null;
    }

    render(container) {
        this.container = container;
        this.container.innerHTML = this.getLayoutHTML();
        this.attachEventListeners();
        this.fetchEmails();
    }

    getLayoutHTML() {
        return `
            <div class="email-container" style="display: flex; flex-direction: column; height: 100%; background: #0f1115;">
                
                <div class="email-toolbar unified-toolbar" style="padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; gap: 8px;">
                    
                    <div style="flex: 1; position: relative;">
                        <input type="text" id="emailSearchInput" class="search-field-clean" placeholder="Search emails..." 
                               style="width: 100%; height: 36px; background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 0 12px 0 36px; color: white; font-size: 13px;">
                        <i class="fas fa-search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #6e7681; pointer-events: none;"></i>
                    </div>

                    <div class="action-group" style="display: flex; gap: 6px;">
                        <button id="refreshEmailBtn" class="tool-btn primary" title="Refresh" 
                                style="width: 36px; height: 36px; border-radius: 8px; background: linear-gradient(135deg, #2dd4bf 0%, #0ea5e9 100%); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #000;">
                            <i class="fas fa-sync-alt" style="font-weight: bold;"></i>
                        </button>

                        <button id="unreadOnlyBtn" class="tool-btn" title="Show Unread Only"
                                style="width: 36px; height: 36px; border-radius: 8px; background: #21262d; border: 1px solid transparent; color: #8b949e; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-filter"></i>
                        </button>
                    </div>
                </div>

                <div class="email-content-area" style="flex: 1; position: relative; overflow: hidden;">
                    
                    <div id="emailListContainer" style="width: 100%; height: 100%; display: flex; flex-direction: column;">
                        <div id="emailList" class="email-list" style="flex: 1; overflow-y: auto; padding: 0;">
                            <div style="padding:20px; text-align:center; color:#6b7280;">Loading...</div>
                        </div>
                        
                        <div id="loadMoreContainer" style="padding: 16px; text-align: center; display: none;">
                            <button id="loadMoreBtn" style="padding: 8px 16px; background: #21262d; border: 1px solid #30363d; color: #c9d1d9; border-radius: 6px; cursor: pointer; font-size: 13px;">
                                Load Next 50 Messages
                            </button>
                        </div>
                    </div>

                    <div id="emailViewerContainer" style="width: 100%; height: 100%; display: none; flex-direction: column; background: #161b22;"></div>
                </div>
            </div>
        `;
    }

    async fetchEmails(options = {}) {
        if (this.isLoading) return;
        this.isLoading = true;

        const { unreadOnly = this.unreadOnly, query = this.query, isLoadMore = false } = options;

        // Reset on new query or filter
        if (!isLoadMore) {
            this.offset = 0;
            this.unreadOnly = unreadOnly;
            this.query = query || null;
            const list = document.getElementById('emailList');
            if (list && !query) list.innerHTML = '<div style="padding:20px; text-align:center; color:#6b7280;">Loading...</div>';
        }

        const refreshBtn = document.getElementById('refreshEmailBtn');
        if (refreshBtn) refreshBtn.querySelector('i').classList.add('fa-spin');

        try {
            let url = `/api/email/list?limit=${this.limit}&offset=${this.offset}`;
            if (unreadOnly) url += '&unreadOnly=true';
            if (query) {
                url = `/api/email/search?q=${encodeURIComponent(query)}`;
            }

            const res = await fetch(url);
            const data = await res.json();

            if (data.success) {
                if (isLoadMore) {
                    this.emails = [...this.emails, ...data.emails];
                } else {
                    this.emails = data.emails;
                }

                this.renderEmailList();

                const loadMoreContainer = document.getElementById('loadMoreContainer');
                if (!query && data.emails.length === this.limit) {
                    loadMoreContainer.style.display = 'block';
                } else {
                    loadMoreContainer.style.display = 'none';
                }
            }
        } catch (err) {
            console.error('Network error:', err);
        } finally {
            this.isLoading = false;
            if (refreshBtn) refreshBtn.querySelector('i').classList.remove('fa-spin');
        }
    }

    loadMore = async () => {
        if (this.isLoading) return;
        this.offset += this.limit;
        const btn = document.getElementById('loadMoreBtn');
        if (btn) btn.textContent = 'Loading...';
        await this.fetchEmails({ isLoadMore: true });
        if (btn) btn.textContent = 'Load Next 50 Messages';
    };

    renderEmailList() {
        const listContainer = document.getElementById('emailList');
        if (!listContainer) return;

        if (!this.emails.length) {
            listContainer.innerHTML = `<div style="padding:40px; text-align:center; color:#8b949e;">📭 No emails found</div>`;
            return;
        }

        listContainer.innerHTML = this.emails.map(email => this.getEmailItemHTML(email)).join('');
        this.attachEmailItemListeners();
    }

    getEmailItemHTML(email) {
        const isUnread = email.isUnread;
        const { name: fromName } = this.getSenderInfo(email);
        const dateStr = this.formatDate(new Date(email.date || email.timestamp));

        return `
            <div class="email-item ${isUnread ? 'unread' : ''}" 
                 data-email-id="${email.id}"
                 style="padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; transition: background 0.2s; background: transparent;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px;">
                    <div style="font-weight: ${isUnread ? '700' : '600'}; color: ${isUnread ? '#ffffff' : '#e6edf3'}; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px;">
                        ${fromName}
                    </div>
                    <div style="font-size: 11px; color: #6b7280; white-space: nowrap; margin-left: 8px; margin-top: 2px;">${dateStr}</div>
                </div>
                <div style="font-size: 13px; font-weight: ${isUnread ? '600' : '400'}; color: ${isUnread ? '#e6edf3' : '#8b949e'}; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${email.subject || '(No Subject)'}
                </div>
                <div style="font-size: 12px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${email.snippet || ''}
                </div>
            </div>
        `;
    }

    async selectEmail(emailId) {
        const email = this.emails.find(e => e.id == emailId);
        if (email) {
            this.selectedEmail = email;
            if (email.isUnread) this.markAsRead(emailId);
            document.getElementById('emailViewerContainer').innerHTML = this.renderEmailViewer();
            document.getElementById('emailListContainer').style.display = 'none';
            document.getElementById('emailViewerContainer').style.display = 'flex';
            this.attachViewerEventListeners();
        }
    }

    showInbox() {
        document.getElementById('emailViewerContainer').style.display = 'none';
        document.getElementById('emailListContainer').style.display = 'flex';
        this.selectedEmail = null;
    }

    renderEmailViewer() {
        if (!this.selectedEmail) return '';

        const email = this.selectedEmail;
        const { name: fromName, address: fromEmail } = this.getSenderInfo(email);

        const date = new Date(email.date || email.timestamp);
        const formattedDate = date.toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

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

    attachEventListeners() {
        const refreshBtn = document.getElementById('refreshEmailBtn');
        if (refreshBtn) refreshBtn.onclick = () => this.fetchEmails();

        const unreadBtn = document.getElementById('unreadOnlyBtn');
        if (unreadBtn) {
            unreadBtn.onclick = () => {
                const isActive = unreadBtn.classList.toggle('active');
                unreadBtn.style.background = isActive ? '#3b82f6' : '#21262d';
                unreadBtn.style.color = isActive ? '#fff' : '#8b949e';
                this.fetchEmails({ unreadOnly: isActive, query: this.query });
            };
        }

        const searchInput = document.getElementById('emailSearchInput');
        if (searchInput) {
            searchInput.oninput = (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    const val = e.target.value;
                    this.fetchEmails({ query: val || null, unreadOnly: this.unreadOnly });
                }, 600);
            };
        }

        const loadMoreBtn = document.getElementById('loadMoreBtn');
        if (loadMoreBtn) loadMoreBtn.onclick = this.loadMore;
    }

    attachEmailItemListeners() {
        document.querySelectorAll('.email-item').forEach(item => {
            item.onclick = () => this.selectEmail(item.getAttribute('data-email-id'));
        });
    }

    attachViewerEventListeners() {
        const backBtn = document.getElementById('backToInboxBtn');
        if (backBtn) backBtn.onclick = () => this.showInbox();

        document.querySelectorAll('.delete-email-btn').forEach(btn => 
            btn.onclick = () => this.deleteEmail(btn.dataset.emailId));

        document.querySelectorAll('.analyze-email-btn').forEach(btn =>
            btn.onclick = () => this.analyzeEmail(btn.dataset.emailId));
    }

    // Helper to safely extract sender info
    getSenderInfo(email) {
        let name = 'Unknown';
        let address = '';

        if (email.from) {
            const raw = email.from.value || email.from;
            const first = Array.isArray(raw) ? raw[0] : raw;
            if (first) {
                name = first.name || first.email || 'Unknown';
                address = first.email || '';
            } else if (typeof raw === 'string') {
                name = raw;
            }
        }

        name = name.replace(/"/g, '');
        return { name, address };
    }

    async markAsRead(emailId) {
        try {
            await fetch(`/api/email/${emailId}/mark-read`, { method: 'POST' });
            this.updateLocalReadState(emailId, false);
        } catch (e) {
            console.error('Error marking read', e);
        }
    }

    updateLocalReadState(emailId, isUnread) {
        const email = this.emails.find(e => e.id == emailId);
        if (email) email.isUnread = isUnread;
        this.renderEmailList();
    }

    async deleteEmail(emailId) {
        if (!confirm('Delete this email?')) return;
        this.emails = this.emails.filter(e => e.id != emailId);
        this.showInbox();
        this.renderEmailList();
        const loadMoreContainer = document.getElementById('loadMoreContainer');
        if (loadMoreContainer) loadMoreContainer.style.display = 'none';
        try {
            await fetch(`/api/email/${emailId}`, { method: 'DELETE' });
        } catch (e) {
            console.error('Error deleting email', e);
        }
    }

    async analyzeEmail(emailId) {
        const btn = document.querySelector(`.analyze-email-btn[data-email-id="${emailId}"]`);
        if (!btn) return;
        const original = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
        btn.disabled = true;
        await new Promise(r => setTimeout(r, 1200));
        this.showEmailAnalysis('📊 SUMMARY\nAI analysis placeholder.\n\n⚡ PRIORITY: NORMAL');
        btn.innerHTML = original;
        btn.disabled = false;
    }

    showEmailAnalysis(text) {
        const emailBody = document.querySelector('.email-body');
        if (!emailBody) return;
        const card = `
            <div style="margin-bottom: 20px; padding: 16px; background: linear-gradient(135deg, #1f2937 0%, #111827 100%); border: 1px solid #30363d; border-radius: 8px; color: #e6edf3;">
                <h4 style="margin: 0 0 12px 0; color: #58a6ff;"><i class="fas fa-robot"></i> AI Analysis</h4>
                <div style="white-space: pre-wrap; line-height: 1.6; font-size: 13px;">${text}</div>
            </div>
        `;
        emailBody.insertAdjacentHTML('afterbegin', card);
    }

    formatDate(date) {
        const now = new Date();
        if (now - date < 86400000 && now.getDate() === date.getDate()) {
            return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        }
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    startAutoRefresh() {
        // optional: refresh on interval
    }

    cleanup() {
        // optional cleanup
    }
}
