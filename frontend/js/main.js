// js/main.js

// 1. IMPORT THE NEW CONTROLLER
import { LeadFormController } from './controllers/lead-form-controller.js';
import { LookupManager } from './lookups.js';

class App {
    constructor() {
        this.init();
    }

    async init() {
        console.log('🚀 CRM Main Module Loaded');

        // 1. Initialize Dropdowns (States, Entity Types, etc.)
        await LookupManager.init();

        // 2. Initialize the Lead Form Controller
        // This handles both "Create Lead" and "Edit Lead" logic now
        this.leadFormController = new LeadFormController(this);

        // 3. Expose Globals for HTML Buttons
        this.exposeGlobals();

        // 4. Load News
        this.loadMarketNews();

        // 5. Setup basic listeners
        this.setupEventListeners();
    }

    /**
     * EXPOSE GLOBALS
     * This connects your HTML onclick="..." attributes to the new classes
     */
    exposeGlobals() {
        // --- THE FIX: Connect "New Lead" button to the Controller ---
        window.openRichCreateModal = () => {
            console.log("🚀 Opening New Lead Form (Controller)...");
            this.leadFormController.openCreateModal();
        };

        // --- Connect "Edit Lead" button ---
        // (Used if you have an edit button in the header)
        window.openEditLeadModal = () => {
            // We need to find where to render it.
            // If you want a modal for Edit too, we can add a method to controller.
            // For now, assuming standard tab or inline behavior:
            const rightPanel = document.getElementById('intelligenceContent');
            if (rightPanel) {
                this.leadFormController.renderEditTab(rightPanel);
            }
        };

        // --- Keep Existing Globals ---

        // Delete Mode Toggle
        window.toggleDeleteMode = () => {
            const list = document.getElementById('conversationsList');
            const btn = document.getElementById('toggleDeleteModeBtn');
            if (!list) return;
            const isDeleteMode = list.classList.toggle('delete-mode');
            if (btn) btn.classList.toggle('active-danger', isDeleteMode);
        };

        // Helper for Accordions (used in the new form)
        window.toggleSection = (sectionId) => {
            const content = document.getElementById(sectionId);
            const toggle = content.previousElementSibling.querySelector('.section-toggle');
            if (content.classList.contains('collapsed')) {
                content.classList.remove('collapsed');
                if (toggle) toggle.textContent = '−';
            } else {
                content.classList.add('collapsed');
                if (toggle) toggle.textContent = '+';
            }
        };

        // Global API access for the controller to use
        this.api = {
            post: async (url, data) => this.apiCall(url, 'POST', data),
            put: async (url, data) => this.apiCall(url, 'PUT', data)
        };
    }

    /**
     * BASIC API WRAPPER
     * Used by LeadFormController to talk to the backend
     */
    async apiCall(url, method, data) {
        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (err) {
            console.error('API Error:', err);
            throw err;
        }
    }

    setupEventListeners() {
        // News Refresh
        const refreshNewsBtn = document.querySelector('[onclick="loadMarketNews()"]');
        if (refreshNewsBtn) refreshNewsBtn.onclick = () => this.loadMarketNews();
    }

    /**
     * NEWS FEED
     * (Kept from your original file)
     */
    async loadMarketNews() {
        const container = document.getElementById('newsFeedContainer');
        if (!container) return;

        container.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #64748b;">
                <div class="loading-spinner small" style="margin: 0 auto 10px;"></div>
                <div style="font-size: 12px;">Scanning Industry Wire...</div>
            </div>
        `;

        try {
            const response = await fetch('/api/news');
            const result = await response.json();

            if (result.success && result.data?.length > 0) {
                container.innerHTML = result.data.map(item => `
                    <div class="news-card" onclick="window.open('${item.link}', '_blank')">
                        <div class="news-content">
                            <div class="news-meta">
                                <span>${item.type === 'debanked' ? '⚡' : '📰'}</span>
                                <span class="news-source">${item.source || 'News'}</span>
                                <span class="news-time">Today</span>
                            </div>
                            <h4 class="news-title">${item.title}</h4>
                        </div>
                    </div>
                `).join('');
            } else {
                container.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:#94a3b8;">No recent updates.</div>';
            }
        } catch (e) {
            console.error('News Error:', e);
            container.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:#ef4444;">News Unavailable</div>';
        }
    }
}

// INSTANTIATE APP
window.app = new App();
