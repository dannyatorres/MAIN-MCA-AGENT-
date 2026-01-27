// js/lender-admin.js
// Entry Point & Menu for Lender Management

class LenderAdmin {
    constructor() {
        // Modules will be initialized when system is ready
        this.network = null;
        this.rules = null;
    }

    // Lazy-load the system reference
    get system() {
        if (window.commandCenter && window.commandCenter.isInitialized && window.commandCenter.apiCall) {
            return window.commandCenter;
        }
        console.error('❌ LenderAdmin: Command Center API is missing or not ready.');
        throw new Error('System not ready');
    }

    // Initialize modules (called once system is ready)
    init() {
        if (!this.network) {
            this.network = new LenderNetwork(this.system);
        }
        if (!this.rules) {
            this.rules = new LenderRules(this.system);
        }
    }

    // ==========================================
    // MAIN MENU
    // ==========================================

    openManagementModal() {
        console.log('🏛️ Opening Lender Menu...');

        // Ensure modules are initialized
        this.init();

        document.getElementById('lenderMenuModal')?.remove();

        const modalHTML = `
            <div id="lenderMenuModal" class="modal lender-admin-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Lender Management</h3>
                        <button class="modal-close" onclick="document.getElementById('lenderMenuModal').remove()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="lender-menu-options">
                            <div class="lender-menu-item" data-action="network-directory">
                                <i class="fas fa-building icon-blue"></i>
                                <div class="menu-item-content">
                                    <div class="menu-item-title">Network Directory</div>
                                    <div class="menu-item-desc">Add, edit, or remove lenders</div>
                                </div>
                                <i class="fas fa-chevron-right chevron"></i>
                            </div>
                            <div class="lender-menu-item" data-action="rule-suggestions">
                                <i class="fas fa-brain icon-purple"></i>
                                <div class="menu-item-content">
                                    <div class="menu-item-title">AI Rule Suggestions</div>
                                    <div class="menu-item-desc">Review AI-detected patterns</div>
                                </div>
                                <i class="fas fa-chevron-right chevron"></i>
                            </div>
                            <div class="lender-menu-item" data-action="needs-review">
                                <i class="fas fa-exclamation-triangle icon-amber"></i>
                                <div class="menu-item-content">
                                    <div class="menu-item-title">Needs Review</div>
                                    <div class="menu-item-desc">Declines requiring manual action</div>
                                </div>
                                <i class="fas fa-chevron-right chevron"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.bindMenuEvents();
    }

    bindMenuEvents() {
        const modal = document.getElementById('lenderMenuModal');
        if (!modal) return;

        modal.addEventListener('click', (e) => {
            const item = e.target.closest('[data-action]');
            if (!item) return;

            const action = item.dataset.action;

            // Close menu first
            modal.remove();

            // Route to appropriate module
            switch (action) {
                case 'network-directory':
                    this.network.open();
                    break;
                case 'rule-suggestions':
                    this.rules.openSuggestions();
                    break;
                case 'needs-review':
                    this.rules.openNeedsReview();
                    break;
            }
        });
    }

    // ==========================================
    // LEGACY API (for backwards compatibility)
    // ==========================================

    // These methods delegate to the appropriate module
    // Allows existing code to work without changes

    openNetworkDirectory() {
        this.init();
        this.network.open();
    }

    openRuleSuggestions() {
        this.init();
        this.rules.openSuggestions();
    }

    openNeedsReview() {
        this.init();
        this.rules.openNeedsReview();
    }

    // Network directory methods
    loadNetworkDirectory() { this.network?.load(); }
    filterLenders(query) { this.network?.filter(query); }
    showAddModal() { this.network?.showAddModal(); }
    saveLender() { this.network?.save(); }
    editLender(id) { this.network?.edit(id); }
    updateLender(id) { this.network?.update(id); }
    deleteLender(id, name) { this.network?.delete(id, name); }

    // Rules methods
    loadRuleSuggestions() { this.rules?.loadSuggestions(); }
    approveRule(id, name) { this.rules?.approve(id, name); }
    rejectRule(id) { this.rules?.reject(id); }
    loadNeedsReview() { this.rules?.loadNeedsReview(); }
    showManualRuleModal(lenderName, declineReason, industry, state, submissionId) {
        this.rules?.showManualRuleModal({ lenderName, declineReason, industry, state, submissionId });
    }
    saveManualRule(lenderName, submissionId) { this.rules?.saveManualRule(lenderName, submissionId); }
    dismissDecline(id) { this.rules?.dismiss(id); }
}

// Export to global
window.LenderAdmin = LenderAdmin;

// Global helper function (for backwards compatibility)
window.openLenderManagementModal = function() {
    if (!window.commandCenter) {
        alert('System is still loading. Please wait...');
        return;
    }
    if (!window.commandCenter.lenderAdmin) {
        window.commandCenter.lenderAdmin = new LenderAdmin();
    }
    try {
        window.commandCenter.lenderAdmin.openManagementModal();
    } catch (e) {
        console.warn('System not ready yet. Retrying in 500ms...');
        setTimeout(() => {
            if (window.commandCenter.isInitialized) {
                window.commandCenter.lenderAdmin.openManagementModal();
            } else {
                alert('System is initializing. Please try again in a moment.');
            }
        }, 500);
    }
};
