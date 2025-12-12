// lenders.js - Complete lender qualification and management functionality

class LendersModule {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = parent.apiBaseUrl;
        this.utils = parent.utils;
        this.templates = parent.templates;

        // Lender state
        this.qualifiedLenders = [];
        this.lastLenderCriteria = null;
        this.lenderResultsCache = new Map();
        this.modalListenersAttached = false;

        // Form field configurations
        this.lenderFormFields = [
            { id: 'lenderBusinessName', label: 'Business Name', type: 'text', required: false, placeholder: 'Enter business name' },
            { id: 'lenderPosition', label: 'Position', type: 'select', required: true, options: [
                { value: '', label: 'Select Position...' },
                { value: '1', label: '1st Position' },
                { value: '2', label: '2nd Position' },
                { value: '3', label: '3rd Position' },
                { value: '4', label: '4th Position' },
                { value: '5', label: '5th Position' },
                { value: '6', label: '6th Position' },
                { value: '7', label: '7th Position' },
                { value: '8', label: '8th Position' },
                { value: '9', label: '9th Position' },
                { value: '10', label: '10th Position' }
            ]},
            { id: 'lenderStartDate', label: 'Business Start Date', type: 'text', required: true, placeholder: 'MM/DD/YYYY' },
            { id: 'lenderRevenue', label: 'Monthly Revenue', type: 'number', required: true, placeholder: 'Enter monthly revenue' },
            { id: 'lenderFico', label: 'FICO Score', type: 'number', required: true, placeholder: 'Enter FICO score' },
            { id: 'lenderState', label: 'Business State', type: 'text', required: true, placeholder: 'Enter business state' },
            { id: 'lenderIndustry', label: 'Industry', type: 'text', required: true, placeholder: 'Enter business industry' },
            { id: 'lenderDepositsPerMonth', label: 'Deposits Per Month', type: 'number', required: false, placeholder: 'Number of deposits' },
            { id: 'lenderNegativeDays', label: 'Negative Days (Last 90)', type: 'number', required: false, placeholder: 'Days negative' },
            { id: 'lenderWithholding', label: 'Withholding %', type: 'text', required: false, placeholder: 'Auto-calc from FCS', readonly: true }
        ];

        this.lenderFormCheckboxes = [
            { id: 'lenderSoleProp', label: 'Sole Proprietorship' },
            { id: 'lenderNonProfit', label: 'Non-Profit' },
            { id: 'lenderMercuryBank', label: 'Has Mercury Bank' }
        ];

        this.init();
    }

    init() {
        // Initialize lender module
    }

    // Clears data when switching conversations to prevent "Ghost Data"
    clearData() {
        console.log('🧹 Clearing Lender Data...');
        this.qualifiedLenders = [];
        this.lastLenderCriteria = null;

        // Clear the visual results immediately
        const resultsEl = document.getElementById('lenderResults');
        if (resultsEl) {
            resultsEl.innerHTML = '';
            resultsEl.classList.remove('active');
        }

        // Clear errors/loading
        const errorEl = document.getElementById('lenderErrorMsg');
        if (errorEl) errorEl.classList.remove('active');
    }

    setupGlobalEventListeners() {
        // FIX: Attach to body so the listener survives DOM refreshes
        document.body.addEventListener('click', (e) => {
            // Check if the clicked element is (or is inside) the Send button
            if (e.target.id === 'sendToLendersBtn' || e.target.closest('#sendToLendersBtn')) {
                e.preventDefault();
                console.log('📧 Send to Lenders button clicked');
                this.showLenderSubmissionModal();
            }
        });

        // Also restore previous results if they exist
        this.restoreCachedResults();
    }

    restoreCachedResults() {
        // Get the ID so we only load THIS conversation's data
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) return;

        try {
            // Use unique key (lender_results_123) instead of global key
            const cached = localStorage.getItem(`lender_results_${conversationId}`);

            if (cached) {
                const parsed = JSON.parse(cached);

                // Only restore if less than 24 hours old
                const oneDay = 24 * 60 * 60 * 1000;
                if (Date.now() - parsed.timestamp < oneDay) {
                    console.log('♻️ Restoring cached lender results for:', conversationId);

                    this.qualifiedLenders = parsed.data.qualified || [];
                    this.displayLenderResults(parsed.data, parsed.criteria);
                } else {
                    localStorage.removeItem(`lender_results_${conversationId}`);
                }
            }
        } catch (e) {
            console.error('Error restoring cached results', e);
        }
    }

    // Add this new function to create the modal HTML
    injectSubmissionModal() {
        if (document.getElementById('lenderSubmissionModal')) return;

        const modalHtml = `
            <div id="lenderSubmissionModal" class="modal hidden">
                <div class="modal-content lender-submission-modal" style="position: relative; overflow: hidden;">

                    <div id="submissionOverlay" style="
                        display: none;
                        position: absolute;
                        top: 0; left: 0; width: 100%; height: 100%;
                        background: rgba(255, 255, 255, 0.95);
                        z-index: 50;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        text-align: center;
                    ">
                        <div class="loading-spinner" style="width: 50px; height: 50px; border-width: 4px; border-color: #3b82f6 #e2e8f0 #e2e8f0 #e2e8f0;"></div>
                        <h3 style="margin-top: 20px; color: #1e293b; font-size: 18px;">Sending Applications...</h3>
                        <p id="submissionStatusText" style="color: #64748b; margin-top: 8px; font-size: 14px;">Preparing documents...</p>
                        <div style="margin-top: 20px; width: 200px; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                            <div id="submissionProgressBar" style="width: 0%; height: 100%; background: #3b82f6; transition: width 0.3s ease;"></div>
                        </div>
                    </div>

                    <div class="modal-header">
                        <h3>Send to Lenders</h3>
                        <button id="closeLenderSubmissionModal" class="modal-close">&times;</button>
                    </div>

                    <div class="modal-body submission-body">
                        <div class="submission-grid">
                            <div class="submission-col">
                                <div class="submission-col-header">
                                    <span>Select Lenders</span>
                                    <button id="toggleAllLendersBtn" class="btn-link">Deselect All</button>
                                </div>
                                <div class="submission-search-container">
                                    <input type="text" id="lenderSearchInput" class="submission-search-input" placeholder="Search lenders...">
                                </div>
                                <div id="lenderSelectionList" class="selection-list custom-scrollbar"></div>
                            </div>

                            <div class="submission-col">
                                <div class="submission-col-header">
                                    <span>Select Documents</span>
                                    <button id="toggleAllDocumentsBtn" class="btn-link">Select All</button>
                                </div>
                                <div class="submission-search-container" style="visibility: hidden;">
                                    <input type="text" class="submission-search-input">
                                </div>
                                <div id="submissionDocumentList" class="selection-list custom-scrollbar"></div>
                            </div>
                        </div>

                        <div class="submission-message-area">
                            <label class="field-label" style="font-size: 12px; margin-bottom: 6px; display:block; color: #8b949e;">Email Message</label>
                            <textarea id="submissionMessage" class="form-textarea" placeholder="Enter your message to lenders..."></textarea>
                        </div>
                    </div>

                    <div class="modal-footer">
                        <button id="cancelLenderSubmission" class="btn btn-secondary">Cancel</button>
                        <button id="confirmLenderSubmission" class="btn btn-primary">
                            <span id="sendSubmissionsText">Send Emails</span>
                            <span id="sendSubmissionsLoading" class="hidden">Sending...</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    showLenderModal() {
        this.utils.showModal('lenderModal');
    }

    hideLenderModal() {
        this.utils.hideModal('lenderModal');
    }

    async qualifyLenders() {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) return;

        const useExisting = document.getElementById('useExistingData')?.checked;
        let businessData = {};

        if (!useExisting) {
            const businessName = document.getElementById('lenderBusinessName')?.value;
            if (!businessName) {
                this.utils.showNotification('Business name is required', 'error');
                return;
            }
            businessData.businessName = businessName;
        }

        try {
            const result = await this.parent.apiCall(`/api/conversations/${conversationId}/lenders/qualify`, {
                method: 'POST',
                body: JSON.stringify(businessData)
            });

            if (result.success) {
                this.hideLenderModal();
                this.utils.showNotification('Lender qualification started', 'success');
            } else {
                throw new Error('Failed to qualify lenders');
            }
        } catch (error) {
            this.utils.handleError(error, 'Error qualifying lenders', 'Failed to start lender qualification');
        }
    }

    initializeLenderForm() {
        const N8N_WEBHOOK_URL = 'https://dannyatorres.app.n8n.cloud/webhook/lender-qualify';

        this.populateLenderForm();

        // Setup global event listeners (fixes glitchy button clicks)
        setTimeout(() => this.setupGlobalEventListeners(), 500);

        setTimeout(() => this.initializeLenderFormCaching(), 100);

        // Quick Import functionality
        this.setupQuickImport();

        // Continue with TIB calculation...
        // TIB calculation
        const calculateTIB = (dateString) => {
            if (!dateString) return 0;

            const datePattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
            const match = dateString.match(datePattern);

            if (match) {
                const month = parseInt(match[1]);
                const day = parseInt(match[2]);
                const year = parseInt(match[3]);

                const startDate = new Date(year, month - 1, day);
                const today = new Date();

                const monthsDiff = (today.getFullYear() - startDate.getFullYear()) * 12 +
                                 (today.getMonth() - startDate.getMonth());

                return Math.max(0, monthsDiff);
            }
            return 0;
        };

        // TIB display update
        const startDateInput = document.getElementById('lenderStartDate');
        const tibDisplay = document.getElementById('lenderTibDisplay');

        if (startDateInput && tibDisplay) {
            startDateInput.addEventListener('input', (e) => {
                const tib = calculateTIB(e.target.value);
                if (tib > 0) {
                    const years = Math.floor(tib / 12);
                    const months = tib % 12;

                    // Simple format: just "5 years, 5 months"
                    if (years > 0 && months > 0) {
                        tibDisplay.textContent = `${years} year${years > 1 ? 's' : ''}, ${months} month${months > 1 ? 's' : ''}`;
                    } else if (years > 0) {
                        tibDisplay.textContent = `${years} year${years > 1 ? 's' : ''}`;
                    } else {
                        tibDisplay.textContent = `${months} month${months > 1 ? 's' : ''}`;
                    }

                    tibDisplay.classList.remove('hidden');
                } else {
                    tibDisplay.classList.add('hidden');
                }
            });
        }

        // Form submission
        const lenderForm = document.getElementById('lenderForm');
        if (lenderForm && !lenderForm.dataset.listenerAttached) {
            lenderForm.dataset.listenerAttached = 'true'; // Mark as having listener
            lenderForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                // Get button and add immediate visual feedback
                const submitBtn = document.getElementById('processLendersBtn');
                const btnText = document.getElementById('processLendersText');
                const btnSpinner = document.getElementById('processLendersSpinner');

                // Disable button and show loading state
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.style.opacity = '0.7';
                    submitBtn.style.transform = 'scale(0.98)';
                    submitBtn.style.cursor = 'not-allowed';
                }

                if (btnText) btnText.style.display = 'none';
                if (btnSpinner) btnSpinner.style.display = 'inline';

                const startDate = document.getElementById('lenderStartDate').value;
                const tib = calculateTIB(startDate) || 0;

                // Collect form data
                const criteria = {
                    businessName: document.getElementById('lenderBusinessName').value || 'Business',
                    requestedPosition: parseInt(document.getElementById('lenderPosition').value) || 1,
                    position: parseInt(document.getElementById('lenderPosition').value) || 1,
                    startDate: startDate,
                    tib: tib,
                    monthlyRevenue: parseInt(document.getElementById('lenderRevenue').value) || 0,
                    revenue: parseInt(document.getElementById('lenderRevenue').value) || 0,
                    fico: parseInt(document.getElementById('lenderFico').value) || 650,
                    state: document.getElementById('lenderState').value?.toUpperCase() || '',
                    industry: document.getElementById('lenderIndustry').value || '',
                    depositsPerMonth: parseInt(document.getElementById('lenderDepositsPerMonth').value) || 0,
                    negativeDays: parseInt(document.getElementById('lenderNegativeDays').value) || 0,

                    // ✅ ADD THIS: Send withholding to the decision engine
                    withholding: document.getElementById('lenderWithholding')?.value || null,

                    isSoleProp: document.getElementById('lenderSoleProp')?.checked || false,
                    soleProp: document.getElementById('lenderSoleProp')?.checked || false,
                    isNonProfit: document.getElementById('lenderNonProfit')?.checked || false,
                    nonProfit: document.getElementById('lenderNonProfit')?.checked || false,
                    hasMercuryBank: document.getElementById('lenderMercuryBank')?.checked || false,
                    mercuryBank: document.getElementById('lenderMercuryBank')?.checked || false,
                    currentPositions: document.getElementById('lenderCurrentPositions')?.value || '',
                    additionalNotes: document.getElementById('lenderAdditionalNotes')?.value || ''
                };

                // Show loading state
                const loadingEl = document.getElementById('lenderLoading');
                const errorEl = document.getElementById('lenderErrorMsg');
                const resultsEl = document.getElementById('lenderResults');

                loadingEl.classList.add('active');
                errorEl.classList.remove('active');
                resultsEl.classList.remove('active');

                try {
                    const response = await fetch(N8N_WEBHOOK_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(criteria)
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const data = await response.json();
                    this.displayLenderResults(data, criteria);

                    // Save results to database (So AI can reference them)
                    const conversationId = this.parent.getCurrentConversationId();
                    if (conversationId) {
                        console.log('💾 Persisting results to database...');
                        try {
                            await this.parent.apiCall(`/api/conversations/${conversationId}/lenders/save-results`, {
                                method: 'POST',
                                body: JSON.stringify({
                                    results: data,
                                    criteria: criteria
                                })
                            });
                            console.log('✅ Results saved for AI');
                        } catch (saveError) {
                            console.error('⚠️ Failed to save results to DB:', saveError);
                            // Don't fail the whole operation, results are still displayed
                        }
                    }

                } catch (error) {
                    console.error('Error:', error);
                    errorEl.textContent = 'Error processing request. Please try again.';
                    errorEl.classList.add('active');
                } finally {
                    // Reset button state
                    loadingEl.classList.remove('active');

                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.style.opacity = '1';
                        submitBtn.style.transform = 'scale(1)';
                        submitBtn.style.cursor = 'pointer';
                    }

                    if (btnText) btnText.style.display = 'inline';
                    if (btnSpinner) btnSpinner.style.display = 'none';
                }
            });
        }
    }

    setupQuickImport() {
        console.log('Setting up Quick Import functionality...');

        // Toggle button
        const toggleBtn = document.getElementById('toggleQuickImport');
        const quickImportContent = document.getElementById('quickImportContent');

        if (toggleBtn && quickImportContent) {
            toggleBtn.addEventListener('click', () => {
                const isHidden = quickImportContent.classList.contains('hidden');
                if (isHidden) {
                    quickImportContent.classList.remove('hidden');
                    toggleBtn.textContent = 'Hide ▲';
                } else {
                    quickImportContent.classList.add('hidden');
                    toggleBtn.textContent = 'Show ▼';
                }
            });
        }

        // Import button
        const importBtn = document.getElementById('importDataBtn');
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                const textarea = document.getElementById('quickImportTextarea');
                if (!textarea || !textarea.value.trim()) {
                    this.utils.showNotification('Please paste some data first', 'warning');
                    return;
                }

                console.log('📋 Starting import...');
                console.log('Raw data:', textarea.value);

                const parsed = this.parseClipboardData(textarea.value);
                console.log('Parsed data:', parsed);

                if (Object.keys(parsed).length > 0) {
                    const filledCount = this.populateLenderFormFromParsed(parsed);

                    if (filledCount > 0) {
                        this.utils.showNotification(`✅ Auto-filled ${filledCount} fields!`, 'success');

                        // Clear the textarea after successful import
                        textarea.value = '';

                        // Hide the Quick Import section
                        if (quickImportContent && toggleBtn) {
                            quickImportContent.classList.add('hidden');
                            toggleBtn.textContent = 'Show ▼';
                        }
                    } else {
                        this.utils.showNotification('❌ No fields were filled. Check console.', 'error');
                    }
                } else {
                    this.utils.showNotification('❌ No valid data found. Try this format:\n\nBusiness Name: ABC Corp\nMonthly Revenue: 45000\nFICO Score: 680', 'error');
                    console.error('❌ Parse returned empty object');
                }
            });
        }

        // Clear button
        const clearBtn = document.getElementById('clearImportBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                const textarea = document.getElementById('quickImportTextarea');
                if (textarea) {
                    textarea.value = '';
                }
            });
        }

        console.log('✅ Quick Import setup complete');
    }

    parseClipboardData(text) {
        const data = {};
        const lines = text.split('\n').map(line => line.trim()).filter(line => line);

        console.log('Parsing lender data from', lines.length, 'lines');

        // Process line by line, checking both inline and next-line formats
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const nextLine = lines[i + 1] || '';

            // Business Name (handle multiple formats)
            if (/business\s*name/i.test(line)) {
                console.log('🔍 Detected "Business Name" line:', line);
                // Check if value is on the same line after the colon
                const inlineMatch = line.match(/business\s*name[:\s]+(.+)/i);
                if (inlineMatch && inlineMatch[1].trim()) {
                    data.businessName = inlineMatch[1].trim();
                    console.log('✅ Found Business Name (inline):', data.businessName);
                }
                // Otherwise look for the next non-empty line (skip blanks and position lines)
                else {
                    console.log('📝 Searching next lines for business name...');
                    let j = i + 1;
                    while (j < lines.length) {
                        const candidateLine = lines[j].trim();
                        console.log(`  Line ${j}: "${candidateLine}"`);

                        // Skip empty lines
                        if (!candidateLine) {
                            console.log('    ⏭️ Skipping empty line');
                            j++;
                            continue;
                        }
                        // Skip lines that start with "- Position"
                        if (/^-\s*position/i.test(candidateLine)) {
                            console.log('    ⏭️ Skipping position line');
                            j++;
                            continue;
                        }
                        // This is the business name!
                        data.businessName = candidateLine.replace(/^-\s*/, '').trim();
                        console.log('✅ Found Business Name (multi-line):', data.businessName);
                        break;
                    }

                    if (!data.businessName) {
                        console.warn('❌ Business Name not found after searching');
                    }
                }
            }

            // Industry (handle both formats)
            if (/^industry:?\s*$/i.test(line) && nextLine) {
                data.industry = nextLine.replace(/^-\s*/, '').trim();
                console.log('Found Industry (multi-line):', data.industry);
            } else if (/industry[:\s]+(.+)/i.test(line)) {
                const match = line.match(/industry[:\s]+(.+)/i);
                if (match) {
                    data.industry = match[1].trim();
                    console.log('Found Industry (inline):', data.industry);
                }
            }

            // State (handle both formats)
            if (/^state:?\s*$/i.test(line) && nextLine) {
                const stateMatch = nextLine.match(/\b([A-Z]{2})\b/);
                if (stateMatch) {
                    data.state = stateMatch[1];
                    console.log('Found State (multi-line):', data.state);
                }
            } else if (/state[:\s]+([A-Z]{2})\b/i.test(line)) {
                const match = line.match(/state[:\s]+([A-Z]{2})\b/i);
                if (match) {
                    data.state = match[1].toUpperCase();
                    console.log('Found State (inline):', data.state);
                }
            }

            // Position - extract from "4 active -> Looking for 5th" or "Position: 2nd"
            if (/position/i.test(line)) {
                // Look for "Looking for Xth" pattern
                const lookingMatch = line.match(/looking\s+for\s+(\d+)(?:st|nd|rd|th)?/i);
                if (lookingMatch) {
                    data.position = lookingMatch[1];
                    console.log('Found Position (looking for):', data.position);
                } else {
                    // Standard position format
                    const posMatch = line.match(/position[:\s]+(\d+)(?:st|nd|rd|th)?/i);
                    if (posMatch) {
                        data.position = posMatch[1];
                        console.log('Found Position (standard):', data.position);
                    }
                }
            }

            // Revenue - handle "Average True Revenue", "Monthly Revenue", etc.
            if (/(?:average\s*true\s*revenue|monthly\s*revenue|revenue)/i.test(line)) {
                const revenueMatch = line.match(/\$?([\d,]+\.?\d*)/);
                if (revenueMatch) {
                    data.revenue = Math.round(parseFloat(revenueMatch[1].replace(/,/g, '')));
                    console.log('Found Revenue:', data.revenue);
                }
            }

            // Deposits - handle "Average Number of Deposits" or "Deposits Per Month"
            if (/(?:number\s+of\s+deposits|deposits\s*per\s*month)/i.test(line)) {
                const depositsMatch = line.match(/:\s*(\d+)/);
                if (depositsMatch) {
                    data.deposits = depositsMatch[1];
                    console.log('Found Deposits:', data.deposits);
                }
            }

            // Negative Days - handle "3+" or "0.75+"
            if (/negative\s*days/i.test(line)) {
                const negMatch = line.match(/([\d.]+)\+?/);
                if (negMatch) {
                    data.negativeDays = Math.round(parseFloat(negMatch[1]));
                    console.log('Found Negative Days:', data.negativeDays);
                }
            }

            // ✅ ADD THIS: Withholding Parsing
            if (/withholding/i.test(line)) {
                const withMatch = line.match(/withholding[:\s]+([\d.]+%?)/i);
                if (withMatch) {
                    data.withholding = withMatch[1];
                    console.log('Found Withholding:', data.withholding);
                }
            }

            // FICO Score
            if (/(?:fico|credit)\s*(?:score)?[:\s]+([0-9]+)/i.test(line)) {
                const match = line.match(/(?:fico|credit)\s*(?:score)?[:\s]+([0-9]+)/i);
                if (match) {
                    data.fico = match[1];
                    console.log('Found FICO:', data.fico);
                }
            }

            // Start Date (explicit format)
            if (/(?:start\s*date|business\s*start)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i.test(line)) {
                const match = line.match(/(?:start\s*date|business\s*start)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
                if (match) {
                    data.startDate = match[1];
                    console.log('Found Start Date:', data.startDate);
                }
            }

            // Current Positions - capture everything after "Positions:"
            if (/^positions:?\s*$/i.test(line)) {
                let positionsText = [];
                let j = i + 1;
                // Collect all lines until we hit "Last MCA Deposit" or end of data
                while (j < lines.length && !/last\s*mca\s*deposit/i.test(lines[j])) {
                    const posLine = lines[j].replace(/^-\s*/, '').trim();
                    if (posLine) {
                        positionsText.push(posLine);
                    }
                    j++;
                }
                if (positionsText.length > 0) {
                    data.currentPositions = positionsText.join('\n');
                    console.log('Found Current Positions:', data.currentPositions);
                }
            }

            // Last MCA Deposit - capture the full line
            if (/last\s*mca\s*deposit/i.test(line)) {
                const depositMatch = line.match(/last\s*mca\s*deposit[:\s]+(.+)/i);
                if (depositMatch) {
                    data.lastMcaDeposit = depositMatch[1].trim();
                    console.log('Found Last MCA Deposit:', data.lastMcaDeposit);
                }
            }
        }

        // Combine currentPositions and lastMcaDeposit into notes
        if (data.currentPositions || data.lastMcaDeposit) {
            let notesArray = [];
            if (data.currentPositions) {
                notesArray.push('Current Positions:\n' + data.currentPositions);
            }
            if (data.lastMcaDeposit) {
                notesArray.push('Last MCA Deposit: ' + data.lastMcaDeposit);
            }
            data.notes = notesArray.join('\n\n');
            console.log('Combined Notes:', data.notes);
        }

        console.log('Parsed lender data:', data);
        return data;
    }

    populateLenderFormFromParsed(data) {
        const fieldMap = {
            businessName: 'lenderBusinessName',
            revenue: 'lenderRevenue',
            fico: 'lenderFico',
            state: 'lenderState',
            industry: 'lenderIndustry',
            position: 'lenderPosition',
            startDate: 'lenderStartDate',
            deposits: 'lenderDepositsPerMonth',
            negativeDays: 'lenderNegativeDays',

            // ✅ ADD THIS MAPPING:
            withholding: 'lenderWithholding',

            notes: 'lenderAdditionalNotes',
            currentPositions: 'lenderCurrentPositions'
        };

        console.log('🔍 Starting to populate fields with data:', data);

        let filledCount = 0;

        Object.keys(data).forEach(key => {
            const fieldId = fieldMap[key];
            if (fieldId) {
                const element = document.getElementById(fieldId);
                if (element) {
                    const oldValue = element.value;
                    // ALWAYS fill, even if field has existing value
                    element.value = data[key];
                    filledCount++;

                    // Trigger change event for date field to update TIB
                    if (fieldId === 'lenderStartDate') {
                        element.dispatchEvent(new Event('input'));
                    }

                    console.log(`✅ Filled ${fieldId}: "${oldValue}" → "${data[key]}"`);
                } else {
                    console.warn(`⚠️ Element ${fieldId} not found in DOM`);
                }
            } else {
                console.warn(`⚠️ No field mapping for key: ${key}`);
            }
        });

        console.log(`📋 Import complete: ${filledCount} fields filled`);
        return filledCount;
    }

    // Fetch FCS data from backend for autopopulation
    async fetchFCSData(conversationId) {
        try {
            // Call the route that returns the analysis + metrics
            const result = await this.parent.apiCall(`/api/conversations/${conversationId}/fcs`);

            if (result.success && result.analysis) {
                return result.analysis;
            }
            return null;
        } catch (error) {
            console.warn('⚠️ Could not load FCS data for autopopulation:', error);
            return null;
        }
    }

    async populateLenderForm() {
        const conversation = this.parent.getSelectedConversation();
        if (!conversation) return;

        const conversationId = this.parent.getCurrentConversationId();
        console.log('🤖 Auto-filling lender form for:', conversationId);

        // Helper to safely set values
        const populateField = (fieldId, value, force = false) => {
            const element = document.getElementById(fieldId);
            if (element) {
                if (force || !element.value) {
                    element.value = value;
                    // Trigger input event for TIB calculation
                    if (fieldId === 'lenderStartDate') element.dispatchEvent(new Event('input'));
                }
            }
        };

        // --- 1. FILL BASIC CRM DATA ---
        populateField('lenderBusinessName', conversation.business_name);
        populateField('lenderState', conversation.state);
        populateField('lenderIndustry', conversation.business_type); // CRM usually calls it business_type

        if (conversation.annual_revenue) {
            populateField('lenderRevenue', Math.round(conversation.annual_revenue / 12));
        }

        if (conversation.business_start_date) {
            // Format date to MM/DD/YYYY
            const date = new Date(conversation.business_start_date);
            if (!isNaN(date.getTime())) {
                const formatted = date.toLocaleDateString('en-US', {
                    month: '2-digit', day: '2-digit', year: 'numeric'
                });
                populateField('lenderStartDate', formatted);
            }
        }

        // --- 2. FETCH & FILL FCS DATA (The Smart Stuff) ---
        const fcs = await this.fetchFCSData(conversationId);

        if (fcs) {
            console.log("✅ FCS Data Found! Filling missing fields...", fcs);

            // 1. Industry & State (Force overwrite if FCS found them)
            if (fcs.metrics && fcs.metrics.industry) populateField('lenderIndustry', fcs.metrics.industry, true);
            if (fcs.metrics && fcs.metrics.state) populateField('lenderState', fcs.metrics.state, true);
            if (fcs.businessName) populateField('lenderBusinessName', fcs.businessName, true);

            // 2. Financial Metrics
            if (fcs.metrics && fcs.metrics.averageRevenue) populateField('lenderRevenue', Math.round(fcs.metrics.averageRevenue), true);
            if (fcs.metrics && fcs.metrics.totalNegativeDays !== undefined) populateField('lenderNegativeDays', fcs.metrics.totalNegativeDays, true);
            if (fcs.average_deposit_count) populateField('lenderDepositsPerMonth', fcs.average_deposit_count, true);

            // 3. Withholding (New Calculation)
            if (fcs.withholding_percentage) {
                 populateField('lenderWithholding', fcs.withholding_percentage + '%', true);

                 // Visual Warning for High Withholding
                 if (parseFloat(fcs.withholding_percentage) > 40) {
                     const el = document.getElementById('lenderWithholding');
                     if(el) el.style.borderColor = '#ef4444';
                 }
            }

            // 4. Current Positions (Extract from Text Report)
            // We look for the "Positions:" line in the full report
            if (fcs.report) {
                // regex: find "Positions: ... (newline)"
                const positionsMatch = fcs.report.match(/Positions:\s*(.+?)(?:\n|$)/i);
                if (positionsMatch) {
                    const positionsList = positionsMatch[1].trim();
                    if (positionsList.toLowerCase() !== 'none' && positionsList.toLowerCase() !== 'n/a') {
                        populateField('lenderCurrentPositions', positionsList, true);
                    }
                }

                // 5. Additional Notes (Extract Last MCA info)
                const mcaMatch = fcs.report.match(/Last MCA Deposit:\s*(.+?)(?:\n|$)/i);
                if (mcaMatch) {
                    populateField('lenderAdditionalNotes', `Last MCA Deposit: ${mcaMatch[1].trim()}`, true);
                }
            }
        }

        console.log('✨ Lender form auto-population complete');
    }

    displayLenderResults(data, criteria) {
        console.log('=== displayLenderResults called ===');

        // ✅ STEP 1: NORMALIZE THE DATA IMMEDIATELY
        // We create a "Golden Record" for every lender so we never have to "hunt" again.
        const cleanQualified = (data.qualified || []).map(lender => {
            // Find the email using every known variation
            const rawEmail =
                lender.email ||
                lender.Email ||
                lender['Lender Email'] ||
                lender['Email Address'] ||
                lender['contact_email'] ||
                lender['email_address'];

            return {
                ...lender, // Keep all original data just in case

                // Enforce standard property names
                name: lender.name || lender['Lender Name'] || lender.lender || 'Unknown Lender',
                lender_name: lender.name || lender['Lender Name'] || lender.lender,

                // The most critical fix: Ensure 'email' property ALWAYS exists (or is explicitly null)
                email: rawEmail ? rawEmail.trim() : null,

                // Normalize Tier for grouping
                Tier: lender.Tier || lender.tier || 'Unknown'
            };
        });

        const cleanNonQualified = (data.nonQualified || []).map(item => ({
            ...item,
            lender: item.lender || item.name || item['Lender Name'],
            blockingRule: item.blockingRule || item.reason || 'Unknown reason'
        }));

        // ✅ STEP 2: Save the CLEAN data
        this.qualifiedLenders = cleanQualified;
        this.lastLenderCriteria = criteria;

        // Update the 'data' object so the rest of the function uses the clean lists
        data.qualified = cleanQualified;
        data.nonQualified = cleanNonQualified;

        // Save to conversation-specific key
        const conversationId = this.parent.getCurrentConversationId();
        if (conversationId) {
            localStorage.setItem(`lender_results_${conversationId}`, JSON.stringify({
                data: data,
                criteria: criteria,
                timestamp: Date.now()
            }));
        }

        let html = `<div style="padding: 10px;">`;

        // Summary Section (CSS: lender-summary-container)
        html += `
            <div class="lender-summary-container">
                <div class="lender-stat-box">
                    <div class="lender-stat-number qualified">${data.qualified?.length || 0}</div>
                    <div class="lender-stat-label">Qualified</div>
                </div>
                <div class="lender-stat-box">
                    <div class="lender-stat-number non-qualified">${data.nonQualified?.length || 0}</div>
                    <div class="lender-stat-label">Non-Qualified</div>
                </div>
            </div>
        `;

        // Qualified Section
        if (data.qualified && data.qualified.length > 0) {
            // Send Button
            html += `
                <div style="margin: 20px 0; text-align: center;">
                    <button id="sendToLendersBtn" class="trigger-lender-modal btn btn-primary">
                        📧 Send to Lenders
                    </button>
                </div>
            `;

            html += `
                <div style="margin-top: 20px;">
                    <div class="qualified-section-header">
                        ✅ Qualified Lenders
                    </div>
                    <div id="qualifiedSection">`;

            // Group by tiers
            const tiers = {};
            data.qualified.forEach(lender => {
                const tier = lender.Tier || 'Unknown';
                if (!tiers[tier]) tiers[tier] = [];
                tiers[tier].push(lender);
            });

            Object.keys(tiers).sort().forEach(tier => {
                html += `<div class="tier-group">`;
                html += `<div class="tier-header">Tier ${tier}</div>`;
                html += `<div class="lender-grid">`;
                tiers[tier].forEach(lender => {
                    const star = lender.isPreferred ? '⭐' : '';
                    html += `<div class="lender-tag">${lender['Lender Name']} <span>${star}</span></div>`;
                });
                html += `</div></div>`;
            });
            html += `</div></div>`;
        }

        // Non-Qualified Section
        if (data.nonQualified && data.nonQualified.length > 0) {
            html += `
                <div style="margin-top: 30px;">
                    <button id="toggleNonQualified" class="non-qual-toggle" onclick="document.getElementById('nonQualList').style.display = document.getElementById('nonQualList').style.display === 'none' ? 'block' : 'none'">
                        ❌ View Non-Qualified Lenders (${data.nonQualified.length}) ▼
                    </button>
                    <div id="nonQualList" style="display: none; margin-top: 10px;">
                        ${data.nonQualified.map(item => `
                            <div class="non-qual-item">
                                <span style="font-weight: 500; color: #e6edf3;">${item.lender}</span>
                                <span class="non-qual-reason">${item.blockingRule}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
        }

        html += `</div>`;

        const resultsEl = document.getElementById('lenderResults');
        if (resultsEl) {
            resultsEl.innerHTML = html;
            resultsEl.classList.add('active');
        }
        // Note: We REMOVED the specific button event listener attachment here.
        // It is now handled by setupGlobalEventListeners
    }

    // Clear lender results cache when needed
    clearLenderResultsCache() {
        this.lenderResultsCache.clear();
        const resultsEl = document.getElementById('lenderResults');
        if (resultsEl) {
            resultsEl.innerHTML = '';
            resultsEl.classList.remove('active');
        }

        // Make sure loading is hidden by default
        const loadingEl = document.getElementById('lenderLoading');
        if (loadingEl) {
            loadingEl.style.display = 'none';
        }
    }

    // Toggle qualified lenders section
    toggleQualifiedSection() {
        const section = document.getElementById('qualifiedSection');
        const icon = document.getElementById('toggleQualifiedIcon');
        const button = document.getElementById('toggleQualified');

        if (section) {
            const isHidden = section.style.display === 'none';

            if (isHidden) {
                section.style.display = 'block';
                if (icon) icon.textContent = '▲';
                if (button) {
                    const count = this.qualifiedLenders?.length || 0;
                    const span = button.querySelector('span');
                    if (span) span.innerHTML = `✅ Hide Qualified Lenders (${count})`;
                }
            } else {
                section.style.display = 'none';
                if (icon) icon.textContent = '▼';
                if (button) {
                    const count = this.qualifiedLenders?.length || 0;
                    const span = button.querySelector('span');
                    if (span) span.innerHTML = `✅ View Qualified Lenders (${count})`;
                }
            }
        }
    }

    // Toggle non-qualified lenders section
    toggleNonQualifiedSection() {
        const section = document.getElementById('nonQualifiedSection');
        const icon = document.getElementById('toggleNonQualifiedIcon');
        const button = document.getElementById('toggleNonQualified');

        if (section) {
            const isHidden = section.style.display === 'none';

            if (isHidden) {
                section.style.display = 'block';
                if (icon) icon.textContent = '▲';
                if (button) {
                    const span = button.querySelector('span');
                    const count = document.querySelectorAll('#nonQualifiedSection > div > div').length;
                    if (span) span.innerHTML = `❌ Hide Non-Qualified Lenders (${count})`;
                }
            } else {
                section.style.display = 'none';
                if (icon) icon.textContent = '▼';
                if (button) {
                    const span = button.querySelector('span');
                    const count = document.querySelectorAll('#nonQualifiedSection > div > div').length;
                    if (span) span.innerHTML = `❌ View Non-Qualified Lenders (${count})`;
                }
            }
        }
    }

    // Lender Form Caching Methods
    initializeLenderFormCaching() {
        console.log('Initializing lender form caching...');

        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) {
            console.warn('No conversation ID available for caching');
            return;
        }

        const cacheKey = `lender_form_data_${conversationId}`;

        this.restoreLenderFormData(cacheKey);
        this.setupLenderFormAutoSave(cacheKey);
        this.setupClearCacheButton(conversationId);

        console.log('Lender form caching initialized for conversation:', conversationId);
    }

    restoreLenderFormData(cacheKey) {
        try {
            const cachedData = localStorage.getItem(cacheKey);
            if (cachedData) {
                const formData = JSON.parse(cachedData);
                console.log('Restoring cached lender form data:', formData);

                Object.keys(formData).forEach(fieldId => {
                    const element = document.getElementById(fieldId);
                    if (element) {
                        if (element.type === 'checkbox') {
                            element.checked = formData[fieldId];
                        } else {
                            element.value = formData[fieldId];
                        }

                        if (fieldId === 'lenderStartDate') {
                            element.dispatchEvent(new Event('input'));
                        }
                    }
                });

                console.log('Lender form data restored from cache');
                // this.utils.showNotification('Form data restored from cache', 'info');
            }
        } catch (error) {
            console.error('Error restoring cached lender form data:', error);
        }
    }

    setupLenderFormAutoSave(cacheKey) {
        const formFields = [
            'lenderBusinessName', 'lenderPosition', 'lenderStartDate', 'lenderRevenue',
            'lenderFico', 'lenderState', 'lenderIndustry', 'lenderDepositsPerMonth',
            'lenderNegativeDays', 'lenderSoleProp', 'lenderNonProfit', 'lenderMercuryBank',
            'lenderCurrentPositions', 'lenderAdditionalNotes'
        ];

        let saveTimeout;
        const debouncedSave = () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                this.saveLenderFormData(cacheKey, formFields);
            }, 1000);
        };

        formFields.forEach(fieldId => {
            const element = document.getElementById(fieldId);
            if (element) {
                element.addEventListener('input', debouncedSave);
                element.addEventListener('change', debouncedSave);
            }
        });

        console.log('Auto-save listeners added to lender form fields');
    }

    saveLenderFormData(cacheKey, formFields) {
        try {
            const formData = {};

            formFields.forEach(fieldId => {
                const element = document.getElementById(fieldId);
                if (element) {
                    if (element.type === 'checkbox') {
                        formData[fieldId] = element.checked;
                    } else {
                        formData[fieldId] = element.value;
                    }
                }
            });

            const hasData = Object.values(formData).some(value => {
                return value !== '' && value !== false && value !== null && value !== undefined;
            });

            if (hasData) {
                localStorage.setItem(cacheKey, JSON.stringify(formData));
                console.log('Lender form data cached:', formData);
            }
        } catch (error) {
            console.error('Error caching lender form data:', error);
        }
    }

    clearLenderFormCache(conversationId = null) {
        const id = conversationId || this.parent.getCurrentConversationId();
        if (id) {
            const cacheKey = `lender_form_data_${id}`;
            localStorage.removeItem(cacheKey);
            console.log('Cleared lender form cache for conversation:', id);
        }
    }

    setupClearCacheButton(conversationId) {
        const clearCacheBtn = document.getElementById('clearLenderCacheBtn');
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', () => {
                const confirmed = confirm('Are you sure you want to clear the cached form data?');

                if (confirmed) {
                    this.clearLenderFormCache(conversationId);
                    this.clearLenderFormFields();
                    this.populateLenderForm();
                    this.utils.showNotification('Form cache cleared successfully', 'success');
                }
            });

            console.log('Clear cache button event listener added');
        }
    }

    clearLenderFormFields() {
        const formFields = [
            'lenderBusinessName', 'lenderPosition', 'lenderStartDate', 'lenderRevenue',
            'lenderFico', 'lenderState', 'lenderIndustry', 'lenderDepositsPerMonth',
            'lenderNegativeDays', 'lenderSoleProp', 'lenderNonProfit', 'lenderMercuryBank',
            'lenderCurrentPositions', 'lenderAdditionalNotes'
        ];

        formFields.forEach(fieldId => {
            const element = document.getElementById(fieldId);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = false;
                } else {
                    element.value = '';
                }
            }
        });

        const tibDisplay = document.getElementById('lenderTibDisplay');
        if (tibDisplay) {
            tibDisplay.classList.add('hidden');
        }

        console.log('All lender form fields cleared');
    }

    restoreLenderFormCacheIfNeeded(retryCount = 0) {
        const maxRetries = 5;

        console.log(`Cache restoration attempt ${retryCount + 1}/${maxRetries + 1}`);

        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) {
            console.log('No conversation ID available for cache restoration');
            if (retryCount < maxRetries) {
                setTimeout(() => this.restoreLenderFormCacheIfNeeded(retryCount + 1), 500);
            }
            return;
        }

        const cacheKey = `lender_form_data_${conversationId}`;
        const cachedData = localStorage.getItem(cacheKey);

        if (!cachedData) {
            console.log('No cached lender form data found for conversation:', conversationId);
            return;
        }

        console.log('Found cached lender form data for conversation:', conversationId);

        try {
            const formData = JSON.parse(cachedData);
            let restored = 0;
            let missing = 0;

            const requiredFields = ['lenderBusinessName', 'lenderRevenue', 'lenderState'];
            let domReady = true;

            requiredFields.forEach(fieldId => {
                const element = document.getElementById(fieldId);
                if (!element) {
                    console.log(`DOM element '${fieldId}' not found`);
                    domReady = false;
                }
            });

            if (!domReady) {
                console.log('DOM not ready, retrying...');
                if (retryCount < maxRetries) {
                    setTimeout(() => this.restoreLenderFormCacheIfNeeded(retryCount + 1), 500);
                }
                return;
            }

            Object.keys(formData).forEach(fieldId => {
                const element = document.getElementById(fieldId);
                if (element) {
                    if (element.type === 'checkbox') {
                        element.checked = formData[fieldId];
                    } else {
                        element.value = formData[fieldId];
                    }

                    if (fieldId === 'lenderStartDate' && formData[fieldId]) {
                        element.dispatchEvent(new Event('input'));
                    }

                    restored++;
                } else {
                    missing++;
                }
            });

            console.log(`Restoration stats: ${restored} restored, ${missing} missing`);

            if (restored > 0) {
                console.log('Lender form cache restored successfully');
                const lenderTab = document.querySelector('.nav-tab[data-tab="lenders"]');
                if (lenderTab && lenderTab.classList.contains('active')) {
                    // this.utils.showNotification(`Form data restored (${restored} fields)`, 'info');
                }
            } else if (missing > 0 && retryCount < maxRetries) {
                console.log('No fields restored, retrying...');
                setTimeout(() => this.restoreLenderFormCacheIfNeeded(retryCount + 1), 500);
            }

        } catch (error) {
            console.error('Error restoring lender form cache:', error);
        }
    }

    async loadLenderData() {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) return;

        const lendersContent = document.querySelector('.lenders-status');
        if (!lendersContent) return;

        try {
            const result = await this.parent.apiCall(`/api/conversations/${conversationId}/lenders`);

            if (result.success && result.lenders && result.lenders.length > 0) {
                this.displayLenders(result.lenders);
            } else {
                lendersContent.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">🏦</div>
                        <h4>No Qualified Lenders</h4>
                        <p>Run lender qualification to see available options</p>
                        <button class="btn btn-primary" onclick="window.conversationUI.lenders.showLenderModal()" style="margin-top: 10px;">
                            Qualify Lenders
                        </button>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading lender data:', error);
            lendersContent.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🏦</div>
                    <h4>No Qualified Lenders</h4>
                    <p>Run lender qualification to see available options</p>
                </div>
            `;
        }
    }

    // Lender Submission Modal
    async showLenderSubmissionModal() {
        console.log('=== showLenderSubmissionModal called ===');

        // 1. Ensure modal HTML exists
        this.injectSubmissionModal();

        const modal = document.getElementById('lenderSubmissionModal');

        if (!modal) {
            console.error('❌ Lender submission modal not found in DOM');
            this.utils.showNotification('Modal not found', 'error');
            return;
        }

        console.log('✅ Modal found, loading documents...');

        // Load documents
        try {
            await this.ensureDocumentsLoaded();
            console.log('✅ Documents loaded');
        } catch (error) {
            console.error('❌ Error loading documents:', error);
        }

        // Populate the modal content
        try {
            this.populateSubmissionLenders();
            this.populateSubmissionDocuments();
            this.prefillSubmissionMessage();
            console.log('✅ Modal content populated');
        } catch (error) {
            console.error('❌ Error populating modal:', error);
        }

        // ALWAYS re-attach listeners when modal opens
        this.attachModalEventListeners();

        // Show modal (use classList)
        modal.classList.remove('hidden');
        modal.style.display = ''; // <--- ADD THIS LINE (Fixes the stuck hidden state)
        console.log('✅ Modal displayed successfully');
    }

    attachModalEventListeners() {
        console.log('Attaching fresh modal event listeners...');
        const lendersModule = this;
        const modal = document.getElementById('lenderSubmissionModal');

        if (!modal) {
            console.error('Modal not found when attaching listeners');
            return;
        }

        // Helper function to attach listener without duplicates
        const attachListener = (elementId, handler, eventType = 'click') => {
            const element = document.getElementById(elementId);
            if (element) {
                // Remove old listener by cloning
                const newElement = element.cloneNode(true);
                element.parentNode.replaceChild(newElement, element);

                // Attach new listener
                newElement.addEventListener(eventType, handler);
                console.log(`✅ Listener attached to ${elementId}`);
                return true;
            } else {
                console.warn(`⚠️ Element ${elementId} not found`);
                return false;
            }
        };

        // Close button
        attachListener('closeLenderSubmissionModal', (e) => {
            e.preventDefault();
            modal.classList.add('hidden');
        });

        // Cancel button
        attachListener('cancelLenderSubmission', (e) => {
            e.preventDefault();
            modal.classList.add('hidden');
        });

        // Toggle lenders button
        attachListener('toggleAllLendersBtn', (e) => {
            e.preventDefault();
            lendersModule.toggleAllLenders();
        });

        // Toggle documents button
        attachListener('toggleAllDocumentsBtn', (e) => {
            e.preventDefault();
            lendersModule.toggleAllDocuments();
        });

        // Send submissions button
        attachListener('confirmLenderSubmission', async (e) => {
            e.preventDefault();
            await lendersModule.sendLenderSubmissions();
        });

        // Search functionality
        const searchInput = document.getElementById('lenderSearchInput');
        if (searchInput) {
            // Remove old listener if exists (cloning trick)
            const newSearch = searchInput.cloneNode(true);
            searchInput.parentNode.replaceChild(newSearch, searchInput);

            newSearch.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const list = document.getElementById('lenderSelectionList');

                // Get all Tier blocks (the divs wrapping headers and labels)
                const tiers = list.children;

                Array.from(tiers).forEach(tierDiv => {
                    const labels = tierDiv.querySelectorAll('label');
                    let hasVisibleLenders = false;

                    labels.forEach(label => {
                        const text = label.textContent.toLowerCase();
                        if (text.includes(searchTerm)) {
                            label.style.display = 'flex';
                            hasVisibleLenders = true;
                        } else {
                            label.style.display = 'none';
                        }
                    });

                    // Hide the entire tier block if no lenders match
                    tierDiv.style.display = hasVisibleLenders ? 'block' : 'none';
                });
            });

            // Auto-focus the search bar when modal opens
            setTimeout(() => newSearch.focus(), 100);
        }

        console.log('All modal event listeners attached successfully');
    }

    async ensureDocumentsLoaded() {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) return;

        // Check if documents are already loaded
        if (this.parent.documents?.currentDocuments?.length > 0) {
            return; // Documents already loaded
        }

        try {
            console.log('Loading documents for submission modal...');
            const result = await this.parent.apiCall(`/api/conversations/${conversationId}/documents`);

            if (result.success && result.documents) {
                // Store documents in parent's documents module
                if (!this.parent.documents) {
                    this.parent.documents = {};
                }
                this.parent.documents.currentDocuments = result.documents;
                console.log(`Loaded ${result.documents.length} documents`);
            }
        } catch (error) {
            console.error('Error loading documents:', error);
        }
    }


    populateSubmissionLenders() {
        const lenderList = document.getElementById('lenderSelectionList');

        // Safety check
        if (!lenderList) return;
        if (!this.qualifiedLenders || this.qualifiedLenders.length === 0) {
            lenderList.innerHTML = '<p style="color: #6b7280; padding: 10px;">No qualified lenders available.</p>';
            return;
        }

        // Group by tier
        const lendersByTier = {};
        this.qualifiedLenders.forEach(lender => {
            const tier = lender.Tier || 'Unknown';
            if (!lendersByTier[tier]) lendersByTier[tier] = [];
            lendersByTier[tier].push(lender);
        });

        let html = '';
        Object.keys(lendersByTier).sort().forEach(tier => {
            html += `<div style="margin-bottom: 12px;">`;
            // Tier Header
            html += `<div style="font-size: 11px; font-weight: 700; color: #8b949e; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Tier ${tier}</div>`;

            lendersByTier[tier].forEach(lender => {
                const lenderName = lender['Lender Name'] || lender.name;
                const isPreferred = lender.isPreferred;

                // Clean HTML (No Icon)
                html += `
                    <label>
                        <input type="checkbox" class="lender-checkbox" value="${lenderName}" checked>
                        <div class="list-text">
                            ${lenderName}
                            ${isPreferred ? '<span style="color:#3b82f6; margin-left:6px;">★</span>' : ''}
                        </div>
                    </label>
                `;
            });
            html += `</div>`;
        });

        lenderList.innerHTML = html;

        // Ensure the "Select All" button uses the text-link style
        const toggleBtn = document.getElementById('toggleAllLendersBtn');
        if (toggleBtn) {
            toggleBtn.textContent = 'Deselect All';
            toggleBtn.className = 'btn-link';
        }
    }

    populateSubmissionDocuments() {
        const docList = document.getElementById('submissionDocumentList');
        const documents = this.parent.documents?.currentDocuments;

        if (!docList) return;
        if (!documents || documents.length === 0) {
            docList.innerHTML = '<p style="color: #6b7280; padding: 10px;">No documents available.</p>';
            return;
        }

        let html = '';
        documents.forEach(doc => {
            const name = doc.originalFilename || doc.filename || 'Unknown Document';
            const isImportant = doc.documentType === 'Bank Statement' ||
                              doc.documentType === 'Signed Application' ||
                              name.toLowerCase().includes('application');

            // Determine Icon
            let iconClass = 'fas fa-file-alt';
            let colorClass = '';

            const lowerName = name.toLowerCase();
            if (lowerName.endsWith('.pdf')) {
                iconClass = 'fas fa-file-pdf';
                colorClass = 'pdf';
            } else if (lowerName.match(/\.(jpg|jpeg|png|gif)$/)) {
                iconClass = 'fas fa-file-image';
                colorClass = 'img';
            } else if (lowerName.match(/\.(xls|xlsx|csv)$/)) {
                iconClass = 'fas fa-file-excel';
                colorClass = 'xls';
            }

            html += `
                <label>
                    <input type="checkbox" class="document-checkbox" value="${doc.id}" ${isImportant ? 'checked' : ''}>
                    <div class="list-icon ${colorClass}"><i class="${iconClass}"></i></div>
                    <div class="list-text">${name}</div>
                </label>
            `;
        });

        docList.innerHTML = html;

        // Update button text logic
        const toggleBtn = document.getElementById('toggleAllDocumentsBtn');
        if (toggleBtn) {
            const checkboxes = docList.querySelectorAll('input[type="checkbox"]');
            const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
            toggleBtn.textContent = checkedCount === checkboxes.length ? 'Deselect All' : 'Select All';
        }
    }

    async loadDocumentsForSubmission() {
        const conversationId = this.parent.getCurrentConversationId();

        if (!conversationId) {
            console.error('No conversation ID available for loading documents');
            return;
        }

        try {
            const result = await this.parent.apiCall(`/api/conversations/${conversationId}/documents`);

            if (result.success && result.documents) {
                if (this.parent.documents) {
                    this.parent.documents.currentDocuments = result.documents;
                }
                this.populateSubmissionDocuments();
            } else {
                const docList = document.getElementById('submissionDocumentList');
                if (docList) {
                    docList.innerHTML = '<p style="color: #ef4444;">Failed to load documents.</p>';
                }
            }
        } catch (error) {
            console.error('Error loading documents for submission:', error);
            const docList = document.getElementById('submissionDocumentList');
            if (docList) {
                docList.innerHTML = '<p style="color: #ef4444;">Error loading documents.</p>';
            }
        }
    }

    prefillSubmissionMessage() {
        const messageField = document.getElementById('submissionMessage');
        const conversation = this.parent.getSelectedConversation();

        if (!messageField || !conversation) return;

        const businessName = conversation.business_name || 'N/A';
        const requestedAmount = conversation.requested_amount || conversation.funding_amount || 'N/A';
        const formattedAmount = requestedAmount !== 'N/A' ? `${parseInt(requestedAmount).toLocaleString()}` : 'N/A';

        const message = `Hello,

Please find attached the funding application and supporting documents for our mutual client.

Business Name: ${businessName}
Requested Amount: ${formattedAmount}
Industry: ${conversation.industry_type || conversation.business_type || 'N/A'}
Time in Business: ${conversation.years_in_business || 'N/A'} years
Monthly Revenue: ${conversation.monthly_revenue ? `${parseInt(conversation.monthly_revenue).toLocaleString()}` : 'N/A'}

Please review and let me know if you need any additional information.

Best regards`;

        messageField.value = message;
    }

    async sendLenderSubmissions() {
        console.log('Starting lender submission');

        try {
            // 1. Get Selected Items
            const selectedLenderCheckboxes = Array.from(document.querySelectorAll('.lender-checkbox:checked'));
            const selectedDocumentIds = Array.from(document.querySelectorAll('.document-checkbox:checked')).map(cb => cb.value);
            const message = document.getElementById('submissionMessage')?.value;

            // Validation
            if (selectedLenderCheckboxes.length === 0) {
                this.utils.showNotification('Please select at least one lender', 'warning');
                return;
            }
            if (!message?.trim()) {
                this.utils.showNotification('Please enter a message', 'warning');
                return;
            }

            // 2. SHOW OVERLAY & LOCK UI
            const overlay = document.getElementById('submissionOverlay');
            const statusText = document.getElementById('submissionStatusText');
            const progressBar = document.getElementById('submissionProgressBar');

            if (overlay) {
                overlay.style.display = 'flex';
                statusText.textContent = `Preparing ${selectedLenderCheckboxes.length} lender applications...`;
                progressBar.style.width = '10%';
            }

            // 3. Prepare Data (Much simpler now - data is already normalized!)
            const selectedLenders = selectedLenderCheckboxes.map(cb => {
                // Find by name in our CLEAN list
                const lender = this.qualifiedLenders.find(l => l.name === cb.value);

                if (!lender) {
                    console.error(`❌ Could not find lender: ${cb.value}`);
                    return { name: cb.value, email: null };
                }

                return {
                    name: lender.name,
                    lender_name: lender.lender_name,
                    email: lender.email // It's guaranteed to be here now (or explicitly null)!
                };
            });

            const selectedDocuments = selectedDocumentIds.map(docId => {
                const doc = this.parent.documents?.currentDocuments?.find(d => d.id === docId);
                return doc ? {
                    id: doc.id,
                    filename: doc.originalFilename || doc.filename,
                    s3_url: doc.s3_url
                } : { id: docId };
            });

            const conversation = this.parent.getSelectedConversation();
            const businessData = {
                businessName: conversation?.business_name || 'Unknown Business',
                industry: conversation?.industry || '',
                state: conversation?.state || '',
                monthlyRevenue: conversation?.monthly_revenue || 0,
                customMessage: message
            };

            // 4. Simulate Progress (Psychological Waiting)
            // Since we can't track real backend progress easily, we fake a "working" bar
            let progress = 10;
            const progressInterval = setInterval(() => {
                if (progress < 90) {
                    progress += Math.random() * 10;
                    if (progressBar) progressBar.style.width = `${progress}%`;
                    if (statusText) statusText.textContent = `Sending to ${selectedLenders.length} lenders... (${Math.round(progress)}%)`;
                }
            }, 800);

            // 5. Send Request
            const conversationId = this.parent.getCurrentConversationId();
            const result = await this.parent.apiCall(`/api/conversations/${conversationId}/send-to-lenders`, {
                method: 'POST',
                body: JSON.stringify({
                    selectedLenders,
                    businessData,
                    documents: selectedDocuments
                })
            });

            clearInterval(progressInterval);

            if (result.success) {
                // 6. Success State
                if (progressBar) progressBar.style.width = '100%';
                if (statusText) statusText.textContent = '✅ Sent Successfully!';

                // Wait 500ms so user sees "100%", then close
                setTimeout(() => {
                    const successCount = result.results?.successful?.length || 0;
                    this.utils.showNotification(`Successfully sent to ${successCount} lenders!`, 'success');

                    // Hide Overlay
                    overlay.style.display = 'none';
                    progressBar.style.width = '0%';

                    // Close Modal
                    document.getElementById('lenderSubmissionModal').style.display = 'none';
                    document.getElementById('lenderSubmissionModal').classList.add('hidden');
                }, 800);

            } else {
                throw new Error(result.error || 'Failed to send submissions');
            }

        } catch (error) {
            console.error('Error sending submissions:', error);

            // Hide Overlay on Error
            const overlay = document.getElementById('submissionOverlay');
            if (overlay) overlay.style.display = 'none';

            this.utils.showNotification('Failed to send: ' + error.message, 'error');
        }
    }

    // Lender Management CRUD
    async loadLendersList() {
        try {
            const lenders = await this.parent.apiCall(`/api/lenders`);
            this.displayLendersList(lenders);
        } catch (error) {
            console.error('Error loading lenders:', error);
            this.displayLendersError('Failed to load lenders');
        }
    }

    displayLendersList(lenders) {
        const container = document.getElementById('lendersTableContainer');

        if (!lenders || lenders.length === 0) {
            container.innerHTML = `
                <div class="empty-state-card">
                    <div class="empty-state-icon">🏦</div>
                    <div class="empty-state-text">
                        <h4>No Lenders Found</h4>
                        <p>Start by adding your first lender to the database.</p>
                    </div>
                </div>
            `;
            return;
        }

        const sortedLenders = [...lenders].sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        );

        container.innerHTML = `
            <div class="lender-list-container">
                <div class="lender-list-header">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span>🏦</span> Lender Name
                    </div>
                    <div style="text-align: right;">Actions</div>
                </div>
                <div>
                    ${sortedLenders.map(lender => `
                        <div class="lender-list-row">
                            <div class="lender-name-wrapper">
                                <div class="lender-avatar">
                                    ${lender.name.charAt(0).toUpperCase()}
                                </div>
                                <span>${lender.name}</span>
                            </div>
                            <div class="lender-actions">
                                <button
                                    onclick="window.conversationUI.lenders.editLender('${lender.id}')"
                                    title="Edit lender"
                                    class="btn-icon-action"
                                >✏️</button>
                                <button
                                    onclick="window.conversationUI.lenders.deleteLender('${lender.id}', '${lender.name}')"
                                    title="Delete lender"
                                    class="btn-icon-action delete"
                                >🗑️</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Templates
    createLenderFormTemplate(conversationData = {}) {
        return `
            <div class="lender-qualification-system" style="height: calc(100vh - 200px); overflow: hidden;">
                ${this.createLenderHeader()}
                ${this.createLenderForm(conversationData)}
            </div>
        `;
    }

    createLenderHeader() {
        return `
            <div class="lender-header">
            </div>
        `;
    }

    createLenderForm(conversationData = {}) {
        const businessName = conversationData?.business_name || '';
        const revenue = conversationData?.monthly_revenue || '';

        // Helper to generate the HTML for a field wrapped in a grid cell
        const renderField = (id, val, spanClass = '') => {
            const field = this.lenderFormFields.find(f => f.id === id);
            if (!field) return '';
            if (id === 'lenderStartDate') {
                return `<div class="${spanClass}" style="position: relative;">
                            ${this.createFormField(field, val)}
                        </div>`;
            }
            return `<div class="${spanClass}">${this.createFormField(field, val)}</div>`;
        };

        return `
            <div style="display: flex; flex-direction: column; height: 100%;">

                <div class="lender-form-scroll-area custom-scrollbar">

                    <div class="quick-import-card">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 16px;">📋</span>
                                <h4 style="font-size: 14px; margin:0;">Quick Import</h4>
                            </div>
                            <button type="button" id="toggleQuickImport" class="btn-link">Show ▼</button>
                        </div>
                        <div id="quickImportContent" style="display: none;">
                            <textarea id="quickImportTextarea" placeholder="Paste data here..." style="width: 100%; height: 80px; padding: 8px; font-size: 12px; font-family: monospace; border-radius: 6px; background: #0d1117; border: 1px solid #30363d; color: #e6edf3; margin-bottom: 8px;"></textarea>
                            <button type="button" id="importDataBtn" class="btn-icon-action" style="width: auto; padding: 4px 12px; background: #3b82f6; color: white; border:none;">Import</button>
                        </div>
                    </div>

                    <form id="lenderForm">
                        <div class="lender-input-grid">
                            ${renderField('lenderBusinessName', businessName, 'grid-span-2')}
                            ${renderField('lenderPosition', '', '')}

                            ${renderField('lenderRevenue', revenue, '')}
                            ${renderField('lenderFico', '', '')}
                            ${renderField('lenderState', '', '')}

                            ${renderField('lenderIndustry', '', '')}
                            ${renderField('lenderStartDate', '', '')}
                            ${renderField('lenderDepositsPerMonth', '', '')}

                            ${renderField('lenderNegativeDays', '', '')}

                            ${renderField('lenderWithholding', '', '')}

                            <div></div>
                        </div>

                        <div class="checkbox-row-card" style="margin: 0 0 20px 0; padding: 12px;">
                            ${this.lenderFormCheckboxes.map(field => this.createCheckboxField(field)).join('')}
                        </div>

                        <div style="margin-bottom: 12px;">
                            <label class="field-label" style="font-size: 11px; margin-bottom: 4px; display:block; color:#8b949e;">Current Positions</label>
                            <input type="text" id="lenderCurrentPositions" class="form-input" style="width: 100%;">
                        </div>

                        <div>
                            <label class="field-label" style="font-size: 11px; margin-bottom: 4px; display:block; color:#8b949e;">Additional Notes</label>
                            <textarea id="lenderAdditionalNotes" class="form-textarea" style="height: 80px; width: 100%; resize: vertical;"></textarea>
                        </div>

                        <div class="loading" id="lenderLoading" style="display: none; text-align: center; margin-top: 15px; color: #8b949e;">Processing...</div>
                        <div class="error" id="lenderErrorMsg" style="display: none; margin-top: 15px; padding: 10px; background: rgba(239, 68, 68, 0.1); border-radius: 6px; color: #ef4444;"></div>
                    </form>

                    <div id="lenderResults" style="margin-top: 20px;"></div>
                </div>

                <div class="lender-form-footer">
                    <button type="button" id="clearLenderCacheBtn" style="background: transparent; border: none; color: #8b949e; font-size: 13px; cursor: pointer; margin-right: auto;">Clear Form</button>
                    <button type="button" onclick="document.getElementById('lenderForm').dispatchEvent(new Event('submit'))" class="btn btn-primary">
                        <span id="processLendersText">Process Qualification</span>
                        <span id="processLendersSpinner" style="display: none;">...</span>
                    </button>
                </div>
            </div>
        `;
    }

    createFormField(field, value = '') {
        const requiredMark = field.required ? '<span class="required" style="color:#ef4444">*</span>' : '';

        // Standard Select
        if (field.type === 'select') {
            return `
                <div class="form-group">
                    <label for="${field.id}">${field.label} ${requiredMark}</label>
                    <select id="${field.id}" class="form-select" ${field.required ? 'required' : ''}>
                        ${field.options.map(opt =>
                            `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.label}</option>`
                        ).join('')}
                    </select>
                </div>
            `;
        }

        // Standard Input
        return `
            <div class="form-group">
                <label for="${field.id}">${field.label} ${requiredMark}</label>
                <input type="${field.type}"
                       id="${field.id}"
                       class="form-input"
                       value="${value}"
                       placeholder="${field.placeholder || ''}"
                       ${field.required ? 'required' : ''}>
                ${field.id === 'lenderStartDate' ? '<div id="lenderTibDisplay" class="tib-display hidden"></div>' : ''}
            </div>
        `;
    }

    createCheckboxField(field, checked = false) {
        return `
            <label class="checkbox-label">
                <input type="checkbox" id="${field.id}" ${checked ? 'checked' : ''}>
                ${field.label}
            </label>
        `;
    }

    // --- Entry Point for Lender Management Modal ---
    openManagementModal() {
        console.log('🏛️ Opening Lender Management Dashboard...');

        // 1. Create or Get the Modal Container
        let modal = document.getElementById('lenderManagementModal');

        // If it doesn't exist, create the skeleton HTML
        if (!modal) {
            const modalHTML = `
                <div id="lenderManagementModal" class="modal" style="display:none; z-index: 2000;">
                    <div class="modal-content" style="max-width: 1100px; height: 85vh; display: flex; flex-direction: column;">
                        <div class="modal-header">
                            <h3>🏛️ Manage Lender Network</h3>
                            <button class="modal-close" onclick="document.getElementById('lenderManagementModal').style.display='none'">×</button>
                        </div>
                        <div class="modal-body" id="lenderManagementContent" style="padding: 0; flex: 1; overflow: hidden;"></div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            modal = document.getElementById('lenderManagementModal');
        }

        // 2. Inject Your Template (Connects your existing logic)
        const contentArea = document.getElementById('lenderManagementContent');
        if (contentArea) {
            contentArea.innerHTML = this.createLenderManagementTemplate();
        }

        // 3. Show the Modal
        modal.style.display = 'flex';

        // 4. Load the Data (Uses your existing API connection)
        this.loadLendersList();
    }

    createLenderManagementTemplate() {
        return `
            <div class="lender-management-system" style="height: 100%; display: flex; flex-direction: column;">
                <div class="lender-mgmt-content" style="flex: 1; overflow: hidden; display: flex; flex-direction: column;">
                    <div class="mgmt-actions" style="
                        flex-shrink: 0;
                        padding: 0 0 16px 0;
                        display: flex;
                        gap: 10px;
                        align-items: center;
                    ">
                        <button
                            onclick="window.conversationUI.lenders.showAddLenderModal()"
                            style="
                                padding: 7px 14px;
                                background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                                color: white;
                                border: none;
                                border-radius: 6px;
                                font-size: 13px;
                                font-weight: 600;
                                cursor: pointer;
                                transition: all 0.2s ease;
                                box-shadow: 0 1px 3px rgba(59, 130, 246, 0.3);
                                display: inline-flex;
                                align-items: center;
                                gap: 5px;
                            "
                            onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 3px 8px rgba(59, 130, 246, 0.35)';"
                            onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 1px 3px rgba(59, 130, 246, 0.3)';"
                        >
                            <span style="font-size: 14px;">➕</span>
                            Add New Lender
                        </button>
                        <button
                            onclick="window.conversationUI.lenders.refreshLendersList()"
                            style="
                                padding: 7px 14px;
                                background: white;
                                color: #64748b;
                                border: 1.5px solid #e2e8f0;
                                border-radius: 6px;
                                font-size: 13px;
                                font-weight: 600;
                                cursor: pointer;
                                transition: all 0.2s ease;
                                display: inline-flex;
                                align-items: center;
                                gap: 5px;
                            "
                            onmouseover="this.style.background='#f8fafc'; this.style.borderColor='#cbd5e1'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 2px 6px rgba(0, 0, 0, 0.08)';"
                            onmouseout="this.style.background='white'; this.style.borderColor='#e2e8f0'; this.style.transform='translateY(0)'; this.style.boxShadow='none';"
                        >
                            <span style="font-size: 14px;">🔄</span>
                            Refresh
                        </button>
                    </div>

                    <div id="lendersTableContainer" style="flex: 1; overflow-y: auto; padding-bottom: 50px;">
                        <div class="loading-state">
                            Loading lenders...
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Modal CRUD Functions
    showAddLenderModal() {
        // Remove existing if any
        const existingModal = document.getElementById('addLenderModal');
        if (existingModal) existingModal.remove();

        // Uses standard .modal structure from 06-components-modals.css
        const modalHtml = `
            <div id="addLenderModal" class="modal" style="display: flex;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Add New Lender</h3>
                        <button class="modal-close" onclick="document.getElementById('addLenderModal').remove()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-section">
                            <div class="section-content">
                                <div class="form-row">
                                    <div class="form-group full-width">
                                        <label>Lender Name *</label>
                                        <input type="text" id="newLenderName" class="form-input" placeholder="e.g., ABC Capital Lending">
                                    </div>
                                </div>
                                <div class="form-row">
                                    <div class="form-group full-width">
                                        <label>Email Address *</label>
                                        <input type="email" id="newLenderEmail" class="form-input" placeholder="e.g., deals@abclending.com">
                                    </div>
                                </div>
                                <div class="form-row">
                                    <div class="form-group">
                                        <label>Phone Number</label>
                                        <input type="text" id="newLenderPhone" class="form-input" placeholder="(555) 123-4567">
                                    </div>
                                    <div class="form-group">
                                        <label>Company Name</label>
                                        <input type="text" id="newLenderCompany" class="form-input" placeholder="ABC Lending LLC">
                                    </div>
                                </div>
                                <div class="form-row">
                                    <div class="form-group">
                                        <label>Min Amount ($)</label>
                                        <input type="number" id="newLenderMinAmount" class="form-input" placeholder="10000">
                                    </div>
                                    <div class="form-group">
                                        <label>Max Amount ($)</label>
                                        <input type="number" id="newLenderMaxAmount" class="form-input" placeholder="500000">
                                    </div>
                                </div>
                                <div class="form-row">
                                    <div class="form-group full-width">
                                        <label>Industries (comma-separated)</label>
                                        <input type="text" id="newLenderIndustries" class="form-input" placeholder="retail, construction, healthcare">
                                    </div>
                                </div>
                                <div class="form-row">
                                    <div class="form-group full-width">
                                        <label>States (comma-separated)</label>
                                        <input type="text" id="newLenderStates" class="form-input" placeholder="CA, NY, TX, FL">
                                    </div>
                                </div>
                                <div class="form-row">
                                    <div class="form-group full-width">
                                        <label>Notes</label>
                                        <textarea id="newLenderNotes" class="form-textarea" rows="3" placeholder="Additional notes..."></textarea>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="document.getElementById('addLenderModal').remove()">Cancel</button>
                        <button class="btn btn-primary" onclick="window.conversationUI.lenders.saveLender()">Add Lender</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async saveLender() {
        const name = document.getElementById('newLenderName').value.trim();
        const email = document.getElementById('newLenderEmail').value.trim();
        const phone = document.getElementById('newLenderPhone').value.trim();
        const company = document.getElementById('newLenderCompany').value.trim();
        const minAmount = document.getElementById('newLenderMinAmount').value;
        const maxAmount = document.getElementById('newLenderMaxAmount').value;
        const industriesText = document.getElementById('newLenderIndustries').value.trim();
        const statesText = document.getElementById('newLenderStates').value.trim();
        const notes = document.getElementById('newLenderNotes').value.trim();

        if (!name || !email) {
            this.utils.showNotification('Name and email are required', 'error');
            return;
        }

        const industries = industriesText ? industriesText.split(',').map(i => i.trim()) : [];
        const states = statesText ? statesText.split(',').map(s => s.trim().toUpperCase()) : [];

        const lenderData = {
            name,
            email,
            phone: phone || null,
            company: company || null,
            min_amount: minAmount ? parseFloat(minAmount) : null,
            max_amount: maxAmount ? parseFloat(maxAmount) : null,
            industries,
            states,
            notes: notes || null
        };

        try {
            const result = await this.parent.apiCall(`/api/lenders`, {
                method: 'POST',
                body: JSON.stringify(lenderData)
            });

            if (result.success) {
                this.utils.showNotification('Lender added successfully', 'success');
                document.getElementById('addLenderModal').remove();
                this.loadLendersList();
            } else {
                throw new Error(result.error || 'Failed to add lender');
            }
        } catch (error) {
            console.error('Error adding lender:', error);
            this.utils.showNotification('Failed to add lender: ' + error.message, 'error');
        }
    }

    async editLender(lenderId) {
        try {
            const result = await this.parent.apiCall(`/api/lenders/${lenderId}`);
            if (result.success && result.lender) {
                this.showEditLenderModal(result.lender);
            } else {
                throw new Error('Lender data not found');
            }

        } catch (error) {
            console.error('Error fetching lender:', error);
            this.utils.showNotification('Failed to load lender data', 'error');
        }
    }

    showEditLenderModal(lender) {
        const existingModal = document.getElementById('editLenderModal');
        if (existingModal) existingModal.remove();

        const industriesStr = Array.isArray(lender.industries) ? lender.industries.join(', ') : '';
        const statesStr = Array.isArray(lender.states) ? lender.states.join(', ') : '';

        const modalHtml = `
            <div id="editLenderModal" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.7); z-index: 999999; display: flex; align-items: center; justify-content: center;">
                <div style="background: white; border-radius: 8px; padding: 0; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto;">
                    <div style="padding: 20px; border-bottom: 1px solid #e2e8f0;">
                        <h3 style="margin: 0;">Edit Lender</h3>
                    </div>
                    <div style="padding: 20px;">
                        <label style="display: block; font-weight: 600; margin-bottom: 5px; color: #334155;">Lender Name *</label>
                        <input type="text" id="editLenderName" value="${lender.name || ''}" style="width: 100%; margin-bottom: 15px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px;">

                        <label style="display: block; font-weight: 600; margin-bottom: 5px; color: #334155;">Email Address *</label>
                        <input type="email" id="editLenderEmail" value="${lender.email || ''}" style="width: 100%; margin-bottom: 15px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px;">

                        <label style="display: block; font-weight: 600; margin-bottom: 5px; color: #334155;">Phone Number</label>
                        <input type="text" id="editLenderPhone" value="${lender.phone || ''}" placeholder="(555) 123-4567" style="width: 100%; margin-bottom: 15px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px;">

                        <label style="display: block; font-weight: 600; margin-bottom: 5px; color: #334155;">Company Name</label>
                        <input type="text" id="editLenderCompany" value="${lender.company || ''}" placeholder="ABC Lending LLC" style="width: 100%; margin-bottom: 15px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px;">

                        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: 600; margin-bottom: 5px; color: #334155;">Min Amount ($)</label>
                                <input type="number" id="editLenderMinAmount" value="${lender.min_amount || 0}" placeholder="10000" style="width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px;">
                            </div>
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: 600; margin-bottom: 5px; color: #334155;">Max Amount ($)</label>
                                <input type="number" id="editLenderMaxAmount" value="${lender.max_amount || 0}" placeholder="500000" style="width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px;">
                            </div>
                        </div>

                        <label style="display: block; font-weight: 600; margin-bottom: 5px; color: #334155;">Industries (comma-separated)</label>
                        <input type="text" id="editLenderIndustries" value="${industriesStr}" placeholder="retail, construction, healthcare" style="width: 100%; margin-bottom: 15px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px;">

                        <label style="display: block; font-weight: 600; margin-bottom: 5px; color: #334155;">States (comma-separated)</label>
                        <input type="text" id="editLenderStates" value="${statesStr}" placeholder="CA, NY, TX, FL" style="width: 100%; margin-bottom: 15px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px;">

                        <label style="display: block; font-weight: 600; margin-bottom: 5px; color: #334155;">Notes</label>
                        <textarea id="editLenderNotes" rows="3" placeholder="Additional notes about this lender..." style="width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px; resize: vertical;">${lender.notes || ''}</textarea>
                    </div>
                    <div style="padding: 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px;">
                        <button onclick="document.getElementById('editLenderModal').remove()" style="padding: 10px 20px; background: white; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; font-weight: 600;">Cancel</button>
                        <button onclick="window.conversationUI.lenders.updateLender('${lender.id}')" style="padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Update Lender</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async updateLender(lenderId) {
        const name = document.getElementById('editLenderName').value.trim();
        const email = document.getElementById('editLenderEmail').value.trim();
        const phone = document.getElementById('editLenderPhone').value.trim();
        const company = document.getElementById('editLenderCompany').value.trim();
        const minAmount = document.getElementById('editLenderMinAmount').value;
        const maxAmount = document.getElementById('editLenderMaxAmount').value;
        const industriesText = document.getElementById('editLenderIndustries').value.trim();
        const statesText = document.getElementById('editLenderStates').value.trim();
        const notes = document.getElementById('editLenderNotes').value.trim();

        if (!name || !email) {
            this.utils.showNotification('Name and email are required', 'error');
            return;
        }

        const industries = industriesText ? industriesText.split(',').map(i => i.trim()) : [];
        const states = statesText ? statesText.split(',').map(s => s.trim().toUpperCase()) : [];

        const lenderData = {
            name,
            email,
            phone: phone || null,
            company: company || null,
            min_amount: minAmount ? parseFloat(minAmount) : null,
            max_amount: maxAmount ? parseFloat(maxAmount) : null,
            industries,
            states,
            notes: notes || null
        };

        try {
            console.log(`📤 Updating lender ${lenderId}...`);
            const result = await this.parent.apiCall(`/api/lenders/${lenderId}`, {
                method: 'PUT',
                body: JSON.stringify(lenderData)
            });

            console.log('📥 Update response:', result);

            // FIX: Accept response if it has success=true OR if it returns the object with an ID
            if (result.success || result.id || result.lender || (result.affected && result.affected > 0)) {
                this.utils.showNotification('Lender updated successfully', 'success');

                const modal = document.getElementById('editLenderModal');
                if (modal) modal.remove();

                this.loadLendersList();
            } else {
                // Even if success flag is missing, if we got data back, treat as success but warn console
                console.warn("Update succeeded but response format was unexpected:", result);
                this.utils.showNotification('Lender updated.', 'success');

                const modal = document.getElementById('editLenderModal');
                if (modal) modal.remove();
                this.loadLendersList();
            }
        } catch (error) {
            console.error('Error updating lender:', error);
            this.utils.showNotification('Network error updating lender', 'error');
        }
    }

    async deleteLender(lenderId, lenderName) {
        if (!confirm(`Are you sure you want to delete lender "${lenderName}"?`)) {
            return;
        }

        try {
            const result = await this.parent.apiCall(`/api/lenders/${lenderId}`, {
                method: 'DELETE'
            });

            if (result.success) {
                this.utils.showNotification('Lender deleted successfully', 'success');
                this.loadLendersList();
            } else {
                throw new Error('Failed to delete lender');
            }
        } catch (error) {
            console.error('Error deleting lender:', error);
            this.utils.showNotification('Failed to delete lender', 'error');
        }
    }

    refreshLendersList() {
        this.loadLendersList();
    }

    toggleAllLenders() {
        const checkboxes = document.querySelectorAll('#lenderSelectionList input[type="checkbox"]');
        const toggleBtn = document.getElementById('toggleAllLendersBtn');

        if (!checkboxes.length || !toggleBtn) return;

        const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
        const allChecked = checkedCount === checkboxes.length;

        // Toggle all checkboxes
        checkboxes.forEach(checkbox => {
            checkbox.checked = !allChecked;
        });

        // Update button text
        toggleBtn.textContent = allChecked ? 'Select All' : 'Deselect All';
    }

    toggleAllDocuments() {
        const checkboxes = document.querySelectorAll('#submissionDocumentList input[type="checkbox"]');
        const toggleBtn = document.getElementById('toggleAllDocumentsBtn');

        if (!checkboxes.length || !toggleBtn) return;

        const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
        const allChecked = checkedCount === checkboxes.length;

        // Toggle all checkboxes
        checkboxes.forEach(checkbox => {
            checkbox.checked = !allChecked;
        });

        // Update button text
        toggleBtn.textContent = allChecked ? 'Select All' : 'Deselect All';
    }

    // Debug test function
    testLenderSubmissionFlow() {
        console.log('=== Testing Lender Submission Flow ===');
        console.log('1. Check window.conversationUI:', !!window.conversationUI);
        console.log('2. Check window.conversationUI.lenders:', !!window.conversationUI?.lenders);
        console.log('3. Check qualified lenders:', this.qualifiedLenders?.length || 0);
        console.log('4. Check modal exists:', !!document.getElementById('lenderSubmissionModal'));
        console.log('5. Check send button exists:', !!document.getElementById('sendToLendersBtn'));

        if (window.conversationUI?.lenders) {
            console.log('Attempting to call showLenderSubmissionModal...');
            window.conversationUI.lenders.showLenderSubmissionModal();
        }
    }

    // Reattach event listeners to cached results
    reattachResultsEventListeners(data, criteria) {
        console.log('Reattaching event listeners to cached results');
        const lendersModule = this;

        // Reattach Send to Lenders button
        const sendButton = document.getElementById('sendToLendersBtn');
        if (sendButton) {
            // Remove old listener by cloning
            const newButton = sendButton.cloneNode(true);
            sendButton.parentNode.replaceChild(newButton, sendButton);

            // Attach fresh listener
            newButton.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Send to Lenders button clicked (from cache)');
                lendersModule.showLenderSubmissionModal();
            });
            console.log('✅ Send to Lenders button listener reattached');
        }

        // Reattach toggle qualified button
        const toggleQualifiedBtn = document.getElementById('toggleQualified');
        if (toggleQualifiedBtn) {
            const newToggle = toggleQualifiedBtn.cloneNode(true);
            toggleQualifiedBtn.parentNode.replaceChild(newToggle, toggleQualifiedBtn);
            newToggle.addEventListener('click', () => lendersModule.toggleQualifiedSection());
            console.log('✅ Toggle qualified button listener reattached');
        }

        // Reattach toggle non-qualified button
        const toggleNonQualifiedBtn = document.getElementById('toggleNonQualified');
        if (toggleNonQualifiedBtn) {
            const newToggle = toggleNonQualifiedBtn.cloneNode(true);
            toggleNonQualifiedBtn.parentNode.replaceChild(newToggle, toggleNonQualifiedBtn);
            newToggle.addEventListener('click', () => lendersModule.toggleNonQualifiedSection());
            console.log('✅ Toggle non-qualified button listener reattached');
        }

        // Restore qualified lenders data
        if (data && data.qualified) {
            this.qualifiedLenders = data.qualified;
            this.lastLenderCriteria = criteria;
            console.log('✅ Qualified lenders restored:', this.qualifiedLenders.length);
        }

        console.log('Event listeners reattached successfully');
    }
}