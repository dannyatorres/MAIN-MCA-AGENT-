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
        this.setupCallListeners();
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

        // AI Toggle
        document.getElementById('mobileAiToggleBtn')?.addEventListener('click', () => {
            this.toggleAI();
        });

        // Call Button
        document.getElementById('mobileCallBtn')?.addEventListener('click', () => {
            this.startCall();
        });

        this.setupIntelligenceListeners();
    }
}
