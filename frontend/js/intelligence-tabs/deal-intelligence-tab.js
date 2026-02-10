export class DealIntelligenceTab {
    constructor(parent) {
        this.parent = parent;
        this.isAnalyzing = false;
        this.currentStrategy = null;
        this.currentScenarios = [];
    }

    async render(container) {
        const conv = this.parent.getSelectedConversation();

        if (!conv) {
            container.innerHTML = '<div class="di-empty">No conversation selected.</div>';
            return;
        }

        container.innerHTML = '<div class="di-loading"><div class="loading-spinner"></div><p>Loading strategy...</p></div>';

        // Fetch strategy
        let strategy = null;
        let scenarios = [];

        try {
            const [strategyRes, scenariosRes] = await Promise.all([
                this.parent.apiCall(`/api/strategies/${conv.id}`),
                this.parent.apiCall(`/api/strategies/${conv.id}/scenarios`)
            ]);

            if (strategyRes.success) strategy = strategyRes.strategy;
            if (scenariosRes.success) scenarios = scenariosRes.scenarios || [];
        } catch (e) {
            console.error('Failed to load strategy:', e);
        }

        // Store for modal use
        this.currentStrategy = strategy;
        this.currentScenarios = scenarios;

        // Empty state
        if (!strategy) {
            container.innerHTML = `
                <div class="di-empty">
                    <div class="di-empty-icon">📊</div>
                    <p>No strategy analysis yet.</p>
                    <button id="runAnalysisBtn" class="di-btn primary">Run Strategy Analysis</button>
                    <p id="analysisStatus" class="di-status"></p>
                </div>
            `;
            container.querySelector('#runAnalysisBtn')?.addEventListener('click', () => this.runAnalysis(conv.id));
            return;
        }

        // Parse game_plan
        let gamePlan = strategy.game_plan || {};
        if (typeof gamePlan === 'string') {
            try { gamePlan = JSON.parse(gamePlan); } catch(e) { gamePlan = {}; }
        }

        const stacking = gamePlan.stacking_assessment || {};
        const nextPos = stacking.next_position_number || (strategy.current_positions + 1) || 1;

        // Compact summary view
        container.innerHTML = `
            <div class="di-summary">

                <!-- Header Row -->
                <div class="di-summary-header">
                    <div class="di-badges">
                        <span class="di-grade grade-${strategy.lead_grade || 'C'}">${strategy.lead_grade || '?'}</span>
                        <span class="di-strategy-badge ${(strategy.strategy_type || '').toLowerCase()}">${(strategy.strategy_type || 'PENDING').replace('_', ' ')}</span>
                    </div>
                    <span class="di-position-badge">${nextPos}${this.ordinal(nextPos)} Position</span>
                </div>

                <!-- Recommended Offer Card -->
                <div class="di-offer-card">
                    <div class="di-offer-label">Recommended Offer</div>
                    <div class="di-offer-amount">$${parseFloat(strategy.recommended_funding_max || 0).toLocaleString()}</div>
                    <div class="di-offer-details">
                        <span>${strategy.recommended_term || '-'} ${strategy.recommended_term_unit || 'weeks'}</span>
                        <span class="di-separator">•</span>
                        <span>$${parseFloat(strategy.recommended_payment || 0).toLocaleString()}/wk</span>
                        <span class="di-separator">•</span>
                        <span>${gamePlan.recommended_factor || '-'}x</span>
                    </div>
                </div>

                <!-- Quick Stats -->
                <div class="di-stats-grid">
                    <div class="di-stat">
                        <span class="di-stat-value">$${parseFloat(strategy.avg_revenue || 0).toLocaleString()}</span>
                        <span class="di-stat-label">Avg Revenue</span>
                    </div>
                    <div class="di-stat">
                        <span class="di-stat-value">${strategy.current_positions ?? 0}</span>
                        <span class="di-stat-label">Positions</span>
                    </div>
                    <div class="di-stat">
                        <span class="di-stat-value">${parseFloat(strategy.total_withholding || 0).toFixed(1)}%</span>
                        <span class="di-stat-label">Withholding</span>
                    </div>
                    <div class="di-stat">
                        <span class="di-stat-value">$${parseFloat(strategy.avg_balance || 0).toLocaleString()}</span>
                        <span class="di-stat-label">Avg Balance</span>
                    </div>
                </div>

                <!-- Quick Flags -->
                ${(gamePlan.red_flags?.length > 0) ? `
                    <div class="di-quick-flags">
                        <span class="di-flag-icon">⚠️</span>
                        <span>${gamePlan.red_flags.length} red flag${gamePlan.red_flags.length > 1 ? 's' : ''} identified</span>
                    </div>
                ` : ''}

                <!-- Action Buttons -->
                <div class="di-actions">
                    <button id="viewFullAnalysisBtn" class="di-btn primary">
                        <span>📋</span> Full Analysis
                    </button>
                    <button id="buildOfferEmailBtn" class="di-btn primary" style="background: linear-gradient(135deg, #0f3460, #1a1a2e);">
                        <span>📧</span> Build Offer Email
                    </button>
                    <button id="rerunAnalysisBtn" class="di-btn secondary">
                        <span>🔄</span> Re-run
                    </button>
                </div>

            </div>
        `;

        // Event listeners
        container.querySelector('#viewFullAnalysisBtn')?.addEventListener('click', () => this.openFullAnalysisModal());
        container.querySelector('#buildOfferEmailBtn')?.addEventListener('click', () => this.openOfferBuilder());
        container.querySelector('#rerunAnalysisBtn')?.addEventListener('click', () => this.runAnalysis(conv.id));
    }

    openOfferBuilder() {
        const conv = this.parent.getSelectedConversation();
        const strategy = this.currentStrategy;

        let gamePlan = strategy?.game_plan || {};
        if (typeof gamePlan === 'string') {
            try { gamePlan = JSON.parse(gamePlan); } catch(e) { gamePlan = {}; }
        }

        const stacking = gamePlan.stacking_assessment || {};
        const nextPos = stacking.next_position_number || (strategy?.current_positions + 1) || 1;

        // Pre-fill data from strategy
        const prefill = {
            businessName: conv?.business_name || '',
            contactName: conv?.first_name ? `${conv.first_name} ${conv.last_name || ''}`.trim() : (conv?.contact_name || ''),
            position: String(nextPos),
            approvedAmount: strategy?.recommended_funding_max || '',
            payment: strategy?.recommended_payment || '',
            term: strategy?.recommended_term || '',
            termUnit: strategy?.recommended_term_unit || 'weeks',
            factor: gamePlan.recommended_factor || ''
        };

        // Remove existing modal
        document.getElementById('offerBuilderModal')?.remove();

        const modalHtml = `
            <div id="offerBuilderModal" class="di-modal-overlay">
                <div class="di-modal" style="max-width: 1100px; height: 85vh;">
                    <div class="di-modal-header">
                        <div class="di-modal-title">
                            <span>📧</span>
                            <span>Offer Email Builder</span>
                            <span style="font-size: 12px; color: #8b949e; font-weight: 400; margin-left: 8px;">${prefill.businessName}</span>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <button class="di-btn primary" id="offerCopyBtn" style="font-size: 12px; padding: 6px 14px;">
                                <span>📋</span> Copy HTML
                            </button>
                            <button class="di-btn secondary" id="offerDownloadBtn" style="font-size: 12px; padding: 6px 14px;">
                                <span>⬇️</span> Download
                            </button>
                            <button class="di-btn primary" id="offerSendBtn" style="font-size: 12px; padding: 6px 14px; background: #2ea043;">
                                <span>✉️</span> Send
                            </button>
                            <button class="di-modal-close" id="offerCloseBtn">×</button>
                        </div>
                    </div>

                    <div class="di-modal-body" style="display: flex; padding: 0; overflow: hidden;">
                        <!-- Form -->
                        <div id="offerFormPane" style="width: 380px; flex-shrink: 0; overflow-y: auto; padding: 20px; border-right: 1px solid #30363d;">

                            <div style="margin-bottom: 20px;">
                                <div class="di-section-header" style="margin-bottom: 12px;">Deal Info</div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                    <div style="grid-column: 1 / -1;">
                                        <label class="ob-label">Business Name</label>
                                        <input class="ob-input" id="obBusiness" value="${this.escHtml(prefill.businessName)}">
                                    </div>
                                    <div>
                                        <label class="ob-label">Contact Name</label>
                                        <input class="ob-input" id="obContact" value="${this.escHtml(prefill.contactName)}">
                                    </div>
                                    <div>
                                        <label class="ob-label">Recipient Email</label>
                                        <input class="ob-input" id="obEmail" value="${this.escHtml(conv?.email || '')}" placeholder="client@email.com">
                                    </div>
                                    <div style="grid-column: 1 / -1;">
                                        <label class="ob-label">Email Subject</label>
                                        <input class="ob-input" id="obSubject" value="Your Funding Offer - ${this.escHtml(prefill.businessName || 'JMS Global')}">
                                    </div>
                                    <div>
                                        <label class="ob-label">Position</label>
                                        <input class="ob-input" id="obPosition" value="${prefill.position}">
                                    </div>
                                    <div>
                                        <label class="ob-label"># Payments</label>
                                        <input class="ob-input" id="obPayments" value="${prefill.term}" placeholder="24">
                                    </div>
                                    <div>
                                        <label class="ob-label">Frequency</label>
                                        <select class="ob-input" id="obFrequency">
                                            <option value="daily" ${prefill.termUnit === 'days' ? 'selected' : ''}>Daily</option>
                                            <option value="weekly" ${prefill.termUnit === 'weeks' ? 'selected' : ''}>Weekly</option>
                                            <option value="bi-weekly">Bi-Weekly</option>
                                            <option value="monthly">Monthly</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div style="margin-bottom: 20px;">
                                <div style="margin-bottom: 12px;">
                                    <div class="di-section-header" style="margin: 0;">Offer Details</div>
                                </div>
                                <div id="obTiersContainer"></div>
                            </div>

                            <div>
                                <label class="ob-label">Notes (optional)</label>
                                <textarea class="ob-input" id="obNotes" rows="3" style="resize: vertical;" placeholder="Subject to review of most recent bank statements..."></textarea>
                            </div>
                        </div>

                        <!-- Preview -->
                        <div style="flex: 1; overflow-y: auto; background: #d1d5db; padding: 24px;">
                            <div id="obPreview" style="max-width: 620px; margin: 0 auto;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Init tiers with pre-filled data
        this._offerTiers = [{
            approved: prefill.approvedAmount,
            factorRate: prefill.factor,
            payback: '',
            payment: prefill.payment,
            commission: '',
            points: '0'
        }];

        this._renderOfferTiers();
        this._updateOfferPreview();

        // Event listeners
        document.getElementById('offerCloseBtn').addEventListener('click', () => {
            document.getElementById('offerBuilderModal')?.remove();
        });
        document.getElementById('offerBuilderModal').addEventListener('click', (e) => {
            if (e.target.id === 'offerBuilderModal') e.target.remove();
        });
        document.getElementById('offerFormPane').addEventListener('input', (e) => {
            if (e.target.dataset.tier !== undefined) {
                const idx = parseInt(e.target.dataset.tier);
                const field = e.target.dataset.field;
                this._offerTiers[idx][field] = e.target.value;

                // Auto-calc in next frame to avoid focus loss
                requestAnimationFrame(() => {
                    const tier = this._offerTiers[idx];
                    const approved = parseFloat(tier.approved);
                    const factor = parseFloat(tier.factorRate);
                    const payments = parseFloat(document.getElementById('obPayments')?.value);

                    if (field === 'approved' || field === 'factorRate') {
                        if (!isNaN(approved) && !isNaN(factor)) {
                            tier.payback = (approved * factor).toFixed(2);
                            const pbInput = document.querySelector(`[data-tier="${idx}"][data-field="payback"]`);
                            if (pbInput && pbInput !== document.activeElement) pbInput.value = tier.payback;

                            if (!isNaN(payments) && payments > 0) {
                                tier.payment = (approved * factor / payments).toFixed(2);
                                const pmInput = document.querySelector(`[data-tier="${idx}"][data-field="payment"]`);
                                if (pmInput && pmInput !== document.activeElement) pmInput.value = tier.payment;
                            }
                        }
                    }

                    if (field === 'payback') {
                        if (!isNaN(payments) && payments > 0 && !isNaN(parseFloat(tier.payback))) {
                            tier.payment = (parseFloat(tier.payback) / payments).toFixed(2);
                            const pmInput = document.querySelector(`[data-tier="${idx}"][data-field="payment"]`);
                            if (pmInput && pmInput !== document.activeElement) pmInput.value = tier.payment;
                        }
                    }
                });
            }

            // Also recalc when # payments changes
            if (e.target.id === 'obPayments') {
                requestAnimationFrame(() => {
                    const payments = parseFloat(e.target.value);
                    if (!isNaN(payments) && payments > 0) {
                        this._offerTiers.forEach((tier, idx) => {
                            const payback = parseFloat(tier.payback);
                            if (!isNaN(payback)) {
                                tier.payment = (payback / payments).toFixed(2);
                                const pmInput = document.querySelector(`[data-tier="${idx}"][data-field="payment"]`);
                                if (pmInput && pmInput !== document.activeElement) pmInput.value = tier.payment;
                            }
                        });
                    }
                });
            }

            this._debounce(() => this._updateOfferPreview());
        });
        document.getElementById('offerCopyBtn').addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(this._generateOfferHTML());
                const btn = document.getElementById('offerCopyBtn');
                btn.innerHTML = '<span>✓</span> Copied!';
                setTimeout(() => { btn.innerHTML = '<span>📋</span> Copy HTML'; }, 2000);
            } catch { alert('Copy failed'); }
        });
        document.getElementById('offerDownloadBtn').addEventListener('click', () => {
            const biz = document.getElementById('obBusiness').value || 'offer';
            const blob = new Blob([this._generateOfferHTML()], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `offer-${biz.replace(/\\s+/g, '-').toLowerCase()}.html`;
            a.click();
            URL.revokeObjectURL(url);
        });
        document.getElementById('offerSendBtn').addEventListener('click', async () => {
            const to = prompt('Recipient email address:');
            if (!to) return;
            const subject = document.getElementById('obSubject')?.value || `Your Funding Offer - JMS Global`;
            if (subject === null) return;

            const btn = document.getElementById('offerSendBtn');
            btn.innerHTML = '<span>⏳</span> Sending...';
            btn.disabled = true;

            try {
                const res = await this.parent.apiCall('/api/send-offer-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ to, subject, html: this._generateOfferHTML() })
                });
                if (res.success) {
                    btn.innerHTML = '<span>✅</span> Sent!';
                    setTimeout(() => { btn.innerHTML = '<span>✉️</span> Send'; btn.disabled = false; }, 3000);
                } else {
                    throw new Error(res.error);
                }
            } catch (err) {
                alert('Send failed: ' + err.message);
                btn.innerHTML = '<span>✉️</span> Send';
                btn.disabled = false;
            }
        });
    }

    escHtml(s) {
        if (!s) return '';
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');
    }

    _renderOfferTiers() {
        const container = document.getElementById('obTiersContainer');
        if (!container) return;
        container.innerHTML = this._offerTiers.map((o, i) => `
            <div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 12px; margin-bottom: 8px; position: relative;">
                ${this._offerTiers.length > 1 ? `<button onclick="document.getElementById('obTiersContainer').dispatchEvent(new CustomEvent('remove-tier', {detail:${i}}))" style="position:absolute;top:6px;right:8px;background:none;border:none;color:#f85149;cursor:pointer;font-size:16px;">×</button>` : ''}
                <div style="font-size: 10px; color: #6b7280; margin-bottom: 8px; font-weight: 600;">TIER ${i + 1}</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                    <div><label class="ob-label">Approved $</label><input class="ob-input" data-tier="${i}" data-field="approved" value="${o.approved}" placeholder="32000"></div>
                    <div><label class="ob-label">Factor</label><input class="ob-input" data-tier="${i}" data-field="factorRate" value="${o.factorRate}" placeholder="1.38"></div>
                    <div><label class="ob-label">Payback $</label><input class="ob-input" data-tier="${i}" data-field="payback" value="${o.payback}" placeholder="44160"></div>
                    <div><label class="ob-label">Payment $</label><input class="ob-input" data-tier="${i}" data-field="payment" value="${o.payment}" placeholder="1840"></div>
                </div>
            </div>
        `).join('');

        container.addEventListener('remove-tier', (e) => {
            this._offerTiers.splice(e.detail, 1);
            this._renderOfferTiers();
            this._updateOfferPreview();
        });
    }

    _fmtMoney(v) {
        const n = parseFloat(v);
        return isNaN(n) ? '$0.00' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    _debounce(fn, ms = 300) {
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(fn, ms);
    }

    _updateOfferPreview() {
        const el = document.getElementById('obPreview');
        if (!el) return;
        const focused = document.activeElement;
        el.innerHTML = this._generateOfferHTML();
        if (focused && focused.closest('#offerFormPane')) {
            focused.focus();
        }
    }

    _generateOfferHTML() {
        const biz = document.getElementById('obBusiness')?.value || '';
        const contact = document.getElementById('obContact')?.value || '';
        const position = document.getElementById('obPosition')?.value || '';
        const payments = document.getElementById('obPayments')?.value || '';
        const freq = document.getElementById('obFrequency')?.value || 'weekly';
        const notes = document.getElementById('obNotes')?.value || '';
        const tiers = this._offerTiers || [];
        const top = tiers[0] || {};

        return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:30px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);padding:30px 40px;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">JMS Global</h1>
<p style="margin:6px 0 0;color:#94a3b8;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Funding Solutions</p>
</td></tr>
<tr><td style="padding:30px 40px 10px;">
<p style="margin:0;color:#334155;font-size:15px;line-height:1.6;">${contact ? `Dear <strong>${contact}</strong>,` : 'Hello,'}</p>
<p style="margin:14px 0 0;color:#334155;font-size:15px;line-height:1.6;">We are pleased to present the following offer for <strong style="color:#0f3460;">${biz || 'Your Business'}</strong>.</p>
</td></tr>
<tr><td style="padding:20px 40px;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:2px solid #e2e8f0;border-radius:8px;overflow:hidden;">
<tr>
<td width="50%" style="padding:16px 20px;border-bottom:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
<span style="display:block;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Approved Amount</span>
<strong style="font-size:22px;color:#0f3460;">${this._fmtMoney(top.approved)}</strong>
</td>
<td width="50%" style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
<span style="display:block;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Position</span>
<strong style="font-size:22px;color:#334155;">${position || '—'}</strong>
</td>
</tr>
<tr>
<td width="50%" style="padding:16px 20px;border-right:1px solid #e2e8f0;">
<span style="display:block;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Number of Payments</span>
<strong style="font-size:22px;color:#334155;">${payments || '—'}</strong>
</td>
<td width="50%" style="padding:16px 20px;">
<span style="display:block;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Payment Frequency</span>
<strong style="font-size:22px;color:#334155;text-transform:capitalize;">${freq}</strong>
</td>
</tr>
</table>
</td></tr>
<tr><td style="padding:10px 40px 0;">
<p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#0f3460;text-transform:uppercase;letter-spacing:0.5px;">Offer Breakdown</p>
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
<tr style="background:#0f3460;">
<th style="padding:10px 12px;color:#fff;font-size:11px;text-align:left;text-transform:uppercase;">Approved</th>
<th style="padding:10px 12px;color:#fff;font-size:11px;text-align:center;text-transform:uppercase;">Factor</th>
<th style="padding:10px 12px;color:#fff;font-size:11px;text-align:center;text-transform:uppercase;">Payback</th>
<th style="padding:10px 12px;color:#fff;font-size:11px;text-align:center;text-transform:uppercase;">Payment</th>
</tr>
${tiers.map((o, i) => `<tr style="background:${i % 2 === 0 ? '#f8fafc' : '#ffffff'};">
<td style="padding:10px 12px;font-size:13px;color:#334155;border-bottom:1px solid #e2e8f0;">${this._fmtMoney(o.approved)}</td>
<td style="padding:10px 12px;font-size:13px;color:#334155;border-bottom:1px solid #e2e8f0;text-align:center;">${o.factorRate || '—'}</td>
<td style="padding:10px 12px;font-size:13px;color:#334155;border-bottom:1px solid #e2e8f0;text-align:center;">${this._fmtMoney(o.payback)}</td>
<td style="padding:10px 12px;font-size:13px;color:#334155;border-bottom:1px solid #e2e8f0;text-align:center;">${this._fmtMoney(o.payment)}</td>
</tr>`).join('')}
</table>
</td></tr>
${notes ? `<tr><td style="padding:16px 40px 0;"><p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px 16px;">${notes}</p></td></tr>` : ''}
<tr><td style="padding:30px 40px;text-align:center;">
<p style="margin:0 0 16px;font-size:14px;color:#334155;">Ready to move forward? Reply to this email or call us directly.</p>
</td></tr>
<tr><td style="background:#1a1a2e;padding:24px 40px;text-align:center;">
<p style="margin:0;color:#94a3b8;font-size:12px;">JMS Global Enterprises Inc.</p>
<p style="margin:6px 0 0;color:#64748b;font-size:11px;">This offer is subject to final review and approval.</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
    }

    openFullAnalysisModal() {
        const strategy = this.currentStrategy;
        const scenarios = this.currentScenarios;

        if (!strategy) return;

        // Parse game_plan
        let gamePlan = strategy.game_plan || {};
        if (typeof gamePlan === 'string') {
            try { gamePlan = JSON.parse(gamePlan); } catch(e) { gamePlan = {}; }
        }

        const withholding = gamePlan.withholding_analysis || {};
        const trend = gamePlan.revenue_trend || {};
        const stacking = gamePlan.stacking_assessment || {};
        const guidance = gamePlan.next_position_guidance || {};
        const redFlags = gamePlan.red_flags || [];
        const talkingPoints = gamePlan.talking_points || [];
        const riskConsiderations = gamePlan.risk_considerations || [];

        const nextPos = stacking.next_position_number || (strategy.current_positions + 1) || 1;

        // Remove existing modal if any
        document.getElementById('diAnalysisModal')?.remove();

        const modalHtml = `
            <div id="diAnalysisModal" class="di-modal-overlay">
                <div class="di-modal">
                    <div class="di-modal-header">
                        <div class="di-modal-title">
                            <span class="di-grade grade-${strategy.lead_grade || 'C'}">${strategy.lead_grade || '?'}</span>
                            <span>Deal Intelligence Report</span>
                        </div>
                        <button class="di-modal-close" onclick="document.getElementById('diAnalysisModal').remove()">×</button>
                    </div>

                    <div class="di-modal-body">

                        <!-- Strategy Header -->
                        <div class="di-modal-section">
                            <div class="di-modal-row">
                                <div class="di-modal-stat">
                                    <span class="label">Strategy</span>
                                    <span class="value ${(strategy.strategy_type || '').toLowerCase()}">${(strategy.strategy_type || 'PENDING').replace('_', ' ')}</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">Next Position</span>
                                    <span class="value">${nextPos}${this.ordinal(nextPos)}</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">Avg Revenue</span>
                                    <span class="value">$${parseFloat(strategy.avg_revenue || 0).toLocaleString()}</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">Current Withhold</span>
                                    <span class="value">${parseFloat(strategy.total_withholding || 0).toFixed(1)}%</span>
                                </div>
                            </div>
                        </div>

                        <!-- Recommended Offer -->
                        <div class="di-modal-section">
                            <div class="di-section-header">💰 Recommended Offer</div>
                            <div class="di-modal-row">
                                <div class="di-modal-stat highlight">
                                    <span class="label">Funding</span>
                                    <span class="value">$${parseFloat(strategy.recommended_funding_max || 0).toLocaleString()}</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">Term</span>
                                    <span class="value">${strategy.recommended_term || '-'} ${strategy.recommended_term_unit || 'weeks'}</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">Payment</span>
                                    <span class="value">$${parseFloat(strategy.recommended_payment || 0).toLocaleString()}</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">Factor</span>
                                    <span class="value">${gamePlan.recommended_factor || '-'}</span>
                                </div>
                            </div>
                            <div class="di-modal-row">
                                <div class="di-modal-stat">
                                    <span class="label">Offer Range</span>
                                    <span class="value">$${parseFloat(strategy.recommended_funding_min || 0).toLocaleString()} - $${parseFloat(strategy.recommended_funding_max || 0).toLocaleString()}</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">Add Withhold</span>
                                    <span class="value">+${withholding.recommended_addition_pct || '?'}%</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">New Total</span>
                                    <span class="value">${(withholding.new_total_withholding_pct || 0).toFixed(1)}%</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">Frequency</span>
                                    <span class="value">${guidance.payment_frequency || 'weekly'}</span>
                                </div>
                            </div>
                            ${withholding.capacity_reasoning ? `<div class="di-note">${withholding.capacity_reasoning}</div>` : ''}
                        </div>

                        <!-- Revenue Trend -->
                        ${trend.direction ? `
                        <div class="di-modal-section">
                            <div class="di-section-header">📈 Revenue Trend</div>
                            <div class="di-modal-row">
                                <div class="di-modal-stat">
                                    <span class="label">Direction</span>
                                    <span class="value trend-${trend.direction}">${trend.direction}</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">Floor Month</span>
                                    <span class="value">$${(trend.floor_month?.amount || 0).toLocaleString()} (${trend.floor_month?.month || '?'})</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">Funding Ceiling</span>
                                    <span class="value">$${(trend.funding_ceiling || 0).toLocaleString()}</span>
                                </div>
                            </div>
                            ${trend.trend_reasoning ? `<div class="di-note">${trend.trend_reasoning}</div>` : ''}
                        </div>
                        ` : ''}

                        <!-- Active Positions -->
                        ${withholding.position_breakdown?.length > 0 ? `
                        <div class="di-modal-section">
                            <div class="di-section-header">📍 Active Positions (${strategy.current_positions || withholding.position_breakdown.length})</div>
                            <table class="di-table">
                                <thead>
                                    <tr><th>Lender</th><th>Payment</th><th>Frequency</th><th>Withhold %</th></tr>
                                </thead>
                                <tbody>
                                    ${withholding.position_breakdown.map(p => `
                                        <tr>
                                            <td>${p.lender}</td>
                                            <td>$${(p.payment || 0).toLocaleString()}</td>
                                            <td>${p.frequency}</td>
                                            <td>${(p.withhold_pct || 0).toFixed(1)}%</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        ` : ''}

                        <!-- Scenarios -->
                        ${scenarios.length > 0 ? `
                        <div class="di-modal-section">
                            <div class="di-section-header">🎯 Position Scenarios</div>
                            <div class="di-scenarios-grid">
                                ${this.renderScenarioCard(scenarios, 'conservative', 'Conservative')}
                                ${this.renderScenarioCard(scenarios, 'moderate', 'Moderate')}
                                ${this.renderScenarioCard(scenarios, 'aggressive', 'Aggressive')}
                            </div>
                        </div>
                        ` : ''}

                        <!-- Red Flags -->
                        ${redFlags.length > 0 ? `
                        <div class="di-modal-section warning">
                            <div class="di-section-header">⚠️ Red Flags</div>
                            <ul class="di-list">
                                ${redFlags.map(f => `<li>${f}</li>`).join('')}
                            </ul>
                        </div>
                        ` : ''}

                        <!-- Talking Points -->
                        ${talkingPoints.length > 0 ? `
                        <div class="di-modal-section">
                            <div class="di-section-header">💬 Talking Points</div>
                            <ul class="di-list">
                                ${talkingPoints.map(t => `<li>${t}</li>`).join('')}
                            </ul>
                        </div>
                        ` : ''}

                        <!-- Strategy Details -->
                        ${gamePlan.approach || gamePlan.next_action ? `
                        <div class="di-modal-section">
                            <div class="di-section-header">📋 Strategy Details</div>
                            ${gamePlan.approach ? `<div class="di-note"><strong>Approach:</strong> ${gamePlan.approach}</div>` : ''}
                            ${gamePlan.next_action ? `<div class="di-note"><strong>Next Action:</strong> ${gamePlan.next_action}</div>` : ''}
                            ${gamePlan.urgency_angle ? `<div class="di-note"><strong>Urgency Angle:</strong> ${gamePlan.urgency_angle}</div>` : ''}
                            ${gamePlan.objection_strategy ? `<div class="di-note"><strong>Objection Handling:</strong> ${gamePlan.objection_strategy}</div>` : ''}
                        </div>
                        ` : ''}

                        <!-- Risk Considerations -->
                        ${riskConsiderations.length > 0 ? `
                        <div class="di-modal-section">
                            <div class="di-section-header">⚡ Risk Considerations</div>
                            <ul class="di-list">
                                ${riskConsiderations.map(r => `<li>${r}</li>`).join('')}
                            </ul>
                        </div>
                        ` : ''}

                        <!-- Lender Notes -->
                        ${gamePlan.lender_notes ? `
                        <div class="di-modal-section">
                            <div class="di-section-header">🏦 Lender Notes</div>
                            <div class="di-note">${gamePlan.lender_notes}</div>
                        </div>
                        ` : ''}

                        <!-- Stacking Assessment -->
                        ${stacking.stacking_notes ? `
                        <div class="di-modal-section">
                            <div class="di-section-header">📊 Stacking Assessment</div>
                            <div class="di-modal-row">
                                <div class="di-modal-stat">
                                    <span class="label">Can Stack</span>
                                    <span class="value ${stacking.can_stack ? 'yes' : 'no'}">${stacking.can_stack ? 'Yes' : 'No'}</span>
                                </div>
                                <div class="di-modal-stat">
                                    <span class="label">Term Cap</span>
                                    <span class="value">${stacking.term_cap_weeks || '-'} weeks</span>
                                </div>
                            </div>
                            <div class="di-note">${stacking.stacking_notes}</div>
                        </div>
                        ` : ''}

                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Close on backdrop click
        document.getElementById('diAnalysisModal').addEventListener('click', (e) => {
            if (e.target.id === 'diAnalysisModal') {
                e.target.remove();
            }
        });
    }

    renderScenarioCard(scenarios, tier, title) {
        const filtered = scenarios.filter(s => s.tier === tier);
        if (filtered.length === 0) return '';

        return `
            <div class="di-scenario-card ${tier}">
                <div class="di-scenario-title">${title}</div>
                ${filtered.map(s => `
                    <div class="di-scenario-row">
                        <span class="funding">$${parseFloat(s.funding_amount || 0).toLocaleString()}</span>
                        <span class="term">${s.term}${s.term_unit === 'weeks' ? 'w' : 'd'}</span>
                        <span class="payment">$${parseFloat(s.payment_amount || 0).toLocaleString()}</span>
                        <span class="withhold">+${s.withhold_addition || 0}%</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    ordinal(n) {
        if (!n) return '';
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return (s[(v - 20) % 10] || s[v] || s[0]);
    }

    async runAnalysis(conversationId) {
        const btn = document.getElementById('runAnalysisBtn') || document.getElementById('rerunAnalysisBtn');
        const status = document.getElementById('analysisStatus');

        if (!btn || this.isAnalyzing) return;

        this.isAnalyzing = true;
        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="loading-spinner small"></span> Analyzing...';

        if (status) status.textContent = 'Running Commander AI...';

        try {
            const response = await this.parent.apiCall(`/api/commander/${conversationId}/analyze`, {
                method: 'POST'
            });

            if (response.success) {
                if (status) status.textContent = 'Done. Reloading...';
                const renderContainer = document.querySelector('[data-tab-content="deal-intelligence"]') ||
                                  document.getElementById('intelligenceContent');
                if (renderContainer) this.render(renderContainer);
            } else {
                throw new Error(response.error || 'Analysis failed');
            }
        } catch (error) {
            console.error('Analysis error:', error);
            if (status) status.textContent = `Error: ${error.message}`;
            btn.disabled = false;
            btn.innerHTML = originalText;
        }

        this.isAnalyzing = false;
    }
}
