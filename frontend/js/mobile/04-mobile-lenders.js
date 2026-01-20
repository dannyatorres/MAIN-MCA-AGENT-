// 04-mobile-lenders.js
Object.assign(window.MobileApp.prototype, {
    // ============ LENDERS ============
    async loadLendersView() {
        const container = document.getElementById('lendersContainer');
        if (!container || !this.currentConversationId) return;

        // Show loading state
        container.innerHTML = `
            <div class="ai-loading-container">
                <div class="ai-thinking">
                    <div class="ai-dot"></div>
                    <div class="ai-dot"></div>
                    <div class="ai-dot"></div>
                </div>
                <p>Loading lender data...</p>
            </div>
        `;

        try {
            // Check cache first for instant load
            const cached = localStorage.getItem(`lender_results_${this.currentConversationId}`);
            let cachedData = null;

            if (cached) {
                const parsed = JSON.parse(cached);
                const oneDay = 24 * 60 * 60 * 1000;
                if (Date.now() - parsed.timestamp < oneDay) {
                    cachedData = parsed;
                }
            }

            // Get FCS data for form pre-filling
            let fcsData = null;
            try {
                const fcsResult = await this.apiCall(`/api/fcs/results/${this.currentConversationId}`);
                if (fcsResult.success && fcsResult.analysis) {
                    const a = fcsResult.analysis;
                    const m = a.metrics || {};
                    fcsData = {
                        businessName: a.businessName,
                        average_revenue: m.averageRevenue,
                        average_deposits: m.averageDeposits,
                        average_negative_days: m.averageNegativeDays,
                        state: m.state,
                        industry: m.industry,
                        withholding_percentage: a.withholding_percentage || m.withholding_percentage,
                        position: m.positionCount ? String(m.positionCount) : null
                    };
                    if (a.report) {
                        const parsed = this.parseFcsReport(a.report);
                        if (!fcsData.businessName && parsed.businessName) fcsData.businessName = parsed.businessName;
                        if (!fcsData.position && parsed.position) fcsData.position = parsed.position;
                        if (!fcsData.state && parsed.state) fcsData.state = parsed.state;
                        if (!fcsData.industry && parsed.industry) fcsData.industry = parsed.industry;
                        if (!fcsData.average_revenue && parsed.revenue) fcsData.average_revenue = parseInt(parsed.revenue);
                        if (!fcsData.average_deposits && parsed.deposits) fcsData.average_deposits = parseInt(parsed.deposits);
                        if (!fcsData.average_negative_days && parsed.negativeDays) fcsData.average_negative_days = parseInt(parsed.negativeDays);
                    }
                }
            } catch (e) { 
                console.error('FCS fetch error:', e);
            }

            // Render the Form
            container.innerHTML = this.renderLendersForm(fcsData, cachedData);
            this.setupLendersListeners();

            // Render Results if we have them
            if (cachedData) {
                this.displayLenderResults(cachedData.data, cachedData.criteria);
            }
        } catch (err) {
            container.innerHTML = `
                <div class="ai-loading-container">
                    <p>Failed to load lender data</p>
                    <button class="btn-mobile-secondary" onclick="mobileApp.loadLendersView()">Retry</button>
                </div>
            `;
        }
    },

    renderLendersForm(fcsData, cachedData) {
        const conv = this.selectedConversation || {};
        const businessName = fcsData?.businessName || conv.business_name || '';
        const state = fcsData?.state || conv.us_state || conv.state || '';
        const industry = fcsData?.industry || conv.industry || conv.industry_type || conv.business_type || '';
        const fico = conv.credit_score || '';
        const position = fcsData?.position || '1';
        const revenue = fcsData?.average_revenue ? Math.round(fcsData.average_revenue) :
            (conv.monthly_revenue || (conv.annual_revenue ? Math.round(conv.annual_revenue / 12) : ''));
        const deposits = fcsData?.average_deposits || '';
        const negativeDays = fcsData?.average_negative_days || '';
        const withholding = fcsData?.withholding_percentage || '';

        // TIB Calculation
        let startDate = '';
        if (conv.business_start_date) {
            const d = new Date(conv.business_start_date);
            if (!isNaN(d.getTime())) {
                startDate = d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
            }
        }

        return `
            <form id="mobileLenderForm" class="lender-form-mobile">
                <div class="mobile-form-group full-width">
                    <label>Business Name</label>
                    <input type="text" name="businessName" class="mobile-form-input" value="${this.utils.escapeHtml(businessName)}">
                </div>

                <div class="lender-form-grid">
                    <div class="mobile-form-group">
                        <label>Position *</label>
                        <select name="position" class="mobile-form-select" required>
                            <option value="1" ${position === '1' ? 'selected' : ''}>1st Position</option>
                            <option value="2" ${position === '2' ? 'selected' : ''}>2nd Position</option>
                            <option value="3" ${position === '3' ? 'selected' : ''}>3rd Position</option>
                            <option value="4" ${position === '4' ? 'selected' : ''}>4th Position</option>
                            <option value="5" ${position === '5' ? 'selected' : ''}>5th Position</option>
                            <option value="6" ${position === '6' ? 'selected' : ''}>6th Position</option>
                            <option value="7" ${position === '7' ? 'selected' : ''}>7th Position</option>
                            <option value="8" ${position === '8' ? 'selected' : ''}>8th Position</option>
                            <option value="9" ${position === '9' ? 'selected' : ''}>9th Position</option>
                            <option value="10" ${position === '10' ? 'selected' : ''}>10th Position</option>
                        </select>
                    </div>
                    <div class="mobile-form-group">
                        <label>Monthly Revenue *</label>
                        <input type="number" name="revenue" class="mobile-form-input" value="${revenue}" required>
                    </div>
                </div>

                <div class="lender-form-grid col-3">
                    <div class="mobile-form-group">
                        <label>FICO *</label>
                        <input type="number" name="fico" class="mobile-form-input" value="${fico}" required>
                    </div>
                    <div class="mobile-form-group">
                        <label>State *</label>
                        <input type="text" name="state" class="mobile-form-input" value="${state}" maxlength="2" required>
                    </div>
                    <div class="mobile-form-group">
                        <label>Start Date *</label>
                        <input type="text" name="startDate" class="mobile-form-input" value="${startDate}" placeholder="MM/DD/YYYY" required>
                    </div>
                </div>

                <div class="mobile-form-group full-width">
                    <label>Industry *</label>
                    <input type="text" name="industry" class="mobile-form-input" value="${this.utils.escapeHtml(industry)}" placeholder="e.g. Restaurant, Trucking" required>
                </div>

                <div class="lender-form-grid col-3">
                    <div class="mobile-form-group">
                        <label>Deposits/Mo</label>
                        <input type="number" name="deposits" class="mobile-form-input" value="${deposits}" placeholder="# deposits">
                    </div>
                    <div class="mobile-form-group">
                        <label>Neg Days (90d)</label>
                        <input type="number" name="negativeDays" class="mobile-form-input" value="${negativeDays}" placeholder="0">
                    </div>
                    <div class="mobile-form-group">
                        <label>Withholding %</label>
                        <input type="text" name="withholding" class="mobile-form-input" value="${withholding}" placeholder="Auto" readonly>
                    </div>
                </div>

                <div class="lender-checkboxes">
                    <label class="lender-checkbox-item">
                        <input type="checkbox" name="soleProp"> Sole Prop
                    </label>
                    <label class="lender-checkbox-item">
                        <input type="checkbox" name="nonProfit"> Non-Profit
                    </label>
                    <label class="lender-checkbox-item">
                        <input type="checkbox" name="mercuryBank"> Mercury Bank
                    </label>
                    <label class="lender-checkbox-item">
                        <input type="checkbox" name="reverseConsolidation"> Reverse Consol
                    </label>
                </div>

                <div class="lender-form-actions">
                    <button type="submit" class="lender-qualify-btn" id="runQualificationBtn">
                        <i class="fas fa-search"></i> Run Qualification
                    </button>
                    <button type="button" class="lender-skip-btn" id="skipToSendBtn">
                        <i class="fas fa-forward"></i> Skip to Send
                    </button>
                </div>
            </form>

            <div id="lenderResultsContainer" class="lender-results"></div>
        `;
    },

    setupLendersListeners() {
        const form = document.getElementById('mobileLenderForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.runLenderQualification();
            });
        }

        const skipBtn = document.getElementById('skipToSendBtn');
        if (skipBtn) {
            skipBtn.addEventListener('click', async () => {
                await this.skipToSendModal();
            });
        }
    },

    async runLenderQualification() {
        const form = document.getElementById('mobileLenderForm');
        const btn = document.getElementById('runQualificationBtn');
        if (!form || !btn) return;

        const formData = new FormData(form);
        const criteria = {
            businessName: formData.get('businessName'),
            requestedPosition: parseInt(formData.get('position')) || 1,
            monthlyRevenue: parseInt(formData.get('revenue')) || 0,
            fico: parseInt(formData.get('fico')) || 600,
            state: formData.get('state'),
            industry: formData.get('industry'),
            startDate: formData.get('startDate'),
            depositsPerMonth: parseInt(formData.get('deposits')) || 0,
            negativeDays: parseInt(formData.get('negativeDays')) || 0,
            withholding: formData.get('withholding'),
            isSoleProp: formData.get('soleProp') === 'on',
            isNonProfit: formData.get('nonProfit') === 'on',
            hasMercuryBank: formData.get('mercuryBank') === 'on',
            isReverseConsolidation: formData.get('reverseConsolidation') === 'on'
        };

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

        try {
            const result = await this.apiCall('/api/qualification/qualify', {
                method: 'POST',
                body: JSON.stringify(criteria)
            });

            if (result.error) {
                throw new Error(result.error);
            }

            // Cache results
            localStorage.setItem(`lender_results_${this.currentConversationId}`, JSON.stringify({
                data: result,
                criteria: criteria,
                timestamp: Date.now()
            }));

            if (this.currentConversationId) {
                try {
                    await this.apiCall(`/api/submissions/${this.currentConversationId}/qualifications/save`, {
                        method: 'POST',
                        body: JSON.stringify({ results: result, criteria: criteria })
                    });
                } catch (e) { /* ignore save errors */ }
            }

            this.displayLenderResults(result, criteria);
            this.showToast(`${result.qualified?.length || 0} lenders qualified`, 'success');

        } catch (err) {
            this.showToast('Qualification failed', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-search"></i> Run Qualification';
        }
    },

    async skipToSendModal() {
        const btn = document.getElementById('skipToSendBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        }

        try {
            const result = await this.apiCall('/api/qualification/all-lenders');
            if (result.success && result.lenders) {
                this.currentLenderResults = {
                    qualified: result.lenders,
                    nonQualified: []
                };
                await this.showLenderSubmissionModal();
            } else {
                throw new Error('Failed to load lenders');
            }
        } catch (err) {
            console.error('Skip to send error:', err);
            this.showToast('Failed to load lenders', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-forward"></i> Skip to Send';
            }
        }
    },

    displayLenderResults(data, criteria) {
        this.currentLenderResults = data;
        this.currentLenderCriteria = criteria;

        const container = document.getElementById('lenderResultsContainer');
        if (!container) return;

        const qualified = data.qualified || [];
        const nonQualified = data.nonQualified || [];

        // Save for submission modal use
        this.currentLenderResults = { qualified, nonQualified };

        let html = `
            <div class="lender-summary">
                <div class="lender-stat-card">
                    <div class="lender-stat-number qualified">${qualified.length}</div>
                    <div class="lender-stat-label">Qualified</div>
                </div>
                <div class="lender-stat-card">
                    <div class="lender-stat-number non-qualified">${nonQualified.length}</div>
                    <div class="lender-stat-label">Non-Qualified</div>
                </div>
            </div>
        `;

        if (qualified.length > 0) {
            // ADDED: Send Button (missing in previous version)
            html += `
                <button class="send-lenders-btn-mobile" id="openSubmissionModalBtn">
                    <i class="fas fa-paper-plane"></i> Send to Lenders
                </button>
            `;

            // Group by Tier
            const tiers = {};
            qualified.forEach(lender => {
                const tier = lender.Tier || lender.tier || 'Other';
                if (!tiers[tier]) tiers[tier] = [];
                tiers[tier].push(lender);
            });

            Object.keys(tiers).sort().forEach(tier => {
                html += `
                    <div class="lender-tier-group">
                        <div class="lender-tier-header">Tier ${this.utils.escapeHtml(tier)}</div>
                        <div class="lender-tier-list">
                            ${tiers[tier].map(lender => this.renderLenderCard(lender)).join('')}
                        </div>
                    </div>
                `;
            });
        }

        if (nonQualified.length > 0) {
            html += `
                <button class="non-qual-toggle-mobile" id="toggleNonQualMobile">
                    ❌ View Non-Qualified (${nonQualified.length}) ▼
                </button>
                <div class="non-qual-list" id="nonQualListMobile">
                    ${nonQualified.map(item => `
                        <div class="non-qual-item-mobile">
                            <span class="lender-name">${this.utils.escapeHtml(item.lender || item.name || 'Unknown')}</span>
                            <span class="block-reason">${this.utils.escapeHtml(item.blockingRule || item.reason || '')}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        container.innerHTML = html;
        this.attachLenderResultListeners();
    },

    // ADDED: Helper to render improved card with buttons
    renderLenderCard(lender) {
        const name = lender.name || lender['Lender Name'] || 'Unknown';
        const rate = lender.prediction?.successRate || 0;
        const confidence = lender.prediction?.confidence || 'low'; // high, medium, low
        const isPreferred = lender.isPreferred || false;

        let badgeClass = 'low';
        if (rate >= 80) badgeClass = 'high';
        else if (rate >= 50) badgeClass = 'medium';

        return `
            <div class="lender-card-mobile" data-lender-name="${this.utils.escapeHtml(name)}">
                <div class="lender-card-top">
                    <span class="lender-name">
                        ${this.utils.escapeHtml(name)}
                        ${isPreferred ? '⭐' : ''}
                    </span>
                    <span class="success-rate-badge ${badgeClass}">${rate}% Match</span>
                </div>
                <div class="lender-card-bottom">
                    <span class="status-indicator">Ready</span>
                    <button class="log-response-btn-mobile" data-lender="${this.utils.escapeHtml(name)}">
                        <i class="fas fa-edit"></i> Log
                    </button>
                </div>
            </div>
        `;
    },

    attachLenderResultListeners() {
        // Toggle Non-Qualified
        const toggleBtn = document.getElementById('toggleNonQualMobile');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const list = document.getElementById('nonQualListMobile');
                if (list) {
                    list.classList.toggle('show');
                }
            });
        }

        // Open Submission Modal
        const sendBtn = document.getElementById('openSubmissionModalBtn');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.showLenderSubmissionModal());
        }

        // Log Response Buttons
        document.querySelectorAll('.log-response-btn-mobile').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const lender = e.target.closest('button').dataset.lender;
                this.openResponseModal(lender);
            });
        });
    },

    // ADDED: The Submission Modal Logic
    async showLenderSubmissionModal() {
        const qualified = this.currentLenderResults?.qualified || [];
        if (qualified.length === 0) {
            this.showToast('No qualified lenders to send to', 'error');
            return;
        }

        let documents = [];
        try {
            const docResult = await this.apiCall(`/api/documents/${this.currentConversationId}`);
            if (docResult.success && docResult.documents) {
                documents = docResult.documents;
            }
        } catch (e) {
            // ignore
        }

        let submissionHistory = [];
        try {
            const histResult = await this.apiCall(`/api/lenders/submissions/${this.currentConversationId}`);
            submissionHistory = histResult.submissions || [];
        } catch (e) {
            // ignore
        }

        const submittedMap = new Map();
        submissionHistory.forEach(sub => {
            submittedMap.set(sub.lender_name?.toLowerCase().trim(), sub);
        });

        const available = qualified.filter(l => {
            const name = (l.name || l['Lender Name'] || '').toLowerCase().trim();
            return !submittedMap.has(name);
        });

        const modalHtml = `
            <div class="mobile-submission-modal" id="submissionModal">
                <div class="submission-header">
                    <h3>Send to Lenders</h3>
                    <button class="icon-btn-small" id="closeSubmissionModal">&times;</button>
                </div>
                <div class="submission-content">
                    <div class="submission-section">
                        <div class="submission-section-title">Message</div>
                        <textarea id="submissionMessage" class="mobile-form-input" rows="3">Hello,

Please find attached the funding application for ${this.selectedConversation?.business_name || 'this business'}.

Let me know if you need anything else.</textarea>
                    </div>

                    <div class="submission-section">
                        <div class="submission-section-title">
                            Select Lenders
                            <span class="selection-count" id="lenderCount">${available.length} available</span>
                        </div>
                        ${submissionHistory.length > 0 ? `
                            <div class="already-submitted-note">
                                📤 ${submissionHistory.length} already submitted
                            </div>
                        ` : ''}
                        <div id="submissionLenderList" class="submission-list">
                            ${available.length === 0 ? '<p class="empty-msg">All qualified lenders already submitted</p>' : ''}
                            ${available.map(l => {
                                const name = l.name || l['Lender Name'];
                                return `
                                    <label class="submission-list-item">
                                        <input type="checkbox" class="lender-checkbox" value="${this.utils.escapeHtml(name)}" data-email="${l.email || ''}" checked>
                                        <span class="submission-list-text">${this.utils.escapeHtml(name)}</span>
                                    </label>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <div class="submission-section">
                        <div class="submission-section-title">
                            Attach Documents
                            <span class="selection-count" id="docCount">${documents.length} available</span>
                        </div>
                        <div id="submissionDocList" class="submission-list">
                            ${documents.length === 0 ? '<p class="empty-msg">No documents uploaded</p>' : ''}
                            ${documents.map(doc => `
                                <label class="submission-list-item">
                                    <input type="checkbox" class="doc-checkbox" value="${doc.id}" data-s3key="${doc.s3_key}" checked>
                                    <span class="submission-list-text">${this.utils.escapeHtml(doc.filename || doc.original_filename)}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <div class="submission-footer">
                    <button class="btn-mobile-secondary" id="cancelSubmissionBtn">Cancel</button>
                    <button class="btn-mobile-primary" id="confirmSubmissionBtn">
                        <i class="fas fa-paper-plane"></i> Send Emails
                    </button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('closeSubmissionModal').onclick = () => this.closeSubmissionModal();
        document.getElementById('cancelSubmissionBtn').onclick = () => this.closeSubmissionModal();

        document.getElementById('submissionLenderList')?.addEventListener('change', () => {
            const checked = document.querySelectorAll('#submissionLenderList .lender-checkbox:checked').length;
            document.getElementById('lenderCount').textContent = `${checked} selected`;
        });

        document.getElementById('submissionDocList')?.addEventListener('change', () => {
            const checked = document.querySelectorAll('#submissionDocList .doc-checkbox:checked').length;
            document.getElementById('docCount').textContent = `${checked} selected`;
        });

        document.getElementById('confirmSubmissionBtn').onclick = async () => {
            await this.sendLenderSubmissions();
        };
    },

    async sendLenderSubmissions() {
        const btn = document.getElementById('confirmSubmissionBtn');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

        try {
            const selectedLenders = [];
            document.querySelectorAll('#submissionLenderList .lender-checkbox:checked').forEach(cb => {
                selectedLenders.push({
                    name: cb.value,
                    email: cb.dataset.email
                });
            });

            if (selectedLenders.length === 0) {
                this.showToast('Please select at least one lender', 'warning');
                btn.disabled = false;
                btn.innerHTML = originalText;
                return;
            }

            const selectedDocuments = [];
            document.querySelectorAll('#submissionDocList .doc-checkbox:checked').forEach(cb => {
                selectedDocuments.push({
                    id: cb.value,
                    s3_key: cb.dataset.s3key
                });
            });

            const message = document.getElementById('submissionMessage')?.value || '';

            const conv = this.selectedConversation || {};
            const businessData = {
                businessName: conv.business_name || '',
                state: conv.us_state || conv.state || '',
                revenue: conv.monthly_revenue || conv.annual_revenue || '',
                fico: conv.credit_score || '',
                customMessage: message
            };

            const result = await this.apiCall(`/api/submissions/${this.currentConversationId}/send`, {
                method: 'POST',
                body: JSON.stringify({
                    selectedLenders,
                    businessData,
                    documents: selectedDocuments
                })
            });

            if (result.success) {
                this.showToast(`Sending to ${selectedLenders.length} lenders!`, 'success');
                this.closeSubmissionModal();
            } else {
                throw new Error(result.error || 'Failed to send');
            }
        } catch (err) {
            console.error('Submission error:', err);
            this.showToast('Failed to send: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    },

    closeSubmissionModal() {
        const modal = document.getElementById('submissionModal');
        if (modal) {
            modal.style.transform = 'translateY(100%)';
            setTimeout(() => modal.remove(), 300);
        }
    },

    openResponseModal(lenderName) {
        const existing = document.getElementById('mobileLenderResponseModal');
        if (existing) existing.remove();

        const safeLender = this.utils.escapeHtml(lenderName || '');
        const safeId = this.utils.escapeHtml(String(this.currentConversationId || ''));

        const modal = document.createElement('div');
        modal.id = 'mobileLenderResponseModal';
        modal.className = 'mobile-response-modal';
        modal.innerHTML = `
            <div class="mobile-response-content">
                <div class="mobile-response-header">
                    <h3>Log Lender Response</h3>
                    <button id="closeLenderResponseModal" class="icon-btn-small">&times;</button>
                </div>
                <div class="mobile-response-body">
                    <input type="hidden" id="responseConversationId" value="${safeId}">
                    <input type="hidden" id="responseLenderName" value="${safeLender}">

                    <div class="mobile-form-group">
                        <label>Lender</label>
                        <input type="text" id="responseLenderDisplay" readonly class="mobile-form-input" value="${safeLender}">
                    </div>

                    <div class="mobile-form-group">
                        <label>Status</label>
                        <select id="responseStatus" class="mobile-form-select">
                            <option value="">Select...</option>
                            <option value="OFFER">Offer Received</option>
                            <option value="FUNDED">Funded</option>
                            <option value="DECLINE">Declined</option>
                        </select>
                    </div>

                    <div class="mobile-form-group">
                        <label>Position</label>
                        <select id="responsePosition" class="mobile-form-select">
                            <option value="">Select...</option>
                            ${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${i + 1}${['st','nd','rd'][i] || 'th'} Position</option>`).join('')}
                        </select>
                    </div>

                    <div id="offerFields" class="hidden">
                        <div class="form-section-header">New Offer Details</div>
                        <div class="lender-form-grid">
                            <div class="mobile-form-group">
                                <label>Offer Amount ($)</label>
                                <input type="number" id="responseOfferAmount" class="mobile-form-input" placeholder="15000">
                            </div>
                            <div class="mobile-form-group">
                                <label>Factor Rate</label>
                                <input type="text" id="responseFactorRate" class="mobile-form-input" placeholder="1.49">
                            </div>
                        </div>
                        <div class="lender-form-grid">
                            <div class="mobile-form-group">
                                <label>Term Length</label>
                                <input type="number" id="responseTermLength" class="mobile-form-input" placeholder="60">
                            </div>
                            <div class="mobile-form-group">
                                <label>Term Unit</label>
                                <select id="responseTermUnit" class="mobile-form-select">
                                    <option value="Days">Days</option>
                                    <option value="Weeks">Weeks</option>
                                    <option value="Months">Months</option>
                                </select>
                            </div>
                        </div>
                        <div class="mobile-form-group">
                            <label>Payment Frequency</label>
                            <select id="responsePaymentFrequency" class="mobile-form-select">
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="bi-weekly">Bi-Weekly</option>
                                <option value="monthly">Monthly</option>
                            </select>
                        </div>
                    </div>

                    <div id="prevPositionFields" class="hidden">
                        <div class="form-section-header">Previous Position Info <span class="lender-optional-note">(optional)</span></div>
                        <div class="lender-form-grid">
                            <div class="mobile-form-group">
                                <label>Amount ($)</label>
                                <input type="number" id="responsePrevAmount" class="mobile-form-input">
                            </div>
                            <div class="mobile-form-group">
                                <label>Daily Withhold ($)</label>
                                <input type="number" id="responseDailyWithhold" class="mobile-form-input">
                            </div>
                        </div>
                    </div>

                    <div id="declineFields" class="hidden">
                        <div class="mobile-form-group">
                            <label>Decline Reason</label>
                            <textarea id="responseDeclineReason" class="mobile-form-input" rows="2" placeholder="e.g., Restricted industry"></textarea>
                        </div>
                    </div>
                </div>
                <div class="mobile-response-footer">
                    <button id="cancelLenderResponse" class="btn-mobile-secondary">Cancel</button>
                    <button id="saveLenderResponse" class="btn-mobile-primary">Save Response</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const statusSelect = document.getElementById('responseStatus');
        const offerFields = document.getElementById('offerFields');
        const declineFields = document.getElementById('declineFields');
        const prevPositionFields = document.getElementById('prevPositionFields');
        statusSelect.onchange = () => {
            const status = statusSelect.value;
            if (offerFields) {
                offerFields.classList.toggle('hidden', !['OFFER', 'FUNDED'].includes(status));
            }
            if (declineFields) {
                declineFields.classList.toggle('hidden', status !== 'DECLINE');
            }
        };

        const positionSelect = document.getElementById('responsePosition');
        positionSelect.onchange = () => {
            const pos = parseInt(positionSelect.value) || 0;
            if (prevPositionFields) {
                prevPositionFields.classList.toggle('hidden', !(pos > 1));
            }
        };

        document.getElementById('closeLenderResponseModal').onclick = () => {
            modal.remove();
        };
        document.getElementById('cancelLenderResponse').onclick = () => {
            modal.remove();
        };

        document.getElementById('saveLenderResponse').onclick = async () => {
            await this.saveLenderResponse();
        };

        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };

        statusSelect.dispatchEvent(new Event('change'));
        positionSelect.dispatchEvent(new Event('change'));
    },

    async saveLenderResponse() {
        const conversationId = document.getElementById('responseConversationId')?.value;
        const lenderName = document.getElementById('responseLenderName')?.value;
        const status = document.getElementById('responseStatus')?.value;

        if (!status) {
            this.showToast('Please select a status', 'warning');
            return;
        }

        const data = {
            conversation_id: conversationId,
            lender_name: lenderName,
            status: status
        };

        const position = document.getElementById('responsePosition')?.value;
        if (position) data.position = parseInt(position);

        if (['OFFER', 'FUNDED'].includes(status)) {
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

        if (status === 'DECLINE') {
            const reason = document.getElementById('responseDeclineReason')?.value;
            if (reason) data.decline_reason = reason;
        }

        try {
            const result = await this.apiCall('/api/lenders/log-response', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            if (result.success) {
                this.showToast('Response logged successfully', 'success');
                document.getElementById('mobileLenderResponseModal')?.remove();
            } else {
                throw new Error(result.error || 'Failed to save');
            }
        } catch (err) {
            console.error('Error saving lender response:', err);
            this.showToast('Failed to save response: ' + err.message, 'error');
        }
    },

    // FCS Report Parser - REPLACED WITH ROBUST VERSION
    parseFcsReport(reportText) {
        if (!reportText) return {};

        const find = (patterns) => {
            for (const p of patterns) {
                const match = reportText.match(p);
                if (match && match[1]) return match[1].trim();
            }
            return null;
        };

        const cleanNum = (str) => (str ? str.replace(/[$,]/g, '') : null);

        return {
            businessName: find([
                /Business Name:\s*(.+?)(?:\u2022|\n|$)/i,
                /Merchant:\s*(.+?)(?:\u2022|\n|$)/i,
                /DBA:\s*(.+?)(?:\u2022|\n|$)/i
            ]),
            position: find([
                /Looking for\s*(\d+)/i,
                /Position:\s*(\d+)/i,
                /Positions?:\s*(\d+)/i
            ]),
            revenue: cleanNum(find([
                /Average True Revenue:\s*\$?([\d,]+)/i,
                /Avg[\s.]*Revenue:\s*\$?([\d,]+)/i,
                /Monthly Revenue:\s*\$?([\d,]+)/i,
                /Revenue:\s*\$?([\d,]+)/i
            ])),
            negativeDays: find([
                /Average Negative Days:\s*(\d+)/i,
                /Neg[\s.]*Days:\s*(\d+)/i,
                /Negative Days:\s*(\d+)/i
            ]),
            deposits: find([
                /Average Number of Deposits:\s*(\d+)/i,
                /Avg[\s.]*Deposits:\s*(\d+)/i,
                /Deposits:\s*(\d+)/i,
                /Deposit Count:\s*(\d+)/i
            ]),
            state: find([
                /State:\s*([A-Z]{2})\b/i,
                /State:\s*(.+?)(?:\u2022|\n|$)/i
            ]),
            industry: find([
                /Industry:\s*(.+?)(?:\u2022|\n|$)/i,
                /Business Type:\s*(.+?)(?:\u2022|\n|$)/i
            ])
        };
    }
});
