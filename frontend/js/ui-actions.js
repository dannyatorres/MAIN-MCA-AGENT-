// js/ui-actions.js - Centralized UI Event Handler

const globalActions = {
    // --- Navigation & Modals ---
    'open-formatter': () => window.open('/lead_reformatter.html', '_blank'),

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

    try {
        const [summaryRes, breakdownRes] = await Promise.all([
            window.commandCenter.apiCall('/api/usage/summary'),
            window.commandCenter.apiCall('/api/usage/breakdown')
        ]);

        if (!summaryRes.success) throw new Error('Failed to load');

        const { summary, totals, startDate, endDate } = summaryRes;
        const breakdown = breakdownRes.breakdown || [];

        const start = new Date(startDate).toLocaleDateString();
        const end = new Date(endDate).toLocaleDateString();

        // Group breakdown by user for expandable rows
        const userBreakdown = {};
        breakdown.forEach(row => {
            const userName = row.user_name || 'System';
            if (!userBreakdown[userName]) userBreakdown[userName] = [];
            userBreakdown[userName].push(row);
        });

        container.innerHTML = `
            <style>
                .chevron.rotated { transform: rotate(90deg); }
            </style>
            <div style="margin-bottom: 25px;">
                <div style="font-size: 12px; color: #8b949e; margin-bottom: 15px;">
                    Period: ${start} - ${end}
                </div>

                <!-- Summary Cards -->
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 25px;">
                    <div style="background: #161b22; padding: 20px; border-radius: 10px; border: 1px solid #30363d;">
                        <div style="font-size: 28px; font-weight: 600; color: #3b82f6;">${totals.totalCalls}</div>
                        <div style="font-size: 12px; color: #8b949e; margin-top: 5px;">Total API Calls</div>
                    </div>
                    <div style="background: #161b22; padding: 20px; border-radius: 10px; border: 1px solid #30363d;">
                        <div style="font-size: 28px; font-weight: 600; color: #8b5cf6;">${(totals.totalTokens || 0).toLocaleString()}</div>
                        <div style="font-size: 12px; color: #8b949e; margin-top: 5px;">LLM Tokens</div>
                    </div>
                    <div style="background: #161b22; padding: 20px; border-radius: 10px; border: 1px solid #30363d;">
                        <div style="font-size: 28px; font-weight: 600; color: #10b981;">$${totals.totalCostActual.toFixed(2)}</div>
                        <div style="font-size: 12px; color: #8b949e; margin-top: 5px;">Your Cost</div>
                    </div>
                    <div style="background: #161b22; padding: 20px; border-radius: 10px; border: 1px solid #30363d;">
                        <div style="font-size: 28px; font-weight: 600; color: #f59e0b;">$${totals.totalCostBillable.toFixed(2)}</div>
                        <div style="font-size: 12px; color: #8b949e; margin-top: 5px;">Billable Amount</div>
                    </div>
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
            </div>

            <!-- Detailed Breakdown Table -->
            <div style="background: #161b22; border-radius: 10px; border: 1px solid #30363d; overflow: hidden;">
                <div style="padding: 15px 20px; border-bottom: 1px solid #30363d; font-weight: 500; color: #e6edf3;">
                    Detailed Breakdown by Service
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
                                <div class="user-usage-header" onclick="this.nextElementSibling.classList.toggle('hidden'); this.querySelector('.chevron').classList.toggle('rotated')"
                                     style="padding: 15px 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: #0d1117;">
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <span class="chevron" style="transition: transform 0.2s;">></span>
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
    } catch (error) {
        console.error('Usage load error:', error);
        container.innerHTML = '<div style="color: #ef4444; text-align: center; padding: 40px;">Failed to load usage data</div>';
    }
}

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
