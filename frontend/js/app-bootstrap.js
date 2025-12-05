// js/app-bootstrap.js
import { LeadFormController } from './lead-form-controller.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Main Module: Waiting for CommandCenter...');

    // Wait for Core to Init
    setTimeout(() => {
        if (window.commandCenter) {
            console.log('✅ Main Module: Attaching Logic to CommandCenter');

            // --- A. INJECT CONTROLLER ---
            window.commandCenter.leadFormController = new LeadFormController(window.commandCenter);

            // --- B. DEFINE UI RENDERERS ---

            // 1. RENDER HEADER (Cleaned - Uses CSS Classes)
            window.updateChatHeader = (businessName, ownerName) => {
                const header = document.querySelector('.center-panel .panel-header');
                const centerPanel = document.querySelector('.center-panel');

                if (!header) return;

                // Exit Dashboard Mode
                if (centerPanel) centerPanel.classList.remove('dashboard-mode');

                // Generate Initials
                const displayTitle = businessName || 'Unknown Business';
                const initials = displayTitle.substring(0, 2).toUpperCase();

                // CLEANED: Replaced inline styles with 'chat-header-rich' classes
                header.innerHTML = `
                    <div class="chat-header-rich">
                        <button id="backHomeBtn" onclick="loadDashboard()" class="icon-btn-small" title="Back to Dashboard">
                            <i class="fas fa-arrow-left"></i>
                        </button>

                        <div class="chat-avatar-large">
                            ${initials}
                        </div>

                        <div class="chat-details-stack">
                            <h2 class="chat-business-title">${displayTitle}</h2>
                            <div class="chat-row-secondary">
                                <span>${ownerName || 'No Owner'}</span>
                            </div>
                        </div>
                    </div>
                `;
            };

            // 2. RENDER DASHBOARD (Refactored to Match Onyx Theme)
            window.loadDashboard = () => {
                console.log("🏠 Loading Dashboard...");

                // Clear Core State
                if (window.commandCenter.conversationUI) {
                    window.commandCenter.conversationUI.currentConversationId = null;
                    window.commandCenter.conversationUI.selectedConversation = null;
                }

                // UI: Enter Dashboard Mode
                const centerPanel = document.querySelector('.center-panel');
                const header = centerPanel.querySelector('.panel-header');
                const messages = document.getElementById('messagesContainer');

                // CRITICAL: Ensure inputs are hidden
                const inputs = document.getElementById('messageInputContainer');
                const actions = document.getElementById('conversationActions');

                centerPanel.classList.add('dashboard-mode');
                header.innerHTML = ''; // Hide header

                if (inputs) inputs.style.display = 'none';
                if (actions) actions.style.display = 'none';

                // Render Home Content (ONYX THEME MATCH)
                messages.innerHTML = `
                    <div class="dashboard-container">
                        <div class="dashboard-header">
                            <h1>Welcome back, Agent</h1>
                            <p>Here is what's happening with your pipeline today.</p>
                        </div>

                        <div class="goal-card">
                            <div class="goal-header">
                                <span class="goal-title">Monthly Funding Goal</span>
                                <span class="goal-numbers">$145,000 <span class="goal-subtext">/ $250k</span></span>
                            </div>
                            <div class="progress-track">
                                <div class="progress-fill" style="width: 58%;"></div>
                            </div>
                            <div class="goal-footer">
                                12 days left in the month
                            </div>
                        </div>

                        <div class="stats-grid">
                            <div class="stat-card">
                                <div class="stat-icon"><i class="fas fa-fire"></i></div>
                                <div class="stat-value" id="activeCount">-</div>
                                <div class="stat-label">Active Leads</div>
                            </div>

                            <div class="stat-card">
                                <div class="stat-icon"><i class="fas fa-spinner"></i></div>
                                <div class="stat-value" id="processingCount">-</div>
                                <div class="stat-label">Processing</div>
                            </div>

                            <div class="stat-card">
                                <div class="stat-icon"><i class="fas fa-calendar-check"></i></div>
                                <div class="stat-value" id="todayCount">-</div>
                                <div class="stat-label">New Today</div>
                            </div>
                        </div>

                        <div class="empty-state dashboard-style">
                            <button class="btn btn-secondary" onclick="openLenderManagementModal()">
                                <i class="fas fa-university"></i>&nbsp; Manage Lenders
                            </button>

                            <div class="empty-state-hint white-theme" style="margin-top: 15px;">
                                <i class="fas fa-arrow-left icon-brand"></i>
                                <span class="text-gray-600">Select a conversation to start working</span>
                            </div>
                        </div>
                    </div>
                `;

                // Reset Right Panel (Match "Empty State" from conversation-core.js)
                const intelligenceContent = document.getElementById('intelligenceContent');
                if (intelligenceContent) {
                    // Using the new .large-icon class
                    intelligenceContent.innerHTML = `
                        <div class="empty-state">
                            <div class="empty-icon large-icon">
                                <i class="fas fa-chart-pie"></i>
                            </div>
                            <h3>Lead Intelligence</h3>
                            <p>Select a lead to view analysis, documents, and FCS data.</p>
                        </div>
                    `;
                }

                // Trigger a stats refresh
                if (window.commandCenter.stats && window.commandCenter.stats.loadStats) {
                    window.commandCenter.stats.loadStats();
                }
            };

            // 3. LENDER MODAL LOGIC
            window.openLenderManagementModal = () => {
                if (window.commandCenter.lenders && window.commandCenter.lenders.openManagementModal) {
                     window.commandCenter.lenders.openManagementModal();
                } else {
                    alert("Lender Management Module loading...");
                }
            };

            // 4. DELETE MODE TOGGLE
            window.toggleDeleteMode = () => {
                const list = document.getElementById('conversationsList');
                const btn = document.getElementById('toggleDeleteModeBtn');

                if (!list) return;
                const isDeleteMode = list.classList.toggle('delete-mode');

                if (btn) {
                    if (isDeleteMode) {
                        btn.classList.add('active-danger'); // Uses CSS class instead of inline styles
                        // Show the big "Delete Selected" button
                        const confirmBtn = document.getElementById('deleteSelectedBtn');
                        if (confirmBtn) confirmBtn.style.display = 'block';
                    } else {
                        btn.classList.remove('active-danger');
                        // Clear selections
                        const checkboxes = document.querySelectorAll('.delete-checkbox');
                        checkboxes.forEach(cb => cb.checked = false);
                        const confirmBtn = document.getElementById('deleteSelectedBtn');
                        if (confirmBtn) confirmBtn.style.display = 'none';

                        if (window.commandCenter.conversationUI) {
                            window.commandCenter.conversationUI.selectedForDeletion.clear();
                        }
                    }
                }
            };

            // --- C. INITIAL LOAD ---
            if (!window.commandCenter.currentConversationId) {
                window.loadDashboard();
            }

        } else {
            console.error('❌ CommandCenter Global Object not found!');
        }
    }, 100);
});

// News Feed Logic (Refactored to remove inline styles)
async function loadMarketNews() {
    const container = document.getElementById('newsFeedContainer');
    if (!container) return;
    try {
        const response = await fetch('/api/news');
        const result = await response.json();
        if (result.success && result.data?.length > 0) {
            // CLEANED: Uses .news-card class from CSS
            container.innerHTML = result.data.map(item => `
                <div class="news-card" onclick="window.open('${item.link}', '_blank')">
                    <div class="news-content">
                        <div class="news-meta">
                            <span class="news-source">${item.source || 'Industry News'}</span>
                            <span class="news-dot">•</span>
                            <span class="news-time">Today</span>
                        </div>
                        <h4 class="news-title">${item.title}</h4>
                    </div>
                    <div class="news-arrow">
                        <i class="fas fa-chevron-right"></i>
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<div class="empty-state-hint">No recent updates.</div>';
        }
    } catch (e) {
        console.log(e);
    }
}
