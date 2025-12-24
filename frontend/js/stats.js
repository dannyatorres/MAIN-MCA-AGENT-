// stats.js - Dashboard statistics module

class StatsModule {
    constructor(parent) {
        this.parent = parent;
        this.statsCache = null;
        this.init();
    }

    init() {
        console.log('📊 StatsModule initialized');

        // Expose global functions for clickable stats
        window.showOffersModal = () => this.showOffersModal();
        window.showSubmittedLeads = () => this.showSubmittedLeads();
        window.editMonthlyGoal = () => this.editMonthlyGoal();

        if (!this.parent.currentConversationId) {
            this.loadStats();
        }
    }

    async loadStats() {
        const activeEl = document.getElementById('activeCount');
        const submittedEl = document.getElementById('submittedCount');
        const offersEl = document.getElementById('offersCount');

        if (!activeEl) return;

        if (this.statsCache) {
            this.updateUI(this.statsCache);
        } else {
            if (activeEl.textContent === '-') activeEl.textContent = '...';
        }

        try {
            const stats = await this.parent.apiCall('/api/stats');

            const normalizedStats = {
                active: stats.active ?? stats.totalConversations ?? 0,
                submitted: stats.submitted ?? 0,
                offers: stats.offers ?? 0
            };

            this.statsCache = normalizedStats;
            this.updateUI(normalizedStats);

            // Update Funding Goal Card
            this.updateFundingGoal(stats);

        } catch (error) {
            console.error('Error loading stats:', error);
            if (!this.statsCache) {
                if (activeEl) activeEl.textContent = '-';
                if (submittedEl) submittedEl.textContent = '-';
                if (offersEl) offersEl.textContent = '-';
            }
        }
    }

    updateFundingGoal(stats) {
        const funded = stats.fundedThisMonth || 0;
        const goal = stats.monthlyGoal || 500000;
        const deals = stats.dealsClosedThisMonth || 0;
        const lastMonth = stats.fundedLastMonth || 0;
        const percentage = Math.min(Math.round((funded / goal) * 100), 100);

        const formatMoney = (num) => '$' + num.toLocaleString();

        const fundedEl = document.getElementById('fundedAmount');
        const goalEl = document.getElementById('goalAmount');
        const percentEl = document.getElementById('goalPercentage');
        const dealsEl = document.getElementById('dealsCount');
        const lastMonthEl = document.getElementById('lastMonthAmount');
        const progressBar = document.getElementById('goalProgressBar');
        const statusEl = document.getElementById('goalStatus');

        if (fundedEl) fundedEl.textContent = formatMoney(funded);
        if (goalEl) goalEl.textContent = formatMoney(goal);
        if (percentEl) percentEl.textContent = percentage + '%';
        if (dealsEl) dealsEl.textContent = deals;
        if (lastMonthEl) lastMonthEl.textContent = formatMoney(lastMonth);
        if (progressBar) progressBar.style.width = percentage + '%';

        if (statusEl) {
            const dayOfMonth = new Date().getDate();
            const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
            const expectedProgress = (dayOfMonth / daysInMonth) * 100;

            if (percentage >= expectedProgress) {
                statusEl.textContent = 'Ahead of pace';
                statusEl.style.color = '#10b981';
            } else if (percentage >= expectedProgress * 0.8) {
                statusEl.textContent = 'On track';
                statusEl.style.color = '#f59e0b';
            } else {
                statusEl.textContent = 'Behind pace';
                statusEl.style.color = '#f85149';
            }
        }
    }

    editMonthlyGoal() {
        const currentGoal = document.getElementById('goalAmount')?.textContent || '$500,000';
        const currentValue = currentGoal.replace(/[$,]/g, '');

        const newGoal = prompt('Enter your monthly funding goal:', currentValue);

        if (newGoal && !isNaN(newGoal) && parseFloat(newGoal) > 0) {
            this.parent.apiCall('/api/settings/goal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ goal: parseFloat(newGoal) })
            }).then(() => {
                this.statsCache = null;
                this.loadStats();
                this.parent.utils.showNotification('Goal updated!', 'success');
            }).catch(err => {
                this.parent.utils.showNotification('Failed to update goal', 'error');
            });
        }
    }

    updateUI(data) {
        const activeEl = document.getElementById('activeCount');
        const submittedEl = document.getElementById('submittedCount');
        const offersEl = document.getElementById('offersCount');

        if (activeEl) activeEl.textContent = data.active;
        if (submittedEl) submittedEl.textContent = data.submitted;
        if (offersEl) offersEl.textContent = data.offers;
    }

    async showOffersModal() {
        try {
            const result = await this.parent.apiCall('/api/stats/offers');

            if (!result.offers || result.offers.length === 0) {
                this.parent.utils.showNotification('No offers yet', 'info');
                return;
            }

            let html = `
                <div style="max-height: 400px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 1px solid #30363d; text-align: left;">
                                <th style="padding: 10px; color: #8b949e;">Business</th>
                                <th style="padding: 10px; color: #8b949e;">Lender</th>
                                <th style="padding: 10px; color: #8b949e;">Amount</th>
                                <th style="padding: 10px; color: #8b949e;">Date</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            result.offers.forEach(offer => {
                const amount = offer.offer_amount
                    ? `$${Number(offer.offer_amount).toLocaleString()}`
                    : 'N/A';
                const date = offer.last_response_at
                    ? new Date(offer.last_response_at).toLocaleDateString()
                    : '-';

                html += `
                    <tr style="border-bottom: 1px solid #21262d; cursor: pointer;"
                        onclick="window.commandCenter.conversationUI.selectConversation('${offer.conversation_id}'); document.getElementById('statsModal').remove();">
                        <td style="padding: 12px; color: #e6edf3;">${offer.business_name || 'Unknown'}</td>
                        <td style="padding: 12px; color: #8b949e;">${offer.lender_name || '-'}</td>
                        <td style="padding: 12px; color: #10b981; font-weight: 600;">${amount}</td>
                        <td style="padding: 12px; color: #8b949e;">${date}</td>
                    </tr>
                `;
            });

            html += `</tbody></table></div>`;
            this.showSimpleModal('💰 Active Offers', html);

        } catch (error) {
            console.error('Error loading offers:', error);
            this.parent.utils.showNotification('Failed to load offers', 'error');
        }
    }

    async showSubmittedLeads() {
        try {
            const result = await this.parent.apiCall('/api/stats/submitted');

            if (!result.submitted || result.submitted.length === 0) {
                this.parent.utils.showNotification('No submissions yet', 'info');
                return;
            }

            let html = `
                <div style="max-height: 400px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 1px solid #30363d; text-align: left;">
                                <th style="padding: 10px; color: #8b949e;">Business</th>
                                <th style="padding: 10px; color: #8b949e;">Lenders</th>
                                <th style="padding: 10px; color: #8b949e;">Last Sent</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            result.submitted.forEach(item => {
                const date = item.last_submitted
                    ? new Date(item.last_submitted).toLocaleDateString()
                    : '-';

                html += `
                    <tr style="border-bottom: 1px solid #21262d; cursor: pointer;"
                        onclick="window.commandCenter.conversationUI.selectConversation('${item.conversation_id}'); document.getElementById('statsModal').remove();">
                        <td style="padding: 12px; color: #e6edf3;">${item.business_name || 'Unknown'}</td>
                        <td style="padding: 12px; color: #8b949e;">${item.lender_count} lender${item.lender_count > 1 ? 's' : ''}</td>
                        <td style="padding: 12px; color: #8b949e;">${date}</td>
                    </tr>
                `;
            });

            html += `</tbody></table></div>`;
            this.showSimpleModal('📤 Submitted Leads', html);

        } catch (error) {
            console.error('Error loading submitted:', error);
            this.parent.utils.showNotification('Failed to load submissions', 'error');
        }
    }

    showSimpleModal(title, content) {
        const existing = document.getElementById('statsModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'statsModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="modal-close" onclick="document.getElementById('statsModal').remove()">×</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    trackEvent(eventName, data = {}) {
        console.log('📈 Event tracked:', eventName, data);
    }
}
