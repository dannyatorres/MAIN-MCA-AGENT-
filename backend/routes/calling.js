// calling.js - Twilio Voice API Routes
const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;
const VoiceResponse = twilio.twiml.VoiceResponse;
const { getDatabase } = require('../services/database');

const normalizePhoneNumber = (value) => {
    const digits = (value || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    if (value.startsWith('+')) return value;
    return `+${digits}`;
};

const buildPublicUrl = (req, pathname) => {
    const base =
        process.env.PUBLIC_API_URL ||
        process.env.PUBLIC_URL ||
        `${req.protocol}://${req.get('host')}`;
    return new URL(pathname, base).toString();
};

// 1. GET TOKEN (Browser requests this to initialize phone)
router.get('/token', (req, res) => {
    try {
        // In production, ensure req.session.user exists
        const identity = req.session?.user || `agent-${Math.random().toString(36).substring(2, 8)}`;

        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_API_KEY || !process.env.TWILIO_API_SECRET || !process.env.TWILIO_TWIML_APP_SID) {
            console.error('❌ Missing Twilio env vars for token generation');
            return res.status(500).json({ error: 'Twilio not configured' });
        }

        const voiceGrant = new VoiceGrant({
            outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
            incomingAllow: true, // Allow receiving calls (optional)
        });

        const token = new AccessToken(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_API_KEY,
            process.env.TWILIO_API_SECRET,
            { identity: identity }
        );

        token.addGrant(voiceGrant);

        console.log('📞 Generated Twilio Voice token for:', identity);
        res.json({ token: token.toJwt() });
    } catch (error) {
        console.error('❌ Error generating Twilio token:', error);
        res.status(500).json({ error: 'Failed to generate token' });
    }
});

// 2. VOICE WEBHOOK (Twilio hits this when browser says "Connect")
router.post('/voice', (req, res) => {
    const response = new VoiceResponse();
    const { To: toRaw, conversationId } = req.body;

    const to = normalizePhoneNumber(toRaw);

    console.log('📞 Voice webhook received:', { to: toRaw, normalized: to, conversationId });

    if (!to) {
        response.say('The phone number is invalid.');
        res.type('text/xml');
        return res.send(response.toString());
    }

    if (!process.env.TWILIO_CALLER_ID) {
        console.error('❌ TWILIO_CALLER_ID not set');
        response.say('Caller ID is not configured on the server.');
        res.type('text/xml');
        return res.send(response.toString());
    }

    const statusCallbackUrl = buildPublicUrl(req, `/api/calling/status?conversationId=${conversationId || ''}`);
    const recordingCallbackUrl = buildPublicUrl(req, `/api/calling/recording-status?conversationId=${conversationId || ''}`);

    if (to) {
        // Dialing a real phone number
        const dial = response.dial({
            callerId: process.env.TWILIO_CALLER_ID,
            answerOnBridge: true,
            record: 'record-from-answer-dual', // Record both sides
            recordingStatusCallback: recordingCallbackUrl,
            recordingStatusCallbackEvent: ['completed'],
            statusCallback: statusCallbackUrl,
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
        });
        dial.number(to);
    } else {
        response.say("Invalid number.");
    }

    res.type('text/xml');
    res.send(response.toString());
});

// 3. CALL STATUS WEBHOOK (Track call lifecycle)
router.post('/status', (req, res) => {
    const { CallSid, CallStatus, CallDuration, To, From, RecordingUrl } = req.body;
    const { conversationId } = req.query;

    console.log('📞 Call status update:', {
        sid: CallSid,
        status: CallStatus,
        duration: CallDuration,
        to: To,
        from: From,
        conversationId
    });

    // Persist call result to messages table for history
    if (conversationId && ['completed', 'no-answer', 'busy', 'failed', 'canceled'].includes((CallStatus || '').toLowerCase())) {
        try {
            const db = getDatabase();
            const summary = `Call ${CallStatus || 'completed'}${CallDuration ? `: ${CallDuration}s` : ''}`;
            const meta = JSON.stringify({ sid: CallSid, recording: RecordingUrl || null, to: To, from: From });

            db.query(
                `
                INSERT INTO messages (
                    conversation_id,
                    content,
                    direction,
                    message_type,
                    sent_by,
                    timestamp,
                    status,
                    media_url
                )
                VALUES ($1, $2, 'outbound', 'system', 'system', NOW(), $3, $4)
                `,
                [conversationId, `${summary} | ${meta}`, CallStatus || 'completed', RecordingUrl || null]
            ).catch(err => {
                console.error('❌ Failed to log call status to messages:', err.message);
            });
        } catch (err) {
            console.error('❌ DB error logging call status:', err.message);
        }
    }

    res.sendStatus(200);
});

// 4. RECORDING STATUS WEBHOOK (Get recording URL when ready)
router.post('/recording-status', (req, res) => {
    const { CallSid, RecordingSid, RecordingUrl, RecordingStatus, RecordingDuration } = req.body;

    console.log('📞 Recording ready:', {
        callSid: CallSid,
        recordingSid: RecordingSid,
        url: RecordingUrl,
        status: RecordingStatus,
        duration: RecordingDuration
    });

    // TODO: Save recording URL to call_logs table
    // RecordingUrl format: https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Recordings/{RecordingSid}
    // Add .mp3 or .wav to download

    res.sendStatus(200);
});

module.exports = router;
