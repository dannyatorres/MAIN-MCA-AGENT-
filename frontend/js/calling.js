// calling.js - Twilio Voice Client Module

class CallManager {
    constructor() {
        this.device = null;
        this.activeConnection = null;
        this.token = null;
        this.timerInterval = null;
        this.callStartTime = null;
        this.currentConversationId = null;
    }

    async init() {
        try {
            // Fetch Token from backend
            const response = await fetch('/api/calling/token');
            const data = await response.json();
            this.token = data.token;

            // Initialize Twilio Device
            this.device = new Twilio.Device(this.token, {
                codecPreferences: ['opus', 'pcmu'],
                fakeLocalDTMF: true,
                enableRingingState: true
            });

            this.device.on('ready', () => {
                console.log('📞 Twilio Device Ready');
            });

            this.device.on('error', (error) => {
                console.error('📞 Twilio Error:', error);
                this.handleDisconnectUI();
            });

            this.device.on('disconnect', () => {
                console.log('📞 Call disconnected');
                this.handleDisconnectUI();
            });

            console.log('📞 CallManager initialized');
            return true;

        } catch (err) {
            console.error('📞 Failed to init calling:', err);
            return false;
        }
    }

    async startCall(phoneNumber, conversationId = null) {
        if (!this.device) {
            const initialized = await this.init();
            if (!initialized) {
                alert('Failed to initialize calling. Please check your connection.');
                return null;
            }
        }

        this.currentConversationId = conversationId;

        const params = {
            To: phoneNumber,
            conversationId: conversationId || ''
        };

        try {
            // Connect the call
            this.activeConnection = await this.device.connect({ params });

            // Setup event listeners for the active call
            this.activeConnection.on('accept', () => {
                console.log('📞 Call accepted');
                this.updateCallStatus('Connected');
                this.startTimer();
            });

            this.activeConnection.on('ringing', () => {
                console.log('📞 Ringing...');
                this.updateCallStatus('Ringing...');
            });

            this.activeConnection.on('disconnect', () => {
                console.log('📞 Call ended');
                this.handleDisconnectUI();
            });

            this.activeConnection.on('cancel', () => {
                console.log('📞 Call cancelled');
                this.handleDisconnectUI();
            });

            this.activeConnection.on('reject', () => {
                console.log('📞 Call rejected');
                this.handleDisconnectUI();
            });

            // Show UI
            this.showCallUI();
            this.updateCallStatus('Calling...');

            return this.activeConnection;

        } catch (error) {
            console.error('📞 Failed to start call:', error);
            alert('Failed to start call: ' + error.message);
            return null;
        }
    }

    endCall() {
        if (this.device) {
            this.device.disconnectAll();
        }
        this.handleDisconnectUI();
    }

    toggleMute() {
        if (this.activeConnection) {
            const isMuted = this.activeConnection.isMuted();
            this.activeConnection.mute(!isMuted);

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
        }
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

        if (callBar) callBar.classList.add('hidden');
        if (callBtn) callBtn.classList.remove('active');

        // Reset mute button
        if (muteBtn) muteBtn.classList.remove('muted');
        if (icon) {
            icon.classList.add('fa-microphone');
            icon.classList.remove('fa-microphone-slash');
        }

        // Stop timer
        this.stopTimer();

        // Reset state
        this.activeConnection = null;
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

        const timerEl = document.getElementById('callTimer');
        if (timerEl) {
            timerEl.textContent = '00:00';
        }
    }
}

// Create global instance
window.callManager = new CallManager();
