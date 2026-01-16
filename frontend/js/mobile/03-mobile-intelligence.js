// 03-mobile-intelligence.js
Object.assign(window.MobileApp.prototype, {
        // ============ INTELLIGENCE HUB ============
        setupIntelligenceListeners() {
            document.getElementById('intelligenceCards').addEventListener('click', (e) => {
                const card = e.target.closest('.intel-card');
                if (card) {
                    const intelType = card.dataset.intel;
                    this.openIntelView(intelType);
                }
            });

            const aiInput = document.getElementById('mobileAiInput');
            const aiSend = document.getElementById('mobileAiSend');

            if (aiInput && aiSend) {
                aiSend.addEventListener('click', () => this.sendAiMessage());
                aiInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        this.sendAiMessage();
                    }
                });
                aiInput.addEventListener('input', () => {
                    aiInput.style.height = 'auto';
                    aiInput.style.height = Math.min(aiInput.scrollHeight, 100) + 'px';
                });
            }
        },

        openIntelView(type) {
            this.currentIntelView = type;

            document.getElementById('intelligenceCards').classList.add('hidden');

            const titles = {
                ai: 'AI Assistant',
                edit: 'Edit Lead',
                lenders: 'Lenders',
                fcs: 'FCS Report',
                strategy: 'Strategy'
            };
            document.getElementById('detailsTitle').textContent = titles[type] || 'Intelligence';

            if (type === 'ai') {
                document.getElementById('aiAssistantView').classList.remove('hidden');
                this.loadAiChat();
            } else if (type === 'edit') {
                document.getElementById('editView').classList.remove('hidden');
                this.loadEditForm();
            } else if (type === 'lenders') {
                document.getElementById('lendersView').classList.remove('hidden');
                this.loadLendersView();
            } else if (type === 'documents') {
                document.getElementById('documentsView').classList.remove('hidden');
                this.loadDocumentsView();
            } else if (type === 'fcs') {
                document.getElementById('fcsView').classList.remove('hidden');
                this.loadFcsView();
            } else if (type === 'strategy') {
                document.getElementById('strategyView').classList.remove('hidden');
                this.loadStrategyView();
            }
        },

        closeIntelView() {
            this.currentIntelView = null;

            document.querySelectorAll('.intel-view').forEach(v => v.classList.add('hidden'));

            document.getElementById('intelligenceCards').classList.remove('hidden');
            document.getElementById('detailsTitle').textContent = 'Intelligence';
        },


        // ============ EDIT LEAD ============
        async loadEditForm() {
            const container = document.getElementById('editFormContainer');
            const actions = document.getElementById('editFormActions');

            if (!container || !this.currentConversationId) return;

            actions.style.display = 'none';
            container.innerHTML = `
                <div class="ai-loading-container">
                    <div class="ai-thinking">
                        <div class="ai-dot"></div>
                        <div class="ai-dot"></div>
                        <div class="ai-dot"></div>
                    </div>
                    <p>Loading lead data...</p>
                </div>
            `;

            try {
                const data = await this.apiCall(`/api/conversations/${this.currentConversationId}`);
                const lead = data.conversation || data;

                container.innerHTML = this.renderEditForm(lead);
                actions.style.display = 'flex';

                this.setupEditFormListeners();
            } catch (err) {
                container.innerHTML = `
                    <div class="ai-loading-container">
                        <p>Failed to load lead data</p>
                    </div>
                `;
            }
        },

        renderEditForm(lead) {
            const val = (key) => lead[key] || '';
            const phone = (key) => this.utils.formatPhone(lead[key] || '');
            const currency = (num) => {
                if (!num) return '';
                return '$' + Number(num).toLocaleString();
            };

            const states = [
                '', 'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
                'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
                'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
                'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
                'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
            ];
            const stateOptions = states.map(s =>
                `<option value="${s}" ${val('us_state') === s ? 'selected' : ''}>${s || 'State'}</option>`
            ).join('');

            return `
                <form id="mobileEditForm">
                    <div class="mobile-form-section">
                        <div class="mobile-section-header" data-section="business">
                            <h4><i class="fas fa-building"></i> Business</h4>
                            <i class="fas fa-chevron-down collapse-icon"></i>
                        </div>
                        <div class="mobile-section-content" id="section-business">
                            <div class="mobile-form-group">
                                <label>Business Name *</label>
                                <input type="text" name="businessName" class="mobile-form-input" value="${this.utils.escapeHtml(val('business_name'))}" required>
                            </div>
                            <div class="mobile-form-group">
                                <label>DBA Name</label>
                                <input type="text" name="dbaName" class="mobile-form-input" value="${this.utils.escapeHtml(val('dba_name'))}">
                            </div>
                            <div class="mobile-form-group">
                                <label>Phone *</label>
                                <input type="tel" name="primaryPhone" class="mobile-form-input" value="${phone('lead_phone')}" required>
                            </div>
                            <div class="mobile-form-group">
                                <label>Email</label>
                                <input type="email" name="businessEmail" class="mobile-form-input" value="${val('email')}">
                            </div>
                            <div class="mobile-form-group">
                                <label>Address</label>
                                <input type="text" name="businessAddress" class="mobile-form-input" value="${this.utils.escapeHtml(val('business_address'))}">
                            </div>
                            <div class="mobile-form-row col-3">
                                <div class="mobile-form-group">
                                    <label>City</label>
                                    <input type="text" name="businessCity" class="mobile-form-input" value="${this.utils.escapeHtml(val('city'))}">
                                </div>
                                <div class="mobile-form-group">
                                    <label>State</label>
                                    <select name="businessState" class="mobile-form-select">${stateOptions}</select>
                                </div>
                                <div class="mobile-form-group">
                                    <label>Zip</label>
                                    <input type="text" name="businessZip" class="mobile-form-input" value="${val('zip')}" maxlength="10">
                                </div>
                            </div>
                            <div class="mobile-form-group">
                                <label>Industry</label>
                                <input type="text" name="industryType" class="mobile-form-input" value="${this.utils.escapeHtml(val('industry'))}">
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
                                    <label>Annual Revenue</label>
                                    <input type="text" name="annualRevenue" class="mobile-form-input money-input" value="${currency(val('annual_revenue'))}">
                                </div>
                                <div class="mobile-form-group">
                                    <label>Monthly Revenue</label>
                                    <input type="text" name="monthlyRevenue" class="mobile-form-input money-input" value="${currency(val('monthly_revenue'))}">
                                </div>
                            </div>
                            <div class="mobile-form-row col-2">
                                <div class="mobile-form-group">
                                    <label>Requested Amount</label>
                                    <input type="text" name="requestedAmount" class="mobile-form-input money-input" value="${currency(val('requested_amount'))}">
                                </div>
                                <div class="mobile-form-group">
                                    <label>Credit Score</label>
                                    <input type="text" name="creditScore" class="mobile-form-input" value="${val('credit_score')}">
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
                        </div>
                    </div>

                    <div class="mobile-form-section">
                        <div class="mobile-section-header" data-section="owner">
                            <h4><i class="fas fa-user-tie"></i> Owner</h4>
                            <i class="fas fa-chevron-down collapse-icon"></i>
                        </div>
                        <div class="mobile-section-content" id="section-owner">
                            <div class="mobile-form-row col-2">
                                <div class="mobile-form-group">
                                    <label>First Name</label>
                                    <input type="text" name="ownerFirstName" class="mobile-form-input" value="${this.utils.escapeHtml(val('first_name'))}">
                                </div>
                                <div class="mobile-form-group">
                                    <label>Last Name</label>
                                    <input type="text" name="ownerLastName" class="mobile-form-input" value="${this.utils.escapeHtml(val('last_name'))}">
                                </div>
                            </div>
                            <div class="mobile-form-group">
                                <label>Owner Email</label>
                                <input type="email" name="ownerEmail" class="mobile-form-input" value="${val('owner_email')}">
                            </div>
                            <div class="mobile-form-group">
                                <label>Owner Phone</label>
                                <input type="tel" name="ownerPhone" class="mobile-form-input" value="${phone('owner_phone')}">
                            </div>
                            <div class="mobile-form-row col-2">
                                <div class="mobile-form-group">
                                    <label>Ownership %</label>
                                    <input type="number" name="ownershipPercent" class="mobile-form-input" value="${val('ownership_percentage')}" max="100">
                                </div>
                                <div class="mobile-form-group">
                                    <label>DOB</label>
                                    <input type="date" name="ownerDOB" class="mobile-form-input" value="${val('date_of_birth') ? val('date_of_birth').split('T')[0] : ''}">
                                </div>
                            </div>
                        </div>
                    </div>
                </form>
            `;
        },

        setupEditFormListeners() {
            document.querySelectorAll('.mobile-section-header').forEach(header => {
                header.addEventListener('click', () => {
                    const section = header.dataset.section;
                    const content = document.getElementById(`section-${section}`);
                    if (content) {
                        content.classList.toggle('collapsed');
                        header.classList.toggle('collapsed');
                    }
                });
            });

            document.querySelectorAll('.money-input').forEach(input => {
                input.addEventListener('blur', (e) => {
                    const num = e.target.value.replace(/[^0-9.]/g, '');
                    if (num) {
                        e.target.value = '$' + Number(num).toLocaleString();
                    }
                });
            });

            document.querySelectorAll('input[type="tel"]').forEach(input => {
                input.addEventListener('input', (e) => {
                    e.target.value = this.utils.formatPhone(e.target.value);
                });
            });

            document.getElementById('editCancelBtn').addEventListener('click', () => {
                this.closeIntelView();
            });

            document.getElementById('editSaveBtn').addEventListener('click', () => {
                this.saveEditForm();
            });
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
                if (['annualRevenue', 'monthlyRevenue', 'requestedAmount'].includes(key)) {
                    data[key] = value.replace(/[^0-9.]/g, '');
                } else if (['primaryPhone', 'ownerPhone'].includes(key)) {
                    data[key] = value.replace(/\D/g, '');
                } else {
                    data[key] = value;
                }
            });

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
