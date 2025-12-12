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
            <div class="email-tab-container">
                
                <div class="email-toolbar">
                    <div class="email-search-wrapper">
                        <input type="text" id="emailSearchInput" class="email-search-input" placeholder="Search emails...">
                        <i class="fas fa-search email-search-icon"></i>
                    </div>

                    <div class="email-action-group">
                        <button id="composeEmailBtn" class="btn-compose-neon" title="Compose">
                            <i class="fas fa-plus"></i>
                        </button>

                        <button id="unreadOnlyBtn" class="btn-email-tool" title="Filter Unread">
                            <i class="fas fa-filter"></i>
                        </button>

                        <button id="refreshEmailBtn" class="btn-email-tool" title="Refresh">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    </div>
                </div>

                <div class="email-content-area">
                    <div id="emailListContainer" class="email-list-wrapper">
                        <div id="emailList" class="email-list-scroll"></div>
                        <div id="loadMoreContainer" style="padding: 16px; text-align: center; display: none;">
                            <button id="loadMoreBtn" class="btn-email-tool" style="width:auto; padding:0 16px; font-size:12px;">Load Next 50 Messages</button>
                        </div>
                    </div>

                    <div id="emailViewerContainer" style="display: none; height: 100%;"></div>
                </div>

                <div id="composeModal" class="compose-modal" style="display: none;">
                    <div class="compose-header">
                        <span>New Message</span>
                        <button id="closeComposeBtn" style="background:none; border:none; color:#8b949e; cursor:pointer;"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="compose-body">
                        <input class="compose-input" placeholder="To">
                        <input class="compose-input" placeholder="Subject">
                        <textarea class="compose-textarea" placeholder="Write your message..."></textarea>
                    </div>
                    <div style="padding:16px; border-top:1px solid #30363d; display:flex; justify-content:space-between;">
                        <button style="background:#2dd4bf; border:none; border-radius:4px; padding:8px 20px; font-weight:700; cursor:pointer;">Send</button>
                        <button style="background:none; border:none; color:#8b949e; cursor:pointer;"><i class="fas fa-paperclip"></i></button>
                    </div>
                </div>
            </div>
        `;
    }

    getEmailItemHTML(email) {
        const isUnread = email.isUnread;
        const { name } = this.getSenderInfo(email);
        const dateStr = this.formatDate(new Date(email.date || email.timestamp));

        return `
            <div class="email-item ${isUnread ? 'unread' : ''}" data-email-id="${email.id}">
                <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                    <div class="email-sender">${name}</div>
                    <div style="font-size:11px; color:#6b7280;">${dateStr}</div>
                </div>
                <div class="email-subject">${email.subject || '(No Subject)'}</div>
                <div class="email-snippet">${email.snippet || ''}</div>
            </div>
        `;
    }

    renderEmailViewer() {
        if (!this.selectedEmail) return '';
        const email = this.selectedEmail;
        const { name, address } = this.getSenderInfo(email);
        const date = new Date(email.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
        
        const body = email.html || `<div style="white-space:pre-wrap;">${email.text}</div>`;

        return `
           <div class="email-viewer-container">
               <div class="email-viewer-header">
                   <div class="viewer-top-bar">
                       <button id="backToInboxBtn" class="btn-text-action">
                           <i class="fas fa-arrow-left"></i> Back
                       </button>
                       <div style="display:flex; gap:8px;">
                           <button class="btn-email-tool" style="width:32px; height:32px;"><i class="fas fa-reply"></i></button>
                           <button class="btn-email-tool" style="width:32px; height:32px;"><i class="fas fa-reply-all"></i></button>
                           <button class="btn-email-tool delete-email-btn" data-email-id="${email.id}" style="width:32px; height:32px; color:#f85149;"><i class="fas fa-trash"></i></button>
                       </div>
                   </div>
                   <div class="viewer-meta">
                       <h2 class="viewer-subject">${email.subject}</h2>
                       <div class="viewer-sender-row">
                           <div class="sender-info">
                               <div class="sender-avatar">${name.charAt(0).toUpperCase()}</div>
                               <div>
                                   <div style="color:#fff; font-weight:600; font-size:14px;">${name}</div>
                                   <div style="color:#8b949e; font-size:12px;">&lt;${address}&gt;</div>
                               </div>
                           </div>
                           <div style="color:#6b7280; font-size:12px;">${date}</div>
                       </div>
                   </div>
               </div>
               <div class="email-reading-pane">
                   <div class="email-body-content">
                       ${body}
                   </div>
               </div>
           </div>
        `;
    }

    // --- LOGIC (Unchanged) ---

    async fetchEmails(options = {}) {
        if (this.isLoading) return;
        this.isLoading = true;

        const { unreadOnly = this.unreadOnly, query = this.query, isLoadMore = false } = options;

        if (!isLoadMore) {
            this.offset = 0;
            this.unreadOnly = unreadOnly;
            this.query = query || null;
            const list = document.getElementById('emailList');
            if (list && !query) list.innerHTML = '<div style="padding:40px; text-align:center; color:#6b7280;">Loading...</div>';
        }

        const refreshBtn = document.getElementById('refreshEmailBtn');
        if (refreshBtn) refreshBtn.querySelector('i').classList.add('fa-spin');

        try {
            let url = `/api/email/list?limit=${this.limit}&offset=${this.offset}`;
            if (unreadOnly) url += '&unreadOnly=true';
            if (query) url = `/api/email/search?q=${encodeURIComponent(query)}`;

            const res = await fetch(url);
            const data = await res.json();

            if (data.success) {
                if (isLoadMore) this.emails = [...this.emails, ...data.emails];
                else this.emails = data.emails;

                this.renderEmailList();

                const loadMoreContainer = document.getElementById('loadMoreContainer');
                if (!query && data.emails.length === this.limit) {
                    loadMoreContainer.style.display = 'block';
                } else {
                    loadMoreContainer.style.display = 'none';
                }
            }
        } catch (err) {
            console.error(err);
        } finally {
            this.isLoading = false;
            if (refreshBtn) refreshBtn.querySelector('i').classList.remove('fa-spin');
        }
    }

    loadMore = async () => {
        this.offset += this.limit;
        document.getElementById('loadMoreBtn').textContent = 'Loading...';
        await this.fetchEmails({ isLoadMore: true });
        document.getElementById('loadMoreBtn').textContent = 'Load More';
    };

    renderEmailList() {
        const list = document.getElementById('emailList');
        if (!list) return;
        if (!this.emails.length) {
            list.innerHTML = `<div style="padding:40px; text-align:center; color:#8b949e;">📭 No emails found</div>`;
            return;
        }
        list.innerHTML = this.emails.map(e => this.getEmailItemHTML(e)).join('');
        this.attachEmailItemListeners();
    }

    async selectEmail(id) {
        const email = this.emails.find(e => e.id == id);
        if (email) {
            this.selectedEmail = email;
            if (email.isUnread) this.markAsRead(id);
            
            const viewer = document.getElementById('emailViewerContainer');
            const list = document.getElementById('emailListContainer');
            
            viewer.innerHTML = this.renderEmailViewer();
            list.style.display = 'none';
            viewer.style.display = 'flex';
            
            this.attachViewerEventListeners();
        }
    }

    showInbox() {
        document.getElementById('emailViewerContainer').style.display = 'none';
        document.getElementById('emailListContainer').style.display = 'flex';
        this.selectedEmail = null;
    }

    attachEventListeners() {
        const refresh = document.getElementById('refreshEmailBtn');
        if (refresh) refresh.onclick = () => this.fetchEmails();

        const unread = document.getElementById('unreadOnlyBtn');
        if (unread) unread.onclick = () => {
            unread.classList.toggle('active');
            this.fetchEmails({ unreadOnly: unread.classList.contains('active') });
        };

        const compose = document.getElementById('composeEmailBtn');
        const modal = document.getElementById('composeModal');
        const close = document.getElementById('closeComposeBtn');
        if (compose) compose.onclick = () => { modal.style.display = 'flex'; };
        if (close) close.onclick = () => { modal.style.display = 'none'; };

        const search = document.getElementById('emailSearchInput');
        if (search) search.oninput = (e) => {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => this.fetchEmails({ query: e.target.value }), 600);
        };

        const loadMore = document.getElementById('loadMoreBtn');
        if (loadMore) loadMore.onclick = this.loadMore;
    }

    attachEmailItemListeners() {
        document.querySelectorAll('.email-item').forEach(el => 
            el.onclick = () => this.selectEmail(el.dataset.emailId));
    }

    attachViewerEventListeners() {
        document.getElementById('backToInboxBtn').onclick = () => this.showInbox();
        document.querySelectorAll('.delete-email-btn').forEach(btn => 
            btn.onclick = () => this.deleteEmail(btn.dataset.emailId));
    }

    getSenderInfo(email) {
        let name = 'Unknown', address = '';
        if (email.from) {
            const raw = email.from.value || email.from;
            const first = Array.isArray(raw) ? raw[0] : raw;
            if (first) { name = first.name || first.email || 'Unknown'; address = first.email || ''; }
            else if (typeof raw === 'string') name = raw;
        }
        return { name: name.replace(/\"/g, ''), address };
    }

    async markAsRead(id) {
        try { await fetch(`/api/email/${id}/mark-read`, { method: 'POST' }); } catch(e){}
        const email = this.emails.find(e => e.id == id);
        if(email) email.isUnread = false;
        const el = document.querySelector(`.email-item[data-email-id=\"${id}\"]`);
        if(el) el.classList.remove('unread');
    }

    async deleteEmail(id) {
        if (!confirm('Delete?')) return;
        this.emails = this.emails.filter(e => e.id != id);
        this.showInbox();
        this.renderEmailList();
        try { await fetch(`/api/email/${id}`, { method: 'DELETE' }); } catch(e){}
    }

    formatDate(date) {
        const now = new Date();
        if (now.toDateString() === date.toDateString()) {
            return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        }
        if (now.getFullYear() === date.getFullYear()) {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
        return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    }
}
