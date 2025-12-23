// conversation-core.js - Centralized State Management (The "Real App" Fix)

class ConversationCore {
    constructor(parent, wsManager) {
        this.parent = parent;
        this.wsManager = wsManager;
        this.apiBaseUrl = parent.apiBaseUrl;
        this.utils = parent.utils;
        this.templates = parent.templates;

        // Core Data Stores
        this.conversations = new Map();
        this.currentConversationId = null;
        this.selectedConversation = null;
        this.selectedForDeletion = new Set();

        // STATE SOURCE OF TRUTH: Load from storage immediately
        this.unreadCounts = this._loadBadgesFromStorage();
        console.log('📦 Initialized with persistent badges:', Object.fromEntries(this.unreadCounts));

        // Paging & UI State
        this.searchTimeout = null;
        this.pageSize = 50;
        this.paginationOffset = 0;
        this.hasMoreConversations = true;
        this.isLoadingMore = false;

        this.init();
    }

    // ============================================================
    // 1. STATE MANAGEMENT (The "Real App" Logic)
    // ============================================================

    _loadBadgesFromStorage() {
        try {
            const stored = localStorage.getItem('mca_unread_badges');
            if (stored) {
                const obj = JSON.parse(stored);
                // Convert to Map, ensuring keys are Strings for consistency
                return new Map(Object.entries(obj));
            }
        } catch (e) { console.error('Error loading badges', e); }
        return new Map();
    }

    _saveBadgesToStorage() {
        try {
            const obj = Object.fromEntries(this.unreadCounts);
            localStorage.setItem('mca_unread_badges', JSON.stringify(obj));
        } catch (e) { console.error('Error saving badges', e); }
    }

    // Call this when a socket event comes in
    incrementBadge(conversationId) {
        const id = String(conversationId);

        // 1. If currently viewing this chat, do NOTHING (it's read instantly)
        if (String(this.currentConversationId) === id && !document.hidden) {
            return;
        }

        // 2. Otherwise, increment local count
        const current = this.unreadCounts.get(id) || 0;
        const newCount = current + 1;
        this.unreadCounts.set(id, newCount);
        this._saveBadgesToStorage();

        // 3. Update UI immediately
        this.updateBadgeUI(id, newCount);

        // 4. Also update the data model if it exists
        if (this.conversations.has(Number(id))) {
            const conv = this.conversations.get(Number(id));
            conv.unread_count = newCount;
            this.conversations.set(Number(id), conv);
        }
    }

    // Call this when user clicks a conversation
    clearBadge(conversationId) {
        const id = String(conversationId);
        if (this.unreadCounts.has(id)) {
            this.unreadCounts.delete(id);
            this._saveBadgesToStorage();

            // Remove from UI immediately
            const item = document.querySelector(`.conversation-item[data-conversation-id="${id}"]`);
            if (item) {
                item.classList.remove('unread');
                const badge = item.querySelector('.conversation-badge');
                if (badge) badge.remove();
            }
        }
    }

    updateBadgeUI(conversationId, count) {
        const item = document.querySelector(`.conversation-item[data-conversation-id="${conversationId}"]`);
        if (!item) return;

        item.classList.add('unread');
        let badge = item.querySelector('.conversation-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'conversation-badge';
            item.appendChild(badge);
        }
        badge.textContent = count;
    }

    // ============================================================
    // 2. DATA LOADING
    // ============================================================

    init() {
        this.setupEventListeners();
        this.loadInitialData();
    }

    async loadInitialData() {
        try {
            console.log('Loading initial data...');
            this.utils.showLoading();
            await this.loadConversations(true);
        } catch (error) {
            this.utils.handleError(error, 'Error loading initial data');
        } finally {
            this.utils.hideLoading();
        }
    }

    async loadConversations(reset = false) {
        if (this.isLoadingMore) return;
        this.isLoadingMore = true;

        try {
            if (reset) {
                this.paginationOffset = 0;
                this.hasMoreConversations = true;
                // NOTE: Don't clear conversations yet - fetch first to prevent data loss
            }

            if (!this.hasMoreConversations) {
                this.isLoadingMore = false;
                return;
            }

            const url = `/api/conversations?limit=${this.pageSize}&offset=${this.paginationOffset}`;
            const conversations = await this.parent.apiCall(url);

            // DATA LOSS FIX: Only clear AFTER successful fetch
            if (reset) {
                this.conversations.clear();
            }

            if (conversations.length < this.pageSize) this.hasMoreConversations = false;
            this.paginationOffset += conversations.length;

            conversations.forEach(conv => {
                const idStr = String(conv.id);

                // BADGE SYNC: Server is source of truth for read/unread state
                // LocalStorage is only for optimistic updates between page loads
                const apiCount = conv.unread_count || 0;
                const localCount = this.unreadCounts.get(idStr) || 0;

                // Server says unread -> trust server
                if (apiCount > 0) {
                    this.unreadCounts.set(idStr, apiCount);
                    conv.unread_count = apiCount;
                }
                // Server says 0 AND we have local -> clear local (read on another device)
                else if (localCount > 0) {
                    // STICKY BADGE FIX: Trust server when it explicitly returns 0
                    // User may have read on another device/tab
                    this.unreadCounts.delete(idStr);
                    conv.unread_count = 0;
                }

                this.conversations.set(conv.id, conv);
            });

            this._saveBadgesToStorage();
            this.renderConversationsList();

        } catch (error) {
            console.error('Error in loadConversations:', error);
            // DATA LOSS FIX: On error, existing data is preserved (not cleared)
        } finally {
            this.isLoadingMore = false;
        }
    }

    // ============================================================
    // 3. SELECTION & UI
    // ============================================================

    async selectConversation(conversationId) {
        if (this.currentConversationId === conversationId) return;

        // 1. Clear badge immediately (Optimistic UI)
        this.clearBadge(conversationId);

        this.currentConversationId = conversationId;
        if (this.parent) this.parent.currentConversationId = conversationId;

        // 2. Prepare UI
        const msgContainer = document.getElementById('messagesContainer');
        if (msgContainer) {
            msgContainer.innerHTML = `<div class="loading-state-chat"><div class="loading-spinner"></div></div>`;
        }

        // Reset Tabs/Buttons
        document.querySelectorAll('.tab-btn[data-tab="ai-assistant"]').forEach(btn => btn.click());
        document.getElementById('backHomeBtn')?.classList.remove('hidden');
        document.getElementById('conversationActions')?.classList.remove('hidden');
        document.getElementById('messageInputContainer')?.classList.remove('hidden');
        this.updateConversationSelection();

        // 3. Fetch Data
        try {
            // Check cache for header info first
            const cachedConv = this.conversations.get(Number(conversationId));
            if (cachedConv) {
                this.selectedConversation = cachedConv;
                this.showConversationDetails();
            }

            // Parallel fetch
            const dataPromise = this.parent.apiCall(`/api/conversations/${conversationId}`);
            const msgPromise = this.parent.messaging ?
                this.parent.messaging.loadConversationMessages(conversationId) : Promise.resolve();
            const toolsPromise = Promise.allSettled([
                this.parent.intelligence ? this.parent.intelligence.loadConversationIntelligence(conversationId, cachedConv) : Promise.resolve(),
                this.parent.documents ? this.parent.documents.loadDocuments() : Promise.resolve()
            ]);

            const data = await dataPromise;
            if (this.currentConversationId !== conversationId) return;

            this.selectedConversation = data.conversation || data;
            this.conversations.set(Number(conversationId), this.selectedConversation);
            this.showConversationDetails();

            await msgPromise;

        } catch (error) {
            console.error('Error selecting conversation:', error);
            const inputContainer = document.getElementById('messageInputContainer');
            if (inputContainer) inputContainer.classList.remove('hidden');
        }
    }

    showConversationDetails() {
        if (!this.selectedConversation) return;
        const c = this.selectedConversation;

        // Build safer owner/merchant display with fallbacks
        const ownerFirst = (c.owner_first_name || c.first_name || c.contact_name || '').trim();
        const ownerLast = (c.owner_last_name || c.last_name || '').trim();
        let ownerDisplay = [ownerFirst, ownerLast].filter(Boolean).join(' ');
        if (!ownerDisplay) {
            ownerDisplay = c.owner_name || c.business_name || c.company_name || 'Unknown Merchant';
        }

        const businessDisplay = c.business_name || c.company_name || 'Unknown Business';

        // Delegate to Global Header Renderer
        if (window.updateChatHeader) {
            window.updateChatHeader(
                businessDisplay,
                ownerDisplay,
                c.lead_phone || c.phone,
                c.id
            );
        }
    }

    // ============================================================
    // 4. RENDERING
    // ============================================================

    renderConversationsList() {
        const container = document.getElementById('conversationsList');
        if (!container) return;

        const conversations = Array.from(this.conversations.values());

        // --- Filters ---
        const searchTerm = document.getElementById('searchInput')?.value.trim().toLowerCase();
        const stateFilter = document.getElementById('stateFilter')?.value;

        let visible = conversations;
        if (stateFilter) visible = visible.filter(c => c.state === stateFilter);
        if (searchTerm && searchTerm.length >= 2) {
            visible = visible.filter(c =>
                (c.business_name || '').toLowerCase().includes(searchTerm) ||
                (c.lead_phone || '').includes(searchTerm) ||
                (c.first_name || '').toLowerCase().includes(searchTerm)
            );
        }

        // --- Sort by activity (Newest first) ---
        visible.sort((a, b) => new Date(b.last_activity || 0) - new Date(a.last_activity || 0));

        // --- Render ---
        if (visible.length === 0) {
            container.innerHTML = `<div class="empty-state"><h3>No matches found</h3></div>`;
            return;
        }

        let html = visible.map(conv => this.generateConversationHTML(conv)).join('');

        if (this.hasMoreConversations && !searchTerm) {
            html += `<div class="list-limit-message"><button class="btn-load-more" id="loadMoreBtn">Load More Leads</button></div>`;
        }

        container.innerHTML = html;
        this.updateConversationSelection();
        this.updateDeleteButtonVisibility();
    }

    generateConversationHTML(conv) {
        const timeSince = (d) => {
            if(!d) return '';
            const s = Math.floor((new Date() - new Date(d)) / 1000);
            if(s < 60) return 'Just now';
            if(s < 3600) return Math.floor(s/60) + 'm ago';
            if(s < 86400) return Math.floor(s/3600) + 'h ago';
            return Math.floor(s/86400) + 'd ago';
        };

        const formatPhone = (phone) => {
            if (!phone) return 'No Phone';
            const cleaned = ('' + phone).replace(/\D/g, '');
            const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
            return match ? `(${match[1]}) ${match[2]}-${match[3]}` : phone;
        };

        const initials = (conv.business_name || 'U').substring(0,2).toUpperCase();
        const isSelected = String(this.currentConversationId) === String(conv.id) ? 'selected' : '';
        const isChecked = this.selectedForDeletion.has(conv.id) ? 'checked' : '';

        // TRUTH CHECK: Get unread from our robust map
        const unread = this.unreadCounts.get(String(conv.id)) || 0;

        let offerBadge = conv.has_offer ? `<span class="offer-badge-small">OFFER</span>` : '';
        let displayCid = conv.display_id || String(conv.id).slice(-6);

        return `
            <div class="conversation-item ${isSelected} ${unread > 0 ? 'unread' : ''}" data-conversation-id="${conv.id}">
                <div class="conversation-avatar"><div class="avatar-circle">${initials}</div></div>
                <div class="conversation-content">
                    <div class="conversation-header">
                        <div class="business-name">${conv.business_name || 'Unknown'}${offerBadge}</div>
                        <div class="conversation-time">${timeSince(conv.last_activity)}</div>
                    </div>
                    <div class="message-preview-row">
                         <span class="message-preview">${conv.last_message || 'No messages yet'}</span>
                    </div>
                    <div class="conversation-meta">
                        <span class="phone-number">${formatPhone(conv.lead_phone)}</span>
                        <span class="cid-tag">CID# ${displayCid}</span>
                    </div>
                </div>
                <div class="conversation-checkbox">
                    <input type="checkbox" class="delete-checkbox" data-conversation-id="${conv.id}" ${isChecked}>
                </div>
                ${unread > 0 ? `<div class="conversation-badge">${unread}</div>` : ''}
            </div>
        `;
    }

    updateConversationSelection() {
        document.querySelectorAll('.conversation-item').forEach(el => {
            el.classList.toggle('selected', el.dataset.conversationId === String(this.currentConversationId));
        });
    }

    // ============================================================
    // 5. CONVERSATION UPDATES (Preview, etc.)
    // ============================================================

    async updateConversationPreview(conversationId, message) {
        let conv = this.conversations.get(Number(conversationId));

        if (!conv) {
            try {
                const data = await this.parent.apiCall(`/api/conversations/${conversationId}`);
                if (data && (data.conversation || data)) {
                    conv = data.conversation || data;
                    this.conversations.set(Number(conversationId), conv);
                } else {
                    return;
                }
            } catch (e) {
                console.error("Error fetching missing conversation:", e);
                return;
            }
        }

        // Update data
        conv.last_message = message.content || (message.media_url ? '📷 Photo' : 'New Message');
        conv.last_activity = new Date().toISOString();
        this.conversations.set(Number(conversationId), conv);

        // Update sidebar DOM
        const item = document.querySelector(`.conversation-item[data-conversation-id="${conversationId}"]`);
        const list = document.getElementById('conversationsList');

        if (item && list) {
            const preview = item.querySelector('.message-preview');
            const time = item.querySelector('.conversation-time');
            if (preview) preview.textContent = conv.last_message;
            if (time) time.textContent = 'Just now';
            list.prepend(item); // Move to top
        } else if (list && !document.getElementById('searchInput')?.value.trim()) {
            const html = this.generateConversationHTML(conv);
            list.insertAdjacentHTML('afterbegin', html);
        }
    }

    filterConversations() {
        this.renderConversationsList();
    }

    refreshData() {
        if (this.wsManager?.refreshData) this.wsManager.refreshData();
        this.loadConversations(true);
    }

    // ============================================================
    // 6. DELETION
    // ============================================================

    toggleDeleteSelection(id) {
        if (this.selectedForDeletion.has(id)) this.selectedForDeletion.delete(id);
        else this.selectedForDeletion.add(id);

        const cb = document.querySelector(`.delete-checkbox[data-conversation-id="${id}"]`);
        if(cb) cb.checked = this.selectedForDeletion.has(id);

        this.updateDeleteButtonVisibility();
    }

    clearDeleteSelection() {
        this.selectedForDeletion.clear();
        document.querySelectorAll('.delete-checkbox').forEach(cb => cb.checked = false);
        this.updateDeleteButtonVisibility();
    }

    updateDeleteButtonVisibility() {
        const btn = document.getElementById('deleteSelectedBtn');
        if (!btn) return;

        const count = this.selectedForDeletion.size;
        btn.classList.toggle('hidden', count === 0);
        if (count > 0) btn.textContent = `Delete ${count} Lead${count > 1 ? 's' : ''}`;
    }

    async confirmDeleteSelected() {
        if (this.selectedForDeletion.size === 0) return;
        if (confirm(`Delete ${this.selectedForDeletion.size} leads?`)) {
            const ids = Array.from(this.selectedForDeletion);
            try {
                await this.parent.apiCall('/api/conversations/bulk-delete', {
                    method: 'POST', body: JSON.stringify({ conversationIds: ids })
                });

                ids.forEach(id => this.conversations.delete(id));
                this.selectedForDeletion.clear();

                if (ids.includes(this.currentConversationId)) {
                    this.clearConversationDetails();
                }

                this.renderConversationsList();
                this.utils.showNotification('Leads deleted', 'success');
                if (window.toggleDeleteMode) window.toggleDeleteMode();

            } catch (error) {
                console.error(error);
                this.utils.showNotification('Delete failed', 'error');
            }
        }
    }

    clearConversationDetails() {
        this.currentConversationId = null;
        this.selectedConversation = null;
        if (this.parent) {
            this.parent.currentConversationId = null;
            this.parent.selectedConversation = null;
        }
        if (window.loadDashboard) window.loadDashboard();
    }

    // ============================================================
    // 7. EVENT LISTENERS
    // ============================================================

    setupEventListeners() {
        const mainContainer = document.getElementById('main-content') || document.body;

        mainContainer.addEventListener('click', (e) => {
            const listContainer = e.target.closest('#conversationsList');
            if (!listContainer) return;

            // A. Handle Delete Checkbox
            const checkboxWrapper = e.target.closest('.conversation-checkbox');
            const realInput = e.target.closest('.delete-checkbox');

            if (realInput || (checkboxWrapper && !e.target.closest('.conversation-item'))) {
                e.stopPropagation();
                const id = realInput ? realInput.dataset.conversationId :
                           checkboxWrapper.querySelector('.delete-checkbox')?.dataset.conversationId;
                if (id) this.toggleDeleteSelection(id);
                return;
            }

            // B. Handle Conversation Selection
            const item = e.target.closest('.conversation-item');
            if (item && !e.target.closest('button') && !e.target.closest('input') && !e.target.closest('.delete-checkbox')) {
                this.selectConversation(item.dataset.conversationId);
            }

            // C. Handle "Load More"
            if (e.target.id === 'loadMoreBtn') {
                this.loadConversations(false);
            }
        });

        // Filters & Search
        const stateFilter = document.getElementById('stateFilter');
        if (stateFilter) stateFilter.addEventListener('change', () => this.filterConversations());

        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.renderConversationsList();
                }, 300);
            });
            searchInput.addEventListener('search', (e) => {
                if (e.target.value === '') this.renderConversationsList();
            });
        }

        // Global Buttons
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshData());

        const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
        if (deleteSelectedBtn) deleteSelectedBtn.addEventListener('click', () => this.confirmDeleteSelected());
    }
}
