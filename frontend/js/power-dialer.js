// js/power-dialer.js - Power Dialer Module

class PowerDialer {
    constructor() {
        this.queue = [];
        this.currentIndex = 0;
        this.currentLead = null;
        this.isActive = false;
        this.currentAttempt = 1;
        this.maxAttempts = 2;
        this.timerInterval = null;
        this.callStartTime = null;

        // Stats for session
        this.stats = {
            answered: 0,
            noAnswer: 0,
            voicemail: 0,
            wrongNumber: 0,
            skipped: 0
        };

        this.init();
    }

    init() {
        this.bindEvents();
        console.log('📞 PowerDialer initialized');
    }

    bindEvents() {
        // Start button
        document.getElementById('dialerStartBtn')?.addEventListener('click', () => {
            this.start();
        });

        // Stop button
        document.getElementById('dialerStopBtn')?.addEventListener('click', () => {
            this.stop();
        });

        // Disposition buttons
        document.querySelectorAll('.disposition-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const disposition = e.currentTarget.dataset.disposition;
                this.logDisposition(disposition);
            });
        });
    }

    // Show the dialer view
    show() {
        const dashboard = document.getElementById('dashboardView');
        const chat = document.getElementById('chatView');
        const dialer = document.getElementById('dialerView');

        dashboard?.classList.add('hidden');
        chat?.classList.add('hidden');
        dialer?.classList.remove('hidden');

        this.loadQueue();
    }

    // Hide dialer and return to dashboard
    hide() {
        const dashboard = document.getElementById('dashboardView');
        const dialer = document.getElementById('dialerView');

        dialer?.classList.add('hidden');
        dashboard?.classList.remove('hidden');

        this.reset();
    }

    // Load leads who haven't responded to SMS
    async loadQueue() {
        try {
            // Fetch leads that are in "ghosted" states
            const response = await fetch('/api/dialer/queue');
            const data = await response.json();

            if (data.success && data.leads) {
                this.queue = data.leads;
                this.updateQueueCount();
                console.log(`📞 Loaded ${this.queue.length} leads for dialing`);
            } else {
                this.queue = [];
                this.updateQueueCount();
            }
        } catch (err) {
            console.error('📞 Failed to load dialer queue:', err);
            this.queue = [];
            this.updateQueueCount();
        }
    }

    updateQueueCount() {
        const el = document.getElementById('dialerQueueCount');
        if (el) el.textContent = this.queue.length;
    }

    // Start the dialing session
    async start() {
        if (this.queue.length === 0) {
            alert('No leads in queue. Try refreshing or check your filters.');
            return;
        }

        this.isActive = true;
        this.currentIndex = 0;
        this.currentAttempt = 1;
        this.stats = { answered: 0, noAnswer: 0, voicemail: 0, wrongNumber: 0, skipped: 0 };

        // Switch UI states
        document.getElementById('dialerIdleState')?.classList.add('hidden');
        document.getElementById('dialerActiveState')?.classList.remove('hidden');
        document.getElementById('dialerDisposition')?.classList.remove('hidden');
        document.getElementById('dialerStopBtn')?.classList.remove('hidden');
        document.getElementById('dialerNextUp')?.classList.remove('hidden');

        // Start calling
        this.dialNext();
    }

    // Stop the dialing session
    stop() {
        this.isActive = false;

        // End any active call
        if (window.callManager?.activeCall) {
            window.callManager.endCall();
        }

        this.stopTimer();
        this.showComplete();
    }

    // Dial the next lead in queue
    async dialNext() {
        if (!this.isActive) return;

        if (this.currentIndex >= this.queue.length) {
            // Done with all leads
            this.showComplete();
            return;
        }

        this.currentLead = this.queue[this.currentIndex];
        this.updateLeadDisplay();
        this.updateNextUpDisplay();
        this.setStatus('ringing', 'CALLING...');

        // Lock channel on backend
        await this.lockChannel(this.currentLead.id, 'voice');

        // Make the call using existing CallManager
        const phone = this.currentLead.phone;
        const call = await window.callManager?.startCall(phone, this.currentLead.id);

        if (call) {
            // Override CallManager's UI since we have our own
            this.hideCallBar();

            // Listen for call events
            call.on('accept', () => {
                this.setStatus('connected', 'CONNECTED');
                this.startTimer();
            });

            call.on('disconnect', () => {
                this.handleCallEnd();
            });

            call.on('cancel', () => {
                this.handleCallEnd();
            });
        } else {
            // Call failed to connect
            this.handleCallEnd();
        }
    }

    // Handle when call ends (either by us or them)
    handleCallEnd() {
        this.stopTimer();

        // If disposition not yet logged, show buttons
        // User will click a disposition button to continue
    }

    // Log disposition and move to next
    async logDisposition(disposition) {
        if (!this.currentLead) return;

        // Update stats
        if (disposition === 'answered') this.stats.answered++;
        else if (disposition === 'no_answer') this.stats.noAnswer++;
        else if (disposition === 'voicemail') this.stats.voicemail++;
        else if (disposition === 'wrong_number') this.stats.wrongNumber++;
        else if (disposition === 'skip') this.stats.skipped++;

        // End active call if still going
        if (window.callManager?.activeCall) {
            window.callManager.endCall();
        }

        // Log to backend
        try {
            await fetch('/api/dialer/disposition', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId: this.currentLead.id,
                    disposition: disposition,
                    attempt: this.currentAttempt,
                    duration: this.getCallDuration()
                })
            });
        } catch (err) {
            console.error('📞 Failed to log disposition:', err);
        }

        // Unlock channel
        await this.unlockChannel(this.currentLead.id);

        // Decide what to do next
        if (disposition === 'no_answer' && this.currentAttempt < this.maxAttempts) {
            // Try again
            this.currentAttempt++;
            setTimeout(() => this.dialNext(), 1000);
        } else {
            // Move to next lead
            this.currentIndex++;
            this.currentAttempt = 1;
            this.updateQueueCount();

            if (this.isActive) {
                setTimeout(() => this.dialNext(), 1500);
            }
        }
    }

    // Channel locking
    async lockChannel(conversationId, channel) {
        try {
            await fetch(`/api/dialer/${conversationId}/channel-lock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel })
            });
        } catch (err) {
            console.error('📞 Failed to lock channel:', err);
        }
    }

    async unlockChannel(conversationId) {
        try {
            await fetch(`/api/dialer/${conversationId}/channel-lock`, {
                method: 'DELETE'
            });
        } catch (err) {
            console.error('📞 Failed to unlock channel:', err);
        }
    }

    // UI Updates
    updateLeadDisplay() {
        const lead = this.currentLead;
        if (!lead) return;

        document.getElementById('dialerLeadName').textContent =
            `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unknown';
        document.getElementById('dialerBusinessName').textContent =
            lead.business_name || '';
        document.getElementById('dialerPhone').textContent =
            this.formatPhone(lead.phone);
        document.getElementById('dialerAttemptNum').textContent =
            this.currentAttempt;
        document.getElementById('dialerTimer').textContent = '00:00';
    }

    updateNextUpDisplay() {
        const nextLead = this.queue[this.currentIndex + 1];
        const container = document.getElementById('dialerNextUp');

        if (nextLead && container) {
            document.getElementById('dialerNextName').textContent =
                `${nextLead.first_name || ''} ${nextLead.last_name || ''}`.trim() || 'Unknown';
            document.getElementById('dialerNextBusiness').textContent =
                nextLead.business_name || '';
            container.classList.remove('hidden');
        } else if (container) {
            container.classList.add('hidden');
        }
    }

    setStatus(type, text) {
        const badge = document.getElementById('dialerStatusBadge');
        const textEl = document.getElementById('dialerStatusText');

        if (badge) {
            badge.classList.remove('ringing', 'connected');
            badge.classList.add(type);
        }
        if (textEl) {
            textEl.textContent = text;
        }
    }

    showComplete() {
        this.isActive = false;

        const card = document.getElementById('dialerCallingCard');
        if (card) {
            card.innerHTML = `
                <div class="dialer-complete">
                    <div class="dialer-complete-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <h2>Session Complete</h2>
                    <p>You've finished this round of calls</p>
                    <div class="dialer-stats-row">
                        <div class="dialer-stat">
                            <div class="dialer-stat-value">${this.stats.answered}</div>
                            <div class="dialer-stat-label">Answered</div>
                        </div>
                        <div class="dialer-stat">
                            <div class="dialer-stat-value">${this.stats.noAnswer + this.stats.voicemail}</div>
                            <div class="dialer-stat-label">No Answer</div>
                        </div>
                        <div class="dialer-stat">
                            <div class="dialer-stat-value">${this.stats.skipped}</div>
                            <div class="dialer-stat-label">Skipped</div>
                        </div>
                    </div>
                    <button class="dialer-done-btn" onclick="window.powerDialer.hide()">
                        Done
                    </button>
                </div>
            `;
        }

        document.getElementById('dialerDisposition')?.classList.add('hidden');
        document.getElementById('dialerStopBtn')?.classList.add('hidden');
        document.getElementById('dialerNextUp')?.classList.add('hidden');
    }

    // Timer
    startTimer() {
        this.callStartTime = Date.now();
        const timerEl = document.getElementById('dialerTimer');

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
    }

    getCallDuration() {
        if (!this.callStartTime) return 0;
        return Math.floor((Date.now() - this.callStartTime) / 1000);
    }

    // Helpers
    formatPhone(phone) {
        if (!phone) return '';
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length === 10) {
            return `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
        }
        if (cleaned.length === 11 && cleaned[0] === '1') {
            return `(${cleaned.slice(1,4)}) ${cleaned.slice(4,7)}-${cleaned.slice(7)}`;
        }
        return phone;
    }

    hideCallBar() {
        // Hide the default call bar since we have our own UI
        const callBar = document.getElementById('callBar');
        if (callBar) callBar.classList.add('hidden');
    }

    reset() {
        this.queue = [];
        this.currentIndex = 0;
        this.currentLead = null;
        this.isActive = false;
        this.currentAttempt = 1;
        this.stopTimer();

        // Reset UI to idle state
        document.getElementById('dialerIdleState')?.classList.remove('hidden');
        document.getElementById('dialerActiveState')?.classList.add('hidden');
        document.getElementById('dialerDisposition')?.classList.add('hidden');
        document.getElementById('dialerStopBtn')?.classList.add('hidden');
        document.getElementById('dialerNextUp')?.classList.add('hidden');
    }
}

// Create global instance
window.powerDialer = new PowerDialer();

console.log('📞 power-dialer.js loaded');
