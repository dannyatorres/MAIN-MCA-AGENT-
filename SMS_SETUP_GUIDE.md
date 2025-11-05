# Full Texting App Configuration Guide

## ✅ What's Already Done
- ✅ Twilio SMS package installed
- ✅ SMS sending endpoint: `POST /api/conversations/:id/messages` 
- ✅ SMS receiving webhook: `POST /webhook/sms`
- ✅ Database integration for storing messages
- ✅ Frontend messaging interface ready

## 🔧 Configuration Steps Required

### Step 1: Get Twilio Account & Credentials
1. **Sign up for Twilio**: https://www.twilio.com/try-twilio
2. **Get your credentials** from Twilio Console:
   - Account SID
   - Auth Token  
3. **Buy a phone number** for SMS in Twilio Console

### Step 2: Update Environment Variables
Edit your `.env` file and replace the placeholder values:

```bash
# Replace these with your actual Twilio credentials
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_actual_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890  # Your purchased Twilio number
```

### Step 3: Configure Twilio Webhook (Production Only)
For production, you need to:
1. **Deploy your app** to a public URL (Heroku, Vercel, etc.)
2. **Configure webhook URL** in Twilio Console:
   - Go to Phone Numbers → Manage → Active Numbers
   - Click your SMS number
   - Set webhook URL: `https://yourdomain.com/webhook/sms`
   - Set HTTP method to POST

### Step 4: Test the Configuration

#### Local Testing (Without Webhook)
1. Start your server: `npm start` or `node server.js`
2. Open the frontend: http://localhost:8080/command-center.html
3. Click on any conversation
4. Type a message and press send
5. Check server logs for Twilio API calls

#### Production Testing (Full SMS)
1. Deploy to production
2. Configure Twilio webhook (Step 3)
3. Send SMS to your Twilio number from any phone
4. Message should appear in your app
5. Reply from app should send SMS back

## 📱 How It Works

### Sending SMS (Outbound)
1. User types message in frontend
2. Frontend calls: `POST /api/conversations/{id}/messages`
3. Server stores message in database
4. Server calls Twilio API to send SMS
5. Real-time update via WebSocket

### Receiving SMS (Inbound) 
1. Someone texts your Twilio number
2. Twilio calls your webhook: `POST /webhook/sms`
3. Server creates/finds conversation
4. Server stores incoming message
5. Real-time update via WebSocket

## 🗃️ Database Schema
The app uses these tables for messages:

```sql
-- Messages are stored here
messages (
  id, 
  conversation_id, 
  sender_type,      -- 'user' or 'lead'
  message_content,
  created_at,
  status,           -- 'sending', 'sent', 'delivered', 'failed'
  twilio_sid        -- Twilio message ID
)

-- Conversations link to phone numbers
conversations (
  id,
  lead_phone,       -- Phone number (+1234567890)
  business_name,
  state,
  last_activity
)
```

## ⚠️ Important Notes

1. **Local Development**: Webhook won't work locally. Use tools like ngrok for testing
2. **Phone Number Format**: Use E.164 format (+1234567890)
3. **Costs**: Twilio charges per SMS sent/received
4. **Rate Limits**: Twilio has sending limits for new accounts

## 🔍 Troubleshooting

### "Twilio not configured" warning
- Check your .env file has correct TWILIO_* values
- Restart your server after changing .env

### SMS not sending
- Check Twilio console for error logs
- Verify phone number format (+1234567890)
- Check Twilio account balance

### Not receiving SMS
- Verify webhook URL is correct and public
- Check server logs for webhook calls
- Test webhook URL manually with curl

## 🚀 You're Ready!
After completing these steps, you'll have a full texting app that can:
- ✅ Send SMS messages through the web interface
- ✅ Receive SMS replies automatically  
- ✅ Track conversation history
- ✅ Handle multiple conversations
- ✅ Real-time message updates