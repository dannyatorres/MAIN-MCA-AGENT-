// js/app-bootstrap.js
import { LeadFormController } from './lead-form-controller.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Main Module: Waiting for CommandCenter...');

    // Initialize app when CommandCenter is COMPLETELY ready
    const initApp = () => {
        // CHANGE: Check .isInitialized to ensure async modules (like Lenders) are ready
        if (!window.commandCenter || !window.commandCenter.isInitialized) return false;
        console.log('✅ Main Module: Attaching Logic to CommandCenter');
        return true;
    };

    // Poll for CommandCenter
    let attempts = 0;
    const maxAttempts = 200;

    const appInitInterval = setInterval(() => {
        attempts++;

        if (initApp()) {
            clearInterval(appInitInterval);

            // --- A. INJECT CONTROLLER ---
            window.commandCenter.leadFormController = new LeadFormController(window.commandCenter);

            // ✅ FIX: Force-Initialize Lenders Module for Dashboard Access
            // This ensures "Manage Lenders" works immediately without opening a conversation first.
            if (!window.commandCenter.lenders && typeof LendersModule !== 'undefined') {
                console.log("🏦 Bootstrapping LendersModule for Dashboard...");
                window.commandCenter.lenders = new LendersModule(window.commandCenter);
            }

            // --- B. DEFINE GLOBAL FUNCTIONS ---

            // 1. HEADER RENDERER (FIXED: Restores Input Bar)
            window.updateChatHeader = (businessName, ownerName, phoneNumber, conversationId) => {
                const header = document.querySelector('.center-panel .panel-header');
                const centerPanel = document.querySelector('.center-panel');

                // === CRITICAL FIX: UNHIDE INPUTS WHEN ENTERING CHAT ===
                const inputs = document.getElementById('messageInputContainer');
                const actions = document.getElementById('conversationActions');

                if (centerPanel) centerPanel.classList.remove('dashboard-mode');
                if (inputs) inputs.classList.remove('hidden'); // Show the input bar
                if (actions) actions.classList.remove('hidden');
                // ======================================================

                if (!header) return;

                const displayTitle = businessName || 'Unknown Business';
                const initials = displayTitle.substring(0, 2).toUpperCase();

                // Preserve Call Bar State
                const existingCallBar = document.getElementById('callBar');
                const isCallActive = existingCallBar && !existingCallBar.classList.contains('hidden');
                const currentTimer = existingCallBar ? document.getElementById('callTimer').innerText : '00:00';

                header.innerHTML = `
                    <div class="chat-header-rich">
                        <button id="backHomeBtn" onclick="loadDashboard()" class="icon-btn-small" title="Back to Dashboard">
                            <i class="fas fa-arrow-left"></i>
                        </button>
                        <div class="chat-avatar-large">${initials}</div>
                        <div class="chat-details-stack">
                            <h2 class="chat-business-title">${displayTitle}</h2>
                            <div class="chat-row-secondary">
                                <span>${ownerName || 'No Owner'}</span>
                            </div>
                        </div>
                        <div class="chat-header-actions">
                            <button id="callBtn" class="header-action-btn phone-btn ${isCallActive ? 'active' : ''}" title="Call ${phoneNumber || 'No phone'}">
                                <i class="fas fa-phone"></i>
                            </button>
                        </div>
                    </div>

                    <div id="callBar" class="call-bar ${isCallActive ? '' : 'hidden'}">
                        <div class="call-bar-info">
                            <span class="call-status">Calling...</span>
                            <span class="call-timer" id="callTimer">${currentTimer}</span>
                        </div>
                        <div class="call-bar-actions">
                            <button class="call-control-btn" id="muteBtn" title="Mute"><i class="fas fa-microphone"></i></button>
                            <button class="call-control-btn end-call" id="endCallBtn" title="End Call"><i class="fas fa-phone-slash"></i></button>
                        </div>
                    </div>
                `;

                // Re-attach listeners
                const callBtn = document.getElementById('callBtn');
                const endCallBtn = document.getElementById('endCallBtn');
                const muteBtn = document.getElementById('muteBtn');

                if (callBtn) {
                    callBtn.addEventListener('click', async () => {
                        if (!phoneNumber) return alert('No phone number available.');
                        if (!window.callManager) {
                            console.log("⚠️ Call Manager not ready, initializing...");
                            if (typeof CallManager !== 'undefined') {
                                window.callManager = new CallManager();
                            } else {
                                return alert("Calling system failed to load. Please refresh.");
                            }
                        }
                        await window.callManager.startCall(phoneNumber, conversationId);
                    });
                }
                if (endCallBtn) {
                    endCallBtn.addEventListener('click', () => {
                        if (window.callManager) window.callManager.endCall();
                        else {
                            document.getElementById('callBar')?.classList.add('hidden');
                            document.getElementById('callBtn')?.classList.remove('active');
                        }
                    });
                }
                if (muteBtn) {
                    muteBtn.addEventListener('click', () => {
                        if (window.callManager) window.callManager.toggleMute();
                        else {
                            muteBtn.classList.toggle('muted');
                            muteBtn.querySelector('i').classList.toggle('fa-microphone-slash');
                        }
                    });
                }
            };

            // 2. DASHBOARD LOADER (FIXED: Hides Input Bar Correctly)
            window.loadDashboard = () => {
                console.log("🏠 Loading Dashboard...");

                if (window.commandCenter.conversationUI) {
                    window.commandCenter.conversationUI.currentConversationId = null;
                    window.commandCenter.conversationUI.selectedConversation = null;
                }

                const centerPanel = document.querySelector('.center-panel');
                const centerHeader = centerPanel ? centerPanel.querySelector('.panel-header') : null;
                const messages = document.getElementById('messagesContainer');

                // === CRITICAL FIX: HIDE INPUTS FOR DASHBOARD ===
                const inputs = document.getElementById('messageInputContainer');
                const actions = document.getElementById('conversationActions');

                if (centerPanel) centerPanel.classList.add('dashboard-mode');
                if (centerHeader) centerHeader.innerHTML = '';
                if (inputs) inputs.classList.add('hidden'); // Hide input bar
                if (actions) actions.classList.add('hidden');
                // ===============================================

                if (messages) {
                    messages.innerHTML = `
                        <div class="dashboard-container">
                            <div class="dashboard-header">
                                <h1>Welcome back, Agent</h1>
                                <p>Here is what's happening with your pipeline today.</p>
                            </div>

                            <div class="dashboard-toolbar">
                                <button class="btn btn-secondary dashboard-action-btn" onclick="window.open('/lead_reformatter.html', '_blank')">
                                    <i class="fas fa-table"></i> Formatter
                                </button>

                                <button class="btn btn-secondary dashboard-action-btn" onclick="openLenderManagementModal()">
                                    <i class="fas fa-university"></i> Manage Lenders
                                </button>
                                <button class="btn btn-secondary dashboard-action-btn">
                                    <i class="fas fa-cog"></i> Settings
                                </button>
                                <button class="btn btn-secondary dashboard-action-btn">
                                    <i class="fas fa-shield-alt"></i> Admin
                                </button>
                            </div>

                            <div class="goal-card">
                                <div class="goal-header">
                                    <span class="goal-title">Monthly Funding Goal</span>
                                    <span class="goal-numbers">$145,000 <span class="goal-subtext">/ $250k</span></span>
                                </div>
                                <div class="progress-track">
                                    <div class="progress-fill w-58"></div>
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
                }

                // Ensure Right Panel is in Home Mode
                if (window.commandCenter.intelligence && typeof window.commandCenter.intelligence.toggleView === 'function') {
                    window.commandCenter.intelligence.toggleView(false);
                } else {
                    const homePanel = document.getElementById('rightPanelHome');
                    const intelPanel = document.getElementById('rightPanelIntelligence');
                    if (homePanel) homePanel.classList.remove('hidden');
                    if (intelPanel) intelPanel.classList.add('hidden');
                }

                if (window.loadMarketNews) window.loadMarketNews();
                if (window.commandCenter.stats?.loadStats) window.commandCenter.stats.loadStats();
            };

            // 3. NEWS LOADER (Keep existing logic)
            window.loadMarketNews = async () => {
                const container = document.getElementById('newsFeedContainer');
                if (!container) return;

                // Skeleton
                container.innerHTML = `
                    <div class="news-feed-container">
                        <div class="news-header-rich">
                            <span class="news-header-title"><div class="live-indicator"></div> Market Pulse</span>
                        </div>
                        <div class="news-loading"><i class="fas fa-circle-notch fa-spin fa-2x" style="color: #30363d;"></i></div>
                    </div>`;

                try {
                    const response = await fetch('/api/news');
                    const result = await response.json();

                    const getTime = (d) => {
                        if (!d) return 'Recent';
                        const diff = new Date() - new Date(d);
                        const days = Math.floor(diff/86400000);
                        const hours = Math.floor(diff/3600000);
                        if(days > 0) return `${days}d ago`;
                        if(hours > 0) return `${hours}h ago`;
                        return 'Just now';
                    };

                    if (result.success && result.data?.length > 0) {
                        const newsHTML = result.data.map((item) => {
                            let badgeClass = '';
                            if (item.source === 'deBanked') badgeClass = 'source-debanked';
                            if (item.source === 'Legal/Regs') badgeClass = 'source-legal';

                            return `
                            <div class="news-card" onclick="window.open('${item.link}', '_blank')">
                                <div class="news-meta-top">
                                    <div class="news-source-badge ${badgeClass}"><i class="fas ${item.icon || 'fa-bolt'}"></i> ${item.source}</div>
                                    <span class="news-time-badge">${getTime(item.pubDate)}</span>
                                </div>
                                <h4 class="news-title">${item.title}</h4>
                                <div class="news-footer"><span class="read-more-link">Open Source <i class="fas fa-external-link-alt"></i></span></div>
                            </div>`;
                        }).join('');

                        container.innerHTML = `
                            <div class="news-feed-container">
                                <div class="news-header-rich">
                                    <span class="news-header-title"><div class="live-indicator"></div> Market Pulse</span>
                                    <span style="font-size: 10px; color: #6e7681;">Updated</span>
                                </div>
                                ${newsHTML}
                            </div>`;
                    } else {
                        container.innerHTML = '<div class="news-feed-container"><div class="empty-state"><p>Wire is silent.</p></div></div>';
                    }
                } catch (e) {
                    console.error(e);
                    container.innerHTML = '<div class="news-feed-container"><div class="empty-state"><p>Wire Offline</p></div></div>';
                }
            };

            // 4. OTHER HELPERS
            window.openLenderManagementModal = () => {
                // Initialize Admin Module if missing
                if (!window.commandCenter.lenderAdmin && typeof LenderAdmin !== 'undefined') {
                    console.log("🏦 Initializing LenderAdmin...");
                    window.commandCenter.lenderAdmin = new LenderAdmin(window.commandCenter);
                }

                if (window.commandCenter.lenderAdmin) {
                    window.commandCenter.lenderAdmin.openManagementModal();
                } else {
                    console.error("⚠️ LenderAdmin class not loaded");
                }
            };
            window.toggleDeleteMode = () => {
                const list = document.getElementById('conversationsList');
                const btn = document.getElementById('toggleDeleteModeBtn');
                if(!list) return;
                const isDeleteMode = list.classList.toggle('delete-mode');
                const confirmBtn = document.getElementById('deleteSelectedBtn');

                if(btn) btn.classList.toggle('active-danger', isDeleteMode);
                if(confirmBtn) confirmBtn.classList.toggle('hidden', !isDeleteMode);

                if(!isDeleteMode) {
                    document.querySelectorAll('.delete-checkbox').forEach(cb => cb.checked = false);
                    window.commandCenter.conversationUI?.selectedForDeletion.clear();
                }
            };

            // C. INITIAL LOAD
            if (!window.commandCenter.currentConversationId) {
                window.loadDashboard();
            }

        } else if (attempts >= maxAttempts) {
            clearInterval(appInitInterval);
            console.error('❌ CommandCenter load timeout');
        }
    }, 50);
});
