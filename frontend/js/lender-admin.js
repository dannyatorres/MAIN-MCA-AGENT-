// js/lender-admin.js
// HANDLES: Global Lender Management (CRUD Operations)

class LenderAdmin {
    constructor(parent) {
        this.parent = parent; // Access to commandCenter (apiCall, utils)
    }

    // --- Entry Point ---
    openManagementModal() {
        console.log('🏛️ Opening Lender Management Dashboard...');

        // 1. Create Modal Container if missing
        let modal = document.getElementById('lenderManagementModal');
        if (!modal) {
            const modalHTML = `
                <div id="lenderManagementModal" class="modal" style="display:none; z-index: 2000;">
                    <div class="modal-content" style="max-width: 1100px; height: 85vh; display: flex; flex-direction: column;">
                        <div class="modal-header">
                            <h3>🏛️ Manage Lender Network</h3>
                            <button class="modal-close" onclick="document.getElementById('lenderManagementModal').style.display='none'">×</button>
                        </div>
                        <div class="modal-body" id="lenderManagementContent" style="padding: 0; flex: 1; overflow: hidden;"></div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            modal = document.getElementById('lenderManagementModal');
        }

        // 2. Inject Template
        const contentArea = document.getElementById('lenderManagementContent');
        if (contentArea) {
            contentArea.innerHTML = this.createManagementTemplate();
        }

        // 3. Show & Load
        modal.style.display = 'flex';
        this.loadLendersList();
    }

    createManagementTemplate() {
        return `
            <div class="lender-management-system" style="height: 100%; display: flex; flex-direction: column;">
                <div class="lender-mgmt-content" style="flex: 1; overflow: hidden; display: flex; flex-direction: column;">
                    <div class="mgmt-actions" style="padding: 0 0 16px 0; display: flex; gap: 10px; align-items: center;">
                        <button onclick="window.commandCenter.lenderAdmin.showAddModal()" class="btn btn-primary">
                            <span>➕</span> Add New Lender
                        </button>
                        <button onclick="window.commandCenter.lenderAdmin.loadLendersList()" class="btn btn-secondary">
                            <span>🔄</span> Refresh
                        </button>
                    </div>

                    <div id="lendersTableContainer" style="flex: 1; overflow-y: auto; padding-bottom: 50px;">
                        <div class="loading-state">Loading lenders...</div>
                    </div>
                </div>
            </div>
        `;
    }

    // --- CRUD Operations ---

    async loadLendersList() {
        try {
            const container = document.getElementById('lendersTableContainer');
            if (container) container.innerHTML = '<div class="loading-state">Loading...</div>';

            const lenders = await this.parent.apiCall(`/api/lenders`);
            this.displayLendersList(lenders);
        } catch (error) {
            console.error('Error loading lenders:', error);
            const container = document.getElementById('lendersTableContainer');
            if (container) container.innerHTML = '<div class="error-state">Failed to load lenders</div>';
        }
    }

    displayLendersList(lenders) {
        const container = document.getElementById('lendersTableContainer');
        if (!lenders || lenders.length === 0) {
            container.innerHTML = `
                <div class="empty-state-card">
                    <h4>No Lenders Found</h4>
                    <p>Start by adding your first lender.</p>
                </div>`;
            return;
        }

        const sorted = [...lenders].sort((a, b) => a.name.localeCompare(b.name));

        container.innerHTML = `
            <div class="lender-list-container">
                <div class="lender-list-header">
                    <div>🏦 Lender Name</div>
                    <div style="text-align: right;">Actions</div>
                </div>
                <div>
                    ${sorted.map(lender => `
                        <div class="lender-list-row">
                            <div class="lender-name-wrapper">
                                <div class="lender-avatar">${lender.name.charAt(0).toUpperCase()}</div>
                                <div style="display:flex; flex-direction:column;">
                                    <span style="font-weight:600;">${lender.name}</span>
                                    <span style="font-size:11px; color:#64748b;">${lender.email || 'No Email'}</span>
                                </div>
                            </div>
                            <div class="lender-actions">
                                <button onclick="window.commandCenter.lenderAdmin.editLender('${lender.id}')" title="Edit">✏️</button>
                                <button onclick="window.commandCenter.lenderAdmin.deleteLender('${lender.id}', '${lender.name}')" title="Delete" class="delete">🗑️</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // --- ADD / EDIT / DELETE ---

    showAddModal() {
        const modalHtml = `
            <div id="addLenderModal" class="modal" style="display: flex;">
                <div class="modal-content">
                    <div class="modal-header"><h3>Add New Lender</h3><button class="modal-close" onclick="this.closest('.modal').remove()">×</button></div>
                    <div class="modal-body">
                        <div class="form-group"><label>Name *</label><input type="text" id="newLenderName" class="form-input"></div>
                        <div class="form-group"><label>Email *</label><input type="email" id="newLenderEmail" class="form-input"></div>
                        <div class="form-group"><label>Min Amount</label><input type="number" id="newLenderMin" class="form-input"></div>
                        <div class="form-group"><label>Max Amount</label><input type="number" id="newLenderMax" class="form-input"></div>
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
        const min = document.getElementById('newLenderMin').value;
        const max = document.getElementById('newLenderMax').value;

        if (!name || !email) return alert('Name and Email required');

        const result = await this.parent.apiCall('/api/lenders', {
            method: 'POST',
            body: JSON.stringify({ name, email, min_amount: min, max_amount: max })
        });

        if (result.success) {
            document.getElementById('addLenderModal').remove();
            this.loadLendersList();
        }
    }

    async deleteLender(id, name) {
        if (!confirm(`Delete ${name}?`)) return;
        await this.parent.apiCall(`/api/lenders/${id}`, { method: 'DELETE' });
        this.loadLendersList();
    }

    async editLender(id) {
        // Fetch details then show edit modal
        const res = await this.parent.apiCall(`/api/lenders/${id}`);
        if (res.success) this.showEditModal(res.lender);
    }

    showEditModal(lender) {
        const modalHtml = `
            <div id="editLenderModal" class="modal" style="display: flex;">
                <div class="modal-content">
                    <div class="modal-header"><h3>Edit Lender</h3><button class="modal-close" onclick="this.closest('.modal').remove()">×</button></div>
                    <div class="modal-body">
                        <input type="hidden" id="editLenderId" value="${lender.id}">
                        <div class="form-group"><label>Name *</label><input type="text" id="editLenderName" class="form-input" value="${lender.name}"></div>
                        <div class="form-group"><label>Email *</label><input type="email" id="editLenderEmail" class="form-input" value="${lender.email || ''}"></div>
                        <div class="form-group"><label>Min Amount</label><input type="number" id="editLenderMin" class="form-input" value="${lender.min_amount || ''}"></div>
                        <div class="form-group"><label>Max Amount</label><input type="number" id="editLenderMax" class="form-input" value="${lender.max_amount || ''}"></div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                        <button class="btn btn-primary" onclick="window.commandCenter.lenderAdmin.updateLender()">Update</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async updateLender() {
        const id = document.getElementById('editLenderId').value;
        const name = document.getElementById('editLenderName').value;
        const email = document.getElementById('editLenderEmail').value;
        const min = document.getElementById('editLenderMin').value;
        const max = document.getElementById('editLenderMax').value;

        if (!name || !email) return alert('Name and Email required');

        const result = await this.parent.apiCall(`/api/lenders/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ name, email, min_amount: min, max_amount: max })
        });

        if (result.success) {
            document.getElementById('editLenderModal').remove();
            this.loadLendersList();
        }
    }
}
