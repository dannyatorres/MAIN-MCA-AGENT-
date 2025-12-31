// messaging.js - Robust Deduplication Version

class MessagingModule {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = parent.apiBaseUrl;
        this.utils = parent.utils;
        this.templates = parent.templates;
        this.messageCache = new Map();

        // NEW: Track pending messages in memory to prevent duplicates
        this.pendingMessages = [];

        this.isSending = false;
        this.lastSendTime = 0;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.requestNotificationPermissionOnDemand();
    }

    // ============================================================
    // EVENT LISTENERS
    // ============================================================

    setupEventListeners() {
        if (window._messagingEventsAttached) return;
        window._messagingEventsAttached = true;

        console.log('🔧 Attaching messaging event listeners (delegation)');

        document.addEventListener('keydown', (e) => {
            const input = document.getElementById('messageInput');
            if (!input || document.activeElement !== input) return;
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        document.addEventListener('click', (e) => {
            if (e.target.closest('#sendMessageBtn')) {
                e.preventDefault();
                this.sendMessage();
            }
            if (e.target.closest('#attachmentBtn')) {
                document.getElementById('fileInput')?.click();
            }
            const aiBtn = e.target.closest('#aiToggleBtn');
            if (aiBtn) {
                this.toggleAI(aiBtn.dataset.state !== 'on');
            }
        });

        document.addEventListener('change', (e) => {
            if (e.target.id === 'fileInput') this.handleFileUpload(e);
        });

        console.log('✅ Messaging listeners ready');
    }

    // ============================================================
    // SEND MESSAGE
    // ============================================================

    async sendMessage(textOverride = null, mediaUrl = null) {
        const now = Date.now();
        if (now - this.lastSendTime < 500 || this.isSending) return;

        this.lastSendTime = now;
        this.isSending = true;

        const input = document.getElementById('messageInput');
        const content = textOverride !== null ? textOverride : (input?.value.trim() || '');
        const convId = this.parent.getCurrentConversationId();

        if ((!content && !mediaUrl) || !convId) {
            this.isSending = false;
            return;
        }

        if (input && textOverride === null) input.value = '';

        const tempId = `temp-${Date.now()}`;

        // 1. REGISTER PENDING MESSAGE (The Fix)
        // Store the clean text and tempID in memory
        const cleanText = content.replace(/\s+/g, '');
        this.pendingMessages.push({
            tempId: tempId,
            text: cleanText,
            conversationId: String(convId),
            timestamp: Date.now()
        });

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

        this.addMessage(optimisticMessage);

        // Add to cache immediately so it persists if we switch tabs quickly
        const convIdStr = String(convId);
        if (this.messageCache.has(convIdStr)) {
            this.messageCache.get(convIdStr).push(optimisticMessage);
        }

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
                this.replaceTempMessage(tempId, res.message);
                this.parent.conversationUI?.updateConversationPreview(convId, res.message);
            }
        }).catch(e => {
            console.error('Send failed:', e);
            this.markMessageFailed(tempId);
            this.parent.utils?.showNotification('Failed to send', 'error');
        });

        this.isSending = false;
    }

    replaceTempMessage(tempId, realMessage) {
        // Clean up memory array
        this.removePendingMessage(tempId);

        const tempEl = document.querySelector(`.message[data-message-id="${tempId}"]`);
        if (tempEl) {
            tempEl.setAttribute('data-message-id', realMessage.id);
            tempEl.classList.remove('sending');
            tempEl.classList.add('sent');
        }

        const convId = String(realMessage.conversation_id);
        if (this.messageCache.has(convId)) {
            const messages = this.messageCache.get(convId);
            const idx = messages.findIndex(m => m.id === tempId);
            if (idx !== -1) messages[idx] = realMessage;
        }
    }

    markMessageFailed(tempId) {
        this.removePendingMessage(tempId); // Stop tracking failed messages
        const tempEl = document.querySelector(`.message[data-message-id="${tempId}"]`);
        if (tempEl) {
            tempEl.classList.remove('sending');
            tempEl.classList.add('failed');
            tempEl.title = 'Failed to send - click to retry';
        }
    }

    // Helper to clean array
    removePendingMessage(tempId) {
        this.pendingMessages = this.pendingMessages.filter(p => p.tempId !== tempId);
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

        // Removed && !document.hidden - we want to add messages even when tab is hidden
        const isCurrentChat = (messageConversationId === currentConversationId);

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
            // Clear pending messages for this chat on reload
            this.pendingMessages = this.pendingMessages.filter(p => p.conversationId !== convId);

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

        // 1. Strict ID Check: If this specific ID is already on screen, stop.
        if (container.querySelector(`.message[data-message-id="${message.id}"]`)) return;

        // 2. MEMORY MERGE CHECK (The Robust Fix)
        // Check if this incoming message matches a pending one in our memory array
        if (message.direction === 'outbound' || message.sender_type === 'user' ||
            message.sent_by === 'user' || (message.direction !== 'inbound' && this.pendingMessages.length > 0)) {
            const incomingClean = (message.content || message.message_content || message.text || message.body || '').replace(/\s+/g, '');
            const convId = String(message.conversation_id);

            // Find matching pending message in memory
            const pendingIndex = this.pendingMessages.findIndex(p =>
                p.text === incomingClean &&
                p.conversationId === convId
            );

            if (pendingIndex !== -1) {
                const pending = this.pendingMessages[pendingIndex];
                console.log('🔄 Merging WebSocket echo via Memory Match');

                // Remove from pending list (we found it!)
                this.pendingMessages.splice(pendingIndex, 1);

                // Find the DOM element using the tempId we stored
                const el = container.querySelector(`.message[data-message-id="${pending.tempId}"]`);

                if (el) {
                    // Convert Temp Bubble -> Real Bubble
                    el.setAttribute('data-message-id', message.id);
                    el.classList.remove('sending');
                    el.classList.add('sent');

                    // Update cache
                    if (this.messageCache.has(convId)) {
                        const cache = this.messageCache.get(convId);
                        const cachedMsg = cache.find(m => m.id === pending.tempId);
                        if (cachedMsg) {
                            cachedMsg.id = message.id;
                            cachedMsg.status = 'sent';
                        } else {
                            cache.push(message);
                        }
                    }
                    return; // STOP here. Do not create a duplicate bubble.
                }
            }
        }

        // --- Standard Render Logic ---
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

        const html = this.parent.templates.messageItem(message);
        const list = container.querySelector('.messages-list');

        if (list) list.insertAdjacentHTML('beforeend', html);
        else container.innerHTML = `<div class="messages-list">${html}</div>`;

        const convId = String(message.conversation_id);
        if (this.messageCache.has(convId)) {
            const cache = this.messageCache.get(convId);
            if (!cache.find(m => m.id === message.id)) {
                cache.push(message);
            }
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

            if (data.url) await this.sendMessage(null, data.url);
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
