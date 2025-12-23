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
        this.aiChatCache = new Map(); // ✅ NEW

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

        // CHECK: Is the DOM already setup for this conversation?
        // If so, do NOT wipe innerHTML (prevents flicker)
        if (this.currentConversationId === conversation.id && this.isInitialized) {
            const existingChat = document.getElementById('aiChatMessages');
            if (existingChat) return; // Already there!
        }

        // Only wipe if we are changing conversations or initializing
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

        const hadCache = this.aiChatCache.has(conversationId);

        // 1. CACHE CHECK
        if (hadCache) {
            console.log(`⚡ [Cache] Rendering AI history for ${conversationId}`);

            // Hide container while rendering to prevent scroll flicker
            messagesContainer.style.visibility = 'hidden';

            messagesContainer.innerHTML = '';
            const cachedMsgs = this.aiChatCache.get(conversationId);
            cachedMsgs.forEach(msg => {
                this.addMessageToChat(msg.role, msg.content, false, false);
            });

            // Scroll to bottom while still hidden
            messagesContainer.scrollTop = messagesContainer.scrollHeight;

            // Reveal properly scrolled content after layout calculation
            requestAnimationFrame(() => {
                messagesContainer.style.visibility = 'visible';
            });
        } else {
            // Spinner only if no cache
            messagesContainer.innerHTML = `
                <div class="ai-loading-container">
                    <div class="ai-thinking ai-loading-spinner-center">
                        <div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div>
                    </div>
                </div>`;
        }

        try {
            // 2. BACKGROUND SYNC
            const data = await this.parent.apiCall(`/api/ai/chat/${conversationId}`);
            
            if (data.messages && data.messages.length > 0) {
                this.aiChatCache.set(conversationId, data.messages); // Update Cache
                
                // Only redraw if we didn't have cache (prevent jitter)
                if (!hadCache) {
                    // Hide container while rendering to prevent scroll flicker
                    messagesContainer.style.visibility = 'hidden';

                    messagesContainer.innerHTML = '';
                    data.messages.forEach(msg => {
                        this.addMessageToChat(msg.role, msg.content, false, false);
                    });

                    // Scroll to bottom while still hidden
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;

                    // Reveal properly scrolled content after layout calculation
                    requestAnimationFrame(() => {
                        messagesContainer.style.visibility = 'visible';
                    });
                }
            } else {
                if (!hadCache) {
                     messagesContainer.innerHTML = ''; // Clear spinner before intro
                     messagesContainer.style.visibility = 'visible'; // Ensure visible for intro
                     this.triggerSmartIntro(); // No history ever? Do intro.
                }
            }

        } catch (error) {
            console.log('Error loading history:', error);
            if (!this.aiChatCache.has(conversationId)) {
                this.addMessageToChat('assistant', "I'm ready. (History load failed)", false);
            }
        }
    }

    async triggerSmartIntro() {
        const messagesContainer = document.getElementById('aiChatMessages');
        if (!messagesContainer) return;

        const conversation = this.parent.getSelectedConversation();
        const businessName = conversation ? conversation.business_name : 'this deal';

        // Simple welcome message - no API call
        const message = `How can I help you with **${businessName}** today?`;
        this.addMessageToChat('assistant', message, false);
    }
}
