// js/intelligence-tabs/lead-forms.js

export class LeadFormsTab {
    constructor(parent) {
        this.parent = parent; // Reference to CommandCenter or IntelligenceManager
        this.utils = parent.utils || window.conversationUI.utils;
    }

    // ============================================================
    //  TAB RENDERING (The "Edit" Tab)
    // ============================================================

    render(container) {
        const conv = this.parent.getSelectedConversation();
        if (!conv) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 60px 20px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">📝</div>
                    <h3 style="color: #6b7280; margin-bottom: 8px;">No Conversation Selected</h3>
                    <p style="color: #9ca3af;">Select a conversation to edit lead information</p>
                </div>
            `;
            return;
        }

        // 1. Render the Landing Page (Background View)
        // We keep this so if you close the modal, you have a button to re-open it
        container.innerHTML = `
            <div style="max-width: 600px; margin: 60px auto; text-align: center;">
                <div style="font-size: 64px; margin-bottom: 24px;">📝</div>
                <h2 style="color: #1e40af; margin-bottom: 12px;">Edit Lead Information</h2>
                <p style="color: #6b7280; margin-bottom: 32px;">
                    ${conv.business_name || 'Current Lead'}
                </p>
                <button id="openEditModalBtn" class="btn btn-primary" style="padding: 12px 32px; font-size: 16px;">
                    ✏️ Re-Open Form
                </button>
            </div>
        `;

        // 2. Attach Listener
        document.getElementById('openEditModalBtn').addEventListener('click', () => {
            this.openEditModal(conv);
        });

        // 3. AUTO-TRIGGER: Open the modal immediately
        setTimeout(() => {
            this.openEditModal(conv);
        }, 50);
    }

    // ============================================================
    //  EDIT MODAL (Inline)
    // ============================================================

    openEditModal(conversation) {
        const modal = document.getElementById('editLeadInlineModal');
        const modalContent = document.getElementById('editLeadInlineContent');

        // 1. Generate HTML (Reusing the template generator)
        modalContent.innerHTML = this.createFormTemplate(conversation, 'edit');

        // 2. Show Modal
        modal.style.display = 'flex';

        // 3. Attach Listeners
        const form = modalContent.querySelector('#editLeadForm');
        this.attachInputFormatters(form);
        this.setupAddressCopy(form, 'sameAsBusinessAddress');

        // 4. Submit Handler
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleSave(e.target, conversation.id);
        });

        // 5. PDF Generator
        const pdfBtn = document.getElementById('generateApplicationBtn');
        if (pdfBtn) {
            pdfBtn.addEventListener('click', async () => {
                // Save first, then generate
                const saved = await this.handleSave(form, conversation.id);
                if (saved) this.generatePDF(conversation);
            });
        }

        // 6. Close Handlers
        document.getElementById('closeEditLeadInlineModal').onclick = () => modal.style.display = 'none';
    }

    // ============================================================
    //  CREATE MODAL (Standalone)
    // ============================================================

    openCreateModal() {
        // Remove existing if present
        const existing = document.getElementById('createLeadModal');
        if (existing) existing.remove();

        // 1. Inject Modal HTML
        const modalHTML = `
            <div id="createLeadModal" class="modal" style="display:flex;">
                <div class="modal-content" style="max-width: 800px; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white;">
                        <h3>Create New Lead</h3>
                        <button class="modal-close" onclick="document.getElementById('createLeadModal').remove()" style="color:white;">×</button>
                    </div>
                    <div class="modal-body">
                        ${this.createFormTemplate({}, 'create')}
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // 2. Attach Listeners
        const form = document.getElementById('createLeadForm');
        this.attachInputFormatters(form);
        this.setupAddressCopy(form, 'sameAsBusinessAddressCreate');

        // 3. Submit Handler
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleCreate(e.target);
        });
    }

    // ============================================================
    //  LOGIC & HANDLERS
    // ============================================================

    async handleSave(form, conversationId) {
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = 'Saving...';
        btn.disabled = true;

        try {
            const data = this.extractFormData(form);

            await this.parent.apiCall(`/api/conversations/${conversationId}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });

            this.utils.showNotification('Lead saved successfully', 'success');

            // Refresh Parent Data
            if (this.parent.reloadConversation) {
                this.parent.reloadConversation(conversationId);
            }

            btn.innerHTML = '✅ Saved';
            setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 1000);
            return true;

        } catch (error) {
            console.error('Save failed:', error);
            this.utils.showNotification(error.message, 'error');
            btn.innerHTML = originalText;
            btn.disabled = false;
            return false;
        }
    }

    async handleCreate(form) {
        try {
            const data = this.extractFormData(form);

            // Required fields check
            if (!data.lead_phone || !data.business_name) {
                alert('Business Name and Phone are required.');
                return;
            }

            const res = await this.parent.apiCall('/api/conversations', {
                method: 'POST',
                body: JSON.stringify(data)
            });

            if (res.success) {
                this.utils.showNotification('Lead created!', 'success');
                document.getElementById('createLeadModal').remove();
                // Refresh Sidebar
                if (window.commandCenter?.conversationUI) {
                    window.commandCenter.conversationUI.loadConversations();
                }
            }
        } catch (error) {
            alert('Create failed: ' + error.message);
        }
    }

    extractFormData(form) {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        const clean = {};

        // Map fields and clean numbers
        for (const [key, val] of Object.entries(data)) {
            if (!val) continue;

            // Convert numeric strings to numbers
            if (['annual_revenue', 'monthly_revenue', 'requested_amount', 'ownership_percentage', 'credit_score'].includes(key)) {
                clean[key] = parseFloat(val.replace(/[^0-9.]/g, ''));
            }
            // Strip formatting from phones/SSN
            else if (key.includes('phone') || key.includes('ssn') || key.includes('tax_id')) {
                clean[key] = val.replace(/\D/g, '');
            } else {
                clean[key] = val;
            }
        }
        return clean;
    }

    // ============================================================
    //  TEMPLATE GENERATOR (Shared by Edit & Create)
    // ============================================================

    createFormTemplate(data, mode) {
        const isEdit = mode === 'edit';
        const formId = isEdit ? 'editLeadForm' : 'createLeadForm';

        // Safely get values - checks multiple possible field names
        const val = (...keys) => {
            for (const k of keys) {
                if (data[k]) return data[k];
            }
            return '';
        };
        // Format Date
        const dateVal = (...keys) => {
            const v = val(...keys);
            if (!v) return '';
            try {
                return new Date(v).toISOString().split('T')[0];
            } catch (e) {
                return '';
            }
        };

        return `
        <form id="${formId}" class="edit-lead-form">
            <div class="form-section">
                <h4>Business Information</h4>
                <div class="form-row-six">
                    <div class="form-group"><label>Legal Name *</label><input type="text" name="business_name" value="${val('business_name')}" class="form-input" required></div>
                    <div class="form-group"><label>DBA</label><input type="text" name="dba_name" value="${val('dba_name')}" class="form-input"></div>
                    <div class="form-group"><label>Phone *</label><input type="tel" name="lead_phone" class="phone-input form-input" value="${val('lead_phone')}" required></div>
                    <div class="form-group"><label>Email</label><input type="email" name="email" value="${val('email')}" class="form-input"></div>
                </div>
                <div class="form-row-six">
                    <div class="form-group"><label>Address</label><input type="text" name="business_address" value="${val('address', 'business_address')}" class="form-input"></div>
                    <div class="form-group"><label>City</label><input type="text" name="business_city" value="${val('city', 'business_city')}" class="form-input"></div>
                    <div class="form-group"><label>State</label><input type="text" name="us_state" value="${val('us_state', 'state', 'address_state')}" class="form-input" maxlength="2"></div>
                    <div class="form-group"><label>Zip</label><input type="text" name="business_zip" class="zip-input form-input" value="${val('zip', 'business_zip')}" maxlength="5"></div>
                </div>
                <div class="form-row-six">
                    <div class="form-group"><label>Tax ID</label><input type="text" name="federal_tax_id" class="ein-input form-input" value="${val('tax_id', 'federal_tax_id', 'tax_id_encrypted')}"></div>
                    <div class="form-group"><label>Start Date</label><input type="date" name="business_start_date" value="${dateVal('business_start_date')}" class="form-input"></div>
                    <div class="form-group"><label>Entity Type</label>
                        <select name="entity_type" class="form-input">
                            <option value="">Select...</option>
                            <option value="LLC" ${val('entity_type')==='LLC'?'selected':''}>LLC</option>
                            <option value="Corporation" ${val('entity_type')==='Corporation'?'selected':''}>Corporation</option>
                            <option value="Sole Proprietorship" ${val('entity_type')==='Sole Proprietorship'?'selected':''}>Sole Prop</option>
                        </select>
                    </div>
                </div>
            </div>

            <div class="form-section">
                <h4>Financials</h4>
                <div class="form-row-six">
                    <div class="form-group"><label>Annual Rev</label><input type="number" name="annual_revenue" value="${val('annual_revenue')}" class="form-input"></div>
                    <div class="form-group"><label>Monthly Rev</label><input type="number" name="monthly_revenue" value="${val('monthly_revenue')}" class="form-input"></div>
                    <div class="form-group"><label>Requested</label><input type="number" name="requested_amount" value="${val('requested_amount')}" class="form-input"></div>
                    <div class="form-group"><label>Use of Funds</label><input type="text" name="use_of_proceeds" value="${val('use_of_proceeds')}" class="form-input"></div>
                </div>
            </div>

            <div class="form-section">
                <h4>Owner Information</h4>
                <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12px;">
                    <input type="checkbox" id="${isEdit ? 'sameAsBusinessAddress' : 'sameAsBusinessAddressCreate'}"> Same as Business Address
                </label>
                <div class="form-row-six">
                    <div class="form-group"><label>First Name</label><input type="text" name="first_name" value="${val('first_name', 'owner_first_name')}" class="form-input"></div>
                    <div class="form-group"><label>Last Name</label><input type="text" name="last_name" value="${val('last_name', 'owner_last_name')}" class="form-input"></div>
                    <div class="form-group"><label>SSN</label><input type="text" name="ssn" class="ssn-input form-input" value="${val('ssn', 'ssn_encrypted')}"></div>
                    <div class="form-group"><label>DOB</label><input type="date" name="date_of_birth" value="${dateVal('date_of_birth', 'dob')}" class="form-input"></div>
                    <div class="form-group"><label>Ownership %</label><input type="number" name="ownership_percentage" value="${val('ownership_percentage')}" class="form-input"></div>
                </div>
                <div class="form-row-six">
                    <div class="form-group"><label>Home Address</label><input type="text" name="owner_address" value="${val('owner_address', 'owner_home_address')}" class="form-input"></div>
                    <div class="form-group"><label>City</label><input type="text" name="owner_city" value="${val('owner_city', 'owner_home_city')}" class="form-input"></div>
                    <div class="form-group"><label>State</label><input type="text" name="owner_state" value="${val('owner_state', 'owner_home_state')}" class="form-input"></div>
                    <div class="form-group"><label>Zip</label><input type="text" name="owner_zip" class="zip-input form-input" value="${val('owner_zip', 'owner_home_zip')}"></div>
                </div>
            </div>

            <div class="form-actions" style="display:flex; justify-content:flex-end; gap:10px; padding-top:20px;">
                ${isEdit ?
                    `<button type="button" id="generateApplicationBtn" class="btn btn-secondary">📄 Generate PDF</button>` : ''
                }
                <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Create Lead'}</button>
            </div>
        </form>
        `;
    }

    // ============================================================
    //  UTILITIES (Formatters & Helpers)
    // ============================================================

    attachInputFormatters(form) {
        // Phone Formatting
        form.querySelectorAll('.phone-input').forEach(input => {
            input.addEventListener('input', (e) => {
                let x = e.target.value.replace(/\D/g, '').match(/(\d{0,3})(\d{0,3})(\d{0,4})/);
                e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
            });
        });

        // SSN Formatting
        form.querySelectorAll('.ssn-input').forEach(input => {
            input.addEventListener('input', (e) => {
                let val = e.target.value.replace(/\D/g, '');
                let newVal = '';
                if(val.length > 4) newVal = val.substr(0,3)+'-'+val.substr(3,2)+'-'+val.substr(5,4);
                else if(val.length > 2) newVal = val.substr(0,3)+'-'+val.substr(3);
                else newVal = val;
                e.target.value = newVal.substring(0,11);
            });
        });

        // Zip Lookup
        form.querySelectorAll('.zip-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const zip = e.target.value.replace(/\D/g, '');
                if (zip.length === 5 && this.utils?.lookupZipCode) {
                    // Determine context based on input name
                    const context = input.name.includes('owner') ? 'owner' : 'business';
                    this.utils.lookupZipCode(zip, context);
                }
            });
        });
    }

    setupAddressCopy(form, checkboxId) {
        const checkbox = form.querySelector(`#${checkboxId}`);
        if (!checkbox) return;

        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                form.querySelector('[name="owner_address"]').value = form.querySelector('[name="business_address"]').value;
                form.querySelector('[name="owner_city"]').value = form.querySelector('[name="business_city"]').value;
                form.querySelector('[name="owner_state"]').value = form.querySelector('[name="us_state"]').value;
                form.querySelector('[name="owner_zip"]').value = form.querySelector('[name="business_zip"]').value;
            }
        });
    }

    async generatePDF(conv) {
        // Just a wrapper to call the parent's PDF logic or your existing logic
        if (this.parent.pdfGenerator) {
            this.parent.pdfGenerator.generate(conv);
        } else {
            // Fallback to the logic from your old file if needed
            // For now, just alert so we know it's wired up
            alert('PDF Generation Triggered (Logic needs to be migrated to documents.js or similar)');
        }
    }
}

// Expose globally for non-module scripts (optional, mainly used via IntelligenceManager)
window.LeadFormsTab = LeadFormsTab;
