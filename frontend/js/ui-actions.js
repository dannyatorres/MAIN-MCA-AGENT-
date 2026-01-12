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
    'settings-tab-menu': () => {
        document.querySelectorAll('.settings-tab').forEach(t => {
            t.classList.remove('active');
            t.style.color = '#8b949e';
            t.style.borderBottomColor = 'transparent';
        });
        document.querySelector('[data-settings-tab="menu"]').classList.add('active');
        document.querySelector('[data-settings-tab="menu"]').style.color = '#e6edf3';
        document.querySelector('[data-settings-tab="menu"]').style.borderBottomColor = '#3b82f6';
        document.getElementById('settingsMenuTab').style.display = 'block';
        document.getElementById('settingsUsageTab').style.display = 'none';
    },
    'settings-tab-usage': () => {
        document.querySelectorAll('.settings-tab').forEach(t => {
            t.classList.remove('active');
            t.style.color = '#8b949e';
            t.style.borderBottomColor = 'transparent';
        });
        document.querySelector('[data-settings-tab="usage"]').classList.add('active');
        document.querySelector('[data-settings-tab="usage"]').style.color = '#e6edf3';
        document.querySelector('[data-settings-tab="usage"]').style.borderBottomColor = '#3b82f6';
        document.getElementById('settingsMenuTab').style.display = 'none';
        document.getElementById('settingsUsageTab').style.display = 'block';
        loadUsageData();
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

        const { summary, totals } = res;

        container.innerHTML = `
            <div style="margin-bottom: 20px;">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 15px;">
                    <div style="background: #161b22; padding: 12px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 20px; font-weight: 600; color: #3b82f6;">${totals.totalCalls}</div>
                        <div style="font-size: 11px; color: #8b949e;">Total Calls</div>
                    </div>
                    <div style="background: #161b22; padding: 12px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 20px; font-weight: 600; color: #10b981;">$${totals.totalCostActual.toFixed(2)}</div>
                        <div style="font-size: 11px; color: #8b949e;">Your Cost</div>
                    </div>
                    <div style="background: #161b22; padding: 12px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 20px; font-weight: 600; color: #f59e0b;">$${totals.totalCostBillable.toFixed(2)}</div>
                        <div style="font-size: 11px; color: #8b949e;">Billable</div>
                    </div>
                </div>
            </div>

            <div style="font-size: 12px; font-weight: 500; color: #e6edf3; margin-bottom: 10px;">Usage by User</div>
            <div style="max-height: 250px; overflow-y: auto;">
                ${summary.length === 0 ? '<div style="color: #8b949e; text-align: center; padding: 20px;">No usage data yet</div>' :
                summary.map(u => `
                    <div style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #30363d;">
                        <div>
                            <div style="font-weight: 500; color: #e6edf3;">${u.user_name || 'Unknown'}</div>
                            <div style="font-size: 11px; color: #8b949e;">${u.email}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-weight: 500; color: #f59e0b;">$${parseFloat(u.total_cost_billable || 0).toFixed(2)}</div>
                            <div style="font-size: 11px; color: #8b949e;">${u.total_calls} calls</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        container.innerHTML = '<div style="color: #ef4444; text-align: center; padding: 20px;">Failed to load usage data</div>';
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

// Settings tab switching
document.addEventListener('click', (e) => {
    const tab = e.target.closest('.settings-tab');
    if (tab) {
        const tabName = tab.dataset.settingsTab;
        if (tabName === 'menu') globalActions['settings-tab-menu']();
        if (tabName === 'usage') globalActions['settings-tab-usage']();
    }
});

console.log('✅ UI Action Map initialized');
