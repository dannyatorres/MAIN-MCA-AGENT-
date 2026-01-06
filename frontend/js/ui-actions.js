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

    'open-settings': () => window.openSettingsModal?.(),
    'open-rich-create': () => window.openRichCreateModal?.(),
    'open-csv-import': () => window.openCsvImportModal?.(),

    // --- Dashboard Stats ---
    'show-submitted': () => window.showSubmittedLeads?.(),
    'show-offers': () => window.showOffersModal?.(),
    'edit-goal': () => window.editMonthlyGoal?.(),

    // --- Toolbar Actions ---
    'toggle-delete-mode': () => {
        const btn = document.getElementById('toggleDeleteModeBtn');
        const body = document.body;

        // Check current state
        const isDeleteModeOn = body.classList.contains('delete-mode');

        if (isDeleteModeOn) {
            // 1. Turn OFF
            body.classList.remove('delete-mode');
            if (btn) btn.classList.remove('active');

            // 2. Clear any selections in the core app
            if (window.conversationUI?.core?.clearDeleteSelection) {
                window.conversationUI.core.clearDeleteSelection();
            }
        } else {
            // 1. Turn ON
            body.classList.add('delete-mode');
            if (btn) btn.classList.add('active');
        }
    }
};

window.toggleDeleteMode = globalActions['toggle-delete-mode'];

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

console.log('✅ UI Action Map initialized');
