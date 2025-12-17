// js/lender-admin.js
// HANDLES: Global Lender Management (CRUD Operations)

class LenderAdmin {
    constructor() {
        // WE REMOVED "parent" from here. 
        // We will grab the live system dynamically to prevent stale references.
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
        const container = document.getElementById('lendersTableContainer');
        if (container) container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div> Loading Network...</div>';

        try {
            // ✅ THE FIX: Use "this.system" (dynamic) instead of "this.parent" (stale)
            // We also add a timeout so it can't spin forever
            const apiPromise = this.system.apiCall(`/api/lenders`);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), 5000));

            const lenders = await Promise.race([apiPromise, timeoutPromise]);
            
            this.displayLendersList(lenders);

        } catch (error) {
            console.error('Error loading lenders:', error);
            if (container) {
                container.innerHTML = `
                    <div class="error-state" style="text-align:center; padding:20px;">
                        <p>⚠️ Failed to load lenders.</p>
                        <button class="btn btn-secondary" onclick="window.commandCenter.lenderAdmin.loadLendersList()">Try Again</button>
                    </div>`;
            }
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

        // Sort alphabetically
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

        const result = await this.system.apiCall('/api/lenders', {
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
        await this.system.apiCall(`/api/lenders/${id}`, { method: 'DELETE' });
        this.loadLendersList();
    }
    
    // --- EDITING LENDERS ---

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
            <div id="editLenderModal" class="modal" style="display: flex;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Edit Lender: ${lender.name}</h3>
                        <button class="modal-close" onclick="document.getElementById('editLenderModal').remove()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>Lender Name *</label>
                            <input type="text" id="editLenderName" class="form-input" value="${lender.name || ''}">
                        </div>
                        <div class="form-group">
                            <label>Email Address *</label>
                            <input type="email" id="editLenderEmail" class="form-input" value="${lender.email || ''}">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Phone</label>
                                <input type="text" id="editLenderPhone" class="form-input" value="${lender.phone || ''}">
                            </div>
                            <div class="form-group">
                                <label>Company</label>
                                <input type="text" id="editLenderCompany" class="form-input" value="${lender.company || ''}">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Min Amount ($)</label>
                                <input type="number" id="editLenderMin" class="form-input" value="${lender.min_amount || 0}">
                            </div>
                            <div class="form-group">
                                <label>Max Amount ($)</label>
                                <input type="number" id="editLenderMax" class="form-input" value="${lender.max_amount || 0}">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Industries (comma-separated)</label>
                            <input type="text" id="editLenderIndustries" class="form-input" value="${industriesStr}">
                        </div>
                        <div class="form-group">
                            <label>States (comma-separated)</label>
                            <input type="text" id="editLenderStates" class="form-input" value="${statesStr}">
                        </div>
                        <div class="form-group">
                            <label>Notes</label>
                            <textarea id="editLenderNotes" class="form-textarea" rows="3">${lender.notes || ''}</textarea>
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
            phone: document.getElementById('editLenderPhone').value.trim() || null,
            company: document.getElementById('editLenderCompany').value.trim() || null,
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

// --- GLOBAL EXPORT & OPENER ---
// This guarantees the button works globally and instantiates with a LIVE connection.
window.LenderAdmin = LenderAdmin;

window.openLenderManagementModal = function() {
    console.log("🏦 Opening Lender Admin...");

    // 1. Ensure global admin exists
    if (!window.commandCenter.lenderAdmin) {
        // We do NOT pass window.commandCenter to the constructor anymore
        window.commandCenter.lenderAdmin = new LenderAdmin();
    }

    // 2. Open
    window.commandCenter.lenderAdmin.openManagementModal();
};
