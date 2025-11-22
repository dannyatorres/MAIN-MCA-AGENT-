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

        this.init();
    }

    init() {
        // ---------------------------------------------------------
        // 🔥 FINAL FIX v5: Phone Formatting + Initials + Fixes
        // ---------------------------------------------------------

        // Helper 1: Calculate "2d ago"
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

        // Helper 2: Get Initials (Two Letters)
        const getInitials = (name) => {
            if (!name) return '?';
            const parts = name.trim().split(/\s+/);
            if (parts.length === 1) {
                return parts[0].charAt(0).toUpperCase();
            }
            return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
        };

        // Helper 3: Format Phone Number (The Fix)
        const formatPhone = (phone) => {
            if (!phone) return 'No Phone';
            // Strip everything that isn't a number
            const cleaned = ('' + phone).replace(/\D/g, '');

            // Check if it's a standard 10-digit number
            const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
            if (match) {
                return '(' + match[1] + ') ' + match[2] + '-' + match[3];
            }
            // If we can't format it (e.g. international), return original
            return phone;
        };

        this.templates.conversationItem = (conv) => {
            const unreadCount = this.unreadMessages.get(conv.id) || 0;
            const isSelected = this.currentConversationId === conv.id ? 'active' : '';

            // 1. Business Name
            const businessName = conv.business_name || conv.company_name || 'Unknown Business';

            // 2. Phone (Formatted!)
            const rawPhone = conv.lead_phone || conv.phone || '';
            const phone = formatPhone(rawPhone);

            // 3. Date
            const timeAgo = timeSince(conv.last_activity);

            // 4. CID
            let displayCid = conv.display_id;
            if (!displayCid) {
                const rawId = (conv.id || '').toString();
                displayCid = rawId.length > 8 ? '...' + rawId.slice(-6) : rawId;
            }

            // 5. Initials
            const initials = getInitials(businessName);

            return `
                <div class="conversation-item ${isSelected}" data-conversation-id="${conv.id}">
                    <div class="conversation-avatar">
                        <div class="avatar-circle">
                            ${initials}
                        </div>
                    </div>

                    <div class="conversation-content">
                        <div class="conversation-header">
                            <div class="business-name" title="${businessName}">${businessName}</div>
                            <div class="conversation-time">${timeAgo}</div>
                        </div>

                        <div class="conversation-meta">
                            <span class="phone-number">${phone}</span>
                            <span class="cid-tag">CID# ${displayCid}</span>
                        </div>
                    </div>

                    <div class="conversation-checkbox">
                        <input type="checkbox" class="delete-checkbox" data-conversation-id="${conv.id}">
                    </div>

                    ${unreadCount > 0 ? `<div class="unread-badge">${unreadCount}</div>` : ''}
                </div>
            `;
        };
        // ---------------------------------------------------------

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
        // 🛑 REMOVED: Old listener logic.
        // The new WebSocketManager pushes updates directly to
        // loadConversations() and updateConversationPreview(),
        // so we don't need manual listeners here anymore.
        console.log('✅ ConversationCore ready for WebSocket events');
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

            const conversations = await this.parent.apiCall('/api/conversations');
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
            const stats = await this.parent.apiCall('/api/stats');
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

        // Remove notification badge when viewing the conversation
        if (this.parent.messaging) {
            this.parent.messaging.removeConversationBadge(conversationId);
        }

        // Clear previous conversation state before setting new one
        this.clearPreviousConversationState();

        this.currentConversationId = conversationId;

        // Update parent reference immediately
        if (this.parent) {
            this.parent.currentConversationId = conversationId;
        }

        // Fix layout modes
        const centerPanel = document.querySelector('.center-panel');
        if (centerPanel) {
            centerPanel.classList.remove('dashboard-mode'); // Turn off dashboard mode
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
            const data = await this.parent.apiCall(`/api/conversations/${conversationId}`);
            // Handle both wrapped and unwrapped responses
            this.selectedConversation = data.conversation || data;
            console.log('Loaded detailed conversation data:', this.selectedConversation);

            // Update parent reference
            if (this.parent) {
                this.parent.selectedConversation = this.selectedConversation;
            }

            // Update the conversations map with detailed data
            this.conversations.set(conversationId, this.selectedConversation);
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

        // Show the back button when viewing a conversation
        const backBtn = document.getElementById('backHomeBtn');
        if (backBtn) backBtn.style.display = 'block';

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

            // Load documents for the conversation
            if (this.parent.documents) {
                console.log('Loading documents for conversation:', conversationId);
                await this.parent.documents.loadDocuments();
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
        // 1. Get the data
        if (!this.selectedConversation) return;

        const ownerFirstName = this.selectedConversation.owner_first_name || this.selectedConversation.first_name || '';
        const ownerLastName = this.selectedConversation.owner_last_name || this.selectedConversation.last_name || '';
        const ownerName = `${ownerFirstName} ${ownerLastName}`.trim() || 'Unknown Owner';
        const businessName = this.selectedConversation.business_name || this.selectedConversation.company_name || 'Unknown Business';

        // 2. DELEGATE TO GLOBAL FUNCTION
        // This forces the app to use the logic in command-center.html (which handles the Right Panel switching)
        if (window.updateChatHeader) {
            window.updateChatHeader(businessName, ownerName);
        } else {
            console.error("window.updateChatHeader is missing!");
        }
    }

    renderConversationsList() {
        const conversations = Array.from(this.conversations.values());
        this.renderFilteredConversations(conversations, false);
    }

    renderFilteredConversations(conversations, isSearchResults = false) {
        const container = document.getElementById('conversationsList');
        // console.log('renderFilteredConversations called with:', conversations.length, 'conversations');

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

        // Sort by last activity
        conversations.sort((a, b) => new Date(b.last_activity) - new Date(a.last_activity));

        // 🚀 PERFORMANCE FIX: Render Limit
        // Only render the top 50 items to prevent browser freezing (DOM overload).
        // This makes searching 5,000 leads feel instant.
        const RENDER_LIMIT = 50;
        const visibleConversations = conversations.slice(0, RENDER_LIMIT);
        const remainingCount = conversations.length - RENDER_LIMIT;

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

        // Generate HTML only for the visible slice
        let listHtml = visibleConversations.map(conv =>
            this.templates.conversationItem(conv)
        ).join('');

        // Add a subtle footer if items are hidden
        if (remainingCount > 0) {
            listHtml += `
                <div class="list-limit-message" style="text-align: center; padding: 15px; color: #9ca3af; font-size: 12px; border-top: 1px solid #f3f4f6;">
                    Showing top 50 of ${conversations.length} matches.<br>
                    Refine your search to see more.
                </div>
            `;
        }

        container.innerHTML = indicator + listHtml;

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
        // 1. Update the data in memory
        const conversation = this.conversations.get(conversationId);
        if (conversation) {
            conversation.last_message = message.content;
            conversation.last_activity = message.created_at || new Date().toISOString();
            // If it's not the currently selected conversation, increment unread count
            if (this.currentConversationId !== conversationId) {
                const currentUnread = this.unreadMessages.get(conversationId) || 0;
                this.unreadMessages.set(conversationId, currentUnread + 1);
            }
            this.conversations.set(conversationId, conversation);
        }

        // 2. Update the DOM (The Visual Move)
        const container = document.getElementById('conversationsList');
        let item = document.querySelector(`.conversation-item[data-conversation-id="${conversationId}"]`);

        if (item && container) {
            // Update the preview text and time
            const messagePreview = item.querySelector('.message-preview') || item.querySelector('.business-name');
            const timeAgo = item.querySelector('.time-ago');

            // Visual update
            if (timeAgo) timeAgo.textContent = 'Just now';

            // Add "unread" styling if not selected
            if (this.currentConversationId !== conversationId) {
                item.classList.add('has-unread');
                // Add/Update badge
                let badge = item.querySelector('.unread-badge');
                if (!badge) {
                    badge = document.createElement('div');
                    badge.className = 'unread-badge';
                    item.appendChild(badge);
                }
                badge.textContent = this.unreadMessages.get(conversationId) || '1';
            }

            // 🚀 MOVE TO TOP ANIMATION
            // Only move if it's not already the first item
            if (container.firstElementChild !== item) {
                // Optional: Fade out, move, fade in
                item.style.transition = 'transform 0.3s ease';
                container.prepend(item);
            }
        } else if (conversation && container) {
            // If item doesn't exist in DOM (e.g. under the render limit), re-render list
            // This ensures new active conversations appear even if they were hidden
            this.renderConversationsList();
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
            const result = await this.parent.apiCall('/api/conversations/bulk-delete', {
                method: 'POST',
                body: JSON.stringify({ conversationIds: idsToDelete })
            });

            idsToDelete.forEach(id => {
                this.conversations.delete(id);
                this.selectedForDeletion.delete(id);
            });

            if (this.currentConversationId && idsToDelete.includes(this.currentConversationId)) {
                this.currentConversationId = null;
                this.selectedConversation = null;
                this.clearConversationDetails();
            }

            // Reload conversations from server to ensure UI is in sync with database
            await this.loadConversations();

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
        // 1. Clear the Header with Onyx Pill Structure
        const headerContainer = document.querySelector('.center-panel .panel-header');
        if (headerContainer) {
            // Reset to dashboard pill
            headerContainer.innerHTML = `
                <button id="backHomeBtn" onclick="loadDashboard()" style="display: none;" title="Back to Dashboard">
                    <i class="fas fa-arrow-left"></i>
                </button>

                <div class="identity-pill">
                    <div class="pill-avatar">MA</div>
                    <div class="pill-info">
                        <span class="pill-business-name">MCAagent</span>
                        <span class="pill-merchant-name" style="color: var(--corgi-hyper);">Dashboard</span>
                    </div>
                </div>
            `;
        }

        // 2. Inject the Dashboard into the Messages Area
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div class="dashboard-container">
                    <div class="dashboard-header">
                        <h1>Welcome back, Agent</h1>
                        <p>Here is what's happening with your pipeline today.</p>
                    </div>

                    <div class="goal-card">
                        <div class="goal-header">
                            <span class="goal-title">Monthly Funding Goal</span>
                            <span class="goal-numbers">$145,000 <span style="opacity:0.5; font-size: 14px;">/ $250k</span></span>
                        </div>
                        <div class="progress-track">
                            <div class="progress-fill" style="width: 58%;"></div>
                        </div>
                        <div style="margin-top: 8px; font-size: 11px; opacity: 0.6;">
                            📅 12 days left in the month
                        </div>
                    </div>

                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-icon"><i class="fas fa-sack-dollar"></i></div>
                            <div class="stat-value">8</div>
                            <div class="stat-label">Deals Funded</div>
                        </div>

                        <div class="stat-card">
                            <div class="stat-icon"><i class="fas fa-fire"></i></div>
                            <div class="stat-value">12</div>
                            <div class="stat-label">Hot Leads</div>
                        </div>

                        <div class="stat-card">
                            <div class="stat-icon"><i class="fas fa-paper-plane"></i></div>
                            <div class="stat-value">24</div>
                            <div class="stat-label">Applications Out</div>
                        </div>
                    </div>

                    <div class="empty-state" style="background: transparent; padding: 0;">
                        <div class="empty-state-hint" style="background: var(--white); border: 1px solid var(--gray-200);">
                            <i class="fas fa-arrow-left" style="color: var(--corgi-hyper);"></i>
                            <span style="color: var(--gray-600);">Select a conversation to start working</span>
                        </div>
                    </div>
                </div>
            `;
        }

        // 3. Hide Inputs
        const messageInputContainer = document.getElementById('messageInputContainer');
        if (messageInputContainer) {
            messageInputContainer.style.display = 'none';
        }

        const conversationActions = document.getElementById('conversationActions');
        if (conversationActions) {
            conversationActions.style.display = 'none';
        }

        // 4. Clean Right Panel
        const intelligenceContent = document.getElementById('intelligenceContent');
        if (intelligenceContent) {
            intelligenceContent.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon" style="font-size: 48px; width: 80px; height: 80px;">
                        <i class="fas fa-chart-pie"></i>
                    </div>
                    <h3>Lead Intelligence</h3>
                    <p>Select a lead to view analysis, documents, and FCS data.</p>
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
            await this.parent.apiCall(
                `/api/conversations/${this.currentConversationId}/state`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        newState,
                        triggeredBy: 'operator',
                        reason: 'Manual state change'
                    })
                }
            );

            this.utils.showNotification(`State changed to ${newState}`, 'success');
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
            const data = await this.parent.apiCall(`/api/conversations/${this.currentConversationId}`);
            this.selectedConversation = data.conversation || data;
            this.conversations.set(this.currentConversationId, this.selectedConversation);

            // Refresh the edit form if it's currently open
            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab && activeTab.dataset.tab === 'edit' && this.parent.intelligence) {
                this.parent.intelligence.renderEditTab(
                    document.getElementById('intelligenceContent')
                );
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