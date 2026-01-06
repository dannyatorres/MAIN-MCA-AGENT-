// WebSocket Manager - Simplified Event Routing

class WebSocketManager {
    constructor(app) {
        this.app = app;
        this.socket = null;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;

        console.log('WebSocketManager: Initializing...');
        this.connect();
    }

    connect() {
        if (this.isConnecting || (this.socket && this.socket.connected)) return;
        this.isConnecting = true;

        const wsUrl = this.app.wsUrl || window.location.origin;
        console.log(`WebSocketManager: Connecting to ${wsUrl}...`);

        try {
            // Ensure socket.io is loaded
            if (typeof io === 'undefined') {
                console.warn('Socket.io not found, retrying...');
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
            console.log('📨 WebSocket: new_message received', data);
            if (this.app.messaging) {
                this.app.messaging.handleIncomingMessage(data);
            }
        });

        // 2. Conversation Updated (Status change, etc)
        this.socket.on('conversation_updated', (data) => {
            console.log('📋 WebSocket: conversation_updated', data);

            // If we are looking at it, refresh details only (header, AI button, etc.)
            if (String(this.app.currentConversationId) === String(data.conversation_id)) {
                if (this.app.conversationUI) {
                    this.app.conversationUI.showConversationDetails();
                }
                // DON'T reload messages - new_message event handles that
            }

            // Always refresh the conversations list (moves active one to top, updates previews)
            if (this.app.conversationUI) {
                this.app.conversationUI.loadConversations();
            }
        });

        // 3. New Lead / Offer / Refresh List
        // FIX: Delegate strictly to ConversationUI to prevent duplicates
        // No more direct DOM manipulation here - single source of truth
        this.socket.on('refresh_lead_list', async (data) => {
            console.log('⚡ WebSocket: refresh_lead_list', data);

            if (!this.app.conversationUI) return;

            // Delegate to ConversationCore to handle update
            await this.app.conversationUI.handleConversationUpdate(data.conversationId);
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
