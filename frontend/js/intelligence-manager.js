// frontend/js/intelligence-manager.js
import { LeadFormController } from './controllers/lead-form-controller.js';
// Keep existing imports for other tabs
import { DocumentsTab } from './intelligence-tabs/documents-tab.js';
import { AIAssistantTab } from './intelligence-tabs/ai-tab.js';
import { LendersTab } from './intelligence-tabs/lenders-tab.js';
import { FCSTab } from './intelligence-tabs/fcs-tab.js';
import { EmailTab } from './intelligence-tabs/email-tab.js';

export class IntelligenceManager {
    constructor(parent) {
        this.parent = parent;

        // Initialize Tab Controllers
        this.tabs = {
            'edit': new LeadFormController(parent), // <--- WIRED NEW CONTROLLER
            'documents': new DocumentsTab(parent),
            'ai-assistant': new AIAssistantTab(parent),
            'lenders': new LendersTab(parent),
            'fcs': new FCSTab(parent),
            'email': new EmailTab(parent)
        };

        this.init();
    }

    init() {
        console.log('🔧 IntelligenceManager: Initialized & Modularized');
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchTab(tabName);
            });
        });
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

        // Special case for Edit tab using the new Controller
        if (tabName === 'edit') {
            tabModule.renderEditTab(container);
        }
        // Standard render for other tabs
        else if (tabModule && typeof tabModule.render === 'function') {
            tabModule.render(container);
        }
        else {
            container.innerHTML = `<div class="error-state">Tab '${tabName}' not found.</div>`;
        }
    }

    // Public method for legacy "Add Lead" button
    showCreateLeadModal() {
        this.tabs['edit'].openCreateModal();
    }

    // Proxy for lenders modal
    openLendersModal() {
        if (this.tabs['lenders'] && typeof this.tabs['lenders'].openModal === 'function') {
            this.tabs['lenders'].openModal();
        }
    }

    // --- Data Loading (Essential for App State) ---
    async loadConversationIntelligence(conversationId = null) {
        const convId = conversationId || this.parent.getCurrentConversationId();
        if (!convId) return;

        try {
            const data = await this.parent.apiCall(`/api/conversations/${convId}`);
            const conversationData = data.conversation || data;

            // Update Parent State
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
        // Refresh current active tab
        const currentTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'ai-assistant';
        this.switchTab(currentTab);
    }
}

// Expose globally for non-module scripts
window.IntelligenceManager = IntelligenceManager;
