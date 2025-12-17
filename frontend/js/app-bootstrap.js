import { LeadFormController } from './lead-form-controller.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 [DEBUG] Main Module: DOM Loaded. Waiting for CommandCenter...');

    const createSafeElement = (tag, text, classes = []) => {
        const el = document.createElement(tag);
        if (text) el.textContent = text;
        if (classes.length) el.classList.add(...classes);
        return el;
    };

    const initApp = () => {
        if (!window.commandCenter || !window.commandCenter.isInitialized) return false;
        if (typeof CallManager !== 'undefined' && !window.callManager) {
            window.callManager = new CallManager();
        }
        return true;
    };

    let attempts = 0;
    const maxAttempts = 200;

    const appInitInterval = setInterval(() => {
        attempts++;

        if (initApp()) {
            clearInterval(appInitInterval);
            console.log('✅ [DEBUG] Main Module: CommandCenter is READY.');

            window.commandCenter.leadFormController = new LeadFormController(window.commandCenter);

            if (!window.commandCenter.lenderAdmin && typeof LenderAdmin !== 'undefined') {
                window.commandCenter.lenderAdmin = new LenderAdmin(window.commandCenter);
            }

            // --- GLOBAL FUNCTIONS ---

            // ✅ FIX: Centralize View Logic (Prevents inputs getting stuck on Dashboard)
            window.setViewMode = (mode) => {
                const centerPanel = document.querySelector('.center-panel');
                const actions = document.getElementById('conversationActions');
                const inputs = document.getElementById('messageInputContainer');
                const backBtn = document.getElementById('backHomeBtn');
                const header = centerPanel ? centerPanel.querySelector('.panel-header') : null;

                if (mode === 'dashboard') {
                    if (centerPanel) centerPanel.classList.add('dashboard-mode');
                    if (actions) actions.classList.add('hidden');
                    if (inputs) inputs.classList.add('hidden'); // Force hide inputs
                    if (backBtn) backBtn.classList.add('hidden');
                    if (header) header.innerHTML = ''; 
                } else {
                    if (centerPanel) centerPanel.classList.remove('dashboard-mode');
                    if (actions) actions.classList.remove('hidden');
                    if (backBtn) backBtn.classList.remove('hidden');
                    // Note: We do NOT unhide inputs here. conversation-core does that after data loads.
                }
            };

            // 1. HEADER RENDERER
            // 1. HEADER RENDERER (Updated for Modal Call Bar)
            window.updateChatHeader = (businessName, ownerName, phoneNumber, conversationId) => {
                window.setViewMode('chat');
                
                const header = document.querySelector('.center-panel .panel-header');
                if (!header) return;

                // Fallbacks if data is missing
                const displayTitle = businessName || 'Unknown Business';
                const displayOwner = ownerName || 'No Owner';
                const initials = displayTitle.substring(0, 2).toUpperCase();

                // 1. RENDER HEADER (Clean standard header)
                header.innerHTML = `
                    <div class="chat-header-rich">
                        <button id="backHomeBtn" class="icon-btn-small" title="Back to Dashboard">
                            <i class="fas fa-arrow-left"></i>
                        </button>
                        <div class="chat-avatar-large">${initials}</div>
                        <div class="chat-details-stack">
                            <h2 class="chat-business-title">${displayTitle}</h2>
                            <div class="chat-row-secondary">
                                <span>${displayOwner}</span>
                            </div>
                        </div>
                        <div class="chat-header-actions">
                            <button id="callBtn" class="header-action-btn phone-btn" title="Call ${phoneNumber || 'No phone'}">
                                <i class="fas fa-phone"></i>
                            </button>
                        </div>
                    </div>
                `;

                // Inject modal into body so it floats above everything
                let callBar = document.getElementById('callBar');
                if (!callBar) {
                    callBar = document.createElement('div');
                    callBar.id = 'callBar';
                    callBar.className = 'call-bar hidden';
                    callBar.innerHTML = `
                        <div class="call-modal-content">
                            <div class="call-avatar-pulse">
                                <i class="fas fa-phone"></i>
                            </div>
                            
                            <h3 class="call-contact-name">${displayTitle}</h3>
                            
                            <p class="call-contact-subtext">
                                <i class="fas fa-user"></i> ${displayOwner}
                            </p>

                            <div class="call-timer" id="callTimer">00:00</div>
                            
                            <div class="call-actions-row">
                                <button class="call-control-btn" id="muteBtn" title="Mute">
                                    <i class="fas fa-microphone"></i>
                                </button>
                                <button class="call-control-btn end-call" id="endCallBtn" title="End Call">
                                    <i class="fas fa-phone-slash"></i>
                                </button>
                            </div>
                        </div>
                    `;
                    document.body.appendChild(callBar);
                } else {
                    // Update modal text if it already exists
                    const nameEl = callBar.querySelector('.call-contact-name');
                    const ownerEl = callBar.querySelector('.call-contact-subtext');
                    if (nameEl) nameEl.textContent = displayTitle;
                    if (ownerEl) ownerEl.innerHTML = `<i class="fas fa-user"></i> ${displayOwner}`;
                }

                // 2. ATTACH LISTENERS
                document.getElementById('backHomeBtn').addEventListener('click', window.loadDashboard);
                
                const callBtn = document.getElementById('callBtn');
                if (callBtn) {
                    callBtn.addEventListener('click', async () => {
                        if (!phoneNumber) return alert('No phone number available.');
                        if (!window.callManager) return alert("Calling system failed to load.");
                        await window.callManager.startCall(phoneNumber, conversationId);
                    });
                }
                
                document.getElementById('endCallBtn')?.addEventListener('click', () => {
                    if (window.callManager) window.callManager.endCall();
                    else document.getElementById('callBar').classList.add('hidden');
                });

                const muteBtn = document.getElementById('muteBtn');
                muteBtn?.addEventListener('click', () => {
                    if (window.callManager) window.callManager.toggleMute();
                    else {
                         muteBtn.classList.toggle('muted');
                         muteBtn.querySelector('i').classList.toggle('fa-microphone-slash');
                    }
                });
            };

            const attachCallListeners = (btn, phoneNumber, conversationId) => {
                if (!btn) return;
                btn.addEventListener('click', async () => {
                    if (!phoneNumber) return alert('No phone number available.');
                    if (!window.callManager) return alert("Calling system failed to load.");
                    await window.callManager.startCall(phoneNumber, conversationId);
                });
            };

            // 2. DASHBOARD LOADER
            window.loadDashboard = () => {
                console.log("🏠 [DEBUG] Loading Dashboard...");

                // Reset Selection
                if (window.commandCenter.conversationUI) {
                    window.commandCenter.conversationUI.currentConversationId = null;
                    window.commandCenter.conversationUI.selectedConversation = null;
                    // Visually deselect list items
                    document.querySelectorAll('.conversation-item.selected').forEach(el => el.classList.remove('selected'));
                }

                // ✅ FIX: Use central switcher to guarantee inputs are hidden
                window.setViewMode('dashboard');

                const messages = document.getElementById('messagesContainer');

                // Render Dashboard
                if (messages) {
                    messages.innerHTML = `
                        <div class="dashboard-container">
                            <div class="dashboard-header">
                                <h1>Welcome back, Agent</h1>
                                <p>Here is what's happening with your pipeline today.</p>
                            </div>

                            <div class="dashboard-toolbar">
                                <button class="btn btn-secondary dashboard-action-btn" id="dashFormatterBtn">
                                    <i class="fas fa-table"></i> Formatter
                                </button>
                                
                                <button class="btn btn-secondary dashboard-action-btn" id="dashLenderBtn">
                                    <i class="fas fa-university"></i> Manage Lenders
                                </button>
                                
                                <button class="btn btn-secondary dashboard-action-btn">
                                    <i class="fas fa-cog"></i> Settings
                                </button>
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

                    // Wire up buttons
                    document.getElementById('dashFormatterBtn').addEventListener('click', () => window.open('/lead_reformatter.html', '_blank'));
                    document.getElementById('dashLenderBtn').addEventListener('click', () => {
                        if (typeof window.openLenderManagementModal === 'function') {
                            window.openLenderManagementModal();
                        } else {
                            alert('Lender Management module not loaded.');
                        }
                    });
                }

                // 🔴 CRITICAL FIX: Switch Right Panel back to Home/News Mode
                if (window.commandCenter.intelligence && typeof window.commandCenter.intelligence.toggleView === 'function') {
                    window.commandCenter.intelligence.toggleView(false);
                } else {
                    // Fallback manual toggle
                    document.getElementById('rightPanelHome')?.classList.remove('hidden');
                    document.getElementById('rightPanelIntelligence')?.classList.add('hidden');
                }

                // Load Stats
                if (window.commandCenter.stats?.loadStats) {
                    window.commandCenter.stats.loadStats();
                }

                // Load News
                if (window.loadMarketNews) window.loadMarketNews();
            };

            // 3. NEWS LOADER (Optimized with Caching)
            let newsCache = null; // Store data here so we don't refetch constantly
            let lastFetchTime = 0;

            window.loadMarketNews = async () => {
                const container = document.getElementById('newsFeedContainer');
                if (!container) return;

                // 1. FAST RENDER: If we have data, show it IMMEDIATELY
                if (newsCache) {
                    renderNews(newsCache);
                    // If data is less than 5 minutes old, stop here (saves bandwidth)
                    if (Date.now() - lastFetchTime < 300000) return; 
                } else {
                    // Only show spinner if we have absolutely nothing
                    container.innerHTML = `
                        <div class="news-feed-container">
                            <div class="news-header-rich">
                                <span class="news-header-title"><div class="live-indicator"></div> Market Pulse</span>
                            </div>
                            <div class="news-loading"><i class="fas fa-circle-notch fa-spin fa-2x"></i></div>
                        </div>`;
                }

                // 2. BACKGROUND FETCH: Get fresh data silently
                try {
                    const response = await fetch('/api/news');
                    const result = await response.json();

                    if (result.success && result.data?.length > 0) {
                        newsCache = result.data; // Save to cache
                        lastFetchTime = Date.now();
                        renderNews(newsCache);   // Update UI
                    } else if (!newsCache) {
                        container.innerHTML = '<div class="news-feed-container"><div class="empty-state"><p>Wire is silent.</p></div></div>';
                    }
                } catch (e) {
                    console.error(e);
                    if (!newsCache) {
                        container.innerHTML = '<div class="news-feed-container"><div class="empty-state"><p>Wire Offline</p></div></div>';
                    }
                }
            };

            // Helper to draw the HTML (Moved out to reuse it)
            const renderNews = (data) => {
                const container = document.getElementById('newsFeedContainer');
                if (!container) return;

                const wrapper = document.createElement('div');
                wrapper.className = 'news-feed-container';
                
                const header = document.createElement('div');
                header.className = 'news-header-rich';
                header.innerHTML = `<span class="news-header-title"><div class="live-indicator"></div> Market Pulse</span>`;
                wrapper.appendChild(header);

                data.forEach(item => {
                    const card = document.createElement('div');
                    card.className = 'news-card';
                    card.onclick = () => window.open(item.link, '_blank');

                    const metaTop = document.createElement('div');
                    metaTop.className = 'news-meta-top';
                    
                    const badge = document.createElement('div');
                    let badgeClass = '';
                    if (item.source === 'deBanked') badgeClass = 'source-debanked';
                    if (item.source === 'Legal/Regs') badgeClass = 'source-legal';
                    badge.className = `news-source-badge ${badgeClass}`;
                    badge.innerHTML = `<i class="fas ${item.icon || 'fa-bolt'}"></i>`;
                    badge.appendChild(document.createTextNode(' ' + item.source));

                    metaTop.appendChild(badge);
                    card.appendChild(metaTop);

                    const title = document.createElement('h4');
                    title.className = 'news-title';
                    title.textContent = item.title; 
                    card.appendChild(title);

                    const footer = document.createElement('div');
                    footer.className = 'news-footer';
                    footer.innerHTML = '<span class="read-more-link">Open Source <i class="fas fa-external-link-alt"></i></span>';
                    card.appendChild(footer);

                    wrapper.appendChild(card);
                });

                container.innerHTML = ''; 
                container.appendChild(wrapper);
            };

            // 4. OTHER HELPERS (Fixed: Attaches Listener Properly)
            window.toggleDeleteMode = () => {
                const list = document.getElementById('conversationsList');
                if (!list) return;

                const isDeleteMode = list.classList.toggle('delete-mode');
                
                document.getElementById('toggleDeleteModeBtn')?.classList.toggle('active-danger', isDeleteMode);
                document.getElementById('deleteSelectedBtn')?.classList.toggle('hidden', !isDeleteMode);

                // ✅ FIX: Safe Decoupling - Call a method on the class instead of touching raw data
                if (!isDeleteMode && window.commandCenter.conversationUI) {
                    // We will add this method to ConversationCore below
                    if (typeof window.commandCenter.conversationUI.clearDeleteSelection === 'function') {
                        window.commandCenter.conversationUI.clearDeleteSelection();
                    }
                }
            };

            // ✅ ATTACH THE LISTENER (The missing piece)
            const toggleBtn = document.getElementById('toggleDeleteModeBtn');
            if (toggleBtn) {
                // Clone to strip any old listeners, then attach the new one
                const newToggleBtn = toggleBtn.cloneNode(true);
                toggleBtn.parentNode.replaceChild(newToggleBtn, toggleBtn);
                newToggleBtn.addEventListener('click', window.toggleDeleteMode);
            }

            // Initial Load
            if (!window.commandCenter.currentConversationId) {
                window.loadDashboard();
            }

        } else if (attempts >= maxAttempts) {
            clearInterval(appInitInterval);
            console.error('❌ [DEBUG] CommandCenter load timeout (200 attempts)');
            
            // ✅ FIX: Restore the "Security Alert" behavior
            // When the server restarts, the session dies. The app won't initialize.
            // We catch that here and force the user back to safety.
            alert("Security Error: Unable to authenticate session. Please sign in again.");
            window.location.href = '/login'; // Change this to your actual login route (e.g., / or /signin)
        }
    }, 50);
});
