// calling.js - Twilio Voice API Routes
const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;
const VoiceResponse = twilio.twiml.VoiceResponse;

// 1. GET TOKEN (Browser requests this to initialize phone)
router.get('/token', (req, res) => {
    try {
        // In production, ensure req.session.user exists
        const identity = req.session?.user || 'agent-generic';

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
    const { To, conversationId } = req.body;

    console.log('📞 Voice webhook received:', { To, conversationId });

    if (To) {
        // Dialing a real phone number
        const dial = response.dial({
            callerId: process.env.TWILIO_CALLER_ID,
            answerOnBridge: true,
            record: 'record-from-answer-dual', // Record both sides
            recordingStatusCallback: '/api/calling/recording-status',
            recordingStatusCallbackEvent: ['completed']
        });
        dial.number(To);
    } else {
        response.say("Invalid number.");
    }

    res.type('text/xml');
    res.send(response.toString());
});

// 3. CALL STATUS WEBHOOK (Track call lifecycle)
router.post('/status', (req, res) => {
    const { CallSid, CallStatus, CallDuration, To, From } = req.body;

    console.log('📞 Call status update:', {
        sid: CallSid,
        status: CallStatus,
        duration: CallDuration,
        to: To,
        from: From
    });

    // TODO: Update call_logs table with status
    // This fires for: initiated, ringing, in-progress, completed, busy, no-answer, failed

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
