// js/intelligence-tabs/lenders-tab.js

export class LendersTab {
    constructor(parent) {
        this.parent = parent;
    }

    get lendersLogic() {
        return this.parent.lenders;
    }

    render(container) {
        console.log('🏦 Rendering Submission Tab');

        const conversation = this.parent.getSelectedConversation();
        if (!conversation) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📤</div>
                    <h3>No Conversation Selected</h3>
                    <p>Select a lead to submit deals.</p>
                </div>
            `;
            return;
        }

        if (!this.lendersLogic) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="loading-spinner"></div>
                    <p>Loading Submission Tools...</p>
                </div>
            `;
            setTimeout(() => { if (this.lendersLogic) this.render(container); }, 1000);
            return;
        }

        // Render Landing Page
        container.innerHTML = `
            <div class="lender-landing-page">
                <div class="lender-landing-icon">🤝</div>
                <h3 class="lender-landing-title">Lender Submission</h3>
                <p class="lender-landing-text">
                    Qualify <strong>${conversation.business_name || 'this lead'}</strong> and submit to lenders.
                </p>
                <button id="openLendersModalBtn" class="btn btn-primary btn-lg">
                    Re-Open Submission
                </button>
            </div>
        `;

        document.getElementById('openLendersModalBtn').addEventListener('click', () => {
            this.openModal(conversation);
        });

        // Auto-trigger
        setTimeout(() => { this.openModal(conversation); }, 50);
    }

    openModal(conversation) {
        console.log('🚀 Launching Lender Modal...');

        const modal = document.getElementById('lendersInlineModal');
        const modalContent = document.getElementById('lendersInlineContent');

        if (!modal || !modalContent) return;

        // Clear previous conversation's data first to prevent "Ghost Data"
        if (this.lendersLogic && this.lendersLogic.clearData) {
            this.lendersLogic.clearData();
        }

        // 1. Inject Form
        if (this.lendersLogic.createLenderFormTemplate) {
            modalContent.innerHTML = this.lendersLogic.createLenderFormTemplate(conversation);
        }

        // 2. SHOW MODAL (The Fix: Use Class Toggling)
        modal.classList.remove('hidden');

        // 3. Initialize Logic
        setTimeout(() => {
            if (this.lendersLogic.initializeLenderForm) this.lendersLogic.initializeLenderForm();
            if (this.lendersLogic.populateLenderForm) this.lendersLogic.populateLenderForm();
            // Restore cached results for THIS conversation (uses unique key)
            if (this.lendersLogic.restoreCachedResults) this.lendersLogic.restoreCachedResults();
            if (this.lendersLogic.restoreLenderFormCacheIfNeeded) this.lendersLogic.restoreLenderFormCacheIfNeeded();
        }, 100);

        // 4. Setup Close Handlers
        const closeBtn = document.getElementById('closeLendersInlineModal');
        if (closeBtn) {
            // Remove old listeners to prevent stacking
            const newBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newBtn, closeBtn);

            newBtn.onclick = () => {
                modal.classList.add('hidden');
            };
        }

        // Click outside to close
        modal.onclick = (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        };
    }

    handleCachedResults() {
        const conversationId = this.parent.getCurrentConversationId();
        if (conversationId && this.lendersLogic.lenderResultsCache) {
            const cached = this.lendersLogic.lenderResultsCache.get(conversationId);
            if (cached) {
                const resultsEl = document.getElementById('lenderResults');
                if (resultsEl) {
                    resultsEl.innerHTML = cached.html;
                    resultsEl.classList.add('active'); // Use class for visibility
                }
                if (cached.data && cached.data.qualified) {
                    this.lendersLogic.qualifiedLenders = cached.data.qualified;
                    this.lendersLogic.lastLenderCriteria = cached.criteria;
                }
            }
        }
    }
}

window.LendersTab = LendersTab;
