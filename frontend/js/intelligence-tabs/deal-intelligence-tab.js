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

        // ============================================================
        // COMMANDER TRACE
        // ============================================================
        // We look for 'lead_strategy' or 'game_plan' which comes from the Commander Service
        // If your API returns it merged into the conversation, it might be at conv.lead_strategy
        const strategy = conv.lead_strategy || conv.game_plan || {};

        console.group('Commander Logic Trace');
        console.log('Raw Conversation:', conv);
        console.log('Detected Strategy:', strategy);
        console.groupEnd();

        // Map Commander Data (with defaults if the AI hasn't run yet)
        const commanderData = {
            grade: strategy.lead_grade || 'N/A',
            type: strategy.strategy_type || 'PENDING',
            minOffer: strategy.offer_range?.min || 0,
            maxOffer: strategy.offer_range?.max || 0,
            approach: strategy.approach || strategy.game_plan?.approach || 'Waiting for analysis...',
            nextAction: strategy.next_action || strategy.game_plan?.next_action || 'Unknown',
            reason: strategy.reason || strategy.last_update_reason || ''
        };

        // Helper for currency formatting
        const fmtMoney = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

        // ============================================================
        // RENDER UI
        // ============================================================
        container.innerHTML = `
            <div class="deal-intelligence-panel p-4 h-full overflow-y-auto space-y-6">

                <div class="flex items-center justify-between bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div>
                        <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Lead Grade</span>
                        <div class="text-4xl font-black ${this.getGradeColor(commanderData.grade)}">
                            ${commanderData.grade}
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Strategy</span>
                        <div class="mt-1">
                            <span class="px-3 py-1 rounded-full text-sm font-bold ${this.getStrategyBadgeColor(commanderData.type)}">
                                ${commanderData.type.replace(/_/g, ' ')}
                            </span>
                        </div>
                    </div>
                </div>

                <div>
                    <h4 class="text-sm font-bold text-gray-700 mb-2">Recommended Offer Range</h4>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-green-50 p-3 rounded border border-green-100">
                            <span class="text-xs text-green-600 block">Min</span>
                            <span class="text-lg font-bold text-gray-800">${fmtMoney(commanderData.minOffer)}</span>
                        </div>
                        <div class="bg-green-50 p-3 rounded border border-green-100">
                            <span class="text-xs text-green-600 block">Max</span>
                            <span class="text-lg font-bold text-gray-800">${fmtMoney(commanderData.maxOffer)}</span>
                        </div>
                    </div>
                </div>

                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-bold text-gray-700">Strategic Approach</label>
                        <div class="mt-1 p-3 bg-white border border-gray-200 rounded-md text-sm text-gray-700 leading-relaxed shadow-sm">
                            ${commanderData.approach}
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-bold text-gray-700">Next Recommended Action</label>
                        <div class="mt-1 p-3 bg-blue-50 border border-blue-100 rounded-md text-sm text-blue-800 font-medium">
                            ${commanderData.nextAction}
                        </div>
                    </div>

                    ${commanderData.reason ? `
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase">Latest Update Reason</label>
                        <p class="text-xs text-gray-500 italic mt-1">${commanderData.reason}</p>
                    </div>` : ''}
                </div>

                <div class="pt-4 border-t border-gray-200">
                    <button id="reRunCommander" class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none">
                        Re-Run Strategy Analysis
                    </button>
                </div>
            </div>
        `;

        document.getElementById('reRunCommander').addEventListener('click', () => {
            alert("This would trigger the API to run /api/analyze-strategy again.");
            // this.parent.apiCall(`/api/strategy/rerun/${conv.id}`, 'POST');
        });
    }

    getGradeColor(grade) {
        if (['A', 'A+'].includes(grade)) return 'text-green-600';
        if (['B', 'B+'].includes(grade)) return 'text-blue-600';
        if (['C', 'C+'].includes(grade)) return 'text-yellow-600';
        return 'text-red-600';
    }

    getStrategyBadgeColor(type) {
        switch(type) {
            case 'PURSUE_HARD': return 'bg-green-100 text-green-800 border border-green-200';
            case 'NURTURE': return 'bg-blue-100 text-blue-800 border border-blue-200';
            case 'HOLD': return 'bg-yellow-100 text-yellow-800 border border-yellow-200';
            case 'DEAD': return 'bg-red-100 text-red-800 border border-red-200';
            default: return 'bg-gray-100 text-gray-800';
        }
    }
}
