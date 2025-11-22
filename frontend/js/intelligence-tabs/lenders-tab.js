// js/intelligence-tabs/lenders-tab.js

export class LendersTab {
    constructor(parent) {
        this.parent = parent; // Reference to CommandCenter
        // No direct assignment here - we use a getter instead to avoid race conditions
    }

    // Dynamic getter - accesses module when needed, not at construction time
    get lendersLogic() {
        return this.parent.lenders;
    }

    render(container) {
        console.log('🏦 Rendering Submission Tab');

        const conversation = this.parent.getSelectedConversation();
        if (!conversation) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 60px 20px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">📤</div>
                    <h3 style="color: #6b7280; margin-bottom: 8px;">No Conversation Selected</h3>
                    <p style="color: #9ca3af;">Select a lead to submit deals.</p>
                </div>
            `;
            return;
        }

        // Check if logic module is loaded
        if (!this.lendersLogic) {
            console.warn('⚠️ Lenders module not found - retrying...');
            container.innerHTML = `
                <div class="error-state" style="text-align: center; padding: 40px;">
                    <div class="loading-spinner"></div>
                    <p style="color: #6b7280; margin-top: 10px;">Loading Submission Tools...</p>
                </div>
            `;
            setTimeout(() => {
                if (this.lendersLogic) this.render(container);
            }, 1000);
            return;
        }

        // Render Background (Landing Page)
        container.innerHTML = `
            <div style="padding: 60px 40px; text-align: center;">
                <div style="font-size: 64px; margin-bottom: 24px;">🤝</div>
                <h3 style="margin-bottom: 16px; color: #1e40af;">Lender Submission</h3>
                <p style="margin-bottom: 32px; color: #6b7280; max-width: 400px; margin-left: auto; margin-right: auto; line-height: 1.5;">
                    Qualify <strong>${conversation.business_name || 'this lead'}</strong> and submit to lenders.
                </p>
                <button id="openLendersModalBtn" class="btn btn-primary" style="
                    padding: 14px 32px;
                    font-size: 16px;
                    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
                ">
                    Re-Open Submission
                </button>
            </div>
        `;

        document.getElementById('openLendersModalBtn').addEventListener('click', () => {
            this.openModal(conversation);
        });

        // AUTO-TRIGGER: Open modal immediately
        setTimeout(() => {
            this.openModal(conversation);
        }, 50);
    }

    openModal(conversation) {
        console.log('🚀 Launching Lender Modal...');

        const modal = document.getElementById('lendersInlineModal');
        const modalContent = document.getElementById('lendersInlineContent');

        if (!modal || !modalContent) {
            console.error('❌ Lender modal elements not found in DOM');
            return;
        }

        // 1. INJECT THE FORM HTML (The Missing Step!)
        // We ask the Lenders Module to generate its template
        if (this.lendersLogic.createLenderFormTemplate) {
            modalContent.innerHTML = this.lendersLogic.createLenderFormTemplate(conversation);
        } else {
            modalContent.innerHTML = '<div class="error-state">Error: createLenderFormTemplate not found in LendersModule</div>';
            return;
        }

        // 2. SHOW THE MODAL
        modal.style.display = 'flex';

        // 3. INITIALIZE LOGIC (Wake up the form)
        // We use a timeout to ensure the DOM is painted
        setTimeout(() => {
            // A. Bind Inputs
            if (this.lendersLogic.initializeLenderForm) {
                this.lendersLogic.initializeLenderForm();
            }

            // B. Pre-fill Data
            if (this.lendersLogic.populateLenderForm) {
                this.lendersLogic.populateLenderForm();
            }

            // C. Restore Cache (if any)
            if (this.lendersLogic.restoreLenderFormCacheIfNeeded) {
                this.lendersLogic.restoreLenderFormCacheIfNeeded();
            }

            // D. Check for Cached Results or Load Fresh
            this.handleCachedResults();

        }, 100);

        // 4. SETUP CLOSE HANDLERS
        const closeBtn = document.getElementById('closeLendersInlineModal');
        if (closeBtn) closeBtn.onclick = () => modal.style.display = 'none';

        modal.onclick = (e) => {
            if (e.target === modal) modal.style.display = 'none';
        };
    }

    handleCachedResults() {
        const conversationId = this.parent.getCurrentConversationId();

        // Check if the logic module has a cache we can use
        if (conversationId && this.lendersLogic.lenderResultsCache) {
            const cached = this.lendersLogic.lenderResultsCache.get(conversationId);

            if (cached) {
                console.log('♻️ Restoring cached lender results');
                const resultsEl = document.getElementById('lenderResults');
                if (resultsEl) {
                    resultsEl.innerHTML = cached.html;
                    resultsEl.style.display = 'block'; // Ensure visible
                    resultsEl.classList.add('active');
                }

                // Restore internal state
                if (cached.data && cached.data.qualified) {
                    this.lendersLogic.qualifiedLenders = cached.data.qualified;
                    this.lendersLogic.lastLenderCriteria = cached.criteria;
                }
            } else {
                // No cache? Load fresh data
                if (this.lendersLogic.loadLenderData) {
                    this.lendersLogic.loadLenderData();
                }
            }
        }
    }
}

// Expose globally for non-module scripts (optional)
window.LendersTab = LendersTab;
