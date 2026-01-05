# 🏗️ JMS GLOBAL Backend Architecture - Complete Deep Dive

> **Generated:** January 4, 2026  
> **Purpose:** Exhaustive documentation of all database tables, services, functions, flows, and integrations

---

## 📋 TABLE OF CONTENTS

1. [Database Schema (Complete)](#1-database-schema-complete)
2. [Service Architecture](#2-service-architecture)
3. [Service Deep Dives](#3-service-deep-dives)
4. [Data Flows](#4-data-flows)
5. [Background Jobs & Cron](#5-background-jobs--cron)
6. [Environment Variables](#6-environment-variables)
7. [External API Integrations](#7-external-api-integrations)
8. [State Machines & Enums](#8-state-machines--enums)

---

# 1. DATABASE SCHEMA (COMPLETE)

## 1.1 Core Business Tables

### `conversations` - Main Lead/Deal Records
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `business_name` | VARCHAR | Company name |
| `first_name` | VARCHAR | Owner first name |
| `last_name` | VARCHAR | Owner last name |
| `email` | VARCHAR | Contact email |
| `phone` | VARCHAR | Phone number |
| `address` | TEXT | Business address |
| `owner_city` | VARCHAR | Owner city |
| `owner_state` | VARCHAR | Owner state |
| `owner_zip` | VARCHAR | Owner ZIP |
| `industry_type` | VARCHAR | Business industry |
| `us_state` | VARCHAR(2) | Business state code |
| `monthly_revenue` | NUMERIC | Monthly revenue |
| `annual_revenue` | NUMERIC | Annual revenue |
| `credit_score` | INTEGER | FICO score |
| `credit_range` | VARCHAR | Credit tier description |
| `business_start_date` | DATE | When business started |
| `funding_amount` | NUMERIC | Requested funding |
| `funded_amount` | NUMERIC | Final funded amount |
| `funded_at` | TIMESTAMP | When deal was funded |
| `state` | VARCHAR(50) | Lead status (see enums) |
| `priority` | INTEGER | Priority ranking |
| `has_offer` | BOOLEAN | Whether deal has an offer |
| `ai_enabled` | BOOLEAN | Whether AI agent is active |
| `last_activity` | TIMESTAMP | Last interaction |
| `created_at` | TIMESTAMP | Record creation |

**Indexes:**
- `idx_conversations_priority_activity` - (priority DESC, last_activity DESC)
- `idx_conversations_state` - (state)
- `idx_conversations_created_at` - (created_at DESC)

---

### `messages` - Communication Log (SMS/MMS/Email)
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `conversation_id` | UUID | FK → conversations |
| `direction` | VARCHAR | 'inbound' or 'outbound' |
| `content` | TEXT | Message body |
| `message_type` | VARCHAR | 'sms', 'mms', 'email', 'system', 'whatsapp' |
| `sender_type` | VARCHAR | 'user' (human) or 'ai' |
| `external_id` | VARCHAR(255) | External platform ID |
| `twilio_sid` | VARCHAR(255) | Twilio message SID |
| `media_url` | TEXT | MMS attachment URL |
| `timestamp` | TIMESTAMP | When sent/received |

**Indexes:**
- `idx_messages_conversation_id` - (conversation_id)

---

### `documents` - Uploaded Files (PDFs, Bank Statements)
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (auto-generated) |
| `conversation_id` | UUID | FK → conversations (CASCADE) |
| `s3_key` | VARCHAR(500) | S3 object key |
| `s3_bucket` | VARCHAR(100) | S3 bucket name |
| `s3_url` | VARCHAR(1000) | Full S3 URL |
| `filename` | VARCHAR(255) | Display filename |
| `original_filename` | VARCHAR(255) | Uploaded filename |
| `mime_type` | VARCHAR | Content type (application/pdf) |
| `file_size` | BIGINT | File size in bytes |
| `document_type` | VARCHAR(50) | 'Bank Statement', 'Application', 'Other' |
| `notes` | TEXT | Admin notes |
| `created_at` | TIMESTAMPTZ | Upload timestamp |

**Indexes:**
- `idx_documents_conversation_id` - (conversation_id)

---

## 1.2 Lender Management Tables

### `lenders` - Lender Directory
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | VARCHAR | Lender name |
| `email` | VARCHAR | Primary email |
| `cc_email` | VARCHAR | CC email address |
| `tier` | INTEGER | Lender tier (1-5) |
| `is_active` | BOOLEAN | Whether accepting deals |
| `created_at` | TIMESTAMP | Record creation |

---

### `lender_submissions` - Deals Sent to Lenders + Responses
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `conversation_id` | UUID | FK → conversations (CASCADE) |
| `lender_name` | VARCHAR | Lender name |
| `status` | VARCHAR | 'PENDING', 'SUBMITTED', 'APPROVED', 'OFFER', 'DECLINED', 'FUNDED', 'OTHER' |
| `offer_amount` | NUMERIC | Offered funding amount |
| `factor_rate` | NUMERIC | Factor rate (e.g., 1.35) |
| `term_length` | INTEGER | Term length (number) |
| `term_unit` | VARCHAR | 'days' or 'weeks' |
| `payment_frequency` | VARCHAR | 'daily' or 'weekly' |
| `decline_reason` | TEXT | Why declined |
| `offer_details` | JSONB | Full offer details + history |
| `raw_email_body` | TEXT | Raw email snippet |
| `total_daily_withhold` | NUMERIC | Daily withholding amount |
| `existing_positions_count` | INTEGER | Number of existing positions |
| `rule_analyzed` | BOOLEAN | Whether ruleLearner processed this |
| `submitted_at` | TIMESTAMP | When submitted |
| `last_response_at` | TIMESTAMP | Last lender response |
| `created_at` | TIMESTAMP | Record creation |

**JSONB `offer_details` structure:**
```json
{
  "term": 52,
  "days": null,
  "factor": 1.35,
  "payment": 450,
  "position": 2,
  "history": [
    {
      "date": "2025-01-04T10:30:00Z",
      "category": "OFFER",
      "summary": "Approved for $25,000 at 1.35 factor",
      "raw_snippet": "..."
    }
  ]
}
```

---

### `lender_qualifications` - AI Qualification Results
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `conversation_id` | UUID | FK → conversations (CASCADE) |
| `qualification_data` | JSONB | Input criteria used |
| `criteria_used` | JSONB | Matching criteria |
| `qualified_lenders` | JSONB | List of qualified lenders |
| `created_at` | TIMESTAMPTZ | Qualification timestamp |

**Indexes:**
- `idx_lender_qual_conversation` - (conversation_id)

---

### `lender_rules` - Auto-Learned Decline Rules
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `lender_id` | UUID | FK → lenders (optional) |
| `lender_name` | VARCHAR | Lender name |
| `rule_type` | VARCHAR | 'industry_block', 'state_block', 'minimum_requirement', 'position_restriction', 'other' |
| `industry` | VARCHAR | Blocked industry (if applicable) |
| `state` | VARCHAR(2) | Blocked state (if applicable) |
| `condition_field` | VARCHAR | 'tib', 'revenue', 'fico', 'position' |
| `condition_operator` | VARCHAR | 'min' or 'max' |
| `condition_value` | NUMERIC | Threshold value |
| `decline_message` | TEXT | Decline explanation |
| `source` | VARCHAR | 'manual', 'ai_suggested', 'ai_applied' |
| `is_active` | BOOLEAN | Whether rule is active |
| `created_at` | TIMESTAMP | Rule creation |

---

## 1.3 Analysis Tables

### `fcs_analyses` - Bank Statement Analysis (Financial Credit Summary)
| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `conversation_id` | UUID | UNIQUE FK → conversations (CASCADE) |
| `status` | VARCHAR(50) | 'processing', 'completed', 'failed' |
| `extracted_business_name` | VARCHAR(255) | Business name from statements |
| `statement_count` | INTEGER | Number of statements analyzed |
| `fcs_report` | TEXT | Full AI-generated report |
| `average_deposits` | NUMERIC | Avg deposit volume |
| `average_revenue` | NUMERIC | Avg monthly revenue |
| `average_daily_balance` | NUMERIC | Avg daily balance |
| `average_deposit_count` | NUMERIC | Avg deposits per month |
| `total_negative_days` | INTEGER | Total negative balance days |
| `average_negative_days` | NUMERIC | Avg negative days/month |
| `state` | VARCHAR(10) | Business state |
| `industry` | VARCHAR(100) | Business industry |
| `position_count` | INTEGER | Existing MCA positions |
| `time_in_business_text` | VARCHAR | TIB description |
| `last_mca_deposit_date` | VARCHAR | Last detected MCA date |
| `withholding_percentage` | NUMERIC | Current withholding % |
| `created_at` | TIMESTAMP | Analysis start |
| `completed_at` | TIMESTAMP | Analysis completion |
| `error_message` | TEXT | Error if failed |

---

### `fcs_results` - Funding Recommendations (Legacy)
| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `conversation_id` | UUID | FK → conversations (CASCADE) |
| `max_funding_amount` | NUMERIC | Max recommended funding |
| `recommended_term_months` | NUMERIC | Recommended term |
| `estimated_payment` | NUMERIC | Est. payment amount |
| `factor_rate` | NUMERIC | Recommended factor |
| `risk_tier` | VARCHAR(10) | A, B, C risk rating |
| `approval_probability` | NUMERIC | Approval likelihood % |
| `analysis_notes` | TEXT | Additional notes |
| `created_at` | TIMESTAMP | Analysis timestamp |

---

## 1.4 Strategy Tables

### `lead_strategy` - Commander Strategy Analysis
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `conversation_id` | UUID | UNIQUE FK → conversations |
| `fcs_analysis_id` | INTEGER | FK → fcs_analyses |
| `lead_grade` | VARCHAR(1) | 'A', 'B', or 'C' |
| `strategy_type` | VARCHAR | 'PURSUE_HARD', 'STANDARD', 'DEAD' |
| `game_plan` | JSONB | Full strategy object |
| `raw_ai_response` | JSONB | Raw Gemini response |
| `avg_revenue` | NUMERIC | Average revenue |
| `avg_balance` | NUMERIC | Average balance |
| `current_positions` | INTEGER | Number of positions |
| `total_withholding` | NUMERIC | Current withholding % |
| `recommended_funding_min` | NUMERIC | Min offer range |
| `recommended_funding_max` | NUMERIC | Max offer range |
| `recommended_payment` | NUMERIC | Recommended payment |
| `recommended_term` | INTEGER | Recommended term |
| `recommended_term_unit` | VARCHAR | 'days' or 'weeks' |
| `offer_amount` | NUMERIC | Generated offer amount |
| `offer_generated_at` | TIMESTAMP | When offer generated |
| `analysis_version` | VARCHAR | Version string |
| `created_at` | TIMESTAMP | Strategy creation |
| `updated_at` | TIMESTAMP | Last update |

**JSONB `game_plan` structure:**
```json
{
  "lead_grade": "B",
  "strategy_type": "STANDARD",
  "businessOverview": {
    "name": "ABC Corp",
    "industry": "Retail",
    "state": "NY",
    "currentPositions": 2,
    "nextPosition": 3,
    "avgRevenue": 35000,
    "avgBankBalance": 12000,
    "negativeDays": 3
  },
  "withholding": {
    "totalWithhold": 15.5,
    "breakdown": [
      { "lender": "Funder A", "payment": 350, "frequency": "daily", "withholdPct": 10.5 }
    ]
  },
  "revenueTrend": { "direction": "stable", "avgMonthlyChange": 2.1 },
  "offer_range": { "min": 15000, "max": 35000 },
  "approach": "Present as 3rd position renewal opportunity...",
  "talking_points": ["Strong deposit consistency", "Revenue trending up"],
  "objection_strategy": "If they push back on rate, emphasize speed...",
  "urgency_angle": "End of month funding deadline",
  "lender_notes": "Avoid Lender X due to industry restriction",
  "red_flags": ["High negative days in December"],
  "stacking_assessment": { "stacking_notes": "Light stack, room for more" }
}
```

---

### `strategy_scenarios` - Individual Offer Scenarios
| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `strategy_id` | UUID | FK → lead_strategy |
| `conversation_id` | UUID | FK → conversations |
| `tier` | VARCHAR | 'conservative', 'moderate', 'aggressive', 'best_case' |
| `funding_amount` | NUMERIC | Offer amount |
| `term` | INTEGER | Term length |
| `term_unit` | VARCHAR | 'days' or 'weeks' |
| `payment_amount` | NUMERIC | Payment per period |
| `payment_frequency` | VARCHAR | 'daily' or 'weekly' |
| `factor_rate` | NUMERIC | Factor rate |
| `withhold_addition` | NUMERIC | Additional withholding % |
| `total_withhold` | NUMERIC | New total withholding % |
| `reasoning` | TEXT | Why this scenario |

---

## 1.5 AI & Training Tables

### `ai_chat_messages` - Assistant Chat History
| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `conversation_id` | UUID | FK → conversations |
| `role` | VARCHAR | 'user' or 'assistant' |
| `content` | TEXT | Message content |
| `created_at` | TIMESTAMP | Message timestamp |

---

### `response_training` - Human Response Training Data
| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `conversation_id` | UUID | FK → conversations |
| `lead_message` | TEXT | Incoming lead message |
| `lead_message_timestamp` | TIMESTAMP | When lead sent message |
| `commander_suggestion` | JSONB | What Commander suggested |
| `commander_grade` | VARCHAR | Lead grade at time |
| `commander_strategy` | VARCHAR | Strategy type at time |
| `human_response` | TEXT | What human actually sent |
| `human_response_timestamp` | TIMESTAMP | When human responded |
| `response_source` | VARCHAR | 'AI_MODE', 'TEMPLATE_HOOK', 'BALLPARK_OFFER', etc. |
| `message_id` | UUID | FK → messages (linked outbound response) |
| `did_lead_respond` | BOOLEAN | Whether lead replied after the response |
| `response_time_seconds` | INTEGER | Seconds until next inbound reply |
| `led_to_docs` | BOOLEAN | Whether documents were uploaded |
| `led_to_funding` | BOOLEAN | Whether conversation funded |
| `conversation_outcome` | VARCHAR | 'PENDING', 'HAS_OFFER', 'FUNDED', 'DEAD' |
| `outcome_updated_at` | TIMESTAMP | Last outcome refresh time |

**Notes:**
- Human manual sends are tracked in `routes/messages.js` via `trackResponseForTraining`.
- `outcomeTracker.js` periodically enriches rows with outcomes and response timing.

---

## 1.6 Processing Tables

### `processed_emails` - Inbox Email Tracking
| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `message_id` | VARCHAR | Gmail message ID |
| `thread_id` | VARCHAR | Gmail thread ID |
| `processed_at` | TIMESTAMP | When processed (default NOW()) |

**Cleanup:** Records older than 7 days are auto-deleted.

---

### `job_queue` - Background Job Processing
| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `job_type` | VARCHAR(50) | Job type (e.g., 'fcs_analysis') |
| `conversation_id` | UUID | FK → conversations (CASCADE) |
| `input_data` | JSONB | Job input parameters |
| `status` | VARCHAR(50) | 'queued', 'processing', 'completed', 'failed' |
| `result_data` | JSONB | Job results |
| `error_message` | TEXT | Error if failed |
| `created_at` | TIMESTAMP | Job creation |
| `completed_at` | TIMESTAMP | Job completion |

**Indexes:**
- `idx_job_queue_status` - (status)
- `idx_job_queue_conv` - (conversation_id)

---

### `csv_imports` - CSV Upload Tracking
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `filename` | VARCHAR(255) | Internal filename |
| `original_filename` | VARCHAR(255) | Uploaded filename |
| `column_mapping` | JSONB | Field mapping config |
| `total_rows` | INTEGER | Total rows in file |
| `imported_rows` | INTEGER | Successfully imported |
| `error_rows` | INTEGER | Failed rows |
| `errors` | JSONB | Array of error details |
| `status` | VARCHAR(50) | 'processing', 'completed', 'failed' |
| `created_at` | TIMESTAMP | Import start |
| `completed_at` | TIMESTAMP | Import completion |

---

# 2. SERVICE ARCHITECTURE

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                                    EXTERNAL APIS                                       │
├───────────┬───────────┬───────────┬───────────┬───────────┬───────────┬───────────────┤
│  OpenAI   │  Google   │  Google   │   Gmail   │  Tracers  │   AWS     │   Twilio      │
│  GPT-4o   │  Gemini   │  Drive    │   IMAP    │   Skip    │   S3      │   SMS/Voice   │
│  GPT-4o-m │  2.5 Pro  │   API     │   SMTP    │   Trace   │           │               │
└─────┬─────┴─────┬─────┴─────┬─────┴─────┬─────┴─────┬─────┴─────┬─────┴───────────────┘
      │           │           │           │           │           │
      ▼           ▼           ▼           ▼           ▼           ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                                   SERVICE LAYER                                        │
├───────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │   aiAgent.js    │  │commanderService │  │  fcsService.js  │  │ lender-matcher  │   │
│  │  (SMS Bot)      │  │  (Strategy AI)  │  │  (Bank Parser)  │  │  (Qualification)│   │
│  │  GPT-4o         │  │  Gemini 2.5 Pro │  │  Doc AI+Gemini  │  │  Match Engine   │   │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘   │
│           │                    │                    │                    │            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │  aiService.js   │  │processorAgent.js│  │ driveService.js │  │ ruleLearner.js  │   │
│  │ (Chat Assist)   │  │ (Inbox Parser)  │  │ (Google Drive)  │  │ (Decline Rules) │   │
│  │  GPT-4o-mini    │  │  GPT-4o-mini    │  │  GPT-4-turbo    │  │  Claude Haiku   │   │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘   │
│           │                    │                    │                    │            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │  aiMatcher.js   │  │gmailInboxService│  │documentService  │  │successPredictor │   │
│  │ (Name Match)    │  │   (IMAP Fetch)  │  │  (PDF Gen)      │  │ (ML Predictions)│   │
│  │  GPT-4o-mini    │  │  OAuth2 IMAP    │  │  Puppeteer+S3   │  │  Stats Engine   │   │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘   │
│           │                    │                    │                    │            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                        │
│  │ emailService.js │  │tracersService.js│  │  database.js    │                        │
│  │  (SMTP Send)    │  │  (Skip Trace)   │  │  (PostgreSQL)   │                        │
│  │  OAuth2 SMTP    │  │  Galaxy API     │  │  Connection Pool│                        │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                        │
│                                                                                        │
└────────────────────────────────────────────┬───────────────────────────────────────────┘
                                             │
                                             ▼
                                  ┌─────────────────────┐
                                  │     PostgreSQL      │
                                  │     (Supabase)      │
                                  └─────────────────────┘
```

---

# 3. SERVICE DEEP DIVES

## 3.1 `aiAgent.js` - SMS Conversation Bot

**Purpose:** Automated SMS agent that responds to leads, collects information, and hands off to humans.

**AI Models Used:**
- GPT-4o (primary reasoning)
- Gemini 2.5 Pro (analyst handoff)

### Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `processLeadWithAI` | `conversationId`, `systemInstruction` | `{shouldReply, content}` or `{error}` | Main entry point - processes lead and generates response |
| `trackResponseForTraining` | `conversationId`, `leadMessage`, `humanResponse`, `responseSource` | void | Saves response data for training |
| `formatName` | `name` | string | Converts "JOHN SMITH" → "John Smith" |
| `getGlobalPrompt` | none | string | Loads and combines persona/strategy MD files |

### Safety Layers (in order)

1. **Layer 0 - Manual Master Switch**
   - Checks `conversations.ai_enabled`
   - If `false` → AI completely disabled for this lead

2. **Layer 1 - Status Lock**
   - Restricted states: `HUMAN_REVIEW`, `OFFER_SENT`, `NEGOTIATING`, `FCS_COMPLETE`
   - If in restricted state AND not manual command → AI stops

3. **Layer 2 - Human Interruption Check**
   - If human sent last message < 15 minutes ago → AI backs off

4. **Layer 3 - Offer Tool Security**
   - `generate_offer` tool only available if instruction contains "Generate Offer"

### Available Tools

| Tool | Description | Action |
|------|-------------|--------|
| `update_lead_status` | Updates CRM status | Sets `conversations.state` |
| `trigger_drive_sync` | Syncs Google Drive folder | Calls `driveService.syncDriveFiles()` |
| `consult_analyst` | Hands off to Gemini analyst | Locks lead to `HUMAN_REVIEW`, generates closing message |
| `generate_offer` | Creates formal offer | Calls `commanderService.generateOffer()` |
| `no_response_needed` | Stay silent | Returns `{shouldReply: false}` |

### Template Modes (Bypass AI)

| Trigger | Response |
|---------|----------|
| "Underwriter Hook" | "Hi {name} my name is Dan Torres..." |
| "Did you get funded already?" | "Did you get funded already?" |
| "The money is expensive as is" | "The money is expensive as is let me compete." |
| "should i close the file out?" | "Hey just following up again, should i close the file out?" |
| "any response would be appreciated" | "hey any response would be appreciated here, close this out?" |
| "closing out the file" | "Hey just wanted to follow up again, will be closing out the file..." |
| "Generate Ballpark Offer" | Gemini-generated blind offer based on revenue |

### Database Tables Used
- `conversations` (read state, ai_enabled, business info)
- `messages` (read history, check last outbound)
- `lead_strategy` (read game plan)
- `fcs_analyses` (read revenue for ballpark offer)
- `response_training` (write training data)

**Manual Send Tracking:**
- `routes/messages.js` calls `trackResponseForTraining(...)` for human-sent outbound messages and links `response_training.message_id` for outcome tracking.

---

## 3.2 `commanderService.js` - Strategy AI

**Purpose:** Analyzes FCS data and generates comprehensive sales strategy with offer scenarios.

**AI Model:** Gemini 2.5 Pro

### Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `analyzeAndStrategize` | `conversationId` | `gamePlan` object or `null` | Main strategy generation |
| `generateOffer` | `conversationId` | `offer` object or `null` | Generates formal offer |
| `reStrategize` | `conversationId`, `newContext` | `gamePlan` object | Updates existing strategy |
| `calculateWithholding` | `positions`, `revenue` | `{totalWithhold, breakdown}` | Calculates current withholding % |
| `generateScenariosFromGuidance` | `guidance`, `currentWithholdPct`, `revenue`, `lastPosition` | scenarios object | Generates conservative/moderate/aggressive scenarios |
| `loadPrompt` | `filename` | string | Loads prompt from `/prompts/commander/` |
| `injectVariables` | `template`, `variables` | string | Replaces `{{var}}` placeholders |

### Strategy Analysis Flow

```
1. Fetch FCS data from fcs_analyses
2. Fetch lead info (industry, state) from conversations
3. Query blocked lenders from lender_rules
4. Load strategy_analysis.md prompt
5. Call Gemini 2.5 Pro
6. Parse JSON response
7. Calculate withholding from active positions
8. Generate offer scenarios (conservative/moderate/aggressive/best_case)
9. Build game_plan object
10. Save to lead_strategy table
11. Save individual scenarios to strategy_scenarios table
12. Update conversation state (STRATEGIZED, DEAD, or HOT_LEAD)
```

### Offer Scenarios Generation

**Tiers:**
- **Conservative:** Lower risk, smaller amounts
- **Moderate:** Balanced approach
- **Aggressive:** Higher amounts, more risk
- **Best Case:** Optimal conditions

**Variables per scenario:**
- `funding` - Offer amount
- `term` - Length in days/weeks
- `termUnit` - 'days' or 'weeks'
- `payment` - Payment per period
- `frequency` - 'daily' or 'weekly'
- `factor` - Factor rate (default 1.49)
- `withholdAddition` - Additional withholding %
- `newTotalWithhold` - Resulting total withholding %

### Database Tables Used
- `fcs_analyses` (read FCS report)
- `conversations` (read industry, state)
- `lender_rules` (read blocked lenders)
- `lead_strategy` (write/update strategy)
- `strategy_scenarios` (write scenarios)

---

## 3.3 `fcsService.js` - Bank Statement Analyzer

**Purpose:** Extracts text from PDFs using Google Document AI, then analyzes with Gemini.

**AI Models:**
- Google Document AI (OCR/text extraction)
- Gemini 3 Pro Preview (analysis)

### Class: `FCSService`

**Properties:**
- `s3` - AWS S3 client
- `documentAI` - Google Document AI client
- `gemini` - Google Generative AI client
- `geminiModel` - Model name (default: 'gemini-3-pro-preview')

### Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `initializeGemini` | none | void | Lazy-loads Gemini client |
| `initializeDocumentAI` | none | void | Lazy-loads Document AI client |
| `extractTextFromDocumentSync` | `document`, `documentBuffer?` | string | Extracts text from PDF (up to 30 pages) |
| `generateAndSaveFCS` | `conversationId`, `businessName`, `db`, `documentIds?` | `{success, analysisId}` | Main entry point |
| `getDocumentBuffer` | `document` | Buffer | Downloads PDF from S3 |
| `generateFCSAnalysis` | `extractedData`, `businessName` | string | Calls Gemini for analysis |
| `cleanGeminiOutput` | `text` | string | Removes markdown artifacts |

### Helper Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `extractMoneyValue` | `text`, `label` | number | Extracts `$X,XXX` from text |
| `extractNumberValue` | `text`, `label` | number | Extracts integer from text |
| `extractStringValue` | `text`, `label` | string | Extracts text after label |
| `calculateWithholding` | `fcsReportText`, `monthlyRevenue` | string | Calculates withholding % from positions |
| `logFCSReport` | `conversationId`, `content`, `stage` | void | Writes to `/logs/fcs/` |

### Analysis Flow

```
1. Create/update fcs_analyses record (status: 'processing')
2. Fetch documents from S3 (all or selected IDs)
3. For each document:
   a. Download buffer from S3
   b. Call Document AI with imagelessMode=true (30-page limit)
   c. Extract text
4. Combine all extracted text
5. Load fcs_prompt.md template
6. Call Gemini with combined text
7. Clean output (remove markdown, normalize whitespace)
8. Extract metrics:
   - Average Revenue
   - Average Daily Balance
   - Deposit Count
   - Negative Days
   - Time in Business
   - Last MCA Date
   - State, Industry
   - Withholding %
9. Save to fcs_analyses (status: 'completed')
10. Log to files for debugging
```

### Database Tables Used
- `fcs_analyses` (write analysis)
- `documents` (read document list)

**Post-Processing:**
- `routes/fcs.js` auto-triggers `commanderService.analyzeAndStrategize(conversationId)` after FCS completes (both `/trigger/:conversationId` and job-based `/generate` flows).

---

## 3.4 `processorAgent.js` - Inbox Email Parser

**Purpose:** Background service that monitors Gmail inbox, parses lender responses, and updates deals.

**AI Model:** GPT-4o-mini

**Schedule:** Every 2 minutes

### Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `startProcessor` | none | void | Starts the processor loop |
| `runCheck` | none | void | Single check cycle |
| `processEmail` | `email`, `db` | void | Processes one email |
| `cleanupOldEmails` | none | void | Deletes records > 7 days old |
| `normalizeName` | `name` | string | Cleans business name for matching |
| `getSimilarity` | `s1`, `s2` | number | Levenshtein-based similarity (0-1) |
| `getSystemPrompt` | none | string | Loads `/prompts/email-analysis.md` |

### Email Processing Flow

```
1. Fetch 15 most recent emails via IMAP
2. For each email:
   a. Check if already processed (message_id or thread_id in processed_emails)
   b. If new, mark as processing
3. For each new email:
   a. Call GPT-4o-mini with email content
   b. Extract: business_name, lender, category, offer_amount, factor_rate, etc.
   c. Normalize business name
   d. Fuzzy match against conversations (similarity > 0.85)
   e. If match found:
      - Check if lender_submission exists
      - Update or create lender_submission
      - Update offer_details.history with new entry
      - If category = 'OFFER', set has_offer = TRUE
      - Write system note to ai_chat_messages
4. Emit Socket.IO event for UI refresh
```

### Lender Name Validation
- Extracted lender names are fuzzy-matched against the `lenders` table.
- Matches with 75%+ similarity are auto-corrected (e.g., "Superfast Capital" → "Super Fast Cap").
- Person names (2-3 words, no company keywords) are rejected.
- Unknown lenders are skipped and logged for review.

### Email Categories

| Category | Description |
|----------|-------------|
| `OFFER` | Lender made an offer |
| `DECLINED` | Lender declined |
| `APPROVED` | Approved but no offer details |
| `REQUEST` | Lender needs more info |
| `OTHER` | Unclassified |

### Database Tables Used
- `processed_emails` (read/write dedup)
- `conversations` (read for matching)
- `lender_submissions` (write updates)
- `ai_chat_messages` (write system notes)

---

## 3.5 `ruleLearner.js` - Decline Pattern Learning

**Purpose:** Analyzes declined deals to auto-suggest lender rules (blocked industries, states, etc.)

**AI Model:** Claude Haiku 4.5

**Schedule:** Every 30 minutes

### Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `startRuleLearner` | none | void | Starts the learning loop |
| `analyzeDeclines` | none | void | Single analysis cycle |
| `analyzeDecline` | `db`, `decline` | void | Analyzes one decline |
| `createSuggestedRule` | `db`, `decline`, `analysis` | void | Creates suggested rule |
| `markAnalyzed` | `db`, `submissionId` | void | Marks submission as analyzed |
| `analyzeDeclineById` | `submissionId` | `{success}` or `{error}` | Manual trigger |
| `getSuggestedRules` | none | array | Gets pending suggestions |
| `approveRule` | `ruleId` | `{success}` | Activates a rule |
| `rejectRule` | `ruleId` | `{success}` | Deletes a rule |

### Rule Types

| Type | Example |
|------|---------|
| `industry_block` | "No trucking companies" |
| `state_block` | "No California deals" |
| `minimum_requirement` | "Needs 24 months TIB" |
| `position_restriction` | "1st position only" |
| `other` | Catch-all |

### Analysis Flow

```
1. Query lender_submissions where:
   - status = 'DECLINED'
   - rule_analyzed = FALSE or NULL
   - decline_reason is not empty
2. For each decline:
   a. Call Claude Haiku with decline context
   b. Parse JSON response:
      - should_create_rule
      - confidence (0-1)
      - rule_type
      - industry/state/condition
      - decline_message
   c. If confidence >= 0.7:
      - Check for duplicate rules
      - Insert into lender_rules (source: 'ai_suggested', is_active: FALSE)
   d. Mark as analyzed
```

### Database Tables Used
- `lender_submissions` (read declines)
- `conversations` (read lead context)
- `lender_rules` (write suggestions)
- `lenders` (read lender IDs)

---

## 3.6 `successPredictor.js` - ML Success Predictions

**Purpose:** Predicts lender approval probability based on historical outcomes.

**AI Model:** None (pure statistics)

### Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `buildLenderProfiles` | none | `profiles` object | Builds stats from historical data |
| `predictSuccess` | `lenderName`, `criteria` | `{successRate, confidence, factors}` | Predicts success for one lender |
| `predictSuccessForAll` | `qualifiedLenders`, `criteria` | array | Bulk predictions |
| `refreshProfiles` | none | `profiles` | Force-rebuilds cache |
| `getProfiles` | none | `profiles` | Gets cached profiles |

### Profile Data Structure

```javascript
{
  "lender_name": {
    total: 50,
    approved: 35,
    declined: 15,
    overallSuccessRate: 0.7,
    industries: {
      "retail": { total: 10, approved: 8 },
      "restaurant": { total: 5, approved: 2 }
    },
    states: {
      "ny": { total: 20, approved: 15 }
    },
    avgApprovedRevenue: 45000,
    avgApprovedFico: 680,
    avgApprovedTib: 36,
    avgDeclinedRevenue: 25000,
    avgDeclinedFico: 620,
    avgDeclinedTib: 18,
    avgApprovedWithhold: 12,
    avgApprovedPositionCount: 2
  }
}
```

### Score Adjustments

| Factor | Impact |
|--------|--------|
| Industry match (2+ data points) | Blend with industry-specific rate |
| State match (2+ data points) | Blend with state-specific rate |
| Revenue >= avg approved | +5% |
| Revenue <= avg declined | -10% |
| FICO >= avg approved | +5% |
| FICO <= avg declined | -10% |
| TIB >= avg approved | +5% |
| TIB <= avg declined | -10% |
| Withhold <= avg approved | +5% |
| Withhold >= avg declined | -10% |
| Position count <= avg approved | +5% |
| Position count >= avg declined | -10% |

### Confidence Levels

| Data Points | Confidence |
|-------------|------------|
| < 3 | 'none' |
| 3-9 | 'low' |
| 10-24 | 'medium' |
| 25+ | 'high' |

### Database Tables Used
- `lender_submissions` (read historical outcomes)
- `conversations` (read deal criteria)

---

## 3.7 `driveService.js` - Google Drive Sync

**Purpose:** Finds and syncs bank statements from Google Drive folders.

**AI Model:** GPT-4-turbo (folder matching)

### Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `syncDriveFiles` | `conversationId`, `businessName` | `{success, count}` or `{error}` | Main sync function |

### Sync Flow

```
1. List all sub-folders in GDRIVE_PARENT_FOLDER_ID
2. Call GPT-4-turbo to fuzzy-match business name to folder
3. If match found:
   a. List PDF files in folder
   b. For each PDF:
      - Check for duplicates in documents table
      - Download from Drive
      - Upload to S3
      - Insert into documents table
   c. Update conversation state to 'FCS_READY'
4. Auto-trigger FCS analysis (fcsService.generateAndSaveFCS)
5. Auto-trigger Commander strategy (commanderService.analyzeAndStrategize)
```

### Database Tables Used
- `documents` (write synced files)
- `conversations` (update state)

### External Services
- Google Drive API (list folders, download files)
- AWS S3 (upload files)
- FCS Service (auto-triggered)
- Commander Service (auto-triggered)

---

## 3.8 `gmailInboxService.js` - IMAP Email Fetching

**Purpose:** Fetches emails from Gmail using IMAP with OAuth2.

### Class: `GmailInboxService`

**Properties:**
- `connection` - imap-simple connection
- `isFetching` - Lock to prevent concurrent fetches
- `user` - Gmail address
- `clientId`, `clientSecret`, `refreshToken` - OAuth2 credentials

### Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `connect` | none | boolean | Establishes IMAP connection |
| `getAccessToken` | none | string | Refreshes OAuth2 token |
| `buildXOAuth2Token` | `user`, `accessToken` | string | Builds XOAUTH2 string |
| `ensureConnection` | none | void | Reconnects if needed |
| `fetchEmails` | `options` | array | Fetches emails from inbox |
| `searchEmails` | `query` | array | Searches emails |
| `parseMessage` | `message` | object | Parses raw IMAP message |
| `formatAddress` | `addressObj` | `{name, email}` | Formats email address |
| `markAsRead` | `emailId` | void | Marks email as read |
| `markAsUnread` | `emailId` | void | Marks email as unread |
| `deleteEmail` | `emailId` | void | Deletes email |
| `getUnreadCount` | none | number | Counts unread emails |
| `disconnect` | none | void | Closes connection |
| `retryOperation` | `operation`, `maxRetries` | result | Retry wrapper |

### Fetch Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `folder` | string | 'INBOX' | IMAP folder |
| `limit` | number | 50 | Max emails to fetch |
| `offset` | number | 0 | Pagination offset |
| `unreadOnly` | boolean | false | Only unread emails |
| `since` | Date | midnight EST | Fetch emails since date |

### Rate Limiting

- 10-second cooldown between fetches (class-level static)
- `isFetching` lock prevents concurrent fetches
- Auto-reconnect on connection errors

### Email Object Structure

```javascript
{
  id: 12345,
  uid: 12345,
  messageId: "<abc@gmail.com>",
  subject: "Re: Funding Request",
  from: { name: "John", email: "john@example.com" },
  to: { name: "JMS Global", email: "deals@jms.com" },
  date: Date,
  timestamp: 1704384000000,
  text: "Plain text body...",
  html: "<html>...</html>",
  snippet: "First 150 chars...",
  attachments: [{ filename, contentType, size }],
  isUnread: true
}
```

---

## 3.9 `emailService.js` - Outbound Email Sending

**Purpose:** Sends emails via Gmail SMTP with OAuth2.

### Class: `EmailService`

### Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `initializeTransporter` | none | void | Sets up nodemailer |
| `sendLenderSubmission` | `lenderName`, `lenderEmail`, `businessData`, `documents`, `ccEmail` | `{success, messageId}` | Sends deal submission |
| `generateLenderEmailHtml` | `lenderName`, `businessData`, `documents` | string | Generates HTML email |
| `generateLenderEmailText` | `lenderName`, `businessData`, `documents` | string | Generates plain text |
| `sendBulkLenderSubmissions` | `lenders`, `businessData`, `documents` | `{successful, failed, summary}` | Bulk send |
| `testEmailConfiguration` | none | `{success}` or `{error}` | Tests connection |
| `sendEmail` | `{to, subject, html, text, attachments}` | `{success, messageId}` | Generic send |

### Email Configuration

- **Pool:** Yes (5 max connections)
- **Rate Limit:** 10 emails/second
- **Auth:** OAuth2 only (no password)

### Business Data Fields for Submission

| Field | Description |
|-------|-------------|
| `businessName` | Company name |
| `industry` | Business industry |
| `monthlyRevenue` | Monthly revenue |
| `state` | Business state |
| `fico` | Credit score |
| `tib` | Time in business (months) |
| `position` | Requested position |
| `negativeDays` | Negative balance days |

---

## 3.10 `tracersService.js` - Skip Tracing

**Purpose:** Looks up contact info via SSN or name/address.

**External API:** Galaxy/Tracers API

### Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `searchBySsn` | `ssn`, `firstName`, `lastName`, `address`, `city`, `state`, `zip` | `{success, match}` or `{error}` | Main lookup |
| `createPayload` | `overrides` | object | Builds API request |
| `callTracers` | `payload` | array | Calls Galaxy API |
| `parseTracersResponse` | `person` | object | Extracts key fields |

### Lookup Strategy

1. **Attempt 1:** Search by SSN only
2. **Attempt 2:** If no results, search by Name + Address
3. **AI Verification:** Use `aiMatcher.pickBestMatch()` to verify correct person

### Response Fields

| Field | Description |
|-------|-------------|
| `phone` | Best phone number (wireless preferred) |
| `address` | Current street address |
| `city` | City |
| `state` | State |
| `zip` | ZIP code |

---

## 3.11 `aiMatcher.js` - Fuzzy Name Matching

**Purpose:** Uses AI to match messy CSV names to search results.

**AI Model:** GPT-4o-mini

### Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `pickBestMatch` | `csvName`, `csvAddress`, `candidates` | matched object or `null` | AI-powered matching |

### Matching Rules (in prompt)

1. Account for nicknames (John = Jonathan)
2. Account for name swaps (Ahmad Hussain = Hussain Ahmad)
3. Account for typos (Dwyane = Dwayne)
4. Match business names to registered agents

### Response Format

```javascript
{ matchId: 2, reason: "Name matches with nickname variant" }
```

---

## 3.12 `aiService.js` - Chat Assistant

**Purpose:** Powers the in-app AI chat for reviewing deals.

**AI Model:** GPT-4o-mini

### Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `isConfigured` | none | boolean | Checks if API key exists |
| `getConfiguration` | none | object | Returns config info |
| `generateResponse` | `query`, `context` | `{success, response, usage}` | Generates chat response |
| `getSystemPrompt` | none | string | Loads `/prompts/chat-assistant.md` |

### Context Structure

The `context` parameter includes:
- `business_name` - Lead name
- `first_name`, `last_name` - Owner name
- `address`, `owner_city`, `owner_state` - Location
- `industry`, `credit_range` - Business info
- `monthly_revenue`, `funding_amount` - Financials
- `fcs` - Full FCS analysis object
- `game_plan` - Commander strategy
- `lender_submissions` - Lender offers array
- `chat_history` - Previous messages

### System Prompt Sections

1. **Business & Owner Details**
2. **Commander's Strategy** (if available)
3. **Bank Analysis (FCS)** (if available)
4. **Lender Offers** (if available)

---

## 3.13 `documentService.js` - PDF Generation

**Purpose:** Generates application PDFs from HTML templates.

### Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `generateLeadPDF` | `conversationId`, `applicationData`, `ownerName`, `clientIp` | `{success, s3Key, filename, docId}` | Generates signed PDF |
| `generatePopulatedTemplate` | `applicationData`, `ownerName`, `clientIp` | string (HTML) | Returns populated HTML |

### PDF Generation Flow

```
1. Prepare signature data (timestamp, IP)
2. Determine who is signing (Owner 1 vs Owner 2)
3. Load HTML template (/templates/app5.html)
4. Replace all {{placeholder}} values
5. Clean unreplaced placeholders
6. Remove Owner 2 section if no second owner
7. Launch Puppeteer
8. Render HTML to PDF
9. Upload to S3 (generated/{conversationId}/{timestamp}_{filename}.pdf)
10. Save metadata to documents table
```

### Template Placeholders

All `applicationData` keys become placeholders. Special signature fields:
- `signature_name_1`, `signature_name_2`
- `timestamp_str_1`, `timestamp_str_2`
- `ip_str_1`, `ip_str_2`
- `signature_date`

---

## 3.14 `lender-matcher.js` - Qualification Engine

**Purpose:** Matches deals to qualified lenders based on criteria.

### Class: `LenderMatcher extends EventEmitter`

### Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `qualifyLenders` | `conversationId`, `businessData`, `fcsData` | results object | Main qualification |
| `prepareQualificationData` | `businessData`, `fcsData` | object | Prepares API payload |
| `processQualificationResults` | `conversationId`, `results`, `qualificationData` | processed object | Maps results, scores, sorts, saves to DB |
| `calculateTIB` | `startDateStr` | number | Calculates months in business |
| `extractMaxAmount` | `lender` | number | Extracts max funding amount |
| `extractFactorRate` | `lender` | number | Extracts factor rate |
| `extractTermMonths` | `lender` | number | Extracts term |
| `calculateMatchScore` | `lender`, `qualificationData` | number (0-100) | Calculates fit score |
| `extractRequirements` | `lender` | object | Extracts lender requirements |
| `getQualifiedLenders` | `conversationId` | array | Gets saved qualifications |
| `getTopLenderRecommendation` | `conversationId` | lender object | Gets best match |
| `formatLendersForDisplay` | `lenders`, `maxLenders` | string | Formats for display |
| `formatLendersForSMS` | `lenders`, `maxLenders` | string | Formats for SMS |
| `requalifyLenders` | `conversationId` | results | Re-runs qualification |

---

### `/api/lenders/log-response` (POST)
- Updates `lender_submissions` with offer/decline info.
- If status is `OFFER` or `APPROVED`: sets `conversations.has_offer = TRUE`.
- If status is `FUNDED`: sets `conversations.has_offer = TRUE` and `conversations.state = 'FUNDED'`.

### `/api/conversations/:id/mark-funded` (POST)
- **Body:** `{ amount: number }`
- **Action:**
  - Sets `conversations.state = 'FUNDED'`
  - Sets `conversations.funded_amount` and `conversations.funded_at`
  - Updates any `lender_submissions` with status `OFFER` to `FUNDED`
- **Used by:** Stats "Active Offers" modal "Funded" button

### Dashboard Stats (`/api/stats`)
- **Offers count:** Queries `lender_submissions WHERE status = 'OFFER'` (not `conversations.has_offer`, which auto-clears on view).

### Match Score Calculation

| Factor | Points |
|--------|--------|
| Base score | 50 |
| Tier 1 lender | +50 |
| Tier 5 lender | +10 |
| Preferred industry | +20 |
| Revenue covers 3x | +15 |
| FICO >= 700 | +10 |
| FICO >= 650 | +5 |
| TIB >= 24 months | +10 |
| TIB >= 12 months | +5 |
| Negative days > 30 | -10 |
| Negative days > 15 | -5 |

### Events Emitted

| Event | Payload |
|-------|---------|
| `lenders_qualified` | `{conversationId, results, qualificationData}` |
| `qualification_error` | `{conversationId, error, businessData}` |

---

## 3.15 `database.js` - PostgreSQL Connection

**Purpose:** Manages database connection pool and schema migrations.

### Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `initialize` | none | void | Creates pool, runs migrations |
| `getDatabase` | none | Pool | Returns connection pool |

### Auto-Migrations (on startup)

1. Create `csv_imports` table + columns
2. Add `external_id`, `twilio_sid`, `media_url` to `messages`
3. Fix `message_type` constraint (add 'mms', 'whatsapp')
4. Create `documents` table
5. Create performance indexes
6. Create `lender_qualifications` table
7. Create `job_queue` table
8. Create `fcs_analyses` table
9. Create `fcs_results` table

---

# 4. DATA FLOWS

## 4.1 New Lead → Funding Flow

```
┌─────────────────┐
│  CSV Import /   │
│  Manual Entry   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  conversations  │  state: 'NEW'
│   (created)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  driveService   │  Auto-match business name to Drive folder
│  syncDriveFiles │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   documents     │  Bank statements saved to S3
│   (created)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  conversations  │  state: 'FCS_READY'
│   (updated)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   fcsService    │  Document AI + Gemini analysis
│generateAndSave  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  fcs_analyses   │  Revenue, balance, positions, etc.
│   (created)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│commanderService │  Gemini strategy analysis
│analyzeAndStrat  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ lead_strategy + │  Game plan + offer scenarios
│strategy_scenar  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  conversations  │  state: 'STRATEGIZED' / 'HOT_LEAD'
│   (updated)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ lender-matcher  │  Match to qualified lenders
│ qualifyLenders  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│lender_qualific  │  Qualified + non-qualified list
│   (created)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  emailService   │  Send deal packages to lenders
│sendLenderSubmis │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│lender_submissio │  status: 'SUBMITTED'
│   (created)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│processorAgent   │  Parse lender responses
│  (background)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│lender_submissio │  status: 'OFFER' / 'DECLINED'
│   (updated)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  conversations  │  has_offer: TRUE
│   (updated)     │
└─────────────────┘
```

## 4.2 Inbound SMS Flow

```
┌─────────────────┐
│  Twilio Webhook │
│  (inbound SMS)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    messages     │  direction: 'inbound'
│   (created)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   aiAgent.js    │
│ processLeadWith │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌────────┐
│Template│ │AI Mode │
│ Match  │ │GPT-4o  │
└───┬────┘ └───┬────┘
    │          │
    └────┬─────┘
         │
         ▼
┌─────────────────┐
│  Tool Calls?    │
└────────┬────────┘
         │
    ┌────┴────┬────────┬────────┐
    │         │        │        │
    ▼         ▼        ▼        ▼
┌────────┐┌────────┐┌────────┐┌────────┐
│update_ ││trigger_││consult_││no_resp │
│status  ││drive_  ││analyst ││needed  │
└───┬────┘│sync    │└───┬────┘└───┬────┘
    │     └───┬────┘    │         │
    │         │         │         │
    ▼         ▼         ▼         ▼
┌────────────────────────────────────┐
│  Generate Final Response (GPT-4o)  │
└────────────────┬───────────────────┘
                 │
                 ▼
┌─────────────────┐
│    messages     │  direction: 'outbound', sender_type: 'ai'
│   (created)     │
└────────┬────────┘
                 │
                 ▼
┌─────────────────┐
│response_training│  (training data saved)
│   (created)     │
└─────────────────┘
```

## 4.3 Inbox Processing Flow

```
┌─────────────────┐
│gmailInboxService│  Every 2 minutes
│  fetchEmails    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│processed_emails │  Check for duplicates
│   (query)       │
└────────┬────────┘
         │
         ▼ (new emails only)
┌─────────────────┐
│processed_emails │  Mark as processing
│   (insert)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   GPT-4o-mini   │  Extract: business_name, lender, category,
│  (extraction)   │  offer_amount, factor_rate, term, etc.
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  conversations  │  Fuzzy match (similarity > 0.85)
│   (query)       │
└────────┬────────┘
         │
         ▼ (if match found)
┌─────────────────┐
│lender_submissio │  Update/Insert
│   (upsert)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ai_chat_messages │  System note: "📩 INBOX UPDATE..."
│   (insert)      │
└────────┬────────┘
         │
         ▼ (if OFFER)
┌─────────────────┐
│  conversations  │  has_offer: TRUE
│   (update)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Socket.IO     │  'refresh_lead_list' event
│   (emit)        │
└─────────────────┘
```

## 4.4 Rule Learning Flow

```
┌─────────────────┐
│ Every 30 minutes│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│lender_submissio │  WHERE status='DECLINED' AND rule_analyzed=FALSE
│   (query)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Claude Haiku   │  Analyze decline pattern
│  (analysis)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Confidence    │
│   >= 0.7?       │
└────────┬────────┘
         │
    ┌────┴────┐
    │ YES     │ NO
    ▼         ▼
┌────────┐  ┌────────┐
│lender_ │  │ Skip   │
│rules   │  │        │
│(insert)│  └────────┘
└───┬────┘
    │
    ▼
┌─────────────────┐
│  source:        │
│ 'ai_suggested'  │
│ is_active:FALSE │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Admin Approval │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌────────┐
│Approve │ │Reject  │
│is_acti │ │DELETE  │
│ve:TRUE │ │        │
└────────┘ └────────┘
```

---

# 5. BACKGROUND JOBS & CRON

| Service | Interval | Function | Description |
|---------|----------|----------|-------------|
| `processorAgent.js` | 2 minutes | `runCheck()` | Parse inbox emails |
| `processorAgent.js` | 7 days | `cleanupOldEmails()` | Delete old processed_emails |
| `ruleLearner.js` | 30 minutes | `analyzeDeclines()` | Learn from declines |
| `successPredictor.js` | 1 hour (cache) | `buildLenderProfiles()` | Rebuild stats cache |
| `outcomeTracker.js` | 6 hours | `updateTrainingOutcomes()` | Refresh response_training outcomes |
| `outcomeTracker.js` | 1 minute after boot | `updateTrainingOutcomes()` | Startup backfill |

---

# 6. ENVIRONMENT VARIABLES

## Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/db` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |
| `GEMINI_API_KEY` | Google Gemini API key | `AIza...` |
| `ANTHROPIC_API_KEY` | Anthropic API key (Claude) | `sk-ant-...` |
| `AWS_ACCESS_KEY_ID` | AWS access key | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | `...` |
| `AWS_REGION` | AWS region | `us-east-1` |
| `S3_DOCUMENTS_BUCKET` | S3 bucket for documents | `jms-documents` |
| `GOOGLE_CREDENTIALS_JSON` | Google service account (base64 or raw JSON) | `{...}` |
| `GOOGLE_PROJECT_ID` | Google Cloud project ID | `my-project-123` |
| `DOCUMENT_AI_PROCESSOR_ID` | Document AI processor ID | `abc123` |
| `DOCUMENT_AI_LOCATION` | Document AI location | `us` |
| `GDRIVE_PARENT_FOLDER_ID` | Google Drive folder ID | `1abc...` |
| `EMAIL_USER` | Gmail address | `deals@jms.com` |
| `GMAIL_CLIENT_ID` | OAuth2 client ID | `...apps.googleusercontent.com` |
| `GMAIL_CLIENT_SECRET` | OAuth2 client secret | `GOCSPX-...` |
| `GMAIL_REFRESH_TOKEN` | OAuth2 refresh token | `1//0...` |
| `TRACERS_AP_NAME` | Tracers API username | `...` |
| `TRACERS_AP_PASSWORD` | Tracers API password | `...` |

## Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `RAILWAY_PUBLIC_DOMAIN` | Railway domain | (auto-detected) |
| `GEMINI_MODEL` | Gemini model name | `gemini-3-pro-preview` |
| `EMAIL_FROM` | Sender email | `EMAIL_USER` value |

---

# 7. EXTERNAL API INTEGRATIONS

## 7.1 OpenAI

| Service | Model | Purpose |
|---------|-------|---------|
| `aiAgent.js` | GPT-4o | SMS conversation AI |
| `aiService.js` | GPT-4o-mini | Chat assistant |
| `processorAgent.js` | GPT-4o-mini | Email extraction |
| `driveService.js` | GPT-4-turbo | Folder matching |
| `aiMatcher.js` | GPT-4o-mini | Name matching |

## 7.2 Google

| Service | API | Purpose |
|---------|-----|---------|
| `fcsService.js` | Document AI | PDF text extraction |
| `fcsService.js` | Gemini 2.5/3 Pro | Bank statement analysis |
| `commanderService.js` | Gemini 2.5 Pro | Strategy generation |
| `aiAgent.js` | Gemini 2.5 Pro | Analyst handoff |
| `driveService.js` | Drive API | Folder listing, file download |

## 7.3 AWS

| Service | AWS Service | Purpose |
|---------|-------------|---------|
| `fcsService.js` | S3 | Document storage |
| `driveService.js` | S3 | Document upload |
| `documentService.js` | S3 | PDF upload |

## 7.4 Other

| Service | API | Purpose |
|---------|-----|---------|
| `gmailInboxService.js` | Gmail IMAP | Fetch emails |
| `emailService.js` | Gmail SMTP | Send emails |
| `tracersService.js` | Galaxy/Tracers | Skip tracing |
| `ruleLearner.js` | Anthropic Claude | Decline analysis |

---

# 8. STATE MACHINES & ENUMS

## 8.1 Conversation States

```
                    ┌──────────────────────────────────────────────────┐
                    │                                                  │
                    ▼                                                  │
┌─────┐  sync   ┌─────────┐  fcs   ┌───────────┐  strategy  ┌──────────┴──┐
│ NEW │────────►│FCS_READY│───────►│FCS_COMPLETE│──────────►│ STRATEGIZED │
└─────┘         └─────────┘        └───────────┘            └──────┬──────┘
                                                                   │
                                          ┌────────────────────────┤
                                          │                        │
                                          ▼                        ▼
                                   ┌──────────┐             ┌──────────┐
                                   │ HOT_LEAD │             │ QUALIFIED│
                                   └────┬─────┘             └────┬─────┘
                                        │                        │
                                        └───────────┬────────────┘
                                                    │
                                                    ▼
                                            ┌───────────────┐
                                            │ HUMAN_REVIEW  │
                                            └───────┬───────┘
                                                    │
                               ┌────────────────────┼────────────────────┐
                               │                    │                    │
                               ▼                    ▼                    ▼
                        ┌───────────┐        ┌───────────┐        ┌──────────┐
                        │OFFER_SENT │        │NEGOTIATING│        │   DEAD   │
                        └─────┬─────┘        └─────┬─────┘        └──────────┘
                              │                    │
                              └─────────┬──────────┘
                                        │
                                        ▼
                                 ┌──────────┐
                                 │ FUNDED   │
                                 └────┬─────┘
                                      │
                                      ▼
                                 ┌──────────┐
                                 │ ARCHIVED │
                                 └──────────┘
```

## 8.2 Lender Submission Status

| Status | Description |
|--------|-------------|
| `PENDING` | Not yet submitted |
| `SUBMITTED` | Sent to lender |
| `APPROVED` | Lender approved (no details) |
| `OFFER` | Lender made offer |
| `DECLINED` | Lender declined |
| `FUNDED` | Deal funded |
| `OTHER` | Unclassified response |

**Note:** When a lender submission is marked `FUNDED` via `/api/lenders/log-response`, the parent `conversations.state` is automatically updated to `'FUNDED'`.

## 8.3 Lender Rule Types

| Type | Description |
|------|-------------|
| `industry_block` | Blocks specific industries |
| `state_block` | Blocks specific states |
| `minimum_requirement` | Requires min TIB/revenue/FICO |
| `position_restriction` | Position requirements (1st only, etc.) |
| `other` | Catch-all |

## 8.4 Rule Sources

| Source | Description |
|--------|-------------|
| `manual` | Manually entered by admin |
| `ai_suggested` | Suggested by ruleLearner (inactive) |
| `ai_applied` | Approved AI suggestion (active) |

## 8.5 Lead Grades

| Grade | Criteria |
|-------|----------|
| `A` | Revenue > $40,000/month |
| `B` | Revenue $25,000-$40,000/month |
| `C` | Revenue < $25,000/month |

## 8.6 Strategy Types

| Type | Criteria |
|------|----------|
| `PURSUE_HARD` | Revenue trending upward |
| `STANDARD` | Normal approach |
| `DEAD` | Not worth pursuing |

---

# 9. FILE STRUCTURE (Assumed)

```
backend/
├── services/
│   ├── aiAgent.js
│   ├── aiMatcher.js
│   ├── aiService.js
│   ├── commanderService.js
│   ├── database.js
│   ├── documentService.js
│   ├── driveService.js
│   ├── emailService.js
│   ├── fcsService.js
│   ├── gmailInboxService.js
│   ├── lender-matcher.js
│   ├── processorAgent.js
│   ├── ruleLearner.js
│   ├── successPredictor.js
│   └── tracersService.js
├── prompts/
│   ├── chat-assistant.md
│   ├── email-analysis.md
│   ├── fcs_prompt.md
│   ├── persona.md
│   ├── strategy_objectives.md
│   ├── strategy_vetting.md
│   ├── strategy_objections.md
│   ├── strategy_engagement.md
│   └── commander/
│       ├── strategy_analysis.md
│       ├── offer_generation.md
│       └── restrategize.md
├── templates/
│   └── app5.html
├── logs/
│   └── fcs/
├── config/
│   └── credentials.js
├── database/
│   └── db.js
├── routes/
│   └── (API routes)
└── .env
```

---

**END OF DOCUMENTATION**

*This document covers 15 services, 20+ database tables, 50+ functions, and complete data flows for the JMS Global MCA underwriting platform.*
