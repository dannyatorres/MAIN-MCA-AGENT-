// js/app-bootstrap.js
import { LeadFormController } from './lead-form-controller.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Main Module: Waiting for CommandCenter...');

    // Initialize app when CommandCenter is ready
    const initApp = () => {
        if (!window.commandCenter) return false;

        console.log('✅ Main Module: Attaching Logic to CommandCenter');
        return true;
    };

    // Poll for CommandCenter (fixes race condition on slow connections)
    let attempts = 0;
    const maxAttempts = 200; // 10 seconds max (50ms * 200)

    const appInitInterval = setInterval(() => {
        attempts++;

        if (initApp()) {
            clearInterval(appInitInterval);

            // --- A. INJECT CONTROLLER ---
            window.commandCenter.leadFormController = new LeadFormController(window.commandCenter);

            // --- B. DEFINE GLOBAL FUNCTIONS ---

            // 1. HEADER RENDERER
            window.updateChatHeader = (businessName, ownerName, phoneNumber, conversationId) => {
                const header = document.querySelector('.center-panel .panel-header');
                const centerPanel = document.querySelector('.center-panel');

                if (!header) return;
                // Class-based logic (Good)
                if (centerPanel) centerPanel.classList.remove('dashboard-mode');

                const displayTitle = businessName || 'Unknown Business';
                const initials = displayTitle.substring(0, 2).toUpperCase();

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
                            <button id="callBtn" class="header-action-btn" title="Call ${phoneNumber || 'No phone'}">
                                <i class="fas fa-phone"></i>
                            </button>
                        </div>
                    </div>
                    <div id="callBar" class="call-bar hidden">
                        <div class="call-bar-info">
                            <span class="call-status">Calling...</span>
                            <span class="call-timer" id="callTimer">00:00</span>
                        </div>
                        <div class="call-bar-actions">
                            <button class="call-control-btn" id="muteBtn" title="Mute">
                                <i class="fas fa-microphone"></i>
                            </button>
                            <button class="call-control-btn end-call" id="endCallBtn" title="End Call">
                                <i class="fas fa-phone-slash"></i>
                            </button>
                        </div>
                    </div>
                `;

                // Setup call button click handler with Twilio integration
                const callBtn = document.getElementById('callBtn');
                const endCallBtn = document.getElementById('endCallBtn');
                const muteBtn = document.getElementById('muteBtn');

                if (callBtn) {
                    callBtn.addEventListener('click', async () => {
                        if (!phoneNumber) {
                            alert('No phone number available for this lead.');
                            return;
                        }

                        // Use CallManager if available (Twilio)
                        if (window.callManager) {
                            console.log('📞 Starting call to:', phoneNumber);
                            await window.callManager.startCall(phoneNumber, conversationId);
                        } else {
                            // Fallback: just show UI (demo mode)
                            console.log('📞 CallManager not available - demo mode');
                            document.getElementById('callBar')?.classList.remove('hidden');
                            callBtn.classList.add('active');
                        }
                    });
                }

                if (endCallBtn) {
                    endCallBtn.addEventListener('click', () => {
                        if (window.callManager) {
                            window.callManager.endCall();
                        } else {
                            // Fallback: just hide UI
                            document.getElementById('callBar')?.classList.add('hidden');
                            document.getElementById('callBtn')?.classList.remove('active');
                        }
                    });
                }

                if (muteBtn) {
                    muteBtn.addEventListener('click', () => {
                        if (window.callManager) {
                            window.callManager.toggleMute();
                        } else {
                            // Fallback: just toggle visuals
                            muteBtn.classList.toggle('muted');
                            const icon = muteBtn.querySelector('i');
                            if (icon) {
                                icon.classList.toggle('fa-microphone');
                                icon.classList.toggle('fa-microphone-slash');
                            }
                        }
                    });
                }
            };

            // 2. DASHBOARD LOADER
            window.loadDashboard = () => {
                console.log("🏠 Loading Dashboard...");

                // Reset Core Selection
                if (window.commandCenter.conversationUI) {
                    window.commandCenter.conversationUI.currentConversationId = null;
                    window.commandCenter.conversationUI.selectedConversation = null;
                }

                // --- CENTER PANEL RESET ---
                const centerPanel = document.querySelector('.center-panel');
                const centerHeader = centerPanel ? centerPanel.querySelector('.panel-header') : null;
                const messages = document.getElementById('messagesContainer');
                const inputs = document.getElementById('messageInputContainer');
                const actions = document.getElementById('conversationActions');

                if (centerPanel) {
                    centerPanel.classList.add('dashboard-mode');
                    // REFACTORED: Removed centerPanel.style.gap = ''
                }
                if (centerHeader) centerHeader.innerHTML = '';

                // REFACTORED: Use classes to hide
                if (inputs) inputs.classList.add('hidden');
                if (actions) actions.classList.add('hidden');

                // Inject Dashboard Content
                if (messages) {
                    messages.innerHTML = `
                        <div class="dashboard-container">
                            <div class="dashboard-header">
                                <h1>Welcome back, Agent</h1>
                                <p>Here is what's happening with your pipeline today.</p>
                            </div>

                            <div class="dashboard-toolbar">
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

                // --- RIGHT PANEL RESET - REFACTORED ---
                if (window.commandCenter.intelligence && typeof window.commandCenter.intelligence.toggleView === 'function') {
                    window.commandCenter.intelligence.toggleView(false);
                } else {
                    // Fallback: Use classes
                    const homePanel = document.getElementById('rightPanelHome');
                    const intelPanel = document.getElementById('rightPanelIntelligence');
                    if (homePanel) homePanel.classList.remove('hidden');
                    if (intelPanel) intelPanel.classList.add('hidden');
                }

                // Ensure news is loaded
                if (window.loadMarketNews) window.loadMarketNews();

                // Refresh Stats
                if (window.commandCenter.stats?.loadStats) window.commandCenter.stats.loadStats();
            };

            // 3. NEWS LOADER (Enhanced)
            window.loadMarketNews = async () => {
                const container = document.getElementById('newsFeedContainer');
                if (!container) return;

                // Elegant Skeleton Loading
                container.innerHTML = `
                    <div class="news-feed-container">
                        <div class="news-header-rich">
                            <span class="news-header-title">
                                <div class="live-indicator"></div> Market Pulse
                            </span>
                        </div>
                        <div class="news-loading">
                            <i class="fas fa-circle-notch fa-spin fa-2x" style="color: #30363d; margin-bottom: 15px;"></i>
                            <span style="font-size: 12px;">Syncing wire...</span>
                        </div>
                    </div>
                `;

                try {
                    const response = await fetch('/api/news');
                    const result = await response.json();

                    // Helper to make the data look smarter
                    const getCategory = (text) => {
                        const lower = text.toLowerCase();
                        if (lower.includes('fed') || lower.includes('rate')) return 'Economy';
                        if (lower.includes('fund') || lower.includes('capital')) return 'Lending';
                        if (lower.includes('tech') || lower.includes('ai')) return 'Tech';
                        if (lower.includes('law') || lower.includes('regulat')) return 'Legal';
                        return 'Industry';
                    };

                    // Helper for real relative time from pubDate
                    const getRelativeTime = (dateString) => {
                        if (!dateString) return 'Recently';
                        const now = new Date();
                        const pubDate = new Date(dateString);
                        const diffMs = now - pubDate;
                        const diffMins = Math.floor(diffMs / 60000);
                        const diffHours = Math.floor(diffMs / 3600000);
                        const diffDays = Math.floor(diffMs / 86400000);

                        if (diffMins < 1) return 'Just now';
                        if (diffMins < 60) return `${diffMins}m ago`;
                        if (diffHours < 24) return `${diffHours}h ago`;
                        if (diffDays === 1) return 'Yesterday';
                        if (diffDays < 7) return `${diffDays}d ago`;
                        return pubDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    };

                    if (result.success && result.data?.length > 0) {
                        const newsHTML = result.data.map((item) => {
                            const category = getCategory(item.title);
                            const displaySource = item.source || 'Wire';
                            const timeString = getRelativeTime(item.pubDate);

                            return `
                            <div class="news-card" onclick="window.open('${item.link}', '_blank')">
                                <div class="news-meta-top">
                                    <div class="news-source-badge">
                                        <i class="fas fa-bolt"></i> ${displaySource}
                                    </div>
                                    <span class="news-category">${category}</span>
                                </div>

                                <h4 class="news-title">${item.title}</h4>

                                <div class="news-footer">
                                    <span class="news-time">${timeString}</span>
                                    <span class="read-more-link">
                                        Read <i class="fas fa-arrow-right"></i>
                                    </span>
                                </div>
                            </div>
                        `}).join('');

                        container.innerHTML = `
                            <div class="news-feed-container">
                                <div class="news-header-rich">
                                    <span class="news-header-title">
                                        <div class="live-indicator"></div> Market Pulse
                                    </span>
                                    <span style="font-size: 10px; color: #6e7681;">Updated</span>
                                </div>
                                ${newsHTML}
                            </div>
                        `;
                    } else {
                        container.innerHTML = `
                            <div class="news-feed-container">
                                <div class="empty-state">
                                    <div class="news-empty-icon">
                                        <i class="fas fa-satellite-dish"></i>
                                    </div>
                                    <p>Wire is silent.</p>
                                </div>
                            </div>`;
                    }
                } catch (e) {
                    console.error(e);
                    container.innerHTML = `
                        <div class="news-feed-container">
                            <div class="news-loading">
                                <i class="fas fa-exclamation-triangle"></i>
                                <span style="margin-top:10px">Connection to Wire failed.</span>
                            </div>
                        </div>`;
                }
            };

            // 4. LENDER MODAL
            window.openLenderManagementModal = () => {
                if (window.commandCenter.lenders?.openManagementModal) {
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
                    const confirmBtn = document.getElementById('deleteSelectedBtn');

                    if (isDeleteMode) {
                        btn.classList.add('active-danger');
                        // REFACTORED: Use class
                        if (confirmBtn) confirmBtn.classList.remove('hidden');
                    } else {
                        btn.classList.remove('active-danger');
                        const checkboxes = document.querySelectorAll('.delete-checkbox');
                        checkboxes.forEach(cb => cb.checked = false);

                        // REFACTORED: Use class
                        if (confirmBtn) confirmBtn.classList.add('hidden');

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

        } else if (attempts >= maxAttempts) {
            clearInterval(appInitInterval);
            console.error('❌ Critical: CommandCenter failed to load after 10 seconds.');
        }
    }, 50);
});
