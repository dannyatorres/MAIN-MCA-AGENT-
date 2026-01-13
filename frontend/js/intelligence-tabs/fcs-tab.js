// js/intelligence-tabs/fcs-tab.js

export class FCSTab {
    constructor(parent) {
        this.parent = parent;
    }

    render(container) {
        console.log('📊 Rendering FCS Tab');

        const conversation = this.parent.getSelectedConversation();

        // 1. Empty State (No Conversation Selected)
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

        // 2. Build the UI with unique wrapper
        container.innerHTML = `
            <div class="intelligence-section fcs-tab-wrapper" data-tab-type="fcs">

                <div id="syncLoading" class="sync-loading-state" style="display: none;">
                    <div class="spinner-sync"></div>
                    <div class="sync-loading-text">
                        <strong>AI Agent Working...</strong>
                        <span>Searching Drive, downloading PDFs, and running Financial Analysis.</span>
                    </div>
                </div>

                <div id="fcsResults"></div>
                <div id="fcsLoading" style="display: none; text-align: center; padding: 40px;">
                    <div class="loading-spinner"></div>
                    <p style="margin-top: 10px; color: #6b7280;">Loading Analysis...</p>
                </div>
            </div>
        `;

        // 3. Trigger Data Load
        if (this.parent.fcs && typeof this.parent.fcs.loadFCSData === 'function') {
            this.parent.fcs.loadFCSData();
        }
    }
}

// Expose globally
window.FCSTab = FCSTab;
