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

        // 1. Build the UI Structure
        container.innerHTML = `
            <div class="intelligence-section" style="padding: 15px;">
                <div style="margin-bottom: 20px; display: flex; justify-content: flex-end;">
                    <button id="btnSyncFcs" class="btn-primary" style="
                        background: #2563eb;
                        color: white;
                        padding: 8px 16px;
                        border-radius: 6px;
                        border: none;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-weight: 500;">
                        <span>☁️</span> Sync Drive & Analyze
                    </button>
                </div>

                <div id="syncLoading" style="display: none; background: #eff6ff; border: 1px solid #bfdbfe; padding: 12px; border-radius: 6px; margin-bottom: 20px; color: #1e40af;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div class="loading-spinner-small"></div>
                        <span><strong>AI Agent Working:</strong> Searching Drive, downloading PDFs, and running Financial Analysis...</span>
                    </div>
                </div>

                <div id="fcsResults"></div>
                <div id="fcsLoading" style="display: none; text-align: center; padding: 40px;">
                    <div class="loading-spinner"></div>
                    <p style="margin-top: 10px; color: #6b7280;">Loading Analysis...</p>
                </div>
            </div>
        `;

        // 2. Attach Click Listener to the new Button
        const btnSync = container.querySelector('#btnSyncFcs');
        const loadingDiv = container.querySelector('#syncLoading');

        btnSync.onclick = async () => {
            if (btnSync.disabled) return;

            // UI Feedback
            btnSync.disabled = true;
            btnSync.innerHTML = `<span>⏳</span> Syncing...`;
            loadingDiv.style.display = 'block';

            try {
                console.log(`☁️ Triggering Drive Sync for: ${conversation.business_name}`);

                // Call the backend endpoint
                const response = await fetch(`/api/integrations/drive/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        conversationId: conversation.id,
                        businessName: conversation.business_name
                    })
                });

                const result = await response.json();

                if (result.success) {
                    loadingDiv.innerHTML = `✅ <strong>Success!</strong> Found ${result.count} files. Analysis complete. Reloading...`;

                    // Wait 1.5s then refresh the data
                    setTimeout(() => {
                        loadingDiv.style.display = 'none';
                        btnSync.disabled = false;
                        btnSync.innerHTML = `<span>☁️</span> Sync Drive & Analyze`;

                        // Reload the FCS module data
                        if (this.parent.fcs) this.parent.fcs.loadFCSData();
                    }, 1500);
                } else {
                    throw new Error(result.error || "Sync failed");
                }

            } catch (err) {
                console.error("Sync Error:", err);
                loadingDiv.style.display = 'none';
                btnSync.disabled = false;
                btnSync.innerHTML = `<span>❌</span> Retry Sync`;
                alert(`Sync Failed: ${err.message}`);
            }
        };

        // 3. Load existing data immediately
        if (this.parent.fcs) {
            this.parent.fcs.loadFCSData();
        }
    }
}

// Expose globally for non-module scripts (optional)
window.FCSTab = FCSTab;
