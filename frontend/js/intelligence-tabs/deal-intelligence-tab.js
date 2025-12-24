export class DealIntelligenceTab {
    constructor(parent) {
        this.parent = parent;
    }

    render(container) {
        const conv = this.parent.getSelectedConversation();

        if (!conv) {
            container.innerHTML = '<div class="p-4 text-gray-500">No conversation selected.</div>';
            return;
        }

        const strategy = conv.lead_strategy || {};
        const gamePlan = strategy.game_plan || {};

        // --- 1. EMPTY STATE ---
        if (!gamePlan.businessOverview) {
            container.innerHTML = `
                <div class="p-8 text-center h-full flex flex-col justify-center items-center">
                    <div class="text-gray-300 mb-4">
                        <svg class="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                    </div>
                    <h3 class="text-lg font-medium text-gray-900">Awaiting Strategy Analysis</h3>
                    <p class="mt-2 text-sm text-gray-500 max-w-xs">Run the Commander to analyze bank statements, detect competitors, and generate offer scenarios.</p>
                </div>
            `;
            return;
        }

        // --- 2. PREPARE DATA ---
        const overview = gamePlan.businessOverview || {};
        const withholding = gamePlan.withholding || {};
        const scenarios = gamePlan.nextPositionScenarios || {};
        const isFirstPosition = (overview.currentPositions === 0);

        // --- 3. RENDER (Using CSS Classes) ---
        container.innerHTML = `
            <div class="deal-intelligence-panel p-4 h-full overflow-y-auto">

                <div class="flex items-center justify-between mb-6">
                    <h2 class="text-lg font-bold text-gray-800">Deal Intelligence</h2>
                    <span class="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full uppercase tracking-wide">
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
                     <div class="flex justify-between items-end mb-4">
                        <h3 class="text-sm font-bold text-gray-500 uppercase tracking-wider">Withholding Analysis</h3>
                        <div class="text-right">
                             <div class="text-2xl font-bold text-blue-600">${(withholding.totalWithhold || 0).toFixed(1)}%</div>
                             <div class="text-xs text-gray-400 uppercase">Total Usage</div>
                        </div>
                    </div>
                    ${this.renderWithholdingList(withholding.breakdown)}
                </div>

                <h3 class="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 mt-6">
                    ${isFirstPosition ? 'Recommended Opening Offer' : 'Stacking Options'}
                </h3>

                ${this.renderScenarios(scenarios, isFirstPosition)}

                ${this.renderLastPosition(gamePlan.lastPositionAnalysis)}

                <div class="h-8"></div>
            </div>
        `;
    }

    renderWithholdingList(breakdown) {
        if (!breakdown || breakdown.length === 0) return '<div class="text-sm text-gray-400 italic py-2">No active positions found.</div>';

        return breakdown.map(item => `
            <div class="withholding-item">
                <div>
                    <div class="font-medium text-sm text-gray-900">${item.lender}</div>
                    <div class="text-xs text-gray-500">${item.payment.toLocaleString()} ${item.frequency}</div>
                </div>
                <div class="text-right flex flex-col justify-center">
                    <span class="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded">
                        ${item.withholdPct}%
                    </span>
                </div>
            </div>
        `).join('');
    }

    renderScenarios(nps, isFirstPosition) {
        if (!nps) return '';

        // Helper to get best offer
        const getOffer = (tier) => nps[tier] && nps[tier][0] ? nps[tier][0] : null;
        const leadOffer = getOffer('aggressive') || getOffer('moderate') || getOffer('conservative');

        if (!leadOffer) return '<div class="p-4 bg-gray-50 rounded text-sm text-gray-500">No scenarios generated.</div>';

        // 1. OPENING OFFER CARD (First Position)
        if (isFirstPosition) {
            return `
                <div class="offer-card">
                    <div class="offer-grid">
                        <div>
                            <div class="data-label">Funding</div>
                            <div class="offer-big-value">${leadOffer.funding.toLocaleString()}</div>
                        </div>
                        <div>
                            <div class="data-label">Term</div>
                            <div class="offer-big-value text-gray-700">${leadOffer.term} ${leadOffer.termUnit}</div>
                        </div>
                        <div>
                            <div class="data-label">Payment</div>
                            <div class="offer-big-value text-gray-700">${leadOffer.payment.toLocaleString()}</div>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4 text-sm text-gray-600 bg-white bg-opacity-60 p-3 rounded-lg border border-blue-100">
                        <div class="flex justify-between">
                            <span>Factor Rate:</span> <span class="font-bold text-gray-900">${leadOffer.factor}</span>
                        </div>
                        <div class="flex justify-between">
                            <span>Withholding:</span> <span class="font-bold text-blue-600">+${leadOffer.withholdAddition}%</span>
                        </div>
                    </div>

                    <div class="mt-4 pt-4 border-t border-blue-100">
                        <p class="text-sm text-gray-600 italic text-center">
                            "${leadOffer.frequency === 'daily' ? 'Daily' : 'Weekly'} payment based on strong revenue trend."
                        </p>
                    </div>
                </div>
            `;
        }

        // 2. STACKING TABLES
        return `
            <div>
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
                <td class="font-bold text-gray-900">${r.funding.toLocaleString()}</td>
                <td>${r.term} ${r.termUnit}</td>
                <td>${r.payment.toLocaleString()}</td>
                <td class="font-bold text-blue-600">+${r.withholdAddition}%</td>
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
                            <th>Pay</th>
                            <th>Cap</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        `;
    }

    renderLastPosition(lp) {
        if (!lp || !lp.scenarios || lp.scenarios.length === 0) return '';
        const deal = lp.scenarios[0];

        return `
            <div class="competitor-box">
                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Last Position Analysis</h3>
                <div class="flex justify-between items-start">
                    <div>
                        <div class="text-xl font-bold text-gray-800">${deal.originalFunding.toLocaleString()}</div>
                        <div class="text-xs text-gray-500 uppercase mt-1">Est. Original Funding</div>
                    </div>
                    <div class="text-right">
                        <div class="text-xl font-bold text-gray-800">${deal.term} ${deal.termUnit}</div>
                         <div class="text-xs text-gray-500 uppercase mt-1">Term Length</div>
                    </div>
                </div>
                <div class="mt-3 text-sm text-gray-600 bg-white p-3 rounded border border-gray-200">
                    <span class="font-bold text-gray-800">Insight:</span> ${deal.reasoning || 'Standard deal structure detected.'}
                </div>
            </div>
        `;
    }
}
