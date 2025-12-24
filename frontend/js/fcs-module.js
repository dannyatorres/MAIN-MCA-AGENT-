// js/fcs-module.js - Complete FCS functionality with Sync Integration

class FCSModule {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = parent.apiBaseUrl;
        this.utils = parent.utils;
        this.templates = parent.templates;
        this._fcsGenerationInProgress = false;
        this._initialized = false;
        this.reportCache = new Map();

        this.init();
    }

    init() {
        if (this._initialized) return;
        console.log('🚀 Initializing FCS Module');
        this._initialized = true;
    }

    // =========================================================
    // SYNC & ANALYZE LOGIC (Replaces old Modal)
    // =========================================================
    async triggerSyncAndAnalyze() {
        const conversationId = this.parent.getCurrentConversationId();
        const conversation = this.parent.getSelectedConversation();

        if (!conversationId || !conversation) {
            alert("No conversation selected");
            return;
        }

        // 1. UI: Hide Results, Show Loading
        const fcsResults = document.getElementById('fcsResults');
        const syncLoading = document.getElementById('syncLoading'); // Defined in fcs-tab.js

        if (fcsResults) fcsResults.style.display = 'none';
        if (syncLoading) syncLoading.style.display = 'flex';

        try {
            console.log(`☁️ Triggering Sync & Analyze for: ${conversation.business_name}`);

            // 2. API Call: Sync Drive -> Download -> Analyze
            const response = await this.parent.apiCall(`/api/integrations/drive/sync`, {
                method: 'POST',
                body: {
                    conversationId: conversationId,
                    businessName: conversation.business_name
                }
            });

            if (response.success) {
                // 3. Success: Wait a moment, then reload
                if (syncLoading) {
                    syncLoading.innerHTML = `
                        <div style="color:#10b981; font-size: 24px;">✅</div>
                        <div class="sync-loading-text">
                            <strong style="color:#10b981">Analysis Complete!</strong>
                            <span>Synced ${response.count} files. Reloading report...</span>
                        </div>
                    `;
                }

                setTimeout(() => {
                    if (syncLoading) {
                        syncLoading.style.display = 'none';
                        // Reset content for next time
                        syncLoading.innerHTML = `
                            <div class="spinner-sync"></div>
                            <div class="sync-loading-text">
                                <strong>AI Agent Working...</strong>
                                <span>Searching Drive, downloading PDFs, and running Financial Analysis.</span>
                            </div>
                        `;
                    }
                    // Reload Data
                    this.loadFCSData();
                }, 1500);

            } else {
                throw new Error(response.error || "Sync failed");
            }

        } catch (err) {
            console.error("Sync Error:", err);
            if (syncLoading) syncLoading.style.display = 'none';
            if (fcsResults) {
                fcsResults.style.display = 'block';
                fcsResults.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #ef4444;">
                        <p><strong>Sync Failed:</strong> ${err.message}</p>
                        <button onclick="window.fcsModule.triggerSyncAndAnalyze()" class="btn btn-primary" style="margin-top: 16px;">Retry</button>
                    </div>
                `;
            }
        }
    }

    // =========================================================
    // DATA LOADING & RENDERING
    // =========================================================
    async loadFCSData() {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) return;

        let fcsResults = document.getElementById('fcsResults');

        // Ensure container exists if Tab just loaded
        if (!fcsResults) {
            const container = document.getElementById('intelligenceContent'); // Fallback
            if (container) {
                fcsResults = document.createElement('div');
                fcsResults.id = 'fcsResults';
                container.appendChild(fcsResults);
            } else {
                return; // Tab likely not active
            }
        }

        fcsResults.style.display = 'block';

        // 1. INSTANT RENDER FROM CACHE
        if (this.reportCache.has(conversationId)) {
            console.log(`⚡ [Cache] Showing FCS Report for ${conversationId}`);
            this.displayFCSReport(this.reportCache.get(conversationId));
        } else {
            fcsResults.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <div class="loading-spinner"></div>
                    <p style="color: #8b949e; margin-top: 16px;">Loading FCS report...</p>
                </div>`;
        }

        try {
            const result = await this.parent.apiCall(`/api/fcs/results/${conversationId}?_=${Date.now()}`);

            if (result.success && result.analysis) {
                const reportData = {
                    report_content: result.analysis.fcs_report,
                    generated_at: result.analysis.completed_at,
                    business_name: result.analysis.extracted_business_name
                };

                this.reportCache.set(conversationId, reportData);
                this.displayFCSReport(reportData);
            } else {
                // EMPTY STATE -> Triggers the Sync Button
                if (!this.reportCache.has(conversationId)) {
                    fcsResults.innerHTML = `
                        <div style="text-align: center; padding: 60px 40px;">
                            <div style="font-size: 48px; margin-bottom: 20px;">📊</div>
                            <h3 style="color: #e6edf3; margin-bottom: 12px;">No FCS Report Available</h3>
                            <p style="color: #8b949e; margin-bottom: 24px;">Generate a report to analyze your financial documents</p>

                            <button onclick="window.fcsModule.triggerSyncAndAnalyze()"
                                    class="btn-sync"
                                    style="padding: 12px 28px; font-size: 15px;">
                                <span>☁️</span> Sync & Generate FCS
                            </button>
                        </div>
                    `;
                }
            }
        } catch (e) {
            console.error('Error loading FCS:', e);
            if (fcsResults && !this.reportCache.has(conversationId)) {
                // 404 just means no report exists yet
                if (e.message.includes('404')) {
                    fcsResults.innerHTML = `
                        <div style="text-align: center; padding: 60px 40px;">
                            <div style="font-size: 48px; margin-bottom: 20px;">📊</div>
                            <h3 style="color: #e6edf3; margin-bottom: 12px;">No FCS Report Available</h3>
                            <p style="color: #8b949e; margin-bottom: 24px;">Generate a report to analyze your financial documents</p>
                            <button onclick="window.fcsModule.triggerSyncAndAnalyze()"
                                    class="btn-sync"
                                    style="padding: 12px 28px; font-size: 15px;">
                                <span>☁️</span> Sync & Generate FCS
                            </button>
                        </div>
                    `;
                } else {
                    fcsResults.innerHTML = `
                        <div style="text-align: center; padding: 40px; color: #ef4444;">
                            <p>Error loading report: ${e.message}</p>
                            <button onclick="window.fcsModule.loadFCSData()" class="btn btn-primary" style="margin-top: 16px;">Retry</button>
                        </div>
                    `;
                }
            }
        }
    }

    // =========================================================
    // FORMATTING & DISPLAY
    // =========================================================
    displayFCSReport(report) {
         let fcsResults = document.getElementById('fcsResults');
         if(fcsResults && report.report_content) {
             const dateStr = report.generated_at
                ? new Date(report.generated_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: 'numeric', minute: '2-digit', hour12: true
                  })
                : 'Just now';

             const cleanContent = report.report_content.replace(/```/g, '').trim();

             fcsResults.innerHTML = `
                <div class="fcs-report-container" style="padding: 0 20px 20px 20px; color: #e6edf3; font-family: sans-serif;">
                    <div style="display: flex; justify-content: flex-end; padding: 12px 0 8px 0; border-bottom: 1px solid #30363d; margin-bottom: 16px;">
                        <span style="font-size: 11px; color: #6b7280; font-family: monospace;">Generated: ${dateStr}</span>
                        <button onclick="window.fcsModule.triggerSyncAndAnalyze()" style="background:none; border:none; color:#3b82f6; cursor:pointer; font-size:11px; margin-left:15px; font-weight:600;">
                            <i class="fas fa-sync"></i> RE-SYNC
                        </button>
                    </div>
                    <div class="fcs-content">
                        ${this.formatFCSContent(cleanContent)}
                    </div>
                </div>`;

             fcsResults.style.display = 'block';
         }
    }

    formatFCSContent(content) {
        if (!content || content.trim() === '') {
            return '<div style="color: #ef4444; padding: 20px;">No content to display</div>';
        }

        try {
            let cleanText = content.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
            let lines = cleanText.split('\n').filter(line => line.trim() !== '');

            let html = '<div class="fcs-styled-report" style="font-family: sans-serif; color: #e6edf3;">';
            let inTable = false;

            for (let i = 0; i < lines.length; i++) {
                let line = lines[i].trim();
                if (line.match(/^[-=_*]{3,}$/)) continue;

                const isTableStart = line.match(/MONTH.*DEPOSITS/i) || line.match(/DATE.*REVENUE/i);

                if (isTableStart) {
                    if (inTable) { html += '</tbody></table></div>'; }
                    html += `
                    <div style="overflow-x: auto; margin-bottom: 20px; border-radius: 8px; border: 1px solid #30363d; margin-top: 15px;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; background: #0d1117;">
                            <thead style="background: #161b22; color: #8b949e; text-transform: uppercase; font-size: 11px;">
                                <tr>
                                    <th style="padding: 12px;">Month</th>
                                    <th style="padding: 12px;">Deposits</th>
                                    <th style="padding: 12px;">Revenue</th>
                                    <th style="padding: 12px;">Neg Days</th>
                                    <th style="padding: 12px;">End Bal</th>
                                </tr>
                            </thead>
                            <tbody>`;
                    inTable = true;
                    continue;
                }

                const dateMatch = line.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z,.]*\s+\d{4}/i) ||
                                  line.match(/^\d{1,2}\/\d{4}/) ||
                                  line.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}/);

                if (inTable && dateMatch) {
                    const month = dateMatch[0];
                    const cleanLine = line.replace(month, '');
                    const nums = cleanLine.match(/[-$]?[\d,]+(\.\d{2})?/g) || [];

                    const deposits = nums[0] || '-';
                    const revenue  = nums[1] || '-';
                    const negDays  = nums[2] || '0';
                    const endBal   = nums[3] || '-';

                    html += `
                        <tr style="border-bottom: 1px solid #21262d;">
                            <td style="padding: 12px; font-weight: 600; color: #3b82f6;">${month}</td>
                            <td style="padding: 12px;">${deposits}</td>
                            <td style="padding: 12px; font-weight: 600; color: #4ade80;">${revenue}</td>
                            <td style="padding: 12px; ${parseInt(negDays) > 3 ? 'color: #f87171;' : ''}">${negDays}</td>
                            <td style="padding: 12px;">${endBal}</td>
                        </tr>`;
                    continue;
                }

                const isHeader = (line.trim().endsWith(':') && line.length < 50) ||
                                 line.startsWith('##') ||
                                 (line === line.toUpperCase() && line.length > 4 && !line.includes('$'));

                if (isHeader) {
                    if (inTable) { html += '</tbody></table></div>'; inTable = false; }
                    const headerText = line.replace(/^[#\s]+/, '').replace(/:$/, '');

                    if (headerText.includes('BUSINESS NAME') || headerText.includes('EXTRACTED')) {
                         html += `<div style="color: #9ca3af; font-size: 11px; font-weight: 600; text-transform: uppercase; margin-top: 20px;">${headerText}</div>`;
                    } else {
                         html += `<h4 style="color: #3b82f6; margin: 24px 0 12px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #30363d; padding-bottom: 8px;">${headerText}</h4>`;
                    }
                    continue;
                }

                if (inTable) { html += '</tbody></table></div>'; inTable = false; }

                if (line.includes(':')) {
                    const [key, val] = line.split(':');
                    html += `
                    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #21262d; font-size: 13px;">
                        <span style="color: #9ca3af;">${key}</span>
                        <span style="font-weight: 600; color: #e6edf3;">${val}</span>
                    </div>`;
                }
                else if (i < 5 && line.length < 50 && line === line.toUpperCase()) {
                     html += `<div style="color: #fff; font-size: 24px; font-weight: 700; margin-bottom: 20px;">${line}</div>`;
                }
                else {
                    html += `<div style="margin-bottom: 6px; font-size: 13px; line-height: 1.5; color: #9ca3af;">${line}</div>`;
                }
            }

            if (inTable) { html += '</tbody></table></div>'; }
            html += '</div>';
            return html;

        } catch (error) {
            console.error('Formatting error:', error);
            return `<pre style="white-space: pre-wrap; color: #e6edf3; font-family: monospace;">${content}</pre>`;
        }
    }
}

// Expose globally for onclick handlers
window.FCSModule = FCSModule;
