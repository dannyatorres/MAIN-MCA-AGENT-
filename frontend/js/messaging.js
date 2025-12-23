// messaging.js - Robust Messaging (Fixed Render Order)

class MessagingModule {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = parent.apiBaseUrl;
        this.utils = parent.utils;
        this.templates = parent.templates;
        this.messageCache = new Map();
        this.maxCacheSize = 50; // Maximum conversations to cache
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
        // Handle nested objects
        const message = data.message || data;

        // FIX: Safe ID Extraction - prevent "undefined" being saved as ID
        const rawId = data.conversation_id || message.conversation_id;
        if (!rawId) {
            console.warn('⚠️ handleIncomingMessage: No conversation ID found, ignoring');
            return;
        }

        const messageConversationId = String(rawId);
        const currentConversationId = String(this.parent.getCurrentConversationId());

        const isCurrentChat = (messageConversationId === currentConversationId && !document.hidden);

        // 1. BADGE LOGIC
        if (!isCurrentChat) {
            if (this.parent.conversationUI) {
                this.parent.conversationUI.incrementBadge(messageConversationId);
            }
        }

        // 2. MOVE TO TOP & UPDATE PREVIEW
        // Use the shared helper that handles "Move to Top" via list.prepend(item)
        if (this.parent.conversationUI) {
            this.parent.conversationUI.updateConversationPreview(messageConversationId, message);
        }

        // 3. CHAT UI (If we are looking at this specific chat)
        if (isCurrentChat) {
            this.addMessage(message);
        } else {
            // Notification (Only if NOT sent by 'user')
            if (message.sender_type !== 'user') {
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
            this._pruneCache();

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

    _pruneCache() {
        if (this.messageCache.size > this.maxCacheSize) {
            // Remove oldest entries (first inserted)
            const keysToDelete = Array.from(this.messageCache.keys())
                .slice(0, this.messageCache.size - this.maxCacheSize);
            keysToDelete.forEach(key => this.messageCache.delete(key));
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

        // Validate file type and size
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        const maxSize = 10 * 1024 * 1024; // 10MB

        if (!allowedTypes.includes(file.type)) {
            this.parent.utils.showNotification('Invalid file type. Please upload an image.', 'error');
            e.target.value = '';
            return;
        }

        if (file.size > maxSize) {
            this.parent.utils.showNotification('File too large. Maximum size is 10MB.', 'error');
            e.target.value = '';
            return;
        }

        const attachBtn = document.getElementById('attachmentBtn');
        const originalIcon = attachBtn?.innerHTML;
        if (attachBtn) {
            attachBtn.innerHTML = '⏳';
            attachBtn.disabled = true;
        }

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(`${this.apiBaseUrl}/api/messages/upload`, {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Upload failed: ${response.status} ${errorText}`);
            }

            const data = await response.json();

            if (data.url) {
                await this.sendMessage(null, data.url);
            } else {
                throw new Error('No URL returned from upload');
            }
        } catch (error) {
            console.error('Upload error:', error);
            this.parent.utils.showNotification('Failed to upload image: ' + error.message, 'error');
        } finally {
            if (attachBtn) {
                attachBtn.innerHTML = originalIcon;
                attachBtn.disabled = false;
            }
            e.target.value = '';
        }
    }

    playNotificationSound() {
        try {
            // Use a simple audio file or Web Audio API beep
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 800; // Hz
            oscillator.type = 'sine';
            gainNode.gain.value = 0.3;

            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.15); // Short beep

        } catch (error) {
            console.debug('Notification sound not supported');
        }
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
