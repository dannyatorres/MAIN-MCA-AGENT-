// 02-mobile-chat.js
Object.assign(window.MobileApp.prototype, {
        // ============ MESSAGES ============
        async loadMessages(conversationId) {
            this.dom.messagesContainer.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Loading messages...</p></div>';

            try {
                const data = await this.apiCall(`/api/messages/${conversationId}`);
                // API returns array directly, not { messages: [...] }
                this.messages = Array.isArray(data) ? data : [];
                this.renderMessages();
                this.scrollToBottom();
            } catch (err) {
                this.dom.messagesContainer.innerHTML = '<div class="empty-state"><h3>Failed to load</h3></div>';
            }
        },

        renderMessages() {
            if (!this.messages.length) {
                this.dom.messagesContainer.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon"><i class="fas fa-comment-dots"></i></div>
                        <h3>No messages yet</h3>
                        <p>Send a message to start the conversation</p>
                    </div>`;
                return;
            }

            this.dom.messagesContainer.innerHTML = this.messages.map(msg => {
                const isSystem = msg.message_type === 'system' || msg.direction === 'internal';
                const time = this.utils.formatDate(msg.timestamp || msg.created_at, 'smart');
                const isPending = msg.id?.toString().startsWith('temp-');

                if (isSystem) {
                    return `
                        <div class="message system" data-id="${msg.id}">
                            <div class="system-note">${this.utils.escapeHtml(msg.content)}</div>
                            ${time ? `<span class="system-time">${time}</span>` : ''}
                        </div>
                    `;
                }

                const direction = msg.direction === 'outbound' ? 'outbound' : 'inbound';
                return `
                    <div class="message ${direction} ${isPending ? 'pending' : ''}" data-id="${msg.id}">
                        <div class="message-wrapper">
                            <div class="message-content">${this.utils.escapeHtml(msg.content)}</div>
                            <div class="message-time">${time}</div>
                        </div>
                    </div>
                `;
            }).join('');
        },

        async sendMessage() {
            const content = this.dom.messageInput.value.trim();
            if (!content || !this.currentConversationId) return;

            this.haptic();

            // Disable input
            this.dom.sendBtn.disabled = true;
            const originalContent = content;
            this.dom.messageInput.value = '';
            this.dom.messageInput.style.height = 'auto';

            // Create temp message for optimistic UI
            const tempId = `temp-${Date.now()}`;
            const tempMsg = {
                id: tempId,
                content: content,
                direction: 'outbound',
                timestamp: new Date().toISOString()
            };

            // Track for deduplication
            this.pendingMessages.push({
                tempId,
                text: content.toLowerCase().trim(),
                conversationId: String(this.currentConversationId),
                timestamp: Date.now()
            });

            // Add to UI immediately
            this.messages.push(tempMsg);
            this.renderMessages();
            this.scrollToBottom();

            try {
                await this.apiCall('/api/messages/send', {
                    method: 'POST',
                    body: JSON.stringify({
                        conversation_id: this.currentConversationId,
                        content: content
                    })
                });
                const pendingEl = this.dom.messagesContainer.querySelector(`[data-id="${tempId}"]`);
                if (pendingEl) pendingEl.classList.remove('pending');
                this.showToast('Sent', 'success');
            } catch (err) {
                // Remove failed message
                this.messages = this.messages.filter(m => m.id !== tempId);
                this.pendingMessages = this.pendingMessages.filter(p => p.tempId !== tempId);
                this.renderMessages();
                this.showToast('Failed to send', 'error');
                this.dom.messageInput.value = originalContent;
            } finally {
                this.dom.sendBtn.disabled = false;
                this.dom.messageInput.focus();
            }
        },

        async clearUnreadBadge(conversationId) {
            try {
                await this.apiCall(`/api/conversations/${conversationId}/mark-read`, { method: 'POST' });
                const conv = this.conversations.get(conversationId);
                if (conv) {
                    conv.unread_count = 0;
                    this.conversations.set(conversationId, conv);
                }
            } catch (err) { /* ignore */ }
        },


        // ============ WEBSOCKET ============
        initWebSocket() {
            if (typeof io === 'undefined') {
                console.warn('Socket.io not loaded');
                return;
            }

            this.socket = io(window.location.origin, {
                transports: ['websocket', 'polling'],
                reconnection: true
            });

            this.socket.on('connect', () => {
                console.log('🔌 Connected');
                this.dom.connectionDot.classList.add('connected');
                if (this.currentConversationId) {
                    this.socket.emit('join_conversation', this.currentConversationId);
                }
            });

            this.socket.on('disconnect', () => {
                console.log('🔌 Disconnected');
                this.dom.connectionDot.classList.remove('connected');
            });

            this.socket.on('new_message', (data) => this.handleIncomingMessage(data));
            this.socket.on('refresh_lead_list', () => this.loadConversations());
            this.socket.on('conversation_updated', (data) => {
                const id = data.conversation_id || data.conversationId;
                if (String(id) === String(this.currentConversationId)) {
                    this.loadMessages(this.currentConversationId);
                }
            });
        },

        handleIncomingMessage(data) {
            const msg = data.message || data;
            const convId = String(data.conversation_id || data.conversationId);
            const incomingText = (msg.content || '').toLowerCase().trim();

            // Update conversation in list
            const conv = this.conversations.get(convId);
            if (conv) {
                conv.last_message = msg.content;
                const messageTime = msg.timestamp || msg.created_at || new Date().toISOString();
                conv.last_message_at = messageTime;
                conv.last_activity = new Date().toISOString();

                if (convId !== String(this.currentConversationId)) {
                    conv.unread_count = (conv.unread_count || 0) + 1;
                    this.showToast(`New message from ${conv.first_name || conv.business_name || 'Lead'}`, 'success');
                }

                // Move to top
                this.conversations.delete(convId);
                const newMap = new Map([[convId, conv], ...this.conversations]);
                this.conversations = newMap;

                // Targeted DOM update instead of full re-render
                const existingItem = this.dom.conversationList.querySelector(`[data-id="${convId}"]`);
                if (existingItem) {
                    const preview = existingItem.querySelector('.message-preview');
                    if (preview) {
                        preview.textContent = msg.content;
                    } else {
                        const content = existingItem.querySelector('.conversation-content');
                        if (content) {
                            const previewDiv = document.createElement('div');
                            previewDiv.className = 'message-preview';
                            previewDiv.textContent = msg.content;
                            content.appendChild(previewDiv);
                        }
                    }

                    const timeEl = existingItem.querySelector('.conversation-time');
                    if (timeEl) timeEl.textContent = this.utils.formatDate(messageTime, 'ago');

                    if (convId !== String(this.currentConversationId) && conv.unread_count > 0) {
                        let badge = existingItem.querySelector('.unread-badge');
                        if (!badge) {
                            badge = document.createElement('div');
                            badge.className = 'unread-badge';
                            existingItem.prepend(badge);
                        }
                        badge.textContent = conv.unread_count;
                    }

                    const refreshIndicator = this.dom.conversationList.querySelector('.pull-refresh-indicator');
                    if (refreshIndicator && refreshIndicator.parentNode === this.dom.conversationList) {
                        this.dom.conversationList.insertBefore(existingItem, refreshIndicator.nextSibling);
                    } else {
                        this.dom.conversationList.prepend(existingItem);
                    }
                } else {
                    this.renderConversationList();
                }
            }

            // Add to current chat
            if (convId === String(this.currentConversationId)) {
                // Check for echo/duplicate
                const pendingIdx = this.pendingMessages.findIndex(p =>
                    p.text === incomingText &&
                    p.conversationId === convId &&
                    Date.now() - p.timestamp < 15000
                );

                if (pendingIdx !== -1) {
                    // This is an echo of our message - update temp ID to real ID
                    const pending = this.pendingMessages[pendingIdx];
                    const msgEl = this.messages.find(m => m.id === pending.tempId);
                    if (msgEl) {
                        msgEl.id = msg.id;
                        msgEl.timestamp = msg.timestamp || msg.created_at;
                    }
                    this.pendingMessages.splice(pendingIdx, 1);
                    this.renderMessages();
                } else {
                    // New inbound message
                    this.messages.push({
                        id: msg.id || `ws-${Date.now()}`,
                        content: msg.content,
                        direction: msg.direction || 'inbound',
                        timestamp: msg.timestamp || msg.created_at || new Date().toISOString()
                    });
                    this.renderMessages();
                    this.scrollToBottom();
                }
            }
        }

});
