// frontend/js/controllers/lead-form-controller.js
import { Formatters } from '../utils/formatters.js';

export class LeadFormController {
    constructor(parent) {
        this.parent = parent; // References CommandCenter
    }

    // --- 1. HTML TEMPLATE (Single Source of Truth) ---
    getFormHTML(data = {}, mode = 'create') {
        const isEdit = mode === 'edit';
        const val = (k) => data[k] || '';

        return `
        <div class="edit-form-container">
            <h3 style="margin-bottom: 15px;">${isEdit ? 'Edit Lead' : 'Create New Lead'}</h3>
            <form id="${mode}LeadForm" class="lead-form">

                <div class="form-section">
                    <h4>Business Information</h4>
                    <div class="form-row-six">
                        <div class="form-group">
                            <label>Legal Name *</label>
                            <input type="text" name="business_name" value="${val('business_name')}" class="form-input" required>
                        </div>
                        <div class="form-group">
                            <label>DBA</label>
                            <input type="text" name="dba_name" value="${val('dba_name')}" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Phone *</label>
                            <input type="tel" name="lead_phone" class="form-input phone-format" value="${val('lead_phone')}" required>
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" name="email" value="${val('email')}" class="form-input">
                        </div>
                    </div>
                    <div class="form-row-six">
                        <div class="form-group">
                            <label>Address</label>
                            <input type="text" name="address" value="${val('address')}" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>City</label>
                            <input type="text" name="city" value="${val('city')}" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>State</label>
                            <input type="text" name="us_state" value="${val('us_state')}" class="form-input" maxlength="2">
                        </div>
                        <div class="form-group">
                            <label>Zip</label>
                            <input type="text" name="zip" value="${val('zip')}" class="form-input" maxlength="5">
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <h4>Financials</h4>
                    <div class="form-row-six">
                        <div class="form-group">
                            <label>Annual Revenue</label>
                            <input type="text" name="annual_revenue" value="${Formatters.currency(val('annual_revenue'))}" class="form-input money-format">
                        </div>
                        <div class="form-group">
                            <label>Monthly Revenue</label>
                            <input type="text" name="monthly_revenue" value="${Formatters.currency(val('monthly_revenue'))}" class="form-input money-format">
                        </div>
                        <div class="form-group">
                            <label>Requested Amount</label>
                            <input type="text" name="requested_amount" value="${Formatters.currency(val('requested_amount'))}" class="form-input money-format">
                        </div>
                    </div>
                </div>

                <div class="form-actions" style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;">
                    ${isEdit ? `<button type="button" class="btn btn-secondary" onclick="this.closest('.modal').style.display='none'">Cancel</button>` : ''}
                    <button type="submit" class="btn btn-primary">
                        ${isEdit ? 'Save Changes' : 'Create Lead'}
                    </button>
                </div>
            </form>
        </div>
        `;
    }

    // --- 2. RENDER METHODS ---

    // Called by the "Add Lead" button
    openCreateModal() {
        // Create modal container if not exists
        let modal = document.getElementById('createLeadModal');
        if (modal) modal.remove();

        const modalHTML = `
            <div id="createLeadModal" class="modal" style="display:flex;">
                <div class="modal-content comprehensive-modal">
                    <div class="modal-header">
                        <h3>New Lead</h3>
                        <button class="modal-close" onclick="document.getElementById('createLeadModal').remove()">×</button>
                    </div>
                    <div class="modal-body">
                        ${this.getFormHTML({}, 'create')}
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const form = document.getElementById('createLeadForm');
        this.attachListeners(form, 'create');
    }

    // Called by the "Edit" Tab in Right Panel
    renderEditTab(container) {
        const conv = this.parent.getSelectedConversation();

        if (!conv) {
            container.innerHTML = `<div class="empty-state">Select a conversation to edit</div>`;
            return;
        }

        container.innerHTML = this.getFormHTML(conv, 'edit');
        const form = document.getElementById('editLeadForm');
        this.attachListeners(form, 'edit', conv.id);
    }

    // --- 3. EVENT LISTENERS ---
    attachListeners(form, mode, id = null) {
        // Auto-format Phone
        form.querySelectorAll('.phone-format').forEach(input => {
            input.addEventListener('input', (e) => {
                e.target.value = Formatters.phone(e.target.value);
            });
        });

        // Submit Handler
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            const originalText = btn.textContent;
            btn.textContent = 'Saving...';
            btn.disabled = true;

            const formData = this.scrapeFormData(new FormData(form));

            try {
                if (mode === 'create') {
                    // POST /api/conversations
                    const res = await this.parent.apiCall('/api/conversations', {
                        method: 'POST',
                        body: formData
                    });

                    if(res.success) {
                        document.getElementById('createLeadModal').remove();
                        this.parent.conversationUI.loadConversations(); // Refresh list
                        this.parent.utils.showNotification('Lead Created!', 'success');
                    }
                } else {
                    // PUT /api/conversations/:id
                    await this.parent.apiCall(`/api/conversations/${id}`, {
                        method: 'PUT',
                        body: formData
                    });
                    this.parent.utils.showNotification('Lead Updated!', 'success');

                    // Refresh local data
                    this.parent.conversationUI.loadConversations();
                }
            } catch (err) {
                console.error(err);
                alert('Error: ' + err.message);
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    }

    scrapeFormData(formData) {
        const data = Object.fromEntries(formData.entries());
        // Clean currency fields
        ['annual_revenue', 'monthly_revenue', 'requested_amount'].forEach(k => {
            if(data[k]) data[k] = Formatters.strip(data[k]);
        });
        // Clean phone
        if(data.lead_phone) data.lead_phone = Formatters.strip(data.lead_phone);

        return data;
    }
}
