// js/ai-assistant.js
// REFACTORED: Combined Controller (Logic) + View (Render)
// FEATURES: Smart Welcome (Auto-detects offers on load)

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

        container.innerHTML = `
            <div class="ai-assistant-section">
                <div id="aiChatMessages" class="ai-chat-messages">
                    <div class="ai-loading-container">
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

        this.currentConversationId = null;
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

        console.log('⚡ Initializing AI Logic for ID:', conversationId);

        this.setupEventHandlers();
        this.loadChatHistory();
    }

    setupEventHandlers() {
        const chatInput = document.getElementById('aiChatInput');
        const sendButton = document.getElementById('aiChatSend');

        if (!chatInput || !sendButton) return;

        // Auto-resize textarea
        chatInput.addEventListener('input', (e) => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
        });

        // Handle Enter key
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendAIMessage();
            }
        });

        // Add click handler
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
                this.addMessageToChat('assistant', data.response || data.fallback, true); // Save response to DB
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
        if(!content) return '';
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

        try {
            const data = await this.parent.apiCall(`/api/ai/chat/${conversationId}`);

            messagesContainer.style.visibility = 'hidden';
            messagesContainer.style.scrollBehavior = 'auto';
            messagesContainer.innerHTML = '';

            if (data.messages && data.messages.length > 0) {
                // If history exists, just show it
                data.messages.forEach(msg => {
                    this.addMessageToChat(msg.role, msg.content, false, false);
                });
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            } else {
                // 🧠 SMART START: If no history, trigger Auto-Analysis
                this.triggerSmartIntro();
            }

            const forceLayout = messagesContainer.offsetHeight;
            messagesContainer.style.visibility = 'visible';
            setTimeout(() => { messagesContainer.style.scrollBehavior = 'smooth'; }, 100);

        } catch (error) {
            console.log('Error loading history:', error);
            messagesContainer.innerHTML = '';
            messagesContainer.style.visibility = 'visible';
            this.addMessageToChat('assistant', "I'm ready. (History load failed)", false);
        }
    }

    // 🔥 THIS IS THE NEW FEATURE
    // Automatically asks the backend: "What is going on?"
    async triggerSmartIntro() {
        const conversationId = this.parent.getCurrentConversationId();
        const messagesContainer = document.getElementById('aiChatMessages');
        if (!messagesContainer) return;

        // Show typing immediately
        this.showTypingIndicator();
        messagesContainer.style.visibility = 'visible';

        try {
            // We send a "Hidden" query that the user didn't type
            const data = await this.parent.apiCall('/api/ai/chat', {
                method: 'POST',
                body: JSON.stringify({
                    query: "Analyze the database for this conversation. If there are any offers (even messy ones like '10k 70 days'), tell me immediately. If no offers, just summarize the deal status.",
                    conversationId: conversationId,
                    includeContext: true
                })
            });

            this.hideTypingIndicator();

            if (data.success && data.response) {
                // Display the AI's "Auto-Analysis"
                this.addMessageToChat('assistant', data.response, true);
            } else {
                this.addMessageToChat('assistant', "Hi! I'm ready to help. (Auto-analysis unavailable)", false);
            }

        } catch (e) {
            this.hideTypingIndicator();
            this.addMessageToChat('assistant', "Hi! I'm ready to help.", false);
        }
    }
}
