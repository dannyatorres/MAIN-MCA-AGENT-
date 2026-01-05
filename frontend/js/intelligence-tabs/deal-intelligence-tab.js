export class DealIntelligenceTab {
    constructor(parent) {
        this.parent = parent;
        this.isAnalyzing = false;
    }

    render(container) {
        const conv = this.parent.getSelectedConversation();

        if (!conv) {
            container.innerHTML = '<div class="di-empty">No conversation selected.</div>';
            return;
        }

        const strategy = conv.lead_strategy || {};
        const gamePlan = strategy.game_plan || {};

        // Empty state
        if (!gamePlan.businessOverview) {
            container.innerHTML = `
                <div class="di-empty">
                    <p>No strategy analysis yet.</p>
                    <button id="runAnalysisBtn" class="di-btn">Run FCS Analysis</button>
                    <p id="analysisStatus" class="di-status"></p>
                </div>
            `;
            container.querySelector('#runAnalysisBtn')?.addEventListener('click', () => this.runAnalysis(conv.id));
            return;
        }

        const overview = gamePlan.businessOverview || {};
        const withholding = gamePlan.withholding || {};
        const trend = gamePlan.revenueTrend || {};
        const lastPos = gamePlan.lastPositionAnalysis || {};
        const scenarios = gamePlan.nextPositionScenarios || {};
        const guidance = scenarios.guidance || {};

        container.innerHTML = `
            <div class="di-panel">

                <!-- Header -->
                <div class="di-header">
                    <span class="di-grade grade-${gamePlan.lead_grade || 'C'}">${gamePlan.lead_grade || '?'}</span>
                    <span class="di-strategy ${gamePlan.strategy_type || ''}">${(gamePlan.strategy_type || 'PENDING').replace('_', ' ')}</span>
                    <span class="di-position">→ ${overview.nextPosition || '?'}${this.ordinal(overview.nextPosition)} Position</span>
                </div>

                <!-- Overview Row -->
                <div class="di-row">
                    <div class="di-cell">
                        <span class="di-label">Revenue</span>
                        <span class="di-value">$${(overview.avgRevenue || 0).toLocaleString()}</span>
                    </div>
                    <div class="di-cell">
                        <span class="di-label">Balance</span>
                        <span class="di-value">$${(overview.avgBankBalance || 0).toLocaleString()}</span>
                    </div>
                    <div class="di-cell">
                        <span class="di-label">Neg Days</span>
                        <span class="di-value">${overview.negativeDays ?? '-'}</span>
                    </div>
                    <div class="di-cell">
                        <span class="di-label">Withhold</span>
                        <span class="di-value">${(withholding.totalWithhold || 0).toFixed(1)}%</span>
                    </div>
                </div>

                <!-- Revenue Trend -->
                ${trend.direction ? `
                <div class="di-section">
                    <div class="di-section-title">Revenue Trend</div>
                    <div class="di-row">
                        <div class="di-cell">
                            <span class="di-label">Direction</span>
                            <span class="di-value trend-${trend.direction}">${trend.direction}</span>
                        </div>
                        <div class="di-cell">
                            <span class="di-label">Floor</span>
                            <span class="di-value">$${(trend.floorMonth?.amount || 0).toLocaleString()} <small>(${trend.floorMonth?.month || '?'})</small></span>
                        </div>
                        <div class="di-cell">
                            <span class="di-label">Ceiling</span>
                            <span class="di-value">$${(trend.fundingCeiling || 0).toLocaleString()}</span>
                        </div>
                    </div>
                    ${trend.trendAnalysis ? `<div class="di-note">${trend.trendAnalysis}</div>` : ''}
                    ${trend.ceilingReasoning ? `<div class="di-note"><strong>Ceiling:</strong> ${trend.ceilingReasoning}</div>` : ''}
                </div>
                ` : ''}

                <!-- Withholding Breakdown -->
                ${withholding.breakdown?.length > 0 ? `
                <div class="di-section">
                    <div class="di-section-title">Active Positions</div>
                    <table class="di-table">
                        <thead>
                            <tr><th>Lender</th><th>Payment</th><th>Freq</th><th>%</th></tr>
                        </thead>
                        <tbody>
                            ${withholding.breakdown.map(p => `
                                <tr>
                                    <td>${p.lender}</td>
                                    <td>$${p.payment.toLocaleString()}</td>
                                    <td>${p.frequency}</td>
                                    <td>${p.withholdPct}%</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ` : ''}

                <!-- Last Position Analysis -->
                ${lastPos.scenarios?.length > 0 ? `
                <div class="di-section">
                    <div class="di-section-title">Last Position Analysis</div>
                    ${lastPos.reason ? `<div class="di-note">${lastPos.reason}</div>` : ''}
                    <table class="di-table">
                        <thead>
                            <tr><th>Funding</th><th>Term</th><th>Factor</th><th>Fee%</th><th>Confidence</th></tr>
                        </thead>
                        <tbody>
                            ${lastPos.scenarios.slice(0, 3).map((s, i) => `
                                <tr class="${i === 0 ? 'di-highlight' : ''}">
                                    <td>$${(s.originalFunding || s.funding || 0).toLocaleString()}</td>
                                    <td>${s.term} ${s.termUnit}</td>
                                    <td>${s.factor || '-'}</td>
                                    <td>${s.feePercentage || '-'}%</td>
                                    <td>${s.confidence || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ` : ''}

                <!-- Offer Range -->
                <div class="di-section">
                    <div class="di-section-title">Recommended Offer</div>
                    <div class="di-row">
                        <div class="di-cell">
                            <span class="di-label">Range</span>
                            <span class="di-value">$${(gamePlan.offer_range?.min || 0).toLocaleString()} - $${(gamePlan.offer_range?.max || 0).toLocaleString()}</span>
                        </div>
                        <div class="di-cell">
                            <span class="di-label">Add Withhold</span>
                            <span class="di-value">+${guidance.recommendedWithholdingAddition || '?'}%</span>
                        </div>
                        <div class="di-cell">
                            <span class="di-label">Frequency</span>
                            <span class="di-value">${guidance.paymentFrequency || '-'}</span>
                        </div>
                    </div>
                    ${guidance.reasoning ? `<div class="di-note">${guidance.reasoning}</div>` : ''}
                    ${guidance.frequencyReasoning ? `<div class="di-note"><strong>Frequency:</strong> ${guidance.frequencyReasoning}</div>` : ''}
                </div>

                <!-- Scenarios -->
                <div class="di-section">
                    <div class="di-section-title">Scenarios</div>
                    <div class="di-scenarios">
                        ${this.renderScenarioTable(scenarios.conservative, 'Conservative')}
                        ${this.renderScenarioTable(scenarios.moderate, 'Moderate')}
                        ${this.renderScenarioTable(scenarios.aggressive, 'Aggressive')}
                    </div>
                </div>

                <!-- Risk Considerations -->
                ${scenarios.considerations?.length > 0 ? `
                <div class="di-section">
                    <div class="di-section-title">Risk Factors</div>
                    <ul class="di-list">
                        ${scenarios.considerations.map(c => c.points?.map(p => `<li>${p}</li>`).join('') || '').join('')}
                    </ul>
                </div>
                ` : ''}

            </div>
        `;
    }

    renderScenarioTable(rows, title) {
        if (!rows || rows.length === 0) return '';

        return `
            <div class="di-scenario">
                <div class="di-scenario-title">${title}</div>
                <table class="di-table compact">
                    <thead>
                        <tr><th>$</th><th>Term</th><th>Pmt</th><th>+%</th></tr>
                    </thead>
                    <tbody>
                        ${rows.slice(0, 3).map(r => `
                            <tr>
                                <td>${(r.funding / 1000).toFixed(0)}k</td>
                                <td>${r.term}${r.termUnit === 'weeks' ? 'w' : 'd'}</td>
                                <td>${r.payment.toLocaleString()}</td>
                                <td>+${r.withholdAddition}%</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
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
        const btn = document.getElementById('runAnalysisBtn');
        const status = document.getElementById('analysisStatus');

        if (!btn || this.isAnalyzing) return;

        this.isAnalyzing = true;
        btn.disabled = true;
        btn.textContent = 'Analyzing...';

        if (status) status.textContent = 'Running Commander AI...';

        try {
            const response = await fetch(`/api/commander/${conversationId}/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();

            if (result.success) {
                if (status) status.textContent = 'Done. Loading...';
                await this.parent.intelligence.loadConversationIntelligence(conversationId);
            } else {
                throw new Error(result.error || 'Analysis failed');
            }
        } catch (error) {
            console.error('Analysis error:', error);
            if (status) status.textContent = `Error: ${error.message}`;
            btn.disabled = false;
            btn.textContent = 'Retry';
        }

        this.isAnalyzing = false;
    }
}
