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
                { value: '1', label: '1st Position (Preferred)' },
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
            { id: 'lenderNegativeDays', label: 'Negative Days (Last 90)', type: 'number', required: false, placeholder: 'Days negative' }
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

    setupGlobalEventListeners() {
        // Listen for clicks anywhere in the results container
        // This works even if the HTML inside is replaced 100 times
        const resultsContainer = document.getElementById('lenderResults');

        if (resultsContainer) {
            resultsContainer.addEventListener('click', (e) => {
                // check if the clicked element (or its parent) has our trigger class or ID
                if (e.target.id === 'sendToLendersBtn' || e.target.closest('#sendToLendersBtn')) {
                    e.preventDefault();
                    this.showLenderSubmissionModal();
                }
            });
        }

        // Also restore previous results if they exist
        this.restoreCachedResults();
    }

    restoreCachedResults() {
        try {
            const cached = localStorage.getItem('cached_lender_results');
            if (cached) {
                const parsed = JSON.parse(cached);

                // Only restore if less than 24 hours old
                const oneDay = 24 * 60 * 60 * 1000;
                if (Date.now() - parsed.timestamp < oneDay) {
                    console.log('♻️ Restoring cached lender results');
                    // We call the display function directly
                    // Note: We pass the data, but displayLenderResults will try to save it again.
                    // That's fine, but to be cleaner we can just set the variable:
                    this.qualifiedLenders = parsed.data.qualified || [];

                    // Now render the HTML
                    // We reuse the display logic but skip saving to avoid loops if you want,
                    // or just let it overwrite. For simplicity, just call it:
                    this.displayLenderResults(parsed.data, parsed.criteria);
                } else {
                    localStorage.removeItem('cached_lender_results');
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
            <div id="lenderSubmissionModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); z-index: 1000; align-items: center; justify-content: center;">
                <div style="background: white; width: 90%; max-width: 800px; max-height: 90vh; border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

                    <div style="padding: 16px 24px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; background: #f9fafb;">
                        <h3 style="margin: 0; font-size: 18px; color: #111827;">Send to Lenders</h3>
                        <button id="closeLenderSubmissionModal" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
                    </div>

                    <div style="padding: 24px; overflow-y: auto;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">

                            <div>
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                                    <h4 style="margin: 0; color: #374151;">Select Lenders</h4>
                                    <button id="toggleAllLendersBtn" style="font-size: 12px; color: #2563eb; background: none; border: none; cursor: pointer;">Deselect All</button>
                                </div>
                                <div id="lenderSelectionList" style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; max-height: 300px; overflow-y: auto; background: #f9fafb;">
                                    </div>
                            </div>

                            <div>
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                                    <h4 style="margin: 0; color: #374151;">Select Documents</h4>
                                    <button id="toggleAllDocumentsBtn" style="font-size: 12px; color: #2563eb; background: none; border: none; cursor: pointer;">Select All</button>
                                </div>
                                <div id="submissionDocumentList" style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; max-height: 300px; overflow-y: auto; background: #f9fafb;">
                                    </div>
                            </div>
                        </div>

                        <div style="margin-top: 24px;">
                            <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 8px;">Email Message</label>
                            <textarea id="submissionMessage" style="width: 100%; height: 150px; padding: 12px; border: 1px solid #d1d5db; border-radius: 6px; font-family: inherit; font-size: 14px; resize: vertical; box-sizing: border-box;"></textarea>
                        </div>
                    </div>

                    <div style="padding: 16px 24px; border-top: 1px solid #e5e7eb; background: #f9fafb; display: flex; justify-content: flex-end; gap: 12px;">
                        <button id="cancelLenderSubmission" style="padding: 10px 20px; border: 1px solid #d1d5db; background: white; border-radius: 6px; color: #374151; cursor: pointer;">Cancel</button>
                        <button id="confirmLenderSubmission" style="padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                            <span id="sendSubmissionsText">Send Emails</span>
                            <span id="sendSubmissionsLoading" style="display: none;">Sending...</span>
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

                    tibDisplay.style.display = 'block';
                    tibDisplay.style.fontSize = '12px';
                    tibDisplay.style.color = '#6b7280';
                    tibDisplay.style.marginTop = '4px';
                } else {
                    tibDisplay.style.display = 'none';
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
                const isHidden = quickImportContent.style.display === 'none';
                quickImportContent.style.display = isHidden ? 'block' : 'none';
                toggleBtn.textContent = isHidden ? 'Hide ▲' : 'Show ▼';
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
                            quickImportContent.style.display = 'none';
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

    populateLenderForm() {
        const conversation = this.parent.getSelectedConversation();
        if (!conversation) return;

        console.log('Auto-filling lender form with conversation data:', conversation);

        const conversationId = this.parent.getCurrentConversationId();
        const cacheKey = `lender_form_data_${conversationId}`;
        const hasCachedData = localStorage.getItem(cacheKey);

        if (hasCachedData) {
            console.log('Cached data exists, skipping auto-population');
        }

        // Check for cached lender results and reattach event listeners if needed
        if (conversationId && this.lenderResultsCache.has(conversationId)) {
            console.log('Found cached lender results, checking if event listeners need reattaching...');
            const sendButton = document.getElementById('sendToLendersBtn');
            if (sendButton) {
                const cachedResults = this.lenderResultsCache.get(conversationId);
                console.log('Reattaching event listeners for cached lender results');
                this.reattachResultsEventListeners(cachedResults.data, cachedResults.criteria);
            }
        }

        if (hasCachedData) {
            return;
        }

        const populateIfEmpty = (fieldId, value) => {
            const element = document.getElementById(fieldId);
            if (element && value && !element.value) {
                element.value = value;
                return true;
            }
            return false;
        };

        populateIfEmpty('lenderBusinessName', conversation.business_name);

        if (conversation.annual_revenue) {
            const monthlyRevenue = Math.round(conversation.annual_revenue / 12);
            populateIfEmpty('lenderRevenue', monthlyRevenue);
        }

        if (conversation.state && conversation.state !== 'NEW') {
            populateIfEmpty('lenderState', conversation.state);
        }

        populateIfEmpty('lenderIndustry', conversation.business_type);

        const startDateEl = document.getElementById('lenderStartDate');
        const tibDisplay = document.getElementById('lenderTibDisplay');
        if (startDateEl && conversation.business_start_date && !startDateEl.value) {
            const date = new Date(conversation.business_start_date);
            if (!isNaN(date.getTime())) {
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                const day = date.getDate().toString().padStart(2, '0');
                const year = date.getFullYear();
                const formattedDate = `${month}/${day}/${year}`;
                startDateEl.value = formattedDate;

                const today = new Date();
                const monthsDiff = (today.getFullYear() - date.getFullYear()) * 12 +
                                 (today.getMonth() - date.getMonth());
                const tib = Math.max(0, monthsDiff);

                if (tibDisplay && tib > 0) {
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

                    tibDisplay.style.display = 'block';
                }
            }
        }

        populateIfEmpty('lenderPosition', conversation.funding_amount);

        console.log('Lender form auto-populated');
    }

    displayLenderResults(data, criteria) {
        console.log('=== displayLenderResults called ===');

        // 1. SAVE RESULTS TO STORAGE (Fixes "having to process again")
        localStorage.setItem('cached_lender_results', JSON.stringify({
            data: data,
            criteria: criteria,
            timestamp: Date.now()
        }));

        this.qualifiedLenders = data.qualified || [];
        this.lastLenderCriteria = criteria;

        let html = `<div style="padding: 10px;">`;

        // Summary Section
        html += `
            <div style="display: flex; justify-content: center; gap: 40px; margin: 20px 0; padding: 20px; background: #f9fafb; border-radius: 8px;">
                <div style="text-align: center;">
                    <div style="font-size: 2.5rem; font-weight: 700; color: #10b981;">${data.qualified?.length || 0}</div>
                    <div style="font-size: 0.875rem; color: #6b7280; text-transform: uppercase;">Qualified</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 2.5rem; font-weight: 700; color: #ef4444;">${data.nonQualified?.length || 0}</div>
                    <div style="font-size: 0.875rem; color: #6b7280; text-transform: uppercase;">Non-Qualified</div>
                </div>
            </div>
        `;

        // Send Button - SIMPLIFIED (Fixes glitchy clicks)
        // We added a specific class 'trigger-lender-modal' to catch it later
        if (data.qualified && data.qualified.length > 0) {
            html += `
                <div style="margin: 20px 0; text-align: center;">
                    <button id="sendToLendersBtn" class="trigger-lender-modal"
                            style="padding: 12px 24px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-size: 16px; cursor: pointer;">
                        📧 Send to Lenders
                    </button>
                </div>
            `;

            // Qualified Lenders Section
            html += `
                <div style="margin-top: 20px;">
                    <div style="padding: 12px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; margin-bottom: 10px;">
                        <span style="color: #16a34a; font-weight: 600;">✅ Qualified Lenders</span>
                    </div>
                    <div id="qualifiedSection" style="display: block; padding: 10px;">`;

            // Group by tiers
            const tiers = {};
            data.qualified.forEach(lender => {
                const tier = lender.Tier || 'Unknown';
                if (!tiers[tier]) tiers[tier] = [];
                tiers[tier].push(lender);
            });

            Object.keys(tiers).sort().forEach(tier => {
                html += `<div style="margin-bottom: 16px;">`;
                html += `<div style="font-weight: 600; padding: 8px; background: #f8fafc; border-radius: 4px;">Tier ${tier}</div>`;
                html += `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; padding: 8px;">`;
                tiers[tier].forEach(lender => {
                    const star = lender.isPreferred ? '⭐' : '';
                    html += `<div style="padding: 8px; background: white; border: 1px solid #d1fae5; border-radius: 4px;">${lender['Lender Name']}${star}</div>`;
                });
                html += `</div></div>`;
            });
            html += `</div></div>`;
        }

        // Non-Qualified Section
        if (data.nonQualified && data.nonQualified.length > 0) {
             html += `
                <div style="margin-top: 30px;">
                    <button onclick="document.getElementById('nonQualList').style.display = document.getElementById('nonQualList').style.display === 'none' ? 'block' : 'none'"
                            style="width: 100%; padding: 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; cursor: pointer; text-align: left; color: #dc2626; font-weight: 600;">
                        ❌ View Non-Qualified Lenders (${data.nonQualified.length}) ▼
                    </button>
                    <div id="nonQualList" style="display: none; margin-top: 10px;">
                        ${data.nonQualified.map(item => `
                            <div style="display: flex; justify-content: space-between; padding: 8px; background: white; border-bottom: 1px solid #eee;">
                                <span style="font-weight: 500;">${item.lender}</span>
                                <span style="color: #dc2626;">${item.blockingRule}</span>
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
            tibDisplay.style.display = 'none';
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

        // Show modal
        modal.style.display = 'flex';
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
            modal.style.display = 'none';
        });

        // Cancel button
        attachListener('cancelLenderSubmission', (e) => {
            e.preventDefault();
            modal.style.display = 'none';
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
        console.log('=== populateSubmissionLenders called ===');

        const lenderList = document.getElementById('lenderSelectionList');
        console.log('Lender list element:', lenderList);
        console.log('Qualified lenders:', this.qualifiedLenders);

        if (!lenderList) {
            console.error('❌ lenderSelectionList element not found!');
            return;
        }

        if (!this.qualifiedLenders) {
            console.warn('⚠️ No qualified lenders available');
            lenderList.innerHTML = '<p style="color: #6b7280;">No qualified lenders available.</p>';
            return;
        }

        if (this.qualifiedLenders.length === 0) {
            console.warn('⚠️ Qualified lenders array is empty');
            lenderList.innerHTML = '<p style="color: #6b7280;">No qualified lenders available.</p>';
            return;
        }

        console.log(`Populating ${this.qualifiedLenders.length} lenders...`);

        // Group by tier
        const lendersByTier = {};
        this.qualifiedLenders.forEach(lender => {
            const tier = lender.Tier || 'Unknown';
            if (!lendersByTier[tier]) lendersByTier[tier] = [];
            lendersByTier[tier].push(lender);
        });

        console.log('Lenders by tier:', lendersByTier);

        let html = '';
        Object.keys(lendersByTier).sort().forEach(tier => {
            html += `<div style="margin-bottom: 12px;">`;
            html += `<div style="font-weight: 600; color: #374151; margin-bottom: 8px;">Tier ${tier}</div>`;
            lendersByTier[tier].forEach(lender => {
                const lenderName = lender['Lender Name'] || lender.name;
                const isPreferred = lender.isPreferred ? '⭐' : '';
                html += `
                    <label style="display: flex; align-items: center; padding: 6px; cursor: pointer;">
                        <input type="checkbox" class="lender-checkbox" value="${lenderName}" checked style="margin-right: 8px;">
                        <span>${lenderName} ${isPreferred}</span>
                    </label>
                `;
            });
            html += `</div>`;
        });

        lenderList.innerHTML = html;
        console.log('✅ Lenders HTML inserted');

        // Verify checkboxes
        setTimeout(() => {
            const checkboxes = lenderList.querySelectorAll('.lender-checkbox');
            console.log('Lender checkboxes found:', checkboxes.length);
        }, 50);

        // Set initial button text since all start checked
        const toggleBtn = document.getElementById('toggleAllLendersBtn');
        if (toggleBtn) {
            toggleBtn.textContent = 'Deselect All';
        }
    }

    populateSubmissionDocuments() {
        const docList = document.getElementById('submissionDocumentList');
        if (!docList) return;

        // Check if documents are loaded
        const documents = this.parent.documents?.currentDocuments;

        if (!documents || documents.length === 0) {
            docList.innerHTML = '<p style="color: #6b7280;">No documents available.</p>';
            return;
        }

        let html = '';
        documents.forEach(doc => {
            const icon = '📄'; // Simplified icon
            const isImportant = doc.documentType === 'Bank Statement' ||
                              doc.documentType === 'Signed Application' ||
                              doc.originalFilename?.toLowerCase().includes('application');

            html += `
                <label style="display: flex; align-items: center; padding: 6px; cursor: pointer;">
                    <input type="checkbox" class="document-checkbox" value="${doc.id}" ${isImportant ? 'checked' : ''} style="margin-right: 8px;">
                    <span>${icon} ${doc.originalFilename || doc.filename || 'Unknown Document'}</span>
                </label>
            `;
        });

        docList.innerHTML = html;

        // Update button text based on initial state
        const toggleBtn = document.getElementById('toggleAllDocumentsBtn');
        if (toggleBtn) {
            const checkboxes = document.querySelectorAll('#submissionDocumentList input[type="checkbox"]');
            const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
            if (checkedCount === checkboxes.length) {
                toggleBtn.textContent = 'Deselect All';
            } else {
                toggleBtn.textContent = 'Select All';
            }
        }

        console.log(`Populated ${documents.length} documents in submission modal`);
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
            // Get selected lenders
            const selectedLenderCheckboxes = Array.from(document.querySelectorAll('.lender-checkbox:checked'));

            const selectedLenders = selectedLenderCheckboxes.map(cb => {
                const lenderName = cb.value;
                const lender = this.qualifiedLenders?.find(l =>
                    l['Lender Name'] === lenderName || l.name === lenderName
                );

                const cleanLender = {
                    name: lenderName,
                    lender_name: lenderName,
                    email: null
                };

                if (lender) {
                    // Try multiple property names for email
                    cleanLender.email = lender.email || lender.Email || lender['Lender Email'] || lender['Email Address'] || null;

                    // If still no email found, log warning
                    if (!cleanLender.email) {
                        console.warn(`⚠️ No email found for lender: ${lenderName}. Properties:`, Object.keys(lender));
                    }
                }

                return cleanLender;
            });

            // Get selected documents
            const selectedDocumentIds = Array.from(document.querySelectorAll('.document-checkbox:checked'))
                .map(cb => cb.value);

            const selectedDocuments = selectedDocumentIds.map(docId => {
                const doc = this.parent.documents?.currentDocuments?.find(d => d.id === docId);
                if (!doc) {
                    return {
                        id: docId,
                        filename: 'unknown.pdf',
                        name: 'unknown.pdf'
                    };
                }

                return {
                    id: doc.id,
                    filename: doc.originalFilename || doc.filename || 'document.pdf',
                    name: doc.originalFilename || doc.filename || 'document.pdf',
                    s3_url: doc.s3_url || doc.url || null,
                    file_path: doc.file_path || doc.path || null
                };
            });

            // Get message
            const message = document.getElementById('submissionMessage')?.value;
            if (!message?.trim()) {
                this.utils.showNotification('Please enter a message', 'warning');
                return;
            }

            // Prepare business data
            const conversation = this.parent.getSelectedConversation();
            const businessData = {
                businessName: conversation?.business_name || 'Unknown Business',
                industry: conversation?.industry || '',
                state: conversation?.state || '',
                monthlyRevenue: conversation?.monthly_revenue || 0,
                customMessage: message
            };

            // Show loading state
            const sendText = document.getElementById('sendSubmissionsText');
            const sendLoading = document.getElementById('sendSubmissionsLoading');
            if (sendText) sendText.style.display = 'none';
            if (sendLoading) sendLoading.style.display = 'inline';

            const conversationId = this.parent.getCurrentConversationId();

            const result = await this.parent.apiCall(`/api/conversations/${conversationId}/send-to-lenders`, {
                method: 'POST',
                body: JSON.stringify({
                    selectedLenders: selectedLenders,
                    businessData: businessData,
                    documents: selectedDocuments
                })
            });

            if (result.success) {
                const successCount = result.results?.successful?.length || 0;
                this.utils.showNotification(`Successfully sent to ${successCount} of ${selectedLenders.length} lenders!`, 'success');
                document.getElementById('lenderSubmissionModal').style.display = 'none';
            } else {
                throw new Error(result.error || 'Failed to send submissions');
            }

        } catch (error) {
            console.error('Error sending submissions:', error);
            this.utils.showNotification('Failed to send: ' + error.message, 'error');
        } finally {
            const sendText = document.getElementById('sendSubmissionsText');
            const sendLoading = document.getElementById('sendSubmissionsLoading');
            if (sendText) sendText.style.display = 'inline';
            if (sendLoading) sendLoading.style.display = 'none';
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
                <div class="empty-state" style="
                    text-align: center;
                    padding: 60px 20px;
                    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
                    border-radius: 16px;
                    border: 2px dashed #cbd5e1;
                ">
                    <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;">🏦</div>
                    <h4 style="margin: 0 0 8px 0; font-size: 20px; color: #1e293b; font-weight: 600;">No Lenders Found</h4>
                    <p style="margin: 0; color: #64748b; font-size: 15px;">Start by adding your first lender to the database.</p>
                </div>
            `;
            return;
        }

        // Sort lenders alphabetically by name (A-Z)
        const sortedLenders = [...lenders].sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        );

        container.innerHTML = `
            <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="
                    display: grid;
                    grid-template-columns: 1fr auto;
                    padding: 16px 20px;
                    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
                    border-bottom: 1px solid #e2e8f0;
                ">
                    <div style="
                        font-size: 14px;
                        font-weight: 600;
                        color: #475569;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    ">
                        <span style="font-size: 18px;">🏦</span>
                        Lender Name
                    </div>
                    <div style="
                        font-size: 14px;
                        font-weight: 600;
                        color: #475569;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        text-align: right;
                    ">Actions</div>
                </div>
                <div>
                    ${sortedLenders.map((lender, index) => `
                        <div style="
                            display: grid;
                            grid-template-columns: 1fr auto;
                            padding: 10px 16px;
                            border-bottom: 1px solid #f1f5f9;
                            transition: all 0.2s ease;
                            background: ${index % 2 === 0 ? '#ffffff' : '#fafbfc'};
                        "
                        onmouseover="this.style.background='#f8fafc'; this.style.transform='translateX(4px)';"
                        onmouseout="this.style.background='${index % 2 === 0 ? '#ffffff' : '#fafbfc'}'; this.style.transform='translateX(0)';">
                            <div style="
                                font-size: 15px;
                                font-weight: 500;
                                color: #1e293b;
                                display: flex;
                                align-items: center;
                                gap: 10px;
                            ">
                                <div style="
                                    width: 32px;
                                    height: 32px;
                                    border-radius: 8px;
                                    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    color: white;
                                    font-weight: 700;
                                    font-size: 14px;
                                    box-shadow: 0 2px 6px rgba(59, 130, 246, 0.25);
                                ">${lender.name.charAt(0).toUpperCase()}</div>
                                <span>${lender.name}</span>
                            </div>
                            <div style="
                                display: flex;
                                align-items: center;
                                gap: 6px;
                            ">
                                <button
                                    onclick="window.conversationUI.lenders.editLender('${lender.id}')"
                                    title="Edit lender"
                                    style="
                                        width: 28px;
                                        height: 28px;
                                        padding: 0;
                                        background: white;
                                        color: #3b82f6;
                                        border: 1.5px solid #e2e8f0;
                                        border-radius: 5px;
                                        font-size: 14px;
                                        cursor: pointer;
                                        transition: all 0.2s ease;
                                        display: inline-flex;
                                        align-items: center;
                                        justify-content: center;
                                    "
                                    onmouseover="this.style.background='#eff6ff'; this.style.borderColor='#3b82f6'; this.style.transform='scale(1.1)';"
                                    onmouseout="this.style.background='white'; this.style.borderColor='#e2e8f0'; this.style.transform='scale(1)';"
                                >
                                    ✏️
                                </button>
                                <button
                                    onclick="window.conversationUI.lenders.deleteLender('${lender.id}', '${lender.name}')"
                                    title="Delete lender"
                                    style="
                                        width: 28px;
                                        height: 28px;
                                        padding: 0;
                                        background: white;
                                        color: #ef4444;
                                        border: 1.5px solid #e2e8f0;
                                        border-radius: 5px;
                                        font-size: 14px;
                                        cursor: pointer;
                                        transition: all 0.2s ease;
                                        display: inline-flex;
                                        align-items: center;
                                        justify-content: center;
                                    "
                                    onmouseover="this.style.background='#fef2f2'; this.style.borderColor='#ef4444'; this.style.transform='scale(1.1)';"
                                    onmouseout="this.style.background='white'; this.style.borderColor='#e2e8f0'; this.style.transform='scale(1)';"
                                >
                                    🗑️
                                </button>
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

        return `
            <div class="lender-form-content" style="height: 100%; overflow-y: auto; padding-bottom: 100px;">
                <!-- Quick Import Section -->
                <div style="margin-bottom: 20px; background: #f0f9ff; border: 2px dashed #3b82f6; border-radius: 8px; padding: 16px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 20px;">📋</span>
                            <h4 style="margin: 0; color: #1e40af; font-size: 16px;">Quick Import</h4>
                        </div>
                        <button type="button" id="toggleQuickImport" style="background: none; border: none; color: #3b82f6; cursor: pointer; font-size: 14px; font-weight: 500;">
                            Show ▼
                        </button>
                    </div>
                    <div id="quickImportContent" style="display: none;">
                        <p style="margin: 0 0 12px 0; color: #475569; font-size: 14px;">
                            Paste lender data here (from email, spreadsheet, etc.) and we'll auto-fill the form
                        </p>
                        <textarea id="quickImportTextarea"
                                  placeholder="Example:
Business Name: ABC Corporation
Monthly Revenue: $45,000
FICO Score: 680
State: NY
Industry: Retail
Position: 2nd
Business Start Date: 01/15/2020
Deposits Per Month: 15
Negative Days: 3"
                                  style="width: 100%; min-height: 140px; padding: 12px; font-size: 13px; font-family: monospace; border: 1px solid #cbd5e1; border-radius: 6px; resize: vertical; background: white;"></textarea>
                        <button type="button" id="importDataBtn"
                                style="margin-top: 10px; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600;">
                            Import Data
                        </button>
                        <button type="button" id="clearImportBtn"
                                style="margin-top: 10px; margin-left: 8px; padding: 10px 20px; background: #94a3b8; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600;">
                            Clear
                        </button>
                    </div>
                </div>

                <form id="lenderForm" class="lender-form">
                    <div class="form-row" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px;">
                        ${this.lenderFormFields.map(field => {
                            let value = '';
                            if (field.id === 'lenderBusinessName') value = businessName;
                            if (field.id === 'lenderRevenue') value = revenue;
                            return this.createFormField(field, value);
                        }).join('')}
                    </div>

                    <div class="checkbox-group" style="display: flex; flex-wrap: wrap; gap: 20px; margin: 20px 0; padding: 16px; background: #f8fafc; border-radius: 8px;">
                        ${this.lenderFormCheckboxes.map(field => this.createCheckboxField(field)).join('')}
                    </div>

                    <div style="margin-top: 16px;">
                        <label for="lenderCurrentPositions" style="display: block; margin-bottom: 6px; font-weight: 500; color: #374151;">Current Positions</label>
                        <input type="text"
                               id="lenderCurrentPositions"
                               placeholder="e.g., OnDeck $500 daily, Forward $750 weekly"
                               class="form-input"
                               style="width: 100%; padding: 12px; font-size: 14px; border: 1px solid #e5e7eb; border-radius: 6px;">
                    </div>

                    <div style="margin-top: 16px;">
                        <label for="lenderAdditionalNotes" style="display: block; margin-bottom: 6px; font-weight: 500; color: #374151;">Additional Notes</label>
                        <textarea id="lenderAdditionalNotes"
                                  placeholder="Any additional notes or special circumstances..."
                                  class="form-input"
                                  style="width: 100%; padding: 12px; min-height: 120px; font-size: 14px; resize: vertical; border: 1px solid #e5e7eb; border-radius: 6px;"></textarea>
                    </div>

                    <div class="form-actions" style="margin-top: 30px; margin-bottom: 40px; display: flex; gap: 15px; justify-content: center;">
                        <button type="submit" class="process-btn" id="processLendersBtn" style="
                            padding: 14px 32px;
                            background: #3b82f6;
                            color: white;
                            border: none;
                            border-radius: 8px;
                            font-size: 16px;
                            font-weight: 600;
                            cursor: pointer;
                            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                            transition: all 0.2s;
                            position: relative;
                            overflow: hidden;">
                            <span id="processLendersText">Process Lenders</span>
                            <span id="processLendersSpinner" style="display: none;">
                                <span style="display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-left: 8px;"></span>
                            </span>
                        </button>
                        <button type="button" class="clear-cache-btn" id="clearLenderCacheBtn" style="
                            padding: 14px 24px;
                            background: white;
                            color: #6b7280;
                            border: 2px solid #e5e7eb;
                            border-radius: 8px;
                            font-size: 15px;
                            font-weight: 500;
                            cursor: pointer;
                            transition: all 0.2s;">
                            Clear Cache
                        </button>
                    </div>

                    <div class="loading" id="lenderLoading" style="display: none; text-align: center; margin: 20px 0; font-size: 16px; color: #6b7280;">
                        <span style="display: inline-block; padding: 12px 24px; background: #f3f4f6; border-radius: 8px;">
                            Processing lenders...
                        </span>
                    </div>
                    <div class="error" id="lenderErrorMsg" style="display: none; margin: 20px 0; padding: 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626;"></div>
                </form>

                <div class="results" id="lenderResults" style="margin-bottom: 50px;"></div>
            </div>
        `;
    }

    createFormField(field, value = '') {
        const requiredMark = field.required ? '<span class="required">*</span>' : '';

        if (field.type === 'select') {
            return `
                <div class="form-group" style="width: 100%;">
                    <label for="${field.id}">${field.label} ${requiredMark}</label>
                    <select id="${field.id}"
                            class="form-input"
                            ${field.required ? 'required' : ''}
                            style="width: 100%;
                                   height: 40px;
                                   padding: 8px 12px;
                                   font-size: 14px;
                                   box-sizing: border-box;
                                   text-overflow: ellipsis;
                                   white-space: nowrap;
                                   overflow: hidden;">
                        ${field.options.map(opt =>
                            `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.label}</option>`
                        ).join('')}
                    </select>
                </div>
            `;
        }

        return `
            <div class="form-group" style="width: 100%;">
                <label for="${field.id}">${field.label} ${requiredMark}</label>
                <input type="${field.type}"
                       id="${field.id}"
                       class="form-input"
                       value="${value}"
                       placeholder="${field.placeholder || ''}"
                       style="width: 100%;
                              height: 40px;
                              padding: 8px 12px;
                              font-size: 14px;
                              box-sizing: border-box;"
                       ${field.required ? 'required' : ''}>
                ${field.id === 'lenderStartDate' ? '<div id="lenderTibDisplay" class="tib-display" style="display: none;"></div>' : ''}
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

    createLenderManagementTemplate() {
        return `
            <div class="lender-management-system" style="height: calc(100vh - 200px); display: flex; flex-direction: column;">
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
        const existingModal = document.getElementById('addLenderModal');
        if (existingModal) existingModal.remove();

        const modalHtml = `
            <div id="addLenderModal" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.7); z-index: 999999; display: flex; align-items: center; justify-content: center;">
                <div style="background: white; border-radius: 8px; padding: 0; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto;">
                    <div style="padding: 20px; border-bottom: 1px solid #e2e8f0;">
                        <h3 style="margin: 0;">Add New Lender</h3>
                    </div>
                    <div style="padding: 20px;">
                        <label style="display: block; font-weight: 600; margin-bottom: 5px; color: #334155;">Lender Name *</label>
                        <input type="text" id="newLenderName" placeholder="e.g., ABC Capital Lending" style="width: 100%; margin-bottom: 15px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px;">

                        <label style="display: block; font-weight: 600; margin-bottom: 5px; color: #334155;">Email Address *</label>
                        <input type="email" id="newLenderEmail" placeholder="e.g., deals@abclending.com" style="width: 100%; margin-bottom: 15px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px;">

                        <label style="display: block; font-weight: 600; margin-bottom: 5px; color: #334155;">Phone Number</label>
                        <input type="text" id="newLenderPhone" placeholder="(555) 123-4567" style="width: 100%; margin-bottom: 15px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px;">

                        <label style="display: block; font-weight: 600; margin-bottom: 5px; color: #334155;">Company Name</label>
                        <input type="text" id="newLenderCompany" placeholder="ABC Lending LLC" style="width: 100%; margin-bottom: 15px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px;">

                        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: 600; margin-bottom: 5px; color: #334155;">Min Amount ($)</label>
                                <input type="number" id="newLenderMinAmount" placeholder="10000" style="width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px;">
                            </div>
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: 600; margin-bottom: 5px; color: #334155;">Max Amount ($)</label>
                                <input type="number" id="newLenderMaxAmount" placeholder="500000" style="width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px;">
                            </div>
                        </div>

                        <label style="display: block; font-weight: 600; margin-bottom: 5px; color: #334155;">Industries (comma-separated)</label>
                        <input type="text" id="newLenderIndustries" placeholder="retail, construction, healthcare" style="width: 100%; margin-bottom: 15px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px;">

                        <label style="display: block; font-weight: 600; margin-bottom: 5px; color: #334155;">States (comma-separated)</label>
                        <input type="text" id="newLenderStates" placeholder="CA, NY, TX, FL" style="width: 100%; margin-bottom: 15px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px;">

                        <label style="display: block; font-weight: 600; margin-bottom: 5px; color: #334155;">Notes</label>
                        <textarea id="newLenderNotes" rows="3" placeholder="Additional notes about this lender..." style="width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px; resize: vertical;"></textarea>
                    </div>
                    <div style="padding: 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px;">
                        <button onclick="document.getElementById('addLenderModal').remove()" style="padding: 10px 20px; background: white; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; font-weight: 600;">Cancel</button>
                        <button onclick="window.conversationUI.lenders.saveLender()" style="padding: 10px 20px; background: #059669; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Add Lender</button>
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
            const result = await this.parent.apiCall(`/api/lenders/${lenderId}`, {
                method: 'PUT',
                body: JSON.stringify(lenderData)
            });

            if (result.success) {
                this.utils.showNotification('Lender updated successfully', 'success');
                document.getElementById('editLenderModal').remove();
                this.loadLendersList();
            } else {
                throw new Error(result.error || 'Failed to update lender');
            }
        } catch (error) {
            console.error('Error updating lender:', error);
            this.utils.showNotification('Failed to update lender: ' + error.message, 'error');
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