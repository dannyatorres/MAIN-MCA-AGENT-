// mobile.js - MCA Mobile PWA Controller
// Reuses: ApiService, Utilities, Templates, WebSocketManager patterns

(function() {
    'use strict';

    // ============ MOBILE APP CLASS ============
    // This satisfies WebSocketManager's expected interface
    class MobileApp {
        constructor() {
            this.currentConversationId = null;
            this.selectedConversation = null;
            this.conversations = new Map();
            this.messages = [];
            this.currentPanel = 0;
            this.socket = null;
            this.pendingMessages = [];
            this.currentIntelView = null;
            this.aiMessages = [];
            this.pendingUploadFiles = null;
            this.isAnalyzingStrategy = false;

            // Initialize utilities (reuse existing class)
            this.utils = new MobileUtils(this);

            // DOM references
            this.dom = {
                panelContainer: document.getElementById('panelContainer'),
                conversationList: document.getElementById('conversationList'),
                searchInput: document.getElementById('searchInput'),
                connectionDot: document.getElementById('connectionDot'),
                chatName: document.getElementById('chatName'),
                chatBusiness: document.getElementById('chatBusiness'),
                messagesContainer: document.getElementById('messagesContainer'),
                messageInput: document.getElementById('messageInput'),
                sendBtn: document.getElementById('sendBtn'),
                toastContainer: document.getElementById('toastContainer')
            };

            this.init();
        }

        async init() {
            console.log('📱 MCA Mobile initializing...');

            // Initialize API
            if (typeof ApiService !== 'undefined') {
                ApiService.init();
            }

            this.setupEventListeners();
            await this.loadConversations();
            this.initWebSocket();
        }

        // ============ NAVIGATION ============
        goToPanel(index) {
            this.currentPanel = index;
            this.dom.panelContainer.setAttribute('data-panel', index);

            if (index === 1 && this.dom.messageInput) {
                setTimeout(() => this.dom.messageInput.focus(), 300);
            }
        }

        // ============ API HELPER ============
        async apiCall(endpoint, options = {}) {
            try {
                if (typeof ApiService !== 'undefined') {
                    if (options.method === 'POST') {
                        return await ApiService.post(endpoint, options.body ? JSON.parse(options.body) : {});
                    }
                    return await ApiService.get(endpoint);
                }

                // Fallback
                const response = await fetch(endpoint, {
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json', ...options.headers },
                    ...options
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return await response.json();
            } catch (err) {
                console.error('API Error:', err);
                this.showToast('Connection error', 'error');
                throw err;
            }
        }

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
        }

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
                const displayId = conv.display_id ? `<span class="conversation-id-badge">CID# ${conv.display_id}</span>` : '';
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
                                ${displayId}
                            </div>
                            ${preview}
                        </div>
                    </div>
                `;
            }).join('');
        }

        async selectConversation(id) {
            this.currentConversationId = id;
            this.selectedConversation = this.conversations.get(id);

            // Update header
            if (this.selectedConversation) {
                const name = this.selectedConversation.first_name ||
                           this.selectedConversation.business_name?.split(' ')[0] || 'Unknown';
                const business = this.selectedConversation.business_name || '';
                this.dom.chatName.textContent = name.toUpperCase();
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
        }

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
                const direction = msg.direction === 'outbound' ? 'outbound' : 'inbound';
                const time = this.utils.formatDate(msg.timestamp || msg.created_at, 'smart');
                const isPending = msg.id?.toString().startsWith('temp-');

                return `
                    <div class="message ${direction} ${isPending ? 'pending' : ''}" data-id="${msg.id}">
                        <div class="message-wrapper">
                            <div class="message-content">${this.utils.escapeHtml(msg.content)}</div>
                            <div class="message-time">${time}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        async sendMessage() {
            const content = this.dom.messageInput.value.trim();
            if (!content || !this.currentConversationId) return;

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
        }

        async clearUnreadBadge(conversationId) {
            try {
                await this.apiCall(`/api/conversations/${conversationId}/mark-read`, { method: 'POST' });
                const conv = this.conversations.get(conversationId);
                if (conv) {
                    conv.unread_count = 0;
                    this.conversations.set(conversationId, conv);
                }
            } catch (err) { /* ignore */ }
        }

        // ============ INTELLIGENCE HUB ============
        setupIntelligenceListeners() {
            document.getElementById('intelligenceCards').addEventListener('click', (e) => {
                const card = e.target.closest('.intel-card');
                if (card) {
                    const intelType = card.dataset.intel;
                    this.openIntelView(intelType);
                }
            });

            const aiInput = document.getElementById('mobileAiInput');
            const aiSend = document.getElementById('mobileAiSend');

            if (aiInput && aiSend) {
                aiSend.addEventListener('click', () => this.sendAiMessage());
                aiInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        this.sendAiMessage();
                    }
                });
                aiInput.addEventListener('input', () => {
                    aiInput.style.height = 'auto';
                    aiInput.style.height = Math.min(aiInput.scrollHeight, 100) + 'px';
                });
            }
        }

        openIntelView(type) {
            this.currentIntelView = type;

            document.getElementById('intelligenceCards').classList.add('hidden');

            const titles = {
                ai: 'AI Assistant',
                edit: 'Edit Lead',
                lenders: 'Lenders',
                fcs: 'FCS Report',
                strategy: 'Strategy'
            };
            document.getElementById('detailsTitle').textContent = titles[type] || 'Intelligence';

            if (type === 'ai') {
                document.getElementById('aiAssistantView').classList.remove('hidden');
                this.loadAiChat();
            } else if (type === 'edit') {
                document.getElementById('editView').classList.remove('hidden');
                this.loadEditForm();
            } else if (type === 'lenders') {
                document.getElementById('lendersView').classList.remove('hidden');
                this.loadLendersView();
            } else if (type === 'documents') {
                document.getElementById('documentsView').classList.remove('hidden');
                this.loadDocumentsView();
            } else if (type === 'fcs') {
                document.getElementById('fcsView').classList.remove('hidden');
                this.loadFcsView();
            } else if (type === 'strategy') {
                document.getElementById('strategyView').classList.remove('hidden');
                this.loadStrategyView();
            }
        }

        closeIntelView() {
            this.currentIntelView = null;

            document.querySelectorAll('.intel-view').forEach(v => v.classList.add('hidden'));

            document.getElementById('intelligenceCards').classList.remove('hidden');
            document.getElementById('detailsTitle').textContent = 'Intelligence';
        }

        // ============ AI ASSISTANT ============
        async loadAiChat() {
            const container = document.getElementById('mobileAiMessages');
            if (!container || !this.currentConversationId) return;

            container.innerHTML = `
                <div class="ai-loading-container">
                    <div class="ai-thinking">
                        <div class="ai-dot"></div>
                        <div class="ai-dot"></div>
                        <div class="ai-dot"></div>
                    </div>
                    <p>Loading AI chat...</p>
                </div>
            `;

            try {
                const data = await this.apiCall(`/api/ai/chat/${this.currentConversationId}`);

                container.innerHTML = '';

                if (data.messages && data.messages.length > 0) {
                    this.aiMessages = data.messages;
                    this.aiMessages.forEach(msg => this.addAiMessage(msg.role, msg.content));
                } else {
                    const businessName = this.selectedConversation?.business_name || 'this deal';
                    this.addAiMessage('assistant', `How can I help you with **${businessName}** today?`);
                }

                this.scrollAiToBottom();
            } catch (err) {
                container.innerHTML = `
                    <div class="ai-loading-container">
                        <p>Failed to load AI chat</p>
                    </div>
                `;
            }
        }

        addAiMessage(role, content) {
            const container = document.getElementById('mobileAiMessages');
            if (!container) return;

            const row = document.createElement('div');
            row.className = `ai-message-row ${role}`;

            const bubble = document.createElement('div');
            bubble.className = role === 'user' ? 'ai-bubble-user' : 'ai-bubble-ai';
            bubble.innerHTML = this.formatAiContent(content);

            row.appendChild(bubble);
            container.appendChild(row);
        }

        formatAiContent(content) {
            if (!content) return '';
            return content
                .replace(/\n/g, '<br>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        }

        showAiTyping() {
            const container = document.getElementById('mobileAiMessages');
            if (!container) return;

            const existing = document.getElementById('aiTyping');
            if (existing) existing.remove();

            const row = document.createElement('div');
            row.id = 'aiTyping';
            row.className = 'ai-message-row assistant';
            row.innerHTML = `
                <div class="ai-thinking">
                    <div class="ai-dot"></div>
                    <div class="ai-dot"></div>
                    <div class="ai-dot"></div>
                </div>
            `;
            container.appendChild(row);
            this.scrollAiToBottom();
        }

        hideAiTyping() {
            const typing = document.getElementById('aiTyping');
            if (typing) typing.remove();
        }

        async sendAiMessage() {
            const input = document.getElementById('mobileAiInput');
            if (!input) return;

            const message = input.value.trim();
            if (!message || !this.currentConversationId) return;

            input.value = '';
            input.style.height = 'auto';

            this.addAiMessage('user', message);
            this.scrollAiToBottom();
            this.showAiTyping();

            try {
                const data = await this.apiCall('/api/ai/chat', {
                    method: 'POST',
                    body: JSON.stringify({
                        query: message,
                        conversationId: this.currentConversationId,
                        includeContext: true
                    })
                });

                this.hideAiTyping();

                if (data.success && (data.response || data.fallback)) {
                    this.addAiMessage('assistant', data.response || data.fallback);
                } else {
                    this.addAiMessage('assistant', 'Sorry, I encountered an error. Please try again.');
                }
            } catch (err) {
                this.hideAiTyping();
                this.addAiMessage('assistant', 'Connection error. Please try again.');
            }

            this.scrollAiToBottom();
        }

        scrollAiToBottom() {
            const container = document.getElementById('mobileAiMessages');
            if (container) {
                requestAnimationFrame(() => {
                    container.scrollTop = container.scrollHeight;
                });
            }
        }

        // ============ EDIT LEAD ============
        async loadEditForm() {
            const container = document.getElementById('editFormContainer');
            const actions = document.getElementById('editFormActions');

            if (!container || !this.currentConversationId) return;

            actions.style.display = 'none';
            container.innerHTML = `
                <div class="ai-loading-container">
                    <div class="ai-thinking">
                        <div class="ai-dot"></div>
                        <div class="ai-dot"></div>
                        <div class="ai-dot"></div>
                    </div>
                    <p>Loading lead data...</p>
                </div>
            `;

            try {
                const data = await this.apiCall(`/api/conversations/${this.currentConversationId}`);
                const lead = data.conversation || data;

                container.innerHTML = this.renderEditForm(lead);
                actions.style.display = 'flex';

                this.setupEditFormListeners();
            } catch (err) {
                container.innerHTML = `
                    <div class="ai-loading-container">
                        <p>Failed to load lead data</p>
                    </div>
                `;
            }
        }

        renderEditForm(lead) {
            const val = (key) => lead[key] || '';
            const phone = (key) => this.utils.formatPhone(lead[key] || '');
            const currency = (num) => {
                if (!num) return '';
                return '$' + Number(num).toLocaleString();
            };

            const states = [
                '', 'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
                'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
                'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
                'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
                'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
            ];
            const stateOptions = states.map(s =>
                `<option value="${s}" ${val('us_state') === s ? 'selected' : ''}>${s || 'State'}</option>`
            ).join('');

            return `
                <form id="mobileEditForm">
                    <div class="mobile-form-section">
                        <div class="mobile-section-header" data-section="business">
                            <h4><i class="fas fa-building"></i> Business</h4>
                            <i class="fas fa-chevron-down collapse-icon"></i>
                        </div>
                        <div class="mobile-section-content" id="section-business">
                            <div class="mobile-form-group">
                                <label>Business Name *</label>
                                <input type="text" name="businessName" class="mobile-form-input" value="${this.utils.escapeHtml(val('business_name'))}" required>
                            </div>
                            <div class="mobile-form-group">
                                <label>DBA Name</label>
                                <input type="text" name="dbaName" class="mobile-form-input" value="${this.utils.escapeHtml(val('dba_name'))}">
                            </div>
                            <div class="mobile-form-group">
                                <label>Phone *</label>
                                <input type="tel" name="primaryPhone" class="mobile-form-input" value="${phone('lead_phone')}" required>
                            </div>
                            <div class="mobile-form-group">
                                <label>Email</label>
                                <input type="email" name="businessEmail" class="mobile-form-input" value="${val('email')}">
                            </div>
                            <div class="mobile-form-group">
                                <label>Address</label>
                                <input type="text" name="businessAddress" class="mobile-form-input" value="${this.utils.escapeHtml(val('business_address'))}">
                            </div>
                            <div class="mobile-form-row col-3">
                                <div class="mobile-form-group">
                                    <label>City</label>
                                    <input type="text" name="businessCity" class="mobile-form-input" value="${this.utils.escapeHtml(val('city'))}">
                                </div>
                                <div class="mobile-form-group">
                                    <label>State</label>
                                    <select name="businessState" class="mobile-form-select">${stateOptions}</select>
                                </div>
                                <div class="mobile-form-group">
                                    <label>Zip</label>
                                    <input type="text" name="businessZip" class="mobile-form-input" value="${val('zip')}" maxlength="10">
                                </div>
                            </div>
                            <div class="mobile-form-group">
                                <label>Industry</label>
                                <input type="text" name="industryType" class="mobile-form-input" value="${this.utils.escapeHtml(val('industry'))}">
                            </div>
                        </div>
                    </div>

                    <div class="mobile-form-section">
                        <div class="mobile-section-header" data-section="financials">
                            <h4><i class="fas fa-chart-line"></i> Financials</h4>
                            <i class="fas fa-chevron-down collapse-icon"></i>
                        </div>
                        <div class="mobile-section-content" id="section-financials">
                            <div class="mobile-form-row col-2">
                                <div class="mobile-form-group">
                                    <label>Annual Revenue</label>
                                    <input type="text" name="annualRevenue" class="mobile-form-input money-input" value="${currency(val('annual_revenue'))}">
                                </div>
                                <div class="mobile-form-group">
                                    <label>Monthly Revenue</label>
                                    <input type="text" name="monthlyRevenue" class="mobile-form-input money-input" value="${currency(val('monthly_revenue'))}">
                                </div>
                            </div>
                            <div class="mobile-form-row col-2">
                                <div class="mobile-form-group">
                                    <label>Requested Amount</label>
                                    <input type="text" name="requestedAmount" class="mobile-form-input money-input" value="${currency(val('requested_amount'))}">
                                </div>
                                <div class="mobile-form-group">
                                    <label>Credit Score</label>
                                    <input type="text" name="creditScore" class="mobile-form-input" value="${val('credit_score')}">
                                </div>
                            </div>
                            <div class="mobile-form-group">
                                <label>Funding Status</label>
                                <select name="fundingStatus" class="mobile-form-select">
                                    <option value="" ${!val('funding_status') ? 'selected' : ''}>Select...</option>
                                    <option value="none" ${val('funding_status') === 'none' ? 'selected' : ''}>No Funding</option>
                                    <option value="1_position" ${val('funding_status') === '1_position' ? 'selected' : ''}>1 Position</option>
                                    <option value="2_positions" ${val('funding_status') === '2_positions' ? 'selected' : ''}>2 Positions</option>
                                    <option value="3_plus" ${val('funding_status') === '3_plus' ? 'selected' : ''}>3+ Positions</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="mobile-form-section">
                        <div class="mobile-section-header" data-section="owner">
                            <h4><i class="fas fa-user-tie"></i> Owner</h4>
                            <i class="fas fa-chevron-down collapse-icon"></i>
                        </div>
                        <div class="mobile-section-content" id="section-owner">
                            <div class="mobile-form-row col-2">
                                <div class="mobile-form-group">
                                    <label>First Name</label>
                                    <input type="text" name="ownerFirstName" class="mobile-form-input" value="${this.utils.escapeHtml(val('first_name'))}">
                                </div>
                                <div class="mobile-form-group">
                                    <label>Last Name</label>
                                    <input type="text" name="ownerLastName" class="mobile-form-input" value="${this.utils.escapeHtml(val('last_name'))}">
                                </div>
                            </div>
                            <div class="mobile-form-group">
                                <label>Owner Email</label>
                                <input type="email" name="ownerEmail" class="mobile-form-input" value="${val('owner_email')}">
                            </div>
                            <div class="mobile-form-group">
                                <label>Owner Phone</label>
                                <input type="tel" name="ownerPhone" class="mobile-form-input" value="${phone('owner_phone')}">
                            </div>
                            <div class="mobile-form-row col-2">
                                <div class="mobile-form-group">
                                    <label>Ownership %</label>
                                    <input type="number" name="ownershipPercent" class="mobile-form-input" value="${val('ownership_percentage')}" max="100">
                                </div>
                                <div class="mobile-form-group">
                                    <label>DOB</label>
                                    <input type="date" name="ownerDOB" class="mobile-form-input" value="${val('date_of_birth') ? val('date_of_birth').split('T')[0] : ''}">
                                </div>
                            </div>
                        </div>
                    </div>
                </form>
            `;
        }

        setupEditFormListeners() {
            document.querySelectorAll('.mobile-section-header').forEach(header => {
                header.addEventListener('click', () => {
                    const section = header.dataset.section;
                    const content = document.getElementById(`section-${section}`);
                    if (content) {
                        content.classList.toggle('collapsed');
                        header.classList.toggle('collapsed');
                    }
                });
            });

            document.querySelectorAll('.money-input').forEach(input => {
                input.addEventListener('blur', (e) => {
                    const num = e.target.value.replace(/[^0-9.]/g, '');
                    if (num) {
                        e.target.value = '$' + Number(num).toLocaleString();
                    }
                });
            });

            document.querySelectorAll('input[type="tel"]').forEach(input => {
                input.addEventListener('input', (e) => {
                    e.target.value = this.utils.formatPhone(e.target.value);
                });
            });

            document.getElementById('editCancelBtn').addEventListener('click', () => {
                this.closeIntelView();
            });

            document.getElementById('editSaveBtn').addEventListener('click', () => {
                this.saveEditForm();
            });
        }

        async saveEditForm() {
            const form = document.getElementById('mobileEditForm');
            if (!form) return;

            const saveBtn = document.getElementById('editSaveBtn');
            saveBtn.textContent = 'Saving...';
            saveBtn.disabled = true;

            const formData = new FormData(form);
            const data = {};

            formData.forEach((value, key) => {
                if (['annualRevenue', 'monthlyRevenue', 'requestedAmount'].includes(key)) {
                    data[key] = value.replace(/[^0-9.]/g, '');
                } else if (['primaryPhone', 'ownerPhone'].includes(key)) {
                    data[key] = value.replace(/\D/g, '');
                } else {
                    data[key] = value;
                }
            });

            try {
                const res = await this.apiCall(`/api/conversations/${this.currentConversationId}`, {
                    method: 'PUT',
                    body: JSON.stringify(data)
                });

                if (res.success) {
                    this.showToast('Lead updated!', 'success');

                    if (res.conversation) {
                        this.conversations.set(this.currentConversationId, res.conversation);
                        this.selectedConversation = res.conversation;
                    }

                    this.closeIntelView();
                    this.renderConversationList();
                } else {
                    throw new Error(res.error || 'Save failed');
                }
            } catch (err) {
                this.showToast('Failed to save', 'error');
            } finally {
                saveBtn.textContent = 'Save Changes';
                saveBtn.disabled = false;
            }
        }

        // ============ LENDERS ============
        async loadLendersView() {
            const container = document.getElementById('lendersContainer');
            if (!container || !this.currentConversationId) return;

            container.innerHTML = `
                <div class="ai-loading-container">
                    <div class="ai-thinking">
                        <div class="ai-dot"></div>
                        <div class="ai-dot"></div>
                        <div class="ai-dot"></div>
                    </div>
                    <p>Loading lender data...</p>
                </div>
            `;

            try {
                const cached = localStorage.getItem(`lender_results_${this.currentConversationId}`);
                let cachedData = null;

                if (cached) {
                    const parsed = JSON.parse(cached);
                    const oneDay = 24 * 60 * 60 * 1000;
                    if (Date.now() - parsed.timestamp < oneDay) {
                        cachedData = parsed;
                    }
                }

                let fcsData = null;
                try {
                    const fcsResult = await this.apiCall(`/api/fcs/results/${this.currentConversationId}`);
                    if (fcsResult.success && fcsResult.analysis) {
                        fcsData = fcsResult.analysis;
                    }
                } catch (e) { /* ignore */ }

                container.innerHTML = this.renderLendersForm(fcsData, cachedData);
                this.setupLendersListeners();

                if (cachedData) {
                    this.displayLenderResults(cachedData.data, cachedData.criteria);
                }
            } catch (err) {
                container.innerHTML = `
                    <div class="ai-loading-container">
                        <p>Failed to load lender data</p>
                    </div>
                `;
            }
        }

        renderLendersForm(fcsData, cachedData) {
            const conv = this.selectedConversation || {};

            const businessName = conv.business_name || '';
            const state = conv.us_state || conv.state || '';
            const industry = conv.industry || conv.business_type || '';
            const fico = conv.credit_score || '';
            const revenue = fcsData?.average_revenue ? Math.round(fcsData.average_revenue) :
                (conv.annual_revenue ? Math.round(conv.annual_revenue / 12) : '');
            const withholding = fcsData?.withholding_percentage || '';
            const deposits = fcsData?.average_deposits || '';
            const negativeDays = fcsData?.average_negative_days || '';

            let startDate = '';
            if (conv.business_start_date) {
                const d = new Date(conv.business_start_date);
                if (!isNaN(d.getTime())) {
                    startDate = d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
                }
            }

            return `
                <form id="mobileLenderForm" class="lender-form-mobile">
                    <div class="mobile-form-group full-width">
                        <label>Business Name</label>
                        <input type="text" name="businessName" class="mobile-form-input" value="${this.utils.escapeHtml(businessName)}">
                    </div>

                    <div class="lender-form-grid">
                        <div class="mobile-form-group">
                            <label>Position *</label>
                            <select name="position" class="mobile-form-select" required>
                                <option value="1">1st Position</option>
                                <option value="2">2nd Position</option>
                                <option value="3">3rd Position</option>
                                <option value="4">4th Position</option>
                                <option value="5">5th Position</option>
                            </select>
                        </div>
                        <div class="mobile-form-group">
                            <label>Monthly Revenue *</label>
                            <input type="number" name="revenue" class="mobile-form-input" value="${revenue}" required>
                        </div>
                    </div>

                    <div class="lender-form-grid col-3">
                        <div class="mobile-form-group">
                            <label>FICO *</label>
                            <input type="number" name="fico" class="mobile-form-input" value="${fico}" required>
                        </div>
                        <div class="mobile-form-group">
                            <label>State *</label>
                            <input type="text" name="state" class="mobile-form-input" value="${state}" maxlength="2" required>
                        </div>
                        <div class="mobile-form-group">
                            <label>Start Date</label>
                            <input type="text" name="startDate" class="mobile-form-input" value="${startDate}" placeholder="MM/DD/YYYY">
                        </div>
                    </div>

                    <div class="mobile-form-group">
                        <label>Industry</label>
                        <input type="text" name="industry" class="mobile-form-input" value="${this.utils.escapeHtml(industry)}">
                    </div>

                    <div class="lender-form-grid col-3">
                        <div class="mobile-form-group">
                            <label>Deposits/Mo</label>
                            <input type="number" name="deposits" class="mobile-form-input" value="${deposits}">
                        </div>
                        <div class="mobile-form-group">
                            <label>Neg Days</label>
                            <input type="number" name="negativeDays" class="mobile-form-input" value="${negativeDays}">
                        </div>
                        <div class="mobile-form-group">
                            <label>Withhold %</label>
                            <input type="text" name="withholding" class="mobile-form-input" value="${withholding}" readonly>
                        </div>
                    </div>

                    <div class="lender-checkboxes">
                        <label class="lender-checkbox-item">
                            <input type="checkbox" name="soleProp"> Sole Prop
                        </label>
                        <label class="lender-checkbox-item">
                            <input type="checkbox" name="nonProfit"> Non-Profit
                        </label>
                        <label class="lender-checkbox-item">
                            <input type="checkbox" name="mercuryBank"> Mercury Bank
                        </label>
                    </div>

                    <button type="submit" class="lender-qualify-btn" id="runQualificationBtn">
                        <i class="fas fa-search"></i> Run Qualification
                    </button>
                </form>

                <div id="lenderResultsContainer" class="lender-results"></div>
            `;
        }

        setupLendersListeners() {
            const form = document.getElementById('mobileLenderForm');
            if (!form) return;

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.runLenderQualification();
            });
        }

        async runLenderQualification() {
            const form = document.getElementById('mobileLenderForm');
            const btn = document.getElementById('runQualificationBtn');
            if (!form || !btn) return;

            const formData = new FormData(form);

            let tib = 0;
            const startDate = formData.get('startDate');
            if (startDate) {
                const parts = startDate.split('/');
                if (parts.length === 3) {
                    const d = new Date(`${parts[2]}-${parts[0]}-${parts[1]}`);
                    if (!isNaN(d.getTime())) {
                        const now = new Date();
                        tib = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
                        tib = Math.max(0, tib);
                    }
                }
            }

            const criteria = {
                businessName: formData.get('businessName') || 'Business',
                position: parseInt(formData.get('position')) || 1,
                requestedPosition: parseInt(formData.get('position')) || 1,
                monthlyRevenue: parseInt(formData.get('revenue')) || 0,
                revenue: parseInt(formData.get('revenue')) || 0,
                fico: parseInt(formData.get('fico')) || 650,
                state: (formData.get('state') || '').toUpperCase(),
                industry: formData.get('industry') || '',
                startDate: startDate,
                tib: tib,
                depositsPerMonth: parseInt(formData.get('deposits')) || 0,
                negativeDays: parseInt(formData.get('negativeDays')) || 0,
                withholding: formData.get('withholding') || null,
                isSoleProp: formData.get('soleProp') === 'on',
                soleProp: formData.get('soleProp') === 'on',
                isNonProfit: formData.get('nonProfit') === 'on',
                nonProfit: formData.get('nonProfit') === 'on',
                hasMercuryBank: formData.get('mercuryBank') === 'on',
                mercuryBank: formData.get('mercuryBank') === 'on'
            };

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

            try {
                const result = await this.apiCall('/api/qualification/qualify', {
                    method: 'POST',
                    body: JSON.stringify(criteria)
                });

                localStorage.setItem(`lender_results_${this.currentConversationId}`, JSON.stringify({
                    data: result,
                    criteria: criteria,
                    timestamp: Date.now()
                }));

                this.displayLenderResults(result, criteria);
                this.showToast(`${result.qualified?.length || 0} lenders qualified`, 'success');
            } catch (err) {
                this.showToast('Qualification failed', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-search"></i> Run Qualification';
            }
        }

        displayLenderResults(data, criteria) {
            const container = document.getElementById('lenderResultsContainer');
            if (!container) return;

            const qualified = data.qualified || [];
            const nonQualified = data.nonQualified || [];

            let html = `
                <div class="lender-summary">
                    <div class="lender-stat-card">
                        <div class="lender-stat-number qualified">${qualified.length}</div>
                        <div class="lender-stat-label">Qualified</div>
                    </div>
                    <div class="lender-stat-card">
                        <div class="lender-stat-number non-qualified">${nonQualified.length}</div>
                        <div class="lender-stat-label">Non-Qualified</div>
                    </div>
                </div>
            `;

            if (qualified.length > 0) {
                const tiers = {};
                qualified.forEach(lender => {
                    const tier = lender.Tier || lender.tier || 'Other';
                    if (!tiers[tier]) tiers[tier] = [];
                    tiers[tier].push(lender);
                });

                Object.keys(tiers).sort().forEach(tier => {
                    html += `
                        <div class="lender-tier-group">
                            <div class="lender-tier-header">Tier ${this.utils.escapeHtml(tier)}</div>
                            <div class="lender-tags">
                                ${tiers[tier].map(lender => {
                                    const name = lender.name || lender['Lender Name'] || 'Unknown';
                                    const rate = lender.prediction?.successRate;
                                    const rateHtml = rate ? `<span class="success-rate">${rate}%</span>` : '';
                                    return `<div class="lender-tag-mobile">${this.utils.escapeHtml(name)} ${rateHtml}</div>`;
                                }).join('')}
                            </div>
                        </div>
                    `;
                });
            }

            if (nonQualified.length > 0) {
                html += `
                    <button class="non-qual-toggle-mobile" id="toggleNonQualMobile">
                        ❌ View Non-Qualified (${nonQualified.length}) ▼
                    </button>
                    <div class="non-qual-list" id="nonQualListMobile">
                        ${nonQualified.map(item => `
                            <div class="non-qual-item-mobile">
                                <span class="lender-name">${this.utils.escapeHtml(item.lender || item.name || 'Unknown')}</span>
                                <span class="block-reason">${this.utils.escapeHtml(item.blockingRule || item.reason || '')}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            }

            container.innerHTML = html;

            const toggleBtn = document.getElementById('toggleNonQualMobile');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', () => {
                    const list = document.getElementById('nonQualListMobile');
                    if (list) {
                        list.classList.toggle('show');
                        toggleBtn.textContent = list.classList.contains('show')
                            ? `❌ Hide Non-Qualified (${nonQualified.length}) ▲`
                            : `❌ View Non-Qualified (${nonQualified.length}) ▼`;
                    }
                });
            }
        }

        // ============ DOCUMENTS ============
        async loadDocumentsView() {
            const container = document.getElementById('documentsContainer');
            if (!container || !this.currentConversationId) return;

            container.innerHTML = `
                <div class="ai-loading-container">
                    <div class="ai-thinking">
                        <div class="ai-dot"></div>
                        <div class="ai-dot"></div>
                        <div class="ai-dot"></div>
                    </div>
                    <p>Loading documents...</p>
                </div>
            `;

            try {
                const result = await this.apiCall(`/api/documents/${this.currentConversationId}`);

                if (result.success && result.documents) {
                    this.renderDocumentsList(result.documents);
                } else {
                    this.renderDocumentsList([]);
                }
            } catch (err) {
                container.innerHTML = `
                    <div class="docs-empty">
                        <div class="docs-empty-icon"><i class="fas fa-exclamation-circle"></i></div>
                        <h3>Failed to Load</h3>
                        <p>Could not load documents</p>
                    </div>
                `;
            }

            this.setupDocumentsListeners();
        }

        renderDocumentsList(documents) {
            const container = document.getElementById('documentsContainer');
            if (!container) return;

            if (!documents || documents.length === 0) {
                container.innerHTML = `
                    <div class="docs-empty">
                        <div class="docs-empty-icon"><i class="fas fa-folder-open"></i></div>
                        <h3>No Documents</h3>
                        <p>Tap the button below to upload files</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = documents.map(doc => {
                const filename = doc.originalFilename || doc.original_filename || doc.original_name || 'Unknown';
                const docType = doc.documentType || doc.document_type || 'Document';
                const fileSize = this.formatFileSize(doc.fileSize || doc.file_size || 0);
                const iconType = this.getDocIconType(doc.mimeType || doc.mime_type, docType);
                const iconClass = this.getDocIconClass(doc.mimeType || doc.mime_type, docType);

                return `
                    <div class="doc-card-mobile" data-doc-id="${doc.id}">
                        <div class="doc-icon-mobile ${iconType}">
                            <i class="${iconClass}"></i>
                        </div>
                        <div class="doc-info-mobile">
                            <div class="doc-name-mobile">${this.utils.escapeHtml(filename)}</div>
                            <div class="doc-meta-mobile">
                                <span class="doc-type-tag">${docType}</span>
                                <span>${fileSize}</span>
                            </div>
                        </div>
                        <div class="doc-actions-mobile">
                            <button class="doc-action-btn preview-doc" data-doc-id="${doc.id}" data-url="${doc.s3_url || doc.url || ''}">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="doc-action-btn delete delete-doc" data-doc-id="${doc.id}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        getDocIconType(mimeType, docType) {
            if (mimeType?.includes('pdf')) return 'pdf';
            if (mimeType?.includes('image')) return 'img';
            if (mimeType?.includes('sheet') || mimeType?.includes('csv') || mimeType?.includes('excel')) return 'xls';
            if (mimeType?.includes('word') || mimeType?.includes('doc')) return 'doc';
            if (docType === 'Bank Statement' || docType === '4 Months Bank Statement') return 'xls';
            return 'doc';
        }

        getDocIconClass(mimeType, docType) {
            if (docType === 'Bank Statement' || docType === '4 Months Bank Statement') return 'fas fa-university';
            if (docType === 'Tax Return') return 'fas fa-file-invoice-dollar';
            if (docType === 'Signed Application') return 'fas fa-file-signature';
            if (docType === "Driver's License") return 'fas fa-id-card';
            if (mimeType?.includes('pdf')) return 'fas fa-file-pdf';
            if (mimeType?.includes('image')) return 'fas fa-file-image';
            if (mimeType?.includes('sheet') || mimeType?.includes('csv')) return 'fas fa-file-excel';
            return 'fas fa-file-alt';
        }

        formatFileSize(bytes) {
            if (!bytes || bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        }

        setupDocumentsListeners() {
            const fileInput = document.getElementById('mobileFileInput');
            if (fileInput) {
                fileInput.addEventListener('change', (e) => {
                    if (e.target.files.length > 0) {
                        this.showUploadModal(Array.from(e.target.files));
                        e.target.value = '';
                    }
                });
            }

            const container = document.getElementById('documentsContainer');
            if (container) {
                container.addEventListener('click', (e) => {
                    const previewBtn = e.target.closest('.preview-doc');
                    const deleteBtn = e.target.closest('.delete-doc');

                    if (previewBtn) {
                        const url = previewBtn.dataset.url;
                        if (url) {
                            window.open(url, '_blank');
                        } else {
                            this.showToast('Preview not available', 'error');
                        }
                    }

                    if (deleteBtn) {
                        const docId = deleteBtn.dataset.docId;
                        this.confirmDeleteDocument(docId);
                    }
                });
            }
        }

        showUploadModal(files) {
            const docTypes = [
                'Bank Statement', '4 Months Bank Statement', 'Tax Return',
                'Signed Application', "Driver's License", 'Voided Check', 'Other'
            ];

            const modalHtml = `
                <div class="upload-modal-mobile" id="uploadModalMobile">
                    <div class="upload-modal-content">
                        <div class="upload-modal-header">
                            <h3>Upload ${files.length} File${files.length > 1 ? 's' : ''}</h3>
                            <button class="upload-modal-close" id="closeUploadModal">&times;</button>
                        </div>

                        ${files.map((file, i) => `
                            <div class="upload-file-item" data-index="${i}">
                                <div class="upload-file-name">${this.utils.escapeHtml(file.name)}</div>
                                <select class="upload-type-select" data-index="${i}">
                                    ${docTypes.map(type => `
                                        <option value="${type}" ${this.guessDocType(file.name) === type ? 'selected' : ''}>${type}</option>
                                    `).join('')}
                                </select>
                            </div>
                        `).join('')}

                        <div class="upload-modal-actions">
                            <button class="upload-cancel-btn" id="cancelUploadMobile">Cancel</button>
                            <button class="upload-confirm-btn" id="confirmUploadMobile">Upload</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            this.pendingUploadFiles = files;

            document.getElementById('closeUploadModal').onclick = () => this.closeUploadModal();
            document.getElementById('cancelUploadMobile').onclick = () => this.closeUploadModal();
            document.getElementById('confirmUploadMobile').onclick = () => this.processUpload();
        }

        guessDocType(filename) {
            const lower = filename.toLowerCase();
            if (lower.includes('bank') || lower.includes('statement')) return 'Bank Statement';
            if (lower.includes('tax') || lower.includes('return')) return 'Tax Return';
            if (lower.includes('app') || lower.includes('sign')) return 'Signed Application';
            if (lower.includes('license') || lower.includes('dl') || lower.includes('id')) return "Driver's License";
            if (lower.includes('void') || lower.includes('check')) return 'Voided Check';
            return 'Other';
        }

        closeUploadModal() {
            const modal = document.getElementById('uploadModalMobile');
            if (modal) modal.remove();
            this.pendingUploadFiles = null;
        }

        async processUpload() {
            if (!this.pendingUploadFiles || !this.currentConversationId) return;

            const confirmBtn = document.getElementById('confirmUploadMobile');
            if (confirmBtn) {
                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Uploading...';
            }

            const typeSelects = document.querySelectorAll('.upload-type-select');
            let successCount = 0;

            for (let i = 0; i < this.pendingUploadFiles.length; i++) {
                const file = this.pendingUploadFiles[i];
                const docType = typeSelects[i]?.value || 'Other';

                const formData = new FormData();
                formData.append('file', file);
                formData.append('conversation_id', this.currentConversationId);
                formData.append('document_type', docType);

                try {
                    const response = await fetch('/api/documents/upload', {
                        method: 'POST',
                        credentials: 'include',
                        body: formData
                    });

                    if (response.ok) {
                        successCount++;
                    }
                } catch (err) {
                    console.error('Upload failed:', err);
                }
            }

            this.closeUploadModal();

            if (successCount > 0) {
                this.showToast(`${successCount} file${successCount > 1 ? 's' : ''} uploaded`, 'success');
                this.loadDocumentsView();
            } else {
                this.showToast('Upload failed', 'error');
            }
        }

        async confirmDeleteDocument(docId) {
            if (!confirm('Delete this document?')) return;

            try {
                const result = await this.apiCall(`/api/documents/${docId}`, {
                    method: 'DELETE'
                });

                if (result.success) {
                    this.showToast('Document deleted', 'success');
                    this.loadDocumentsView();
                } else {
                    throw new Error(result.error);
                }
            } catch (err) {
                this.showToast('Delete failed', 'error');
            }
        }

        // ============ FCS ============
        async loadFcsView() {
            const container = document.getElementById('fcsContainer');
            if (!container || !this.currentConversationId) return;

            container.innerHTML = `
                <div class="ai-loading-container">
                    <div class="ai-thinking">
                        <div class="ai-dot"></div>
                        <div class="ai-dot"></div>
                        <div class="ai-dot"></div>
                    </div>
                    <p>Loading FCS report...</p>
                </div>
            `;

            try {
                const result = await this.apiCall(`/api/fcs/results/${this.currentConversationId}`);

                if (result.success && result.analysis && result.analysis.report) {
                    this.displayFcsReport({
                        report_content: result.analysis.report,
                        generated_at: result.analysis.completedAt,
                        business_name: result.analysis.businessName
                    });
                } else {
                    this.showFcsEmptyState();
                }
            } catch (err) {
                if (err.message.includes('404')) {
                    this.showFcsEmptyState();
                } else {
                    container.innerHTML = `
                        <div class="fcs-empty-state">
                            <div class="fcs-empty-icon">❌</div>
                            <h3>Error Loading Report</h3>
                            <p>${err.message}</p>
                            <button class="fcs-sync-btn" onclick="window.mobileApp.loadFcsView()">
                                <i class="fas fa-redo"></i> Retry
                            </button>
                        </div>
                    `;
                }
            }
        }

        showFcsEmptyState() {
            const container = document.getElementById('fcsContainer');
            if (!container) return;

            container.innerHTML = `
                <div class="fcs-empty-state">
                    <div class="fcs-empty-icon">📊</div>
                    <h3>No FCS Report</h3>
                    <p>Generate a financial analysis report from your bank statements</p>
                    <button class="fcs-sync-btn" id="triggerFcsSyncBtn">
                        <i class="fas fa-cloud-download-alt"></i> Sync & Generate
                    </button>
                </div>
            `;

            document.getElementById('triggerFcsSyncBtn')?.addEventListener('click', () => {
                this.triggerFcsSync();
            });
        }

        async triggerFcsSync() {
            const container = document.getElementById('fcsContainer');
            if (!container || !this.currentConversationId) return;

            const conv = this.selectedConversation || {};

            container.innerHTML = `
                <div class="fcs-processing">
                    <div class="ai-thinking">
                        <div class="ai-dot"></div>
                        <div class="ai-dot"></div>
                        <div class="ai-dot"></div>
                    </div>
                    <div class="fcs-processing-title">AI Agent Working...</div>
                    <div class="fcs-processing-status" id="fcsProcessingStatus">Starting sync process...</div>
                </div>
            `;

            try {
                const startResponse = await this.apiCall('/api/integrations/drive/sync', {
                    method: 'POST',
                    body: JSON.stringify({
                        conversationId: this.currentConversationId,
                        businessName: conv.business_name || 'Business'
                    })
                });

                if (!startResponse.success || !startResponse.jobId) {
                    throw new Error(startResponse.error || 'Failed to start sync');
                }

                const jobId = startResponse.jobId;

                const result = await this.pollFcsJob(jobId);

                if (result.status === 'completed') {
                    this.showToast('FCS report generated!', 'success');
                    this.loadFcsView();
                } else {
                    throw new Error(result.error || 'Sync failed');
                }
            } catch (err) {
                container.innerHTML = `
                    <div class="fcs-empty-state">
                        <div class="fcs-empty-icon">❌</div>
                        <h3>Sync Failed</h3>
                        <p>${err.message}</p>
                        <button class="fcs-sync-btn" id="retryFcsSyncBtn">
                            <i class="fas fa-redo"></i> Try Again
                        </button>
                    </div>
                `;

                document.getElementById('retryFcsSyncBtn')?.addEventListener('click', () => {
                    this.triggerFcsSync();
                });
            }
        }

        async pollFcsJob(jobId, maxAttempts = 120) {
            const statusMessages = [
                'Searching Google Drive...',
                'Downloading bank statements...',
                'Analyzing financial data...',
                'Running AI underwriting...',
                'Generating FCS report...',
                'Almost done...'
            ];

            let attempts = 0;

            while (attempts < maxAttempts) {
                attempts++;

                try {
                    const status = await this.apiCall(`/api/integrations/drive/sync/status/${jobId}`);

                    const statusEl = document.getElementById('fcsProcessingStatus');
                    if (statusEl && status.status === 'processing') {
                        const msgIndex = Math.min(Math.floor(attempts / 10), statusMessages.length - 1);
                        statusEl.textContent = status.progress || statusMessages[msgIndex];
                    }

                    if (status.status === 'completed' || status.status === 'failed') {
                        return status;
                    }
                } catch (err) {
                    if (err.message.includes('404')) {
                        throw new Error('Job not found');
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 3000));
            }

            throw new Error('Sync timed out');
        }

        displayFcsReport(report) {
            const container = document.getElementById('fcsContainer');
            if (!container || !report.report_content) return;

            const dateStr = report.generated_at
                ? new Date(report.generated_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: 'numeric', minute: '2-digit', hour12: true
                })
                : 'Just now';

            const cleanContent = report.report_content.replace(/```/g, '').trim();
            const formattedContent = this.formatFcsContent(cleanContent);

            container.innerHTML = `
                <div class="fcs-report-mobile">
                    <div class="fcs-report-header">
                        <span class="fcs-report-date">Generated: ${dateStr}</span>
                        <button class="fcs-resync-btn" id="fcsResyncBtn">
                            <i class="fas fa-sync"></i> Re-sync
                        </button>
                    </div>
                    <div class="fcs-report-content">
                        ${formattedContent}
                    </div>
                </div>
            `;

            document.getElementById('fcsResyncBtn')?.addEventListener('click', () => {
                this.triggerFcsSync();
            });
        }

        formatFcsContent(content) {
            if (!content) return '<p>No content</p>';

            let html = '';
            const lines = content.split('\n');
            let inSummary = false;

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.match(/^[-=_*]{3,}$/)) continue;
                if (trimmed.match(/^\|[-\s|:]+\|$/)) continue;

                if (trimmed.match(/^\d+-Month Summary/i) || trimmed === 'Summary') {
                    if (inSummary) html += '</div>';
                    html += `<div class="fcs-summary-card"><div class="fcs-summary-header"><h4>${trimmed}</h4></div>`;
                    inSummary = true;
                    continue;
                }

                if (inSummary && trimmed.startsWith('- ') && trimmed.includes(':')) {
                    const content = trimmed.substring(2);
                    const colonIdx = content.indexOf(':');
                    const key = content.substring(0, colonIdx).trim();
                    const val = content.substring(colonIdx + 1).trim();
                    html += `<div class="fcs-summary-row"><span class="fcs-summary-label">${key}</span><span class="fcs-summary-value">${val}</span></div>`;
                    continue;
                }

                if (inSummary && (trimmed.endsWith(':') || trimmed.startsWith('##'))) {
                    html += '</div>';
                    inSummary = false;
                }

                if (trimmed.match(/^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\\s+\\d{4}$/i)) {
                    html += `<div class="fcs-section-header"><h4>${trimmed}</h4></div>`;
                    continue;
                }

                if (trimmed.match(/^(Observations|Recent MCA|Debt-Consolidation|Items for Review)/i)) {
                    html += `<div class="fcs-tag">${trimmed.replace(/:$/, '')}</div>`;
                    continue;
                }

                if ((trimmed.endsWith(':') && trimmed.length < 50) || trimmed.startsWith('##')) {
                    const headerText = trimmed.replace(/^[#=\\s]+/, '').replace(/[=:]+$/, '').trim();
                    html += `<div class="fcs-section-header"><h4>${headerText}</h4></div>`;
                    continue;
                }

                if (trimmed.match(/^Position\\s+\\d+:/i)) {
                    const posNum = trimmed.match(/^Position\\s+(\\d+)/i)[1];
                    const posContent = trimmed.replace(/^Position\\s+\\d+:\\s*/i, '');
                    html += `<div class="fcs-position-card"><span class="fcs-position-badge">P${posNum}</span><span class="fcs-position-text">${posContent}</span></div>`;
                    continue;
                }

                if (trimmed.startsWith('- ')) {
                    html += `<div class="fcs-bullet">${trimmed.substring(2)}</div>`;
                    continue;
                }

                if (trimmed.includes(':') && !trimmed.startsWith('|')) {
                    const colonIdx = trimmed.indexOf(':');
                    const key = trimmed.substring(0, colonIdx).trim();
                    const val = trimmed.substring(colonIdx + 1).trim();
                    if (key && val && key.length < 40) {
                        html += `<div class="fcs-kv-row"><span class="fcs-kv-key">${key}</span><span class="fcs-kv-value">${val}</span></div>`;
                        continue;
                    }
                }

                html += `<p style="margin: 6px 0; color: #8b949e; font-size: 13px;">${trimmed}</p>`;
            }

            if (inSummary) html += '</div>';

            return html;
        }

        // ============ STRATEGY ============
        async loadStrategyView() {
            const container = document.getElementById('strategyContainer');
            if (!container || !this.currentConversationId) return;

            container.innerHTML = `
                <div class="ai-loading-container">
                    <div class="ai-thinking">
                        <div class="ai-dot"></div>
                        <div class="ai-dot"></div>
                        <div class="ai-dot"></div>
                    </div>
                    <p>Loading strategy...</p>
                </div>
            `;

            try {
                const [strategyRes, scenariosRes] = await Promise.all([
                    this.apiCall(`/api/strategies/${this.currentConversationId}`),
                    this.apiCall(`/api/strategies/${this.currentConversationId}/scenarios`)
                ]);

                const strategy = strategyRes.success ? strategyRes.strategy : null;
                const scenarios = scenariosRes.success ? (scenariosRes.scenarios || []) : [];

                if (!strategy) {
                    this.showStrategyEmptyState();
                } else {
                    this.renderStrategy(strategy, scenarios);
                }
            } catch (err) {
                this.showStrategyEmptyState();
            }
        }

        showStrategyEmptyState() {
            const container = document.getElementById('strategyContainer');
            if (!container) return;

            container.innerHTML = `
                <div class="di-empty-mobile">
                    <div class="di-empty-icon">📊</div>
                    <h3>No Strategy Analysis</h3>
                    <p>Run AI analysis to get deal recommendations</p>
                    <button class="di-analyze-btn" id="runStrategyBtn">
                        <i class="fas fa-bolt"></i> Run Analysis
                    </button>
                    <p class="di-status-text" id="strategyStatusText"></p>
                </div>
            `;

            document.getElementById('runStrategyBtn')?.addEventListener('click', () => {
                this.runStrategyAnalysis();
            });
        }

        async runStrategyAnalysis() {
            const btn = document.getElementById('runStrategyBtn') || document.getElementById('rerunStrategyBtn');
            const status = document.getElementById('strategyStatusText');

            if (!btn || this.isAnalyzingStrategy) return;

            this.isAnalyzingStrategy = true;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
            if (status) status.textContent = 'Running Commander AI...';

            try {
                const response = await this.apiCall(`/api/commander/${this.currentConversationId}/analyze`, {
                    method: 'POST'
                });

                if (response.success) {
                    if (status) status.textContent = 'Done! Loading...';
                    this.loadStrategyView();
                } else {
                    throw new Error(response.error || 'Analysis failed');
                }
            } catch (err) {
                if (status) status.textContent = `Error: ${err.message}`;
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-bolt"></i> Run Analysis';
            }

            this.isAnalyzingStrategy = false;
        }

        renderStrategy(strategy, scenarios) {
            const container = document.getElementById('strategyContainer');
            if (!container) return;

            let gamePlan = strategy.game_plan || {};
            if (typeof gamePlan === 'string') {
                try { gamePlan = JSON.parse(gamePlan); } catch (e) { gamePlan = {}; }
            }

            const stacking = gamePlan.stacking_assessment || {};
            const withholding = gamePlan.withholding_analysis || {};
            const redFlags = gamePlan.red_flags || [];
            const talkingPoints = gamePlan.talking_points || [];
            const riskConsiderations = gamePlan.risk_considerations || [];

            const nextPos = stacking.next_position_number || (strategy.current_positions + 1) || 1;
            const grade = strategy.lead_grade || 'C';
            const strategyType = (strategy.strategy_type || 'pending').toLowerCase().replace('_', ' ');

            container.innerHTML = `
                <div class="di-header-mobile">
                    <div class="di-badges-mobile">
                        <div class="di-grade-mobile grade-${grade}">${grade}</div>
                        <span class="di-type-badge ${strategy.strategy_type?.toLowerCase() || ''}">${strategyType}</span>
                    </div>
                    <span class="di-position-badge-mobile">${nextPos}${this.ordinal(nextPos)} Position</span>
                </div>

                <div class="di-offer-card-mobile">
                    <div class="di-offer-label">Recommended Offer</div>
                    <div class="di-offer-amount-mobile">$${parseFloat(strategy.recommended_funding_max || 0).toLocaleString()}</div>
                    <div class="di-offer-details-mobile">
                        <span>${strategy.recommended_term || '-'} ${strategy.recommended_term_unit || 'wks'}</span>
                        <span class="di-separator">•</span>
                        <span>$${parseFloat(strategy.recommended_payment || 0).toLocaleString()}/wk</span>
                        <span class="di-separator">•</span>
                        <span>${gamePlan.recommended_factor || '-'}x</span>
                    </div>
                </div>

                <div class="di-stats-grid-mobile">
                    <div class="di-stat-mobile">
                        <span class="di-stat-value-mobile">$${parseFloat(strategy.avg_revenue || 0).toLocaleString()}</span>
                        <span class="di-stat-label-mobile">Avg Revenue</span>
                    </div>
                    <div class="di-stat-mobile">
                        <span class="di-stat-value-mobile">${strategy.current_positions ?? 0}</span>
                        <span class="di-stat-label-mobile">Positions</span>
                    </div>
                    <div class="di-stat-mobile">
                        <span class="di-stat-value-mobile">${parseFloat(strategy.total_withholding || 0).toFixed(1)}%</span>
                        <span class="di-stat-label-mobile">Withholding</span>
                    </div>
                    <div class="di-stat-mobile">
                        <span class="di-stat-value-mobile">$${parseFloat(strategy.avg_balance || 0).toLocaleString()}</span>
                        <span class="di-stat-label-mobile">Avg Balance</span>
                    </div>
                </div>

                ${redFlags.length > 0 ? `
                    <div class="di-flags-alert">
                        <span>⚠️</span>
                        <span>${redFlags.length} red flag${redFlags.length > 1 ? 's' : ''} identified</span>
                    </div>
                ` : ''}

                <div class="di-actions-mobile">
                    <button class="di-btn-mobile primary" id="toggleFullAnalysis">
                        <i class="fas fa-list"></i> Full Analysis
                    </button>
                    <button class="di-btn-mobile secondary" id="rerunStrategyBtn">
                        <i class="fas fa-redo"></i> Re-run
                    </button>
                </div>

                <div class="di-full-analysis" id="fullAnalysisSection">

                    ${redFlags.length > 0 ? `
                        <div class="di-section-mobile warning">
                            <div class="di-section-header-mobile">⚠️ Red Flags</div>
                            <div class="di-section-content">
                                <ul class="di-list-mobile">
                                    ${redFlags.map(f => `<li>${this.utils.escapeHtml(f)}</li>`).join('')}
                                </ul>
                            </div>
                        </div>
                    ` : ''}

                    ${talkingPoints.length > 0 ? `
                        <div class="di-section-mobile">
                            <div class="di-section-header-mobile">💬 Talking Points</div>
                            <div class="di-section-content">
                                <ul class="di-list-mobile">
                                    ${talkingPoints.map(t => `<li>${this.utils.escapeHtml(t)}</li>`).join('')}
                                </ul>
                            </div>
                        </div>
                    ` : ''}

                    ${gamePlan.approach || gamePlan.next_action ? `
                        <div class="di-section-mobile">
                            <div class="di-section-header-mobile">📋 Strategy Details</div>
                            <div class="di-section-content">
                                ${gamePlan.approach ? `<div class="di-note-mobile"><strong>Approach:</strong> ${gamePlan.approach}</div>` : ''}
                                ${gamePlan.next_action ? `<div class="di-note-mobile"><strong>Next Action:</strong> ${gamePlan.next_action}</div>` : ''}
                                ${gamePlan.urgency_angle ? `<div class="di-note-mobile"><strong>Urgency:</strong> ${gamePlan.urgency_angle}</div>` : ''}
                            </div>
                        </div>
                    ` : ''}

                    ${scenarios.length > 0 ? `
                        <div class="di-section-mobile">
                            <div class="di-section-header-mobile">🎯 Position Scenarios</div>
                            <div class="di-section-content">
                                <div class="di-scenarios-mobile">
                                    ${this.renderScenarioCard(scenarios, 'conservative', 'Conservative')}
                                    ${this.renderScenarioCard(scenarios, 'moderate', 'Moderate')}
                                    ${this.renderScenarioCard(scenarios, 'aggressive', 'Aggressive')}
                                </div>
                            </div>
                        </div>
                    ` : ''}

                    ${withholding.position_breakdown?.length > 0 ? `
                        <div class="di-section-mobile">
                            <div class="di-section-header-mobile">📊 Position Breakdown</div>
                            <div class="di-section-content">
                                <table class="di-table-mobile">
                                    <thead>
                                        <tr><th>Lender</th><th>Payment</th><th>Freq</th><th>%</th></tr>
                                    </thead>
                                    <tbody>
                                        ${withholding.position_breakdown.map(p => `
                                            <tr>
                                                <td>${this.utils.escapeHtml(p.lender)}</td>
                                                <td>$${(p.payment || 0).toLocaleString()}</td>
                                                <td>${p.frequency}</td>
                                                <td>${(p.withhold_pct || 0).toFixed(1)}%</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ` : ''}

                    ${riskConsiderations.length > 0 ? `
                        <div class="di-section-mobile">
                            <div class="di-section-header-mobile">⚡ Risk Considerations</div>
                            <div class="di-section-content">
                                <ul class="di-list-mobile">
                                    ${riskConsiderations.map(r => `<li>${this.utils.escapeHtml(r)}</li>`).join('')}
                                </ul>
                            </div>
                        </div>
                    ` : ''}

                    ${stacking.stacking_notes ? `
                        <div class="di-section-mobile">
                            <div class="di-section-header-mobile">📈 Stacking Assessment</div>
                            <div class="di-section-content">
                                <div class="di-row-mobile">
                                    <span class="di-row-label">Can Stack</span>
                                    <span class="di-row-value ${stacking.can_stack ? 'positive' : 'negative'}">${stacking.can_stack ? 'Yes' : 'No'}</span>
                                </div>
                                <div class="di-row-mobile">
                                    <span class="di-row-label">Term Cap</span>
                                    <span class="di-row-value">${stacking.term_cap_weeks || '-'} weeks</span>
                                </div>
                                <div class="di-note-mobile">${stacking.stacking_notes}</div>
                            </div>
                        </div>
                    ` : ''}

                </div>
            `;

            document.getElementById('toggleFullAnalysis')?.addEventListener('click', () => {
                const section = document.getElementById('fullAnalysisSection');
                const btn = document.getElementById('toggleFullAnalysis');
                if (section && btn) {
                    section.classList.toggle('show');
                    btn.innerHTML = section.classList.contains('show')
                        ? '<i class="fas fa-minus"></i> Hide Analysis'
                        : '<i class="fas fa-list"></i> Full Analysis';
                }
            });

            document.getElementById('rerunStrategyBtn')?.addEventListener('click', () => {
                this.runStrategyAnalysis();
            });
        }

        renderScenarioCard(scenarios, tier, title) {
            const filtered = scenarios.filter(s => s.tier === tier);
            if (filtered.length === 0) return '';

            return `
                <div class="di-scenario-card-mobile ${tier}">
                    <div class="di-scenario-title-mobile">${title}</div>
                    ${filtered.map(s => `
                        <div class="di-scenario-row-mobile">
                            <span class="funding">$${parseFloat(s.funding_amount || 0).toLocaleString()}</span>
                            <span class="term">${s.term}${s.term_unit === 'weeks' ? 'w' : 'd'}</span>
                            <span class="payment">$${parseFloat(s.payment_amount || 0).toLocaleString()}</span>
                            <span class="withhold">+${s.withhold_addition || 0}%</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        ordinal(n) {
            if (!n) return '';
            const s = ['th', 'st', 'nd', 'rd'];
            const v = n % 100;
            return (s[(v - 20) % 10] || s[v] || s[0]);
        }

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
        }

        handleIncomingMessage(data) {
            const msg = data.message || data;
            const convId = String(data.conversation_id || data.conversationId);
            const incomingText = (msg.content || '').toLowerCase().trim();

            // Update conversation in list
            const conv = this.conversations.get(convId);
            if (conv) {
                conv.last_message = msg.content;
                conv.last_activity = new Date().toISOString();

                if (convId !== String(this.currentConversationId)) {
                    conv.unread_count = (conv.unread_count || 0) + 1;
                    this.showToast(`New message from ${conv.first_name || conv.business_name || 'Lead'}`, 'success');
                }

                // Move to top
                this.conversations.delete(convId);
                const newMap = new Map([[convId, conv], ...this.conversations]);
                this.conversations = newMap;
                this.renderConversationList();
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

        // ============ UTILITIES ============
        getInitials(name) {
            if (!name) return '??';
            return name.split(' ')
                .filter(w => w.length > 0)
                .slice(0, 2)
                .map(w => w[0].toUpperCase())
                .join('');
        }

        scrollToBottom() {
            requestAnimationFrame(() => {
                this.dom.messagesContainer.scrollTop = this.dom.messagesContainer.scrollHeight;
            });
        }

        showToast(message, type = 'info') {
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.textContent = message;
            this.dom.toastContainer.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }

        // ============ EVENT LISTENERS ============
        setupEventListeners() {
            // Navigation
            document.getElementById('backToList').addEventListener('click', () => this.goToPanel(0));
            document.getElementById('goToDetails').addEventListener('click', () => this.goToPanel(2));
            document.getElementById('backToChat').addEventListener('click', () => {
                if (this.currentIntelView) {
                    this.closeIntelView();
                } else {
                    this.goToPanel(1);
                }
            });

            // Conversation selection
            this.dom.conversationList.addEventListener('click', (e) => {
                const item = e.target.closest('.conversation-item');
                if (item) this.selectConversation(item.dataset.id);
            });

            // Search
            let searchTimeout;
            this.dom.searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => this.loadConversations(e.target.value), 400);
            });

            // Send message
            this.dom.sendBtn.addEventListener('click', () => this.sendMessage());
            this.dom.messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });

            // Auto-resize textarea
            this.dom.messageInput.addEventListener('input', () => {
                this.dom.messageInput.style.height = 'auto';
                this.dom.messageInput.style.height = Math.min(this.dom.messageInput.scrollHeight, 120) + 'px';
            });

            this.setupIntelligenceListeners();
        }
    }

    // ============ MOBILE UTILS (Reuses logic from Utilities class) ============
    class MobileUtils {
        constructor(parent) {
            this.parent = parent;
        }

        escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        formatPhone(value) {
            if (!value) return '';
            let digits = String(value).replace(/\D/g, '');
            if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
            if (digits.length <= 3) return digits;
            if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
            return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
        }

        formatDate(date, format = 'display') {
            if (!date) return '';
            try {
                const d = date instanceof Date ? date : new Date(date);
                if (isNaN(d.getTime())) return '';

                if (format === 'ago') {
                    const now = new Date();
                    const diff = Math.floor((now - d) / 1000);
                    if (diff < 60) return 'now';
                    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
                    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
                    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
                    return d.toLocaleDateString();
                }

                if (format === 'smart') {
                    const now = new Date();
                    const isToday = d.toDateString() === now.toDateString();
                    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                    if (isToday) return time;

                    const yesterday = new Date(now);
                    yesterday.setDate(yesterday.getDate() - 1);
                    if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;

                    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + time;
                }

                return d.toLocaleDateString();
            } catch (e) {
                return '';
            }
        }
    }

    // ============ INIT ============
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.mobileApp = new MobileApp();
        });
    } else {
        window.mobileApp = new MobileApp();
    }

})();
