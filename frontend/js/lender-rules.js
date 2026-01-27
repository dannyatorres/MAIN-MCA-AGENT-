// js/lender-rules.js
// Rule Suggestions & Needs Review Management

class LenderRules {
    constructor(system) {
        this.system = system;
    }

    // ==========================================
    // AI RULE SUGGESTIONS
    // ==========================================

    openSuggestions() {
        document.getElementById('lenderMenuModal')?.remove();
        document.getElementById('ruleSuggestionsModal')?.remove();

        const modalHTML = `
            <div id="ruleSuggestionsModal" class="modal lender-admin-modal">
                <div class="modal-content modal-lg">
                    <div class="modal-header">
                        <h3><i class="fas fa-brain icon-purple"></i> AI Rule Suggestions</h3>
                        <button class="modal-close" onclick="document.getElementById('ruleSuggestionsModal').remove()">×</button>
                    </div>
                    <div class="modal-body">
                        <div id="ruleSuggestionsContainer" class="admin-list">
                            <div class="admin-loading"><div class="loading-spinner"></div> Loading...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.bindSuggestionsEvents();
        this.loadSuggestions();
    }

    bindSuggestionsEvents() {
        const container = document.getElementById('ruleSuggestionsContainer');
        if (!container) return;

        container.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;

            const action = btn.dataset.action;
            const id = btn.dataset.id;
            const name = btn.dataset.name;

            if (action === 'approve') this.approve(id, name);
            if (action === 'reject') this.reject(id);
        });
    }

    async loadSuggestions() {
        const container = document.getElementById('ruleSuggestionsContainer');
        if (!container) return;

        try {
            const suggestions = await this.system.apiCall('/api/lenders/rule-suggestions');

            if (!suggestions || suggestions.length === 0) {
                container.innerHTML = '<div class="admin-empty">✅ No pending suggestions</div>';
                return;
            }

            container.innerHTML = suggestions.map(s => `
                <div class="review-item" data-rule-id="${s.id}">
                    <div class="review-item-header">
                        <span class="review-item-title">${this.escapeHtml(s.lender_name)}</span>
                        <span class="badge ${this.getBadgeClass(s.rule_type)}">${this.formatRuleType(s.rule_type)}</span>
                    </div>
                    <div class="review-item-subtitle">${this.escapeHtml(s.decline_message)}</div>
                    <div class="review-item-meta">
                        ${s.industry ? `<span class="icon-amber">Industry: ${this.escapeHtml(s.industry)}</span>` : ''}
                        ${s.state ? `<span class="icon-blue">State: ${this.escapeHtml(s.state)}</span>` : ''}
                        ${s.condition_field ? `<span>${s.condition_field} ${s.condition_operator} ${s.condition_value}</span>` : ''}
                    </div>
                    <div class="review-item-actions">
                        <button class="btn-action approve" data-action="approve" data-id="${s.id}" data-name="${this.escapeHtml(s.lender_name)}">✓ Approve</button>
                        <button class="btn-action reject" data-action="reject" data-id="${s.id}">✗ Reject</button>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error loading rule suggestions:', error);
            container.innerHTML = '<div class="admin-error">Failed to load suggestions</div>';
        }
    }

    async approve(id, name) {
        if (!confirm(`Approve this rule for ${name}?\n\nThis will update the lender's restrictions.`)) return;

        try {
            await this.system.apiCall(`/api/lenders/rule-suggestions/${id}/approve`, {
                method: 'POST'
            });

            this.system.utils.showNotification(`Rule approved for ${name}`, 'success');
            this.loadSuggestions();
        } catch (error) {
            console.error('Error approving rule:', error);
            this.system.utils.showNotification('Failed to approve rule', 'error');
        }
    }

    async reject(id) {
        if (!confirm('Reject this rule suggestion?')) return;

        try {
            await this.system.apiCall(`/api/lenders/rule-suggestions/${id}/reject`, {
                method: 'POST'
            });

            this.system.utils.showNotification('Rule rejected', 'success');
            this.loadSuggestions();
        } catch (error) {
            console.error('Error rejecting rule:', error);
            this.system.utils.showNotification('Failed to reject rule', 'error');
        }
    }

    // ==========================================
    // NEEDS REVIEW
    // ==========================================

    openNeedsReview() {
        document.getElementById('lenderMenuModal')?.remove();
        document.getElementById('needsReviewModal')?.remove();

        const modalHTML = `
            <div id="needsReviewModal" class="modal lender-admin-modal">
                <div class="modal-content modal-lg">
                    <div class="modal-header">
                        <h3><i class="fas fa-exclamation-triangle icon-amber"></i> Needs Review</h3>
                        <button class="modal-close" onclick="document.getElementById('needsReviewModal').remove()">×</button>
                    </div>
                    <div class="modal-body">
                        <div id="needsReviewContainer" class="admin-list">
                            <div class="admin-loading"><div class="loading-spinner"></div> Loading...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.bindNeedsReviewEvents();
        this.loadNeedsReview();
    }

    bindNeedsReviewEvents() {
        const container = document.getElementById('needsReviewContainer');
        if (!container) return;

        container.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;

            const action = btn.dataset.action;
            const id = btn.dataset.id;

            if (action === 'create-rule') {
                this.showManualRuleModal({
                    lenderName: btn.dataset.lender,
                    declineReason: btn.dataset.reason,
                    industry: btn.dataset.industry,
                    state: btn.dataset.state,
                    submissionId: id
                });
            }
            if (action === 'dismiss') this.dismiss(id);
        });
    }

    async loadNeedsReview() {
        const container = document.getElementById('needsReviewContainer');
        if (!container) return;

        try {
            const declines = await this.system.apiCall('/api/lenders/needs-review');

            if (!declines || declines.length === 0) {
                container.innerHTML = '<div class="admin-empty">✅ Nothing needs review</div>';
                return;
            }

            container.innerHTML = declines.map(d => `
                <div class="review-item" data-decline-id="${d.id}">
                    <div class="review-item-header">
                        <span class="review-item-title">${this.escapeHtml(d.lender_name)} → ${this.escapeHtml(d.business_name || 'Unknown')}</span>
                        <span class="badge badge-low-confidence">Low Confidence</span>
                    </div>
                    <div class="review-item-subtitle icon-amber">Reason: ${this.escapeHtml(d.decline_reason) || 'Not specified'}</div>
                    <div class="review-item-meta">
                        Industry: ${this.escapeHtml(d.industry) || 'Unknown'} • State: ${this.escapeHtml(d.us_state) || 'Unknown'}
                    </div>
                    <div class="review-item-actions">
                        <button class="btn-action create" 
                            data-action="create-rule" 
                            data-id="${d.id}"
                            data-lender="${this.escapeHtml(d.lender_name)}"
                            data-reason="${this.escapeHtml(d.decline_reason || '')}"
                            data-industry="${this.escapeHtml(d.industry || '')}"
                            data-state="${this.escapeHtml(d.us_state || '')}">
                            + Create Rule
                        </button>
                        <button class="btn-action dismiss" data-action="dismiss" data-id="${d.id}">Dismiss</button>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error loading needs review:', error);
            container.innerHTML = '<div class="admin-error">Failed to load</div>';
        }
    }

    // ==========================================
    // MANUAL RULE CREATION
    // ==========================================

    showManualRuleModal(data) {
        const { lenderName, declineReason, industry, state, submissionId } = data;
        
        document.getElementById('manualRuleModal')?.remove();

        const modalHTML = `
            <div id="manualRuleModal" class="modal lender-admin-modal modal-top">
                <div class="modal-content modal-md">
                    <div class="modal-header">
                        <h3>Add Manual Rule</h3>
                        <button class="modal-close" onclick="document.getElementById('manualRuleModal').remove()">×</button>
                    </div>
                    <div class="modal-body padded">
                        <div class="info-box">
                            <div class="info-box-label">Original Decline</div>
                            <div class="info-box-value">${this.escapeHtml(lenderName)}: ${this.escapeHtml(declineReason) || 'No reason'}</div>
                        </div>

                        <div class="lender-form-grid single-col">
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
                                <input type="text" id="manualRuleIndustry" class="form-input" value="${this.escapeHtml(industry)}" placeholder="e.g., Pawn Shops">
                            </div>

                            <div class="form-group">
                                <label class="field-label">State (if applicable)</label>
                                <input type="text" id="manualRuleState" class="form-input" value="${this.escapeHtml(state)}" placeholder="e.g., CA">
                            </div>

                            <div class="form-group">
                                <label class="field-label">Condition (for minimums)</label>
                                <div class="form-row">
                                    <select id="manualRuleField" class="form-input">
                                        <option value="">Field...</option>
                                        <option value="tib">Time in Business</option>
                                        <option value="revenue">Monthly Revenue</option>
                                        <option value="fico">FICO Score</option>
                                        <option value="position">Position</option>
                                    </select>
                                    <select id="manualRuleOperator" class="form-input select-sm">
                                        <option value="min">Min</option>
                                        <option value="max">Max</option>
                                    </select>
                                    <input type="number" id="manualRuleValue" class="form-input input-sm" placeholder="Value">
                                </div>
                            </div>

                            <div class="form-group">
                                <label class="field-label">Rule Description *</label>
                                <input type="text" id="manualRuleMessage" class="form-input" placeholder="e.g., Does not accept pawn shops">
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="document.getElementById('manualRuleModal').remove()">Cancel</button>
                        <button id="btnSaveManualRule" class="btn btn-primary" data-lender="${this.escapeHtml(lenderName)}" data-submission="${submissionId}">Save Rule</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        document.getElementById('btnSaveManualRule')?.addEventListener('click', (e) => {
            this.saveManualRule(e.target.dataset.lender, e.target.dataset.submission);
        });
    }

    async saveManualRule(lenderName, submissionId) {
        const ruleType = document.getElementById('manualRuleType')?.value;
        const message = document.getElementById('manualRuleMessage')?.value.trim();

        if (!ruleType || !message) {
            this.system.utils.showNotification('Please select a rule type and enter a description', 'error');
            return;
        }

        const data = {
            lender_name: lenderName,
            rule_type: ruleType,
            industry: document.getElementById('manualRuleIndustry')?.value.trim() || null,
            state: document.getElementById('manualRuleState')?.value.trim().toUpperCase() || null,
            condition_field: document.getElementById('manualRuleField')?.value || null,
            condition_operator: document.getElementById('manualRuleOperator')?.value || null,
            condition_value: document.getElementById('manualRuleValue')?.value || null,
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

            document.getElementById('manualRuleModal')?.remove();
            this.system.utils.showNotification(`Rule added for ${lenderName}`, 'success');
            this.loadNeedsReview();
        } catch (error) {
            console.error('Error saving manual rule:', error);
            this.system.utils.showNotification('Failed to save rule', 'error');
            btn.disabled = false;
            btn.textContent = 'Save Rule';
        }
    }

    async dismiss(id) {
        if (!confirm("Dismiss this decline? It won't show up for review again.")) return;

        try {
            await this.system.apiCall(`/api/lenders/decline/${id}/dismiss`, {
                method: 'POST'
            });
            this.loadNeedsReview();
        } catch (error) {
            console.error('Error dismissing:', error);
            this.system.utils.showNotification('Failed to dismiss', 'error');
        }
    }

    // ==========================================
    // UTILITIES
    // ==========================================

    getBadgeClass(type) {
        const classes = {
            industry_block: 'badge-industry',
            state_block: 'badge-state',
            minimum_requirement: 'badge-minimum',
            position_restriction: 'badge-position',
            other: 'badge-other'
        };
        return classes[type] || 'badge-other';
    }

    formatRuleType(type) {
        return (type || 'unknown').replace('_', ' ').toUpperCase();
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

window.LenderRules = LenderRules;
