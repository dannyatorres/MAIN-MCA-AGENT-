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

    // --- SHARED FORM GENERATOR ---
    getFormHTML(data = {}, mode = 'create') {
        const isEdit = mode === 'edit';

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
            <form id="${mode}LeadForm" class="lead-form">

                <div class="form-section">
                    <div class="section-header">📊 Business Information</div>
                    <div class="section-content">
                        <div class="form-row-six">
                            <div class="form-group">
                                <label>Legal Name *</label>
                                <input type="text" name="businessName" value="${val('business_name', 'businessName')}" class="form-input" required>
                            </div>
                            <div class="form-group">
                                <label>DBA Name</label>
                                <input type="text" name="dbaName" value="${val('dba_name', 'dbaName')}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Primary Phone *</label>
                                <input type="tel" name="primaryPhone" value="${Formatters.phone(val('lead_phone', 'phone', 'primaryPhone'))}" class="form-input phone-format" required>
                            </div>
                            <div class="form-group">
                                <label>Cell Phone</label>
                                <input type="tel" name="cellPhone" value="${Formatters.phone(val('cell_phone', 'cellPhone'))}" class="form-input phone-format">
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
                                <label>Business Email</label>
                                <input type="email" name="businessEmail" value="${val('email', 'business_email', 'businessEmail')}" class="form-input">
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
                </div>

                <div class="form-section">
                    <div class="section-header">💰 Financials</div>
                    <div class="section-content">
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
                </div>

                <div class="form-section">
                    <div class="section-header">
                        👤 Owner 1
                        <label style="font-size: 11px; margin-left: auto; display: flex; align-items: center; gap: 5px;">
                            <input type="checkbox" id="copyAddr1"> Same as Business Address
                        </label>
                    </div>
                    <div class="section-content">
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
                                <label>Mobile</label>
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
                </div>

                <div class="form-section">
                    <div class="section-header">
                        👥 Partner (Optional)
                        <label style="font-size: 11px; margin-left: auto; display: flex; align-items: center; gap: 5px;">
                            <input type="checkbox" id="hasPartner" ${val('owner2_first_name', 'owner2FirstName') ? 'checked' : ''}> Add Partner
                        </label>
                    </div>
                    <div class="section-content" id="partnerSection" style="display: ${val('owner2_first_name', 'owner2FirstName') ? 'block' : 'none'};">
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
                                <label>Mobile</label>
                                <input type="tel" name="owner2Phone" value="${Formatters.phone(val('owner2_phone', 'owner2Phone'))}" class="form-input phone-format">
                            </div>
                        </div>
                        <div class="form-row-six">
                            <div class="form-group">
                                <label>SSN</label>
                                <input type="text" name="owner2SSN" value="${val('owner2_ssn', 'owner2SSN')}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Ownership %</label>
                                <input type="number" name="owner2OwnershipPercent" value="${val('owner2_ownership_percent', 'owner2OwnershipPercent')}" class="form-input" max="100">
                            </div>
                        </div>
                    </div>
                </div>

                <div class="form-actions" style="margin-top: 30px; display: flex; justify-content: flex-end; gap: 12px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                    ${isEdit ? `
                        <button type="button" id="generateAppBtn" class="btn" style="background: #6366f1; color: white; margin-right: auto;">
                            <i class="fas fa-file-pdf"></i> Generate App
                        </button>
                    ` : ''}

                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('leadModalWrapper').remove()">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="min-width: 150px;">
                        ${isEdit ? 'Save Changes' : 'Create Lead'}
                    </button>
                </div>
            </form>
        </div>
        `;
    }

    // --- MODAL LOGIC ---

    openCreateModal() {
        this.launchModal({}, 'create');
    }

    openEditModal(data) {
        if (!data) data = this.parent.getSelectedConversation();
        if (!data) return alert('No conversation selected to edit.');
        this.launchModal(data, 'edit');
    }

    launchModal(data, mode) {
        const existing = document.getElementById('leadModalWrapper');
        if (existing) existing.remove();

        const title = mode === 'edit' ? 'Edit Lead Details' : 'New Lead Application';

        const modalHTML = `
            <div id="leadModalWrapper" class="modal" style="display:flex;">
                <div class="modal-content comprehensive-modal">
                    <div class="modal-header">
                        <h3>${title}</h3>
                        <button class="modal-close" onclick="document.getElementById('leadModalWrapper').remove()">×</button>
                    </div>
                    <div class="modal-body">
                        ${this.getFormHTML(data, mode)}
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const form = document.getElementById(`${mode}LeadForm`);
        this.attachListeners(form, mode, data.id);
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

    attachListeners(form, mode, id = null) {
        // Formatters
        form.querySelectorAll('.phone-format').forEach(input => {
            input.addEventListener('input', (e) => e.target.value = Formatters.phone(e.target.value));
        });
        form.querySelectorAll('.money-format').forEach(input => {
            input.addEventListener('input', (e) => e.target.value = Formatters.currency(e.target.value));
        });

        // Partner Toggle
        const partnerCheck = form.querySelector('#hasPartner');
        const partnerSection = form.querySelector('#partnerSection');
        if (partnerCheck && partnerSection) {
            partnerCheck.addEventListener('change', (e) => {
                partnerSection.style.display = e.target.checked ? 'block' : 'none';
            });
        }

        // Address Copy
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

        // --- APP GENERATION LOGIC ---
        const generateBtn = form.querySelector('#generateAppBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', async () => {
                const formData = this.scrapeFormData(new FormData(form));
                const btnOriginalText = generateBtn.innerHTML;

                generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
                generateBtn.disabled = true;

                try {
                    const response = await fetch(`${this.parent.apiBaseUrl}/api/conversations/${id}/generate-pdf-document`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            applicationData: formData,
                            ownerName: `${formData.ownerFirstName} ${formData.ownerLastName}`
                        })
                    });

                    const result = await response.json();

                    if (result.success && result.document) {
                        // Trigger download
                        const link = document.createElement('a');
                        link.href = 'data:application/pdf;base64,' + result.document;
                        link.download = `${formData.businessName || 'Application'}.pdf`;
                        link.click();
                        alert('✅ PDF Generated & Downloaded!');
                    } else {
                        throw new Error(result.error || 'Unknown error');
                    }

                } catch (error) {
                    console.error('App Generation Error:', error);
                    alert('❌ Failed to generate app: ' + error.message);
                } finally {
                    generateBtn.innerHTML = btnOriginalText;
                    generateBtn.disabled = false;
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
                    const apiData = this.prepareForCreate(formData);
                    const res = await this.parent.apiCall('/api/conversations', {
                        method: 'POST',
                        body: apiData
                    });

                    if(res.success) {
                        document.getElementById('leadModalWrapper').remove();
                        if (this.parent.conversationUI) this.parent.conversationUI.loadConversations();
                        alert('Lead created successfully!');
                    }
                } else {
                    await this.parent.apiCall(`/api/conversations/${id}`, {
                        method: 'PUT',
                        body: formData
                    });

                    document.getElementById('leadModalWrapper')?.remove();

                    if (this.parent.conversationUI) {
                        this.parent.conversationUI.reloadConversationDetails();
                        this.parent.conversationUI.showConversationDetails();
                    }
                    alert('Lead updated successfully!');
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
        ['annualRevenue', 'monthlyRevenue', 'requestedAmount'].forEach(k => {
            if(data[k]) data[k] = data[k].replace(/[^0-9.]/g, '');
        });
        ['primaryPhone', 'cellPhone', 'ownerPhone', 'owner2Phone'].forEach(k => {
            if(data[k]) data[k] = data[k].replace(/\D/g, '');
        });
        return data;
    }

    prepareForCreate(data) {
        return {
            business_name: data.businessName,
            lead_phone: data.primaryPhone,
            email: data.businessEmail,
            us_state: data.businessState,
            business_address: data.businessAddress,
            ...data
        };
    }
}
