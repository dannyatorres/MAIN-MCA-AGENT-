// js/main.js
import { LeadFormController } from './controllers/lead-form-controller.js';
import { LookupManager } from './lookups.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Main Module: Waiting for CommandCenter...');

    // 1. Init Dropdowns
    await LookupManager.init();

    // 2. Wait for Core to Init
    setTimeout(() => {
        if (window.commandCenter) {
            console.log('✅ Main Module: Attaching Logic to CommandCenter');

            // --- A. INJECT CONTROLLER ---
            window.commandCenter.leadFormController = new LeadFormController(window.commandCenter);

            // --- B. DEFINE UI RENDERERS (The Fix) ---

            // 1. RENDER HEADER (Restores Name & Back Button)
            window.updateChatHeader = (businessName, ownerName) => {
                const header = document.querySelector('.center-panel .panel-header');
                const centerPanel = document.querySelector('.center-panel');

                if (!header) return;

                // Exit Dashboard Mode
                if (centerPanel) centerPanel.classList.remove('dashboard-mode');

                // Generate Initials
                const displayTitle = businessName || 'Unknown Business';
                const initials = displayTitle.substring(0, 2).toUpperCase();

                header.innerHTML = `
                    <div class="chat-header-rich" style="display: flex; align-items: center; width: 100%; gap: 15px;">
                        <button id="backHomeBtn" onclick="loadDashboard()" class="icon-btn-small" title="Back to Dashboard" style="width: 36px; height: 36px;">
                            <i class="fas fa-arrow-left"></i>
                        </button>

                        <div class="chat-avatar-large" style="width: 40px; height: 40px; background: #111827; color: white; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: bold;">
                            ${initials}
                        </div>

                        <div class="chat-details-stack" style="display: flex; flex-direction: column;">
                            <h2 class="chat-business-title" style="margin: 0; font-size: 16px; color: #111827;">${displayTitle}</h2>
                            <span style="font-size: 12px; color: #6b7280;">${ownerName || 'No Owner'}</span>
                        </div>
                    </div>
                `;
            };

            // 2. RENDER DASHBOARD (Restores Home Page & Lenders Button)
            window.loadDashboard = () => {
                console.log("🏠 Loading Dashboard...");

                // Clear Core State
                if (window.commandCenter.conversationUI) {
                    window.commandCenter.conversationUI.currentConversationId = null;
                    window.commandCenter.conversationUI.selectedConversation = null;
                }

                // UI: Enter Dashboard Mode
                const centerPanel = document.querySelector('.center-panel');
                const header = centerPanel.querySelector('.panel-header');
                const messages = document.getElementById('messagesContainer');
                const inputs = document.getElementById('messageInputContainer');

                centerPanel.classList.add('dashboard-mode');
                header.innerHTML = ''; // Hide header
                inputs.style.display = 'none'; // Hide chat inputs

                // Render Home Content
                messages.innerHTML = `
                    <div class="dashboard-container" style="padding: 40px; text-align: center;">
                        <div class="dashboard-header" style="margin-bottom: 40px;">
                            <h1 style="font-size: 28px; color: #111827; margin-bottom: 10px;">Welcome to MCAagent</h1>
                            <p style="color: #6b7280;">Select a conversation to start working or manage your network.</p>

                            <button class="btn btn-secondary" onclick="openLenderManagementModal()" style="margin-top: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                                <i class="fas fa-university"></i>&nbsp; Manage Lenders
                            </button>
                        </div>

                        <div class="stats-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; max-width: 600px; margin: 0 auto;">
                            <div class="stat-card" style="background: white; padding: 20px; border-radius: 12px; border: 1px solid #e5e7eb;">
                                <div style="font-size: 24px; font-weight: bold; color: #111827;" id="activeCount">-</div>
                                <div style="font-size: 12px; color: #6b7280; text-transform: uppercase;">Active Leads</div>
                            </div>
                            <div class="stat-card" style="background: white; padding: 20px; border-radius: 12px; border: 1px solid #e5e7eb;">
                                <div style="font-size: 24px; font-weight: bold; color: #d97706;" id="processingCount">-</div>
                                <div style="font-size: 12px; color: #6b7280; text-transform: uppercase;">Processing</div>
                            </div>
                            <div class="stat-card" style="background: white; padding: 20px; border-radius: 12px; border: 1px solid #e5e7eb;">
                                <div style="font-size: 24px; font-weight: bold; color: #166534;" id="todayCount">-</div>
                                <div style="font-size: 12px; color: #6b7280; text-transform: uppercase;">New Today</div>
                            </div>
                        </div>
                    </div>
                `;

                // Reset Right Panel (Back to News)
                if (window.commandCenter.intelligence) {
                    window.commandCenter.intelligence.toggleView(false);
                }

                // Trigger a stats refresh
                if (window.commandCenter.stats && window.commandCenter.stats.loadStats) {
                    window.commandCenter.stats.loadStats();
                }
            };

            // 3. LENDER MODAL LOGIC (Ensures it opens)
            window.openLenderManagementModal = () => {
                // Check if Lenders Module is ready
                if (window.commandCenter.lenders && window.commandCenter.lenders.openManagementModal) {
                     window.commandCenter.lenders.openManagementModal();
                } else {
                    // Fallback if module method missing
                    alert("Lender Management Module loading...");
                }
            };

            // --- C. INITIAL LOAD ---
            if (!window.commandCenter.currentConversationId) {
                window.loadDashboard();
            }

            // Load News
            loadMarketNews();

        } else {
            console.error('❌ CommandCenter Global Object not found!');
        }
    }, 100);
});

// News Feed Logic
async function loadMarketNews() {
    const container = document.getElementById('newsFeedContainer');
    if (!container) return;
    try {
        const response = await fetch('/api/news');
        const result = await response.json();
        if (result.success && result.data?.length > 0) {
            container.innerHTML = result.data.map(item => `
                <div class="news-card" onclick="window.open('${item.link}', '_blank')" style="padding: 15px; border-bottom: 1px solid #f3f4f6; cursor: pointer;">
                    <div class="news-meta" style="font-size: 11px; color: #9ca3af; margin-bottom: 5px;">
                        <span>${item.source || 'Industry News'}</span> • <span>Today</span>
                    </div>
                    <h4 class="news-title" style="font-size: 13px; margin: 0; color: #1f2937;">${item.title}</h4>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:#94a3b8;">No recent updates.</div>';
        }
    } catch (e) {
        console.log(e);
    }
}
