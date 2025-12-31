// messaging.js - Fixed version with event delegation

class MessagingModule {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = parent.apiBaseUrl;
        this.utils = parent.utils;
        this.templates = parent.templates;
        this.messageCache = new Map();
        this.isSending = false;
        this.lastSendTime = 0;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.requestNotificationPermissionOnDemand();
    }

    // ============================================================
    // EVENT LISTENERS - Using delegation (attach once, works always)
    // ============================================================

    setupEventListeners() {
        // Use document-level delegation - only attach ONCE ever
        if (window._messagingEventsAttached) return;
        window._messagingEventsAttached = true;

        console.log('🔧 Attaching messaging event listeners (delegation)');

        // ENTER KEY - Capture at document level
        document.addEventListener('keydown', (e) => {
            const input = document.getElementById('messageInput');
            if (!input) return;
            if (document.activeElement !== input) return;

            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // SEND BUTTON - Delegation
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('#sendMessageBtn');
            if (btn) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // ATTACHMENT BUTTON
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('#attachmentBtn');
            if (btn) {
                document.getElementById('fileInput')?.click();
            }
        });

        // FILE INPUT CHANGE
        document.addEventListener('change', (e) => {
            if (e.target.id === 'fileInput') {
                this.handleFileUpload(e);
            }
        });

        // AI TOGGLE
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('#aiToggleBtn');
            if (btn) {
                const isCurrentlyOn = btn.dataset.state === 'on';
                this.toggleAI(!isCurrentlyOn);
            }
        });

        console.log('✅ Messaging listeners ready');
    }

    // ============================================================
    // SEND MESSAGE - Optimistic UI
    // ============================================================

    async sendMessage(textOverride = null, mediaUrl = null) {
        // INSTANT BLOCK - No async, no delay
        const now = Date.now();
        if (now - this.lastSendTime < 500) {
            console.log('⚠️ Blocked: Too fast');
            return;
        }
        if (this.isSending) {
            console.log('⚠️ Blocked: Already sending');
            return;
        }

        this.lastSendTime = now;
        this.isSending = true;

        const input = document.getElementById('messageInput');
        const content = textOverride !== null ? textOverride : (input?.value.trim() || '');
        const convId = this.parent.getCurrentConversationId();

        if ((!content && !mediaUrl) || !convId) {
            this.isSending = false;
            return;
        }

        // Clear input IMMEDIATELY (feels responsive)
        if (input && textOverride === null) {
            input.value = '';
        }

        // OPTIMISTIC UI: Show message immediately with temp ID
        const tempId = `temp-${Date.now()}`;
        const optimisticMessage = {
            id: tempId,
            conversation_id: convId,
            content: content,
            message_content: content,
            sender_type: 'user',
            direction: 'outbound',
            media_url: mediaUrl,
            message_type: mediaUrl ? 'mms' : 'sms',
            created_at: new Date().toISOString(),
            status: 'sending'
        };

        // Show it NOW
        this.addMessage(optimisticMessage);

        // Fire and forget - don't await
        this.parent.apiCall(`/api/conversations/${convId}/messages`, {
            method: 'POST',
            body: JSON.stringify({
                message_content: content,
                sender_type: 'user',
                media_url: mediaUrl,
                message_type: mediaUrl ? 'mms' : 'sms'
            })
        }).then(res => {
            if (res?.message) {
                // Replace temp message with real one
                this.replaceTempMessage(tempId, res.message);
                this.parent.conversationUI?.updateConversationPreview(convId, res.message);
            }
        }).catch(e => {
            console.error('Send failed:', e);
            // Mark message as failed
            this.markMessageFailed(tempId);
            this.parent.utils?.showNotification('Failed to send', 'error');
        });

        this.isSending = false;
    }

    // Helper: Replace temp message with real one
    replaceTempMessage(tempId, realMessage) {
        const tempEl = document.querySelector(`.message[data-message-id="${tempId}"]`);
        if (tempEl) {
            tempEl.setAttribute('data-message-id', realMessage.id);
            tempEl.classList.remove('sending');
            tempEl.classList.add('sent');
        }

        // Update cache
        const convId = String(realMessage.conversation_id);
        if (this.messageCache.has(convId)) {
            const messages = this.messageCache.get(convId);
            const idx = messages.findIndex(m => m.id === tempId);
            if (idx !== -1) {
                messages[idx] = realMessage;
            }
        }
    }

    // Helper: Mark message as failed
    markMessageFailed(tempId) {
        const tempEl = document.querySelector(`.message[data-message-id="${tempId}"]`);
        if (tempEl) {
            tempEl.classList.remove('sending');
            tempEl.classList.add('failed');
            tempEl.title = 'Failed to send - click to retry';
        }
    }

    // ============================================================
    // INCOMING EVENTS
    // ============================================================

    handleIncomingMessage(data) {
        const message = data.message || data;
        const rawId = data.conversation_id || message.conversation_id;
        if (!rawId) return;

        const messageConversationId = String(rawId);
        const currentConversationId = String(this.parent.getCurrentConversationId());
        const isCurrentChat = (messageConversationId === currentConversationId && !document.hidden);

        if (!isCurrentChat) {
            const isLeadMessage = message.direction === 'inbound';
            const isAiReply = message.sent_by === 'ai' && !message.is_drip;

            if (isLeadMessage || isAiReply) {
                this.parent.conversationUI?.incrementBadge(messageConversationId);
            }
        }

        this.parent.conversationUI?.updateConversationPreview(messageConversationId, message);

        if (isCurrentChat) {
            this.addMessage(message);
        } else if (message.direction === 'inbound') {
            this.playNotificationSound();
            this.showBrowserNotification(data);
        }
    }

    // ============================================================
    // RENDERING
    // ============================================================

    async loadConversationMessages(conversationId) {
        const convId = String(conversationId);
        const container = document.getElementById('messagesContainer');

        if (this.messageCache.has(convId)) {
            this.renderMessages(this.messageCache.get(convId));
        } else if (container) {
            container.innerHTML = '<div class="loading-spinner"></div>';
        }

        try {
            const data = await this.parent.apiCall(`/api/conversations/${convId}/messages`);
            this.messageCache.set(convId, data || []);

            if (String(this.parent.getCurrentConversationId()) === convId) {
                this.renderMessages(data || []);
            }
            this.updateAIButtonState(convId);
        } catch (e) {
            console.error('Load messages error', e);
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

        // Check for exact ID match
        if (container.querySelector(`.message[data-message-id="${message.id}"]`)) return;

        // CHECK FOR DUPLICATE OUTBOUND: If this is an outbound message we just sent,
        // check if there's already a temp message with same content
        if (message.direction === 'outbound' || message.sender_type === 'user') {
            const existingMessages = container.querySelectorAll('.message.outbound, .message.user');
            for (const el of existingMessages) {
                const contentEl = el.querySelector('.message-content, .message-text');
                if (contentEl && contentEl.textContent.trim() === (message.content || message.message_content || '').trim()) {
                    // Same content - check if it's recent (within 5 seconds)
                    const msgTime = new Date(message.created_at).getTime();
                    const now = Date.now();
                    if (now - msgTime < 5000) {
                        console.log('⚠️ Duplicate outbound message blocked');
                        // Update the temp message with real ID if it's a temp
                        const tempId = el.getAttribute('data-message-id');
                        if (tempId && tempId.startsWith('temp-')) {
                            el.setAttribute('data-message-id', message.id);
                            el.classList.remove('sending');
                            el.classList.add('sent');
                        }
                        return;
                    }
                }
            }
        }

        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

        const html = this.parent.templates.messageItem(message);
        const list = container.querySelector('.messages-list');

        if (list) list.insertAdjacentHTML('beforeend', html);
        else container.innerHTML = `<div class="messages-list">${html}</div>`;

        const convId = String(message.conversation_id);
        if (this.messageCache.has(convId)) {
            this.messageCache.get(convId).push(message);
        }

        if (isNearBottom) {
            container.scrollTop = container.scrollHeight;
        }
    }

    // ============================================================
    // UTILS
    // ============================================================

    async handleFileUpload(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        const attachBtn = document.getElementById('attachmentBtn');
        const originalIcon = attachBtn?.innerHTML;
        if (attachBtn) {
            attachBtn.innerHTML = '⏳';
            attachBtn.disabled = true;
        }

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
            if (attachBtn) {
                attachBtn.innerHTML = originalIcon;
                attachBtn.disabled = false;
            }
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
            new Notification('New Message', { body: data.message?.content || 'New message' });
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
            const res = await this.parent.apiCall(`/api/conversations/${conversationId}`);
            const enabled = (res.conversation || res).ai_enabled !== false;
            btn.dataset.state = enabled ? 'on' : 'off';
        } catch (e) {}
    }

    async toggleAI(newState) {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) return;
        const btn = document.getElementById('aiToggleBtn');
        if (!btn) return;

        const oldState = btn.dataset.state;
        btn.dataset.state = newState ? 'on' : 'off';

        try {
            await this.parent.apiCall(`/api/conversations/${conversationId}/toggle-ai`, {
                method: 'POST',
                body: JSON.stringify({ enabled: newState })
            });
        } catch (error) {
            btn.dataset.state = oldState;
        }
    }
}

window.MessagingModule = MessagingModule;
