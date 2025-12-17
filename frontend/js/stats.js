// stats.js - Statistics module for tracking application metrics

class StatsModule {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = parent.apiBaseUrl;
        this.utils = parent.utils;

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
        // Ensure we are only trying to update elements if they exist
        const activeEl = document.getElementById('activeCount');
        const processingEl = document.getElementById('processingCount');
        const todayEl = document.getElementById('todayCount');

        if (!activeEl) return; // Not on dashboard, skip

        try {
            console.log('📊 Fetching dashboard stats...');
            const stats = await this.parent.apiCall('/api/stats');
            
            // Map API response to UI
            // Handle various potential API response structures
            const active = stats.totalConversations || stats.conversations?.total || 0;
            const processing = stats.processing || stats.fcs_processing?.currentlyProcessing || 0;
            const today = stats.newLeads || stats.conversations?.today || 0;

            activeEl.textContent = active;
            processingEl.textContent = processing;
            todayEl.textContent = today;

        } catch (error) {
            console.error('Error loading stats:', error);
            activeEl.textContent = '-';
            processingEl.textContent = '-';
            todayEl.textContent = '-';
        }
    }

    trackEvent(eventName, data = {}) {
        console.log('📈 Event tracked:', eventName, data);
    }
}
