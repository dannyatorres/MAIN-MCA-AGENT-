const https = require('https');
require('dotenv').config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
const newWebhookUrl = process.argv[2] || process.env.TWILIO_WEBHOOK_URL || 'https://your-webhook-url.com/webhook/sms';

if (!accountSid || !authToken || !phoneNumber) {
    console.error('❌ Missing required environment variables:');
    console.error('   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER');
    console.error('\nUsage: node update-twilio-webhook.js <new-webhook-url>');
    process.exit(1);
}

const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

console.log('🔍 Fetching phone number details...');

// Step 1: Get the phone number SID
const getOptions = {
    hostname: 'api.twilio.com',
    path: `/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`,
    method: 'GET',
    headers: {
        'Authorization': `Basic ${auth}`
    }
};

https.request(getOptions, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            const response = JSON.parse(data);
            const phone = response.incoming_phone_numbers.find(p => p.phone_number === phoneNumber);

            if (!phone) {
                console.error('❌ Phone number not found:', phoneNumber);
                process.exit(1);
            }

            console.log('✅ Found phone number SID:', phone.sid);
            console.log('📝 Current SMS URL:', phone.sms_url || 'Not set');
            console.log('🔄 Updating to:', newWebhookUrl);

            // Step 2: Update the webhook URL
            const updateData = `SmsUrl=${encodeURIComponent(newWebhookUrl)}&SmsMethod=POST`;

            const updateOptions = {
                hostname: 'api.twilio.com',
                path: `/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${phone.sid}.json`,
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': updateData.length
                }
            };

            const updateReq = https.request(updateOptions, (updateRes) => {
                let updateData = '';
                updateRes.on('data', (chunk) => updateData += chunk);
                updateRes.on('end', () => {
                    if (updateRes.statusCode === 200) {
                        console.log('✅ Webhook updated successfully!');
                        console.log('📱 Incoming SMS will now be sent to:', newWebhookUrl);
                    } else {
                        console.error('❌ Update failed:', updateData);
                    }
                });
            });

            updateReq.on('error', (error) => {
                console.error('❌ Update error:', error.message);
            });

            updateReq.write(updateData);
            updateReq.end();

        } catch (error) {
            console.error('❌ Parse error:', error.message);
            console.error('Response:', data);
        }
    });
}).on('error', (error) => {
    console.error('❌ Request error:', error.message);
}).end();
