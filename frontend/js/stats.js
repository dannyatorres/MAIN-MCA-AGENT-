// stats.js - Statistics module for tracking application metrics

class StatsModule {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = parent.apiBaseUrl;
        this.utils = parent.utils;
        
        // ✅ NEW: Cache storage
        this.statsCache = null;

        this.init();
    }

    init() {
        console.log('📊 StatsModule initialized');
        // Optionally load stats immediately if we are on dashboard
        if (!this.parent.currentConversationId) {
            this.loadStats();
        }
    }

    async loadStats() {
        const activeEl = document.getElementById('activeCount');
        const processingEl = document.getElementById('processingCount');
        const todayEl = document.getElementById('todayCount');

        if (!activeEl) return; // Not on dashboard, skip

        // 1. INSTANT RENDER FROM CACHE
        if (this.statsCache) {
            console.log('⚡ [Cache] Showing stats instantly');
            this.updateUI(this.statsCache);
        } else {
            // Optional: Show simple placeholder if no cache
            if (activeEl.textContent === '-') activeEl.textContent = '...';
        }

        try {
            console.log('📊 Fetching dashboard stats...');
            const stats = await this.parent.apiCall('/api/stats');
            
            // Normalize Data
            const normalizedStats = {
                active: stats.totalConversations || stats.conversations?.total || 0,
                processing: stats.processing || stats.fcs_processing?.currentlyProcessing || 0,
                today: stats.newLeads || stats.conversations?.today || 0
            };

            // 2. UPDATE CACHE & UI
            this.statsCache = normalizedStats;
            this.updateUI(normalizedStats);

        } catch (error) {
            console.error('Error loading stats:', error);
            // Only show dashes if we really have nothing
            if (!this.statsCache) {
                activeEl.textContent = '-';
                processingEl.textContent = '-';
                todayEl.textContent = '-';
            }
        }
    }

    // Helper to keep UI logic clean
    updateUI(data) {
        const activeEl = document.getElementById('activeCount');
        const processingEl = document.getElementById('processingCount');
        const todayEl = document.getElementById('todayCount');

        if (activeEl) activeEl.textContent = data.active;
        if (processingEl) processingEl.textContent = data.processing;
        if (todayEl) todayEl.textContent = data.today;
    }

    trackEvent(eventName, data = {}) {
        console.log('📈 Event tracked:', eventName, data);
    }
}
