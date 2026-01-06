// --- Global Error Boundary (Safety Net) ---
window.addEventListener('error', (event) => {
    console.error('🚨 Global Error:', event.error);
    if (window.utils?.showNotification) {
        window.utils.showNotification(`System Error: ${event.message}`, 'error');
    }
});

window.addEventListener('unhandledrejection', (event) => {
    // Filter out "ResizeObserver loop" noise which is harmless
    if (event.reason?.message?.includes('ResizeObserver')) return;

    console.error('🚨 Async Error:', event.reason);
    if (window.utils?.showNotification) {
        const msg = event.reason?.message || 'An operation failed silently.';
        window.utils.showNotification(`Error: ${msg}`, 'error');
    }
});
// ------------------------------------------

// MCA Command Center Main Application (App Core - Source of Truth)

// ⚠️ NO IMPORTS HERE - This is a standard script, not a module
// LeadFormController will be injected by main.js

class CommandCenter {
    constructor() {
        // Use dynamic URLs based on current domain
        const isHttps = window.location.protocol === 'https:';

        // 🚀 LOCAL DEVELOPMENT: Point to Railway backend
        const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        // Railway backend URL
        const RAILWAY_BACKEND_URL = '';

        this.apiBaseUrl = isLocalDev ? RAILWAY_BACKEND_URL : window.location.origin;
        this.wsUrl = isLocalDev ?
            `wss://${RAILWAY_BACKEND_URL.replace('https://', '')}` :
            `${isHttps ? 'wss:' : 'ws:'}//${window.location.host}`;

        this.userId = 'default';

        // 🛡️ SECURITY FIX: Removed hardcoded credentials (this.apiAuth)

        this.isInitialized = false;

        console.log('🔧 CommandCenter initialized with:');
        console.log('   WebSocket URL:', this.wsUrl);
        console.log('   API Base URL:', this.apiBaseUrl);

        // Initialize utilities FIRST (they have no dependencies)
        this.utils = new Utilities(this);
        this.templates = new Templates(this);

        // Set these to null initially
        this.wsManager = null;
        this.conversationUI = null;
        this.messaging = null;
        this.intelligence = null;
        this.documents = null;
        this.lenders = null;
        this.fcs = null;
        this.ai = null;
        this.emailTab = null;
        this.stats = null;
        this.stateManager = null;
        this.leadFormController = null; // Placeholder: main.js will inject this

        // Core properties
        this.currentConversationId = null;
        this.selectedConversation = null;

        // Now initialize
        this.init();
    }

    async apiCall(endpoint, options = {}) {
        // 🚀 LOCAL DEV BYPASS: Skip auth for local development
        const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        const config = {
            ...options,
            credentials: 'include', // 🛡️ SECURITY FIX: Sends existing session cookies/auth
            headers: {
                'Content-Type': 'application/json',
                // 🚀 LOCAL DEV: Add mock auth header for local testing
                ...(isLocalDev ? { 'X-Local-Dev': 'true' } : {}),
                ...(options.headers || {})
            }
        };

        // Handle body serialization
        if (options.body && typeof options.body === 'object') {
            config.body = JSON.stringify(options.body);
        }

        const response = await fetch(`${this.apiBaseUrl}${endpoint}`, config);

        if (response.status === 401) {
            // 🚀 LOCAL DEV BYPASS: Don't block on 401 when developing locally
            if (isLocalDev) {
                console.warn("⚠️ Auth bypassed for local development");
                // Return mock data or empty response
                return {};
            }
            console.error("⚠️ Unauthorized access. Please log in.");
            throw new Error("Unauthorized: Please log in");
        }

        if (!response.ok) throw new Error(`HTTP ${response.status}:`);
        return response.json();
    }

    async init() {
        console.log('=== Initializing MCA Command Center ===');

        try {
            // 1. WebSocket Manager
            console.log('1. Initializing WebSocket...');
            this.wsManager = new WebSocketManager(this);

            // 2. Conversation Core (depends on wsManager)
            console.log('2. Initializing Conversation Core...');
            if (typeof ConversationCore !== 'undefined') {
                this.conversationUI = new ConversationCore(this, this.wsManager);
                this.core = this.conversationUI; // Alias for compatibility
            } else {
                console.error('ConversationCore class not found!');
            }

            // 3. Messaging Module
            console.log('3. Initializing Messaging...');
            if (typeof MessagingModule !== 'undefined') {
                this.messaging = new MessagingModule(this);
            } else {
                console.error('MessagingModule class not found!');
            }

            // 4. Documents Module
            console.log('4. Initializing Documents...');
            if (typeof DocumentsModule !== 'undefined') {
                this.documents = new DocumentsModule(this);
            } else {
                console.error('DocumentsModule class not found!');
            }

            // 5. Intelligence/Tabs Module (NEW: Using IntelligenceManager)
            console.log('5. Initializing Intelligence...');
            if (typeof IntelligenceManager !== 'undefined') {
                this.intelligence = new IntelligenceManager(this);
            } else {
                console.error('IntelligenceManager class not found!');
            }

            // 6. FCS Module
            console.log('6. Initializing FCS...');
            if (typeof FCSModule !== 'undefined') {
                this.fcs = new FCSModule(this);
            } else {
                console.error('FCSModule class not found!');
            }

            // 7. Lenders Module
            console.log('7. Initializing Lenders...');
            if (typeof LendersModule !== 'undefined') {
                this.lenders = new LendersModule(this);
            } else {
                console.error('LendersModule class not found!');
            }

            // 8. AI Assistant
            console.log('8. Initializing AI Assistant...');
            if (typeof AIAssistant !== 'undefined') {
                this.ai = new AIAssistant(this);
            } else {
                console.error('AIAssistant class not found!');
            }

            // 8.5 Email Tab (Optional - may not exist yet)
            console.log('8.5 Initializing Email Tab...');
            if (typeof EmailTab !== 'undefined') {
                this.emailTab = new EmailTab(this);
            } else {
                console.warn('⚠️ EmailTab class missing - feature disabled (check imports)');
                // Do not throw error, just continue
            }

            // 9. Stats Module
            console.log('9. Initializing Stats...');
            if (typeof StatsModule !== 'undefined') {
                this.stats = new StatsModule(this);
            } else {
                console.error('StatsModule class not found!');
            }

            // 10. State Manager if available
            console.log('10. Initializing State Manager...');
            if (typeof StateManager !== 'undefined') {
                this.stateManager = new StateManager(this);
            } else {
                console.warn('StateManager class not found (optional)');
            }

            // ⚠️ NOTE: LeadFormController is injected by main.js AFTER this init completes
            // We don't initialize it here to avoid module/import issues

            // Setup global keyboard shortcuts
            this.setupKeyboardShortcuts();

            // Setup tab switching behavior
            this.setupTabSwitching();

            // Setup global error handling
            this.setupErrorHandling();

            this.isInitialized = true;
            console.log('✅ MCA Command Center initialized successfully');
            console.log('Loaded modules:', {
                conversationUI: !!this.conversationUI,
                messaging: !!this.messaging,
                documents: !!this.documents,
                intelligence: !!this.intelligence,
                fcs: !!this.fcs,
                lenders: !!this.lenders,
                ai: !!this.ai,
                emailTab: !!this.emailTab,
                stats: !!this.stats,
                leadFormController: '(pending injection from main.js)'
            });

            // Make modules globally accessible for compatibility
            this.exposeGlobalReferences();

        } catch (error) {
            console.error('❌ Failed to initialize MCA Command Center:', error);
        }
    }

    exposeGlobalReferences() {
        // Make commandCenter accessible as conversationUI for backward compatibility
        if (!window.conversationUI) {
            window.conversationUI = this;
            console.log('✅ window.conversationUI alias created');
        }

        // Make individual modules accessible globally
        if (this.fcs) {
            window.fcsModule = this.fcs;
            console.log('✅ window.fcsModule exposed');
        }

        // ⚠️ SAFE GLOBAL MODAL BUTTONS
        // These check if the controller exists before running (it will be injected by main.js)
        window.openRichCreateModal = () => {
            console.log('🚀 Opening New Lead Form (via CommandCenter)...');
            if (this.leadFormController) {
                this.leadFormController.openCreateModal();
            } else {
                console.warn('⚠️ LeadFormController not ready yet. Waiting for main.js injection...');
            }
        };

        // Wire the "Edit Lead" button globally
        window.openEditLeadModal = () => {
            console.log('✏️ Opening Edit Lead Form...');

            // 1. Ensure the Right Panel is visible using the manager (handles the classes correctly)
            if (this.intelligence) {
                this.intelligence.toggleView(true);

                // 2. Switch to the 'edit' tab using the manager (handles tab button active states too)
                this.intelligence.switchTab('edit');
            } else {
                console.warn('⚠️ IntelligenceManager not ready yet.');
            }
        };

        // Reset lead for AI Dispatcher
        window.resetSelectedLead = async () => {
            // 1. Get the current ID from your existing system
            const currentId = window.conversationUI?.currentConversationId;

            if (!currentId) {
                alert("⚠️ Please select a conversation first.");
                return;
            }

            if (!confirm("🤖 Reset this lead for the AI Agent?\n\nThis will mark it as 'NEW' and trick the system into thinking it arrived 20 mins ago.")) {
                return;
            }

            try {
                // 2. Call the new API endpoint
                const response = await window.commandCenter.apiCall(`/api/conversations/${currentId}/reset-ai`, {
                    method: 'POST'
                });

                if (response.success) {
                    alert("✅ Lead Reset! The AI Dispatcher will pick this up on the next run.");

                    // 3. Refresh the list to see the status change to 'NEW'
                    if (window.conversationUI) {
                        window.conversationUI.loadConversations();
                    }
                } else {
                    alert("❌ Error: " + response.error);
                }
            } catch (err) {
                console.error(err);
                alert("❌ Failed to connect to server.");
            }
        };

        console.log('✅ Global references and Modal functions exposed');
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            // Only handle shortcuts when not typing in input fields
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }

            // Tab switching shortcuts (1-6 keys)
            if (event.key >= '1' && event.key <= '6') {
                const tabIndex = parseInt(event.key) - 1;
                const tabs = document.querySelectorAll('.tab-btn');
                if (tabs[tabIndex]) {
                    tabs[tabIndex].click();
                    event.preventDefault();
                }
            }

            // Refresh shortcut (R key)
            if (event.key === 'r' || event.key === 'R') {
                if (this.conversationUI && this.conversationUI.loadConversations) {
                    console.log('Refreshing conversations via keyboard shortcut...');
                    this.conversationUI.loadConversations();
                }
                event.preventDefault();
            }
        });
    }

    setupErrorHandling() {
        window.addEventListener('error', (event) => {
            console.error('Global error caught:', event.error);
        });

        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
        });
    }

    setupTabSwitching() {
        // Listen for tab switches
        document.addEventListener('click', (event) => {
            const tabButton = event.target.closest('.tab-btn');
            if (tabButton) {
                const tabName = tabButton.getAttribute('data-tab');

                // When switching to AI Assistant tab, just re-initialize (use cache if available)
                // FIX: Removed destructive cache clearing that caused flicker
                if (tabName === 'ai-assistant' && this.ai && this.currentConversationId) {
                    setTimeout(() => {
                        console.log('Tab switched to AI Assistant');
                        // Let AI assistant handle caching - don't clear it
                        this.ai.initializeAIChat();
                    }, 100);
                }
            }
        });
    }

    // Add helper methods for modules to access
    getCurrentConversationId() {
        return this.conversationUI?.currentConversationId || this.currentConversationId;
    }

    getSelectedConversation() {
        return this.conversationUI?.selectedConversation || this.selectedConversation;
    }

    getConversations() {
        return this.conversationUI?.conversations || new Map();
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing MCA Command Center...');
    window.commandCenter = new CommandCenter();
});
