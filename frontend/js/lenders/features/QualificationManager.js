import { DOM } from '../ui/LenderDomMap.js';
import { parseFcsReport } from '../services/FcsParser.js';

export class QualificationManager {
    constructor({ parent, api, cache, utils, onResults, onSaveResults, onSkipToSend }) {
        this.parent = parent;
        this.api = api;
        this.cache = cache;
        this.utils = utils;
        this.onResults = onResults;
        this.onSaveResults = onSaveResults;
        this.onSkipToSend = onSkipToSend;
    }

    initializeLenderForm() {
        const QUALIFICATION_URL = '/api/qualification/qualify';

        this.bindGlobalListeners();
        setTimeout(() => this.initializeLenderFormCaching(), 100);

        const calculateTIB = (dateString) => {
            if (!dateString) return 0;
            const parts = dateString.split('/');
            if (parts.length === 3) {
                const month = parts[0].padStart(2, '0');
                const day = parts[1].padStart(2, '0');
                const year = parts[2];
                const startDate = new Date(`${year}-${month}-${day}`);
                if (!isNaN(startDate.getTime())) {
                    const today = new Date();
                    const monthsDiff = (today.getFullYear() - startDate.getFullYear()) * 12 +
                                     (today.getMonth() - startDate.getMonth());
                    return Math.max(0, monthsDiff);
                }
            }
            return 0;
        };

        const startDateInput = document.getElementById(DOM.FORM.INPUTS.START_DATE);
        const tibDisplay = document.getElementById('lenderTibDisplay');
        if (startDateInput && tibDisplay) {
            startDateInput.addEventListener('input', (e) => {
                const tib = calculateTIB(e.target.value);
                if (tib > 0) {
                    const years = Math.floor(tib / 12);
                    const months = tib % 12;
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

        const lenderForm = document.getElementById(DOM.FORM.ID);
        if (lenderForm && !lenderForm.dataset.listenerAttached) {
            lenderForm.dataset.listenerAttached = 'true';
            lenderForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const submitBtn = document.getElementById('processLendersBtn');
                const btnText = document.getElementById('processLendersText');
                const btnSpinner = document.getElementById('processLendersSpinner');

                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.style.opacity = '0.7';
                    submitBtn.style.transform = 'scale(0.98)';
                    submitBtn.style.cursor = 'not-allowed';
                }

                if (btnText) btnText.style.display = 'none';
                if (btnSpinner) btnSpinner.style.display = 'inline';

                const startDate = document.getElementById(DOM.FORM.INPUTS.START_DATE).value;
                const tib = calculateTIB(startDate) || 0;

                const criteria = {
                    businessName: document.getElementById(DOM.FORM.INPUTS.BUSINESS_NAME).value || 'Business',
                    requestedPosition: parseInt(document.getElementById(DOM.FORM.INPUTS.POSITION).value) || 1,
                    position: parseInt(document.getElementById(DOM.FORM.INPUTS.POSITION).value) || 1,
                    startDate: startDate,
                    tib: tib,
                    monthlyRevenue: parseInt(document.getElementById(DOM.FORM.INPUTS.REVENUE).value) || 0,
                    revenue: parseInt(document.getElementById(DOM.FORM.INPUTS.REVENUE).value) || 0,
                    fico: parseInt(document.getElementById(DOM.FORM.INPUTS.FICO).value) || 650,
                    state: document.getElementById(DOM.FORM.INPUTS.STATE).value?.toUpperCase() || '',
                    industry: document.getElementById(DOM.FORM.INPUTS.INDUSTRY).value || '',
                    depositsPerMonth: parseInt(document.getElementById(DOM.FORM.INPUTS.DEPOSITS).value) || 0,
                    negativeDays: parseInt(document.getElementById(DOM.FORM.INPUTS.NEGATIVE_DAYS).value) || 0,
                    withholding: document.getElementById(DOM.FORM.INPUTS.WITHHOLDING)?.value || null,
                    isSoleProp: document.getElementById(DOM.FORM.CHECKBOXES.SOLE_PROP)?.checked || false,
                    soleProp: document.getElementById(DOM.FORM.CHECKBOXES.SOLE_PROP)?.checked || false,
                    isNonProfit: document.getElementById(DOM.FORM.CHECKBOXES.NON_PROFIT)?.checked || false,
                    nonProfit: document.getElementById(DOM.FORM.CHECKBOXES.NON_PROFIT)?.checked || false,
                    hasMercuryBank: document.getElementById(DOM.FORM.CHECKBOXES.MERCURY_BANK)?.checked || false,
                    mercuryBank: document.getElementById(DOM.FORM.CHECKBOXES.MERCURY_BANK)?.checked || false,
                    reverseConsolidation: document.getElementById(DOM.FORM.CHECKBOXES.REVERSE_CONSOLIDATION)?.checked || false,
                    currentPositions: document.getElementById(DOM.FORM.INPUTS.CURRENT_POSITIONS)?.value || '',
                    additionalNotes: document.getElementById(DOM.FORM.INPUTS.ADDITIONAL_NOTES)?.value || ''
                };

                const loadingEl = document.getElementById('lenderLoading');
                const errorEl = document.getElementById('lenderErrorMsg');
                const resultsEl = document.getElementById(DOM.RESULTS.CONTAINER);

                loadingEl?.classList.add('active');
                errorEl?.classList.remove('active');
                resultsEl?.classList.remove('active');

                try {
                    const data = await this.api.qualify(criteria);
                    this.onResults?.(data, criteria);

                    const conversationId = this.parent.getCurrentConversationId();
                    if (conversationId) {
                        try {
                            await this.api.saveQualifications(conversationId, {
                                results: data,
                                criteria: criteria
                            });
                        } catch (saveError) {
                            console.error('⚠️ Failed to save results to DB:', saveError);
                        }
                    }
                } catch (error) {
                    console.error('Error:', error);
                    if (errorEl) {
                        errorEl.textContent = 'Error processing request. Please try again.';
                        errorEl.classList.add('active');
                    }
                } finally {
                    loadingEl?.classList.remove('active');

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

    bindGlobalListeners() {
        document.getElementById(DOM.FORM.BUTTONS.SKIP)?.addEventListener('click', () => {
            this.onSkipToSend?.();
        });
    }

    async populateLenderForm() {
        const conversationId = this.parent.getCurrentConversationId();
        const conversation = this.parent.getSelectedConversation();

        const populateField = (fieldId, value) => {
            const element = document.getElementById(fieldId);
            if (element && value) {
                element.value = value;
                if (fieldId === DOM.FORM.INPUTS.START_DATE) {
                    element.dispatchEvent(new Event('input'));
                }
            }
        };

        const fcs = await this.fetchFcsData(conversationId);

        if (conversation && conversation.business_start_date) {
            const date = new Date(conversation.business_start_date);
            if (!isNaN(date.getTime())) {
                const formatted = date.toLocaleDateString('en-US', {
                    month: '2-digit', day: '2-digit', year: 'numeric'
                });
                populateField(DOM.FORM.INPUTS.START_DATE, formatted);
            }
        }

        if (!fcs) {
            if (conversation) {
                populateField(DOM.FORM.INPUTS.BUSINESS_NAME, conversation.business_name);
                populateField(DOM.FORM.INPUTS.STATE, conversation.us_state || conversation.state);
                populateField(DOM.FORM.INPUTS.INDUSTRY, conversation.business_type);
                if (conversation.annual_revenue) {
                    populateField(DOM.FORM.INPUTS.REVENUE, Math.round(conversation.annual_revenue / 12));
                }
                if (conversation.credit_score) {
                    populateField(DOM.FORM.INPUTS.FICO, conversation.credit_score);
                }
            }
            return;
        }

        if (fcs.withholding_percentage) {
            populateField(DOM.FORM.INPUTS.WITHHOLDING, fcs.withholding_percentage + '%');
            if (parseFloat(fcs.withholding_percentage) > 40) {
                const el = document.getElementById(DOM.FORM.INPUTS.WITHHOLDING);
                if (el) el.style.borderColor = '#ef4444';
            }
        }

        if (fcs.report) {
            const parsed = parseFcsReport(fcs.report);
            if (parsed.businessName) populateField(DOM.FORM.INPUTS.BUSINESS_NAME, parsed.businessName);
            if (parsed.position) populateField(DOM.FORM.INPUTS.POSITION, parsed.position);
            if (parsed.revenue) populateField(DOM.FORM.INPUTS.REVENUE, parsed.revenue);
            if (parsed.negativeDays) populateField(DOM.FORM.INPUTS.NEGATIVE_DAYS, parsed.negativeDays);
            if (parsed.deposits) populateField(DOM.FORM.INPUTS.DEPOSITS, parsed.deposits);
            if (parsed.state) populateField(DOM.FORM.INPUTS.STATE, parsed.state);
            if (parsed.industry) populateField(DOM.FORM.INPUTS.INDUSTRY, parsed.industry);

            if (conversation && conversation.credit_score) {
                const ficoField = document.getElementById(DOM.FORM.INPUTS.FICO);
                if (ficoField && !ficoField.value) {
                    populateField(DOM.FORM.INPUTS.FICO, conversation.credit_score);
                }
            }
        }
    }

    async fetchFcsData(conversationId) {
        if (!conversationId) return null;
        try {
            const result = await this.api.fetchFcsResults(conversationId);
            if (result.success && result.analysis) return result.analysis;
            return null;
        } catch (error) {
            console.warn('⚠️ Could not load FCS data for autopopulation:', error);
            return null;
        }
    }

    initializeLenderFormCaching() {
        const conversationId = String(this.parent.getCurrentConversationId() || '');
        if (!conversationId) return;

        const cacheData = this.cache.getFormData(conversationId);
        if (cacheData) {
            Object.keys(cacheData).forEach(fieldId => {
                const element = document.getElementById(fieldId);
                if (element) {
                    if (element.type === 'checkbox') {
                        element.checked = cacheData[fieldId];
                    } else {
                        element.value = cacheData[fieldId];
                    }

                    if (fieldId === DOM.FORM.INPUTS.START_DATE) {
                        element.dispatchEvent(new Event('input'));
                    }
                }
            });
        }

        this.setupLenderFormAutoSave(conversationId);
        this.setupClearCacheButton(conversationId);
    }

    setupLenderFormAutoSave(conversationId) {
        const formFields = [
            DOM.FORM.INPUTS.BUSINESS_NAME,
            DOM.FORM.INPUTS.POSITION,
            DOM.FORM.INPUTS.START_DATE,
            DOM.FORM.INPUTS.REVENUE,
            DOM.FORM.INPUTS.FICO,
            DOM.FORM.INPUTS.STATE,
            DOM.FORM.INPUTS.INDUSTRY,
            DOM.FORM.INPUTS.DEPOSITS,
            DOM.FORM.INPUTS.NEGATIVE_DAYS,
            DOM.FORM.CHECKBOXES.SOLE_PROP,
            DOM.FORM.CHECKBOXES.NON_PROFIT,
            DOM.FORM.CHECKBOXES.MERCURY_BANK,
            DOM.FORM.CHECKBOXES.REVERSE_CONSOLIDATION,
            DOM.FORM.INPUTS.CURRENT_POSITIONS,
            DOM.FORM.INPUTS.ADDITIONAL_NOTES
        ];

        let saveTimeout;
        const debouncedSave = () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                this.saveLenderFormData(conversationId, formFields);
            }, 1000);
        };

        formFields.forEach(fieldId => {
            const element = document.getElementById(fieldId);
            if (element) {
                element.addEventListener('input', debouncedSave);
                element.addEventListener('change', debouncedSave);
            }
        });
    }

    saveLenderFormData(conversationId, formFields) {
        const formData = {};
        formFields.forEach(fieldId => {
            const element = document.getElementById(fieldId);
            if (element) {
                formData[fieldId] = element.type === 'checkbox' ? element.checked : element.value;
            }
        });

        const hasData = Object.values(formData).some(value => {
            return value !== '' && value !== false && value !== null && value !== undefined;
        });

        if (hasData) {
            this.cache.setFormData(conversationId, formData);
        }
    }

    setupClearCacheButton(conversationId) {
        const clearCacheBtn = document.getElementById(DOM.FORM.BUTTONS.CLEAR_CACHE);
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', () => {
                const confirmed = confirm('Are you sure you want to clear the cached form data?');
                if (confirmed) {
                    this.cache.clearFormData(String(conversationId || ''));
                    this.clearLenderFormFields();
                    this.populateLenderForm();
                    this.utils.showNotification('Form cache cleared successfully', 'success');
                }
            });
        }
    }

    clearLenderFormFields() {
        const formFields = [
            DOM.FORM.INPUTS.BUSINESS_NAME,
            DOM.FORM.INPUTS.POSITION,
            DOM.FORM.INPUTS.START_DATE,
            DOM.FORM.INPUTS.REVENUE,
            DOM.FORM.INPUTS.FICO,
            DOM.FORM.INPUTS.STATE,
            DOM.FORM.INPUTS.INDUSTRY,
            DOM.FORM.INPUTS.DEPOSITS,
            DOM.FORM.INPUTS.NEGATIVE_DAYS,
            DOM.FORM.CHECKBOXES.SOLE_PROP,
            DOM.FORM.CHECKBOXES.NON_PROFIT,
            DOM.FORM.CHECKBOXES.MERCURY_BANK,
            DOM.FORM.CHECKBOXES.REVERSE_CONSOLIDATION,
            DOM.FORM.INPUTS.CURRENT_POSITIONS,
            DOM.FORM.INPUTS.ADDITIONAL_NOTES
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
        if (tibDisplay) tibDisplay.classList.add('hidden');
    }

    restoreLenderFormCacheIfNeeded(retryCount = 0) {
        const maxRetries = 5;
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) {
            if (retryCount < maxRetries) {
                setTimeout(() => this.restoreLenderFormCacheIfNeeded(retryCount + 1), 500);
            }
            return;
        }

        const cachedData = this.cache.getFormData(conversationId);
        if (!cachedData) return;

        const requiredFields = [DOM.FORM.INPUTS.BUSINESS_NAME, DOM.FORM.INPUTS.REVENUE, DOM.FORM.INPUTS.STATE];
        let domReady = true;

        requiredFields.forEach(fieldId => {
            if (!document.getElementById(fieldId)) domReady = false;
        });

        if (!domReady) {
            if (retryCount < maxRetries) {
                setTimeout(() => this.restoreLenderFormCacheIfNeeded(retryCount + 1), 500);
            }
            return;
        }

        Object.keys(cachedData).forEach(fieldId => {
            const element = document.getElementById(fieldId);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = cachedData[fieldId];
                } else {
                    element.value = cachedData[fieldId];
                }

                if (fieldId === DOM.FORM.INPUTS.START_DATE && cachedData[fieldId]) {
                    element.dispatchEvent(new Event('input'));
                }
            }
        });
    }

    resetUI() {
        const resultsEl = document.getElementById(DOM.RESULTS.CONTAINER);
        if (resultsEl) {
            resultsEl.innerHTML = '';
            resultsEl.classList.remove('active');
        }

        const errorEl = document.getElementById('lenderErrorMsg');
        if (errorEl) errorEl.classList.remove('active');
    }
}
