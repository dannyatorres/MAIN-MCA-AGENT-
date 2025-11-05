// State Manager for MCA Command Center
class StateManager {
    constructor() {
        this.state = {
            ui: {
                activeTab: 'overview',
                selectedConversation: null,
                sidebarOpen: true
            },
            data: {
                conversations: new Map(),
                documents: new Map(),
                lenders: new Map()
            },
            cache: {
                lastRefresh: null,
                cacheExpiry: 5 * 60 * 1000 // 5 minutes
            }
        };

        this.listeners = new Map();
        this.init();
    }

    init() {
        console.log('= Initializing State Manager...');

        // Load state from localStorage if available
        this.loadFromLocalStorage();

        // Setup auto-save
        this.setupAutoSave();

        console.log(' State Manager initialized');
    }

    // State getters
    getState(path) {
        if (!path) return this.state;

        const keys = path.split('.');
        let value = this.state;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return undefined;
            }
        }

        return value;
    }

    // State setters
    setState(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let target = this.state;

        // Navigate to the parent object
        for (const key of keys) {
            if (!target[key] || typeof target[key] !== 'object') {
                target[key] = {};
            }
            target = target[key];
        }

        // Set the value
        const oldValue = target[lastKey];
        target[lastKey] = value;

        // Trigger listeners
        this.notifyListeners(path, value, oldValue);

        // Auto-save to localStorage
        this.saveToLocalStorage();
    }

    // UI State helpers
    setActiveTab(tab) {
        this.setState('ui.activeTab', tab);
    }

    getActiveTab() {
        return this.getState('ui.activeTab');
    }

    setSelectedConversation(conversationId) {
        this.setState('ui.selectedConversation', conversationId);
    }

    getSelectedConversation() {
        return this.getState('ui.selectedConversation');
    }

    setSidebarOpen(isOpen) {
        this.setState('ui.sidebarOpen', isOpen);
    }

    isSidebarOpen() {
        return this.getState('ui.sidebarOpen');
    }

    // Data helpers
    setConversations(conversations) {
        const conversationMap = new Map();
        conversations.forEach(conv => {
            conversationMap.set(conv.id, conv);
        });
        this.setState('data.conversations', conversationMap);
    }

    getConversations() {
        return Array.from(this.getState('data.conversations')?.values() || []);
    }

    getConversation(id) {
        return this.getState('data.conversations')?.get(id);
    }

    updateConversation(id, updates) {
        const conversations = this.getState('data.conversations');
        if (conversations && conversations.has(id)) {
            const conversation = { ...conversations.get(id), ...updates };
            conversations.set(id, conversation);
            this.setState('data.conversations', conversations);
        }
    }

    setDocuments(conversationId, documents) {
        const documentsMap = this.getState('data.documents') || new Map();
        documentsMap.set(conversationId, documents);
        this.setState('data.documents', documentsMap);
    }

    getDocuments(conversationId) {
        return this.getState('data.documents')?.get(conversationId) || [];
    }

    // Cache helpers
    setCacheExpiry(minutes) {
        this.setState('cache.cacheExpiry', minutes * 60 * 1000);
    }

    isDataStale() {
        const lastRefresh = this.getState('cache.lastRefresh');
        const cacheExpiry = this.getState('cache.cacheExpiry');

        if (!lastRefresh) return true;

        return (Date.now() - lastRefresh) > cacheExpiry;
    }

    markDataRefreshed() {
        this.setState('cache.lastRefresh', Date.now());
    }

    // Event system
    subscribe(path, callback) {
        if (!this.listeners.has(path)) {
            this.listeners.set(path, []);
        }
        this.listeners.get(path).push(callback);

        // Return unsubscribe function
        return () => {
            const listeners = this.listeners.get(path);
            if (listeners) {
                const index = listeners.indexOf(callback);
                if (index > -1) {
                    listeners.splice(index, 1);
                }
            }
        };
    }

    notifyListeners(path, newValue, oldValue) {
        // Notify exact path listeners
        if (this.listeners.has(path)) {
            this.listeners.get(path).forEach(callback => {
                try {
                    callback(newValue, oldValue, path);
                } catch (error) {
                    console.error('Error in state listener:', error);
                }
            });
        }

        // Notify wildcard listeners (path.*)
        const pathParts = path.split('.');
        for (let i = 0; i < pathParts.length; i++) {
            const wildcardPath = pathParts.slice(0, i + 1).join('.') + '.*';
            if (this.listeners.has(wildcardPath)) {
                this.listeners.get(wildcardPath).forEach(callback => {
                    try {
                        callback(newValue, oldValue, path);
                    } catch (error) {
                        console.error('Error in wildcard state listener:', error);
                    }
                });
            }
        }
    }

    // Persistence
    saveToLocalStorage() {
        try {
            const stateToSave = {
                ui: this.state.ui,
                cache: this.state.cache
                // Don't save data as it should be fresh from server
            };
            localStorage.setItem('mcaCommandCenter', JSON.stringify(stateToSave));
        } catch (error) {
            console.warn('Failed to save state to localStorage:', error);
        }
    }

    loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem('mcaCommandCenter');
            if (saved) {
                const parsedState = JSON.parse(saved);

                // Merge saved state with default state
                if (parsedState.ui) {
                    this.state.ui = { ...this.state.ui, ...parsedState.ui };
                }
                if (parsedState.cache) {
                    this.state.cache = { ...this.state.cache, ...parsedState.cache };
                }

                console.log(' State loaded from localStorage');
            }
        } catch (error) {
            console.warn('Failed to load state from localStorage:', error);
        }
    }

    setupAutoSave() {
        // Save state every 30 seconds
        setInterval(() => {
            this.saveToLocalStorage();
        }, 30000);
    }

    // Utility methods
    clearCache() {
        this.setState('data.conversations', new Map());
        this.setState('data.documents', new Map());
        this.setState('data.lenders', new Map());
        this.setState('cache.lastRefresh', null);
    }

    reset() {
        this.state = {
            ui: {
                activeTab: 'overview',
                selectedConversation: null,
                sidebarOpen: true
            },
            data: {
                conversations: new Map(),
                documents: new Map(),
                lenders: new Map()
            },
            cache: {
                lastRefresh: null,
                cacheExpiry: 5 * 60 * 1000
            }
        };
        this.saveToLocalStorage();
    }

    getDebugInfo() {
        return {
            state: this.state,
            listeners: Array.from(this.listeners.keys()),
            isDataStale: this.isDataStale()
        };
    }
}

// Make it globally available
window.StateManager = StateManager;