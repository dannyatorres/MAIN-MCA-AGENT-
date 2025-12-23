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

            // 1. DEFINE THE TRAFFIC COP (Global State Management)
            window.appState = {
                mode: 'dashboard',       // 'dashboard' or 'chat'
                activeConversationId: null
            };

            window.commandCenter.leadFormController = new LeadFormController(window.commandCenter);

            if (!window.commandCenter.lenderAdmin && typeof LenderAdmin !== 'undefined') {
                window.commandCenter.lenderAdmin = new LenderAdmin();

                // ADD THIS LINE: Map the class method to the global window object
                // This ensures the button works even if lender-admin.js loads late
                window.openLenderManagementModal = () => window.commandCenter.lenderAdmin.openManagementModal();
            }


            // --- GLOBAL FUNCTIONS ---

            // 1. The Clean View Switcher
            window.setViewMode = (mode) => {
                const dashboard = document.getElementById('dashboardView');
                const chat = document.getElementById('chatView');
                const backBtn = document.getElementById('backHomeBtn');
                const actions = document.getElementById('conversationActions');

                if (mode === 'dashboard') {
                    // Show Dashboard, Hide Chat
                    if (dashboard) dashboard.classList.remove('hidden');
                    if (chat) chat.classList.add('hidden');

                    // Cleanup Left Panel Buttons
                    if (actions) actions.classList.add('hidden');
                    if (backBtn) backBtn.classList.add('hidden');

                    // Set Global Flag (The Traffic Cop)
                    window.appState = window.appState || {};
                    window.appState.mode = 'dashboard';
                } else {
                    // Show Chat, Hide Dashboard
                    if (dashboard) dashboard.classList.add('hidden');
                    if (chat) chat.classList.remove('hidden');

                    if (actions) actions.classList.remove('hidden');
                    if (backBtn) backBtn.classList.remove('hidden');

                    window.appState = window.appState || {};
                    window.appState.mode = 'chat';
                }
            };

            // 3. The Header Renderer (Targets #chatView only)
            window.updateChatHeader = (businessName, ownerName, phoneNumber, conversationId) => {
                // Force Chat Mode
                window.setViewMode('chat');

                const chatView = document.getElementById('chatView');
                const header = chatView ? chatView.querySelector('.panel-header') : null;
                if (!header) return;

                let displayBusiness = businessName || 'Unknown Business';
                let displayOwner = (ownerName || '').trim() || 'Business Contact';

                if (!(ownerName || '').trim() && businessName) {
                    displayOwner = businessName;
                    displayBusiness = 'Business Account';
                }

                // Call Protection Guard
                const existingCallBar = document.getElementById('callBar');
                const isCallActive = existingCallBar && !existingCallBar.classList.contains('hidden');
                const currentTitle = header.querySelector('.chat-business-title')?.textContent;

                if (isCallActive && currentTitle === displayOwner) return;

                // ✅ NEW CLEAN LAYOUT
                header.innerHTML = `
                    <div class="chat-header-rich" style="display: flex; align-items: center; justify-content: space-between; width: 100%; position: relative;">

                        <button id="backHomeBtn" class="icon-btn-small" title="Back to Dashboard" style="z-index: 20;">
                            <i class="fas fa-arrow-left"></i>
                        </button>

                        <div class="chat-details-stack">
                            <h2 class="chat-business-title">${displayOwner}</h2>
                            <div class="chat-row-secondary">
                                <i class="fas fa-building" style="font-size: 10px; margin-right: 4px;"></i>
                                <span>${displayBusiness}</span>
                            </div>
                        </div>

                        <div class="chat-actions-group">

                            <button id="aiToggleBtn" class="ai-toggle-btn" data-state="loading">AI</button>

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
                            <div class="call-timer" id="callTimer">00:00</div>
                            <div class="call-actions-row">
                                <button class="call-control-btn" id="muteBtn"><i class="fas fa-microphone"></i></button>
                                <button class="call-control-btn end-call" id="endCallBtn"><i class="fas fa-phone-slash"></i></button>
                            </div>
                        </div>
                    </div>
                `;

                // Re-attach listeners
                document.getElementById('backHomeBtn').addEventListener('click', window.loadDashboard);

                // Initialize AI Button
                if (window.commandCenter && window.commandCenter.messaging) {
                    window.commandCenter.messaging.updateAIButtonState(conversationId);

                    const aiBtn = document.getElementById('aiToggleBtn');
                    if (aiBtn) {
                        aiBtn.onclick = () => {
                            const isCurrentlyOn = aiBtn.dataset.state === 'on';
                            window.commandCenter.messaging.toggleAI(!isCurrentlyOn);
                        };
                    }
                }

                // Initialize Call Button
                const callBtn = document.getElementById('callBtn');
                if (callBtn) {
                    callBtn.addEventListener('click', async () => {
                        if (!phoneNumber) return alert('No phone number available.');
                        if (!window.callManager) return alert("Calling system failed to load.");
                        const modal = document.getElementById('callBar');
                        modal.classList.remove('hidden');
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

                makeDraggable(document.getElementById("callBar"), document.getElementById("callModalCard"));

                const inputContainer = document.getElementById('messageInputContainer');
                if (inputContainer) inputContainer.classList.remove('hidden');
            };

            // 2. The Dashboard Loader (Now purely for Data, not HTML)
            window.loadDashboard = () => {
                console.log("🏠 Switching to Dashboard (Rebuilding Controls)");
                window.setViewMode('dashboard');

                // CLEAR OLD SELECTIONS (Standard cleanup)
                if (window.commandCenter.conversationUI) {
                    window.commandCenter.conversationUI.currentConversationId = null;
                    window.commandCenter.conversationUI.selectedConversation = null;
                    document.querySelectorAll('.conversation-item.selected').forEach(el => el.classList.remove('selected'));
                }

                // Hide Side Panels
                if (window.commandCenter.intelligence && typeof window.commandCenter.intelligence.toggleView === 'function') {
                    window.commandCenter.intelligence.toggleView(false);
                } else {
                    document.getElementById('rightPanelHome')?.classList.remove('hidden');
                    document.getElementById('rightPanelIntelligence')?.classList.add('hidden');
                }

                // Load Stats Data
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

                    // ✅ FIX: Robust Class Mapping to match server-new.js tags
                    let badgeClass = 'source-industry'; // Default
                    const src = (item.source || '').toLowerCase();

                    if (src.includes('debanked')) badgeClass = 'source-debanked'; // Green
                    else if (src.includes('legal') || src.includes('ftc')) badgeClass = 'source-legal'; // Red/Warning
                    else if (src.includes('lendsaas')) badgeClass = 'source-lendsaas'; // Blue (matches UI)

                    badge.className = `news-source-badge ${badgeClass}`;

                    // Icon mapping fallback
                    const iconClass = item.icon || 'fa-bolt';
                    badge.innerHTML = `<i class="fas ${iconClass}"></i> ${item.source}`;

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
