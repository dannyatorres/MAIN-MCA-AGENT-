# Google Cloud Credentials Setup for Deployment

## Problem
Your application is running in a cloud environment (Render, Heroku, Railway, etc.) where file paths don't work. The error `/app/google-credentials.json` indicates the cloud platform can't find the credentials file.

## Solution
Use the `GOOGLE_CREDENTIALS_JSON` environment variable to pass credentials directly.

---

## Setup Instructions for Cloud Deployment

### Step 1: Get Your Credentials JSON (Already Done)
You have the credentials file at:
```
/Users/dannytorres/Documents/MCA-WORKING/google-credentials.json
```

### Step 2: Convert to Single-Line JSON

Run this command to get the single-line version:

```bash
cat /Users/dannytorres/Documents/MCA-WORKING/google-credentials.json | tr -d '\n'
```

**Copy the entire output** (it will be one very long line).

### Step 3: Add to Your Cloud Platform

Go to your deployment platform's environment variables settings:

#### For Render.com:
1. Go to your service dashboard
2. Click "Environment" tab
3. Add new environment variable:
   - **Key**: `GOOGLE_CREDENTIALS_JSON`
   - **Value**: Paste the single-line JSON from Step 2

#### For Heroku:
```bash
heroku config:set GOOGLE_CREDENTIALS_JSON='{"type":"service_account",...}'
```

#### For Railway:
1. Go to your project
2. Click "Variables" tab
3. Add new variable:
   - **Key**: `GOOGLE_CREDENTIALS_JSON`
   - **Value**: Paste the single-line JSON from Step 2

### Step 4: Add This Critical Environment Variable (IMPORTANT!)

Add this to force REST transport and avoid OpenSSL gRPC errors:

```bash
GOOGLE_CLOUD_USE_REST=true
```

### Step 5: Verify Other Google Environment Variables

Make sure these are also set in your cloud platform:

```bash
GOOGLE_PROJECT_ID=planar-outpost-462721-c8
DOCUMENT_AI_PROCESSOR_ID=693204b123757079
DOCUMENT_AI_LOCATION=us
```

### Step 6: Restart Your Application

After adding the environment variables, restart your deployment.

---

## Quick Copy-Paste Value

Run this command and copy the output:

```bash
echo "GOOGLE_CREDENTIALS_JSON=$(cat /Users/dannytorres/Documents/MCA-WORKING/google-credentials.json | tr -d '\n')"
```

Then paste just the value part (everything after the `=`) into your cloud platform's environment variable.

---

## Verification

After deployment, check your logs. You should see:

```
🔑 Using inline credentials from GOOGLE_CREDENTIALS_JSON
✅ Document AI initialized with service account credentials
```

Instead of the error:
```
❌ ENOENT: no such file or directory, open '/app/google-credentials.json'
```

---

## Local Development

For local development, keep using the file path method (already configured):

```bash
GOOGLE_APPLICATION_CREDENTIALS=/Users/dannytorres/Documents/MCA-WORKING/google-credentials.json
```

The code automatically detects which method to use.
