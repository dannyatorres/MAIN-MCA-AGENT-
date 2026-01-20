// 12-mobile-dialer.js - Mobile Power Dialer (Full Featured)
Object.assign(window.MobileApp.prototype, {

    dialerQueue: [],
    dialerIndex: 0,
    dialerSessionStats: { answered: 0, voicemail: 0, no_answer: 0, skipped: 0 },
    dialerCallStartTime: null,
    dialerTimerInterval: null,
    dialerCurrentLead: null,
    dialerMaxAttempts: 2,
    dialerCurrentAttempt: 1,
    dialerIsMuted: false,
    dialerCallConnected: false,

    async openMobileDialer() {
        document.getElementById('mobileDialer').style.display = 'flex';
        document.getElementById('mobileDashboard').style.display = 'none';

        // Reset session
        this.dialerIndex = 0;
        this.dialerCurrentAttempt = 1;
        this.dialerSessionStats = { answered: 0, voicemail: 0, no_answer: 0, skipped: 0 };
        this.updateDialerSessionStats();

        // Show loading
        this.showDialerLoading();

        await this.loadDialerQueue();
    },

    closeMobileDialer() {
        // End any active call
        if (window.callManager?.activeCall) {
            window.callManager.endCall();
        }
        this.stopDialerTimer();

        // Only unlock if we have a lead and we're truly closing
        if (this.dialerCurrentLead) {
            this.unlockDialerChannel(this.dialerCurrentLead.id);
        }

        // Reset state
        this.dialerCurrentLead = null;
        this.dialerCallStartTime = null;

        document.getElementById('mobileDialer').style.display = 'none';
    },

    showDialerLoading() {
        document.getElementById('dialerLoading').style.display = 'flex';
        document.getElementById('dialerLeadInfo').style.display = 'none';
        document.getElementById('dialerEmpty').style.display = 'none';
        document.getElementById('dialerComplete').style.display = 'none';
        document.getElementById('dialerActions').style.display = 'none';
        document.getElementById('dialerCallControls').style.display = 'none';
        document.getElementById('dialerDisposition').style.display = 'none';
        document.getElementById('dialerNextUp').style.display = 'none';
        document.getElementById('dialerStatus').style.display = 'none';
    },

    async loadDialerQueue() {
        try {
            const response = await this.apiCall('/api/dialer/queue');
            let leads = response.leads || [];

            // Filter out leads we don't want to call
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
            this.showDialerComplete();
            return;
        }

        this.dialerCurrentLead = lead;
        const card = document.getElementById('dialerLeadCard');

        // Animate out
        card?.classList.add('switching');

        setTimeout(() => {
            // Update progress
            document.getElementById('dialerProgress').textContent = `${this.dialerIndex + 1}/${this.dialerQueue.length}`;

            // Get names
            const personName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
            const businessName = lead.business_name || '';
            const displayName = personName || businessName || 'Unknown';
            const initials = this.getInitials(displayName);

            // Update UI
            document.getElementById('dialerAvatar').textContent = initials;
            document.getElementById('dialerLeadName').textContent = displayName;
            document.getElementById('dialerLeadBusiness').textContent = personName ? businessName : '';
            document.getElementById('dialerLeadPhone').textContent = this.utils.formatPhone(lead.phone);
            document.getElementById('dialerLeadState').textContent = lead.state || 'NEW';
            document.getElementById('dialerLeadAttempts').textContent = `${lead.call_attempts || 0} attempts`;

            // Reset status
            this.setDialerStatus('ready', 'READY');
            document.getElementById('dialerStatus').style.display = 'none';
            document.getElementById('dialerTimer').textContent = '00:00';

            // Show UI
            document.getElementById('dialerLoading').style.display = 'none';
            document.getElementById('dialerLeadInfo').style.display = 'flex';
            document.getElementById('dialerEmpty').style.display = 'none';
            document.getElementById('dialerComplete').style.display = 'none';
            document.getElementById('dialerActions').style.display = 'flex';
            document.getElementById('dialerCallControls').style.display = 'none';
            document.getElementById('dialerDisposition').style.display = 'none';

            // Update Next Up
            this.updateDialerNextUp();

            // Animate in
            card?.classList.remove('switching');
        }, 80);
    },

    updateDialerNextUp() {
        const nextLead = this.dialerQueue[this.dialerIndex + 1];
        const container = document.getElementById('dialerNextUp');

        if (nextLead && container) {
            const nextName = `${nextLead.first_name || ''} ${nextLead.last_name || ''}`.trim() || nextLead.business_name || 'Unknown';
            document.getElementById('dialerNextName').textContent = nextName;
            document.getElementById('dialerNextBusiness').textContent = nextLead.business_name || '';
            container.style.display = 'flex';
        } else if (container) {
            container.style.display = 'none';
        }
    },

    showDialerEmpty() {
        document.getElementById('dialerLoading').style.display = 'none';
        document.getElementById('dialerLeadInfo').style.display = 'none';
        document.getElementById('dialerEmpty').style.display = 'flex';
        document.getElementById('dialerComplete').style.display = 'none';
        document.getElementById('dialerActions').style.display = 'none';
        document.getElementById('dialerCallControls').style.display = 'none';
        document.getElementById('dialerDisposition').style.display = 'none';
        document.getElementById('dialerNextUp').style.display = 'none';
    },

    showDialerComplete() {
        // Update complete stats
        document.getElementById('completeAnswered').textContent = this.dialerSessionStats.answered;
        document.getElementById('completeNoAnswer').textContent = this.dialerSessionStats.voicemail + this.dialerSessionStats.no_answer;
        document.getElementById('completeSkipped').textContent = this.dialerSessionStats.skipped;

        document.getElementById('dialerLoading').style.display = 'none';
        document.getElementById('dialerLeadInfo').style.display = 'none';
        document.getElementById('dialerEmpty').style.display = 'none';
        document.getElementById('dialerComplete').style.display = 'flex';
        document.getElementById('dialerActions').style.display = 'none';
        document.getElementById('dialerCallControls').style.display = 'none';
        document.getElementById('dialerDisposition').style.display = 'none';
        document.getElementById('dialerNextUp').style.display = 'none';
    },

    setDialerStatus(type, text) {
        const badge = document.getElementById('dialerStatusBadge');
        const textEl = document.getElementById('dialerStatusText');
        const statusContainer = document.getElementById('dialerStatus');

        if (badge) {
            badge.className = 'dialer-status-badge ' + type;
        }
        if (textEl) {
            textEl.textContent = text;
        }
        if (statusContainer) {
            statusContainer.style.display = 'flex';
        }
    },

    // Channel Locking
    async lockDialerChannel(conversationId) {
        try {
            await this.apiCall(`/api/dialer/${conversationId}/channel-lock`, {
                method: 'POST',
                body: JSON.stringify({ channel: 'voice' })
            });
        } catch (err) {
            console.error('Failed to lock channel:', err);
        }
    },

    async unlockDialerChannel(conversationId) {
        try {
            await this.apiCall(`/api/dialer/${conversationId}/channel-lock`, {
                method: 'DELETE'
            });
        } catch (err) {
            console.error('Failed to unlock channel:', err);
        }
    },

    // Native Call
    dialerCallNative() {
        const lead = this.dialerCurrentLead;
        if (!lead) return;

        const phone = String(lead.phone).replace(/\D/g, '');
        this.dialerCallStartTime = Date.now();

        // Lock channel
        this.lockDialerChannel(lead.id);

        // Open phone app
        window.location.href = `tel:${phone}`;

        // When user returns, ask if they completed the call
        setTimeout(() => {
            this.showNativeCallConfirm();
        }, 1000);
    },

    showNativeCallConfirm() {
        // Create confirmation overlay
        const overlay = document.createElement('div');
        overlay.id = 'dialerCallConfirm';
        overlay.className = 'dialer-confirm-overlay';
        overlay.innerHTML = `
            <div class="dialer-confirm-card">
                <p>Did you complete the call?</p>
                <div class="dialer-confirm-actions">
                    <button class="dialer-confirm-btn yes" id="dialerConfirmYes">
                        <i class="fas fa-check"></i> Yes, log it
                    </button>
                    <button class="dialer-confirm-btn no" id="dialerConfirmNo">
                        <i class="fas fa-times"></i> No, go back
                    </button>
                </div>
            </div>
        `;

        document.getElementById('mobileDialer').appendChild(overlay);

        document.getElementById('dialerConfirmYes').addEventListener('click', () => {
            overlay.remove();
            this.showDialerDisposition();
        });

        document.getElementById('dialerConfirmNo').addEventListener('click', () => {
            overlay.remove();
            this.dialerCallStartTime = null;
            this.unlockDialerChannel(this.dialerCurrentLead.id).catch(() => {});
            // Stay on call actions screen - it's already showing
            document.getElementById('dialerActions').style.display = 'flex';
        });
    },

    // Twilio Call
    async dialerCallTwilio() {
        const lead = this.dialerCurrentLead;
        if (!lead) return;

        if (!window.callManager) {
            this.showToast('Calling system not available', 'error');
            return;
        }

        const phone = String(lead.phone).replace(/\D/g, '');
        this.dialerCallStartTime = Date.now();
        this.dialerIsMuted = false;
        this.dialerCallConnected = false;

        // Lock channel
        await this.lockDialerChannel(lead.id);

        // Update UI
        this.setDialerStatus('ringing', 'CALLING...');
        document.getElementById('dialerActions').style.display = 'none';
        document.getElementById('dialerCallControls').style.display = 'flex';

        // Reset mute button
        const muteBtn = document.getElementById('dialerMuteBtn');
        if (muteBtn) {
            muteBtn.innerHTML = '<i class="fas fa-microphone"></i><span>Mute</span>';
            muteBtn.classList.remove('muted');
        }

        try {
            const call = await window.callManager.startCall(phone, lead.id);

            if (call) {
                // Hide default call bar
                document.getElementById('mobileCallBar')?.classList.add('hidden');

                call.on('accept', () => {
                    this.dialerCallConnected = true;
                    this.setDialerStatus('connected', 'CONNECTED');
                    this.startDialerTimer();
                });

                call.on('disconnect', () => {
                    this.handleDialerCallEnd();
                });

                call.on('cancel', () => {
                    this.handleDialerCallEnd();
                });
            } else {
                this.handleDialerCallEnd();
            }
        } catch (error) {
            console.error('Twilio call failed:', error);
            this.showToast('Call failed', 'error');
            this.handleDialerCallEnd();
        }
    },

    handleDialerCallEnd() {
        this.stopDialerTimer();
        document.getElementById('dialerCallControls').style.display = 'none';

        // If call never connected or was very short, go back to call options
        const duration = this.dialerCallStartTime
            ? Math.floor((Date.now() - this.dialerCallStartTime) / 1000)
            : 0;

        if (!this.dialerCallConnected || duration < 3) {
            // Call didn't really happen - go back to options
            this.dialerCallStartTime = null;
            this.dialerCallConnected = false;
            this.unlockDialerChannel(this.dialerCurrentLead?.id).catch(() => {});
            document.getElementById('dialerStatus').style.display = 'none';
            document.getElementById('dialerActions').style.display = 'flex';
        } else {
            // Real call happened - show disposition
            this.setDialerStatus('ended', 'CALL ENDED');
            this.showDialerDisposition();
        }
    },

    dialerEndCall() {
        if (window.callManager?.activeCall) {
            window.callManager.endCall();
        }
        // Don't call handleDialerCallEnd here - let the disconnect event handle it
    },

    dialerToggleMute() {
        const call = window.callManager?.activeCall;
        if (!call) return;

        this.dialerIsMuted = !this.dialerIsMuted;
        call.mute(this.dialerIsMuted);

        const muteBtn = document.getElementById('dialerMuteBtn');
        if (muteBtn) {
            if (this.dialerIsMuted) {
                muteBtn.innerHTML = '<i class="fas fa-microphone-slash"></i><span>Unmute</span>';
                muteBtn.classList.add('muted');
            } else {
                muteBtn.innerHTML = '<i class="fas fa-microphone"></i><span>Mute</span>';
                muteBtn.classList.remove('muted');
            }
        }
    },

    dialerGoToConversation() {
        if (!this.dialerCurrentLead) return;

        const leadId = this.dialerCurrentLead.id;

        // Hide dialer
        document.getElementById('mobileDialer').style.display = 'none';

        // Go directly to chat panel first
        this.goToPanel(1);

        // Small delay to let panel transition complete, then load conversation
        setTimeout(async () => {
            try {
                await this.selectConversation(leadId);
            } catch (err) {
                console.error('Error loading conversation:', err);
                // Don't show error toast - it probably still loaded fine
            }
        }, 150);
    },

    dialerSkip() {
        const lead = this.dialerCurrentLead;
        if (!lead) return;

        // Update stats immediately
        this.dialerSessionStats.skipped++;
        this.updateDialerSessionStats();

        // Fire and forget API calls (don't wait)
        this.apiCall('/api/dialer/disposition', {
            method: 'POST',
            body: JSON.stringify({
                conversationId: lead.id,
                disposition: 'skip',
                attempt: this.dialerCurrentAttempt,
                duration: 0
            })
        }).catch(err => console.error('Skip log failed:', err));

        this.unlockDialerChannel(lead.id).catch(() => {});

        // Move to next immediately
        this.dialerCallStartTime = null;
        this.dialerCurrentAttempt = 1;
        this.dialerIndex++;

        if (this.dialerIndex < this.dialerQueue.length) {
            this.showCurrentDialerLead();
        } else {
            this.showDialerComplete();
        }
    },

    showDialerDisposition() {
        document.getElementById('dialerActions').style.display = 'none';
        document.getElementById('dialerCallControls').style.display = 'none';
        document.getElementById('dialerDisposition').style.display = 'block';
    },

    async logDialerDisposition(disposition) {
        const lead = this.dialerCurrentLead;
        if (!lead) return;

        // Calculate duration
        const duration = this.dialerCallStartTime
            ? Math.floor((Date.now() - this.dialerCallStartTime) / 1000)
            : 0;

        // Update session stats
        if (disposition === 'answered') this.dialerSessionStats.answered++;
        else if (disposition === 'voicemail') this.dialerSessionStats.voicemail++;
        else if (disposition === 'no_answer') this.dialerSessionStats.no_answer++;
        else if (disposition === 'skip') this.dialerSessionStats.skipped++;

        this.updateDialerSessionStats();

        // End active call if still going
        if (window.callManager?.activeCall) {
            window.callManager.endCall();
        }

        // Log to server
        try {
            await this.apiCall('/api/dialer/disposition', {
                method: 'POST',
                body: JSON.stringify({
                    conversationId: lead.id,
                    disposition,
                    attempt: this.dialerCurrentAttempt,
                    duration
                })
            });
        } catch (error) {
            console.error('Failed to log disposition:', error);
        }

        // Unlock channel
        await this.unlockDialerChannel(lead.id);

        // Handle retry logic for no_answer
        if (disposition === 'no_answer' && this.dialerCurrentAttempt < this.dialerMaxAttempts) {
            this.dialerCurrentAttempt++;
            this.showToast(`Retrying... Attempt ${this.dialerCurrentAttempt}`, 'info');
            setTimeout(() => this.showCurrentDialerLead(), 1000);
            return;
        }

        // Reset and move to next
        this.dialerCallStartTime = null;
        this.dialerCurrentAttempt = 1;
        this.dialerIndex++;

        if (this.dialerIndex < this.dialerQueue.length) {
            this.showCurrentDialerLead();
        } else {
            this.showDialerComplete();
        }
    },

    // Timer
    startDialerTimer() {
        this.stopDialerTimer();
        this.dialerCallStartTime = Date.now();
        const timerEl = document.getElementById('dialerTimer');

        this.dialerTimerInterval = setInterval(() => {
            if (timerEl && this.dialerCallStartTime) {
                const elapsed = Math.floor((Date.now() - this.dialerCallStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
                const seconds = (elapsed % 60).toString().padStart(2, '0');
                timerEl.textContent = `${minutes}:${seconds}`;
            }
        }, 1000);
    },

    stopDialerTimer() {
        if (this.dialerTimerInterval) {
            clearInterval(this.dialerTimerInterval);
            this.dialerTimerInterval = null;
        }
    },

    updateDialerSessionStats() {
        const answered = document.getElementById('dialerAnswered');
        const voicemail = document.getElementById('dialerVoicemail');
        const noAnswer = document.getElementById('dialerNoAnswer');

        if (answered) {
            answered.textContent = this.dialerSessionStats.answered;
            answered.classList.add('bump');
            setTimeout(() => answered.classList.remove('bump'), 200);
        }
        if (voicemail) {
            voicemail.textContent = this.dialerSessionStats.voicemail;
        }
        if (noAnswer) {
            noAnswer.textContent = this.dialerSessionStats.no_answer;
        }
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

        // Secondary actions
        document.getElementById('dialerGoToConvo')?.addEventListener('click', () => {
            this.dialerGoToConversation();
        });

        document.getElementById('dialerSkip')?.addEventListener('click', () => {
            this.dialerSkip();
        });

        // Call controls
        document.getElementById('dialerMuteBtn')?.addEventListener('click', () => {
            this.dialerToggleMute();
        });

        document.getElementById('dialerEndCallBtn')?.addEventListener('click', () => {
            this.dialerEndCall();
        });

        // Done button
        document.getElementById('dialerDoneBtn')?.addEventListener('click', () => {
            this.closeMobileDialer();
        });

        // Disposition buttons
        document.querySelectorAll('#dialerDisposition .disposition-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const disposition = btn.dataset.disposition;
                this.logDialerDisposition(disposition);
            });
        });

        // Dashboard dialer button
        document.querySelector('[data-action="open-dialer"]')?.addEventListener('click', () => {
            this.openMobileDialer();
        });
    }
});
