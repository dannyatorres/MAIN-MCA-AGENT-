// WebSocket Manager - Simplified Event Routing

class WebSocketManager {
    constructor(app) {
        this.app = app;
        this.socket = null;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.ioLoadRetries = 0;
        this.maxIoLoadRetries = 10;

        console.log('WebSocketManager: Initializing...');
        this.connect();
    }

    connect() {
        if (this.isConnecting || (this.socket && this.socket.connected)) return;
        this.isConnecting = true;

        const wsUrl = this.app.wsUrl || window.location.origin;
        console.log(`WebSocketManager: Connecting to ${wsUrl}...`);

        try {
            // Ensure socket.io is loaded (with max retries to prevent infinite loop)
            if (typeof io === 'undefined') {
                this.ioLoadRetries++;
                if (this.ioLoadRetries >= this.maxIoLoadRetries) {
                    console.error('Socket.io failed to load after max retries');
                    this.isConnecting = false;
                    return;
                }
                console.warn(`Socket.io not found, retrying (${this.ioLoadRetries}/${this.maxIoLoadRetries})...`);
                setTimeout(() => this.connect(), 1000);
                this.isConnecting = false;
                return;
            }

            this.socket = io(wsUrl, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: this.reconnectDelay,
                reconnectionAttempts: this.maxReconnectAttempts
            });

            this.setupEventHandlers();
            window.globalSocket = this.socket; // Debug access

        } catch (error) {
            console.error('WebSocketManager: Connection error:', error);
            this.isConnecting = false;
        }
    }

    setupEventHandlers() {
        // --- Connection Events ---
        this.socket.on('connect', () => {
            console.log('✅ WebSocket connected:', this.socket.id);
            DEBUG.log('websocket', '🟢 CONNECTED', { socketId: this.socket.id });
            this.isConnecting = false;
            this.reconnectAttempts = 0;

            const statusDot = document.querySelector('.connection-status .status-dot');
            const statusText = document.querySelector('.connection-status .status-text');
            if (statusDot) {
                statusDot.classList.remove('disconnected');
                statusDot.classList.add('connected');
            }
            if (statusText) statusText.textContent = 'Connected';

            // Re-join room if needed
            if (this.app.currentConversationId) {
                this.joinConversation(this.app.currentConversationId);
            }
        });

        this.socket.on('disconnect', (reason) => {
            console.log('🔌 WebSocket disconnected:', reason);
            DEBUG.log('websocket', '🔴 DISCONNECTED', { reason });
            this.isConnecting = false;

            const statusDot = document.querySelector('.connection-status .status-dot');
            const statusText = document.querySelector('.connection-status .status-text');
            if (statusDot) {
                statusDot.classList.remove('connected');
                statusDot.classList.add('disconnected');
            }
            if (statusText) statusText.textContent = 'Reconnecting...';
        });

        // --- Data Events ---

        // 1. New Message - Hand off to Messaging Module completely
        this.socket.on('new_message', (data) => {
            console.log('⚡ WS EVENT: new_message', data.conversation_id);
            DEBUG.log('websocket', '📨 NEW_MESSAGE EVENT', { conversationId: data.conversation_id, direction: data.message?.direction });
            if (this.app.messaging) {
                this.app.messaging.handleIncomingMessage(data);
            }
        });

        // 1b. New Note - Update Notes tab if active
        this.socket.on('new_note', (data) => {
            console.log('📝 new_note received:', data);
            if (window.NotesPanel) {
                window.NotesPanel.appendNote(data);
            }
        });

        // 2. Conversation Updated (Status change, etc)
        this.socket.on('conversation_updated', (data) => {
            const convoId = data.conversation_id || data.conversationId;
            console.log('⚡ WS EVENT: conversation_updated', convoId);

            // If we are looking at it, refresh details only (header, AI button, etc.)
            if (String(this.app.currentConversationId) === String(convoId)) {
                if (this.app.conversationUI) {
                    this.app.conversationUI.showConversationDetails();
                }
                // DON'T reload messages - new_message event handles that
            }

            // Update just this conversation instead of full list reload
            if (this.app.conversationUI && convoId) {
                this.app.conversationUI.handleConversationUpdate(convoId);
            }
        });

        // 3. New granular badge update (optimistic)
        this.socket.on('conversation_badge_update', (data) => {
            const convoId = data.conversationId || data.conversation_id;
            console.log('⚡ WS: badge_update', data.type, convoId);

            if (!this.app.conversationUI?.badges) return;

            const conv = this.app.conversationUI.conversations.get(String(convoId));

            // If we don't have this conversation locally, fetch it
            if (!conv) {
                this.app.conversationUI.handleConversationUpdate(convoId);
                return;
            }

            // Update preview if provided
            if (data.preview && this.app.conversationUI.animator) {
                this.app.conversationUI.animator.updatePreview(convoId, data.preview, 'Just now');
            }

            // Handle by type
            switch (data.type) {
                case 'offer':
                    this.app.conversationUI.badges.setOffer(convoId, true);
                    break;
                case 'message':
                    // Only increment if not currently viewing
                    if (String(this.app.currentConversationId) !== String(convoId)) {
                        this.app.conversationUI.badges.incrementUnread(convoId);
                    }
                    break;
                case 'new_bank':
                    // intentionally ignored for now
                    break;
            }
        });

        // 4. New Lead / Offer / Refresh List (fallback)
        // FIX: Delegate strictly to ConversationUI to prevent duplicates
        // No more direct DOM manipulation here - single source of truth
        this.socket.on('refresh_lead_list', async (data) => {
            const convoId = data.conversation_id || data.conversationId;
            console.log('⚡ WS: refresh_lead_list (fallback)', convoId);

            if (!this.app.conversationUI) return;

            // Delegate to ConversationCore to handle update
            await this.app.conversationUI.handleConversationUpdate(convoId);
        });

        // 4. Document Events
        this.socket.on('document_uploaded', (data) => {
            console.log('📄 WebSocket: document_uploaded', data);
            if (String(this.app.currentConversationId) === String(data.conversation_id)) {
                if (this.app.documents) this.app.documents.loadDocuments();
            }
        });

        // 5. FCS/Lender Updates
        this.socket.on('fcs_completed', (data) => {
            console.log('📊 WebSocket: fcs_completed', data);
            if (String(this.app.currentConversationId) === String(data.conversation_id)) {
                this.app.utils.showNotification('FCS Report Ready!', 'success');
                if (this.app.fcs) this.app.fcs.loadFCSData();
            }
        });
    }

    joinConversation(conversationId) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('join_conversation', conversationId);
        }
    }

    // Helper to manually refresh data
    refreshData() {
        if (this.app.conversationUI) this.app.conversationUI.loadConversations();
    }
}

// Make it globally available
window.WebSocketManager = WebSocketManager;
