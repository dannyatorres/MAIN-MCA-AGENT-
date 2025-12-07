// frontend/js/csv-import-modal.js

class CSVImportModalManager {
    constructor() {
        this.currentStep = 1;
        this.uploadedFile = null;
        this.csvData = null;
        this.columnMapping = {};
        this.validationResults = null;
        this.importId = null;
        this.apiBase = '/api/csv-import';

        // State tracking
        this.modal = document.getElementById('csvImportModal');
        this.listenersAttached = false; // Prevents duplicate triggers

        this.init();
    }

    init() {
        // Try to attach listeners immediately
        if (this.modal && !this.listenersAttached) {
            this.initializeEventListeners();
        }
    }

    openModal() {
        this.modal = document.getElementById('csvImportModal');
        if (this.modal) {
            this.modal.classList.remove('hidden');
            this.modal.style.display = 'flex';

            // Double check listeners are attached
            if (!this.listenersAttached) {
                this.initializeEventListeners();
            }

            this.resetModal();
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

        // Reset file input
        const fileInput = document.getElementById('csvFileInput');
        if (fileInput) fileInput.value = '';

        // Hide file info
        const fileInfo = document.getElementById('csvFileInfo');
        if (fileInfo) fileInfo.style.display = 'none';

        // Clear status messages
        const statusMessages = document.getElementById('csvStatusMessages');
        if (statusMessages) statusMessages.innerHTML = '';

        this.goToStep(1);
    }

    initializeEventListeners() {
        console.log('Initializing CSV Modal Listeners...');

        const uploadArea = document.getElementById('csvUploadArea');
        const fileInput = document.getElementById('csvFileInput');
        const selectFileBtn = document.getElementById('csvSelectFileBtn');

        // 1. Drag and Drop Logic
        if (uploadArea) {
            // Prevent default behavior for all drag events
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                uploadArea.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }, false);
            });

            // Visual feedback
            uploadArea.addEventListener('dragover', () => {
                uploadArea.style.borderColor = '#3b82f6';
                uploadArea.style.background = 'rgba(59, 130, 246, 0.05)';
            });

            uploadArea.addEventListener('dragleave', () => {
                uploadArea.style.borderColor = '#d1d5db';
                uploadArea.style.background = 'transparent';
            });

            // Drop Handler
            uploadArea.addEventListener('drop', (e) => {
                uploadArea.style.borderColor = '#d1d5db';
                uploadArea.style.background = 'transparent';

                const files = e.dataTransfer.files;
                console.log('File Dropped:', files);

                if (files.length > 0) {
                    this.handleFileSelect(files[0]);
                }
            });

            // Click to upload
            uploadArea.addEventListener('click', () => fileInput?.click());
        }

        // 2. Button Handlers
        if (selectFileBtn) {
            selectFileBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                fileInput?.click();
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleFileSelect(e.target.files[0]);
                }
            });
        }

        // 3. Navigation Buttons
        document.getElementById('csvBackToUploadBtn')?.addEventListener('click', () => this.goToStep(1));
        document.getElementById('csvValidateMappingBtn')?.addEventListener('click', () => this.validateMapping());
        document.getElementById('closeCsvImportModal')?.addEventListener('click', () => this.closeModal());

        // Mark as attached so we don't do this again
        this.listenersAttached = true;
    }

    async handleFileSelect(file) {
        console.log('Processing file:', file.name);

        if (!file.name.toLowerCase().endsWith('.csv')) {
            this.showMessage('Please select a valid .csv file.', 'error');
            return;
        }

        this.uploadedFile = file;
        this.showFileInfo(file);

        // Immediately start upload
        await this.uploadFile(file);
    }

    async uploadFile(file) {
        console.log('Uploading file to server...');
        this.goToStep(2);
        this.showMessage('Uploading file...', 'success');

        const formData = new FormData();
        formData.append('csvFile', file);

        try {
            const response = await fetch(`${this.apiBase}/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error(`Server Error: ${response.status}`);

            const result = await response.json();
            console.log('Upload response:', result);

            // Normalize the response data (handling different server formats)
            this.csvData = {
                fileInfo: result.data || result.fileInfo || result,
                filename: (result.data && result.data.filename) ? result.data.filename : result.filename
            };

            // If the server returns mapping headers, save them
            if (result.headers || (result.data && result.data.headers)) {
                this.csvData.headers = result.headers || result.data.headers;
            }

            this.showMessage('File uploaded! Preparing validation...', 'success');

            // Auto-advance to next step
            setTimeout(() => this.validateMapping(), 500);

        } catch (error) {
            console.error('Upload Failed:', error);
            this.showMessage(`Upload failed: ${error.message}`, 'error');
            // Allow retry
            setTimeout(() => this.goToStep(1), 2000);
        }
    }

    async validateMapping() {
        console.log('Validating...');
        if (!this.csvData) {
            this.showMessage('Error: No file data found. Please upload again.', 'error');
            return;
        }

        this.goToStep(3);
        this.showMessage('Validating data...', 'success');

        try {
            // We are using "auto-mapping" logic here by sending empty mapping
            // or the server's default behavior
            const response = await fetch(`${this.apiBase}/mapping`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: this.csvData.filename,
                    columnMapping: {}, // Send empty to trigger auto-map
                    importSettings: { skipErrors: false }
                })
            });

            const result = await response.json();

            if (!result.success) throw new Error(result.message || 'Validation failed');

            this.validationResults = result.data.validation || result.data;

            // If validation is good, go straight to import
            console.log('Validation complete, starting import...');
            this.startImport();

        } catch (error) {
            console.error('Validation Error:', error);
            this.showMessage('Validation failed: ' + error.message, 'error');
        }
    }

    async startImport() {
        this.goToStep(4);
        this.showMessage('Importing leads...', 'success');

        try {
             const response = await fetch(`${this.apiBase}/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: this.csvData.filename,
                    columnMapping: {}, // Use defaults
                    importSettings: { allowDuplicates: true }
                })
            });

            const result = await response.json();

            if (result.success) {
                // Determine counts
                const successCount = result.imported || result.count || (result.data ? result.data.imported : 0);

                this.importCompleted({
                    status: 'completed',
                    successfulRows: successCount,
                    totalRows: 'Unknown',
                    failedRows: 0
                });

                this.showMessage('Import Completed Successfully!', 'success');
            } else {
                throw new Error(result.message || 'Import failed');
            }

        } catch(error) {
            console.error('Import Error:', error);
            this.showMessage('Import error: ' + error.message, 'error');
        }
    }

    importCompleted(status) {
        const importStatus = document.getElementById('csvImportStatus');

        // Refresh the main app list
        if (typeof window.loadConversations === 'function') {
            window.loadConversations();
        }

        if (importStatus) {
            importStatus.innerHTML = `
                <div class="import-success-card" style="text-align:center; padding:20px;">
                    <div style="font-size: 40px; color: #10b981;">✓</div>
                    <h3>Import Complete!</h3>
                    <p>Successfully processed <strong>${status.successfulRows}</strong> leads.</p>
                    <button class="btn btn-primary" onclick="window.csvImportModalManager.closeModal()" style="margin-top:15px;">Done</button>
                </div>
            `;
        }
    }

    // UTILITIES
    showMessage(message, type) {
        const statusMessages = document.getElementById('csvStatusMessages');
        if (!statusMessages) {
            // Fallback if HTML is missing - helps debugging
            console.warn('UI Missing #csvStatusMessages. Message:', message);
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

    goToStep(step) {
        ['csvUploadSection', 'csvMappingSection', 'csvValidationSection', 'csvImportSection'].forEach((id, index) => {
            const el = document.getElementById(id);
            if(el) el.style.display = (index + 1 === step) ? 'block' : 'none';
        });
        this.currentStep = step;
        this.updateStepDisplay();
    }

    updateStepDisplay() {
        for (let i = 1; i <= 4; i++) {
            const stepEl = document.getElementById(`csvStep${i}`);
            if(stepEl) {
                stepEl.style.opacity = (i === this.currentStep) ? '1' : '0.5';
                stepEl.style.fontWeight = (i === this.currentStep) ? 'bold' : 'normal';
            }
        }
    }

    showFileInfo(file) {
        const fileInfo = document.getElementById('csvFileInfo');
        const fileDetails = document.getElementById('csvFileDetails');
        if (fileInfo && fileDetails) {
            fileInfo.style.display = 'block';
            fileDetails.innerHTML = `<strong>${file.name}</strong> (${(file.size/1024).toFixed(1)} KB)`;
        }
    }
}

// Global Initialization
window.csvImportModalManager = null;
function openCsvImportModal() {
    if (!window.csvImportModalManager) {
        window.csvImportModalManager = new CSVImportModalManager();
    }
    window.csvImportModalManager.openModal();
}
