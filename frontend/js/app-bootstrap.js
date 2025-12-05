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

            // --- B. DEFINE GLOBAL FUNCTIONS ---

            // 1. HEADER RENDERER
            window.updateChatHeader = (businessName, ownerName) => {
                const header = document.querySelector('.center-panel .panel-header');
                const centerPanel = document.querySelector('.center-panel');

                if (!header) return;
                if (centerPanel) centerPanel.classList.remove('dashboard-mode');

                const displayTitle = businessName || 'Unknown Business';
                const initials = displayTitle.substring(0, 2).toUpperCase();

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

            // 2. DASHBOARD LOADER (The Fix)
            window.loadDashboard = () => {
                console.log("🏠 Loading Dashboard...");

                // Reset Core Selection
                if (window.commandCenter.conversationUI) {
                    window.commandCenter.conversationUI.currentConversationId = null;
                    window.commandCenter.conversationUI.selectedConversation = null;
                }

                // --- CENTER PANEL RESET ---
                const centerPanel = document.querySelector('.center-panel');
                const centerHeader = centerPanel.querySelector('.panel-header');
                const messages = document.getElementById('messagesContainer');
                const inputs = document.getElementById('messageInputContainer');
                const actions = document.getElementById('conversationActions');

                centerPanel.classList.add('dashboard-mode');
                centerHeader.innerHTML = '';
                if (inputs) inputs.style.display = 'none';
                if (actions) actions.style.display = 'none';

                // Inject Dashboard Content
                messages.innerHTML = `
                    <div class="dashboard-container">
                        <div class="dashboard-header">
                            <h1>Welcome back, Agent</h1>
                            <p>Here is what's happening with your pipeline today.</p>

                            <button class="btn btn-secondary" onclick="openLenderManagementModal()" style="margin-top: 16px; width: 200px;">
                                <i class="fas fa-university"></i>&nbsp; Manage Lenders
                            </button>
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
                    </div>
                `;

                // --- RIGHT PANEL RESET (Fixing the Tabs Issue) ---
                const rightPanel = document.querySelector('.right-panel');
                const rightHeader = rightPanel ? rightPanel.querySelector('.panel-header') : null;
                const rightContent = document.getElementById('intelligenceContent');

                // A. Wipe the Tabs from the Header
                if (rightHeader) {
                    // Force row layout (Tabs force column, we need row for title)
                    rightHeader.style.cssText = 'height: 64px !important; min-height: 64px !important; display: flex !important; flex-direction: row !important; align-items: center !important; justify-content: space-between !important; padding: 0 16px !important;';

                    rightHeader.innerHTML = `
                        <div class="panel-title" style="display: flex; align-items: center; gap: 12px;">
                            <div class="title-text">
                                <h2 style="font-size: 16px; font-weight: 600; margin:0;">Industry Wire</h2>
                                <span style="font-size: 11px; color: var(--gray-500); font-weight: normal;">Daily updates</span>
                            </div>
                        </div>
                        <button class="icon-btn-small" onclick="loadMarketNews()" title="Refresh News">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    `;
                }

                // B. Reset the Content Area
                if (rightContent) {
                    rightContent.innerHTML = `
                        <div id="newsFeedContainer" class="intelligence-content" style="padding: 0;">
                            <div style="padding: 20px; text-align: center; color: var(--gray-400);">
                                <i class="fas fa-spinner fa-spin"></i> Loading news...
                            </div>
                        </div>
                    `;
                    // Load news immediately
                    window.loadMarketNews();
                }

                // Refresh Stats
                if (window.commandCenter.stats && window.commandCenter.stats.loadStats) {
                    window.commandCenter.stats.loadStats();
                }
            };

            // 3. NEWS LOADER (Attached to Window for global access)
            window.loadMarketNews = async () => {
                const container = document.getElementById('newsFeedContainer');
                if (!container) return;

                // Show loading state if refreshing
                container.innerHTML = `
                    <div style="padding: 20px; text-align: center; color: var(--gray-400);">
                        <i class="fas fa-spinner fa-spin"></i> Loading news...
                    </div>
                `;

                try {
                    const response = await fetch('/api/news');
                    const result = await response.json();

                    if (result.success && result.data?.length > 0) {
                        container.innerHTML = result.data.map(item => `
                            <div class="news-card" onclick="window.open('${item.link}', '_blank')">
                                <div class="news-content">
                                    <div class="news-meta">
                                        <span class="news-source ${item.source === 'deBanked' ? 'source-highlight' : ''}">${item.source || 'Industry News'}</span>
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
                        container.innerHTML = `
                            <div class="empty-state">
                                <div style="font-size: 24px; color: var(--gray-300); margin-bottom: 10px;">
                                    <i class="far fa-newspaper"></i>
                                </div>
                                <p>No recent updates found.</p>
                            </div>`;
                    }
                } catch (e) {
                    console.error(e);
                    container.innerHTML = `
                        <div style="padding: 20px; text-align: center; color: var(--gray-400); font-size: 12px;">
                            Unable to load news feed.
                        </div>`;
                }
            };

            // 4. LENDER MODAL
            window.openLenderManagementModal = () => {
                if (window.commandCenter.lenders && window.commandCenter.lenders.openManagementModal) {
                     window.commandCenter.lenders.openManagementModal();
                } else {
                    alert("Lender Management Module loading...");
                }
            };

            // 5. DELETE MODE
            window.toggleDeleteMode = () => {
                const list = document.getElementById('conversationsList');
                const btn = document.getElementById('toggleDeleteModeBtn');
                if (!list) return;

                const isDeleteMode = list.classList.toggle('delete-mode');

                if (btn) {
                    if (isDeleteMode) {
                        btn.classList.add('active-danger');
                        const confirmBtn = document.getElementById('deleteSelectedBtn');
                        if (confirmBtn) confirmBtn.style.display = 'block';
                    } else {
                        btn.classList.remove('active-danger');
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
