// frontend/js/offer-builder.js
// =============================================
// OFFER EMAIL BUILDER
// =============================================

let offerTiers = [{ approved: '', factorRate: '', payback: '', payment: '', commission: '', points: '' }];

function openOfferBuilder() {
    const modal = document.getElementById('offerBuilderModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    renderOfferTiers();
    updateOfferPreview();
}

function closeOfferBuilder() {
    const modal = document.getElementById('offerBuilderModal');
    if (!modal) return;
    modal.classList.add('hidden');
}

// Auto-fill from current conversation if one is open
function openOfferBuilderFromDeal() {
    const name = document.getElementById('currentContactName')?.textContent;
    if (name && name !== 'Select a Conversation') {
        const businessInput = document.getElementById('offerBusiness');
        if (businessInput) businessInput.value = name;
    }
    openOfferBuilder();
}

function addOfferTier() {
    offerTiers.push({ approved: '', factorRate: '', payback: '', payment: '', commission: '', points: '' });
    renderOfferTiers();
    updateOfferPreview();
}

function removeOfferTier(i) {
    if (offerTiers.length <= 1) return;
    offerTiers.splice(i, 1);
    renderOfferTiers();
    updateOfferPreview();
}

function renderOfferTiers() {
    const container = document.getElementById('offerTiersContainer');
    if (!container) return;
    container.innerHTML = offerTiers.map((o, i) => `
        <div class="offer-tier">
            ${offerTiers.length > 1 ? `<button class="offer-tier-remove" onclick="removeOfferTier(${i})">×</button>` : ''}
            <div style="font-size: 10px; color: #6b7280; margin-bottom: 8px; font-weight: 600;">TIER ${i + 1}</div>
            <div class="offer-tier-grid">
                <div><label class="offer-label">Approved $</label><input class="offer-input" data-tier="${i}" data-field="approved" value="${o.approved}" placeholder="32000"></div>
                <div><label class="offer-label">Factor Rate</label><input class="offer-input" data-tier="${i}" data-field="factorRate" value="${o.factorRate}" placeholder="1.38"></div>
                <div><label class="offer-label">Payback $</label><input class="offer-input" data-tier="${i}" data-field="payback" value="${o.payback}" placeholder="44160"></div>
                <div><label class="offer-label">Payment $</label><input class="offer-input" data-tier="${i}" data-field="payment" value="${o.payment}" placeholder="1840"></div>
                <div><label class="offer-label">Commission $</label><input class="offer-input" data-tier="${i}" data-field="commission" value="${o.commission}" placeholder="0"></div>
                <div><label class="offer-label">Points</label><input class="offer-input" data-tier="${i}" data-field="points" value="${o.points}" placeholder="0"></div>
            </div>
        </div>
    `).join('');
}

function fmtMoney(v) {
    const n = parseFloat(v);
    return isNaN(n) ? '$0.00' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function generateOfferEmailHTML() {
    const biz = document.getElementById('offerBusiness')?.value || '';
    const contact = document.getElementById('offerContact')?.value || '';
    const lender = document.getElementById('offerLender')?.value || '';
    const position = document.getElementById('offerPosition')?.value || '';
    const payments = document.getElementById('offerPayments')?.value || '';
    const freq = document.getElementById('offerFrequency')?.value || 'weekly';
    const notes = document.getElementById('offerNotes')?.value || '';
    const top = offerTiers[0] || {};

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
<strong style="font-size:22px;color:#0f3460;">${fmtMoney(top.approved)}</strong>
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
<th style="padding:10px 12px;color:#fff;font-size:11px;text-align:center;text-transform:uppercase;">Commission</th>
<th style="padding:10px 12px;color:#fff;font-size:11px;text-align:center;text-transform:uppercase;">Points</th>
</tr>
${offerTiers.map((o, i) => `<tr style="background:${i % 2 === 0 ? '#f8fafc' : '#ffffff'};">
<td style="padding:10px 12px;font-size:13px;color:#334155;border-bottom:1px solid #e2e8f0;">${fmtMoney(o.approved)}</td>
<td style="padding:10px 12px;font-size:13px;color:#334155;border-bottom:1px solid #e2e8f0;text-align:center;">${o.factorRate || '—'}</td>
<td style="padding:10px 12px;font-size:13px;color:#334155;border-bottom:1px solid #e2e8f0;text-align:center;">${fmtMoney(o.payback)}</td>
<td style="padding:10px 12px;font-size:13px;color:#334155;border-bottom:1px solid #e2e8f0;text-align:center;">${fmtMoney(o.payment)}</td>
<td style="padding:10px 12px;font-size:13px;color:#334155;border-bottom:1px solid #e2e8f0;text-align:center;">${fmtMoney(o.commission)}</td>
<td style="padding:10px 12px;font-size:13px;color:#334155;border-bottom:1px solid #e2e8f0;text-align:center;">${o.points || '0'}</td>
</tr>`).join('')}
</table>
</td></tr>
${lender ? `<tr><td style="padding:16px 40px 0;"><p style="margin:0;font-size:13px;color:#64748b;">Lender: <strong style="color:#334155;">${lender}</strong></p></td></tr>` : ''}
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

function updateOfferPreview() {
    const preview = document.getElementById('offerPreview');
    if (!preview) return;
    preview.innerHTML = generateOfferEmailHTML();
}

function initOfferBuilder() {
    const form = document.getElementById('offerForm');
    if (!form) return;

    form.addEventListener('input', (e) => {
        if (e.target.dataset.tier !== undefined) {
            offerTiers[parseInt(e.target.dataset.tier, 10)][e.target.dataset.field] = e.target.value;
        }
        updateOfferPreview();
    });

    const copyBtn = document.getElementById('copyOfferHTML');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            const html = generateOfferEmailHTML();
            try {
                await navigator.clipboard.writeText(html);
                copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                setTimeout(() => { copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy HTML'; }, 2000);
            } catch {
                alert('Copy failed');
            }
        });
    }

    const downloadBtn = document.getElementById('downloadOfferHTML');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            const html = generateOfferEmailHTML();
            const biz = document.getElementById('offerBusiness')?.value || 'offer';
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `offer-${biz.replace(/\s+/g, '-').toLowerCase()}.html`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    const modal = document.getElementById('offerBuilderModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'offerBuilderModal') closeOfferBuilder();
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOfferBuilder);
} else {
    initOfferBuilder();
}

window.openOfferBuilder = openOfferBuilder;
window.openOfferBuilderFromDeal = openOfferBuilderFromDeal;
window.closeOfferBuilder = closeOfferBuilder;
window.addOfferTier = addOfferTier;
window.removeOfferTier = removeOfferTier;
