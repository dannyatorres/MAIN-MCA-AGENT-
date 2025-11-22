// js/intelligence-manager.js
import { LeadFormsTab } from './intelligence-tabs/lead-forms.js';

export class IntelligenceManager {
    constructor(parent) {
        this.parent = parent; // The main CommandCenter app
        this.utils = parent.utils || window.conversationUI.utils;

        // 1. Initialize the NEW Module
        this.formsTab = new LeadFormsTab(parent);

        // 2. Cache for AI Chat (Legacy Logic)
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
            console.warn('⚠️ No .tab-btn elements found!');
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
                // ✅ USE THE NEW MODULE
                this.formsTab.render(content);
                break;

            case 'ai-assistant':
                // ⚠️ LEGACY LOGIC (Keep it here for now)
                this.renderAITab(content);
                break;

            case 'documents':
                // ⚠️ LEGACY LOGIC
                this.renderDocumentsTab(content);
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

    // --- PROXY METHODS (Connecting Main.js to New Module) ---

    showCreateLeadModal() {
        this.formsTab.openCreateModal();
    }

    // ============================================================
    //  LEGACY HANDLERS (To keep things working while we refactor)
    // ============================================================

    renderAITab(content) {
        const conv = this.parent.getSelectedConversation();
        if (!conv) {
            content.innerHTML = '<div class="empty-state">No conversation selected</div>';
            return;
        }

        // Basic AI Layout check
        if (this.parent.ai) {
            // Use the AI module if it exists
            // We reconstruct the HTML structure the AI module expects
            content.innerHTML = `
                <div class="ai-assistant-section" style="height: calc(100vh - 200px); display: flex; flex-direction: column;">
                    <div id="aiChatMessages" style="flex:1; overflow-y:auto; padding:20px;"></div>
                    <div class="ai-input-area" style="padding:20px; border-top:1px solid #eee;">
                        <textarea id="aiChatInput" placeholder="Ask AI..." style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px;"></textarea>
                        <button onclick="window.conversationUI.ai.sendAIMessage()" style="margin-top:10px; padding:8px 16px; background:#000; color:#fff; border-radius:6px;">Send</button>
                    </div>
                </div>
            `;
            this.parent.ai.initializeAIChat();
        } else {
            content.innerHTML = '<div class="empty-state">AI Module Loading...</div>';
        }
    }

    renderDocumentsTab(content) {
        if (this.parent.documents) {
            content.innerHTML = this.parent.documents.createDocumentsTabTemplate();
            setTimeout(() => this.parent.documents.loadDocuments(), 100);
        } else {
            content.innerHTML = '<div class="empty-state">Documents Module Loading...</div>';
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
        // Use existing lender logic if available
        if(this.parent.lenders) {
            // Logic to open existing lender modal
            // We can refactor this later
            alert("Lender modal opening...");
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
