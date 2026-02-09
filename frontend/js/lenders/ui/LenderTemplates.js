/**
 * LenderTemplates.js
 * Pure functions that return HTML strings for the Lender Interface.
 */

// Utility: Prevent XSS
const escapeHtml = (str) => {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

export const LenderTemplates = {

    // ==========================================
    // 1. LENDER FORM & HEADER
    // ==========================================

    renderHeader() {
        return `<div class="lender-header"></div>`;
    },

    /**
     * Renders the main qualification form
     * @param {Object} conversationData - Data to pre-fill
     * @param {Array} fields - Array of field config objects
     * @param {Array} checkboxes - Array of checkbox config objects
     */
    renderForm(conversationData, fields, checkboxes) {
        const businessName = conversationData?.business_name || '';
        const revenue = conversationData?.monthly_revenue || '';

        // Helper to render a specific field
        const renderFieldHTML = (fieldId, value = '', spanClass = '') => {
            const field = fields.find(f => f.id === fieldId);
            if (!field) return '';

            const requiredMark = field.required ? '<span class="required">*</span>' : '';
            let inputHtml = '';

            if (field.type === 'select') {
                const optionsHtml = field.options.map(opt =>
                    `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.label}</option>`
                ).join('');

                inputHtml = `
                    <select id="${field.id}" class="form-select" ${field.required ? 'required' : ''}>
                        ${optionsHtml}
                    </select>`;
            } else {
                inputHtml = `
                    <input type="${field.type}"
                           id="${field.id}"
                           class="form-input"
                           value="${value}"
                           placeholder="${field.placeholder || ''}"
                           ${field.required ? 'required' : ''} ${field.readonly ? 'readonly' : ''}>`;
            }

            // Special handling for TIB Display
            const extraHtml = field.id === 'lenderStartDate'
                ? '<div id="lenderTibDisplay" class="tib-display hidden"></div>'
                : '';

            const wrapperClass = spanClass ? `${spanClass} lender-field-wrap` : 'lender-field-wrap';

            return `
                <div class="${wrapperClass}">
                    <div class="form-group">
                        <label for="${field.id}">${field.label} ${requiredMark}</label>
                        ${inputHtml}
                        ${extraHtml}
                    </div>
                </div>`;
        };

        const renderCheckboxHTML = (field) => `
            <label class="checkbox-label">
                <input type="checkbox" id="${field.id}">
                ${field.label}
            </label>`;

        return `
            <div class="lender-qualification-system lender-scroll-container">
                ${this.renderHeader()}
                <div class="lender-scroll-inner">
                    <div class="lender-form-scroll-area custom-scrollbar">
                        <form id="lenderForm">
                            <div class="lender-input-grid">
                                ${renderFieldHTML('lenderBusinessName', businessName, 'grid-span-2')}
                                ${renderFieldHTML('lenderPosition', '', '')}
                                ${renderFieldHTML('lenderRevenue', revenue, '')}
                                ${renderFieldHTML('lenderFico', '', '')}
                                ${renderFieldHTML('lenderState', '', '')}
                                ${renderFieldHTML('lenderIndustry', '', '')}
                                ${renderFieldHTML('lenderStartDate', '', '')}
                                ${renderFieldHTML('lenderDepositsPerMonth', '', '')}
                                ${renderFieldHTML('lenderNegativeDays', '', '')}
                                ${renderFieldHTML('lenderWithholding', '', '')}
                                <div></div>
                            </div>

                            <div class="checkbox-row-card lender-checkbox-card">
                                ${checkboxes.map(renderCheckboxHTML).join('')}
                            </div>

                            <div class="lender-section-spacer">
                                <label class="field-label lender-label-small">Current Positions</label>
                                <input type="text" id="lenderCurrentPositions" class="form-input">
                            </div>

                            <div>
                                <label class="field-label lender-label-small">Additional Notes</label>
                                <textarea id="lenderAdditionalNotes" class="form-textarea lender-notes-area"></textarea>
                            </div>

                            <div class="loading lender-status-loading" id="lenderLoading">Processing...</div>
                            <div class="error lender-status-error" id="lenderErrorMsg"></div>
                        </form>

                        <div id="lenderResults" class="lender-results"></div>
                    </div>

                    <div class="lender-form-footer">
                        <button type="button" id="clearLenderCacheBtn" class="lender-btn-link">Clear Form</button>
                        <button type="button" id="skipToSendBtn" class="btn btn-secondary lender-skip-btn">
                            <i class="fas fa-forward"></i> Skip to Send
                        </button>
                        <button type="button" onclick="document.getElementById('lenderForm').dispatchEvent(new Event('submit'))" class="btn btn-primary">
                            <span id="processLendersText">Process Qualification</span>
                            <span id="processLendersSpinner" class="hidden">...</span>
                        </button>
                    </div>
                </div>
            </div>`;
    },

    // ==========================================
    // 2. RESULTS DISPLAY
    // ==========================================

    renderResults(data) {
        const qualifiedCount = data.qualified?.length || 0;
        const nonQualifiedCount = data.nonQualified?.length || 0;

        let html = `
            <div class="lender-results-wrapper">
                <div class="lender-summary-container">
                    <div class="lender-stat-box">
                        <div class="lender-stat-number qualified">${qualifiedCount}</div>
                        <div class="lender-stat-label">Qualified</div>
                    </div>
                    <div class="lender-stat-box">
                        <div class="lender-stat-number non-qualified">${nonQualifiedCount}</div>
                        <div class="lender-stat-label">Non-Qualified</div>
                    </div>
                </div>`;

        // Qualified Section
        if (qualifiedCount > 0) {
            html += `
                <div class="lender-results-actions">
                    <button id="sendToLendersBtn" class="trigger-lender-modal btn btn-primary">
                        📧 Send to Lenders
                    </button>
                </div>
                <div class="lender-results-section">
                    <div class="qualified-section-header">✅ Qualified Lenders</div>
                    <div id="qualifiedSection">`;

            // Group by tiers
            const tiers = {};
            data.qualified.forEach(lender => {
                const tier = lender.tier || lender.Tier || 'Unranked';
                if (!tiers[tier]) tiers[tier] = [];
                tiers[tier].push(lender);
            });

            Object.keys(tiers).sort().forEach(tier => {
                html += `
                    <div class="tier-group">
                        <div class="tier-header">Tier ${escapeHtml(tier)}</div>
                        <div class="lender-grid">
                            ${tiers[tier].map(lender => this.renderLenderTag(lender)).join('')}
                        </div>
                    </div>`;
            });
            html += `</div></div>`;
        }

        // Non-Qualified Section
        if (nonQualifiedCount > 0) {
            html += `
                <div class="lender-results-section lender-results-section-spaced">
                    <button id="toggleNonQualified" class="non-qual-toggle" onclick="document.getElementById('nonQualList').style.display = document.getElementById('nonQualList').style.display === 'none' ? 'block' : 'none'">
                        ❌ View Non-Qualified Lenders (${nonQualifiedCount}) ▼
                    </button>
                    <div id="nonQualList" class="lender-nonqual-list">
                        ${data.nonQualified.map(item => `
                            <div class="non-qual-item">
                                <span class="lender-nonqual-name">${escapeHtml(item.lender)}</span>
                                <span class="non-qual-reason">${escapeHtml(item.blockingRule)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
        }

        html += `</div>`;
        return html;
    },

    renderLenderTag(lender) {
        const star = lender.isPreferred ? '⭐' : '';
        const lenderName = lender['Lender Name'] || lender.name;
        const safeLenderName = escapeHtml(lenderName);

        let rateHtml = '';
        if (lender.prediction && lender.prediction.successRate !== null) {
            const rateClass = lender.prediction.confidence || 'low';
            const factorsText = escapeHtml(lender.prediction.factors?.join(', ') || 'Historical data');
            rateHtml = `<span class="success-rate ${rateClass}" title="${factorsText}">${lender.prediction.successRate}%</span>`;
        }

        return `
            <div class="lender-tag" data-lender-name="${safeLenderName}">
                ${safeLenderName} ${rateHtml}<span>${star}</span>
                <button class="log-response-btn" data-lender="${safeLenderName}" title="Log Response">📝</button>
            </div>`;
    },

    // ==========================================
    // 3. RESPONSE MODAL
    // ==========================================

    renderResponseModal(lenderName, conversationId) {
        const safeLender = escapeHtml(lenderName);
        const safeId = escapeHtml(conversationId);

        return `
            <div class="modal-content lender-response-modal">
                <div class="modal-header">
                    <h3>Log Lender Response</h3>
                    <button id="closeLenderResponseModal" class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <input type="hidden" id="responseConversationId" value="${safeId}">
                    <input type="hidden" id="responseLenderName" value="${safeLender}">

                    <div class="form-group">
                        <label>Lender</label>
                        <input type="text" id="responseLenderDisplay" readonly class="form-input lender-response-display" value="${safeLender}">
                    </div>

                    <div class="form-group">
                        <label>Status</label>
                        <select id="responseStatus" class="form-input">
                            <option value="">Select...</option>
                            <option value="OFFER">Offer Received</option>
                            <option value="FUNDED">Funded</option>
                            <option value="DECLINE">Declined</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Position</label>
                        <select id="responsePosition" class="form-input">
                            <option value="">Select...</option>
                            ${Array.from({length: 10}, (_, i) => `<option value="${i+1}">${i+1}${['st','nd','rd'][i] || 'th'} Position</option>`).join('')}
                        </select>
                    </div>

                    <div id="offerFields" class="hidden">
                        <div class="form-section-header">New Offer Details</div>
                        <div class="form-row">
                            <div class="form-group half">
                                <label>Offer Amount ($)</label>
                                <input type="number" id="responseOfferAmount" class="form-input" placeholder="15000">
                            </div>
                            <div class="form-group half">
                                <label>Factor Rate</label>
                                <input type="text" id="responseFactorRate" class="form-input" placeholder="1.49">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group half">
                                <label>Term Length</label>
                                <input type="number" id="responseTermLength" class="form-input" placeholder="60">
                            </div>
                            <div class="form-group half">
                                <label>Term Unit</label>
                                <select id="responseTermUnit" class="form-input">
                                    <option value="Days">Days</option>
                                    <option value="Weeks">Weeks</option>
                                    <option value="Months">Months</option>
                                </select>
                            </div>
                        </div>
                         <div class="form-group">
                            <label>Payment Frequency</label>
                            <select id="responsePaymentFrequency" class="form-input">
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="bi-weekly">Bi-Weekly</option>
                                <option value="monthly">Monthly</option>
                            </select>
                        </div>
                    </div>

                    <div id="prevPositionFields" class="hidden">
                        <div class="form-section-header">Previous Position Info <span class="lender-optional-note">(optional)</span></div>
                        <div class="form-row">
                            <div class="form-group half">
                                <label>Amount ($)</label>
                                <input type="number" id="responsePrevAmount" class="form-input">
                            </div>
                             <div class="form-group half">
                                <label>Daily Withhold ($)</label>
                                <input type="number" id="responseDailyWithhold" class="form-input">
                            </div>
                        </div>
                    </div>

                    <div id="declineFields" class="hidden">
                        <div class="form-group">
                            <label>Decline Reason</label>
                            <textarea id="responseDeclineReason" class="form-input" rows="2" placeholder="e.g., Restricted industry"></textarea>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="cancelLenderResponse" class="btn btn-secondary">Cancel</button>
                    <button id="saveLenderResponse" class="btn btn-primary">Save Response</button>
                </div>
            </div>`;
    },

    renderSubmissionTracker(submissions) {
        if (!submissions || submissions.length === 0) return '';

        const statusConfig = {
            'OFFER':   { icon: '💰', color: '#2ea043', label: 'Offer' },
            'FUNDED':  { icon: '🎉', color: '#2ea043', label: 'Funded' },
            'DECLINE': { icon: '❌', color: '#f85149', label: 'Declined' },
            'DECLINED':{ icon: '❌', color: '#f85149', label: 'Declined' },
            'STIP':    { icon: '📋', color: '#d29922', label: 'Stips' },
            'sent':    { icon: '📤', color: '#8b949e', label: 'Sent' },
            'processing': { icon: '⏳', color: '#8b949e', label: 'Processing' },
            'failed':  { icon: '⚠️', color: '#f85149', label: 'Failed' }
        };

        const offers = submissions.filter(s => s.status === 'OFFER' || s.status === 'FUNDED').length;
        const declines = submissions.filter(s => s.status === 'DECLINE' || s.status === 'DECLINED').length;
        const pending = submissions.filter(s => s.status === 'sent' || s.status === 'processing').length;

        return `
            <div class="submission-tracker">
                <div class="submission-tracker-header">
                    <h4>📊 Submission Tracker</h4>
                    <div class="submission-stats-row">
                        <span class="sub-stat"><span class="sub-stat-num" style="color:#2ea043">${offers}</span> Offers</span>
                        <span class="sub-stat"><span class="sub-stat-num" style="color:#f85149">${declines}</span> Declined</span>
                        <span class="sub-stat"><span class="sub-stat-num" style="color:#8b949e">${pending}</span> Pending</span>
                    </div>
                </div>
                <div class="submission-list">
                    ${submissions.map(sub => {
                        const cfg = statusConfig[sub.status] || statusConfig['sent'];
                        const date = sub.last_response_at || sub.submitted_at;
                        const dateStr = date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

                        let detailStr = '';
                        if (sub.offer_amount) detailStr += '$' + Number(sub.offer_amount).toLocaleString();
                        if (sub.factor_rate) detailStr += ' @ ' + sub.factor_rate;
                        if (sub.term_length) detailStr += ' / ' + sub.term_length + ' ' + (sub.term_unit || 'days');
                        if (sub.decline_reason) detailStr = sub.decline_reason;

                        return `
                            <div class="submission-row" style="border-left: 3px solid ${cfg.color}">
                                <div class="submission-row-left">
                                    <span class="submission-icon">${cfg.icon}</span>
                                    <div class="submission-row-info">
                                        <div class="submission-lender-name">${escapeHtml(sub.lender_name)}</div>
                                        ${detailStr ? `<div class="submission-detail">${escapeHtml(detailStr)}</div>` : ''}
                                    </div>
                                </div>
                                <div class="submission-row-right">
                                    <span class="submission-status-badge" style="color:${cfg.color}">${cfg.label}</span>
                                    <span class="submission-date">${dateStr}</span>
                                </div>
                            </div>`;
                    }).join('')}
                </div>
            </div>`;
    }
};
