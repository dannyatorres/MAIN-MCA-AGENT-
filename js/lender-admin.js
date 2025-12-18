// js/lender-admin.js
// HANDLES: Global Lender Management (CRUD Operations)

class LenderAdmin {
    constructor() {
        // Dynamic parent connection
    }

    get system() {
        if (window.commandCenter && window.commandCenter.isInitialized && window.commandCenter.apiCall) {
            return window.commandCenter;
        }
        throw new Error("System not ready");
    }

    // --- MAIN MODAL ---
    openManagementModal() {
        console.log('🏛️ Opening Lender Management Dashboard...');

        // 1. Clean up old modals
        const existing = document.getElementById('lenderManagementModal');
        if (existing) existing.remove();

        // 2. Build Modal Structure (Using "manage-lender-modal" classes)
        const modalHTML = `
            <div id="lenderManagementModal" class="modal" style="display:none; z-index: 2000;">
                <div class="modal-content lender-submission-modal" style="padding: 0; overflow: hidden;">

                    <div class="modal-header">
                        <h3>Manage Lender Network</h3>
                        <button class="modal-close" onclick="document.getElementById('lenderManagementModal').remove()">×</button>
                    </div>

                    <div class="manage-lender-modal">
                        <div id="lenderManagementContent" class="manage-lender-body"></div>
                    </div>

                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const modal = document.getElementById('lenderManagementModal');
        const contentArea = document.getElementById('lenderManagementContent');

        if (contentArea) contentArea.innerHTML = this.createManagementTemplate();

        modal.style.display = 'flex';
        this.loadLendersList();
    }

    createManagementTemplate() {
        // Uses .manage-lender-header and .ml-btn from CSS
        return `
            <div class="manage-lender-header">
                <div class="manage-lender-title">Network Directory</div>
                <div style="display: flex; gap: 10px;">
                    <button onclick="window.commandCenter.lenderAdmin.showAddModal()" class="ml-btn">
                        <i class="fas fa-plus"></i> ADD NEW
                    </button>
                    <button onclick="window.commandCenter.lenderAdmin.loadLendersList()" class="ml-btn">
                        <i class="fas fa-sync"></i> REFRESH
                    </button>
                </div>
            </div>

            <div id="adminLendersTableContainer" class="manage-lender-body">
                <div class="loading-state" style="padding: 40px; text-align: center; color: #8b949e;">
                    <div class="loading-spinner"></div> Loading Network...
                </div>
            </div>
        `;
    }

    // --- CRUD OPERATIONS ---
    async loadLendersList() {
        const container = document.getElementById('adminLendersTableContainer');
        if (container) container.innerHTML = '<div class="loading-state" style="padding:40px; text-align:center;"><div class="loading-spinner"></div> Loading...</div>';

        try {
            const lenders = await this.system.apiCall(`/api/lenders`);
            this.displayLendersList(lenders);
        } catch (error) {
            console.error('Error loading lenders:', error);
            if (container) container.innerHTML = '<p style="text-align:center; padding:20px; color:#ef4444;">Failed to load.</p>';
        }
    }

    displayLendersList(lenders) {
        const container = document.getElementById('adminLendersTableContainer');

        if (!lenders || lenders.length === 0) {
            container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #8b949e; padding-top: 40px;">
                    <i class="fas fa-users-slash" style="font-size: 32px; margin-bottom: 16px; opacity: 0.5;"></i>
                    <h4 style="color: #e6edf3; margin: 0 0 8px 0;">No Lenders Found</h4>
                    <p style="margin: 0;">Start by adding your first lender.</p>
                </div>`;
            return;
        }

        const sorted = [...lenders].sort((a, b) => a.name.localeCompare(b.name));

        // Uses .ml-row and .ml-action from CSS
        container.innerHTML = sorted.map(lender => `
            <div class="ml-row">
                <div style="display: flex; align-items: center;">
                    <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(59, 130, 246, 0.1); color: #3b82f6; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; margin-right: 14px;">
                        ${lender.name.charAt(0).toUpperCase()}
                    </div>
                    <div style="display:flex; flex-direction:column; gap: 2px;">
                        <span style="font-weight:600; font-size: 13px; color: #e6edf3;">${lender.name}</span>
                        <span style="font-size:11px; color:#64748b;">${lender.email || 'No Email'}</span>
                    </div>
                </div>

                <div style="display: flex; gap: 8px;">
                    <button onclick="window.commandCenter.lenderAdmin.editLender('${lender.id}')" class="ml-action edit">
                        <i class="fas fa-pencil-alt"></i> Edit
                    </button>
                    <button onclick="window.commandCenter.lenderAdmin.deleteLender('${lender.id}', '${lender.name}')" class="ml-action delete">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `).join('');
    }

    // --- ADD / EDIT ---
    showAddModal() {
        const modalHtml = `
            <div id="addLenderModal" class="modal" style="display: flex; z-index: 2100;">
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header"><h3>Add New Lender</h3><button class="modal-close" onclick="this.closest('.modal').remove()">×</button></div>
                    <div class="modal-body" style="padding: 20px;">

                        <div class="lender-input-grid" style="grid-template-columns: 1fr; gap: 12px;">
                            <div class="form-group">
                                <label class="field-label">Name *</label>
                                <input type="text" id="newLenderName" class="form-input">
                            </div>
                            <div class="form-group">
                                <label class="field-label">Email *</label>
                                <input type="email" id="newLenderEmail" class="form-input">
                            </div>
                            <div class="form-group">
                                <label class="field-label">CC Emails</label>
                                <input type="text" id="newLenderCC" class="form-input" placeholder="comma separated">
                            </div>
                            <div class="form-grid col-2" style="gap: 12px;">
                                <div class="form-group"><label class="field-label">Min Amount</label><input type="number" id="newLenderMin" class="form-input"></div>
                                <div class="form-group"><label class="field-label">Max Amount</label><input type="number" id="newLenderMax" class="form-input"></div>
                            </div>
                        </div>

                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                        <button class="btn btn-primary" onclick="window.commandCenter.lenderAdmin.saveLender()">Save</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async saveLender() {
        const name = document.getElementById('newLenderName').value;
        const email = document.getElementById('newLenderEmail').value;
        const rawCC = document.getElementById('newLenderCC').value;
        const cc_email = rawCC.split(',').map(e => e.trim()).filter(e => e).join(', ') || null;
        const min = document.getElementById('newLenderMin').value;
        const max = document.getElementById('newLenderMax').value;

        if (!name || !email) return alert('Name and Email required');

        const result = await this.system.apiCall('/api/lenders', {
            method: 'POST',
            body: JSON.stringify({ name, email, cc_email, min_amount: min, max_amount: max })
        });

        if (result.success) {
            document.getElementById('addLenderModal').remove();
            this.loadLendersList();
        }
    }

    async deleteLender(id, name) {
        if (!confirm(`Delete ${name}?`)) return;
        await this.system.apiCall(`/api/lenders/${id}`, { method: 'DELETE' });
        this.loadLendersList();
    }

    async editLender(lenderId) {
        try {
            const result = await this.system.apiCall(`/api/lenders/${lenderId}`);
            if (result.success && result.lender) {
                this.showEditModal(result.lender);
            }
        } catch (error) {
            console.error(error);
        }
    }

    showEditModal(lender) {
        const existing = document.getElementById('editLenderModal');
        if (existing) existing.remove();

        const industriesStr = Array.isArray(lender.industries) ? lender.industries.join(', ') : '';
        const statesStr = Array.isArray(lender.states) ? lender.states.join(', ') : '';

        const modalHtml = `
            <div id="editLenderModal" class="modal" style="display: flex; z-index: 2100;">
                <div class="modal-content" style="max-width: 600px;">
                    <div class="modal-header">
                        <h3>Edit Lender: ${lender.name}</h3>
                        <button class="modal-close" onclick="document.getElementById('editLenderModal').remove()">×</button>
                    </div>
                    <div class="modal-body" style="padding: 20px;">

                        <div class="lender-input-grid" style="grid-template-columns: 1fr 1fr; margin-bottom: 0;">

                            <div class="form-group grid-span-full">
                                <label class="field-label">Lender Name *</label>
                                <input type="text" id="editLenderName" class="form-input" value="${lender.name || ''}">
                            </div>

                            <div class="form-group">
                                <label class="field-label">Email *</label>
                                <input type="email" id="editLenderEmail" class="form-input" value="${lender.email || ''}">
                            </div>

                            <div class="form-group">
                                <label class="field-label">CC Emails</label>
                                <input type="text" id="editLenderCC" class="form-input" value="${lender.cc_email || ''}">
                            </div>

                            <div class="form-group">
                                <label class="field-label">Min Amount ($)</label>
                                <input type="number" id="editLenderMin" class="form-input" value="${lender.min_amount || 0}">
                            </div>

                            <div class="form-group">
                                <label class="field-label">Max Amount ($)</label>
                                <input type="number" id="editLenderMax" class="form-input" value="${lender.max_amount || 0}">
                            </div>

                            <div class="form-group grid-span-full">
                                <label class="field-label">Industries</label>
                                <input type="text" id="editLenderIndustries" class="form-input" value="${industriesStr}" placeholder="Construction, Retail...">
                            </div>

                            <div class="form-group grid-span-full">
                                <label class="field-label">States</label>
                                <input type="text" id="editLenderStates" class="form-input" value="${statesStr}" placeholder="NY, CA, FL...">
                            </div>

                            <div class="form-group grid-span-full">
                                <label class="field-label">Notes</label>
                                <textarea id="editLenderNotes" class="submission-textarea" rows="2" style="min-height: 60px;">${lender.notes || ''}</textarea>
                            </div>

                        </div>

                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="document.getElementById('editLenderModal').remove()">Cancel</button>
                        <button class="btn btn-primary" onclick="window.commandCenter.lenderAdmin.updateLender('${lender.id}')">Update Lender</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async updateLender(lenderId) {
        const name = document.getElementById('editLenderName').value.trim();
        const email = document.getElementById('editLenderEmail').value.trim();

        if (!name || !email) {
            alert('Name and Email are required.');
            return;
        }

        const data = {
            name: name,
            email: email,
            cc_email: document.getElementById('editLenderCC').value.split(',').map(e => e.trim()).filter(e => e).join(', ') || null,
            min_amount: parseFloat(document.getElementById('editLenderMin').value) || 0,
            max_amount: parseFloat(document.getElementById('editLenderMax').value) || 0,
            industries: document.getElementById('editLenderIndustries').value.split(',').map(s => s.trim()).filter(s => s),
            states: document.getElementById('editLenderStates').value.split(',').map(s => s.trim().toUpperCase()).filter(s => s),
            notes: document.getElementById('editLenderNotes').value.trim() || null
        };

        try {
            const result = await this.system.apiCall(`/api/lenders/${lenderId}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });

            if (result.success || result.id) {
                document.getElementById('editLenderModal').remove();
                this.loadLendersList();
            } else {
                throw new Error(result.error || 'Update failed');
            }
        } catch (error) {
            console.error('Update error:', error);
            alert('Failed to update lender');
        }
    }
}

// Global Registration
window.LenderAdmin = LenderAdmin;

window.openLenderManagementModal = function() {
    if (!window.commandCenter) return;
    if (!window.commandCenter.lenderAdmin) window.commandCenter.lenderAdmin = new LenderAdmin();
    window.commandCenter.lenderAdmin.openManagementModal();
};
