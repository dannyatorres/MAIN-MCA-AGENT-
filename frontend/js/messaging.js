// messaging.js - Complete messaging functionality

class MessagingModule {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = parent.apiBaseUrl;
        this.utils = parent.utils;
        this.templates = parent.templates;

        // Messaging state
        this.messagePollingInterval = null;
        this.aiSuggestionsVisible = false;
        this.firstMessageSent = false;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.requestNotificationPermissionOnDemand();
    }

    setupEventListeners() {
        // Message input and send
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        const aiBtn = document.getElementById('aiBtn');

        if (messageInput) {
            messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
        }

        if (aiBtn) {
            aiBtn.addEventListener('click', () => this.toggleAISuggestions());
        }

        // AI suggestions
        const closeSuggestions = document.getElementById('closeSuggestions');
        if (closeSuggestions) {
            closeSuggestions.addEventListener('click', () => this.hideAISuggestions());
        }
    }

    async loadConversationMessages(conversationId = null) {
        console.log('🔄 loadConversationMessages called');
        const convId = conversationId || this.parent.getCurrentConversationId();
        console.log('🔄 Current conversation ID:', convId);
        if (!convId) {
            console.log('❌ No conversation ID found, returning');
            return;
        }

        try {
            console.log(`📨 Loading messages for conversation: ${convId}`);
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${convId}/messages`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`Loaded ${data?.length || 0} messages`);

            this.renderMessages(data || []);
        } catch (error) {
            this.utils.handleError(error, 'Error loading messages', `Failed to load messages: ${error.message}`);

            const container = document.getElementById('messagesContainer');
            if (container) {
                container.innerHTML = `
                    <div class="error-state">
                        <div class="error-icon">⚠️</div>
                        <h3>Messages Failed to Load</h3>
                        <p>${error.message}</p>
                        <button onclick="window.conversationUI.messaging.loadConversationMessages()" class="retry-btn">
                            Retry
                        </button>
                    </div>
                `;
            }
        }
    }

    renderMessages(messages) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;

        // Sort messages by timestamp
        if (messages.length > 0) {
            messages.sort((a, b) => new Date(a.timestamp || a.created_at) - new Date(b.timestamp || b.created_at));
        }

        container.innerHTML = this.templates.messagesList(messages);

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    }

    addMessage(message) {
        const conversationId = this.parent.getCurrentConversationId();
        if (message.conversation_id !== conversationId) return;

        const messagesContainer = document.getElementById('messagesContainer');
        const messagesList = messagesContainer?.querySelector('.messages-list');

        if (messagesList) {
            const messageElement = document.createElement('div');
            messageElement.innerHTML = this.templates.messageItem(message);
            messagesList.appendChild(messageElement.firstElementChild);

            // Scroll to bottom
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    async sendMessage() {
        // Request notification permission on first message
        if (this.firstMessageSent !== true) {
            this.firstMessageSent = true;
            this.requestNotificationPermissionOnDemand();
        }

        const messageInput = document.getElementById('messageInput');
        const conversationId = this.parent.getCurrentConversationId();

        if (!messageInput || !conversationId) return;

        const message = messageInput.value.trim();
        if (!message) return;

        // Clear input immediately
        messageInput.value = '';

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conversationId}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message_content: message,
                    sender_type: 'user'
                })
            });

            if (response.ok) {
                // Reload messages in current conversation
                await this.loadConversationMessages();

                // Update conversation timestamp
                this.updateConversationAfterMessage(conversationId);

            } else {
                // Restore message if failed
                messageInput.value = message;
                const errorData = await response.text();
                throw new Error(`Failed to send message: ${response.status} - ${errorData}`);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            // Restore message in input if failed
            if (messageInput.value === '') {
                messageInput.value = message;
            }
            this.utils.showNotification(`Failed to send message: ${error.message}`, 'error');
        }
    }

    async updateConversationAfterMessage(conversationId) {
        // Update the last activity timestamp for this conversation
        const conversations = this.parent.getConversations();
        const conversation = conversations.get(conversationId);

        if (conversation) {
            conversation.last_activity = new Date().toISOString();
            conversations.set(conversationId, conversation);

            // Update just the time in the UI without re-rendering everything
            const timeAgoElement = document.querySelector(`[data-conversation-id="${conversationId}"] .time-ago`);
            if (timeAgoElement) {
                timeAgoElement.textContent = 'Just now';
            }
        }
    }

    // AI Suggestions
    async toggleAISuggestions() {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) return;

        if (this.aiSuggestionsVisible) {
            this.hideAISuggestions();
            return;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conversationId}/ai-response`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messageType: 'followup',
                    generateMultiple: true,
                    context: {}
                })
            });

            const data = await response.json();
            this.showAISuggestions(data.response);
        } catch (error) {
            this.utils.handleError(error, 'Error generating AI suggestions', 'Failed to generate suggestions');
        }
    }

    showAISuggestions(suggestions) {
        const aiSuggestions = document.getElementById('aiSuggestions');
        const suggestionsList = document.getElementById('suggestionsList');

        if (!aiSuggestions || !suggestionsList) return;

        suggestionsList.innerHTML = suggestions.map((suggestion, index) => `
            <div class="suggestion-item" data-index="${index}">
                <p>${suggestion}</p>
                <button class="use-suggestion-btn" onclick="window.conversationUI.messaging.useSuggestion('${suggestion.replace(/'/g, "\\'")}')">
                    Use
                </button>
            </div>
        `).join('');

        aiSuggestions.style.display = 'block';
        this.aiSuggestionsVisible = true;
    }

    hideAISuggestions() {
        const aiSuggestions = document.getElementById('aiSuggestions');
        if (aiSuggestions) {
            aiSuggestions.style.display = 'none';
        }
        this.aiSuggestionsVisible = false;
    }

    useSuggestion(suggestion) {
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.value = suggestion;
            messageInput.focus();
        }
        this.hideAISuggestions();
    }

    // Notification handling
    handleIncomingMessage(data) {
        console.log('Handling incoming message:', data);

        const conversationId = this.parent.getCurrentConversationId();

        // Add to unread count if not current conversation
        if (data.conversation_id !== conversationId) {
            const unreadMessages = this.parent.unreadMessages || new Map();
            const currentCount = unreadMessages.get(data.conversation_id) || 0;
            unreadMessages.set(data.conversation_id, currentCount + 1);

            // Play notification sound
            this.playNotificationSound();

            // Show browser notification if allowed
            this.showBrowserNotification(data);
        } else {
            // If it's current conversation, just reload messages
            this.loadConversationMessages();
        }

        // Always refresh conversation list to update order and show badge
        if (this.parent.conversationCore) {
            this.parent.conversationCore.loadConversations();
        }

        // Show in-app notification
        this.utils.showNotification('New message received!', 'info');
    }

    playNotificationSound() {
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRl9vT19SABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmFgU7k9n1unEiBC13yO/eizEIHWq+8+OZURE');
            audio.volume = 0.5;
            audio.play().catch(e => console.log('Could not play notification sound'));
        } catch (e) {
            console.log('Could not play notification sound');
        }
    }

    showBrowserNotification(data) {
        if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification('New Message', {
                body: data.message.content.substring(0, 100),
                icon: '/favicon.ico',
                tag: 'message-' + data.conversation_id
            });

            notification.onclick = () => {
                window.focus();
                if (this.parent.conversationCore) {
                    this.parent.conversationCore.selectConversation(data.conversation_id);
                }
                notification.close();
            };
        }
    }

    requestNotificationPermissionOnDemand() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                console.log('Notification permission:', permission);
            }).catch(error => {
                console.log('Notification permission error (non-fatal):', error);
            });
        }
    }
}