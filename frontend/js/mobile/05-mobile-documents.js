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

        container.innerHTML = documents.map(doc => {
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
        // File input - use cloneNode to prevent duplicate listeners
        const fileInput = document.getElementById('mobileFileInput');
        if (fileInput) {
            const newFileInput = fileInput.cloneNode(true);
            fileInput.parentNode.replaceChild(newFileInput, fileInput);

            newFileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.showUploadModal(Array.from(e.target.files));
                    e.target.value = '';
                }
            });
        }

        // Document actions - use cloneNode to prevent duplicate listeners
        const container = document.getElementById('documentsContainer');
        if (container) {
            const newContainer = container.cloneNode(true);
            container.parentNode.replaceChild(newContainer, container);

            newContainer.addEventListener('click', (e) => {
                const previewBtn = e.target.closest('.preview-doc');
                const editBtn = e.target.closest('.edit-doc');
                const deleteBtn = e.target.closest('.delete-doc');

                if (previewBtn) {
                    const docId = previewBtn.dataset.docId;
                    this.previewDocument(docId);
                }

                if (editBtn) {
                    const docId = editBtn.dataset.docId;
                    this.editDocument(docId);
                }

                if (deleteBtn) {
                    const docId = deleteBtn.dataset.docId;
                    this.confirmDeleteDocument(docId);
                }
            });
        }
    },

    // ============ PREVIEW ============
    previewDocument(docId) {
        const doc = this.currentDocuments?.find(d => d.id == docId);
        if (!doc) return;

        // Construct absolute URL to force native viewer
        const fullUrl = `${window.location.origin}/api/documents/view/${docId}?t=${Date.now()}`;
        window.location.assign(fullUrl);
    },

    // ============ EDIT DOCUMENT ============
    editDocument(docId) {
        const doc = this.currentDocuments?.find(d => d.id == docId);
        if (!doc) {
            this.showToast('Document not found', 'error');
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
                            <input type="text" id="editDocName" class="mobile-form-input" value="${this.utils.escapeHtml(nameWithoutExt)}">
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
        if (!confirm('Delete this document?')) return;

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
    }
});
