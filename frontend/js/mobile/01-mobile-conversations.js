// 01-mobile-conversations.js
Object.assign(window.MobileApp.prototype, {
        // ============ CONVERSATIONS ============
        async loadConversations(search = '') {
            try {
                const params = new URLSearchParams({ limit: '50', offset: '0' });
                if (search) params.append('search', search);

                const data = await this.apiCall(`/api/conversations?${params}`);

                this.conversations.clear();
                (Array.isArray(data) ? data : []).forEach(conv => {
                    this.conversations.set(conv.id, conv);
                });

                this.renderConversationList();
            } catch (err) {
                this.dom.conversationList.innerHTML = '<div class="loading-state">Failed to load</div>';
            }
        },

        renderConversationList() {
            const convArray = Array.from(this.conversations.values());

            if (!convArray.length) {
                this.dom.conversationList.innerHTML = '<div class="loading-state">No conversations found</div>';
                return;
            }

            this.dom.conversationList.innerHTML = convArray.map(conv => {
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

            // Update list selection
            this.renderConversationList();

            // Load messages
            await this.loadMessages(id);

            // Navigate to chat
            this.goToPanel(1);

            // Join socket room
            if (this.socket && this.socket.connected) {
                this.socket.emit('join_conversation', id);
            }

            // Clear unread
            this.clearUnreadBadge(id);
        }

});
