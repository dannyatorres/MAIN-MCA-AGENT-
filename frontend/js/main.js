// js/main.js
import { LookupManager } from './lookups.js';
import { FormManager } from './forms.js';
import { LeadManager } from './leads.js';

// State Tracking
let currentEditingLeadId = null;

/**
 * INITIALIZATION
 * Runs when the DOM is ready
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 CRM Main Module Loaded');

    // 1. Initialize Dropdowns
    await LookupManager.init();

    // 2. Expose Global Functions (for HTML onclick compatibility)
    exposeGlobals();

    // 3. Attach Event Listeners
    setupEventListeners();

    // 4. Load News (Simple version)
    loadMarketNews();
});

/**
 * EVENT LISTENERS
 * Connects HTML buttons to JavaScript logic
 */
function setupEventListeners() {

    // --- ADD LEAD MODAL ---

    const confirmAddBtn = document.getElementById('confirmAddLead');
    if (confirmAddBtn) {
        confirmAddBtn.addEventListener('click', handleCreateLead);
    }

    // --- EDIT LEAD MODAL ---

    const saveEditBtn = document.getElementById('saveEditLead');
    if (saveEditBtn) {
        saveEditBtn.addEventListener('click', handleUpdateLead);
    }

    const editLeadBtn = document.getElementById('editLeadBtn');
    if (editLeadBtn) {
        editLeadBtn.addEventListener('click', openEditModalForSelected);
    }

    // --- LEAD ACTIONS (Archive/Clone/Delete) ---

    document.getElementById('archiveLeadBtn')?.addEventListener('click', handleArchive);
    document.getElementById('cloneLeadBtn')?.addEventListener('click', handleClone);
    document.getElementById('deleteLeadBtn')?.addEventListener('click', handleDelete);

    // Confirmations
    document.getElementById('confirmArchive')?.addEventListener('click', confirmArchive);
    document.getElementById('confirmDelete')?.addEventListener('click', confirmDelete);
}

/**
 * HANDLERS
 */

// 1. Create New Lead
async function handleCreateLead() {
    try {
        // Scrape data
        const data = FormManager.getNewLeadData();

        // Validate
        const errors = FormManager.validateNewLead(data);
        if (errors.length > 0) {
            alert('Please fix the following errors:\n' + errors.join('\n'));
            return;
        }

        // Send to API
        const btn = document.getElementById('confirmAddLead');
        const originalText = btn.textContent;
        btn.textContent = 'Creating...';
        btn.disabled = true;

        await LeadManager.create(data);

        // Success
        alert('✅ Lead created successfully!');
        document.getElementById('addLeadModal').style.display = 'none';
        FormManager.clearNewLeadForm();
        refreshUI();

    } catch (error) {
        console.error('Create failed:', error);
        alert('❌ Error: ' + error.message);
    } finally {
        const btn = document.getElementById('confirmAddLead');
        if (btn) {
            btn.textContent = 'Confirm Add Lead';
            btn.disabled = false;
        }
    }
}

// 2. Open Edit Modal
async function openEditModalForSelected() {
    // Try to get the ID from the ConversationUI (global object from other scripts)
    const selectedId = window.commandCenter?.conversationUI?.currentConversationId;

    if (!selectedId) {
        alert('Please select a lead to edit first.');
        return;
    }

    try {
        const modal = document.getElementById('editLeadModal');

        // Load Data
        const leadData = await LeadManager.getById(selectedId);

        // Populate Form
        currentEditingLeadId = selectedId;
        FormManager.populateEditForm(leadData);

        // Show Modal
        modal.style.display = 'flex';

    } catch (error) {
        alert('Failed to load lead details: ' + error.message);
    }
}

// 3. Update Lead
async function handleUpdateLead() {
    if (!currentEditingLeadId) return;

    try {
        const data = FormManager.getEditLeadData();

        const btn = document.getElementById('saveEditLead');
        btn.textContent = 'Saving...';

        await LeadManager.update(currentEditingLeadId, data);

        alert('✅ Lead updated successfully!');
        document.getElementById('editLeadModal').style.display = 'none';
        refreshUI();

    } catch (error) {
        alert('Error updating lead: ' + error.message);
    } finally {
        const btn = document.getElementById('saveEditLead');
        if(btn) btn.textContent = 'Save Changes';
    }
}

// 4. Actions (Archive/Clone/Delete)
// Note: These rely on confirmation modals usually
function handleArchive() {
    document.getElementById('archiveConfirmModal').style.display = 'flex';
}

function handleDelete() {
    document.getElementById('deleteConfirmModal').style.display = 'flex';
}

async function handleClone() {
    const selectedId = window.commandCenter?.conversationUI?.currentConversationId;
    if (!selectedId) return alert('Select a lead first');

    if(confirm('Are you sure you want to clone this lead?')) {
        try {
            await LeadManager.clone(selectedId);
            alert('Lead cloned!');
            refreshUI();
        } catch(e) { alert(e.message); }
    }
}

async function confirmArchive() {
    const selectedId = window.commandCenter?.conversationUI?.currentConversationId;
    if (!selectedId) return;

    try {
        await LeadManager.archive(selectedId);
        document.getElementById('archiveConfirmModal').style.display = 'none';
        refreshUI();
    } catch(e) { alert(e.message); }
}

async function confirmDelete() {
    const selectedId = window.commandCenter?.conversationUI?.currentConversationId;
    if (!selectedId) return;

    try {
        await LeadManager.delete(selectedId);
        document.getElementById('deleteConfirmModal').style.display = 'none';
        refreshUI();
    } catch(e) { alert(e.message); }
}

/**
 * HELPERS & GLOBALS
 */

// Refresh the conversation list if the main app is running
function refreshUI() {
    if (window.commandCenter?.conversationUI) {
        window.commandCenter.conversationUI.loadConversations();
    } else {
        location.reload();
    }
}

// Expose functions to window so HTML onclick="..." works
function exposeGlobals() {

    // Toggle Section (Accordions)
    window.toggleSection = (sectionId) => {
        const content = document.getElementById(sectionId);
        const toggle = content.previousElementSibling.querySelector('.section-toggle');
        if (content.classList.contains('collapsed')) {
            content.classList.remove('collapsed');
            if(toggle) { toggle.textContent = '−'; toggle.classList.remove('collapsed'); }
        } else {
            content.classList.add('collapsed');
            if(toggle) { toggle.textContent = '+'; toggle.classList.add('collapsed'); }
        }
    };

    // Toggle Partner Section
    window.toggleOwner2Section = () => {
        const checkbox = document.getElementById('addSecondOwner');
        const section = document.getElementById('owner2Info');
        if(checkbox && section) {
            section.style.display = checkbox.checked ? 'block' : 'none';
        }
    };

    // Manual Modal Openers (if buttons use onclick)
    window.openAddLeadModal = () => {
        document.getElementById('addLeadModal').style.display = 'flex';
        FormManager.clearNewLeadForm();
    };

    window.closeAddLeadModal = () => {
        document.getElementById('addLeadModal').style.display = 'none';
    };

    window.closeEditLeadModal = () => {
        document.getElementById('editLeadModal').style.display = 'none';
    };
}

/**
 * MARKET NEWS (Simplified)
 */
async function loadMarketNews() {
    const container = document.getElementById('newsFeedContainer');
    if (!container) return;

    try {
        // Using our new fetch logic, but tailored for external/news
        // Assuming an endpoint exists, or using mock data if that fails
        const response = await fetch('/api/news');
        const data = await response.json();

        if (data.success && data.data) {
            renderNews(container, data.data);
        }
    } catch (e) {
        console.log('Using mock news data');
        renderNews(container, [
            { title: "Market Update: Rates Hold Steady", source: "Bloomberg", date: "2h ago" },
            { title: "Small Business Lending Index Up", source: "SBA", date: "4h ago" }
        ]);
    }
}

function renderNews(container, items) {
    container.innerHTML = items.map(item => `
        <div class="news-card">
            <div class="news-content">
                <div class="news-meta"><span>${item.source}</span> • <span>${item.date}</span></div>
                <h4 class="news-title">${item.title}</h4>
            </div>
        </div>
    `).join('');
}
