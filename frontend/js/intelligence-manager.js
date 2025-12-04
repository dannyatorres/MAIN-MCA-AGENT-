// frontend/js/intelligence-manager.js
import { LeadFormController } from './controllers/lead-form-controller.js';
import { DocumentsTab } from './intelligence-tabs/documents-tab.js';
import { AIAssistantTab } from './intelligence-tabs/ai-tab.js';
import { LendersTab } from './intelligence-tabs/lenders-tab.js';
import { FCSTab } from './intelligence-tabs/fcs-tab.js';
import { EmailTab } from './intelligence-tabs/email-tab.js';

export class IntelligenceManager {
    constructor(parent) {
        this.parent = parent;

        this.tabs = {
            'edit': new LeadFormController(parent),
            'documents': new DocumentsTab(parent),
            'ai-assistant': new AIAssistantTab(parent),
            'lenders': new LendersTab(parent),
            'fcs': new FCSTab(parent),
            'email': new EmailTab(parent)
        };

        this.init();
    }

    init() {
        console.log('🔧 IntelligenceManager: Initialized');

        // 1. Tab Switching Logic
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // 2. Global Modal Hook
        window.openRichCreateModal = () => {
            this.showCreateLeadModal();
        };
    }

    /**
     * HELPER TO FLIP THE PANELS
     * This hides the "News Feed" and shows the "Tabs"
     */
    toggleView(showIntelligence) {
        const homePanel = document.getElementById('rightPanelHome');
        const intelPanel = document.getElementById('rightPanelIntelligence');

        if (showIntelligence) {
            if (homePanel) homePanel.style.display = 'none';
            if (intelPanel) intelPanel.style.display = 'flex'; // Use flex to maintain layout
        } else {
            if (homePanel) homePanel.style.display = 'flex';
            if (intelPanel) intelPanel.style.display = 'none';
        }
    }

    switchTab(tabName) {
        console.log(`🔄 Switching to tab: ${tabName}`);

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        const container = document.getElementById('intelligenceContent');
        if (!container) return;

        container.innerHTML = '';

        const tabModule = this.tabs[tabName];

        if (tabName === 'edit') {
            tabModule.renderEditTab(container);
        } else if (tabModule && typeof tabModule.render === 'function') {
            tabModule.render(container);
        } else {
            container.innerHTML = `<div class="error-state">Tab '${tabName}' not found.</div>`;
        }
    }

    showCreateLeadModal() {
        this.tabs['edit'].openCreateModal();
    }

    openLendersModal() {
        if (this.tabs['lenders']) this.tabs['lenders'].openModal();
    }

    async loadConversationIntelligence(conversationId = null) {
        const convId = conversationId || this.parent.getCurrentConversationId();
        if (!convId) return;

        // IMMEDIATELY SHOW THE INTELLIGENCE PANEL
        // Before we even fetch data, switch the view so the user sees something happening
        this.toggleView(true);

        try {
            const data = await this.parent.apiCall(`/api/conversations/${convId}`);
            const conversationData = data.conversation || data;

            // Sync State
            this.parent.selectedConversation = conversationData;
            this.parent.currentConversationId = convId;

            if (this.parent.conversationUI) {
                this.parent.conversationUI.selectedConversation = conversationData;
                this.parent.conversationUI.currentConversationId = convId;
                this.parent.conversationUI.conversations.set(convId, conversationData);
            }

            this.renderIntelligenceData(data);
        } catch (error) {
            console.error('❌ Failed to load details:', error);
        }
    }

    renderIntelligenceData(data) {
        if (this.parent.conversationUI?.showConversationDetails) {
            this.parent.conversationUI.showConversationDetails();
        }

        // ENSURE PANEL IS VISIBLE
        this.toggleView(true);

        const currentTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'ai-assistant';
        this.switchTab(currentTab);
    }
}

window.IntelligenceManager = IntelligenceManager;
