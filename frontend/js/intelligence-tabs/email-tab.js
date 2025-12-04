// frontend/js/intelligence-tabs/email-tab.js

export class EmailTab {
    constructor(parent) {
        this.parent = parent;
    }

    render(container) {
        container.innerHTML = `
            <div class="tab-content" style="padding: 20px;">
                <h4 style="margin-bottom: 15px;">📧 Email Integration</h4>
                <div class="empty-state" style="text-align: center; padding: 40px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">📬</div>
                    <p style="color: #6b7280;">Email features coming soon</p>
                    <p style="font-size: 12px; color: #9ca3af;">Send offers, follow-ups, and documents directly to leads</p>
                </div>
            </div>
        `;
    }
}
