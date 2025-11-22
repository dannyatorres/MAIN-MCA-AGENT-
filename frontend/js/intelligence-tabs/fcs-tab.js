// js/intelligence-tabs/fcs-tab.js

export class FCSTab {
    constructor(parent) {
        this.parent = parent;
    }

    render(container) {
        console.log('📊 Rendering FCS Tab');

        const conversation = this.parent.getSelectedConversation();
        if (!conversation) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 60px 20px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">📊</div>
                    <h3 style="color: #6b7280; margin-bottom: 8px;">No Conversation Selected</h3>
                    <p style="color: #9ca3af;">Select a lead to analyze financials.</p>
                </div>
            `;
            return;
        }

        if (!this.parent.fcs) {
            container.innerHTML = `
                <div class="error-state" style="text-align: center; padding: 40px;">
                    <div class="loading-spinner"></div>
                    <p style="color: #6b7280; margin-top: 10px;">FCS Module Loading...</p>
                </div>
            `;
            return;
        }

        // 1. Setup Container
        container.innerHTML = `
            <div class="intelligence-section">
                <div id="fcsResults"></div>
                <div id="fcsLoading" style="display: none; text-align: center; padding: 40px;">
                    <div class="loading-spinner"></div>
                    <p style="margin-top: 10px; color: #6b7280;">Analyzing Financials...</p>
                </div>
                <div id="fcsErrorMsg" style="display: none; color: #dc2626; text-align: center; padding: 20px;"></div>
            </div>
        `;

        // 2. Trigger Data Load
        // The FCS module knows how to populate #fcsResults
        this.parent.fcs.loadFCSData();
    }
}

// Expose globally for non-module scripts (optional)
window.FCSTab = FCSTab;
