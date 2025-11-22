// js/intelligence-manager.js
import { LeadFormsTab } from './intelligence-tabs/lead-forms.js';
import { DocumentsTab } from './intelligence-tabs/documents-tab.js';
import { AIAssistantTab } from './intelligence-tabs/ai-tab.js';

export class IntelligenceManager {
    constructor(parent) {
        this.parent = parent; // The main CommandCenter app
        this.utils = parent.utils || window.conversationUI.utils;

        // Initialize Tab Modules
        this.formsTab = new LeadFormsTab(parent);
        this.documentsTab = new DocumentsTab(parent);
        this.aiTab = new AIAssistantTab(parent);

        // Cache for AI Chat (Keep for compatibility if AI logic uses it)
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
                this.documentsTab.render(content);
                break;
            case 'ai-assistant':
                // ✅ USE NEW MODULE
                this.aiTab.render(content);
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
                // Default to AI if unknown tab
                this.aiTab.render(content);
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
