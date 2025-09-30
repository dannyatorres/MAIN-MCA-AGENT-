// fcs-module.js - Complete FCS (Financial Cash Statement) functionality

class FCSModule {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = parent.apiBaseUrl;
        this.utils = parent.utils;
        this.templates = parent.templates;
        this._fcsGenerationInProgress = false;
        this._initialized = false;  // Add this flag

        this.init();
    }

    init() {
        if (this._initialized) {
            console.warn('🔄 FCS Module already initialized, skipping duplicate init()');
            return;
        }

        console.log('🚀 Initializing FCS Module for the first time');
        this._initialized = true;

        this.setupFCSButtonDelegation();
        this.setupModalEventListeners();
    }

    setupFCSButtonDelegation() {
        console.log('Setting up FCS button event delegation');

        // Remove any existing listener first
        if (this._clickHandler) {
            document.body.removeEventListener('click', this._clickHandler, true);
        }

        this._clickHandler = async (event) => {
            // Check if the clicked element or any parent is the FCS button
            const button = event.target.closest('#generateFCSBtn');

            if (button) {
                console.trace('FCS button clicked - Call stack:');

                // Prevent duplicate clicks during generation
                if (this._fcsGenerationInProgress) {
                    console.log('⚠️ FCS generation already in progress, BLOCKING duplicate click');
                    event.preventDefault();
                    event.stopPropagation();
                    return false;
                }

                console.log('✅ ALLOWING first FCS button click via delegation');
                this._fcsGenerationInProgress = true;

                event.preventDefault();
                event.stopPropagation();

                // Get conversation ID from button's data attribute or parent
                const buttonConvId = button.dataset.conversationId;
                console.log('Button conversation ID:', buttonConvId);

                // Ensure conversation context is set
                if (buttonConvId && !this.parent.getCurrentConversationId()) {
                    this.parent.currentConversationId = buttonConvId;
                }

                // Show the modal
                try {
                    await this.showFCSModal();
                } catch (error) {
                    console.error('Error calling showFCSModal:', error);
                } finally {
                    // Reset flag after modal is shown with a short cooldown
                    setTimeout(() => {
                        this._fcsGenerationInProgress = false;
                    }, 1000);
                }
                return false;
            }
        };

        // Add the new click handler with event capturing
        document.body.addEventListener('click', this._clickHandler, true);

        console.log('FCS button event delegation setup complete with proper cleanup');
    }

    setupModalEventListeners() {
        console.log('Setting up FCS modal event listeners');

        // Remove any existing modal listener first
        if (this._modalClickHandler) {
            document.body.removeEventListener('click', this._modalClickHandler);
        }

        // Store the handler so we can remove it later
        this._modalClickHandler = (event) => {
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
        };

        document.body.addEventListener('click', this._modalClickHandler);

        console.log('FCS modal event listeners setup complete with proper cleanup');
    }

    async showFCSModal() {
        console.log('showFCSModal called');

        const modal = document.getElementById('fcsModal');
        if (!modal) {
            console.error('❌ FCS Modal element not found in DOM');
            console.log('Available modals:', Array.from(document.querySelectorAll('[id$="Modal"]')).map(m => m.id));

            // Try to create modal if it doesn't exist
            this.createFCSModalIfMissing();
            return;
        }

        // CRITICAL: Get conversation ID from the CURRENTLY SELECTED conversation item in the UI
        const selectedElement = document.querySelector('.conversation-item.selected');
        const conversationId = selectedElement?.dataset?.conversationId;

        if (!conversationId) {
            console.error('No conversation selected');
            this.parent.utils?.showNotification('Please select a conversation first', 'error');
            return;
        }

        // FORCE update the parent's current conversation ID
        this.parent.currentConversationId = conversationId;

        console.log('Opening FCS modal for conversation:', conversationId);
        console.log('Selected conversation element:', selectedElement?.querySelector('.conversation-business')?.textContent);

        // Reset modal state
        const confirmBtn = document.getElementById('confirmFcs');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = 'Generate Report';
        }

        modal.style.display = 'flex';

        // ALWAYS fetch fresh documents - don't rely on cached data
        await this.fetchAndDisplayFCSDocuments(conversationId);

        console.log('FCS modal opened with fresh documents for conversation:', conversationId);
    }

    async fetchAndDisplayFCSDocuments(conversationId) {
        const documentSelection = document.getElementById('fcsDocumentSelection');
        if (!documentSelection) return;

        // Don't use fallback IDs - use exactly what was passed in
        if (!conversationId) {
            console.error('No conversation ID provided to fetchAndDisplayFCSDocuments');
            documentSelection.innerHTML = '<div style="padding: 20px; color: red;">No conversation selected</div>';
            return;
        }

        documentSelection.innerHTML = '<div style="padding: 20px;">Loading documents...</div>';

        console.log('Fetching documents for conversation:', conversationId);

        try {
            const response = await fetch(
                `${this.apiBaseUrl}/api/conversations/${conversationId}/documents?t=${Date.now()}`
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('Documents fetched for', conversationId, ':', result.documents?.length || 0, 'documents');

            // Log first document to verify it's for the right conversation
            if (result.documents && result.documents.length > 0) {
                console.log('First document:', result.documents[0].original_filename);
            }

            if (result.success && result.documents) {
                // Clear cached documents
                if (this.parent.documents) {
                    this.parent.documents.currentDocuments = result.documents;
                }

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

                console.log('✅ Documents displayed successfully for conversation:', conversationId);
            } else {
                throw new Error(result.error || 'No documents in response');
            }
        } catch (error) {
            console.error('Error fetching documents:', error);
            documentSelection.innerHTML = '<div style="padding: 20px; color: red;">Error loading documents</div>';
        }
    }

    hideFCSModal() {
        const modal = document.getElementById('fcsModal');
        if (modal) {
            modal.style.display = 'none';
        }

        // Reset button state when closing
        const confirmBtn = document.getElementById('confirmFcs');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = 'Generate Report';
            console.log('Reset FCS button state on modal close');
        }

        // Clear document selection
        const docSelection = document.getElementById('fcsDocumentSelection');
        if (docSelection) {
            docSelection.innerHTML = '';
        }
    }

    createFCSModalIfMissing() {
        console.log('Creating FCS modal dynamically...');

        const modalHtml = `
            <div id="fcsModal" class="modal" style="display: none;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Generate FCS Report</h3>
                        <button class="modal-close" onclick="window.commandCenter.fcs.hideFCSModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <p>Select bank statements to analyze:</p>
                        <div id="fcsDocumentSelection" style="max-height: 300px; overflow-y: auto;">
                            Loading documents...
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="cancelFcs" class="btn-secondary">Cancel</button>
                        <button id="confirmFcs" class="btn-primary">Generate Report</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Now show it
        setTimeout(() => this.showFCSModal(), 100);
    }

    async triggerFCS() {
        // Generate a unique execution ID
        const executionId = Math.random().toString(36).substring(7);

        console.log('====================================');
        console.log(`TRIGGER FCS CALLED - Execution ID: ${executionId}`);
        console.log('Call stack:', new Error().stack);
        console.log('====================================');

        // Add a global counter to detect duplicates
        if (!window._fcsExecutionCount) {
            window._fcsExecutionCount = 0;
        }
        window._fcsExecutionCount++;

        console.log(`Total FCS executions so far: ${window._fcsExecutionCount}`);

        // If this is a duplicate within 1 second, block it
        const now = Date.now();
        if (window._lastFCSExecution && (now - window._lastFCSExecution) < 1000) {
            console.error(`🚫 BLOCKED DUPLICATE EXECUTION within ${now - window._lastFCSExecution}ms`);
            return;
        }
        window._lastFCSExecution = now;

        console.log('=== TRIGGER FCS DEBUG ===');
        console.log('🎯 FCS generation triggered');

        // ALWAYS get conversation ID from DOM, never from cache
        const selectedElement = document.querySelector('.conversation-item.selected');
        const conversationId = selectedElement?.dataset?.conversationId;

        console.log('Selected element:', selectedElement);
        console.log('Fresh conversation ID from DOM:', conversationId);
        console.log('Cached parent ID (IGNORE):', this.parent.currentConversationId);

        const selectedConv = this.parent.getSelectedConversation();
        console.log('TRIGGER FCS - Selected conversation:', selectedConv?.id, selectedConv?.business_name);

        if (conversationId !== selectedConv?.id) {
            console.error('❌ MISMATCH: Fresh DOM ID does not match cached conversation!');
            console.error('DOM:', conversationId, 'vs Cached:', selectedConv?.id);
        }

        console.log('===========================');

        if (!conversationId) {
            console.error('❌ No conversation ID found from DOM');
            this.utils.showNotification('No conversation selected', 'error');
            return;
        }

        // Update cache for consistency
        this.parent.currentConversationId = conversationId;

        // Get business name from fresh DOM element
        const businessName = selectedElement?.querySelector('.conversation-business')?.textContent || 'Auto-Generated Business';

        // Get selected document IDs from modal checkboxes
        const selectedDocuments = Array.from(document.querySelectorAll('#fcsDocumentSelection input[type="checkbox"]:checked'))
            .map(checkbox => checkbox.value);

        console.log('Business name from DOM:', businessName);
        console.log('Selected document IDs:', selectedDocuments);
        console.log('Sending to conversation:', conversationId);

        if (selectedDocuments.length === 0) {
            this.utils.showNotification('Please select at least one bank statement', 'error');
            return;
        }

        const confirmBtn = document.getElementById('confirmFcs');
        if (confirmBtn) {
            // Get original text, but handle case where button might already be in loading state
            let originalText = confirmBtn.innerHTML;
            if (originalText.includes('Generating FCS') || originalText.includes('loading-spinner')) {
                originalText = 'Generate Report'; // Reset to default if already in loading state
                console.log('Button was already in loading state, resetting to default text');
            }

            // Set loading state
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<div class="loading-spinner-small"></div> Generating FCS...';

            try {
                console.log(`🚀 Posting to: /api/conversations/${conversationId}/generate-fcs`);
                console.log('📦 Payload:', { businessName, selectedDocuments });

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
                // Always ensure button is properly reset
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = originalText;
                    console.log('FCS button state reset to:', originalText);
                }
            }
        }
    }

    async loadFCSData() {
        const conversationId = this.parent.getCurrentConversationId();

        console.log('=== FCS DATA LOADING DEBUG ===');
        console.log('Current conversation ID:', conversationId);
        console.log('Selected conversation:', this.parent.getSelectedConversation()?.id);
        console.log('Selected element data:', document.querySelector('.conversation-item.selected')?.dataset?.conversationId);
        console.log('Parent current ID:', this.parent.currentConversationId);
        console.log('Parent selected conv:', this.parent.selectedConversation?.id);
        console.log('================================');

        if (!conversationId) {
            console.warn('No conversation ID found, cannot load FCS data');
            return;
        }

        const fcsContent = document.getElementById('fcsContent');
        if (!fcsContent) {
            console.error('fcsContent element not found');
            return;
        }

        console.log(`Loading FCS data for conversation ${conversationId}`);

        // Show loading state
        fcsContent.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div class="loading-spinner"></div>
                <p>Loading FCS report...</p>
            </div>
        `;

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
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log(`FCS API result:`, result);

            if (result.success && result.report) {
                // Check if report has actual content
                if (!result.report.report_content || result.report.report_content.trim() === '') {
                    throw new Error('FCS report has no content');
                }

                console.log(`Calling displayFCSReport with report data`);
                this.displayFCSReport(result.report);
            } else {
                throw new Error(result.error || 'No report data returned');
            }

        } catch (error) {
            console.error('Error loading FCS data:', error);
            console.error('Error stack:', error.stack);
            fcsContent.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #ef4444;">
                    <p>Failed to load FCS data</p>
                    <p style="font-size: 0.8em; color: #666;">Error: ${error.message}</p>
                    <button onclick="window.commandCenter.fcs.loadFCSData()" style="margin-top: 10px; padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">Retry Loading</button>
                </div>
            `;
        }
    }

    displayFCSReport(report) {
        try {
            console.log('=== displayFCSReport DEBUG ===');
            console.log('Full report object:', report);
            console.log('report.report_content:', report.report_content);
            console.log('Type of report_content:', typeof report.report_content);
            console.log('Is null?', report.report_content === null);
            console.log('Is undefined?', report.report_content === undefined);
            console.log('==============================');

            const fcsContent = document.getElementById('fcsContent');
            if (!fcsContent) {
                console.error('fcsContent element not found');
                return;
            }

            // Check if report has content
            if (!report || !report.report_content) {
                console.error('Report or report_content is missing:', report);
                fcsContent.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #ef4444;">
                        <p>FCS Report has no content</p>
                        <p style="font-size: 0.9em; color: #666;">The report data is missing from the response.</p>
                        <pre style="text-align: left; font-size: 11px; background: #f3f4f6; padding: 10px; border-radius: 4px; max-height: 200px; overflow: auto;">${JSON.stringify(report, null, 2)}</pre>
                        <button onclick="window.commandCenter.fcs.loadFCSData()" style="margin-top: 10px; padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">Retry</button>
                    </div>
                `;
                return;
            }

            // Handle null/undefined date gracefully
            let reportDate = 'Unknown Date';
            if (report.generated_at) {
                try {
                    reportDate = new Date(report.generated_at).toLocaleDateString();
                } catch (dateError) {
                    console.warn('Error parsing date:', dateError);
                    reportDate = 'Invalid Date';
                }
            }

            console.log('About to call formatFCSContent with:', report.report_content.substring(0, 100) + '...');
            const processedContent = this.formatFCSContent(report.report_content);

            fcsContent.innerHTML = `
                <div class="fcs-report">
                    <div class="fcs-header" style="background: #f0f9ff; padding: 15px; border-radius: 6px; margin-bottom: 20px; border-left: 4px solid #0ea5e9;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h4 style="color: #0369a1; margin: 0; display: flex; align-items: center; gap: 8px;">
                                    FCS Financial Analysis Report
                                </h4>
                                <p style="color: #475569; font-size: 0.875rem; margin: 5px 0 0 0;">Generated on ${reportDate}</p>
                                ${report.status ? `<p style="color: #475569; font-size: 0.875rem; margin: 5px 0 0 0;">Status: ${report.status}</p>` : ''}
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
            console.log('FCS report displayed successfully');
        } catch (error) {
            console.error('Error in displayFCSReport:', error);
            console.error('Error stack:', error.stack);
            const fcsContent = document.getElementById('fcsContent');
            if (fcsContent) {
                fcsContent.innerHTML = `
                    <div style="text-align: center; padding: 20px; color: #ef4444;">
                        <p>Error displaying FCS report</p>
                        <p style="font-size: 0.8em; color: #666;">Error: ${error.message}</p>
                        <button onclick="window.commandCenter.fcs.loadFCSData()" style="margin-top: 10px; padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">Retry Loading</button>
                    </div>
                `;
            }
        }
    }

    formatFCSContent(content) {
        // Handle null/undefined content
        if (!content || typeof content !== 'string') {
            console.error('Invalid content passed to formatFCSContent:', content);
            return '<div style="padding: 20px; text-align: center; color: #666;">No content available</div>';
        }

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