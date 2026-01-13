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
    // SYNC & ANALYZE LOGIC (With Job Polling)
    // =========================================================
    async triggerSyncAndAnalyze() {
        const conversationId = this.parent.getCurrentConversationId();
        const conversation = this.parent.getSelectedConversation();

        if (!conversationId || !conversation) {
            alert("No conversation selected");
            return;
        }

        const fcsResults = document.getElementById('fcsResults');
        const syncLoading = document.getElementById('syncLoading');

        if (fcsResults) fcsResults.style.display = 'none';
        if (syncLoading) {
            syncLoading.style.display = 'flex';
            syncLoading.innerHTML = `
                <div class="spinner-sync"></div>
                <div class="sync-loading-text">
                    <strong>AI Agent Working...</strong>
                    <span>Starting sync process...</span>
                </div>
            `;
        }

        try {
            console.log(`☁️ Triggering Sync & Analyze for: ${conversation.business_name}`);

            // 1. Start the job (returns immediately with jobId)
            const startResponse = await this.parent.apiCall(`/api/integrations/drive/sync`, {
                method: 'POST',
                body: {
                    conversationId: conversationId,
                    businessName: conversation.business_name
                }
            });

            if (!startResponse.success || !startResponse.jobId) {
                throw new Error(startResponse.error || "Failed to start sync job");
            }

            const jobId = startResponse.jobId;
            console.log(`📋 Job started: ${jobId}`);

            // 2. Poll for completion
            const result = await this.pollJobStatus(jobId, syncLoading);

            // 3. Handle completion
            if (result.status === 'completed') {
                if (syncLoading) {
                    syncLoading.innerHTML = `
                        <div style="color:#10b981; font-size: 24px;">✅</div>
                        <div class="sync-loading-text">
                            <strong style="color:#10b981">Analysis Complete!</strong>
                            <span>Synced ${result.result?.count || 0} files. Loading report...</span>
                        </div>
                    `;
                }

                setTimeout(() => {
                    if (syncLoading) {
                        syncLoading.style.display = 'none';
                        this.resetSyncLoadingUI(syncLoading);
                    }
                    this.reportCache.delete(conversationId); // Clear cache to force reload
                    this.loadFCSData();
                }, 1500);

            } else {
                throw new Error(result.error || "Sync failed");
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

    async pollJobStatus(jobId, syncLoading, maxAttempts = 120) {
        const pollInterval = 3000; // Check every 3 seconds
        let attempts = 0;

        const statusMessages = [
            'Searching Google Drive...',
            'Downloading bank statements...',
            'Analyzing financial data...',
            'Running AI underwriting...',
            'Generating FCS report...',
            'Almost done...'
        ];

        while (attempts < maxAttempts) {
            attempts++;

            try {
                const status = await this.parent.apiCall(`/api/integrations/drive/sync/status/${jobId}`);

                // Update progress UI
                if (syncLoading && status.status === 'processing') {
                    const messageIndex = Math.min(Math.floor(attempts / 10), statusMessages.length - 1);
                    syncLoading.innerHTML = `
                        <div class="spinner-sync"></div>
                        <div class="sync-loading-text">
                            <strong>AI Agent Working...</strong>
                            <span>${status.progress || statusMessages[messageIndex]}</span>
                        </div>
                    `;
                }

                // Check if done
                if (status.status === 'completed' || status.status === 'failed') {
                    return status;
                }

            } catch (err) {
                console.warn(`Poll attempt ${attempts} failed:`, err.message);
                // Continue polling unless it's a 404 (job not found)
                if (err.message.includes('404')) {
                    throw new Error('Job not found - it may have expired');
                }
            }

            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        throw new Error('Sync timed out after 6 minutes');
    }

    resetSyncLoadingUI(syncLoading) {
        syncLoading.innerHTML = `
            <div class="spinner-sync"></div>
            <div class="sync-loading-text">
                <strong>AI Agent Working...</strong>
                <span>Searching Drive, downloading PDFs, and running Financial Analysis.</span>
            </div>
        `;
    }

    // =========================================================
    // DATA LOADING & RENDERING
    // =========================================================
    async loadFCSData() {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) return;

        // Only proceed if FCS tab is active
        const fcsResults = document.getElementById('fcsResults');
        if (!fcsResults) {
            console.log('⏭️ FCS tab not active, skipping load');
            return;
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
                    report_content: result.analysis.report,
                    generated_at: result.analysis.completedAt,
                    business_name: result.analysis.businessName
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
            let lines = cleanText.split('\n');

            // 1. MODERN FONT STACK
            const fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

            let html = `<div class="fcs-styled-report" style="font-family: ${fontFamily}; color: #e6edf3; line-height: 1.5;">`;

            let inTable = false;
            let inSummary = false;
            let tableHeaders = [];

            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];
                let trimmedLine = line.trim();

                if (trimmedLine === '' || trimmedLine.match(/^[-=_*]{3,}$/)) continue;
                if (trimmedLine.match(/^\|[-\s|:]+\|$/)) continue;

                // === DETECT SUMMARY SECTION ===
                if (trimmedLine.match(/^\d+-Month Summary/i) || trimmedLine.match(/^Summary$/i)) {
                    if (inTable) { html += '</tbody></table></div>'; inTable = false; }

                    // Compact header with a gradient accent
                    html += `
                    <div style="margin-top: 32px; border-radius: 8px; border: 1px solid #30363d; overflow: hidden; background: #0d1117;">
                        <div style="background: linear-gradient(90deg, #2dd4bf 0%, #0f1115 100%); padding: 10px 16px;">
                            <h3 style="margin: 0; color: #0f1115; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">${trimmedLine}</h3>
                        </div>
                        <div style="padding: 0;">`; // Removed vertical padding from container
                    inSummary = true;
                    continue;
                }

                // === SUMMARY KEY:VALUE PAIRS (TIGHTER) ===
                if (inSummary && trimmedLine.startsWith('- ') && trimmedLine.includes(':')) {
                    const content = trimmedLine.substring(2);
                    const colonIndex = content.indexOf(':');
                    const key = content.substring(0, colonIndex).trim();
                    const val = content.substring(colonIndex + 1).trim();

                    // 3. TIGHTER SUMMARY ROWS
                    html += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 16px; border-bottom: 1px solid #21262d;">
                        <span style="color: #8b949e; font-size: 12px; font-weight: 500;">${key}</span>
                        <span style="font-weight: 600; color: #e6edf3; font-size: 13px; text-align: right; margin-left: 16px;">${val}</span>
                    </div>`;
                    continue;
                }

                // === END SUMMARY ===
                if (inSummary && (trimmedLine.endsWith(':') || trimmedLine.startsWith('##') || trimmedLine.startsWith('==='))) {
                    html += '</div></div>';
                    inSummary = false;
                }

                // === MARKDOWN TABLE HEADER ===
                if (trimmedLine.startsWith('|') && trimmedLine.includes('Month') && trimmedLine.includes('Deposits')) {
                    if (inTable) { html += '</tbody></table></div>'; }
                    tableHeaders = trimmedLine.split('|').map(h => h.trim()).filter(h => h);

                    html += `
                    <div style="overflow-x: auto; margin: 20px 0; border-radius: 8px; border: 1px solid #30363d; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; background: #0d1117;">
                            <thead style="background: #161b22; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px;">
                                <tr>${tableHeaders.map(h => `<th style="padding: 12px 16px; font-weight: 600; border-bottom: 1px solid #30363d;">${h}</th>`).join('')}</tr>
                            </thead>
                            <tbody>`;
                    inTable = true;
                    continue;
                }

                // === MARKDOWN TABLE ROW ===
                if (inTable && trimmedLine.startsWith('|') && trimmedLine.endsWith('|')) {
                    const cells = trimmedLine.split('|').map(c => c.trim()).filter(c => c);
                    if (cells.length >= 5) {
                        const [month, deposits, revenue, negDays, endBal, numDep] = cells;
                        const negDaysNum = parseInt(negDays) || 0;

                        html += `
                            <tr style="border-bottom: 1px solid #21262d;">
                                <td style="padding: 10px 16px; font-weight: 600; color: #3b82f6;">${month}</td>
                                <td style="padding: 10px 16px; font-family: ui-monospace, SFMono-Regular, monospace;">${deposits}</td>
                                <td style="padding: 10px 16px; font-weight: 600; color: #4ade80; font-family: ui-monospace, SFMono-Regular, monospace;">${revenue}</td>
                                <td style="padding: 10px 16px; font-weight: 600; ${negDaysNum > 3 ? 'color: #f87171;' : 'color: #9ca3af;'}">${negDays}</td>
                                <td style="padding: 10px 16px; font-family: ui-monospace, SFMono-Regular, monospace;">${endBal}</td>
                                <td style="padding: 10px 16px; color: #8b949e;">${numDep || '-'}</td>
                            </tr>`;
                        continue;
                    }
                }

                // === CLOSE TABLE ===
                if (inTable && !trimmedLine.startsWith('|')) {
                    html += '</tbody></table></div>';
                    inTable = false;
                }

                // === MONTH HEADERS ===
                if (trimmedLine.match(/^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+\d{4}$/i)) {
                    html += `<div style="display:flex; align-items:center; margin: 24px 0 12px 0;">
                                <h4 style="color: #f59e0b; margin: 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">${trimmedLine}</h4>
                                <div style="flex-grow:1; height:1px; background:#30363d; margin-left:12px;"></div>
                             </div>`;
                    continue;
                }

                // === SECTION HEADERS (Observations, etc) ===
                const isHeader = (trimmedLine.endsWith(':') && trimmedLine.length < 60 && !trimmedLine.startsWith('-')) ||
                                 trimmedLine.startsWith('##') || trimmedLine.startsWith('===');

                if (isHeader) {
                    const headerText = trimmedLine.replace(/^[#=\s]+/, '').replace(/[=:]+$/, '').trim();

                    // Special style for Analysis Headers
                    if (headerText.match(/^(Observations|Recent MCA|Debt-Consolidation|Items for Review)/i)) {
                        html += `
                        <div style="margin-top: 24px; margin-bottom: 8px;">
                            <span style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">${headerText}</span>
                        </div>`;
                    } else if (headerText.includes('BUSINESS NAME') || headerText.includes('EXTRACTED')) {
                        html += `<div style="color: #6b7280; font-size: 10px; font-weight: 700; text-transform: uppercase; margin-top: 20px; letter-spacing: 1px;">${headerText}</div>`;
                    } else {
                        html += `<h4 style="color: #e6edf3; margin: 24px 0 8px 0; font-size: 14px; font-weight: 600;">${headerText}</h4>`;
                    }
                    continue;
                }

                // === 2. FIX FOR BULLET POINTS (THE "SPREAD OUT" ISSUE) ===
                // Instead of making each bullet a box, we make them a clean list
                if (trimmedLine.startsWith('- ')) {
                    const bulletContent = trimmedLine.substring(2);
                    const tagMatch = bulletContent.match(/^(.+?)\s{2,}(.+)$/); // Check for right-aligned tags

                    if (tagMatch) {
                        // Tagged items (Keep these as cards, but tighter)
                        const [, leftPart, rightPart] = tagMatch;
                        html += `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; margin-bottom: 4px; background: #161b22; border-radius: 6px; border: 1px solid #30363d;">
                            <span style="color: #e6edf3; font-size: 13px;">${leftPart.trim()}</span>
                            <span style="color: #8b949e; font-size: 11px; background: #21262d; padding: 2px 8px; border-radius: 4px;">${rightPart.trim()}</span>
                        </div>`;
                    } else {
                        // Regular bullets (Observations, Lists) - REMOVED THE BOX
                        html += `
                        <div style="position: relative; padding-left: 16px; margin-bottom: 6px; color: #c9d1d9; font-size: 13px;">
                            <span style="position: absolute; left: 0; top: 6px; width: 4px; height: 4px; background: #3b82f6; border-radius: 50%;"></span>
                            ${bulletContent}
                        </div>`;
                    }
                    continue;
                }

                // === POSITIONS (Keep these as cards, they are important) ===
                if (trimmedLine.match(/^Position\s+\d+:/i)) {
                    const content = trimmedLine.replace(/^Position\s+\d+:\s*/i, '');
                    const posNum = trimmedLine.match(/^Position\s+(\d+)/i)[1];
                    html += `
                    <div style="display: flex; align-items: flex-start; gap: 12px; padding: 10px; margin: 8px 0; background: #161b22; border-radius: 6px; border-left: 3px solid #f59e0b;">
                        <span style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-top: 2px;">P${posNum}</span>
                        <span style="color: #e6edf3; font-size: 13px; font-weight: 500;">${content}</span>
                    </div>`;
                    continue;
                }

                // === REASON/NOTES (Integrated style) ===
                if (trimmedLine.startsWith('Reason:') || trimmedLine.startsWith('NOTE:')) {
                    const content = trimmedLine.replace(/^(Reason:|NOTE:)\s*/i, '');
                    html += `
                    <div style="margin: 4px 0 16px 20px; font-size: 12px; color: #8b949e; border-left: 2px solid #30363d; padding-left: 12px; font-style: italic;">
                        ${content}
                    </div>`;
                    continue;
                }

                // === REGULAR KEY:VALUE ===
                if (trimmedLine.includes(':') && !trimmedLine.startsWith('|')) {
                    const colonIndex = trimmedLine.indexOf(':');
                    const key = trimmedLine.substring(0, colonIndex).trim();
                    const val = trimmedLine.substring(colonIndex + 1).trim();
                    if (key && val && key.length < 40) {
                        html += `
                        <div style="display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; border-bottom: 1px solid rgba(48, 54, 61, 0.5);">
                            <span style="color: #8b949e;">${key}</span>
                            <span style="color: #e6edf3;">${val}</span>
                        </div>`;
                        continue;
                    }
                }

                // === PLAIN TEXT ===
                html += `<div style="margin-bottom: 6px; font-size: 13px; color: #8b949e;">${trimmedLine}</div>`;
            }

            if (inTable) { html += '</tbody></table></div>'; }
            if (inSummary) { html += '</div></div>'; }
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
