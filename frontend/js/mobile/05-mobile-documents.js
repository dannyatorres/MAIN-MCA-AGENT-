// 05-mobile-documents.js
Object.assign(window.MobileApp.prototype, {
    // ============ DOCUMENTS ============
    async loadDocumentsView() {
        const container = document.getElementById('documentsContainer');
        if (!container || !this.currentConversationId) return;

        container.innerHTML = `
            <div class="ai-loading-container">
                <div class="ai-thinking">
                    <div class="ai-dot"></div>
                    <div class="ai-dot"></div>
                    <div class="ai-dot"></div>
                </div>
                <p>Loading documents...</p>
            </div>
        `;

        try {
            const result = await this.apiCall(`/api/documents/${this.currentConversationId}`);

            if (result.success && result.documents) {
                this.currentDocuments = result.documents;
                this.renderDocumentsList(result.documents);
            } else {
                this.currentDocuments = [];
                this.renderDocumentsList([]);
            }
        } catch (err) {
            container.innerHTML = `
                <div class="docs-empty">
                    <div class="docs-empty-icon"><i class="fas fa-exclamation-circle"></i></div>
                    <h3>Failed to Load</h3>
                    <p>Could not load documents</p>
                </div>
            `;
        }

        this.setupDocumentsListeners();
    },

    renderDocumentsList(documents) {
        const container = document.getElementById('documentsContainer');
        if (!container) return;

        if (!documents || documents.length === 0) {
            container.innerHTML = `
                <div class="docs-empty">
                    <div class="docs-empty-icon"><i class="fas fa-folder-open"></i></div>
                    <h3>No Documents</h3>
                    <p>Tap the button below to upload files</p>
                </div>
            `;
            return;
        }

        const hasDocuments = documents.length > 0;

        container.innerHTML = (hasDocuments ? `
            <div class="fcs-generate-bar" id="fcsGenerateBarMobile">
                <div class="fcs-bar-info">
                    <i class="fas fa-chart-line"></i>
                    <span>Generate FCS Report</span>
                </div>
                <button class="btn btn-primary btn-sm" id="generateFCSBtnMobile">Generate</button>
            </div>
        ` : '') + documents.map(doc => {
            const filename = doc.originalFilename || doc.original_filename || doc.original_name || 'Unknown';
            const docType = doc.documentType || doc.document_type || 'Document';
            const fileSize = this.formatFileSize(doc.fileSize || doc.file_size || 0);
            const iconType = this.getDocIconType(doc.mimeType || doc.mime_type, docType);
            const iconClass = this.getDocIconClass(doc.mimeType || doc.mime_type, docType);

            return `
                <div class="doc-card-mobile" data-doc-id="${doc.id}">
                    <div class="doc-icon-mobile ${iconType}">
                        <i class="${iconClass}"></i>
                    </div>
                    <div class="doc-info-mobile">
                        <div class="doc-name-mobile">${this.utils.escapeHtml(filename)}</div>
                        <div class="doc-meta-mobile">
                            <span class="doc-type-tag">${docType}</span>
                            <span>${fileSize}</span>
                        </div>
                    </div>
                    <div class="doc-actions-mobile">
                        <button class="doc-action-btn preview-doc" data-doc-id="${doc.id}" title="Preview">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="doc-action-btn edit-doc" data-doc-id="${doc.id}" title="Edit">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="doc-action-btn delete delete-doc" data-doc-id="${doc.id}" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    },

    getDocIconType(mimeType, docType) {
        if (mimeType?.includes('pdf')) return 'pdf';
        if (mimeType?.includes('image')) return 'img';
        if (mimeType?.includes('sheet') || mimeType?.includes('csv') || mimeType?.includes('excel')) return 'xls';
        if (mimeType?.includes('word') || mimeType?.includes('doc')) return 'doc';
        if (docType === 'Bank Statement' || docType === '4 Months Bank Statement') return 'xls';
        return 'doc';
    },

    getDocIconClass(mimeType, docType) {
        if (docType === 'Bank Statement' || docType === '4 Months Bank Statement') return 'fas fa-university';
        if (docType === 'Tax Return') return 'fas fa-file-invoice-dollar';
        if (docType === 'Signed Application') return 'fas fa-file-signature';
        if (docType === "Driver's License") return 'fas fa-id-card';
        if (mimeType?.includes('pdf')) return 'fas fa-file-pdf';
        if (mimeType?.includes('image')) return 'fas fa-file-image';
        if (mimeType?.includes('sheet') || mimeType?.includes('csv')) return 'fas fa-file-excel';
        return 'fas fa-file-alt';
    },

    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    },

    setupDocumentsListeners() {
        // File input
        const fileInput = document.getElementById('mobileFileInput');
        if (fileInput && !fileInput._bound) {
            fileInput._bound = true;
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.showUploadModal(Array.from(e.target.files));
                    e.target.value = '';
                }
            });
        }

        // Document actions - just use delegation, no cloning
        const container = document.getElementById('documentsContainer');
        if (container && !container._bound) {
            container._bound = true;
            container.addEventListener('click', (e) => {
                const card = e.target.closest('.doc-card-mobile');
                if (!card) return;

                const docId = card.dataset.docId;
                const doc = this.currentDocuments?.find(d => d.id == docId);
                if (!doc) return;

                if (e.target.closest('.preview-doc')) {
                    this.previewDocument(docId);
                }

                if (e.target.closest('.edit-doc')) {
                    const filename = doc.originalFilename || doc.original_filename || 'Unknown';
                    const docType = doc.documentType || doc.document_type || 'Other';
                    this.openEditModal(docId, filename, docType);
                }

                if (e.target.closest('.delete-doc')) {
                    this.confirmDeleteDocument(docId);
                }
            });
        }

        // FCS Generate button
        const fcsBtn = document.getElementById('generateFCSBtnMobile');
        if (fcsBtn && !fcsBtn._bound) {
            fcsBtn._bound = true;
            fcsBtn.addEventListener('click', () => this.openFCSModalMobile());
        }
    },

    // ============ PREVIEW ============
    previewDocument(docId) {
        const doc = this.currentDocuments?.find(d => d.id == docId);
        if (!doc) return;

        const mimeType = doc.mimeType || doc.mime_type || '';
        const url = `/api/documents/view/${docId}?t=${Date.now()}`;

        // Non-PDFs: open in new tab
        if (!mimeType.includes('pdf')) {
            window.open(url, '_blank');
            return;
        }

        // PDFs: use PDF.js
        const mainApp = document.getElementById('panelContainer');
        const viewer = document.getElementById('documentViewer');
        const content = document.getElementById('docViewerContent');
        const title = document.getElementById('docViewerTitle');
        const closeBtn = document.getElementById('closeDocViewerBtn');

        if (!mainApp || !viewer || !content || !title || !closeBtn) return;

        title.textContent = doc.originalFilename || 'Document';
        content.innerHTML = '<div class="doc-loader-overlay"><div class="loading-spinner"></div><p>Loading PDF...</p></div>';
        mainApp.style.display = 'none';
        viewer.style.display = 'flex';

        // PDF.js setup
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const renderPDF = async () => {
            try {
                const pdf = await pdfjsLib.getDocument(url).promise;
                content.innerHTML = '';

                const existingLoader = document.getElementById('docViewerLoader');
                if (existingLoader) existingLoader.style.display = 'none';

                const container = document.createElement('div');
                container.className = 'pdf-pages-container';
                content.appendChild(container);

                const containerWidth = content.clientWidth - 16;
                const pixelRatio = window.devicePixelRatio || 1;

                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale: 1 });
                    const scale = containerWidth / viewport.width;
                    const scaledViewport = page.getViewport({ scale: scale * pixelRatio });

                    const canvas = document.createElement('canvas');
                    canvas.className = 'pdf-page-canvas';
                    canvas.width = scaledViewport.width;
                    canvas.height = scaledViewport.height;
                    canvas.style.width = `${containerWidth}px`;
                    canvas.style.height = `${(viewport.height * scale)}px`;
                    container.appendChild(canvas);

                    await page.render({
                        canvasContext: canvas.getContext('2d'),
                        viewport: scaledViewport
                    }).promise;
                }
            } catch (err) {
                console.error('PDF render failed:', err);
                content.innerHTML = `
                    <div class="docs-empty">
                        <div class="docs-empty-icon"><i class="fas fa-exclamation-circle"></i></div>
                        <h3>Cannot Preview</h3>
                        <p>Unable to load PDF</p>
                        <button class="upload-btn-mobile" style="margin-top:16px;width:auto;padding:12px 24px;" onclick="window.open('${url}', '_blank')">
                            <i class="fas fa-external-link-alt"></i> Open in Browser
                        </button>
                    </div>
                `;
            }
        };

        renderPDF();

        closeBtn.onclick = () => {
            content.innerHTML = '';
            viewer.style.display = 'none';
            mainApp.style.display = 'flex';

            const existingLoader = document.getElementById('docViewerLoader');
            if (existingLoader) existingLoader.style.display = 'flex';
        };
    },

    // ============ EDIT DOCUMENT ============
    editDocument(docId) {
        try {
            const doc = this.currentDocuments?.find(d => d.id == docId);
            if (!doc) {
                this.showAlert('Doc not found. ID: ' + docId + '\nDocs loaded: ' + (this.currentDocuments?.length || 0));
                return;
            }

            const filename = doc.originalFilename || doc.original_filename || 'Unknown';
            const lastDot = filename.lastIndexOf('.');
            const nameWithoutExt = lastDot > 0 ? filename.substring(0, lastDot) : filename;
            const extension = lastDot > 0 ? filename.substring(lastDot) : '';
            const docType = doc.documentType || doc.document_type || 'Other';

            const docTypes = [
                'Bank Statement', '4 Months Bank Statement', 'Tax Return',
                'Signed Application', "Driver's License", 'Voided Check',
                'Financial Statement', 'Business License', 'Invoice', 'Contract', 'Other'
            ];

            const escapeHtml = (str) => str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');

            const modalHtml = `
                <div class="upload-modal-mobile" id="editDocModalMobile">
                    <div class="upload-modal-content">
                        <div class="upload-modal-header">
                            <h3>Edit Document</h3>
                            <button class="upload-modal-close" id="closeEditDocModal">&times;</button>
                        </div>

                        <div class="upload-file-item">
                            <label class="edit-doc-label">Document Name</label>
                            <div class="edit-doc-name-row">
                                <input type="text" id="editDocName" class="mobile-form-input" value="${escapeHtml(nameWithoutExt)}">
                                <span class="edit-doc-ext">${extension}</span>
                            </div>
                        </div>

                        <div class="upload-file-item">
                            <label class="edit-doc-label">Document Type</label>
                            <select id="editDocType" class="upload-type-select">
                                ${docTypes.map(type => `
                                    <option value="${type}" ${docType === type ? 'selected' : ''}>${type}</option>
                                `).join('')}
                            </select>
                        </div>

                        <input type="hidden" id="editDocExtension" value="${extension}">
                        <input type="hidden" id="editDocId" value="${docId}">

                        <div class="upload-modal-actions">
                            <button class="upload-cancel-btn" id="cancelEditDocMobile">Cancel</button>
                            <button class="upload-confirm-btn" id="saveEditDocMobile">Save Changes</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            document.getElementById('closeEditDocModal').onclick = () => this.closeEditDocModal();
            document.getElementById('cancelEditDocMobile').onclick = () => this.closeEditDocModal();
            document.getElementById('saveEditDocMobile').onclick = () => this.saveDocumentEdit();
        
        } catch (err) {
            this.showAlert('Edit error: ' + err.message);
        }
    },

    openEditModal(docId, filename, docType) {
        const lastDot = filename.lastIndexOf('.');
        const nameWithoutExt = lastDot > 0 ? filename.substring(0, lastDot) : filename;
        const extension = lastDot > 0 ? filename.substring(lastDot) : '';

        const docTypes = [
            'Bank Statement', '4 Months Bank Statement', 'Tax Return',
            'Signed Application', "Driver's License", 'Voided Check',
            'Financial Statement', 'Business License', 'Invoice', 'Contract', 'Other'
        ];

        const escapeHtml = (str) => String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');

        const modalHtml = `
            <div class="upload-modal-mobile" id="editDocModalMobile">
                <div class="upload-modal-content">
                    <div class="upload-modal-header">
                        <h3>Edit Document</h3>
                        <button class="upload-modal-close" id="closeEditDocModal">&times;</button>
                    </div>

                    <div class="upload-file-item">
                        <label class="edit-doc-label">Document Name</label>
                        <div class="edit-doc-name-row">
                            <input type="text" id="editDocName" class="mobile-form-input" value="${escapeHtml(nameWithoutExt)}">
                            <span class="edit-doc-ext">${extension}</span>
                        </div>
                    </div>

                    <div class="upload-file-item">
                        <label class="edit-doc-label">Document Type</label>
                        <select id="editDocType" class="upload-type-select">
                            ${docTypes.map(type => `
                                <option value="${type}" ${docType === type ? 'selected' : ''}>${type}</option>
                            `).join('')}
                        </select>
                    </div>

                    <input type="hidden" id="editDocExtension" value="${extension}">
                    <input type="hidden" id="editDocId" value="${docId}">

                    <div class="upload-modal-actions">
                        <button class="upload-cancel-btn" id="cancelEditDocMobile">Cancel</button>
                        <button class="upload-confirm-btn" id="saveEditDocMobile">Save Changes</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('closeEditDocModal').onclick = () => this.closeEditDocModal();
        document.getElementById('cancelEditDocMobile').onclick = () => this.closeEditDocModal();
        document.getElementById('saveEditDocMobile').onclick = () => this.saveDocumentEdit();
    },

    closeEditDocModal() {
        const modal = document.getElementById('editDocModalMobile');
        if (modal) modal.remove();
    },

    async saveDocumentEdit() {
        const docId = document.getElementById('editDocId')?.value;
        const newName = document.getElementById('editDocName')?.value.trim();
        const extension = document.getElementById('editDocExtension')?.value || '';
        const newType = document.getElementById('editDocType')?.value;

        if (!newName) {
            this.showToast('Name cannot be empty', 'error');
            return;
        }

        const fullName = newName + extension;
        const saveBtn = document.getElementById('saveEditDocMobile');

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
        }

        try {
            const result = await this.apiCall(`/api/documents/${docId}`, {
                method: 'PUT',
                body: JSON.stringify({
                    filename: fullName,
                    documentType: newType
                })
            });

            if (result.success) {
                this.showToast('Document updated', 'success');
                this.closeEditDocModal();
                this.loadDocumentsView();
            } else {
                throw new Error(result.error || 'Update failed');
            }
        } catch (err) {
            this.showToast('Failed to update: ' + err.message, 'error');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Changes';
            }
        }
    },

    // ============ UPLOAD ============
    showUploadModal(files) {
        const docTypes = [
            'Bank Statement', '4 Months Bank Statement', 'Tax Return',
            'Signed Application', "Driver's License", 'Voided Check', 'Other'
        ];

        const modalHtml = `
            <div class="upload-modal-mobile" id="uploadModalMobile">
                <div class="upload-modal-content">
                    <div class="upload-modal-header">
                        <h3>Upload ${files.length} File${files.length > 1 ? 's' : ''}</h3>
                        <button class="upload-modal-close" id="closeUploadModal">&times;</button>
                    </div>

                    ${files.map((file, i) => `
                        <div class="upload-file-item" data-index="${i}">
                            <div class="upload-file-name">${this.utils.escapeHtml(file.name)}</div>
                            <select class="upload-type-select" data-index="${i}">
                                ${docTypes.map(type => `
                                    <option value="${type}" ${this.guessDocType(file.name) === type ? 'selected' : ''}>${type}</option>
                                `).join('')}
                            </select>
                        </div>
                    `).join('')}

                    <div class="upload-modal-actions">
                        <button class="upload-cancel-btn" id="cancelUploadMobile">Cancel</button>
                        <button class="upload-confirm-btn" id="confirmUploadMobile">Upload</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        this.pendingUploadFiles = files;

        document.getElementById('closeUploadModal').onclick = () => this.closeUploadModal();
        document.getElementById('cancelUploadMobile').onclick = () => this.closeUploadModal();
        document.getElementById('confirmUploadMobile').onclick = () => this.processUpload();
    },

    guessDocType(filename) {
        const lower = filename.toLowerCase();
        if (lower.includes('bank') || lower.includes('statement')) return 'Bank Statement';
        if (lower.includes('tax') || lower.includes('return')) return 'Tax Return';
        if (lower.includes('app') || lower.includes('sign')) return 'Signed Application';
        if (lower.includes('license') || lower.includes('dl') || lower.includes('id')) return "Driver's License";
        if (lower.includes('void') || lower.includes('check')) return 'Voided Check';
        return 'Other';
    },

    closeUploadModal() {
        const modal = document.getElementById('uploadModalMobile');
        if (modal) modal.remove();
        this.pendingUploadFiles = null;
    },

    async processUpload() {
        if (!this.pendingUploadFiles || !this.currentConversationId) return;

        const confirmBtn = document.getElementById('confirmUploadMobile');
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Uploading...';
        }

        const typeSelects = document.querySelectorAll('.upload-type-select');
        let successCount = 0;

        for (let i = 0; i < this.pendingUploadFiles.length; i++) {
            const file = this.pendingUploadFiles[i];
            const docType = typeSelects[i]?.value || 'Other';

            const formData = new FormData();
            formData.append('file', file);
            formData.append('conversation_id', this.currentConversationId);
            formData.append('document_type', docType);

            try {
                const response = await fetch('/api/documents/upload', {
                    method: 'POST',
                    credentials: 'include',
                    body: formData
                });

                if (response.ok) {
                    successCount++;
                }
            } catch (err) {
                console.error('Upload failed:', err);
            }
        }

        this.closeUploadModal();

        if (successCount > 0) {
            this.showToast(`${successCount} file${successCount > 1 ? 's' : ''} uploaded`, 'success');
            this.loadDocumentsView();
        } else {
            this.showToast('Upload failed', 'error');
        }
    },

    // ============ DELETE ============
    async confirmDeleteDocument(docId) {
        this.showConfirm('Delete this document?', async () => {
            try {
                const result = await this.apiCall(`/api/documents/${docId}`, {
                    method: 'DELETE'
                });

                if (result.success) {
                    this.showToast('Document deleted', 'success');
                    this.loadDocumentsView();
                } else {
                    throw new Error(result.error);
                }
            } catch (err) {
                this.showToast('Delete failed', 'error');
            }
        });
    },

    // ============ FCS GENERATION ============
    openFCSModalMobile() {
        const docs = this.currentDocuments || [];
        if (docs.length === 0) {
            this.showToast('No documents available. Upload files first.', 'warning');
            return;
        }

        const modalHtml = `
            <div class="upload-modal-mobile" id="fcsModalMobile">
                <div class="upload-modal-content">
                    <div class="upload-modal-header">
                        <h3>📊 Generate FCS Report</h3>
                        <button class="upload-modal-close" id="closeFCSModal">&times;</button>
                    </div>

                    <p style="color: #8b949e; font-size: 13px; margin: 0 0 12px;">
                        Select documents to include in the analysis:
                    </p>

                    <label class="fcs-select-row-mobile" style="display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid #262c36; margin-bottom:8px;">
                        <input type="checkbox" id="fcsSelectAllMobile" checked>
                        <span style="color:#e6edf3; font-weight:600;">Select All</span>
                    </label>

                    <div class="fcs-doc-list-mobile" style="max-height:300px; overflow-y:auto;">
                        ${docs.map(doc => {
                            const filename = doc.originalFilename || doc.original_filename || doc.original_name || 'Unknown';
                            const docType = doc.documentType || doc.document_type || 'Document';
                            const fileSize = this.formatFileSize(doc.fileSize || doc.file_size || 0);
                            return `
                                <label class="fcs-doc-row-mobile" style="display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid #1a1f2b;">
                                    <input type="checkbox" class="fcs-doc-check-mobile" value="${doc.id}" checked>
                                    <div style="flex:1; min-width:0;">
                                        <div style="color:#e6edf3; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${this.utils.escapeHtml(filename)}</div>
                                        <div style="color:#8b949e; font-size:11px;">${docType} • ${fileSize}</div>
                                    </div>
                                </label>
                            `;
                        }).join('')}
                    </div>

                    <div class="upload-modal-actions">
                        <button class="upload-cancel-btn" id="cancelFCSMobile">Cancel</button>
                        <button class="upload-confirm-btn" id="confirmFCSMobile">
                            <i class="fas fa-bolt"></i> Generate FCS
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Select All toggle
        const selectAll = document.getElementById('fcsSelectAllMobile');
        const checkboxes = () => document.querySelectorAll('.fcs-doc-check-mobile');

        selectAll?.addEventListener('change', (e) => {
            checkboxes().forEach(cb => cb.checked = e.target.checked);
        });

        checkboxes().forEach(cb => {
            cb.addEventListener('change', () => {
                const all = Array.from(checkboxes());
                selectAll.checked = all.every(c => c.checked);
                selectAll.indeterminate = all.some(c => c.checked) && !all.every(c => c.checked);
            });
        });

        document.getElementById('closeFCSModal').onclick = () => this.closeFCSModalMobile();
        document.getElementById('cancelFCSMobile').onclick = () => this.closeFCSModalMobile();
        document.getElementById('confirmFCSMobile').onclick = () => this.confirmFCSGenerationMobile();
    },

    closeFCSModalMobile() {
        const modal = document.getElementById('fcsModalMobile');
        if (modal) modal.remove();
    },

    async confirmFCSGenerationMobile() {
        const selectedIds = Array.from(document.querySelectorAll('.fcs-doc-check-mobile:checked'))
            .map(cb => cb.value);

        if (selectedIds.length === 0) {
            this.showToast('Select at least one document', 'warning');
            return;
        }

        this.closeFCSModalMobile();

        // Show loading overlay
        const container = document.getElementById('documentsContainer');
        const originalContent = container?.innerHTML;

        if (container) {
            container.innerHTML = `
                <div class="ai-loading-container" id="fcsLoadingMobile">
                    <div class="ai-thinking">
                        <div class="ai-dot"></div>
                        <div class="ai-dot"></div>
                        <div class="ai-dot"></div>
                    </div>
                    <p id="fcsStatusText">Starting FCS analysis...</p>
                </div>
            `;
        }

        try {
            const conversation = this.conversations?.find(c => c.id === this.currentConversationId);
            const businessName = conversation?.business_name || '';

            // 1. Start the job
            const startResponse = await this.apiCall('/api/fcs/generate', {
                method: 'POST',
                body: JSON.stringify({
                    conversationId: this.currentConversationId,
                    businessName: businessName,
                    documentIds: selectedIds
                })
            });

            if (!startResponse.success || !startResponse.jobId) {
                throw new Error(startResponse.error || 'Failed to start FCS generation');
            }

            // 2. Poll for completion
            const result = await this.pollFCSStatusMobile(startResponse.jobId);

            if (result.status === 'completed') {
                this.showToast('FCS Report generated!', 'success');
                // Reload documents view
                this.loadDocumentsView();
            } else {
                throw new Error(result.error || 'FCS generation failed');
            }

        } catch (error) {
            console.error('FCS Generation error:', error);
            this.showToast('FCS failed: ' + error.message, 'error');
            // Restore documents list
            if (container && originalContent) {
                container.innerHTML = originalContent;
                this.setupDocumentsListeners();
            } else {
                this.loadDocumentsView();
            }
        }
    },

    async pollFCSStatusMobile(jobId, maxAttempts = 120) {
        const pollInterval = 3000;
        let attempts = 0;

        const statusMessages = [
            'Extracting text from documents...',
            'Analyzing financial data...',
            'Running AI underwriting...',
            'Calculating metrics...',
            'Generating FCS report...',
            'Almost done...'
        ];

        while (attempts < maxAttempts) {
            attempts++;

            try {
                const status = await this.apiCall(`/api/fcs/generate/status/${jobId}?_=${Date.now()}`);

                // Update status text
                const statusEl = document.getElementById('fcsStatusText');
                if (statusEl && status.status === 'processing') {
                    const msgIndex = Math.min(Math.floor(attempts / 10), statusMessages.length - 1);
                    statusEl.textContent = status.progress || statusMessages[msgIndex];
                }

                if (status.status === 'completed' || status.status === 'failed') {
                    return status;
                }

            } catch (err) {
                console.warn(`Poll attempt ${attempts} failed:`, err.message);
                if (err.message.includes('404')) {
                    throw new Error('Job not found - it may have expired');
                }
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        throw new Error('FCS generation timed out after 6 minutes');
    }
});
