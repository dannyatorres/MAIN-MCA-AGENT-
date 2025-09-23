// websocket.js - Complete WebSocket connection management

export default class WebSocketManager {
    constructor(parent) {
        this.parent = parent;
        this.ws = null;
        this.wsUrl = parent.wsUrl || 'ws://localhost:3001';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.listeners = new Map();
        this.pingInterval = null;
        this.isIntentionallyClosed = false;

        this.init();
    }

    init() {
        this.connect();
        this.setupWindowListeners();
    }

    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('WebSocket already connected');
            return;
        }

        console.log(`Connecting to WebSocket: ${this.wsUrl}`);
        this.isIntentionallyClosed = false;

        try {
            this.ws = new WebSocket(this.wsUrl);
            this.setupEventHandlers();
        } catch (error) {
            console.error('WebSocket connection error:', error);
            this.scheduleReconnect();
        }
    }

    setupEventHandlers() {
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.reconnectAttempts = 0;
            this.emit('connected');
            this.startPing();

            // Send initial subscription
            this.send('subscribe', {
                type: 'conversations',
                userId: this.parent.userId || 'default'
            });
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('WebSocket message received:', data.type);

                // Handle different message types
                switch(data.type) {
                    case 'pong':
                        // Heartbeat response
                        break;

                    case 'conversation_updated':
                        this.emit('conversation_updated', data);
                        break;

                    case 'new_message':
                        this.emit('new_message', data);
                        break;

                    case 'stats_updated':
                        this.emit('stats_updated', data);
                        break;

                    case 'fcs_status':
                        this.emit('fcs_status', data);
                        break;

                    case 'document_processed':
                        this.emit('document_processed', data);
                        break;

                    default:
                        console.log('Unknown WebSocket message type:', data.type);
                        this.emit(data.type, data);
                        break;
                }
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.emit('error', error);
        };

        this.ws.onclose = (event) => {
            console.log('WebSocket closed:', event.code, event.reason);
            this.stopPing();
            this.emit('disconnected');

            if (!this.isIntentionallyClosed) {
                this.scheduleReconnect();
            }
        };
    }

    setupWindowListeners() {
        // Reconnect when window regains focus
        window.addEventListener('focus', () => {
            if (!this.isConnected()) {
                console.log('Window focused, checking WebSocket connection...');
                this.connect();
            }
        });

        // Clean close on window unload
        window.addEventListener('beforeunload', () => {
            this.disconnect();
        });
    }

    startPing() {
        this.stopPing();
        this.pingInterval = setInterval(() => {
            if (this.isConnected()) {
                this.send('ping');
            }
        }, 30000); // Ping every 30 seconds
    }

    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            this.emit('max_reconnect_failed');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);

        console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);

        setTimeout(() => {
            if (!this.isIntentionallyClosed) {
                this.connect();
            }
        }, delay);
    }

    send(type, data = {}) {
        if (!this.isConnected()) {
            console.warn('WebSocket not connected, cannot send:', type);
            return false;
        }

        try {
            const message = JSON.stringify({ type, ...data });
            this.ws.send(message);
            return true;
        } catch (error) {
            console.error('Error sending WebSocket message:', error);
            return false;
        }
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    off(event, callback) {
        if (!this.listeners.has(event)) return;

        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);

        if (index !== -1) {
            callbacks.splice(index, 1);
        }
    }

    emit(event, data) {
        if (!this.listeners.has(event)) return;

        const callbacks = this.listeners.get(event);
        callbacks.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in WebSocket listener for ${event}:`, error);
            }
        });
    }

    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    disconnect() {
        console.log('Disconnecting WebSocket...');
        this.isIntentionallyClosed = true;
        this.stopPing();

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    reconnect() {
        console.log('Manual reconnect requested');
        this.disconnect();
        this.reconnectAttempts = 0;
        setTimeout(() => this.connect(), 100);
    }

    // Utility methods for specific operations
    subscribeToConversation(conversationId) {
        return this.send('subscribe_conversation', { conversationId });
    }

    unsubscribeFromConversation(conversationId) {
        return this.send('unsubscribe_conversation', { conversationId });
    }

    requestStats() {
        return this.send('request_stats');
    }

    refreshData() {
        return this.send('refresh_data');
    }
}