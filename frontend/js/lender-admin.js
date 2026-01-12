// js/lender-admin.js
// HANDLES: Global Lender Management (CRUD Operations) - PRO STYLE

class LenderAdmin {
    constructor() {
        // Inject the "Clicky" feel CSS immediately
        this.injectStyles();
    }

    // --- HELPER: Get Live System ---
    get system() {
        if (window.commandCenter && window.commandCenter.isInitialized && window.commandCenter.apiCall) {
            return window.commandCenter;
        }
        console.error("❌ LenderAdmin: Command Center API is missing or not ready.");
        throw new Error("System not ready");
    }

    // --- STYLE INJECTION (Makes buttons feel alive) ---
    injectStyles() {
        const styleId = 'lender-admin-styles';
        if (document.getElementById(styleId)) return;

        const css = `
            /* Make buttons feel tactile */
            .btn, .action-link, .modal-close {
                transition: transform 0.08s ease-out, filter 0.1s ease, background-color 0.2s !important;
                cursor: pointer;
                user-select: none;
            }

            /* The "Click" Effect */
            .btn:active, .action-link:active, .modal-close:active {
                transform: scale(0.95) !important;
                filter: brightness(0.85) !important;
            }

            /* Hover effects for text links */
            .action-link:hover {
                text-decoration: underline;
                filter: brightness(1.2);
            }

            /* Loading spinner improvement */
            .loading-spinner {
                border: 3px solid rgba(255, 255, 255, 0.1);
                border-radius: 50%;
                border-top: 3px solid #3b82f6;
                width: 24px;
                height: 24px;
                animation: spin 0.8s linear infinite;
                margin: 0 auto 10px;
            }

            .lender-menu-options {
                display: flex;
                flex-direction: column;
            }

            .lender-menu-item {
                display: flex;
                align-items: center;
                gap: 15px;
                padding: 16px 20px;
                cursor: pointer;
                border-bottom: 1px solid #30363d;
                transition: background 0.15s;
            }

            .lender-menu-item:last-child {
                border-bottom: none;
            }

            .lender-menu-item:hover {
                background: #21262d;
            }

            .lender-menu-item i:first-child {
                font-size: 20px;
                width: 24px;
                text-align: center;
            }

            .menu-item-title {
                font-size: 14px;
                font-weight: 500;
                color: #e6edf3;
            }

            .menu-item-desc {
                font-size: 12px;
                color: #8b949e;
                margin-top: 2px;
            }

            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `;

        const style = document.createElement('style');
        style.id = styleId;
        style.type = 'text/css';
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }

    // --- Entry Point ---
    openManagementModal() {
        console.log('🏛️ Opening Lender Menu...');

        let modal = document.getElementById('lenderMenuModal');
        if (modal) modal.remove();

        const modalHTML = `
            <div id="lenderMenuModal" class="modal" style="display:flex; z-index: 2000;">
                <div class="modal-content" style="max-width: 400px; background: #161b22; border-radius: 12px;">
                    <div class="modal-header" style="border-bottom: 1px solid #30363d;">
                        <h3>Lender Management</h3>
                        <button class="modal-close" onclick="document.getElementById('lenderMenuModal').remove()">×</button>
                    </div>
                    <div class="modal-body" style="padding: 0;">
                        <div class="lender-menu-options">
                            <div class="lender-menu-item" onclick="window.commandCenter.lenderAdmin.openNetworkDirectory()">
                                <i class="fas fa-building" style="color: #3b82f6;"></i>
                                <div>
                                    <div class="menu-item-title">Network Directory</div>
                                    <div class="menu-item-desc">Add, edit, or remove lenders</div>
                                </div>
                                <i class="fas fa-chevron-right" style="opacity: 0.5;"></i>
                            </div>
                            <div class="lender-menu-item" onclick="window.commandCenter.lenderAdmin.openRuleSuggestions()">
                                <i class="fas fa-brain" style="color: #8b5cf6;"></i>
                                <div>
                                    <div class="menu-item-title">AI Rule Suggestions</div>
                                    <div class="menu-item-desc">Review AI-detected patterns</div>
                                </div>
                                <i class="fas fa-chevron-right" style="opacity: 0.5;"></i>
                            </div>
                            <div class="lender-menu-item" onclick="window.commandCenter.lenderAdmin.openNeedsReview()">
                                <i class="fas fa-exclamation-triangle" style="color: #f59e0b;"></i>
                                <div>
                                    <div class="menu-item-title">Needs Review</div>
                                    <div class="menu-item-desc">Declines requiring manual action</div>
                                </div>
                                <i class="fas fa-chevron-right" style="opacity: 0.5;"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    openNetworkDirectory() {
        document.getElementById('lenderMenuModal')?.remove();

        let modal = document.getElementById('networkDirectoryModal');
        if (modal) modal.remove();

        const modalHTML = `
            <div id="networkDirectoryModal" class="modal" style="display:flex; z-index: 2000;">
                <div class="modal-content lender-submission-modal">
                    <div class="modal-header">
                        <h3><i class="fas fa-building" style="margin-right: 8px; color: #3b82f6;"></i>Network Directory</h3>
                        <button class="modal-close" onclick="document.getElementById('networkDirectoryModal').remove()">×</button>
                    </div>
                    <div class="modal-body submission-body" style="padding: 0;">
                        <div class="submission-col-header" style="border-radius: 0; border: none;">
                            <div class="submission-col-title">All Lenders</div>
                            <div class="header-actions">
                                <button onclick="window.commandCenter.lenderAdmin.showAddModal()" class="action-link" style="font-size: 11px;">+ Add New</button>
                                <button onclick="window.commandCenter.lenderAdmin.loadNetworkDirectory()" class="action-link" style="font-size: 11px;">Refresh</button>
                            </div>
                        </div>
                        <div id="networkDirectoryContainer" class="selection-list" style="flex: 1; border: none; background: #0d1117; max-height: 500px; overflow-y: auto;">
                            <div class="loading-state"><div class="loading-spinner"></div> Loading...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.loadNetworkDirectory();
    }

    async loadNetworkDirectory() {
        const container = document.getElementById('networkDirectoryContainer');
        if (!container) return;

        container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div> Loading...</div>';

        try {
            const lenders = await this.system.apiCall('/api/lenders');
            this.displayLendersListIn(lenders, container);
        } catch (error) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #ef4444;">Failed to load</div>';
        }
    }

    displayLendersListIn(lenders, container) {
        if (!lenders || lenders.length === 0) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #8b949e;">No lenders found</div>';
            return;
        }

        container.innerHTML = lenders.map(l => `
            <div class="selection-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 15px;">
                <div>
                    <div style="font-weight: 500; color: #e6edf3;">${l.name}</div>
                    <div style="font-size: 11px; color: #8b949e;">${l.email || 'No email'} • Tier ${l.tier || '?'}</div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="window.commandCenter.lenderAdmin.showEditModal('${l.id}')" class="action-link" style="font-size: 11px;">Edit</button>
                    <button onclick="window.commandCenter.lenderAdmin.deleteLender('${l.id}', '${l.name}')" class="action-link" style="font-size: 11px; color: #ef4444;">Delete</button>
                </div>
            </div>
        `).join('');
    }

    openRuleSuggestions() {
        document.getElementById('lenderMenuModal')?.remove();

        let modal = document.getElementById('ruleSuggestionsModal');
        if (modal) modal.remove();

        const modalHTML = `
            <div id="ruleSuggestionsModal" class="modal" style="display:flex; z-index: 2000;">
                <div class="modal-content lender-submission-modal">
                    <div class="modal-header">
                        <h3><i class="fas fa-brain" style="margin-right: 8px; color: #8b5cf6;"></i>AI Rule Suggestions</h3>
                        <button class="modal-close" onclick="document.getElementById('ruleSuggestionsModal').remove()">×</button>
                    </div>
                    <div class="modal-body submission-body" style="padding: 0;">
                        <div id="ruleSuggestionsContainerNew" style="max-height: 500px; overflow-y: auto; background: #0d1117;">
                            <div class="loading-state" style="padding: 15px;"><div class="loading-spinner"></div> Loading...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.loadRuleSuggestionsNew();
    }

    async loadRuleSuggestionsNew() {
        const container = document.getElementById('ruleSuggestionsContainerNew');
        if (!container) return;

        try {
            const suggestions = await this.system.apiCall('/api/lenders/rule-suggestions');

            if (!suggestions || suggestions.length === 0) {
                container.innerHTML = '<div style="padding: 30px; text-align: center; color: #8b949e;">No pending suggestions</div>';
                return;
            }

            container.innerHTML = suggestions.map(s => `
                <div style="padding: 15px; border-bottom: 1px solid #30363d;">
                    <div style="font-weight: 500; color: #e6edf3; margin-bottom: 5px;">${s.lender_name}</div>
                    <div style="font-size: 12px; color: #8b949e; margin-bottom: 10px;">${s.decline_message}</div>
                    <div style="font-size: 11px; color: #8b949e; margin-bottom: 10px;">
                        Type: ${s.rule_type} ${s.industry ? '• Industry: ' + s.industry : ''} ${s.state ? '• State: ' + s.state : ''}
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="window.commandCenter.lenderAdmin.approveRule('${s.id}')" class="btn" style="background: #238636; color: white; padding: 6px 12px; font-size: 11px; border: none; border-radius: 4px;">Approve</button>
                        <button onclick="window.commandCenter.lenderAdmin.rejectRule('${s.id}')" class="btn" style="background: #da3633; color: white; padding: 6px 12px; font-size: 11px; border: none; border-radius: 4px;">Reject</button>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #ef4444;">Failed to load</div>';
        }
    }

    openNeedsReview() {
        document.getElementById('lenderMenuModal')?.remove();

        let modal = document.getElementById('needsReviewModal');
        if (modal) modal.remove();

        const modalHTML = `
            <div id="needsReviewModal" class="modal" style="display:flex; z-index: 2000;">
                <div class="modal-content lender-submission-modal">
                    <div class="modal-header">
                        <h3><i class="fas fa-exclamation-triangle" style="margin-right: 8px; color: #f59e0b;"></i>Needs Review</h3>
                        <button class="modal-close" onclick="document.getElementById('needsReviewModal').remove()">×</button>
                    </div>
                    <div class="modal-body submission-body" style="padding: 0;">
                        <div id="needsReviewContainerNew" style="max-height: 500px; overflow-y: auto; background: #0d1117;">
                            <div class="loading-state" style="padding: 15px;"><div class="loading-spinner"></div> Loading...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.loadNeedsReviewNew();
    }

    async loadNeedsReviewNew() {
        const container = document.getElementById('needsReviewContainerNew');
        if (!container) return;

        try {
            const declines = await this.system.apiCall('/api/lenders/needs-review');

            if (!declines || declines.length === 0) {
                container.innerHTML = '<div style="padding: 30px; text-align: center; color: #8b949e;">Nothing needs review</div>';
                return;
            }

            container.innerHTML = declines.map(d => `
                <div style="padding: 15px; border-bottom: 1px solid #30363d;">
                    <div style="font-weight: 500; color: #e6edf3; margin-bottom: 5px;">${d.lender_name} → ${d.business_name}</div>
                    <div style="font-size: 12px; color: #8b949e; margin-bottom: 10px;">${d.decline_reason || 'No reason provided'}</div>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="window.commandCenter.lenderAdmin.showManualRuleModal('${d.lender_name}', '${(d.decline_reason || '').replace(/'/g, "\\'")}', '${d.industry || ''}', '${d.state || ''}', '${d.id}')"
                                class="btn" style="background: #3b82f6; color: white; padding: 6px 12px; font-size: 11px; border: none; border-radius: 4px;">
                            Create Rule
                        </button>
                        <button onclick="window.commandCenter.lenderAdmin.dismissDecline('${d.id}')"
                                class="btn" style="background: #374151; color: white; padding: 6px 12px; font-size: 11px; border: none; border-radius: 4px;">
                            Dismiss
                        </button>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #ef4444;">Failed to load</div>';
        }
    }

    createManagementTemplate() {
        return `
            <div style="display: flex; flex-direction: column; height: 100%;">
                <div id="ruleSuggestionsSection" style="border-bottom: 1px solid #30363d;">
                    <div class="submission-col-header" style="border-radius: 0; border: none; background: #161b22;">
                        <div class="submission-col-title">🧠 AI Rule Suggestions</div>
                        <button onclick="window.commandCenter.lenderAdmin.loadRuleSuggestions()" class="action-link" style="font-size: 11px;">
                            Refresh
                        </button>
                    </div>
                    <div id="ruleSuggestionsContainer" style="max-height: 200px; overflow-y: auto; background: #0d1117;">
                        <div class="loading-state" style="padding: 15px; font-size: 12px; color: #8b949e;">Loading suggestions...</div>
                    </div>
                </div>

                <div id="needsReviewSection" style="border-bottom: 1px solid #30363d;">
                    <div class="submission-col-header" style="border-radius: 0; border: none; background: #161b22;">
                        <div class="submission-col-title">Needs Manual Review</div>
                        <button onclick="window.commandCenter.lenderAdmin.loadNeedsReview()" class="action-link" style="font-size: 11px;">
                            Refresh
                        </button>
                    </div>
                    <div id="needsReviewContainer" style="max-height: 200px; overflow-y: auto; background: #0d1117;">
                        <div class="loading-state" style="padding: 15px; font-size: 12px; color: #8b949e;">Loading...</div>
                    </div>
                </div>

                <div class="submission-col-header" style="border-radius: 0; border-left: none; border-right: none; border-top: none;">
                    <div class="submission-col-title">Network Directory</div>
                    <div class="header-actions">
                        <button onclick="window.commandCenter.lenderAdmin.showAddModal()" class="action-link" style="font-size: 11px;">
                            + Add New Lender
                        </button>
                        <button onclick="window.commandCenter.lenderAdmin.loadLendersList()" class="action-link" style="font-size: 11px;">
                            Refresh
                        </button>
                    </div>
                </div>

                <div id="adminLendersTableContainer" class="selection-list" style="flex: 1; border: none; background: #0d1117;">
                    <div class="loading-state">Loading lenders...</div>
                </div>
            </div>
        `;
    }


    // --- CRUD Operations ---

    async loadLendersList() {
        const container = document.getElementById('adminLendersTableContainer');
        if (container) container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div> Loading Network...</div>';

        try {
            const apiPromise = this.system.apiCall(`/api/lenders`);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), 5000));
            const lenders = await Promise.race([apiPromise, timeoutPromise]);

            this.displayLendersList(lenders);

        } catch (error) {
            console.error('Error loading lenders:', error);
            if (container) {
                container.innerHTML = `
                    <div class="error-state" style="text-align:center; padding:20px;">
                        <p style="color: #ef4444; font-size: 13px;">Failed to load lenders.</p>
                        <button class="btn btn-secondary" onclick="window.commandCenter.lenderAdmin.loadLendersList()">Try Again</button>
                    </div>`;
            }
        }
    }

    displayLendersList(lenders) {
        const container = document.getElementById('adminLendersTableContainer');
        if (!lenders || lenders.length === 0) {
            container.innerHTML = `
                <div class="empty-state-card" style="border: none; background: transparent;">
                    <h4>No Lenders Found</h4>
                    <p>Start by adding your first lender.</p>
                </div>`;
            return;
        }

        const sorted = [...lenders].sort((a, b) => a.name.localeCompare(b.name));

        container.innerHTML = sorted.map(lender => `
            <div class="lender-list-row" style="padding: 10px 16px; border-bottom: 1px solid #21262d; display: flex; align-items: center; justify-content: space-between;">
                <div class="lender-name-wrapper" style="display: flex; align-items: center;">
                    <div class="lender-avatar" style="width: 28px; height: 28px; font-size: 12px; margin-right: 12px; background: #1f2937; color: #9ca3af; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 1px solid #374151;">${lender.name.charAt(0).toUpperCase()}</div>
                    <div style="display:flex; flex-direction:column;">
                        <span style="font-weight:600; font-size: 13px; color: #e6edf3;">${lender.name}</span>
                        <span style="font-size:11px; color:#64748b;">${lender.email || 'No Email'}</span>
                    </div>
                </div>
                <div class="lender-actions" style="display: flex; gap: 8px;">
                    <button onclick="window.commandCenter.lenderAdmin.editLender('${lender.id}')" class="action-link" title="Edit">EDIT</button>
                    <button onclick="window.commandCenter.lenderAdmin.deleteLender('${lender.id}', '${lender.name}')" class="action-link" style="color: #ef4444;" title="Delete">DELETE</button>
                </div>
            </div>
        `).join('');
    }

    // --- ADD / EDIT ---

    showAddModal() {
        const modalHtml = `
            <div id="addLenderModal" class="modal" style="display: flex; z-index: 2100;">
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header"><h3>Add New Lender</h3><button class="modal-close" onclick="this.closest('.modal').remove()">×</button></div>
                    <div class="modal-body" style="padding: 20px;">
                        <div class="lender-input-grid" style="grid-template-columns: 1fr; gap: 12px;">
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
                                <input type="text" id="newLenderCC" class="form-input" placeholder="comma separated">
                            </div>
                            <div class="form-grid col-2" style="gap: 12px; display: grid; grid-template-columns: 1fr 1fr;">
                                <div class="form-group"><label class="field-label">Min Amount</label><input type="number" id="newLenderMin" class="form-input"></div>
                                <div class="form-group"><label class="field-label">Max Amount</label><input type="number" id="newLenderMax" class="form-input"></div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                        <button id="btnSaveLender" class="btn btn-primary" onclick="window.commandCenter.lenderAdmin.saveLender()">Save Lender</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async saveLender() {
        const name = document.getElementById('newLenderName').value;
        const email = document.getElementById('newLenderEmail').value;
        const rawCC = document.getElementById('newLenderCC').value;
        const cc_email = rawCC.split(',').map(e => e.trim()).filter(e => e).join(', ') || null;
        const min = document.getElementById('newLenderMin').value;
        const max = document.getElementById('newLenderMax').value;
        const btn = document.getElementById('btnSaveLender');

        if (!name || !email) {
            alert('Name and Email required');
            return;
        }

        // UX: Show loading
        const originalText = btn.innerText;
        btn.innerText = 'Saving...';
        btn.disabled = true;

        try {
            const result = await this.system.apiCall('/api/lenders', {
                method: 'POST',
                body: JSON.stringify({ name, email, cc_email, min_amount: min, max_amount: max })
            });

            // FIX: Check for ID since backend returns the object directly
            if (result && result.id) {
                document.getElementById('addLenderModal').remove();
                this.loadLendersList();
            } else {
                throw new Error("Save failed");
            }
        } catch (e) {
            alert("Error saving: " + e.message);
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }

    async deleteLender(id, name) {
        if (!confirm(`Delete ${name}?`)) return;
        await this.system.apiCall(`/api/lenders/${id}`, { method: 'DELETE' });
        this.loadLendersList();
    }

    async editLender(lenderId) {
        try {
            const result = await this.system.apiCall(`/api/lenders/${lenderId}`);
            if (result.success && result.lender) {
                this.showEditModal(result.lender);
            } else {
                throw new Error('Lender data not found');
            }
        } catch (error) {
            console.error('Error fetching lender:', error);
            alert('Failed to load lender data');
        }
    }

    showEditModal(lender) {
        const existing = document.getElementById('editLenderModal');
        if (existing) existing.remove();

        const industriesStr = Array.isArray(lender.industries) ? lender.industries.join(', ') : '';
        const statesStr = Array.isArray(lender.states) ? lender.states.join(', ') : '';

        const modalHtml = `
            <div id="editLenderModal" class="modal" style="display: flex; z-index: 2100;">
                <div class="modal-content" style="max-width: 600px;">
                    <div class="modal-header">
                        <h3>Edit Lender: ${lender.name}</h3>
                        <button class="modal-close" onclick="document.getElementById('editLenderModal').remove()">×</button>
                    </div>
                    <div class="modal-body" style="padding: 20px;">
                        <div class="lender-input-grid" style="grid-template-columns: 1fr 1fr; margin-bottom: 0;">
                            <div class="form-group grid-span-full">
                                <label class="field-label">Lender Name *</label>
                                <input type="text" id="editLenderName" class="form-input" value="${lender.name || ''}">
                            </div>
                            <div class="form-group">
                                <label class="field-label">Email *</label>
                                <input type="email" id="editLenderEmail" class="form-input" value="${lender.email || ''}">
                            </div>
                            <div class="form-group">
                                <label class="field-label">CC Emails</label>
                                <input type="text" id="editLenderCC" class="form-input" value="${lender.cc_email || ''}">
                            </div>
                            <div class="form-group">
                                <label class="field-label">Min Amount ($)</label>
                                <input type="number" id="editLenderMin" class="form-input" value="${lender.min_amount || 0}">
                            </div>
                            <div class="form-group">
                                <label class="field-label">Max Amount ($)</label>
                                <input type="number" id="editLenderMax" class="form-input" value="${lender.max_amount || 0}">
                            </div>
                            <div class="form-group grid-span-full">
                                <label class="field-label">Industries</label>
                                <input type="text" id="editLenderIndustries" class="form-input" value="${industriesStr}" placeholder="Construction, Retail...">
                            </div>
                            <div class="form-group grid-span-full">
                                <label class="field-label">States</label>
                                <input type="text" id="editLenderStates" class="form-input" value="${statesStr}" placeholder="NY, CA, FL...">
                            </div>
                            <div class="form-group grid-span-full">
                                <label class="field-label">Notes</label>
                                <textarea id="editLenderNotes" class="submission-textarea" rows="2" style="min-height: 60px;">${lender.notes || ''}</textarea>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="document.getElementById('editLenderModal').remove()">Cancel</button>
                        <button id="btnUpdateLender" class="btn btn-primary" onclick="window.commandCenter.lenderAdmin.updateLender('${lender.id}')">Update Lender</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async updateLender(lenderId) {
        const name = document.getElementById('editLenderName').value.trim();
        const email = document.getElementById('editLenderEmail').value.trim();
        const btn = document.getElementById('btnUpdateLender');

        if (!name || !email) {
            alert('Name and Email are required.');
            return;
        }

        const data = {
            name: name,
            email: email,
            cc_email: document.getElementById('editLenderCC').value.split(',').map(e => e.trim()).filter(e => e).join(', ') || null,
            min_amount: parseFloat(document.getElementById('editLenderMin').value) || 0,
            max_amount: parseFloat(document.getElementById('editLenderMax').value) || 0,
            industries: document.getElementById('editLenderIndustries').value.split(',').map(s => s.trim()).filter(s => s),
            states: document.getElementById('editLenderStates').value.split(',').map(s => s.trim().toUpperCase()).filter(s => s),
            notes: document.getElementById('editLenderNotes').value.trim() || null
        };

        // UX: Show loading
        const originalText = btn.innerText;
        btn.innerText = 'Updating...';
        btn.disabled = true;

        try {
            const result = await this.system.apiCall(`/api/lenders/${lenderId}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });

            // Backend returns the updated object or { success: true ... }
            if (result && (result.success || result.id)) {
                document.getElementById('editLenderModal').remove();
                this.loadLendersList();
            } else {
                throw new Error(result.error || 'Update failed');
            }
        } catch (error) {
            console.error('Update error:', error);
            alert('Failed to update lender');
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }

    // --- RULE SUGGESTIONS ---

    async loadRuleSuggestions() {
        const container = document.getElementById('ruleSuggestionsContainer');
        if (!container) return;

        try {
            const suggestions = await this.system.apiCall('/api/lenders/rule-suggestions');

            if (!suggestions || suggestions.length === 0) {
                container.innerHTML = `
                    <div style="padding: 15px; text-align: center; color: #8b949e; font-size: 12px;">
                        ✅ No pending suggestions
                    </div>
                `;
                return;
            }

            container.innerHTML = suggestions.map(rule => `
                <div class="rule-suggestion-row" style="padding: 12px 16px; border-bottom: 1px solid #21262d; display: flex; align-items: center; justify-content: space-between;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <span style="font-weight: 600; font-size: 13px; color: #e6edf3;">${rule.lender_name}</span>
                            <span class="rule-type-badge" style="background: ${this.getRuleTypeBadgeColor(rule.rule_type)}; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;">
                                ${rule.rule_type.replace('_', ' ').toUpperCase()}
                            </span>
                        </div>
                        <div style="font-size: 12px; color: #8b949e;">
                            ${rule.industry ? `<span style="color: #f59e0b;">Industry: ${rule.industry}</span>` : ''}
                            ${rule.state ? `<span style="color: #3b82f6;">State: ${rule.state}</span>` : ''}
                            ${rule.condition_field ? `<span>${rule.condition_field} ${rule.condition_operator} ${rule.condition_value}</span>` : ''}
                        </div>
                        <div style="font-size: 11px; color: #6e7681; margin-top: 4px;">
                            💡 ${rule.decline_message}
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; margin-left: 12px;">
                        <button onclick="window.commandCenter.lenderAdmin.approveRule('${rule.id}', '${rule.lender_name}')"
                                class="btn" style="background: #10b981; color: white; padding: 6px 12px; font-size: 11px; border: none; border-radius: 4px;">
                            ✓ Approve
                        </button>
                        <button onclick="window.commandCenter.lenderAdmin.rejectRule('${rule.id}')"
                                class="btn" style="background: #ef4444; color: white; padding: 6px 12px; font-size: 11px; border: none; border-radius: 4px;">
                            ✗ Reject
                        </button>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error loading rule suggestions:', error);
            container.innerHTML = `
                <div style="padding: 15px; text-align: center; color: #ef4444; font-size: 12px;">
                    Failed to load suggestions
                </div>
            `;
        }
    }

    getRuleTypeBadgeColor(type) {
        const colors = {
            industry_block: '#f59e0b',
            state_block: '#3b82f6',
            minimum_requirement: '#8b5cf6',
            position_restriction: '#ec4899',
            other: '#6b7280'
        };
        return colors[type] || colors.other;
    }

    async approveRule(ruleId, lenderName) {
        if (!confirm(`Approve this rule for ${lenderName}?\n\nThis will also update the lender's restrictions.`)) return;

        try {
            await this.system.apiCall(`/api/lenders/rule-suggestions/${ruleId}/approve`, {
                method: 'POST'
            });

            this.system.utils.showNotification(`Rule approved for ${lenderName}`, 'success');
            this.loadRuleSuggestions();
        } catch (error) {
            console.error('Error approving rule:', error);
            this.system.utils.showNotification('Failed to approve rule', 'error');
        }
    }

    async rejectRule(ruleId) {
        if (!confirm('Reject this rule suggestion?')) return;

        try {
            await this.system.apiCall(`/api/lenders/rule-suggestions/${ruleId}/reject`, {
                method: 'POST'
            });

            this.system.utils.showNotification('Rule rejected', 'success');
            this.loadRuleSuggestions();
        } catch (error) {
            console.error('Error rejecting rule:', error);
            this.system.utils.showNotification('Failed to reject rule', 'error');
        }
    }

    async loadNeedsReview() {
        const container = document.getElementById('needsReviewContainer');
        if (!container) return;

        try {
            const declines = await this.system.apiCall('/api/lenders/needs-review');

            if (!declines || declines.length === 0) {
                container.innerHTML = `
                    <div style="padding: 15px; text-align: center; color: #8b949e; font-size: 12px;">
                        ✅ No declines need review
                    </div>
                `;
                return;
            }

            container.innerHTML = declines.map((decline) => `
                <div class="needs-review-row" style="padding: 12px 16px; border-bottom: 1px solid #21262d; display: flex; align-items: center; justify-content: space-between;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <span style="font-weight: 600; font-size: 13px; color: #e6edf3;">${decline.lender_name}</span>
                            <span style="background: #6b7280; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 10px;">LOW CONFIDENCE</span>
                        </div>
                        <div style="font-size: 12px; color: #f59e0b; margin-bottom: 2px;">
                            Reason: ${decline.decline_reason || 'Not specified'}
                        </div>
                        <div style="font-size: 11px; color: #6e7681;">
                            Business: ${decline.business_name || 'Unknown'} | Industry: ${decline.industry || 'Unknown'} | State: ${decline.us_state || 'Unknown'}
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; margin-left: 12px;">
                        <button onclick="window.commandCenter.lenderAdmin.showManualRuleModal('${decline.lender_name}', '${decline.decline_reason || ''}', '${decline.industry || ''}', '${decline.us_state || ''}', '${decline.id}')"
                                class="btn" style="background: #3b82f6; color: white; padding: 6px 12px; font-size: 11px; border: none; border-radius: 4px;">
                            + Add Rule
                        </button>
                        <button onclick="window.commandCenter.lenderAdmin.dismissDecline('${decline.id}')"
                                class="btn" style="background: #374151; color: white; padding: 6px 12px; font-size: 11px; border: none; border-radius: 4px;">
                            Dismiss
                        </button>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error loading needs review:', error);
            container.innerHTML = `
                <div style="padding: 15px; text-align: center; color: #ef4444; font-size: 12px;">
                    Failed to load
                </div>
            `;
        }
    }

    showManualRuleModal(lenderName, declineReason, industry, state, submissionId) {
        const existing = document.getElementById('manualRuleModal');
        if (existing) existing.remove();

        const modalHtml = `
            <div id="manualRuleModal" class="modal" style="display: flex; z-index: 2200;">
                <div class="modal-content modal-sm" style="max-width: 500px;">
                    <div class="modal-header">
                        <h3>Add Manual Rule</h3>
                        <button class="modal-close" onclick="document.getElementById('manualRuleModal').remove()">×</button>
                    </div>
                    <div class="modal-body" style="padding: 20px;">
                        <div style="background: #161b22; padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                            <div style="font-size: 12px; color: #8b949e;">Original Decline</div>
                            <div style="font-size: 14px; color: #e6edf3; margin-top: 4px;">${lenderName}: ${declineReason}</div>
                        </div>

                        <div class="form-group">
                            <label class="field-label">Rule Type *</label>
                            <select id="manualRuleType" class="form-input">
                                <option value="">Select...</option>
                                <option value="industry_block">Industry Block</option>
                                <option value="state_block">State Block</option>
                                <option value="minimum_requirement">Minimum Requirement</option>
                                <option value="position_restriction">Position Restriction</option>
                                <option value="other">Other</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="field-label">Industry (if applicable)</label>
                            <input type="text" id="manualRuleIndustry" class="form-input" value="${industry}" placeholder="e.g., Pawn Shops">
                        </div>

                        <div class="form-group">
                            <label class="field-label">State (if applicable)</label>
                            <input type="text" id="manualRuleState" class="form-input" value="${state}" placeholder="e.g., CA">
                        </div>

                        <div class="form-group">
                            <label class="field-label">Condition (for minimums)</label>
                            <div style="display: flex; gap: 8px;">
                                <select id="manualRuleField" class="form-input" style="flex: 1;">
                                    <option value="">Field...</option>
                                    <option value="tib">Time in Business</option>
                                    <option value="revenue">Monthly Revenue</option>
                                    <option value="fico">FICO Score</option>
                                    <option value="position">Position</option>
                                </select>
                                <select id="manualRuleOperator" class="form-input" style="width: 80px;">
                                    <option value="min">Min</option>
                                    <option value="max">Max</option>
                                </select>
                                <input type="number" id="manualRuleValue" class="form-input" style="width: 100px;" placeholder="Value">
                            </div>
                        </div>

                        <div class="form-group">
                            <label class="field-label">Rule Description *</label>
                            <input type="text" id="manualRuleMessage" class="form-input" placeholder="e.g., Does not accept pawn shops">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="document.getElementById('manualRuleModal').remove()">Cancel</button>
                        <button id="btnSaveManualRule" class="btn btn-primary" onclick="window.commandCenter.lenderAdmin.saveManualRule('${lenderName}', '${submissionId}')">Save Rule</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async saveManualRule(lenderName, submissionId) {
        const ruleType = document.getElementById('manualRuleType').value;
        const message = document.getElementById('manualRuleMessage').value.trim();

        if (!ruleType || !message) {
            alert('Please select a rule type and enter a description');
            return;
        }

        const data = {
            lender_name: lenderName,
            rule_type: ruleType,
            industry: document.getElementById('manualRuleIndustry').value.trim() || null,
            state: document.getElementById('manualRuleState').value.trim().toUpperCase() || null,
            condition_field: document.getElementById('manualRuleField').value || null,
            condition_operator: document.getElementById('manualRuleOperator').value || null,
            condition_value: document.getElementById('manualRuleValue').value || null,
            decline_message: message,
            submission_id: submissionId
        };

        const btn = document.getElementById('btnSaveManualRule');
        btn.disabled = true;
        btn.textContent = 'Saving...';

        try {
            await this.system.apiCall('/api/lenders/rules/manual', {
                method: 'POST',
                body: JSON.stringify(data)
            });

            document.getElementById('manualRuleModal').remove();
            this.system.utils.showNotification(`Rule added for ${lenderName}`, 'success');
            this.loadNeedsReview();
            this.loadRuleSuggestions();
        } catch (error) {
            console.error('Error saving manual rule:', error);
            alert('Failed to save rule');
            btn.disabled = false;
            btn.textContent = 'Save Rule';
        }
    }

    async dismissDecline(submissionId) {
        if (!confirm("Dismiss this decline? It won't show up for review again.")) return;

        try {
            await this.system.apiCall(`/api/lenders/decline/${submissionId}/dismiss`, {
                method: 'POST'
            });
            this.loadNeedsReview();
        } catch (error) {
            console.error('Error dismissing:', error);
        }
    }
}

window.LenderAdmin = LenderAdmin;

window.openLenderManagementModal = function() {
    if (!window.commandCenter) {
        alert("System is still loading core components. Please wait...");
        return;
    }
    if (!window.commandCenter.lenderAdmin) {
        window.commandCenter.lenderAdmin = new LenderAdmin();
    }
    try {
        const sys = window.commandCenter.lenderAdmin.system;
        window.commandCenter.lenderAdmin.openManagementModal();
    } catch (e) {
        console.warn("System not ready yet. Retrying in 500ms...");
        setTimeout(() => {
            if (window.commandCenter.isInitialized) {
                window.commandCenter.lenderAdmin.openManagementModal();
            } else {
                alert("System is initializing. Please try again in a moment.");
            }
        }, 500);
    }
};
