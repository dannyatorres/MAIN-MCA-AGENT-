// MCA Command Center Main Application
class CommandCenter {
    constructor() {
        this.wsManager = null;
        this.conversationUI = null;
        this.stateManager = null;
        this.isInitialized = false;

        this.init();
    }

    async init() {
        console.log('= Initializing MCA Command Center...');

        try {
            // Initialize WebSocket Manager
            this.wsManager = new WebSocketManager();

            // Initialize State Manager if available
            if (typeof StateManager !== 'undefined') {
                this.stateManager = new StateManager();
            }

            // Initialize Conversation UI
            if (typeof ConversationUI !== 'undefined') {
                this.conversationUI = new ConversationUI(this.wsManager);
            }

            // Setup global keyboard shortcuts
            this.setupKeyboardShortcuts();

            // Setup global error handling
            this.setupErrorHandling();

            this.isInitialized = true;
            console.log(' MCA Command Center initialized successfully');

        } catch (error) {
            console.error('L Failed to initialize MCA Command Center:', error);
        }
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            // Only handle shortcuts when not typing in input fields
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }

            // Tab switching shortcuts (1-6 keys)
            if (event.key >= '1' && event.key <= '6') {
                const tabs = ['overview', 'documents', 'fcs', 'lenders', 'lender-management', 'edit'];
                const tabIndex = parseInt(event.key) - 1;
                if (tabs[tabIndex] && this.conversationUI) {
                    this.conversationUI.switchIntelligenceTab(tabs[tabIndex]);
                    event.preventDefault();
                }
            }

            // Escape key to clear selections
            if (event.key === 'Escape') {
                // Clear any modals or selections
                document.querySelectorAll('.modal').forEach(modal => {
                    modal.style.display = 'none';
                });
            }

            // Ctrl/Cmd + R for refresh
            if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
                if (this.conversationUI && this.conversationUI.loadConversations) {
                    event.preventDefault();
                    this.conversationUI.loadConversations();
                }
            }
        });
    }

    setupErrorHandling() {
        // Global error handler
        window.addEventListener('error', (event) => {
            console.error('Global error:', event.error);
            this.handleGlobalError(event.error);
        });

        // Unhandled promise rejection handler
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
            this.handleGlobalError(event.reason);
        });
    }

    handleGlobalError(error) {
        // Basic error notification (you can enhance this)
        if (error.message && error.message.includes('fetch')) {
            console.warn('Network error detected - check if backend is running');
        }
    }

    // Public methods
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            wsConnected: this.wsManager?.isConnected || false,
            conversationUIReady: !!this.conversationUI,
            stateManagerReady: !!this.stateManager
        };
    }

    restart() {
        console.log('= Restarting Command Center...');

        // Disconnect WebSocket
        if (this.wsManager) {
            this.wsManager.disconnect();
        }

        // Re-initialize
        setTimeout(() => {
            this.init();
        }, 1000);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('= DOM loaded, initializing Command Center...');
    window.commandCenter = new CommandCenter();
});

// Make it globally available
window.CommandCenter = CommandCenter;