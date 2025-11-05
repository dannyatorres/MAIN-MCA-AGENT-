// CSV Import Frontend Handler
class CSVImportManager {
    constructor() {
        console.log('🔥 DEBUG: CSVImportManager constructor called');
        this.currentStep = 1;
        this.uploadedFile = null;
        this.csvData = null;
        this.columnMapping = {};
        this.validationResults = null;
        this.importId = null;

        this.apiBase = 'http://localhost:3001/api/csv-import';
        console.log('🔥 DEBUG: API base set to:', this.apiBase);
        
        console.log('🔥 DEBUG: About to initialize event listeners...');
        this.initializeEventListeners();
        console.log('🔥 DEBUG: About to update step display...');
        this.updateStepDisplay();
        console.log('🔥 DEBUG: CSVImportManager constructor completed');
    }

    initializeEventListeners() {
        // File upload events
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const selectFileBtn = document.getElementById('selectFileBtn');

        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileSelect(files[0]);
            }
        });

        // Click to upload
        uploadArea.addEventListener('click', () => {
            console.log('🖱️ Upload area clicked - opening file picker');
            fileInput.click();
        });

        selectFileBtn.addEventListener('click', (e) => {
            console.log('🖱️ Select file button clicked - opening file picker');
            e.stopPropagation();
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            console.log('🔥 DEBUG: File input change event triggered');
            console.log('📁 File input changed, files:', e.target.files);
            console.log('🔥 DEBUG: Files length:', e.target.files.length);
            if (e.target.files.length > 0) {
                console.log('📁 File selected from input, calling handleFileSelect');
                console.log('🔥 DEBUG: About to call handleFileSelect with:', e.target.files[0]);
                this.handleFileSelect(e.target.files[0]);
            } else {
                console.log('📁 No files selected in file input');
            }
        });

        // Navigation buttons
        document.getElementById('backToUploadBtn').addEventListener('click', () => this.goToStep(1));
        document.getElementById('validateMappingBtn').addEventListener('click', () => this.validateMapping());
        document.getElementById('backToMappingBtn').addEventListener('click', () => this.goToStep(2));
        document.getElementById('proceedToImportBtn').addEventListener('click', () => this.startImport());
        document.getElementById('backToValidationBtn').addEventListener('click', () => this.goToStep(3));
        document.getElementById('viewResultsBtn').addEventListener('click', () => this.viewResults());
    }

    async handleFileSelect(file) {
        console.log('🔥 DEBUG: handleFileSelect called with file:', file);
        console.log('📁 File selected:', file);
        console.log('📁 File name:', file.name);
        console.log('📁 File size:', file.size);
        console.log('📁 File type:', file.type);
        console.log('🔥 DEBUG: About to validate file...');
        
        if (!file.name.toLowerCase().endsWith('.csv')) {
            console.error('❌ Invalid file type - not a CSV file');
            this.showMessage('Please select a CSV file.', 'error');
            return;
        }

        if (file.size > 50 * 1024 * 1024) { // 50MB limit
            console.error('❌ File too large:', file.size);
            this.showMessage('File size must be under 50MB.', 'error');
            return;
        }

        console.log('✅ File validation passed, starting upload process...');
        this.uploadedFile = file;
        this.showFileInfo(file);
        
        try {
            console.log('🚀 Calling uploadFile method...');
            await this.uploadFile(file);
            console.log('✅ Upload successful');
            
            console.log('✅ Upload and import process completed');
        } catch (error) {
            console.error('❌ Upload failed:', error);
            this.showMessage('Failed to upload file: ' + error.message, 'error');
        }
    }

    showFileInfo(file) {
        const fileInfo = document.getElementById('fileInfo');
        const fileDetails = document.getElementById('fileDetails');
        
        fileDetails.innerHTML = `
            <p><strong>Name:</strong> ${file.name}</p>
            <p><strong>Size:</strong> ${this.formatFileSize(file.size)}</p>
            <p><strong>Type:</strong> ${file.type || 'text/csv'}</p>
            <p><strong>Last Modified:</strong> ${new Date(file.lastModified).toLocaleString()}</p>
        `;
        
        fileInfo.classList.remove('hidden');
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async uploadFile(file) {
        console.log('🔥 DEBUG: uploadFile called');
        console.log('📤 Starting file upload to:', `${this.apiBase}/upload`);
        
        const formData = new FormData();
        formData.append('csvFile', file);
        console.log('📤 FormData created with file:', file.name);

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

            console.log('📤 Making fetch request...');
            const response = await fetch(`${this.apiBase}/upload`, {
                method: 'POST',
                body: formData
            });

            console.log('📤 Response status:', response.status);
            
            if (!response.ok) {
                console.error('❌ HTTP error:', response.status, response.statusText);
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('📤 Response data:', result);
            
            if (!result.success) {
                console.error('❌ Server reported failure:', result.errors);
                
                // Show import completed with results
                const importStatus = document.getElementById('importStatus');
                importStatus.innerHTML = `
                    <div class="status-message ${result.imported > 0 ? 'success' : 'error'}">
                        <h4>${result.imported > 0 ? '✓ Import Completed!' : '✗ Import Had Issues'}</h4>
                        <p>Successfully imported: ${result.imported} out of ${result.total} leads</p>
                        ${result.errors && result.errors.length > 0 ? `
                            <details>
                                <summary>Import Errors (${result.errors.length})</summary>
                                <ul>
                                    ${result.errors.slice(0, 10).map(error => `<li>${error}</li>`).join('')}
                                    ${result.errors.length > 10 ? `<li>... and ${result.errors.length - 10} more errors</li>` : ''}
                                </ul>
                            </details>
                        ` : ''}
                    </div>
                `;
                
                // Show view results button
                document.getElementById('viewResultsBtn').classList.remove('hidden');
                
                this.showMessage(`Import completed: ${result.imported}/${result.total} leads imported successfully`, 'success');
                return;
            }

            console.log('✅ Upload and import successful!');
            
            // Show import completed successfully
            const importStatus = document.getElementById('importStatus');
            importStatus.innerHTML = `
                <div class="status-message success">
                    <h4>✓ Import Completed Successfully!</h4>
                    <p>Successfully imported ${result.imported} out of ${result.total} leads.</p>
                    ${result.errors && result.errors.length > 0 ? `<p>Import had ${result.errors.length} errors that were skipped.</p>` : ''}
                </div>
            `;
            
            // Update progress bar to 100%
            const progressFill = document.getElementById('progressFill');
            progressFill.style.width = '100%';
            
            // Show view results button
            document.getElementById('viewResultsBtn').classList.remove('hidden');
            
            this.showMessage('CSV import completed successfully!', 'success');
            
        } catch (error) {
            console.error('❌ Upload error details:', error);
            
            // Show error in import status
            const importStatus = document.getElementById('importStatus');
            importStatus.innerHTML = `
                <div class="status-message error">
                    <h4>✗ Import Failed</h4>
                    <p>Error: ${error.message}</p>
                </div>
            `;
            
            this.showMessage('Import failed: ' + error.message, 'error');
        }
    }

    populatePreviewTable() {
        const previewHeader = document.getElementById('previewHeader');
        const previewBody = document.getElementById('previewBody');

        // Clear existing content
        previewHeader.innerHTML = '';
        previewBody.innerHTML = '';

        if (!this.csvData || !this.csvData.preview) return;

        // Create header row
        const headerRow = document.createElement('tr');
        this.csvData.preview.headers.forEach(header => {
            const th = document.createElement('th');
            th.textContent = header;
            headerRow.appendChild(th);
        });
        previewHeader.appendChild(headerRow);

        // Create preview rows (first 5 rows)
        const previewRows = this.csvData.preview.rows.slice(0, 5);
        previewRows.forEach(row => {
            const tr = document.createElement('tr');
            this.csvData.preview.headers.forEach(header => {
                const td = document.createElement('td');
                td.textContent = row[header] || '';
                tr.appendChild(td);
            });
            previewBody.appendChild(tr);
        });
    }

    populateColumnMapping() {
        const mappingControls = document.getElementById('mappingControls');
        mappingControls.innerHTML = '';

        if (!this.csvData || !this.csvData.preview) return;

        // Define available database fields
        const databaseFields = {
            '': 'Skip this column',
            'first_name': 'First Name',
            'last_name': 'Last Name', 
            'lead_phone': 'Phone Number (Primary)',
            'cell_phone': 'Cell Phone',
            'business_name': 'Company Name',
            'email': 'Email',
            'lead_source': 'Lead Source',
            'address': 'Address',
            'city': 'City',
            'state': 'State',
            'zip': 'ZIP Code',
            'business_type': 'Business Type',
            'annual_revenue': 'Annual Revenue',
            'funding_amount': 'Funding Amount',
            'factor_rate': 'Factor Rate',
            'funding_date': 'Funding Date',
            'term': 'Term (Months)',
            'notes': 'Notes',
            'campaign': 'Campaign',
            'tax_id': 'Tax ID (Encrypted)',
            'ssn': 'SSN (Encrypted)',
            'business_start_date': 'Business Start Date',
            'date_of_birth': 'Date of Birth'
        };

        // Create mapping control for each CSV column
        this.csvData.preview.headers.forEach(csvColumn => {
            const mappingItem = document.createElement('div');
            mappingItem.className = 'mapping-item';

            const label = document.createElement('label');
            label.textContent = `CSV Column: "${csvColumn}"`;
            
            const select = document.createElement('select');
            select.className = 'mapping-select';
            select.dataset.csvColumn = csvColumn;

            // Populate options
            Object.entries(databaseFields).forEach(([value, label]) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                option.selected = this.columnMapping[csvColumn] === value;
                select.appendChild(option);
            });

            // Update mapping when changed
            select.addEventListener('change', (e) => {
                const csvColumn = e.target.dataset.csvColumn;
                const dbField = e.target.value;
                
                if (dbField) {
                    this.columnMapping[csvColumn] = dbField;
                } else {
                    delete this.columnMapping[csvColumn];
                }
            });

            mappingItem.appendChild(label);
            mappingItem.appendChild(select);
            mappingControls.appendChild(mappingItem);
        });
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
            
            // Show message if standard format was detected
            if (result.data.isStandardFormat) {
                this.showMessage('Standard 23-column format detected - all columns auto-mapped!', 'success');
            }

        } catch (error) {
            this.showMessage('Validation failed: ' + error.message, 'error');
        }
    }

    displayValidationResults() {
        const validationResults = document.getElementById('validationResults');
        validationResults.innerHTML = '';

        if (!this.validationResults) return;

        // Summary
        const summary = document.createElement('div');
        summary.className = 'validation-item success';
        summary.innerHTML = `
            <h4>Validation Summary</h4>
            <p>Total rows checked: ${this.validationResults.totalRowsChecked}</p>
            <p>Validation errors: ${this.validationResults.errors.length}</p>
            <p>Duplicate records found: ${this.validationResults.duplicates.length}</p>
        `;
        validationResults.appendChild(summary);

        // Errors
        if (this.validationResults.errors.length > 0) {
            const errorsSection = document.createElement('div');
            errorsSection.innerHTML = '<h4>Validation Errors</h4>';
            
            this.validationResults.errors.slice(0, 10).forEach(error => {
                const errorItem = document.createElement('div');
                errorItem.className = 'validation-item';
                errorItem.innerHTML = `
                    <h5>Row ${error.rowNumber}</h5>
                    <ul>
                        ${error.errors.map(err => `<li>${err}</li>`).join('')}
                        ${error.warnings.map(warn => `<li style="color: #ffa500;">${warn}</li>`).join('')}
                    </ul>
                `;
                errorsSection.appendChild(errorItem);
            });

            if (this.validationResults.errors.length > 10) {
                const moreErrors = document.createElement('p');
                moreErrors.textContent = `... and ${this.validationResults.errors.length - 10} more errors`;
                errorsSection.appendChild(moreErrors);
            }

            validationResults.appendChild(errorsSection);
        }

        // Duplicates
        if (this.validationResults.duplicates.length > 0) {
            const duplicatesSection = document.createElement('div');
            duplicatesSection.innerHTML = '<h4>Duplicate Records</h4>';
            
            this.validationResults.duplicates.slice(0, 10).forEach(duplicate => {
                const duplicateItem = document.createElement('div');
                duplicateItem.className = 'validation-item warning';
                duplicateItem.innerHTML = `
                    <h5>Row ${duplicate.rowNumber}</h5>
                    <p>Phone: ${duplicate.phoneNumber}</p>
                    <p>Matches existing record by ${duplicate.duplicateInfo.matchType}: ${duplicate.duplicateInfo.existing.business_name}</p>
                `;
                duplicatesSection.appendChild(duplicateItem);
            });

            if (this.validationResults.duplicates.length > 10) {
                const moreDuplicates = document.createElement('p');
                moreDuplicates.textContent = `... and ${this.validationResults.duplicates.length - 10} more duplicates`;
                duplicatesSection.appendChild(moreDuplicates);
            }

            validationResults.appendChild(duplicatesSection);
        }

        // No issues
        if (!this.validationResults.hasErrors && !this.validationResults.hasDuplicates) {
            const successItem = document.createElement('div');
            successItem.className = 'validation-item success';
            successItem.innerHTML = '<h4>✓ All data looks good!</h4><p>No validation errors or duplicates found.</p>';
            validationResults.appendChild(successItem);
        }
    }

    async startImport() {
        try {
            // If not already on step 4, go there
            if (this.currentStep !== 4) {
                this.goToStep(4);
            }

            // Use detected column mapping if available, otherwise use manual mapping
            const columnMapping = this.csvData.columnMapping && this.csvData.columnMapping.mapping 
                ? this.csvData.columnMapping.mapping 
                : this.columnMapping;

            console.log('🚀 Starting import with column mapping:', columnMapping);

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

                // Continue monitoring
                setTimeout(checkStatus, 2000);

            } catch (error) {
                console.error('Error monitoring import:', error);
                setTimeout(checkStatus, 5000); // Retry after 5 seconds
            }
        };

        checkStatus();
    }

    updateImportProgress(status) {
        const progressFill = document.getElementById('progressFill');
        const importStatus = document.getElementById('importStatus');

        progressFill.style.width = `${status.progress}%`;
        
        importStatus.innerHTML = `
            <h4>Import Status: ${status.status.toUpperCase()}</h4>
            <p>Progress: ${status.processedRows} / ${status.totalRows} rows (${status.progress}%)</p>
            <p>Successful: ${status.successfulRows} | Failed: ${status.failedRows}</p>
            ${status.errorCount > 0 ? `<p style="color: #ff6b6b;">Errors: ${status.errorCount}</p>` : ''}
        `;
    }

    importCompleted(status) {
        const importStatus = document.getElementById('importStatus');
        
        if (status.status === 'completed') {
            importStatus.innerHTML = `
                <div class="status-message success">
                    <h4>✓ Import Completed Successfully!</h4>
                    <p>Successfully imported ${status.successfulRows} out of ${status.totalRows} rows.</p>
                    ${status.failedRows > 0 ? `<p>Failed rows: ${status.failedRows}</p>` : ''}
                </div>
            `;
            this.showMessage('CSV import completed successfully!', 'success');
        } else {
            importStatus.innerHTML = `
                <div class="status-message error">
                    <h4>✗ Import Failed</h4>
                    <p>The import process encountered an error and could not be completed.</p>
                </div>
            `;
            this.showMessage('CSV import failed. Please check the logs.', 'error');
        }

        // Show view results button
        document.getElementById('viewResultsBtn').classList.remove('hidden');
    }

    viewResults() {
        // Redirect to the main dashboard to view imported conversations
        window.location.href = 'command-center.html';
    }

    goToStep(step) {
        // Hide all sections
        document.getElementById('uploadSection').classList.add('hidden');
        document.getElementById('mappingSection').classList.add('hidden');
        document.getElementById('validationSection').classList.add('hidden');
        document.getElementById('importSection').classList.add('hidden');

        // Show current section
        const sections = ['uploadSection', 'mappingSection', 'validationSection', 'importSection'];
        document.getElementById(sections[step - 1]).classList.remove('hidden');

        this.currentStep = step;
        this.updateStepDisplay();
    }

    updateStepDisplay() {
        for (let i = 1; i <= 4; i++) {
            const stepElement = document.getElementById(`step${i}`);
            stepElement.classList.remove('active', 'completed');

            if (i === this.currentStep) {
                stepElement.classList.add('active');
            } else if (i < this.currentStep) {
                stepElement.classList.add('completed');
            }
        }
        
        // For auto-import, mark steps 2 and 3 as completed when jumping to step 4
        if (this.currentStep === 4 && this.csvData && this.csvData.columnMapping && this.csvData.columnMapping.isStandardFormat) {
            document.getElementById('step2').classList.add('completed');
            document.getElementById('step3').classList.add('completed');
        }
    }

    showMessage(message, type) {
        const statusMessages = document.getElementById('statusMessages');
        
        const messageElement = document.createElement('div');
        messageElement.className = `status-message ${type}`;
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

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔥 DEBUG: DOM Content Loaded - initializing CSVImportManager');
    try {
        const csvManager = new CSVImportManager();
        console.log('🔥 DEBUG: CSVImportManager created successfully:', csvManager);
        window.csvManager = csvManager; // Make it globally available for debugging
    } catch (error) {
        console.error('🔥 DEBUG ERROR: Failed to create CSVImportManager:', error);
    }
});