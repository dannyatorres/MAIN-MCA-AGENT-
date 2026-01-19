/**
 * Lead Formatter Client Module
 * Place this file in: js/lead-formatter.js
 *
 * This module handles the UI and API calls for the lead formatter.
 * All business logic (format detection, normalization, file generation)
 * is protected on the server in routes/lead-formatter.js
 */

class LeadFormatterModule {
    constructor(app) {
        this.app = app;
        this.modal = null;
        this.uploadArea = null;
        this.fileInput = null;
        this.statusEl = null;
        this.downloadSection = null;

        this.init();
    }

    init() {
        this.modal = document.getElementById('formatterModal');
        if (!this.modal) {
            console.error('[LeadFormatter] Modal not found in DOM');
            return;
        }

        this.uploadArea = this.modal.querySelector('#formatterUploadArea');
        this.fileInput = this.modal.querySelector('#formatterFileInput');
        this.statusEl = this.modal.querySelector('#formatterStatus');
        this.downloadSection = this.modal.querySelector('#formatterDownloadSection');

        this.bindEvents();
        console.log('[LeadFormatter] Initialized');
    }

    bindEvents() {
        // Close button
        const closeBtn = this.modal.querySelector('[data-action="close-formatter-modal"]');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // Click outside to close
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        // Upload area click
        if (this.uploadArea) {
            this.uploadArea.addEventListener('click', () => this.fileInput.click());
        }

        // Drag and drop
        if (this.uploadArea) {
            this.uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                this.uploadArea.classList.add('dragging');
            });

            this.uploadArea.addEventListener('dragleave', () => {
                this.uploadArea.classList.remove('dragging');
            });

            this.uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                this.uploadArea.classList.remove('dragging');

                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    this.handleFile(files[0]);
                }
            });
        }

        // File input change
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleFile(e.target.files[0]);
                }
            });
        }
    }

    open() {
        if (this.modal) {
            this.modal.classList.remove('hidden');
            this.reset();
        }
    }

    close() {
        if (this.modal) {
            this.modal.classList.add('hidden');
            this.reset();
        }
    }

    reset() {
        if (this.statusEl) {
            this.statusEl.className = 'formatter-status';
            this.statusEl.innerHTML = '';
        }
        if (this.downloadSection) {
            this.downloadSection.style.display = 'none';
        }
        if (this.fileInput) {
            this.fileInput.value = '';
        }
    }

    showStatus(message, type) {
        if (this.statusEl) {
            this.statusEl.innerHTML = message;
            this.statusEl.className = `formatter-status show ${type}`;
        }
    }

    async handleFile(file) {
        if (!file.name.endsWith('.csv')) {
            this.showStatus('❌ Please upload a CSV file', 'error');
            return;
        }

        this.showStatus('🔄 Processing file...', 'processing');

        try {
            const csvData = await this.readFile(file);
            const result = await this.processOnServer(csvData);

            if (result.success) {
                this.setupDownloads(result.files, result.format);
                this.showStatus(
                    `✅ Processed ${result.rowCount} records <span class="format-badge">${this.formatName(result.format)}</span>`,
                    'success'
                );
            } else {
                this.showStatus(`❌ ${result.error || 'Failed to process file'}`, 'error');
            }
        } catch (error) {
            console.error('[LeadFormatter] Error:', error);
            this.showStatus('❌ Error processing file', 'error');
        }
    }

    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    async processOnServer(csvData) {
        // Use the app's apiCall if available, otherwise fetch directly
        const apiCall = this.app?.apiCall?.bind(this.app) || this.directApiCall.bind(this);

        return await apiCall('/api/formatter/process', {
            method: 'POST',
            body: { csvData }
        });
    }

    async directApiCall(endpoint, options = {}) {
        const response = await fetch(endpoint, {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: options.body ? JSON.stringify(options.body) : undefined
        });
        return response.json();
    }

    formatName(format) {
        const names = {
            'braintrust': 'Braintrust Format',
            'braintrust2': 'Braintrust2 (TLO) Format',
            'original': 'Standard Format'
        };
        return names[format] || 'Unknown Format';
    }

    setupDownloads(files, format) {
        const timestamp = Date.now();

        // CRM Download
        const crmBtn = this.modal.querySelector('#formatterCrmDownload');
        if (crmBtn && files.crm) {
            const blob = new Blob([files.crm], { type: 'text/csv' });
            crmBtn.href = URL.createObjectURL(blob);
            crmBtn.download = `crm_import_${timestamp}.csv`;
        }

        // iPhone Download
        const iphoneBtn = this.modal.querySelector('#formatterIphoneDownload');
        if (iphoneBtn && files.iphone) {
            const blob = new Blob([files.iphone], { type: 'text/csv' });
            iphoneBtn.href = URL.createObjectURL(blob);
            iphoneBtn.download = `iphone_mass_texting_${timestamp}.csv`;
        }

        // Vonage Download
        const vonageBtn = this.modal.querySelector('#formatterVonageDownload');
        if (vonageBtn && files.vonage) {
            const blob = new Blob([files.vonage], { type: 'text/csv' });
            vonageBtn.href = URL.createObjectURL(blob);
            vonageBtn.download = `vonage_contacts_${timestamp}.csv`;
        }

        // Show download section
        if (this.downloadSection) {
            this.downloadSection.style.display = 'block';
        }
    }
}

// Expose globally for integration
window.LeadFormatterModule = LeadFormatterModule;
