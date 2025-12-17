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
        // 1. List Event Delegation (PERFORMANCE FIX)
        // Instead of attaching 50+ listeners, we attach just ONE to the container.
        const listContainer = document.getElementById('conversationsList');
        if (listContainer) {
            listContainer.addEventListener('click', (e) => {
                // A. Handle Delete Checkbox
                const checkbox = e.target.closest('.delete-checkbox');
                if (checkbox) {
                    e.stopPropagation();
                    this.toggleDeleteSelection(checkbox.dataset.conversationId);
                    return;
                }

                // B. Handle Conversation Selection
                const item = e.target.closest('.conversation-item');
                // Ensure we didn't click a button inside the item
                if (item && !e.target.closest('button') && !e.target.closest('input')) {
                    this.selectConversation(item.dataset.conversationId);
                }
            });
        }

        // 2. Filters & Search
        const stateFilter = document.getElementById('stateFilter');
        if (stateFilter) stateFilter.addEventListener('change', () => this.filterConversations());

        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    if (e.target.value.trim() === '') this.renderConversationsList();
                    else this.filterConversations();
                }, 300); // Increased debounce to 300ms for smoother typing
            });
            searchInput.addEventListener('search', (e) => {
                if (e.target.value === '') this.renderConversationsList();
            });
        }

        // 3. Global Buttons
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshData());

        const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
        if (deleteSelectedBtn) deleteSelectedBtn.addEventListener('click', () => this.confirmDeleteSelected());

        // 4. Load More Button (Delegated)
        if (listContainer) {
            listContainer.addEventListener('click', (e) => {
                if (e.target.id === 'loadMoreBtn') {
                    this.loadConversations(false);
                }
            });
        }
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

        // Cleanup previous state
        this.unreadMessages.delete(conversationId);
        if (this.parent.messaging) this.parent.messaging.removeConversationBadge(conversationId);
        this.currentConversationId = conversationId;
        if (this.parent) this.parent.currentConversationId = conversationId;

        // Reset UI
        document.querySelectorAll('.tab-btn[data-tab="ai-assistant"]').forEach(btn => btn.click());
        document.getElementById('backHomeBtn')?.classList.remove('hidden');
        document.getElementById('conversationActions')?.classList.remove('hidden');
        
        // ✅ HIDE INPUT INITIALLY (So it doesn't glitch)
        const inputContainer = document.getElementById('messageInputContainer');
        if (inputContainer) inputContainer.classList.add('hidden');

        // Show a loading state in the message area
        const msgContainer = document.getElementById('messagesContainer');
        if (msgContainer) msgContainer.innerHTML = '<div class="loading-spinner"></div>';

        // Fetch & Render Details
        try {
            const data = await this.parent.apiCall(`/api/conversations/${conversationId}`);
            // ✅ CRITICAL FIX: Race Condition Guard
            // If the user clicked "Back" or another chat while this was loading, stop immediately.
            if (this.currentConversationId !== conversationId) return; 

            this.selectedConversation = data.conversation || data;
            this.conversations.set(conversationId, this.selectedConversation);
            
            this.showConversationDetails();
            this.updateConversationSelection();

            // 1. Start all requests in parallel immediately
            const msgPromise = this.parent.messaging ? 
                this.parent.messaging.loadConversationMessages(conversationId) : Promise.resolve();
                
            const otherPromises = [];
            if (this.parent.intelligence) otherPromises.push(this.parent.intelligence.loadConversationIntelligence(conversationId, data));
            if (this.parent.documents) otherPromises.push(this.parent.documents.loadDocuments());

            // 2. ONLY wait for messages (Critical for UI)
            await msgPromise;

            // 3. Show the UI immediately! (Don't wait for AI/Docs)
            if (inputContainer) {
                inputContainer.classList.remove('hidden');
                inputContainer.style.opacity = '0';
                inputContainer.style.transition = 'opacity 0.2s ease';
                requestAnimationFrame(() => inputContainer.style.opacity = '1');
            }

            // 4. Let the heavy stuff finish in the background
            Promise.allSettled(otherPromises).then(() => {
                console.log('Background data (AI/Docs) loaded.');
            });

        } catch (error) {
            console.error('Error selecting conversation:', error);
        }
    }

    showConversationDetails() {
        if (!this.selectedConversation) return;
        const c = this.selectedConversation;
        
        // Delegate to Global Header Renderer
        if (window.updateChatHeader) {
            window.updateChatHeader(
                c.business_name || c.company_name, 
                `${c.owner_first_name || ''} ${c.owner_last_name || ''}`, 
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
        // Optimized helper for HTML generation
        const timeSince = (d) => {
            if(!d) return '';
            const s = Math.floor((new Date() - new Date(d)) / 1000);
            if(s < 60) return 'Just now';
            if(s < 3600) return Math.floor(s/60) + 'm ago';
            if(s < 86400) return Math.floor(s/3600) + 'h ago';
            return Math.floor(s/86400) + 'd ago';
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
                        <span class="phone-number">${conv.lead_phone || 'No Phone'}</span>
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
        if (!conv) {
            // New conversation? Refresh list.
            this.refreshData();
            return;
        }

        // Update local data
        conv.last_message = message.content || (message.media_url ? '📷 Photo' : 'New Message');
        conv.last_activity = new Date().toISOString();
        this.conversations.set(conversationId, conv);

        // If we are just sorting, re-render is safer and fast enough for single updates
        // But for performance, we can just move the DOM node to top
        const item = document.querySelector(`.conversation-item[data-conversation-id="${conversationId}"]`);
        const list = document.getElementById('conversationsList');
        
        if (item && list) {
            // Update Text
            item.querySelector('.message-preview').textContent = conv.last_message;
            item.querySelector('.conversation-time').textContent = 'Just now';
            // Move to top
            list.prepend(item);
        } else {
            this.renderConversationsList();
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
