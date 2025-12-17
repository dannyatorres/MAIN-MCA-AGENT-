// conversation-core.js - Complete core conversation management

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
        this.currentRenderLimit = Infinity; 
        this.pageSize = 50;
        this.paginationOffset = 0;
        this.hasMoreConversations = true;
        this.isLoadingMore = false;

        this.init();
    }

    init() {
        // --- HELPERS ---
        const timeSince = (dateString) => {
            if (!dateString) return '';
            const date = new Date(dateString);
            const seconds = Math.floor((new Date() - date) / 1000);
            let interval = seconds / 31536000;
            if (interval > 1) return Math.floor(interval) + "y ago";
            interval = seconds / 2592000;
            if (interval > 1) return Math.floor(interval) + "mo ago";
            interval = seconds / 86400;
            if (interval > 1) return Math.floor(interval) + "d ago";
            interval = seconds / 3600;
            if (interval > 1) return Math.floor(interval) + "h ago";
            interval = seconds / 60;
            if (interval > 1) return Math.floor(interval) + "m ago";
            return "Just now";
        };

        const getInitials = (name) => {
            if (!name) return '?';
            const parts = name.trim().split(/\s+/);
            if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
            return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
        };

        const formatPhone = (phone) => {
            if (!phone || phone === 'null' || phone === 'undefined') return 'No Phone';
            const cleaned = String(phone).replace(/\D/g, '');
            const match = cleaned.match(/^(?:1)?(\d{3})(\d{3})(\d{4})$/);
            if (match) return '(' + match[1] + ') ' + match[2] + '-' + match[3];
            return phone;
        };

        // --- TEMPLATES ---
        this.templates.conversationItem = (conv) => {
            const unreadCount = this.unreadMessages.get(conv.id) || 0;
            const isSelected = this.currentConversationId === conv.id ? 'active' : '';
            const businessName = conv.business_name || conv.company_name || 'Unknown Business';
            const phone = formatPhone(conv.lead_phone || conv.phone || '');
            const timeAgo = timeSince(conv.last_activity);
            
            let displayCid = conv.display_id;
            if (!displayCid) {
                const rawId = (conv.id || '').toString();
                displayCid = rawId.length > 8 ? '...' + rawId.slice(-6) : rawId;
            }

            const initials = getInitials(businessName);
            const isChecked = this.selectedForDeletion.has(conv.id) ? 'checked' : '';
            const checkedClass = this.selectedForDeletion.has(conv.id) ? 'checked-for-deletion' : '';

            let offerBadgeHTML = '';
            if (conv.has_offer) {
                offerBadgeHTML = `<span style="background:rgba(0,255,136,0.1); border:1px solid #00ff88; color:#00ff88; font-size:9px; padding:2px 4px; border-radius:4px; margin-left:6px; font-weight:bold; box-shadow:0 0 5px rgba(0,255,136,0.2);">OFFER</span>`;
            }

            return `
                <div class="conversation-item ${isSelected} ${checkedClass}" data-conversation-id="${conv.id}">
                    <div class="conversation-avatar"><div class="avatar-circle">${initials}</div></div>
                    <div class="conversation-content">
                        <div class="conversation-header">
                            <div class="business-name" title="${businessName}">${businessName}${offerBadgeHTML}</div>
                            <div class="conversation-time">${timeAgo}</div>
                        </div>
                        <div class="message-preview-row">
                             <span class="message-preview">${conv.last_message || 'No messages yet'}</span>
                        </div>
                        <div class="conversation-meta">
                            <span class="phone-number">${phone}</span>
                            <span class="cid-tag">CID# ${displayCid}</span>
                        </div>
                    </div>
                    <div class="conversation-checkbox">
                        <input type="checkbox" class="delete-checkbox" data-conversation-id="${conv.id}" ${isChecked}>
                    </div>
                    ${unreadCount > 0 ? `<div class="conversation-badge">${unreadCount}</div>` : ''}
                </div>
            `;
        };

        this.setupEventListeners();
        this.loadInitialData();
    }

    setupEventListeners() {
        const stateFilter = document.getElementById('stateFilter');
        if (stateFilter) stateFilter.addEventListener('change', () => this.filterConversations());

        const searchInput = document.getElementById('searchInput');
        if (searchInput) this.setupSearchListeners(searchInput);

        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshData());

        const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
        if (deleteSelectedBtn) deleteSelectedBtn.addEventListener('click', () => this.confirmDeleteSelected());
    }

    setupSearchListeners(searchInput) {
        searchInput.addEventListener('input', (e) => {
            if (this.searchTimeout) clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                if (e.target.value.trim() === '') this.renderConversationsList();
                else this.filterConversations();
            }, 150);
        });
        searchInput.addEventListener('search', (e) => {
            if (e.target.value === '') this.renderConversationsList();
        });
    }

    async loadInitialData() {
        try {
            console.log('Loading initial data...');
            this.utils.showLoading();

            await this.loadConversations(true);
            
            // If no conversation is selected, ensure Dashboard is loaded correctly
            if (!this.currentConversationId) {
                if (window.loadDashboard) window.loadDashboard();
            }

        } catch (error) {
            this.utils.handleError(error, 'Error loading initial data');
        } finally {
            this.utils.hideLoading();
        }
    }

    async loadConversations(reset = false) {
        try {
            if (this.isLoadingMore) return;
            this.isLoadingMore = true;

            if (reset) {
                this.conversations.clear();
                this.unreadMessages.clear();
                this.paginationOffset = 0;
                this.hasMoreConversations = true;
            }

            if (!this.hasMoreConversations) {
                this.isLoadingMore = false;
                return;
            }

            const url = `/api/conversations?limit=${this.pageSize}&offset=${this.paginationOffset}`;
            const conversations = await this.parent.apiCall(url);

            conversations.forEach(conv => {
                this.conversations.set(conv.id, conv);
                if (conv.unread_count && conv.unread_count > 0) {
                    this.unreadMessages.set(conv.id, conv.unread_count);
                }
            });

            this.paginationOffset += conversations.length;
            if (conversations.length < this.pageSize) this.hasMoreConversations = false;

            this.renderConversationsList();
        } catch (error) {
            console.error('Error in loadConversations:', error);
        } finally {
            this.isLoadingMore = false;
        }
    }

    async selectConversation(conversationId) {
        if (this.currentConversationId === conversationId) return;

        console.log('=== Selecting conversation:', conversationId, '===');

        // Clear unread count locally
        this.unreadMessages.delete(conversationId);
        if (this.parent.messaging) this.parent.messaging.removeConversationBadge(conversationId);

        // Clear previous state
        this.clearPreviousConversationState();
        this.currentConversationId = conversationId;
        if (this.parent) this.parent.currentConversationId = conversationId;

        // Reset to AI Assistant tab
        const aiAssistantTab = document.querySelector('.tab-btn[data-tab="ai-assistant"]');
        if (aiAssistantTab && !aiAssistantTab.classList.contains('active')) {
            aiAssistantTab.click();
        }

        // Fetch Data
        let conversationData = null;
        try {
            conversationData = await this.parent.apiCall(`/api/conversations/${conversationId}`);
            this.selectedConversation = conversationData.conversation || conversationData;
            this.conversations.set(conversationId, this.selectedConversation);
            if (this.parent) this.parent.selectedConversation = this.selectedConversation;
        } catch (error) {
            console.error('Error fetching details:', error);
            this.selectedConversation = this.conversations.get(conversationId);
        }

        // Update UI
        this.updateConversationSelection();
        this.showConversationDetails();

        // Show back button
        const backBtn = document.getElementById('backHomeBtn');
        if (backBtn) backBtn.classList.remove('hidden');

        // Load Modules
        try {
            if (this.parent.messaging) await this.parent.messaging.loadConversationMessages(conversationId);
            if (this.parent.intelligence) await this.parent.intelligence.loadConversationIntelligence(conversationId, conversationData);
            if (this.parent.documents) await this.parent.documents.loadDocuments();
        } catch (error) { console.error(error); }

        // Show Inputs (Only when chat is active)
        const messageInputContainer = document.getElementById('messageInputContainer');
        if (messageInputContainer) messageInputContainer.classList.remove('hidden');
        
        const conversationActions = document.getElementById('conversationActions');
        if (conversationActions) conversationActions.classList.remove('hidden');

        // Lender Logic
        const lenderTab = document.querySelector('.nav-tab[data-tab="lenders"]');
        if (lenderTab && lenderTab.classList.contains('active')) {
            setTimeout(() => this.parent.lenders?.populateLenderForm(), 200);
        }
        setTimeout(() => this.parent.lenders?.restoreLenderFormCacheIfNeeded(), 300);
    }

    showConversationDetails() {
        if (!this.selectedConversation) return;
        const c = this.selectedConversation;
        const ownerName = `${c.owner_first_name || c.first_name || ''} ${c.owner_last_name || c.last_name || ''}`.trim() || 'Unknown Owner';
        const businessName = c.business_name || c.company_name || 'Unknown Business';
        const phone = c.lead_phone || c.phone || '';

        // Delegate to Global Header Renderer (In app-bootstrap.js)
        if (window.updateChatHeader) {
            window.updateChatHeader(businessName, ownerName, phone, c.id);
        }
    }

    renderConversationsList() {
        const conversations = Array.from(this.conversations.values());
        this.renderFilteredConversations(conversations, false);
    }

    renderFilteredConversations(conversations, isSearchResults = false) {
        const container = document.getElementById('conversationsList');
        if (!container) return;

        if (conversations.length === 0) {
            container.innerHTML = `<div class="empty-state"><h3>No matches found</h3></div>`;
            return;
        }

        // Sort by activity
        conversations.sort((a, b) => new Date(b.last_activity) - new Date(a.last_activity));

        const visibleConversations = conversations; // Implementing paging here if needed
        let listHtml = visibleConversations.map(conv => this.templates.conversationItem(conv)).join('');

        if (this.hasMoreConversations) {
            listHtml += `<div class="list-limit-message"><button class="btn-load-more" id="loadMoreBtn">Load More Leads</button></div>`;
        }

        container.innerHTML = listHtml;
        this.attachConversationListeners(container);
        this.updateDeleteButtonVisibility();
    }

    attachConversationListeners(container) {
        container.querySelectorAll('.conversation-item').forEach(item => {
            const checkbox = item.querySelector('.delete-checkbox');
            if (checkbox) checkbox.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDeleteSelection(checkbox.dataset.conversationId);
            });

            const content = item.querySelector('.conversation-content');
            if (content) content.addEventListener('click', () => {
                this.selectConversation(item.dataset.conversationId);
            });
        });

        const loadMoreBtn = container.querySelector('#loadMoreBtn');
        if (loadMoreBtn) loadMoreBtn.addEventListener('click', () => this.loadConversations(false));
    }

    updateConversationSelection() {
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.conversationId === this.currentConversationId);
        });
    }

    updateConversationPreview(conversationId, message) {
        const conversation = this.conversations.get(conversationId);
        let previewText = message.content;
        if ((!previewText || previewText.trim() === '') && message.media_url) previewText = '📷 Photo';

        if (conversation) {
            conversation.last_message = previewText;
            conversation.last_activity = message.created_at || new Date().toISOString();
            this.conversations.set(conversationId, conversation);
        }

        // DOM Update
        const container = document.getElementById('conversationsList');
        const item = document.querySelector(`.conversation-item[data-conversation-id="${conversationId}"]`);

        if (item && container) {
            const messagePreview = item.querySelector('.message-preview');
            const timeAgo = item.querySelector('.time-ago');
            if (messagePreview) messagePreview.textContent = previewText;
            if (timeAgo) timeAgo.textContent = 'Just now';

            // Move to top if not searching
            const searchInput = document.getElementById('searchInput');
            if ((!searchInput || searchInput.value.trim().length === 0) && container.firstElementChild !== item) {
                container.prepend(item);
            }
        } else if (conversation) {
            this.filterConversations();
        }
    }

    filterConversations() {
        const stateFilter = document.getElementById('stateFilter')?.value;
        const searchTerm = document.getElementById('searchInput')?.value.trim();

        if (!searchTerm && !stateFilter) {
            this.renderConversationsList();
            return;
        }

        let filtered = Array.from(this.conversations.values());

        if (stateFilter) {
            filtered = filtered.filter(conv => conv.state === stateFilter);
        }

        if (searchTerm && searchTerm.length >= 2) {
             const searchLower = searchTerm.toLowerCase();
             filtered = filtered.filter(conv => {
                return (conv.business_name || '').toLowerCase().includes(searchLower) ||
                       (conv.lead_phone || conv.phone || '').includes(searchLower) ||
                       (conv.first_name || '').toLowerCase().includes(searchLower) ||
                       (conv.last_name || '').toLowerCase().includes(searchLower);
             });
        }

        this.renderFilteredConversations(filtered, true);
    }

    // --- DELETION LOGIC ---
    toggleDeleteSelection(conversationId) {
        if (this.selectedForDeletion.has(conversationId)) this.selectedForDeletion.delete(conversationId);
        else this.selectedForDeletion.add(conversationId);

        const item = document.querySelector(`[data-conversation-id="${conversationId}"]`);
        const checkbox = item?.querySelector('.delete-checkbox');
        if (checkbox) checkbox.checked = this.selectedForDeletion.has(conversationId);
        
        this.updateDeleteButtonVisibility();
    }

    updateDeleteButtonVisibility() {
        const deleteBtn = document.getElementById('deleteSelectedBtn');
        if (deleteBtn) {
            const count = this.selectedForDeletion.size;
            deleteBtn.classList.toggle('hidden', count === 0);
            if (count > 0) deleteBtn.textContent = `Delete ${count} Lead${count > 1 ? 's' : ''}`;
        }
    }

    async confirmDeleteSelected() {
        if (this.selectedForDeletion.size === 0) return;
        if (confirm(`Are you sure you want to delete ${this.selectedForDeletion.size} leads?`)) {
            await this.deleteSelectedLeads();
        }
    }

    async deleteSelectedLeads() {
        const ids = Array.from(this.selectedForDeletion);
        try {
            await this.parent.apiCall('/api/conversations/bulk-delete', {
                method: 'POST', body: JSON.stringify({ conversationIds: ids })
            });

            ids.forEach(id => {
                this.conversations.delete(id);
                this.selectedForDeletion.delete(id);
            });

            if (this.currentConversationId && ids.includes(this.currentConversationId)) {
                this.currentConversationId = null;
                this.selectedConversation = null;
                this.clearConversationDetails(); // This now calls the unified dashboard loader
            }

            await this.loadConversations(true);
            this.utils.showNotification('Leads deleted', 'success');
            if (window.toggleDeleteMode) window.toggleDeleteMode();

        } catch (error) {
            console.error(error);
            this.utils.showNotification('Failed to delete leads', 'error');
        }
    }

    // --- 🚀 KEY FIX: UNIFIED DASHBOARD LOADER ---
    clearConversationDetails() {
        console.log('🧹 Clearing conversation details...');

        this.currentConversationId = null;
        this.selectedConversation = null;
        if (this.parent) {
            this.parent.currentConversationId = null;
            this.parent.selectedConversation = null;
        }

        // DELEGATE to the global dashboard loader in app-bootstrap.js
        // This ensures Stats load, Input hides, and HTML is consistent.
        if (window.loadDashboard) {
            window.loadDashboard();
        } else {
            console.error("❌ window.loadDashboard is missing! Check app-bootstrap.js");
        }
    }

    refreshData() {
        if (this.wsManager?.refreshData) this.wsManager.refreshData();
        this.loadInitialData();
    }

    clearPreviousConversationState() {
        this.selectedConversation = null;
        if (this.parent) this.parent.selectedConversation = null;
        
        // Reset panels to loading state
        ['fcsContent', 'documentList', 'lendersContent', 'messagesContainer'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<div class="loading">Loading...</div>';
        });

        // Clear module caches
        if (this.parent.documents) this.parent.documents.currentDocuments = [];
        if (this.parent.fcs) this.parent.fcs.currentFCSData = null;
        if (this.parent.lenders) this.parent.lenders.currentLendersData = null;
    }
}
