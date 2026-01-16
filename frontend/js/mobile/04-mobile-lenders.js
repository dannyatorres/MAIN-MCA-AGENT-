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
                    fcsData = fcsResult.analysis;
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
        const industry = conv.industry || conv.business_type || '';
        const fico = conv.credit_score || '';
        const revenue = fcsData?.average_revenue ? Math.round(fcsData.average_revenue) :
            (conv.annual_revenue ? Math.round(conv.annual_revenue / 12) : '');
        const deposits = fcsData?.average_deposits || '';
        const negativeDays = fcsData?.average_negative_days || '';

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
                        <label>Monthly Revenue</label>
                        <input type="number" name="revenue" class="mobile-form-input" value="${revenue}" required>
                    </div>
                </div>

                <div class="lender-form-grid col-3">
                    <div class="mobile-form-group">
                        <label>FICO</label>
                        <input type="number" name="fico" class="mobile-form-input" value="${fico}">
                    </div>
                    <div class="mobile-form-group">
                        <label>State</label>
                        <input type="text" name="state" class="mobile-form-input" value="${state}" maxlength="2">
                    </div>
                    <div class="mobile-form-group">
                        <label>Start Date</label>
                        <input type="text" name="startDate" class="mobile-form-input" value="${startDate}" placeholder="MM/DD/YYYY">
                    </div>
                </div>

                <div class="lender-checkboxes">
                    <label class="lender-checkbox-item">
                        <input type="checkbox" name="soleProp"> Sole Prop
                    </label>
                    <label class="lender-checkbox-item">
                        <input type="checkbox" name="mercuryBank"> Mercury Bank
                    </label>
                </div>

                <button type="submit" class="lender-qualify-btn" id="runQualificationBtn">
                    <i class="fas fa-search"></i> Run Qualification
                </button>
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
            startDate: formData.get('startDate'),
            isSoleProp: formData.get('soleProp') === 'on',
            hasMercuryBank: formData.get('mercuryBank') === 'on'
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

    displayLenderResults(data, criteria) {
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
    showLenderSubmissionModal() {
        const qualified = this.currentLenderResults?.qualified || [];
        if (qualified.length === 0) {
            this.showToast('No qualified lenders to send to', 'error');
            return;
        }

        // 1. Create Modal HTML
        const modalHtml = `
            <div class="mobile-submission-modal" id="submissionModal">
                <div class="submission-header">
                    <h3>Send to ${qualified.length} Lenders</h3>
                    <button class="icon-btn-small" id="closeSubmissionModal">&times;</button>
                </div>
                <div class="submission-content">
                    <div class="submission-section">
                        <div class="submission-section-title">Message to Lenders</div>
                        <textarea id="submissionMessage" class="mobile-form-input" rows="4" style="font-size:14px;">Hello,

Please find attached the funding application for ${this.selectedConversation?.business_name || 'this business'}.

Let me know if you need anything else.</textarea>
                    </div>

                    <div class="submission-section">
                        <div class="submission-section-title">Select Lenders</div>
                        <div id="submissionLenderList">
                            ${qualified.map(l => `
                                <label class="submission-list-item">
                                    <input type="checkbox" class="lender-checkbox" value="${l.name || l['Lender Name']}" checked>
                                    <span class="submission-list-text">${l.name || l['Lender Name']}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <div class="submission-footer">
                    <button class="btn-mobile-secondary" id="cancelSubmissionBtn" style="flex:1">Cancel</button>
                    <button class="btn-mobile-primary" id="confirmSubmissionBtn" style="flex:2">
                        <i class="fas fa-paper-plane"></i> Send Emails
                    </button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // 2. Attach Listeners
        document.getElementById('closeSubmissionModal').onclick = () => this.closeSubmissionModal();
        document.getElementById('cancelSubmissionBtn').onclick = () => this.closeSubmissionModal();

        document.getElementById('confirmSubmissionBtn').onclick = async () => {
            const btn = document.getElementById('confirmSubmissionBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

            // Simulate sending (Replace with actual API call)
            await new Promise(r => setTimeout(r, 1500));

            this.showToast('Applications sent successfully!', 'success');
            this.closeSubmissionModal();
        };
    },

    closeSubmissionModal() {
        const modal = document.getElementById('submissionModal');
        if (modal) {
            modal.style.transform = 'translateY(100%)';
            setTimeout(() => modal.remove(), 300);
        }
    }
});
