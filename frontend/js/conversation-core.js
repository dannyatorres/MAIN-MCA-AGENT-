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
        if (String(this.currentConversationId) === id) {
            return;
        }

        // Update local cache
        const conv = this.conversations.get(id);
        if (conv) {
            conv.unread_count = parseInt(conv.unread_count || 0, 10) + 1;
            this.conversations.set(id, conv);
        }

        // Update UI immediately
        this.updateBadgeUI(id, conv?.unread_count || 1);
    }

    // Call this when user clicks a conversation
    async clearBadge(conversationId) {
        console.trace('clearBadge called');
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

    async clearOfferBadge(conversationId) {
        const id = String(conversationId);

        const conv = this.conversations.get(id);
        if (conv && conv.has_offer) {
            conv.has_offer = false;
            this.conversations.set(id, conv);

            const item = document.querySelector(`.conversation-item[data-conversation-id="${id}"]`);
            if (item) {
                item.classList.remove('has-offer');
                const badge = item.querySelector('.offer-badge-small');
                if (badge) badge.remove();
            }

            try {
                await this.parent.apiCall(`/api/conversations/${id}/clear-offer`, { method: 'POST' });
            } catch (e) {
                console.error('Failed to clear offer:', e);
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
        // Allow filter changes to interrupt loading
        if (this.isLoadingMore && !reset) return;

        // Cancel any pending request
        if (this.currentLoadRequest) {
            this.currentLoadRequest.cancelled = true;
        }

        const thisRequest = { cancelled: false };
        this.currentLoadRequest = thisRequest;
        this.isLoadingMore = true;

        try {
            const searchTerm = document.getElementById('searchInput')?.value.trim() || '';
            const stateFilter = document.getElementById('stateFilter')?.value || '';

            if (reset) {
                this.conversations.clear();
                this.paginationOffset = 0;
                this.hasMoreConversations = true;
                this.clearDeleteSelection();
            }

            if (!this.hasMoreConversations && !reset) {
                this.isLoadingMore = false;
                return;
            }

            // BUILD URL - All filters are now server-side
            let url = `/api/conversations?limit=${this.pageSize}&offset=${this.paginationOffset}`;
            if (stateFilter) {
                url += `&filter=${encodeURIComponent(stateFilter)}`;
            }
            if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;

            if (window.DEBUG) DEBUG.log('filters', '🔍 LOAD', { reset, filter: stateFilter, search: searchTerm, offset: this.paginationOffset });

            const conversations = await this.parent.apiCall(url);

            // If this request was cancelled, ignore the results
            if (thisRequest.cancelled) {
                console.log('🛑 Request cancelled, ignoring stale results');
                this.isLoadingMore = false;
                return;
            }

            if (conversations.length < this.pageSize) this.hasMoreConversations = false;
            this.paginationOffset += conversations.length;

            conversations.forEach(conv => {
                const id = String(conv.id);
                const existing = this.conversations.get(id);

                if (existing && existing._fullLoaded) {
                    // Keep full data, just update dynamic fields
                    existing.unread_count = conv.unread_count;
                    existing.has_response = conv.has_response;
                    existing.last_message = conv.last_message;
                    existing.last_activity = conv.last_activity;
                    existing.has_offer = conv.has_offer;
                    existing.state = conv.state;
                } else {
                    conv._fullLoaded = false;
                    this.conversations.set(id, conv);
                }
            });

            this.renderConversationsList();

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
        console.trace('🔍 selectConversation called');
        console.log('🔍 selectConversation called from:', new Error().stack.split('\n')[2]);
        const convoId = String(conversationId);
        // Handle dialer view - minimize if call active, hide if not
        if (window.powerDialer) {
            window.powerDialer.allowConversationSwitch();
        }

        // Ensure dialer view is hidden (safety net)
        document.getElementById('dialerView')?.classList.add('hidden');
        if (this.currentConversationId === convoId) return;

        // 1. Clear badges immediately (Optimistic UI)
        this.clearBadge(convoId);
        this.clearOfferBadge(convoId);

        this.currentConversationId = convoId;
        if (this.parent) this.parent.currentConversationId = convoId;
        if (this.parent.wsManager?.joinConversation) {
            this.parent.wsManager.joinConversation(convoId);
        }

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
            const cachedConv = this.conversations.get(convoId);

            // INSTANT: Use cache immediately if available
            if (cachedConv) {
                this.selectedConversation = cachedConv;
                if (this.parent) this.parent.selectedConversation = cachedConv;
                this.showConversationDetails();

                // Load intelligence with cached data (instant)
                if (this.parent.intelligence) {
                    this.parent.intelligence.loadConversationIntelligence(convoId, cachedConv);
                }
            }

            // PARALLEL: Fire all requests without waiting
            const dataPromise = this.parent.apiCall(`/api/conversations/${convoId}`);

            if (this.parent.messaging) {
                this.parent.messaging.loadConversationMessages(convoId); // Don't await
            }
            if (this.parent.documents) {
                this.parent.documents.loadDocuments(); // Don't await
            }

            // BACKGROUND: Update with fresh data when ready
            const data = await dataPromise;
            const freshConv = data.conversation || data;

            if (freshConv) {
                // FIX: We just performed a full fetch, so mark it as fully loaded
                freshConv._fullLoaded = true;

                // FIX: If this is still the active conversation, force unread to 0
                if (String(freshConv.id) === String(this.currentConversationId)) {
                    freshConv.unread_count = 0;
                }

                this.conversations.set(convoId, freshConv);
            }

            if (this.currentConversationId !== convoId) return; // Stale check

            this.selectedConversation = freshConv;
            if (this.parent) this.parent.selectedConversation = freshConv;

            // Only re-render if data actually changed
            this.showConversationDetails();

            // Refresh intelligence with fresh data (silent update)
            if (this.parent.intelligence) {
                this.parent.intelligence.loadConversationIntelligence(convoId, freshConv);
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

    escapeHtml(unsafe) {
        if (unsafe == null) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // ============================================================
    // 4. RENDERING
    // ============================================================

    renderConversationsList() {
        const container = document.getElementById('conversationsList');
        if (!container) return;

        let visible = Array.from(this.conversations.values());

        // All filtering (UNREAD, INTERESTED, search) is now server-side
        // Just sort locally: Offers first, then unread, then by activity
        visible.sort((a, b) => {
            if (a.has_offer && !b.has_offer) return -1;
            if (!a.has_offer && b.has_offer) return 1;

            if ((a.unread_count > 0) && !(b.unread_count > 0)) return -1;
            if (!(a.unread_count > 0) && (b.unread_count > 0)) return 1;

            return new Date(b.last_activity || 0) - new Date(a.last_activity || 0);
        });

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
            // Normalize PostgreSQL timestamp format for JS Date parsing
            const dateStr = String(d)
                .replace(' ', 'T')
                .replace(/([+-]\d{2})$/, '$1:00');
            const serverDate = new Date(dateStr);
            const s = Math.floor((Date.now() - serverDate.getTime()) / 1000);
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

        // 1. DATA PREPARATION (Defense in Depth)
        const rawInitials = (conv.business_name || 'U').substring(0,2).toUpperCase();
        const safeInitials = this.escapeHtml(rawInitials);

        const safeName = this.escapeHtml(conv.business_name || 'Unknown');
        const safeMessage = this.escapeHtml(conv.last_message || 'No messages yet');
        const safePhone = this.escapeHtml(formatPhone(conv.lead_phone));

        const safeId = this.escapeHtml(conv.id);
        const safeCid = this.escapeHtml(conv.display_id || String(conv.id).slice(-6));

        const isSelected = String(this.currentConversationId) === String(conv.id) ? 'active' : '';
        const isChecked = this.selectedForDeletion.has(String(conv.id)) ? 'checked' : '';
        const unread = conv.unread_count || 0;

        let offerBadge = conv.has_offer ? `<span class="offer-badge-small">OFFER</span>` : '';

        return `
            <div class="conversation-item ${isSelected} ${unread > 0 ? 'unread' : ''} ${conv.has_offer ? 'has-offer' : ''}"
                 data-conversation-id="${safeId}">
                <div class="conversation-avatar"><div class="avatar-circle">${safeInitials}</div></div>
                <div class="conversation-content">
                    <div class="conversation-header">
                        <div class="business-name">${safeName}${offerBadge}</div>
                        <div class="conversation-time">${timeSince(conv.last_activity)}</div>
                    </div>
                    <div class="message-preview-row">
                         <span class="message-preview">${safeMessage}</span>
                    </div>
                    <div class="conversation-meta">
                        <span class="phone-number">${safePhone}</span>
                        <span class="cid-tag">CID# ${safeCid}</span>
                        ${conv.assigned_user_name ? `<span class="agent-tag">${this.escapeHtml(conv.assigned_agent_name || conv.assigned_user_name)}</span>` : ''}
                    </div>
                </div>
                <div class="conversation-checkbox">
                    <input type="checkbox" class="delete-checkbox" data-conversation-id="${safeId}" ${isChecked}>
                </div>
                ${unread > 0 ? `<div class="conversation-badge">${unread}</div>` : ''}
            </div>
        `;
    }

    updateConversationSelection() {
        document.querySelectorAll('.conversation-item').forEach(el => {
            el.classList.toggle('active', el.dataset.conversationId === String(this.currentConversationId));
        });
    }

    // ============================================================
    // 5. CONVERSATION UPDATES (Preview, etc.)
    // ============================================================

    async updateConversationPreview(conversationId, message) {
        const convoId = String(conversationId);
        let conv = this.conversations.get(convoId);

        if (!conv) {
            try {
                const data = await this.parent.apiCall(`/api/conversations/${convoId}`);
                const freshConv = data?.conversation || data;
                if (!freshConv?.id) return;
                conv = freshConv;
                this.conversations.set(convoId, conv);
            } catch (e) {
                console.error("Error fetching missing conversation:", e);
                return;
            }
        }

        // Update data
        conv.last_message = message.content || (message.media_url ? '📷 Photo' : 'New Message');
        conv.last_activity = new Date().toISOString();
        this.conversations.set(convoId, conv);

        // Re-render the list to keep ordering consistent
        this.renderConversationsList();
    }

    filterConversations() {
        DEBUG.log('filters', '🔄 FILTER CHANGE - triggering reload');
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
            const convoId = String(conversationId);
            const data = await this.parent.apiCall(`/api/conversations/${convoId}`);
            const freshConv = data.conversation || data;

            if (!freshConv || !freshConv.id) return;

            // 2. Check if this is a NEW conversation (for pagination offset fix)
            const existing = this.conversations.get(String(freshConv.id));
            const isNew = !existing;

            // 3. Update the Source of Truth (The Map)
            if (!freshConv.last_activity) {
                freshConv.last_activity = new Date().toISOString();
            }
            // Always set _fullLoaded = true since we fetched the full detail
            freshConv._fullLoaded = true;
            this.conversations.set(String(freshConv.id), freshConv);

            // 4. If this is a NEW conversation, increment pagination offset
            // This prevents duplicate items when user clicks "Load More"
            if (isNew) {
                this.paginationOffset++;
            }

            // 5. Re-render the list (auto-sorts by last_activity)
            this.renderConversationsList();

            // 6. Flash the row to indicate an update
            setTimeout(() => {
                const row = document.querySelector(`.conversation-item[data-conversation-id="${String(freshConv.id)}"]`);
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
        const isDeleteMode = document.body.classList.contains('delete-mode');

        // Show button if in delete mode, hide if not
        btn.classList.toggle('hidden', !isDeleteMode);

        // Update text and disabled state based on selection count
        if (count > 0) {
            btn.textContent = `Delete ${count} Lead${count > 1 ? 's' : ''}`;
            btn.disabled = false;
            btn.style.opacity = '1';
        } else {
            btn.textContent = 'Select Leads';
            btn.disabled = true;
            btn.style.opacity = '0.5';
        }
    }

    toggleDeleteMode(forceState = null) {
        const body = document.body;
        const toggleBtn = document.getElementById('toggleDeleteModeBtn');

        // 1. Determine if we are turning ON or OFF
        const isCurrentlyOn = body.classList.contains('delete-mode');
        const shouldBeOn = forceState !== null ? forceState : !isCurrentlyOn;

        if (shouldBeOn) {
            // --- TURN ON (RED MODE) ---
            body.classList.add('delete-mode');

            // Sync the Button Color using the correct CSS class
            if (toggleBtn) {
                toggleBtn.classList.add('active-danger');
                toggleBtn.classList.add('active');
            }

            // Force the Delete Button to show immediately
            this.updateDeleteButtonVisibility();

        } else {
            // --- TURN OFF (NORMAL MODE) ---
            body.classList.remove('delete-mode');

            // Force the Button back to White
            if (toggleBtn) {
                toggleBtn.classList.remove('active-danger');
                toggleBtn.classList.remove('active');
            }

            // Cleanup: Uncheck everything and hide the red button
            this.clearDeleteSelection();
            const deleteBtn = document.getElementById('deleteSelectedBtn');
            if (deleteBtn) deleteBtn.classList.add('hidden');
        }
    }

    async confirmDeleteSelected() {
        if (this.selectedForDeletion.size === 0) return;

        // 1. Confirm with user
        if (confirm(`Delete ${this.selectedForDeletion.size} leads?`)) {
            const btn = document.getElementById('deleteSelectedBtn');
            const originalText = btn ? btn.textContent : 'Delete';

            // Show loading text
            if (btn) btn.textContent = 'Deleting...';

            try {
                const ids = Array.from(this.selectedForDeletion);

                // 2. Perform the API call
                await this.parent.apiCall('/api/conversations/bulk-delete', {
                    method: 'POST',
                    body: JSON.stringify({ conversationIds: ids })
                });

                this.utils.showNotification('Leads deleted', 'success');

                // 3. CRITICAL FIX: Force everything OFF immediately
                // This turns off the Red Header AND Hides the circles/buttons
                this.toggleDeleteMode(false);

                // 4. Reload the list to show the new empty slots
                await this.loadConversations(true);

            } catch (error) {
                console.error(error);
                
                if (error.message?.includes('500') || error.message?.includes('403') || error.message?.includes('401')) {
                    this.utils.showNotification('Unauthorized - only admins can bulk delete', 'error');
                } else {
                    this.utils.showNotification('Delete failed', 'error');
                }
                
                if (btn) btn.textContent = originalText;
                this.toggleDeleteMode(false);
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
        // Prevent duplicate listeners
        if (this._listenersAttached) return;
        this._listenersAttached = true;

        const mainContainer = document.getElementById('main-content') || document.body;

        mainContainer.addEventListener('click', (e) => {
            const listContainer = e.target.closest('#conversationsList');
            if (!listContainer) return;

            // A. Handle Delete Checkbox
            const checkboxWrapper = e.target.closest('.conversation-checkbox');
            const realInput = e.target.closest('.delete-checkbox');

            if (realInput || checkboxWrapper) {
                e.stopPropagation();
                const id = realInput
                    ? realInput.dataset.conversationId
                    : checkboxWrapper.querySelector('.delete-checkbox')?.dataset.conversationId;
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
        if (stateFilter) stateFilter.addEventListener('change', () => this.loadConversations(true));

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
                if (e.target.value === '') {
                    clearTimeout(this.searchTimeout);
                    this.loadConversations(true);
                }
            });
        }

        // Global Buttons
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshData());

        const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
        if (deleteSelectedBtn) deleteSelectedBtn.addEventListener('click', () => this.confirmDeleteSelected());

        // Auto-clear unread when tab becomes visible and a conversation is open
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.currentConversationId) {
                this.clearBadge(this.currentConversationId);
            }
        });
    }
}
