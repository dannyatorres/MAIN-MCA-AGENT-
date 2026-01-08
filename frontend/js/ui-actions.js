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
    'logout': async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
            localStorage.removeItem('currentUser');
            window.location.href = '/';
        } catch (err) {
            console.error('Logout failed:', err);
            window.location.href = '/';
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
