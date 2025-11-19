// WebSocket Manager for MCA Command Center
class WebSocketManager {
    constructor(app) {
        this.app = app;
        this.socket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.isConnecting = false;

        console.log('WebSocketManager: Initializing...');
        this.connect();
    }

    connect() {
        if (this.isConnecting || (this.socket && this.socket.connected)) {
            return;
        }

        this.isConnecting = true;

        // Dynamic URL handling
        const wsUrl = this.app.wsUrl || window.location.origin;
        console.log(`WebSocketManager: Connecting to ${wsUrl}...`);

        try {
            this.socket = io(wsUrl, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: this.reconnectDelay,
                reconnectionAttempts: this.maxReconnectAttempts
            });

            this.setupEventHandlers();

            // Make socket globally available for debugging
            window.globalSocket = this.socket;

        } catch (error) {
            console.error('WebSocketManager: Connection error:', error);
            this.isConnecting = false;
        }
    }

    setupEventHandlers() {
        // --- Connection Events ---
        this.socket.on('connect', () => {
            console.log('✅ WebSocket connected:', this.socket.id);
            this.isConnecting = false;
            this.reconnectAttempts = 0;

            // Update UI status dot
            const statusDot = document.querySelector('.connection-status .status-dot');
            const statusText = document.querySelector('.connection-status .status-text');
            if (statusDot) {
                statusDot.classList.remove('disconnected');
                statusDot.classList.add('connected');
            }
            if (statusText) statusText.textContent = 'Connected';

            // Join room if we have a current conversation
            if (this.app.currentConversationId) {
                this.joinConversation(this.app.currentConversationId);
            }
        });

        this.socket.on('disconnect', (reason) => {
            console.log('🔌 WebSocket disconnected:', reason);
            this.isConnecting = false;

            const statusDot = document.querySelector('.connection-status .status-dot');
            const statusText = document.querySelector('.connection-status .status-text');
            if (statusDot) {
                statusDot.classList.remove('connected');
                statusDot.classList.add('disconnected');
            }
            if (statusText) statusText.textContent = 'Reconnecting...';
        });

        // --- Data Events (FIXED NAMES) ---

        // 1. New Message Received
        this.socket.on('new_message', (data) => {
            console.log('📨 WebSocket: new_message received', data);

            // Update the list order (Move to top)
            if (this.app.conversationUI) {
                this.app.conversationUI.updateConversationPreview(data.conversation_id, data.message);
            }

            // Show notification / Update chat view
            if (this.app.messaging) {
                this.app.messaging.handleIncomingMessage(data);
            }
        });

        // 2. Conversation Updated (e.g. State Change)
        this.socket.on('conversation_updated', (data) => {
            console.log('📋 WebSocket: conversation_updated', data);

            if (this.app.conversationUI) {
                // Always reload the list to update status/time
                this.app.conversationUI.loadConversations();

                // If we are looking at this conversation, refresh details
                if (this.app.currentConversationId === data.conversation_id) {
                    console.log('🔄 Refreshing current conversation details...');
                    // Reload messages
                    if (this.app.messaging) this.app.messaging.loadConversationMessages();
                    // Reload details
                    this.app.conversationUI.selectConversation(data.conversation_id);
                }
            }
        });

        // 3. Document Uploaded
        this.socket.on('document_uploaded', (data) => {
            console.log('📄 WebSocket: document_uploaded', data);
            // Only refresh if we are looking at this conversation's docs
            if (this.app.currentConversationId === data.conversation_id && this.app.documents) {
                this.app.documents.loadDocuments();
            }
        });

        // 4. FCS/Lender Updates
        this.socket.on('fcs_completed', (data) => {
            console.log('📊 WebSocket: fcs_completed', data);
            if (this.app.currentConversationId === data.conversation_id) {
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
