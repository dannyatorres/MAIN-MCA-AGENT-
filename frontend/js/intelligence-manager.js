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
            'edit': new LeadFormController(parent), // This is your unified Modal Controller
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

        // 2. Global Modal Hook (For the + button)
        window.openRichCreateModal = () => {
            this.showCreateLeadModal();
        };
    }

    /**
     * Helper to flip between "News Feed" and "Tab Content"
     */
    toggleView(showIntelligence) {
        const homePanel = document.getElementById('rightPanelHome');
        const intelPanel = document.getElementById('rightPanelIntelligence');

        if (showIntelligence) {
            if (homePanel) homePanel.style.display = 'none';
            if (intelPanel) intelPanel.style.display = 'flex';
        } else {
            if (homePanel) homePanel.style.display = 'flex';
            if (intelPanel) intelPanel.style.display = 'none';
        }
    }

    switchTab(tabName) {
        console.log(`🔄 Switching to tab: ${tabName}`);

        // -----------------------------------------------------------
        // 🛑 INTERCEPT EDIT: OPEN MODAL INSTEAD OF PANEL
        // -----------------------------------------------------------
        if (tabName === 'edit') {
            console.log('✏️ Edit Tab Clicked -> Opening Pop-up Modal');

            // Check if a conversation is selected
            const currentConv = this.parent.getSelectedConversation();

            if (this.tabs['edit']) {
                if (currentConv) {
                    // Open the modal pre-filled with data
                    this.tabs['edit'].openEditModal(currentConv);
                } else {
                    alert("Please select a conversation to edit.");
                }
            }

            // CRITICAL: Return here so we DO NOT render the sidebar content
            return;
        }
        // -----------------------------------------------------------

        // Normal Tab Logic (AI, Docs, Lenders)
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        const container = document.getElementById('intelligenceContent');
        if (!container) return;

        // Clear previous content
        container.innerHTML = '';

        const tabModule = this.tabs[tabName];

        if (tabModule && typeof tabModule.render === 'function') {
            tabModule.render(container);
        } else {
            container.innerHTML = `<div class="error-state">Tab '${tabName}' not found.</div>`;
        }
    }

    showCreateLeadModal() {
        // Opens the empty "New Lead" modal
        this.tabs['edit'].openCreateModal();
    }

    async loadConversationIntelligence(conversationId = null) {
        const convId = conversationId || this.parent.getCurrentConversationId();
        if (!convId) return;

        // Switch view to Tabs immediately
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

        this.toggleView(true);

        // Default to AI tab if no specific tab is active
        const currentTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'ai-assistant';

        // If the current tab was "edit", switch to AI, because "Edit" is now a modal
        if (currentTab === 'edit') {
            this.switchTab('ai-assistant');
        } else {
            this.switchTab(currentTab);
        }
    }
}

window.IntelligenceManager = IntelligenceManager;
