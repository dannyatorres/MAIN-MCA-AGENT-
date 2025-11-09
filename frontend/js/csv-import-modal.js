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
        this.modal = null;
    }

    openModal() {
        this.modal = document.getElementById('csvImportModal');
        if (this.modal) {
            this.modal.style.display = 'flex';
            this.resetModal();
            this.initializeEventListeners();
            this.updateStepDisplay();
        }
    }

    closeModal() {
        if (this.modal) {
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
        // File upload events
        const uploadArea = document.getElementById('csvUploadArea');
        const fileInput = document.getElementById('csvFileInput');
        const selectFileBtn = document.getElementById('csvSelectFileBtn');

        // Drag and drop
        uploadArea?.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#3b82f6';
            uploadArea.style.background = 'rgba(59, 130, 246, 0.05)';
        });

        uploadArea?.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#d1d5db';
            uploadArea.style.background = 'transparent';
        });

        uploadArea?.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#d1d5db';
            uploadArea.style.background = 'transparent';
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileSelect(files[0]);
            }
        });

        // Click to upload
        uploadArea?.addEventListener('click', () => {
            fileInput?.click();
        });

        selectFileBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput?.click();
        });

        fileInput?.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileSelect(e.target.files[0]);
            }
        });

        // Navigation buttons
        document.getElementById('csvBackToUploadBtn')?.addEventListener('click', () => this.goToStep(1));
        document.getElementById('csvValidateMappingBtn')?.addEventListener('click', () => this.validateMapping());
        document.getElementById('csvBackToMappingBtn')?.addEventListener('click', () => this.goToStep(2));
        document.getElementById('csvProceedToImportBtn')?.addEventListener('click', () => this.startImport());
        document.getElementById('csvViewResultsBtn')?.addEventListener('click', () => this.viewResults());

        // Close button
        document.getElementById('closeCsvImportModal')?.addEventListener('click', () => this.closeModal());
    }

    async handleFileSelect(file) {
        console.log('📁 File selected:', file.name);

        if (!file.name.toLowerCase().endsWith('.csv')) {
            this.showMessage('Please select a CSV file.', 'error');
            return;
        }

        if (file.size > 50 * 1024 * 1024) { // 50MB limit
            this.showMessage('File size must be under 50MB.', 'error');
            return;
        }

        this.uploadedFile = file;
        this.showFileInfo(file);

        try {
            await this.uploadFile(file);
        } catch (error) {
            console.error('❌ Upload failed:', error);
            this.showMessage('Failed to upload file: ' + error.message, 'error');
        }
    }

    showFileInfo(file) {
        const fileInfo = document.getElementById('csvFileInfo');
        const fileDetails = document.getElementById('csvFileDetails');

        if (fileDetails) {
            fileDetails.innerHTML = `
                <p style="margin: 4px 0; font-size: 13px; color: #374151;"><strong>Name:</strong> ${file.name}</p>
                <p style="margin: 4px 0; font-size: 13px; color: #374151;"><strong>Size:</strong> ${this.formatFileSize(file.size)}</p>
                <p style="margin: 4px 0; font-size: 13px; color: #374151;"><strong>Type:</strong> ${file.type || 'text/csv'}</p>
                <p style="margin: 4px 0; font-size: 13px; color: #374151;"><strong>Last Modified:</strong> ${new Date(file.lastModified).toLocaleString()}</p>
            `;
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
        console.log('📤 Starting file upload');

        const formData = new FormData();
        formData.append('csvFile', file);

        try {
            // Show progress immediately
            this.goToStep(2);
            this.showMessage('Uploading CSV file...', 'success');

            // Move to step 3 after a moment
            setTimeout(() => {
                this.goToStep(3);
                this.showMessage('Validating data...', 'success');
            }, 500);

            // Move to step 4 and start import
            setTimeout(() => {
                this.goToStep(4);
                this.showMessage('Importing data...', 'success');
            }, 1000);

            const response = await fetch(`${this.apiBase}/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            if (!result.success) {
                // Show import completed with results
                const importStatus = document.getElementById('csvImportStatus');
                if (importStatus) {
                    importStatus.innerHTML = `
                        <div style="padding: 16px; background: ${result.imported > 0 ? '#ecfdf5' : '#fef2f2'}; border: 1px solid ${result.imported > 0 ? '#10b981' : '#ef4444'}; border-radius: 6px; color: ${result.imported > 0 ? '#065f46' : '#991b1b'};">
                            <h4 style="margin: 0 0 8px 0;">${result.imported > 0 ? '✓ Import Completed!' : '✗ Import Had Issues'}</h4>
                            <p style="margin: 0;">Successfully imported: ${result.imported} out of ${result.total} leads</p>
                            ${result.errors && result.errors.length > 0 ? `
                                <details style="margin-top: 12px;">
                                    <summary style="cursor: pointer; font-weight: 600;">Import Errors (${result.errors.length})</summary>
                                    <ul style="margin: 8px 0 0 0; padding-left: 20px;">
                                        ${result.errors.slice(0, 10).map(error => `<li style="margin: 4px 0;">${error}</li>`).join('')}
                                        ${result.errors.length > 10 ? `<li>... and ${result.errors.length - 10} more errors</li>` : ''}
                                    </ul>
                                </details>
                            ` : ''}
                        </div>
                    `;
                }

                // Show view results button
                const viewResultsBtn = document.getElementById('csvViewResultsBtn');
                if (viewResultsBtn) {
                    viewResultsBtn.style.display = 'inline-flex';
                }

                this.showMessage(`Import completed: ${result.imported}/${result.total} leads imported successfully`, 'success');
                return;
            }

            console.log('✅ Upload and import successful!');

            // Show import completed successfully
            const importStatus = document.getElementById('csvImportStatus');
            if (importStatus) {
                importStatus.innerHTML = `
                    <div style="padding: 16px; background: #ecfdf5; border: 1px solid #10b981; border-radius: 6px; color: #065f46;">
                        <h4 style="margin: 0 0 8px 0;">✓ Import Completed Successfully!</h4>
                        <p style="margin: 0;">Successfully imported ${result.imported} out of ${result.total} leads.</p>
                        ${result.errors && result.errors.length > 0 ? `<p style="margin: 8px 0 0 0;">Import had ${result.errors.length} errors that were skipped.</p>` : ''}
                    </div>
                `;
            }

            // Update progress bar to 100%
            const progressFill = document.getElementById('csvProgressFill');
            if (progressFill) {
                progressFill.style.width = '100%';
            }

            // Show view results button
            const viewResultsBtn = document.getElementById('csvViewResultsBtn');
            if (viewResultsBtn) {
                viewResultsBtn.style.display = 'inline-flex';
            }

            this.showMessage('CSV import completed successfully!', 'success');

        } catch (error) {
            console.error('❌ Upload error:', error);

            // Show error in import status
            const importStatus = document.getElementById('csvImportStatus');
            if (importStatus) {
                importStatus.innerHTML = `
                    <div style="padding: 16px; background: #fef2f2; border: 1px solid #ef4444; border-radius: 6px; color: #991b1b;">
                        <h4 style="margin: 0 0 8px 0;">✗ Import Failed</h4>
                        <p style="margin: 0;">Error: ${error.message}</p>
                    </div>
                `;
            }

            this.showMessage('Import failed: ' + error.message, 'error');
        }
    }

    async validateMapping() {
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
            successItem.innerHTML = '<h4 style="margin: 0 0 4px 0; color: #065f46;">✓ All data looks good!</h4><p style="margin: 0; color: #065f46; font-size: 13px;">No validation errors or duplicates found.</p>';
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

        if (importStatus) {
            if (status.status === 'completed') {
                importStatus.innerHTML = `
                    <div style="padding: 16px; background: #ecfdf5; border: 1px solid #10b981; border-radius: 6px; color: #065f46;">
                        <h4 style="margin: 0 0 8px 0;">✓ Import Completed Successfully!</h4>
                        <p style="margin: 0;">Successfully imported ${status.successfulRows} out of ${status.totalRows} rows.</p>
                        ${status.failedRows > 0 ? `<p style="margin: 8px 0 0 0;">Failed rows: ${status.failedRows}</p>` : ''}
                    </div>
                `;
                this.showMessage('CSV import completed successfully!', 'success');
            } else {
                importStatus.innerHTML = `
                    <div style="padding: 16px; background: #fef2f2; border: 1px solid #ef4444; border-radius: 6px; color: #991b1b;">
                        <h4 style="margin: 0 0 8px 0;">✗ Import Failed</h4>
                        <p style="margin: 0;">The import process encountered an error and could not be completed.</p>
                    </div>
                `;
                this.showMessage('CSV import failed. Please check the logs.', 'error');
            }
        }

        // Show view results button
        const viewResultsBtn = document.getElementById('csvViewResultsBtn');
        if (viewResultsBtn) {
            viewResultsBtn.style.display = 'inline-flex';
        }
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
        // Hide all sections
        document.getElementById('csvUploadSection').style.display = 'none';
        document.getElementById('csvMappingSection').style.display = 'none';
        document.getElementById('csvValidationSection').style.display = 'none';
        document.getElementById('csvImportSection').style.display = 'none';

        // Show current section
        const sections = ['csvUploadSection', 'csvMappingSection', 'csvValidationSection', 'csvImportSection'];
        const currentSection = document.getElementById(sections[step - 1]);
        if (currentSection) {
            currentSection.style.display = 'block';
        }

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
        if (!statusMessages) return;

        const messageElement = document.createElement('div');
        messageElement.style.cssText = `
            padding: 12px 16px;
            border-radius: 6px;
            margin-bottom: 8px;
            font-size: 14px;
            ${type === 'success' ? 'background: #ecfdf5; border: 1px solid #10b981; color: #065f46;' : 'background: #fef2f2; border: 1px solid #ef4444; color: #991b1b;'}
        `;
        messageElement.textContent = message;

        statusMessages.appendChild(messageElement);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (messageElement.parentNode) {
                messageElement.parentNode.removeChild(messageElement);
            }
        }, 5000);
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
