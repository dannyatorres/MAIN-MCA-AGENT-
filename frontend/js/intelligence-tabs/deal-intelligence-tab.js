export class DealIntelligenceTab {
    constructor(parent) {
        this.parent = parent;
        this.isAnalyzing = false;
        this.currentStrategy = null;
        this.currentScenarios = [];
    }

    async render(container) {
        const conv = this.parent.getSelectedConversation();

        if (!conv) {
            container.innerHTML = '<div class="di-empty">No conversation selected.</div>';
            return;
        }

        container.innerHTML = '<div class="di-loading"><div class="loading-spinner"></div><p>Loading strategy...</p></div>';

        // Fetch strategy
        let strategy = null;
        let scenarios = [];

        try {
            const [strategyRes, scenariosRes] = await Promise.all([
                this.parent.apiCall(`/api/strategies/${conv.id}`),
                this.parent.apiCall(`/api/strategies/${conv.id}/scenarios`)
            ]);

            if (strategyRes.success) strategy = strategyRes.strategy;
            if (scenariosRes.success) scenarios = scenariosRes.scenarios || [];
        } catch (e) {
            console.error('Failed to load strategy:', e);
        }

        // Store for modal use
        this.currentStrategy = strategy;
        this.currentScenarios = scenarios;

        // Empty state
        if (!strategy) {
            container.innerHTML = `
                <div class="di-empty">
                    <div class="di-empty-icon">📊</div>
                    <p>No strategy analysis yet.</p>
                    <button id="runAnalysisBtn" class="di-btn primary">Run Strategy Analysis</button>
                    <p id="analysisStatus" class="di-status"></p>
                </div>
            `;
            container.querySelector('#runAnalysisBtn')?.addEventListener('click', () => this.runAnalysis(conv.id));
            return;
        }

        // Parse game_plan
        let gamePlan = strategy.game_plan || {};
        if (typeof gamePlan === 'string') {
            try { gamePlan = JSON.parse(gamePlan); } catch(e) { gamePlan = {}; }
        }

        const stacking = gamePlan.stacking_assessment || {};
        const nextPos = stacking.next_position_number || (strategy.current_positions + 1) || 1;

        // Compact summary view
        container.innerHTML = `
            <div class="di-summary">

                <!-- Header Row -->
                <div class="di-summary-header">
                    <div class="di-badges">
                        <span class="di-grade grade-${strategy.lead_grade || 'C'}">${strategy.lead_grade || '?'}</span>
                        <span class="di-strategy-badge ${(strategy.strategy_type || '').toLowerCase()}">${(strategy.strategy_type || 'PENDING').replace('_', ' ')}</span>
                    </div>
                    <span class="di-position-badge">${nextPos}${this.ordinal(nextPos)} Position</span>
                </div>

                <!-- Recommended Offer Card -->
                <div class="di-offer-card">
                    <div class="di-offer-label">Recommended Offer</div>
                    <div class="di-offer-amount">$${parseFloat(strategy.recommended_funding_max || 0).toLocaleString()}</div>
                    <div class="di-offer-details">
                        <span>${strategy.recommended_term || '-'} ${strategy.recommended_term_unit || 'weeks'}</span>
                        <span class="di-separator">•</span>
                        <span>$${parseFloat(strategy.recommended_payment || 0).toLocaleString()}/wk</span>
                        <span class="di-separator">•</span>
                        <span>${gamePlan.recommended_factor || '-'}x</span>
                    </div>
                </div>

                <!-- Quick Stats -->
                <div class="di-stats-grid">
                    <div class="di-stat">
                        <span class="di-stat-value">$${parseFloat(strategy.avg_revenue || 0).toLocaleString()}</span>
                        <span class="di-stat-label">Avg Revenue</span>
                    </div>
                    <div class="di-stat">
                        <span class="di-stat-value">${strategy.current_positions ?? 0}</span>
                        <span class="di-stat-label">Positions</span>
                    </div>
                    <div class="di-stat">
                        <span class="di-stat-value">${parseFloat(strategy.total_withholding || 0).toFixed(1)}%</span>
                        <span class="di-stat-label">Withholding</span>
                    </div>
                    <div class="di-stat">
                        <span class="di-stat-value">$${parseFloat(strategy.avg_balance || 0).toLocaleString()}</span>
                        <span class="di-stat-label">Avg Balance</span>
                    </div>
                </div>

                <!-- Quick Flags -->
                ${(gamePlan.red_flags?.length > 0) ? `
                    <div class="di-quick-flags">
                        <span class="di-flag-icon">⚠️</span>
                        <span>${gamePlan.red_flags.length} red flag${gamePlan.red_flags.length > 1 ? 's' : ''} identified</span>
                    </div>
                ` : ''}

                <!-- Action Buttons -->
                <div class="di-actions">
                    <button id="viewFullAnalysisBtn" class="di-btn primary">
                        <span>📋</span> View Full Analysis
                    </button>
                    <button id="rerunAnalysisBtn" class="di-btn secondary">
                        <span>🔄</span> Re-run
                    </button>
                </div>

            </div>
        `;

        // Event listeners
        container.querySelector('#viewFullAnalysisBtn')?.addEventListener('click', () => this.openFullAnalysisModal());
        container.querySelector('#rerunAnalysisBtn')?.addEventListener('click', () => this.runAnalysis(conv.id));
    }

    openFullAnalysisModal() {
        const strategy = this.currentStrategy;
        const scenarios = this.currentScenarios;

        if (!strategy) return;

        // Parse game_plan
        let gamePlan = strategy.game_plan || {};
        if (typeof gamePlan === 'string') {
            try { gamePlan = JSON.parse(gamePlan); } catch(e) { gamePlan = {}; }
        }

        const withholding = gamePlan.withholding_analysis || {};
        const trend = gamePlan.revenue_trend || {};
        const stacking = gamePlan.stacking_assessment || {};
        const guidance = gamePlan.next_position_guidance || {};
        const redFlags = gamePlan.red_flags || [];
        const talkingPoints = gamePlan.talking_points || [];
        const riskConsiderations = gamePlan.risk_considerations || [];

        const nextPos = stacking.next_position_number || (strategy.current_positions + 1) || 1;

        // Remove existing modal if any
        document.getElementById('diAnalysisModal')?.remove();

        const modalHtml = `
            <div id="diAnalysisModal" class="di-modal-overlay">
                <div class="di-modal">
                    <div class="di-modal-header">
                        <div class="di-modal-title">
                            <span class="di-grade grade-${strategy.lead_grade || 'C'}">${strategy.lead_grade || '?'}</span>
                            <span>Deal Intelligence Report</span>
                        </div>
                        <button class="di-modal-close" onclick="document.getElementById('diAnalysisModal').remove()">×</button>
                    </div>

                    <div class="di-modal-body">

                        <!-- Strategy Header -->
                        <div class="di-modal-section">
                            <div class="di-modal-row">
                                <div class="di-modal-stat">
                                    <span class="label">Strategy</span>
                                    <span class="value ${(strategy.strategy_type || '').toLowerCase()}">${(strategy.strategy_type || 'PENDING').replace('_', ' ')}</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">Next Position</span>
                                    <span class="value">${nextPos}${this.ordinal(nextPos)}</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">Avg Revenue</span>
                                    <span class="value">$${parseFloat(strategy.avg_revenue || 0).toLocaleString()}</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">Current Withhold</span>
                                    <span class="value">${parseFloat(strategy.total_withholding || 0).toFixed(1)}%</span>
                                </div>
                            </div>
                        </div>

                        <!-- Recommended Offer -->
                        <div class="di-modal-section">
                            <div class="di-section-header">💰 Recommended Offer</div>
                            <div class="di-modal-row">
                                <div class="di-modal-stat highlight">
                                    <span class="label">Funding</span>
                                    <span class="value">$${parseFloat(strategy.recommended_funding_max || 0).toLocaleString()}</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">Term</span>
                                    <span class="value">${strategy.recommended_term || '-'} ${strategy.recommended_term_unit || 'weeks'}</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">Payment</span>
                                    <span class="value">$${parseFloat(strategy.recommended_payment || 0).toLocaleString()}</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">Factor</span>
                                    <span class="value">${gamePlan.recommended_factor || '-'}</span>
                                </div>
                            </div>
                            <div class="di-modal-row">
                                <div class="di-modal-stat">
                                    <span class="label">Offer Range</span>
                                    <span class="value">$${parseFloat(strategy.recommended_funding_min || 0).toLocaleString()} - $${parseFloat(strategy.recommended_funding_max || 0).toLocaleString()}</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">Add Withhold</span>
                                    <span class="value">+${withholding.recommended_addition_pct || '?'}%</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">New Total</span>
                                    <span class="value">${(withholding.new_total_withholding_pct || 0).toFixed(1)}%</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">Frequency</span>
                                    <span class="value">${guidance.payment_frequency || 'weekly'}</span>
                                </div>
                            </div>
                            ${withholding.capacity_reasoning ? `<div class="di-note">${withholding.capacity_reasoning}</div>` : ''}
                        </div>

                        <!-- Revenue Trend -->
                        ${trend.direction ? `
                        <div class="di-modal-section">
                            <div class="di-section-header">📈 Revenue Trend</div>
                            <div class="di-modal-row">
                                <div class="di-modal-stat">
                                    <span class="label">Direction</span>
                                    <span class="value trend-${trend.direction}">${trend.direction}</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">Floor Month</span>
                                    <span class="value">$${(trend.floor_month?.amount || 0).toLocaleString()} (${trend.floor_month?.month || '?'})</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">Funding Ceiling</span>
                                    <span class="value">$${(trend.funding_ceiling || 0).toLocaleString()}</span>
                                </div>
                            </div>
                            ${trend.trend_reasoning ? `<div class="di-note">${trend.trend_reasoning}</div>` : ''}
                        </div>
                        ` : ''}

                        <!-- Active Positions -->
                        ${withholding.position_breakdown?.length > 0 ? `
                        <div class="di-modal-section">
                            <div class="di-section-header">📍 Active Positions (${strategy.current_positions || withholding.position_breakdown.length})</div>
                            <table class="di-table">
                                <thead>
                                    <tr><th>Lender</th><th>Payment</th><th>Frequency</th><th>Withhold %</th></tr>
                                </thead>
                                <tbody>
                                    ${withholding.position_breakdown.map(p => `
                                        <tr>
                                            <td>${p.lender}</td>
                                            <td>$${(p.payment || 0).toLocaleString()}</td>
                                            <td>${p.frequency}</td>
                                            <td>${(p.withhold_pct || 0).toFixed(1)}%</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        ` : ''}

                        <!-- Scenarios -->
                        ${scenarios.length > 0 ? `
                        <div class="di-modal-section">
                            <div class="di-section-header">🎯 Position Scenarios</div>
                            <div class="di-scenarios-grid">
                                ${this.renderScenarioCard(scenarios, 'conservative', 'Conservative')}
                                ${this.renderScenarioCard(scenarios, 'moderate', 'Moderate')}
                                ${this.renderScenarioCard(scenarios, 'aggressive', 'Aggressive')}
                            </div>
                        </div>
                        ` : ''}

                        <!-- Red Flags -->
                        ${redFlags.length > 0 ? `
                        <div class="di-modal-section warning">
                            <div class="di-section-header">⚠️ Red Flags</div>
                            <ul class="di-list">
                                ${redFlags.map(f => `<li>${f}</li>`).join('')}
                            </ul>
                        </div>
                        ` : ''}

                        <!-- Talking Points -->
                        ${talkingPoints.length > 0 ? `
                        <div class="di-modal-section">
                            <div class="di-section-header">💬 Talking Points</div>
                            <ul class="di-list">
                                ${talkingPoints.map(t => `<li>${t}</li>`).join('')}
                            </ul>
                        </div>
                        ` : ''}

                        <!-- Strategy Details -->
                        ${gamePlan.approach || gamePlan.next_action ? `
                        <div class="di-modal-section">
                            <div class="di-section-header">📋 Strategy Details</div>
                            ${gamePlan.approach ? `<div class="di-note"><strong>Approach:</strong> ${gamePlan.approach}</div>` : ''}
                            ${gamePlan.next_action ? `<div class="di-note"><strong>Next Action:</strong> ${gamePlan.next_action}</div>` : ''}
                            ${gamePlan.urgency_angle ? `<div class="di-note"><strong>Urgency Angle:</strong> ${gamePlan.urgency_angle}</div>` : ''}
                            ${gamePlan.objection_strategy ? `<div class="di-note"><strong>Objection Handling:</strong> ${gamePlan.objection_strategy}</div>` : ''}
                        </div>
                        ` : ''}

                        <!-- Risk Considerations -->
                        ${riskConsiderations.length > 0 ? `
                        <div class="di-modal-section">
                            <div class="di-section-header">⚡ Risk Considerations</div>
                            <ul class="di-list">
                                ${riskConsiderations.map(r => `<li>${r}</li>`).join('')}
                            </ul>
                        </div>
                        ` : ''}

                        <!-- Lender Notes -->
                        ${gamePlan.lender_notes ? `
                        <div class="di-modal-section">
                            <div class="di-section-header">🏦 Lender Notes</div>
                            <div class="di-note">${gamePlan.lender_notes}</div>
                        </div>
                        ` : ''}

                        <!-- Stacking Assessment -->
                        ${stacking.stacking_notes ? `
                        <div class="di-modal-section">
                            <div class="di-section-header">📊 Stacking Assessment</div>
                            <div class="di-modal-row">
                                <div class="di-modal-stat">
                                    <span class="label">Can Stack</span>
                                    <span class="value ${stacking.can_stack ? 'yes' : 'no'}">${stacking.can_stack ? 'Yes' : 'No'}</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">Term Cap</span>
                                    <span class="value">${stacking.term_cap_weeks || '-'} weeks</span>
                                </div>
                            </div>
                            <div class="di-note">${stacking.stacking_notes}</div>
                        </div>
                        ` : ''}

                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Close on backdrop click
        document.getElementById('diAnalysisModal').addEventListener('click', (e) => {
            if (e.target.id === 'diAnalysisModal') {
                e.target.remove();
            }
        });
    }

    renderScenarioCard(scenarios, tier, title) {
        const filtered = scenarios.filter(s => s.tier === tier);
        if (filtered.length === 0) return '';

        return `
            <div class="di-scenario-card ${tier}">
                <div class="di-scenario-title">${title}</div>
                ${filtered.map(s => `
                    <div class="di-scenario-row">
                        <span class="funding">$${parseFloat(s.funding_amount || 0).toLocaleString()}</span>
                        <span class="term">${s.term}${s.term_unit === 'weeks' ? 'w' : 'd'}</span>
                        <span class="payment">$${parseFloat(s.payment_amount || 0).toLocaleString()}</span>
                        <span class="withhold">+${s.withhold_addition || 0}%</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    ordinal(n) {
        if (!n) return '';
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return (s[(v - 20) % 10] || s[v] || s[0]);
    }

    async runAnalysis(conversationId) {
        const btn = document.getElementById('runAnalysisBtn') || document.getElementById('rerunAnalysisBtn');
        const status = document.getElementById('analysisStatus');

        if (!btn || this.isAnalyzing) return;

        this.isAnalyzing = true;
        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="loading-spinner small"></span> Analyzing...';

        if (status) status.textContent = 'Running Commander AI...';

        try {
            const response = await this.parent.apiCall(`/api/commander/${conversationId}/analyze`, {
                method: 'POST'
            });

            if (response.success) {
                if (status) status.textContent = 'Done. Reloading...';
                const renderContainer = document.querySelector('[data-tab-content="deal-intelligence"]') ||
                                  document.getElementById('intelligenceContent');
                if (renderContainer) this.render(renderContainer);
            } else {
                throw new Error(response.error || 'Analysis failed');
            }
        } catch (error) {
            console.error('Analysis error:', error);
            if (status) status.textContent = `Error: ${error.message}`;
            btn.disabled = false;
            btn.innerHTML = originalText;
        }

        this.isAnalyzing = false;
    }
}
