// js/main.js
// This is the MODULE file that handles ES imports and injects them into CommandCenter

import { LeadFormController } from './controllers/lead-form-controller.js';
import { LookupManager } from './lookups.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Main Module: Waiting for CommandCenter...');

    // 1. Init Dropdowns
    await LookupManager.init();

    // 2. Wait slightly for app-core.js to finish its constructor
    // (A small timeout ensures window.commandCenter is available)
    setTimeout(() => {
        if (window.commandCenter) {
            console.log('✅ Main Module: Attaching LeadFormController to CommandCenter');

            // 3. Inject the Controller
            // We pass 'window.commandCenter' as the parent so the controller can access API/Core
            window.commandCenter.leadFormController = new LeadFormController(window.commandCenter);

            console.log('✅ LeadFormController injected successfully');

            // 4. Load News
            loadMarketNews();
        } else {
            console.error('❌ CommandCenter Global Object not found!');
        }
    }, 100);
});

// News Logic
async function loadMarketNews() {
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
