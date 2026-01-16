// 03-mobile-intelligence.js
Object.assign(window.MobileApp.prototype, {
    // ============ INTELLIGENCE HUB ============
    setupIntelligenceListeners() {
        document.getElementById('intelligenceCards').addEventListener('click', (e) => {
            const card = e.target.closest('.intel-card');
            if (card) {
                const intelType = card.dataset.intel;
                this.openIntelView(intelType);
            }
        });

        const aiInput = document.getElementById('mobileAiInput');
        const aiSend = document.getElementById('mobileAiSend');

        if (aiInput && aiSend) {
            aiSend.addEventListener('click', () => this.sendAiMessage());
            aiInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendAiMessage();
                }
            });
            aiInput.addEventListener('input', () => {
                aiInput.style.height = 'auto';
                aiInput.style.height = Math.min(aiInput.scrollHeight, 100) + 'px';
            });
        }
    },

    openIntelView(type) {
        this.currentIntelView = type;

        document.getElementById('intelligenceCards').classList.add('hidden');

        const titles = {
            ai: 'AI Assistant',
            edit: 'Edit Lead',
            lenders: 'Lenders',
            fcs: 'FCS Report',
            strategy: 'Strategy',
            documents: 'Documents'
        };
        document.getElementById('detailsTitle').textContent = titles[type] || 'Intelligence';

        // Hide all views first
        document.querySelectorAll('.intel-view').forEach(v => v.classList.add('hidden'));

        // Route to the correct loader
        if (type === 'ai') {
            document.getElementById('aiAssistantView').classList.remove('hidden');
            this.loadAiChat();
        } else if (type === 'edit') {
            document.getElementById('editView').classList.remove('hidden');
            this.loadEditForm();
        } else if (type === 'lenders') {
            document.getElementById('lendersView').classList.remove('hidden');
            this.loadLendersView();
        } else if (type === 'documents') {
            document.getElementById('documentsView').classList.remove('hidden');
            this.loadDocumentsView();
        } else if (type === 'fcs') {
            document.getElementById('fcsView').classList.remove('hidden');
            this.loadFcsView();
        } else if (type === 'strategy') {
            document.getElementById('strategyView').classList.remove('hidden');
            this.loadStrategyView();
        }
    },

    closeIntelView() {
        this.currentIntelView = null;
        document.querySelectorAll('.intel-view').forEach(v => v.classList.add('hidden'));
        document.getElementById('intelligenceCards').classList.remove('hidden');
        document.getElementById('detailsTitle').textContent = 'Intelligence';
    }
});
