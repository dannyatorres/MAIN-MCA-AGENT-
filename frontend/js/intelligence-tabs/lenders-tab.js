// js/intelligence-tabs/lenders-tab.js

export class LendersTab {
    constructor(parent) {
        this.parent = parent;
    }

    render(container) {
        console.log('🏛️ Rendering Lenders Tab');

        const conversation = this.parent.getSelectedConversation();
        if (!conversation) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 60px 20px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">🏛️</div>
                    <h3 style="color: #6b7280; margin-bottom: 8px;">No Conversation Selected</h3>
                    <p style="color: #9ca3af;">Select a lead to match with lenders.</p>
                </div>
            `;
            return;
        }

        // Check if the core logic module is loaded
        if (!this.parent.lenders) {
            container.innerHTML = `
                <div class="error-state" style="text-align: center; padding: 40px;">
                    <div class="loading-spinner"></div>
                    <p style="color: #6b7280; margin-top: 10px;">Lenders Module Loading...</p>
                </div>
            `;
            return;
        }

        // Render the Tab Content (Simple CTA Button)
        container.innerHTML = `
            <div style="padding: 60px 40px; text-align: center;">
                <div style="font-size: 64px; margin-bottom: 24px;">🤝</div>
                <h3 style="margin-bottom: 16px; color: #1e40af;">Lender Qualification</h3>
                <p style="margin-bottom: 32px; color: #6b7280; max-width: 400px; margin-left: auto; margin-right: auto; line-height: 1.5;">
                    Qualify <strong>${conversation.business_name || 'this lead'}</strong> against your lender matrix and submit deals directly.
                </p>
                <button id="openLendersModalBtn" class="btn btn-primary" style="
                    padding: 14px 32px;
                    font-size: 16px;
                    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
                ">
                    Open Lender Tools
                </button>
            </div>
        `;

        // Attach Event Listener
        document.getElementById('openLendersModalBtn').addEventListener('click', () => {
            this.openModal();
        });
    }

    openModal() {
        // Delegate to the existing complex logic in lenders.js
        if (this.parent.lenders) {
            if (this.parent.lenders.openLenderModal) {
                this.parent.lenders.openLenderModal();
            } else {
                // Fallback if the method name is different in your version
                const modal = document.getElementById('lendersInlineModal');
                if (modal) modal.style.display = 'flex';
            }
        }
    }
}

// Expose globally for non-module scripts (optional)
window.LendersTab = LendersTab;
