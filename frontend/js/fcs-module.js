// fcs-module.js - Complete FCS (Financial Cash Statement) functionality

export default class FCSModule {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = parent.apiBaseUrl;
        this.utils = parent.utils;
        this.templates = parent.templates;

        this.init();
    }

    init() {
        this.setupFCSButtonDelegation();
        this.setupModalEventListeners();
    }

    setupFCSButtonDelegation() {
        console.log('Setting up FCS button event delegation');

        // Use event delegation on document body to catch dynamically generated FCS buttons
        document.body.addEventListener('click', (event) => {
            console.log('🖱️ Body click detected:', event.target.id, event.target.tagName, event.target.className);

            if (event.target && event.target.id === 'generateFCSBtn') {
                console.log('✅ FCS Generate button clicked via event delegation!');

                event.preventDefault();
                event.stopPropagation();

                // Get conversation ID from button's data attribute
                const buttonConvId = event.target.dataset.conversationId;
                console.log('Button conversation ID:', buttonConvId);

                // Ensure conversation context is set
                if (buttonConvId && !this.parent.getCurrentConversationId()) {
                    this.parent.currentConversationId = buttonConvId;
                }

                // Fallback to selected conversation
                if (!this.parent.getCurrentConversationId() && this.parent.getSelectedConversation()) {
                    this.parent.currentConversationId = this.parent.getSelectedConversation().id;
                }

                try {
                    this.showFCSModal();
                } catch (error) {
                    console.error('Error calling showFCSModal:', error);
                }

                return false;
            }
        }, true);

        console.log('FCS button event delegation setup complete');
    }

    setupModalEventListeners() {
        console.log('Setting up FCS modal event listeners');

        // Set up modal button event listeners using delegation
        document.body.addEventListener('click', (event) => {
            if (event.target.id === 'confirmFcs') {
                console.log('✅ Confirm FCS button clicked');
                event.preventDefault();
                this.triggerFCS();
            } else if (event.target.id === 'cancelFcs' ||
                      (event.target.classList && event.target.classList.contains('modal-close') &&
                       event.target.closest('#fcsModal'))) {
                console.log('✅ Cancel/Close FCS button clicked');
                event.preventDefault();
                this.hideFCSModal();
            }
        });

        console.log('FCS modal event listeners setup complete');
    }

    async showFCSModal() {
        console.log('showFCSModal called');
        console.log('Current conversation ID:', this.parent.getCurrentConversationId());
        console.log('Selected conversation:', this.parent.getSelectedConversation()?.id);

        const modal = document.getElementById('fcsModal');
        if (!modal) {
            console.error('FCS Modal not found in DOM');
            return;
        }

        // Try to get conversation ID from multiple sources
        const conversationId = this.parent.getCurrentConversationId() ||
                              this.parent.getSelectedConversation()?.id ||
                              document.querySelector('.conversation-item.selected')?.dataset?.conversationId;

        if (!conversationId) {
            console.error('No conversation context available');
            return;
        }

        // Set the conversation ID if it wasn't set
        if (!this.parent.currentConversationId) {
            this.parent.currentConversationId = conversationId;
        }

        console.log('Opening FCS modal with conversation ID:', conversationId);

        modal.style.display = 'flex';

        // Fetch and display documents
        await this.fetchAndDisplayFCSDocuments();

        console.log('FCS modal opened with fresh documents');
    }

    async fetchAndDisplayFCSDocuments() {
        const documentSelection = document.getElementById('fcsDocumentSelection');
        if (!documentSelection) return;

        documentSelection.innerHTML = '<div style="padding: 20px;">Loading documents...</div>';

        const conversationId = this.parent.getCurrentConversationId() ||
                               this.parent.getSelectedConversation()?.id;

        if (!conversationId) {
            documentSelection.innerHTML = '<div style="padding: 20px; color: red;">No conversation selected</div>';
            return;
        }

        try {
            console.log('Fetching fresh documents for FCS modal...');
            const response = await fetch(
                `${this.apiBaseUrl}/api/conversations/${conversationId}/documents?t=${Date.now()}`
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('Fresh documents received:', result);

            if (result.success && result.documents) {
                // Update the cache for consistency
                if (this.parent.documents) {
                    this.parent.documents.currentDocuments = result.documents;
                }

                // Display fresh documents
                documentSelection.innerHTML = result.documents.map((doc, index) => `
                    <div class="document-checkbox" style="padding: 12px; border-bottom: 1px solid #f1f5f9;">
                        <input type="checkbox"
                               id="fcsDoc_${doc.id}"
                               value="${doc.id}"
                               ${index === 0 ? 'checked' : ''}>
                        <label for="fcsDoc_${doc.id}" style="margin-left: 10px;">
                            ${doc.original_filename || doc.filename || 'Unknown'}
                        </label>
                    </div>
                `).join('');

                console.log('Documents displayed successfully');
            } else {
                throw new Error(result.error || 'No documents in response');
            }
        } catch (error) {
            console.error('Error fetching documents:', error);
            documentSelection.innerHTML = '<div style="padding: 20px; color: red;">Error loading documents</div>';
        }
    }

    hideFCSModal() {
        this.utils.hideModal('fcsModal');
    }

    async triggerFCS() {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) return;

        const selectedConversation = this.parent.getSelectedConversation();
        const businessName = selectedConversation?.business_name || 'Auto-Generated Business';

        // Get selected documents
        const selectedDocuments = Array.from(document.querySelectorAll('#fcsDocumentSelection input[type="checkbox"]:checked'))
            .map(checkbox => checkbox.value);

        if (selectedDocuments.length === 0) {
            this.utils.showNotification('Please select at least one bank statement', 'error');
            return;
        }

        const confirmBtn = document.getElementById('confirmFcs');
        if (confirmBtn) {
            const originalText = confirmBtn.innerHTML;
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<div class="loading-spinner-small"></div> Generating FCS...';

            try {
                console.log(`Starting FCS generation with ${selectedDocuments.length} selected documents`);

                const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conversationId}/generate-fcs`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        businessName,
                        selectedDocuments
                    })
                });

                const result = await response.json();

                if (result.success) {
                    this.hideFCSModal();
                    this.utils.showNotification('FCS Report generated successfully!', 'success');

                    // Switch to FCS tab to show the results
                    if (this.parent.intelligence) {
                        this.parent.intelligence.switchIntelligenceTab('fcs');
                    }

                    console.log('FCS generation completed successfully');
                } else {
                    throw new Error(result.error || 'Failed to generate FCS report');
                }
            } catch (error) {
                console.error('FCS generation error:', error);
                this.utils.showNotification(`FCS Generation failed: ${error.message}`, 'error');
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = originalText;
            }
        }
    }

    async loadFCSData() {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) return;

        const fcsContent = document.getElementById('fcsContent');
        if (!fcsContent) return;

        console.log(`Loading FCS data for conversation ${conversationId}`);

        try {
            const cacheBuster = new Date().getTime();
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conversationId}/fcs-report?_=${cacheBuster}`);
            console.log(`FCS fetch response status: ${response.status}`);

            if (response.status === 404) {
                fcsContent.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">📊</div>
                        <h4>No FCS Report Generated</h4>
                        <p>Upload bank statements and generate an FCS report from the Documents tab</p>
                        <button class="btn btn-primary" onclick="window.conversationUI.intelligence.switchIntelligenceTab('documents')" style="margin-top: 10px;">
                            Go to Documents
                        </button>
                    </div>
                `;
                return;
            }

            if (!response.ok) {
                throw new Error('Failed to load FCS data');
            }

            const result = await response.json();
            console.log(`FCS API result:`, result);

            if (result.success && result.report) {
                console.log(`Calling displayFCSReport with report data`);
                this.displayFCSReport(result.report);
            } else {
                fcsContent.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">📊</div>
                        <h4>No FCS Report Available</h4>
                        <p>Generate an FCS report from the Documents tab</p>
                    </div>
                `;
            }

        } catch (error) {
            console.error('Error loading FCS data:', error);
            fcsContent.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #ef4444;">
                    <p>Failed to load FCS data</p>
                </div>
            `;
        }
    }

    displayFCSReport(report) {
        const fcsContent = document.getElementById('fcsContent');
        if (!fcsContent) return;

        const reportDate = new Date(report.generated_at).toLocaleDateString();
        const processedContent = this.formatFCSContent(report.report_content);

        fcsContent.innerHTML = `
            <div class="fcs-report">
                <div class="fcs-header" style="background: #f0f9ff; padding: 15px; border-radius: 6px; margin-bottom: 20px; border-left: 4px solid #0ea5e9;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h4 style="color: #0369a1; margin: 0; display: flex; align-items: center; gap: 8px;">
                                📊 FCS Financial Analysis Report
                            </h4>
                            <p style="color: #475569; font-size: 0.875rem; margin: 5px 0 0 0;">Generated on ${reportDate}</p>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-primary" onclick="window.conversationUI.fcs.downloadFCSReport()" style="padding: 6px 12px; font-size: 0.875rem;">
                                📥 Download
                            </button>
                        </div>
                    </div>
                </div>

                <div class="fcs-content" style="background: white; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
                    ${processedContent}
                </div>
            </div>
        `;
    }

    formatFCSContent(content) {
        const sections = content.split('\n\n');
        let formattedHTML = '';

        sections.forEach(section => {
            const lines = section.split('\n');
            if (lines.length === 0) return;

            const firstLine = lines[0].trim();

            // Check if this is a header/title
            if (firstLine.includes('FCS FINANCIAL ANALYSIS REPORT') ||
                firstLine.includes('DOCUMENT SUMMARY') ||
                firstLine.includes('FINANCIAL ANALYSIS') ||
                firstLine.includes('RECOMMENDATIONS') ||
                firstLine.includes('STATUS:')) {

                formattedHTML += `<div style="background: #f8fafc; padding: 12px 16px; border-left: 3px solid #0ea5e9; margin-bottom: 16px;">
                    <h5 style="color: #0369a1; margin: 0; font-weight: 600;">${firstLine}</h5>
                </div>`;

                // Add remaining lines in this section
                if (lines.length > 1) {
                    formattedHTML += `<div style="padding: 0 16px 16px 16px;">`;
                    for (let i = 1; i < lines.length; i++) {
                        if (lines[i].trim()) {
                            if (lines[i].startsWith('•')) {
                                formattedHTML += `<div style="margin: 4px 0; color: #374151; font-size: 14px;"><span style="color: #0ea5e9;">•</span> ${lines[i].substring(1)}</div>`;
                            } else if (lines[i].startsWith('-') || lines[i].startsWith('  -')) {
                                formattedHTML += `<div style="margin: 2px 0 2px 20px; color: #6b7280; font-size: 14px;">${lines[i].trim()}</div>`;
                            } else {
                                formattedHTML += `<div style="margin: 4px 0; color: #374151; font-size: 14px;">${lines[i]}</div>`;
                            }
                        }
                    }
                    formattedHTML += `</div>`;
                }
            } else {
                // Regular content section
                formattedHTML += `<div style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9;">`;
                lines.forEach(line => {
                    if (line.trim()) {
                        if (line.startsWith('•')) {
                            formattedHTML += `<div style="margin: 4px 0; color: #374151; font-size: 14px;"><span style="color: #0ea5e9;">•</span> ${line.substring(1)}</div>`;
                        } else if (line.startsWith('-') || line.startsWith('  -')) {
                            formattedHTML += `<div style="margin: 2px 0 2px 20px; color: #6b7280; font-size: 14px;">${line.trim()}</div>`;
                        } else {
                            formattedHTML += `<div style="margin: 4px 0; color: #374151; font-size: 14px;">${line}</div>`;
                        }
                    }
                });
                formattedHTML += `</div>`;
            }
        });

        return formattedHTML;
    }

    async downloadFCSReport() {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) {
            this.utils.showNotification('No conversation selected', 'error');
            return;
        }

        try {
            const downloadUrl = `${this.apiBaseUrl}/api/conversations/${conversationId}/fcs-report/download`;

            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `FCS_Report_${conversationId}.pdf`;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();

            setTimeout(() => {
                document.body.removeChild(link);
            }, 100);

            this.utils.showNotification('Download started', 'success');
        } catch (error) {
            console.error('Download error:', error);
            this.utils.showNotification('Download failed: ' + error.message, 'error');
        }
    }

    async regenerateFCS() {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) {
            this.utils.showNotification('No conversation selected', 'error');
            return;
        }

        if (!confirm('Are you sure you want to regenerate the FCS report? This will replace the existing report.')) {
            return;
        }

        this.utils.showNotification('Regenerating FCS report...', 'info');

        try {
            // Open the FCS modal to select documents again
            await this.showFCSModal();
        } catch (error) {
            console.error('Error regenerating FCS:', error);
            this.utils.showNotification('Failed to regenerate FCS: ' + error.message, 'error');
        }
    }

    // Progress indicator methods
    showFCSProgress(message) {
        console.log('FCS Progress:', message);

        let progressDiv = document.getElementById('fcsProgressIndicator');
        if (!progressDiv) {
            progressDiv = document.createElement('div');
            progressDiv.id = 'fcsProgressIndicator';
            progressDiv.className = 'fcs-progress-indicator';
            progressDiv.innerHTML = `
                <div class="progress-content">
                    <div class="loading-spinner"></div>
                    <div class="progress-text">${message}</div>
                </div>
            `;

            const modal = document.getElementById('fcsModal');
            if (modal) {
                modal.appendChild(progressDiv);
            }
        } else {
            const progressText = progressDiv.querySelector('.progress-text');
            if (progressText) {
                progressText.textContent = message;
            }
        }

        progressDiv.style.display = 'flex';
    }

    hideFCSProgress() {
        const progressDiv = document.getElementById('fcsProgressIndicator');
        if (progressDiv) {
            progressDiv.style.display = 'none';
        }
    }

    updateFCSStatus(data) {
        // Handle WebSocket FCS status updates
        console.log('FCS status update:', data);

        if (data.status === 'processing') {
            this.showFCSProgress(data.message || 'Processing FCS report...');
        } else if (data.status === 'completed') {
            this.hideFCSProgress();
            this.utils.showNotification('FCS report generated successfully!', 'success');
            this.loadFCSData();
        } else if (data.status === 'failed') {
            this.hideFCSProgress();
            this.utils.showNotification(`FCS generation failed: ${data.error}`, 'error');
        }
    }

    // Template for FCS report
    createFCSReportTemplate(report) {
        if (!report) {
            return '<div class="empty-state">No FCS Report Available. Generate one from the Documents tab.</div>';
        }

        return `
            <div class="fcs-report">
                <div class="fcs-header">
                    <h4>FCS Financial Analysis Report</h4>
                    <div class="fcs-actions">
                        <button onclick="window.conversationUI.fcs.downloadFCSReport()" class="btn-secondary">Download PDF</button>
                        <button onclick="window.conversationUI.fcs.regenerateFCS()" class="btn-primary">Regenerate</button>
                    </div>
                </div>
                <div class="fcs-content">
                    ${this.formatFCSContent(report.report_content || report)}
                </div>
            </div>
        `;
    }

    // Helper to check if FCS report exists
    hasFCSReport() {
        if (this.parent.documents && this.parent.documents.currentDocuments) {
            return this.parent.documents.currentDocuments.some(doc =>
                doc.document_type === 'fcs_report' ||
                doc.filename?.toLowerCase().includes('fcs')
            );
        }
        return false;
    }

    // Helper to get FCS report if it exists
    async getFCSReport() {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) return null;

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conversationId}/fcs-report`);
            if (response.ok) {
                const result = await response.json();
                return result.report || null;
            }
        } catch (error) {
            console.error('Error fetching FCS report:', error);
        }
        return null;
    }
}