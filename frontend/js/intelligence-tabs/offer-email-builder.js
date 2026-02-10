export class OfferEmailBuilder {
    constructor(parent) {
        this.parent = parent;
        this._offerTiers = [];
        this._debounceTimer = null;
    }

    open(conv, strategy) {
        let gamePlan = strategy?.game_plan || {};
        if (typeof gamePlan === 'string') {
            try { gamePlan = JSON.parse(gamePlan); } catch (e) { gamePlan = {}; }
        }

        const stacking = gamePlan.stacking_assessment || {};
        const nextPos = stacking.next_position_number || (strategy?.current_positions + 1) || 1;

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
                        <div style="flex: 1; overflow-y: auto; background: #d1d5db; padding: 24px;">
                            <div id="obPreview" style="max-width: 620px; margin: 0 auto;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        this._offerTiers = [{
            approved: prefill.approvedAmount,
            factorRate: prefill.factor,
            payback: '',
            payment: prefill.payment
        }];

        this._renderTiers();
        this._updatePreview();
        this._bindEvents();
    }

    _bindEvents() {
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

            this._debounce(() => this._updatePreview());
        });
        document.getElementById('offerCopyBtn').addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(this._generateHTML());
                const btn = document.getElementById('offerCopyBtn');
                btn.innerHTML = '<span>✓</span> Copied!';
                setTimeout(() => { btn.innerHTML = '<span>📋</span> Copy HTML'; }, 2000);
            } catch { alert('Copy failed'); }
        });
        document.getElementById('offerDownloadBtn').addEventListener('click', () => {
            const biz = document.getElementById('obBusiness').value || 'offer';
            const blob = new Blob([this._generateHTML()], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `offer-${biz.replace(/\s+/g, '-').toLowerCase()}.html`;
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
                    body: JSON.stringify({ to, subject, html: this._generateHTML() })
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
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;');
    }

    _renderTiers() {
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
            this._renderTiers();
            this._updatePreview();
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

    _updatePreview() {
        const el = document.getElementById('obPreview');
        if (!el) return;
        const focused = document.activeElement;
        el.innerHTML = this._generateHTML();
        if (focused && focused.closest('#offerFormPane')) {
            focused.focus();
        }
    }

    _generateHTML() {
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
}
