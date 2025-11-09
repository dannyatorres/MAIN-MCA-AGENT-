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
                console.log('✅ FCS button clicked via delegation');

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

        // DON'T wait for DOMContentLoaded since we're already past it
        // Just attach listeners directly
        this.attachModalButtonListeners();

        console.log('FCS modal event listeners setup complete');
    }

    attachModalButtonListeners() {
        console.log('Attaching FCS modal button listeners...');

        // Remove ALL existing handlers by cloning buttons
        const confirmBtn = document.getElementById('confirmFcs');
        const cancelBtn = document.getElementById('cancelFcs');
        const closeBtn = document.getElementById('closeFCSModalBtn');
        const toggleAllBtn = document.getElementById('toggleAllFcsBtn');

        if (confirmBtn) {
            // Clone to remove all existing listeners
            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

            // Attach fresh handler
            newConfirmBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('✅ Confirm FCS button clicked - calling triggerFCS()');
                this.triggerFCS();
            });

            console.log('✅ Confirm button handler attached');
        } else {
            console.warn('⚠️ confirmFcs button not found');
        }

        if (cancelBtn) {
            const newCancelBtn = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

            newCancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('✅ Cancel FCS button clicked');
                this.hideFCSModal();
            });

            console.log('✅ Cancel button handler attached');
        }

        if (closeBtn) {
            const newCloseBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

            newCloseBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('✅ Close FCS modal clicked');
                this.hideFCSModal();
            });

            console.log('✅ Close button handler attached');
        }

        if (toggleAllBtn) {
            const newToggleBtn = toggleAllBtn.cloneNode(true);
            toggleAllBtn.parentNode.replaceChild(newToggleBtn, toggleAllBtn);

            newToggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleAllFCSDocuments();
            });

            console.log('✅ Toggle All button handler attached');
        }

        console.log('✅ All FCS modal button handlers attached (fresh)');
    }

    toggleAllFCSDocuments() {
        const checkboxes = document.querySelectorAll('#fcsDocumentSelection input[type="checkbox"]');
        const toggleBtn = document.getElementById('toggleAllFcsBtn');

        // Check if all are currently checked
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);

        if (allChecked) {
            // Deselect all
            checkboxes.forEach(checkbox => checkbox.checked = false);
            if (toggleBtn) toggleBtn.textContent = 'Select All';
        } else {
            // Select all
            checkboxes.forEach(checkbox => checkbox.checked = true);
            if (toggleBtn) toggleBtn.textContent = 'Deselect All';
        }
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

        // Re-attach event listeners when modal is shown
        this.attachModalButtonListeners();

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
        if (!documentSelection) {
            console.error('❌ fcsDocumentSelection element not found');
            return;
        }

        // Don't use fallback IDs - use exactly what was passed in
        if (!conversationId) {
            console.error('❌ No conversation ID provided to fetchAndDisplayFCSDocuments');
            documentSelection.innerHTML = '<div style="padding: 20px; color: red;">No conversation selected</div>';
            return;
        }

        documentSelection.innerHTML = '<div style="padding: 20px;">Loading documents...</div>';

        console.log('📥 Fetching documents for conversation:', conversationId);

        try {
            const result = await this.parent.apiCall(
                `/api/conversations/${conversationId}/documents?t=${Date.now()}`
            );
            console.log('📄 Documents fetched:', result.documents?.length || 0, 'documents');

            // Log first document to verify it's for the right conversation
            if (result.documents && result.documents.length > 0) {
                console.log('First document:', {
                    filename: result.documents[0].original_filename,
                    id: result.documents[0].id
                });
            }

            if (result.success && result.documents) {
                // DON'T overwrite main documents array - keep modal documents separate
                // This was causing documents to disappear when FCS modal opened
                // if (this.parent.documents) {
                //     this.parent.documents.currentDocuments = result.documents;
                // }

                if (result.documents.length === 0) {
                    documentSelection.innerHTML = '<div style="padding: 20px; color: #6b7280;">No documents found. Please upload bank statements first.</div>';
                    return;
                }

                documentSelection.innerHTML = result.documents.map((doc, index) => `
                    <div class="document-checkbox" style="padding: 12px; border-bottom: 1px solid #f1f5f9;">
                        <label style="display: flex; align-items: center; cursor: pointer;">
                            <input type="checkbox"
                                   id="fcsDoc_${doc.id}"
                                   value="${doc.id}"
                                   ${index === 0 ? 'checked' : ''}
                                   style="margin-right: 10px;">
                            <span>${doc.original_filename || doc.filename || 'Unknown'}</span>
                        </label>
                    </div>
                `).join('');

                console.log('✅ Documents displayed successfully');
                console.log('Total checkboxes created:', result.documents.length);
            } else {
                throw new Error(result.error || 'No documents in response');
            }
        } catch (error) {
            console.error('❌ Error fetching documents:', error);
            documentSelection.innerHTML = `<div style="padding: 20px; color: red;">Error loading documents: ${error.message}</div>`;
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
        const selectedDocuments = Array.from(document.querySelectorAll('#fcsDocumentSelection input[type="checkbox"]:checked'))
            .map(checkbox => checkbox.value);

        if (selectedDocuments.length === 0) {
            this.utils.showNotification('Please select at least one bank statement', 'error');
            return;
        }

        const selectedElement = document.querySelector('.conversation-item.selected');
        const conversationId = selectedElement?.dataset?.conversationId;
        const businessName = selectedElement?.querySelector('.conversation-business')?.textContent || 'Auto-Generated Business';

        if (!conversationId) {
            this.utils.showNotification('No conversation selected', 'error');
            return;
        }

        // ⭐ CRITICAL: Set flags FIRST before doing ANYTHING else
        this._fcsGenerationInProgress = true;
        this._generatingForConversation = conversationId;
        this._generationStartTime = Date.now();

        console.log('🚀 FCS Generation Started:', {
            conversationId,
            documentCount: selectedDocuments.length,
            timestamp: new Date().toISOString()
        });

        // Close modal
        this.hideFCSModal();

        // Switch to FCS tab (this will trigger renderFCSTab which checks flags)
        if (this.parent.intelligence) {
            this.parent.intelligence.switchIntelligenceTab('fcs');
        }

        // Start the actual generation
        this.startFCSGeneration(conversationId, businessName, selectedDocuments);
    }

    async startFCSGeneration(conversationId, businessName, selectedDocuments) {
        console.log('🔵 Starting FCS generation for:', conversationId);
        console.log('📋 Generation parameters:', {
            businessName,
            documentCount: selectedDocuments.length,
            documentIds: selectedDocuments
        });

        // Show initial progress
        this.showFCSProgress('Starting FCS generation...');

        try {
            // ✅ FIXED: Send business name and document IDs to backend
            const result = await this.parent.apiCall(`/api/conversations/${conversationId}/fcs/generate`, {
                method: 'POST',
                body: JSON.stringify({
                    businessName: businessName,
                    documentIds: selectedDocuments
                })
            });
            console.log('✅ FCS API response:', result);

            if (result.success) {
                console.log('⏳ FCS generation started, beginning status polling...');

                // Update progress message
                this.showFCSProgress('Extracting text from documents with Document AI...');

                // Start polling immediately (every 5 seconds)
                setTimeout(() => {
                    console.log('📊 Starting to poll for FCS completion...');
                    this.pollForFCSStatus(conversationId);
                }, 5000);  // First poll after 5 seconds
            } else {
                throw new Error(result.error || 'Failed to start generation');
            }
        } catch (error) {
            console.error('❌ Error starting FCS:', error);

            // Clear ALL flags on error
            this._fcsGenerationInProgress = false;
            this._generatingForConversation = null;
            this._generationStartTime = null;

            // Hide progress indicator
            this.hideFCSProgress();

            this.utils.showNotification('Failed to start FCS generation: ' + error.message, 'error');

            // Show error in UI
            const fcsResults = document.getElementById('fcsResults');
            if (fcsResults) {
                fcsResults.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #ef4444;">
                        <p style="font-size: 18px;">Failed to start FCS generation</p>
                        <p style="font-size: 14px;">${error.message}</p>
                        <button onclick="window.conversationUI.fcs.showFCSModal()"
                                style="margin-top: 20px; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">
                            Try Again
                        </button>
                    </div>
                `;
                fcsResults.style.display = 'block';
            }

            // Reload documents to refresh the UI
            if (this.parent.documents) {
                this.parent.documents.loadDocuments();
            }
        }
    }

    async pollForFCSStatus(conversationId, attempts = 0) {
        console.log(`📊 Status poll attempt ${attempts + 1} for conversation ${conversationId}`);

        if (attempts >= 60) {
            this._fcsGenerationInProgress = false;
            this._generatingForConversation = null;
            this._generationStartTime = null;
            this.hideFCSProgress();

            const fcsResults = document.getElementById('fcsResults');
            if (fcsResults) {
                fcsResults.innerHTML = `
                    <div style="text-align: center; padding: 40px;">
                        <p style="color: #f59e0b; font-size: 18px;">⏱️ Generation taking longer than expected</p>
                        <p style="color: #6b7280;">The report may still be processing.</p>
                        <button onclick="window.conversationUI.fcs.loadFCSData()"
                                class="btn btn-primary"
                                style="margin-top: 20px; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">
                            Check for Report
                        </button>
                    </div>
                `;
                fcsResults.style.display = 'block';
            }
            return;
        }

        try {
            // ✅ Use apiCall (handles auth) but catch JSON parsing errors
            let statusResult;
            try {
                statusResult = await this.parent.apiCall(`/api/conversations/${conversationId}/fcs/status?_=${Date.now()}`);
            } catch (apiError) {
                console.error('❌ API call error:', apiError);

                // If it's a JSON parsing error, the endpoint might not exist or returned non-JSON
                if (apiError.message?.includes('JSON') || apiError.message?.includes('Unexpected')) {
                    console.error('Backend returned non-JSON response');

                    // Retry after delay
                    setTimeout(() => {
                        this.pollForFCSStatus(conversationId, attempts + 1);
                    }, 5000);
                    return;
                }

                throw apiError;
            }

            console.log('📊 Status result:', statusResult);

            // Handle different response formats
            const status = statusResult?.status || statusResult?.data?.status;

            if (!status) {
                console.warn('⚠️ No status in response:', statusResult);
                // Keep polling
                setTimeout(() => {
                    this.pollForFCSStatus(conversationId, attempts + 1);
                }, 5000);
                return;
            }

            if (status === 'completed') {
                console.log('✅ FCS completed! Loading report...');

                // Fetch the completed FCS data
                try {
                    const result = await this.parent.apiCall(`/api/conversations/${conversationId}/fcs?_=${Date.now()}`);

                    if (result.success && result.analysis && result.analysis.report) {
                        console.log('✅ Got fresh FCS data, displaying...');

                        // Clear flags after we have the data
                        this._fcsGenerationInProgress = false;
                        this._generatingForConversation = null;
                        this._generationStartTime = null;

                        // Display the report FIRST
                        const reportData = {
                            report_content: result.analysis.report,
                            generated_at: result.analysis.completedAt,
                            status: result.analysis.status,
                            business_name: result.analysis.businessName,
                            statement_count: result.analysis.statementCount
                        };
                        this.displayFCSReport(reportData);

                        // ✅ Hide progress AFTER displaying (with slight delay to ensure render)
                        setTimeout(() => {
                            this.hideFCSProgress();
                        }, 100);

                        this.utils.showNotification('FCS generated successfully!', 'success');

                    } else {
                        console.error('❌ Invalid response format:', result);
                        throw new Error('No report data in response');
                    }
                } catch (fetchError) {
                    console.error('Error fetching completed FCS:', fetchError);

                    this._fcsGenerationInProgress = false;
                    this._generatingForConversation = null;
                    this._generationStartTime = null;

                    this.hideFCSProgress(); // ✅ Hide on error too

                    this.utils.showNotification('Error loading FCS: ' + fetchError.message, 'error');
                }

            } else if (status === 'failed') {
                console.error('❌ FCS generation failed:', statusResult.error);

                this._fcsGenerationInProgress = false;
                this._generatingForConversation = null;
                this._generationStartTime = null;
                this.hideFCSProgress();

                const fcsResults = document.getElementById('fcsResults');
                if (fcsResults) {
                    fcsResults.innerHTML = `
                        <div style="text-align: center; padding: 40px; color: #ef4444;">
                            <p style="font-size: 18px;">❌ FCS Generation Failed</p>
                            <p style="font-size: 14px;">${statusResult.error || 'Unknown error'}</p>
                            <button onclick="window.conversationUI.fcs.showFCSModal()"
                                    style="margin-top: 20px; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">
                                Try Again
                            </button>
                        </div>
                    `;
                    fcsResults.style.display = 'block';
                }
            } else if (status === 'not_started' || status === 'not_found') {
                // FCS hasn't been created in DB yet, keep waiting
                console.log('⏳ FCS not started yet, continuing to poll...');

                const elapsed = Math.floor((Date.now() - this._generationStartTime) / 1000);
                this.showFCSProgress(`Initializing... (${elapsed}s elapsed)`);

                setTimeout(() => {
                    this.pollForFCSStatus(conversationId, attempts + 1);
                }, 5000);
            } else {
                // Still processing
                console.log('⏳ Still processing... Status:', status);

                const elapsed = Math.floor((Date.now() - this._generationStartTime) / 1000);
                if (elapsed < 20) {
                    this.showFCSProgress('Extracting text from documents...');
                } else if (elapsed < 40) {
                    this.showFCSProgress('Analyzing financial data with AI...');
                } else {
                    this.showFCSProgress(`Still processing... (${elapsed}s elapsed)`);
                }

                setTimeout(() => {
                    this.pollForFCSStatus(conversationId, attempts + 1);
                }, 5000);
            }
        } catch (error) {
            console.error('❌ Error polling FCS status:', error);
            console.error('Error details:', error.message);

            // Don't fail immediately - retry a few times
            if (attempts < 10) {
                console.log('⏳ Retrying after error...');
                setTimeout(() => {
                    this.pollForFCSStatus(conversationId, attempts + 1);
                }, 5000);
            } else {
                // After 10 failed attempts, give up
                this._fcsGenerationInProgress = false;
                this._generatingForConversation = null;
                this._generationStartTime = null;
                this.hideFCSProgress();

                const fcsResults = document.getElementById('fcsResults');
                if (fcsResults) {
                    fcsResults.innerHTML = `
                        <div style="text-align: center; padding: 40px; color: #ef4444;">
                            <p style="font-size: 18px;">❌ Error Checking FCS Status</p>
                            <p style="font-size: 14px;">${error.message}</p>
                            <button onclick="window.conversationUI.fcs.loadFCSData()"
                                    style="margin-top: 20px; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">
                                Try Loading Report
                            </button>
                        </div>
                    `;
                    fcsResults.style.display = 'block';
                }
            }
        }
    }

    async pollForFCSReport(conversationId, attempts = 0) {
        console.log(`⚠️ DEPRECATED: pollForFCSReport - use pollForFCSStatus instead`);

        if (attempts >= 30) { // 30 * 10 = 5 minutes max
            // Clear ALL flags on timeout
            this._fcsGenerationInProgress = false;
            this._generatingForConversation = null;
            this._generationStartTime = null;

            const fcsResults = document.getElementById('fcsResults');
            if (fcsResults) {
                fcsResults.innerHTML = `
                    <div style="text-align: center; padding: 40px;">
                        <p style="color: #f59e0b; font-size: 18px;">⏱️ Generation taking longer than expected</p>
                        <p style="color: #6b7280;">The report may still be processing.</p>
                        <button onclick="window.conversationUI.fcs.loadFCSData()"
                                class="btn btn-primary"
                                style="margin-top: 20px; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">
                            Check for Report
                        </button>
                    </div>
                `;
                fcsResults.style.display = 'block';
            }
            return;
        }

        try {
            const result = await this.parent.apiCall(`/api/conversations/${conversationId}/fcs-report?_=${Date.now()}`);
                console.log('Poll response:', result);

                if (result.success && result.report?.report_content) {
                    // CRITICAL: Check if this report was generated AFTER we started generation
                    const reportTimestamp = new Date(result.report.generated_at).getTime();
                    const generationStarted = this._generationStartTime;

                    console.log('Timestamp check:', {
                        reportGenerated: new Date(reportTimestamp).toISOString(),
                        generationStarted: new Date(generationStarted).toISOString(),
                        reportIsNewer: reportTimestamp > generationStarted,
                        diff: reportTimestamp - generationStarted
                    });

                    // ONLY accept the report if it was created AFTER generation started
                    if (reportTimestamp > generationStarted) {
                        console.log('✅ NEW FCS Report ready! (Generated after start time)');
                        // Clear ALL flags when done
                        this._fcsGenerationInProgress = false;
                        this._generatingForConversation = null;
                        this._generationStartTime = null;
                        this.displayFCSReport(result.report);
                        this.utils.showNotification('FCS Report generated successfully!', 'success');
                        return;
                    } else {
                        console.log('⏳ Found OLD report - waiting for new one...', {
                            oldReport: new Date(reportTimestamp).toLocaleString(),
                            expectedAfter: new Date(generationStarted).toLocaleString()
                        });
                    }
                }
        } catch (error) {
            console.log('Poll error (will retry):', error);
        }

        // Update status with elapsed time
        const fcsResults = document.getElementById('fcsResults');
        if (fcsResults) {
            const elapsed = Math.floor((Date.now() - this._generationStartTime) / 1000);
            fcsResults.innerHTML = `
                <div style="text-align: center; padding: 60px 40px;">
                    <style>
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    </style>
                    <div style="margin: 0 auto 24px; width: 48px; height: 48px; border: 3px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                    <h3 style="color: #3b82f6; margin: 0 0 12px 0; font-size: 20px;">Generating NEW FCS Report</h3>
                    <p style="color: #6b7280; font-size: 15px; margin: 0;">Processing... (${elapsed} seconds elapsed)</p>
                    <p style="color: #9ca3af; font-size: 13px; margin: 16px 0 0 0;">Analyzing bank statements with AI...</p>
                </div>
            `;
            fcsResults.style.display = 'block';
        }

        // Poll again in 10 seconds
        setTimeout(() => this.pollForFCSReport(conversationId, attempts + 1), 10000);
    }

    async loadFCSData() {
        const conversationId = this.parent.getCurrentConversationId();

        console.log('=== FCS DATA LOADING ===');
        console.log('Conversation ID:', conversationId);
        console.log('Generation in progress:', this._fcsGenerationInProgress);
        console.log('========================');

        // ✅ Ensure fcsResults exists
        let fcsResults = document.getElementById('fcsResults');
        if (!fcsResults) {
            console.warn('⚠️ fcsResults not found, creating...');
            const intelligenceContent = document.getElementById('intelligenceContent');
            if (intelligenceContent) {
                fcsResults = document.createElement('div');
                fcsResults.id = 'fcsResults';
                intelligenceContent.appendChild(fcsResults);
            } else {
                console.error('❌ Cannot create fcsResults - intelligenceContent missing');
                return;
            }
        }

        // ✅ Check if we already have content displayed
        const hasContent = fcsResults.innerHTML.trim() !== '' &&
                          fcsResults.innerHTML.includes('FCS Financial Analysis Report');

        if (hasContent && !this._fcsGenerationInProgress) {
            console.log('✅ FCS content already loaded, skipping reload');
            fcsResults.style.display = 'block';
            return;
        }

        // CRITICAL: BLOCK if generation is in progress
        if (this._fcsGenerationInProgress && this._generatingForConversation === conversationId) {
            console.log('🚫 BLOCKED: Generation in progress');
            fcsResults.innerHTML = `
                <div style="text-align: center; padding: 60px 40px;">
                    <style>
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    </style>
                    <div style="margin: 0 auto 24px; width: 48px; height: 48px; border: 3px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                    <h3 style="color: #3b82f6; margin: 0 0 12px 0; font-size: 20px;">Generating NEW FCS Report</h3>
                    <p style="color: #6b7280; font-size: 15px; margin: 0;">Analyzing documents with AI...</p>
                </div>
            `;
            fcsResults.style.display = 'block';
            return;
        }

        if (!conversationId) {
            console.warn('No conversation selected');
            fcsResults.innerHTML = `<div style="text-align: center; padding: 40px;">No conversation selected</div>`;
            fcsResults.style.display = 'block';
            return;
        }

        console.log(`Loading FCS data for conversation ${conversationId}`);

        // Show loading ONLY if we don't have content yet
        fcsResults.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div class="loading-spinner" style="margin: 0 auto 16px; width: 40px; height: 40px; border: 3px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <p>Loading FCS report...</p>
            </div>
        `;
        fcsResults.style.display = 'block';

        try {
            const cacheBuster = new Date().getTime();
            // Use NEW FCS endpoint
            const result = await this.parent.apiCall(`/api/conversations/${conversationId}/fcs?_=${cacheBuster}`);
            console.log(`FCS API result:`, result);

            if (result.success && result.analysis) {
                // Check if report has actual content
                if (!result.analysis.report || result.analysis.report.trim() === '') {
                    throw new Error('FCS report has no content');
                }

                console.log(`✅ Calling displayFCSReport with analysis data`);
                // Convert new format to old format for displayFCSReport
                const reportData = {
                    report_content: result.analysis.report,
                    generated_at: result.analysis.completedAt,
                    status: result.analysis.status,
                    business_name: result.analysis.businessName,
                    statement_count: result.analysis.statementCount
                };
                this.displayFCSReport(reportData);
            } else {
                throw new Error(result.error || 'No report data returned');
            }

        } catch (error) {
            console.error('Error loading FCS data:', error);
            console.error('Error stack:', error.stack);

            // Show friendly error message
            fcsResults.innerHTML = `
                <div style="text-align: center; padding: 60px 40px;">
                    <div style="font-size: 48px; margin-bottom: 20px;">📊</div>
                    <h3 style="color: #6b7280; margin-bottom: 12px;">No FCS Report Available</h3>
                    <p style="color: #9ca3af; margin-bottom: 24px;">
                        ${error.message.includes('404') || error.message.includes('not found')
                            ? 'Generate a report to analyze your financial documents'
                            : 'Error loading report: ' + error.message}
                    </p>
                    <button onclick="window.conversationUI.fcs.showFCSModal()"
                            class="btn btn-primary"
                            style="padding: 10px 24px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
                        <i class="fas fa-file-invoice-dollar"></i>
                        Generate FCS Report
                    </button>
                </div>
            `;
            fcsResults.style.display = 'block';
        }
    }

    displayFCSReport(report) {
        try {
            console.log('=== displayFCSReport DEBUG ===');
            console.log('Full report object:', report);
            console.log('report.report_content exists:', !!report?.report_content);
            console.log('report.report_content length:', report?.report_content?.length || 0);
            console.log('==============================');

            // ✅ CRITICAL: Get or CREATE fcsResults element
            let fcsResults = document.getElementById('fcsResults');

            if (!fcsResults) {
                console.warn('⚠️ fcsResults element not found, creating it now...');

                // Find parent container
                const intelligenceContent = document.getElementById('intelligenceContent');
                if (!intelligenceContent) {
                    console.error('❌ intelligenceContent container not found - cannot display FCS!');
                    alert('Error: Cannot display FCS report. Page structure is missing.');
                    return;
                }

                // Create the fcsResults div
                fcsResults = document.createElement('div');
                fcsResults.id = 'fcsResults';
                intelligenceContent.appendChild(fcsResults);

                console.log('✅ Created fcsResults element dynamically');
            }

            // ✅ ALWAYS hide empty state when showing FCS
            const emptyState = document.querySelector('#intelligenceContent .empty-state');
            if (emptyState) {
                emptyState.style.display = 'none';
            }

            // Check if report has content
            if (!report || !report.report_content) {
                console.error('❌ Report or report_content is missing');
                fcsResults.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #ef4444;">
                        <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                        <h3>FCS Report Data Missing</h3>
                        <p style="font-size: 0.9em; color: #666; margin: 16px 0;">The report content is empty or invalid.</p>
                        <details style="margin: 20px 0; text-align: left;">
                            <summary style="cursor: pointer; color: #3b82f6;">View Debug Info</summary>
                            <pre style="font-size: 11px; background: #f3f4f6; padding: 10px; border-radius: 4px; max-height: 200px; overflow: auto; margin-top: 10px;">${JSON.stringify(report, null, 2)}</pre>
                        </details>
                        <button onclick="window.conversationUI.fcs.loadFCSData()"
                                class="btn btn-primary"
                                style="padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">
                            Retry Loading
                        </button>
                    </div>
                `;
                fcsResults.style.display = 'block';
                return;
            }

            // Handle date formatting
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
                } catch (dateError) {
                    console.warn('Error parsing date:', dateError);
                    reportDate = String(report.generated_at);
                }
            }

            console.log('✅ Formatting FCS content...');
            const processedContent = this.formatFCSContent(report.report_content);

            console.log('✅ Building HTML...');
            // ✅ NO HEADER - Pure content with subtle container
            fcsResults.innerHTML = `
                <div class="fcs-report" style="width: 100%; max-width: 100%;">
                    <!-- Just the report content, no header -->
                    <div class="fcs-content" style="
                        background: white;
                        border: 1px solid #e5e7eb;
                        border-radius: 6px;
                        padding: 12px 16px 16px 16px;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                    ">
                        ${processedContent}
                    </div>
                </div>
            `;

            // ✅ CRITICAL: Show the container!
            fcsResults.style.display = 'block';

            // ✅ Scroll to top of results
            fcsResults.scrollIntoView({ behavior: 'smooth', block: 'start' });

            console.log('✅ FCS report displayed successfully!');

        } catch (error) {
            console.error('❌ Error in displayFCSReport:', error);
            console.error('Error stack:', error.stack);

            // Emergency fallback
            let fcsResults = document.getElementById('fcsResults');
            if (!fcsResults) {
                const intelligenceContent = document.getElementById('intelligenceContent');
                if (intelligenceContent) {
                    fcsResults = document.createElement('div');
                    fcsResults.id = 'fcsResults';
                    intelligenceContent.appendChild(fcsResults);
                }
            }

            if (fcsResults) {
                fcsResults.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #ef4444;">
                        <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
                        <h3>Error Displaying FCS Report</h3>
                        <p style="font-size: 14px; color: #666; margin: 16px 0;">
                            ${error.message}
                        </p>
                        <details style="margin: 20px 0; text-align: left;">
                            <summary style="cursor: pointer; color: #3b82f6;">View Technical Details</summary>
                            <pre style="font-size: 11px; background: #f3f4f6; padding: 10px; border-radius: 4px; max-height: 200px; overflow: auto; margin-top: 10px;">${error.stack}</pre>
                        </details>
                        <button onclick="window.conversationUI.fcs.loadFCSData()"
                                class="btn btn-primary"
                                style="padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">
                            Retry Loading
                        </button>
                    </div>
                `;
                fcsResults.style.display = 'block';
            }
        }
    }

    formatFCSContent(content) {
        console.log('📋 Formatting FCS content...');

        if (!content || content.trim() === '') {
            return '<p style="color: #ef4444; text-align: center; padding: 20px;">No content to display</p>';
        }

        try {
            // ✅ ULTRA-AGGRESSIVE CLEANUP
            let cleanedContent = content
                // Remove specific unwanted lines
                .replace(/^EXTRACTED_BUSINESS_NAME:.*$/gm, '')
                .replace(/^Business:.*$/gm, '')
                .replace(/^Statements Analyzed:.*$/gm, '')
                .replace(/^Monthly Financial Summary$/gm, '')
                .replace(/^Underwriting Section Breakdown$/gm, '')

                // Remove all variations of dots
                .replace(/^\.\.\.\s*$/gm, '')
                .replace(/^\s*\.\.\.\s*$/gm, '')
                .replace(/^…\s*$/gm, '')
                .replace(/^\s*…\s*$/gm, '')

                // Clean up spacing
                .replace(/\n\s*\.\.\.\s*\n/g, '\n')
                .replace(/\n\s*…\s*\n/g, '\n')
                .replace(/^\s+/gm, '')
                .replace(/\s+$/gm, '')
                .replace(/\n{3,}/g, '\n\n')
                .trim();

            const lines = cleanedContent.split('\n').filter(line => {
                const trimmed = line.trim();
                // Filter out empty lines and lines with just dots
                return trimmed !== '' && trimmed !== '...' && trimmed !== '…';
            });

            let html = '';
            let inBulletList = false;
            let inMonthTable = false;

            for (let i = 0; i < lines.length; i++) {
                const trimmedLine = lines[i].trim();

                // ✅ NUCLEAR: Skip completely empty lines AND lines with just dots
                if (trimmedLine === '' || trimmedLine === '...' || trimmedLine === '…') {
                    if (inBulletList) {
                        html += '</div>';
                        inBulletList = false;
                    }
                    continue;
                }

                // Main section headers (ALL CAPS, standalone)
                if (trimmedLine === trimmedLine.toUpperCase() &&
                    trimmedLine.length > 3 &&
                    !trimmedLine.includes(':') &&
                    trimmedLine.match(/^[A-Z\s_]+$/)) {

                    // Close any open structures
                    if (inBulletList) {
                        html += '</div>';
                        inBulletList = false;
                    }
                    if (inMonthTable) {
                        html += '</tbody></table>';
                        inMonthTable = false;
                    }

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

                // Month summary lines - TABLE FORMAT
                if (trimmedLine.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s+Deposits:/)) {
                    // Close bullet list if open
                    if (inBulletList) {
                        html += '</div>';
                        inBulletList = false;
                    }

                    // Start table on first month
                    if (!inMonthTable) {
                        html += `
                            <table style="
                                width: 100%;
                                border-collapse: collapse;
                                margin: 0 0 16px 0;
                                font-size: 13px;
                                border: 1px solid #e5e7eb;
                                border-radius: 6px;
                                overflow: hidden;
                            ">
                                <thead>
                                    <tr style="background: #f9fafb; border-bottom: 2px solid #3b82f6;">
                                        <th style="padding: 10px 12px; text-align: left; font-weight: 700; color: #3b82f6; font-size: 13px;">Month</th>
                                        <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: #6b7280; font-size: 12px;">Deposits</th>
                                        <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: #6b7280; font-size: 12px;">Revenue</th>
                                        <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: #6b7280; font-size: 12px;">Neg Days</th>
                                        <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: #6b7280; font-size: 12px;">End Bal</th>
                                        <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: #6b7280; font-size: 12px;">#Dep</th>
                                    </tr>
                                </thead>
                                <tbody>
                        `;
                        inMonthTable = true;
                    }

                    const monthMatch = trimmedLine.match(/^([A-Z][a-z]+\s+\d{4})\s+(.+)$/);
                    if (monthMatch) {
                        const month = monthMatch[1];
                        const data = monthMatch[2];

                        const deposits = data.match(/Deposits:\s*([^\s]+)/)?.[1] || '';
                        const revenue = data.match(/Revenue:\s*([^\s]+)/)?.[1] || '';
                        const negDays = data.match(/Neg Days:\s*([^\s]+)/)?.[1] || '';
                        const endBal = data.match(/End Bal:\s*([^\s]+)/)?.[1] || '';
                        const numDep = data.match(/#Dep:\s*([^\s]+)/)?.[1] || '';

                        html += `
                            <tr style="border-bottom: 1px solid #e5e7eb;">
                                <td style="padding: 10px 12px; font-weight: 700; color: #3b82f6;">${this.escapeHtml(month)}</td>
                                <td style="padding: 10px 12px; text-align: left; color: #111827; font-weight: 600;">${this.escapeHtml(deposits)}</td>
                                <td style="padding: 10px 12px; text-align: left; color: #111827; font-weight: 600;">${this.escapeHtml(revenue)}</td>
                                <td style="padding: 10px 12px; text-align: left; color: #111827; font-weight: 600;">${this.escapeHtml(negDays)}</td>
                                <td style="padding: 10px 12px; text-align: left; color: #111827; font-weight: 600;">${this.escapeHtml(endBal)}</td>
                                <td style="padding: 10px 12px; text-align: left; color: #111827; font-weight: 600;">${this.escapeHtml(numDep)}</td>
                            </tr>
                        `;
                    }

                    // Check if next line is also a month, if not close table
                    const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
                    if (!nextLine.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s+Deposits:/)) {
                        html += '</tbody></table>';
                        inMonthTable = false;
                    }

                    continue;
                }

                // Section headers (ends with colon, NOT all data fields)
                if (trimmedLine.endsWith(':') &&
                    !trimmedLine.match(/^(Deposits|Revenue|Neg Days|End Bal|#Dep|Business Name|Position|Industry|Time in Business|Average|State|Positions):/i)) {

                    if (inBulletList) {
                        html += '</div>';
                        inBulletList = false;
                    }
                    if (inMonthTable) {
                        html += '</tbody></table>';
                        inMonthTable = false;
                    }

                    html += `
                        <div style="
                            color: #111827;
                            font-size: 14px;
                            font-weight: 600;
                            margin: 16px 0 8px 0;
                        ">${this.escapeHtml(trimmedLine)}</div>
                    `;
                    continue;
                }

                // Bullet points (•, -, or numbered)
                if (trimmedLine.match(/^[•\-]\s/) || trimmedLine.match(/^\d+\.\s/)) {
                    if (inMonthTable) {
                        html += '</tbody></table>';
                        inMonthTable = false;
                    }

                    if (!inBulletList) {
                        html += '<div style="margin: 8px 0 8px 16px;">';
                        inBulletList = true;
                    }

                    const bulletText = trimmedLine.replace(/^[•\-]\s/, '').replace(/^\d+\.\s/, '');
                    const isNumbered = trimmedLine.match(/^\d+\.\s/);
                    const bulletSymbol = isNumbered ? trimmedLine.match(/^\d+/)[0] + '.' : '•';

                    html += `
                        <div style="
                            display: flex;
                            gap: 8px;
                            margin: 4px 0;
                            line-height: 1.5;
                            font-size: 13px;
                        ">
                            <span style="
                                color: #3b82f6;
                                font-weight: 600;
                                min-width: ${isNumbered ? '20px' : '8px'};
                            ">${this.escapeHtml(bulletSymbol)}</span>
                            <span style="color: #374151; flex: 1;">${this.escapeHtml(bulletText)}</span>
                        </div>
                    `;
                    continue;
                }

                // Summary data fields (in 3-Month Summary section)
                if (trimmedLine.match(/^(Business Name|Position|Industry|Time in Business|Average [A-Z]|Negative Days|State|Positions|Average Number):/)) {
                    if (inBulletList) {
                        html += '</div>';
                        inBulletList = false;
                    }
                    if (inMonthTable) {
                        html += '</tbody></table>';
                        inMonthTable = false;
                    }

                    const colonIndex = trimmedLine.indexOf(':');
                    const key = trimmedLine.substring(0, colonIndex).trim();
                    const value = trimmedLine.substring(colonIndex + 1).trim();

                    html += `
                        <div style="
                            display: grid;
                            grid-template-columns: 200px 1fr;
                            gap: 12px;
                            padding: 6px 10px;
                            background: #f9fafb;
                            margin: 3px 0;
                            border-radius: 3px;
                            font-size: 13px;
                            align-items: center;
                        ">
                            <span style="
                                font-weight: 600;
                                color: #4b5563;
                            ">${this.escapeHtml(key)}:</span>
                            <span style="
                                color: #111827;
                            ">${this.escapeHtml(value)}</span>
                        </div>
                    `;
                    continue;
                }

                // Other key-value pairs
                if (trimmedLine.includes(':') && !trimmedLine.endsWith(':')) {
                    if (inBulletList) {
                        html += '</div>';
                        inBulletList = false;
                    }
                    if (inMonthTable) {
                        html += '</tbody></table>';
                        inMonthTable = false;
                    }

                    const colonIndex = trimmedLine.indexOf(':');
                    const key = trimmedLine.substring(0, colonIndex).trim();
                    const value = trimmedLine.substring(colonIndex + 1).trim();

                    html += `
                        <div style="
                            margin: 12px 0 6px 0;
                            font-size: 14px;
                            font-weight: 600;
                            color: #374151;
                        ">
                            ${this.escapeHtml(key)}:
                            ${value ? `<span style="font-weight: 400; margin-left: 8px;">${this.escapeHtml(value)}</span>` : ''}
                        </div>
                    `;
                    continue;
                }

                // Regular text
                if (inBulletList) {
                    html += '</div>';
                    inBulletList = false;
                }
                if (inMonthTable) {
                    html += '</tbody></table>';
                    inMonthTable = false;
                }

                html += `
                    <div style="
                        margin: 8px 0;
                        line-height: 1.5;
                        color: #374151;
                        font-size: 13px;
                    ">${this.escapeHtml(trimmedLine)}</div>
                `;
            }

            // Close any open structures
            if (inBulletList) {
                html += '</div>';
            }
            if (inMonthTable) {
                html += '</tbody></table>';
            }

            return html;

        } catch (error) {
            console.error('Error formatting FCS content:', error);
            return `<div style="color: #ef4444; padding: 12px;">Error: ${error.message}</div>`;
        }
    }

    // Helper method to render tables
    renderTable(rows) {
        if (!rows || rows.length === 0) return '';

        try {
            let html = `
                <div style="
                    overflow-x: auto;
                    margin: 20px 0;
                    border-radius: 8px;
                    border: 1px solid #e5e7eb;
                ">
                    <table style="
                        width: 100%;
                        border-collapse: collapse;
                        background: white;
                    ">
            `;

            rows.forEach((row, index) => {
                const cells = row.split('|')
                    .map(cell => cell.trim())
                    .filter(cell => cell !== '');

                // Skip separator rows (----)
                if (cells.length > 0 && cells[0].match(/^-+$/)) {
                    return;
                }

                const isHeader = index === 0;
                const tag = isHeader ? 'th' : 'td';
                const bgColor = isHeader ? '#f3f4f6' : (index % 2 === 0 ? 'white' : '#f9fafb');

                html += '<tr>';
                cells.forEach(cell => {
                    html += `
                        <${tag} style="
                            padding: 12px 16px;
                            text-align: left;
                            background: ${bgColor};
                            ${isHeader ? 'font-weight: 600; color: #111827;' : 'color: #374151;'}
                            border-bottom: 1px solid #e5e7eb;
                        ">${this.escapeHtml(cell)}</${tag}>
                    `;
                });
                html += '</tr>';
            });

            html += '</table></div>';
            return html;

        } catch (error) {
            console.error('Error rendering table:', error);
            return '<p style="color: #ef4444;">Error rendering table</p>';
        }
    }

    // Helper method to escape HTML
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Disabled - download feature not needed
    async downloadFCSReport() {
        console.log('Download FCS - feature disabled');
        this.utils.showNotification('Download feature coming soon!', 'info');
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
            progressDiv.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                padding: 32px;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                z-index: 10000;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 16px;
                min-width: 300px;
            `;
            progressDiv.innerHTML = `
                <div class="loading-spinner"></div>
                <div class="progress-text" style="font-weight: 500; text-align: center; color: #111827;"></div>
            `;

            // ✅ FIXED: Append to body instead of modal
            document.body.appendChild(progressDiv);
        } else {
            const progressText = progressDiv.querySelector('.progress-text');
            if (progressText) {
                progressText.textContent = message;
            }
        }

        progressDiv.style.display = 'flex';
    }

    hideFCSProgress() {
        console.log('🔇 Hiding FCS progress indicator');

        const progressDiv = document.getElementById('fcsProgressIndicator');
        if (progressDiv) {
            progressDiv.style.display = 'none';
            // ✅ Also remove it from DOM completely
            progressDiv.remove();
            console.log('✅ Progress indicator hidden and removed');
        } else {
            console.log('⚠️ No progress indicator found to hide');
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