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
        this.PENDING_TTL = 60000; // 60 seconds

        this.isSending = false;
        this.lastSendTime = 0;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.requestNotificationPermissionOnDemand();
    }

    escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
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
            // Retry failed messages
            const failedMsg = e.target.closest('.message.failed');
            if (failedMsg) {
                const content = failedMsg.dataset.originalContent || '';
                const mediaUrl = failedMsg.dataset.originalMedia || null;
                if (content || mediaUrl) {
                    failedMsg.remove();
                    this.sendMessage(content, mediaUrl || null);
                }
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
        const cleanText = (content || '').trim() + '|' + (mediaUrl || '');
        this.pendingMessages.push({
            tempId: tempId,
            text: cleanText,
            conversationId: String(convId),
            timestamp: Date.now()
        });

        const optimisticMessage = {
            id: tempId,
            conversation_id: convId,
            content: this.escapeHtml(content),
            message_content: this.escapeHtml(content),
            sender_type: 'user',
            direction: 'outbound',
            media_url: mediaUrl,
            message_type: mediaUrl ? 'mms' : 'sms',
            created_at: new Date().toISOString(),
            status: 'sending',
            _escaped: true
        };

        this.addMessage(optimisticMessage);

        // Store original content for retry
        setTimeout(() => {
            const el = document.querySelector(`.message[data-message-id="${tempId}"]`);
            if (el) {
                el.dataset.originalContent = content || '';
                el.dataset.originalMedia = mediaUrl || '';
            }
        }, 0);

        // Add to cache immediately so it persists if we switch tabs quickly
        const convIdStr = String(convId);
        if (this.messageCache.has(convIdStr)) {
            this.messageCache.get(convIdStr).push(optimisticMessage);
        }

        this.parent.apiCall(`/api/messages/send`, {
            method: 'POST',
            body: JSON.stringify({
                conversation_id: convId,
                message_content: content,
                sender_type: 'user',
                media_url: mediaUrl,
                message_type: mediaUrl ? 'mms' : 'sms'
            })
        }).then(res => {
            if (res?.message) {
                if (res.message.status === 'failed') {
                    this.markMessageFailed(tempId);
                    this.parent.utils?.showNotification('Message failed to send', 'error');
                } else {
                    this.replaceTempMessage(tempId, res.message);
                }
                this.parent.conversationUI?.updateConversationPreview(convId, res.message);
            }
        }).catch(e => {
            console.error('Send failed:', e);
            this.markMessageFailed(tempId);
            this.parent.utils?.showNotification('Failed to send', 'error');
        }).finally(() => {
            this.isSending = false;
        });
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

    cleanStalePendingMessages() {
        const now = Date.now();
        this.pendingMessages = this.pendingMessages.filter(p => now - p.timestamp < this.PENDING_TTL);
    }

    parseMediaUrls(mediaUrl) {
        if (!mediaUrl) return [];
        try {
            const parsed = JSON.parse(mediaUrl);
            return Array.isArray(parsed) ? parsed : [mediaUrl];
        } catch {
            return [mediaUrl];
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

        // RESTORED FIX: Skip our own outbound messages
        // Since sendMessage() handles the optimistic UI and the HTTP response updates the ID,
        // we strictly ignore the WebSocket echo to prevent duplicates.
        const isOurOutbound = (message.direction === 'outbound' || message.sender_type === 'user')
                              && message.sent_by !== 'ai';

        if (isOurOutbound) {
            // We still update the sidebar preview so the "Last Message" text updates
            this.parent.conversationUI?.updateConversationPreview(messageConversationId, message);
            const incomingClean = (message.content || message.message_content || '').trim() + '|' + (message.media_url || '');
            const isPendingHere = this.pendingMessages.some(p =>
                p.text === incomingClean && p.conversationId === messageConversationId
            );
            if (isPendingHere) {
                return; // We sent this, skip (addMessage will merge it)
            }
            // Fall through for messages from other tabs/devices
        }

        // --- Standard Handling for Incoming / AI Messages ---
        const currentConversationId = String(this.parent.getCurrentConversationId());
        const isCurrentChat = (messageConversationId === currentConversationId);

        // Update preview for incoming messages
        this.parent.conversationUI?.updateConversationPreview(messageConversationId, message);

        if (isCurrentChat) {
            this.addMessage(message);
        } else {
            // Only notify for actual incoming messages
            if (message.direction === 'inbound') {
                this.parent.conversationUI?.incrementBadge(messageConversationId);
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
        let displayedFromCache = false;

        if (this.messageCache.has(convId)) {
            this.renderMessages(this.messageCache.get(convId));
            displayedFromCache = true;
        } else if (container) {
            container.innerHTML = '<div class="loading-spinner"></div>';
        }

        try {
            const data = await this.parent.apiCall(`/api/messages/${convId}`);
            const freshMessages = data || [];
            const currentCache = this.messageCache.get(convId) || [];
            const isDataDifferent = JSON.stringify(freshMessages) !== JSON.stringify(currentCache);

            this.messageCache.set(convId, freshMessages);
            // Clear pending messages for this chat on reload
            this.pendingMessages = this.pendingMessages.filter(p => p.conversationId !== convId);
            this.cleanStalePendingMessages();

            if (String(this.parent.getCurrentConversationId()) === convId) {
                if (isDataDifferent || !displayedFromCache) {
                    this.renderMessages(freshMessages);
                }
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
        const sanitized = sorted.map(msg => {
            const copy = { ...msg };
            const textFields = ['content', 'message_content', 'text', 'body'];
            if (!copy._escaped) {
                textFields.forEach(field => {
                    if (copy[field] != null) {
                        copy[field] = this.escapeHtml(copy[field]);
                    }
                });
                copy._escaped = true;
            }
            return copy;
        });
        const originalScrollBehavior = container.style.scrollBehavior;
        container.style.scrollBehavior = 'auto';

        container.innerHTML = this.parent.templates.messagesList(sanitized);
        container.scrollTop = container.scrollHeight;

        requestAnimationFrame(() => {
            container.style.scrollBehavior = originalScrollBehavior;
        });
    }

    addMessage(message) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;

        // 1. Strict ID Check: If this specific ID is already on screen, stop.
        if (container.querySelector(`.message[data-message-id="${message.id}"]`)) return;

        // SECURE FIX: Sanitize all text fields before rendering
        const renderMessage = { ...message };
        const textFields = ['content', 'message_content', 'text', 'body'];
        if (!renderMessage._escaped) {
            textFields.forEach(field => {
                if (renderMessage[field] != null) {
                    renderMessage[field] = this.escapeHtml(renderMessage[field]);
                }
            });
            renderMessage._escaped = true;
        }

        // 2. MEMORY MERGE CHECK (The Robust Fix)
        // Check if this incoming message matches a pending one in our memory array
        if (message.direction === 'outbound' || message.sender_type === 'user' ||
            message.sent_by === 'user' || (message.direction !== 'inbound' && this.pendingMessages.length > 0)) {
            const incomingClean = (message.content || message.message_content || message.text || message.body || '').trim()
                + '|' + (message.media_url || '');
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
                        const idx = cache.findIndex(m => m.id === pending.tempId);
                        if (idx !== -1) {
                            cache[idx] = { ...message, _escaped: true };
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

        const html = this.parent.templates.messageItem(renderMessage);
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
            const data = await this.parent.apiCall('/api/messages/upload', {
                method: 'POST',
                body: formData,
                skipContentType: true
            });

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
