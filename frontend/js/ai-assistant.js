// js/ai-assistant.js

class AIAssistant {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = parent.apiBaseUrl || window.location.origin;
        this.utils = parent.utils;

        // AI state
        this.aiContext = [];
        this.isTyping = false;
        this.currentConversationId = null;
        this.isInitialized = false;
        this.aiChatCache = new Map();
        this.isLoading = false;

        console.log('🔧 AI Assistant Module Loaded');
    }

    // ============================================================
    // 1. VIEW / RENDER LOGIC
    // ============================================================

    render(container) {
        console.log('🤖 Rendering AI Assistant Interface');
        const conversation = this.parent.getSelectedConversation();

        if (!conversation) {
            this.renderEmptyState(container);
            return;
        }

        // Always reset init state because render() destroys the DOM
        this.isInitialized = false;

        // Reset loading state only when conversation changes
        if (String(this.currentConversationId) !== String(conversation.id)) {
            this.currentConversationId = String(conversation.id);
            this.isLoading = false;
        }

        container.innerHTML = `
            <div class="ai-assistant-section">
                <div id="aiChatMessages" class="ai-chat-scroll-area">
                    <div id="aiInitialSpinner" class="ai-loading-container">
                        <div class="ai-thinking ai-loading-spinner-center">
                            <div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div>
                        </div>
                        <p class="ai-loading-text">Connecting to Neural Core...</p>
                    </div>
                </div>

                <div class="ai-input-area">
                    <div class="ai-input-wrapper">
                        <textarea id="aiChatInput" placeholder="Ask AI about ${conversation.business_name || 'this deal'}..." rows="1"></textarea>
                        <button id="aiChatSend" type="button">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.initializeAIChat();
    }

    renderEmptyState(container) {
        container.innerHTML = `
            <div class="ai-empty-state">
                <div class="ai-empty-icon">💬</div>
                <h3 class="ai-empty-title">No Conversation Selected</h3>
                <p class="ai-empty-text">Select a lead to start the AI assistant.</p>
            </div>
        `;
    }

    // ============================================================
    // 2. CONTROLLER LOGIC
    // ============================================================

    initializeAIChat() {
        const conversationId = String(this.parent.getCurrentConversationId());

        // Prevent double-init
        if (String(this.currentConversationId) === conversationId && this.isInitialized) {
            return;
        }

        this.currentConversationId = conversationId;
        this.isInitialized = true;

        this.setupEventHandlers();
        this.loadChatHistory();
    }

    setupEventHandlers() {
        const chatInput = document.getElementById('aiChatInput');
        const sendButton = document.getElementById('aiChatSend');

        if (!chatInput || !sendButton) return;

        chatInput.addEventListener('input', (e) => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
        });

        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendAIMessage();
            }
        });

        sendButton.onclick = (e) => {
            e.preventDefault();
            this.sendAIMessage();
        };
    }

    // ============================================================
    // 3. MESSAGING LOGIC
    // ============================================================

    async sendAIMessage() {
        const input = document.getElementById('aiChatInput');
        if (!input) return;

        const message = input.value.trim();
        const conversationId = String(this.parent.getCurrentConversationId());
        const conversation = this.parent.getSelectedConversation();

        if (!message || !conversationId) return;

        // UI Updates
        input.value = '';
        input.style.height = 'auto';

        // Remove intro message if it's the only thing there
        const introMsg = document.querySelector('.ai-intro-message');
        if (introMsg) introMsg.remove();

        this.addMessageToChat('user', message, false);

        // Save user message to cache
        this.saveToCache(conversationId, 'user', message);

        this.showTypingIndicator();

        try {
            const data = await this.parent.apiCall('/api/ai/chat', {
                method: 'POST',
                body: JSON.stringify({
                    query: message,
                    conversationId: conversationId,
                    displayId: conversation?.display_id || null,
                    includeContext: true
                })
            });

            this.hideTypingIndicator();

            if (data.success && (data.response || data.fallback)) {
                const response = data.response || data.fallback;
                this.addMessageToChat('assistant', response, true);

                // Save assistant response to cache
                this.saveToCache(conversationId, 'assistant', response);

                // Check for proposed action
                if (data.action) {
                    this.showActionConfirmation(data.action);
                }
            } else {
                throw new Error(data.error || 'Unknown error');
            }

        } catch (error) {
            console.error('❌ AI Chat Error:', error);
            this.hideTypingIndicator();
            this.addMessageToChat('assistant', 'Connection error. Please try again.', false);
        }
    }

    addMessageToChat(role, content, saveToDatabase = true, scrollToBottom = true) {
        const messagesContainer = document.getElementById('aiChatMessages');
        if (!messagesContainer) return;

        // 🔔 Prevent cross-conversation pollution
        const currentId = this.parent.getCurrentConversationId();
        if (currentId !== this.currentConversationId) {
            console.log('🛑 Blocking message add: Wrong conversation');
            return;
        }

        const messageRow = document.createElement('div');
        messageRow.className = `ai-message-row ${role === 'user' ? 'user' : 'assistant'}`;

        const messageBubble = document.createElement('div');
        messageBubble.className = role === 'user' ? 'ai-bubble-user' : 'ai-bubble-ai';
        messageBubble.innerHTML = this.formatAIResponse(content);

        messageRow.appendChild(messageBubble);
        messagesContainer.appendChild(messageRow);

        if (scrollToBottom) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    formatAIResponse(content) {
        if (!content) return '';
        let formatted = content
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/^• /gm, '<span class="ai-bullet-point">•</span> ');
        return formatted;
    }

    // ============================================================
    // ACTION CONFIRMATION & EXECUTION
    // ============================================================

    showActionConfirmation(action) {
        const container = document.getElementById('aiChatMessages');
        if (!container) return;

        const confirmDiv = document.createElement('div');
        confirmDiv.className = 'ai-action-confirm';
        confirmDiv.id = 'aiActionConfirm';
        confirmDiv.innerHTML = `
            <div class="ai-action-card">
                <div class="ai-action-header">
                    <i class="fas fa-database"></i> Confirm Action
                </div>
                <div class="ai-action-body">
                    ${action.confirm_text || 'Execute this action?'}
                </div>
                <div class="ai-action-buttons">
                    <button class="ai-action-cancel" id="aiActionCancel">Cancel</button>
                    <button class="ai-action-confirm-btn" id="aiActionConfirmBtn">Confirm</button>
                </div>
            </div>
        `;

        container.appendChild(confirmDiv);
        container.scrollTop = container.scrollHeight;

        document.getElementById('aiActionCancel').onclick = () => {
            confirmDiv.remove();
            this.addMessageToChat('assistant', 'Action cancelled.', false);
        };

        document.getElementById('aiActionConfirmBtn').onclick = () => {
            confirmDiv.remove();
            this.executeAction(action);
        };
    }

    async executeAction(action) {
        const conversationId = this.parent.getCurrentConversationId();

        this.showTypingIndicator();

        try {
            const result = await this.parent.apiCall('/api/ai/execute-action', {
                method: 'POST',
                body: JSON.stringify({
                    action: action.action,
                    data: action.data,
                    conversationId: conversationId
                })
            });

            this.hideTypingIndicator();

            if (result.success) {
                this.addMessageToChat('assistant', `✅ ${result.message}`, false);

                // Refresh the UI
                if (this.parent.loadConversationDetails) {
                    this.parent.loadConversationDetails(conversationId);
                }
            } else {
                this.addMessageToChat('assistant', `❌ ${result.error}`, false);
            }
        } catch (error) {
            this.hideTypingIndicator();
            this.addMessageToChat('assistant', `❌ Failed: ${error.message}`, false);
        }
    }

    showTypingIndicator() {
        this.hideTypingIndicator();
        const container = document.getElementById('aiChatMessages');
        if (!container) return;

        const typingDiv = document.createElement('div');
        typingDiv.id = 'aiTypingIndicator';
        typingDiv.className = 'ai-message-row assistant';
        typingDiv.innerHTML = `
            <div class="ai-thinking">
                <div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div>
            </div>`;

        container.appendChild(typingDiv);
        container.scrollTop = container.scrollHeight;
    }

    hideTypingIndicator() {
        const indicator = document.getElementById('aiTypingIndicator');
        if (indicator) indicator.remove();
    }

    saveToCache(conversationId, role, content) {
        if (!this.aiChatCache.has(conversationId)) {
            this.aiChatCache.set(conversationId, []);
        }
        this.aiChatCache.get(conversationId).push({ role, content });
    }

    // ============================================================
    // 4. DATA LOADING (SMART HISTORY)
    // ============================================================

    async loadChatHistory() {
        const conversationId = this.parent.getCurrentConversationId();
        const messagesContainer = document.getElementById('aiChatMessages');

        if (!messagesContainer) return;

        // Prevent duplicate calls
        if (this.isLoading) {
            console.log('⏳ Already loading AI chat, skipping duplicate call');
            return;
        }
        this.isLoading = true;

        // Helper: Render messages without flash
        const renderMessages = (messages) => {
            messagesContainer.style.visibility = 'hidden';
            messagesContainer.style.scrollBehavior = 'auto'; // Force instant scroll
            messagesContainer.innerHTML = '';

            // Always show intro first
            const conversation = this.parent.getSelectedConversation();
            const businessName = conversation?.business_name || 'this deal';
            this.addMessageToChat('assistant', `How can I help you with **${businessName}** today?`, false, false);

            // Then show history
            messages.forEach(msg => {
                this.addMessageToChat(msg.role, msg.content, false, false);
            });

            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            messagesContainer.style.visibility = 'visible';
            messagesContainer.style.scrollBehavior = 'smooth'; // Restore for user scrolls
        };

        // 1. CACHE CHECK
        if (this.aiChatCache.has(conversationId)) {
            const cachedMsgs = this.aiChatCache.get(conversationId);

            const currentSpinner = document.getElementById('aiInitialSpinner');
            if (currentSpinner) currentSpinner.remove();

            if (cachedMsgs.length > 0) {
                console.log(`⚡ [Cache] Rendering AI history for ${conversationId}`);
                renderMessages(cachedMsgs);
            } else {
                console.log(`⚡ [Cache] Empty history, showing intro for ${conversationId}`);
                this.triggerSmartIntro();
            }
            this.isLoading = false;
            return;
        }

        try {
            // 2. FETCH FROM API
            const data = await this.parent.apiCall(`/api/ai/chat/${conversationId}`);

            // TRAFFIC COP: STOP IF USER SWITCHED CONVERSATIONS
            if (String(this.parent.getCurrentConversationId()) !== conversationId) {
                console.log('🛑 Aborting AI load: User switched conversations');
                this.isLoading = false;
                return;
            }

            // Remove spinner
            const activeSpinner = document.getElementById('aiInitialSpinner');
            if (activeSpinner) activeSpinner.remove();

            if (data.messages && data.messages.length > 0) {
                this.aiChatCache.set(conversationId, data.messages);
                renderMessages(data.messages);
            } else {
                // Empty History -> Cache it and show welcome
                this.aiChatCache.set(conversationId, []);
                this.triggerSmartIntro();
            }
            this.isLoading = false;

        } catch (error) {
            console.log('Error loading history:', error);
            this.isLoading = false;

            if (String(this.parent.getCurrentConversationId()) === conversationId) {
                const activeSpinner = document.getElementById('aiInitialSpinner');
                if (activeSpinner) activeSpinner.remove();
                this.triggerSmartIntro();
            }
        }
    }

    triggerSmartIntro() {
        const messagesContainer = document.getElementById('aiChatMessages');
        if (!messagesContainer) return;

        // 🔔 Prevent duplicate intro
        if (messagesContainer.querySelector('.ai-message-row')) {
            console.log('🛑 Intro already exists, skipping');
            return;
        }

        const spinner = document.getElementById('aiInitialSpinner');
        if (spinner) spinner.remove();

        const currentId = this.parent.getCurrentConversationId();
        if (currentId !== this.currentConversationId) {
            return;
        }

        const conversation = this.parent.getSelectedConversation();
        const businessName = conversation ? conversation.business_name : 'this deal';
        const message = `How can I help you with **${businessName}** today?`;

        this.addMessageToChat('assistant', message, false);
    }
}
