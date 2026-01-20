// 01-mobile-conversations.js
Object.assign(window.MobileApp.prototype, {
        // ============ CONVERSATIONS ============
        async loadConversations(search = '', append = false) {
            if (!append) {
                this.conversationOffset = 0;
                this.hasMoreConversations = true;
            }

            if (this.isLoadingMore) return;
            this.isLoadingMore = true;

            try {
                const params = new URLSearchParams({
                    limit: String(this.conversationLimit),
                    offset: String(this.conversationOffset)
                });
                if (search) params.append('search', search);

                const data = await this.apiCall(`/api/conversations?${params}`);
                const results = Array.isArray(data) ? data : [];

                if (append) {
                    results.forEach(conv => this.conversations.set(conv.id, conv));
                } else {
                    this.conversations.clear();
                    results.forEach(conv => this.conversations.set(conv.id, conv));
                }

                this.hasMoreConversations = results.length >= this.conversationLimit;
                this.conversationOffset += results.length;

                this.renderConversationList(append);
            } catch (err) {
                if (!append) {
                    this.dom.conversationList.innerHTML = '<div class="loading-state">Failed to load</div>';
                }
            } finally {
                this.isLoadingMore = false;
            }
        },

        renderConversationList(append = false) {
            const convArray = Array.from(this.conversations.values());

            if (!convArray.length) {
                this.dom.conversationList.innerHTML = '<div class="loading-state">No conversations found</div>';
                return;
            }

            const html = convArray.map(conv => {
                const businessName = conv.business_name || `${conv.first_name || ''} ${conv.last_name || ''}`.trim() || 'Unknown';
                const initials = this.getInitials(businessName);
                const phone = this.utils.formatPhone(conv.lead_phone || conv.phone || '');
                const time = this.utils.formatDate(conv.last_activity, 'ago');
                const isSelected = conv.id === this.currentConversationId;
                const unread = conv.unread_count || 0;
                const metaBadge = conv.assigned_user_name 
                    ? `<span class="agent-tag">${this.utils.escapeHtml(conv.assigned_agent_name || conv.assigned_user_name)}</span>`
                    : (conv.display_id ? `<span class="conversation-id-badge">CID# ${conv.display_id}</span>` : '');
                const preview = conv.last_message ? `<div class="message-preview">${this.utils.escapeHtml(conv.last_message)}</div>` : '';

                return `
                    <div class="conversation-item ${isSelected ? 'selected' : ''}" data-id="${conv.id}">
                        ${unread > 0 && !isSelected ? `<div class="unread-badge">${unread}</div>` : ''}
                        <div class="avatar-circle">${initials}</div>
                        <div class="conversation-content">
                            <div class="conversation-header">
                                <h4 class="business-name">${this.utils.escapeHtml(businessName)}</h4>
                                <span class="conversation-time">${time}</span>
                            </div>
                            <div class="conversation-meta">
                                <span class="phone-number">${phone}</span>
                                ${metaBadge}
                            </div>
                            ${preview}
                        </div>
                    </div>
                `;
            }).join('');

            this.dom.conversationList.innerHTML = html;
        },

        setupInfiniteScroll() {
            if (!this.dom.conversationList) return;

            this.dom.conversationList.addEventListener('scroll', () => {
                const el = this.dom.conversationList;
                const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 100;

                if (nearBottom && this.hasMoreConversations && !this.isLoadingMore) {
                    this.loadConversations('', true);
                }
            });
        },

        async selectConversation(id) {
            this.currentConversationId = id;
            this.selectedConversation = this.conversations.get(id);

            // Update header
            if (this.selectedConversation) {
                const c = this.selectedConversation;
                const firstName = (c.owner_first_name || c.first_name || '').trim();
                const lastName = (c.owner_last_name || c.last_name || '').trim();
                let fullName = [firstName, lastName].filter(Boolean).join(' ');
                if (!fullName) fullName = c.owner_name || c.business_name || 'Unknown';

                const business = c.business_name || '';
                this.dom.chatName.textContent = fullName.toUpperCase();
                this.dom.chatBusiness.textContent = business;
            }

            // Navigate to chat first for instant feedback
            this.goToPanel(1);

            if (this.dom.messagesContainer) {
                this.dom.messagesContainer.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div></div>';
            }

            // Update list selection
            this.renderConversationList();

            // Load messages
            await this.loadMessages(id);

            // Fetch AI state after messages load
            await this.fetchAIState();

            // Join socket room
            if (this.socket && this.socket.connected) {
                this.socket.emit('join_conversation', id);
            }

            // Clear unread
            this.clearUnreadBadge(id);
        },

        // ============ AI TOGGLE ============
        async toggleAI() {
            if (!this.currentConversationId) return;

            const btn = document.getElementById('mobileAiToggleBtn');
            const currentState = btn?.dataset.state;

            try {
                const response = await this.apiCall(`/api/conversations/${this.currentConversationId}/toggle-ai`, {
                    method: 'POST',
                    body: JSON.stringify({ enabled: currentState !== 'on' })
                });

                this.updateAIButtonState(response.ai_enabled);
            } catch (err) {
                console.error('AI toggle failed:', err);
            }
        },

        updateAIButtonState(enabled) {
            const btn = document.getElementById('mobileAiToggleBtn');
            if (!btn) return;

            if (enabled) {
                btn.dataset.state = 'on';
                btn.classList.add('active');
            } else {
                btn.dataset.state = 'off';
                btn.classList.remove('active');
            }
        },

        async fetchAIState() {
            if (!this.currentConversationId) return;

            try {
                const conv = await this.apiCall(`/api/conversations/${this.currentConversationId}`);
                this.updateAIButtonState(conv.ai_enabled);
            } catch (err) {
                console.error('Failed to fetch AI state:', err);
            }
        },

        // ============ CALLING ============
        async startCall() {
            if (!this.currentConversationId || !this.selectedConversation) {
                alert('Select a conversation first');
                return;
            }

            const phone = this.selectedConversation.lead_phone || this.selectedConversation.phone;
            if (!phone) {
                alert('No phone number available');
                return;
            }

            this.showCallOptions(phone);
        },

        showCallOptions(phone) {
            document.getElementById('callOptionsPicker')?.remove();

            const cleanPhone = String(phone).replace(/\D/g, '');
            const formattedPhone = this.utils.formatPhone(phone);

            const picker = document.createElement('div');
            picker.id = 'callOptionsPicker';
            picker.className = 'call-options-picker';
            picker.innerHTML = `
                <div class="call-options-backdrop"></div>
                <div class="call-options-sheet">
                    <div class="call-options-header">
                        <span>Call ${formattedPhone}</span>
                    </div>
                    <button class="call-option" data-type="native">
                        <i class="fas fa-mobile-alt"></i>
                        <div>
                            <strong>Use My Phone</strong>
                            <span>Call with your number</span>
                        </div>
                    </button>
                    <button class="call-option" data-type="twilio">
                        <i class="fas fa-headset"></i>
                        <div>
                            <strong>Call In-App</strong>
                            <span>Call through system</span>
                        </div>
                    </button>
                    <button class="call-option cancel">Cancel</button>
                </div>
            `;

            document.body.appendChild(picker);

            picker.querySelector('.call-options-backdrop')?.addEventListener('click', () => picker.remove());
            picker.querySelector('.cancel')?.addEventListener('click', () => picker.remove());

            picker.querySelector('[data-type="native"]')?.addEventListener('click', () => {
                picker.remove();
                window.location.href = `tel:${cleanPhone}`;
            });

            picker.querySelector('[data-type="twilio"]')?.addEventListener('click', async () => {
                picker.remove();
                if (!window.callManager) {
                    alert('Calling system not available');
                    return;
                }
                this.showCallUI();
                await window.callManager.startCall(cleanPhone, this.currentConversationId);
            });
        },

        showCallUI() {
            const callBar = document.getElementById('mobileCallBar');
            if (callBar) callBar.classList.remove('hidden');
        },

        hideCallUI() {
            const callBar = document.getElementById('mobileCallBar');
            if (callBar) callBar.classList.add('hidden');
        },

        endCall() {
            if (window.callManager) {
                window.callManager.endCall();
            }
            this.hideCallUI();
        }

});
