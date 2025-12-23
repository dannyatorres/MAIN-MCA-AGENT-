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

        // 🔔 Reset state when conversation changes
        if (this.currentConversationId !== conversation.id) {
            this.currentConversationId = conversation.id;
            this.isInitialized = false;
        }

        // If already initialized for THIS conversation, skip
        if (this.isInitialized) {
            const existingChat = document.getElementById('aiChatMessages');
            if (existingChat) return;
        }

        // Only wipe if we are changing conversations or initializing
        container.innerHTML = `
            <div class="ai-assistant-section">
                <div id="aiChatMessages" class="ai-chat-messages">
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

        // CRITICAL FIX: Since we just wiped the HTML, we must reset the init flag
        // This ensures initializeAIChat() will actually run again for the new elements.
        this.isInitialized = false;

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
        const conversationId = this.parent.getCurrentConversationId();

        // Prevent double-init
        if (this.currentConversationId === conversationId && this.isInitialized) {
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
        const conversationId = this.parent.getCurrentConversationId();

        if (!message || !conversationId) return;

        // UI Updates
        input.value = '';
        input.style.height = 'auto';

        // Remove intro message if it's the only thing there
        const introMsg = document.querySelector('.ai-intro-message');
        if (introMsg) introMsg.remove();

        this.addMessageToChat('user', message, false);
        this.showTypingIndicator();

        try {
            const data = await this.parent.apiCall('/api/ai/chat', {
                method: 'POST',
                body: JSON.stringify({
                    query: message,
                    conversationId: conversationId,
                    includeContext: true
                })
            });

            this.hideTypingIndicator();

            if (data.success && (data.response || data.fallback)) {
                this.addMessageToChat('assistant', data.response || data.fallback, true);
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

    // ============================================================
    // 4. DATA LOADING (SMART HISTORY)
    // ============================================================

    async loadChatHistory() {
        const conversationId = this.parent.getCurrentConversationId();
        const messagesContainer = document.getElementById('aiChatMessages');

        if (!messagesContainer) return;

        // 1. CACHE CHECK
        if (this.aiChatCache.has(conversationId)) {
            console.log(`⚡ [Cache] Rendering AI history for ${conversationId}`);
            const currentSpinner = document.getElementById('aiInitialSpinner');
            if (currentSpinner) currentSpinner.remove();

            const cachedMsgs = this.aiChatCache.get(conversationId);
            messagesContainer.innerHTML = '';
            cachedMsgs.forEach(msg => {
                this.addMessageToChat(msg.role, msg.content, false, false);
            });
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        try {
            // 2. FETCH FROM API
            const data = await this.parent.apiCall(`/api/ai/chat/${conversationId}`);

            // TRAFFIC COP: STOP IF USER SWITCHED CONVERSATIONS
            if (this.parent.getCurrentConversationId() !== conversationId) {
                console.log('🛑 Aborting AI load: User switched conversations');
                return;
            }

            // Remove spinner now that we are sure we want to update THIS screen
            const activeSpinner = document.getElementById('aiInitialSpinner');
            if (activeSpinner) activeSpinner.remove();

            if (data.messages && data.messages.length > 0) {
                this.aiChatCache.set(conversationId, data.messages);

                // Double-check container existence
                const currentContainer = document.getElementById('aiChatMessages');
                if (currentContainer) {
                    currentContainer.innerHTML = '';
                    data.messages.forEach(msg => {
                        this.addMessageToChat(msg.role, msg.content, false, false);
                    });
                    currentContainer.scrollTop = currentContainer.scrollHeight;
                }
            } else {
                // Empty History -> Show Welcome
                this.triggerSmartIntro();
            }

        } catch (error) {
            console.log('Error loading history:', error);

            // Only remove spinner/show intro if we are still on the same convo
            if (this.parent.getCurrentConversationId() === conversationId) {
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
