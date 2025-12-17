import { LeadFormController } from './lead-form-controller.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 [DEBUG] Main Module: DOM Loaded. Waiting for CommandCenter...');

    // Helper: Draggable Logic
    const makeDraggable = (element, handle) => {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        if (handle) {
            handle.onmousedown = dragMouseDown;
        } else {
            element.onmousedown = dragMouseDown;
        }

        function dragMouseDown(e) {
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
            e = e || window.event;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.transform = 'none';
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
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

            window.setViewMode = (mode) => {
                const centerPanel = document.querySelector('.center-panel');
                const actions = document.getElementById('conversationActions');
                const inputs = document.getElementById('messageInputContainer');
                const backBtn = document.getElementById('backHomeBtn');
                const header = centerPanel ? centerPanel.querySelector('.panel-header') : null;

                if (mode === 'dashboard') {
                    if (centerPanel) centerPanel.classList.add('dashboard-mode');
                    if (actions) actions.classList.add('hidden');
                    if (inputs) inputs.classList.add('hidden');
                    if (backBtn) backBtn.classList.add('hidden');
                    if (header) header.innerHTML = '';
                } else {
                    if (centerPanel) centerPanel.classList.remove('dashboard-mode');
                    if (actions) actions.classList.remove('hidden');
                    if (backBtn) backBtn.classList.remove('hidden');
                }
            };

            // ✅ HEADER RENDERER FIX: Owner Name Primary
            window.updateChatHeader = (businessName, ownerName, phoneNumber, conversationId) => {
                window.setViewMode('chat');

                const header = document.querySelector('.center-panel .panel-header');
                if (!header) return;

                // Priority Logic: Ensure we have strings
                let displayBusiness = businessName || 'Unknown Business';
                let displayOwner = ownerName || 'Business Contact';

                // If owner is missing but business is there, don't show "Unknown", just handle gracefully
                if (!ownerName && businessName) {
                    displayOwner = businessName; // Fallback to business name in big text
                    displayBusiness = 'Business Account'; // Secondary text
                }

                const initials = displayOwner.substring(0, 2).toUpperCase();

                // 1. RENDER HEADER
                // .chat-business-title = BIG (Used for Owner Name)
                // .chat-row-secondary = SMALL (Used for Business Name)
                header.innerHTML = `
                    <div class="chat-header-rich">
                        <button id="backHomeBtn" class="icon-btn-small" title="Back to Dashboard">
                            <i class="fas fa-arrow-left"></i>
                        </button>

                        <div class="chat-details-stack">
                            <h2 class="chat-business-title">${displayOwner}</h2>
                            <div class="chat-row-secondary">
                                <i class="fas fa-building" style="font-size: 10px; margin-right: 4px;"></i> <span>${displayBusiness}</span>
                            </div>
                        </div>

                        <div class="chat-header-actions">
                            <button id="callBtn" class="header-action-btn phone-btn" title="Call ${phoneNumber || 'No phone'}">
                                <i class="fas fa-phone"></i>
                            </button>
                        </div>
                    </div>

                    <div id="callBar" class="call-bar hidden">
                        <div class="call-modal-content" id="callModalCard">
                            <div class="drag-handle-icon"><i class="fas fa-grip-lines"></i></div>
                            <div class="call-avatar-pulse"><i class="fas fa-phone"></i></div>

                            <h3 class="call-contact-name">${displayOwner}</h3>

                            <p class="call-contact-subtext">
                                <span class="owner-badge"><i class="fas fa-building"></i> ${displayBusiness}</span>
                            </p>

                            <div class="call-timer" id="callTimer">00:00</div>

                            <div class="call-actions-row">
                                <button class="call-control-btn" id="muteBtn" title="Mute"><i class="fas fa-microphone"></i></button>
                                <button class="call-control-btn end-call" id="endCallBtn" title="End Call"><i class="fas fa-phone-slash"></i></button>
                            </div>
                        </div>
                    </div>
                `;

                // 2. ATTACH LISTENERS
                document.getElementById('backHomeBtn').addEventListener('click', window.loadDashboard);

                const callBtn = document.getElementById('callBtn');
                if (callBtn) {
                    callBtn.addEventListener('click', async () => {
                        if (!phoneNumber) return alert('No phone number available.');
                        if (!window.callManager) return alert("Calling system failed to load.");

                        const modal = document.getElementById('callBar');
                        modal.classList.remove('hidden'); // Ensure it becomes visible
                        modal.style.top = '15%';
                        modal.style.left = '50%';
                        modal.style.transform = 'translateX(-50%)';

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

                // 3. ENABLE DRAGGING
                makeDraggable(document.getElementById("callBar"), document.getElementById("callModalCard"));
            };

            // 2. DASHBOARD LOADER
            window.loadDashboard = () => {
                console.log("🏠 [DEBUG] Loading Dashboard...");
                if (window.commandCenter.conversationUI) {
                    window.commandCenter.conversationUI.currentConversationId = null;
                    window.commandCenter.conversationUI.selectedConversation = null;
                    document.querySelectorAll('.conversation-item.selected').forEach(el => el.classList.remove('selected'));
                }
                window.setViewMode('dashboard');

                const messages = document.getElementById('messagesContainer');
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
                    document.getElementById('dashFormatterBtn').addEventListener('click', () => window.open('/lead_reformatter.html', '_blank'));
                    document.getElementById('dashLenderBtn').addEventListener('click', () => {
                        if (typeof window.openLenderManagementModal === 'function') window.openLenderManagementModal();
                        else alert('Lender Management module not loaded.');
                    });
                }

                if (window.commandCenter.intelligence && typeof window.commandCenter.intelligence.toggleView === 'function') {
                    window.commandCenter.intelligence.toggleView(false);
                } else {
                    document.getElementById('rightPanelHome')?.classList.remove('hidden');
                    document.getElementById('rightPanelIntelligence')?.classList.add('hidden');
                }

                if (window.commandCenter.stats?.loadStats) window.commandCenter.stats.loadStats();
                if (window.loadMarketNews) window.loadMarketNews();
            };

            // 3. NEWS LOADER
            let newsCache = null;
            let lastFetchTime = 0;

            window.loadMarketNews = async () => {
                const container = document.getElementById('newsFeedContainer');
                if (!container) return;

                if (newsCache) {
                    renderNews(newsCache);
                    if (Date.now() - lastFetchTime < 300000) return;
                } else {
                    container.innerHTML = `
                        <div class="news-feed-container">
                            <div class="news-header-rich">
                                <span class="news-header-title"><div class="live-indicator"></div> Market Pulse</span>
                            </div>
                            <div class="news-loading"><i class="fas fa-circle-notch fa-spin fa-2x"></i></div>
                        </div>`;
                }

                try {
                    const response = await fetch('/api/news');
                    const result = await response.json();
                    if (result.success && result.data?.length > 0) {
                        newsCache = result.data;
                        lastFetchTime = Date.now();
                        renderNews(newsCache);
                    } else if (!newsCache) {
                        container.innerHTML = '<div class="news-feed-container"><div class="empty-state"><p>Wire is silent.</p></div></div>';
                    }
                } catch (e) {
                    if (!newsCache) container.innerHTML = '<div class="news-feed-container"><div class="empty-state"><p>Wire Offline</p></div></div>';
                }
            };

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

            window.toggleDeleteMode = () => {
                const list = document.getElementById('conversationsList');
                if (!list) return;
                const isDeleteMode = list.classList.toggle('delete-mode');
                document.getElementById('toggleDeleteModeBtn')?.classList.toggle('active-danger', isDeleteMode);
                document.getElementById('deleteSelectedBtn')?.classList.toggle('hidden', !isDeleteMode);

                if (!isDeleteMode && window.commandCenter.conversationUI) {
                    if (typeof window.commandCenter.conversationUI.clearDeleteSelection === 'function') {
                        window.commandCenter.conversationUI.clearDeleteSelection();
                    }
                }
            };

            const toggleBtn = document.getElementById('toggleDeleteModeBtn');
            if (toggleBtn) {
                const newToggleBtn = toggleBtn.cloneNode(true);
                toggleBtn.parentNode.replaceChild(newToggleBtn, toggleBtn);
                newToggleBtn.addEventListener('click', window.toggleDeleteMode);
            }

            if (!window.commandCenter.currentConversationId) {
                window.loadDashboard();
            }

        } else if (attempts >= maxAttempts) {
            clearInterval(appInitInterval);
            console.error('❌ [DEBUG] CommandCenter load timeout (200 attempts)');
            alert("Security Error: Unable to authenticate session. Please sign in again.");
            window.location.href = '/login';
        }
    }, 50);
});
