// js/stats.js
// ---------------------------------------------------------
// Connects /api/stats (Backend) to command-center.html (Frontend)
// ---------------------------------------------------------

window.commandCenter = window.commandCenter || {};

window.commandCenter.stats = {
    async loadStats() {
        console.log("📊 Loading Dashboard Stats...");
        
        try {
            // 1. Fetch data from your backend route
            // Uses the global apiService defined in api.js
            const response = await window.commandCenter.api.get('/api/stats');
            
            if (!response || !response.success) {
                console.warn("⚠️ Stats API returned invalid data:", response);
                return;
            }

            console.log("✅ Stats Received:", response);

            // 2. Map Backend Keys to Frontend IDs
            // Backend sends: active, submitted, offers
            // HTML expects IDs: activeCount, submittedCount, offersCount
            
            this.updateElement('activeCount', response.active);
            this.updateElement('submittedCount', response.submitted);
            this.updateElement('offersCount', response.offers);
            
            // Update the "Last updated" timestamp in the status bar
            const lastUpdated = document.getElementById('lastUpdated');
            if (lastUpdated) {
                const now = new Date().toLocaleTimeString();
                lastUpdated.textContent = `Last updated: ${now}`;
            }

        } catch (error) {
            console.error("❌ Failed to load stats:", error);
            // Optional: Set to 0 or Error on failure
            this.updateElement('activeCount', 0);
        }
    },

    // Helper to safely update DOM elements
    updateElement(elementId, value) {
        const el = document.getElementById(elementId);
        if (el) {
            // Use '0' if value is null/undefined
            el.textContent = value !== undefined && value !== null ? value : 0;
            
            // Add a small animation effect
            el.classList.remove('pop-in');
            void el.offsetWidth; // Trigger reflow
            el.classList.add('pop-in');
        } else {
            console.warn(`⚠️ Missing HTML element: #${elementId}`);
        }
    }
};

// ---------------------------------------------------------
// Modal Openers (Called by HTML onclick attributes)
// ---------------------------------------------------------

// Open Submitted Leads Modal
window.showSubmittedLeads = async function() {
    console.log("📂 Opening Submitted Leads...");
    // Reuse your existing modal logic or alert for now
    if (window.commandCenter.lenderAdmin) {
        // If you have the lender admin module loaded
        window.commandCenter.lenderAdmin.openManagementModal();
    } else {
        alert("Loading submission details...");
        // You can redirect to a specific view or fetch /api/stats/submitted here
    }
};

// Open Offers Modal
window.showOffersModal = async function() {
    console.log("💰 Opening Offers...");
    try {
        const data = await window.commandCenter.api.get('/api/stats/offers');
        if (data.success && data.offers.length > 0) {
            // Simple alert for now, or replace with a custom modal builder
            const offerSummary = data.offers.map(o => 
                `${o.business_name}: $${o.offer_amount.toLocaleString()} from ${o.lender_name}`
            ).join('\n');
            alert("Current Offers:\n\n" + offerSummary);
        } else {
            alert("No active offers currently pending.");
        }
    } catch (e) {
        console.error("Error fetching offers:", e);
    }
};
