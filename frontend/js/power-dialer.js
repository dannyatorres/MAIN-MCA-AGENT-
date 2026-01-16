// js/power-dialer.js - Power Dialer Module

class PowerDialer {
    constructor() {
        this.queue = [];
        this.dialQueue = [];
        this.selectedLeadIds = new Set();
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
            notInterested: 0,
            skipped: 0
        };

        this.init();
    }

    init() {
        // Wait for DOM to be ready before binding events
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.bindEvents());
        } else {
            this.bindEvents();
        }
        console.log('📞 PowerDialer initialized');
    }

    bindEvents() {
        // Back button
        document.getElementById('dialerBackBtn')?.addEventListener('click', () => {
            this.hide();
        });

        // Start button
        document.getElementById('dialerStartBtn')?.addEventListener('click', () => {
            this.start();
        });

        // Stop button
        document.getElementById('dialerStopBtn')?.addEventListener('click', () => {
            this.stop();
        });

        // Select All / Deselect All
        document.getElementById('queueSelectAll')?.addEventListener('click', () => {
            this.selectedLeadIds = new Set(this.queue.map(l => l.id));
            this.renderQueuePreview();
        });

        document.getElementById('queueDeselectAll')?.addEventListener('click', () => {
            this.selectedLeadIds = new Set();
            this.renderQueuePreview();
        });

        // Queue item checkbox clicks (event delegation)
        document.getElementById('queuePreviewList')?.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                const leadId = e.target.dataset.leadId;
                const item = e.target.closest('.queue-item');

                if (e.target.checked) {
                    this.selectedLeadIds.add(leadId);
                    item?.classList.remove('unchecked');
                } else {
                    this.selectedLeadIds.delete(leadId);
                    item?.classList.add('unchecked');
                }
                this.updateSelectedCount();
            }
        });

        // Mark as Dead button in queue preview
        document.getElementById('queuePreviewList')?.addEventListener('click', async (e) => {
            const deadBtn = e.target.closest('.queue-item-dead-btn');
            if (deadBtn) {
                const leadId = deadBtn.dataset.leadId;
                const item = deadBtn.closest('.queue-item');

                // Visual feedback
                item?.classList.add('removing');
                deadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                try {
                    // Call API to mark as not interested
                    await fetch('/api/dialer/disposition', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            conversationId: leadId,
                            disposition: 'not_interested',
                            attempt: 0,
                            duration: 0
                        })
                    });

                    // Remove from local queue
                    this.queue = this.queue.filter(l => l.id !== leadId);
                    this.selectedLeadIds.delete(leadId);

                    // Re-render
                    this.renderQueuePreview();
                    console.log(`📞 Marked ${leadId} as not interested`);

                } catch (err) {
                    console.error('📞 Failed to mark as not interested:', err);
                    deadBtn.innerHTML = '<i class="fas fa-ban"></i>';
                    item?.classList.remove('removing');
                }
            }
        });

        // End Call button
        document.getElementById('dialerEndCallBtn')?.addEventListener('click', () => {
            console.log('📞 End Call clicked');
            if (window.callManager?.activeCall) {
                window.callManager.endCall();
            }
            this.stopTimer();
            this.setStatus('ringing', 'CALL ENDED');
        });

        // Disposition buttons - USE EVENT DELEGATION on parent container
        document.getElementById('dialerDisposition')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.disposition-btn');
            if (btn) {
                const disposition = btn.dataset.disposition;
                console.log('📞 Disposition button clicked:', disposition);
                this.logDisposition(disposition);
            }
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

        // End any active call
        if (window.callManager?.activeCall) {
            window.callManager.endCall();
        }

        this.reset();
    }

    // Load leads who haven't responded to SMS
    async loadQueue() {
        const listEl = document.getElementById('queuePreviewList');

        try {
            const response = await fetch('/api/dialer/queue');
            const data = await response.json();

            if (data.success && data.leads) {
                this.queue = data.leads;
                // Mark all as selected by default
                this.selectedLeadIds = new Set(this.queue.map(l => l.id));
                this.renderQueuePreview();
                console.log(`📞 Loaded ${this.queue.length} leads for dialing`);
            } else {
                this.queue = [];
                this.selectedLeadIds = new Set();
                this.renderQueuePreview();
            }
        } catch (err) {
            console.error('📞 Failed to load dialer queue:', err);
            this.queue = [];
            this.selectedLeadIds = new Set();
            if (listEl) {
                listEl.innerHTML = `
                    <div class="queue-empty">
                        <i class="fas fa-exclamation-circle"></i>
                        <p>Failed to load queue</p>
                    </div>
                `;
            }
        }
    }

    renderQueuePreview() {
        const listEl = document.getElementById('queuePreviewList');
        if (!listEl) return;

        if (this.queue.length === 0) {
            listEl.innerHTML = `
                <div class="queue-empty">
                    <i class="fas fa-check-circle"></i>
                    <p>No leads in queue.<br>Everyone has been contacted!</p>
                </div>
            `;
            this.updateSelectedCount();
            return;
        }

        listEl.innerHTML = this.queue.map(lead => {
            const name = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unknown';
            const checked = this.selectedLeadIds.has(lead.id) ? 'checked' : '';
            const uncheckedClass = checked ? '' : 'unchecked';

            return `
                <div class="queue-item ${uncheckedClass}" data-lead-id="${lead.id}">
                    <input type="checkbox" ${checked} data-lead-id="${lead.id}">
                    <div class="queue-item-info">
                        <div class="queue-item-name">${this.escapeHtml(name)}</div>
                        <div class="queue-item-business">${this.escapeHtml(lead.business_name || '')}</div>
                    </div>
                    <div class="queue-item-phone">${this.formatPhone(lead.phone)}</div>
                    <button class="queue-item-dead-btn" data-lead-id="${lead.id}" title="Mark as Not Interested">
                        <i class="fas fa-ban"></i>
                    </button>
                </div>
            `;
        }).join('');

        this.updateSelectedCount();
    }

    updateSelectedCount() {
        const countEl = document.getElementById('selectedQueueCount');
        const totalEl = document.getElementById('dialerQueueCount');

        if (countEl) countEl.textContent = this.selectedLeadIds.size;
        if (totalEl) totalEl.textContent = this.queue.length;
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    updateQueueCount() {
        const el = document.getElementById('dialerQueueCount');
        if (el) el.textContent = this.queue.length;
    }

    // Start the dialing session
    async start() {
        // Filter queue to only selected leads
        this.dialQueue = this.queue.filter(lead => this.selectedLeadIds.has(lead.id));

        if (this.dialQueue.length === 0) {
            alert('No leads selected. Check at least one lead to start dialing.');
            return;
        }

        this.isActive = true;
        this.currentIndex = 0;
        this.currentAttempt = 1;
        this.stats = { answered: 0, noAnswer: 0, voicemail: 0, wrongNumber: 0, notInterested: 0, skipped: 0 };

        // Switch UI states
        document.getElementById('dialerIdleState')?.classList.add('hidden');
        document.getElementById('dialerActiveState')?.classList.remove('hidden');
        document.getElementById('dialerDisposition')?.classList.remove('hidden');
        document.getElementById('dialerFooter')?.classList.remove('hidden');
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

        if (this.currentIndex >= this.dialQueue.length) {
            // Done with all leads
            this.showComplete();
            return;
        }

        this.currentLead = this.dialQueue[this.currentIndex];
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
        console.log('📞 logDisposition called:', disposition);
        console.log('📞 currentLead:', this.currentLead);

        if (!this.currentLead) {
            console.log('🚫 No currentLead - returning early!');
            return;
        }

        if (!this.currentLead) return;

        // Update stats
        if (disposition === 'answered') this.stats.answered++;
        else if (disposition === 'no_answer') this.stats.noAnswer++;
        else if (disposition === 'voicemail') this.stats.voicemail++;
        else if (disposition === 'wrong_number') this.stats.wrongNumber++;
        else if (disposition === 'not_interested') this.stats.notInterested++;
        else if (disposition === 'skip') this.stats.skipped++;

        console.log('📞 Stats updated:', this.stats);

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
        const nextLead = this.dialQueue[this.currentIndex + 1];
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

        // Hide active state, show complete state
        document.getElementById('dialerActiveState')?.classList.add('hidden');
        document.getElementById('dialerDisposition')?.classList.add('hidden');
        document.getElementById('dialerFooter')?.classList.add('hidden');
        document.getElementById('dialerStopBtn')?.classList.add('hidden');
        document.getElementById('dialerNextUp')?.classList.add('hidden');

        // Create or show complete state
        let completeEl = document.getElementById('dialerCompleteState');
        if (!completeEl) {
            completeEl = document.createElement('div');
            completeEl.id = 'dialerCompleteState';
            completeEl.className = 'dialer-state';
            document.getElementById('dialerCallingCard')?.appendChild(completeEl);
        }

        completeEl.innerHTML = `
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
                <button class="dialer-done-btn" id="dialerDoneBtn">
                    Done
                </button>
            </div>
        `;

        completeEl.classList.remove('hidden');

        // Bind done button
        document.getElementById('dialerDoneBtn')?.addEventListener('click', () => {
            this.reset();
            this.loadQueue(); // Reload fresh queue
        });
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
        this.dialQueue = [];
        this.selectedLeadIds = new Set();
        this.currentIndex = 0;
        this.currentLead = null;
        this.isActive = false;
        this.currentAttempt = 1;
        this.stopTimer();

        // Hide all states first
        document.getElementById('dialerIdleState')?.classList.add('hidden');
        document.getElementById('dialerActiveState')?.classList.add('hidden');
        document.getElementById('dialerCompleteState')?.classList.add('hidden');
        document.getElementById('dialerDisposition')?.classList.add('hidden');
        document.getElementById('dialerFooter')?.classList.add('hidden');
        document.getElementById('dialerStopBtn')?.classList.add('hidden');
        document.getElementById('dialerNextUp')?.classList.add('hidden');

        // Show idle state
        document.getElementById('dialerIdleState')?.classList.remove('hidden');
    }
}

// Create global instance
window.powerDialer = new PowerDialer();

console.log('📞 power-dialer.js loaded');
