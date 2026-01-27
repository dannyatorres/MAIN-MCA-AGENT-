// js/lender-network.js
// Network Directory Management - CRUD Operations for Lenders

class LenderNetwork {
    constructor(system) {
        this.system = system;
        this.allLenders = null;
    }

    // ==========================================
    // DIRECTORY MODAL
    // ==========================================

    open() {
        document.getElementById('lenderMenuModal')?.remove();
        document.getElementById('networkDirectoryModal')?.remove();

        const modalHTML = `
            <div id="networkDirectoryModal" class="modal lender-admin-modal">
                <div class="modal-content modal-lg">
                    <div class="modal-header">
                        <h3><i class="fas fa-building icon-blue"></i> Network Directory</h3>
                        <button class="modal-close" onclick="document.getElementById('networkDirectoryModal').remove()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="admin-search">
                            <input type="text" id="lenderSearchInput" class="form-input" placeholder="Search lenders...">
                        </div>
                        <div class="admin-list-header">
                            <span>All Lenders</span>
                            <div class="header-actions">
                                <button class="action-link" data-action="add">+ Add New</button>
                                <button class="action-link" data-action="refresh">Refresh</button>
                            </div>
                        </div>
                        <div id="networkDirectoryContainer" class="admin-list">
                            <div class="admin-loading"><div class="loading-spinner"></div> Loading...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.bindDirectoryEvents();
        this.load();
    }

    bindDirectoryEvents() {
        const modal = document.getElementById('networkDirectoryModal');
        if (!modal) return;

        // Search input
        const searchInput = modal.querySelector('#lenderSearchInput');
        searchInput?.addEventListener('input', (e) => this.filter(e.target.value));

        // Header actions
        modal.querySelector('.admin-list-header')?.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (action === 'add') this.showAddModal();
            if (action === 'refresh') this.load();
        });

        // List actions (delegated)
        modal.querySelector('#networkDirectoryContainer')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;

            const id = btn.dataset.id;
            const name = btn.dataset.name;
            const action = btn.dataset.action;

            if (action === 'edit') this.edit(id);
            if (action === 'delete') this.delete(id, name);
        });
    }

    async load() {
        const container = document.getElementById('networkDirectoryContainer');
        if (!container) return;

        container.innerHTML = '<div class="admin-loading"><div class="loading-spinner"></div> Loading...</div>';

        try {
            const lenders = await this.system.apiCall('/api/lenders');
            this.allLenders = [...lenders].sort((a, b) => a.name.localeCompare(b.name));
            this.render(this.allLenders, container);
        } catch (error) {
            console.error('Error loading lenders:', error);
            container.innerHTML = '<div class="admin-error">Failed to load lenders</div>';
        }
    }

    render(lenders, container) {
        if (!container) container = document.getElementById('networkDirectoryContainer');
        
        if (!lenders || lenders.length === 0) {
            container.innerHTML = '<div class="admin-empty">No lenders found</div>';
            return;
        }

        container.innerHTML = lenders.map(l => `
            <div class="lender-row" data-lender-id="${l.id}">
                <div class="lender-row-info">
                    <div class="lender-avatar">${l.name.charAt(0).toUpperCase()}</div>
                    <div class="lender-details">
                        <span class="lender-name">${this.escapeHtml(l.name)}</span>
                        <span class="lender-meta">${this.escapeHtml(l.email) || 'No email'} • Tier ${l.tier || '?'}</span>
                    </div>
                </div>
                <div class="lender-actions">
                    <button class="action-link" data-action="edit" data-id="${l.id}">Edit</button>
                    <button class="action-link danger" data-action="delete" data-id="${l.id}" data-name="${this.escapeHtml(l.name)}">Delete</button>
                </div>
            </div>
        `).join('');
    }

    filter(query) {
        if (!this.allLenders) return;
        
        const q = query.toLowerCase();
        const filtered = this.allLenders.filter(l =>
            l.name.toLowerCase().includes(q) ||
            (l.email && l.email.toLowerCase().includes(q))
        );
        this.render(filtered);
    }

    // ==========================================
    // ADD LENDER
    // ==========================================

    showAddModal() {
        document.getElementById('addLenderModal')?.remove();

        const modalHTML = `
            <div id="addLenderModal" class="modal lender-admin-modal modal-stacked">
                <div class="modal-content modal-md">
                    <div class="modal-header">
                        <h3>Add New Lender</h3>
                        <button class="modal-close" onclick="document.getElementById('addLenderModal').remove()">×</button>
                    </div>
                    <div class="modal-body padded">
                        <div class="lender-form-grid single-col">
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
                                <input type="text" id="newLenderCC" class="form-input" placeholder="Comma separated">
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label class="field-label">Min Amount</label>
                                    <input type="number" id="newLenderMin" class="form-input">
                                </div>
                                <div class="form-group">
                                    <label class="field-label">Max Amount</label>
                                    <input type="number" id="newLenderMax" class="form-input">
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="document.getElementById('addLenderModal').remove()">Cancel</button>
                        <button id="btnSaveLender" class="btn btn-primary">Save Lender</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        document.getElementById('btnSaveLender')?.addEventListener('click', () => this.save());
    }

    async save() {
        const name = document.getElementById('newLenderName')?.value.trim();
        const email = document.getElementById('newLenderEmail')?.value.trim();
        const rawCC = document.getElementById('newLenderCC')?.value || '';
        const cc_email = rawCC.split(',').map(e => e.trim()).filter(e => e).join(', ') || null;
        const min = document.getElementById('newLenderMin')?.value;
        const max = document.getElementById('newLenderMax')?.value;
        const btn = document.getElementById('btnSaveLender');

        if (!name || !email) {
            this.system.utils.showNotification('Name and Email are required', 'error');
            return;
        }

        const originalText = btn.innerText;
        btn.innerText = 'Saving...';
        btn.disabled = true;

        try {
            const result = await this.system.apiCall('/api/lenders', {
                method: 'POST',
                body: JSON.stringify({ name, email, cc_email, min_amount: min, max_amount: max })
            });

            if (result && result.id) {
                document.getElementById('addLenderModal')?.remove();
                this.system.utils.showNotification(`${name} added`, 'success');
                this.load();
            } else {
                throw new Error('Save failed');
            }
        } catch (error) {
            console.error('Save error:', error);
            this.system.utils.showNotification('Failed to save: ' + error.message, 'error');
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }

    // ==========================================
    // EDIT LENDER
    // ==========================================

    async edit(id) {
        try {
            const result = await this.system.apiCall(`/api/lenders/${id}`);
            if (result && result.lender) {
                this.showEditModal(result.lender);
            } else {
                throw new Error('Lender data not found');
            }
        } catch (error) {
            console.error('Error fetching lender:', error);
            this.system.utils.showNotification('Failed to load lender data', 'error');
        }
    }

    showEditModal(lender) {
        document.getElementById('editLenderModal')?.remove();

        const industriesStr = Array.isArray(lender.industries) ? lender.industries.join(', ') : '';
        const statesStr = Array.isArray(lender.states) ? lender.states.join(', ') : '';

        const modalHTML = `
            <div id="editLenderModal" class="modal lender-admin-modal modal-stacked">
                <div class="modal-content modal-lg">
                    <div class="modal-header">
                        <h3>Edit Lender: ${this.escapeHtml(lender.name)}</h3>
                        <button class="modal-close" onclick="document.getElementById('editLenderModal').remove()">×</button>
                    </div>
                    <div class="modal-body padded">
                        <div class="lender-form-grid">
                            <div class="form-group full-width">
                                <label class="field-label">Lender Name *</label>
                                <input type="text" id="editLenderName" class="form-input" value="${this.escapeHtml(lender.name || '')}">
                            </div>
                            <div class="form-group">
                                <label class="field-label">Email *</label>
                                <input type="email" id="editLenderEmail" class="form-input" value="${this.escapeHtml(lender.email || '')}">
                            </div>
                            <div class="form-group">
                                <label class="field-label">CC Emails</label>
                                <input type="text" id="editLenderCC" class="form-input" value="${this.escapeHtml(lender.cc_email || '')}">
                            </div>
                            <div class="form-group">
                                <label class="field-label">Min Amount ($)</label>
                                <input type="number" id="editLenderMin" class="form-input" value="${lender.min_amount || 0}">
                            </div>
                            <div class="form-group">
                                <label class="field-label">Max Amount ($)</label>
                                <input type="number" id="editLenderMax" class="form-input" value="${lender.max_amount || 0}">
                            </div>
                            <div class="form-group full-width">
                                <label class="field-label">Industries</label>
                                <input type="text" id="editLenderIndustries" class="form-input" value="${this.escapeHtml(industriesStr)}" placeholder="Construction, Retail...">
                            </div>
                            <div class="form-group full-width">
                                <label class="field-label">States</label>
                                <input type="text" id="editLenderStates" class="form-input" value="${this.escapeHtml(statesStr)}" placeholder="NY, CA, FL...">
                            </div>
                            <div class="form-group full-width">
                                <label class="field-label">Notes</label>
                                <textarea id="editLenderNotes" class="form-textarea">${this.escapeHtml(lender.notes || '')}</textarea>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="document.getElementById('editLenderModal').remove()">Cancel</button>
                        <button id="btnUpdateLender" class="btn btn-primary" data-id="${lender.id}">Update Lender</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        document.getElementById('btnUpdateLender')?.addEventListener('click', (e) => {
            this.update(e.target.dataset.id);
        });
    }

    async update(id) {
        const name = document.getElementById('editLenderName')?.value.trim();
        const email = document.getElementById('editLenderEmail')?.value.trim();
        const btn = document.getElementById('btnUpdateLender');

        if (!name || !email) {
            this.system.utils.showNotification('Name and Email are required', 'error');
            return;
        }

        const data = {
            name,
            email,
            cc_email: document.getElementById('editLenderCC')?.value.split(',').map(e => e.trim()).filter(e => e).join(', ') || null,
            min_amount: parseFloat(document.getElementById('editLenderMin')?.value) || 0,
            max_amount: parseFloat(document.getElementById('editLenderMax')?.value) || 0,
            industries: document.getElementById('editLenderIndustries')?.value.split(',').map(s => s.trim()).filter(s => s),
            states: document.getElementById('editLenderStates')?.value.split(',').map(s => s.trim().toUpperCase()).filter(s => s),
            notes: document.getElementById('editLenderNotes')?.value.trim() || null
        };

        const originalText = btn.innerText;
        btn.innerText = 'Updating...';
        btn.disabled = true;

        try {
            const result = await this.system.apiCall(`/api/lenders/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });

            if (result && (result.success || result.id)) {
                document.getElementById('editLenderModal')?.remove();
                this.system.utils.showNotification(`${name} updated`, 'success');
                this.load();
            } else {
                throw new Error(result.error || 'Update failed');
            }
        } catch (error) {
            console.error('Update error:', error);
            this.system.utils.showNotification('Failed to update: ' + error.message, 'error');
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }

    // ==========================================
    // DELETE LENDER
    // ==========================================

    async delete(id, name) {
        if (!confirm(`Delete ${name}?`)) return;

        const row = document.querySelector(`[data-lender-id="${id}"]`);
        const originalLenders = this.allLenders ? [...this.allLenders] : null;

        // Optimistic UI
        if (row) {
            row.classList.add('lender-deleting');
            setTimeout(() => row.classList.add('lender-deleting-collapse'), 150);
        }
        if (this.allLenders) {
            this.allLenders = this.allLenders.filter(l => l.id !== id);
        }

        try {
            await this.system.apiCall(`/api/lenders/${id}`, { method: 'DELETE' });
            setTimeout(() => row?.remove(), 300);
            this.system.utils.showNotification(`${name} deleted`, 'success');
        } catch (error) {
            console.error('Delete error:', error);

            // Restore on failure
            if (originalLenders) this.allLenders = originalLenders;
            if (row) {
                row.classList.remove('lender-deleting', 'lender-deleting-collapse');
                row.classList.add('lender-restore');
            }

            this.system.utils.showNotification('Failed to delete: ' + error.message, 'error');
        }
    }

    // ==========================================
    // UTILITIES
    // ==========================================

    escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

window.LenderNetwork = LenderNetwork;
