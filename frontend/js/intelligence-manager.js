// frontend/js/intelligence-manager.js

import { EditTab } from './intelligence-tabs/edit-tab.js';
import { DocumentsTab } from './intelligence-tabs/documents-tab.js';
// AI Tab Import REMOVED - We use the global AIAssistant now
import { LendersTab } from './intelligence-tabs/lenders-tab.js';
import { FCSTab } from './intelligence-tabs/fcs-tab.js';
import { NotesTab } from './intelligence-tabs/notes-tab.js';
import { DealIntelligenceTab } from './intelligence-tabs/deal-intelligence-tab.js';

export class IntelligenceManager {
    constructor(parent) {
        this.parent = parent;

        this.tabs = {
            'edit': new EditTab(parent),
            'documents': new DocumentsTab(parent),
            // 'ai-assistant': REMOVED (Handled dynamically)
            'lenders': new LendersTab(parent),
            'fcs': new FCSTab(parent),
            'notes': new NotesTab(parent),
            'strategy': new DealIntelligenceTab(parent)
        };

        this.notesTab = this.tabs['notes'];
        if (this.notesTab) {
            this.notesTab.onBadgeUpdate = (count) => this.updateNotesBadge(count);
        }

        this.init();
    }

    init() {
        console.log('🔧 IntelligenceManager: Initialized');

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Global Modal Hook
        window.openRichCreateModal = () => {
            this.showCreateLeadModal();
        };
    }

    toggleView(showIntelligence) {
        // REFACTORED: Use classes instead of inline styles
        const homePanel = document.getElementById('rightPanelHome');
        const intelPanel = document.getElementById('rightPanelIntelligence');

        if (homePanel && intelPanel) {
            if (showIntelligence) {
                homePanel.classList.add('hidden');
                intelPanel.classList.remove('hidden');
            } else {
                homePanel.classList.remove('hidden');
                intelPanel.classList.add('hidden');
            }
        }
    }


    switchTab(tabName) {
        console.log(`🔄 Switching to tab: ${tabName}`);

        // --- INTERCEPT EDIT ---
        if (tabName === 'edit') {
            const currentConv = this.parent.getSelectedConversation();
            if (this.tabs['edit']) {
                if (currentConv) {
                    this.tabs['edit'].openEditModal(currentConv);
                } else {
                    alert("Please select a conversation to edit.");
                }
            }
            return;
        }

        // --- STANDARD TABS ---
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        const container = document.getElementById('intelligenceContent');
        const notesPanel = document.getElementById('notesPanel');
        if (!container) return;

        if (tabName === 'notes') {
            if (container) container.classList.add('hidden');
            if (notesPanel) notesPanel.classList.remove('hidden');
            return;
        }

        if (notesPanel) notesPanel.classList.add('hidden');
        if (container) container.classList.remove('hidden');

        container.innerHTML = '';

        // --- ROUTING LOGIC ---
        let tabModule;

        if (tabName === 'ai-assistant') {
            // LAZY LOAD: Access the parent's AI module now (it wasn't ready during constructor)
            if (this.parent.ai) {
                tabModule = this.parent.ai;
            } else {
                container.innerHTML = `<div class="error-state">AI Module not loaded.</div>`;
                return;
            }
        } else {
            // LOOKUP OTHER TABS
            tabModule = this.tabs[tabName];
        }

        // RENDER
        if (tabModule && typeof tabModule.render === 'function') {
            const convId = this.parent.getCurrentConversationId ? this.parent.getCurrentConversationId() : null;
            tabModule.render(container, convId);

        } else {
            container.innerHTML = `<div class="error-state">Tab '${tabName}' not found.</div>`;
        }
    }

    updateNotesBadge(count) {
        const badge = document.getElementById('notesTabBadge');
        if (!badge) return;

        if (count > 0) {
            badge.textContent = count > 9 ? '9+' : count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }

    showCreateLeadModal() {
        this.tabs['edit'].openCreateModal();
    }

    async loadConversationIntelligence(conversationId = null, preloadedData = null) {
        const convId = conversationId || this.parent.getCurrentConversationId();
        if (!convId) return;

        this.toggleView(true);

        try {
            // FIX: Use preloaded data if available, otherwise fetch
            let data;
            if (preloadedData) {
                data = preloadedData;
            } else {
                data = await this.parent.apiCall(`/api/conversations/${convId}`);
            }
            const conversationData = data.conversation || data;

            this.parent.selectedConversation = conversationData;
            this.parent.currentConversationId = convId;

            if (this.parent.conversationUI) {
                this.parent.conversationUI.selectedConversation = conversationData;
                this.parent.conversationUI.currentConversationId = convId;
                this.parent.conversationUI.conversations.set(convId, conversationData);
            }

            this.renderIntelligenceData(data);

            // FIX: Preload notes for this conversation
            if (this.notesTab && convId) {
                this.notesTab.conversationId = convId;
                this.notesTab.notes = [];
                this.notesTab.isRendered = false;

                const currentTab = document.querySelector('.tab-btn.active')?.dataset.tab;
                if (currentTab === 'notes') {
                    const container = document.getElementById('intelligenceContent');
                    if (container) {
                        this.notesTab.render(container, convId);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Failed to load details:', error);
        }
    }

    renderIntelligenceData(data) {
        if (this.parent.conversationUI?.showConversationDetails) {
            this.parent.conversationUI.showConversationDetails();
        }

        this.toggleView(true);

        const currentTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'ai-assistant';

        if (currentTab === 'edit') {
            this.switchTab('ai-assistant');
        } else {
            this.switchTab(currentTab);
        }
    }
}

window.IntelligenceManager = IntelligenceManager;
