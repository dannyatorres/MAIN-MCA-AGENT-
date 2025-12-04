// frontend/js/controllers/lead-form-controller.js
import { Formatters } from '../utils/formatters.js';

export class LeadFormController {
    constructor(parent) {
        this.parent = parent;
        // Helper to get US States
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

    // --- 1. THE COMPLETE HTML TEMPLATE ---
    getFormHTML(data = {}, mode = 'create') {
        const isEdit = mode === 'edit';

        // Helper to safely get value (checks multiple possible backend keys)
        const val = (...keys) => {
            for (const k of keys) {
                if (data[k] !== undefined && data[k] !== null) return data[k];
            }
            return '';
        };

        // Format Date for Input (YYYY-MM-DD)
        const dateVal = (...keys) => {
            const v = val(...keys);
            if (!v) return '';
            try { return new Date(v).toISOString().split('T')[0]; } catch (e) { return ''; }
        };

        // State Options Generator
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
                    <h4 class="section-title">🏢 Business Information</h4>

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
                        <div class="form-group">
                            <label>Cell Phone</label>
                            <input type="tel" name="cellPhone" value="${Formatters.phone(val('cell_phone', 'cellPhone'))}" class="form-input phone-format">
                        </div>
                        <div class="form-group">
                            <label>Work Phone</label>
                            <input type="tel" name="workPhone" value="${Formatters.phone(val('work_phone', 'workPhone'))}" class="form-input phone-format">
                        </div>
                        <div class="form-group">
                            <label>Fax</label>
                            <input type="tel" name="faxPhone" value="${Formatters.phone(val('fax_phone', 'faxPhone'))}" class="form-input phone-format">
                        </div>
                        <div class="form-group">
                            <label>Website</label>
                            <input type="url" name="website" value="${val('website')}" class="form-input" placeholder="https://">
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
                        <div class="form-group">
                            <label>Country</label>
                            <input type="text" name="businessCountry" value="${val('business_country', 'country') || 'United States'}" class="form-input">
                        </div>
                    </div>

                    <div class="form-row-six">
                        <div class="form-group">
                            <label>Tax ID (EIN)</label>
                            <input type="text" name="federalTaxId" value="${val('tax_id', 'federal_tax_id', 'tax_id_encrypted')}" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Entity Type</label>
                            <select name="entityType" class="form-select">
                                <option value="">Select...</option>
                                <option value="LLC" ${val('entity_type', 'entityType')==='LLC'?'selected':''}>LLC</option>
                                <option value="Corporation" ${val('entity_type', 'entityType')==='Corporation'?'selected':''}>Corporation</option>
                                <option value="Sole Proprietorship" ${val('entity_type', 'entityType')==='Sole Proprietorship'?'selected':''}>Sole Prop</option>
                                <option value="Partnership" ${val('entity_type', 'entityType')==='Partnership'?'selected':''}>Partnership</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Industry</label>
                            <input type="text" name="industryType" value="${val('industry', 'industry_type', 'business_type')}" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Start Date</label>
                            <input type="date" name="businessStartDate" value="${dateVal('business_start_date', 'businessStartDate')}" class="form-input">
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
                        <div class="form-group">
                            <label>Use of Proceeds</label>
                            <input type="text" name="useOfProceeds" value="${val('use_of_proceeds', 'useOfProceeds')}" class="form-input">
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h4 class="section-title">👤 Owner 1</h4>
                        <label style="font-size: 12px; display: flex; align-items: center; gap: 5px;">
                            <input type="checkbox" id="copyAddr1"> Same as Business Address
                        </label>
                    </div>

                    <div class="form-row-six">
                        <div class="form-group">
                            <label>First Name</label>
                            <input type="text" name="ownerFirstName" value="${val('first_name', 'owner_first_name', 'ownerFirstName')}" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Last Name</label>
                            <input type="text" name="ownerLastName" value="${val('last_name', 'owner_last_name', 'ownerLastName')}" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" name="ownerEmail" value="${val('owner_email', 'ownerEmail')}" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Phone</label>
                            <input type="tel" name="ownerPhone" value="${Formatters.phone(val('owner_phone', 'ownerPhone'))}" class="form-input phone-format">
                        </div>
                    </div>

                    <div class="form-row-six">
                        <div class="form-group">
                            <label>SSN</label>
                            <input type="text" name="ownerSSN" value="${val('ssn', 'ssn_encrypted', 'ownerSSN')}" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Date of Birth</label>
                            <input type="date" name="ownerDOB" value="${dateVal('date_of_birth', 'owner_dob', 'ownerDOB')}" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Ownership %</label>
                            <input type="number" name="ownerOwnershipPercentage" value="${val('ownership_percentage', 'ownership_percent', 'ownerOwnershipPercentage')}" class="form-input" max="100">
                        </div>
                    </div>

                    <div class="form-row-six">
                        <div class="form-group full-width">
                            <label>Home Address</label>
                            <input type="text" name="ownerHomeAddress" value="${val('owner_address', 'owner_home_address', 'ownerHomeAddress')}" class="form-input">
                        </div>
                    </div>

                    <div class="form-row-six">
                        <div class="form-group">
                            <label>City</label>
                            <input type="text" name="ownerHomeCity" value="${val('owner_city', 'owner_home_city', 'ownerHomeCity')}" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>State</label>
                            <select name="ownerHomeState" class="form-select">
                                ${getStateOptions(val('owner_state', 'owner_home_state', 'ownerHomeState'))}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Zip</label>
                            <input type="text" name="ownerHomeZip" value="${val('owner_zip', 'owner_home_zip', 'ownerHomeZip')}" class="form-input" maxlength="10">
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <h4 class="section-title">👥 Partner (Optional)</h4>

                    <div class="form-row-six">
                        <div class="form-group">
                            <label>First Name</label>
                            <input type="text" name="owner2FirstName" value="${val('owner2_first_name', 'owner2FirstName')}" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Last Name</label>
                            <input type="text" name="owner2LastName" value="${val('owner2_last_name', 'owner2LastName')}" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" name="owner2Email" value="${val('owner2_email', 'owner2Email')}" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Phone</label>
                            <input type="tel" name="owner2Phone" value="${Formatters.phone(val('owner2_phone', 'owner2Phone'))}" class="form-input phone-format">
                        </div>
                    </div>

                    <div class="form-row-six">
                        <div class="form-group">
                            <label>Ownership %</label>
                            <input type="number" name="owner2OwnershipPercent" value="${val('owner2_ownership_percent', 'owner2OwnershipPercent')}" class="form-input" max="100">
                        </div>
                        <div class="form-group">
                            <label>SSN</label>
                            <input type="text" name="owner2SSN" value="${val('owner2_ssn', 'owner2SSN')}" class="form-input">
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <h4 class="section-title">📢 Marketing & Meta</h4>

                    <div class="form-row-six">
                        <div class="form-group">
                            <label>Lead Source</label>
                            <input type="text" name="leadSource" value="${val('lead_source', 'leadSource')}" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Campaign</label>
                            <input type="text" name="campaign" value="${val('campaign')}" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Lead Status</label>
                            <select name="leadStatus" class="form-select">
                                <option value="NEW" ${val('state', 'leadStatus')==='NEW'?'selected':''}>New</option>
                                <option value="QUALIFIED" ${val('state', 'leadStatus')==='QUALIFIED'?'selected':''}>Qualified</option>
                                <option value="SUBMITTED" ${val('state', 'leadStatus')==='SUBMITTED'?'selected':''}>Submitted</option>
                                <option value="FUNDED" ${val('state', 'leadStatus')==='FUNDED'?'selected':''}>Funded</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group" style="flex-direction: row; gap: 15px; align-items: center; margin-top: 10px;">
                            <label style="margin: 0; font-weight: 600;">Marketing Pref:</label>
                            <label><input type="radio" name="marketingNotification" value="TEXT" ${val('marketing_opt_text') && !val('marketing_opt_email') ? 'checked' : ''}> Text</label>
                            <label><input type="radio" name="marketingNotification" value="EMAIL" ${!val('marketing_opt_text') && val('marketing_opt_email') ? 'checked' : ''}> Email</label>
                            <label><input type="radio" name="marketingNotification" value="BOTH" ${val('marketing_opt_text') !== false && val('marketing_opt_email') !== false ? 'checked' : ''}> Both</label>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group full-width">
                            <label>Notes</label>
                            <textarea name="notes" class="form-textarea" rows="3">${val('notes')}</textarea>
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

    // --- 2. MODAL & TAB LOGIC ---

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
        const conv = this.parent.getSelectedConversation();
        if (!conv) {
            container.innerHTML = `<div class="empty-state">Select a conversation to edit details.</div>`;
            return;
        }

        container.innerHTML = this.getFormHTML(conv, 'edit');
        const form = document.getElementById('editLeadForm');
        this.attachListeners(form, 'edit', conv.id);
    }

    // --- 3. EVENT LISTENERS ---

    attachListeners(form, mode, id = null) {
        // Auto-format Phones
        form.querySelectorAll('.phone-format').forEach(input => {
            input.addEventListener('input', (e) => e.target.value = Formatters.phone(e.target.value));
        });

        // Address Copy (Business -> Owner)
        const copyBtn = form.querySelector('#copyAddr1');
        if(copyBtn) {
            copyBtn.addEventListener('change', (e) => {
                if(e.target.checked) {
                    form.querySelector('[name="ownerHomeAddress"]').value = form.querySelector('[name="businessAddress"]').value;
                    form.querySelector('[name="ownerHomeCity"]').value = form.querySelector('[name="businessCity"]').value;
                    form.querySelector('[name="ownerHomeState"]').value = form.querySelector('[name="businessState"]').value;
                    form.querySelector('[name="ownerHomeZip"]').value = form.querySelector('[name="businessZip"]').value;
                }
            });
        }

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
                    const res = await this.parent.apiCall('/api/conversations', {
                        method: 'POST',
                        body: formData
                    });

                    if(res.success) {
                        document.getElementById('createLeadModal').remove();
                        this.parent.conversationUI.loadConversations();
                        this.parent.utils.showNotification('Lead Created Successfully!', 'success');
                    }
                } else {
                    await this.parent.apiCall(`/api/conversations/${id}`, {
                        method: 'PUT',
                        body: formData
                    });
                    this.parent.utils.showNotification('Lead Updated!', 'success');
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

    // --- 4. DATA PREP ---
    scrapeFormData(formData) {
        const data = Object.fromEntries(formData.entries());

        // Clean Currencies
        ['annualRevenue', 'monthlyRevenue', 'requestedAmount'].forEach(k => {
            if(data[k]) data[k] = Formatters.strip(data[k]);
        });

        // Clean Phones
        ['primaryPhone', 'cellPhone', 'workPhone', 'faxPhone', 'ownerPhone', 'owner2Phone'].forEach(k => {
            if(data[k]) data[k] = Formatters.strip(data[k]);
        });

        // Clean Tax ID / SSN
        ['federalTaxId', 'ownerSSN', 'owner2SSN'].forEach(k => {
            if(data[k]) data[k] = data[k].replace(/\D/g, ''); // Remove dashes
        });

        return data;
    }
}
