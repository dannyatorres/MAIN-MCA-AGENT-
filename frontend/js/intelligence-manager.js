// js/intelligence-manager.js

// Import all tab modules
import { LeadFormsTab } from './intelligence-tabs/lead-forms.js';
import { DocumentsTab } from './intelligence-tabs/documents-tab.js';
import { AIAssistantTab } from './intelligence-tabs/ai-tab.js';
import { LendersTab } from './intelligence-tabs/lenders-tab.js';
import { FCSTab } from './intelligence-tabs/fcs-tab.js';

export class IntelligenceManager {
    constructor(parent) {
        this.parent = parent;
        this.utils = parent.utils || window.conversationUI.utils;

        // Initialize Tab Modules
        this.formsTab = new LeadFormsTab(parent);
        this.documentsTab = new DocumentsTab(parent);
        this.aiTab = new AIAssistantTab(parent);
        this.lendersTab = new LendersTab(parent);
        this.fcsTab = new FCSTab(parent);

        this.init();
    }

    init() {
        console.log('🔧 IntelligenceManager: Initialized & Modularized');
        this.setupTabListeners();
    }

    setupTabListeners() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        if (tabButtons.length === 0) return;

        tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.switchTab(tab);
            });
        });
    }

    async switchTab(tabName) {
        console.log(`🔄 Switching to tab: ${tabName}`);

        // 1. Visual Update
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        const content = document.getElementById('intelligenceContent');
        if (!content) return;

        // 2. Route to Module
        switch (tabName) {
            case 'edit':
                this.formsTab.render(content);
                break;
            case 'ai-assistant':
                this.aiTab.render(content);
                break;
            case 'documents':
                this.documentsTab.render(content);
                break;
            case 'lenders':
                this.lendersTab.render(content);
                break;
            case 'fcs':
                this.fcsTab.render(content);
                break;
            default:
                content.innerHTML = `<div class="empty-state">Tab ${tabName} coming soon</div>`;
        }
    }

    // --- Proxy Methods (Called by Main.js or other legacy scripts) ---

    showCreateLeadModal() {
        this.formsTab.openCreateModal();
    }

    openLendersModal() {
        this.lendersTab.openModal();
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
