// js/ai-assistant.js
// REFACTORED: Combined Controller (Logic) + View (Render)

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
    // 1. VIEW / RENDER LOGIC (Moved from ai-tab.js)
    // ============================================================

    /**
     * Called by IntelligenceManager when the AI tab is clicked
     * @param {HTMLElement} container - The DOM element to render into
     */
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

        // Prevent double-init (safe-guard against app-core.js redundant calls)
        if (this.currentConversationId === conversationId && this.isInitialized) {
            console.log('AI already initialized for this ID');
            return;
        }

        this.currentConversationId = conversationId;
        this.isInitialized = true;

        console.log('⚡ Initializing AI Logic for ID:', conversationId);

        // 1. Bind Events to the elements we just rendered
        this.setupEventHandlers();

        // 2. Load Context & History
        this.loadAIContext();
        this.loadChatHistory();
    }

    setupEventHandlers() {
        const chatInput = document.getElementById('aiChatInput');
        const sendButton = document.getElementById('aiChatSend');

        if (!chatInput || !sendButton) {
            console.error('❌ AI UI Elements not found during binding');
            return;
        }

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
        this.addMessageToChat('user', message, false); // Optimistic UI update
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
                this.addMessageToChat('assistant', data.response || data.fallback, false);
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

        // FIX: Only scroll if requested. This prevents stuttering during history load.
        if (scrollToBottom) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        if (saveToDatabase) {
            this.saveMessageToDatabase(role, content);
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
    // 4. DATA LOADING
    // ============================================================

    async loadChatHistory() {
        const conversationId = this.parent.getCurrentConversationId();
        const messagesContainer = document.getElementById('aiChatMessages');
        if (!messagesContainer) return;

        try {
            const data = await this.parent.apiCall(`/api/ai/chat/${conversationId}`);

            // 1. Use visibility hidden instead of opacity (prevents layout flashing)
            messagesContainer.style.visibility = 'hidden';

            // 2. CRITICAL: Force 'auto' scroll behavior to prevent the "scrolling" animation
            messagesContainer.style.scrollBehavior = 'auto';

            // Clear "Connecting..." message
            messagesContainer.innerHTML = '';

            if (data.messages && data.messages.length > 0) {
                // Add messages WITHOUT scrolling (pass false as 4th arg)
                data.messages.forEach(msg => {
                    this.addMessageToChat(msg.role, msg.content, false, false);
                });

                // 3. Snap to bottom instantly
                messagesContainer.scrollTop = messagesContainer.scrollHeight;

            } else {
                this.showWelcomeMessage();
            }

            // 4. Force a "Reflow". Accessing offsetHeight forces the browser to
            // calculate the layout (and the scroll position) BEFORE it paints the screen.
            const forceLayout = messagesContainer.offsetHeight;

            // 5. Make visible again
            messagesContainer.style.visibility = 'visible';

            // 6. Re-enable smooth scrolling for future messages (UX polish)
            // We use a slight timeout to ensure the initial load is completely done
            setTimeout(() => {
                messagesContainer.style.scrollBehavior = 'smooth';
            }, 100);

        } catch (error) {
            console.log('Error loading history:', error);
            messagesContainer.innerHTML = '';
            messagesContainer.style.visibility = 'visible'; // Ensure visible on error
            this.showWelcomeMessage();
        }
    }

    showWelcomeMessage() {
        const conversation = this.parent.getSelectedConversation();
        const businessName = conversation?.business_name || 'this lead';
        this.addMessageToChat('assistant', `Hi! I'm ready to help with **${businessName}**.`, false);
    }

    async saveMessageToDatabase(role, content) {
        const conversationId = this.parent.getCurrentConversationId();
        this.parent.apiCall(`/api/ai/chat/${conversationId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ role, content })
        }).catch(err => console.warn('Failed to save msg', err));
    }

    async loadAIContext() {
        // (Keep your existing FCS loading logic here if you wish)
    }
}
