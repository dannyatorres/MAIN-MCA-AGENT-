// lenders.js - Complete lender qualification and management functionality

class LendersModule {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = parent.apiBaseUrl;
        this.utils = parent.utils;
        this.templates = parent.templates;

        // Lender state
        this.qualifiedLenders = [];
        this.nonQualifiedLenders = [];
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
                    this.nonQualifiedLenders = parsed.data.nonQualified || [];
                    this.displayLenderResults(parsed.data, parsed.criteria);
                } else {
                    localStorage.removeItem(`lender_results_${conversationId}`);
                }
            }
        } catch (e) {
            console.error('Error restoring cached results', e);
        }
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
        const conversationId = this.parent.getCurrentConversationId();
        console.log('🤖 Auto-filling lender form for:', conversationId);

        // Helper to safely set values
        const populateField = (fieldId, value) => {
            const element = document.getElementById(fieldId);
            // Only set if we found a value AND the element exists
            if (element && value) {
                element.value = value;
                // Trigger input event (updates TIB calculator, etc.)
                if (fieldId === 'lenderStartDate') element.dispatchEvent(new Event('input'));
            }
        };

        // 1. Get the data
        const fcs = await this.fetchFCSData(conversationId);

        if (!fcs || !fcs.report) {
            console.warn('⚠️ No FCS Report found. Falling back to CRM defaults.');
            // Fallback: Fill basic info from CRM if FCS fails
            const conversation = this.parent.getSelectedConversation();
            if (conversation) {
                populateField('lenderBusinessName', conversation.business_name);
                populateField('lenderState', conversation.state);
                populateField('lenderIndustry', conversation.business_type);
                if (conversation.annual_revenue) {
                    populateField('lenderRevenue', Math.round(conversation.annual_revenue / 12));
                }
            }
            return;
        }

        const report = fcs.report;
        console.log("✅ FCS Text Report Found! Parsing...");

        // --- 2. PARSE THE TEXT REPORT ---

        // Business Name: "Business Name: COYOTE CONSTRUCTION..."
        const nameMatch = report.match(/Business Name:\s*(.+?)(?:•|\n|$)/i);
        if (nameMatch) populateField('lenderBusinessName', nameMatch[1].trim());

        // Position: "Position: 0 active -> Looking for 1st"
        // We look for "Looking for X" to get the number "1"
        const posMatch = report.match(/Looking for\s*(\d+)/i);
        if (posMatch) {
            populateField('lenderPosition', posMatch[1]);
        }

        // Revenue: "Average True Revenue: $39,720"
        const revMatch = report.match(/Average True Revenue:\s*\$([\d,]+)/i);
        if (revMatch) {
            // Remove commas to get raw number (39720)
            populateField('lenderRevenue', revMatch[1].replace(/,/g, ''));
        }

        // Negative Days: "Average Negative Days: 3"
        // (This skips the "Total Negative Days: 10" and grabs the Average instead)
        const negMatch = report.match(/Average Negative Days:\s*(\d+)/i);
        if (negMatch) {
            populateField('lenderNegativeDays', negMatch[1]);
        }

        // Deposits: "Average Number of Deposits: 16"
        const depMatch = report.match(/Average Number of Deposits:\s*(\d+)/i);
        if (depMatch) {
            populateField('lenderDepositsPerMonth', depMatch[1]);
        }

        // State: "State: TX"
        const stateMatch = report.match(/State:\s*([A-Z]{2})/i);
        if (stateMatch) {
            populateField('lenderState', stateMatch[1]);
        }

        // Industry: "Industry: Construction"
        const indMatch = report.match(/Industry:\s*(.+?)(?:•|\n|$)/i);
        if (indMatch) {
            populateField('lenderIndustry', indMatch[1].trim());
        }

        // We specifically DO NOT populate 'lenderWithholding' here,
        // keeping it clean as you requested.

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
            // Ensure we have a standard name and email for these too
            name: item.name || item.lender || item['Lender Name'] || 'Unknown',
            lender_name: item.name || item.lender || item['Lender Name'],
            email: item.email || item['Lender Email'] || item['contact_email'] || null, // ✅ Capture Email
            blockingRule: item.blockingRule || item.reason || 'Unknown reason'
        }));

        // ✅ STEP 2: Save BOTH lists
        this.qualifiedLenders = cleanQualified;
        this.nonQualifiedLenders = cleanNonQualified; // <--- ADD THIS LINE
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

        const modal = document.getElementById('lenderSubmissionModal');

        if (!modal) {
            console.error('❌ Lender submission modal not found in DOM');
            this.utils.showNotification('Modal not found', 'error');
            return;
        }

        // ✅ FIX: Clear the search input so previous searches don't persist
        const searchInput = document.getElementById('lenderSearchInput');
        if (searchInput) {
            searchInput.value = '';
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
        modal.style.display = '';
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

        // Toggle Show All / Override
        attachListener('showAllLendersToggle', (e) => {
            lendersModule.populateSubmissionLenders();
        }, 'change');

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
        // ✅ Check the toggle state
        const showAll = document.getElementById('showAllLendersToggle')?.checked || false;

        if (!lenderList) return;

        // Combine lists if toggle is ON
        let displayList = [...(this.qualifiedLenders || [])];
        if (showAll && this.nonQualifiedLenders) {
            displayList = [...displayList, ...this.nonQualifiedLenders];
        }

        if (displayList.length === 0) {
            lenderList.innerHTML = '<p style="color: #6b7280; padding: 10px;">No lenders available.</p>';
            return;
        }

        // Group by tier (Non-Qualified gets a special tier)
        const lendersByTier = {};
        displayList.forEach(lender => {
            // If it's from the non-qualified list, label it "Restricted"
            let tier = lender.Tier || 'Unknown';
            if (!lender.Tier && lender.blockingRule) tier = 'Restricted';

            if (!lendersByTier[tier]) lendersByTier[tier] = [];
            lendersByTier[tier].push(lender);
        });

        let html = '';
        // Custom sort to put "Restricted" at the bottom
        const sortedTiers = Object.keys(lendersByTier).sort((a, b) => {
            if (a === 'Restricted') return 1;
            if (b === 'Restricted') return -1;
            return a.localeCompare(b);
        });

        sortedTiers.forEach(tier => {
            html += `<div style="margin-bottom: 16px;">`;

            // Tier Header with color for Restricted
            const headerColor = tier === 'Restricted' ? '#ef4444' : '#64748b';
            html += `<div style="font-size: 11px; font-weight: 700; color: ${headerColor}; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; padding-left: 2px;">Tier ${tier}</div>`;

            lendersByTier[tier].forEach(lender => {
                const lenderName = lender['Lender Name'] || lender.name;
                const isPreferred = lender.isPreferred;
                const reason = lender.blockingRule ? `(${lender.blockingRule})` : '';

                // ✅ APPLIED: "selection-item" class for the card look
                html += `
                    <label class="selection-item">
                        <input type="checkbox" class="lender-checkbox" value="${lenderName}" checked>
                        <div class="list-text">
                            ${lenderName}
                            ${isPreferred ? '<span style="color:#3b82f6; margin-left:6px;">★</span>' : ''}
                            ${reason ? `<span style="color:#ef4444; font-size:11px; margin-left:6px;">${reason}</span>` : ''}
                        </div>
                    </label>
                `;
            });
            html += `</div>`;
        });

        lenderList.innerHTML = html;

        // Reset button text
        const toggleBtn = document.getElementById('toggleAllLendersBtn');
        if (toggleBtn) {
            toggleBtn.textContent = 'DESELECT ALL'; // Caps to match new style
            toggleBtn.className = 'action-link';
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

            let iconClass = 'fas fa-file-alt';
            let colorStyle = 'color: #64748b;';
            const lowerName = name.toLowerCase();

            if (lowerName.endsWith('.pdf')) { iconClass = 'fas fa-file-pdf'; colorStyle = 'color: #ef4444;'; }
            else if (lowerName.match(/\.(jpg|jpeg|png)$/)) { iconClass = 'fas fa-file-image'; colorStyle = 'color: #3b82f6;'; }
            else if (lowerName.match(/\.(xls|xlsx|csv)$/)) { iconClass = 'fas fa-file-excel'; colorStyle = 'color: #10b981;'; }

            // ✅ APPLIED: "selection-item" class
            html += `
                <label class="selection-item">
                    <input type="checkbox" class="document-checkbox" value="${doc.id}" ${isImportant ? 'checked' : ''}>
                    <div style="margin-right: 10px; font-size: 16px; ${colorStyle}"><i class="${iconClass}"></i></div>
                    <div class="list-text" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</div>
                </label>
            `;
        });

        docList.innerHTML = html;

        const toggleBtn = document.getElementById('toggleAllDocumentsBtn');
        if (toggleBtn) {
            const checkboxes = docList.querySelectorAll('input[type="checkbox"]');
            const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
            toggleBtn.textContent = checkedCount === checkboxes.length ? 'DESELECT ALL' : 'SELECT ALL';
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

        const businessName = conversation.business_name || 'the client';

        // ✅ SIMPLIFIED TEMPLATE: No data list, just the business name
        const message = `Hello,

Please find attached the funding application and supporting documents for ${businessName}.

Please review and let me know if you need any additional information.

Best regards`;

        messageField.value = message;
    }

    async sendLenderSubmissions() {
        console.log('Starting lender submission');

        try {
            // 1. GET & PREPARE SELECTED LENDERS
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

            const selectedLenders = selectedLenderCheckboxes.map(cb => {
                const lenderName = cb.value;

                // ✅ FIX: Search BOTH lists to find the lender data object
                const allLenders = [...(this.qualifiedLenders || []), ...(this.nonQualifiedLenders || [])];

                const lender = allLenders.find(l =>
                    (l['Lender Name'] === lenderName) || (l.name === lenderName)
                );

                if (!lender) {
                    console.error(`❌ Fatal Error: Could not find data for lender "${lenderName}"`);
                    return { name: lenderName, email: null };
                }

                // 🕵️ DEBUG: Print the raw object to console so we can see the property names
                console.log(`🔍 Inspecting "${lenderName}" data:`, lender);

                // AGGRESSIVE EMAIL SEARCH: Try every possible variation
                const foundEmail =
                    lender.email ||
                    lender.Email ||
                    lender['Lender Email'] ||
                    lender['Lender Email Address'] ||
                    lender['Email Address'] ||
                    lender['contact_email'] ||
                    lender['email_address'] ||
                    null;

                // ✅ FIX: Find CC Email
                const foundCC = lender.cc_email || lender.cc || null;

                if (!foundEmail) {
                    console.error(`⚠️ WARNING: No email found for ${lenderName}. Available keys:`, Object.keys(lender));
                }

                return {
                    name: lenderName,
                    lender_name: lenderName,
                    email: foundEmail ? foundEmail.trim() : null,
                    cc_email: foundCC ? foundCC.trim() : null // <--- ADD THIS LINE
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
