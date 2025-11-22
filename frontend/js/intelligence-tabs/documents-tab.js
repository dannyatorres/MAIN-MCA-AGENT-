// js/intelligence-tabs/documents-tab.js

export class DocumentsTab {
    constructor(parent) {
        this.parent = parent; // Reference to CommandCenter
    }

    render(container) {
        console.log('📄 Rendering Documents Tab');

        // 1. Safety Checks
        if (!this.parent.documents) {
            console.error('❌ Documents module not available');
            this.renderError(container, 'Documents Module Not Loaded');
            return;
        }

        const conversation = this.parent.getSelectedConversation();
        if (!conversation) {
            this.renderEmpty(container);
            return;
        }

        // 2. Render the Template
        // We use the existing logic in DocumentsModule to generate the HTML
        // This ensures we don't break existing styling/IDs
        container.innerHTML = this.parent.documents.createDocumentsTabTemplate();

        // 3. Initialize Logic
        // We delay slightly to ensure the DOM is painted before attaching listeners
        setTimeout(async () => {
            try {
                // Attach click handlers (Upload, Delete, Download)
                this.parent.documents.setupDocumentsEventListeners();

                // Fetch the actual file list from API
                await this.parent.documents.loadDocuments();
            } catch (error) {
                console.error('❌ Failed to initialize documents:', error);
                this.renderError(container, 'Failed to load document list');
            }
        }, 50);
    }

    // --- Helpers ---

    renderEmpty(container) {
        container.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 60px 20px;">
                <div style="font-size: 48px; margin-bottom: 16px;">📂</div>
                <h3 style="color: #6b7280; margin-bottom: 8px;">No Conversation Selected</h3>
                <p style="color: #9ca3af;">Select a conversation to view or upload documents.</p>
            </div>
        `;
    }

    renderError(container, message) {
        container.innerHTML = `
            <div class="error-state" style="text-align: center; padding: 40px;">
                <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                <h4 style="color: #dc2626; margin-bottom: 8px;">${message}</h4>
                <p style="color: #6b7280;">Please refresh the page and try again.</p>
            </div>
        `;
    }
}

// Expose globally for non-module scripts (optional)
window.DocumentsTab = DocumentsTab;
