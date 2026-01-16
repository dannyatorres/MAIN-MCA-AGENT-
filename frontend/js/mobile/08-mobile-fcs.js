// /js/mobile/08-mobile-fcs.js
Object.assign(window.MobileApp.prototype, {
    async loadFcsView() {
        const container = document.getElementById('fcsContainer');
        if (!container || !this.currentConversationId) return;

        container.innerHTML = `
            <div class="ai-loading-container">
                <div class="ai-thinking">
                    <div class="ai-dot"></div>
                    <div class="ai-dot"></div>
                    <div class="ai-dot"></div>
                </div>
                <p>Loading FCS report...</p>
            </div>
        `;

        try {
            const result = await this.apiCall(`/api/fcs/results/${this.currentConversationId}`);

            if (result.success && result.analysis && result.analysis.report) {
                this.displayFcsReport({
                    report_content: result.analysis.report,
                    generated_at: result.analysis.completedAt,
                    business_name: result.analysis.businessName
                });
            } else {
                this.showFcsEmptyState();
            }
        } catch (err) {
            if (err.message.includes('404')) {
                this.showFcsEmptyState();
            } else {
                container.innerHTML = `
                    <div class="fcs-empty-state">
                        <div class="fcs-empty-icon">❌</div>
                        <h3>Error Loading Report</h3>
                        <p>${err.message}</p>
                        <button class="fcs-sync-btn" onclick="window.mobileApp.loadFcsView()">
                            <i class="fas fa-redo"></i> Retry
                        </button>
                    </div>
                `;
            }
        }
    },

    showFcsEmptyState() {
        const container = document.getElementById('fcsContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="fcs-empty-state">
                <div class="fcs-empty-icon">📊</div>
                <h3>No FCS Report</h3>
                <p>Generate a financial analysis report from your bank statements</p>
                <button class="fcs-sync-btn" id="triggerFcsSyncBtn">
                    <i class="fas fa-cloud-download-alt"></i> Sync & Generate
                </button>
            </div>
        `;

        document.getElementById('triggerFcsSyncBtn')?.addEventListener('click', () => {
            this.triggerFcsSync();
        });
    },

    async triggerFcsSync() {
        const container = document.getElementById('fcsContainer');
        if (!container || !this.currentConversationId) return;

        const conv = this.selectedConversation || {};

        container.innerHTML = `
            <div class="fcs-processing">
                <div class="ai-thinking">
                    <div class="ai-dot"></div>
                    <div class="ai-dot"></div>
                    <div class="ai-dot"></div>
                </div>
                <div class="fcs-processing-title">AI Agent Working...</div>
                <div class="fcs-processing-status" id="fcsProcessingStatus">Starting sync process...</div>
            </div>
        `;

        try {
            const startResponse = await this.apiCall('/api/integrations/drive/sync', {
                method: 'POST',
                body: JSON.stringify({
                    conversationId: this.currentConversationId,
                    businessName: conv.business_name || 'Business'
                })
            });

            if (!startResponse.success || !startResponse.jobId) {
                throw new Error(startResponse.error || 'Failed to start sync');
            }

            const result = await this.pollFcsJob(startResponse.jobId);

            if (result.status === 'completed') {
                this.showToast('FCS report generated!', 'success');
                this.loadFcsView();
            } else {
                throw new Error(result.error || 'Sync failed');
            }
        } catch (err) {
            container.innerHTML = `
                <div class="fcs-empty-state">
                    <div class="fcs-empty-icon">❌</div>
                    <h3>Sync Failed</h3>
                    <p>${err.message}</p>
                    <button class="fcs-sync-btn" id="retryFcsSyncBtn">
                        <i class="fas fa-redo"></i> Try Again
                    </button>
                </div>
            `;

            document.getElementById('retryFcsSyncBtn')?.addEventListener('click', () => {
                this.triggerFcsSync();
            });
        }
    },

    async pollFcsJob(jobId, maxAttempts = 120) {
        const statusMessages = [
            'Searching Google Drive...',
            'Downloading bank statements...',
            'Analyzing financial data...',
            'Running AI underwriting...',
            'Generating FCS report...',
            'Almost done...'
        ];

        let attempts = 0;

        while (attempts < maxAttempts) {
            attempts++;

            try {
                const status = await this.apiCall(`/api/integrations/drive/sync/status/${jobId}`);

                const statusEl = document.getElementById('fcsProcessingStatus');
                if (statusEl && status.status === 'processing') {
                    const msgIndex = Math.min(Math.floor(attempts / 10), statusMessages.length - 1);
                    statusEl.textContent = status.progress || statusMessages[msgIndex];
                }

                if (status.status === 'completed' || status.status === 'failed') {
                    return status;
                }
            } catch (err) {
                if (err.message.includes('404')) {
                    throw new Error('Job not found');
                }
            }

            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        throw new Error('Sync timed out');
    },

    displayFcsReport(report) {
        const container = document.getElementById('fcsContainer');
        if (!container || !report.report_content) return;

        const dateStr = report.generated_at
            ? new Date(report.generated_at).toLocaleString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: 'numeric', minute: '2-digit', hour12: true
            })
            : 'Just now';

        const cleanContent = report.report_content.replace(/```/g, '').trim();
        const formattedContent = this.formatFcsContent(cleanContent);

        container.innerHTML = `
            <div class="fcs-report-mobile">
                <div class="fcs-report-header">
                    <span class="fcs-report-date">Generated: ${dateStr}</span>
                    <button class="fcs-resync-btn" id="fcsResyncBtn">
                        <i class="fas fa-sync"></i> Re-sync
                    </button>
                </div>
                <div class="fcs-report-content">
                    ${formattedContent}
                </div>
            </div>
        `;

        document.getElementById('fcsResyncBtn')?.addEventListener('click', () => {
            this.triggerFcsSync();
        });
    },

    formatFcsContent(content) {
        if (!content) return '<p>No content</p>';

        console.log('=== FCS FORMAT CALLED ===');
        console.log('Content length:', content.length);

        let html = '<div class="fcs-styled-report">';
        const lines = content.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim().split('\n');

        let inTable = false;
        let inSummary = false;

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();

            if (!trimmed || trimmed.match(/^[-=_*]{3,}$/)) continue;

            // Skip table separator rows like |---|---|
            if (trimmed.match(/^\|[\s\-:|]+\|$/)) {
                console.log('Skipping separator row:', trimmed);
                continue;
            }

            // === MARKDOWN TABLE DETECTION ===
            if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
                const cells = trimmed.split('|').map(c => c.trim()).filter(c => c);
                console.log('Table row detected, cells:', cells.length, cells);

                // Detect header row (first pipe row we see with 4+ columns)
                if (!inTable && cells.length >= 4) {
                    html += '<div class="fcs-table-wrapper"><table class="fcs-table"><thead><tr>';
                    cells.forEach(h => { html += '<th>' + h + '</th>'; });
                    html += '</tr></thead><tbody>';
                    inTable = true;
                    continue;
                }

                // Data rows
                if (inTable && cells.length >= 4) {
                    html += '<tr>';
                    cells.forEach((cell, idx) => {
                        let cellClass = 'fcs-cell-number';
                        if (idx === 0) cellClass = 'fcs-cell-month';
                        if (idx === 2) cellClass = 'fcs-cell-revenue';
                        if (idx === 3 && parseInt(cell) > 3) cellClass = 'fcs-cell-warning';
                        html += '<td class="' + cellClass + '">' + cell + '</td>';
                    });
                    html += '</tr>';
                    continue;
                }
            }

            // === CLOSE TABLE (when we hit non-pipe line) ===
            if (inTable && !trimmed.startsWith('|')) {
                html += '</tbody></table></div>';
                inTable = false;
            }

            // === SUMMARY SECTION ===
            if (trimmed.match(/^\d+-Month Summary/i) || trimmed.match(/^Summary$/i)) {
                if (inTable) { html += '</tbody></table></div>'; inTable = false; }
                html += '<div class="fcs-summary-card"><div class="fcs-summary-header"><h4>' + trimmed + '</h4></div><div class="fcs-summary-body">';
                inSummary = true;
                continue;
            }

            // === SUMMARY KEY:VALUE PAIRS ===
            if (inSummary && trimmed.startsWith('- ') && trimmed.includes(':')) {
                const lineContent = trimmed.substring(2);
                const colonIdx = lineContent.indexOf(':');
                const key = lineContent.substring(0, colonIdx).trim();
                const val = lineContent.substring(colonIdx + 1).trim();
                html += '<div class="fcs-summary-row"><span class="fcs-summary-label">' + key + '</span><span class="fcs-summary-value">' + val + '</span></div>';
                continue;
            }

            // === END SUMMARY ===
            if (inSummary && (trimmed.endsWith(':') || trimmed.startsWith('##') || trimmed.startsWith('==='))) {
                html += '</div></div>';
                inSummary = false;
            }

            // === MONTH HEADERS ===
            if (trimmed.match(/^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+\d{4}$/i)) {
                html += '<div class="fcs-month-header">' + trimmed + '</div>';
                continue;
            }

            // === SECTION TAGS ===
            if (trimmed.match(/^(Observations|Recent MCA|Debt-Consolidation|Items for Review)/i)) {
                html += '<div class="fcs-tag">' + trimmed.replace(/:$/, '') + '</div>';
                continue;
            }

            // === REGULAR SECTION HEADERS ===
            const isHeader = (trimmed.endsWith(':') && trimmed.length < 60 && !trimmed.startsWith('-')) ||
                             trimmed.startsWith('##') || trimmed.startsWith('===');
            if (isHeader) {
                const headerText = trimmed.replace(/^[#=\s]+/, '').replace(/[=:]+$/, '').trim();
                html += '<div class="fcs-section-header"><h4>' + headerText + '</h4></div>';
                continue;
            }

            // === BULLET POINTS ===
            if (trimmed.startsWith('- ')) {
                html += '<div class="fcs-bullet">' + trimmed.substring(2) + '</div>';
                continue;
            }

            // === POSITIONS ===
            if (trimmed.match(/^Position\s+\d+:/i)) {
                const posNum = trimmed.match(/^Position\s+(\d+)/i)[1];
                const posContent = trimmed.replace(/^Position\s+\d+:\s*/i, '');
                html += '<div class="fcs-position-card"><span class="fcs-position-badge">P' + posNum + '</span><span class="fcs-position-text">' + posContent + '</span></div>';
                continue;
            }

            // === REASON/NOTES ===
            if (trimmed.startsWith('Reason:') || trimmed.startsWith('NOTE:')) {
                const noteContent = trimmed.replace(/^(Reason:|NOTE:)\s*/i, '');
                html += '<div class="fcs-reason">' + noteContent + '</div>';
                continue;
            }

            // === KEY:VALUE PAIRS ===
            if (trimmed.includes(':') && !trimmed.startsWith('|')) {
                const colonIdx = trimmed.indexOf(':');
                const key = trimmed.substring(0, colonIdx).trim();
                const val = trimmed.substring(colonIdx + 1).trim();
                if (key && val && key.length < 40) {
                    html += '<div class="fcs-kv-row"><span class="fcs-kv-key">' + key + '</span><span class="fcs-kv-value">' + val + '</span></div>';
                    continue;
                }
            }

            // === PLAIN TEXT ===
            html += '<p class="fcs-text">' + trimmed + '</p>';
        }

        if (inTable) html += '</tbody></table></div>';
        if (inSummary) html += '</div></div>';
        html += '</div>';

        return html;
    }
});
