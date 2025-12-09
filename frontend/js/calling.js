// calling.js - Twilio Voice Client Module

class CallManager {
    constructor() {
        this.device = null;
        this.activeCall = null;
        this.token = null;
        this.timerInterval = null;
        this.callStartTime = null;
        this.currentConversationId = null;
        this.isInitialized = false;
    }

    async init() {
        // Wait for Twilio SDK to load (up to 5 seconds)
        let attempts = 0;
        while (typeof Twilio === 'undefined' && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        if (typeof Twilio === 'undefined') {
            console.error('📞 Twilio SDK not loaded after waiting');
            alert('Voice calling is not available. Please refresh the page and try again.');
            return false;
        }

        try {
            console.log('📞 Initializing Call Manager (Twilio SDK found)...');

            // Fetch Token from backend
            const response = await fetch('/api/calling/token');
            const data = await response.json();

            if (!data.token) {
                throw new Error('No token received from server');
            }
            this.token = data.token;

            // Initialize Twilio Device (SDK 2.x API)
            this.device = new Twilio.Device(this.token, {
                codecPreferences: ['opus', 'pcmu'],
                fakeLocalDTMF: true,
                enableRingingState: true
            });

            // Register event handlers
            this.device.on('registered', () => {
                console.log('📞 Twilio Device Registered');
                this.isInitialized = true;
            });

            this.device.on('error', (error) => {
                console.error('📞 Twilio Device Error:', error);
                this.handleDisconnectUI();
            });

            this.device.on('incoming', (call) => {
                console.log('📞 Incoming call from:', call.parameters.From);
                // For now, just reject incoming calls
                call.reject();
            });

            // Register the device
            await this.device.register();

            console.log('📞 CallManager initialized successfully');
            return true;

        } catch (err) {
            console.error('📞 Failed to init calling:', err);
            return false;
        }
    }

    async startCall(phoneNumber, conversationId = null) {
        // Initialize if not already done
        if (!this.device || !this.isInitialized) {
            const initialized = await this.init();
            if (!initialized) {
                alert('Failed to initialize calling. Please check your connection.');
                return null;
            }
        }

        this.currentConversationId = conversationId;

        // Show UI immediately
        this.showCallUI();
        this.updateCallStatus('Connecting...');

        try {
            // Connect the call (SDK 2.x API)
            const params = {
                To: phoneNumber,
                conversationId: conversationId || ''
            };

            this.activeCall = await this.device.connect({ params });

            // Setup event listeners for the active call
            this.activeCall.on('accept', () => {
                console.log('📞 Call accepted');
                this.updateCallStatus('Connected');
                this.startTimer();
            });

            this.activeCall.on('ringing', () => {
                console.log('📞 Ringing...');
                this.updateCallStatus('Ringing...');
            });

            this.activeCall.on('disconnect', () => {
                console.log('📞 Call disconnected');
                this.handleDisconnectUI();
            });

            this.activeCall.on('cancel', () => {
                console.log('📞 Call cancelled');
                this.handleDisconnectUI();
            });

            this.activeCall.on('reject', () => {
                console.log('📞 Call rejected');
                this.updateCallStatus('Rejected');
                setTimeout(() => this.handleDisconnectUI(), 1500);
            });

            this.activeCall.on('error', (error) => {
                console.error('📞 Call error:', error);
                this.updateCallStatus('Error');
                setTimeout(() => this.handleDisconnectUI(), 1500);
            });

            return this.activeCall;

        } catch (error) {
            console.error('📞 Failed to start call:', error);
            this.updateCallStatus('Failed');
            setTimeout(() => this.handleDisconnectUI(), 1500);
            return null;
        }
    }

    endCall() {
        if (this.activeCall) {
            this.activeCall.disconnect();
        }
        // Ensure all connections are closed
        if (this.device) {
            this.device.disconnectAll();
        }
        this.handleDisconnectUI();
    }

    toggleMute() {
        if (this.activeCall) {
            const isMuted = this.activeCall.isMuted();
            this.activeCall.mute(!isMuted);

            const muteBtn = document.getElementById('muteBtn');
            const icon = muteBtn?.querySelector('i');

            if (muteBtn) {
                muteBtn.classList.toggle('muted', !isMuted);
            }
            if (icon) {
                icon.classList.toggle('fa-microphone', isMuted);
                icon.classList.toggle('fa-microphone-slash', !isMuted);
            }

            console.log('📞 Mute toggled:', !isMuted);
            return !isMuted;
        }
        return false;
    }

    // UI Helpers
    showCallUI() {
        const callBar = document.getElementById('callBar');
        const callBtn = document.getElementById('callBtn');

        if (callBar) callBar.classList.remove('hidden');
        if (callBtn) callBtn.classList.add('active');
    }

    handleDisconnectUI() {
        const callBar = document.getElementById('callBar');
        const callBtn = document.getElementById('callBtn');
        const muteBtn = document.getElementById('muteBtn');
        const icon = muteBtn?.querySelector('i');

        // Small delay before hiding to show "Ended" status
        setTimeout(() => {
            if (callBar) callBar.classList.add('hidden');
            if (callBtn) callBtn.classList.remove('active');

            // Reset mute button
            if (muteBtn) muteBtn.classList.remove('muted');
            if (icon) {
                icon.classList.add('fa-microphone');
                icon.classList.remove('fa-microphone-slash');
            }

            // Reset timer display
            const timerEl = document.getElementById('callTimer');
            if (timerEl) timerEl.textContent = '00:00';

            // Reset status
            this.updateCallStatus('Calling...');
        }, 1500);

        // Stop timer immediately
        this.stopTimer();

        // Reset state
        this.activeCall = null;
        this.currentConversationId = null;
    }

    updateCallStatus(status) {
        const statusEl = document.querySelector('.call-status');
        if (statusEl) {
            statusEl.textContent = status;
        }
    }

    startTimer() {
        this.callStartTime = Date.now();
        const timerEl = document.getElementById('callTimer');

        this.timerInterval = setInterval(() => {
            if (timerEl && this.callStartTime) {
                const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
                const seconds = (elapsed % 60).toString().padStart(2, '0');
                timerEl.textContent = `${minutes}:${seconds}`;
            }
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        this.callStartTime = null;
    }
}

// Create global instance
window.callManager = new CallManager();

// Log when script loads
console.log('📞 calling.js loaded, Twilio available:', typeof Twilio !== 'undefined');
