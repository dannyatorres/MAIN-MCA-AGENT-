// CSV Import Modal Handler
class CSVImportModalManager {
    constructor() {
        this.currentStep = 1;
        this.uploadedFile = null;
        this.apiBase = '/api/csv-import';
        this.modal = null;
    }

    openModal() {
        this.modal = document.getElementById('csvImportModal');
        if (this.modal) {
            this.modal.classList.remove('hidden');
            this.modal.style.display = 'flex';
            this.resetModal();
            this.initializeEventListeners();
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

        // Reset file input
        const fileInput = document.getElementById('csvFileInput');
        if (fileInput) fileInput.value = '';

        // Hide file info
        const fileInfo = document.getElementById('csvFileInfo');
        if (fileInfo) fileInfo.style.display = 'none';

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

        // Drag and drop visual cues
        uploadArea?.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#3b82f6';
            uploadArea.style.background = 'rgba(59, 130, 246, 0.05)';
        });

        uploadArea?.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#d1d5db'; // Reset color
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
        uploadArea?.addEventListener('click', () => fileInput?.click());
        selectFileBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput?.click();
        });

        fileInput?.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileSelect(e.target.files[0]);
            }
        });

        // Close button
        document.getElementById('closeCsvImportModal')?.addEventListener('click', () => this.closeModal());
    }

    async handleFileSelect(file) {
        if (!file.name.toLowerCase().endsWith('.csv')) {
            alert('Please select a CSV file.');
            return;
        }

        this.uploadedFile = file;
        this.showFileInfo(file);

        // Auto-start upload
        await this.uploadFile(file);
    }

    showFileInfo(file) {
        const fileInfo = document.getElementById('csvFileInfo');
        const fileDetails = document.getElementById('csvFileDetails');

        if (fileDetails) {
            fileDetails.innerHTML = `
                <p><strong>Name:</strong> ${file.name}</p>
                <p><strong>Size:</strong> ${(file.size / 1024).toFixed(2)} KB</p>
            `;
        }
        if (fileInfo) fileInfo.style.display = 'block';
    }

    async uploadFile(file) {
        const formData = new FormData();
        formData.append('csvFile', file);

        try {
            // Visual fake steps to show activity
            this.goToStep(2); // Show "Importing..." screen immediately

            const importStatus = document.getElementById('csvImportStatus');
            const progressFill = document.getElementById('csvProgressFill');

            if(importStatus) importStatus.innerHTML = "Uploading and Processing...";
            if(progressFill) progressFill.style.width = '30%';

            // Actual API Call
            const response = await fetch(`${this.apiBase}/upload`, {
                method: 'POST',
                body: formData
            });

            if(progressFill) progressFill.style.width = '80%';

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.message || "Import failed on server");
            }

            // --- SUCCESS HANDLING ---
            if(progressFill) progressFill.style.width = '100%';

            // 1. REFRESH THE LIST (Crucial Step)
            if (typeof window.loadConversations === 'function') {
                console.log('Refreshing conversation list...');
                window.loadConversations();
            }

            // 2. SHOW SUCCESS UI (Crucial Step)
            if (importStatus) {
                importStatus.innerHTML = `
                    <div class="import-success-card" style="text-align: center; margin-top: 20px;">
                        <div class="success-icon" style="font-size: 40px; color: #10b981;">✓</div>
                        <h4 style="color: #e6edf3; margin: 10px 0;">Import Complete!</h4>
                        <p style="color: #8b949e;">Successfully imported <strong>${result.imported_count}</strong> leads.</p>
                        ${result.errors && result.errors.length > 0 ? `<p style="color: #ef4444; font-size: 12px;">(Skipped ${result.errors.length} rows due to errors)</p>` : ''}

                        <div style="margin-top: 20px;">
                            <button class="btn btn-primary" onclick="window.csvImportModalManager.closeModal()">Done</button>
                        </div>
                    </div>
                `;
            }

        } catch (error) {
            console.error('Upload error:', error);
            const importStatus = document.getElementById('csvImportStatus');
            if (importStatus) {
                importStatus.innerHTML = `
                    <div class="import-error-card" style="text-align: center; color: #ef4444;">
                        <div class="error-icon" style="font-size: 30px;">✕</div>
                        <h4>Import Failed</h4>
                        <p>${error.message}</p>
                        <button class="btn btn-secondary" onclick="window.csvImportModalManager.resetModal()" style="margin-top:10px;">Try Again</button>
                    </div>
                `;
            }
        }
    }

    goToStep(step) {
        // Simplified Logic:
        // Step 1: Upload UI
        // Step 2: "Processing" UI (we map this to your existing HTML structure)

        const uploadSection = document.getElementById('csvUploadSection');
        const importSection = document.getElementById('csvImportSection'); // This is the progress bar section

        if (step === 1) {
            if(uploadSection) uploadSection.style.display = 'block';
            if(importSection) importSection.style.display = 'none';
        } else {
            if(uploadSection) uploadSection.style.display = 'none';
            if(importSection) importSection.style.display = 'block';
        }

        this.currentStep = step;
    }
}

// Global instance
window.csvImportModalManager = null;

function openCsvImportModal() {
    if (!window.csvImportModalManager) {
        window.csvImportModalManager = new CSVImportModalManager();
    }
    window.csvImportModalManager.openModal();
}
