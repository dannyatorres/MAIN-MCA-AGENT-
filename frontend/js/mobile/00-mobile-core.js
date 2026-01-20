// mobile.js - MCA Mobile PWA Controller
// Reuses: ApiService, Utilities, Templates, WebSocketManager patterns
'use strict';

// ============ MOBILE APP CLASS ============
// This satisfies WebSocketManager's expected interface
window.MobileApp = class MobileApp {
    constructor() {
        this.currentConversationId = null;
        this.selectedConversation = null;
        this.conversations = new Map();
        this.messages = [];
        this.currentPanel = 0;
        this.socket = null;
        this.pendingMessages = [];
        this.currentIntelView = null;
        this.aiMessages = [];
        this.pendingUploadFiles = null;
        this.isAnalyzingStrategy = false;
        this.useNativeDialer = true;
        this.currentFilter = '';
        this.conversationOffset = 0;
        this.conversationLimit = 50;
        this.hasMoreConversations = true;
        this.isLoadingMore = false;

        // Initialize utilities (reuse existing class)
        this.utils = new MobileUtils(this);

        // DOM references
        this.dom = {
            panelContainer: document.getElementById('panelContainer'),
            conversationList: document.getElementById('conversationList'),
            searchInput: document.getElementById('searchInput'),
            connectionDot: document.getElementById('connectionDot'),
            chatName: document.getElementById('chatName'),
            chatBusiness: document.getElementById('chatBusiness'),
            messagesContainer: document.getElementById('messagesContainer'),
            messageInput: document.getElementById('messageInput'),
            sendBtn: document.getElementById('sendBtn'),
            toastContainer: document.getElementById('toastContainer')
        };

        this.init();
    }

    async init() {
        console.log('📱 MCA Mobile initializing...');

        // Initialize API
        if (typeof ApiService !== 'undefined') {
            ApiService.init();
        }

        this.setupEventListeners();
        this.setupLeadsDropdown();
        this.setupCallListeners();
        this.setupDialerListeners();
        this.setupInfiniteScroll();
        await this.loadConversations();
        this.initWebSocket();
    }

    // ============ NAVIGATION ============
    goToPanel(index) {
        if (index === 0) {
            this.currentConversationId = null;
            this.selectedConversation = null;
            this.renderConversationList();
        }

        this.currentPanel = index;
        this.dom.panelContainer.setAttribute('data-panel', index);

        if (index === 1 && this.dom.messageInput) {
            setTimeout(() => this.dom.messageInput.focus(), 300);
        }
    }

    // ============ API HELPER ============
    async apiCall(endpoint, options = {}) {
        try {
            if (typeof ApiService !== 'undefined') {
                const body = options.body ? JSON.parse(options.body) : {};

                switch (options.method) {
                    case 'POST':
                        return await ApiService.post(endpoint, body);
                    case 'PUT':
                        return await ApiService.put(endpoint, body);
                    case 'DELETE':
                        return await ApiService.delete(endpoint);
                    default:
                        return await ApiService.get(endpoint);
                }
            }

            // Fallback
            const response = await fetch(endpoint, {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json', ...options.headers },
                ...options
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (err) {
            console.error('API Error:', err);
            this.showToast('Connection error', 'error');
            throw err;
        }
    }

    // ============ UTILITIES ============
    getInitials(name) {
        if (!name) return '??';
        return name.split(' ')
            .filter(w => w.length > 0)
            .slice(0, 2)
            .map(w => w[0].toUpperCase())
            .join('');
    }

    scrollToBottom() {
        requestAnimationFrame(() => {
            this.dom.messagesContainer.scrollTop = this.dom.messagesContainer.scrollHeight;
        });
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        this.dom.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // ============ EVENT LISTENERS ============
    setupEventListeners() {
        // Conversation selection
        this.dom.conversationList.addEventListener('click', (e) => {
            const item = e.target.closest('.conversation-item');
            if (item) this.selectConversation(item.dataset.id);
        });

        // Search
        let searchTimeout;
        this.dom.searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => this.loadConversations(e.target.value), 400);
        });

        // Mobile state filter
        const mobileStateFilter = document.getElementById('mobileStateFilter');
        if (mobileStateFilter) {
            mobileStateFilter.addEventListener('change', () => {
                this.loadConversations('', false);
            });
        }

        // Send message
        this.dom.sendBtn.addEventListener('click', () => this.sendMessage());
        this.dom.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Auto-resize textarea
        this.dom.messageInput.addEventListener('input', () => {
            this.dom.messageInput.style.height = 'auto';
            this.dom.messageInput.style.height = Math.min(this.dom.messageInput.scrollHeight, 120) + 'px';
        });

        document.getElementById('chatActionsBtn')?.addEventListener('click', () => {
            this.showChatActions();
        });

        this.setupIntelligenceListeners();
    }

    setupLeadsDropdown() {
        const headerUserMenu = document.getElementById('headerUserMenu');
        const headerDropdownMenu = document.getElementById('headerDropdownMenu');
        const headerDropdownBackdrop = document.getElementById('headerDropdownBackdrop');

        if (!headerUserMenu || !headerDropdownMenu) return;

        const closeDropdown = () => {
            headerUserMenu.classList.remove('open');
            headerDropdownMenu.classList.remove('show');
            headerDropdownBackdrop?.classList.remove('show');
        };

        headerUserMenu.addEventListener('click', () => {
            headerUserMenu.classList.toggle('open');
            headerDropdownMenu.classList.toggle('show');
            headerDropdownBackdrop?.classList.toggle('show');
        });

        headerDropdownBackdrop?.addEventListener('click', () => {
            closeDropdown();
        });

        document.querySelectorAll('.header-dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                closeDropdown();
            });
        });

        document.getElementById('addNewLeadBtn')?.addEventListener('click', () => {
            this.showToast('Add New Lead - Coming Soon', 'info');
        });

        document.getElementById('importCsvBtn')?.addEventListener('click', () => {
            this.showToast('Import CSV - Coming Soon', 'info');
        });

        document.getElementById('dashboardBtn')?.addEventListener('click', () => {
            this.openMobileDashboard();
        });

        document.getElementById('newsBtn')?.addEventListener('click', () => {
            this.showToast('News & Updates - Coming Soon', 'info');
        });

        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            if (confirm('Sign out?')) {
                window.location.href = '/logout';
            }
        });

        document.getElementById('closeDashboardBtn')?.addEventListener('click', () => {
            this.closeMobileDashboard();
        });

        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const userName = user.name || 'User';
        const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        const nameEl = document.getElementById('headerUserName');
        const avatarEl = document.getElementById('headerAvatar');
        if (nameEl) nameEl.textContent = userName;
        if (avatarEl) avatarEl.textContent = initials;
    }

    async loadMobileDashboard() {
        this.updateMobileHeroCard();
        await this.loadMobileStats();
    }

    updateMobileHeroCard() {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const userName = user.name?.split(' ')[0] || 'Boss';

        const greetings = [
            `Peace, ${userName}!`,
            `What's good, ${userName}?`,
            `Yo, what's the word, ${userName}?`,
            `What up, ${userName}!`,
            `Salute, ${userName}!`,
            `What's really good, ${userName}?`,
            `Yo, what's poppin, ${userName}?`,
            `Peace, king!`,
            `What's the science?`,
            `Blessings, ${userName}!`,
            `Talk to me, ${userName}!`,
            `Word up, let's work!`,
            `It's only right, ${userName}!`,
            `Yo, we here!`,
            `You already know, ${userName}!`,
            `Let's build, ${userName}!`
        ];

        const quotes = [
            'Success is not final, failure is not fatal: it is the courage to continue that counts.',
            'The secret of getting ahead is getting started.',
            "Don't watch the clock; do what it does. Keep going.",
            'The only way to do great work is to love what you do.',
            "Opportunities don't happen. You create them.",
            'Success usually comes to those who are too busy to be looking for it.',
            "The harder you work for something, the greater you'll feel when you achieve it.",
            'Dream bigger. Do bigger.',
            "Your limitation—it's only your imagination.",
            "Push yourself, because no one else is going to do it for you."
        ];

        const greeting = greetings[Math.floor(Math.random() * greetings.length)];
        const quote = quotes[Math.floor(Math.random() * quotes.length)];

        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const now = new Date();
        const dateStr = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;

        const greetingEl = document.getElementById('mobileHeroGreeting');
        const quoteEl = document.getElementById('mobileHeroQuote');
        const dateEl = document.getElementById('mobileHeroDate');

        if (greetingEl) greetingEl.textContent = greeting;
        if (quoteEl) quoteEl.textContent = `"${quote}"`;
        if (dateEl) dateEl.textContent = dateStr;
    }

    async loadMobileStats() {
        const activeEl = document.getElementById('mobileActiveCount');
        const submittedEl = document.getElementById('mobileSubmittedCount');
        const offersEl = document.getElementById('mobileOffersCount');

        if (activeEl) activeEl.textContent = '...';
        if (submittedEl) submittedEl.textContent = '...';
        if (offersEl) offersEl.textContent = '...';

        try {
            const stats = await this.apiCall('/api/stats');

            if (activeEl) activeEl.textContent = stats.active ?? stats.totalConversations ?? 0;
            if (submittedEl) submittedEl.textContent = stats.submitted ?? 0;
            if (offersEl) offersEl.textContent = stats.offers ?? 0;

            this.updateMobileFundingGoal(stats);
        } catch (error) {
            console.error('Error loading mobile stats:', error);
            if (activeEl) activeEl.textContent = '-';
            if (submittedEl) submittedEl.textContent = '-';
            if (offersEl) offersEl.textContent = '-';
        }
    }

    updateMobileFundingGoal(stats) {
        const funded = stats.fundedThisMonth || 0;
        const goal = stats.monthlyGoal || 500000;
        const deals = stats.dealsClosedThisMonth || 0;
        const percentage = Math.min(Math.round((funded / goal) * 100), 100);

        const formatMoney = (num) => '$' + num.toLocaleString();

        const fundedEl = document.getElementById('mobileFundedAmount');
        const goalEl = document.getElementById('mobileGoalAmount');
        const percentEl = document.getElementById('mobileGoalPercentage');
        const dealsEl = document.getElementById('mobileDealsCount');
        const progressBar = document.getElementById('mobileGoalProgressBar');

        if (fundedEl) fundedEl.textContent = formatMoney(funded);
        if (goalEl) goalEl.textContent = formatMoney(goal);
        if (percentEl) percentEl.textContent = `${percentage}%`;
        if (dealsEl) dealsEl.textContent = deals;
        if (progressBar) progressBar.style.width = `${percentage}%`;
    }

    openMobileDashboard() {
        const dashboard = document.getElementById('mobileDashboard');
        if (dashboard) dashboard.style.display = 'flex';
        document.getElementById('headerUserMenu')?.classList.remove('open');
        document.getElementById('headerDropdownMenu')?.classList.remove('show');
        document.getElementById('headerDropdownBackdrop')?.classList.remove('show');
        this.loadMobileDashboard();
    }

    closeMobileDashboard() {
        const dashboard = document.getElementById('mobileDashboard');
        if (dashboard) dashboard.style.display = 'none';
    }
}
