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
            document.getElementById('backToChat').addEventListener('click', () => this.goToPanel(1));

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
        document.addEventListener('DOMContentLoaded', () => new MobileApp());
    } else {
        new MobileApp();
    }

})();
