// services/aiService.js - OpenAI Integration Service
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { trackUsage } = require('./usageTracker');
require('dotenv').config();

// Initialize OpenAI
// If the key is missing, we initialize nicely so the server doesn't crash on startup
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'dummy-key',
});

const isConfigured = () => {
    return process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-');
};

const getConfiguration = () => ({
    hasApiKey: isConfigured(),
    model: 'gpt-4o',
    maxTokens: 500,
    temperature: 0.7
});

// 🟢 NEW: Helper to load the Markdown prompt
function getSystemPrompt() {
    try {
        const promptPath = path.join(__dirname, '../prompts/chat-assistant.md');
        return fs.readFileSync(promptPath, 'utf8');
    } catch (err) {
        console.error('❌ Could not load chat prompt:', err.message);
        // Fallback if file is missing
        return `You are an expert MCA underwriter assistant. Use the provided context to answer questions.`;
    }
}

/**
 * Generates a response from OpenAI based on the user query and conversation context.
 */
const generateResponse = async (query, context, userId = null) => {
    if (!isConfigured()) return { success: false, error: 'AI Key Missing' };

    try {
        // 1. Load Base Instructions from MD File
        let systemPrompt = getSystemPrompt();

        if (context) {
            const lead = context.lead;
            const fcs = context.fcs;
            const strategy = context.strategy;

            // ============================================
            // SOURCE 1: LEAD INTAKE (user-entered, may be stale)
            // ============================================
            systemPrompt += `\n\n=== 📋 SOURCE: LEAD INTAKE (user-entered) ===`;
            systemPrompt += `\nBusiness Name: ${lead.business_name || 'Unknown'}`;
            if (lead.dba_name) systemPrompt += ` (DBA: ${lead.dba_name})`;
            systemPrompt += `\nOwner: ${lead.first_name || ''} ${lead.last_name || ''}`.trim();
            if (lead.owner2_first_name) systemPrompt += `\nOwner 2: ${lead.owner2_first_name} ${lead.owner2_last_name || ''}`.trim();
            systemPrompt += `\nEntity Type: ${lead.entity_type || 'Unknown'}`;
            systemPrompt += `\nOwner Title: ${lead.owner_title || 'Unknown'}`;
            systemPrompt += `\nUse of Proceeds: ${lead.use_of_proceeds || 'Unknown'}`;
            systemPrompt += `\nIndustry: ${lead.industry_type || lead.ld_business_type || 'Unknown'}`;
            systemPrompt += `\nState: ${lead.us_state || 'Unknown'}`;
            systemPrompt += `\nAddress: ${lead.address || lead.ld_business_address || 'N/A'}${lead.city ? ', ' + lead.city : ''}${lead.us_state ? ', ' + lead.us_state : ''} ${lead.zip || ''}`.trim();
            if (lead.owner_home_address) {
                systemPrompt += `\nOwner Home: ${lead.owner_home_address}, ${lead.owner_home_city || ''} ${lead.owner_home_state || ''} ${lead.owner_home_zip || ''}`.trim();
            }
            systemPrompt += `\nCredit Score: ${lead.credit_score || 'Unknown'}`;
            systemPrompt += `\nMonthly Revenue: ${lead.monthly_revenue || 'Unknown'}`;
            if (lead.annual_revenue) systemPrompt += ` (Annual: ${lead.annual_revenue})`;
            systemPrompt += `\nBusiness Start Date: ${lead.business_start_date || 'Unknown'}`;
            systemPrompt += `\nRecent Funding: ${lead.recent_funding || 'None reported'}`;
            if (lead.funding_amount) systemPrompt += `\nExisting Position: $${lead.funding_amount} at ${lead.factor_rate || '?'} factor, ${lead.term_months || '?'} months (funded ${lead.funding_date || 'unknown date'})`;
            systemPrompt += `\nDeal State: ${lead.state || 'Unknown'} | Disposition: ${lead.disposition || 'None'} | Has Offer: ${lead.has_offer || false}`;
            systemPrompt += `\nDisplay ID: ${lead.display_id || 'N/A'}`;

            // ============================================
            // SOURCE 2: FCS BANK ANALYSIS (verified from statements)
            // ============================================
            if (fcs) {
                systemPrompt += `\n\n=== 🏦 SOURCE: FCS BANK ANALYSIS (verified from statements) ===`;
                systemPrompt += `\n⚠️ TRUST THESE NUMBERS OVER LEAD INTAKE — they come from actual bank statements.`;
                systemPrompt += `\nMonthly Revenue: $${fcs.average_revenue || '0'}`;
                systemPrompt += `\nAvg Daily Balance: $${fcs.average_daily_balance || '0'}`;
                systemPrompt += `\nAvg Deposits: ${fcs.average_deposit_count || '0'}/month ($${fcs.average_deposits || '0'} volume)`;
                systemPrompt += `\nNegative Days: ${fcs.total_negative_days || '0'} total (${fcs.average_negative_days || '0'} avg/month)`;
                systemPrompt += `\nStatement Count: ${fcs.statement_count || '0'} months`;
                systemPrompt += `\nExisting Positions: ${fcs.position_count !== null ? fcs.position_count : 'NULL — check the Full Analyst Report below for position info'}`;
                systemPrompt += `\nLast MCA Date: ${fcs.last_mca_deposit_date || 'None detected'}`;
                systemPrompt += `\nTime in Business: ${fcs.time_in_business_text || 'Unknown'}`;
                if (fcs.withholding_percentage) systemPrompt += `\nCurrent Withholding: ${fcs.withholding_percentage}%`;
                if (fcs.fcs_industry) systemPrompt += `\nFCS Industry: ${fcs.fcs_industry}`;
                if (fcs.fcs_state) systemPrompt += `\nFCS State: ${fcs.fcs_state}`;

                if (fcs.fcs_report) {
                    systemPrompt += `\n\n--- Full Analyst Report ---\n${fcs.fcs_report}`;
                }
            } else {
                systemPrompt += `\n\n=== 🏦 FCS BANK ANALYSIS: NOT YET AVAILABLE ===`;
            }

            // ============================================
            // SOURCE 3: COMMANDER STRATEGY (AI-generated)
            // ============================================
            if (strategy) {
                const gp = strategy.game_plan || {};
                systemPrompt += `\n\n=== 🎖️ SOURCE: COMMANDER STRATEGY (AI-generated) ===`;
                systemPrompt += `\nLead Grade: ${strategy.lead_grade || 'Not graded'}`;
                systemPrompt += `\nStrategy Type: ${strategy.strategy_type || 'N/A'}`;
                systemPrompt += `\nCommander's Revenue Snapshot: $${strategy.cmd_revenue || '?'} | Balance: $${strategy.cmd_balance || '?'}`;
                systemPrompt += `\nCommander's Position Count: ${strategy.cmd_positions ?? '?'} | Withholding: ${strategy.cmd_withholding || '?'}%`;
                systemPrompt += `\nRecommended Funding: $${strategy.recommended_funding_min?.toLocaleString() || '?'} - $${strategy.recommended_funding_max?.toLocaleString() || '?'}`;
                systemPrompt += `\nRecommended Payment: $${strategy.recommended_payment || '?'} ${strategy.recommended_term_unit || ''} for ${strategy.recommended_term || '?'} ${strategy.recommended_term_unit || 'months'}`;

                if (gp.approach) systemPrompt += `\nApproach: ${gp.approach}`;
                if (gp.talking_points?.length) {
                    systemPrompt += `\nTalking Points:`;
                    gp.talking_points.forEach(p => systemPrompt += `\n  • ${p}`);
                }
                if (gp.objection_strategy) systemPrompt += `\nObjection Handling: ${gp.objection_strategy}`;
                if (gp.urgency_angle) systemPrompt += `\nUrgency: ${gp.urgency_angle}`;
                if (gp.lender_notes) systemPrompt += `\nLender Strategy: ${gp.lender_notes}`;
                if (gp.red_flags?.length) {
                    systemPrompt += `\nRed Flags:`;
                    gp.red_flags.forEach(f => systemPrompt += `\n  ⚠️ ${f}`);
                }
            } else {
                systemPrompt += `\n\n=== 🎖️ COMMANDER STRATEGY: NOT YET AVAILABLE ===`;
            }

            // ============================================
            // SOURCE 4: LENDER SUBMISSIONS
            // ============================================
            if (context.lender_submissions?.length > 0) {
                systemPrompt += `\n\n=== 💰 LENDER SUBMISSIONS ===`;
                context.lender_submissions.forEach(sub => {
                    systemPrompt += `\n- ${sub.lender_name}: ${sub.status}`;
                    if (sub.offer_amount) systemPrompt += ` | $${sub.offer_amount}`;
                    if (sub.factor_rate) systemPrompt += ` | ${sub.factor_rate} factor`;
                    if (sub.term_length) systemPrompt += ` | ${sub.term_length} ${sub.term_unit || 'months'}`;
                    if (sub.payment_frequency) systemPrompt += ` | ${sub.payment_frequency}`;
                    if (sub.position) systemPrompt += ` | pos ${sub.position}`;
                    if (sub.decline_reason) systemPrompt += ` | declined: ${sub.decline_reason}`;
                    if (sub.submitted_at) systemPrompt += ` | sent ${new Date(sub.submitted_at).toLocaleDateString()}`;
                });
            }

            // ============================================
            // SOURCE 5: DOCUMENTS ON FILE
            // ============================================
            if (context.documents?.length > 0) {
                systemPrompt += `\n\n=== 📎 DOCUMENTS ON FILE (${context.documents.length} files) ===`;
                context.documents.forEach(doc => {
                    let desc = doc.filename;
                    if (doc.document_type) desc += ` [${doc.document_type}]`;
                    if (doc.bank_name) desc += ` (${doc.bank_name}`;
                    if (doc.statement_month) desc += ` ${doc.statement_month}/${doc.statement_year || ''}`;
                    if (doc.bank_name) desc += `)`;
                    systemPrompt += `\n- ${desc}`;
                });
            } else {
                systemPrompt += `\n\n=== 📎 DOCUMENTS: NONE UPLOADED ===`;
            }

            // ============================================
            // SOURCE 6: RECENT SMS
            // ============================================
            if (context.recent_messages?.length > 0) {
                systemPrompt += `\n\n=== 💬 RECENT SMS (last ${context.recent_messages.length}) ===`;
                context.recent_messages.reverse().forEach(msg => {
                    const dir = msg.direction === 'outbound' ? 'US' : 'LEAD';
                    systemPrompt += `\n[${dir}] ${msg.content}`;
                });
            }

            // ============================================
            // DATA TRUST HIERARCHY
            // ============================================
            systemPrompt += `\n\n=== ⚖️ DATA TRUST RULES ===
When the same data point exists in multiple sources, use this priority:
1. FCS Bank Analysis (highest trust — verified from actual bank statements)
2. Commander Strategy (AI-analyzed, but based on FCS)
3. Lead Intake (lowest trust — user-entered, often stale or rounded)

SPECIFIC RULES:
- Revenue: FCS average_revenue > lead monthly_revenue. If they differ by >20%, flag it.
- Industry: FCS fcs_industry > lead industry_type. If FCS industry is null, use lead. If BOTH are null, ASK.
- State: FCS fcs_state > lead us_state. Should usually match.
- Position: FCS position_count tells you CURRENT positions. Next position = position_count + 1.
- Negative Days: ONLY from FCS. Lead intake doesn't have this.
- Deposits: ONLY from FCS. Lead intake doesn't have this.
- Credit/FICO: ONLY from lead intake (credit_score). FCS doesn't have this. If missing, ASK.
- Withholding: FCS withholding_percentage > Commander cmd_withholding. Either works.
- Time in Business: FCS time_in_business_text > lead business_start_date (calculate months).
`;
        }

        // 🔧 DATABASE ACTION INSTRUCTIONS
        systemPrompt += `\n\n=== 🔧 DATABASE ACTIONS ===
You can propose database actions when the user asks to add, update, or change data.
When proposing an action, respond with ONLY valid JSON (no markdown, no backticks).

**SMART PARSING:**
If the user pastes an offer email or says "put this in" / "add this" / "log this", extract the data automatically:
- Look for: Funding Amount, Sell Rate/Factor, Term, Payment Frequency, Weekly/Daily Payment
- Match the lender name from the email signature, sender, or context
- Propose an insert_offer with all extracted fields

Example: User pastes "Funding Amount $70,000.00 Sell Rate 1.34 Term 56 Weeks Weekly Payment $1,675.00" from Newport
→ You respond with insert_offer containing all those details

Available actions:

1. insert_offer - Add new lender submission
{"message": "I'll add the Newport offer: $70k at 1.34 for 56 weeks.", "action": {"action": "insert_offer", "data": {"lender_name": "Newport Business Capital", "offer_amount": 70000, "status": "OFFER", "factor_rate": 1.34, "term_length": 56, "term_unit": "weeks", "payment_frequency": "weekly"}, "confirm_text": "Add Newport offer: $70,000, 1.34 factor, 56 weeks, weekly?"}}

2. update_offer - Update existing lender submission
{"message": "I'll update that.", "action": {"action": "update_offer", "data": {"lender_name": "...", "offer_amount": 55000, "status": "OFFER"}, "confirm_text": "Update [Lender] to $55,000?"}}

3. update_deal - Update the conversation/deal
{"message": "I'll mark this as funded.", "action": {"action": "update_deal", "data": {"state": "FUNDED", "funded_amount": 50000}, "confirm_text": "Mark deal as FUNDED for $50,000?"}}
Valid states: NEW, CONTACTED, DOCS_IN, OFFER_RECEIVED, CONTRACTED, FUNDED, DEAD, ARCHIVED

CONVERSATION FIELDS (update_lead):
- use_of_proceeds
- owner_title
- owner2_title

4. append_note - Add a note (use ONLY for general notes, NOT for offer data)
{"message": "I'll add that note.", "action": {"action": "append_note", "data": {"note": "Client prefers weekly payments"}, "confirm_text": "Add note: Client prefers weekly payments?"}}

5. insert_bank_rule - Add new bank parsing rules
{"message": "I'll add rules for Chase.", "action": {"action": "insert_bank_rule", "data": {"bank_name": "Chase", "aliases": ["CHASE", "JPMORGAN CHASE"], "neg_days_source": "daily_balance_table", "neg_days_location": "bottom of statement", "neg_days_extract_rule": "Extract Daily Ending Balance table only", "intraday_warning": false, "token_cost": "low", "notes": "Clean format"}, "confirm_text": "Add bank rule for Chase?\\n- Neg days: daily balance table (bottom)\\n- Token cost: low"}}

6. update_bank_rule - Modify existing bank rules  
{"message": "I'll update the Chase rules.", "action": {"action": "update_bank_rule", "data": {"bank_name": "Chase", "neg_days_location": "page 2"}, "confirm_text": "Update Chase: neg days location to page 2?"}}

9. generate_app - Generate the MCA application PDF from database fields
WHEN USER SAYS: "generate the app", "create the application", "make the PDF", "build the app"

Before generating, run the APP READINESS check (CHECK 1). If critical fields are missing, show them and ask user to fill. If user says "generate anyway" or "just do it", set force: true.

{"message": "All fields look good. Generating the application PDF.", "action": {"action": "generate_app", "data": {}, "confirm_text": "Generate MCA application PDF for G&A General Contractors?"}}

To force with missing fields:
{"message": "Generating with blanks as requested.", "action": {"action": "generate_app", "data": {"force": true}, "confirm_text": "Generate PDF with missing fields?"}}

BANK RULE FIELDS:
- bank_name: Required, the display name
- aliases: Array of strings to match in OCR text ["CHASE", "JPMORGAN"]
- neg_days_source: "daily_balance_table" | "transaction_list" | "balance_summary"
- neg_days_location: Where to find it ("bottom of statement", "first page", etc.)
- neg_days_extract_rule: Instructions for what to extract
- intraday_warning: true if bank shows intraday negatives that may recover
- revenue_source: Usually "transaction_list"
- token_cost: "low" | "medium" | "high" based on how much text needed
- notes: Any special handling instructions

RULES:
- If user pastes offer details → use insert_offer or update_offer, NOT append_note
- If a lender submission already exists for that lender, use update_offer
- For general notes/reminders that aren't offer data → use append_note
- The confirm_text should clearly show all the data being saved
- Extract ALL available fields: amount, factor_rate, term_length, term_unit, payment_frequency

7. submit_deal - Run qualification and submit to matching lenders
WHEN USER SAYS: "submit this deal", "sub this", "send it out", "send to lenders"

BEFORE proposing submit_deal, you MUST present a READINESS CHECKLIST:

THERE ARE TWO SEPARATE CHECKS. Always run both when user wants to submit.

📋 CHECK 1: APPLICATION READINESS (can we generate/send the app?)
These fields must be filled in the database to produce a complete application PDF:

BUSINESS INFO:
- business_name (Legal Name)
- dba_name (DBA — can be same as business name, "N/A" is ok)
- address, city, us_state, zip (Business Address)
- lead_phone (Business Phone)
- email (Business Email)
- tax_id (Federal Tax ID / EIN)
- business_start_date (Date Started)
- entity_type (LLC, Corp, Sole Prop, etc)
- industry_type (Industry)
- use_of_proceeds (Working Capital, Expansion, etc — default "Working Capital" if not specified)

FINANCIALS:
- monthly_revenue (show as monthly — the generate_app handler auto-calculates annual for the PDF, so never ask for annual revenue separately)
- funding_amount (Requested Amount)
- Do NOT show or ask for annual_revenue. If monthly_revenue exists, annual is handled automatically.

OWNER 1:
- first_name, last_name (Owner Name)
- owner_title (Title — default "Owner" if not specified)
- owner_home_address, owner_home_city, owner_home_state, owner_home_zip
- owner_email (can be same as business email)
- ssn (Social Security Number — DO NOT display in chat, just show ✅ or ❌)
- date_of_birth
- owner_ownership_percent

OWNER 2 (only if owner2_first_name exists):
- owner2_first_name, owner2_last_name
- owner2_title
- owner2_email, owner2_phone
- owner2_ssn (DO NOT display)
- owner2_dob
- owner2_ownership_percent
- owner2_address, owner2_city, owner2_state, owner2_zip

DISPLAY RULES FOR APP CHECK:
- Show the ACTUAL VALUE for each field, not "(not provided)". If lead_phone is "8045551234", show ✅ Phone: (804) 555-1234
- If a field has data, show ✅ with the value. If empty/null, show ❌ with what's needed.
- For SSN and DOB: only show ✅ on file or ❌ missing. NEVER display the actual values.
- Group related fields on one line: "✅ Started: 06/2019 | LLC | Construction" only if ALL three have values. If any are blank, show them separately with ❌.
- For EIN: show ✅ EIN: on file (never display the actual number)

RULES FOR APP CHECK:
- If use_of_proceeds is empty, suggest "Working Capital" and offer to save it
- If owner_title is empty, suggest "Owner" and offer to save it
- If dba_name is empty, suggest using business_name and offer to save it
- If funding_amount is empty, ask the user

📋 CHECK 2: QUALIFICATION READINESS (can we run lender matching?)
These are needed for the qualification engine — credit_score does NOT go on the app but IS required here:

- credit_score / FICO (REQUIRED — ask if missing)
- monthly_revenue or FCS average_revenue
- industry_type or FCS fcs_industry
- us_state or FCS fcs_state
- position (derive from FCS position_count)
- depositsPerMonth (from FCS, optional but improves matching)
- negativeDays (from FCS, optional but improves matching)

WHEN USER SAYS "sub this deal" or similar:
1. Run CHECK 1 (App Readiness) — show missing fields
2. Run CHECK 2 (Qualification Readiness) — show missing fields
3. If anything is missing, list it all at once so user can fill everything in one shot
4. If everything passes, proceed to qualify_deal action

EXAMPLE OUTPUT:
"Here's where we stand on G&A General Contractors:

📋 APP READINESS:
✅ Business: G&A General Contractors LLC
✅ Address: 123 Main St, Richmond, VA 23220
✅ Phone: (804) 555-1234
✅ EIN: on file
✅ Started: 06/2019 | LLC | Construction
❌ Use of Proceeds: missing (want me to set 'Working Capital'?)
❌ Annual Revenue: missing (FCS shows $152K/mo → $1.83M/yr — save it?)
❌ Requested Amount: missing — how much are they looking for?
✅ Owner: John Smith | Owner
✅ SSN: on file | DOB: on file
✅ Home: 456 Oak Ave, Richmond, VA 23221
✅ Ownership: 100%

📋 QUALIFICATION READINESS:
❌ Credit Score: missing — what's the FICO?
✅ Revenue: $152,530/mo (FCS)
✅ Industry: Construction (FCS)
✅ State: VA
✅ Position: 1st (FCS: 0 active)

I need: credit score, requested amount, and I'll auto-fill use of proceeds and annual revenue. What's the FICO and how much do they want?"

📋 SUBMISSION READINESS CHECK
Use ✅ or ❌ for each. Here's WHERE to find each value:

- Business Name → lead.business_name (this is ALWAYS present if you're in a conversation — never mark ❌)
- Monthly Revenue → FCS average_revenue (preferred) or lead monthly_revenue
- Credit Score → lead credit_score (ONLY source — if empty, ask user)
- Industry → FCS fcs_industry (preferred) or lead industry_type. If BOTH empty, ask.
- State → lead us_state or FCS fcs_state
- Position → FIRST check FCS position_count field. If it's a number: requestedPosition = position_count + 1 (0 → 1st, 1 → 2nd, etc).
  If position_count is NULL, READ the FCS Full Analyst Report text. Look for lines like:
  - "Position (ASSUME NEXT): 0 active -> Looking for 1st" → requestedPosition = 1
  - "Positions: None active" → requestedPosition = 1  
  - "Positions: 1 active" → requestedPosition = 2
  - "Position 1: [lender] - Status: Paid off" with no other active positions → requestedPosition = 1 (paid off doesn't count)
  The report ALWAYS has position info. Only ask the user if there truly is no FCS data at all.
- Documents → check DOCUMENTS ON FILE section, count them
- FCS Analysis → if FCS SOURCE section exists with data, it's done
- Already Submitted → check LENDER SUBMISSIONS section

EXAMPLE with FCS data present:
"✅ Business: G&A General Contractors LLC
✅ Revenue: $152,530/mo (FCS verified)
❌ Credit Score: not on file — what's the FICO?
✅ Industry: Construction (FCS)
✅ State: VA
✅ Position: 2nd (FCS shows 1 existing position)
✅ Documents: 4 files uploaded
✅ FCS: Complete"

RULES:
- If ANY critical field is missing (revenue, credit, industry, state, position) → show the checklist with ❌ on missing items, tell user what you need, do NOT propose the action
- If no documents uploaded → block submission, tell user to upload docs first
- If FCS not done → warn that qualification may be less accurate but allow
- If already submitted to some lenders → note them so user knows
- If ALL checks pass → propose the action with confirm
- NEVER skip the checklist unless user explicitly says "skip the check" or "just send it"

Example with missing data (respond as plain text, NOT json):
"Here's where we stand on submitting Joe's Pizza:

✅ Business: Joe's Pizza
✅ Revenue: $45,000/mo
❌ Credit Score: missing
✅ Industry: Restaurant
✅ State: NY
✅ Position: 2nd
✅ Documents: 3 files uploaded
✅ FCS: Complete

I need the credit score before I can run qualification. What's the FICO?"

STEP 1 — ALWAYS qualify first (never skip):
When all checks pass, propose qualify_deal to show the lender list BEFORE sending:

{"message": "Joe's Pizza is ready to go:\\n\\n✅ Revenue: $45K | FICO: 680 | Restaurant | NY | 2nd pos\\n✅ 3 docs attached | FCS complete\\n\\nLet me run qualification to see which lenders match.", "action": {"action": "qualify_deal", "data": {"criteria": {"requestedPosition": 2, "monthlyRevenue": 45000, "fico": 680, "state": "NY", "industry": "Restaurant", "depositsPerMonth": 35, "negativeDays": 2}}, "confirm_text": "Run qualification for Joe's Pizza?"}}

After qualification runs, you'll receive the list of qualified lenders. Present it to the user and wait for instructions.

STEP 2 — User picks lenders, THEN submit:
User says "send to all":
{"message": "Sending to all 12 qualified lenders.", "action": {"action": "submit_deal", "data": {"criteria": {"requestedPosition": 2, "monthlyRevenue": 45000, "fico": 680, "state": "NY", "industry": "Restaurant", "depositsPerMonth": 35, "negativeDays": 2}}, "confirm_text": "Submit to all 12 qualified lenders for Joe's Pizza?"}}

User says "just send to Rapid Capital and Fox":
{"message": "Sending to those 2 only.", "action": {"action": "submit_deal", "data": {"criteria": {"requestedPosition": 2, "monthlyRevenue": 45000, "fico": 680, "state": "NY", "industry": "Restaurant", "depositsPerMonth": 35, "negativeDays": 2}, "lender_names": ["Rapid Capital", "Fox Business"]}, "confirm_text": "Submit to Rapid Capital and Fox Business only?"}}

User says "send to #1, #3, #5" (referencing numbered list):
Map the numbers back to lender names from the qualification results, then use submit_deal with lender_names.

RULES:
- ALWAYS run qualify_deal first to show the list. NEVER go straight to submit_deal.
- Wait for user to confirm which lenders before proposing submit_deal.
- If user initially said "sub this deal", run checklist → qualify → show list → wait for pick → submit. Never skip the list.
- Exception: if user explicitly names lenders upfront ("sub this to Rapid and Fox"), still qualify first to verify they match, then submit to just those.

Now the flow is:

You: sub this deal
AI: (checklist all green) Let me run qualification.
[Confirm: Run qualification for G&A General Contractors?]
You: taps Confirm
AI: ✅ 14 lenders qualified, 38 blocked.

Rapid Capital (Tier A ★)
Fox Business (Tier A)
Pinnacle Capital (Tier B)
... etc

Say "send to all" or pick specific lenders.
You: just send to #1 to test
AI: Sending to Rapid Capital only.
[Confirm: Submit to Rapid Capital only?]
You: taps Confirm
AI: ✅ Submitted to 1 lender

CRITERIA FIELD MAPPING (pull from context above):
- requestedPosition → FCS position_count + 1 (next position) or ask user
- monthlyRevenue → Monthly Revenue from business details or FCS average_revenue
- fico → Credit Score from business details
- state → extract from Business Address (2-letter code)
- industry → Industry from business details
- depositsPerMonth → FCS average_deposit_count (optional)
- negativeDays → FCS total_negative_days (optional)
- isSoleProp → ask if unclear (optional)
- isNonProfit → ask if unclear (optional)
- hasMercuryBank → from FCS if available (optional)
- withholding → from Commander withholding_analysis if available (optional)
`;

        // Add list of valid lenders with fuzzy matching instructions
        if (context.valid_lenders && context.valid_lenders.length > 0) {
            systemPrompt += `\n\nVALID LENDERS (only use these exact names in actions):\n${context.valid_lenders.join(', ')}`;
            systemPrompt += `\n
LENDER NAME MATCHING RULES:
1. If user's lender name EXACTLY matches a valid lender → use it
2. If it's an OBVIOUS typo (e.g., "Pinnakle" → "Pinnacle", "Rapit" → "Rapid") → auto-correct and mention it
   Example: "I'll add the offer from **Pinnacle Capital** (corrected from 'Pinnakle')."
3. If MULTIPLE lenders could match (e.g., "Pinnacle" matches "Pinnacle Capital" AND "Pinnacle Business Funding") → ask which one
   Example: "I found multiple matches for 'Pinnacle'. Did you mean Pinnacle Capital or Pinnacle Business Funding?"
4. If NO close match exists → ask for clarification and list similar-sounding options if any
   Example: "I don't recognize 'ABC Lending'. Here are some similar lenders: [list]. Or did you mean something else?"
5. NEVER propose an action with a lender name that isn't in the valid list
`;
        }

        // 🟢 4. CHAT HISTORY (Memory)
        const messages = [{ role: "system", content: systemPrompt }];
        
        if (context && context.chat_history) {
            context.chat_history.forEach(msg => {
                if (['user', 'assistant'].includes(msg.role)) {
                    messages.push({ role: msg.role, content: msg.content });
                }
            });
        }

        messages.push({ role: "user", content: query });

        // 4. Call OpenAI
        console.log('   🧠 [AI Service] Sending request to OpenAI (Model: gpt-4o-mini)...');
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages,
            temperature: 0.3,
            max_tokens: 800
        });

        // Track usage
        if (completion.usage) {
            await trackUsage({
                userId: userId,
                conversationId: context?.conversation_id || null,
                type: 'llm_call',
                service: 'openai',
                model: 'gpt-4o-mini',
                inputTokens: completion.usage.prompt_tokens,
                outputTokens: completion.usage.completion_tokens,
                metadata: { function: 'aiService' }
            });
        }

        // 🟢 NEW: Token Logging
        const usage = completion.usage;
        if (usage) {
            console.log(`      🎟️ [AI Service] Token Usage:`);
            console.log(`          - Input (Context): ${usage.prompt_tokens}`);
            console.log(`          - Output (Answer): ${usage.completion_tokens}`);
            console.log(`          - Total Cost:      ${usage.total_tokens} tokens`);
        }

        const responseText = completion.choices[0].message.content;

        // Check if response contains a JSON action
        let parsedResponse = { success: true, response: responseText };

        try {
            // Find JSON object anywhere in the response
            const jsonMatch = responseText.match(/\{[\s\S]*"action"[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.action && parsed.message) {
                    parsedResponse = {
                        success: true,
                        response: parsed.message,
                        action: parsed.action
                    };
                    console.log(`   🔧 [AI Service] Action detected: ${parsed.action.action}`);
                }
            }
        } catch (e) {
            // Not valid JSON, treat as normal text response
            console.log('   ⚠️ [AI Service] Could not parse action JSON:', e.message);
        }

        return {
            ...parsedResponse,
            usage: usage
        };

    } catch (error) {
        return { success: false, error: error.message };
    }
};

module.exports = {
    isConfigured,
    getConfiguration,
    generateResponse
};
