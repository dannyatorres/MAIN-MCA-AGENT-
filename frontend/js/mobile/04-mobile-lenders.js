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
                if (fcsResult.success) {
                    fcsData = fcsResult.analysis || this.parseFcsReport(fcsResult.rawText);
                }
            } catch (e) { /* ignore FCS errors */ }

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
        const businessName = conv.business_name || '';
        const state = conv.us_state || conv.state || '';
        const industry = conv.industry || conv.industry_type || conv.business_type || '';
        const fico = conv.credit_score || '';
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
            position: parseInt(formData.get('position')) || 1,
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

            // Cache results
            localStorage.setItem(`lender_results_${this.currentConversationId}`, JSON.stringify({
                data: result,
                criteria: criteria,
                timestamp: Date.now()
            }));

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
                this.showToast(`Logging for ${lender} (Coming Soon)`, 'info');
                // You can implement openResponseModal(lender) here if needed
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

    // FCS Report Parser - parses raw FCS report text
    parseFcsReport(reportText) {
        if (!reportText) return {};

        return {
            businessName: (reportText.match(/Business Name:\s*(.+?)(?:\u2022|\n|$)/i) || [])[1]?.trim(),
            position: (reportText.match(/Looking for\s*(\d+)/i) || [])[1],
            revenue: (reportText.match(/Average True Revenue:\s*\$([\d,]+)/i) || [])[1]?.replace(/,/g, ''),
            negativeDays: (reportText.match(/Average Negative Days:\s*(\d+)/i) || [])[1],
            deposits: (reportText.match(/Average Number of Deposits:\s*(\d+)/i) || [])[1],
            state: (reportText.match(/State:\s*([A-Z]{2})/i) || [])[1],
            industry: (reportText.match(/Industry:\s*(.+?)(?:\u2022|\n|$)/i) || [])[1]?.trim()
        };
    }
});
