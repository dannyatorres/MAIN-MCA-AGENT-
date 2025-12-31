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

        // 1. Check for exact ID match (prevents re-adding known real messages)
        if (container.querySelector(`.message[data-message-id="${message.id}"]`)) return;

        // 2. CHECK FOR DUPLICATE OUTBOUND (The Fix)
        // If this is an outbound message, look specifically for "temporary" messages we haven't confirmed yet
        if (message.direction === 'outbound' || message.sender_type === 'user') {

            // Only look at messages that are still in "sending" state or have temp IDs
            const tempMessages = container.querySelectorAll('.message[data-message-id^="temp-"], .message.sending');

            // Normalize text for comparison (remove ALL whitespace to ensure match)
            const incomingText = (message.content || message.message_content || '').replace(/\s+/g, '');
            const msgTime = new Date(message.created_at).getTime();
            const now = Date.now();

            for (const el of tempMessages) {
                const contentEl = el.querySelector('.message-content, .message-text');
                if (!contentEl) continue;

                // Get DOM text and strip all whitespace/newlines
                const domText = contentEl.textContent.replace(/\s+/g, '');

                if (domText === incomingText) {
                    // Double check it's recent (within 10 seconds)
                    if (now - msgTime < 10000) {
                        console.log('🔄 Merging WebSocket echo with Optimistic message');

                        // Update the temp message with real ID
                        el.setAttribute('data-message-id', message.id);
                        el.classList.remove('sending');
                        el.classList.add('sent');

                        // Update cache so we don't lose the real ID
                        const convId = String(message.conversation_id);
                        if (this.messageCache.has(convId)) {
                            const cache = this.messageCache.get(convId);
                            // Find the temp entry in cache and update it
                            const cachedMsg = cache.find(m => m.id === el.getAttribute('data-temp-id') || m.id.startsWith('temp-'));
                            if (cachedMsg) {
                                cachedMsg.id = message.id;
                                cachedMsg.status = 'sent';
                            }
                        }
                        return; // STOP here, do not add the new bubble
                    }
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
            // Avoid pushing duplicates to cache
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
