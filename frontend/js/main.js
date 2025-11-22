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

    // RE-WIRE THE TRASH CAN (Delete Mode)
    window.toggleDeleteMode = function() {
        const list = document.getElementById('conversationsList');
        const btn = document.getElementById('toggleDeleteModeBtn');

        if (!list) return;

        // Toggle the CSS class that reveals checkboxes
        const isDeleteMode = list.classList.toggle('delete-mode');

        // Optional: Visual feedback on the button
        if (btn) {
            if (isDeleteMode) {
                btn.classList.add('active-danger'); // Make it look active/red
            } else {
                btn.classList.remove('active-danger');
            }
        }

        // Notify ConversationUI if needed (to clear selections when canceling)
        if (!isDeleteMode && window.commandCenter?.conversationUI) {
            // Deselect all if we are cancelling delete mode
            const checkboxes = document.querySelectorAll('.delete-checkbox');
            checkboxes.forEach(cb => cb.checked = false);
        }
    };

    // RE-WIRE THE + BUTTON
    window.openRichCreateModal = function() {
        console.log('🚀 Opening New Lead Form...');
        if (window.commandCenter && window.commandCenter.intelligence) {
            // Call the new module
            window.commandCenter.intelligence.showCreateLeadModal();
        } else {
            console.error('❌ Intelligence module not ready');
        }
    };

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

    // Lender Management Modal
    window.openLenderManagementModal = function() {
        console.log('🏛️ Opening Lender Management...');

        // 1. Check for Lenders Module
        const lendersModule = window.commandCenter?.lenders;
        if (!lendersModule) {
            alert('System loading... please wait.');
            return;
        }

        // 2. Create/Get the Modal
        let modal = document.getElementById('lenderManagementModal');
        if (!modal) {
            const modalHTML = `
                <div id="lenderManagementModal" class="modal" style="display:none;">
                    <div class="modal-content" style="max-width: 1000px; height: 85vh;">
                        <div class="modal-header">
                            <h3>🏛️ Manage Lender Network</h3>
                            <button class="modal-close" onclick="document.getElementById('lenderManagementModal').style.display='none'">×</button>
                        </div>
                        <div class="modal-body" id="lenderManagementContent" style="overflow-y: auto; padding: 20px;">
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            modal = document.getElementById('lenderManagementModal');
        }

        // 3. Inject Content using existing logic
        const content = document.getElementById('lenderManagementContent');

        // We use the method from your existing lenders.js
        if (lendersModule.createLenderManagementTemplate) {
            content.innerHTML = lendersModule.createLenderManagementTemplate();

            // 4. Load the Data
            if (lendersModule.loadLendersList) {
                lendersModule.loadLendersList();
            }

            // 5. Show Modal
            modal.style.display = 'flex';
        } else {
            alert('Lender Management template not found in module.');
        }
    };
}

/**
 * MARKET NEWS (Live via Your Backend)
 * Fetches industry news from your server's /api/news endpoint.
 */
async function loadMarketNews() {
    const container = document.getElementById('newsFeedContainer');
    if (!container) return;

    // 1. Show Loading State (Immediate feedback)
    container.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #64748b;">
            <div class="loading-spinner small" style="margin: 0 auto 10px;"></div>
            <div style="font-size: 12px;">Scanning Industry Wire...</div>
        </div>
    `;

    try {
        // 2. Fetch directly from your server
        const response = await fetch('/api/news');
        const result = await response.json();

        if (result.success && result.data && result.data.length > 0) {

            // 3. Format the data for display
            const newsItems = result.data.map(item => ({
                title: item.title,
                link: item.link,
                source: item.source || 'Industry News',
                // Choose icon based on the 'type' your server assigned
                icon: (item.type === 'debanked' || item.source.toLowerCase().includes('debanked')) ? '⚡' : '📰',
                // Calculate "2h ago" using the pubDate from server
                displayDate: timeAgo(new Date(item.pubDate))
            }));

            renderNews(container, newsItems);

        } else {
            // Fallback if no news found
            container.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:#94a3b8;">No recent updates found.</div>';
        }

    } catch (e) {
        console.error('News Load Error:', e);
        // Use your mock data as a fallback if the server fails
        loadMockNews(container);
    }
}

// Helper: Render the cards
function renderNews(container, items) {
    container.innerHTML = items.map(item => `
        <div class="news-card" onclick="window.open('${item.link}', '_blank')">
            <div class="news-content">
                <div class="news-meta">
                    <span style="font-size: 12px;">${item.icon}</span>
                    <span class="news-source ${item.source.toLowerCase().includes('debanked') ? 'source-highlight' : ''}">${item.source}</span>
                    <span class="news-dot">•</span>
                    <span class="news-time">${item.displayDate}</span>
                </div>
                <h4 class="news-title">${item.title}</h4>
            </div>
            <div class="news-arrow"><i class="fas fa-external-link-alt"></i></div>
        </div>
    `).join('');
}

// Helper: "Time Ago" Formatter
function timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return "Just now";
}

// Helper: Fallback Mocks (Just in case)
function loadMockNews(container) {
    renderNews(container, [
        { title: "MCA Default Rates Stabilize in Q4", source: "deBanked", displayDate: "2h ago", icon: "⚡", link: "#" },
        { title: "New Compliance Rules for NY Lenders", source: "Bloomberg", displayDate: "5h ago", icon: "📰", link: "#" }
    ]);
}
