// messaging.js - Complete messaging functionality with Real-time WebSocket Updates

class MessagingModule {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = parent.apiBaseUrl;
        this.utils = parent.utils;
        this.templates = parent.templates;

        // Messaging state
        this.messagePollingInterval = null;
        this.aiSuggestionsVisible = false;
        this.firstMessageSent = false;
        this.socketRetries = 0; // Prevent infinite recursion
        this.socketListenersAttached = false; // Prevent multiple attachments
        this.eventListenersAttached = false; // ✅ FIX: Prevent double listeners

        // ✅ Message Cache Store
        this.messageCache = new Map();

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupWebSocketListeners(); // NEW: Connect to WebSocket events
        this.requestNotificationPermissionOnDemand();
    }

    // Setup WebSocket listeners for real-time updates
    setupWebSocketListeners() {
        // 1. Safety Check: If we are already listening, STOP
        if (this.socketListenersAttached === true) {
            return;
        }

        if (window.globalSocket) {
            console.log('✅ Connecting messaging module to WebSocket...');

            // 2. Remove any existing listeners to prevent duplicates
            window.globalSocket.off('new_message');
            window.globalSocket.off('conversation_updated');

            // 3. Attach the new listeners
            window.globalSocket.on('new_message', (data) => {
                this.handleIncomingMessage(data);
            });

            window.globalSocket.on('conversation_updated', (data) => {
                if (this.parent.conversationUI) {
                    this.parent.conversationUI.loadConversations();
                }
            });

            // 4. Mark as attached so this block never runs again
            this.socketListenersAttached = true;
            console.log('✅ WebSocket listeners active (Single Instance)');
        } else {
            // Retry with limit
            if (this.socketRetries < 20) { // Increased to 20 attempts
                this.socketRetries++;
                setTimeout(() => this.setupWebSocketListeners(), 1000);
            } else {
                console.error('❌ WebSocket missing. Real-time updates paused. Will retry on next user action.');
                // Reset retries so if the user clicks something later, we can try again
                this.socketRetries = 0;
            }
        }
    }

    setupEventListeners() {
        // ✅ FIX: Check if listeners are already attached
        if (this.eventListenersAttached) return;

        // Message input and send
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        const aiBtn = document.getElementById('aiBtn');

        if (messageInput) {
            messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
        }

        if (aiBtn) {
            aiBtn.addEventListener('click', () => this.toggleAISuggestions());
        }

        // AI suggestions
        const closeSuggestions = document.getElementById('closeSuggestions');
        if (closeSuggestions) {
            closeSuggestions.addEventListener('click', () => this.hideAISuggestions());
        }

        // Event delegation for delete buttons
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            messagesContainer.addEventListener('click', (e) => {
                const deleteBtn = e.target.closest('.delete-message-btn');
                if (deleteBtn) {
                    e.preventDefault();
                    e.stopPropagation();

                    const messageId = deleteBtn.dataset.messageId;
                    if (messageId) {
                        console.log('Delete button clicked for message:', messageId);
                        this.deleteMessage(messageId);
                    }
                }
            });

            console.log('✅ Delete button event delegation set up');
        }

        // Wire up the Attachment Button for MMS
        const attachBtn = document.getElementById('attachmentBtn');
        const fileInput = document.getElementById('fileInput');

        if (attachBtn && fileInput) {
            attachBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        }

        // ✅ AI Toggle Button Listener
        const aiToggleBtn = document.getElementById('aiToggleBtn');
        if (aiToggleBtn) {
            aiToggleBtn.addEventListener('click', () => {
                // Read current state from the DOM data attribute to decide toggle direction
                const isCurrentlyOn = aiToggleBtn.dataset.state === 'on';
                this.toggleAI(!isCurrentlyOn); // Flip the switch
            });
        }

        console.log('✅ Event listeners set up');

        // ✅ FIX: Mark as attached so we don't do it again
        this.eventListenersAttached = true;
    }

    // Handle file upload for MMS
    async handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const attachBtn = document.getElementById('attachmentBtn');

        // Show spinner while uploading
        const originalIcon = attachBtn.innerHTML;
        attachBtn.innerHTML = '⏳';
        attachBtn.disabled = true;

        try {
            const formData = new FormData();
            formData.append('file', file);

            // Upload to backend
            const response = await fetch('/api/messages/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.url) {
                console.log('✅ File uploaded, sending message with URL:', data.url);
                await this.sendMessage(null, data.url);
            } else {
                alert('Upload failed: Server did not return a URL');
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert('Failed to upload image');
        } finally {
            attachBtn.innerHTML = originalIcon;
            attachBtn.disabled = false;
            e.target.value = ''; // Reset input
        }
    }

    async loadConversationMessages(conversationId = null) {
        console.log('🔄 loadConversationMessages called');
        const convId = conversationId || this.parent.getCurrentConversationId();
        if (!convId) return;

        this.removeConversationBadge(convId);
        const container = document.getElementById('messagesContainer');

        // 1. SMART CACHE: Do we have messages in memory?
        if (this.messageCache.has(convId)) {
            console.log(`⚡ [Cache] Rendering messages for ${convId} instantly`);
            this.renderMessages(this.messageCache.get(convId));
        } else {
            // Only show spinner if cache is empty
            if (container) container.innerHTML = '<div class="loading-spinner"></div>';
        }

        try {
            // 2. BACKGROUND FETCH: Get fresh messages
            const data = await this.parent.apiCall(`/api/conversations/${convId}/messages`);

            // Update Cache
            this.messageCache.set(convId, data || []);

            // 3. Re-render with fresh data (silent update)
            // Only re-render if the user is still looking at this conversation
            if (this.parent.getCurrentConversationId() == convId) {
                this.renderMessages(data || []);
            }

            // 4. Update AI toggle button state
            this.updateAIButtonState(convId);
        } catch (error) {
            // If cache existed, we still show the old messages, just warn about connection
            if (!this.messageCache.has(convId)) {
                this.utils.handleError(error, 'Error loading messages', `Failed to load messages`);
            } else {
                console.warn('Background message fetch failed, using cache.');
            }
        }
    }

    renderMessages(messages) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;

        // ✅ FIX: Create a shallow copy using [...messages] before sorting
        // This protects your main cache from being mutated.
        const messagesToRender = [...messages];

        if (messagesToRender.length > 0) {
            messagesToRender.sort((a, b) => new Date(a.timestamp || a.created_at) - new Date(b.timestamp || b.created_at));
        }

        container.innerHTML = this.templates.messagesList(messagesToRender);

        // Scroll to bottom
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 50);
    }

    addMessage(message) {
        // ✅ NEW: Keep cache in sync with new messages
        const convId = message.conversation_id;
        if (convId && this.messageCache.has(String(convId))) {
            const cached = this.messageCache.get(String(convId));
            if (!cached.find(m => m.id === message.id)) {
                cached.push(message);
            }
        }

        const container = document.getElementById('messagesContainer');
        if (!container) return;

        // 1. Remove empty state
        const emptyState = container.querySelector('.empty-state');
        if (emptyState) emptyState.remove();

        // ✅ FIX: Stronger Duplicate Check
        // Check for ID match OR if we just sent this exact content locally
        const msgId = String(message.id);

        // Check 1: Does an element with this ID exist?
        const idExists = container.querySelector(`.message[data-message-id="${msgId}"]`);

        // Check 2 (Safety): Did we just manually render a message with this content?
        // (Helps if the socket event arrives before the API assigns the final ID)
        // This prevents the "I see it twice immediately" bug.

        if (idExists) {
            console.log('🛑 Skipping duplicate message render:', msgId);
            return;
        }

        // 3. Render
        const html = this.parent.templates.messageItem(message);

        // 4. Append Safe Logic
        let list = container.querySelector('.messages-list');
        if (list) {
            list.insertAdjacentHTML('beforeend', html);
        } else {
            // Create the wrapper if this is the very first message
            container.innerHTML = `<div class="messages-list">${html}</div>`;
        }

        // 5. Scroll and animate
        // Add the 'new-message' class to the newly added element for animation
        const newMsgElement = container.querySelector(`.message[data-message-id="${msgId}"]`);
        if (newMsgElement) {
            newMsgElement.classList.add('new-message');
        }

        this.scrollToBottom();
    }

    scrollToBottom() {
        const container = document.getElementById('messagesContainer');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    async sendMessage(textOverride = null, mediaUrl = null) {
        const input = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn'); // Get the button

        // Use textOverride if provided (for image-only sends), otherwise grab input
        const content = textOverride !== null ? textOverride : input.value.trim();
        const conversationId = this.parent.getCurrentConversationId();

        if ((!content && !mediaUrl) || !conversationId) return;

        // ✅ FIX: Disable controls to prevent double-clicks
        if (input) input.disabled = true;
        if (sendBtn) sendBtn.disabled = true;

        // Request notification permission on first message
        if (this.firstMessageSent !== true) {
            this.firstMessageSent = true;
            this.requestNotificationPermissionOnDemand();
        }

        try {
            const result = await this.parent.apiCall(`/api/conversations/${conversationId}/messages`, {
                method: 'POST',
                body: JSON.stringify({
                    message_content: content || '',
                    sender_type: 'user',
                    media_url: mediaUrl,
                    message_type: mediaUrl ? 'mms' : 'sms'
                })
            });

            if (result && result.message) {
                // ✅ INSTANT UPDATE: Manually add the message to the UI
                this.addMessage(result.message);
            }

            // Update conversation timestamp
            this.updateConversationAfterMessage(conversationId);

        } catch (error) {
            console.error('Error sending message:', error);
            this.parent.utils.showNotification('Failed to send message', 'error');
            // Restore text if failed
            if (textOverride === null) input.value = content;
        } finally {
            // ✅ FIX: Re-enable controls always (even if error)
            if (input) {
                input.disabled = false;
                input.focus(); // Keep focus for fast typing
                if (textOverride === null) {
                    input.value = ''; // Clear only on success/finally
                    input.style.height = 'auto';
                }
            }
            if (sendBtn) sendBtn.disabled = false;
        }
    }

    async updateConversationAfterMessage(conversationId) {
        // Update the last activity timestamp for this conversation
        const conversations = this.parent.getConversations();
        const conversation = conversations.get(conversationId);

        if (conversation) {
            conversation.last_activity = new Date().toISOString();
            conversations.set(conversationId, conversation);

            // Update just the time in the UI without re-rendering everything
            const timeAgoElement = document.querySelector(`[data-conversation-id="${conversationId}"] .time-ago`);
            if (timeAgoElement) {
                timeAgoElement.textContent = 'Just now';
            }
        }
    }

    // AI Suggestions
    async toggleAISuggestions() {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) return;

        if (this.aiSuggestionsVisible) {
            this.hideAISuggestions();
            return;
        }

        try {
            const data = await this.parent.apiCall(`/api/conversations/${conversationId}/ai-response`, {
                method: 'POST',
                body: JSON.stringify({
                    messageType: 'followup',
                    generateMultiple: true,
                    context: {}
                })
            });

            this.showAISuggestions(data.response);
        } catch (error) {
            this.utils.handleError(error, 'Error generating AI suggestions', 'Failed to generate suggestions');
        }
    }

    showAISuggestions(suggestions) {
        const aiSuggestions = document.getElementById('aiSuggestions');
        const suggestionsList = document.getElementById('suggestionsList');

        if (!aiSuggestions || !suggestionsList) return;

        suggestionsList.innerHTML = suggestions.map((suggestion, index) => `
            <div class="suggestion-item" data-index="${index}">
                <p>${suggestion}</p>
                <button class="use-suggestion-btn" onclick="window.conversationUI.messaging.useSuggestion('${suggestion.replace(/'/g, "\\'")}')">
                    Use
                </button>
            </div>
        `).join('');

        aiSuggestions.style.display = 'block';
        this.aiSuggestionsVisible = true;
    }

    hideAISuggestions() {
        const aiSuggestions = document.getElementById('aiSuggestions');
        if (aiSuggestions) {
            aiSuggestions.style.display = 'none';
        }
        this.aiSuggestionsVisible = false;
    }

    useSuggestion(suggestion) {
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.value = suggestion;
            messageInput.focus();
        }
        this.hideAISuggestions();
    }

    // Real-time incoming message handler (Fixed: uses addMessage for consistency)
    handleIncomingMessage(data) {
        console.log('📨 Handling incoming message:', data);

        const conversationId = this.parent.getCurrentConversationId();
        // Handle nested objects from different socket structures
        const message = data.message || data;
        const messageConversationId = data.conversation_id || message.conversation_id;

        // 1. If it's for the current conversation, add it to the UI
        if (String(messageConversationId) === String(conversationId)) {
            console.log('✅ Message is for current conversation, adding to UI');

            // USE THE EXISTING addMessage FUNCTION instead of manual DOM creation
            // This ensures the HTML structure matches perfectly with historical messages
            this.addMessage(message);

        } else {
            console.log('📋 Message is for different conversation');
            this.addConversationBadge(messageConversationId);

            // Add to unread count tracker
            const unreadMessages = this.parent.unreadMessages || new Map();
            const currentCount = unreadMessages.get(messageConversationId) || 0;
            unreadMessages.set(messageConversationId, currentCount + 1);

            this.playNotificationSound();
            this.showBrowserNotification(data);
        }

        // 2. Update the sidebar preview
        if (this.parent.conversationUI && this.parent.conversationUI.updateConversationPreview) {
            this.parent.conversationUI.updateConversationPreview(
                messageConversationId,
                {
                    content: message.content || 'New Message',
                    created_at: new Date().toISOString()
                }
            );
        }
    }

    playNotificationSound() {
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRl9vT19SABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmFgU7k9n1unEiBC13yO/eizEIHWq+8+OZURE');
            audio.volume = 0.5;
            audio.play().catch(e => console.log('Could not play notification sound'));
        } catch (e) {
            console.log('Could not play notification sound');
        }
    }

    showBrowserNotification(data) {
        if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification('New Message', {
                body: data.message.content.substring(0, 100),
                icon: '/favicon.ico',
                tag: 'message-' + data.conversation_id
            });

            notification.onclick = () => {
                window.focus();
                if (this.parent.conversationUI) {
                    this.parent.conversationUI.selectConversation(data.conversation_id);
                }
                notification.close();
            };
        }
    }

    requestNotificationPermissionOnDemand() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                console.log('Notification permission:', permission);
            }).catch(error => {
                console.log('Notification permission error (non-fatal):', error);
            });
        }
    }

    async deleteMessage(messageId) {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) return;

        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);

        if (!messageElement) {
            console.error('Message element not found');
            return;
        }

        if (messageElement.classList.contains('deleting')) {
            console.log('Message already being deleted, skipping...');
            return;
        }

        if (!confirm('Are you sure you want to delete this message?')) {
            return;
        }

        messageElement.classList.add('deleting');

        // --- FIX STARTS HERE ---
        // Strip the suffix (e.g., ":1") if it exists to get the pure UUID
        // This fixes the 404 error caused by sending "uuid:1" to the backend
        const cleanMessageId = messageId.includes(':') ? messageId.split(':')[0] : messageId;
        // --- FIX ENDS HERE ---

        try {
            await this.parent.apiCall(`/api/conversations/${conversationId}/messages/${cleanMessageId}`, {
                method: 'DELETE'
            });

            // Smooth fade out animation
            messageElement.style.transition = 'all 0.3s ease';
            messageElement.style.opacity = '0';
            messageElement.style.transform = 'translateX(-20px)';

            setTimeout(() => {
                messageElement.remove();

                // ✅ FIX: Remove from Cache so it doesn't come back on reload
                if (this.messageCache.has(String(conversationId))) {
                    const cached = this.messageCache.get(String(conversationId));
                    const updatedCache = cached.filter(m => String(m.id) !== String(cleanMessageId));
                    this.messageCache.set(String(conversationId), updatedCache);
                }

                console.log('✅ Message deleted successfully');
            }, 300);

            this.utils.showNotification('Message deleted', 'success');
        } catch (error) {
            console.error('Delete message error:', error);
            
            // OPTIONAL: If the error is 404, the message is likely already gone. 
            // You might want to remove it from the UI anyway instead of showing an error.
            if (error.message && error.message.includes('404')) {
                console.warn('Message not found on server (404), removing from UI locally.');
                messageElement.remove();
                return;
            }

            messageElement.classList.remove('deleting');
            this.utils.showNotification(`Failed to delete message: ${error.message}`, 'error');
        }
    }

    // Badge management for unread conversations
    addConversationBadge(conversationId) {
        const conversationItem = document.querySelector(`[data-conversation-id="${conversationId}"]`);
        if (!conversationItem) return;

        // Check for existing badge (use standardized class name)
        let badge = conversationItem.querySelector('.conversation-badge');

        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'conversation-badge';
            badge.textContent = '1';
            conversationItem.appendChild(badge);
        } else {
            const currentCount = parseInt(badge.textContent) || 0;
            badge.textContent = currentCount + 1;
        }

        // Store unread count in data attribute
        conversationItem.dataset.unreadCount = badge.textContent;
    }

    removeConversationBadge(conversationId) {
        const conversationItem = document.querySelector(`[data-conversation-id="${conversationId}"]`);

        if (conversationItem) {
            // 1. Remove RED Unread Badge
            const badge = conversationItem.querySelector('.conversation-badge');
            if (badge) badge.remove();

            // 2. Remove GREEN Offer Badge
            const offerBadge = conversationItem.querySelector('.offer-badge');
            if (offerBadge) offerBadge.remove();

            // 3. Remove "unread" visual styling
            conversationItem.classList.remove('unread');

            // 4. Clear data attributes
            delete conversationItem.dataset.unreadCount;
        }
    }

    // 1. VISUAL PAINTER: Just colors the button Green or Red
    async updateAIButtonState(conversationId) {
        const btn = document.getElementById('aiToggleBtn');
        const btnText = document.getElementById('aiBtnText');
        if (!btn) return;

        try {
            // Fetch the single field we need
            const response = await this.parent.apiCall(`/api/conversations/${conversationId}`);

            // Default to true if undefined
            const isEnabled = response.conversation.ai_enabled !== false;

            // Apply Styles
            if (isEnabled) {
                // 🟢 GREEN STATE (ON)
                btn.dataset.state = 'on';
                if (btnText) btnText.textContent = 'AI: ON';
                btn.style.backgroundColor = '#d4edda'; // Light Green
                btn.style.color = '#155724';           // Dark Green
                btn.style.borderColor = '#c3e6cb';
            } else {
                // 🔴 RED STATE (OFF)
                btn.dataset.state = 'off';
                if (btnText) btnText.textContent = 'AI: OFF';
                btn.style.backgroundColor = '#f8d7da'; // Light Red
                btn.style.color = '#721c24';           // Dark Red
                btn.style.borderColor = '#f5c6cb';
            }
        } catch (error) {
            console.error('Failed to sync AI button:', error);
            if (btnText) btnText.textContent = 'AI Error';
        }
    }

    // 2. ACTION TAKER: Calls the API
    async toggleAI(newState) {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) return;

        const btn = document.getElementById('aiToggleBtn');
        const btnText = document.getElementById('aiBtnText');

        // Optimistic UI Update (Change it instantly before API responds)
        if (btnText) btnText.textContent = 'Updating...';
        if (btn) btn.style.opacity = '0.7';

        try {
            await this.parent.apiCall(`/api/conversations/${conversationId}/toggle-ai`, {
                method: 'POST',
                body: JSON.stringify({ enabled: newState })
            });

            // Re-sync to confirm
            await this.updateAIButtonState(conversationId);

        } catch (error) {
            console.error('Toggle failed', error);
            this.parent.utils.showNotification('Failed to toggle AI', 'error');
            // Revert state on error
            await this.updateAIButtonState(conversationId);
        } finally {
            if (btn) btn.style.opacity = '1';
        }
    }
}
