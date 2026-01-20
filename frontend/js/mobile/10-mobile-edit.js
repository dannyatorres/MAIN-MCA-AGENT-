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
