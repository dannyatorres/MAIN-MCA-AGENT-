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
        window.saveMonthlyGoal = () => this.saveMonthlyGoal();
        window.markAsFunded = (id, amount) => this.markAsFunded(id, amount);

        // Set dynamic greeting and quote
        this.updateHeroCard();

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

    updateHeroCard() {
        const hour = new Date().getHours();
        let greeting = 'Good evening';
        if (hour < 12) greeting = 'Good morning';
        else if (hour < 17) greeting = 'Good afternoon';

        const quotes = [
            "Success is not final, failure is not fatal: it is the courage to continue that counts.",
            "The secret of getting ahead is getting started.",
            "Don't watch the clock; do what it does. Keep going.",
            "The only way to do great work is to love what you do.",
            "Opportunities don't happen. You create them.",
            "Success usually comes to those who are too busy to be looking for it.",
            "The harder you work for something, the greater you'll feel when you achieve it.",
            "Dream bigger. Do bigger.",
            "Your limitation—it's only your imagination.",
            "Push yourself, because no one else is going to do it for you."
        ];
        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const now = new Date();
        const dateStr = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;

        const greetingEl = document.getElementById('heroGreeting');
        const quoteEl = document.getElementById('heroQuote');
        const dateEl = document.getElementById('heroDate');

        if (greetingEl) greetingEl.textContent = `${greeting}, Agent`;
        if (quoteEl) quoteEl.textContent = `"${randomQuote}"`;
        if (dateEl) dateEl.textContent = dateStr;
    }

    editMonthlyGoal() {
        const currentGoal = document.getElementById('goalAmount')?.textContent || '$500,000';
        const currentValue = currentGoal.replace(/[$,]/g, '');

        document.getElementById('goalEditModal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'goalEditModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h3>Set Monthly Goal</h3>
                    <button class="modal-close" onclick="document.getElementById('goalEditModal').remove()">×</button>
                </div>
                <div class="modal-body">
                    <p style="color: #8b949e; margin-bottom: 16px;">Enter your funding target for this month:</p>
                    <div style="position: relative;">
                        <span style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #6e7681; font-size: 18px;">$</span>
                        <input type="text" id="goalInput" value="${parseInt(currentValue).toLocaleString()}"
                            class="form-input"
                            style="width: 100%; padding: 14px 14px 14px 32px; font-size: 24px; font-weight: 700;
                            background: #0d1117; border: 1px solid #30363d; border-radius: 8px; color: #e6edf3;"
                            onclick="this.select()"
                            onkeypress="if(event.key === 'Enter') document.getElementById('saveGoalBtn').click()">
                    </div>
                    <div style="display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap;">
                        <button class="btn btn-secondary" onclick="document.getElementById('goalInput').value='100,000'">$100K</button>
                        <button class="btn btn-secondary" onclick="document.getElementById('goalInput').value='250,000'">$250K</button>
                        <button class="btn btn-secondary" onclick="document.getElementById('goalInput').value='500,000'">$500K</button>
                        <button class="btn btn-secondary" onclick="document.getElementById('goalInput').value='1,000,000'">$1M</button>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="document.getElementById('goalEditModal').remove()">Cancel</button>
                    <button id="saveGoalBtn" class="btn btn-primary" onclick="window.saveMonthlyGoal()">Save Goal</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.getElementById('goalInput').focus();
        document.getElementById('goalInput').select();
    }

    saveMonthlyGoal() {
        const input = document.getElementById('goalInput');
        if (!input) return;

        const newGoal = parseFloat(input.value.replace(/[$,]/g, ''));

        if (isNaN(newGoal) || newGoal <= 0) {
            this.parent.utils.showNotification('Please enter a valid amount', 'error');
            return;
        }

        this.parent.apiCall('/api/settings/goal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goal: newGoal })
        }).then(() => {
            document.getElementById('goalEditModal')?.remove();
            this.statsCache = null;
            this.loadStats();
            this.parent.utils.showNotification(`Goal set to $${newGoal.toLocaleString()}!`, 'success');
        }).catch(err => {
            this.parent.utils.showNotification('Failed to update goal', 'error');
        });
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
        // Show modal immediately with loading state
        let html = `
            <div style="max-height: 400px; overflow-y: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 1px solid #30363d; text-align: left;">
                            <th style="padding: 10px; color: #8b949e;">Business</th>
                            <th style="padding: 10px; color: #8b949e;">Lender</th>
                            <th style="padding: 10px; color: #8b949e;">Amount</th>
                            <th style="padding: 10px; color: #8b949e;">Date</th>
                            <th style="padding: 10px; color: #8b949e;">Action</th>
                        </tr>
                    </thead>
                    <tbody id="offersTableBody">
                        <tr>
                            <td colspan="5" style="padding: 40px; text-align: center; color: #8b949e;">
                                <i class="fas fa-circle-notch fa-spin" style="font-size: 24px; margin-bottom: 12px;"></i>
                                <div>Loading offers...</div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
        this.showSimpleModal('Active Offers', html);

        try {
            const result = await this.parent.apiCall('/api/stats/offers');
            const tbody = document.getElementById('offersTableBody');
            if (!tbody) return;

            if (!result.offers || result.offers.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" style="padding: 40px; text-align: center; color: #6e7681;">
                            <i class="fas fa-inbox" style="font-size: 32px; margin-bottom: 12px; opacity: 0.5;"></i>
                            <div style="font-size: 14px;">No offers yet</div>
                            <div style="font-size: 12px; margin-top: 4px;">Offers will appear here when lenders respond</div>
                        </td>
                    </tr>
                `;
                return;
            }

            let rows = '';
            result.offers.forEach(offer => {
                const amount = offer.offer_amount ? Number(offer.offer_amount) : 0;
                const displayAmount = amount ? `$${amount.toLocaleString()}` : 'N/A';
                const date = offer.last_response_at
                    ? new Date(offer.last_response_at).toLocaleDateString()
                    : '-';

                rows += `
                    <tr style="border-bottom: 1px solid #21262d;">
                        <td style="padding: 12px; color: #e6edf3; cursor: pointer;"
                            onclick="window.commandCenter.conversationUI.selectConversation('${offer.conversation_id}'); document.getElementById('statsModal').remove();">
                            ${offer.business_name || 'Unknown'}
                        </td>
                        <td style="padding: 12px; color: #8b949e;">${offer.lender_name || '-'}</td>
                        <td style="padding: 12px; color: #10b981; font-weight: 600;">${displayAmount}</td>
                        <td style="padding: 12px; color: #8b949e;">${date}</td>
                        <td style="padding: 12px;">
                            <button onclick="window.markAsFunded('${offer.conversation_id}', ${amount})"
                                style="background: linear-gradient(135deg, #10b981, #059669); border: none; color: white;
                                padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">
                                Funded
                            </button>
                        </td>
                    </tr>
                `;
            });

            tbody.innerHTML = rows;

        } catch (error) {
            console.error('Error loading offers:', error);
            const tbody = document.getElementById('offersTableBody');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" style="padding: 40px; text-align: center; color: #f85149;">
                            <i class="fas fa-exclamation-circle" style="font-size: 24px; margin-bottom: 12px;"></i>
                            <div>Failed to load offers</div>
                        </td>
                    </tr>
                `;
            }
        }
    }

    async markAsFunded(conversationId, offerAmount) {
        const amountStr = prompt('Enter final funded amount:', offerAmount || '');

        if (!amountStr) return;

        const amount = parseFloat(amountStr.replace(/[$,]/g, ''));

        if (isNaN(amount) || amount <= 0) {
            this.parent.utils.showNotification('Invalid amount', 'error');
            return;
        }

        try {
            await this.parent.apiCall(`/api/conversations/${conversationId}/mark-funded`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount })
            });

            this.parent.utils.showNotification(`Deal funded: $${amount.toLocaleString()}`, 'success');

            // Close modal and refresh stats
            document.getElementById('statsModal')?.remove();
            this.statsCache = null;
            this.loadStats();

            // Refresh conversation list
            if (this.parent.conversationUI) {
                this.parent.conversationUI.loadConversations();
            }

        } catch (error) {
            console.error('Error marking as funded:', error);
            this.parent.utils.showNotification('Failed to mark as funded', 'error');
        }
    }

    async showSubmittedLeads() {
        // Show modal immediately with loading state
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
                    <tbody id="submittedTableBody">
                        <tr>
                            <td colspan="3" style="padding: 40px; text-align: center; color: #8b949e;">
                                <i class="fas fa-circle-notch fa-spin" style="font-size: 24px; margin-bottom: 12px;"></i>
                                <div>Loading submissions...</div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
        this.showSimpleModal('Submitted Leads', html);

        try {
            const result = await this.parent.apiCall('/api/stats/submitted');
            const tbody = document.getElementById('submittedTableBody');
            if (!tbody) return;

            if (!result.submitted || result.submitted.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="3" style="padding: 40px; text-align: center; color: #6e7681;">
                            <i class="fas fa-paper-plane" style="font-size: 32px; margin-bottom: 12px; opacity: 0.5;"></i>
                            <div style="font-size: 14px;">No submissions yet</div>
                            <div style="font-size: 12px; margin-top: 4px;">Leads will appear here after you send them to lenders</div>
                        </td>
                    </tr>
                `;
                return;
            }

            let rows = '';
            result.submitted.forEach(item => {
                const date = item.last_submitted
                    ? new Date(item.last_submitted).toLocaleDateString()
                    : '-';

                rows += `
                    <tr style="border-bottom: 1px solid #21262d; cursor: pointer;"
                        onclick="window.commandCenter.conversationUI.selectConversation('${item.conversation_id}'); document.getElementById('statsModal').remove();">
                        <td style="padding: 12px; color: #e6edf3;">${item.business_name || 'Unknown'}</td>
                        <td style="padding: 12px; color: #8b949e;">${item.lender_count} lender${item.lender_count > 1 ? 's' : ''}</td>
                        <td style="padding: 12px; color: #8b949e;">${date}</td>
                    </tr>
                `;
            });

            tbody.innerHTML = rows;

        } catch (error) {
            console.error('Error loading submitted:', error);
            const tbody = document.getElementById('submittedTableBody');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="3" style="padding: 40px; text-align: center; color: #f85149;">
                            <i class="fas fa-exclamation-circle" style="font-size: 24px; margin-bottom: 12px;"></i>
                            <div>Failed to load submissions</div>
                        </td>
                    </tr>
                `;
            }
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
