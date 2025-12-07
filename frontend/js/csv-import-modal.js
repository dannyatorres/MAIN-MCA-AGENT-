// CSV Import Modal Handler
class CSVImportModalManager {
    constructor() {
        this.currentStep = 1;
        this.uploadedFile = null;
        this.csvData = null;
        this.columnMapping = {};
        this.validationResults = null;
        this.importId = null;
        this.apiBase = '/api/csv-import';
        this.modal = document.getElementById('csvImportModal');

        // Fix: Initialize listeners only once
        this.listenersAttached = false;
        this.init();
    }

    init() {
        // Attach listeners immediately if modal exists
        if (this.modal && !this.listenersAttached) {
            this.initializeEventListeners();
            this.listenersAttached = true;
        }
    }

    openModal() {
        this.modal = document.getElementById('csvImportModal');
        if (this.modal) {
            this.modal.classList.remove('hidden');
            this.modal.style.display = 'flex';
            this.resetModal();
            // Ensure listeners are attached even if they weren't in constructor
            if (!this.listenersAttached) {
                this.initializeEventListeners();
                this.listenersAttached = true;
            }
            this.updateStepDisplay();
        }
    }

    closeModal() {
        if (this.modal) {
            this.modal.classList.add('hidden');
            this.modal.style.display = 'none';
            this.resetModal();
        }
    }

    resetModal() {
        this.currentStep = 1;
        this.uploadedFile = null;
        this.csvData = null;
        this.columnMapping = {};
        this.validationResults = null;
        this.importId = null;

        // Reset file input
        const fileInput = document.getElementById('csvFileInput');
        if (fileInput) fileInput.value = '';

        // Hide file info
        const fileInfo = document.getElementById('csvFileInfo');
        if (fileInfo) fileInfo.style.display = 'none';

        // Clear status messages
        const statusMessages = document.getElementById('csvStatusMessages');
        if (statusMessages) statusMessages.innerHTML = '';

        // Reset progress
        const progressFill = document.getElementById('csvProgressFill');
        if (progressFill) progressFill.style.width = '0%';

        this.goToStep(1);
    }

    initializeEventListeners() {
        console.log('Initializing CSV Modal Listeners...');

        const uploadArea = document.getElementById('csvUploadArea');
        const fileInput = document.getElementById('csvFileInput');
        const selectFileBtn = document.getElementById('csvSelectFileBtn');

        // Drag and Drop Logic - prevent defaults on all drag events
        if (uploadArea) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                uploadArea.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }, false);
            });

            uploadArea.addEventListener('dragover', () => {
                uploadArea.style.borderColor = '#3b82f6';
                uploadArea.style.background = 'rgba(59, 130, 246, 0.05)';
            });

            uploadArea.addEventListener('dragleave', () => {
                uploadArea.style.borderColor = '#d1d5db';
                uploadArea.style.background = 'transparent';
            });

            uploadArea.addEventListener('drop', (e) => {
                uploadArea.style.borderColor = '#d1d5db';
                uploadArea.style.background = 'transparent';
                const files = e.dataTransfer.files;
                console.log('File Dropped:', files);
                if (files.length > 0) {
                    this.handleFileSelect(files[0]);
                }
            });

            // Click area to upload
            uploadArea.addEventListener('click', () => fileInput?.click());
        }

        // Button Click
        if (selectFileBtn) {
            selectFileBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                fileInput?.click();
            });
        }

        // File Input Change
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                console.log('File Input Changed:', e.target.files);
                if (e.target.files.length > 0) {
                    this.handleFileSelect(e.target.files[0]);
                }
            });
        }

        // Navigation Buttons
        document.getElementById('csvBackToUploadBtn')?.addEventListener('click', () => this.goToStep(1));
        document.getElementById('csvValidateMappingBtn')?.addEventListener('click', () => this.validateMapping());
        document.getElementById('csvBackToMappingBtn')?.addEventListener('click', () => this.goToStep(2));
        document.getElementById('csvProceedToImportBtn')?.addEventListener('click', () => this.startImport());
        document.getElementById('csvViewResultsBtn')?.addEventListener('click', () => this.viewResults());
        document.getElementById('closeCsvImportModal')?.addEventListener('click', () => this.closeModal());
    }

    async handleFileSelect(file) {
        console.log('Processing file:', file.name);

        // Relaxed check - allow uppercase CSV or standard
        if (!file.name.toLowerCase().endsWith('.csv')) {
            console.error('Invalid file type');
            this.showMessage('Please select a valid .csv file.', 'error');
            return;
        }

        if (file.size > 50 * 1024 * 1024) { // 50MB limit
            this.showMessage('File size must be under 50MB.', 'error');
            return;
        }

        this.uploadedFile = file;
        this.showFileInfo(file);

        // Start the upload flow
        try {
            await this.uploadFile(file);
        } catch (error) {
            console.error('Upload failed:', error);
            this.showMessage('Failed to upload file: ' + error.message, 'error');
        }
    }

    showFileInfo(file) {
        const fileInfo = document.getElementById('csvFileInfo');
        const fileDetails = document.getElementById('csvFileDetails');

        if (fileDetails) {
            fileDetails.innerHTML = `<strong>${file.name}</strong> (${this.formatFileSize(file.size)})`;
        }

        if (fileInfo) {
            fileInfo.style.display = 'block';
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async uploadFile(file) {
        console.log('Uploading file to server...');
        this.showMessage('Uploading CSV file...', 'success');

        const formData = new FormData();
        formData.append('csvFile', file);

        try {
            const response = await fetch(`${this.apiBase}/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Server Error: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                // SAVE DATA FOR NEXT STEP
                this.csvData = {
                    fileInfo: result.data.fileInfo,
                    headers: result.data.headers,
                    preview: result.data.preview
                };

                // Auto-progress to mapping
                this.renderMappingUI();
                this.goToStep(2);
                this.showMessage('File uploaded. Please map columns.', 'success');
            } else {
                throw new Error(result.message || 'Upload failed');
            }

        } catch (error) {
            console.error('Upload error:', error);
            this.goToStep(1); // Go back to start on error
            this.showMessage('Upload failed: ' + error.message, 'error');
        }
    }

    renderMappingUI() {
        const container = document.getElementById('csvMappingControls');
        if (!container || !this.csvData) return;

        // Standard CRM Fields
        const crmFields = [
            { value: 'business_name', label: 'Business Name (Required)' },
            { value: 'first_name', label: 'First Name' },
            { value: 'last_name', label: 'Last Name' },
            { value: 'email', label: 'Email' },
            { value: 'phone', label: 'Phone (Required)' },
            { value: 'state', label: 'State' },
            { value: 'monthly_revenue', label: 'Monthly Revenue' },
            { value: 'industry', label: 'Industry' }
        ];

        let html = `
            <div class="mapping-grid" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 10px; font-weight: bold;">
                <div>CSV Header</div>
                <div>Preview Data</div>
                <div>CRM Field</div>
            </div>
            <div class="mapping-rows" style="max-height: 300px; overflow-y: auto;">
        `;

        this.csvData.headers.forEach((header, index) => {
            // Try to auto-guess the mapping based on name
            const cleanHeader = header.toLowerCase().replace(/_/g, '').trim();
            let selectedField = '';

            if (cleanHeader.includes('phone')) selectedField = 'phone';
            else if (cleanHeader.includes('email')) selectedField = 'email';
            else if (cleanHeader.includes('business') || cleanHeader.includes('company')) selectedField = 'business_name';
            else if (cleanHeader.includes('first')) selectedField = 'first_name';
            else if (cleanHeader.includes('last')) selectedField = 'last_name';
            else if (cleanHeader.includes('state')) selectedField = 'state';

            const previewVal = (this.csvData.preview[0] && this.csvData.preview[0][index]) || '-';

            html += `
                <div class="mapping-row" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 8px; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 8px;">
                    <div style="font-weight: 500;">${header}</div>
                    <div style="color: #666; font-size: 0.9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${previewVal}</div>
                    <div>
                        <select class="map-select form-input" data-csv-header="${header}" style="width: 100%;">
                            <option value="">-- Ignore --</option>
                            ${crmFields.map(f => `<option value="${f.value}" ${f.value === selectedField ? 'selected' : ''}>${f.label}</option>`).join('')}
                        </select>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        container.innerHTML = html;
    }

    async validateMapping() {
        // 1. SCRAPE SELECTIONS
        this.columnMapping = {};
        document.querySelectorAll('.map-select').forEach(select => {
            if (select.value) {
                // Key = CSV Header Name, Value = DB Field Name
                this.columnMapping[select.dataset.csvHeader] = select.value;
            }
        });

        // 2. Validate at least required fields
        const values = Object.values(this.columnMapping);
        if (!values.includes('business_name') && !values.includes('phone')) {
            this.showMessage('You must map at least Business Name or Phone.', 'error');
            return;
        }

        try {
            const response = await fetch(`${this.apiBase}/mapping`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: this.csvData.fileInfo.filename,
                    columnMapping: this.columnMapping,
                    importSettings: {
                        skipErrors: false,
                        allowDuplicates: false
                    }
                })
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.message);
            }

            this.validationResults = result.data.validation;
            this.displayValidationResults();
            this.goToStep(3);

            if (result.data.isStandardFormat) {
                this.showMessage('Standard 23-column format detected - all columns auto-mapped!', 'success');
            }

        } catch (error) {
            this.showMessage('Validation failed: ' + error.message, 'error');
        }
    }

    displayValidationResults() {
        const validationResults = document.getElementById('csvValidationResults');
        if (!validationResults || !this.validationResults) return;

        validationResults.innerHTML = '';

        // Summary
        const summary = document.createElement('div');
        summary.style.cssText = 'padding: 16px; background: #ecfdf5; border: 1px solid #10b981; border-radius: 6px; margin-bottom: 12px;';
        summary.innerHTML = `
            <h4 style="margin: 0 0 8px 0; color: #065f46;">Validation Summary</h4>
            <p style="margin: 4px 0; color: #065f46; font-size: 13px;">Total rows checked: ${this.validationResults.totalRowsChecked}</p>
            <p style="margin: 4px 0; color: #065f46; font-size: 13px;">Validation errors: ${this.validationResults.errors.length}</p>
            <p style="margin: 4px 0; color: #065f46; font-size: 13px;">Duplicate records found: ${this.validationResults.duplicates.length}</p>
        `;
        validationResults.appendChild(summary);

        // No issues
        if (!this.validationResults.hasErrors && !this.validationResults.hasDuplicates) {
            const successItem = document.createElement('div');
            successItem.style.cssText = 'padding: 16px; background: #ecfdf5; border: 1px solid #10b981; border-radius: 6px;';
            successItem.innerHTML = '<h4 style="margin: 0 0 4px 0; color: #065f46;">All data looks good!</h4><p style="margin: 0; color: #065f46; font-size: 13px;">No validation errors or duplicates found.</p>';
            validationResults.appendChild(successItem);
        }
    }

    async startImport() {
        try {
            if (this.currentStep !== 4) {
                this.goToStep(4);
            }

            const columnMapping = this.csvData?.columnMapping?.mapping || this.columnMapping;

            const response = await fetch(`${this.apiBase}/import`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: this.csvData.fileInfo.filename,
                    originalFilename: this.csvData.fileInfo.originalName,
                    columnMapping: columnMapping,
                    importSettings: {
                        skipErrors: this.validationResults ? this.validationResults.hasErrors : false,
                        allowDuplicates: this.validationResults ? this.validationResults.hasDuplicates : true
                    }
                })
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.message);
            }

            this.importId = result.data.importId;
            this.monitorImportProgress();

        } catch (error) {
            this.showMessage('Failed to start import: ' + error.message, 'error');
        }
    }

    async monitorImportProgress() {
        const checkStatus = async () => {
            try {
                const response = await fetch(`${this.apiBase}/status/${this.importId}`);
                const result = await response.json();

                if (result.success) {
                    const status = result.data;
                    this.updateImportProgress(status);

                    if (status.status === 'completed' || status.status === 'failed') {
                        this.importCompleted(status);
                        return;
                    }
                }

                setTimeout(checkStatus, 2000);

            } catch (error) {
                console.error('Error monitoring import:', error);
                setTimeout(checkStatus, 5000);
            }
        };

        checkStatus();
    }

    updateImportProgress(status) {
        const progressFill = document.getElementById('csvProgressFill');
        const importStatus = document.getElementById('csvImportStatus');

        if (progressFill) {
            progressFill.style.width = `${status.progress}%`;
        }

        if (importStatus) {
            importStatus.innerHTML = `
                <div style="text-align: center; padding: 16px;">
                    <h4 style="margin: 0 0 12px 0; color: #111827;">Import Status: ${status.status.toUpperCase()}</h4>
                    <p style="margin: 4px 0; color: #6b7280; font-size: 13px;">Progress: ${status.processedRows} / ${status.totalRows} rows (${status.progress}%)</p>
                    <p style="margin: 4px 0; color: #6b7280; font-size: 13px;">Successful: ${status.successfulRows} | Failed: ${status.failedRows}</p>
                    ${status.errorCount > 0 ? `<p style="margin: 4px 0; color: #ef4444; font-size: 13px;">Errors: ${status.errorCount}</p>` : ''}
                </div>
            `;
        }
    }

    importCompleted(status) {
        const importStatus = document.getElementById('csvImportStatus');

        // Auto-refresh conversation list immediately
        if (typeof window.loadConversations === 'function') {
            console.log('Auto-refreshing conversation list...');
            window.loadConversations();
        }

        if (importStatus) {
            if (status.status === 'completed') {
                importStatus.innerHTML = `
                    <div class="import-success-card">
                        <div class="success-icon">✓</div>
                        <h4>Import Complete!</h4>
                        <p>Successfully imported <strong>${status.successfulRows}</strong> / ${status.totalRows} leads.</p>
                        ${status.failedRows > 0 ? `<p class="error-text">Failed rows: ${status.failedRows}</p>` : ''}
                        <div style="margin-top: 15px;">
                            <button class="btn btn-primary" onclick="window.csvImportModalManager.closeModal()">Done</button>
                        </div>
                    </div>
                `;
            } else {
                importStatus.innerHTML = `
                    <div class="import-error-card">
                        <div class="error-icon">✕</div>
                        <h4>Import Failed</h4>
                        <p>The process stopped unexpectedly.</p>
                    </div>
                `;
            }
        }

        // Hide view results button since we show Done button above
        const viewResultsBtn = document.getElementById('csvViewResultsBtn');
        if (viewResultsBtn) viewResultsBtn.style.display = 'none';
    }

    viewResults() {
        // Close modal and refresh conversation list
        this.closeModal();

        // Refresh conversations if the function exists
        if (typeof window.loadConversations === 'function') {
            window.loadConversations();
        }
    }

    goToStep(step) {
        // Simple visibility toggler
        ['csvUploadSection', 'csvMappingSection', 'csvValidationSection', 'csvImportSection'].forEach((id, index) => {
            const el = document.getElementById(id);
            if (el) el.style.display = (index + 1 === step) ? 'block' : 'none';
        });
        this.currentStep = step;
        this.updateStepDisplay();
    }

    updateStepDisplay() {
        for (let i = 1; i <= 4; i++) {
            const stepElement = document.getElementById(`csvStep${i}`);
            if (!stepElement) continue;

            const stepNumber = stepElement.querySelector('div');
            const stepText = stepElement.querySelector('div:nth-child(2)');

            if (i === this.currentStep) {
                // Active step
                stepElement.style.borderColor = '#3b82f6';
                stepElement.style.background = '#eff6ff';
                stepElement.style.opacity = '1';
                stepElement.style.fontWeight = 'bold';
                if (stepNumber) {
                    stepNumber.style.background = '#3b82f6';
                    stepNumber.style.color = 'white';
                }
                if (stepText) {
                    stepText.style.color = '#1e40af';
                }
            } else if (i < this.currentStep) {
                // Completed step
                stepElement.style.borderColor = '#10b981';
                stepElement.style.background = '#ecfdf5';
                stepElement.style.opacity = '1';
                stepElement.style.fontWeight = 'normal';
                if (stepNumber) {
                    stepNumber.style.background = '#10b981';
                    stepNumber.style.color = 'white';
                }
                if (stepText) {
                    stepText.style.color = '#065f46';
                }
            } else {
                // Future step
                stepElement.style.borderColor = 'transparent';
                stepElement.style.background = '#f9fafb';
                stepElement.style.opacity = '0.5';
                stepElement.style.fontWeight = 'normal';
                if (stepNumber) {
                    stepNumber.style.background = '#9ca3af';
                    stepNumber.style.color = 'white';
                }
                if (stepText) {
                    stepText.style.color = '#6b7280';
                }
            }
        }
    }

    showMessage(message, type) {
        const statusMessages = document.getElementById('csvStatusMessages');
        if (!statusMessages) {
            console.error('Missing #csvStatusMessages in HTML! Message was:', message);
            return;
        }

        statusMessages.innerHTML = `
            <div style="padding: 10px; margin-bottom: 10px; border-radius: 4px;
                 background: ${type === 'error' ? '#fee2e2' : '#dcfce7'};
                 color: ${type === 'error' ? '#991b1b' : '#166534'};">
                ${message}
            </div>
        `;
    }
}

// Global instance
window.csvImportModalManager = null;

// Initialize and open modal
function openCsvImportModal() {
    if (!window.csvImportModalManager) {
        window.csvImportModalManager = new CSVImportModalManager();
    }
    window.csvImportModalManager.openModal();
}
