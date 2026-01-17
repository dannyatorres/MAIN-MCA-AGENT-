import { LenderApiService } from './services/LenderApiService.js';
import { LenderCacheService } from './services/LenderCacheService.js';
import { QualificationManager } from './features/QualificationManager.js';
import { SubmissionManager } from './features/SubmissionManager.js';
import { ResponseManager } from './features/ResponseManager.js';
import { LenderTemplates } from './ui/LenderTemplates.js';
import { DOM } from './ui/LenderDomMap.js';

export default class LenderController {
    constructor(parent) {
        this.parent = parent;
        this.utils = parent.utils;

        this.qualifiedLenders = [];
        this.nonQualifiedLenders = [];
        this.lastLenderCriteria = null;

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
            { id: 'lenderReverseConsolidation', label: 'Reverse Consolidation' }
        ];

        this.api = new LenderApiService(parent.apiCall.bind(parent));
        this.cache = new LenderCacheService();

        this.qualification = new QualificationManager({
            parent,
            api: this.api,
            cache: this.cache,
            utils: this.utils,
            onResults: (data, criteria) => this.displayLenderResults(data, criteria),
            onSaveResults: (data, criteria) => this.cacheResults(data, criteria),
            onSkipToSend: () => this.skipToSendModal()
        });

        this.submission = new SubmissionManager({
            parent,
            api: this.api,
            utils: this.utils,
            getQualifiedLenders: () => this.qualifiedLenders,
            getNonQualifiedLenders: () => this.nonQualifiedLenders
        });

        this.response = new ResponseManager({
            api: this.api,
            utils: this.utils,
            onResponseSaved: (lenderName, status) => this.updateLenderTagWithResponse(lenderName, status)
        });

        this.init();
    }

    init() {
        this.setupGlobalEventListeners();
    }

    setupGlobalEventListeners() {
        document.body.addEventListener('click', (e) => this.handleGlobalClicks(e));
    }

    handleGlobalClicks(e) {
        const target = e.target;

        if (target.id === 'sendToLendersBtn' || target.closest('#sendToLendersBtn')) {
            e.preventDefault();
            const conversationId = this.parent.getCurrentConversationId();
            const docs = this.parent.documents?.currentDocuments || [];
            this.submission.openModal(conversationId, docs);
        }

        if (target.classList.contains('log-response-btn') || target.closest('.log-response-btn')) {
            e.preventDefault();
            e.stopPropagation();
            const btn = target.classList.contains('log-response-btn') ? target : target.closest('.log-response-btn');
            const lenderName = btn.dataset.lender;
            this.response.openModal(lenderName, this.parent.getCurrentConversationId());
        }
    }

    clearData() {
        this.qualifiedLenders = [];
        this.lastLenderCriteria = null;
        this.qualification.resetUI();
    }

    createLenderFormTemplate(conversationData = {}) {
        return LenderTemplates.renderForm(
            conversationData,
            this.lenderFormFields,
            this.lenderFormCheckboxes
        );
    }

    initializeLenderForm() {
        this.qualification.initializeLenderForm();
    }

    populateLenderForm() {
        return this.qualification.populateLenderForm();
    }

    restoreCachedResults() {
        const conversationId = String(this.parent.getCurrentConversationId() || '');
        if (!conversationId) return;

        const cached = this.cache.getResults(conversationId);
        if (!cached) return;

        const oneDay = 24 * 60 * 60 * 1000;
        if (Date.now() - cached.timestamp < oneDay) {
            this.qualifiedLenders = cached.data.qualified || [];
            this.nonQualifiedLenders = cached.data.nonQualified || [];
            this.displayLenderResults(cached.data, cached.criteria);
        } else {
            this.cache.clearResults(conversationId);
        }
    }

    restoreLenderFormCacheIfNeeded(retryCount = 0) {
        this.qualification.restoreLenderFormCacheIfNeeded(retryCount);
    }

    showLenderModal() {
        this.utils.showModal('lenderModal');
    }

    hideLenderModal() {
        this.utils.hideModal('lenderModal');
    }

    async skipToSendModal() {
        console.log('⏩ Skipping qualification, loading all lenders...');

        const btn = document.getElementById(DOM.FORM.BUTTONS.SKIP);
        const originalText = btn?.innerHTML;

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        }

        try {
            const result = await this.api.fetchAllLenders();
            if (result.success && result.lenders) {
                this.qualifiedLenders = result.lenders;
                this.nonQualifiedLenders = [];

                await this.showLenderSubmissionModal();
            } else {
                throw new Error('Failed to load lenders');
            }
        } catch (error) {
            console.error('❌ Error skipping to send modal:', error);
            this.utils.showNotification('Failed to load lenders', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    }

    async showLenderSubmissionModal() {
        const conversationId = this.parent.getCurrentConversationId();
        const docs = this.parent.documents?.currentDocuments || [];
        await this.submission.openModal(conversationId, docs);
    }

    displayLenderResults(data, criteria) {
        const cleanQualified = (data.qualified || []).map(lender => {
            const rawEmail =
                lender.email ||
                lender.Email ||
                lender['Lender Email'] ||
                lender['Email Address'] ||
                lender['contact_email'] ||
                lender['email_address'];

            return {
                ...lender,
                name: lender.name || lender['Lender Name'] || lender.lender || 'Unknown Lender',
                lender_name: lender.name || lender['Lender Name'] || lender.lender,
                email: rawEmail ? rawEmail.trim() : null,
                Tier: lender.Tier || lender.tier || 'Unknown'
            };
        });

        const cleanNonQualified = (data.nonQualified || []).map(item => ({
            ...item,
            name: item.name || item.lender || item['Lender Name'] || 'Unknown',
            lender_name: item.name || item.lender || item['Lender Name'],
            email: item.email || item['Lender Email'] || item['contact_email'] || null,
            blockingRule: item.blockingRule || item.reason || 'Unknown reason'
        }));

        this.qualifiedLenders = cleanQualified;
        this.nonQualifiedLenders = cleanNonQualified;
        this.lastLenderCriteria = criteria;

        data.qualified = cleanQualified;
        data.nonQualified = cleanNonQualified;

        const conversationId = String(this.parent.getCurrentConversationId() || '');
        if (conversationId) {
            this.cache.setResults(conversationId, data, criteria);
        }

        const html = LenderTemplates.renderResults(data);
        const resultsEl = document.getElementById(DOM.RESULTS.CONTAINER);
        if (resultsEl) {
            resultsEl.innerHTML = html;
            resultsEl.classList.add('active');
        }
    }

    async loadLenderData() {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) return;

        const lendersContent = document.querySelector('.lenders-status');
        if (!lendersContent) return;

        try {
            const result = await this.api.fetchConversationLenders(conversationId);
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

    displayLenders(lenders) {
        const lendersContent = document.querySelector('.lenders-status');
        if (!lendersContent) return;

        if (!lenders || lenders.length === 0) {
            lendersContent.innerHTML = '<p>No lenders found.</p>';
            return;
        }

        lendersContent.innerHTML = lenders.map(l => `
            <div class="lender-card">
                <div class="lender-name">${l.name || l['Lender Name']}</div>
            </div>
        `).join('');
    }

    updateLenderTagWithResponse(lenderName, status) {
        const lenderTags = document.querySelectorAll('.lender-tag');
        lenderTags.forEach(tag => {
            if (tag.dataset.lenderName === lenderName) {
                const statusLower = status.toLowerCase();
                const statusIcon = ['offer', 'approved', 'funded'].includes(statusLower) ? '✅' :
                                   ['decline', 'declined'].includes(statusLower) ? '❌' :
                                   statusLower === 'pending' ? '⏳' : '📋';

                tag.classList.remove('response-approved', 'response-declined', 'response-pending');

                if (['offer', 'approved', 'funded'].includes(statusLower)) {
                    tag.classList.add('response-approved');
                } else if (['decline', 'declined'].includes(statusLower)) {
                    tag.classList.add('response-declined');
                } else {
                    tag.classList.add('response-pending');
                }

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
