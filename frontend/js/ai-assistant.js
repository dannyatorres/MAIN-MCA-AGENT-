// ai-assistant.js - Fixed AI assistant chat functionality

export default class AIAssistant {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = parent.apiBaseUrl;
        this.utils = parent.utils;

        // AI state
        this.aiContext = [];
        this.isTyping = false;
        this.currentConversationId = null;

        this.init();
    }

    init() {
        console.log('AI Assistant initialized');
    }

    initializeAIChat() {
        console.log('Initializing AI chat interface');

        // Use a slight delay to ensure DOM is ready
        setTimeout(() => {
            this.loadChatHistory();
            const chatInput = document.getElementById('aiChatInput');
            const sendButton = document.getElementById('aiChatSend');

            console.log('Found elements:', { input: !!chatInput, button: !!sendButton });

            if (chatInput) {
                // Clear any existing event listeners
                chatInput.removeEventListener('input', this.handleInput);
                chatInput.removeEventListener('keydown', this.handleKeydown);

                // Auto-resize textarea
                const handleInput = (e) => {
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
                };

                // Handle Enter key
                const handleKeydown = (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        console.log('Enter key pressed, sending message');
                        this.sendAIMessage();
                    }
                };

                chatInput.addEventListener('input', handleInput);
                chatInput.addEventListener('keydown', handleKeydown);
            }

            if (sendButton) {
                // Clear any existing event listeners
                const oldHandler = sendButton.onclick;
                sendButton.onclick = null;

                const handleSendClick = (e) => {
                    e.preventDefault();
                    console.log('Send button clicked via event listener');
                    this.sendAIMessage();
                };

                sendButton.addEventListener('click', handleSendClick);

                // Also add inline onclick as backup with bound context
                sendButton.onclick = (e) => {
                    e.preventDefault();
                    console.log('Send button clicked via onclick backup');
                    this.sendAIMessage();
                    return false;
                };
            } else {
                console.error('Send button not found!');
            }

            this.loadAIContext();
        }, 200);
    }

    askQuestion(question) {
        console.log('Quick question:', question);
        const input = document.getElementById('aiChatInput');
        if (input) {
            input.value = question;
            this.sendAIMessage();
        }
    }

    async sendAIMessage() {
        console.log('=== sendAIMessage called ===');

        const input = document.getElementById('aiChatInput');
        const messagesContainer = document.getElementById('aiChatMessages');

        console.log('sendAIMessage called', {
            input: !!input,
            inputValue: input?.value,
            container: !!messagesContainer
        });

        if (!input) {
            console.error('Input element not found');
            return;
        }

        if (!messagesContainer) {
            console.error('Messages container not found');
            return;
        }

        const message = input.value.trim();
        console.log('Message to send:', message);

        if (!message) {
            console.log('No message to send - empty input');
            return;
        }

        // Clear input
        input.value = '';
        input.style.height = 'auto';

        // Add user message
        this.addMessageToChat('user', message, true);

        // Show typing indicator
        this.showTypingIndicator();

        try {
            // Get current conversation ID
            const conversationId = this.parent.getCurrentConversationId();

            console.log('Sending AI request for conversation:', conversationId);

            // Call the AI API endpoint
            const response = await fetch(`${this.apiBaseUrl}/api/ai/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: message,
                    conversationId: conversationId
                })
            });

            if (!response.ok) {
                throw new Error(`AI API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            this.hideTypingIndicator();

            if (data.success && data.response) {
                this.addMessageToChat('assistant', data.response, true);
            } else {
                throw new Error(data.error || 'AI response was empty');
            }

        } catch (error) {
            console.error('AI chat error:', error);
            this.hideTypingIndicator();

            // Show a helpful error message
            let errorMessage = 'I apologize, but I encountered an error. ';
            if (error.message.includes('AI API error')) {
                errorMessage += 'The AI service is currently unavailable. Please try again later.';
            } else if (error.message.includes('fetch')) {
                errorMessage += 'Unable to connect to the AI service. Please check your connection.';
            } else {
                errorMessage += 'Please try again.';
            }

            this.addMessageToChat('assistant', errorMessage, false);
        }
    }

    addMessageToChat(role, content, saveToDatabase = true) {
        const messagesContainer = document.getElementById('aiChatMessages');
        if (!messagesContainer) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-chat-message ${role}`;
        messageDiv.style.marginBottom = '12px';

        const messageBubble = document.createElement('div');
        messageBubble.className = 'message-bubble';
        messageBubble.style.cssText = role === 'user'
            ? 'background: #667eea; color: white; padding: 10px 14px; border-radius: 18px; max-width: 70%; margin-left: auto; text-align: right;'
            : 'background: white; color: #1f2937; padding: 10px 14px; border-radius: 18px; max-width: 70%; border: 1px solid #e5e7eb;';

        // Format the content (convert line breaks, etc)
        messageBubble.innerHTML = this.formatAIResponse(content);

        if (role === 'user') {
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.justifyContent = 'flex-end';
            wrapper.appendChild(messageBubble);
            messageDiv.appendChild(wrapper);
        } else {
            messageDiv.appendChild(messageBubble);
        }

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Save to database if requested
        if (saveToDatabase) {
            this.saveMessageToDatabase(role, content);
        }
    }

    formatAIResponse(content) {
        let formatted = content;

        // Fix encoding issues
        formatted = formatted.replace(/â€¢/g, '•');
        formatted = formatted.replace(/â€™/g, "'");
        formatted = formatted.replace(/â€œ/g, '"');
        formatted = formatted.replace(/â€/g, '"');

        // Convert line breaks
        formatted = formatted.replace(/\n/g, '<br>');

        // Bold text
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // Bullet points with better styling
        formatted = formatted.replace(/^• /gm, '<span style="color: #667eea;">•</span> ');

        return formatted;
    }

    showTypingIndicator() {
        const messagesContainer = document.getElementById('aiChatMessages');
        if (!messagesContainer) return;

        this.hideTypingIndicator();

        const typingDiv = document.createElement('div');
        typingDiv.id = 'aiTypingIndicator';
        typingDiv.style.marginBottom = '12px';

        typingDiv.innerHTML = `
            <div style="display: inline-flex; gap: 4px; padding: 12px 16px; background: white; border: 1px solid #e5e7eb; border-radius: 18px;">
                <div class="typing-dot" style="width: 8px; height: 8px; background: #9ca3af; border-radius: 50%; animation: typing 1.4s infinite;"></div>
                <div class="typing-dot" style="width: 8px; height: 8px; background: #9ca3af; border-radius: 50%; animation: typing 1.4s infinite; animation-delay: 0.2s;"></div>
                <div class="typing-dot" style="width: 8px; height: 8px; background: #9ca3af; border-radius: 50%; animation: typing 1.4s infinite; animation-delay: 0.4s;"></div>
            </div>
        `;

        messagesContainer.appendChild(typingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    hideTypingIndicator() {
        const indicator = document.getElementById('aiTypingIndicator');
        if (indicator) {
            indicator.remove();
        }
    }

    async loadChatHistory() {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) return;

        // Only reload if conversation has changed
        if (this.currentConversationId === conversationId) {
            console.log('Chat history already loaded for conversation:', conversationId);
            return;
        }

        this.currentConversationId = conversationId;
        console.log('📚 Loading chat history for conversation:', conversationId);

        try {
            // Try to load from database first
            const response = await fetch(`${this.apiBaseUrl}/api/ai/chat/${conversationId}`);
            if (response.ok) {
                const chatHistory = await response.json();
                console.log('✅ Loaded chat history from database:', chatHistory.length, 'messages');
                this.renderChatHistory(chatHistory);
                return;
            } else {
                console.warn('⚠️ Failed to load from database:', response.status);
            }
        } catch (error) {
            console.error('❌ Error loading AI chat history from database:', error);
        }

        // Fallback to memory storage
        if (this.memoryMessages && this.memoryMessages.has(conversationId)) {
            const memoryHistory = this.memoryMessages.get(conversationId);
            console.log('📝 Loaded chat history from memory:', memoryHistory.length, 'messages');
            this.renderChatHistory(memoryHistory);
        } else {
            console.log('📝 No chat history found in memory for this conversation');
        }
    }

    renderChatHistory(messages) {
        const messagesContainer = document.getElementById('aiChatMessages');
        if (!messagesContainer) return;

        messagesContainer.innerHTML = '';
        messages.forEach(message => {
            this.addMessageToChat(message.role, message.content, false);
        });
    }

    async saveMessageToDatabase(role, content) {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) {
            console.log('❌ No conversation ID for saving AI message');
            return;
        }

        console.log('💾 Attempting to save AI message to database:', {
            conversationId,
            role,
            content: content.substring(0, 50) + '...',
            endpoint: `${this.apiBaseUrl}/api/ai/chat/${conversationId}/messages`
        });

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/ai/chat/${conversationId}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    role: role,
                    content: content
                })
            });

            if (response.ok) {
                console.log('✅ AI message saved to database successfully');
            } else {
                const errorText = await response.text();
                console.error('❌ Failed to save AI message to database:', response.status, errorText);
            }
        } catch (error) {
            console.error('❌ Error saving AI message to database:', error);
            // For now, store in memory as fallback
            this.storeMessageInMemory(conversationId, role, content);
        }
    }

    storeMessageInMemory(conversationId, role, content) {
        if (!this.memoryMessages) {
            this.memoryMessages = new Map();
        }

        if (!this.memoryMessages.has(conversationId)) {
            this.memoryMessages.set(conversationId, []);
        }

        this.memoryMessages.get(conversationId).push({
            role,
            content,
            created_at: new Date().toISOString()
        });

        console.log('💭 Stored AI message in memory as fallback');
    }

    loadAIContext() {
        const conversation = this.parent.getSelectedConversation();
        if (!conversation) return;

        this.aiContext = [{
            role: 'system',
            content: `AI Assistant for lead: ${conversation.business_name || 'Unknown'}`
        }];
    }
}