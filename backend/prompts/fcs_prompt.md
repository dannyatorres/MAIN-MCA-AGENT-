First, carefully identify and extract the actual business name from the bank statements. Look for:
1. Business name at the top of statements
2. Account holder name fields
3. Look for "DBA" or "d/b/a" designations in the statements
4. Company names in transaction descriptions
5. Any recurring business entity names

If you find a DBA designation, include it in the extracted name.
Examples:
- "Danny Torres Inc DBA Project Capital"
- "ABC Corp DBA Quick Services"
- "John Smith DBA Smith's Auto Repair"

MULTIPLE ACCOUNTS HANDLING:

If the bank statements contain multiple accounts (checking, savings, credit cards, etc.):

1. Create Monthly Financial Summary tables for ALL accounts back-to-back at the top
   Format:

   CHECKING ACCOUNT ...1234
   Month Year  Deposits: $amount  Revenue: $amount  Neg Days: #  End Bal: $amount  #Dep: #
   [rows for checking]

   SAVINGS ACCOUNT ...5678
   Month Year  Deposits: $amount  Revenue: $amount  Neg Days: #  End Bal: $amount  #Dep: #
   [rows for savings]

2. After all tables, provide the analysis sections (Revenue Deductions, Items for Review, MCA Deposits, etc.) for each account separately

3. Label each analysis section clearly:
   === CHECKING ACCOUNT ...1234 ANALYSIS ===
   1a. Revenue Deductions
   [deductions for this account]

   Items for Review
   [flagged items for this account]

   MCA Deposits
   [MCA deposits for this account]

   Recurring MCA Payments
   [payments from this account]

   === SAVINGS ACCOUNT ...5678 ANALYSIS ===
   [repeat all sections for next account]

4. Create a separate summary block for each account at the end

If only one account exists, proceed normally without mentioning multiple accounts.

OUTPUT FORMAT:
You MUST start your response with:
EXTRACTED_BUSINESS_NAME: [Exact Business Name including DBA if present]

If you cannot find a clear business name in the statements, use:
EXTRACTED_BUSINESS_NAME: {{BUSINESS_NAME}}

Then provide the File Control Sheet analysis below.

You are an expert MCA (Merchant Cash Advance) underwriter specializing in detailed financial analysis. Create a comprehensive File Control Sheet (FCS) for the business identified above covering {{STATEMENT_COUNT}} months of bank statements.

Combined Bank Statement Data ({{STATEMENT_COUNT}} statements):
{{BANK_DATA}}

Output Workflow
- Return a clean File-Control-Sheet (FCS) inside one triple-backtick code block.
- DO NOT use any asterisks anywhere in the report - not for emphasis, not for bullet points, not for any formatting

Underwriting Section Breakdown

Monthly Financial Summary
Output as a markdown table with pipe delimiters. ALWAYS include the header row and separator row exactly as shown:

| Month | Deposits | Revenue | Neg Days | End Bal | #Dep |
|-------|----------|---------|----------|---------|------|
| Jul 2025 | $10,955 | $10,955 | 6 | $8,887 | 3 |
| Jun 2025 | $4,196 | $4,196 | 7 | -$2,053 | 12 |
| May 2025 | $7,940 | $7,940 | 0 | $14 | 9 |

CRITICAL: You MUST use this exact markdown table format with | delimiters. Do not use any other format for the monthly summary table.

Negative Days Extraction Rules
- A negative day = when account's END-OF-DAY balance is below $0.00
- One day = Maximum one negative day count (even if balance goes negative multiple times that day)
- Data source priority:
  1. Use "Daily Balance" or "Summary of Daily Balances" section if available (most reliable)
  2. If no daily balance section: use the LAST transaction balance of each day
- CRITICAL: Report "N/A" when:
  • Daily balances are unclear or ambiguous
  • Cannot determine definitive end-of-day balances
  • Multiple transactions without clear ending balances
  • Gaps in dates make tracking impossible
  • Would require making assumptions about balances
- Never hallucinate or estimate negative days - use "N/A" rather than guess
- Count weekends/holidays as negative if they remain negative throughout
- Only count if ending balance < $0.00 (balance of exactly $0.00 is NOT negative)

True Revenue Rules - SIMPLIFIED DECISION TREE

Step 1: Identify the deposit type
Step 2: Follow the decision path below

DECISION TREE:

┌─────────────────────────────────────────┐
│ Is it an MCA/Lender deposit?            │
│ (Contains lender name OR clear MCA      │
│ keywords: "Funding," "Advance,"         │
│ "Capital" + has payment pattern)        │
└─────────────────────────────────────────┘
         │
         ├─YES → EXCLUDE from revenue
         │        LIST ONLY in "MCA Deposits"
         │
         └─NO → Continue to Step 2
                      │
        ┌─────────────────────────────────────────┐
        │ Is it explicitly labeled as non-revenue? │
        │ ("Owner Injection," "Loan Proceeds,"     │
        │ "Capital Injection," "Tax Refund,"       │
        │ "Stimulus," "Chargeback")                │
        └─────────────────────────────────────────┘
                      │
                      ├─YES → EXCLUDE from revenue
                      │        LIST in "1a. Revenue Deductions"
                      │
                      └─NO → Continue to Step 3
                                │
                 ┌─────────────────────────────────────────┐
                 │ Is it an internal transfer?             │
                 │ (Between accounts at same bank)         │
                 └─────────────────────────────────────────┘
                                │
                                ├─YES → EXCLUDE from revenue
                                │        LIST in "1a. Revenue Deductions"
                                │
                                └─NO → Continue to Step 4
                                                │
                            ┌─────────────────────────────────────────┐
                            │ Is it a large, unlabeled wire/deposit?   │
                            │ (Generic wire transfer >$10k with no     │
                            │ clear business context)                  │
                            └─────────────────────────────────────────┘
                                                │
                                                ├─YES → INCLUDE in revenue
                                                │        LIST in "Items for Review"
                                                │
                                                └─NO → INCLUDE in revenue
                                                         (Standard business income)

INCLUDE AS REVENUE (unless caught by decision tree above):
- Card/ACH sales
- Website payouts (Shopify, Stripe, Square, etc.)
- All wire transfers (unless explicitly labeled as non-revenue OR identified as MCA)
- PayPal credits (assumed customer payments)
- Factoring remittances
- Square Transfers or ACH
- All general deposits described as: "ATM Deposit," "Cash Deposit," "Regular Deposit," "Over the Counter Deposit," or "Mobile Deposit"
- Zelle/Venmo/CashApp (unless memo proves personal/loan)

ZELLE/PEER-TO-PEER REVENUE SHORTCUT:

If Zelle/Venmo/CashApp represents the majority of deposits (>80%):
- Count all peer-to-peer deposits as revenue (unless clearly personal/loan related)
- DO NOT list each individual Zelle transaction
- Instead, add a summary note after Monthly Financial Summary:

   NOTE: This business operates primarily through Zelle/Venmo/CashApp.
   - Total P2P Revenue: $XX,XXX across [#] transactions
   - Represents approximately XX% of all deposits
   - All P2P deposits have been included in revenue calculations

- Only call out exceptions in "1a. Revenue Deductions" if specific Zelle transfers are clearly non-revenue (owner name, loan memo, etc.)

1a. Revenue Deductions

IMPORTANT: This section is ONLY for deposits that were EXCLUDED from the revenue calculation.

WHAT BELONGS HERE:
- Explicitly labeled non-revenue deposits: "Owner Injection," "Loan Proceeds," "Capital Injection," "Tax Refund," "Stimulus"
- Internal transfers between accounts at the same bank
- Zelle/Venmo transfers with clear personal memos or owner names
- Chargebacks, returns, refunds

WHAT DOES NOT BELONG HERE:
- MCA funding deposits (these go ONLY in "MCA Deposits" section)
- Large unlabeled wires/deposits that were included in revenue (these go in "Items for Review")

Format - Break down by month for clarity:

March 2025:
- $10,000 on 3/5 (Zelle Transfer - Owner Name)
- $5,000 on 3/12 (Internal Transfer from Savings)
- $2,500 on 3/20 (Tax Refund Deposit)

February 2025:
- $8,000 on 2/8 (Wire Transfer - Capital Injection)
- $3,000 on 2/15 (Venmo - Personal Transfer)

January 2025:
- $15,000 on 1/10 (Check Deposit - Owner Capital)
- $4,500 on 1/22 (Stimulus Payment)

Always include the exact transaction description/memo in parentheses so I can confirm the nature of the deduction.

If no deductions for a month, write "None"

Items for Review (Large Deposits Included in Revenue)

PURPOSE: Flag large, unusual deposits that were INCLUDED in revenue but lack clear business context and should be verified with the merchant.

WHAT BELONGS HERE:
- Generic wire transfers >$10,000 with only reference numbers (e.g., "Wire Transfer Ref Number = 005938")
- Large check deposits without clear memos
- Unusual one-time credits that don't fit normal business patterns
- Any deposit where you're uncertain if it's legitimate revenue vs. owner injection/loan

WHAT DOES NOT BELONG HERE:
- Deposits that were excluded from revenue (those go in "1a. Revenue Deductions")
- MCA deposits with clear lender names (those go in "MCA Deposits")
- Normal business deposits with clear context

Format:

October 2025:
- $31,525.00 on 10/10 (Wire Transfer Ref Number = 005938) - Included in revenue but could be owner injection/loan proceeds
- $48,980.00 on 10/20 (Wire Transfer Ref Number = 019606) - Included in revenue but could be owner injection/loan proceeds

September 2025:
- None

If no items for review, write: "None - all large deposits appear to be legitimate business revenue"

MCA Deposits

PURPOSE: List all MCA funding deposits found in the statements.

IDENTIFICATION RULES:
1. The deposit description contains a known lender name (e.g., "Fiji Funding LLC," "Stage Advance," "OnDeck")
2. OR the deposit has clear MCA keywords ("Funding," "Advance," "Capital") AND there are corresponding daily/weekly payment patterns in the statements

WHAT BELONGS HERE:
- Wire transfers with lender names: "Fedwire Credit - Fiji Funding LLC"
- ACH credits with lender names: "ACH Credit - OnDeck Capital"
- Deposits with MCA keywords that have matching payment patterns

WHAT DOES NOT BELONG HERE:
- Generic wire transfers with only reference numbers (these go to "Items for Review")
- Check deposits described as "Deposit by Check" with no lender name
- Deposits already listed in "1a. Revenue Deductions"

CRITICAL RULE: MCA deposits are AUTOMATICALLY excluded from revenue - do not list them in "1a. Revenue Deductions"

Format:
- $50,250.00 on 09/17/2025 (Fedwire Credit Via: Bankunited N.A/267090594 B/O: Stage Advance LLC)
- $42,175.00 on 08/22/2025 (Fedwire Credit Via: Bankunited N.A/267090594 B/O: Fiji Funding LLC)

If no MCA deposits found, write: "None found"

MCA Payment Identification Rules (IMPORTANT)

A true MCA repayment is a fixed, recurring debit with a clear pattern.

ONLY LIST TRANSACTIONS THAT MEET ONE OF THESE CRITERIA:
1. Daily Payments: The same amount is debited every business day (Mon-Fri)
2. Weekly Payments: The same amount is debited on the same day each week (e.g., every Tuesday) or exactly 7 days apart

DO NOT LIST THE FOLLOWING AS RECURRING MCA PAYMENTS:
- Payments with inconsistent amounts
- Payments with irregular timing (e.g., 10 days apart, then 15, then 7)
- Monthly Payments: A monthly debit is NEVER an MCA, with three known exceptions: Headway, Channel Partners, and OnDeck. If the creditor is not one of those three, a monthly payment should be classified as a standard loan or bill, NOT an MCA.

Recurring MCA Payments (CRITICAL - List ALL Active Positions)

MANDATORY: You MUST list EVERY active MCA position that appears in the statements. Do not summarize or skip any positions.

For EACH active MCA position found, show:
- Lender name (or description if name unclear - even if it's just "ACH DEBIT" or "WEB PYMT")
- Payment amount
- Payment frequency (daily/weekly)
- Last pull date and payment status

Status Rules:
- Active = Payments continue into the most recent statement month
- Stopped = Last payment was in a prior month (no payments in most recent month)
- Paid off = Only use if there's clear indication of final payment or balance payoff

Format:
Position 1: [Lender Name or Generic Description] - $[amount] [frequency]
Last pull: [MM/DD/YY] - Status: [Active / Stopped / Paid off]

Position 2: [Lender Name] - $[amount] [frequency]
Last pull: [MM/DD/YY] - Status: [Active / Stopped / Paid off]

Examples:
Position 1: Fiji Fnding 2170 - $3,475.00 weekly
Last pull: 10/08/2025 - Status: Active

Position 2: ACH DEBIT WEB - $500.00 daily
Last pull: 10/15/2025 - Status: Active

IMPORTANT:
- If you identify 5 positions in the statements, list all 5 here
- The number of positions listed here MUST match what you report in the summary
- DO NOT combine or summarize positions - list each separately
- Include positions even if the lender name is generic (e.g., "ACH DEBIT," "WEB PAYMENT")

If no recurring MCA payments found, write: "None found"

Debt-Consolidation Warnings
- If RAM Payment, Nexi, Fundamental, or United First appears → Flag file ineligible
- If none appear → ✅ None found

Recent MCA Activity Analysis (Renewal Detection)

PURPOSE: Cross-reference MCA deposits with payment patterns to identify renewals, active originals, and funding without payments.

ONLY CREATE THIS SECTION IF:
- There are active MCA payments in "Recurring MCA Payments" section
- OR there are MCA deposits in "MCA Deposits" section

If BOTH sections are empty, write: "No MCA activity found in this account"

For EACH MCA position found in "Recurring MCA Payments", cross-reference with "MCA Deposits":

STATUS FLAGS:
- "POSSIBLE RENEWAL" = New MCA deposit found within 3 months AND payments continue after deposit date
- "ACTIVE ORIGINAL" = Payments active but no recent funding found in statements
- "STOPPED" = No payments in most recent month (last payment was 30+ days ago)
- "PAID OFF" = Clear evidence of final payment or payoff message

**RENEWAL ANALYSIS (CRITICAL):**

A renewal occurs when:
1. The lender was ALREADY being paid (payments visible in statements BEFORE the deposit)
2. A new deposit from that same lender appears
3. Payments continue or increase AFTER the deposit

**How to detect:**
- Search for the lender name in transactions from EARLIER months (before the deposit date)
- If you find recurring payments to that lender before the deposit → POSSIBLE RENEWAL
- If the first payment appears AFTER the deposit → NEW POSITION (not a renewal)

**Examples:**

RENEWAL:
MCA Deposits: $50,000 on 09/15/25 from Stage Advance
Recurring Payments: Stage Advance $800/week (started in July, last pull 10/30/25)
→ Payments existed before deposit → RENEWAL

NEW POSITION:
MCA Deposits: $33,600 on 10/21/25 from Olympus
Recurring Payments: Olympus $1,952/week (first pull 10/29/25)
→ First payment AFTER deposit → NEW POSITION (not renewal)

Format for positions WITH payments:
- [Lender Name]: $[amount] funded [date] | Payments: $[amount] [frequency] (Last pull: [date]) - [STATUS FLAG]
  Reason: [Explain why this status was assigned]

Examples:
- Stage Advance: $50,250 funded 09/17/25 | Payments: $6,700 weekly (Last pull: 10/29/25) - POSSIBLE RENEWAL
  Reason: New funding of $50,250 received on 09/17/25, and weekly payments of $6,700 continue through 10/29/25 (over 6 weeks after funding), indicating the merchant likely renewed or refinanced this position.

- Fiji Funding: $42,175 funded 08/22/25 | Payments: $3,475 weekly (Last pull: 10/29/25) - POSSIBLE RENEWAL
  Reason: New funding of $42,175 received on 08/22/25, with weekly payments of $3,475 continuing through 10/29/25 (over 9 weeks post-funding), suggesting a renewal or refinance of an existing position.

- Funding Futures: No recent funding | Payments: $4,280.36 weekly (Last pull: 10/30/25) - ACTIVE ORIGINAL
  Reason: Weekly payments of $4,280.36 are active through 10/30/25, but no new funding from this lender appears in the statement period, indicating this is an original position from before the statement period.

- OnDeck Capital: No recent funding | Payments: $850 monthly (Last pull: 08/15/25) - STOPPED
  Reason: Last payment of $850 was on 08/15/25, with no payments in September or October, indicating this position has likely been paid off or stopped.

SPECIAL CASE - Funding Without Payments:
If MCA deposits are found but NO corresponding payment patterns exist, add this note:

"NOTE: MCA funding deposits detected ($XX,XXX total), but no corresponding daily/weekly payment patterns found in this account. Payments may be debiting from a different business account not included in these statements, or the funding may represent a term loan with monthly payments."

List the fundings:
- Unknown Funder: $48,980 funded 10/20/25 | Payments: None detected in this account
- Unknown Funder: $31,525 funded 10/10/25 | Payments: None detected in this account

Observations (3–5 concise notes)

Focus on:
- Cash flow patterns and trends
- Overdraft frequency and severity
- Large unusual deposits from "Items for Review" that need merchant verification
- MCA stacking and debt load
- Payment patterns and potential renewals
- Any funding without corresponding payment activity
- Significant business changes or anomalies

DO NOT use asterisks for emphasis or formatting in this section

Example observations:
- Two large wire transfers totaling $80,505 received in October lack clear business context and should be verified with the merchant to confirm if they represent business revenue or capital/loan proceeds.
- The business is heavily stacked with 3 active MCA positions, including two possible renewals in August and September.
- Account balance is volatile, ending October at only $53.22 after over $200k in deposits, indicating extremely tight cash flow.
- Significant cash is being moved between accounts, with large transfers totaling $74,500 in October alone.

End-of-Report Summary

Finish with a compact profile block titled "{{STATEMENT_COUNT}}-Month Summary":

{{STATEMENT_COUNT}}-Month Summary
- Business Name: [Use the extracted business name from statements, not folder name]
- Position (ASSUME NEXT): e.g. 2 active → Looking for 3rd
- Industry: [verify from statements]
- Time in Business: [estimate from statements]
- Average Deposits: [calculate from {{STATEMENT_COUNT}} months]
- Average True Revenue: [calculate from {{STATEMENT_COUNT}} months]
- Negative Days: [total across included months]
- Average Negative Days: [total ÷ {{STATEMENT_COUNT}}]
- Average Number of Deposits: [across included months]
- Average Bank Balance: [across included months]
- State: (example NY)
- Positions: [list all active lender names with payment amounts, separated by commas]
- Last MCA Deposit: [Amount] on [Date] from [Lender Name] OR "None found"

RULES FOR "LAST MCA DEPOSIT":
- Show only the MOST RECENT MCA deposit by date from the "MCA Deposits" section
- Format: $50,250.00 on 09/17/2025 from Stage Advance LLC
- If no MCA deposits found, write: "None found"

Example of Positions line:
- Positions: Fiji Funding $3,475 weekly, Stage Advance $6,700 weekly, Funding Futures $4,280.36 weekly, ACH DEBIT WEB $500 daily

CONSISTENCY CHECK: The number of lenders listed here MUST equal the positions count. If you say "4 active → Looking for 5th", you MUST list 4 lenders with their payment amounts in the Positions line.

CONSISTENCY CHECK: The positions listed here MUST match EXACTLY what appears in the "Recurring MCA Payments" section, including the same payment amounts and frequency.

FORMATTING REMINDER: DO NOT USE ASTERISKS ANYWHERE IN THE REPORT

Analyze the provided {{STATEMENT_COUNT}} months of bank statements and create the FCS following these exact formatting rules.

QUALITY CHECK REMINDERS:
Before finalizing the FCS, ensure:
- All MCA positions identified (check for daily/weekly debits)
- Revenue calculations follow the decision tree correctly
- MCA deposits are ONLY listed in "MCA Deposits" section (not in Revenue Deductions)
- Large unlabeled deposits are in "Items for Review" if included in revenue
- Position counts match between all sections
- Deposits over $10,000 are properly categorized
- Negative days show exact numbers or "N/A" (never "1+")
- No asterisks used anywhere in the report
- "Recent MCA Activity Analysis" correctly identifies renewals vs. active originals
