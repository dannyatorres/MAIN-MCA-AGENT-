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
        const res = await window.commandCenter.apiCall('/api/usage/summary');

        if (!res.success) throw new Error('Failed to load');

        const { summary, totals, startDate, endDate } = res;

        const start = new Date(startDate).toLocaleDateString();
        const end = new Date(endDate).toLocaleDateString();

        container.innerHTML = `
            <div style="margin-bottom: 25px;">
                <div style="font-size: 12px; color: #8b949e; margin-bottom: 15px;">
                    Period: ${start} - ${end}
                </div>

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

            <div style="background: #161b22; border-radius: 10px; border: 1px solid #30363d; overflow: hidden;">
                <div style="padding: 15px 20px; border-bottom: 1px solid #30363d; font-weight: 500; color: #e6edf3;">
                    Usage by User
                </div>
                <div style="max-height: 300px; overflow-y: auto;">
                    ${summary.length === 0 ?
                        '<div style="padding: 40px; text-align: center; color: #8b949e;">No usage data yet</div>' :
                        `<table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: #0d1117;">
                                    <th style="padding: 12px 20px; text-align: left; font-size: 11px; color: #8b949e; font-weight: 500;">USER</th>
                                    <th style="padding: 12px 20px; text-align: right; font-size: 11px; color: #8b949e; font-weight: 500;">CALLS</th>
                                    <th style="padding: 12px 20px; text-align: right; font-size: 11px; color: #8b949e; font-weight: 500;">TOKENS</th>
                                    <th style="padding: 12px 20px; text-align: right; font-size: 11px; color: #8b949e; font-weight: 500;">SMS</th>
                                    <th style="padding: 12px 20px; text-align: right; font-size: 11px; color: #8b949e; font-weight: 500;">YOUR COST</th>
                                    <th style="padding: 12px 20px; text-align: right; font-size: 11px; color: #8b949e; font-weight: 500;">BILLABLE</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${summary.map(u => `
                                    <tr style="border-bottom: 1px solid #30363d;">
                                        <td style="padding: 12px 20px;">
                                            <div style="font-weight: 500; color: #e6edf3;">${u.user_name || 'Unknown'}</div>
                                            <div style="font-size: 11px; color: #8b949e;">${u.email || ''}</div>
                                        </td>
                                        <td style="padding: 12px 20px; text-align: right; color: #e6edf3;">${u.total_calls || 0}</td>
                                        <td style="padding: 12px 20px; text-align: right; color: #e6edf3;">${(parseInt(u.total_tokens) || 0).toLocaleString()}</td>
                                        <td style="padding: 12px 20px; text-align: right; color: #e6edf3;">${u.total_sms_segments || 0}</td>
                                        <td style="padding: 12px 20px; text-align: right; color: #10b981;">$${parseFloat(u.total_cost_actual || 0).toFixed(2)}</td>
                                        <td style="padding: 12px 20px; text-align: right; color: #f59e0b; font-weight: 500;">$${parseFloat(u.total_cost_billable || 0).toFixed(2)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>`
                    }
                </div>
            </div>
        `;
    } catch (error) {
        container.innerHTML = '<div style="color: #ef4444; text-align: center; padding: 40px;">Failed to load usage data</div>';
    }
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
