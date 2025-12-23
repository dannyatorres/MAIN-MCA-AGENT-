// messaging.js - Robust Messaging (Delegate to Core)

class MessagingModule {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = parent.apiBaseUrl;
        this.utils = parent.utils;
        this.templates = parent.templates;

        // Message Cache Store
        this.messageCache = new Map();
        this.eventListenersAttached = false;
        this.firstMessageSent = false;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.requestNotificationPermissionOnDemand();
    }

    // ============================================================
    // 1. INCOMING EVENTS (The "Fix")
    // ============================================================

    handleIncomingMessage(data) {
        // Handle nested objects from different socket structures
        const message = data.message || data;
        const messageConversationId = String(data.conversation_id || message.conversation_id);
        const currentConversationId = String(this.parent.getCurrentConversationId());

        // 1. Always update the Data Layer (Conversation List)
        if (this.parent.conversationUI) {
            const conv = this.parent.conversationUI.conversations.get(Number(messageConversationId));
            if (conv) {
                conv.last_message = message.content || 'New Message';
                conv.last_activity = new Date().toISOString();
                this.parent.conversationUI.conversations.set(Number(messageConversationId), conv);
                this.parent.conversationUI.renderConversationsList();
            }
        }

        // 2. Decide: Is it "Read" or "Unread"?
        if (messageConversationId === currentConversationId && !document.hidden) {
            // We are looking at it right now. Just render it.
            this.addMessage(message);
        } else {
            // It is UNREAD. Delegate to Core to handle persistence.
            if (this.parent.conversationUI) {
                this.parent.conversationUI.incrementBadge(messageConversationId);
            }

            // 3. Notify user (Only if NOT sent by 'user')
            if (message.sender_type !== 'user') {
                this.playNotificationSound();
                this.showBrowserNotification(data);
            }
        }
    }

    // ============================================================
    // 2. RENDERING
    // ============================================================

    async loadConversationMessages(conversationId = null) {
        const convId = String(conversationId || this.parent.getCurrentConversationId());
        if (!convId) return;

        const container = document.getElementById('messagesContainer');

        // 1. Cache First
        if (this.messageCache.has(convId)) {
            this.renderMessages(this.messageCache.get(convId));
        } else {
            if (container) container.innerHTML = '<div class="loading-spinner"></div>';
        }

        try {
            // 2. Fetch Fresh
            const data = await this.parent.apiCall(`/api/conversations/${convId}/messages`);
            this.messageCache.set(convId, data || []);

            // Render only if still active
            if (String(this.parent.getCurrentConversationId()) === convId) {
                this.renderMessages(data || []);
            }
            this.updateAIButtonState(convId);
        } catch (error) {
            console.error('Load messages error:', error);
            if (!this.messageCache.has(convId)) {
                this.utils.handleError(error, 'Error loading messages', 'Failed to load messages');
            }
        }
    }

    renderMessages(messages) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;

        const sorted = [...messages].sort((a, b) =>
            new Date(a.timestamp || a.created_at) - new Date(b.timestamp || b.created_at)
        );
        container.innerHTML = this.templates.messagesList(sorted);
        setTimeout(() => container.scrollTop = container.scrollHeight, 50);
    }

    addMessage(message) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;

        // Remove empty state
        const emptyState = container.querySelector('.empty-state');
        if (emptyState) emptyState.remove();

        // Dedup Check
        const msgId = String(message.id);
        if (container.querySelector(`.message[data-message-id="${msgId}"]`)) return;

        // Render
        const html = this.parent.templates.messageItem(message);
        const list = container.querySelector('.messages-list');

        if (list) {
            list.insertAdjacentHTML('beforeend', html);
        } else {
            container.innerHTML = `<div class="messages-list">${html}</div>`;
        }

        // Cache update
        const convId = String(message.conversation_id);
        if (this.messageCache.has(convId)) {
            const cached = this.messageCache.get(convId);
            if (!cached.find(m => String(m.id) === msgId)) {
                cached.push(message);
            }
        }

        // Animation
        const newMsgElement = container.querySelector(`.message[data-message-id="${msgId}"]`);
        if (newMsgElement) {
            newMsgElement.classList.add('new-message');
        }

        // Scroll
        this.scrollToBottom();
    }

    scrollToBottom() {
        const container = document.getElementById('messagesContainer');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    // ============================================================
    // 3. SENDING
    // ============================================================

    async sendMessage(textOverride = null, mediaUrl = null) {
        const input = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');

        const content = textOverride !== null ? textOverride : input.value.trim();
        const conversationId = this.parent.getCurrentConversationId();

        if ((!content && !mediaUrl) || !conversationId) return;

        if (input) input.disabled = true;
        if (sendBtn) sendBtn.disabled = true;

        if (this.firstMessageSent !== true) {
            this.firstMessageSent = true;
            this.requestNotificationPermissionOnDemand();
        }

        try {
            const result = await this.parent.apiCall(`/api/conversations/${conversationId}/messages`, {
                method: 'POST',
                body: JSON.stringify({
                    message_content: content || '',
                    sender_type: 'user',
                    media_url: mediaUrl,
                    message_type: mediaUrl ? 'mms' : 'sms'
                })
            });

            // If success, add to UI immediately
            if (result && result.message) {
                this.addMessage(result.message);
            }

            this.updateConversationAfterMessage(conversationId);

        } catch (error) {
            console.error('Error sending message:', error);
            this.parent.utils.showNotification('Failed to send message', 'error');
            if (textOverride === null && input) input.value = content;
        } finally {
            if (input) {
                input.disabled = false;
                input.focus();
                if (textOverride === null) {
                    input.value = '';
                    input.style.height = 'auto';
                }
            }
            if (sendBtn) sendBtn.disabled = false;
        }
    }

    async updateConversationAfterMessage(conversationId) {
        const conversations = this.parent.getConversations();
        const conversation = conversations.get(conversationId);

        if (conversation) {
            conversation.last_activity = new Date().toISOString();
            conversations.set(conversationId, conversation);

            const timeAgoElement = document.querySelector(`[data-conversation-id="${conversationId}"] .time-ago`);
            if (timeAgoElement) {
                timeAgoElement.textContent = 'Just now';
            }
        }
    }

    // ============================================================
    // 4. FILE UPLOAD
    // ============================================================

    async handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const attachBtn = document.getElementById('attachmentBtn');
        const originalIcon = attachBtn.innerHTML;
        attachBtn.innerHTML = '⏳';
        attachBtn.disabled = true;

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/messages/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.url) {
                await this.sendMessage(null, data.url);
            } else {
                alert('Upload failed: Server did not return a URL');
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert('Failed to upload image');
        } finally {
            attachBtn.innerHTML = originalIcon;
            attachBtn.disabled = false;
            e.target.value = '';
        }
    }

    // ============================================================
    // 5. AI SUGGESTIONS
    // ============================================================

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

    // ============================================================
    // 6. DELETE MESSAGE
    // ============================================================

    async deleteMessage(messageId) {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) return;

        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageElement) return;

        if (!confirm('Delete this message?')) return;

        const cleanMessageId = messageId.includes(':') ? messageId.split(':')[0] : messageId;

        try {
            await this.parent.apiCall(`/api/conversations/${conversationId}/messages/${cleanMessageId}`, {
                method: 'DELETE'
            });

            messageElement.style.opacity = '0';
            setTimeout(() => {
                messageElement.remove();
                if (this.messageCache.has(String(conversationId))) {
                    const cached = this.messageCache.get(String(conversationId));
                    const updatedCache = cached.filter(m => String(m.id) !== String(cleanMessageId));
                    this.messageCache.set(String(conversationId), updatedCache);
                }
            }, 300);
        } catch (error) {
            console.error('Delete failed:', error);
            if (error.message && error.message.includes('404')) {
                messageElement.remove();
            }
        }
    }

    // ============================================================
    // 7. UTILITIES
    // ============================================================

    playNotificationSound() {
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRl9vT19SABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmFgU7k9n1unEiBC13yO/eizEIHWq+8+OZURE');
            audio.volume = 0.5;
            audio.play().catch(() => {});
        } catch (e) { /* ignore */ }
    }

    showBrowserNotification(data) {
        if ('Notification' in window && Notification.permission === 'granted') {
            const message = data.message || data;
            new Notification('New Message', {
                body: (message.content || '').substring(0, 100),
                icon: '/favicon.ico',
                tag: 'message-' + (data.conversation_id || message.conversation_id)
            });
        }
    }

    requestNotificationPermissionOnDemand() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    async updateAIButtonState(conversationId) {
        const btn = document.getElementById('aiToggleBtn');
        if (!btn) return;
        try {
            const response = await this.parent.apiCall(`/api/conversations/${conversationId}`);
            const conversation = response.conversation || response;
            if (conversation) {
                btn.dataset.state = (conversation.ai_enabled !== false) ? 'on' : 'off';
            }
        } catch (e) { console.error(e); }
    }

    async toggleAI(newState) {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) return;

        const btn = document.getElementById('aiToggleBtn');
        const oldState = btn.dataset.state;
        btn.dataset.state = newState ? 'on' : 'off';

        try {
            await this.parent.apiCall(`/api/conversations/${conversationId}/toggle-ai`, {
                method: 'POST', body: JSON.stringify({ enabled: newState })
            });
        } catch (error) {
            btn.dataset.state = oldState;
            this.parent.utils.showNotification('Failed to toggle AI', 'error');
        }
    }

    // ============================================================
    // 8. EVENT LISTENERS
    // ============================================================

    setupEventListeners() {
        if (this.eventListenersAttached) return;

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

        // AI suggestions close
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
                        this.deleteMessage(messageId);
                    }
                }
            });
        }

        // Attachment Button
        const attachBtn = document.getElementById('attachmentBtn');
        const fileInput = document.getElementById('fileInput');

        if (attachBtn && fileInput) {
            attachBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        }

        // AI Toggle Button
        const aiToggleBtn = document.getElementById('aiToggleBtn');
        if (aiToggleBtn) {
            aiToggleBtn.addEventListener('click', () => {
                const isCurrentlyOn = aiToggleBtn.dataset.state === 'on';
                this.toggleAI(!isCurrentlyOn);
            });
        }

        this.eventListenersAttached = true;
    }
}
