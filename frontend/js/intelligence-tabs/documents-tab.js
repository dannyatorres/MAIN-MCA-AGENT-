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
        try {
            // Attach click handlers (Upload, Delete, Download)
            this.parent.documents.setupDocumentsEventListeners();

            // Fetch the actual file list from API
            this.parent.documents.loadDocuments();
        } catch (error) {
            console.error('❌ Failed to initialize documents:', error);
            this.renderError(container, 'Failed to load document list');
        }
    }

    // --- Helpers ---

    renderEmpty(container) {
        // CLEANED: Uses CSS classes from 05-panel-right-intelligence.css
        container.innerHTML = `
            <div class="doc-state-container">
                <div class="doc-state-icon">📂</div>
                <h3 class="doc-state-title">No Conversation Selected</h3>
                <p class="doc-state-text">Select a conversation to view or upload documents.</p>
            </div>
        `;
    }

    renderError(container, message) {
        // CLEANED: Uses CSS classes from 05-panel-right-intelligence.css
        container.innerHTML = `
            <div class="doc-state-container error-state">
                <div class="doc-state-icon">⚠️</div>
                <h4 class="doc-state-title">${message}</h4>
                <p class="doc-state-text">Please refresh the page and try again.</p>
            </div>
        `;
    }
}

// Expose globally for non-module scripts (optional)
window.DocumentsTab = DocumentsTab;
