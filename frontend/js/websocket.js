// WebSocket Manager for MCA Command Center
class WebSocketManager {
    constructor(app) {
        this.app = app;
        this.socket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.isConnecting = false;
        this.eventListeners = {}; // Event emitter for module communication

        console.log('WebSocketManager: Initializing...');
        this.connect();
    }

    // Event emitter methods
    on(event, callback) {
        if (!this.eventListeners[event]) {
            this.eventListeners[event] = [];
        }
        this.eventListeners[event].push(callback);
    }

    trigger(event, data) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }

    connect() {
        if (this.isConnecting || (this.socket && this.socket.connected)) {
            console.log('WebSocketManager: Already connected or connecting');
            return;
        }

        this.isConnecting = true;
        console.log(`WebSocketManager: Connecting to ${this.app.wsUrl}...`);

        try {
            // Initialize Socket.io connection
            this.socket = io(this.app.wsUrl, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: this.reconnectDelay,
                reconnectionAttempts: this.maxReconnectAttempts,
                auth: {
                    userId: this.app.userId || 'default'
                }
            });

            this.setupEventHandlers();

            // Make socket globally available
            window.socket = this.socket;

        } catch (error) {
            console.error('WebSocketManager: Connection error:', error);
            this.isConnecting = false;
        }
    }

    setupEventHandlers() {
        // Connection events
        this.socket.on('connect', () => {
            console.log(' WebSocket connected');
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            this.onConnect();
        });

        this.socket.on('disconnect', (reason) => {
            console.log('L WebSocket disconnected:', reason);
            this.isConnecting = false;
            this.onDisconnect(reason);
        });

        this.socket.on('connect_error', (error) => {
            console.error('WebSocket connection error:', error);
            this.isConnecting = false;
            this.reconnectAttempts++;

            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.error('Max reconnection attempts reached');
            }
        });

        this.socket.on('reconnect', (attemptNumber) => {
            console.log(' WebSocket reconnected after', attemptNumber, 'attempts');
            this.reconnectAttempts = 0;
        });

        // Data events
        this.socket.on('conversation:update', (data) => {
            console.log('=� Conversation update received:', data);
            this.handleConversationUpdate(data);
        });

        this.socket.on('message:new', (data) => {
            console.log('=� New message received:', data);
            this.handleNewMessage(data);
        });

        this.socket.on('document:update', (data) => {
            console.log('=� Document update received:', data);
            this.handleDocumentUpdate(data);
        });

        this.socket.on('fcs:status', (data) => {
            console.log('=� FCS status update received:', data);
            this.handleFCSUpdate(data);
        });
    }

    onConnect() {
        // Join user's room
        if (this.app.userId) {
            this.socket.emit('join:user', { userId: this.app.userId });
        }
    }

    onDisconnect(reason) {
        // Handle disconnect
        if (reason === 'io server disconnect') {
            // Server disconnected, try to reconnect
            this.socket.connect();
        }
    }

    // Handle incoming data
    handleConversationUpdate(data) {
        this.trigger('conversation_updated', data);
        if (this.app.conversationUI && this.app.conversationUI.handleConversationUpdate) {
            this.app.conversationUI.handleConversationUpdate(data);
        }
    }

    handleNewMessage(data) {
        this.trigger('message_new', data);
        if (this.app.messaging && this.app.messaging.handleNewMessage) {
            this.app.messaging.handleNewMessage(data);
        }
    }

    handleDocumentUpdate(data) {
        this.trigger('document_updated', data);
        if (this.app.documents && this.app.documents.handleDocumentUpdate) {
            this.app.documents.handleDocumentUpdate(data);
        }
    }

    handleFCSUpdate(data) {
        this.trigger('fcs_updated', data);
        if (this.app.fcs && this.app.fcs.handleFCSUpdate) {
            this.app.fcs.handleFCSUpdate(data);
        }
    }

    // Emit events
    emit(event, data) {
        if (this.socket && this.socket.connected) {
            this.socket.emit(event, data);
        } else {
            console.warn('WebSocketManager: Cannot emit, socket not connected');
        }
    }

    // Join/leave rooms
    joinConversation(conversationId) {
        this.emit('join:conversation', { conversationId });
    }

    leaveConversation(conversationId) {
        this.emit('leave:conversation', { conversationId });
    }

    // Disconnect
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

// Make it globally available
window.WebSocketManager = WebSocketManager;
