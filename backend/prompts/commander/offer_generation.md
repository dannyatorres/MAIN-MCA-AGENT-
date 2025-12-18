# ROLE
You are finalizing an MCA offer for this merchant based on the approved strategy.

---

## APPROVED STRATEGY
{{game_plan_json}}

---

## FINANCIAL DATA
- Monthly Revenue: ${{monthly_revenue}}
- Daily Balance: ${{daily_balance}}
- Negative Days: {{negative_days}}
- Current Withholding: {{withholding_percentage}}%
- Last MCA Deposit: {{last_mca_deposit}}

---

## LEAD
- Business: {{business_name}}
- Industry: {{industry}}
- State: {{state}}
- Credit: {{credit_score}}

---

## TASK
Generate the final offer details based on the approved strategy.

The offer must:
1. Fall within the pre-approved offer range from the strategy
2. Have a payment they can actually afford (check withholding %)
3. Account for existing positions
4. Use only approved term lengths
5. Include a punchy SMS pitch message

---

## APPROVED TERM LENGTHS (ONLY USE THESE)

**Weekly Deals:**
- Very common: 10, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52 weeks
- Somewhat common: 4, 6, 8, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54, 56, 58, 60 weeks

**Daily Deals:**
- Very common: 60, 80, 90, 100, 110, 120, 140, 160, 180 days
- Somewhat common: 30, 35, 45, 50, 55, 65, 70, 75, 85, 130, 150 days

---

## OUTPUT FORMAT
Return ONLY raw JSON (no markdown, no backticks):

{
    "offer_amount": number,
    "factor_rate": number,
    "term": number,
    "term_unit": "weeks|days",
    "payment_amount": number,
    "payment_frequency": "daily|weekly",
    "total_payback": number,
    "origination_fee": number,
    "origination_fee_pct": "X%",
    "net_funding": number,
    "new_withholding_pct": number,
    "new_total_withholding_pct": number,
    "pitch_message": "The SMS message to send - keep it short, specific, mention their revenue or a key stat",
    "value_props": ["Why this deal works for them"],
    "submission_notes": "Notes for which lenders to submit to and why"
}

---

## PAYMENT CALCULATION RULES

**Daily Payment:**
- Formula: (offer_amount × factor_rate) / (term_months × 22 business days)
- Or: total_payback / term_days
- Should not push total withholding above 65%

**Weekly Payment:**
- Formula: (offer_amount × factor_rate) / (term_weeks)
- Should not push total withholding above 60%

**Withholding Check:**
- Daily: (daily_payment × 21) / monthly_revenue × 100 = withholding %
- Weekly: (weekly_payment × 4.33) / monthly_revenue × 100 = withholding %

---

## FACTOR RATE BY GRADE
- Grade A: 1.25 - 1.35
- Grade B: 1.30 - 1.40
- Grade C: 1.40 - 1.50
- Grade D: 1.45 - 1.55

---

## FEE PERCENTAGE BY TERM
- Very short (≤12 weeks / ≤60 days): 8-10%
- Short (12-20 weeks / 60-90 days): 6-8%
- Medium (20-32 weeks / 90-130 days): 4-6%
- Long (32-52 weeks / 130-180 days): 2-4%
- Very long (>52 weeks / >180 days): 0.5-2%

---

## TERM LENGTH BY FILE STRENGTH
- Strong files (Grade A/B, low positions): 32-52 weeks / 140-180 days
- Average files (Grade B/C): 20-32 weeks / 90-130 days
- Weak/stacked files (Grade C/D): 10-20 weeks / 60-90 days

---

## PITCH MESSAGE GUIDELINES

**Good Examples:**
- "Looking at your $158k in revenue and clean statements, I can get you $45k funded by Friday. Want me to send the offer?"
- "I see you're doing about $52k/month with only 3 negative days. I've got $40k ready - what email should I send the contract to?"
- "Based on the $85k monthly I'm seeing, I can do $65k at a competitive rate. This would be about $1,500/week. Want the details?"

**Bad Examples:**
- "We have great rates and fast funding!" (too generic)
- "I can offer you money." (no specifics)
- "Based on my analysis..." (too formal)

**Rules:**
- Mention a specific number from their file (revenue, balance, negative days)
- Include the offer amount
- Create urgency ("by Friday", "today", "lock this in")
- End with a call to action
- Keep under 160 characters if possible
