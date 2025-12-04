// frontend/js/controllers/lead-form-controller.js
import { Formatters } from '../utils/formatters.js';

export class LeadFormController {
    constructor(parent) {
        this.parent = parent;
        this.usStates = [
            { value: '', label: 'Select State...' },
            { value: 'AL', label: 'Alabama' }, { value: 'AK', label: 'Alaska' }, { value: 'AZ', label: 'Arizona' },
            { value: 'AR', label: 'Arkansas' }, { value: 'CA', label: 'California' }, { value: 'CO', label: 'Colorado' },
            { value: 'CT', label: 'Connecticut' }, { value: 'DE', label: 'Delaware' }, { value: 'FL', label: 'Florida' },
            { value: 'GA', label: 'Georgia' }, { value: 'HI', label: 'Hawaii' }, { value: 'ID', label: 'Idaho' },
            { value: 'IL', label: 'Illinois' }, { value: 'IN', label: 'Indiana' }, { value: 'IA', label: 'Iowa' },
            { value: 'KS', label: 'Kansas' }, { value: 'KY', label: 'Kentucky' }, { value: 'LA', label: 'Louisiana' },
            { value: 'ME', label: 'Maine' }, { value: 'MD', label: 'Maryland' }, { value: 'MA', label: 'Massachusetts' },
            { value: 'MI', label: 'Michigan' }, { value: 'MN', label: 'Minnesota' }, { value: 'MS', label: 'Mississippi' },
            { value: 'MO', label: 'Missouri' }, { value: 'MT', label: 'Montana' }, { value: 'NE', label: 'Nebraska' },
            { value: 'NV', label: 'Nevada' }, { value: 'NH', label: 'New Hampshire' }, { value: 'NJ', label: 'New Jersey' },
            { value: 'NM', label: 'New Mexico' }, { value: 'NY', label: 'New York' }, { value: 'NC', label: 'North Carolina' },
            { value: 'ND', label: 'North Dakota' }, { value: 'OH', label: 'Ohio' }, { value: 'OK', label: 'Oklahoma' },
            { value: 'OR', label: 'Oregon' }, { value: 'PA', label: 'Pennsylvania' }, { value: 'RI', label: 'Rhode Island' },
            { value: 'SC', label: 'South Carolina' }, { value: 'SD', label: 'South Dakota' }, { value: 'TN', label: 'Tennessee' },
            { value: 'TX', label: 'Texas' }, { value: 'UT', label: 'Utah' }, { value: 'VT', label: 'Vermont' },
            { value: 'VA', label: 'Virginia' }, { value: 'WA', label: 'Washington' }, { value: 'WV', label: 'West Virginia' },
            { value: 'WI', label: 'Wisconsin' }, { value: 'WY', label: 'Wyoming' }
        ];
    }

    /**
     * Converts Frontend CamelCase to Backend Snake_Case for CREATION only
     * The PUT route handles this mapping automatically, but POST does not.
     */
    prepareForCreate(data) {
        return {
            business_name: data.businessName,
            lead_phone: data.primaryPhone, // CRITICAL: Backend expects 'lead_phone'
            email: data.businessEmail,
            us_state: data.businessState,  // CRITICAL: Backend expects 'us_state'
            business_address: data.businessAddress,
            city: data.businessCity,
            zip: data.businessZip,
            first_name: data.ownerFirstName,
            last_name: data.ownerLastName,
            annual_revenue: data.annualRevenue,
            monthly_revenue: data.monthlyRevenue,
            requested_amount: data.requestedAmount,
            // Pass other fields as is; the backend insert query only looks for the specific ones above
            // but we might want to extend the backend POST route later.
            ...data
        };
    }

    // --- HTML GENERATOR ---
    getFormHTML(data = {}, mode = 'create') {
        const isEdit = mode === 'edit';

        // Helper to safely get value (checks multiple possible backend keys)
        const val = (...keys) => {
            for (const k of keys) {
                if (data[k] !== undefined && data[k] !== null) return data[k];
            }
            return '';
        };

        const dateVal = (...keys) => {
            const v = val(...keys);
            if (!v) return '';
            try { return new Date(v).toISOString().split('T')[0]; } catch (e) { return ''; }
        };

        const getStateOptions = (selected) => {
            return this.usStates.map(s =>
                `<option value="${s.value}" ${s.value === selected ? 'selected' : ''}>${s.label}</option>`
            ).join('');
        };

        return `
        <div class="edit-form-container">
            <h3 style="margin-bottom: 20px; color: #1e40af; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">
                ${isEdit ? 'Edit Lead Details' : 'Create New Lead'}
            </h3>

            <form id="${mode}LeadForm" class="lead-form">

                <div class="form-section">
                    <h4 class="section-title">📊 Business Information</h4>
                    <div class="form-row-six">
                        <div class="form-group">
                            <label>Legal Name *</label>
                            <input type="text" name="businessName" value="${val('business_name', 'businessName')}" class="form-input" required>
                        </div>
                        <div class="form-group">
                            <label>DBA</label>
                            <input type="text" name="dbaName" value="${val('dba_name', 'dbaName')}" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Primary Phone *</label>
                            <input type="tel" name="primaryPhone" value="${Formatters.phone(val('lead_phone', 'phone', 'primaryPhone'))}" class="form-input phone-format" required>
                        </div>
                        <div class="form-group">
                            <label>Business Email</label>
                            <input type="email" name="businessEmail" value="${val('email', 'business_email', 'businessEmail')}" class="form-input">
                        </div>
                    </div>

                    <div class="form-row-six">
                        <div class="form-group full-width">
                            <label>Business Address</label>
                            <input type="text" name="businessAddress" value="${val('address', 'business_address', 'businessAddress')}" class="form-input">
                        </div>
                    </div>

                    <div class="form-row-six">
                        <div class="form-group">
                            <label>City</label>
                            <input type="text" name="businessCity" value="${val('city', 'business_city', 'businessCity')}" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>State</label>
                            <select name="businessState" class="form-select">
                                ${getStateOptions(val('state', 'us_state', 'business_state', 'businessState'))}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Zip Code</label>
                            <input type="text" name="businessZip" value="${val('zip', 'business_zip', 'businessZip')}" class="form-input" maxlength="10">
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <h4 class="section-title">👤 Owner Information</h4>
                    <div class="form-row-six">
                        <div class="form-group">
                            <label>First Name</label>
                            <input type="text" name="ownerFirstName" value="${val('first_name', 'owner_first_name', 'ownerFirstName')}" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Last Name</label>
                            <input type="text" name="ownerLastName" value="${val('last_name', 'owner_last_name', 'ownerLastName')}" class="form-input">
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <h4 class="section-title">💰 Financials</h4>
                    <div class="form-row-six">
                        <div class="form-group">
                            <label>Annual Revenue</label>
                            <input type="text" name="annualRevenue" value="${Formatters.currency(val('annual_revenue', 'annualRevenue'))}" class="form-input money-format">
                        </div>
                        <div class="form-group">
                            <label>Monthly Revenue</label>
                            <input type="text" name="monthlyRevenue" value="${Formatters.currency(val('monthly_revenue', 'monthlyRevenue'))}" class="form-input money-format">
                        </div>
                        <div class="form-group">
                            <label>Requested Amount</label>
                            <input type="text" name="requestedAmount" value="${Formatters.currency(val('requested_amount', 'funding_amount', 'requestedAmount'))}" class="form-input money-format">
                        </div>
                    </div>
                </div>

                <div class="form-actions" style="margin-top: 30px; display: flex; justify-content: flex-end; gap: 12px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                    ${isEdit ?
                        `<button type="button" class="btn btn-secondary" onclick="this.closest('.modal') ? this.closest('.modal').style.display='none' : null">Cancel</button>` : ''
                    }
                    <button type="submit" class="btn btn-primary" style="min-width: 150px;">
                        ${isEdit ? 'Save Changes' : 'Create Lead'}
                    </button>
                </div>
            </form>
        </div>
        `;
    }

    // --- MODAL & TAB LOGIC ---

    openCreateModal() {
        let existing = document.getElementById('createLeadModal');
        if (existing) existing.remove();

        const modalHTML = `
            <div id="createLeadModal" class="modal" style="display:flex;">
                <div class="modal-content comprehensive-modal">
                    <div class="modal-header">
                        <h3>New Lead Application</h3>
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

    renderEditTab(container) {
        // Try multiple ways to get the selected conversation
        const conv = this.parent.getSelectedConversation?.() ||
                     this.parent.conversationCore?.selectedConversation ||
                     this.parent.selectedConversation ||
                     null;

        if (!conv) {
            container.innerHTML = `<div class="empty-state">Select a conversation to edit details.</div>`;
            return;
        }

        container.innerHTML = this.getFormHTML(conv, 'edit');
        const form = document.getElementById('editLeadForm');
        this.attachListeners(form, 'edit', conv.id);
    }

    // --- EVENT LISTENERS ---

    attachListeners(form, mode, id = null) {
        // Auto-format Phones
        form.querySelectorAll('.phone-format').forEach(input => {
            input.addEventListener('input', (e) => e.target.value = Formatters.phone(e.target.value));
        });

        // Auto-format Currency
        form.querySelectorAll('.money-format').forEach(input => {
            input.addEventListener('blur', (e) => {
                const val = e.target.value.replace(/[^0-9.]/g, '');
                if (val) e.target.value = Formatters.currency(val);
            });
        });

        // Submit Handler
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            const originalText = btn.textContent;
            btn.textContent = 'Saving...';
            btn.disabled = true;

            let formData = this.scrapeFormData(new FormData(form));

            try {
                if (mode === 'create') {
                    // MAP DATA FOR BACKEND
                    const apiData = this.prepareForCreate(formData);

                    // Try multiple API call methods
                    let res;
                    if (this.parent.api?.post) {
                        res = await this.parent.api.post('/api/conversations', apiData);
                    } else if (this.parent.apiCall) {
                        res = await this.parent.apiCall('/api/conversations', { method: 'POST', body: apiData });
                    } else {
                        throw new Error('No API method available');
                    }

                    if (res.success) {
                        document.getElementById('createLeadModal').remove();
                        // Reload conversations list
                        if (this.parent.conversationUI?.loadConversations) {
                            this.parent.conversationUI.loadConversations();
                        }
                        if (this.parent.utils?.showNotification) {
                            this.parent.utils.showNotification('Lead Created Successfully!', 'success');
                        }
                    }
                } else {
                    // Edit mode - Backend PUT route handles mapping automatically
                    if (this.parent.api?.put) {
                        await this.parent.api.put(`/api/conversations/${id}`, formData);
                    } else if (this.parent.apiCall) {
                        await this.parent.apiCall(`/api/conversations/${id}`, { method: 'PUT', body: formData });
                    }

                    // Reload the conversation list
                    if (this.parent.conversationUI?.loadConversations) {
                        this.parent.conversationUI.loadConversations();
                    }
                    if (this.parent.utils?.showNotification) {
                        this.parent.utils.showNotification('Lead Updated!', 'success');
                    }
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

    // --- HELPER: SCRAPE DATA ---
    scrapeFormData(formData) {
        const data = Object.fromEntries(formData.entries());

        // Clean Currencies (remove $ and commas)
        ['annualRevenue', 'monthlyRevenue', 'requestedAmount'].forEach(k => {
            if (data[k]) data[k] = data[k].replace(/[^0-9.]/g, '');
        });

        // Clean Phones (remove non-digits)
        ['primaryPhone', 'cellPhone', 'workPhone', 'faxPhone', 'ownerPhone', 'owner2Phone'].forEach(k => {
            if (data[k]) data[k] = data[k].replace(/\D/g, '');
        });

        return data;
    }
}
