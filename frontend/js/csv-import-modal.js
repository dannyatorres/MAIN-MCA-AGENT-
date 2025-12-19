// CSV Import Modal Handler
class CSVImportModalManager {
    constructor() {
        this.currentStep = 1;
        this.uploadedFile = null;
        this.apiBase = '/api/csv-import';
        this.modal = null;
        this.eventsInitialized = false;
    }

    openModal() {
        this.modal = document.getElementById('csvImportModal');
        if (this.modal) {
            this.modal.classList.remove('hidden');
            this.modal.style.display = 'flex';
            this.initializeEventListeners();
            this.resetModal();
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

        const fileInput = document.getElementById('csvFileInput');
        if (fileInput) fileInput.value = '';

        const progressFill = document.getElementById('csvProgressFill');
        if (progressFill) progressFill.style.width = '0%';

        const importStatus = document.getElementById('csvImportStatus');
        if (importStatus) importStatus.innerHTML = 'Preparing...';

        this.goToStep(1);
    }

    initializeEventListeners() {
        if (this.eventsInitialized) return;

        const uploadArea = document.getElementById('csvUploadArea');
        const fileInput = document.getElementById('csvFileInput');
        const selectFileBtn = document.getElementById('csvSelectFileBtn');

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
            if (files.length > 0) this.handleFileSelect(files[0]);
        });

        uploadArea?.addEventListener('click', () => fileInput?.click());
        selectFileBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput?.click();
        });

        fileInput?.addEventListener('change', (e) => {
            if (e.target.files.length > 0) this.handleFileSelect(e.target.files[0]);
        });

        document.getElementById('closeCsvImportModal')?.addEventListener('click', () => this.closeModal());
        this.eventsInitialized = true;
    }

    async handleFileSelect(file) {
        if (!file.name.toLowerCase().endsWith('.csv')) {
            alert('Please select a CSV file.');
            return;
        }

        if (file.size > 50 * 1024 * 1024) {
            alert('File size must be under 50MB.');
            return;
        }

        // Start the transformation and upload process
        await this.transformAndUpload(file);
    }

    async transformAndUpload(file) {
        try {
            // 1. Switch UI to Progress View
            this.goToStep(2);
            this.updateStatus('Analyzing file format...', '30%');

            // 2. Read and Parse CSV
            const csvText = await this.readFileAsText(file);
            const { headers, data } = await processCSV(csvText);

            // 3. Detect Format
            const format = detectFormat(headers);
            console.log(`Detected format: ${format}`);

            let normalizedData;
            if (format === 'braintrust2') {
                normalizedData = normalizeDataFromBraintrust2(data);
                this.updateStatus('Processing TLO format...', '50%');
            } else if (format === 'braintrust') {
                normalizedData = normalizeDataFromBraintrust(data);
                this.updateStatus('Processing Braintrust format...', '50%');
            } else {
                // Handles both "Original" (Owner Name) and "Already Standard" (First Name/Last Name)
                normalizedData = normalizeDataFromOriginal(data);
                this.updateStatus('Processing Standard format...', '50%');
            }

            // 4. Create the final clean CSV string
            const cleanCSVContent = createCRMFile(normalizedData);

            // 5. Convert back to a File object
            const cleanFile = new File([cleanCSVContent], "crm_import_final.csv", { type: "text/csv" });
            this.uploadedFile = cleanFile;

            // 6. Upload to Server
            this.updateStatus('Uploading clean data...', '70%');
            await this.uploadFile(cleanFile);

        } catch (error) {
            console.error('Processing error:', error);
            this.showError(error.message);
        }
    }

    async readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error("Failed to read file"));
            reader.readAsText(file);
        });
    }

    updateStatus(msg, width) {
        const importStatus = document.getElementById('csvImportStatus');
        const progressFill = document.getElementById('csvProgressFill');
        if(importStatus) importStatus.innerHTML = `<span style="color:#e6edf3">${msg}</span>`;
        if(progressFill) progressFill.style.width = width;
    }

    async uploadFile(file) {
        const formData = new FormData();
        formData.append('csvFile', file);

        try {
            const response = await fetch(`${this.apiBase}/upload`, {
                method: 'POST',
                body: formData
            });

            this.updateStatus('Finalizing...', '90%');

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.message || "Import failed on server");
            }

            // SUCCESS
            const progressFill = document.getElementById('csvProgressFill');
            if(progressFill) progressFill.style.width = '100%';

            const importStatus = document.getElementById('csvImportStatus');
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
                            <button class="btn btn-primary" onclick="window.location.reload()">Done</button>
                        </div>
                    </div>
                `;
            }

        } catch (error) {
            this.showError(error.message);
        }
    }

    showError(msg) {
        const importStatus = document.getElementById('csvImportStatus');
        if (importStatus) {
            importStatus.innerHTML = `
                <div class="import-error-card" style="text-align: center; margin-top: 20px;">
                    <div style="width: 50px; height: 50px; background: #ef4444; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px auto;">
                        <span style="font-size: 24px; color: white; font-weight: bold;">✕</span>
                    </div>
                    <h4 style="color: #e6edf3; margin: 10px 0;">Import Failed</h4>
                    <p style="color: #ef4444;">${msg}</p>
                    <button class="btn btn-secondary" onclick="window.csvImportModalManager.resetModal()" style="margin-top: 15px;">Try Again</button>
                </div>
            `;
        }
    }

    goToStep(step) {
        const sections = ['csvUploadSection', 'csvMappingSection', 'csvValidationSection', 'csvImportSection'];
        sections.forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                el.classList.add('hidden');
                el.style.display = 'none';
            }
        });

        let targetId = step === 1 ? 'csvUploadSection' : 'csvImportSection';
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
            targetEl.classList.remove('hidden');
            targetEl.style.display = 'block';
        }
        this.currentStep = step;
    }
}

// --- HELPER FUNCTIONS & LOGIC ---

// Dynamically load PapaParse if needed
async function processCSV(csvText) {
    return new Promise((resolve) => {
        if (window.Papa) {
            parseWithPapa(csvText, resolve);
        } else {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.0/papaparse.min.js';
            script.onload = () => parseWithPapa(csvText, resolve);
            script.onerror = () => {
                console.warn('Papa Parse failed to load, using fallback parser');
                resolve(manualCSVParse(csvText));
            };
            document.head.appendChild(script);
        }
    });
}

function parseWithPapa(csvText, resolve) {
    const result = window.Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim()
    });
    resolve({ headers: result.meta.fields, data: result.data });
}

function manualCSVParse(csvText) {
    const lines = csvText.split(/\r?\n/);
    const headers = [];
    const data = [];
    if (lines.length > 0) headers.push(...lines[0].split(',').map(h => h.trim()));
    const expectedColumns = headers.length;
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = [];
        let current = '';
        let inQuotes = false;
        for (let j = 0; j < lines[i].length; j++) {
            const char = lines[i][j];
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
            else current += char;
        }
        values.push(current.trim());
        const row = {};
        headers.forEach((header, index) => row[header] = values[index] || '');
        data.push(row);
    }
    return { headers, data };
}

function detectFormat(headers) {
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim());

    // Check for Braintrust2 (TLO)
    const braintrust2Columns = ['tlo phone 1', 'tlo email 1', 'business name', 'turnover'];
    const braintrust2Matches = braintrust2Columns.filter(col => normalizedHeaders.includes(col)).length;
    if (braintrust2Matches >= 2) return 'braintrust2';

    // Check for Braintrust
    const braintrustColumns = ['firstname', 'lastname', 'phone1', 'company'];
    const braintrustMatches = braintrustColumns.filter(col => normalizedHeaders.includes(col)).length;
    if (braintrustMatches >= 2) return 'braintrust';

    // Check for Standard CRM (pass-through)
    const crmColumns = ['first name', 'last name', 'lead source', 'factor rate', 'taxid'];
    const crmMatches = crmColumns.filter(col => normalizedHeaders.includes(col)).length;
    if (crmMatches >= 3) return 'crm_import'; // Treat same as original/standard

    return 'original';
}

function normalizeDataFromBraintrust(data) {
    return data.filter(row => {
        const company = row['company'] || '';
        return !(!company || company.match(/^\w+\s+\d+,\s+\d{4}$/));
    }).map(row => {
        const rawPhone = row['phone1'] || row['phone2'] || row['phone3'] || '';
        const phone = formatPhoneNumber(rawPhone);
        let firstName = row['firstname'] || '';
        let lastName = row['lastname'] || '';
        if (firstName.includes(' ')) {
            const parts = firstName.trim().split(/\s+/);
            firstName = parts[0] || '';
            if (!lastName) lastName = parts.length > 1 ? parts[parts.length - 1] : '';
        }
        return createStandardRow(firstName, lastName, phone, row['company'], row['email'], row);
    });
}

function normalizeDataFromBraintrust2(data) {
    return data.filter(row => {
        const busName = row['Business Name'] || '';
        return !(!busName || busName.match(/^\w+\s+\d+,\s+\d{4}$/));
    }).map(row => {
        const phone = formatPhoneNumber(row['TLO Phone 1'] || row['TLO Phone 2']);
        const firstName = row['First Name'] || '';
        const lastName = row['Last Name'] || '';

        // Parse Address
        const busAddr = row['Business Address Street,City,State,Zip'] || '';
        let address='', city='', state='', zip='';
        if(busAddr) { const p = busAddr.split(','); address=p[0]; city=p[1]; state=p[2]; zip=p[3]; }

        const rowData = createStandardRow(firstName, lastName, phone, row['Business Name'], row['TLO Email 1'], row);
        // Overwrite address fields since they were parsed
        rowData['Address'] = address || '';
        rowData['City'] = city || '';
        rowData['State'] = state || '';
        rowData['Zip'] = zip || '';
        rowData['Monthly Revenue'] = row['Turnover'] || '';
        rowData['Business Start Date'] = row['Business Start Date'] || '';
        return rowData;
    });
}

function normalizeDataFromOriginal(data) {
    return data.map(row => {
        // 1. TRACERS PRIORITY CHECK
        // If we have "Verified Mobile", use it. Otherwise look for standard Phone columns.
        const cleanMobile = getColumnValue(row, ['Verified Mobile', 'Verified Phone']);
        const rawPhone = cleanMobile || getColumnValue(row, ['Phone Number', 'phone', 'Mobile', 'cell phone']) || '';

        // Same for Address (Use "Home Address" if present, else standard "Address")
        const cleanAddress = getColumnValue(row, ['Home Address', 'Owner Home Address']);
        const rawAddress = cleanAddress || getColumnValue(row, ['Address', 'address', 'Address1']) || '';

        const cleanCity = getColumnValue(row, ['Home City', 'Owner Home City']);
        const rawCity = cleanCity || getColumnValue(row, ['City', 'city']) || '';

        const cleanState = getColumnValue(row, ['Home State', 'Owner Home State']);
        const rawState = cleanState || getColumnValue(row, ['State', 'state']) || '';

        const cleanZip = getColumnValue(row, ['Home Zip', 'Owner Home Zip']);
        const rawZip = cleanZip || getColumnValue(row, ['Zip', 'zip', 'Zip Code']) || '';

        // Standard Name/Company parsing
        const ownerName = getColumnValue(row, ['Owner Name', 'owner name']) || '';
        let firstName = getColumnValue(row, ['First Name', 'first name']);
        let lastName = getColumnValue(row, ['Last Name', 'last name']);

        if (!firstName && ownerName) {
            const parts = ownerName.trim().split(/\s+/);
            firstName = parts[0] || '';
            lastName = parts.length > 1 ? parts[parts.length - 1] : '';
        }

        const phone = formatPhoneNumber(rawPhone);
        const company = getColumnValue(row, ['Company Name', 'company']) || '';
        const email = getColumnValue(row, ['Email', 'email']) || '';

        // Pass our prioritized values to the creator
        return createStandardRow(firstName, lastName, phone, company, email, {
            ...row,
            // Override the lookups with our chosen "Clean" values
            'Address': rawAddress,
            'City': rawCity,
            'State': rawState,
            'Zip': rawZip
        });
    });
}

// Helper to build the internal object structure
function createStandardRow(first, last, phone, company, email, originalRow) {
    return {
        'First Name': first || '',
        'Last Name': last || '',
        'Phone Number': phone || '',
        'Company Name': company || '',
        'Email': email || '',
        'Address': originalRow['Address'] || getColumnValue(originalRow, ['Address', 'address', 'Address1']) || '',
        'City': originalRow['City'] || getColumnValue(originalRow, ['City', 'city']) || '',
        'State': originalRow['State'] || getColumnValue(originalRow, ['State', 'state']) || '',
        'Zip': originalRow['Zip'] || getColumnValue(originalRow, ['Zip', 'zip', 'Zip Code']) || '',
        'Monthly Revenue': getColumnValue(originalRow, ['Monthly Revenue', 'Turnover', 'Annual Revenue']) || '',
        'DOB': getColumnValue(originalRow, ['DOB', 'dob', 'Date of Birth']) || '',
        'TaxID': getColumnValue(originalRow, ['TaxID', 'ein', 'Tax ID']) || '',
        'SSN': getColumnValue(originalRow, ['SSN', 'ssn']) || '',
        'Business Start Date': getColumnValue(originalRow, ['Business Start Date', 'yearsinbusiness']) || '',
        'Notes': getColumnValue(originalRow, ['Notes', 'notes']) || ''
    };
}

function createCRMFile(normalizedData) {
    const crmHeaders = [
        'First Name', 'Last Name', 'Phone Number', 'Cell Phone',
        'Company Name', 'Email', 'Lead Source', 'Address',
        'City', 'State', 'Zip', 'Business Type', 'Annual Revenue',
        'Funding', 'Factor Rate', 'Funding Date', 'Term', 'Notes',
        'Campaign', 'TaxID', 'SSN', 'Business Start Date', 'DOB'
    ];

    const rows = [crmHeaders.join(',')];

    normalizedData.forEach(row => {
        const crmRow = [
            row['First Name'],
            row['Last Name'],
            row['Phone Number'],
            row['Phone Number'], // Cell Phone same as Phone
            row['Company Name'],
            row['Email'],
            'WEB', // Default Source
            row['Address'],
            row['City'],
            row['State'],
            row['Zip'],
            '', '', '', '', '', '', // Empty financial fields
            row['Notes'] || row['Monthly Revenue'], // Put Revenue in notes if no explicit field
            '',
            row['TaxID'],
            formatSSN(row['SSN']),
            formatDate(row['Business Start Date']),
            formatDate(row['DOB'])
        ];
        rows.push(crmRow.map(val => `"${(val || '').toString().replace(/"/g, '""')}"`).join(','));
    });

    return rows.join('\n');
}

// Utils
function getColumnValue(row, possibleNames) {
    for (let name of possibleNames) {
        for (let key in row) {
            if (key.toLowerCase().trim() === name.toLowerCase().trim()) return row[key];
        }
    }
    return '';
}

function formatPhoneNumber(phone) {
    if (!phone) return '';
    const cleaned = phone.toString().replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('1')) return cleaned.substring(1);
    return cleaned;
}

function formatSSN(ssn) {
    if (!ssn) return '';
    const cleaned = ssn.toString().replace(/\D/g, '');
    if (cleaned.length === 9) return `${cleaned.substring(0,3)}-${cleaned.substring(3,5)}-${cleaned.substring(5)}`;
    return ssn;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const ddmmyyyyPattern = /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/;
    const match = dateStr.toString().match(ddmmyyyyPattern);

    if (match) {
        // Simple heuristic: if day > 12, it must be DD/MM, otherwise assume MM/DD or let backend handle
        return `${match[2].padStart(2,'0')}/${match[1].padStart(2,'0')}/${match[3]}`;
    }
    return dateStr;
}

// Global instance setup
window.csvImportModalManager = null;
function openCsvImportModal() {
    if (!window.csvImportModalManager) {
        window.csvImportModalManager = new CSVImportModalManager();
    }
    window.csvImportModalManager.openModal();
}
