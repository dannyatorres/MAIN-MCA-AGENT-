// 04-mobile-lenders.js
Object.assign(window.MobileApp.prototype, {
        // ============ LENDERS ============
        async loadLendersView() {
            const container = document.getElementById('lendersContainer');
            if (!container || !this.currentConversationId) return;

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
                const cached = localStorage.getItem(`lender_results_${this.currentConversationId}`);
                let cachedData = null;

                if (cached) {
                    const parsed = JSON.parse(cached);
                    const oneDay = 24 * 60 * 60 * 1000;
                    if (Date.now() - parsed.timestamp < oneDay) {
                        cachedData = parsed;
                    }
                }

                let fcsData = null;
                try {
                    const fcsResult = await this.apiCall(`/api/fcs/results/${this.currentConversationId}`);
                    if (fcsResult.success && fcsResult.analysis) {
                        fcsData = fcsResult.analysis;
                    }
                } catch (e) { /* ignore */ }

                container.innerHTML = this.renderLendersForm(fcsData, cachedData);
                this.setupLendersListeners();

                if (cachedData) {
                    this.displayLenderResults(cachedData.data, cachedData.criteria);
                }
            } catch (err) {
                container.innerHTML = `
                    <div class="ai-loading-container">
                        <p>Failed to load lender data</p>
                    </div>
                `;
            }
        }

        renderLendersForm(fcsData, cachedData) {
            const conv = this.selectedConversation || {};

            const businessName = conv.business_name || '';
            const state = conv.us_state || conv.state || '';
            const industry = conv.industry || conv.business_type || '';
            const fico = conv.credit_score || '';
            const revenue = fcsData?.average_revenue ? Math.round(fcsData.average_revenue) :
                (conv.annual_revenue ? Math.round(conv.annual_revenue / 12) : '');
            const withholding = fcsData?.withholding_percentage || '';
            const deposits = fcsData?.average_deposits || '';
            const negativeDays = fcsData?.average_negative_days || '';

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
                            <label>Start Date</label>
                            <input type="text" name="startDate" class="mobile-form-input" value="${startDate}" placeholder="MM/DD/YYYY">
                        </div>
                    </div>

                    <div class="mobile-form-group">
                        <label>Industry</label>
                        <input type="text" name="industry" class="mobile-form-input" value="${this.utils.escapeHtml(industry)}">
                    </div>

                    <div class="lender-form-grid col-3">
                        <div class="mobile-form-group">
                            <label>Deposits/Mo</label>
                            <input type="number" name="deposits" class="mobile-form-input" value="${deposits}">
                        </div>
                        <div class="mobile-form-group">
                            <label>Neg Days</label>
                            <input type="number" name="negativeDays" class="mobile-form-input" value="${negativeDays}">
                        </div>
                        <div class="mobile-form-group">
                            <label>Withhold %</label>
                            <input type="text" name="withholding" class="mobile-form-input" value="${withholding}" readonly>
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
                    </div>

                    <button type="submit" class="lender-qualify-btn" id="runQualificationBtn">
                        <i class="fas fa-search"></i> Run Qualification
                    </button>
                </form>

                <div id="lenderResultsContainer" class="lender-results"></div>
            `;
        }

        setupLendersListeners() {
            const form = document.getElementById('mobileLenderForm');
            if (!form) return;

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.runLenderQualification();
            });
        }

        async runLenderQualification() {
            const form = document.getElementById('mobileLenderForm');
            const btn = document.getElementById('runQualificationBtn');
            if (!form || !btn) return;

            const formData = new FormData(form);

            let tib = 0;
            const startDate = formData.get('startDate');
            if (startDate) {
                const parts = startDate.split('/');
                if (parts.length === 3) {
                    const d = new Date(`${parts[2]}-${parts[0]}-${parts[1]}`);
                    if (!isNaN(d.getTime())) {
                        const now = new Date();
                        tib = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
                        tib = Math.max(0, tib);
                    }
                }
            }

            const criteria = {
                businessName: formData.get('businessName') || 'Business',
                position: parseInt(formData.get('position')) || 1,
                requestedPosition: parseInt(formData.get('position')) || 1,
                monthlyRevenue: parseInt(formData.get('revenue')) || 0,
                revenue: parseInt(formData.get('revenue')) || 0,
                fico: parseInt(formData.get('fico')) || 650,
                state: (formData.get('state') || '').toUpperCase(),
                industry: formData.get('industry') || '',
                startDate: startDate,
                tib: tib,
                depositsPerMonth: parseInt(formData.get('deposits')) || 0,
                negativeDays: parseInt(formData.get('negativeDays')) || 0,
                withholding: formData.get('withholding') || null,
                isSoleProp: formData.get('soleProp') === 'on',
                soleProp: formData.get('soleProp') === 'on',
                isNonProfit: formData.get('nonProfit') === 'on',
                nonProfit: formData.get('nonProfit') === 'on',
                hasMercuryBank: formData.get('mercuryBank') === 'on',
                mercuryBank: formData.get('mercuryBank') === 'on'
            };

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

            try {
                const result = await this.apiCall('/api/qualification/qualify', {
                    method: 'POST',
                    body: JSON.stringify(criteria)
                });

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
        }

        displayLenderResults(data, criteria) {
            const container = document.getElementById('lenderResultsContainer');
            if (!container) return;

            const qualified = data.qualified || [];
            const nonQualified = data.nonQualified || [];

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
                            <div class="lender-tags">
                                ${tiers[tier].map(lender => {
                                    const name = lender.name || lender['Lender Name'] || 'Unknown';
                                    const rate = lender.prediction?.successRate;
                                    const rateHtml = rate ? `<span class="success-rate">${rate}%</span>` : '';
                                    return `<div class="lender-tag-mobile">${this.utils.escapeHtml(name)} ${rateHtml}</div>`;
                                }).join('')}
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

            const toggleBtn = document.getElementById('toggleNonQualMobile');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', () => {
                    const list = document.getElementById('nonQualListMobile');
                    if (list) {
                        list.classList.toggle('show');
                        toggleBtn.textContent = list.classList.contains('show')
                            ? `❌ Hide Non-Qualified (${nonQualified.length}) ▲`
                            : `❌ View Non-Qualified (${nonQualified.length}) ▼`;
                    }
                });
            }
        }

});
