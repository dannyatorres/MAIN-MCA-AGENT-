# FCS Generation - Environment Variables Setup

## Required Environment Variables

Add these to your `.env` file and Railway:

### Google Document AI (for OCR)
```bash
# Google Cloud Project ID
GOOGLE_CLOUD_PROJECT=your-project-id

# Path to Google Cloud credentials JSON file
GOOGLE_APPLICATION_CREDENTIALS=/path/to/your-service-account-key.json

# Or set the JSON directly
GOOGLE_CLOUD_CREDENTIALS_JSON='{"type":"service_account","project_id":"...","private_key":"..."}'
```

### Google Gemini AI (for FCS Analysis)
```bash
# Gemini API Key from Google AI Studio
GEMINI_API_KEY=your-gemini-api-key-here
```

## How to Get These Credentials

### 1. Google Document AI

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the **Document AI API**
4. Create a **Service Account**:
   - Go to IAM & Admin → Service Accounts
   - Click "Create Service Account"
   - Give it name: "fcs-document-ai"
   - Grant role: "Document AI API User"
   - Click "Create Key" → JSON
   - Download the JSON file
5. Either:
   - Set `GOOGLE_APPLICATION_CREDENTIALS` to the path of the JSON file
   - OR copy the entire JSON content into `GOOGLE_CLOUD_CREDENTIALS_JSON`

### 2. Google Gemini API

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click "Get API Key"
3. Create a new API key or use existing
4. Copy the key and add to `GEMINI_API_KEY`

## Current Setup Status

✅ **Database**: fcs_analyses table created
✅ **Backend Service**: fcsService.js updated with Document AI + Gemini
✅ **API Routes**:
   - POST `/api/conversations/:id/fcs/generate` - Start generation
   - GET `/api/conversations/:id/fcs/status` - Check status
   - GET `/api/conversations/:id/fcs` - Get completed report
✅ **Frontend**: FCS tab updated to use new backend

## What's Different from n8n

| Feature | n8n (Old) | New Backend |
|---------|-----------|-------------|
| **Source** | Google Drive folders | S3 (documents already in DB) |
| **OCR** | Google Document AI | Google Document AI (same) |
| **AI** | Gemini 2.5 Pro | Gemini 2.5 Pro (same) |
| **Storage** | Email only | PostgreSQL + UI display |
| **Trigger** | Webhook | Button in FCS tab |
| **Status** | Email when done | Real-time polling |

## Testing

Once environment variables are set:

1. Select a conversation with uploaded documents
2. Click "Intelligence" tab → "FCS" sub-tab
3. Click "Generate FCS" button
4. Select documents (or use all)
5. Click "Confirm"
6. Watch status poll every 5 seconds
7. Report appears when complete

## Deployment to Railway

Add these environment variables in Railway:

1. Go to your Railway project
2. Select your backend service
3. Click "Variables" tab
4. Add each variable:
   - `GEMINI_API_KEY`
   - `GOOGLE_CLOUD_PROJECT`
   - `GOOGLE_CLOUD_CREDENTIALS_JSON` (paste entire JSON)

Railway will auto-deploy when you add variables.

## Troubleshooting

### "No text extracted"
- Check Document AI is enabled in Google Cloud
- Verify service account has correct permissions

### "Gemini returned empty analysis"
- Check GEMINI_API_KEY is valid
- Check API quota in Google AI Studio

### "FCS generation failed"
- Check Railway logs for detailed error
- Verify all environment variables are set
