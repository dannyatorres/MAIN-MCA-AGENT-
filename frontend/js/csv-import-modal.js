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
            // Remove hidden class to show the main modal container
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

        // Reset progress bar and status text
        const progressFill = document.getElementById('csvProgressFill');
        if (progressFill) progressFill.style.width = '0%';

        const importStatus = document.getElementById('csvImportStatus');
        if (importStatus) importStatus.innerHTML = 'Preparing...';

        // Show the first step
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

        // Auto-start upload immediately upon selection
        await this.uploadFile(file);
    }

    async uploadFile(file) {
        const formData = new FormData();
        formData.append('csvFile', file);

        try {
            // 1. Switch UI to Progress View
            this.goToStep(2);

            const importStatus = document.getElementById('csvImportStatus');
            const progressFill = document.getElementById('csvProgressFill');

            if(importStatus) importStatus.innerHTML = '<span style="color:#e6edf3">Uploading and Processing...</span>';
            if(progressFill) progressFill.style.width = '30%';

            // 2. Perform Backend Request
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

            // 3. REFRESH THE LEAD LIST (Critical Fix)
            if (typeof window.loadConversations === 'function') {
                console.log('Refreshing conversation list...');
                window.loadConversations();
            }

            // 4. SHOW SUCCESS CARD (Critical Fix)
            if (importStatus) {
                importStatus.innerHTML = `
                    <div class="import-success-card" style="text-align: center; margin-top: 20px; animation: scaleIn 0.3s ease;">
                        <div style="width: 50px; height: 50px; background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px auto;">
                            <span style="font-size: 24px; color: white; font-weight: bold;">✓</span>
                        </div>
                        <h4 style="color: #e6edf3; margin: 10px 0; font-size: 18px;">Import Complete!</h4>
                        <p style="color: #8b949e; margin-bottom: 20px;">Successfully imported <strong>${result.imported_count}</strong> leads.</p>
                        ${result.errors && result.errors.length > 0 ? `<p style="color: #ef4444; font-size: 12px; margin-bottom: 15px;">(${result.errors.length} skipped due to errors)</p>` : ''}

                        <div>
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
                    <div class="import-error-card" style="text-align: center; margin-top: 20px;">
                        <div style="width: 50px; height: 50px; background: #ef4444; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px auto;">
                            <span style="font-size: 24px; color: white; font-weight: bold;">✕</span>
                        </div>
                        <h4 style="color: #e6edf3; margin: 10px 0;">Import Failed</h4>
                        <p style="color: #ef4444;">${error.message}</p>
                        <button class="btn btn-secondary" onclick="window.csvImportModalManager.resetModal()" style="margin-top: 15px;">Try Again</button>
                    </div>
                `;
            }
        }
    }

    goToStep(step) {
        // IDs of all possible sections
        const sections = [
            'csvUploadSection',
            'csvMappingSection',
            'csvValidationSection',
            'csvImportSection'
        ];

        // 1. Force HIDE all sections first
        sections.forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                el.classList.add('hidden'); // Add utility class back
                el.style.display = 'none';
            }
        });

        // 2. Determine which one to show
        let targetId = '';
        if (step === 1) targetId = 'csvUploadSection';
        else targetId = 'csvImportSection'; // Skip intermediate steps

        // 3. Force SHOW the target section
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
            // CRITICAL: Remove the 'hidden' class because 07-utilities.css uses !important
            targetEl.classList.remove('hidden');
            targetEl.style.display = 'block';
        }

        this.currentStep = step;
    }
}

// Global instance setup
window.csvImportModalManager = null;

function openCsvImportModal() {
    if (!window.csvImportModalManager) {
        window.csvImportModalManager = new CSVImportModalManager();
    }
    window.csvImportModalManager.openModal();
}
