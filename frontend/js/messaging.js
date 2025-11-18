// messaging.js - Complete messaging functionality with Real-time WebSocket Updates

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
        this.setupWebSocketListeners(); // NEW: Connect to WebSocket events
        this.requestNotificationPermissionOnDemand();
    }

    // NEW: Setup WebSocket listeners for real-time updates
    setupWebSocketListeners() {
        // Check if global Socket.io connection exists
        if (window.globalSocket) {
            console.log('✅ Connecting messaging module to WebSocket...');

            // Listen for new messages
            window.globalSocket.on('new_message', (data) => {
                console.log('📨 Real-time message received:', data);
                this.handleIncomingMessage(data);
            });

            // Listen for conversation updates
            window.globalSocket.on('conversation_updated', (data) => {
                console.log('📋 Conversation updated:', data);
                // Reload conversation list if needed
                if (this.parent.conversationUI) {
                    this.parent.conversationUI.loadConversations();
                }
            });

            console.log('✅ WebSocket listeners attached to messaging module');
        } else {
            console.warn('⚠️ Global Socket not available yet, will retry...');
            // Retry after a delay
            setTimeout(() => this.setupWebSocketListeners(), 1000);
        }
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

        // Event delegation for delete buttons
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            messagesContainer.addEventListener('click', (e) => {
                const deleteBtn = e.target.closest('.delete-message-btn');
                if (deleteBtn) {
                    e.preventDefault();
                    e.stopPropagation();

                    const messageId = deleteBtn.dataset.messageId;
                    if (messageId) {
                        console.log('Delete button clicked for message:', messageId);
                        this.deleteMessage(messageId);
                    }
                }
            });

            console.log('✅ Delete button event delegation set up');
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
            const data = await this.parent.apiCall(`/api/conversations/${convId}/messages`);
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

        // Scroll to bottom (Wrapped in timeout to ensure DOM paint)
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 50);
    }

    addMessage(message) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;

        // 1. Remove empty state if it exists
        const emptyState = container.querySelector('.empty-state');
        if (emptyState) emptyState.remove();

        // 2. Duplicate Check
        if (document.querySelector(`.message[data-message-id="${message.id}"]`)) {
            console.log('Skipping duplicate message render:', message.id);
            return;
        }

        // 3. Generate HTML
        const html = this.parent.templates.messageItem(message);

        // 4. TARGET THE CORRECT WRAPPER (The Fix)
        // We must append to .messages-list, otherwise CSS alignment won't work.
        let list = container.querySelector('.messages-list');

        if (list) {
            // Wrapper exists, append to it
            list.insertAdjacentHTML('beforeend', html);
        } else {
            // Wrapper doesn't exist (first message), create it
            container.innerHTML = `
                <div class="messages-list">
                    ${html}
                </div>
            `;
        }

        // 5. Scroll to bottom
        this.scrollToBottom();
    }

    scrollToBottom() {
        const container = document.getElementById('messagesContainer');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    async sendMessage() {
        const input = document.getElementById('messageInput');
        const content = input.value.trim();
        const conversationId = this.parent.getCurrentConversationId();

        if (!content || !conversationId) return;

        // Request notification permission on first message
        if (this.firstMessageSent !== true) {
            this.firstMessageSent = true;
            this.requestNotificationPermissionOnDemand();
        }

        // Clear input immediately for better UX
        input.value = '';
        input.style.height = 'auto'; // Reset height

        try {
            const result = await this.parent.apiCall(`/api/conversations/${conversationId}/messages`, {
                method: 'POST',
                body: JSON.stringify({
                    message_content: content,
                    sender_type: 'user'
                })
            });

            if (result && result.message) {
                // ✅ INSTANT UPDATE: Manually add the message to the UI
                // We don't wait for the WebSocket here.
                this.addMessage(result.message);
            }

            // Update conversation timestamp
            this.updateConversationAfterMessage(conversationId);

        } catch (error) {
            console.error('Error sending message:', error);
            this.parent.utils.showNotification('Failed to send message', 'error');
            // Restore the text so the user doesn't lose it
            input.value = content;
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
            const data = await this.parent.apiCall(`/api/conversations/${conversationId}/ai-response`, {
                method: 'POST',
                body: JSON.stringify({
                    messageType: 'followup',
                    generateMultiple: true,
                    context: {}
                })
            });

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

    // IMPROVED: Real-time incoming message handler with verbose logging
    handleIncomingMessage(data) {
        console.log('📨 Handling incoming message:', data);
        console.log('📨 Message data structure:', JSON.stringify(data, null, 2));

        const conversationId = this.parent.getCurrentConversationId();
        const messageConversationId = data.conversation_id;

        // If it's for the current conversation, add it to the UI immediately
        if (messageConversationId === conversationId) {
            console.log('✅ Message is for current conversation, adding to UI');

            const message = data.message || data;
            const messagesContainer = document.getElementById('messagesContainer');
            const messagesList = messagesContainer?.querySelector('.messages-list');

            if (!messagesList) {
                console.warn('⚠️ No messages list found, reloading all messages');
                this.loadConversationMessages(conversationId);
                return;
            }

            // Check for duplicates
            const existingMessage = messagesList.querySelector(`[data-message-id="${message.id}"]`);
            if (existingMessage) {
                console.log('⚠️ Message already exists in UI, skipping:', message.id);
                return;
            }

            // Create and add message
            const messageHTML = this.templates.messageItem(message);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = messageHTML;
            const messageElement = tempDiv.firstElementChild;

            // Add animation class
            messageElement.classList.add('new-message');

            messagesList.appendChild(messageElement);
            console.log('✅ Message element added to DOM');

            // Smooth scroll with slight delay for animation
            setTimeout(() => {
                messagesContainer.scrollTo({
                    top: messagesContainer.scrollHeight,
                    behavior: 'smooth'
                });
            }, 100);

        } else {
            console.log('📋 Message is for different conversation, updating badge');

            // Add visual badge to conversation item
            this.addConversationBadge(messageConversationId);

            // Add to unread count
            const unreadMessages = this.parent.unreadMessages || new Map();
            const currentCount = unreadMessages.get(messageConversationId) || 0;
            unreadMessages.set(messageConversationId, currentCount + 1);

            // Play notification sound
            this.playNotificationSound();

            // Show browser notification if allowed
            this.showBrowserNotification(data);
        }

        // Always refresh conversation list to update order and show badge
        if (this.parent.conversationUI) {
            this.parent.conversationUI.loadConversations();
        }

        // Show in-app notification for non-current conversations
        if (messageConversationId !== conversationId) {
            this.utils.showNotification('New message received!', 'info');
        }
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
                if (this.parent.conversationUI) {
                    this.parent.conversationUI.selectConversation(data.conversation_id);
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

    async deleteMessage(messageId) {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) return;

        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);

        if (!messageElement) {
            console.error('Message element not found');
            return;
        }

        if (messageElement.classList.contains('deleting')) {
            console.log('Message already being deleted, skipping...');
            return;
        }

        if (!confirm('Are you sure you want to delete this message?')) {
            return;
        }

        messageElement.classList.add('deleting');

        try {
            await this.parent.apiCall(`/api/conversations/${conversationId}/messages/${messageId}`, {
                method: 'DELETE'
            });

            // Smooth fade out animation
            messageElement.style.transition = 'all 0.3s ease';
            messageElement.style.opacity = '0';
            messageElement.style.transform = 'translateX(-20px)';

            setTimeout(() => {
                messageElement.remove();
                console.log('✅ Message deleted successfully');
            }, 300);

            this.utils.showNotification('Message deleted', 'success');
        } catch (error) {
            console.error('Delete message error:', error);
            messageElement.classList.remove('deleting');
            this.utils.showNotification(`Failed to delete message: ${error.message}`, 'error');
        }
    }

    // Badge management for unread conversations
    addConversationBadge(conversationId) {
        console.log('🔔 Adding badge to conversation:', conversationId);

        // Find the conversation item in the sidebar
        const conversationItem = document.querySelector(`[data-conversation-id="${conversationId}"]`);

        if (!conversationItem) {
            console.warn('⚠️ Conversation item not found for badge:', conversationId);
            return;
        }

        // Check if badge already exists
        let badge = conversationItem.querySelector('.conversation-badge');

        if (!badge) {
            // Create new badge
            badge = document.createElement('div');
            badge.className = 'conversation-badge';
            badge.textContent = '1';
            conversationItem.appendChild(badge);
            console.log('✅ Added badge to conversation:', conversationId);
        } else {
            // Increment existing badge count
            const currentCount = parseInt(badge.textContent) || 1;
            badge.textContent = currentCount + 1;
            console.log('✅ Incremented badge count:', badge.textContent);
        }

        // Store unread count in data attribute
        conversationItem.dataset.unreadCount = badge.textContent;
    }

    removeConversationBadge(conversationId) {
        console.log('🔕 Removing badge from conversation:', conversationId);

        const conversationItem = document.querySelector(`[data-conversation-id="${conversationId}"]`);

        if (conversationItem) {
            const badge = conversationItem.querySelector('.conversation-badge');
            if (badge) {
                badge.remove();
                console.log('✅ Removed badge from conversation:', conversationId);
            }

            // Clear unread count
            delete conversationItem.dataset.unreadCount;
        }
    }
}
