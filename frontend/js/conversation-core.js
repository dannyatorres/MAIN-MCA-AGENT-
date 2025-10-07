// conversation-core.js - Complete core conversation management

class ConversationCore {
    constructor(parent, wsManager) {
        this.parent = parent;
        this.wsManager = wsManager;
        this.apiBaseUrl = parent.apiBaseUrl || 'http://localhost:3001';
        this.utils = parent.utils;
        this.templates = parent.templates;

        // Core state
        this.currentConversationId = null;
        this.selectedConversation = null;
        this.conversations = new Map();
        this.selectedForDeletion = new Set();
        this.unreadMessages = new Map();
        this.searchTimeout = null;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupWebSocketEvents();
        this.loadInitialData();
    }

    setupEventListeners() {
        // State filter
        const stateFilter = document.getElementById('stateFilter');
        if (stateFilter) {
            stateFilter.addEventListener('change', () => this.filterConversations());
        }

        // Search input
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            this.setupSearchListeners(searchInput);
        }

        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshData());
        }

        // Add Lead button - handled by inline onclick in HTML (calls openAddLeadModal)
        // Event listener removed to avoid conflict with unified modal system

        // Delete selected button
        const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
        if (deleteSelectedBtn) {
            deleteSelectedBtn.addEventListener('click', () => this.confirmDeleteSelected());
        }
    }

    setupSearchListeners(searchInput) {
        searchInput.addEventListener('input', (e) => {
            if (e.target.value === '' || e.target.value.length === 0) {
                this.renderConversationsList();
            } else {
                this.filterConversations();
            }
        });

        searchInput.addEventListener('search', (e) => {
            if (e.target.value === '') {
                this.renderConversationsList();
            }
        });

        searchInput.addEventListener('keyup', (e) => {
            if (e.target.value === '') {
                this.renderConversationsList();
            }
        });

        searchInput.addEventListener('paste', () => {
            setTimeout(() => this.filterConversations(), 10);
        });

        searchInput.addEventListener('cut', () => {
            setTimeout(() => {
                if (searchInput.value === '') {
                    this.renderConversationsList();
                } else {
                    this.filterConversations();
                }
            }, 10);
        });
    }

    setupWebSocketEvents() {
        if (!this.wsManager) {
            console.warn('WebSocket manager not available - real-time updates disabled');
            return;
        }

        this.wsManager.on('conversation_updated', (data) => {
            this.conversations.set(data.conversation.id, data.conversation);

            if (data.conversation.id === this.currentConversationId) {
                this.selectedConversation = data.conversation;
                this.showConversationDetails();
            }

            this.updateConversationInList(data.conversation);
        });

        this.wsManager.on('new_message', (data) => {
            if (data.conversation_id === this.currentConversationId) {
                this.parent.messaging?.addMessage(data.message);
            }

            this.updateConversationPreview(data.conversation_id, data.message);
            this.parent.messaging?.handleIncomingMessage(data);
        });

        this.wsManager.on('stats_updated', (data) => {
            this.updateStats(data);
        });
    }

    async loadInitialData() {
        try {
            console.log('Loading initial data...');
            this.utils.showLoading();

            await this.loadConversations();
            console.log('Conversations loaded');

            try {
                await this.loadStats();
                console.log('Stats loaded');
            } catch (statsError) {
                console.warn('Stats loading failed (non-critical):', statsError.message);
            }

        } catch (error) {
            this.utils.handleError(error, 'Error loading initial data', 'Failed to load data: ' + error.message);

            const container = document.getElementById('conversationsList');
            if (container) {
                container.innerHTML = `
                    <div class="error-state">
                        <p>Failed to load conversations</p>
                        <p>Error: ${error.message}</p>
                        <button onclick="window.location.reload()" class="btn-primary">Reload Page</button>
                    </div>
                `;
            }
        } finally {
            this.utils.hideLoading();
            console.log('Initial data loading complete');
        }
    }

    async loadConversations() {
        try {
            console.log('🔄 Starting loadConversations()');
            console.log('🌐 Fetching conversations from:', `${this.apiBaseUrl}/api/conversations`);
            const response = await fetch(`${this.apiBaseUrl}/api/conversations`);
            console.log('📡 Response status:', response.status, response.statusText);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const conversations = await response.json();
            console.log('📋 Received conversations:', conversations.length);

            this.conversations.clear();
            conversations.forEach(conv => {
                this.conversations.set(conv.id, conv);
            });
            console.log('💾 Stored conversations in memory:', this.conversations.size);

            console.log('🎨 About to call renderConversationsList()');
            this.renderConversationsList();
            console.log('✅ loadConversations completed successfully');
        } catch (error) {
            console.error('❌ Error in loadConversations:', error);
            this.utils.handleError(error, 'Error loading conversations', null, false);
            throw error;
        }
    }

    async loadStats() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/stats`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                console.error("Response is not JSON:", await response.text());
                throw new TypeError("Response was not JSON");
            }

            const stats = await response.json();
            this.updateStats(stats);

        } catch (error) {
            console.error('Error loading stats:', error);
            this.updateStats({
                totalConversations: 0,
                newLeads: 0,
                qualified: 0,
                funded: 0,
                error: true
            });
        }
    }

    async selectConversation(conversationId) {
        if (this.currentConversationId === conversationId) return;

        console.log('=== Selecting conversation:', conversationId, '===');

        // Clear unread count for this conversation
        this.unreadMessages.delete(conversationId);

        // Clear previous conversation state before setting new one
        this.clearPreviousConversationState();

        this.currentConversationId = conversationId;

        // Update parent reference immediately
        if (this.parent) {
            this.parent.currentConversationId = conversationId;
        }

        // Fix gap issue permanently
        const centerPanel = document.querySelector('.center-panel');
        if (centerPanel) {
            centerPanel.style.gap = '0';
        }

        // Reset to AI Assistant tab when switching conversations
        const aiAssistantTab = document.querySelector('.tab-btn[data-tab="ai-assistant"]');
        if (aiAssistantTab && !aiAssistantTab.classList.contains('active')) {
            aiAssistantTab.click();
        }

        // Fetch detailed conversation data
        try {
            console.log('Fetching detailed conversation data for:', conversationId);
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conversationId}`);
            if (response.ok) {
                const data = await response.json();
                // Handle both wrapped and unwrapped responses
                this.selectedConversation = data.conversation || data;
                console.log('Loaded detailed conversation data:', this.selectedConversation);

                // Update parent reference
                if (this.parent) {
                    this.parent.selectedConversation = this.selectedConversation;
                }

                // Update the conversations map with detailed data
                this.conversations.set(conversationId, this.selectedConversation);
            } else {
                console.error('Failed to load detailed conversation data');
                this.selectedConversation = this.conversations.get(conversationId);
                if (this.parent) {
                    this.parent.selectedConversation = this.selectedConversation;
                }
            }
        } catch (error) {
            console.error('Error fetching detailed conversation:', error);
            this.selectedConversation = this.conversations.get(conversationId);
            if (this.parent) {
                this.parent.selectedConversation = this.selectedConversation;
            }
        }

        // Update UI
        this.updateConversationSelection();
        this.showConversationDetails();

        // Load messages and intelligence IN SEQUENCE with proper context
        try {
            // First load messages
            if (this.parent.messaging) {
                console.log('Loading messages for conversation:', conversationId);
                await this.parent.messaging.loadConversationMessages(conversationId);
            }

            // Then load intelligence with the updated conversation data
            if (this.parent.intelligence) {
                console.log('Loading intelligence for conversation:', conversationId);
                await this.parent.intelligence.loadConversationIntelligence(conversationId);
            }
        } catch (error) {
            console.error('Error loading conversation details:', error);
        }

        // Show message input
        const messageInputContainer = document.getElementById('messageInputContainer');
        if (messageInputContainer) {
            messageInputContainer.style.display = 'block';
        }

        // Show conversation actions
        const conversationActions = document.getElementById('conversationActions');
        if (conversationActions) {
            conversationActions.style.display = 'flex';
        }

        // Handle lender tab if active
        const lenderTab = document.querySelector('.nav-tab[data-tab="lenders"]');
        if (lenderTab && lenderTab.classList.contains('active')) {
            setTimeout(() => this.parent.lenders?.populateLenderForm(), 200);
        }

        // Restore lender form cache if needed
        setTimeout(() => this.parent.lenders?.restoreLenderFormCacheIfNeeded(), 300);
    }

    showConversationDetails() {
        const conversationInfo = document.getElementById('conversationInfo');
        if (!conversationInfo || !this.selectedConversation) return;

        const ownerFirstName = this.selectedConversation.owner_first_name || this.selectedConversation.first_name || '';
        const ownerLastName = this.selectedConversation.owner_last_name || this.selectedConversation.last_name || '';
        const ownerName = `${ownerFirstName} ${ownerLastName}`.trim() || 'Unknown Owner';
        const businessName = this.selectedConversation.business_name || this.selectedConversation.company_name || '';
        const phoneNumber = this.selectedConversation.lead_phone || this.selectedConversation.phone || '';

        // Add display ID to conversation header
        const displayId = this.selectedConversation.display_id
            ? `<span style="color: #64748b; font-size: 14px; font-weight: 500;">#${this.selectedConversation.display_id}</span>`
            : '';

        conversationInfo.className = 'conversation-info text-style';
        conversationInfo.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                <h2 class="owner-name" style="margin: 0;">${ownerName}</h2>
                ${displayId}
            </div>
            ${businessName ? `<p class="business-name-subtitle">${businessName}</p>` : ''}
            ${phoneNumber ? `<p class="phone-number-subtitle">${phoneNumber}</p>` : ''}
        `;
    }

    renderConversationsList() {
        const conversations = Array.from(this.conversations.values());
        this.renderFilteredConversations(conversations, false);
    }

    renderFilteredConversations(conversations, isSearchResults = false) {
        const container = document.getElementById('conversationsList');
        console.log('renderFilteredConversations called with:', conversations.length, 'conversations');

        if (!container) {
            console.error('conversationsList container not found!');
            return;
        }

        if (conversations.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <h3>No matches found</h3>
                    <p>Try adjusting your filters</p>
                </div>
            `;
            return;
        }

        conversations.sort((a, b) => new Date(b.last_activity) - new Date(a.last_activity));

        let indicator = '';
        const searchTerm = document.getElementById('searchInput')?.value.trim();

        if (isSearchResults && searchTerm) {
            indicator = `
                <div class="list-indicator search-results">
                    <i class="fas fa-search"></i>
                    Found ${conversations.length} results for "${searchTerm}"
                </div>
            `;
        }

        container.innerHTML = indicator + conversations.map(conv =>
            this.templates.conversationItem(conv)
        ).join('');

        // Re-add click listeners
        this.attachConversationListeners(container);
        this.updateDeleteButtonVisibility();
    }

    attachConversationListeners(container) {
        container.querySelectorAll('.conversation-item').forEach(item => {
            // Handle checkbox clicks
            const checkbox = item.querySelector('.delete-checkbox');
            if (checkbox) {
                checkbox.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = checkbox.dataset.conversationId;
                    this.toggleDeleteSelection(id);
                });
            }

            // Handle conversation selection
            const conversationContent = item.querySelector('.conversation-content');
            if (conversationContent) {
                conversationContent.addEventListener('click', () => {
                    const id = item.dataset.conversationId;
                    this.selectConversation(id);
                });
            }
        });
    }

    updateConversationSelection() {
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.toggle('selected',
                item.dataset.conversationId === this.currentConversationId);
        });
    }

    updateConversationInList(conversation) {
        this.conversations.set(conversation.id, conversation);
        const currentSelection = this.currentConversationId;
        this.renderConversationsList();

        if (currentSelection) {
            this.currentConversationId = currentSelection;
            this.updateConversationSelection();
        }
    }

    updateConversationPreview(conversationId, message) {
        const conversation = this.conversations.get(conversationId);
        if (conversation) {
            conversation.last_message = message.content;
            conversation.last_activity = message.created_at || new Date().toISOString();
            this.conversations.set(conversationId, conversation);
        }

        const conversationItem = document.querySelector(`[data-conversation-id="${conversationId}"]`);
        if (conversationItem) {
            const timeAgoElement = conversationItem.querySelector('.time-ago');
            if (timeAgoElement) {
                timeAgoElement.textContent = 'Just now';
            }

            const conversationsList = conversationItem.parentElement;
            if (conversationsList && conversationsList.firstChild !== conversationItem) {
                conversationsList.insertBefore(conversationItem, conversationsList.firstChild);
            }
        }
    }

    filterConversations() {
        const stateFilter = document.getElementById('stateFilter')?.value;
        const searchTerm = document.getElementById('searchInput')?.value.trim();

        if (!searchTerm && !stateFilter) {
            this.renderConversationsList();
            return;
        }

        if (searchTerm && searchTerm.length >= 2) {
            if (this.searchTimeout) {
                clearTimeout(this.searchTimeout);
            }

            this.searchTimeout = setTimeout(() => {
                this.performLocalSearch(searchTerm, stateFilter);
            }, 300);
            return;
        }

        let filteredConversations = Array.from(this.conversations.values());

        if (stateFilter) {
            filteredConversations = filteredConversations.filter(conv =>
                conv.state === stateFilter);
        }

        this.renderFilteredConversations(filteredConversations, false);
    }

    performLocalSearch(searchTerm, stateFilter) {
        const searchLower = searchTerm.toLowerCase();
        let filteredConversations = Array.from(this.conversations.values());

        filteredConversations = filteredConversations.filter(conv => {
            const businessName = (conv.business_name || '').toLowerCase();
            const phone = (conv.lead_phone || conv.phone || '').toLowerCase();
            const firstName = (conv.first_name || '').toLowerCase();
            const lastName = (conv.last_name || '').toLowerCase();

            return businessName.includes(searchLower) ||
                   phone.includes(searchLower) ||
                   firstName.includes(searchLower) ||
                   lastName.includes(searchLower);
        });

        if (stateFilter) {
            filteredConversations = filteredConversations.filter(conv =>
                conv.state === stateFilter);
        }

        this.renderFilteredConversations(filteredConversations, false);
    }

    updateStats(stats) {
        // Update header stats
        const legacyElements = {
            activeCount: stats.conversations?.total || stats.totalConversations || 0,
            processingCount: stats.fcs_processing?.currentlyProcessing || 0,
            todayCount: stats.conversations?.today || stats.recentActivity || 0
        };

        Object.entries(legacyElements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });

        // Update dashboard stats
        const dashboardElements = {
            totalConversations: stats.totalConversations || 0,
            newLeads: stats.newLeads || 0,
            qualified: stats.qualified || 0,
            funded: stats.funded || 0
        };

        Object.entries(dashboardElements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });

        // Update last updated time
        const lastUpdated = document.getElementById('lastUpdated');
        if (lastUpdated) {
            lastUpdated.textContent = `Last updated: ${this.utils.formatDate(new Date(), 'time')}`;
        }

        if (stats.error) {
            console.warn('Stats loaded with error - using default values');
        }
    }

    // Delete functionality
    toggleDeleteSelection(conversationId) {
        if (this.selectedForDeletion.has(conversationId)) {
            this.selectedForDeletion.delete(conversationId);
        } else {
            this.selectedForDeletion.add(conversationId);
        }

        const item = document.querySelector(`[data-conversation-id="${conversationId}"]`);
        const checkbox = item?.querySelector('.delete-checkbox');
        if (checkbox) {
            checkbox.checked = this.selectedForDeletion.has(conversationId);
            item.classList.toggle('checked-for-deletion',
                this.selectedForDeletion.has(conversationId));
        }

        this.updateDeleteButtonVisibility();
    }

    updateDeleteButtonVisibility() {
        const deleteBtn = document.getElementById('deleteSelectedBtn');
        if (deleteBtn) {
            const count = this.selectedForDeletion.size;
            if (count > 0) {
                deleteBtn.style.display = 'block';
                deleteBtn.textContent = `Delete ${count} Lead${count > 1 ? 's' : ''}`;
            } else {
                deleteBtn.style.display = 'none';
            }
        }
    }

    confirmDeleteSelected() {
        const count = this.selectedForDeletion.size;
        if (count === 0) return;

        const leadText = count === 1 ? 'lead' : 'leads';
        const message = `Are you sure you want to delete ${count} ${leadText}? This action cannot be undone.`;

        if (confirm(message)) {
            this.deleteSelectedLeads();
        }
    }

    async deleteSelectedLeads() {
        const idsToDelete = Array.from(this.selectedForDeletion);

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/bulk-delete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ conversationIds: idsToDelete })
            });

            if (!response.ok) {
                throw new Error(`Delete failed: ${response.status}`);
            }

            const result = await response.json();

            idsToDelete.forEach(id => {
                this.conversations.delete(id);
                this.selectedForDeletion.delete(id);
            });

            if (this.currentConversationId && idsToDelete.includes(this.currentConversationId)) {
                this.currentConversationId = null;
                this.selectedConversation = null;
                this.clearConversationDetails();
            }

            this.renderConversationsList();

            const deletedCount = result.deletedCount || idsToDelete.length;
            this.utils.showNotification(
                `Successfully deleted ${deletedCount} lead${deletedCount > 1 ? 's' : ''}`,
                'success'
            );

            // Exit delete mode after successful deletion
            const conversationsList = document.querySelector('.conversations-list');
            if (conversationsList && conversationsList.classList.contains('delete-mode')) {
                if (typeof window.toggleDeleteMode === 'function') {
                    window.toggleDeleteMode();
                }
            }

        } catch (error) {
            console.error('Error deleting conversations:', error);
            this.utils.showNotification('Failed to delete leads. Please try again.', 'error');
        }
    }

    clearConversationDetails() {
        const conversationInfo = document.getElementById('conversationInfo');
        if (conversationInfo) {
            conversationInfo.innerHTML = `
                <h2>Select a conversation</h2>
                <p>Choose a conversation from the left to view messages</p>
            `;
        }

        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">💬</div>
                    <h3>No conversation selected</h3>
                    <p>Select a conversation from the left panel to view the message thread</p>
                </div>
            `;
        }

        const messageInputContainer = document.getElementById('messageInputContainer');
        if (messageInputContainer) {
            messageInputContainer.style.display = 'none';
        }

        const conversationActions = document.getElementById('conversationActions');
        if (conversationActions) {
            conversationActions.style.display = 'none';
        }

        const intelligenceContent = document.getElementById('intelligenceContent');
        if (intelligenceContent) {
            intelligenceContent.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📊</div>
                    <h3>No lead selected</h3>
                    <p>Select a lead to view intelligence data</p>
                </div>
            `;
        }
    }

    refreshData() {
        if (this.wsManager && this.wsManager.refreshData) {
            this.wsManager.refreshData();
        }
        this.loadInitialData();
        this.utils.showNotification('Data refreshed', 'success');
    }

    refreshConversation() {
        if (this.currentConversationId) {
            if (this.parent.messaging) {
                this.parent.messaging.loadConversationMessages();
            }
            if (this.parent.intelligence) {
                this.parent.intelligence.loadConversationIntelligence();
            }
        }
    }

    // Add Lead Modal - DEPRECATED
    // These functions have been removed and replaced with unified modal system in command-center.html
    // The Edit Lead Modal is now used for both creating and editing leads
    // See: openAddLeadModal(), clearEditForm(), saveLeadChanges() in command-center.html

    async changeConversationState(newState) {
        if (!this.currentConversationId) return;

        try {
            const response = await fetch(
                `${this.apiBaseUrl}/api/conversations/${this.currentConversationId}/state`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        newState,
                        triggeredBy: 'operator',
                        reason: 'Manual state change'
                    })
                }
            );

            if (response.ok) {
                this.utils.showNotification(`State changed to ${newState}`, 'success');
            } else {
                throw new Error('Failed to change state');
            }
        } catch (error) {
            console.error('Error changing state:', error);
            this.utils.showNotification('Failed to change state', 'error');
        }
    }

    // Helper to sync conversation context
    syncConversationContext() {
        const possibleIds = [
            this.currentConversationId,
            this.selectedConversation?.id,
            document.querySelector('.conversation-item.selected')?.dataset?.conversationId
        ];

        const validId = possibleIds.find(id => id && id !== 'undefined');

        if (validId) {
            this.currentConversationId = validId;
            return validId;
        }

        console.warn('No valid conversation ID found');
        return null;
    }

    async reloadConversationDetails() {
        if (!this.currentConversationId) return;

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${this.currentConversationId}`);
            if (response.ok) {
                const data = await response.json();
                this.selectedConversation = data.conversation || data;
                this.conversations.set(this.currentConversationId, this.selectedConversation);

                // Refresh the edit form if it's currently open
                const activeTab = document.querySelector('.tab-btn.active');
                if (activeTab && activeTab.dataset.tab === 'edit' && this.parent.intelligence) {
                    this.parent.intelligence.renderEditTab(
                        document.getElementById('intelligenceContent')
                    );
                }
            }
        } catch (error) {
            console.error('Error reloading conversation details:', error);
        }
    }

    clearPreviousConversationState() {
        console.log('🧹 Clearing previous conversation state...');

        // Clear previous conversation reference
        this.selectedConversation = null;
        if (this.parent) {
            this.parent.selectedConversation = null;
        }

        // Clear FCS content
        const fcsContent = document.getElementById('fcsContent');
        if (fcsContent) {
            fcsContent.innerHTML = '<div class="loading">Loading FCS data...</div>';
        }

        // Clear document list
        const docList = document.getElementById('documentList');
        if (docList) {
            docList.innerHTML = '<div class="loading">Loading documents...</div>';
        }

        // Clear lenders content
        const lendersContent = document.getElementById('lendersContent');
        if (lendersContent) {
            lendersContent.innerHTML = '<div class="loading">Loading lenders data...</div>';
        }

        // Clear messages area
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            messagesContainer.innerHTML = '<div class="loading">Loading messages...</div>';
        }

        // Clear any cached data in modules
        if (this.parent.documents) {
            this.parent.documents.currentDocuments = [];
        }

        if (this.parent.fcs) {
            this.parent.fcs.currentFCSData = null;
        }

        if (this.parent.lenders) {
            this.parent.lenders.currentLendersData = null;
        }

        console.log('✅ Previous conversation state cleared');
    }

    // Export current state getters for other modules
    getCurrentConversationId() {
        return this.currentConversationId;
    }

    getSelectedConversation() {
        return this.selectedConversation;
    }

    getConversations() {
        return this.conversations;
    }
}