// lenders.js - Complete lender qualification and management functionality

export default class LendersModule {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = parent.apiBaseUrl;
        this.utils = parent.utils;
        this.templates = parent.templates;

        // Lender state
        this.qualifiedLenders = [];
        this.lastLenderCriteria = null;
        this.lenderResultsCache = new Map();

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
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conversationId}/lenders/qualify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(businessData)
            });

            if (response.ok) {
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
                    tibDisplay.textContent = `${tib} months (${years} years, ${months} months) in business`;
                    tibDisplay.style.display = 'block';
                } else {
                    tibDisplay.style.display = 'none';
                }
            });
        }

        // Form submission
        const lenderForm = document.getElementById('lenderForm');
        if (lenderForm) {
            lenderForm.addEventListener('submit', async (e) => {
                e.preventDefault();

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
                    loadingEl.classList.remove('active');
                }
            });
        }
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
                    tibDisplay.textContent = `${tib} months (${years} years, ${months} months) in business`;
                    tibDisplay.style.display = 'block';
                }
            }
        }

        populateIfEmpty('lenderPosition', conversation.funding_amount);

        console.log('Lender form auto-populated');
    }

    displayLenderResults(data, criteria) {
        console.log('displayLenderResults called with:', { data, criteria });

        const { qualified, nonQualified, autoDropped, summary } = data;

        this.qualifiedLenders = qualified || [];
        this.lastLenderCriteria = criteria;

        console.log('Qualified lenders stored:', this.qualifiedLenders);

        let html = '';

        // Criteria info
        html += `
            <div class="criteria-info">
                <h4>📊 Merchant Criteria</h4>
                <div class="info-grid">
                    <div class="info-item"><strong>Business:</strong> ${criteria.businessName}</div>
                    <div class="info-item"><strong>Position:</strong> ${criteria.requestedPosition}</div>
                    <div class="info-item"><strong>TIB:</strong> ${criteria.tib} months</div>
                    <div class="info-item"><strong>Revenue:</strong> ${criteria.monthlyRevenue.toLocaleString()}</div>
                    <div class="info-item"><strong>FICO:</strong> ${criteria.fico}</div>
                    <div class="info-item"><strong>State:</strong> ${criteria.state}</div>
                    <div class="info-item"><strong>Industry:</strong> ${criteria.industry}</div>
                </div>
            </div>
        `;

        // Summary
        html += `
            <div class="summary">
                <div class="summary-item">
                    <div class="summary-number">${qualified?.length || 0}</div>
                    <div class="summary-label">Qualified</div>
                </div>
                <div class="summary-item">
                    <div class="summary-number">${nonQualified?.length || 0}</div>
                    <div class="summary-label">Non-Qualified</div>
                </div>
                <div class="summary-item">
                    <div class="summary-number">${autoDropped || 0}</div>
                    <div class="summary-label">Auto-Dropped</div>
                </div>
            </div>
        `;

        // Qualified lenders
        if (qualified && qualified.length > 0) {
            html += '<div class="results-section"><h3>✅ Qualified Lenders</h3>';

            const tiers = {};
            qualified.forEach(lender => {
                const tier = lender.Tier || 'Unknown';
                if (!tiers[tier]) tiers[tier] = [];
                tiers[tier].push(lender);
            });

            Object.keys(tiers).sort().forEach(tier => {
                html += `<div class="tier-group">`;
                html += `<div class="tier-title">Tier ${tier}</div>`;
                html += `<div class="lender-list">`;

                tiers[tier].forEach(lender => {
                    const preferred = lender.isPreferred ? ' preferred' : '';
                    const star = lender.isPreferred ? '⭐' : '';
                    html += `<div class="lender-item${preferred}">${lender['Lender Name']}${star}</div>`;
                });

                html += `</div></div>`;
            });

            html += `
                <div style="margin-top: 20px; text-align: center;">
                    <button id="sendToLendersBtn" class="btn btn-primary"
                            onclick="window.conversationUI.lenders.showLenderSubmissionModal()">
                        📧 Send to Lenders
                    </button>
                </div>
            `;
            html += '</div>';
        }

        // Non-qualified lenders
        if (nonQualified && nonQualified.length > 0) {
            html += '<div class="results-section"><h3>❌ Non-Qualified Lenders</h3>';
            const displayCount = Math.min(nonQualified.length, 20);
            nonQualified.slice(0, displayCount).forEach(item => {
                html += `
                    <div class="non-qualified-item">
                        <div class="lender-name">${item.lender}</div>
                        <div class="blocking-reason">${item.blockingRule}</div>
                    </div>
                `;
            });
            if (nonQualified.length > 20) {
                html += `<p style="color: #6b7280; text-align: center;">... and ${nonQualified.length - 20} more</p>`;
            }
            html += '</div>';
        }

        const resultsEl = document.getElementById('lenderResults');
        if (resultsEl) {
            resultsEl.innerHTML = html;
            resultsEl.classList.add('active');

            // Cache results
            const conversationId = this.parent.getCurrentConversationId();
            if (conversationId) {
                this.lenderResultsCache.set(conversationId, {
                    html: html,
                    data: data,
                    criteria: criteria
                });
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
                this.utils.showNotification('Form data restored from cache', 'info');
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
                    this.utils.showNotification(`Form data restored (${restored} fields)`, 'info');
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
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conversationId}/lenders`);
            const result = await response.json();

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
        console.log('showLenderSubmissionModal called');

        let modal = document.getElementById('lenderSubmissionModal');

        if (!modal) {
            console.log('Modal not found, creating dynamically...');
            this.createLenderSubmissionModal();
            modal = document.getElementById('lenderSubmissionModal');
        }

        if (modal) {
            // Load documents first before showing modal
            await this.ensureDocumentsLoaded();

            this.populateSubmissionLenders();
            this.populateSubmissionDocuments();
            this.prefillSubmissionMessage();
            modal.style.display = 'flex';
        } else {
            console.error('Failed to create lender submission modal');
        }
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
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conversationId}/documents`);
            const result = await response.json();

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

    createLenderSubmissionModal() {
        const modalHtml = `
            <div id="lenderSubmissionModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; align-items: center; justify-content: center;">
                <div style="background: white; border-radius: 8px; padding: 20px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 style="margin: 0;">Send Submissions to Lenders</h2>
                        <button onclick="document.getElementById('lenderSubmissionModal').style.display='none'" style="background: none; border: none; font-size: 24px; cursor: pointer;">×</button>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <h3 style="margin: 0;">Select Lenders</h3>
                            <button type="button" id="toggleAllLendersBtn"
                                    onclick="window.conversationUI.lenders.toggleAllLenders()"
                                    style="padding: 6px 16px; background: white; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-size: 14px;">
                                Deselect All
                            </button>
                        </div>
                        <div id="lenderSelectionList" style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; max-height: 200px; overflow-y: auto;">
                            Loading lenders...
                        </div>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <h3 style="margin: 0;">Select Documents</h3>
                            <button type="button" id="toggleAllDocumentsBtn"
                                    onclick="window.conversationUI.lenders.toggleAllDocuments()"
                                    style="padding: 6px 16px; background: white; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-size: 14px;">
                                Select All
                            </button>
                        </div>
                        <div id="submissionDocumentList" style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; max-height: 200px; overflow-y: auto;">
                            Loading documents...
                        </div>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <h3>Message</h3>
                        <textarea id="submissionMessage" rows="6" style="width: 100%; padding: 8px; border: 1px solid #e5e7eb; border-radius: 6px;"></textarea>
                    </div>

                    <div style="display: flex; justify-content: flex-end; gap: 10px;">
                        <button onclick="document.getElementById('lenderSubmissionModal').style.display='none'" style="padding: 8px 16px; border: 1px solid #e5e7eb; background: white; border-radius: 6px; cursor: pointer;">Cancel</button>
                        <button onclick="window.conversationUI.lenders.sendLenderSubmissions()" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">
                            <span id="sendSubmissionsText">Send Submissions</span>
                            <span id="sendSubmissionsLoading" style="display: none;">Sending...</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    populateSubmissionLenders() {
        const lenderList = document.getElementById('lenderSelectionList');
        if (!lenderList || !this.qualifiedLenders) {
            if (lenderList) {
                lenderList.innerHTML = '<p style="color: #6b7280;">No qualified lenders available.</p>';
            }
            return;
        }

        if (this.qualifiedLenders.length === 0) {
            lenderList.innerHTML = '<p style="color: #6b7280;">No qualified lenders available.</p>';
            return;
        }

        const lendersByTier = {};
        this.qualifiedLenders.forEach(lender => {
            const tier = lender.Tier || 'Unknown';
            if (!lendersByTier[tier]) lendersByTier[tier] = [];
            lendersByTier[tier].push(lender);
        });

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
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conversationId}/documents`);
            const result = await response.json();

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
                    cleanLender.email = lender.email || lender.Email || lender['Lender Email'] ||
                                       `${lenderName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@lender.com`;
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

            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conversationId}/send-to-lenders`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    selectedLenders: selectedLenders,
                    businessData: businessData,
                    documents: selectedDocuments
                })
            });

            const result = await response.json();

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
            const response = await fetch(`${this.apiBaseUrl}/api/lenders`);
            if (response.ok) {
                const lenders = await response.json();
                this.displayLendersList(lenders);
            } else {
                throw new Error('Failed to load lenders');
            }
        } catch (error) {
            console.error('Error loading lenders:', error);
            this.displayLendersError('Failed to load lenders');
        }
    }

    displayLendersList(lenders) {
        const container = document.getElementById('lendersTableContainer');

        if (!lenders || lenders.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h4>No Lenders Found</h4>
                    <p>Start by adding your first lender to the database.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <table class="lenders-table">
                <thead>
                    <tr>
                        <th>Lender Name</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${lenders.map(lender => `
                        <tr>
                            <td style="font-weight: 500;">${lender.name}</td>
                            <td>
                                <div class="action-buttons">
                                    <button class="action-btn edit" onclick="window.conversationUI.lenders.editLender('${lender.id}')">
                                        Edit
                                    </button>
                                    <button class="action-btn delete" onclick="window.conversationUI.lenders.deleteLender('${lender.id}', '${lender.name}')">
                                        Delete
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    // Templates
    createLenderFormTemplate(conversationData = {}) {
        return `
            <div class="lender-qualification-system">
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
            <div class="lender-form-content">
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

                    <div class="form-row" style="margin-top: 16px;">
                        <div class="form-group" style="width: 100%;">
                            <label for="lenderCurrentPositions">Current Positions</label>
                            <input type="text" id="lenderCurrentPositions" placeholder="e.g., OnDeck $500 daily, Forward $750 weekly" class="form-input" style="width: 100%; padding: 8px 12px;">
                        </div>
                    </div>

                    <div class="form-row" style="margin-top: 16px;">
                        <div class="form-group" style="width: 100%;">
                            <label for="lenderAdditionalNotes">Additional Notes</label>
                            <textarea id="lenderAdditionalNotes" placeholder="Any additional notes..." class="form-input" style="width: 100%; padding: 8px 12px; min-height: 80px;"></textarea>
                        </div>
                    </div>

                    <div class="form-actions" style="display: flex; gap: 10px; margin-top: 20px;">
                        <button type="submit" class="process-btn">Process Lenders</button>
                        <button type="button" class="clear-cache-btn" id="clearLenderCacheBtn">Clear Cache</button>
                    </div>

                    <div class="loading" id="lenderLoading">Processing lenders...</div>
                    <div class="error" id="lenderErrorMsg"></div>
                </form>

                <div class="results" id="lenderResults"></div>
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
            <div class="lender-management-system">
                <div class="lender-mgmt-header">
                    <h3>Lender Management</h3>
                    <p>Add, edit, and manage your lender database</p>
                </div>

                <div class="lender-mgmt-content">
                    <div class="mgmt-actions">
                        <button class="mgmt-btn primary" onclick="window.conversationUI.lenders.showAddLenderModal()">
                            Add New Lender
                        </button>
                        <button class="mgmt-btn secondary" onclick="window.conversationUI.lenders.refreshLendersList()">
                            Refresh
                        </button>
                    </div>

                    <div id="lendersTableContainer">
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
                        <input type="text" id="newLenderName" placeholder="Lender Name *" style="width: 100%; margin-bottom: 10px; padding: 8px;">
                        <input type="email" id="newLenderEmail" placeholder="Email *" style="width: 100%; margin-bottom: 10px; padding: 8px;">
                        <input type="text" id="newLenderPhone" placeholder="Phone" style="width: 100%; margin-bottom: 10px; padding: 8px;">
                        <input type="text" id="newLenderCompany" placeholder="Company" style="width: 100%; margin-bottom: 10px; padding: 8px;">
                        <input type="number" id="newLenderMinAmount" placeholder="Min Amount" style="width: 48%; margin-bottom: 10px; padding: 8px;">
                        <input type="number" id="newLenderMaxAmount" placeholder="Max Amount" style="width: 48%; margin-bottom: 10px; padding: 8px; float: right;">
                        <input type="text" id="newLenderIndustries" placeholder="Industries (comma-separated)" style="width: 100%; margin-bottom: 10px; padding: 8px; clear: both;">
                        <input type="text" id="newLenderStates" placeholder="States (comma-separated)" style="width: 100%; margin-bottom: 10px; padding: 8px;">
                        <textarea id="newLenderNotes" rows="3" placeholder="Notes" style="width: 100%; padding: 8px;"></textarea>
                    </div>
                    <div style="padding: 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px;">
                        <button onclick="document.getElementById('addLenderModal').remove()">Cancel</button>
                        <button onclick="window.conversationUI.lenders.saveLender()" style="background: #059669; color: white; padding: 8px 16px; border-radius: 4px;">Save</button>
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
            const response = await fetch(`${this.apiBaseUrl}/api/lenders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(lenderData)
            });

            if (response.ok) {
                this.utils.showNotification('Lender added successfully', 'success');
                document.getElementById('addLenderModal').remove();
                this.loadLendersList();
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Failed to add lender');
            }
        } catch (error) {
            console.error('Error adding lender:', error);
            this.utils.showNotification('Failed to add lender: ' + error.message, 'error');
        }
    }

    async editLender(lenderId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/lenders/${lenderId}`);
            if (!response.ok) {
                throw new Error('Failed to fetch lender data');
            }

            const lender = await response.json();
            this.showEditLenderModal(lender);

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
                        <input type="text" id="editLenderName" value="${lender.name || ''}" style="width: 100%; margin-bottom: 10px; padding: 8px;">
                        <input type="email" id="editLenderEmail" value="${lender.email || ''}" style="width: 100%; margin-bottom: 10px; padding: 8px;">
                        <input type="text" id="editLenderPhone" value="${lender.phone || ''}" style="width: 100%; margin-bottom: 10px; padding: 8px;">
                        <input type="text" id="editLenderCompany" value="${lender.company || ''}" style="width: 100%; margin-bottom: 10px; padding: 8px;">
                        <input type="number" id="editLenderMinAmount" value="${lender.min_amount || 0}" style="width: 48%; margin-bottom: 10px; padding: 8px;">
                        <input type="number" id="editLenderMaxAmount" value="${lender.max_amount || 0}" style="width: 48%; margin-bottom: 10px; padding: 8px; float: right;">
                        <input type="text" id="editLenderIndustries" value="${industriesStr}" style="width: 100%; margin-bottom: 10px; padding: 8px; clear: both;">
                        <input type="text" id="editLenderStates" value="${statesStr}" style="width: 100%; margin-bottom: 10px; padding: 8px;">
                        <textarea id="editLenderNotes" rows="3" style="width: 100%; padding: 8px;">${lender.notes || ''}</textarea>
                    </div>
                    <div style="padding: 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px;">
                        <button onclick="document.getElementById('editLenderModal').remove()">Cancel</button>
                        <button onclick="window.conversationUI.lenders.updateLender('${lender.id}')" style="background: #3b82f6; color: white; padding: 8px 16px; border-radius: 4px;">Update</button>
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
            const response = await fetch(`${this.apiBaseUrl}/api/lenders/${lenderId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(lenderData)
            });

            if (response.ok) {
                this.utils.showNotification('Lender updated successfully', 'success');
                document.getElementById('editLenderModal').remove();
                this.loadLendersList();
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Failed to update lender');
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
            const response = await fetch(`${this.apiBaseUrl}/api/lenders/${lenderId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
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

        if (!checkboxes.length) {
            console.log('No checkboxes found');
            return;
        }

        if (!toggleBtn) {
            console.log('Toggle button not found');
            return;
        }

        // Check current state - are any checked?
        const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
        const allChecked = checkedCount === checkboxes.length;

        // Determine new state
        let newState;
        if (allChecked) {
            // If all are checked, uncheck all
            newState = false;
            toggleBtn.textContent = 'Select All';
        } else {
            // If some or none are checked, check all
            newState = true;
            toggleBtn.textContent = 'Deselect All';
        }

        // Apply new state to all checkboxes
        checkboxes.forEach(checkbox => {
            checkbox.checked = newState;
        });

        console.log(`Toggled ${checkboxes.length} lenders to ${newState ? 'selected' : 'deselected'}`);
    }

    toggleAllDocuments() {
        const checkboxes = document.querySelectorAll('#submissionDocumentList input[type="checkbox"]');
        const toggleBtn = document.getElementById('toggleAllDocumentsBtn');

        if (!checkboxes.length) {
            console.log('No document checkboxes found');
            return;
        }

        if (!toggleBtn) {
            console.log('Toggle documents button not found');
            return;
        }

        // Check current state
        const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
        const allChecked = checkedCount === checkboxes.length;

        // Determine new state
        let newState;
        if (allChecked) {
            newState = false;
            toggleBtn.textContent = 'Select All';
        } else {
            newState = true;
            toggleBtn.textContent = 'Deselect All';
        }

        // Apply new state to all checkboxes
        checkboxes.forEach(checkbox => {
            checkbox.checked = newState;
        });

        console.log(`Toggled ${checkboxes.length} documents to ${newState ? 'selected' : 'deselected'}`);
    }
}