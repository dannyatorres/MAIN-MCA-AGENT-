// templates-utilities.js - Complete utility functions and template generators

class Utilities {
    constructor(parent) {
        this.parent = parent;
    }

    // Error handling
    handleError(error, context, userMessage = null, showNotification = true) {
        console.error(`${context}:`, error);

        if (showNotification && userMessage) {
            this.showNotification(userMessage, 'error');
        } else if (showNotification) {
            const defaultMessage = error.message || 'An unexpected error occurred';
            this.showNotification(defaultMessage, 'error');
        }

        if (this.parent.debugMode) {
            console.debug(`Error in ${context}`, { error: error.message, stack: error.stack });
        }
    }

    // Notification system
    showNotification(message, type = 'info', duration = 4000) {
        const existing = document.querySelector('.notification-active');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = `notification notification-${type} notification-active`;
        notification.style.cssText = `
            position: fixed; top: 20px; right: 20px; padding: 12px 20px;
            border-radius: 6px; color: white; font-weight: 500; z-index: 10000;
            min-width: 250px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;

        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };

        notification.style.backgroundColor = colors[type] || colors.info;
        notification.innerHTML = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, duration);
    }

    // Date formatting
    formatDate(date, format = 'display') {
        if (!date || date === 'null' || date === 'undefined') return '';

        try {
            const dateObj = date instanceof Date ? date : new Date(date);
            if (isNaN(dateObj.getTime())) return '';

            switch(format) {
                case 'input':
                    return dateObj.toISOString().split('T')[0];
                case 'display':
                    return dateObj.toLocaleDateString();
                case 'time':
                    return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                case 'full':
                    return dateObj.toLocaleString();
                case 'ago':
                    const now = new Date();
                    const diff = now - dateObj;
                    const minutes = Math.floor(diff / 60000);
                    const hours = Math.floor(diff / 3600000);
                    const days = Math.floor(diff / 86400000);

                    if (minutes < 1) return 'Just now';
                    if (minutes < 60) return `${minutes}m ago`;
                    if (hours < 24) return `${hours}h ago`;
                    if (days < 7) return `${days}d ago`;
                    return dateObj.toLocaleDateString();
                default:
                    return dateObj.toLocaleDateString();
            }
        } catch (error) {
            return '';
        }
    }

    // File size formatting
    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 MB';

        const numBytes = parseInt(bytes, 10);
        if (isNaN(numBytes)) return '0 MB';

        const k = 1024;
        const mb = numBytes / (k * k);

        if (mb >= 1000) {
            const gb = mb / k;
            return parseFloat(gb.toFixed(2)) + ' GB';
        } else if (mb >= 1) {
            return parseFloat(mb.toFixed(2)) + ' MB';
        } else {
            const kb = numBytes / k;
            return parseFloat(kb.toFixed(1)) + ' KB';
        }
    }

    // Currency formatting
    formatCurrency(amount) {
        if (!amount) return 'N/A';
        const num = parseFloat(amount.toString().replace(/[^0-9.-]/g, ''));
        return isNaN(num) ? 'N/A' : new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(num);
    }

    // Phone number formatting
    formatPhone(value) {
        if (!value) return '';
        const digits = String(value).replace(/\D/g, '');
        if (!digits) return '';
        if (digits.length <= 3) return digits;
        if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    }

    // Modal utilities
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
            return modal;
        }
        return null;
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    }

    createModal(id, title, content, buttons = {}) {
        const existing = document.getElementById(id);
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = id;
        modal.className = 'modal';
        modal.style.display = 'flex';

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button onclick="window.conversationUI.utils.hideModal('${id}')">&times;</button>
                </div>
                <div class="modal-body">${content}</div>
                <div class="modal-footer">
                    ${Object.entries(buttons).map(([text, action]) =>
                        `<button onclick="${action}">${text}</button>`
                    ).join('')}
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        return modal;
    }

    // Debug logging
    debug(message, data = null) {
        if (this.parent.debugMode) {
            if (data) {
                console.debug(`[ConversationUI] ${message}`, data);
            } else {
                console.debug(`[ConversationUI] ${message}`);
            }
        }
    }

    // Loading states
    showLoading(containerId = 'conversationsList') {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `
                <div class="loading-state">
                    <div class="loading-spinner"></div>
                    <p>Loading...</p>
                </div>
            `;
        }
    }

    hideLoading(containerId = 'conversationsList') {
        const container = document.getElementById(containerId);
        if (container) {
            const loadingState = container.querySelector('.loading-state');
            if (loadingState) {
                loadingState.remove();
            }
        }
    }

    // Processing indicator
    updateProcessingStatus(isProcessing, text = 'Processing...') {
        const indicator = document.getElementById('processingIndicator');
        const processingText = document.getElementById('processingText');

        if (indicator) {
            indicator.style.display = isProcessing ? 'flex' : 'none';
        }

        if (processingText && isProcessing) {
            processingText.textContent = text;
        }
    }

    // Field value extraction helper
    getFieldValue(object, key, defaultValue = '') {
        if (!object) return defaultValue || '';

        if (key.includes('.')) {
            const keys = key.split('.');
            let value = object;
            for (const k of keys) {
                value = value?.[k];
                if (value === undefined) break;
            }
            return value || defaultValue || '';
        }

        return object[key] || defaultValue || '';
    }

    // Prevent default events helper
    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // US States list
    getUSStates() {
        return [
            { value: '', label: 'Select State...' },
            { value: 'AL', label: 'Alabama' }, { value: 'AK', label: 'Alaska' },
            { value: 'AZ', label: 'Arizona' }, { value: 'AR', label: 'Arkansas' },
            { value: 'CA', label: 'California' }, { value: 'CO', label: 'Colorado' },
            { value: 'CT', label: 'Connecticut' }, { value: 'DE', label: 'Delaware' },
            { value: 'FL', label: 'Florida' }, { value: 'GA', label: 'Georgia' },
            { value: 'HI', label: 'Hawaii' }, { value: 'ID', label: 'Idaho' },
            { value: 'IL', label: 'Illinois' }, { value: 'IN', label: 'Indiana' },
            { value: 'IA', label: 'Iowa' }, { value: 'KS', label: 'Kansas' },
            { value: 'KY', label: 'Kentucky' }, { value: 'LA', label: 'Louisiana' },
            { value: 'ME', label: 'Maine' }, { value: 'MD', label: 'Maryland' },
            { value: 'MA', label: 'Massachusetts' }, { value: 'MI', label: 'Michigan' },
            { value: 'MN', label: 'Minnesota' }, { value: 'MS', label: 'Mississippi' },
            { value: 'MO', label: 'Missouri' }, { value: 'MT', label: 'Montana' },
            { value: 'NE', label: 'Nebraska' }, { value: 'NV', label: 'Nevada' },
            { value: 'NH', label: 'New Hampshire' }, { value: 'NJ', label: 'New Jersey' },
            { value: 'NM', label: 'New Mexico' }, { value: 'NY', label: 'New York' },
            { value: 'NC', label: 'North Carolina' }, { value: 'ND', label: 'North Dakota' },
            { value: 'OH', label: 'Ohio' }, { value: 'OK', label: 'Oklahoma' },
            { value: 'OR', label: 'Oregon' }, { value: 'PA', label: 'Pennsylvania' },
            { value: 'RI', label: 'Rhode Island' }, { value: 'SC', label: 'South Carolina' },
            { value: 'SD', label: 'South Dakota' }, { value: 'TN', label: 'Tennessee' },
            { value: 'TX', label: 'Texas' }, { value: 'UT', label: 'Utah' },
            { value: 'VT', label: 'Vermont' }, { value: 'VA', label: 'Virginia' },
            { value: 'WA', label: 'Washington' }, { value: 'WV', label: 'West Virginia' },
            { value: 'WI', label: 'Wisconsin' }, { value: 'WY', label: 'Wyoming' },
            { value: 'DC', label: 'District of Columbia' }
        ];
    }

    // ZIP code lookup
    async lookupZipCode(zip, fieldPrefix = 'business') {
        zip = zip.replace(/\D/g, '');
        if (!zip || zip.length !== 5) return;

        try {
            // Support both camelCase (businessZip) and underscore (business_zip) field naming
            const zipField = document.querySelector(`[name="${fieldPrefix}_zip"]`) ||
                             document.querySelector(`[name="${fieldPrefix}Zip"]`);
            if (zipField) {
                zipField.style.borderColor = '#3b82f6';
                zipField.style.transition = 'border-color 0.3s ease';
            }

            const response = await fetch(`https://api.zippopotam.us/us/${zip}`);

            if (response.ok) {
                const data = await response.json();

                if (data.places && data.places[0]) {
                    const place = data.places[0];

                    // Find city field (support underscore and camelCase)
                    const cityField = document.querySelector(`[name="${fieldPrefix}_city"]`) ||
                                     document.querySelector(`[name="${fieldPrefix}City"]`);
                    if (cityField) {
                        cityField.value = place['place name'];
                        cityField.style.borderColor = '#10b981';
                        cityField.style.transition = 'border-color 0.3s ease';
                        setTimeout(() => { cityField.style.borderColor = ''; }, 2000);
                    }

                    // Find state field (support us_state for business, owner_state for owner)
                    const stateField = document.querySelector(`[name="${fieldPrefix}_state"]`) ||
                                      document.querySelector(`[name="us_state"]`) ||
                                      document.querySelector(`[name="${fieldPrefix}State"]`);
                    if (stateField) {
                        stateField.value = place['state abbreviation'];
                        stateField.style.borderColor = '#10b981';
                        stateField.style.transition = 'border-color 0.3s ease';
                        setTimeout(() => { stateField.style.borderColor = ''; }, 2000);
                    }
                }
            }

            if (zipField) {
                setTimeout(() => { zipField.style.borderColor = ''; }, 2000);
            }
        } catch (error) {
            console.error('ZIP lookup failed:', error);
        }
    }
}

class Templates {
    constructor(parent) {
        this.parent = parent;
        this.utils = parent.utils;
    }

    conversationItem(conversation) {
        const lastActivity = new Date(conversation.last_activity);
        const timeAgo = this.utils.formatDate(lastActivity, 'ago');
        const isSelected = this.parent.currentConversationId === conversation.id;
        const isChecked = this.parent.selectedForDeletion?.has(conversation.id);
        const unreadCount = this.parent.unreadMessages?.get(conversation.id) || 0;
        const hasUnread = unreadCount > 0 && !isSelected;

        // Add display_id to dataset as well
        const displayIdData = conversation.display_id ? ` data-display-id="${conversation.display_id}"` : '';
        const displayIdText = conversation.display_id
            ? `<span class="conversation-id-badge">CID# ${conversation.display_id}</span>`
            : '';

        // Get initials for avatar
        const businessName = conversation.business_name || 'Unknown Business';
        const initials = businessName
            .split(' ')
            .filter(word => word.length > 0)
            .slice(0, 2)
            .map(word => word[0].toUpperCase())
            .join('');

        return `
            <div class="conversation-item ${isSelected ? 'selected' : ''} ${isChecked ? 'checked-for-deletion' : ''} ${hasUnread ? 'has-unread' : ''}"
                 data-conversation-id="${conversation.id}"${displayIdData}>
                ${hasUnread ? `<div class="unread-badge">${unreadCount}</div>` : ''}
                <div class="conversation-checkbox">
                    <input type="checkbox" class="delete-checkbox"
                           data-conversation-id="${conversation.id}" ${isChecked ? 'checked' : ''}>
                </div>
                <div class="conversation-avatar">
                    <div class="avatar-circle">${initials}</div>
                </div>
                <div class="conversation-content">
                    <div class="conversation-header">
                        <h4 class="business-name">
                            ${conversation.business_name || 'Unknown Business'}
                            ${hasUnread ? '<span class="new-message-dot"></span>' : ''}
                        </h4>
                        <span class="time-ago">${timeAgo}</span>
                    </div>
                    <div class="conversation-meta">
                        <span class="phone-number">${this.utils.formatPhone(conversation.lead_phone || conversation.phone)}</span>
                        ${displayIdText ? `<br>${displayIdText}` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    messagesList(messages = []) {
        if (messages.length === 0) {
            return '<div class="empty-state">No messages yet. Start a conversation!</div>';
        }

        return `
            <div class="messages-list">
                ${messages.map(msg => this.messageItem(msg)).join('')}
            </div>
        `;
    }

    messageItem(message) {
        const isInbound = message.direction === 'inbound';
        let timestamp = '';

        if (message.created_at || message.timestamp) {
            const messageDate = new Date(message.created_at || message.timestamp);
            if (!isNaN(messageDate.getTime())) {
                timestamp = this.utils.formatDate(messageDate, 'time');
            }
        }

        return `
            <div class="message ${isInbound ? 'inbound' : 'outbound'}" data-message-id="${message.id}">
                <div class="message-wrapper">
                    <div class="message-content">${message.content}</div>
                    <div class="message-meta">
                        <span class="timestamp">${timestamp}</span>
                        <button class="delete-message-btn"
                                data-message-id="${message.id}"
                                title="Delete message"
                                aria-label="Delete message">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    modal(id, title, content, buttons = []) {
        return `
            <div id="${id}" class="modal" style="display: none;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>${title}</h3>
                        <button class="modal-close" onclick="window.conversationUI.utils.hideModal('${id}')">&times;</button>
                    </div>
                    <div class="modal-body">
                        ${content}
                    </div>
                    <div class="modal-footer">
                        ${buttons.map(btn =>
                            `<button class="${btn.className || 'btn-secondary'}" onclick="${btn.action}">${btn.text}</button>`
                        ).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    overviewTab(conversation, aiMessages = []) {
        if (!conversation) {
            return '<div class="empty-state">No conversation selected</div>';
        }

        return `
            <div class="overview-section">
                <div class="conversation-summary">
                    <h4>Conversation Overview</h4>
                    <div class="summary-grid">
                        <div class="summary-item">
                            <label>Business Name:</label>
                            <span>${conversation.business_name || 'N/A'}</span>
                        </div>
                        <div class="summary-item">
                            <label>Phone:</label>
                            <span>${conversation.lead_phone || 'N/A'}</span>
                        </div>
                        <div class="summary-item">
                            <label>State:</label>
                            <span class="state-badge state-${conversation.state?.toLowerCase() || 'new'}">${conversation.state || 'NEW'}</span>
                        </div>
                        <div class="summary-item">
                            <label>Last Activity:</label>
                            <span>${this.utils.formatDate(conversation.last_activity, 'full')}</span>
                        </div>
                    </div>
                </div>
                ${this.aiChatInterface(conversation)}
            </div>
        `;
    }

    aiChatInterface(conversation) {
        return `
            <div class="ai-chat-interface">
                <style>
                    .ai-chat-interface {
                        height: 500px;
                        display: flex;
                        flex-direction: column;
                        background: white;
                        border: 1px solid #e2e8f0;
                        border-radius: 12px;
                        overflow: hidden;
                    }

                    .ai-chat-header {
                        background: #667eea;
                        color: white;
                        padding: 16px;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    }

                    .ai-chat-messages {
                        flex: 1;
                        padding: 20px;
                        overflow-y: auto;
                        background: #f9fafb;
                    }

                    .ai-chat-message {
                        margin-bottom: 16px;
                        display: flex;
                        gap: 12px;
                    }

                    .ai-chat-message.user {
                        flex-direction: row-reverse;
                    }

                    .message-bubble {
                        max-width: 70%;
                        padding: 12px 16px;
                        border-radius: 18px;
                        font-size: 14px;
                        line-height: 1.4;
                    }

                    .ai-chat-message.user .message-bubble {
                        background: #667eea;
                        color: white;
                    }

                    .ai-chat-message.assistant .message-bubble {
                        background: white;
                        color: #1f2937;
                        border: 1px solid #e2e8f0;
                    }

                    .ai-chat-input-area {
                        padding: 16px;
                        background: white;
                        border-top: 1px solid #e2e8f0;
                    }

                    .ai-chat-input-wrapper {
                        display: flex;
                        gap: 12px;
                        align-items: center;
                    }

                    .ai-chat-input {
                        flex: 1;
                        padding: 12px 16px;
                        border: 1px solid #d1d5db;
                        border-radius: 24px;
                        resize: none;
                        font-size: 14px;
                        min-height: 24px;
                        max-height: 100px;
                        font-family: inherit;
                    }

                    .ai-chat-send {
                        background: #667eea;
                        color: white;
                        border: none;
                        padding: 12px 20px;
                        border-radius: 24px;
                        cursor: pointer;
                        font-weight: 500;
                    }

                    .typing-indicator {
                        display: flex;
                        gap: 4px;
                        padding: 12px 16px;
                        background: white;
                        border: 1px solid #e2e8f0;
                        border-radius: 18px;
                        width: fit-content;
                    }

                    .typing-dot {
                        width: 8px;
                        height: 8px;
                        background: #9ca3af;
                        border-radius: 50%;
                        animation: typing 1.4s infinite;
                    }

                    @keyframes typing {
                        0%, 60%, 100% {
                            transform: translateY(0);
                        }
                        30% {
                            transform: translateY(-10px);
                        }
                    }
                </style>

                <div class="ai-chat-header">
                    <span>🤖</span>
                    <div>
                        <div style="font-weight: 600;">AI Assistant</div>
                        <div style="font-size: 12px; opacity: 0.8;">
                            Chat about ${conversation?.business_name || 'this lead'}
                        </div>
                    </div>
                </div>

                <div class="ai-chat-messages" id="aiChatMessages">
                    <div class="ai-chat-message assistant">
                        <div class="message-bubble">
                            Hi! I'm here to help you with <strong>${conversation?.business_name || 'this lead'}</strong>.
                            You can ask me anything about the lead, what actions to take next, or how to handle this conversation.
                            <br><br>
                            Try asking: "What should I do next?" or "Analyze this lead for me"
                        </div>
                    </div>
                </div>

                <div class="ai-chat-input-area">
                    <div class="ai-chat-input-wrapper">
                        <textarea
                            class="ai-chat-input"
                            id="aiChatInput"
                            placeholder="Type your message..."
                            rows="1"
                        ></textarea>
                        <button class="ai-chat-send" id="aiChatSend">
                            Send
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
}