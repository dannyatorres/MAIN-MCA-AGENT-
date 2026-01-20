// 12-mobile-dialer.js - Mobile Power Dialer
Object.assign(window.MobileApp.prototype, {

    dialerQueue: [],
    dialerIndex: 0,
    dialerSessionStats: { answered: 0, voicemail: 0, no_answer: 0 },
    dialerCallStartTime: null,

    async openMobileDialer() {
        document.getElementById('mobileDialer').style.display = 'flex';
        document.getElementById('mobileDashboard').style.display = 'none';

        // Reset session
        this.dialerIndex = 0;
        this.dialerSessionStats = { answered: 0, voicemail: 0, no_answer: 0 };
        this.updateDialerSessionStats();

        // Show loading
        document.getElementById('dialerLoading').style.display = 'block';
        document.getElementById('dialerLeadInfo').style.display = 'none';
        document.getElementById('dialerEmpty').style.display = 'none';
        document.getElementById('dialerActions').style.display = 'none';
        document.getElementById('dialerDisposition').style.display = 'none';

        await this.loadDialerQueue();
    },

    closeMobileDialer() {
        document.getElementById('mobileDialer').style.display = 'none';
    },

    async loadDialerQueue() {
        try {
            const response = await this.apiCall('/api/dialer/queue');
            let leads = response.leads || [];

            // Filter out leads with offers or other states we don't want to call
            const excludeStates = ['OFFER', 'OFFER_RECEIVED', 'FUNDED', 'DEAD', 'ARCHIVED'];
            leads = leads.filter(lead => !excludeStates.includes(lead.state));

            this.dialerQueue = leads;
            this.dialerIndex = 0;

            document.getElementById('dialerProgress').textContent = `0/${this.dialerQueue.length}`;

            if (this.dialerQueue.length > 0) {
                this.showCurrentDialerLead();
            } else {
                this.showDialerEmpty();
            }
        } catch (error) {
            console.error('Failed to load dialer queue:', error);
            this.showToast('Failed to load dialer queue', 'error');
            this.showDialerEmpty();
        }
    },

    showCurrentDialerLead() {
        const lead = this.dialerQueue[this.dialerIndex];
        if (!lead) {
            this.showDialerEmpty();
            return;
        }

        // Update progress
        document.getElementById('dialerProgress').textContent = `${this.dialerIndex + 1}/${this.dialerQueue.length}`;

        // Get person name and business name separately
        const personName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
        const businessName = lead.business_name || '';
        const displayName = personName || businessName || 'Unknown';
        const initials = this.getInitials(displayName);

        // Update UI
        document.getElementById('dialerAvatar').textContent = initials;
        document.getElementById('dialerLeadName').textContent = displayName;
        // Only show business name if we have a person name, otherwise it's redundant
        document.getElementById('dialerLeadBusiness').textContent = personName ? businessName : '';
        document.getElementById('dialerLeadPhone').textContent = this.utils.formatPhone(lead.phone);
        document.getElementById('dialerLeadState').textContent = lead.state || 'NEW';
        document.getElementById('dialerLeadAttempts').textContent = `${lead.call_attempts || 0} attempts`;

        // Show lead info, hide loading
        document.getElementById('dialerLoading').style.display = 'none';
        document.getElementById('dialerLeadInfo').style.display = 'flex';
        document.getElementById('dialerEmpty').style.display = 'none';
        document.getElementById('dialerActions').style.display = 'flex';
        document.getElementById('dialerDisposition').style.display = 'none';
    },

    showDialerEmpty() {
        document.getElementById('dialerLoading').style.display = 'none';
        document.getElementById('dialerLeadInfo').style.display = 'none';
        document.getElementById('dialerEmpty').style.display = 'block';
        document.getElementById('dialerActions').style.display = 'none';
        document.getElementById('dialerDisposition').style.display = 'none';
    },

    dialerCallNative() {
        const lead = this.dialerQueue[this.dialerIndex];
        if (!lead) return;

        const phone = String(lead.phone).replace(/\D/g, '');
        this.dialerCallStartTime = Date.now();

        // Open phone app
        window.location.href = `tel:${phone}`;

        // Show disposition after a short delay (user will return after call)
        setTimeout(() => {
            this.showDialerDisposition();
        }, 1000);
    },

    async dialerCallTwilio() {
        const lead = this.dialerQueue[this.dialerIndex];
        if (!lead) return;

        if (!window.callManager) {
            this.showToast('Calling system not available', 'error');
            return;
        }

        const phone = String(lead.phone).replace(/\D/g, '');
        this.dialerCallStartTime = Date.now();

        // Show call UI
        this.showCallUI();

        try {
            await window.callManager.startCall(phone, lead.id);

            // Listen for call end to show disposition
            const checkCallEnd = setInterval(() => {
                if (!window.callManager.activeCall) {
                    clearInterval(checkCallEnd);
                    setTimeout(() => {
                        this.showDialerDisposition();
                    }, 500);
                }
            }, 500);
        } catch (error) {
            console.error('Twilio call failed:', error);
            this.showToast('Call failed', 'error');
            this.hideCallUI();
        }
    },

    dialerSkip() {
        this.logDisposition('skip');
    },

    showDialerDisposition() {
        document.getElementById('dialerActions').style.display = 'none';
        document.getElementById('dialerDisposition').style.display = 'block';
    },

    async logDisposition(disposition) {
        const lead = this.dialerQueue[this.dialerIndex];
        if (!lead) return;

        // Calculate duration
        const duration = this.dialerCallStartTime
            ? Math.floor((Date.now() - this.dialerCallStartTime) / 1000)
            : 0;

        // Update session stats
        if (disposition === 'answered') this.dialerSessionStats.answered++;
        else if (disposition === 'voicemail') this.dialerSessionStats.voicemail++;
        else if (disposition === 'no_answer') this.dialerSessionStats.no_answer++;

        this.updateDialerSessionStats();

        // Log to server
        try {
            await this.apiCall('/api/dialer/disposition', {
                method: 'POST',
                body: JSON.stringify({
                    conversationId: lead.id,
                    disposition,
                    attempt: (lead.call_attempts || 0) + 1,
                    duration
                })
            });
        } catch (error) {
            console.error('Failed to log disposition:', error);
        }

        // Reset and move to next
        this.dialerCallStartTime = null;
        this.dialerIndex++;

        if (this.dialerIndex < this.dialerQueue.length) {
            this.showCurrentDialerLead();
        } else {
            this.showDialerEmpty();
        }
    },

    updateDialerSessionStats() {
        document.getElementById('dialerAnswered').textContent = this.dialerSessionStats.answered;
        document.getElementById('dialerVoicemail').textContent = this.dialerSessionStats.voicemail;
        document.getElementById('dialerNoAnswer').textContent = this.dialerSessionStats.no_answer;
    },

    setupDialerListeners() {
        // Close button
        document.getElementById('closeDialerBtn')?.addEventListener('click', () => {
            this.closeMobileDialer();
        });

        // Call buttons
        document.getElementById('dialerCallNative')?.addEventListener('click', () => {
            this.dialerCallNative();
        });

        document.getElementById('dialerCallTwilio')?.addEventListener('click', () => {
            this.dialerCallTwilio();
        });

        // Skip button
        document.getElementById('dialerSkip')?.addEventListener('click', () => {
            this.dialerSkip();
        });

        // Disposition buttons
        document.querySelectorAll('.disposition-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const disposition = btn.dataset.disposition;
                this.logDisposition(disposition);
            });
        });

        // Dashboard dialer button
        document.querySelector('[data-action="open-dialer"]')?.addEventListener('click', () => {
            this.openMobileDialer();
        });
    }
});
