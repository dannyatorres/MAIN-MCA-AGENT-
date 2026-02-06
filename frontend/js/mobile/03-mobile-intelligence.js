// 03-mobile-intelligence.js
Object.assign(window.MobileApp.prototype, {
    // ============ INTELLIGENCE HUB ============
    setupIntelligenceListeners() {
        console.log('🧠 Setting up Intelligence listeners...');

        // 1. Card Selection (Delegation)
        const grid = document.getElementById('intelligenceCards');
        if (grid) {
            grid.addEventListener('click', (e) => {
                const card = e.target.closest('.intel-card');
                if (card) {
                    const intelType = card.dataset.intel;
                    console.log('👆 Card clicked:', intelType);
                    this.openIntelView(intelType);
                }
            });
        } else {
            console.error('❌ Error: #intelligenceCards container not found');
        }

        // 2. AI Assistant Input
        const aiInput = document.getElementById('mobileAiInput');
        const aiSend = document.getElementById('mobileAiSend');

        if (aiSend) {
            // Remove old listeners to prevent duplicates (cloning trick)
            const newAiSend = aiSend.cloneNode(true);
            aiSend.parentNode.replaceChild(newAiSend, aiSend);

            newAiSend.addEventListener('click', (e) => {
                e.preventDefault(); // Prevent form submission if inside form
                console.log('📨 AI Send clicked');
                this.sendAiMessage();
            });
        }

        if (aiInput) {
            aiInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendAiMessage();
                }
            });
            // Auto-resize
            aiInput.addEventListener('input', () => {
                aiInput.style.height = 'auto';
                aiInput.style.height = Math.min(aiInput.scrollHeight, 100) + 'px';
            });
        }
    },

    openIntelView(type) {
        if (!type) return;
        this.currentIntelView = type;

        // Hide Grid
        const grid = document.getElementById('intelligenceCards');
        if (grid) grid.classList.add('hidden');

        // Update Title
        const titleMap = {
            ai: 'AI Assistant',
            edit: 'Edit Lead',
            lenders: 'Lenders',
            fcs: 'FCS Report',
            strategy: 'Strategy',
            documents: 'Documents'
        };
        const titleEl = document.getElementById('detailsTitle');
        if (titleEl) titleEl.textContent = titleMap[type] || 'Intelligence';

        // Hide all specific views first
        document.querySelectorAll('.intel-view').forEach(v => v.classList.add('hidden'));

        // Show the requested view
        let viewId = '';
        switch(type) {
            case 'ai':
                viewId = 'aiAssistantView';
                console.log('Opening AI view, viewId:', viewId);
                this.loadAiChat();
                break;
            case 'edit': viewId = 'editView'; this.loadEditForm(); break;
            case 'lenders': viewId = 'lendersView'; this.loadLendersView(); break;
            case 'documents': viewId = 'documentsView'; this.loadDocumentsView(); break;
            case 'fcs': viewId = 'fcsView'; this.loadFcsView(); break;
            case 'strategy': viewId = 'strategyView'; this.loadStrategyView(); break;
        }

        const view = document.getElementById(viewId);
        console.log('View element:', view, 'classList:', view?.classList);
        if (view) view.classList.remove('hidden');
        console.log('After removing hidden:', view?.classList);

        // Inject "Back to Chat" shortcut
        let quickNav = document.getElementById('intelQuickNav');
        if (!quickNav) {
            quickNav = document.createElement('button');
            quickNav.id = 'intelQuickNav';
            quickNav.className = 'intel-quick-nav-btn';
            quickNav.innerHTML = '<i class="fas fa-comment"></i> Chat';
            quickNav.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:100;padding:10px 18px;border-radius:20px;border:none;background:#007aff;color:#fff;font-size:14px;font-weight:600;box-shadow:0 2px 12px rgba(0,0,0,0.2);display:flex;align-items:center;gap:6px;';
            quickNav.addEventListener('click', () => {
                this.closeIntelView();
                this.goToPanel(1);
                quickNav.remove();
            });
            document.body.appendChild(quickNav);
        }
    },

    closeIntelView() {
        document.getElementById('intelQuickNav')?.remove();
        this.currentIntelView = null;

        // Hide all views
        document.querySelectorAll('.intel-view').forEach(v => v.classList.add('hidden'));

        // Show Grid
        const grid = document.getElementById('intelligenceCards');
        if (grid) grid.classList.remove('hidden');

        // Reset Title
        const titleEl = document.getElementById('detailsTitle');
        if (titleEl) titleEl.textContent = 'Intelligence';
    }
});
