export class DealIntelligenceTab {
    constructor(parent) {
        this.parent = parent;
        this.isAnalyzing = false;
    }

    render(container) {
        const conv = this.parent.getSelectedConversation();

        if (!conv) {
            container.innerHTML = '<div class="deal-intel-empty-state"><p class="empty-text">No conversation selected.</p></div>';
            return;
        }

        const strategy = conv.lead_strategy || {};
        const gamePlan = strategy.game_plan || {};

        // --- 1. EMPTY STATE ---
        if (!gamePlan.businessOverview) {
            container.innerHTML = `
                <div class="deal-intel-empty-state">
                    <div class="empty-icon">
                        <svg width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                        </svg>
                    </div>
                    <h3 class="empty-title">Awaiting Strategy Analysis</h3>
                    <p class="empty-text">Run the Commander to analyze bank statements, detect competitors, and generate offer scenarios.</p>

                    <button id="runAnalysisBtn" class="run-analysis-btn">
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                        </svg>
                        Run FCS Analysis
                    </button>
                    <p id="analysisStatus" class="analysis-status"></p>
                </div>
            `;

            container.querySelector('#runAnalysisBtn')?.addEventListener('click', () => this.runAnalysis(conv.id));
            return;
        }

        // --- 2. PREPARE DATA ---
        const overview = gamePlan.businessOverview || {};
        const withholding = gamePlan.withholding || {};
        const scenarios = gamePlan.nextPositionScenarios || {};
        const isFirstPosition = (overview.currentPositions === 0);

        // --- 3. RENDER DATA VIEW ---
        container.innerHTML = `
            <div class="deal-intelligence-panel">

                <div class="panel-header-row">
                    <h2 class="panel-title">Deal Intelligence</h2>
                    <span class="strategy-badge ${strategy.strategy_type || ''}">
                        ${strategy.strategy_type ? strategy.strategy_type.replace('_', ' ') : 'Ready'}
                    </span>
                </div>

                <div class="data-grid">
                    <div class="data-item">
                        <div class="data-label">Avg Revenue</div>
                        <div class="data-value">${(overview.avgRevenue || 0).toLocaleString()}</div>
                    </div>
                    <div class="data-item">
                        <div class="data-label">Positions</div>
                        <div class="data-value">${overview.currentPositions || 0} Active</div>
                    </div>
                    <div class="data-item">
                        <div class="data-label">Avg Balance</div>
                        <div class="data-value">${(overview.avgBankBalance || 0).toLocaleString()}</div>
                    </div>
                    <div class="data-item">
                        <div class="data-label">Negative Days</div>
                        <div class="data-value">${overview.negativeDays !== undefined ? overview.negativeDays : '-'}</div>
                    </div>
                </div>

                <div class="withholding-section">
                    <div class="withholding-header">
                        <h3 class="section-title">Withholding Analysis</h3>
                        <div class="withholding-total-display">
                            <div class="total-value">${(withholding.totalWithhold || 0).toFixed(1)}%</div>
                            <div class="total-label">Total Usage</div>
                        </div>
                    </div>
                    ${this.renderWithholdingList(withholding.breakdown)}
                </div>

                <h3 class="section-title scenarios-title">
                    ${isFirstPosition ? 'Recommended Opening Offer' : 'Stacking Options'}
                </h3>

                ${this.renderScenarios(scenarios, isFirstPosition)}

                ${this.renderLastPosition(gamePlan.lastPositionAnalysis)}

            </div>
        `;
    }

    renderWithholdingList(breakdown) {
        if (!breakdown || breakdown.length === 0) {
            return '<div class="no-data-message">No active positions found.</div>';
        }

        return breakdown.map(item => `
            <div class="withholding-item">
                <div class="withholding-info">
                    <div class="lender-name">${item.lender}</div>
                    <div class="payment-info">${item.payment.toLocaleString()} ${item.frequency}</div>
                </div>
                <div class="withholding-pct">
                    <span class="pct-badge">${item.withholdPct}%</span>
                </div>
            </div>
        `).join('');
    }

    renderScenarios(nps, isFirstPosition) {
        if (!nps) return '';

        const getOffer = (tier) => nps[tier] && nps[tier][0] ? nps[tier][0] : null;
        const leadOffer = getOffer('aggressive') || getOffer('moderate') || getOffer('conservative');

        if (!leadOffer) {
            return '<div class="no-data-message">No scenarios generated.</div>';
        }

        // First Position - Show single offer card
        if (isFirstPosition) {
            return `
                <div class="offer-card">
                    <div class="offer-grid">
                        <div class="offer-stat">
                            <div class="data-label">Funding</div>
                            <div class="offer-big-value">${leadOffer.funding.toLocaleString()}</div>
                        </div>
                        <div class="offer-stat">
                            <div class="data-label">Term</div>
                            <div class="offer-big-value secondary">${leadOffer.term} ${leadOffer.termUnit}</div>
                        </div>
                        <div class="offer-stat">
                            <div class="data-label">Payment</div>
                            <div class="offer-big-value secondary">${leadOffer.payment.toLocaleString()}</div>
                        </div>
                    </div>

                    <div class="offer-details">
                        <div class="detail-row">
                            <span>Factor Rate:</span>
                            <span class="detail-value">${leadOffer.factor}</span>
                        </div>
                        <div class="detail-row">
                            <span>Withholding:</span>
                            <span class="detail-value highlight">+${leadOffer.withholdAddition}%</span>
                        </div>
                    </div>

                    <div class="offer-note">
                        ${leadOffer.frequency === 'daily' ? 'Daily' : 'Weekly'} payment based on revenue analysis.
                    </div>
                </div>
            `;
        }

        // Stacking - Show tables
        return `
            <div class="scenarios-container">
                ${this.renderScenarioTable(nps.conservative, 'Conservative', 'conservative')}
                ${this.renderScenarioTable(nps.moderate, 'Moderate', 'moderate')}
                ${this.renderScenarioTable(nps.aggressive, 'Aggressive', 'aggressive')}
            </div>
        `;
    }

    renderScenarioTable(rows, title, typeClass) {
        if (!rows || rows.length === 0) return '';

        const rowsHtml = rows.slice(0, 3).map(r => `
            <tr>
                <td class="cell-funding">${r.funding.toLocaleString()}</td>
                <td>${r.term} ${r.termUnit}</td>
                <td>${r.payment.toLocaleString()}</td>
                <td class="cell-cap">+${r.withholdAddition}%</td>
            </tr>
        `).join('');

        return `
            <div class="scenario-box">
                <div class="scenario-header ${typeClass}">${title} Options</div>
                <table>
                    <thead>
                        <tr>
                            <th>Fund</th>
                            <th>Term</th>
                            <th>Payment</th>
                            <th>Cap</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        `;
    }

    renderLastPosition(lp) {
        // Guard against missing data
        if (!lp || !lp.scenarios || lp.scenarios.length === 0) return '';

        const deal = lp.scenarios[0];

        // Guard against missing fields
        if (!deal) return '';

        const funding = deal.originalFunding || deal.funding || 0;
        const term = deal.term || '?';
        const termUnit = deal.termUnit || '';
        const reasoning = deal.reasoning || 'Standard deal structure detected.';

        return `
            <div class="competitor-box">
                <h3 class="section-title">Last Position Analysis</h3>
                <div class="competitor-grid">
                    <div>
                        <div class="competitor-value">${funding.toLocaleString()}</div>
                        <div class="competitor-label">Est. Original Funding</div>
                    </div>
                    <div class="text-right">
                        <div class="competitor-value">${term} ${termUnit}</div>
                        <div class="competitor-label">Term Length</div>
                    </div>
                </div>
                <div class="competitor-insight">
                    <strong>Insight:</strong> ${reasoning}
                </div>
            </div>
        `;
    }

    async runAnalysis(conversationId) {
        const btn = document.getElementById('runAnalysisBtn');
        const status = document.getElementById('analysisStatus');

        if (!btn || this.isAnalyzing) return;

        this.isAnalyzing = true;
        btn.disabled = true;
        btn.innerHTML = `
            <svg class="spin" width="20" height="20" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" opacity="0.3"></circle>
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"></path>
            </svg>
            Analyzing...
        `;

        if (status) {
            status.textContent = 'Running FCS analysis with Commander AI...';
            status.classList.remove('error');
        }

        try {
            const response = await fetch(`/api/commander/${conversationId}/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();

            if (result.success) {
                if (status) status.textContent = 'Analysis complete! Loading results...';
                await this.parent.intelligence.loadConversationIntelligence(conversationId);
            } else {
                throw new Error(result.error || 'Analysis failed');
            }

        } catch (error) {
            console.error('Analysis error:', error);
            if (status) {
                status.textContent = `Error: ${error.message}`;
                status.classList.add('error');
            }

            btn.disabled = false;
            btn.innerHTML = `
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
                Retry Analysis
            `;
        }

        this.isAnalyzing = false;
    }
}
