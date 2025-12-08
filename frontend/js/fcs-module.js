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
            // FIX: Correct URL to match backend route
            const result = await this.parent.apiCall(`/api/fcs/results/${conversationId}?_=${Date.now()}`);

            if (result.success && result.analysis) {
                this.displayFCSReport({
                    // FIX: Use correct field names from fcs_analyses table
                    report_content: result.analysis.fcs_report,
                    generated_at: result.analysis.completed_at,
                    business_name: result.analysis.extracted_business_name
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
                // Handle 404 gracefully (just means no report yet)
                if (e.message.includes('404')) {
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
                } else {
                    fcsResults.innerHTML = `
                        <div style="text-align: center; padding: 40px; color: #ef4444;">
                            <p>Error loading FCS report: ${e.message}</p>
                            <button onclick="window.conversationUI.fcs.loadFCSData()" class="btn btn-primary" style="margin-top: 16px;">Retry</button>
                        </div>
                    `;
                }
            }
        }
    }

    displayFCSReport(report) {
         let fcsResults = document.getElementById('fcsResults');
         
         if(fcsResults && report.report_content) {
             // 1. Format the date nicely
             const dateStr = report.generated_at 
                ? new Date(report.generated_at).toLocaleString('en-US', { 
                    month: 'short', day: 'numeric', year: 'numeric', 
                    hour: 'numeric', minute: '2-digit', hour12: true 
                  })
                : 'Just now';

             // 2. Clean HTML (No big Title, just subtle date at top right)
             fcsResults.innerHTML = `
                <div class="fcs-report-container" style="padding: 20px; color: #e6edf3; font-family: sans-serif;">
                    
                    <div style="display: flex; justify-content: flex-end; margin-bottom: 10px; border-bottom: 1px solid #30363d; padding-bottom: 10px;">
                        <span style="font-size: 11px; color: #6b7280; font-family: monospace;">
                            Generated: ${dateStr}
                        </span>
                    </div>

                    <div class="fcs-content">
                        ${this.formatFCSContent(report.report_content)}
                    </div>
                </div>`;
             
             fcsResults.style.display = 'block';
             fcsResults.style.height = '100%';
             fcsResults.style.overflowY = 'auto';
         }
    }

    formatFCSContent(content) {
        if (!content || content.trim() === '') {
            return '<div style="color: #ef4444; padding: 20px;">No content to display</div>';
        }

        try {
            // 1. Clean up the raw text
            let lines = content.split('\n').filter(line => line.trim() !== '');
            let html = '<div class="fcs-styled-report" style="font-family: sans-serif; color: #e6edf3;">';
            
            let inTable = false;

            for (let i = 0; i < lines.length; i++) {
                let line = lines[i].trim();

                // 2. HEADERS (Blue Text)
                // Detect lines that are all caps or end with ":" (but aren't data)
                if ((line === line.toUpperCase() && line.length > 4 && !line.includes('$')) || 
                    (line.endsWith(':') && !line.includes('$'))) {
                    
                    if (inTable) { html += '</tbody></table></div>'; inTable = false; }
                    
                    // Special styling for specific headers
                    if (line.includes('EXTRACTED_BUSINESS_NAME')) {
                        const name = line.split(':')[1] || '';
                        html += `
                            <div style="background: #1f2937; border: 1px solid #374151; padding: 12px; border-radius: 8px; margin-bottom: 20px;">
                                <span style="color: #9ca3af; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Business Name</span>
                                <div style="color: #fff; font-size: 18px; font-weight: 700; margin-top: 4px;">${name}</div>
                            </div>`;
                        continue;
                    }

                    html += `<h4 style="color: #3b82f6; margin: 24px 0 12px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #30363d; padding-bottom: 8px;">${line.replace(/:/g, '')}</h4>`;
                    continue;
                }

                // 3. TABLE ROWS (The Magic Part)
                // Detects lines like: "Aug 2025 Deposits: $10,000..."
                if (line.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}/i) && line.includes('Deposits:')) {
                    
                    if (!inTable) {
                        html += `
                        <div style="overflow-x: auto; margin-bottom: 20px; border-radius: 8px; border: 1px solid #30363d;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; background: #0d1117;">
                                <thead style="background: #161b22; color: #8b949e; text-transform: uppercase; font-size: 11px;">
                                    <tr>
                                        <th style="padding: 12px;">Month</th>
                                        <th style="padding: 12px;">Deposits</th>
                                        <th style="padding: 12px;">Revenue</th>
                                        <th style="padding: 12px;">Neg Days</th>
                                        <th style="padding: 12px;">End Bal</th>
                                    </tr>
                                </thead>
                                <tbody>`;
                        inTable = true;
                    }

                    // Parse the row data
                    const month = line.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}/i)?.[0] || 'Date';
                    const deposits = line.match(/Deposits:\s*(\$[\d,.]+)/i)?.[1] || '-';
                    const revenue = line.match(/Revenue:\s*(\$[\d,.]+)/i)?.[1] || '-';
                    const negDays = line.match(/Neg Days:\s*(\d+)/i)?.[1] || '0';
                    const endBal = line.match(/End Bal:\s*([-$]+[\d,.]+)/i)?.[1] || '-';

                    html += `
                        <tr style="border-bottom: 1px solid #21262d;">
                            <td style="padding: 12px; font-weight: 600; color: #3b82f6;">${month}</td>
                            <td style="padding: 12px;">${deposits}</td>
                            <td style="padding: 12px; font-weight: 600; color: #4ade80;">${revenue}</td>
                            <td style="padding: 12px; ${parseInt(negDays) > 3 ? 'color: #f87171;' : ''}">${negDays}</td>
                            <td style="padding: 12px;">${endBal}</td>
                        </tr>`;
                    continue;
                }

                // 4. Close table if we hit a normal line
                if (inTable) { html += '</tbody></table></div>'; inTable = false; }

                // 5. BULLET POINTS
                if (line.startsWith('-') || line.startsWith('•')) {
                    const content = line.replace(/^[-•]\s*/, '');
                    html += `
                    <div style="display: flex; gap: 10px; margin-bottom: 8px; font-size: 13px; color: #d1d5db;">
                        <span style="color: #3b82f6;">•</span>
                        <span>${content}</span>
                    </div>`;
                    continue;
                }

                // 6. KEY-VALUE PAIRS (e.g., "State: NY")
                if (line.includes(':') && line.length < 50) {
                    const [key, val] = line.split(':');
                    html += `
                    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #21262d; font-size: 13px;">
                        <span style="color: #9ca3af;">${key}</span>
                        <span style="font-weight: 600; color: #e6edf3;">${val}</span>
                    </div>`;
                    continue;
                }

                // 7. PLAIN TEXT
                html += `<div style="margin-bottom: 6px; font-size: 13px; line-height: 1.5;">${line}</div>`;
            }

            if (inTable) { html += '</tbody></table></div>'; }
            html += '</div>';
            return html;

        } catch (error) {
            console.error('Formatting error:', error);
            return `<pre style="white-space: pre-wrap; color: #e6edf3;">${content}</pre>`; // Fallback to raw text
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
