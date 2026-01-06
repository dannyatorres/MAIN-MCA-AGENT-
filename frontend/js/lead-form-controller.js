// frontend/js/lead-form-controller.js
import { Formatters } from './formatters.js';

export class LeadFormController {
    constructor(parent) {
        this.parent = parent;
        this.usStates = [
            { value: '', label: 'State' },
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

        const iconInput = (iconClass) => `<span class="input-icon"><i class="${iconClass}"></i></span>`;

        return `
        <div class="edit-form-container">
            <form id="${mode}LeadForm" class="lead-form sleek-form">

                <div class="form-section">
                    <div class="section-header">
                        <div class="header-title"><i class="fas fa-building text-accent"></i> Business Profile</div>
                    </div>
                    <div class="section-content">

                        <div class="form-grid col-2">
                            <div class="form-group">
                                <label>Legal Name *</label>
                                <div class="input-wrapper">
                                    ${iconInput('fas fa-store')}
                                    <input type="text" name="businessName" value="${val('business_name', 'businessName')}" class="form-input" required placeholder="Legal Entity Name">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>DBA Name</label>
                                <div class="input-wrapper">
                                    ${iconInput('fas fa-tag')}
                                    <input type="text" name="dbaName" value="${val('dba_name', 'dbaName')}" class="form-input" placeholder="DBA">
                                </div>
                            </div>
                        </div>

                        <div class="form-grid col-3">
                            <div class="form-group">
                                <label>Primary Phone *</label>
                                <div class="input-wrapper">
                                    ${iconInput('fas fa-phone')}
                                    <input type="tel" name="primaryPhone" value="${Formatters.phone(val('lead_phone', 'phone', 'primaryPhone'))}" class="form-input phone-format" required placeholder="(555) 555-5555">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Business Email</label>
                                <div class="input-wrapper">
                                    ${iconInput('fas fa-envelope')}
                                    <input type="email" name="businessEmail" value="${val('email', 'business_email', 'businessEmail')}" class="form-input" placeholder="email@company.com">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Cell Phone</label>
                                <div class="input-wrapper">
                                    ${iconInput('fas fa-mobile-alt')}
                                    <input type="tel" name="cellPhone" value="${Formatters.phone(val('cell_phone', 'cellPhone'))}" class="form-input phone-format" placeholder="(555) 555-5555">
                                </div>
                            </div>
                        </div>

                        <div class="form-group" style="margin-bottom: 12px !important;">
                             <label>Business Address</label>
                             <div class="input-wrapper">
                                 ${iconInput('fas fa-map-marker-alt')}
                                 <input type="text" name="businessAddress" value="${val('address', 'business_address', 'businessAddress')}" class="form-input" placeholder="Street Address">
                             </div>
                        </div>

                        <div class="form-grid col-2-1-1">
                            <div class="form-group">
                                <label>City</label>
                                <input type="text" name="businessCity" value="${val('city', 'business_city', 'businessCity')}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>State</label>
                                <div class="select-wrapper">
                                    <select name="businessState" class="form-select">
                                        ${getStateOptions(val('us_state', 'business_state', 'businessState'))}
                                    </select>
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Zip Code</label>
                                <input type="text" name="businessZip" value="${val('zip', 'business_zip', 'businessZip')}" class="form-input" maxlength="10">
                            </div>
                        </div>

                        <div class="form-grid col-4">
                            <div class="form-group">
                                <label>Tax ID (EIN)</label>
                                <input type="text" name="federalTaxId" value="${this.formatEIN(val('tax_id', 'federal_tax_id', 'tax_id_encrypted'))}" class="form-input ein-format" maxlength="10" placeholder="XX-XXXXXXX">
                            </div>
                            <div class="form-group">
                                <label>Entity Type</label>
                                <div class="select-wrapper">
                                    <select name="entityType" class="form-select">
                                        <option value="">Select...</option>
                                        <option value="LLC" ${val('entity_type', 'entityType')==='LLC'?'selected':''}>LLC</option>
                                        <option value="Corporation" ${val('entity_type', 'entityType')==='Corporation'?'selected':''}>Corporation</option>
                                        <option value="Sole Proprietorship" ${val('entity_type', 'entityType')==='Sole Proprietorship'?'selected':''}>Sole Prop</option>
                                        <option value="Partnership" ${val('entity_type', 'entityType')==='Partnership'?'selected':''}>Partnership</option>
                                    </select>
                                </div>
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
                    <div class="section-header">
                        <div class="header-title"><i class="fas fa-chart-line text-accent"></i> Financials</div>
                    </div>
                    <div class="section-content">
                        <div class="form-grid col-3">
                            <div class="form-group">
                                <label>Annual Rev</label>
                                <div class="input-wrapper">
                                    ${iconInput('fas fa-dollar-sign')}
                                    <input type="text" name="annualRevenue" value="${Formatters.currency(val('annual_revenue', 'annualRevenue'))}" class="form-input money-format" placeholder="0.00">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Monthly Rev</label>
                                <div class="input-wrapper">
                                    ${iconInput('fas fa-dollar-sign')}
                                    <input type="text" name="monthlyRevenue" value="${Formatters.currency(val('monthly_revenue', 'monthlyRevenue'))}" class="form-input money-format" placeholder="0.00">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Requested</label>
                                <div class="input-wrapper highlight-input">
                                    ${iconInput('fas fa-money-bill-wave')}
                                    <input type="text" name="requestedAmount" value="${Formatters.currency(val('requested_amount', 'funding_amount', 'requestedAmount'))}" class="form-input money-format" placeholder="0.00">
                                </div>
                            </div>
                        </div>

                        <div class="form-grid col-3" style="margin-top: 12px;">
                            <div class="form-group">
                                <label>Credit Score</label>
                                <div class="input-wrapper">
                                    ${iconInput('fas fa-credit-card')}
                                    <input type="text" name="creditScore" value="${val('credit_score', 'creditScore')}" class="form-input" placeholder="e.g., 650">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Funding Status</label>
                                <div class="select-wrapper">
                                    <select name="fundingStatus" class="form-select">
                                        <option value="" ${!val('funding_status', 'fundingStatus') ? 'selected' : ''}>-- Select --</option>
                                        <option value="none" ${val('funding_status', 'fundingStatus') === 'none' ? 'selected' : ''}>No Funding</option>
                                        <option value="1_position" ${val('funding_status', 'fundingStatus') === '1_position' ? 'selected' : ''}>1 Position</option>
                                        <option value="2_positions" ${val('funding_status', 'fundingStatus') === '2_positions' ? 'selected' : ''}>2 Positions</option>
                                        <option value="3_plus" ${val('funding_status', 'fundingStatus') === '3_plus' ? 'selected' : ''}>3+ Positions</option>
                                    </select>
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Funding Details</label>
                                <div class="input-wrapper">
                                    ${iconInput('fas fa-info-circle')}
                                    <input type="text" name="recentFunding" value="${val('recent_funding', 'recentFunding')}" class="form-input" placeholder="e.g., $50k last month">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <div class="section-header">
                        <div class="header-title"><i class="fas fa-user-tie text-accent"></i> Owner 1</div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="copyAddr1">
                            <span class="slider round"></span>
                            <span class="toggle-label">Same Addr</span>
                        </label>
                    </div>
                    <div class="section-content">
                        <div class="form-grid col-4">
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

                        <div class="form-grid col-3">
                            <div class="form-group">
                                <label>SSN</label>
                                <div class="input-wrapper">
                                    ${iconInput('fas fa-id-card')}
                                    <input type="text" name="ownerSSN" value="${this.formatSSN(val('ssn', 'ssn_encrypted', 'ownerSSN'))}" class="form-input ssn-format" maxlength="11" placeholder="XXX-XX-XXXX">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>DOB</label>
                                <input type="date" name="ownerDOB" value="${dateVal('date_of_birth', 'owner_dob', 'ownerDOB')}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Ownership %</label>
                                <div class="input-wrapper">
                                    ${iconInput('fas fa-percent')}
                                    <input type="number" name="ownershipPercent" value="${val('ownership_percentage', 'ownership_percent', 'ownerOwnershipPercentage')}" class="form-input" max="100">
                                </div>
                            </div>
                        </div>

                        <div class="form-group" style="margin-bottom: 12px !important;">
                            <label>Home Address</label>
                            <input type="text" name="ownerHomeAddress" value="${val('owner_address', 'owner_home_address', 'ownerHomeAddress')}" class="form-input">
                        </div>

                        <div class="form-grid col-2-1-1">
                            <div class="form-group">
                                <label>City</label>
                                <input type="text" name="ownerHomeCity" value="${val('owner_city', 'owner_home_city', 'ownerHomeCity')}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>State</label>
                                <div class="select-wrapper">
                                    <select name="ownerHomeState" class="form-select">
                                        ${getStateOptions(val('owner_state', 'owner_home_state', 'ownerHomeState'))}
                                    </select>
                                </div>
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
                        <div class="header-title"><i class="fas fa-users text-accent"></i> Partner</div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="hasPartner" ${val('owner2_first_name', 'owner2FirstName') ? 'checked' : ''}>
                            <span class="slider round"></span>
                            <span class="toggle-label">Add</span>
                        </label>
                    </div>
                    <div class="section-content ${val('owner2_first_name', 'owner2FirstName') ? '' : 'hidden-section'}" id="partnerSection">
                         <div class="form-grid col-4">
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

                         <div class="form-grid col-3">
                            <div class="form-group">
                                <label>SSN</label>
                                <input type="text" name="owner2SSN" value="${this.formatSSN(val('owner2_ssn', 'owner2SSN'))}" class="form-input ssn-format" maxlength="11" placeholder="XXX-XX-XXXX">
                            </div>
                            <div class="form-group">
                                <label>DOB</label>
                                <input type="date" name="owner2DOB" value="${dateVal('owner2_dob', 'owner2DOB')}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Ownership %</label>
                                <input type="number" name="owner2OwnershipPercent" value="${val('owner2_ownership_percent', 'owner2OwnershipPercent')}" class="form-input" max="100">
                            </div>
                        </div>

                        <div class="form-group" style="margin-bottom: 12px !important;">
                            <label>Home Address</label>
                            <input type="text" name="owner2HomeAddress" value="${val('owner2_address', 'owner2HomeAddress')}" class="form-input">
                        </div>
                        <div class="form-grid col-2-1-1">
                            <div class="form-group">
                                <label>City</label>
                                <input type="text" name="owner2HomeCity" value="${val('owner2_city', 'owner2HomeCity')}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>State</label>
                                <div class="select-wrapper">
                                    <select name="owner2HomeState" class="form-select">
                                        ${getStateOptions(val('owner2_state', 'owner2HomeState'))}
                                    </select>
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Zip</label>
                                <input type="text" name="owner2HomeZip" value="${val('owner2_zip', 'owner2HomeZip')}" class="form-input" maxlength="10">
                            </div>
                        </div>
                    </div>
                </div>

                <div class="form-actions sleek-actions">
                    ${isEdit ? `
                        <button type="button" id="generateAppBtn" class="btn btn-generate">
                            <i class="fas fa-file-pdf"></i> Generate PDF
                        </button>
                    ` : ''}

                    <button type="button" class="btn btn-text" onclick="document.getElementById('leadModalWrapper').remove()">Cancel</button>

                    <button type="submit" class="btn btn-primary btn-wide">
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
        const convId = String(data?.id || this.parent.getCurrentConversationId());
        if (!convId) return alert('No conversation selected to edit.');

        // Always get from the Map (updated by prefetch + background fetch)
        const mapData = this.parent.conversationUI?.conversations.get(convId);

        // Prefer fully-loaded Map data, then passed data, then selectedConversation
        let conv;
        if (mapData && mapData._fullLoaded) {
            conv = mapData;
        } else if (mapData) {
            conv = { ...mapData, ...data };
        } else {
            conv = data || this.parent.getSelectedConversation();
        }

        if (!conv) return alert('No conversation data available.');
        this.launchModal(conv, 'edit');
    }

    launchModal(data, mode) {
        const existing = document.getElementById('leadModalWrapper');
        if (existing) existing.remove();

        const title = mode === 'edit' ? 'Edit Lead' : 'New Lead';

        const modalHTML = `
            <div id="leadModalWrapper" class="modal fade-in">
                <div class="modal-content comprehensive-modal glass-panel">
                    <div class="modal-header sleek-header">
                        <h3>${title}</h3>
                        <button class="modal-close" onclick="document.getElementById('leadModalWrapper').remove()">&times;</button>
                    </div>
                    <div class="modal-body custom-scrollbar">
                        ${this.getFormHTML(data, mode)}
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const form = document.getElementById(`${mode}LeadForm`);
        this.attachListeners(form, mode, data.id);
    }

    async renderEditTab(container) {
        const convId = this.parent.getCurrentConversationId();

        if (!convId) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i> Select a conversation to edit details.</div>`;
            return;
        }

        container.innerHTML = `
            <div class="loading-state" style="padding: 40px; text-align: center; color: #888;">
                <div class="loading-spinner"></div>
                <p style="margin-top: 10px;">Loading full lead details...</p>
                <div id="slowNetworkMsg" style="display: none; margin-top: 15px; color: #f39c12; font-size: 0.9em;">
                    <i class="fas fa-wifi"></i> Taking longer than usual...
                </div>
            </div>
        `;

        const slowMsgTimer = setTimeout(() => {
            const msg = document.getElementById('slowNetworkMsg');
            if (msg) msg.style.display = 'block';
        }, 3000);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        try {
            const fullData = await this.parent.apiCall(`/api/conversations/${convId}`, {
                signal: controller.signal
            });

            let conv = fullData.conversation || fullData;
            if (!conv || !conv.id) {
                conv = this.parent.getSelectedConversation();
            }

            if (conv) {
                if (this.parent.conversationUI) {
                    this.parent.conversationUI.selectedConversation = conv;
                }

                container.innerHTML = this.getFormHTML(conv, 'edit');
                const form = document.getElementById('editLeadForm');
                this.attachListeners(form, 'edit', conv.id);
            } else {
                throw new Error('Received empty data for this lead.');
            }
        } catch (error) {
            console.error('Failed to load details:', error);

            let errorMsg = error.message || 'Connection failed';
            if (error.name === 'AbortError') {
                errorMsg = 'Server took too long to respond';
            }

            container.innerHTML = `
                <div class="error-state" style="padding: 40px; text-align: center;">
                    <div style="font-size: 24px; margin-bottom: 10px; color: #e74c3c;">⚠️</div>
                    <h4 style="margin-bottom: 10px;">Could not load details</h4>
                    <p style="color: #888; margin-bottom: 20px; font-size: 0.9em;">${errorMsg}</p>
                    <button class="btn btn-secondary" id="retryEditBtn"><i class="fas fa-sync"></i> Retry</button>
                </div>
            `;

            container.querySelector('#retryEditBtn').onclick = () => this.renderEditTab(container);
        } finally {
            clearTimeout(timeoutId);
            clearTimeout(slowMsgTimer);
        }
    }

    attachListeners(form, mode, id = null) {
        // Formatters - Phone
        form.querySelectorAll('.phone-format').forEach(input => {
            input.addEventListener('input', (e) => e.target.value = Formatters.phone(e.target.value));
        });
        // Formatters - Money
        form.querySelectorAll('.money-format').forEach(input => {
            input.addEventListener('input', (e) => e.target.value = Formatters.currency(e.target.value));
        });
        // Formatters - EIN (XX-XXXXXXX)
        form.querySelectorAll('.ein-format').forEach(input => {
            input.addEventListener('input', (e) => e.target.value = this.formatEIN(e.target.value));
        });
        // Formatters - SSN (XXX-XX-XXXX)
        form.querySelectorAll('.ssn-format').forEach(input => {
            input.addEventListener('input', (e) => e.target.value = this.formatSSN(e.target.value));
        });

        // Partner Toggle
        const partnerCheck = form.querySelector('#hasPartner');
        const partnerSection = form.querySelector('#partnerSection');
        if (partnerCheck && partnerSection) {
            partnerCheck.addEventListener('change', (e) => {
                partnerSection.classList.toggle('hidden-section', !e.target.checked);
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

        // ZIP Code Auto-fill for Business
        const businessZip = form.querySelector('[name="businessZip"]');
        const businessCity = form.querySelector('[name="businessCity"]');
        const businessState = form.querySelector('[name="businessState"]');
        if (businessZip) {
            businessZip.addEventListener('blur', () => {
                this.lookupZip(businessZip.value, businessCity, businessState);
            });
        }

        // ZIP Code Auto-fill for Owner 1
        const ownerZip = form.querySelector('[name="ownerHomeZip"]');
        const ownerCity = form.querySelector('[name="ownerHomeCity"]');
        const ownerState = form.querySelector('[name="ownerHomeState"]');
        if (ownerZip) {
            ownerZip.addEventListener('blur', () => {
                this.lookupZip(ownerZip.value, ownerCity, ownerState);
            });
        }

        // ZIP Code Auto-fill for Partner (Owner 2)
        const owner2Zip = form.querySelector('[name="owner2HomeZip"]');
        const owner2City = form.querySelector('[name="owner2HomeCity"]');
        const owner2State = form.querySelector('[name="owner2HomeState"]');
        if (owner2Zip) {
            owner2Zip.addEventListener('blur', () => {
                this.lookupZip(owner2Zip.value, owner2City, owner2State);
            });
        }

        // --- APP GENERATION HANDLER (RESTORED TO SERVER-SIDE) ---
        const generateBtn = form.querySelector('#generateAppBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', async () => {
                const currentForm = document.getElementById('editLeadForm');
                if (!currentForm) return alert('Form not found');

                const rawFormData = this.scrapeFormData(new FormData(currentForm));
                const pdfData = this.mapDataForAppGeneration(rawFormData);
                const ownerName = `${rawFormData.ownerFirstName || ''} ${rawFormData.ownerLastName || ''}`.trim();

                const btnOriginalText = generateBtn.innerHTML;
                generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
                generateBtn.disabled = true;

                try {
                    const result = await this.parent.apiCall(`/api/conversations/${id}/generate-pdf-document`, {
                        method: 'POST',
                        body: {
                            applicationData: pdfData,
                            ownerName: ownerName
                        }
                    });

                    if (result.success) {
                        document.getElementById('leadModalWrapper')?.remove();
                        this.parent.utils.showNotification('Application Generated Successfully!', 'success');

                        if (this.parent.intelligence) this.parent.intelligence.switchTab('documents');
                        if (this.parent.documents) {
                            setTimeout(() => this.parent.documents.loadDocuments(), 500);
                        }
                    } else {
                        throw new Error(result.error || 'Server failed to generate PDF');
                    }
                } catch (error) {
                    console.error('PDF Generation Error:', error);
                    alert('Failed to generate PDF: ' + error.message);
                } finally {
                    generateBtn.innerHTML = btnOriginalText;
                    generateBtn.disabled = false;
                }
            });
        }

        // Submit Handler
        console.log('🔧 Attaching submit handler to form:', form?.id, 'mode:', mode, 'id:', id);
        form.addEventListener('submit', async (e) => {
            console.log('🔥 SUBMIT FIRED');
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            const originalText = btn.textContent;
            btn.textContent = 'Saving...';
            btn.disabled = true;

            const formData = this.scrapeFormData(new FormData(form));
            console.log('📤 Scraped formData:', formData);
            console.log('📤 Mode:', mode, 'ID:', id);

            try {
                if (mode === 'create') {
                    const apiData = this.prepareForCreate(formData);
                    const res = await this.parent.apiCall('/api/conversations', {
                        method: 'POST',
                        body: apiData
                    });

                    if(res.success) {
                        document.getElementById('leadModalWrapper').remove();

                        // 🟢 FIX: Refresh the list immediately
                        console.log('🔄 Refreshing lead list...');
                        if (this.parent.conversationUI) {
                            await this.parent.conversationUI.loadConversations(true); // 'true' resets the list to page 1
                        } else if (window.conversationUI) {
                            await window.conversationUI.loadConversations(true);
                        }

                        this.parent.utils.showNotification('Lead created successfully!', 'success');
                    }
                } else {
                    // === EDIT MODE ===
                    const res = await this.parent.apiCall(`/api/conversations/${id}`, {
                        method: 'PUT',
                        body: formData
                    });

                    document.getElementById('leadModalWrapper')?.remove();

                    // FIX: Update the frontend state immediately
                    if (res.success && res.conversation) {
                        const updatedLead = res.conversation;

                        // 1. Update the main list cache
                        if (this.parent.conversationUI && this.parent.conversationUI.conversations) {
                            this.parent.conversationUI.conversations.set(updatedLead.id, updatedLead);
                        }

                        // 2. If this is the currently selected conversation, update the active view
                        if (this.parent.conversationUI.currentConversationId === updatedLead.id) {
                            this.parent.conversationUI.selectedConversation = updatedLead;
                            this.parent.conversationUI.showConversationDetails(); // Now renders new data
                        }

                        // 3. Refresh the sidebar list (to show updated name/time)
                        this.parent.conversationUI.renderConversationsList();
                    }

                    this.parent.utils.showNotification('Lead updated successfully!', 'success');
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
            credit_score: data.creditScore,
            funding_status: data.fundingStatus,
            recent_funding: data.recentFunding,
            first_name: data.ownerFirstName,
            last_name: data.ownerLastName,
            ...data
        };
    }

    // --- FORMAT HELPERS ---
    formatEIN(ein) {
        if (!ein) return '';
        const digits = ein.replace(/\D/g, '');
        if (digits.length === 9) {
            return `${digits.slice(0, 2)}-${digits.slice(2)}`;
        }
        return ein;
    }

    formatSSN(ssn) {
        if (!ssn) return '';
        const digits = ssn.replace(/\D/g, '');
        if (digits.length === 9) {
            return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
        }
        return ssn;
    }

    formatDateUS(dateStr) {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const year = date.getFullYear();
            return `${month}/${day}/${year}`;
        } catch (e) {
            return dateStr;
        }
    }

    // --- ZIP CODE LOOKUP (Auto-fill City/State) ---
    async lookupZip(zipCode, cityInput, stateSelect) {
        if (!zipCode || zipCode.length < 5) return;
        const zip = zipCode.replace(/\D/g, '').slice(0, 5);
        if (zip.length !== 5) return;

        try {
            const response = await fetch(`https://api.zippopotam.us/us/${zip}`);
            if (!response.ok) return;

            const data = await response.json();
            if (data.places && data.places.length > 0) {
                const place = data.places[0];

                // Set City
                if (cityInput) cityInput.value = place['place name'];

                // Set State (Robust Match)
                if (stateSelect) {
                    const apiState = place['state abbreviation'].toUpperCase();
                    stateSelect.value = apiState;
                    if (stateSelect.value !== apiState) {
                        for (let i = 0; i < stateSelect.options.length; i++) {
                            if (stateSelect.options[i].value.toUpperCase() === apiState) {
                                stateSelect.selectedIndex = i;
                                break;
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.log('ZIP lookup failed:', err.message);
        }
    }

    // --- PDF DATA MAPPING ---
    mapDataForAppGeneration(data) {
        return {
            // Business Info
            legalName: data.businessName,
            dba: data.dbaName,
            address: data.businessAddress,
            city: data.businessCity,
            state: data.businessState,
            zip: data.businessZip,
            telephone: data.primaryPhone,
            businessEmail: data.businessEmail,
            federalTaxId: this.formatEIN(data.federalTaxId),
            dateBusinessStarted: this.formatDateUS(data.businessStartDate),
            entityType: data.entityType,
            typeOfBusiness: data.industryType,

            // Financials
            annualRevenue: data.annualRevenue,
            requestedAmount: data.requestedAmount,
            useOfFunds: data.useOfProceeds || 'Working Capital',

            // Owner 1
            ownerFirstName: data.ownerFirstName,
            ownerLastName: data.ownerLastName,
            ownerTitle: 'Owner',
            ownerAddress: data.ownerHomeAddress,
            ownerCity: data.ownerHomeCity,
            ownerState: data.ownerHomeState,
            ownerZip: data.ownerHomeZip,
            ownerEmail: data.ownerEmail,
            ownerSSN: this.formatSSN(data.ownerSSN),
            ownerDOB: this.formatDateUS(data.ownerDOB),
            ownershipPercentage: data.ownershipPercent,
            creditScore: data.creditScore || 'N/A',

            // Owner 2 (Partner)
            owner2FirstName: data.owner2FirstName || '',
            owner2LastName: data.owner2LastName || '',
            owner2Address: data.owner2HomeAddress || '',
            owner2City: data.owner2HomeCity || '',
            owner2State: data.owner2HomeState || '',
            owner2Zip: data.owner2HomeZip || '',
            owner2Email: data.owner2Email || '',
            owner2SSN: this.formatSSN(data.owner2SSN),
            owner2DOB: this.formatDateUS(data.owner2DOB),
            owner2Percentage: data.owner2OwnershipPercent || '',

            // Redundant keys for compatibility
            business_name: data.businessName,
            legal_name: data.businessName,
            phone: data.primaryPhone
        };
    }
}
