// js/ui-actions.js - Centralized UI Event Handler

const globalActions = {
    // --- Navigation & Modals ---
    'open-formatter': () => {
        if (window.commandCenter?.leadFormatter) {
            window.commandCenter.leadFormatter.open();
        } else {
            document.getElementById('formatterModal')?.classList.remove('hidden');
        }
    },

    'open-verifier': () => {
        if (typeof window.openCleanerModal === 'function') window.openCleanerModal();
        else console.warn('Cleaner modal function not loaded yet');
    },

    'open-lender-management': () => {
        // This function is likely in lender-admin.js
        if (window.openLenderManagementModal) window.openLenderManagementModal();
        else alert('Lender management module is still loading...');
    },

    'open-settings': () => {
        const modal = document.getElementById('settingsModal');
        if (modal) modal.classList.remove('hidden');
    },
    'open-offer-builder': () => {
        if (typeof window.openOfferBuilder === 'function') {
            window.openOfferBuilder();
        } else {
            console.warn('Offer builder not loaded yet');
        }
    },
    'open-dialer': () => {
        if (window.powerDialer) {
            window.powerDialer.show();
        } else {
            console.warn('Smart Dialer module not loaded');
        }
    },
    'close-settings': () => {
        const modal = document.getElementById('settingsModal');
        if (modal) modal.classList.add('hidden');
    },
    'open-usage': () => {
        document.getElementById('settingsModal')?.classList.add('hidden');
        document.getElementById('usageModal')?.classList.remove('hidden');
        loadUsageData();
    },
    'close-usage': () => {
        document.getElementById('usageModal')?.classList.add('hidden');
    },
    'logout': () => {
        if (confirm('Log out?')) {
            fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
                .finally(() => {
                    localStorage.removeItem('currentUser');
                    window.location.href = '/login.html';
                });
        }
    },
    'open-rich-create': () => window.openRichCreateModal?.(),
    'open-csv-import': () => window.openCsvImportModal?.(),

    // --- Dashboard Stats ---
    'show-submitted': () => window.showSubmittedLeads?.(),
    'show-offers': () => window.showOffersModal?.(),
    'edit-goal': () => window.editMonthlyGoal?.(),

    // --- Toolbar Actions ---
    'toggle-delete-mode': () => {
        if (window.conversationUI && window.conversationUI.core) {
            window.conversationUI.core.toggleDeleteMode();
        } else {
            console.warn('⚠️ Core not ready yet');
        }
    }
};

window.toggleDeleteMode = globalActions['toggle-delete-mode'];

async function loadUsageData() {
    const container = document.getElementById('usageContent');

    const rangeSelect = document.getElementById('usageDateRange');
    const { startDate, endDate, prevStart, prevEnd } = getDateRange(rangeSelect?.value || 'this-month');

    container.innerHTML = '<div style="padding: 40px; text-align: center; color: #8b949e;">Loading...</div>';

    try {
        const [summaryRes, breakdownRes, trendsRes, servicesRes, prevSummaryRes] = await Promise.all([
            window.commandCenter.apiCall(`/api/usage/summary?start=${startDate}&end=${endDate}`),
            window.commandCenter.apiCall(`/api/usage/breakdown?start=${startDate}&end=${endDate}`),
            window.commandCenter.apiCall(`/api/usage/daily-trends?start=${startDate}&end=${endDate}`),
            window.commandCenter.apiCall(`/api/usage/by-service?start=${startDate}&end=${endDate}`),
            window.commandCenter.apiCall(`/api/usage/summary?start=${prevStart}&end=${prevEnd}`)
        ]);

        if (!summaryRes.success) throw new Error('Failed to load');

        const { summary, totals } = summaryRes;
        const prevTotals = prevSummaryRes.totals || {};
        const breakdown = breakdownRes.breakdown || [];
        const trends = trendsRes.trends || [];
        const services = servicesRes.services || [];

        // Group breakdown by user
        const userBreakdown = {};
        breakdown.forEach(row => {
            const userName = row.user_name || 'System';
            if (!userBreakdown[userName]) userBreakdown[userName] = [];
            userBreakdown[userName].push(row);
        });

        const start = new Date(startDate).toLocaleDateString();
        const end = new Date(endDate).toLocaleDateString();

        container.innerHTML = `
            <style>
                .chevron.rotated { transform: rotate(90deg); }
                .usage-card { background: #161b22; padding: 20px; border-radius: 10px; border: 1px solid #30363d; }
                .usage-change { font-size: 11px; margin-top: 4px; }
                .usage-change.positive { color: #f85149; }
                .usage-change.negative { color: #3fb950; }
                .usage-change.neutral { color: #8b949e; }
                .date-preset { padding: 6px 12px; border-radius: 6px; border: 1px solid #30363d; background: #0d1117; color: #e6edf3; cursor: pointer; font-size: 12px; }
                .date-preset:hover { border-color: #58a6ff; }
                .date-preset.active { border-color: #58a6ff; background: rgba(88, 166, 255, 0.1); }
            </style>

            <!-- Date Range Picker -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="date-preset ${rangeSelect?.value === 'today' ? 'active' : ''}" onclick="setUsageDateRange('today')">Today</button>
                    <button class="date-preset ${rangeSelect?.value === 'last-7' ? 'active' : ''}" onclick="setUsageDateRange('last-7')">Last 7 Days</button>
                    <button class="date-preset ${rangeSelect?.value === 'last-30' ? 'active' : ''}" onclick="setUsageDateRange('last-30')">Last 30 Days</button>
                    <button class="date-preset ${!rangeSelect?.value || rangeSelect?.value === 'this-month' ? 'active' : ''}" onclick="setUsageDateRange('this-month')">This Month</button>
                    <button class="date-preset ${rangeSelect?.value === 'last-month' ? 'active' : ''}" onclick="setUsageDateRange('last-month')">Last Month</button>
                </div>
                <button onclick="exportUsageCSV()" style="padding: 6px 12px; border-radius: 6px; border: 1px solid #30363d; background: #238636; color: white; cursor: pointer; font-size: 12px;">
                    ⬇ Export CSV
                </button>
            </div>
            <input type="hidden" id="usageDateRange" value="${rangeSelect?.value || 'this-month'}">

            <div style="font-size: 12px; color: #8b949e; margin-bottom: 15px;">
                Period: ${start} - ${end}
            </div>

            <!-- Summary Cards with Comparison -->
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 25px;">
                ${renderStatCard('Total API Calls', totals.totalCalls, prevTotals.totalCalls, '#3b82f6', false)}
                ${renderStatCard('LLM Tokens', totals.totalTokens || 0, prevTotals.totalTokens || 0, '#8b5cf6', false, true)}
                ${renderStatCard('Your Cost', totals.totalCostActual, prevTotals.totalCostActual, '#10b981', true)}
                ${renderStatCard('Billable Amount', totals.totalCostBillable, prevTotals.totalCostBillable, '#f59e0b', true)}
            </div>

            <!-- Profit Card -->
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 15px 20px; border-radius: 10px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-size: 12px; color: rgba(255,255,255,0.8);">Estimated Profit</div>
                    <div style="font-size: 24px; font-weight: 600; color: white;">$${(totals.totalCostBillable - totals.totalCostActual).toFixed(2)}</div>
                </div>
                <div style="font-size: 12px; color: rgba(255,255,255,0.8);">
                    ${totals.totalCostActual > 0 ? Math.round(((totals.totalCostBillable - totals.totalCostActual) / totals.totalCostActual) * 100) : 0}% margin
                </div>
            </div>

            <!-- Charts Row -->
            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-bottom: 25px;">
                <!-- Spend Trend Chart -->
                <div class="usage-card">
                    <div style="font-weight: 500; color: #e6edf3; margin-bottom: 15px;">Daily Spend</div>
                    <div style="height: 200px; position: relative;">
                        ${renderSpendChart(trends)}
                    </div>
                </div>

                <!-- Service Breakdown Pie -->
                <div class="usage-card">
                    <div style="font-weight: 500; color: #e6edf3; margin-bottom: 15px;">Cost by Service</div>
                    ${renderServiceBreakdown(services)}
                </div>
            </div>

            <!-- Detailed Breakdown Table -->
            <div style="background: #161b22; border-radius: 10px; border: 1px solid #30363d; overflow: hidden;">
                <div style="padding: 15px 20px; border-bottom: 1px solid #30363d; font-weight: 500; color: #e6edf3;">
                    Breakdown by User
                </div>
                <div style="max-height: 400px; overflow-y: auto;">
                    ${breakdown.length === 0 ?
                        '<div style="padding: 40px; text-align: center; color: #8b949e;">No usage data yet</div>' :
                        Object.entries(userBreakdown).map(([userName, rows]) => {
                            const userTotals = rows.reduce((acc, r) => ({
                                calls: acc.calls + parseInt(r.calls || 0),
                                tokens: acc.tokens + parseInt(r.total_tokens || 0),
                                cost: acc.cost + parseFloat(r.cost_actual || 0),
                                billable: acc.billable + parseFloat(r.cost_billable || 0)
                            }), { calls: 0, tokens: 0, cost: 0, billable: 0 });

                            return `
                            <div style="border-bottom: 1px solid #30363d;">
                                <div onclick="this.nextElementSibling.classList.toggle('hidden'); this.querySelector('.chevron').classList.toggle('rotated')"
                                     style="padding: 15px 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: #0d1117;">
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <span class="chevron" style="transition: transform 0.2s;">▶</span>
                                        <span style="font-weight: 500; color: #e6edf3;">${userName}</span>
                                        <span style="font-size: 11px; color: #8b949e;">(${rows.length} services)</span>
                                    </div>
                                    <div style="display: flex; gap: 20px; font-size: 12px;">
                                        <span style="color: #8b949e;">${userTotals.calls} calls</span>
                                        <span style="color: #8b949e;">${userTotals.tokens.toLocaleString()} tokens</span>
                                        <span style="color: #10b981;">$${userTotals.cost.toFixed(2)}</span>
                                        <span style="color: #f59e0b; font-weight: 500;">$${userTotals.billable.toFixed(2)}</span>
                                    </div>
                                </div>
                                <div class="hidden">
                                    <table style="width: 100%; border-collapse: collapse;">
                                        <thead>
                                            <tr style="background: #161b22;">
                                                <th style="padding: 10px 15px; text-align: left; font-size: 11px; color: #8b949e;">SERVICE</th>
                                                <th style="padding: 10px 15px; text-align: left; font-size: 11px; color: #8b949e;">MODEL/TYPE</th>
                                                <th style="padding: 10px 15px; text-align: right; font-size: 11px; color: #8b949e;">CALLS</th>
                                                <th style="padding: 10px 15px; text-align: right; font-size: 11px; color: #8b949e;">TOKENS</th>
                                                <th style="padding: 10px 15px; text-align: right; font-size: 11px; color: #8b949e;">COST</th>
                                                <th style="padding: 10px 15px; text-align: right; font-size: 11px; color: #8b949e;">BILLABLE</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${rows.map(row => `
                                                <tr style="border-bottom: 1px solid #21262d;">
                                                    <td style="padding: 10px 15px;">
                                                        <span style="display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; ${getServiceStyle(row.service)}">${row.service || '-'}</span>
                                                    </td>
                                                    <td style="padding: 10px 15px; font-size: 12px; color: #8b949e;">${row.model || row.usage_type || '-'}</td>
                                                    <td style="padding: 10px 15px; text-align: right; font-size: 13px; color: #e6edf3;">${row.calls}</td>
                                                    <td style="padding: 10px 15px; text-align: right; font-size: 13px; color: #e6edf3;">${row.total_tokens ? parseInt(row.total_tokens).toLocaleString() : (row.segments || '-')}</td>
                                                    <td style="padding: 10px 15px; text-align: right; font-size: 13px; color: #10b981;">$${parseFloat(row.cost_actual || 0).toFixed(4)}</td>
                                                    <td style="padding: 10px 15px; text-align: right; font-size: 13px; color: #f59e0b; font-weight: 500;">$${parseFloat(row.cost_billable || 0).toFixed(4)}</td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            </div>`;
                        }).join('')
                    }
                </div>
            </div>
        `;

        window._usageBreakdown = breakdown;

    } catch (error) {
        console.error('Usage load error:', error);
        container.innerHTML = '<div style="color: #ef4444; text-align: center; padding: 40px;">Failed to load usage data</div>';
    }
}

function getDateRange(range) {
    const now = new Date();
    let startDate;
    let endDate;
    let prevStart;
    let prevEnd;

    switch(range) {
        case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            endDate = now.toISOString();
            prevStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
            prevEnd = startDate;
            break;
        case 'last-7':
            startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            endDate = now.toISOString();
            prevStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
            prevEnd = startDate;
            break;
        case 'last-30':
            startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            endDate = now.toISOString();
            prevStart = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
            prevEnd = startDate;
            break;
        case 'last-month':
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
            endDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString();
            prevEnd = startDate;
            break;
        case 'this-month':
        default:
            startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            endDate = now.toISOString();
            prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
            prevEnd = startDate;
            break;
    }

    return { startDate, endDate, prevStart, prevEnd };
}

function setUsageDateRange(range) {
    document.getElementById('usageDateRange').value = range;
    loadUsageData();
}

function renderStatCard(label, value, prevValue, color, isCurrency = false, formatNumber = false) {
    const displayValue = isCurrency ? `$${(value || 0).toFixed(2)}` : (formatNumber ? (value || 0).toLocaleString() : value);
    const change = prevValue > 0 ? ((value - prevValue) / prevValue * 100).toFixed(0) : 0;
    const changeClass = change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral';
    const changeIcon = change > 0 ? '↑' : change < 0 ? '↓' : '→';

    return `
        <div class="usage-card">
            <div style="font-size: 28px; font-weight: 600; color: ${color};">${displayValue}</div>
            <div style="font-size: 12px; color: #8b949e; margin-top: 5px;">${label}</div>
            ${prevValue !== undefined ? `<div class="usage-change ${changeClass}">${changeIcon} ${Math.abs(change)}% vs prev period</div>` : ''}
        </div>
    `;
}

function renderSpendChart(trends) {
    if (!trends.length) return '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #8b949e;">No data</div>';

    const maxBillable = Math.max(...trends.map(t => parseFloat(t.billable) || 0));
    const chartHeight = 180;

    return `
        <svg width="100%" height="${chartHeight}" style="overflow: visible;">
            ${[0, 0.25, 0.5, 0.75, 1].map(pct => `
                <line x1="0" y1="${chartHeight * (1 - pct)}" x2="100%" y2="${chartHeight * (1 - pct)}" stroke="#30363d" stroke-dasharray="4"/>
                <text x="0" y="${chartHeight * (1 - pct) - 5}" fill="#8b949e" font-size="10">$${(maxBillable * pct).toFixed(2)}</text>
            `).join('')}

            ${trends.map((t, i) => {
                const barHeight = maxBillable > 0 ? (parseFloat(t.billable) / maxBillable) * chartHeight : 0;
                const barWidth = 100 / trends.length;
                const x = i * barWidth;
                return `
                    <g>
                        <rect x="${x + 1}%" y="${chartHeight - barHeight}" width="${barWidth - 2}%" height="${barHeight}" fill="#f59e0b" rx="2" opacity="0.8">
                            <title>${new Date(t.date).toLocaleDateString()}: $${parseFloat(t.billable).toFixed(2)}</title>
                        </rect>
                    </g>
                `;
            }).join('')}
        </svg>
        <div style="display: flex; justify-content: space-between; margin-top: 5px; font-size: 10px; color: #8b949e;">
            <span>${trends.length > 0 ? new Date(trends[0].date).toLocaleDateString() : ''}</span>
            <span>${trends.length > 0 ? new Date(trends[trends.length - 1].date).toLocaleDateString() : ''}</span>
        </div>
    `;
}

function renderServiceBreakdown(services) {
    if (!services.length) return '<div style="padding: 20px; text-align: center; color: #8b949e;">No data</div>';

    const total = services.reduce((sum, s) => sum + parseFloat(s.billable || 0), 0);
    const colors = {
        'openai': '#10a37f',
        'google': '#4285f4',
        'anthropic': '#cc9366',
        'twilio': '#f14e4e',
        'tracers': '#8b5cf6'
    };

    return `
        <div style="display: flex; flex-direction: column; gap: 10px;">
            ${services.map(s => {
                const pct = total > 0 ? (parseFloat(s.billable) / total * 100) : 0;
                const color = colors[s.service] || '#8b949e';
                return `
                    <div>
                        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                            <span style="color: ${color}; font-weight: 500;">${s.service || 'Other'}</span>
                            <span style="color: #e6edf3;">$${parseFloat(s.billable).toFixed(2)}</span>
                        </div>
                        <div style="background: #30363d; border-radius: 4px; height: 8px; overflow: hidden;">
                            <div style="background: ${color}; height: 100%; width: ${pct}%; transition: width 0.3s;"></div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function exportUsageCSV() {
    const data = window._usageBreakdown;
    if (!data || !data.length) {
        alert('No data to export');
        return;
    }

    const headers = ['User', 'Service', 'Model/Type', 'Calls', 'Tokens', 'Cost', 'Billable'];
    const rows = data.map(r => [
        r.user_name || 'System',
        r.service || '',
        r.model || r.usage_type || '',
        r.calls,
        r.total_tokens || r.segments || '',
        parseFloat(r.cost_actual || 0).toFixed(4),
        parseFloat(r.cost_billable || 0).toFixed(4)
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `usage-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

window.setUsageDateRange = setUsageDateRange;
window.exportUsageCSV = exportUsageCSV;

function getServiceStyle(service) {
    const styles = {
        'openai': 'background: rgba(16, 163, 127, 0.2); color: #10a37f;',
        'google': 'background: rgba(66, 133, 244, 0.2); color: #4285f4;',
        'anthropic': 'background: rgba(204, 147, 102, 0.2); color: #cc9366;',
        'twilio': 'background: rgba(241, 78, 78, 0.2); color: #f14e4e;',
        'tracers': 'background: rgba(139, 92, 246, 0.2); color: #8b5cf6;'
    };
    return styles[service] || 'background: rgba(139, 148, 158, 0.2); color: #8b949e;';
}

// Central Event Listener
document.addEventListener('click', (e) => {
    // Find the closest element with a data-action attribute
    const actionEl = e.target.closest('[data-action]');

    if (actionEl) {
        const actionName = actionEl.dataset.action;
        const handler = globalActions[actionName];

        if (handler) {
            e.preventDefault();
            e.stopPropagation();
            handler();
        } else {
            console.warn(`No handler found for action: ${actionName}`);
        }
    }
});

// Close settings modal when clicking backdrop
document.addEventListener('click', (e) => {
    if (e.target.id === 'settingsModal') {
        e.target.classList.add('hidden');
    }
});

console.log('✅ UI Action Map initialized');
