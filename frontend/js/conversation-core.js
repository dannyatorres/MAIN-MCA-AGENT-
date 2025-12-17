// conversation-core.js - Complete core conversation management (Optimized)

class ConversationCore {
    constructor(parent, wsManager) {
        this.parent = parent;
        this.wsManager = wsManager;
        this.apiBaseUrl = parent.apiBaseUrl;
        this.utils = parent.utils;
        this.templates = parent.templates;

        // Core state
        this.currentConversationId = null;
        this.selectedConversation = null;
        this.conversations = new Map();
        this.selectedForDeletion = new Set();
        this.unreadMessages = new Map();
        this.searchTimeout = null;
        
        // Paging State
        this.pageSize = 50;
        this.paginationOffset = 0;
        this.hasMoreConversations = true;
        this.isLoadingMore = false;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadInitialData();
    }

    setupEventListeners() {
        // --- 1. ROBUST Event Delegation ---
        // We attach to a permanent parent (document or main-content) to ensure
        // we catch events even if #conversationsList is re-created or loaded late.

        const mainContainer = document.getElementById('main-content') || document.body;

        mainContainer.addEventListener('click', (e) => {
            // Ensure we are only clicking inside the list
            const listContainer = e.target.closest('#conversationsList');
            if (!listContainer) return;

            // A. Handle Delete Checkbox (Expanded for Custom CSS)
            // Checks for the class on the target, OR if the target is inside a wrapper
            const checkboxWrapper = e.target.closest('.conversation-checkbox');
            const realInput = e.target.closest('.delete-checkbox');

            if (realInput || (checkboxWrapper && !e.target.closest('.conversation-item'))) {
                e.stopPropagation();

                // If they clicked a wrapper/label, find the ID associated with it
                const id = realInput ? realInput.dataset.conversationId :
                           checkboxWrapper.querySelector('.delete-checkbox')?.dataset.conversationId;

                if (id) this.toggleDeleteSelection(id);
                return;
            }

            // B. Handle Conversation Selection
            const item = e.target.closest('.conversation-item');

            // Critical: Ensure we didn't click a button, input, or label inside the item
            if (item &&
                !e.target.closest('button') &&
                !e.target.closest('input') &&
                !e.target.closest('.delete-checkbox')) {

                this.selectConversation(item.dataset.conversationId);
            }

            // C. Handle "Load More" (Delegated)
            if (e.target.id === 'loadMoreBtn') {
                this.loadConversations(false);
            }
        });

        // --- 2. Filters & Search (unchanged) ---
        const stateFilter = document.getElementById('stateFilter');
        if (stateFilter) stateFilter.addEventListener('change', () => this.filterConversations());

        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    if (e.target.value.trim() === '') this.renderConversationsList();
                    else this.filterConversations();
                }, 300);
            });
            // Handle the little 'x' clear button in search inputs
            searchInput.addEventListener('search', (e) => {
                if (e.target.value === '') this.renderConversationsList();
            });
        }

        // --- 3. Global Buttons (Check existence before attaching) ---
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshData());

        const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
        if (deleteSelectedBtn) deleteSelectedBtn.addEventListener('click', () => this.confirmDeleteSelected());
    }

    // --- DATA LOADING ---

    async loadInitialData() {
        try {
            console.log('Loading initial data...');
            this.utils.showLoading();
            
            // Just fetch the list.
            // We trust app-bootstrap.js has already shown the dashboard.
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
                this.conversations.clear();
                this.unreadMessages.clear();
                this.paginationOffset = 0;
                this.hasMoreConversations = true;
            }

            if (!this.hasMoreConversations) return;

            const url = `/api/conversations?limit=${this.pageSize}&offset=${this.paginationOffset}`;
            const conversations = await this.parent.apiCall(url);

            if (conversations.length < this.pageSize) this.hasMoreConversations = false;
            this.paginationOffset += conversations.length;

            conversations.forEach(conv => {
                this.conversations.set(conv.id, conv);
                if (conv.unread_count > 0) this.unreadMessages.set(conv.id, conv.unread_count);
            });

            this.renderConversationsList();
        } catch (error) {
            console.error('Error in loadConversations:', error);
        } finally {
            this.isLoadingMore = false;
        }
    }

    async selectConversation(conversationId) {
        if (this.currentConversationId === conversationId) return;

        this.currentConversationId = conversationId;
        if (this.parent) this.parent.currentConversationId = conversationId;

        // Reset UI Elements
        document.querySelectorAll('.tab-btn[data-tab="ai-assistant"]').forEach(btn => btn.click());
        document.getElementById('backHomeBtn')?.classList.remove('hidden');
        document.getElementById('conversationActions')?.classList.remove('hidden');
        this.updateConversationSelection();

        const inputContainer = document.getElementById('messageInputContainer');
        const msgContainer = document.getElementById('messagesContainer');

        // --- FIX 1: STOP HIDING THE INPUT ---
        // We removed the line that adds 'hidden' to inputContainer.
        // We just make sure it's visible.
        if (inputContainer) inputContainer.classList.remove('hidden');
        // ------------------------------------

        // Check Cache for Header Info
        const cachedConv = this.conversations.get(conversationId);
        if (cachedConv) {
            this.selectedConversation = cachedConv;
            this.showConversationDetails();
        } else {
            if (msgContainer) msgContainer.innerHTML = '<div class="loading-spinner"></div>';
        }

        try {
            // Fetch Details & Messages
            const dataPromise = this.parent.apiCall(`/api/conversations/${conversationId}`);

            // Parallel Loads
            const msgPromise = this.parent.messaging ?
                this.parent.messaging.loadConversationMessages(conversationId) : Promise.resolve();

            const toolsPromise = Promise.allSettled([
                this.parent.intelligence ? this.parent.intelligence.loadConversationIntelligence(conversationId, cachedConv) : Promise.resolve(),
                this.parent.documents ? this.parent.documents.loadDocuments() : Promise.resolve()
            ]);

            // Update Header with fresh data
            const data = await dataPromise;
            if (this.currentConversationId !== conversationId) return;

            this.selectedConversation = data.conversation || data;
            this.conversations.set(conversationId, this.selectedConversation);
            this.showConversationDetails();

            await msgPromise;
            // Tools load silently in background

        } catch (error) {
            console.error('Error selecting conversation:', error);
            // Even if error, ensure input is visible so user isn't stuck
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

    // --- RENDERING ---

    renderConversationsList() {
        const container = document.getElementById('conversationsList');
        if (!container) return;

        const conversations = Array.from(this.conversations.values());
        
        // Filter locally if needed (avoids API call)
        const searchTerm = document.getElementById('searchInput')?.value.trim().toLowerCase();
        const stateFilter = document.getElementById('stateFilter')?.value;

        let visible = conversations;

        if (stateFilter) {
            visible = visible.filter(c => c.state === stateFilter);
        }
        if (searchTerm && searchTerm.length >= 2) {
            visible = visible.filter(c => 
                (c.business_name || '').toLowerCase().includes(searchTerm) ||
                (c.lead_phone || '').includes(searchTerm) ||
                (c.first_name || '').toLowerCase().includes(searchTerm)
            );
        }

        if (visible.length === 0) {
            container.innerHTML = `<div class="empty-state"><h3>No matches found</h3></div>`;
            return;
        }

        // Sort by activity (Newest first)
        visible.sort((a, b) => new Date(b.last_activity || 0) - new Date(a.last_activity || 0));

        // Generate HTML
        let html = visible.map(conv => this.generateConversationHTML(conv)).join('');

        if (this.hasMoreConversations && !searchTerm) {
            html += `<div class="list-limit-message"><button class="btn-load-more" id="loadMoreBtn">Load More Leads</button></div>`;
        }

        container.innerHTML = html;
        this.updateConversationSelection();
        this.updateDeleteButtonVisibility();
    }

    generateConversationHTML(conv) {
        // 1. Helper for Time
        const timeSince = (d) => {
            if(!d) return '';
            const s = Math.floor((new Date() - new Date(d)) / 1000);
            if(s < 60) return 'Just now';
            if(s < 3600) return Math.floor(s/60) + 'm ago';
            if(s < 86400) return Math.floor(s/3600) + 'h ago';
            return Math.floor(s/86400) + 'd ago';
        };

        // 2. Helper for Phone Formatting (The Fix)
        const formatPhone = (phone) => {
            if (!phone) return 'No Phone';
            // Clean non-numeric characters
            const cleaned = ('' + phone).replace(/\D/g, '');
            // Check if it looks like a standard US number (10 digits)
            const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
            if (match) {
                return `(${match[1]}) ${match[2]}-${match[3]}`;
            }
            return phone; // Return original if unique format
        };

        const initials = (conv.business_name || 'U').substring(0,2).toUpperCase();
        const isSelected = this.currentConversationId === conv.id ? 'selected' : '';
        const isChecked = this.selectedForDeletion.has(conv.id) ? 'checked' : '';
        const unread = this.unreadMessages.get(conv.id);

        let offerBadge = conv.has_offer ? `<span class="offer-badge-small">OFFER</span>` : '';

        // Safely format ID
        let displayCid = conv.display_id || String(conv.id).slice(-6);

        return `
            <div class="conversation-item ${isSelected}" data-conversation-id="${conv.id}">
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
                ${unread ? `<div class="conversation-badge">${unread}</div>` : ''}
            </div>
        `;
    }

    updateConversationSelection() {
        // Lightweight class toggle
        const allItems = document.querySelectorAll('.conversation-item');
        allItems.forEach(el => {
            if (el.dataset.conversationId === String(this.currentConversationId)) {
                el.classList.add('selected');
            } else {
                el.classList.remove('selected');
            }
        });
    }

    // --- UPDATES ---

    updateConversationPreview(conversationId, message) {
        const conv = this.conversations.get(conversationId);

        // 1. UPDATE DATA (Always do this in the background)
        if (!conv) {
             this.loadConversations(false);
             return;
        }

        conv.last_message = message.content || (message.media_url ? '📷 Photo' : 'New Message');
        conv.last_activity = new Date().toISOString();
        conv.unread_count = (conv.unread_count || 0) + 1;
        this.conversations.set(conversationId, conv);
        this.unreadMessages.set(conversationId, conv.unread_count);

        // 2. UPDATE SIDEBAR (Always safe)
        const item = document.querySelector(`.conversation-item[data-conversation-id="${conversationId}"]`);
        const list = document.getElementById('conversationsList');

        if (item && list) {
            item.querySelector('.message-preview').textContent = conv.last_message;
            item.querySelector('.conversation-time').textContent = 'Just now';

            // Handle Badge
            let badge = item.querySelector('.conversation-badge');
            if(!badge) {
                badge = document.createElement('div');
                badge.className = 'conversation-badge';
                item.appendChild(badge);
            }
            badge.textContent = conv.unread_count;

            // Move to top
            list.prepend(item);
        }

        // 3. THE GUARD (Crucial Fix)
        // Check the Traffic Cop. Are we in Dashboard mode?
        if (window.appState && window.appState.mode === 'dashboard') {
            console.log("🛡️ [Guard] Blocked chat render because user is on Dashboard.");
            return; // STOP HERE. Do not touch the middle panel.
        }

        // 4. CHECK ACTIVE CHAT
        // If we are in Chat Mode, but looking at a DIFFERENT person, also stop.
        if (this.currentConversationId !== conversationId) {
             return;
        }

        // 5. RENDER MESSAGE (Only runs if we are safely in the chat for this person)
        if (this.parent.messaging && typeof this.parent.messaging.appendMessage === 'function') {
            this.parent.messaging.appendMessage(message);
        }
    }

    filterConversations() {
        this.renderConversationsList();
    }

    refreshData() {
        if (this.wsManager?.refreshData) this.wsManager.refreshData();
        this.loadConversations(true);
    }

    // --- DELETION ---

    toggleDeleteSelection(id) {
        if (this.selectedForDeletion.has(id)) this.selectedForDeletion.delete(id);
        else this.selectedForDeletion.add(id);
        
        const cb = document.querySelector(`.delete-checkbox[data-conversation-id="${id}"]`);
        if(cb) cb.checked = this.selectedForDeletion.has(id);
        
        this.updateDeleteButtonVisibility();
    }

    // ✅ FIX: Public method for safe cleanup used by app-bootstrap
    clearDeleteSelection() {
        this.selectedForDeletion.clear();
        // Visually uncheck boxes without reloading the whole list
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
                
                // If we deleted the active conversation, go to dashboard
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
}
