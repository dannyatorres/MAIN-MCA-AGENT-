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

        // Server handles badges now - no localStorage

        // Paging & UI State
        this.searchTimeout = null;
        this.pageSize = 50;
        this.paginationOffset = 0;
        this.hasMoreConversations = true;
        this.isLoadingMore = false;

        this.init();
    }

    // ============================================================
    // 1. STATE MANAGEMENT (Server-side unread tracking)
    // ============================================================

    // Call this when a socket event comes in
    incrementBadge(conversationId) {
        if (!conversationId) return;
        const id = String(conversationId);

        // If currently viewing this chat, do NOTHING
        if (String(this.currentConversationId) === id && !document.hidden) {
            return;
        }

        // Update local cache
        const conv = this.conversations.get(id);
        if (conv) {
            conv.unread_count = (conv.unread_count || 0) + 1;
            this.conversations.set(id, conv);
        }

        // Update UI immediately
        this.updateBadgeUI(id, conv?.unread_count || 1);
    }

    // Call this when user clicks a conversation
    async clearBadge(conversationId) {
        const id = String(conversationId);

        // Update local cache
        const conv = this.conversations.get(id);
        if (conv) {
            conv.unread_count = 0;
            this.conversations.set(id, conv);
        }

        // Update UI
        const item = document.querySelector(`.conversation-item[data-conversation-id="${id}"]`);
        if (item) {
            item.classList.remove('unread');
            const badge = item.querySelector('.conversation-badge');
            if (badge) badge.remove();
        }

        // Tell server (fire and forget)
        try {
            await this.parent.apiCall(`/api/conversations/${id}/mark-read`, { method: 'POST' });
        } catch (e) {
            console.error('Failed to mark read:', e);
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
            // GET SEARCH TERM
            const searchTerm = document.getElementById('searchInput')?.value.trim() || '';

            if (reset) {
                this.conversations.clear();
                this.paginationOffset = 0;
                this.hasMoreConversations = true;
            }

            if (!this.hasMoreConversations) {
                this.isLoadingMore = false;
                return;
            }

            const stateFilter = document.getElementById('stateFilter')?.value || '';

            // BUILD URL WITH SEARCH PARAM
            let url = `/api/conversations?limit=${this.pageSize}&offset=${this.paginationOffset}`;
            if (stateFilter) url += `&filter=${encodeURIComponent(stateFilter)}`;
            if (searchTerm)  url += `&search=${encodeURIComponent(searchTerm)}`;

            const conversations = await this.parent.apiCall(url);

            if (conversations.length < this.pageSize) this.hasMoreConversations = false;
            this.paginationOffset += conversations.length;

            conversations.forEach(conv => {
                this.conversations.set(conv.id, conv);
            });

            // RENDER WITHOUT LOCAL FILTERING
            // We pass 'true' to tell the renderer "The server already filtered this"
            this.renderConversationsList(!!searchTerm);

        } catch (error) {
            console.error('Error in loadConversations:', error);
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

        // Reset Tabs/Buttons (direct class manipulation - no DOM thrashing from .click())
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector('.tab-btn[data-tab="ai-assistant"]')?.classList.add('active');
        document.getElementById('backHomeBtn')?.classList.remove('hidden');
        document.getElementById('conversationActions')?.classList.remove('hidden');
        document.getElementById('messageInputContainer')?.classList.remove('hidden');
        this.updateConversationSelection();

        // 3. Fetch Data
        try {
            const cachedConv = this.conversations.get(conversationId);

            // INSTANT: Use cache immediately if available
            if (cachedConv) {
                this.selectedConversation = cachedConv;
                if (this.parent) this.parent.selectedConversation = cachedConv;
                this.showConversationDetails();

                // Load intelligence with cached data (instant)
                if (this.parent.intelligence) {
                    this.parent.intelligence.loadConversationIntelligence(conversationId, cachedConv);
                }
            }

            // PARALLEL: Fire all requests without waiting
            const dataPromise = this.parent.apiCall(`/api/conversations/${conversationId}`);

            if (this.parent.messaging) {
                this.parent.messaging.loadConversationMessages(conversationId); // Don't await
            }
            if (this.parent.documents) {
                this.parent.documents.loadDocuments(); // Don't await
            }

            // BACKGROUND: Update with fresh data when ready
            const data = await dataPromise;
            if (this.currentConversationId !== conversationId) return; // Stale check

            const freshConv = data.conversation || data;
            this.selectedConversation = freshConv;
            this.conversations.set(conversationId, freshConv);
            if (this.parent) this.parent.selectedConversation = freshConv;

            // Only re-render if data actually changed
            this.showConversationDetails();

            // Refresh intelligence with fresh data (silent update)
            if (this.parent.intelligence) {
                this.parent.intelligence.loadConversationIntelligence(conversationId, freshConv);
            }

        } catch (error) {
            console.error('Error selecting conversation:', error);
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

    renderConversationsList(isServerSearch = false) {
        const container = document.getElementById('conversationsList');
        if (!container) return;

        const conversations = Array.from(this.conversations.values());

        // --- Filters ---
        let visible = conversations;

        // ONLY filter locally if we didn't just run a server search
        // This prevents the "Invisible Data" bug
        if (!isServerSearch) {
            const searchTerm = document.getElementById('searchInput')?.value.trim().toLowerCase();
            const stateFilter = document.getElementById('stateFilter')?.value;

            if (stateFilter) {
                if (stateFilter === 'INTERESTED') {
                    visible = visible.filter(c => c.has_response);
                } else if (stateFilter === 'UNREAD') {
                    visible = visible.filter(c => c.unread_count > 0);
                } else {
                    visible = visible.filter(c => c.current_step === stateFilter);
                }
            }

            // Basic fallback local search (only runs if server search wasn't triggered)
            if (searchTerm && searchTerm.length >= 2) {
                visible = visible.filter(c =>
                    (c.business_name || '').toLowerCase().includes(searchTerm) ||
                    (c.lead_phone || '').includes(searchTerm) ||
                    (c.first_name || '').toLowerCase().includes(searchTerm)
                );
            }
        }

        // --- Sort by activity (Newest first) ---
        visible.sort((a, b) => new Date(b.last_activity || 0) - new Date(a.last_activity || 0));

        // --- Render ---
        if (visible.length === 0) {
            container.innerHTML = `<div class="empty-state"><h3>No matches found</h3></div>`;
            return;
        }

        let html = visible.map(conv => this.generateConversationHTML(conv)).join('');

        if (this.hasMoreConversations) {
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

        // Get unread count from server-provided data
        const unread = conv.unread_count || 0;

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
        let conv = this.conversations.get(conversationId);

        if (!conv) {
            try {
                const data = await this.parent.apiCall(`/api/conversations/${conversationId}`);
                if (data && (data.conversation || data)) {
                    conv = data.conversation || data;
                    this.conversations.set(conversationId, conv);
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
        this.conversations.set(conversationId, conv);

        // Update sidebar DOM
        const item = document.querySelector(`.conversation-item[data-conversation-id="${conversationId}"]`);
        const list = document.getElementById('conversationsList');

        if (item && list) {
            // Item exists in current view - update and move to top
            const preview = item.querySelector('.message-preview');
            const time = item.querySelector('.conversation-time');
            if (preview) preview.textContent = conv.last_message;
            if (time) time.textContent = 'Just now';
            list.prepend(item);
        } else if (list) {
            // Item not in current view - only add if it matches current filter
            const searchTerm = document.getElementById('searchInput')?.value.trim();
            const stateFilter = document.getElementById('stateFilter')?.value;

            // Don't add if search is active
            if (searchTerm) return;

            // Don't add if filter is active and conversation doesn't match
            if (stateFilter) {
                if (stateFilter === 'INTERESTED' && !conv.has_response) return;
                if (stateFilter === 'UNREAD' && !conv.unread_count) return;
                if (stateFilter !== 'INTERESTED' && stateFilter !== 'UNREAD' && conv.current_step !== stateFilter) return;
            }

            // Matches filter (or no filter) - add to list
            const html = this.generateConversationHTML(conv);
            list.insertAdjacentHTML('afterbegin', html);
        }
    }

    filterConversations() {
        this.loadConversations(true);  // Reset and reload with new filter
    }

    refreshData() {
        if (this.wsManager?.refreshData) this.wsManager.refreshData();
        this.loadConversations(true);
    }

    // Handle real-time conversation updates (new leads, offers, etc.)
    // Single source of truth - prevents duplicate DOM entries
    async handleConversationUpdate(conversationId) {
        if (!conversationId) return;

        try {
            // 1. Fetch the latest data for this specific conversation
            const data = await this.parent.apiCall(`/api/conversations/${conversationId}`);
            const freshConv = data.conversation || data;

            if (!freshConv || !freshConv.id) return;

            // 2. Update the Source of Truth (The Map)
            // This overwrites the existing entry if present, preventing duplicates
            freshConv.last_activity = new Date().toISOString(); // Ensure it sorts to top
            this.conversations.set(freshConv.id, freshConv);

            // 3. Re-render the list (auto-sorts by last_activity)
            this.renderConversationsList();

            // 4. Flash the row to indicate an update
            setTimeout(() => {
                const row = document.querySelector(`.conversation-item[data-conversation-id="${freshConv.id}"]`);
                if (row) {
                    row.style.transition = "background-color 0.5s ease";
                    row.style.backgroundColor = "rgba(0, 255, 136, 0.2)";
                    setTimeout(() => {
                        row.style.backgroundColor = "";
                    }, 1000);
                }
            }, 50);

        } catch (error) {
            console.error('Failed to handle conversation update:', error);
            // Fallback: full reload
            this.loadConversations(true);
        }
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

        // D. Preload on Hover (prefetch data before click)
        mainContainer.addEventListener('mouseenter', (e) => {
            const item = e.target.closest('.conversation-item');
            if (!item) return;

            const id = item.dataset.conversationId;
            const cached = this.conversations.get(id);

            // Prefetch if not fully loaded yet
            if (!cached || !cached._fullLoaded) {
                this.parent.apiCall(`/api/conversations/${id}`).then(data => {
                    const conv = data.conversation || data;
                    conv._fullLoaded = true;
                    this.conversations.set(id, conv);
                }).catch(() => {}); // Silently fail
            }
        }, true); // Use capture for delegation

        // Filters & Search
        const stateFilter = document.getElementById('stateFilter');
        if (stateFilter) stateFilter.addEventListener('change', () => this.filterConversations());

        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    // CRITICAL: Force a server reload with reset=true
                    this.loadConversations(true);
                }, 600); // 600ms delay to wait for you to finish typing
            });

            // Handle "X" button in search field
            searchInput.addEventListener('search', (e) => {
                if (e.target.value === '') this.loadConversations(true);
            });
        }

        // Global Buttons
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshData());

        const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
        if (deleteSelectedBtn) deleteSelectedBtn.addEventListener('click', () => this.confirmDeleteSelected());
    }
}
