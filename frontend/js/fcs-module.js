// fcs-module.js - Complete FCS (Financial Cash Statement) functionality

class FCSModule {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = parent.apiBaseUrl;
        this.utils = parent.utils;
        this.templates = parent.templates;
        this._fcsGenerationInProgress = false;
        this._initialized = false;

        this.init();
    }

    init() {
        if (this._initialized) return;

        console.log('🚀 Initializing FCS Module');
        this._initialized = true;

        // FIX 1: Only setup the delegation here.
        // We REMOVED setupModalEventListeners() from here to prevent "Button not found" errors on load.
        this.setupFCSButtonDelegation();

        // Safety check: If the modal happens to exist already (rare), attach listeners now.
        if (document.getElementById('fcsModal')) {
            this.setupModalEventListeners();
        }
    }

    setupFCSButtonDelegation() {
        if (this._clickHandler) {
            document.body.removeEventListener('click', this._clickHandler, true);
        }

        this._clickHandler = async (event) => {
            const button = event.target.closest('#generateFCSBtn');
            if (button) {
                event.preventDefault();
                event.stopPropagation();
                const buttonConvId = button.dataset.conversationId;

                if (buttonConvId && !this.parent.getCurrentConversationId()) {
                    this.parent.currentConversationId = buttonConvId;
                }

                await this.showFCSModal();
                return false;
            }
        };
        document.body.addEventListener('click', this._clickHandler, true);
    }

    setupModalEventListeners() {
        this.attachModalButtonListeners();
    }

    attachModalButtonListeners() {
        const confirmBtn = document.getElementById('confirmFcs');
        const cancelBtn = document.getElementById('cancelFcs');
        const closeBtn = document.querySelector('#fcsModal .modal-close');
        const toggleAllBtn = document.getElementById('toggleAllFcsBtn');

        if (confirmBtn) {
            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

            newConfirmBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Immediate visual feedback
                newConfirmBtn.disabled = true;
                newConfirmBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Starting...';
                this.triggerFCS(newConfirmBtn);
            });
        }

        if (cancelBtn) {
            const newCancelBtn = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
            newCancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.hideFCSModal();
            });
        }

        if (closeBtn) {
            const newCloseBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
            newCloseBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.hideFCSModal();
            });
        }

        if (toggleAllBtn) {
            const newToggleBtn = toggleAllBtn.cloneNode(true);
            toggleAllBtn.parentNode.replaceChild(newToggleBtn, toggleAllBtn);
            newToggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleAllFCSDocuments();
            });
        }
    }

    toggleAllFCSDocuments() {
        const checkboxes = document.querySelectorAll('#fcsDocumentSelection input[type="checkbox"]');
        const toggleBtn = document.getElementById('toggleAllFcsBtn');

        const allChecked = Array.from(checkboxes).every(cb => cb.checked);

        if (allChecked) {
            checkboxes.forEach(checkbox => checkbox.checked = false);
            if (toggleBtn) toggleBtn.textContent = 'Select All';
        } else {
            checkboxes.forEach(checkbox => checkbox.checked = true);
            if (toggleBtn) toggleBtn.textContent = 'Deselect All';
        }
    }

    async showFCSModal() {
        console.log('showFCSModal called');

        // FIX 2: Create Modal if it doesn't exist
        if (!document.getElementById('fcsModal')) {
            this.createFCSModalIfMissing();
        }

        const modal = document.getElementById('fcsModal');

        // FIX 3: NOW attach the listeners (because we know the elements exist)
        this.attachModalButtonListeners();

        const selectedElement = document.querySelector('.conversation-item.selected');
        const conversationId = selectedElement?.dataset?.conversationId || this.parent.getCurrentConversationId();

        if (!conversationId) {
            this.parent.utils?.showNotification('Please select a conversation first', 'error');
            return;
        }

        this.parent.currentConversationId = conversationId;

        const confirmBtn = document.getElementById('confirmFcs');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = 'Generate Report';
        }

        modal.style.display = 'flex';
        await this.fetchAndDisplayFCSDocuments(conversationId);
    }

    async triggerFCS(btnElement = null) {
        if (this._fcsGenerationInProgress) return;

        const selectedDocuments = Array.from(document.querySelectorAll('#fcsDocumentSelection input[type="checkbox"]:checked'))
            .map(checkbox => checkbox.value);

        if (selectedDocuments.length === 0) {
            this.utils.showNotification('Please select at least one bank statement', 'error');
            if (btnElement) {
                btnElement.disabled = false;
                btnElement.innerHTML = 'Generate Report';
            }
            return;
        }

        const conversationId = this.parent.getCurrentConversationId();
        const selectedElement = document.querySelector(`.conversation-item[data-conversation-id="${conversationId}"]`);
        const businessName = selectedElement?.querySelector('.business-name')?.textContent ||
            this.parent.selectedConversation?.business_name ||
            'Auto-Generated Business';

        if (!conversationId) {
            this.utils.showNotification('No conversation selected', 'error');
            return;
        }

        this._fcsGenerationInProgress = true;
        this._generatingForConversation = conversationId;
        this._generationStartTime = Date.now();

        this.hideFCSModal();
        this.showFCSProgress('Initializing FCS Generation...');

        // CRITICAL FIX: Use switchTab (not switchIntelligenceTab)
        if (this.parent.intelligence) {
            try {
                this.parent.intelligence.switchTab('fcs');
            } catch (e) {
                console.warn('Tab switch failed', e);
            }
        }

        await this.startFCSGeneration(conversationId, businessName, selectedDocuments);
    }

    async startFCSGeneration(conversationId, businessName, selectedDocuments) {
        try {
            // CRITICAL FIX: Correct API URL
            const result = await this.parent.apiCall(`/api/fcs/trigger/${conversationId}`, {
                method: 'POST',
                body: JSON.stringify({
                    businessName: businessName,
                    documentIds: selectedDocuments
                })
            });

            if (result.success) {
                this.showFCSProgress('Request queued! Waiting for AI analysis...');
                setTimeout(() => {
                    this.pollForFCSStatus(conversationId);
                }, 2000);
            } else {
                if (result.status === 'skipped') {
                    this.showFCSProgress('Analysis already in progress...');
                    setTimeout(() => this.pollForFCSStatus(conversationId), 1000);
                } else {
                    throw new Error(result.error || 'Failed to start generation');
                }
            }
        } catch (error) {
            console.error('❌ Error starting FCS:', error);
            this._fcsGenerationInProgress = false;
            this.hideFCSProgress();
            this.utils.showNotification('Failed to start FCS: ' + error.message, 'error');
        }
    }

    hideFCSModal() {
        const modal = document.getElementById('fcsModal');
        if (modal) modal.style.display = 'none';

        // Reset button state
        const confirmBtn = document.getElementById('confirmFcs');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = 'Generate Report';
        }

        const docSelection = document.getElementById('fcsDocumentSelection');
        if (docSelection) docSelection.innerHTML = '';
    }

    createFCSModalIfMissing() {
        const modalHtml = `
            <div id="fcsModal" class="modal" style="display: none;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Generate FCS Report</h3>
                        <button class="modal-close">×</button>
                    </div>
                    <div class="modal-body">
                        <p>Select bank statements to analyze:</p>
                        <div id="fcsDocumentSelection" style="max-height: 300px; overflow-y: auto;">
                            Loading documents...
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="toggleAllFcsBtn" class="btn-secondary" style="margin-right: auto;">Deselect All</button>
                        <button id="cancelFcs" class="btn-secondary">Cancel</button>
                        <button id="confirmFcs" class="btn-primary">Generate Report</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async fetchAndDisplayFCSDocuments(conversationId) {
        const documentSelection = document.getElementById('fcsDocumentSelection');
        if (!documentSelection) return;

        documentSelection.innerHTML = '<div style="padding: 20px;">Loading documents...</div>';

        try {
            const result = await this.parent.apiCall(`/api/conversations/${conversationId}/documents?t=${Date.now()}`);
            if (result.success && result.documents && result.documents.length > 0) {
                documentSelection.innerHTML = result.documents.map((doc, index) => `
                    <div class="document-checkbox" style="padding: 12px; border-bottom: 1px solid #30363d;">
                        <label style="display: flex; align-items: center; cursor: pointer; color: #e6edf3;">
                            <input type="checkbox" id="fcsDoc_${doc.id}" value="${doc.id}" ${index === 0 ? 'checked' : ''} style="margin-right: 10px;">
                            <span>${doc.original_filename || doc.filename}</span>
                        </label>
                    </div>
                `).join('');
            } else {
                documentSelection.innerHTML = '<div style="padding: 20px; color: #8b949e;">No documents found. Please upload bank statements first.</div>';
            }
        } catch (error) {
            documentSelection.innerHTML = `<div style="padding: 20px; color: #ef4444;">Error: ${error.message}</div>`;
        }
    }

    showFCSProgress(message) {
        let progressDiv = document.getElementById('fcsProgressIndicator');
        if (!progressDiv) {
            progressDiv = document.createElement('div');
            progressDiv.id = 'fcsProgressIndicator';
            progressDiv.innerHTML = `<div class="loading-spinner"></div><div class="progress-text"></div>`;
            document.body.appendChild(progressDiv);
        }
        const text = progressDiv.querySelector('.progress-text');
        if (text) text.textContent = message;
        progressDiv.style.display = 'flex';
    }

    hideFCSProgress() {
        const progressDiv = document.getElementById('fcsProgressIndicator');
        if (progressDiv) progressDiv.remove();
    }

    async pollForFCSStatus(conversationId, attempts = 0) {
        if (attempts >= 60) {
            this._fcsGenerationInProgress = false;
            this.hideFCSProgress();
            this.loadFCSData();
            return;
        }

        try {
            const result = await this.parent.apiCall(`/api/conversations/${conversationId}/fcs/status?_=${Date.now()}`);
            const status = result?.status || result?.data?.status;

            if (status === 'completed') {
                this._fcsGenerationInProgress = false;
                this.hideFCSProgress();
                this.utils.showNotification('FCS Generated!', 'success');
                this.loadFCSData();
            } else if (status === 'failed') {
                this._fcsGenerationInProgress = false;
                this.hideFCSProgress();
                this.utils.showNotification('FCS Generation Failed', 'error');
            } else {
                // Still processing - update progress message
                const elapsed = Math.floor((Date.now() - this._generationStartTime) / 1000);
                if (elapsed < 20) {
                    this.showFCSProgress('Extracting text from documents...');
                } else if (elapsed < 40) {
                    this.showFCSProgress('Analyzing financial data with AI...');
                } else {
                    this.showFCSProgress(`Still processing... (${elapsed}s elapsed)`);
                }
                setTimeout(() => this.pollForFCSStatus(conversationId, attempts + 1), 3000);
            }
        } catch (e) {
            // Retry on error
            setTimeout(() => this.pollForFCSStatus(conversationId, attempts + 1), 5000);
        }
    }

    async loadFCSData() {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) return;

        let fcsResults = document.getElementById('fcsResults');
        if (!fcsResults) {
            const container = document.getElementById('intelligenceContent');
            if (container) {
                fcsResults = document.createElement('div');
                fcsResults.id = 'fcsResults';
                container.appendChild(fcsResults);
            }
        }

        if (fcsResults) {
            fcsResults.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <div class="loading-spinner"></div>
                    <p style="color: #8b949e; margin-top: 16px;">Loading FCS report...</p>
                </div>
            `;
            fcsResults.style.display = 'block';
        }

        try {
            const result = await this.parent.apiCall(`/api/conversations/${conversationId}/fcs?_=${Date.now()}`);
            if (result.success && result.analysis) {
                this.displayFCSReport({
                    report_content: result.analysis.report,
                    generated_at: result.analysis.completedAt,
                    business_name: result.analysis.businessName
                });
            } else {
                if (fcsResults) {
                    fcsResults.innerHTML = `
                        <div style="text-align: center; padding: 60px 40px;">
                            <div style="font-size: 48px; margin-bottom: 20px;">📊</div>
                            <h3 style="color: #e6edf3; margin-bottom: 12px;">No FCS Report Available</h3>
                            <p style="color: #8b949e; margin-bottom: 24px;">Generate a report to analyze your financial documents</p>
                            <button onclick="window.conversationUI.fcs.showFCSModal()"
                                    class="btn btn-primary"
                                    style="padding: 10px 24px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">
                                Generate FCS Report
                            </button>
                        </div>
                    `;
                }
            }
        } catch (e) {
            console.error('Error loading FCS:', e);
            if (fcsResults) {
                fcsResults.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #ef4444;">
                        <p>Error loading FCS report: ${e.message}</p>
                        <button onclick="window.conversationUI.fcs.loadFCSData()" class="btn btn-primary" style="margin-top: 16px;">Retry</button>
                    </div>
                `;
            }
        }
    }

    displayFCSReport(report) {
        let fcsResults = document.getElementById('fcsResults');
        if (!fcsResults) {
            const container = document.getElementById('intelligenceContent');
            if (container) {
                fcsResults = document.createElement('div');
                fcsResults.id = 'fcsResults';
                container.appendChild(fcsResults);
            }
        }

        if (!fcsResults) return;

        // Hide empty state
        const emptyState = document.querySelector('#intelligenceContent .empty-state');
        if (emptyState) emptyState.style.display = 'none';

        if (!report || !report.report_content) {
            fcsResults.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #ef4444;">
                    <p>FCS Report data is empty</p>
                </div>
            `;
            fcsResults.style.display = 'block';
            return;
        }

        // Format date
        let reportDate = 'Unknown Date';
        if (report.generated_at) {
            try {
                reportDate = new Date(report.generated_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (e) {
                reportDate = String(report.generated_at);
            }
        }

        const processedContent = this.formatFCSContent(report.report_content);

        fcsResults.innerHTML = `
            <div class="fcs-report" style="width: 100%; max-width: 100%;">
                <div class="fcs-content" style="
                    background: #161b22;
                    border: 1px solid #30363d;
                    border-radius: 12px;
                    padding: 20px;
                    color: #e6edf3;
                ">
                    <div style="margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #30363d;">
                        <h3 style="color: #3b82f6; margin: 0 0 8px 0;">FCS Financial Analysis Report</h3>
                        <p style="color: #8b949e; font-size: 12px; margin: 0;">Generated: ${reportDate}</p>
                    </div>
                    ${processedContent}
                </div>
            </div>
        `;

        fcsResults.style.display = 'block';
        fcsResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    formatFCSContent(content) {
        if (!content || content.trim() === '') {
            return '<p style="color: #ef4444; text-align: center; padding: 20px;">No content to display</p>';
        }

        try {
            // Clean up the content
            let cleanedContent = content
                .replace(/^\.\.\.\s*$/gm, '')
                .replace(/^\s*\.\.\.\s*$/gm, '')
                .replace(/\n{3,}/g, '\n\n')
                .trim();

            const lines = cleanedContent.split('\n').filter(line => {
                const trimmed = line.trim();
                return trimmed !== '' && trimmed !== '...' && trimmed !== '…';
            });

            let html = '';

            for (let i = 0; i < lines.length; i++) {
                const trimmedLine = lines[i].trim();

                // Main section headers (ALL CAPS)
                if (trimmedLine === trimmedLine.toUpperCase() &&
                    trimmedLine.length > 3 &&
                    !trimmedLine.includes(':') &&
                    trimmedLine.match(/^[A-Z\s_]+$/)) {
                    html += `
                        <div style="
                            color: #3b82f6;
                            font-size: 15px;
                            font-weight: 700;
                            margin: 20px 0 10px 0;
                            padding-bottom: 4px;
                            border-bottom: 2px solid #3b82f6;
                        ">${this.escapeHtml(trimmedLine)}</div>
                    `;
                    continue;
                }

                // Section headers (ends with colon)
                if (trimmedLine.endsWith(':') && !trimmedLine.includes('Deposits:')) {
                    html += `
                        <div style="
                            color: #e6edf3;
                            font-size: 14px;
                            font-weight: 600;
                            margin: 16px 0 8px 0;
                        ">${this.escapeHtml(trimmedLine)}</div>
                    `;
                    continue;
                }

                // Bullet points
                if (trimmedLine.match(/^[•\-]\s/) || trimmedLine.match(/^\d+\.\s/)) {
                    const bulletText = trimmedLine.replace(/^[•\-]\s/, '').replace(/^\d+\.\s/, '');
                    html += `
                        <div style="
                            display: flex;
                            gap: 8px;
                            margin: 4px 0 4px 16px;
                            line-height: 1.5;
                            font-size: 13px;
                        ">
                            <span style="color: #3b82f6; font-weight: 600;">•</span>
                            <span style="color: #c9d1d9;">${this.escapeHtml(bulletText)}</span>
                        </div>
                    `;
                    continue;
                }

                // Key-value pairs
                if (trimmedLine.includes(':') && !trimmedLine.endsWith(':')) {
                    const colonIndex = trimmedLine.indexOf(':');
                    const key = trimmedLine.substring(0, colonIndex).trim();
                    const value = trimmedLine.substring(colonIndex + 1).trim();

                    html += `
                        <div style="
                            display: grid;
                            grid-template-columns: 200px 1fr;
                            gap: 12px;
                            padding: 6px 10px;
                            background: #0d1117;
                            margin: 3px 0;
                            border-radius: 4px;
                            font-size: 13px;
                        ">
                            <span style="font-weight: 600; color: #8b949e;">${this.escapeHtml(key)}:</span>
                            <span style="color: #e6edf3;">${this.escapeHtml(value)}</span>
                        </div>
                    `;
                    continue;
                }

                // Regular text
                html += `
                    <div style="
                        margin: 8px 0;
                        line-height: 1.5;
                        color: #c9d1d9;
                        font-size: 13px;
                    ">${this.escapeHtml(trimmedLine)}</div>
                `;
            }

            return html;

        } catch (error) {
            console.error('Error formatting FCS content:', error);
            return `<div style="color: #ef4444; padding: 12px;">Error formatting content: ${error.message}</div>`;
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
