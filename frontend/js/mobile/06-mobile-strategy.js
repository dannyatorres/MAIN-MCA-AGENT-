// 06-mobile-strategy.js
Object.assign(window.MobileApp.prototype, {
        // ============ STRATEGY ============
        async loadStrategyView() {
            const container = document.getElementById('strategyContainer');
            if (!container || !this.currentConversationId) return;

            container.innerHTML = `
                <div class="ai-loading-container">
                    <div class="ai-thinking">
                        <div class="ai-dot"></div>
                        <div class="ai-dot"></div>
                        <div class="ai-dot"></div>
                    </div>
                    <p>Loading strategy...</p>
                </div>
            `;

            try {
                const [strategyRes, scenariosRes] = await Promise.all([
                    this.apiCall(`/api/strategies/${this.currentConversationId}`),
                    this.apiCall(`/api/strategies/${this.currentConversationId}/scenarios`)
                ]);

                const strategy = strategyRes.success ? strategyRes.strategy : null;
                const scenarios = scenariosRes.success ? (scenariosRes.scenarios || []) : [];

                if (!strategy) {
                    this.showStrategyEmptyState();
                } else {
                    this.renderStrategy(strategy, scenarios);
                }
            } catch (err) {
                this.showStrategyEmptyState();
            }
        }

        showStrategyEmptyState() {
            const container = document.getElementById('strategyContainer');
            if (!container) return;

            container.innerHTML = `
                <div class="di-empty-mobile">
                    <div class="di-empty-icon">📊</div>
                    <h3>No Strategy Analysis</h3>
                    <p>Run AI analysis to get deal recommendations</p>
                    <button class="di-analyze-btn" id="runStrategyBtn">
                        <i class="fas fa-bolt"></i> Run Analysis
                    </button>
                    <p class="di-status-text" id="strategyStatusText"></p>
                </div>
            `;

            document.getElementById('runStrategyBtn')?.addEventListener('click', () => {
                this.runStrategyAnalysis();
            });
        }

        async runStrategyAnalysis() {
            const btn = document.getElementById('runStrategyBtn') || document.getElementById('rerunStrategyBtn');
            const status = document.getElementById('strategyStatusText');

            if (!btn || this.isAnalyzingStrategy) return;

            this.isAnalyzingStrategy = true;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
            if (status) status.textContent = 'Running Commander AI...';

            try {
                const response = await this.apiCall(`/api/commander/${this.currentConversationId}/analyze`, {
                    method: 'POST'
                });

                if (response.success) {
                    if (status) status.textContent = 'Done! Loading...';
                    this.loadStrategyView();
                } else {
                    throw new Error(response.error || 'Analysis failed');
                }
            } catch (err) {
                if (status) status.textContent = `Error: ${err.message}`;
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-bolt"></i> Run Analysis';
            }

            this.isAnalyzingStrategy = false;
        }

        renderStrategy(strategy, scenarios) {
            const container = document.getElementById('strategyContainer');
            if (!container) return;

            let gamePlan = strategy.game_plan || {};
            if (typeof gamePlan === 'string') {
                try { gamePlan = JSON.parse(gamePlan); } catch (e) { gamePlan = {}; }
            }

            const stacking = gamePlan.stacking_assessment || {};
            const withholding = gamePlan.withholding_analysis || {};
            const redFlags = gamePlan.red_flags || [];
            const talkingPoints = gamePlan.talking_points || [];
            const riskConsiderations = gamePlan.risk_considerations || [];

            const nextPos = stacking.next_position_number || (strategy.current_positions + 1) || 1;
            const grade = strategy.lead_grade || 'C';
            const strategyType = (strategy.strategy_type || 'pending').toLowerCase().replace('_', ' ');

            container.innerHTML = `
                <div class="di-header-mobile">
                    <div class="di-badges-mobile">
                        <div class="di-grade-mobile grade-${grade}">${grade}</div>
                        <span class="di-type-badge ${strategy.strategy_type?.toLowerCase() || ''}">${strategyType}</span>
                    </div>
                    <span class="di-position-badge-mobile">${nextPos}${this.ordinal(nextPos)} Position</span>
                </div>

                <div class="di-offer-card-mobile">
                    <div class="di-offer-label">Recommended Offer</div>
                    <div class="di-offer-amount-mobile">$${parseFloat(strategy.recommended_funding_max || 0).toLocaleString()}</div>
                    <div class="di-offer-details-mobile">
                        <span>${strategy.recommended_term || '-'} ${strategy.recommended_term_unit || 'wks'}</span>
                        <span class="di-separator">•</span>
                        <span>$${parseFloat(strategy.recommended_payment || 0).toLocaleString()}/wk</span>
                        <span class="di-separator">•</span>
                        <span>${gamePlan.recommended_factor || '-'}x</span>
                    </div>
                </div>

                <div class="di-stats-grid-mobile">
                    <div class="di-stat-mobile">
                        <span class="di-stat-value-mobile">$${parseFloat(strategy.avg_revenue || 0).toLocaleString()}</span>
                        <span class="di-stat-label-mobile">Avg Revenue</span>
                    </div>
                    <div class="di-stat-mobile">
                        <span class="di-stat-value-mobile">${strategy.current_positions ?? 0}</span>
                        <span class="di-stat-label-mobile">Positions</span>
                    </div>
                    <div class="di-stat-mobile">
                        <span class="di-stat-value-mobile">${parseFloat(strategy.total_withholding || 0).toFixed(1)}%</span>
                        <span class="di-stat-label-mobile">Withholding</span>
                    </div>
                    <div class="di-stat-mobile">
                        <span class="di-stat-value-mobile">$${parseFloat(strategy.avg_balance || 0).toLocaleString()}</span>
                        <span class="di-stat-label-mobile">Avg Balance</span>
                    </div>
                </div>

                ${redFlags.length > 0 ? `
                    <div class="di-flags-alert">
                        <span>⚠️</span>
                        <span>${redFlags.length} red flag${redFlags.length > 1 ? 's' : ''} identified</span>
                    </div>
                ` : ''}

                <div class="di-actions-mobile">
                    <button class="di-btn-mobile primary" id="toggleFullAnalysis">
                        <i class="fas fa-list"></i> Full Analysis
                    </button>
                    <button class="di-btn-mobile secondary" id="rerunStrategyBtn">
                        <i class="fas fa-redo"></i> Re-run
                    </button>
                </div>

                <div class="di-full-analysis" id="fullAnalysisSection">

                    ${redFlags.length > 0 ? `
                        <div class="di-section-mobile warning">
                            <div class="di-section-header-mobile">⚠️ Red Flags</div>
                            <div class="di-section-content">
                                <ul class="di-list-mobile">
                                    ${redFlags.map(f => `<li>${this.utils.escapeHtml(f)}</li>`).join('')}
                                </ul>
                            </div>
                        </div>
                    ` : ''}

                    ${talkingPoints.length > 0 ? `
                        <div class="di-section-mobile">
                            <div class="di-section-header-mobile">💬 Talking Points</div>
                            <div class="di-section-content">
                                <ul class="di-list-mobile">
                                    ${talkingPoints.map(t => `<li>${this.utils.escapeHtml(t)}</li>`).join('')}
                                </ul>
                            </div>
                        </div>
                    ` : ''}

                    ${gamePlan.approach || gamePlan.next_action ? `
                        <div class="di-section-mobile">
                            <div class="di-section-header-mobile">📋 Strategy Details</div>
                            <div class="di-section-content">
                                ${gamePlan.approach ? `<div class="di-note-mobile"><strong>Approach:</strong> ${gamePlan.approach}</div>` : ''}
                                ${gamePlan.next_action ? `<div class="di-note-mobile"><strong>Next Action:</strong> ${gamePlan.next_action}</div>` : ''}
                                ${gamePlan.urgency_angle ? `<div class="di-note-mobile"><strong>Urgency:</strong> ${gamePlan.urgency_angle}</div>` : ''}
                            </div>
                        </div>
                    ` : ''}

                    ${scenarios.length > 0 ? `
                        <div class="di-section-mobile">
                            <div class="di-section-header-mobile">🎯 Position Scenarios</div>
                            <div class="di-section-content">
                                <div class="di-scenarios-mobile">
                                    ${this.renderScenarioCard(scenarios, 'conservative', 'Conservative')}
                                    ${this.renderScenarioCard(scenarios, 'moderate', 'Moderate')}
                                    ${this.renderScenarioCard(scenarios, 'aggressive', 'Aggressive')}
                                </div>
                            </div>
                        </div>
                    ` : ''}

                    ${withholding.position_breakdown?.length > 0 ? `
                        <div class="di-section-mobile">
                            <div class="di-section-header-mobile">📊 Position Breakdown</div>
                            <div class="di-section-content">
                                <table class="di-table-mobile">
                                    <thead>
                                        <tr><th>Lender</th><th>Payment</th><th>Freq</th><th>%</th></tr>
                                    </thead>
                                    <tbody>
                                        ${withholding.position_breakdown.map(p => `
                                            <tr>
                                                <td>${this.utils.escapeHtml(p.lender)}</td>
                                                <td>$${(p.payment || 0).toLocaleString()}</td>
                                                <td>${p.frequency}</td>
                                                <td>${(p.withhold_pct || 0).toFixed(1)}%</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ` : ''}

                    ${riskConsiderations.length > 0 ? `
                        <div class="di-section-mobile">
                            <div class="di-section-header-mobile">⚡ Risk Considerations</div>
                            <div class="di-section-content">
                                <ul class="di-list-mobile">
                                    ${riskConsiderations.map(r => `<li>${this.utils.escapeHtml(r)}</li>`).join('')}
                                </ul>
                            </div>
                        </div>
                    ` : ''}

                    ${stacking.stacking_notes ? `
                        <div class="di-section-mobile">
                            <div class="di-section-header-mobile">📈 Stacking Assessment</div>
                            <div class="di-section-content">
                                <div class="di-row-mobile">
                                    <span class="di-row-label">Can Stack</span>
                                    <span class="di-row-value ${stacking.can_stack ? 'positive' : 'negative'}">${stacking.can_stack ? 'Yes' : 'No'}</span>
                                </div>
                                <div class="di-row-mobile">
                                    <span class="di-row-label">Term Cap</span>
                                    <span class="di-row-value">${stacking.term_cap_weeks || '-'} weeks</span>
                                </div>
                                <div class="di-note-mobile">${stacking.stacking_notes}</div>
                            </div>
                        </div>
                    ` : ''}

                </div>
            `;

            document.getElementById('toggleFullAnalysis')?.addEventListener('click', () => {
                const section = document.getElementById('fullAnalysisSection');
                const btn = document.getElementById('toggleFullAnalysis');
                if (section && btn) {
                    section.classList.toggle('show');
                    btn.innerHTML = section.classList.contains('show')
                        ? '<i class="fas fa-minus"></i> Hide Analysis'
                        : '<i class="fas fa-list"></i> Full Analysis';
                }
            });

            document.getElementById('rerunStrategyBtn')?.addEventListener('click', () => {
                this.runStrategyAnalysis();
            });
        }

        renderScenarioCard(scenarios, tier, title) {
            const filtered = scenarios.filter(s => s.tier === tier);
            if (filtered.length === 0) return '';

            return `
                <div class="di-scenario-card-mobile ${tier}">
                    <div class="di-scenario-title-mobile">${title}</div>
                    ${filtered.map(s => `
                        <div class="di-scenario-row-mobile">
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

});
