// js/intelligence-manager.js
import { LeadFormsTab } from './intelligence-tabs/lead-forms.js';
import { DocumentsTab } from './intelligence-tabs/documents-tab.js';

export class IntelligenceManager {
    constructor(parent) {
        this.parent = parent; // The main CommandCenter app
        this.utils = parent.utils || window.conversationUI.utils;

        // Initialize Tab Modules
        this.formsTab = new LeadFormsTab(parent);
        this.documentsTab = new DocumentsTab(parent);

        // Cache for AI Chat (Legacy Logic)
        this.aiChatCache = new Map();

        this.init();
    }

    init() {
        console.log('🔧 IntelligenceManager: Initializing...');
        this.setupTabListeners();
    }

    setupTabListeners() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        if (tabButtons.length === 0) {
            return;
        }

        tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.switchTab(tab);
            });
        });
        console.log('✅ Tab listeners attached');
    }

    // Main Switching Logic
    async switchTab(tabName) {
        console.log(`🔄 Switching to tab: ${tabName}`);

        // Update Visual Buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        const content = document.getElementById('intelligenceContent');
        if (!content) return;

        // Route to the correct handler
        switch (tabName) {
            case 'edit':
                this.formsTab.render(content);
                break;
            case 'documents':
                // ✅ USE NEW MODULE
                this.documentsTab.render(content);
                break;
            case 'ai-assistant':
                // ⚠️ LEGACY LOGIC (Keep for now)
                this.renderAITab(content);
                break;
            case 'lenders':
                // ⚠️ LEGACY LOGIC
                this.renderLendersTab(content);
                break;
            case 'fcs':
                // ⚠️ LEGACY LOGIC
                this.renderFCSTab(content);
                break;
            default:
                content.innerHTML = `<div class="empty-state">Tab ${tabName} coming soon</div>`;
        }
    }

    // ============================================================
    //  MISSING LINK: Data Loading Methods (Restored)
    // ============================================================

    async loadConversationIntelligence(conversationId = null) {
        // 1. Determine ID
        const convId = conversationId || this.parent.getCurrentConversationId();
        if (!convId) {
            console.warn('⚠️ No conversation ID for intelligence load');
            return;
        }

        try {
            console.log(`📥 Loading intelligence data for: ${convId}`);

            // 2. Fetch Data
            const data = await this.parent.apiCall(`/api/conversations/${convId}`);
            const conversationData = data.conversation || data;

            // 3. Update Parent State (Critical for other modules)
            this.parent.selectedConversation = conversationData;
            this.parent.currentConversationId = convId;

            if (this.parent.conversationUI) {
                this.parent.conversationUI.selectedConversation = conversationData;
                this.parent.conversationUI.currentConversationId = convId;
                this.parent.conversationUI.conversations.set(convId, conversationData);
            }

            // 4. Render
            this.renderIntelligenceData(data);

        } catch (error) {
            console.error('❌ Failed to load conversation details:', error);
            if (this.utils) this.utils.showNotification('Failed to load details', 'error');
        }
    }

    renderIntelligenceData(data) {
        const conversationData = data.conversation || data;

        // 1. Update Header UI (Phone, Business Name, etc.)
        if (this.parent.conversationUI && this.parent.conversationUI.showConversationDetails) {
            this.parent.conversationUI.showConversationDetails();
        }

        // 2. Refresh the Current Tab
        const currentActiveTab = document.querySelector('.tab-btn.active');
        const currentTab = currentActiveTab?.dataset.tab || 'ai-assistant';

        console.log(`Refresh tab: ${currentTab}`);
        this.switchTab(currentTab);
    }

    // ============================================================
    //  PROXY METHODS
    // ============================================================

    showCreateLeadModal() {
        this.formsTab.openCreateModal();
    }

    // ============================================================
    //  LEGACY HANDLERS
    // ============================================================

    renderAITab(content) {
        const conv = this.parent.getSelectedConversation();
        if (!conv) {
            content.innerHTML = '<div class="empty-state">No conversation selected</div>';
            return;
        }

        if (this.parent.ai) {
            // Reconstruct HTML for AI Module
            content.innerHTML = `
                <div class="ai-assistant-section" style="height: calc(100vh - 200px); display: flex; flex-direction: column;">
                    <div id="aiChatMessages" style="flex:1; overflow-y:auto; padding:20px;">
                        <div style="text-align:center; color:#999; padding-top:20px;">
                            <div class="loading-spinner small"></div>
                            <p>Connecting to AI...</p>
                        </div>
                    </div>
                    <div class="ai-input-area" style="padding:20px; border-top:1px solid #eee;">
                        <textarea id="aiChatInput" placeholder="Ask AI..." style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; font-family:inherit;"></textarea>
                        <button id="aiChatSend" onclick="window.conversationUI.ai.sendAIMessage()" style="margin-top:10px; padding:8px 16px; background:#000; color:#fff; border-radius:6px; cursor:pointer;">Send</button>
                    </div>
                </div>
            `;

            // Reset & Re-init AI
            this.parent.ai.isInitialized = false;
            this.parent.ai.currentConversationId = null;
            this.parent.ai.initializeAIChat();
        } else {
            content.innerHTML = '<div class="empty-state">AI Module Loading...</div>';
        }
    }

    renderLendersTab(content) {
        const conv = this.parent.getSelectedConversation();
        if (!conv) {
            content.innerHTML = '<div class="empty-state">Select a conversation</div>';
            return;
        }

        content.innerHTML = `
            <div style="padding: 40px; text-align: center;">
                <h3>Lender Qualification</h3>
                <p>Match <strong>${conv.business_name}</strong> with lenders.</p>
                <button class="btn btn-primary" onclick="window.conversationUI.intelligence.openLendersModal()">
                    Open Lender Tools
                </button>
            </div>
        `;
    }

    openLendersModal() {
        if(this.parent.lenders) {
            if (this.parent.lenders.openLenderModal) {
                this.parent.lenders.openLenderModal();
            } else {
               const modal = document.getElementById('lendersInlineModal');
               if (modal) modal.style.display = 'flex';
            }
        }
    }

    renderFCSTab(content) {
        if(this.parent.fcs) {
            content.innerHTML = '<div id="fcsResults"></div>';
            this.parent.fcs.loadFCSData();
        } else {
            content.innerHTML = '<div class="empty-state">FCS Module Loading...</div>';
        }
    }
}

// Expose globally for non-module scripts
window.IntelligenceManager = IntelligenceManager;
