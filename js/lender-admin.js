// js/lender-admin.js
// HANDLES: Global Lender Management (CRUD Operations) - FULL HEIGHT FIX

class LenderAdmin {
    constructor() {
        // Parent connection handled dynamically
    }

    // --- HELPER: Get Live System ---
    get system() {
        if (window.commandCenter && window.commandCenter.isInitialized && window.commandCenter.apiCall) {
            return window.commandCenter;
        }
        console.error("❌ LenderAdmin: Command Center API is missing or not ready.");
        throw new Error("System not ready");
    }

    // --- Entry Point ---
    openManagementModal() {
        console.log('🏛️ Opening Lender Management Dashboard...');

        // 1. NUCLEAR RESET: If the modal exists, destroy it.
        // This forces the browser to redraw it with your new code.
        const existing = document.getElementById('lenderManagementModal');
        if (existing) existing.remove();

        // 2. BUILD NEW MODAL (Note the !important padding override)
        const modalHTML = `
            <div id="lenderManagementModal" class="modal" style="display:none; z-index: 2000;">
                <div class="modal-content lender-submission-modal" style="display: flex; flex-direction: column; overflow: hidden;">
                    <div class="modal-header">
                        <h3>Manage Lender Network</h3>
                        <button class="modal-close" onclick="document.getElementById('lenderManagementModal').remove()">×</button>
                    </div>

                    <div class="modal-body" id="lenderManagementContent"
                         style="padding: 0 !important; flex: 1; display: flex; flex-direction: column; overflow: hidden; background: #0d1117;">
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const modal = document.getElementById('lenderManagementModal');
        const contentArea = document.getElementById('lenderManagementContent');

        if (contentArea) {
            contentArea.innerHTML = this.createManagementTemplate();
        }

        modal.style.display = 'flex';
        this.loadLendersList();
    }

    createManagementTemplate() {
        return `
            <div style="padding: 12px 20px; background: #161b22; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
                <div style="font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">Network Directory</div>
                <div style="display: flex; gap: 15px;">
                    <button onclick="window.commandCenter.lenderAdmin.showAddModal()" class="action-link" style="font-size: 11px; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-plus"></i> ADD NEW LENDER
                    </button>
                    <button onclick="window.commandCenter.lenderAdmin.loadLendersList()" class="action-link" style="font-size: 11px; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-sync"></i> REFRESH
                    </button>
                </div>
            </div>

            <div id="adminLendersTableContainer" style="flex: 1; overflow-y: auto; padding: 0;">
                <div class="loading-state" style="padding: 20px; text-align: center; color: #8b949e;">
                    <div class="loading-spinner"></div> Loading Network...
                </div>
            </div>
        `;
    }

    // --- CRUD Operations ---

    async loadLendersList() {
        const container = document.getElementById('adminLendersTableContainer');
        if (container) container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div> Loading Network...</div>';

        try {
            const apiPromise = this.system.apiCall(`/api/lenders`);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), 5000));
            const lenders = await Promise.race([apiPromise, timeoutPromise]);

            this.displayLendersList(lenders);

        } catch (error) {
            console.error('Error loading lenders:', error);
            if (container) {
                container.innerHTML = `
                    <div class="error-state" style="text-align:center; padding:20px;">
                        <p style="color: #ef4444; font-size: 13px;">⚠️ Failed to load lenders.</p>
                        <button class="btn btn-secondary" onclick="window.commandCenter.lenderAdmin.loadLendersList()">Try Again</button>
                    </div>`;
            }
        }
    }

    displayLendersList(lenders) {
        const container = document.getElementById('adminLendersTableContainer');

        if (!lenders || lenders.length === 0) {
            container.innerHTML = `
                <div class="empty-state-card" style="border: none; background: transparent; height: 100%; justify-content: center;">
                    <div class="empty-state-icon"><i class="fas fa-users-slash"></i></div>
                    <h4>No Lenders Found</h4>
                    <p>Start by adding your first lender to the network.</p>
                </div>`;
            return;
        }

        const sorted = [...lenders].sort((a, b) => a.name.localeCompare(b.name));

        // CLEAN CSS CLASS: .directory-item handles the spacing
        container.innerHTML = sorted.map(lender => `
            <div class="directory-item">
                <div class="lender-name-wrapper" style="display: flex; align-items: center;">
                    <div class="lender-avatar" style="width: 36px; height: 36px; font-size: 14px; margin-right: 16px; border-radius: 10px;">
                        ${lender.name.charAt(0).toUpperCase()}
                    </div>
                    <div style="display:flex; flex-direction:column; gap: 2px;">
                        <span style="font-weight:600; font-size: 14px; color: #e6edf3;">${lender.name}</span>
                        <span style="font-size:12px; color:#64748b;">${lender.email || 'No Email'}</span>
                    </div>
                </div>
                <div class="lender-actions" style="display: flex; gap: 12px;">
                    <button onclick="window.commandCenter.lenderAdmin.editLender('${lender.id}')" class="btn-icon-action" title="Edit">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                    <button onclick="window.commandCenter.lenderAdmin.deleteLender('${lender.id}', '${lender.name}')" class="btn-icon-action delete" title="Delete">
                        <i class="fas fa-trash"></i>
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
            } else {
                throw new Error('Lender data not found');
            }
        } catch (error) {
            console.error('Error fetching lender:', error);
            alert('Failed to load lender data');
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

window.LenderAdmin = LenderAdmin;

window.openLenderManagementModal = function() {
    if (!window.commandCenter) {
        alert("System is still loading core components. Please wait...");
        return;
    }
    if (!window.commandCenter.lenderAdmin) {
        window.commandCenter.lenderAdmin = new LenderAdmin();
    }
    try {
        const sys = window.commandCenter.lenderAdmin.system;
        window.commandCenter.lenderAdmin.openManagementModal();
    } catch (e) {
        console.warn("⚠️ System not ready yet. Retrying in 500ms...");
        setTimeout(() => {
            if (window.commandCenter.isInitialized) {
                window.commandCenter.lenderAdmin.openManagementModal();
            } else {
                alert("System is initializing. Please try again in a moment.");
            }
        }, 500);
    }
};
