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

        console.log('=== FCS DATA LOADING DEBUG ===');
        console.log('Current conversation ID:', conversationId);
        console.log('Generation in progress:', this._fcsGenerationInProgress);
        console.log('================================');

        // ✅ CRITICAL: Ensure fcsResults element exists
        let fcsResults = document.getElementById('fcsResults');
        if (!fcsResults) {
            console.warn('⚠️ fcsResults not found, creating it...');
            const intelligenceContent = document.getElementById('intelligenceContent');
            if (intelligenceContent) {
                fcsResults = document.createElement('div');
                fcsResults.id = 'fcsResults';
                fcsResults.style.display = 'block';
                intelligenceContent.appendChild(fcsResults);
            } else {
                console.error('❌ intelligenceContent not found, cannot create fcsResults');
                return;
            }
        }

        // CRITICAL: BLOCK IMMEDIATELY if generation is in progress for THIS conversation
        if (this._fcsGenerationInProgress && this._generatingForConversation === conversationId) {
            console.log('🚫 BLOCKED: Generation in progress for this conversation - NOT loading old data');

            // Keep showing loading state
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
                    <p style="color: #6b7280; font-size: 15px; margin: 0;">Analyzing documents with AI (OCR + OpenAI)...</p>
                    <p style="color: #ef4444; font-size: 13px; margin: 16px 0 0 0; font-weight: 600;">⚠️ Do not refresh</p>
                </div>
            `;
            fcsResults.style.display = 'block';
            return; // EXIT IMMEDIATELY
        }

        if (!conversationId) {
            console.warn('No conversation ID found, cannot load FCS data');
            fcsResults.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #6b7280;">
                    <p>No conversation selected</p>
                </div>
            `;
            fcsResults.style.display = 'block';
            return;
        }

        console.log(`Loading FCS data for conversation ${conversationId}`);

        // Show loading state
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
            fcsResults.innerHTML = `
                <div class="fcs-report" style="width: 100%; max-width: 100%; overflow: hidden;">
                    <div class="fcs-header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; border-radius: 8px; margin-bottom: 20px; color: white;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
                            <div>
                                <h4 style="color: white; margin: 0 0 8px 0; font-size: 24px; font-weight: 600;">
                                    📊 FCS Financial Analysis Report
                                </h4>
                                <p style="color: rgba(255,255,255,0.9); font-size: 14px; margin: 0;">
                                    Generated on ${reportDate}
                                </p>
                                ${report.business_name ? `
                                    <p style="color: rgba(255,255,255,0.9); font-size: 14px; margin: 4px 0 0 0;">
                                        Business: ${report.business_name}
                                    </p>
                                ` : ''}
                                ${report.statement_count ? `
                                    <p style="color: rgba(255,255,255,0.9); font-size: 14px; margin: 4px 0 0 0;">
                                        Statements Analyzed: ${report.statement_count}
                                    </p>
                                ` : ''}
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-secondary"
                                        onclick="window.conversationUI.fcs.downloadFCSReport()"
                                        style="padding: 10px 16px; background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">
                                    📥 Download PDF
                                </button>
                                <button class="btn btn-primary"
                                        onclick="window.conversationUI.fcs.regenerateFCS()"
                                        style="padding: 10px 16px; background: white; color: #667eea; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">
                                    🔄 Regenerate
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="fcs-content" style="
                        background: white;
                        border: 1px solid #e5e7eb;
                        border-radius: 8px;
                        padding: 24px;
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
        if (!content || typeof content !== 'string') {
            return '<div style="padding: 20px; text-align: center; color: #666;">No content available</div>';
        }

        let formattedHTML = `
            <div style="
                font-family: Consolas, Monaco, 'Courier New', monospace;
                font-size: 11px;
                line-height: 1.3;
                background: #ffffff;
                color: #333;
                padding: 15px;
                width: 100%;
                overflow-x: auto;
            ">`;

        const lines = content.split('\n');

        lines.forEach((line, index) => {
            const trimmedLine = line.trim();

            if (trimmedLine === '```') return;

            // Main section headers
            if (trimmedLine === 'FILE CONTROL SHEET' ||
                trimmedLine === 'Monthly Financial Summary' ||
                trimmedLine === 'True Revenue:' ||
                trimmedLine.startsWith('1a. Revenue Deductions') ||
                trimmedLine === 'MCA Deposits' ||
                trimmedLine === 'Recurring MCA Payments' ||
                trimmedLine === 'Observations') {
                formattedHTML += `
                    <div style="
                        font-weight: bold;
                        color: #1e40af;
                        margin: ${index === 0 ? '0' : '12px'} 0 6px 0;
                        padding-bottom: 2px;
                        border-bottom: 1px solid #e5e7eb;
                        font-size: 12px;
                    ">${trimmedLine}</div>`;
            }
            // Account headers
            else if (trimmedLine.match(/^(CHECKING|SAVINGS|CREDIT)\s+ACCOUNT/)) {
                formattedHTML += `
                    <div style="
                        font-weight: 600;
                        color: #374151;
                        margin: 8px 0 4px 0;
                        background: #f9fafb;
                        padding: 3px 8px;
                    ">${trimmedLine}</div>`;
            }
            // Table header row
            else if (line.includes('Month Year') && line.includes('Deposits:') && line.includes('Revenue:')) {
                formattedHTML += `
                    <div style="
                        display: flex;
                        padding: 4px 0;
                        background: #f0f9ff;
                        border-bottom: 1px solid #3b82f6;
                        font-weight: 600;
                        margin-top: 2px;
                        font-size: 10px;
                    ">
                        <div style="width: 70px;">Month Year</div>
                        <div style="width: 130px; padding-left: 10px;">Deposits</div>
                        <div style="width: 130px;">Revenue</div>
                        <div style="width: 70px;">Neg Days</div>
                        <div style="width: 110px;">End Bal</div>
                        <div style="width: 50px;">#Dep</div>
                    </div>`;
            }
            // Monthly data rows
            else if (line.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/)) {
                const deposits = line.match(/Deposits:\s*(\$[\d,]+\.\d+)/)?.[1] || '';
                const revenue = line.match(/Revenue:\s*(\$[\d,]+\.\d+)/)?.[1] || '';
                const negDays = line.match(/Neg Days:\s*(\d+|N\/A)/)?.[1] || '';
                const endBal = line.match(/End Bal:\s*(-?\$[\d,]+\.\d+)/)?.[1] || '';
                const depCount = line.match(/#Dep:\s*(\d+)/)?.[1] || '';
                const monthYear = line.split(/\s{2,}/)[0] || '';

                formattedHTML += `
                    <div style="
                        display: flex;
                        padding: 2px 0;
                        border-bottom: 1px solid #f1f5f9;
                        background: ${endBal.startsWith('-') ? '#fef2f2' : 'white'};
                    ">
                        <div style="width: 70px; font-weight: 500;">${monthYear}</div>
                        <div style="width: 130px; padding-left: 10px; color: #059669;">${deposits}</div>
                        <div style="width: 130px; color: #059669;">${revenue}</div>
                        <div style="width: 70px; color: ${negDays !== '0' && negDays !== 'N/A' ? '#dc2626' : '#6b7280'};">
                            ${negDays}
                        </div>
                        <div style="width: 110px; color: ${endBal.startsWith('-') ? '#dc2626' : '#059669'}; font-weight: 500;">
                            ${endBal}
                        </div>
                        <div style="width: 50px; color: #6b7280;">${depCount}</div>
                    </div>`;
            }
            // True Revenue entries
            else if (line.match(/^(May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Jan|Feb|Mar|Apr)\s+\d{4}:\s*\$/)) {
                formattedHTML += `<div style="padding: 2px 0; margin-left: 10px;">${line}</div>`;
            }
            // Revenue deduction entries
            else if (line.match(/^\s*-\s*\$/)) {
                formattedHTML += `
                    <div style="
                        padding: 3px 12px;
                        margin: 2px 0;
                        background: #fef2f2;
                        border-left: 2px solid #ef4444;
                        font-size: 10px;
                        color: #dc2626;
                    ">${trimmedLine}</div>`;
            }
            // Month headers in deductions
            else if (line.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}:/)) {
                formattedHTML += `
                    <div style="
                        font-weight: 600;
                        color: #374151;
                        margin: 6px 0 3px 0;
                    ">${trimmedLine}</div>`;
            }
            // MCA Position entries
            else if (line.match(/^Position\s+\d+:/)) {
                formattedHTML += `
                    <div style="
                        padding: 4px 6px;
                        margin: 3px 0;
                        background: #f0f9ff;
                        border-left: 2px solid #3b82f6;
                    ">${line}</div>`;
            }
            // Sample dates
            else if (line.match(/^Sample dates:/)) {
                formattedHTML += `
                    <div style="
                        padding: 1px 6px 3px 18px;
                        color: #6b7280;
                        font-size: 10px;
                    ">${line}</div>`;
            }
            // Summary block
            else if (line.includes('-Month Summary')) {
                formattedHTML += `
                    <div style="
                        margin-top: 15px;
                        padding: 10px;
                        background: #f8fafc;
                        border: 1px solid #e2e8f0;
                        border-radius: 3px;
                    ">
                    <div style="
                        font-weight: bold;
                        color: #1e40af;
                        margin-bottom: 6px;
                        font-size: 12px;
                    ">${trimmedLine}</div>`;
            }
            // Summary items
            else if (line.match(/^- (Business Name|Position|Industry|Time in Business|Average|Negative Days|State|Positions|Last MCA):/)) {
                const [label, ...valueParts] = line.substring(2).split(':');
                const value = valueParts.join(':').trim();
                formattedHTML += `
                    <div style="
                        padding: 2px 0;
                        display: flex;
                        gap: 8px;
                    ">
                        <span style="font-weight: 500; color: #4b5563; min-width: 130px;">
                            ${label}:
                        </span>
                        <span style="color: #111827;">
                            ${value}
                        </span>
                    </div>`;
            }
            // Empty lines
            else if (trimmedLine === '') {
                if (index > 0 && lines[index - 1].trim()) {
                    formattedHTML += '<div style="height: 4px;"></div>';
                }
            }
            // All other content
            else {
                formattedHTML += `<div style="padding: 1px 0;">${line}</div>`;
            }
        });

        if (content.includes('-Month Summary')) {
            formattedHTML += '</div>';
        }

        formattedHTML += '</div>';
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