// 10-mobile-edit.js
Object.assign(window.MobileApp.prototype, {
    // ============ EDIT LEAD (Refactored & Enhanced) ============
    async loadEditForm() {
        const container = document.getElementById('editFormContainer');
        const actions = document.getElementById('editFormActions');

        if (!container || !this.currentConversationId) return;

        // Reset UI
        actions.style.display = 'none';
        container.innerHTML = `
            <div class="ai-loading-container">
                <div class="ai-thinking">
                    <div class="ai-dot"></div>
                    <div class="ai-dot"></div>
                    <div class="ai-dot"></div>
                </div>
                <p>Loading full lead details...</p>
            </div>
        `;

        try {
            // Fetch fresh data
            const data = await this.apiCall(`/api/conversations/${this.currentConversationId}`);
            const lead = data.conversation || data;

            // Render
            container.innerHTML = this.renderEditForm(lead);
            actions.style.display = 'flex';

            // Attach all the desktop-level logic
            this.setupEditFormListeners();
        } catch (err) {
            container.innerHTML = `
                <div class="ai-loading-container">
                    <p>Failed to load lead data</p>
                    <button class="btn-mobile-secondary" onclick="mobileApp.loadEditForm()">Retry</button>
                </div>
            `;
        }
    },

    renderEditForm(data) {
        // --- HELPER: Data Accessor (Matches Desktop Logic) ---
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

        const phone = (v) => this.utils.formatPhone(v);
        const currency = (v) => v ? '$' + Number(v).toLocaleString() : '';

        // --- HELPER: State Options ---
        const usStates = [
            'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
        ];
        const getStateOptions = (selected) => {
            const sel = (selected || '').toUpperCase();
            return `<option value="">State</option>` + usStates.map(s =>
                `<option value="${s}" ${s === sel ? 'selected' : ''}>${s}</option>`
            ).join('');
        };

        // --- RENDER FORM ---
        return `
            <form id="mobileEditForm" class="mobile-edit-form">

                <div class="mobile-form-section">
                    <div class="mobile-section-header" data-section="business">
                        <h4><i class="fas fa-building"></i> Business Profile</h4>
                        <i class="fas fa-chevron-down collapse-icon"></i>
                    </div>
                    <div class="mobile-section-content" id="section-business">
                        <div class="mobile-form-group">
                            <label>Legal Name *</label>
                            <input type="text" name="businessName" class="mobile-form-input" value="${this.utils.escapeHtml(val('business_name', 'businessName'))}" required>
                        </div>
                        <div class="mobile-form-group">
                            <label>DBA Name</label>
                            <input type="text" name="dbaName" class="mobile-form-input" value="${this.utils.escapeHtml(val('dba_name', 'dbaName'))}">
                        </div>

                        <div class="mobile-form-row col-2">
                            <div class="mobile-form-group">
                                <label>Primary Phone *</label>
                                <input type="tel" name="primaryPhone" class="mobile-form-input phone-format" value="${phone(val('lead_phone', 'phone', 'primaryPhone'))}" required>
                            </div>
                            <div class="mobile-form-group">
                                <label>Cell Phone</label>
                                <input type="tel" name="cellPhone" class="mobile-form-input phone-format" value="${phone(val('cell_phone', 'cellPhone'))}">
                            </div>
                        </div>

                        <div class="mobile-form-group">
                            <label>Email</label>
                            <input type="email" name="businessEmail" class="mobile-form-input" value="${val('email', 'business_email', 'businessEmail')}">
                        </div>

                        <div class="mobile-form-group">
                            <label>Address</label>
                            <input type="text" name="businessAddress" class="mobile-form-input" value="${this.utils.escapeHtml(val('business_address', 'address'))}">
                        </div>

                        <div class="mobile-form-row col-3">
                            <div class="mobile-form-group" style="flex: 2;">
                                <label>City</label>
                                <input type="text" name="businessCity" class="mobile-form-input" value="${this.utils.escapeHtml(val('city', 'business_city'))}">
                            </div>
                            <div class="mobile-form-group" style="flex: 1;">
                                <label>State</label>
                                <select name="businessState" class="mobile-form-select">
                                    ${getStateOptions(val('us_state', 'business_state', 'state'))}
                                </select>
                            </div>
                            <div class="mobile-form-group" style="flex: 1.5;">
                                <label>Zip</label>
                                <input type="text" name="businessZip" class="mobile-form-input" value="${val('zip', 'business_zip')}" maxlength="10">
                            </div>
                        </div>

                        <div class="mobile-form-row col-2">
                            <div class="mobile-form-group">
                                <label>Tax ID (EIN)</label>
                                <input type="text" name="federalTaxId" class="mobile-form-input ein-format" value="${val('tax_id', 'federal_tax_id')}" placeholder="XX-XXXXXXX" maxlength="10">
                            </div>
                            <div class="mobile-form-group">
                                <label>Entity Type</label>
                                <select name="entityType" class="mobile-form-select">
                                    <option value="">Select...</option>
                                    <option value="LLC" ${val('entity_type', 'entityType')==='LLC'?'selected':''}>LLC</option>
                                    <option value="Corporation" ${val('entity_type', 'entityType')==='Corporation'?'selected':''}>Corp</option>
                                    <option value="Sole Proprietorship" ${val('entity_type', 'entityType')==='Sole Proprietorship'?'selected':''}>Sole Prop</option>
                                </select>
                            </div>
                        </div>

                        <div class="mobile-form-row col-2">
                            <div class="mobile-form-group">
                                <label>Industry</label>
                                <input type="text" name="industryType" class="mobile-form-input" value="${this.utils.escapeHtml(val('industry', 'industry_type'))}">
                            </div>
                            <div class="mobile-form-group">
                                <label>Start Date</label>
                                <input type="date" name="businessStartDate" class="mobile-form-input" value="${dateVal('business_start_date', 'businessStartDate')}">
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mobile-form-section">
                    <div class="mobile-section-header" data-section="financials">
                        <h4><i class="fas fa-chart-line"></i> Financials</h4>
                        <i class="fas fa-chevron-down collapse-icon"></i>
                    </div>
                    <div class="mobile-section-content" id="section-financials">
                        <div class="mobile-form-row col-2">
                            <div class="mobile-form-group">
                                <label>Annual Rev</label>
                                <input type="text" name="annualRevenue" class="mobile-form-input money-input" value="${currency(val('annual_revenue', 'annualRevenue'))}">
                            </div>
                            <div class="mobile-form-group">
                                <label>Monthly Rev</label>
                                <input type="text" name="monthlyRevenue" class="mobile-form-input money-input" value="${currency(val('monthly_revenue', 'monthlyRevenue'))}">
                            </div>
                        </div>
                        <div class="mobile-form-row col-2">
                            <div class="mobile-form-group">
                                <label>Requested</label>
                                <input type="text" name="requestedAmount" class="mobile-form-input money-input" value="${currency(val('requested_amount', 'funding_amount'))}">
                            </div>
                            <div class="mobile-form-group">
                                <label>Credit Score</label>
                                <input type="number" name="creditScore" class="mobile-form-input" value="${val('credit_score', 'creditScore')}">
                            </div>
                        </div>
                        <div class="mobile-form-group">
                            <label>Funding Status</label>
                            <select name="fundingStatus" class="mobile-form-select">
                                <option value="" ${!val('funding_status') ? 'selected' : ''}>Select...</option>
                                <option value="none" ${val('funding_status') === 'none' ? 'selected' : ''}>No Funding</option>
                                <option value="1_position" ${val('funding_status') === '1_position' ? 'selected' : ''}>1 Position</option>
                                <option value="2_positions" ${val('funding_status') === '2_positions' ? 'selected' : ''}>2 Positions</option>
                                <option value="3_plus" ${val('funding_status') === '3_plus' ? 'selected' : ''}>3+ Positions</option>
                            </select>
                        </div>
                        <div class="mobile-form-group">
                            <label>Funding Details</label>
                            <input type="text" name="recentFunding" class="mobile-form-input" value="${val('recent_funding', 'recentFunding')}" placeholder="e.g. $50k last month">
                        </div>
                    </div>
                </div>

                <div class="mobile-form-section">
                    <div class="mobile-section-header" data-section="owner">
                        <h4><i class="fas fa-user-tie"></i> Owner 1</h4>
                        <i class="fas fa-chevron-down collapse-icon"></i>
                    </div>
                    <div class="mobile-section-content" id="section-owner">

                        <div class="mobile-toggle-row">
                            <span class="toggle-text">Use Business Address</span>
                            <label class="toggle-switch">
                                <input type="checkbox" id="copyAddr1">
                                <span class="slider round"></span>
                            </label>
                        </div>

                        <div class="mobile-form-row col-2">
                            <div class="mobile-form-group">
                                <label>First Name</label>
                                <input type="text" name="ownerFirstName" class="mobile-form-input" value="${this.utils.escapeHtml(val('first_name', 'owner_first_name'))}">
                            </div>
                            <div class="mobile-form-group">
                                <label>Last Name</label>
                                <input type="text" name="ownerLastName" class="mobile-form-input" value="${this.utils.escapeHtml(val('last_name', 'owner_last_name'))}">
                            </div>
                        </div>
                        <div class="mobile-form-group">
                            <label>Email</label>
                            <input type="email" name="ownerEmail" class="mobile-form-input" value="${val('owner_email', 'ownerEmail')}">
                        </div>
                        <div class="mobile-form-group">
                            <label>Mobile</label>
                            <input type="tel" name="ownerPhone" class="mobile-form-input phone-format" value="${phone(val('owner_phone', 'ownerPhone'))}">
                        </div>

                        <div class="mobile-form-row col-2">
                            <div class="mobile-form-group">
                                <label>SSN</label>
                                <input type="text" name="ownerSSN" class="mobile-form-input ssn-format" value="${val('ssn', 'ownerSSN')}" maxlength="11" placeholder="XXX-XX-XXXX">
                            </div>
                            <div class="mobile-form-group">
                                <label>DOB</label>
                                <input type="date" name="ownerDOB" class="mobile-form-input" value="${dateVal('date_of_birth', 'owner_dob')}">
                            </div>
                        </div>

                        <div class="mobile-form-group">
                            <label>Home Address</label>
                            <input type="text" name="ownerHomeAddress" class="mobile-form-input" value="${val('owner_address', 'owner_home_address')}">
                        </div>

                        <div class="mobile-form-row col-3">
                            <div class="mobile-form-group" style="flex:2;">
                                <label>City</label>
                                <input type="text" name="ownerHomeCity" class="mobile-form-input" value="${val('owner_city', 'owner_home_city')}">
                            </div>
                            <div class="mobile-form-group" style="flex:1;">
                                <label>State</label>
                                <select name="ownerHomeState" class="mobile-form-select">
                                    ${getStateOptions(val('owner_state', 'owner_home_state'))}
                                </select>
                            </div>
                            <div class="mobile-form-group" style="flex:1.5;">
                                <label>Zip</label>
                                <input type="text" name="ownerHomeZip" class="mobile-form-input" value="${val('owner_zip', 'owner_home_zip')}" maxlength="10">
                            </div>
                        </div>

                        <div class="mobile-form-group">
                            <label>Ownership %</label>
                            <input type="number" name="ownershipPercent" class="mobile-form-input" value="${val('owner_ownership_percent', 'ownership_percentage', 'ownership_percent', 'ownerOwnershipPercentage')}" max="100">
                        </div>
                    </div>
                </div>

                <div class="mobile-form-section">
                    <div class="mobile-section-header" data-section="partner">
                        <h4><i class="fas fa-users"></i> Partner</h4>

                        <div class="header-toggle-wrapper" onclick="event.stopPropagation()">
                            <label class="toggle-switch">
                                <input type="checkbox" id="hasPartner" ${val('owner2_first_name', 'owner2FirstName') ? 'checked' : ''}>
                                <span class="slider round"></span>
                            </label>
                        </div>
                    </div>

                    <div class="mobile-section-content ${val('owner2_first_name', 'owner2FirstName') ? '' : 'hidden-section'}" id="section-partner">
                         <div class="mobile-form-row col-2">
                            <div class="mobile-form-group">
                                <label>First Name</label>
                                <input type="text" name="owner2FirstName" class="mobile-form-input" value="${val('owner2_first_name', 'owner2FirstName')}">
                            </div>
                            <div class="mobile-form-group">
                                <label>Last Name</label>
                                <input type="text" name="owner2LastName" class="mobile-form-input" value="${val('owner2_last_name', 'owner2LastName')}">
                            </div>
                        </div>
                        <div class="mobile-form-group">
                            <label>Email</label>
                            <input type="email" name="owner2Email" class="mobile-form-input" value="${val('owner2_email', 'owner2Email')}">
                        </div>
                        <div class="mobile-form-group">
                            <label>Mobile</label>
                            <input type="tel" name="owner2Phone" class="mobile-form-input phone-format" value="${phone(val('owner2_phone', 'owner2Phone'))}">
                        </div>

                         <div class="mobile-form-row col-2">
                            <div class="mobile-form-group">
                                <label>SSN</label>
                                <input type="text" name="owner2SSN" class="mobile-form-input ssn-format" value="${val('owner2_ssn', 'owner2SSN')}" maxlength="11">
                            </div>
                            <div class="mobile-form-group">
                                <label>DOB</label>
                                <input type="date" name="owner2DOB" class="mobile-form-input" value="${dateVal('owner2_dob', 'owner2DOB')}">
                            </div>
                        </div>
                        <div class="mobile-form-group">
                            <label>Ownership %</label>
                            <input type="number" name="owner2OwnershipPercent" class="mobile-form-input" value="${val('owner2_ownership_percent', 'owner2OwnershipPercent')}" max="100">
                        </div>
                    </div>
                </div>

                <div class="mobile-form-section" style="background: transparent; border: none;">
                    <button type="button" id="generateAppBtn" class="btn-mobile-generate">
                        <i class="fas fa-file-pdf"></i> Generate App
                    </button>
                </div>

            </form>
        `;
    },

    setupEditFormListeners() {
        const form = document.getElementById('mobileEditForm');
        if (!form) return;

        // --- 1. ACCORDION LOGIC ---
        document.querySelectorAll('.mobile-section-header').forEach(header => {
            const newHeader = header.cloneNode(true);
            header.parentNode.replaceChild(newHeader, header);

            newHeader.addEventListener('click', (e) => {
                // Ignore clicks on toggles inside header
                if (e.target.closest('.toggle-switch')) return;

                const section = newHeader.dataset.section;
                const content = document.getElementById(`section-${section}`);
                if (content) {
                    content.classList.toggle('collapsed');
                    newHeader.classList.toggle('collapsed');
                }
            });
        });

        // --- 2. FORMATTERS ---
        // Phone
        form.querySelectorAll('.phone-format').forEach(input => {
            input.addEventListener('input', (e) => e.target.value = this.utils.formatPhone(e.target.value));
        });

        // Currency
        form.querySelectorAll('.money-input').forEach(input => {
            input.addEventListener('blur', (e) => {
                const num = e.target.value.replace(/[^0-9.]/g, '');
                if (num) e.target.value = '$' + Number(num).toLocaleString();
            });
        });

        // EIN
        form.querySelectorAll('.ein-format').forEach(input => {
            input.addEventListener('input', (e) => {
                let v = e.target.value.replace(/\D/g, '');
                if (v.length > 9) v = v.slice(0,9);
                if (v.length > 2) v = v.slice(0,2) + '-' + v.slice(2);
                e.target.value = v;
            });
        });

        // SSN
        form.querySelectorAll('.ssn-format').forEach(input => {
            input.addEventListener('input', (e) => {
                let v = e.target.value.replace(/\D/g, '');
                if (v.length > 9) v = v.slice(0,9);
                if (v.length > 5) v = v.slice(0,3) + '-' + v.slice(3,5) + '-' + v.slice(5);
                else if (v.length > 3) v = v.slice(0,3) + '-' + v.slice(3);
                e.target.value = v;
            });
        });

        // --- 3. ZIP CODE LOOKUP (Auto-fill) ---
        const lookupZip = async (zipCode, cityInput, stateSelect) => {
            if (!zipCode || zipCode.length < 5) return;
            try {
                const response = await fetch(`https://api.zippopotam.us/us/${zipCode.slice(0,5)}`);
                if (!response.ok) return;
                const data = await response.json();
                if (data.places && data.places[0]) {
                    if (cityInput) cityInput.value = data.places[0]['place name'];
                    if (stateSelect) stateSelect.value = data.places[0]['state abbreviation'];
                }
            } catch (e) { console.warn('Zip lookup failed', e); }
        };

        const attachZipListener = (zipName, cityName, stateName) => {
            const zip = form.querySelector(`[name="${zipName}"]`);
            const city = form.querySelector(`[name="${cityName}"]`);
            const state = form.querySelector(`[name="${stateName}"]`);
            if (zip) zip.addEventListener('blur', () => lookupZip(zip.value, city, state));
        };

        attachZipListener('businessZip', 'businessCity', 'businessState');
        attachZipListener('ownerHomeZip', 'ownerHomeCity', 'ownerHomeState');

        // --- 4. TOGGLES ---
        // Partner Section
        const partnerCheck = document.getElementById('hasPartner');
        const partnerSection = document.getElementById('section-partner');
        if (partnerCheck && partnerSection) {
            partnerCheck.addEventListener('change', (e) => {
                partnerSection.classList.toggle('hidden-section', !e.target.checked);
                // Also expand the section if unchecked -> checked
                if (e.target.checked) partnerSection.classList.remove('collapsed');
            });
        }

        // Copy Address
        const copyBtn = document.getElementById('copyAddr1');
        if (copyBtn) {
            copyBtn.addEventListener('change', (e) => {
                if (e.target.checked) {
                    form.querySelector('[name="ownerHomeAddress"]').value = form.querySelector('[name="businessAddress"]').value;
                    form.querySelector('[name="ownerHomeCity"]').value = form.querySelector('[name="businessCity"]').value;
                    form.querySelector('[name="ownerHomeState"]').value = form.querySelector('[name="businessState"]').value;
                    form.querySelector('[name="ownerHomeZip"]').value = form.querySelector('[name="businessZip"]').value;
                }
            });
        }

        // --- 5. BUTTONS (Save/Cancel) ---
        const cancelBtn = document.getElementById('editCancelBtn');
        if (cancelBtn) {
            const newCancel = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
            newCancel.addEventListener('click', () => this.closeIntelView());
        }

        const saveBtn = document.getElementById('editSaveBtn');
        if (saveBtn) {
            const newSave = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSave, saveBtn);
            newSave.addEventListener('click', () => this.saveEditForm());
        }

        const generateBtn = document.getElementById('generateAppBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generatePDF());
        }
    },

    async generatePDF() {
        const form = document.getElementById('mobileEditForm');
        if (!form || !this.currentConversationId) {
            alert('No form or conversation');
            return;
        }

        const btn = document.getElementById('generateAppBtn');
        const originalText = btn?.innerHTML || '';
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
            btn.disabled = true;
        }

        try {
            const formData = new FormData(form);
            const data = {};
            formData.forEach((value, key) => {
                if (['annualRevenue', 'monthlyRevenue', 'requestedAmount'].includes(key)) {
                    data[key] = String(value).replace(/[^0-9.]/g, '');
                } else if (['primaryPhone', 'cellPhone', 'ownerPhone', 'owner2Phone'].includes(key)) {
                    data[key] = String(value).replace(/\D/g, '');
                } else {
                    data[key] = value;
                }
            });

            const pdfData = {
                legalName: data.businessName,
                dba: data.dbaName,
                address: data.businessAddress,
                city: data.businessCity,
                state: data.businessState,
                zip: data.businessZip,
                telephone: data.primaryPhone,
                businessEmail: data.businessEmail,
                federalTaxId: data.federalTaxId,
                dateBusinessStarted: data.businessStartDate,
                entityType: data.entityType,
                typeOfBusiness: data.industryType,
                annualRevenue: data.annualRevenue,
                requestedAmount: data.requestedAmount,
                useOfFunds: data.useOfProceeds || 'Working Capital',
                ownerFirstName: data.ownerFirstName,
                ownerLastName: data.ownerLastName,
                ownerTitle: 'Owner',
                ownerAddress: data.ownerHomeAddress,
                ownerCity: data.ownerHomeCity,
                ownerState: data.ownerHomeState,
                ownerZip: data.ownerHomeZip,
                ownerEmail: data.ownerEmail,
                ownerSSN: data.ownerSSN,
                ownerDOB: data.ownerDOB,
                ownershipPercentage: data.ownershipPercent,
                creditScore: data.creditScore || 'N/A',
                owner2FirstName: data.owner2FirstName || '',
                owner2LastName: data.owner2LastName || '',
                owner2Address: data.owner2HomeAddress || '',
                owner2City: data.owner2HomeCity || '',
                owner2State: data.owner2HomeState || '',
                owner2Zip: data.owner2HomeZip || '',
                owner2Email: data.owner2Email || '',
                owner2SSN: data.owner2SSN || '',
                owner2DOB: data.owner2DOB || '',
                owner2Percentage: data.owner2OwnershipPercent || '',
                business_name: data.businessName,
                phone: data.primaryPhone
            };

            const ownerName = `${data.ownerFirstName || ''} ${data.ownerLastName || ''}`.trim();

            const result = await this.apiCall(`/api/conversations/${this.currentConversationId}/generate-pdf-document`, {
                method: 'POST',
                body: JSON.stringify({
                    applicationData: pdfData,
                    ownerName
                })
            });

            if (result.success) {
                this.showToast('Application PDF Generated!', 'success');
                this.closeIntelView();
                this.openIntelView('documents');
            } else {
                throw new Error(result.error || 'Failed to generate PDF');
            }
        } catch (err) {
            console.error('PDF Generation Error:', err);
            this.showToast('Failed to generate PDF', 'error');
        } finally {
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }
    },

    // ============ CREATE NEW LEAD ============
    openCreateLeadForm() {
        // Remove existing modal if any
        document.getElementById('createLeadModal')?.remove();

        const modalHTML = `
            <div id="createLeadModal" class="create-lead-modal">
                <header class="mobile-header">
                    <button class="back-btn" id="closeCreateLeadBtn">
                        <i class="fas fa-times"></i>
                    </button>
                    <h2>New Lead</h2>
                    <div style="width: 40px;"></div>
                </header>
                <div class="edit-form-scroll" id="createFormContainer">
                    ${this.renderCreateForm()}
                </div>
                <div class="edit-form-actions" id="createFormActions">
                    <button class="btn-mobile-secondary" id="createCancelBtn">Cancel</button>
                    <button class="btn-mobile-primary" id="createSaveBtn">Create Lead</button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.setupCreateFormListeners();
    },

    renderCreateForm() {
        const usStates = [
            'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
        ];
        const getStateOptions = () => {
            return `<option value="">State</option>` + usStates.map(s =>
                `<option value="${s}">${s}</option>`
            ).join('');
        };

        return `
            <form id="mobileCreateForm" class="mobile-edit-form">

                <!-- BUSINESS PROFILE -->
                <div class="mobile-form-section">
                    <div class="mobile-section-header" data-section="business">
                        <h4><i class="fas fa-building"></i> Business Profile</h4>
                        <i class="fas fa-chevron-down collapse-icon"></i>
                    </div>
                    <div class="mobile-section-content" id="section-business">
                        <div class="mobile-form-group">
                            <label>Legal Name *</label>
                            <input type="text" name="businessName" class="mobile-form-input" required placeholder="Business legal name">
                        </div>
                        <div class="mobile-form-group">
                            <label>DBA Name</label>
                            <input type="text" name="dbaName" class="mobile-form-input" placeholder="Doing business as">
                        </div>

                        <div class="mobile-form-row col-2">
                            <div class="mobile-form-group">
                                <label>Primary Phone *</label>
                                <input type="tel" name="primaryPhone" class="mobile-form-input phone-format" required placeholder="(555) 555-5555">
                            </div>
                            <div class="mobile-form-group">
                                <label>Cell Phone</label>
                                <input type="tel" name="cellPhone" class="mobile-form-input phone-format" placeholder="(555) 555-5555">
                            </div>
                        </div>

                        <div class="mobile-form-group">
                            <label>Email</label>
                            <input type="email" name="businessEmail" class="mobile-form-input" placeholder="email@company.com">
                        </div>

                        <div class="mobile-form-group">
                            <label>Address</label>
                            <input type="text" name="businessAddress" class="mobile-form-input" placeholder="Street address">
                        </div>

                        <div class="mobile-form-row col-3">
                            <div class="mobile-form-group" style="flex: 2;">
                                <label>City</label>
                                <input type="text" name="businessCity" class="mobile-form-input">
                            </div>
                            <div class="mobile-form-group" style="flex: 1;">
                                <label>State</label>
                                <select name="businessState" class="mobile-form-select">
                                    ${getStateOptions()}
                                </select>
                            </div>
                            <div class="mobile-form-group" style="flex: 1.5;">
                                <label>Zip</label>
                                <input type="text" name="businessZip" class="mobile-form-input" maxlength="10">
                            </div>
                        </div>

                        <div class="mobile-form-row col-2">
                            <div class="mobile-form-group">
                                <label>Tax ID (EIN)</label>
                                <input type="text" name="federalTaxId" class="mobile-form-input ein-format" placeholder="XX-XXXXXXX" maxlength="10">
                            </div>
                            <div class="mobile-form-group">
                                <label>Entity Type</label>
                                <select name="entityType" class="mobile-form-select">
                                    <option value="">Select...</option>
                                    <option value="LLC">LLC</option>
                                    <option value="Corporation">Corp</option>
                                    <option value="Sole Proprietorship">Sole Prop</option>
                                    <option value="Partnership">Partnership</option>
                                </select>
                            </div>
                        </div>

                        <div class="mobile-form-row col-2">
                            <div class="mobile-form-group">
                                <label>Industry</label>
                                <input type="text" name="industryType" class="mobile-form-input" placeholder="e.g., Restaurant">
                            </div>
                            <div class="mobile-form-group">
                                <label>Start Date</label>
                                <input type="date" name="businessStartDate" class="mobile-form-input">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- FINANCIALS -->
                <div class="mobile-form-section">
                    <div class="mobile-section-header" data-section="financials">
                        <h4><i class="fas fa-chart-line"></i> Financials</h4>
                        <i class="fas fa-chevron-down collapse-icon"></i>
                    </div>
                    <div class="mobile-section-content" id="section-financials">
                        <div class="mobile-form-row col-2">
                            <div class="mobile-form-group">
                                <label>Annual Revenue</label>
                                <input type="text" name="annualRevenue" class="mobile-form-input money-input" placeholder="$0">
                            </div>
                            <div class="mobile-form-group">
                                <label>Monthly Revenue</label>
                                <input type="text" name="monthlyRevenue" class="mobile-form-input money-input" placeholder="$0">
                            </div>
                        </div>

                        <div class="mobile-form-row col-2">
                            <div class="mobile-form-group">
                                <label>Requested Amount</label>
                                <input type="text" name="requestedAmount" class="mobile-form-input money-input" placeholder="$0">
                            </div>
                            <div class="mobile-form-group">
                                <label>Use of Funds</label>
                                <input type="text" name="useOfProceeds" class="mobile-form-input" placeholder="Working Capital">
                            </div>
                        </div>

                        <div class="mobile-form-row col-2">
                            <div class="mobile-form-group">
                                <label>Credit Score</label>
                                <input type="text" name="creditScore" class="mobile-form-input" placeholder="e.g., 650">
                            </div>
                            <div class="mobile-form-group">
                                <label>Funding Status</label>
                                <select name="fundingStatus" class="mobile-form-select">
                                    <option value="">-- Select --</option>
                                    <option value="none">No Funding</option>
                                    <option value="1_position">1 Position</option>
                                    <option value="2_positions">2 Positions</option>
                                    <option value="3_plus">3+ Positions</option>
                                </select>
                            </div>
                        </div>

                        <div class="mobile-form-group">
                            <label>Funding Details</label>
                            <input type="text" name="recentFunding" class="mobile-form-input" placeholder="e.g., $50k last month from XYZ">
                        </div>
                    </div>
                </div>

                <!-- OWNER 1 -->
                <div class="mobile-form-section">
                    <div class="mobile-section-header" data-section="owner1">
                        <h4><i class="fas fa-user-tie"></i> Owner 1</h4>
                        <i class="fas fa-chevron-down collapse-icon"></i>
                    </div>
                    <div class="mobile-section-content" id="section-owner1">
                        
                        <!-- Same Address Toggle -->
                        <div class="mobile-toggle-row">
                            <span class="toggle-text">Same as Business Address</span>
                            <label class="toggle-switch">
                                <input type="checkbox" id="createCopyAddr1">
                                <span class="slider round"></span>
                            </label>
                        </div>

                        <div class="mobile-form-row col-2">
                            <div class="mobile-form-group">
                                <label>First Name</label>
                                <input type="text" name="ownerFirstName" class="mobile-form-input">
                            </div>
                            <div class="mobile-form-group">
                                <label>Last Name</label>
                                <input type="text" name="ownerLastName" class="mobile-form-input">
                            </div>
                        </div>

                        <div class="mobile-form-row col-2">
                            <div class="mobile-form-group">
                                <label>Email</label>
                                <input type="email" name="ownerEmail" class="mobile-form-input">
                            </div>
                            <div class="mobile-form-group">
                                <label>Mobile</label>
                                <input type="tel" name="ownerPhone" class="mobile-form-input phone-format">
                            </div>
                        </div>

                        <div class="mobile-form-row col-3">
                            <div class="mobile-form-group">
                                <label>SSN</label>
                                <input type="text" name="ownerSSN" class="mobile-form-input ssn-format" placeholder="XXX-XX-XXXX" maxlength="11">
                            </div>
                            <div class="mobile-form-group">
                                <label>DOB</label>
                                <input type="date" name="ownerDOB" class="mobile-form-input">
                            </div>
                            <div class="mobile-form-group">
                                <label>Ownership %</label>
                                <input type="number" name="ownershipPercent" class="mobile-form-input" max="100" placeholder="100">
                            </div>
                        </div>

                        <div class="mobile-form-group">
                            <label>Home Address</label>
                            <input type="text" name="ownerHomeAddress" class="mobile-form-input">
                        </div>

                        <div class="mobile-form-row col-3">
                            <div class="mobile-form-group" style="flex: 2;">
                                <label>City</label>
                                <input type="text" name="ownerHomeCity" class="mobile-form-input">
                            </div>
                            <div class="mobile-form-group" style="flex: 1;">
                                <label>State</label>
                                <select name="ownerHomeState" class="mobile-form-select">
                                    ${getStateOptions()}
                                </select>
                            </div>
                            <div class="mobile-form-group" style="flex: 1.5;">
                                <label>Zip</label>
                                <input type="text" name="ownerHomeZip" class="mobile-form-input" maxlength="10">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- OWNER 2 / PARTNER -->
                <div class="mobile-form-section">
                    <div class="mobile-section-header" data-section="owner2">
                        <h4><i class="fas fa-users"></i> Partner / Owner 2</h4>
                        <i class="fas fa-chevron-down collapse-icon"></i>
                    </div>
                    <div class="mobile-section-content collapsed" id="section-owner2">
                        
                        <!-- Has Partner Toggle -->
                        <div class="mobile-toggle-row">
                            <span class="toggle-text">Has Partner / Co-Owner</span>
                            <label class="toggle-switch">
                                <input type="checkbox" id="createHasPartner">
                                <span class="slider round"></span>
                            </label>
                        </div>

                        <div id="createPartnerFields" class="hidden-section">
                            <div class="mobile-form-row col-2">
                                <div class="mobile-form-group">
                                    <label>First Name</label>
                                    <input type="text" name="owner2FirstName" class="mobile-form-input">
                                </div>
                                <div class="mobile-form-group">
                                    <label>Last Name</label>
                                    <input type="text" name="owner2LastName" class="mobile-form-input">
                                </div>
                            </div>

                            <div class="mobile-form-row col-2">
                                <div class="mobile-form-group">
                                    <label>Email</label>
                                    <input type="email" name="owner2Email" class="mobile-form-input">
                                </div>
                                <div class="mobile-form-group">
                                    <label>Mobile</label>
                                    <input type="tel" name="owner2Phone" class="mobile-form-input phone-format">
                                </div>
                            </div>

                            <div class="mobile-form-row col-3">
                                <div class="mobile-form-group">
                                    <label>SSN</label>
                                    <input type="text" name="owner2SSN" class="mobile-form-input ssn-format" placeholder="XXX-XX-XXXX" maxlength="11">
                                </div>
                                <div class="mobile-form-group">
                                    <label>DOB</label>
                                    <input type="date" name="owner2DOB" class="mobile-form-input">
                                </div>
                                <div class="mobile-form-group">
                                    <label>Ownership %</label>
                                    <input type="number" name="owner2OwnershipPercent" class="mobile-form-input" max="100">
                                </div>
                            </div>

                            <div class="mobile-form-group">
                                <label>Home Address</label>
                                <input type="text" name="owner2HomeAddress" class="mobile-form-input">
                            </div>

                            <div class="mobile-form-row col-3">
                                <div class="mobile-form-group" style="flex: 2;">
                                    <label>City</label>
                                    <input type="text" name="owner2HomeCity" class="mobile-form-input">
                                </div>
                                <div class="mobile-form-group" style="flex: 1;">
                                    <label>State</label>
                                    <select name="owner2HomeState" class="mobile-form-select">
                                        ${getStateOptions()}
                                    </select>
                                </div>
                                <div class="mobile-form-group" style="flex: 1.5;">
                                    <label>Zip</label>
                                    <input type="text" name="owner2HomeZip" class="mobile-form-input" maxlength="10">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </form>
        `;
    },

    setupCreateFormListeners() {
        const form = document.getElementById('mobileCreateForm');
        if (!form) return;

        // --- Accordion toggles ---
        form.querySelectorAll('.mobile-section-header').forEach(header => {
            header.addEventListener('click', () => {
                header.classList.toggle('collapsed');
                const content = header.nextElementSibling;
                content?.classList.toggle('collapsed');
            });
        });

        // --- Phone formatting (XXX) XXX-XXXX ---
        form.querySelectorAll('.phone-format').forEach(input => {
            input.addEventListener('input', (e) => {
                e.target.value = this.utils.formatPhone(e.target.value);
            });
        });

        // --- Money formatting $X,XXX ---
        form.querySelectorAll('.money-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                e.target.value = raw ? '$' + Number(raw).toLocaleString() : '';
            });
        });

        // --- SSN formatting XXX-XX-XXXX ---
        form.querySelectorAll('.ssn-format').forEach(input => {
            input.addEventListener('input', (e) => {
                let digits = e.target.value.replace(/\D/g, '').slice(0, 9);
                if (digits.length >= 6) {
                    e.target.value = `${digits.slice(0,3)}-${digits.slice(3,5)}-${digits.slice(5)}`;
                } else if (digits.length >= 4) {
                    e.target.value = `${digits.slice(0,3)}-${digits.slice(3)}`;
                } else {
                    e.target.value = digits;
                }
            });
        });

        // --- EIN formatting XX-XXXXXXX ---
        form.querySelectorAll('.ein-format').forEach(input => {
            input.addEventListener('input', (e) => {
                let digits = e.target.value.replace(/\D/g, '').slice(0, 9);
                if (digits.length > 2) {
                    e.target.value = `${digits.slice(0,2)}-${digits.slice(2)}`;
                } else {
                    e.target.value = digits;
                }
            });
        });

        // --- Copy Business Address to Owner 1 ---
        const copyAddrToggle = document.getElementById('createCopyAddr1');
        if (copyAddrToggle) {
            copyAddrToggle.addEventListener('change', (e) => {
                if (e.target.checked) {
                    form.querySelector('[name="ownerHomeAddress"]').value = form.querySelector('[name="businessAddress"]').value;
                    form.querySelector('[name="ownerHomeCity"]').value = form.querySelector('[name="businessCity"]').value;
                    form.querySelector('[name="ownerHomeState"]').value = form.querySelector('[name="businessState"]').value;
                    form.querySelector('[name="ownerHomeZip"]').value = form.querySelector('[name="businessZip"]').value;
                }
            });
        }

        // --- Partner Toggle (Show/Hide Owner 2 Fields) ---
        const hasPartnerToggle = document.getElementById('createHasPartner');
        const partnerFields = document.getElementById('createPartnerFields');
        if (hasPartnerToggle && partnerFields) {
            hasPartnerToggle.addEventListener('change', (e) => {
                partnerFields.classList.toggle('hidden-section', !e.target.checked);
            });
        }

        // --- ZIP Auto-fill for Business ---
        const businessZip = form.querySelector('[name="businessZip"]');
        if (businessZip) {
            businessZip.addEventListener('blur', () => this.lookupZipAndFill(
                businessZip.value,
                form.querySelector('[name="businessCity"]'),
                form.querySelector('[name="businessState"]')
            ));
        }

        // --- ZIP Auto-fill for Owner 1 ---
        const ownerZip = form.querySelector('[name="ownerHomeZip"]');
        if (ownerZip) {
            ownerZip.addEventListener('blur', () => this.lookupZipAndFill(
                ownerZip.value,
                form.querySelector('[name="ownerHomeCity"]'),
                form.querySelector('[name="ownerHomeState"]')
            ));
        }

        // --- ZIP Auto-fill for Owner 2 ---
        const owner2Zip = form.querySelector('[name="owner2HomeZip"]');
        if (owner2Zip) {
            owner2Zip.addEventListener('blur', () => this.lookupZipAndFill(
                owner2Zip.value,
                form.querySelector('[name="owner2HomeCity"]'),
                form.querySelector('[name="owner2HomeState"]')
            ));
        }

        // --- Close / Cancel / Save buttons ---
        document.getElementById('closeCreateLeadBtn')?.addEventListener('click', () => {
            this.closeCreateLeadForm();
        });

        document.getElementById('createCancelBtn')?.addEventListener('click', () => {
            this.closeCreateLeadForm();
        });

        document.getElementById('createSaveBtn')?.addEventListener('click', () => {
            this.submitCreateForm();
        });
    },

    // Helper for ZIP lookup (reusable)
    async lookupZipAndFill(zipValue, cityInput, stateSelect) {
        const zip = (zipValue || '').replace(/\D/g, '').slice(0, 5);
        if (zip.length !== 5) return;
        
        try {
            const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
            if (!res.ok) return;
            const data = await res.json();
            if (data.places?.[0]) {
                if (cityInput) cityInput.value = data.places[0]['place name'];
                if (stateSelect) stateSelect.value = data.places[0]['state abbreviation'];
            }
        } catch (e) {
            // ignore
        }
    },

    closeCreateLeadForm() {
        document.getElementById('createLeadModal')?.remove();
    },

    async submitCreateForm() {
        const form = document.getElementById('mobileCreateForm');
        if (!form) return;

        // Basic validation
        const businessName = form.querySelector('[name="businessName"]')?.value?.trim();
        const primaryPhone = form.querySelector('[name="primaryPhone"]')?.value?.trim();

        if (!businessName) {
            this.showToast('Business name is required', 'error');
            return;
        }
        if (!primaryPhone) {
            this.showToast('Primary phone is required', 'error');
            return;
        }

        const saveBtn = document.getElementById('createSaveBtn');
        saveBtn.textContent = 'Creating...';
        saveBtn.disabled = true;

        const formData = new FormData(form);
        const data = {};

        formData.forEach((value, key) => {
            // Strip money formatting
            if (['annualRevenue', 'monthlyRevenue', 'requestedAmount'].includes(key)) {
                data[key] = String(value).replace(/[^0-9.]/g, '');
            }
            // Strip phone formatting
            else if (['primaryPhone', 'cellPhone', 'ownerPhone', 'owner2Phone'].includes(key)) {
                data[key] = String(value).replace(/\D/g, '');
            }
            // Keep SSN/EIN as-is (formatted) or strip if needed
            else {
                data[key] = value;
            }
        });

        // Get current user for assignment
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        const isAgent = currentUser.role === 'agent';

        // Map to API field names (matches desktop prepareForCreate)
        const apiData = {
            business_name: data.businessName,
            dba_name: data.dbaName,
            lead_phone: data.primaryPhone,
            cell_phone: data.cellPhone,
            email: data.businessEmail,
            business_address: data.businessAddress,
            city: data.businessCity,
            us_state: data.businessState,
            zip: data.businessZip,
            tax_id: data.federalTaxId,
            entity_type: data.entityType,
            industry_type: data.industryType,
            business_start_date: data.businessStartDate,
            
            annual_revenue: data.annualRevenue,
            monthly_revenue: data.monthlyRevenue,
            funding_amount: data.requestedAmount,
            use_of_proceeds: data.useOfProceeds,
            credit_score: data.creditScore,
            funding_status: data.fundingStatus,
            recent_funding: data.recentFunding,
            
            // Owner 1
            first_name: data.ownerFirstName,
            last_name: data.ownerLastName,
            owner_email: data.ownerEmail,
            owner_phone: data.ownerPhone,
            ssn: data.ownerSSN,
            date_of_birth: data.ownerDOB,
            ownership_percent: data.ownershipPercent,
            owner_address: data.ownerHomeAddress,
            owner_city: data.ownerHomeCity,
            owner_state: data.ownerHomeState,
            owner_zip: data.ownerHomeZip,
            
            // Owner 2
            owner2_first_name: data.owner2FirstName,
            owner2_last_name: data.owner2LastName,
            owner2_email: data.owner2Email,
            owner2_phone: data.owner2Phone,
            owner2_ssn: data.owner2SSN,
            owner2_dob: data.owner2DOB,
            owner2_ownership_percent: data.owner2OwnershipPercent,
            owner2_address: data.owner2HomeAddress,
            owner2_city: data.owner2HomeCity,
            owner2_state: data.owner2HomeState,
            owner2_zip: data.owner2HomeZip,

            // Assignment: Agents auto-assign to themselves
            assigned_user_id: isAgent ? currentUser.id : null,
            assigned_user_name: isAgent ? currentUser.name : null,
            
            // Spread remaining data for any fields we missed
            ...data
        };

        try {
            const res = await this.apiCall('/api/conversations', {
                method: 'POST',
                body: JSON.stringify(apiData)
            });

            if (res.success) {
                this.showToast('Lead created!', 'success');
                this.closeCreateLeadForm();

                const newConv = res.conversation;

                if (newConv?.id) {
                    const id = String(newConv.id);
                    const sessionUser = JSON.parse(localStorage.getItem('user') || '{}');

                    // 1. Set last_activity to NOW so it sorts to top
                    newConv.last_activity = new Date().toISOString();
                    newConv.created_at = newConv.created_at || new Date().toISOString();
                    newConv.unread_count = 0;

                    // Ensure assignment fields for badge display
                    if (!newConv.assigned_user_name && sessionUser.role === 'agent') {
                        newConv.assigned_user_id = sessionUser.id;
                        newConv.assigned_user_name = sessionUser.name;
                    }

                    // 2. Add to local Map FIRST
                    this.conversations.set(id, newConv);

                    // 3. Re-render list (new lead will now appear at top due to sorting)
                    this.renderConversationList();

                    // 4. Select and navigate to the new lead
                    this.selectConversation(id);

                } else {
                    // Fallback: full reload if API didn't return the conversation
                    await this.loadConversations('', true);
                }
            } else {
                throw new Error(res.error || 'Failed to create lead');
            }
        } catch (err) {
            console.error('Create lead error:', err);
            this.showToast('Failed to create lead', 'error');
        } finally {
            saveBtn.textContent = 'Create Lead';
            saveBtn.disabled = false;
        }
    },

    async saveEditForm() {
        const form = document.getElementById('mobileEditForm');
        if (!form) return;

        const saveBtn = document.getElementById('editSaveBtn');
        saveBtn.textContent = 'Saving...';
        saveBtn.disabled = true;

        const formData = new FormData(form);
        const data = {};

        formData.forEach((value, key) => {
            // Strip formatting
            if (['annualRevenue', 'monthlyRevenue', 'requestedAmount'].includes(key)) {
                data[key] = value.replace(/[^0-9.]/g, '');
            } else if (['primaryPhone', 'cellPhone', 'ownerPhone', 'owner2Phone'].includes(key)) {
                data[key] = value.replace(/\D/g, '');
            } else {
                data[key] = value;
            }
        });

        // Mapping for API compatibility
        data.lead_phone = data.primaryPhone;
        data.email = data.businessEmail;
        data.us_state = data.businessState;

        try {
            const res = await this.apiCall(`/api/conversations/${this.currentConversationId}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });

            if (res.success) {
                this.showToast('Lead updated!', 'success');
                if (res.conversation) {
                    this.conversations.set(this.currentConversationId, res.conversation);
                    this.selectedConversation = res.conversation;
                }
                this.closeIntelView();
                this.renderConversationList();
            } else {
                throw new Error(res.error || 'Save failed');
            }
        } catch (err) {
            this.showToast('Failed to save', 'error');
        } finally {
            saveBtn.textContent = 'Save Changes';
            saveBtn.disabled = false;
        }
    }
});
