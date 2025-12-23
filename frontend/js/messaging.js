// messaging.js - Robust Messaging (Fixed Render Order)

class MessagingModule {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = parent.apiBaseUrl;
        this.utils = parent.utils;
        this.templates = parent.templates;
        this.messageCache = new Map();
        this.eventListenersAttached = false;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.requestNotificationPermissionOnDemand();
    }

    // ============================================================
    // INCOMING EVENTS (The Logic Fix)
    // ============================================================

    handleIncomingMessage(data) {
        const message = data.message || data;

        const rawId = data.conversation_id || message.conversation_id;
        if (!rawId) {
            console.warn('⚠️ handleIncomingMessage: No conversation ID found, ignoring');
            return;
        }

        const messageConversationId = String(rawId);
        const currentConversationId = String(this.parent.getCurrentConversationId());

        const isCurrentChat = (messageConversationId === currentConversationId && !document.hidden);

        // 1. BADGE LOGIC - Show badge for ANY message you haven't seen
        if (!isCurrentChat) {
            // Badge for inbound (lead replied) OR outbound AI (so you know AI acted)
            const isAiMessage = message.sent_by === 'ai' || message.sender_type === 'ai';
            const isLeadMessage = message.direction === 'inbound';

            if (isLeadMessage || isAiMessage) {
                if (this.parent.conversationUI) {
                    this.parent.conversationUI.incrementBadge(messageConversationId);
                }
            }
        }

        // 2. MOVE TO TOP & UPDATE PREVIEW
        if (this.parent.conversationUI) {
            this.parent.conversationUI.updateConversationPreview(messageConversationId, message);
        }

        // 3. CHAT UI (If we are looking at this specific chat)
        if (isCurrentChat) {
            this.addMessage(message);
        } else {
            // Notification sound for inbound only (not AI - that would be noisy)
            if (message.direction === 'inbound') {
                this.playNotificationSound();
                this.showBrowserNotification(data);
            }
        }
    }

    // ============================================================
    // RENDERING
    // ============================================================

    async loadConversationMessages(conversationId) {
        const convId = String(conversationId);
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
        } catch (e) {
            console.error('Load messages error', e);
            // Silent fail if we have cache
        }
    }

    renderMessages(messages) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;

        const sorted = [...messages].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        container.innerHTML = this.parent.templates.messagesList(sorted);
        setTimeout(() => container.scrollTop = container.scrollHeight, 50);
    }

    addMessage(message) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;

        // Dedup Check
        if (container.querySelector(`.message[data-message-id="${message.id}"]`)) return;

        // SCROLL FIX: Check if user is near bottom BEFORE adding content
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

        // Render
        const html = this.parent.templates.messageItem(message);
        const list = container.querySelector('.messages-list');

        if (list) list.insertAdjacentHTML('beforeend', html);
        else container.innerHTML = `<div class="messages-list">${html}</div>`;

        // Cache update
        const convId = String(message.conversation_id);
        if (this.messageCache.has(convId)) {
            this.messageCache.get(convId).push(message);
        }

        // SCROLL FIX: Only auto-scroll if user was already at/near the bottom
        // Prevents losing place when reading history
        if (isNearBottom) {
            container.scrollTop = container.scrollHeight;
        }
    }

    // ============================================================
    // SENDING
    // ============================================================

    async sendMessage(textOverride = null, mediaUrl = null) {
        const input = document.getElementById('messageInput');
        const content = textOverride !== null ? textOverride : (input ? input.value.trim() : '');
        const convId = this.parent.getCurrentConversationId();

        if ((!content && !mediaUrl) || !convId) return;

        try {
            // 1. Send to API
            const res = await this.parent.apiCall(`/api/conversations/${convId}/messages`, {
                method: 'POST',
                body: JSON.stringify({
                    message_content: content,
                    sender_type: 'user',
                    media_url: mediaUrl,
                    message_type: mediaUrl ? 'mms' : 'sms'
                })
            });

            // 2. Add bubble to chat immediately
            if (res && res.message) {
                this.addMessage(res.message);

                // 3. Update the Sidebar List (Preview + Move to Top)
                if (this.parent.conversationUI) {
                    this.parent.conversationUI.updateConversationPreview(convId, res.message);
                }
            }

            // 4. Clear input
            if (input && textOverride === null) input.value = '';

        } catch (e) {
            console.error(e);
            this.parent.utils.showNotification('Failed to send', 'error');
        }
    }

    // ============================================================
    // UTILS
    // ============================================================

    setupEventListeners() {
        if (this.eventListenersAttached) return;

        const msgInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');

        if (msgInput) {
            msgInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
            });
        }
        if (sendBtn) sendBtn.addEventListener('click', () => this.sendMessage());

        // File Upload
        const attachBtn = document.getElementById('attachmentBtn');
        const fileInput = document.getElementById('fileInput');
        if (attachBtn && fileInput) {
            attachBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        }

        // AI Toggle
        const aiToggleBtn = document.getElementById('aiToggleBtn');
        if (aiToggleBtn) {
            aiToggleBtn.addEventListener('click', () => {
                const isCurrentlyOn = aiToggleBtn.dataset.state === 'on';
                this.toggleAI(!isCurrentlyOn);
            });
        }

        this.eventListenersAttached = true;
    }

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

            const response = await fetch('/api/messages/upload', { method: 'POST', body: formData });
            const data = await response.json();

            if (data.url) {
                await this.sendMessage(null, data.url);
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

    playNotificationSound() {
        const audio = new Audio('data:audio/wav;base64,UklGRl9vT19SABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmFgU7k9n1unEiBC13yO/eizEIHWq+8+OZURE');
        audio.volume = 0.5;
        audio.play().catch(() => {});
    }

    showBrowserNotification(data) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('New Message', { body: data.message.content });
        }
    }

    requestNotificationPermissionOnDemand() {
        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    }

    async updateAIButtonState(conversationId) {
        const btn = document.getElementById('aiToggleBtn');
        if (!btn) return;
        try {
            const res = await this.parent.apiCall(`/api/conversations/${conversationId}`);
            const enabled = (res.conversation || res).ai_enabled !== false;
            btn.dataset.state = enabled ? 'on' : 'off';
        } catch (e) {}
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
        }
    }
}
