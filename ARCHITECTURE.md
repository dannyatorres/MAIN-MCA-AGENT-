# 🏗️ MASTER ARCHITECTURE DOCUMENT: MCA-WORKING

## 1. High-Level System Concept
An AI-driven Merchant Cash Advance (MCA) CRM that automates lead ingestion, underwriting analysis, and lender submission.
- **Core Logic:** Uses specialized AI agents ("Commander" for strategy, "Processor" for email parsing).
- **FCS Engine:** Automated Bank Statement analysis using Google Document AI + Gemini.
- **Frontend:** Vanilla JS Single Page Application (SPA) using a class-based controller pattern.

## 2. Tech Stack
- **Backend:** Node.js (Express), hosted on Railway.
- **Database:** PostgreSQL (accessed via `pg` Pool).
- **Frontend:** HTML5, CSS Modules, Vanilla JS (Class-based architecture).
- **AI Ops:**
  - **FCS:** Google Document AI (OCR) + Gemini (Analysis).
  - **Commander:** LLM for strategy.

## 3. Directory & File Responsibility

### 🟢 Backend (`/backend`)
- **Entry:** `server-new.js` (Main Express server, middleware setup).
- **Database:** `database.js` (PG Pool connection).
- **Services (`/services`):**
  - `processorAgent.js`: **Ingestion Engine.** Parses incoming emails, extracts lead data (recently patched for crash resistance).
  - `commanderService.js`: **Strategy Brain.** High-level decision making on leads.
  - `fcsService.js`: Handles PDF upload -> Google DocAI OCR -> Gemini Analysis -> Outputs JSON (Revenue, Balances, Negative Days).
- **Routes (`/routes`):**
  - `conversations.js`: Lead CRUD, Lender submission endpoints.
- **Prompts (`/prompts`):**
  - System instructions for `Commander`, `Chat`, and `FCS` agents.

### 🔵 Frontend (`/frontend`)
- **Entry:** `app-bootstrap.js` (Initializes global instances).
- **Core Architecture (Class-Based):**
  - `app-core.js`: Exports `CommandCenter` class (The central controller).
  - `conversation-core.js`: Manages Lead Lists via `this.conversations = new Map()`.
- **UI Components:**
  - `/js/intelligence-tabs`: Modular tab components (Lead View, AI Chat, Lender Data).
- **State Management:**
  - Global accessible via `window.commandCenter` and `window.appState`.

## 4. Key Data Flows

### A. The "FCS" Pipeline (Underwriting)
1. **Input:** PDF Bank Statements uploaded.
2. **Processing:**
   - Step 1: **Google DocAI** OCRs the PDF.
   - Step 2: **Gemini** analyzes text for "Financial Health" (Avg Revenue, Daily Balance, Neg Days).
3. **Output:** JSON data stored in PostgreSQL, displayed in Frontend Intelligence Tabs.

### B. Lead Ingestion
1. **Source:** Email hits inbox.
2. **Processor:** `processorAgent.js` detects, parses, and structures data.
3. **Storage:** Saves to `conversations` table in Postgres.
4. **UI Update:** `window.commandCenter` refreshes list via WebSocket or polling.

### C. Lender Submission
1. **Input:** User selects lenders from qualification list.
2. **Processing:** `conversations.js` route ranks lenders by `successPredictor`, sends emails.
3. **Learning:** `ruleLearner.js` analyzes declines to build blocking rules.

## 5. Global State (Frontend)
The app relies on global distinct class instances for communication:
```javascript
window.appState = { ... }             // Shared simple state
window.commandCenter = new CommandCenter() // MAIN CONTROLLER (The Brain)
window.callManager = new CallManager()     // Phone/Dialer logic
```
**Pattern:** Modules do not import each other directly; they communicate through `window.commandCenter`.

## 6. Known Context/Constraints
- **Database Host:** Railway (PostgreSQL).
- **Frontend Constraint:** No React/Vue/Frameworks. Pure JS Classes + DOM manipulation.
- **Critical Logic:** The `processorAgent` must remain crash-resistant as it runs as a background watcher.

## 7. AI Services Summary
| Service | Purpose | Model |
|---------|---------|-------|
| `processorAgent.js` | Email parsing & lead extraction | GPT-4o-mini |
| `commanderService.js` | Strategy analysis & scenarios | Gemini 2.5 Pro |
| `fcsService.js` | Bank statement analysis | Google DocAI + Gemini |
| `ruleLearner.js` | Learn from lender declines | Claude Haiku |
| `successPredictor.js` | Predict lender approval rates | Statistical (no LLM) |

## 8. Key Database Tables
- `conversations` - Main leads table (consolidated, no separate lead_details)
- `lender_submissions` - Track submissions & responses per lender
- `fcs_analyses` - Bank statement analysis results
- `lead_strategy` - Commander strategy output
- `lender_rules` - Learned blocking rules (industry/state)
- `processed_emails` - Deduplication for email processor
