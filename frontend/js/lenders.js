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
            { id: 'lenderMercuryBank', label: 'Has Mercury Bank' },
            { id: 'lenderReverseConsolidation', label: 'Reverse Consolidation Only' }
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

            // Log Response button click
            if (e.target.classList.contains('log-response-btn') || e.target.closest('.log-response-btn')) {
                e.preventDefault();
                e.stopPropagation();
                const btn = e.target.classList.contains('log-response-btn') ? e.target : e.target.closest('.log-response-btn');
                const lenderName = btn.dataset.lender;
                this.openResponseModal(lenderName);
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
        const QUALIFICATION_URL = '/api/qualification/qualify';

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
                    reverseConsolidation: document.getElementById('lenderReverseConsolidation')?.checked || false,
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
                    const response = await fetch(QUALIFICATION_URL, {
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
                            await this.parent.apiCall(`/api/submissions/${conversationId}/qualifications/save`, {
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
            const result = await this.parent.apiCall(`/api/fcs/results/${conversationId}`);

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
        const conversation = this.parent.getSelectedConversation();
        console.log('🤖 Auto-filling lender form for:', conversationId);

        const populateField = (fieldId, value) => {
            const element = document.getElementById(fieldId);
            if (element && value) {
                element.value = value;
                if (fieldId === 'lenderStartDate') element.dispatchEvent(new Event('input'));
            }
        };

        const fcs = await this.fetchFCSData(conversationId);

        if (conversation && conversation.business_start_date) {
            const date = new Date(conversation.business_start_date);
            if (!isNaN(date.getTime())) {
                const formatted = date.toLocaleDateString('en-US', {
                    month: '2-digit', day: '2-digit', year: 'numeric'
                });
                populateField('lenderStartDate', formatted);
            }
        }

        if (!fcs) {
            if (conversation) {
                populateField('lenderBusinessName', conversation.business_name);
                populateField('lenderState', conversation.us_state || conversation.state);
                populateField('lenderIndustry', conversation.business_type);
                if (conversation.annual_revenue) {
                    populateField('lenderRevenue', Math.round(conversation.annual_revenue / 12));
                }
            }
            console.log('✨ Lender form populated (CRM only - no FCS)');
            return;
        }

        if (fcs.withholding_percentage) {
            populateField('lenderWithholding', fcs.withholding_percentage + '%');
            if (parseFloat(fcs.withholding_percentage) > 40) {
                const el = document.getElementById('lenderWithholding');
                if (el) el.style.borderColor = '#ef4444';
            }
        }

        if (fcs.report) {
            const report = fcs.report;
            console.log("✅ Parsing FCS Text Report...");

            const nameMatch = report.match(/Business Name:\s*(.+?)(?:•|\n|$)/i);
            if (nameMatch) populateField('lenderBusinessName', nameMatch[1].trim());

            const posMatch = report.match(/Looking for\s*(\d+)/i);
            if (posMatch) populateField('lenderPosition', posMatch[1]);

            const revMatch = report.match(/Average True Revenue:\s*\$([\d,]+)/i);
            if (revMatch) populateField('lenderRevenue', revMatch[1].replace(/,/g, ''));

            const negMatch = report.match(/Average Negative Days:\s*(\d+)/i);
            if (negMatch) populateField('lenderNegativeDays', negMatch[1]);

            const depMatch = report.match(/Average Number of Deposits:\s*(\d+)/i);
            if (depMatch) populateField('lenderDepositsPerMonth', depMatch[1]);

            const stateMatch = report.match(/State:\s*([A-Z]{2})/i);
            if (stateMatch) populateField('lenderState', stateMatch[1]);

            const indMatch = report.match(/Industry:\s*(.+?)(?:•|\n|$)/i);
            if (indMatch) populateField('lenderIndustry', indMatch[1].trim());
        }

        console.log('✨ Lender form populated from FCS');
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
                const tier = lender.tier || lender.Tier || 'Unranked';
                if (!tiers[tier]) tiers[tier] = [];
                tiers[tier].push(lender);
            });

            Object.keys(tiers).sort().forEach(tier => {
                html += `<div class="tier-group">`;
                html += `<div class="tier-header">Tier ${tier}</div>`;
                html += `<div class="lender-grid">`;
                tiers[tier].forEach(lender => {
                    const star = lender.isPreferred ? '⭐' : '';
                    const lenderName = lender['Lender Name'] || lender.name;
                    const prediction = lender.prediction;
                    let rateHtml = '';
                    if (prediction && prediction.successRate !== null) {
                        const rateClass = prediction.confidence || 'low';
                        rateHtml = `<span class="success-rate ${rateClass}" title="${prediction.factors?.join(', ') || 'Historical data'}">${prediction.successRate}%</span>`;
                    }
                    html += `
                        <div class="lender-tag" data-lender-name="${lenderName}">
                            ${lenderName} ${rateHtml}<span>${star}</span>
                            <button class="log-response-btn" data-lender="${lenderName}" title="Log Response">📝</button>
                        </div>
                    `;
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
            // 🔔 Fetch submission history first
            this.submissionHistory = await this.getSubmissionHistory();
            console.log(`📋 Found ${this.submissionHistory.length} previous submissions`);

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
            const result = await this.parent.apiCall(`/api/documents/${conversationId}`);

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

    async getSubmissionHistory() {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) return [];

        try {
            const result = await this.parent.apiCall(`/api/lenders/submissions/${conversationId}`);
            return result.submissions || [];
        } catch (error) {
            console.error('Error fetching submission history:', error);
            return [];
        }
    }

    populateSubmissionLenders() {
        const lenderList = document.getElementById('lenderSelectionList');
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

        // 🔔 Build lookup of already submitted lenders
        const submittedMap = new Map();
        (this.submissionHistory || []).forEach(sub => {
            submittedMap.set(sub.lender_name?.toLowerCase(), sub);
        });

        // 🔔 Separate into submitted vs available
        const alreadySubmitted = [];
        const available = [];

        displayList.forEach(lender => {
            const lenderName = (lender['Lender Name'] || lender.name || '').toLowerCase();
            const submission = submittedMap.get(lenderName);

            if (submission) {
                alreadySubmitted.push({ ...lender, submission });
            } else {
                available.push(lender);
            }
        });

        let html = '';

        // 🔔 SECTION 1: Already Submitted
        if (alreadySubmitted.length > 0) {
            html += `
                <div style="margin-bottom: 20px;">
                    <div style="font-size: 11px; font-weight: 700; color: #f59e0b; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; padding-left: 2px;">
                        📤 Already Submitted (${alreadySubmitted.length})
                    </div>
            `;

            alreadySubmitted.forEach(lender => {
                const lenderName = lender['Lender Name'] || lender.name;
                const sub = lender.submission;

                // Status badge
                let statusBadge = '';
                let statusColor = '#6b7280';

                if (sub.status === 'OFFER') {
                    statusBadge = sub.offer_amount
                        ? `OFFER $${Number(sub.offer_amount).toLocaleString()}`
                        : 'OFFER';
                    statusColor = '#10b981';
                } else if (sub.status === 'DECLINED' || sub.status === 'DECLINE') {
                    statusBadge = 'DECLINED';
                    statusColor = '#ef4444';
                } else {
                    statusBadge = sub.status || 'PENDING';
                    statusColor = '#6b7280';
                }

                // Format date
                const sentDate = sub.submitted_at
                    ? new Date(sub.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : '';

                html += `
                    <label class="selection-item" style="opacity: 0.7;">
                        <input type="checkbox" class="lender-checkbox" value="${lenderName}">
                        <div class="list-text" style="flex: 1;">
                            ${lenderName}
                            <span style="color: ${statusColor}; font-size: 11px; font-weight: 600; margin-left: 8px;">${statusBadge}</span>
                            ${sentDate ? `<span style="color: #6b7280; font-size: 10px; margin-left: 6px;">(${sentDate})</span>` : ''}
                        </div>
                    </label>
                `;
            });

            html += `</div>`;
        }

        // 🔔 SECTION 2: Available Lenders (grouped by tier)
        if (available.length > 0) {
            html += `
                <div style="margin-bottom: 16px;">
                    <div style="font-size: 11px; font-weight: 700; color: #10b981; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; padding-left: 2px;">
                        ✅ Available Lenders (${available.length})
                    </div>
            `;

            // Group by tier
            const lendersByTier = {};
            available.forEach(lender => {
                let tier = lender.Tier || 'Unknown';
                if (!lender.Tier && lender.blockingRule) tier = 'Restricted';
                if (!lendersByTier[tier]) lendersByTier[tier] = [];
                lendersByTier[tier].push(lender);
            });

            // Sort tiers (Restricted at bottom)
            const sortedTiers = Object.keys(lendersByTier).sort((a, b) => {
                if (a === 'Restricted') return 1;
                if (b === 'Restricted') return -1;
                return a.localeCompare(b);
            });

            sortedTiers.forEach(tier => {
                const headerColor = tier === 'Restricted' ? '#ef4444' : '#64748b';
                html += `<div style="font-size: 10px; font-weight: 600; color: ${headerColor}; margin: 12px 0 6px 4px;">Tier ${tier}</div>`;

                lendersByTier[tier].forEach(lender => {
                    const lenderName = lender['Lender Name'] || lender.name;
                    const isPreferred = lender.isPreferred;
                    const reason = lender.blockingRule ? `(${lender.blockingRule})` : '';

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
            });

            html += `</div>`;
        }

        lenderList.innerHTML = html;

        // Reset button text
        const toggleBtn = document.getElementById('toggleAllLendersBtn');
        if (toggleBtn) {
            toggleBtn.textContent = 'DESELECT ALL';
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
            const result = await this.parent.apiCall(`/api/documents/${conversationId}`);

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

            const selectedLenders = await Promise.all(selectedLenderCheckboxes.map(async (cb) => {
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

                // AGGRESSIVE EMAIL SEARCH: Try every possible variation from sheet
                let foundEmail =
                    lender.email ||
                    lender.Email ||
                    lender['Lender Email'] ||
                    lender['Lender Email Address'] ||
                    lender['Email Address'] ||
                    lender['contact_email'] ||
                    lender['email_address'] ||
                    null;

                // ✅ FIX: Find CC Email
                let foundCC = lender.cc_email || lender.cc || null;

                // 🔍 DATABASE FALLBACK: If no email in sheet, check database
                if (!foundEmail && lenderName) {
                    console.log(`🔍 No email in sheet for "${lenderName}", checking database...`);
                    try {
                        const dbLookup = await this.parent.apiCall(`/api/lenders/by-name/${encodeURIComponent(lenderName.trim())}`);
                        if (dbLookup?.success && dbLookup.email) {
                            foundEmail = dbLookup.email;
                            foundCC = dbLookup.cc_email || foundCC;
                            console.log(`✅ Found email in DB: ${foundEmail}`);
                        }
                    } catch (e) {
                        console.warn(`⚠️ DB lookup failed for ${lenderName}:`, e.message);
                    }
                }

                if (!foundEmail) {
                    console.error(`⚠️ WARNING: No email found for ${lenderName}. Available keys:`, Object.keys(lender));
                }

                return {
                    name: lenderName,
                    lender_name: lenderName,
                    email: foundEmail ? foundEmail.trim() : null,
                    cc_email: foundCC ? foundCC.trim() : null
                };
            }));

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
                industry: conversation?.industry_type || conversation?.industry || '',
                state: conversation?.us_state || '',
                monthlyRevenue: conversation?.monthly_revenue || 0,
                fico: conversation?.credit_score || '',
                tib: conversation?.time_in_business || '',
                position: conversation?.position || '',
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

            // 5. Send Request (Fire and Forget)
            const conversationId = this.parent.getCurrentConversationId();

            // Don't await - fire and forget
            this.parent.apiCall(`/api/submissions/${conversationId}/send`, {
                method: 'POST',
                body: JSON.stringify({
                    selectedLenders,
                    businessData,
                    documents: selectedDocuments
                })
            }).then(result => {
                console.log('📧 Background submission result:', result);
            }).catch(err => {
                console.error('📧 Background submission error:', err);
            });

            clearInterval(progressInterval);

            // 6. Immediate Success State (assume it worked)
            if (progressBar) progressBar.style.width = '100%';
            if (statusText) statusText.textContent = '✅ Queued Successfully!';

            setTimeout(() => {
                this.utils.showNotification(`Sending to ${selectedLenders.length} lenders in background!`, 'success');

                // Hide Overlay
                overlay.style.display = 'none';
                progressBar.style.width = '0%';

                // Close Modal
                document.getElementById('lenderSubmissionModal').style.display = 'none';
                document.getElementById('lenderSubmissionModal').classList.add('hidden');
            }, 500)

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

    // ==================== LENDER RESPONSE MODAL ====================

    openResponseModal(lenderName) {
        const modal = document.getElementById('lenderResponseModal');
        if (!modal) {
            console.error('Lender response modal not found');
            return;
        }

        // Generate modal HTML
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 450px;">
                <div class="modal-header">
                    <h3>Log Lender Response</h3>
                    <button id="closeLenderResponseModal" class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <input type="hidden" id="responseConversationId" value="${this.parent.getCurrentConversationId()}">
                    <input type="hidden" id="responseLenderName" value="${lenderName}">

                    <div class="form-group">
                        <label>Lender</label>
                        <input type="text" id="responseLenderDisplay" readonly class="form-input" style="background: #1a1a2e;" value="${lenderName}">
                    </div>

                    <div class="form-group">
                        <label>Status</label>
                        <select id="responseStatus" class="form-input">
                            <option value="">Select...</option>
                            <option value="OFFER">Offer Received</option>
                            <option value="APPROVED">Approved</option>
                            <option value="FUNDED">Funded</option>
                            <option value="DECLINED">Declined</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Position</label>
                        <select id="responsePosition" class="form-input">
                            <option value="">Select...</option>
                            <option value="1">1st Position</option>
                            <option value="2">2nd Position</option>
                            <option value="3">3rd Position</option>
                            <option value="4">4th Position</option>
                            <option value="5">5th Position</option>
                            <option value="6">6th Position</option>
                            <option value="7">7th Position</option>
                            <option value="8">8th Position</option>
                            <option value="9">9th Position</option>
                            <option value="10">10th Position</option>
                        </select>
                    </div>

                    <!-- NEW OFFER FIELDS -->
                    <div id="offerFields" style="display: none;">
                        <div class="form-section-header">New Offer Details</div>

                        <div class="form-row">
                            <div class="form-group half">
                                <label>Offer Amount ($)</label>
                                <input type="number" id="responseOfferAmount" class="form-input" placeholder="15000">
                            </div>
                            <div class="form-group half">
                                <label>Factor Rate</label>
                                <input type="text" id="responseFactorRate" class="form-input" placeholder="1.49">
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group half">
                                <label>Term Length</label>
                                <input type="number" id="responseTermLength" class="form-input" placeholder="60">
                            </div>
                            <div class="form-group half">
                                <label>Term Unit</label>
                                <select id="responseTermUnit" class="form-input">
                                    <option value="Days">Days</option>
                                    <option value="Weeks">Weeks</option>
                                    <option value="Months">Months</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Payment Frequency</label>
                            <select id="responsePaymentFrequency" class="form-input">
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="bi-weekly">Bi-Weekly</option>
                                <option value="monthly">Monthly</option>
                            </select>
                        </div>
                    </div>

                    <!-- PREVIOUS POSITION FIELDS (shows if position > 1) -->
                    <div id="prevPositionFields" style="display: none;">
                        <div class="form-section-header">Previous Position Info <span style="font-weight: normal; color: #888;">(optional)</span></div>

                        <div class="form-row">
                            <div class="form-group half">
                                <label>Amount ($)</label>
                                <input type="number" id="responsePrevAmount" class="form-input" placeholder="20000">
                            </div>
                            <div class="form-group half">
                                <label>Factor Rate</label>
                                <input type="text" id="responsePrevFactorRate" class="form-input" placeholder="1.35">
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group half">
                                <label>Term Length</label>
                                <input type="number" id="responsePrevTermLength" class="form-input" placeholder="90">
                            </div>
                            <div class="form-group half">
                                <label>Term Unit</label>
                                <select id="responsePrevTermUnit" class="form-input">
                                    <option value="">--</option>
                                    <option value="Days">Days</option>
                                    <option value="Weeks">Weeks</option>
                                    <option value="Months">Months</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group half">
                                <label>Payment Frequency</label>
                                <select id="responsePrevPaymentFrequency" class="form-input">
                                    <option value="">--</option>
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="bi-weekly">Bi-Weekly</option>
                                </select>
                            </div>
                            <div class="form-group half">
                                <label>Daily Withhold ($)</label>
                                <input type="number" id="responseDailyWithhold" class="form-input" placeholder="343">
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Days Into Stack</label>
                            <input type="number" id="responseDaysIntoStack" class="form-input" placeholder="45">
                        </div>
                    </div>

                    <!-- DECLINE FIELDS -->
                    <div id="declineFields" style="display: none;">
                        <div class="form-group">
                            <label>Decline Reason</label>
                            <textarea id="responseDeclineReason" class="form-input" rows="2" placeholder="e.g., Restricted industry"></textarea>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="cancelLenderResponse" class="btn btn-secondary">Cancel</button>
                    <button id="saveLenderResponse" class="btn btn-primary">Save Response</button>
                </div>
            </div>
        `;

        // Show modal
        modal.classList.remove('hidden');
        modal.classList.add('active');

        // Attach listeners (always re-attach since we regenerated HTML)
        this.attachResponseModalListeners();
    }

    attachResponseModalListeners() {
        const modal = document.getElementById('lenderResponseModal');

        // Status change - show/hide offer/decline fields
        const statusSelect = document.getElementById('responseStatus');
        statusSelect.onchange = () => {
            const status = statusSelect.value;
            document.getElementById('offerFields').style.display =
                ['OFFER', 'APPROVED', 'FUNDED'].includes(status) ? 'block' : 'none';
            document.getElementById('declineFields').style.display =
                status === 'DECLINED' ? 'block' : 'none';
        };

        // Position change - show prev position fields if > 1
        const positionSelect = document.getElementById('responsePosition');
        positionSelect.onchange = () => {
            const pos = parseInt(positionSelect.value) || 0;
            document.getElementById('prevPositionFields').style.display =
                pos > 1 ? 'block' : 'none';
        };

        // Close buttons
        document.getElementById('closeLenderResponseModal').onclick = () => {
            modal.classList.add('hidden');
        };
        document.getElementById('cancelLenderResponse').onclick = () => {
            modal.classList.add('hidden');
        };

        // Save button
        document.getElementById('saveLenderResponse').onclick = async () => {
            await this.saveLenderResponse();
        };

        // Click outside to close
        modal.onclick = (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        };
    }

    async saveLenderResponse() {
        const conversationId = document.getElementById('responseConversationId').value;
        const lenderName = document.getElementById('responseLenderName').value;
        const status = document.getElementById('responseStatus').value;

        if (!status) {
            this.utils.showNotification('Please select a status', 'warning');
            return;
        }

        const data = {
            conversation_id: conversationId,
            lender_name: lenderName,
            status: status
        };

        // Position
        const position = document.getElementById('responsePosition')?.value;
        if (position) data.position = parseInt(position);

        // New offer fields
        if (['OFFER', 'APPROVED', 'FUNDED'].includes(status)) {
            const amount = document.getElementById('responseOfferAmount')?.value;
            const factor = document.getElementById('responseFactorRate')?.value;
            const term = document.getElementById('responseTermLength')?.value;
            const termUnit = document.getElementById('responseTermUnit')?.value;
            const frequency = document.getElementById('responsePaymentFrequency')?.value;

            if (amount) data.offer_amount = parseFloat(amount);
            if (factor) data.factor_rate = parseFloat(factor);
            if (term) data.term_length = parseInt(term);
            if (termUnit) data.term_unit = termUnit;
            if (frequency) data.payment_frequency = frequency;
        }

        // Previous position fields (if position > 1)
        const pos = parseInt(position) || 0;
        if (pos > 1) {
            const prevAmount = document.getElementById('responsePrevAmount')?.value;
            const prevFactor = document.getElementById('responsePrevFactorRate')?.value;
            const prevTerm = document.getElementById('responsePrevTermLength')?.value;
            const prevTermUnit = document.getElementById('responsePrevTermUnit')?.value;
            const prevFreq = document.getElementById('responsePrevPaymentFrequency')?.value;
            const dailyWithhold = document.getElementById('responseDailyWithhold')?.value;
            const daysIntoStack = document.getElementById('responseDaysIntoStack')?.value;

            if (prevAmount) data.prev_amount = parseFloat(prevAmount);
            if (prevFactor) data.prev_factor_rate = parseFloat(prevFactor);
            if (prevTerm) data.prev_term_length = parseInt(prevTerm);
            if (prevTermUnit) data.prev_term_unit = prevTermUnit;
            if (prevFreq) data.prev_payment_frequency = prevFreq;
            if (dailyWithhold) data.total_daily_withhold = parseFloat(dailyWithhold);
            if (daysIntoStack) data.days_into_stack = parseInt(daysIntoStack);
        }

        // Decline reason
        if (status === 'DECLINED') {
            const reason = document.getElementById('responseDeclineReason')?.value;
            if (reason) data.decline_reason = reason;
        }

        try {
            const result = await this.parent.apiCall('/api/lenders/log-response', {
                method: 'POST',
                body: JSON.stringify(data)
            });

            if (result.success) {
                this.utils.showNotification('Response logged successfully', 'success');
                document.getElementById('lenderResponseModal').classList.add('hidden');

                // Update the lender tag to show the response
                this.updateLenderTagWithResponse(lenderName, status);
            } else {
                throw new Error(result.error || 'Failed to save');
            }
        } catch (err) {
            console.error('Error saving lender response:', err);
            this.utils.showNotification('Failed to save response: ' + err.message, 'error');
        }
    }

    updateLenderTagWithResponse(lenderName, status) {
        const lenderTags = document.querySelectorAll('.lender-tag');
        lenderTags.forEach(tag => {
            if (tag.dataset.lenderName === lenderName) {
                // Add status indicator based on status value
                const statusLower = status.toLowerCase();
                const statusIcon = ['offer', 'approved', 'funded'].includes(statusLower) ? '✅' :
                                   statusLower === 'declined' ? '❌' :
                                   statusLower === 'pending' ? '⏳' : '📋';

                // Remove any existing response classes
                tag.classList.remove('response-approved', 'response-declined', 'response-pending');

                // Add appropriate class
                if (['offer', 'approved', 'funded'].includes(statusLower)) {
                    tag.classList.add('response-approved');
                } else if (statusLower === 'declined') {
                    tag.classList.add('response-declined');
                } else {
                    tag.classList.add('response-pending');
                }

                // Update or add status badge
                let badge = tag.querySelector('.response-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'response-badge';
                    const logBtn = tag.querySelector('.log-response-btn');
                    if (logBtn) {
                        tag.insertBefore(badge, logBtn);
                    } else {
                        tag.appendChild(badge);
                    }
                }
                badge.textContent = statusIcon;
            }
        });
    }
}
