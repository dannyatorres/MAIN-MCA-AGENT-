// documents.js - Complete Logic Preserved, Styles Refactored

class DocumentsModule {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = parent.apiBaseUrl;
        this.utils = parent.utils;
        this.templates = parent.templates;

        // Document state
        this.currentDocuments = [];
        this.selectedFiles = [];
        this.documentsNeedRefresh = false;

        this.init();
    }

    init() {
        // Document-specific initialization
    }

    setupDocumentsEventListeners() {
        console.log('setupDocumentsEventListeners called');

        const dragDropZone = document.getElementById('dragDropZone');
        const fileInput = document.getElementById('documentUpload');
        const browseBtn = document.getElementById('browseFilesBtn');

        // Drag and drop handlers
        if (dragDropZone) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dragDropZone.addEventListener(eventName, this.utils.preventDefaults, false);
            });

            ['dragenter', 'dragover'].forEach(eventName => {
                dragDropZone.addEventListener(eventName, () => {
                    dragDropZone.classList.add('drag-active');
                }, false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dragDropZone.addEventListener(eventName, () => {
                    dragDropZone.classList.remove('drag-active');
                }, false);
            });

            dragDropZone.addEventListener('drop', (e) => {
                const files = Array.from(e.dataTransfer.files);
                this.handleFileSelection(files);
            }, false);
        }

        // File input handlers
        if (fileInput) {
            if (browseBtn) {
                browseBtn.addEventListener('click', () => {
                    fileInput.click();
                });
            }
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleFileSelection(Array.from(e.target.files));
                }
            });
        }
    }

    async loadDocuments() {
        const conversation = this.parent.getSelectedConversation();
        const conversationId = this.parent.getCurrentConversationId();
        const targetId = conversation?.id || conversationId;
        const documentsList = document.getElementById('documentsList');

        if (!targetId) {
            console.error('❌ No conversation ID available, cannot load documents');
            this.renderDocumentsList([]);

            // UPDATED: Used CSS class .doc-state-container
            if (documentsList) {
                documentsList.innerHTML = `
                    <div class="doc-state-container">
                        <div class="doc-state-icon">⚠️</div>
                        <h4 class="doc-state-title">No Conversation Selected</h4>
                        <p class="doc-state-text">Please select a conversation from the list to view documents.</p>
                    </div>
                `;
            }
            return;
        }

        try {
            console.log(`📄 Loading documents for conversation: ${targetId}`);
            const result = await this.parent.apiCall(`/api/conversations/${targetId}/documents`);

            if (result.success) {
                this.currentDocuments = (result.documents || []).map(doc => this.normalizeDocumentFields(doc));
                console.log(`✅ Loaded ${this.currentDocuments.length} documents`);
                this.renderDocumentsList();
                this.updateDocumentsSummary();
                this.toggleFCSGenerationSection();
            } else {
                console.error('❌ Failed to load documents:', result.error);

                // UPDATED: Used CSS class .doc-state-container
                if (documentsList) {
                    documentsList.innerHTML = `
                        <div class="doc-state-container error-state">
                            <div class="doc-state-icon">❌</div>
                            <h4 class="doc-state-title">Failed to Load Documents</h4>
                            <p class="doc-state-text">${result.error || 'Unknown error'}</p>
                            <button onclick="window.conversationUI.documents.loadDocuments()"
                                    class="btn btn-primary btn-sm">
                                Retry
                            </button>
                        </div>
                    `;
                }
                this.renderDocumentsList([]);
            }
        } catch (error) {
            console.error('❌ Error loading documents:', error);

            // UPDATED: Used CSS class .doc-state-container
            if (documentsList) {
                documentsList.innerHTML = `
                    <div class="doc-state-container error-state">
                        <div class="doc-state-icon">❌</div>
                        <h4 class="doc-state-title">Error Loading Documents</h4>
                        <p class="doc-state-text">${error.message}</p>
                        <button onclick="window.conversationUI.documents.loadDocuments()"
                                class="btn btn-primary btn-sm">
                            Retry
                        </button>
                    </div>
                `;
            }
            this.renderDocumentsList([]);
        }
    }

    normalizeDocumentFields(doc) {
        return {
            ...doc,
            originalFilename: doc.originalFilename || doc.original_filename || doc.original_name || doc.renamed_name || 'Unknown File',
            fileSize: doc.fileSize || doc.file_size || 0,
            documentType: doc.documentType || doc.document_type || 'Other',
            mimeType: doc.mimeType || doc.mime_type || 'application/octet-stream'
        };
    }

    renderDocumentsList(documents = null) {
        const documentsList = document.getElementById('documentsList');
        if (!documentsList) return;

        const docs = documents || this.currentDocuments || [];
        const conversation = this.parent.getSelectedConversation();
        const conversationId = conversation?.id || this.parent.getCurrentConversationId();

        if (!conversationId) {
            this.documentsNeedRefresh = true;
        }

        if (docs.length === 0) {
            documentsList.innerHTML = `
                <div class="doc-empty-state">
                    <div class="empty-icon-stack">
                        <i class="fas fa-file-invoice"></i>
                        <i class="fas fa-file-contract"></i>
                    </div>
                    <h4>No Documents Yet</h4>
                    <p>Upload bank statements, applications, or tax returns to get started.</p>
                    <button class="btn btn-primary btn-sm mt-3" onclick="document.getElementById('documentUpload').click()">
                        <i class="fas fa-cloud-upload-alt"></i> Upload Files
                    </button>
                </div>
            `;
            return;
        }

        // Sleek Grid Layout
        const htmlContent = `
            <div class="documents-grid-header">
                <div class="col-name">NAME</div>
                <div class="col-type">TYPE</div>
                <div class="col-size">SIZE</div>
                <div class="col-actions"></div>
            </div>
            <div class="documents-grid-body">
                ${docs.map(doc => {
                    const convId = conversationId || doc.conversation_id || '';
                    const iconClass = this.getFileIconClass(doc.mimeType, doc.documentType);
                    const docTypeLabel = doc.documentType || 'Document';

                    return `
                    <div class="doc-card-row" data-document-id="${doc.id}">
                        <div class="doc-col-main">
                            <div class="file-icon ${this.getFileIconColor(doc.mimeType)}">
                                <i class="${iconClass}"></i>
                            </div>
                            <div class="file-info">
                                <div class="file-name doc-name-clickable"
                                     title="${doc.originalFilename}"
                                     ondblclick="window.conversationUI.documents.enableInlineEdit('${doc.id}')">
                                    ${doc.originalFilename}
                                </div>
                                <div class="file-meta-mobile">${docTypeLabel} • ${this.utils.formatFileSize(doc.fileSize)}</div>
                            </div>
                        </div>

                        <div class="doc-col-type">
                            <span class="badge-type">${docTypeLabel}</span>
                        </div>

                        <div class="doc-col-size">${this.utils.formatFileSize(doc.fileSize)}</div>

                        <div class="doc-col-actions">
                            <div class="action-group">
                                <button class="btn-icon-action document-preview-btn" data-doc-id="${doc.id}" data-conv-id="${convId}" title="Preview">
                                    <i class="fas fa-eye"></i>
                                </button>

                                <button class="btn-icon-action document-edit-btn" data-doc-id="${doc.id}" data-conv-id="${convId}" title="Rename">
                                    <i class="fas fa-pen"></i>
                                </button>

                                <div class="dropdown-trigger">
                                    <button class="btn-icon-action more-actions-btn" title="More Options">
                                        <i class="fas fa-ellipsis-v"></i>
                                    </button>
                                    <div class="dropdown-menu">
                                        <button class="dropdown-item document-download-btn" data-doc-id="${doc.id}" data-conv-id="${convId}">
                                            <i class="fas fa-download"></i> Download
                                        </button>
                                        <div class="dropdown-divider"></div>
                                        <button class="dropdown-item text-danger document-delete-btn" data-doc-id="${doc.id}" data-conv-id="${convId}">
                                            <i class="fas fa-trash-alt"></i> Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        `;

        documentsList.innerHTML = htmlContent;

        // Setup listeners immediately after rendering
        this.setupDocumentActionListeners();

        const loading = document.getElementById('documentsLoading');
        if (loading) loading.classList.add('hidden');
    }

    // Helper for Icons
    getFileIconClass(mimeType, docType) {
        if (docType === 'Bank Statement' || docType === '4 Months Bank Statement') return 'fas fa-university';
        if (docType === 'Tax Return') return 'fas fa-file-invoice-dollar';
        if (docType === 'Signed Application') return 'fas fa-file-signature';
        if (docType === "Driver's License") return 'fas fa-id-card';
        if (docType === 'Voided Check') return 'fas fa-money-check';
        if (mimeType?.includes('pdf')) return 'fas fa-file-pdf';
        if (mimeType?.includes('image')) return 'fas fa-file-image';
        if (mimeType?.includes('sheet') || mimeType?.includes('csv')) return 'fas fa-file-excel';
        if (mimeType?.includes('word')) return 'fas fa-file-word';
        return 'fas fa-file-alt';
    }

    getFileIconColor(mimeType) {
        if (mimeType?.includes('pdf')) return 'color-red';
        if (mimeType?.includes('image')) return 'color-purple';
        if (mimeType?.includes('sheet') || mimeType?.includes('csv')) return 'color-green';
        if (mimeType?.includes('word')) return 'color-blue';
        return 'color-gray';
    }

    setupDocumentActionListeners() {
        const documentsList = document.getElementById('documentsList');
        if (!documentsList) return;

        // 1. Clear old listeners by cloning the node
        // This is crucial to prevent double-firing events
        const newDocumentsList = documentsList.cloneNode(true);
        documentsList.parentNode.replaceChild(newDocumentsList, documentsList);

        // 2. Attach Global Closer (Run only once)
        if (!window.dropdownCloserAttached) {
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.dropdown-trigger')) {
                    document.querySelectorAll('.dropdown-menu.show').forEach(el => el.classList.remove('show'));
                }
            });
            window.dropdownCloserAttached = true;
        }

        // 3. Main Event Delegation
        newDocumentsList.addEventListener('click', (event) => {
            const target = event.target;

            // Handle Dropdown Toggle (The Three Dots)
            const dropdownBtn = target.closest('.more-actions-btn');
            if (dropdownBtn) {
                event.stopPropagation();
                const menu = dropdownBtn.nextElementSibling;

                // Close other open menus
                document.querySelectorAll('.dropdown-menu.show').forEach(el => {
                    if (el !== menu) el.classList.remove('show');
                });

                // Toggle this menu
                if (menu) menu.classList.toggle('show');
                return;
            }

            // Handle Action Buttons (Preview, Edit, Download, Delete)
            // Works for both visible buttons AND buttons inside the dropdown
            const btn = target.closest('button');
            if (!btn) return;

            const docId = btn.dataset.docId;
            const convId = btn.dataset.convId;

            if (!docId) return;

            // Close any open dropdowns when an action is clicked
            document.querySelectorAll('.dropdown-menu.show').forEach(el => el.classList.remove('show'));

            if (convId && !this.parent.getCurrentConversationId()) {
                this.parent.currentConversationId = convId;
            }

            if (btn.classList.contains('document-edit-btn')) {
                this.editDocument(docId);
            } else if (btn.classList.contains('document-preview-btn')) {
                this.previewDocument(docId);
            } else if (btn.classList.contains('document-download-btn')) {
                this.downloadDocument(docId);
            } else if (btn.classList.contains('document-delete-btn')) {
                this.deleteDocument(docId);
            }
        });
    }

    handleFileSelection(files) {
        const validFiles = this.validateFiles(files);
        if (validFiles.length === 0) return;

        this.selectedFiles = [...this.selectedFiles, ...validFiles];
        this.showDocumentTypeSelection();
    }

    validateFiles(files) {
        const maxSize = 50 * 1024 * 1024; // 50MB
        const allowedTypes = [
            'application/pdf',
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain', 'text/csv',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];

        const validFiles = [];
        const errors = [];

        files.forEach(file => {
            if (file.size > maxSize) {
                errors.push(`${file.name}: File too large (max 50MB)`);
                return;
            }
            if (!allowedTypes.includes(file.type)) {
                errors.push(`${file.name}: Unsupported file type`);
                return;
            }
            validFiles.push(file);
        });

        if (errors.length > 0) {
            this.utils.showNotification(`File validation errors:\n${errors.join('\n')}`, 'error');
        }

        return validFiles;
    }

    showDocumentTypeSelection() {
        const typeSelectionDiv = document.getElementById('documentTypeSelection');
        const gridDiv = document.getElementById('typeSelectionGrid');

        if (!typeSelectionDiv || !gridDiv) return;

        const documentTypes = [
            'Bank Statement', '4 Months Bank Statement', 'Tax Return', 'Signed Application',
            'FCS Document', "Driver's License", 'Voided Check', 'Other'
        ];

        gridDiv.innerHTML = this.selectedFiles.map((file, index) => `
            <div class="file-type-item-compact">
                <div class="file-name-compact">${file.name}</div>
                <div class="file-size-compact">${this.utils.formatFileSize(file.size)}</div>
                <select class="file-type-select-compact" data-file-index="${index}">
                    ${documentTypes.map(type =>
                        `<option value="${type}" ${this.guessDocumentType(file.name) === type ? 'selected' : ''}>${type}</option>`
                    ).join('')}
                </select>
                <label class="auto-process-compact">
                    <input type="checkbox" class="auto-process-checkbox" data-file-index="${index}"
                           ${this.shouldAutoProcess(file.name) ? 'checked' : ''}>
                    AI Process
                </label>
            </div>
        `).join('');

        typeSelectionDiv.classList.remove('hidden');

        document.getElementById('confirmUploadBtn').onclick = () => this.confirmUpload();
        document.getElementById('cancelUploadBtn').onclick = () => this.cancelUpload();
    }

    async confirmUpload() {
        const typeSelects = document.querySelectorAll('.file-type-select-compact');
        const autoProcessChecks = document.querySelectorAll('.auto-process-checkbox');
        const conversation = this.parent.getSelectedConversation();

        if (!conversation) {
            this.utils.showNotification('No conversation selected', 'error');
            return;
        }

        this.showUploadProgress(true);

        try {
            const uploadResults = [];

            for (let index = 0; index < this.selectedFiles.length; index++) {
                const file = this.selectedFiles[index];
                const documentType = typeSelects[index] ? typeSelects[index].value : 'Other';

                const formData = new FormData();
                formData.append('file', file);
                formData.append('conversation_id', conversation.id);
                formData.append('document_type', documentType);

                const response = await fetch(`${this.parent.apiBaseUrl}/api/documents/upload`, {
                    method: 'POST',
                    headers: { 'Authorization': this.parent.apiAuth },
                    body: formData
                });

                if (!response.ok) {
                    uploadResults.push({ success: false, filename: file.name });
                    continue;
                }

                const result = await response.json();

                if (result.success) {
                    uploadResults.push({ success: true, filename: file.name, document: result.document });
                } else {
                    uploadResults.push({ success: false, filename: file.name });
                }
            }

            const successCount = uploadResults.filter(r => r.success).length;
            const failedCount = uploadResults.filter(r => !r.success).length;

            if (successCount > 0) {
                this.utils.showNotification(
                    `${successCount} document(s) uploaded successfully!` +
                    (failedCount > 0 ? ` (${failedCount} failed)` : ''),
                    successCount === this.selectedFiles.length ? 'success' : 'warning'
                );
                this.loadDocuments();
                this.cancelUpload();
            } else {
                this.utils.showNotification('All uploads failed. Please try again.', 'error');
            }
        } catch (error) {
            this.utils.handleError(error, 'Upload error', 'Upload failed. Please try again.');
        }

        this.showUploadProgress(false);
    }

    cancelUpload() {
        document.getElementById('documentTypeSelection').classList.add('hidden');
        this.selectedFiles = [];
        document.getElementById('documentUpload').value = '';
    }

    showUploadProgress(show) {
        const progressDiv = document.getElementById('uploadProgress');
        const dragDropContent = document.querySelector('.drag-drop-content');

        if (progressDiv && dragDropContent) {
            if (show) {
                progressDiv.classList.remove('hidden');
                dragDropContent.classList.add('hidden');
            } else {
                progressDiv.classList.add('hidden');
                dragDropContent.classList.remove('hidden');
            }
        }
    }

    async editDocument(documentId) {
        const conversation = this.parent.getSelectedConversation();
        const conversationId = conversation?.id || this.parent.getCurrentConversationId();

        if (!conversationId) {
            this.utils.showNotification('No conversation selected', 'error');
            return;
        }

        const documents = this.currentDocuments || [];
        const docInfo = documents.find(doc => doc.id === documentId);

        if (!docInfo) {
            this.utils.showNotification('Document not found', 'error');
            return;
        }

        const originalFilename = docInfo.originalFilename;
        const lastDotIndex = originalFilename.lastIndexOf('.');
        const nameWithoutExtension = lastDotIndex > 0 ? originalFilename.substring(0, lastDotIndex) : originalFilename;
        const fileExtension = lastDotIndex > 0 ? originalFilename.substring(lastDotIndex) : '';

        // UPDATED: Completely removed inline styles. Used .doc-modal-* classes.
        const modalHtml = `
            <div id="editDocumentModal" class="doc-modal-overlay" onclick="this.remove()">
                <div class="doc-modal-card" onclick="event.stopPropagation()">
                    <div class="doc-modal-header">
                        <span>Edit Document</span>
                        <button onclick="document.getElementById('editDocumentModal').remove()" class="doc-modal-close">×</button>
                    </div>
                    <div class="doc-modal-body">
                        <div class="doc-form-group">
                            <label class="doc-form-label">Document Name:</label>
                            <div class="doc-input-group">
                                <input type="text" id="editDocumentName" value="${nameWithoutExtension}" class="doc-form-input">
                                ${fileExtension ? `<span class="doc-badge">${fileExtension}</span>` : ''}
                            </div>
                            <small class="doc-helper-text">File extension will be preserved automatically</small>
                            <input type="hidden" id="editDocumentExtension" value="${fileExtension}">
                        </div>
                        <div class="doc-form-group">
                            <label class="doc-form-label">Document Type:</label>
                            <select id="editDocumentType" class="doc-form-select">
                                <option value="Bank Statement" ${docInfo.documentType === 'Bank Statement' ? 'selected' : ''}>Bank Statement</option>
                                <option value="Tax Return" ${docInfo.documentType === 'Tax Return' ? 'selected' : ''}>Tax Return</option>
                                <option value="Financial Statement" ${docInfo.documentType === 'Financial Statement' ? 'selected' : ''}>Financial Statement</option>
                                <option value="Business License" ${docInfo.documentType === 'Business License' ? 'selected' : ''}>Business License</option>
                                <option value="Invoice" ${docInfo.documentType === 'Invoice' ? 'selected' : ''}>Invoice</option>
                                <option value="Contract" ${docInfo.documentType === 'Contract' ? 'selected' : ''}>Contract</option>
                                <option value="Other" ${docInfo.documentType === 'Other' ? 'selected' : ''}>Other</option>
                            </select>
                        </div>
                    </div>
                    <div class="doc-modal-footer">
                        <button id="cancelEditModal" class="btn btn-secondary btn-sm">Cancel</button>
                        <button id="saveDocumentEdit" data-document-id="${documentId}" class="btn btn-primary btn-sm">Save Changes</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Add event listeners
        const modal = document.getElementById('editDocumentModal');
        const cancelBtn = document.getElementById('cancelEditModal');
        const saveBtn = document.getElementById('saveDocumentEdit');

        const closeModal = () => modal.remove();
        cancelBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        saveBtn.addEventListener('click', () => {
            this.saveDocumentEdit(documentId);
        });
    }

    async saveDocumentEdit(documentId) {
        const nameInput = document.getElementById('editDocumentName');
        const typeSelect = document.getElementById('editDocumentType');
        const extensionInput = document.getElementById('editDocumentExtension');

        if (!nameInput || !typeSelect) return;

        const newNameWithoutExtension = nameInput.value.trim();
        const fileExtension = extensionInput ? extensionInput.value : '';
        const newType = typeSelect.value;

        if (!newNameWithoutExtension) {
            this.utils.showNotification('Document name cannot be empty', 'error');
            return;
        }

        const newName = newNameWithoutExtension + fileExtension;

        // Optimistic update
        if (this.currentDocuments) {
            const docIndex = this.currentDocuments.findIndex(d => d.id === documentId);
            if (docIndex !== -1) {
                this.currentDocuments[docIndex].originalFilename = newName;
                this.currentDocuments[docIndex].documentType = newType;
            }
        }

        const conversation = this.parent.getSelectedConversation();
        if (!conversation) return;

        try {
            const result = await this.parent.apiCall(`/api/conversations/${conversation.id}/documents/${documentId}`, {
                method: 'PUT',
                body: JSON.stringify({
                    filename: newName,
                    documentType: newType
                })
            });

            if (result.success) {
                this.renderDocumentsList();
                document.getElementById('editDocumentModal').remove();
                this.utils.showNotification('Document updated successfully', 'success');
                await this.loadDocuments();
            } else {
                throw new Error(result.error || 'Failed to update document');
            }
        } catch (error) {
            console.error('Error updating document:', error);
            this.utils.showNotification(`Failed to update document: ${error.message}`, 'error');
            await this.loadDocuments(); // Revert
        }
    }

    enableInlineEdit(documentId) {
        const docRow = document.querySelector(`[data-document-id="${documentId}"]`);
        if (!docRow) return;

        // UPDATED: Selector changed to match new class
        const nameElement = docRow.querySelector('.doc-name-clickable');
        if (!nameElement) return;

        const originalName = nameElement.textContent.trim();
        nameElement.contentEditable = 'true';

        // UPDATED: Use CSS class for the "Edit Mode" look
        nameElement.classList.add('inline-editing');
        nameElement.focus();

        const range = document.createRange();
        range.selectNodeContents(nameElement);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        const saveEdit = async () => {
            const newName = nameElement.textContent.trim();
            nameElement.contentEditable = 'false';

            // CLEANED: Remove class instead of inline style
            nameElement.classList.remove('inline-editing');

            if (newName && newName !== originalName) {
                this.saveDocumentRename(documentId, newName, originalName, nameElement);
            } else {
                nameElement.textContent = originalName;
            }
        };

        nameElement.addEventListener('blur', saveEdit, { once: true });
        nameElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                nameElement.blur();
            } else if (e.key === 'Escape') {
                nameElement.textContent = originalName;
                nameElement.blur();
            }
        });
    }

    async saveDocumentRename(documentId, newName, originalName, nameElement) {
        try {
            nameElement.classList.add('loading-opacity');
            this.utils.showNotification('Renaming document...', 'info');

            const result = await this.parent.apiCall(`/api/documents/${documentId}`, {
                method: 'PUT',
                body: JSON.stringify({
                    filename: newName
                })
            });

            if (result.success) {
                const docIndex = this.currentDocuments.findIndex(d => d.id === documentId);
                if (docIndex !== -1) {
                    this.currentDocuments[docIndex].originalFilename = newName;
                    this.currentDocuments[docIndex].original_filename = newName;
                }
                nameElement.textContent = newName;
                nameElement.classList.remove('loading-opacity');
                this.utils.showNotification('Document renamed successfully', 'success');
            } else {
                throw new Error(result.error || result.message || 'Failed to rename document');
            }
        } catch (error) {
            console.error('Error renaming document:', error);
            nameElement.textContent = originalName;
            nameElement.classList.remove('loading-opacity');
            this.utils.showNotification(`Failed to rename: ${error.message}`, 'error');
        }
    }

    async previewDocument(documentId) {
        const conversation = this.parent.getSelectedConversation();
        let conversationId = conversation?.id || this.parent.getCurrentConversationId() ||
                          this.getConversationIdFromDocument(documentId);

        if (!conversationId) {
            this.utils.showNotification('Unable to determine conversation context', 'error');
            return;
        }

        const directFileUrl = `${this.apiBaseUrl}/api/conversations/${conversationId}/documents/${documentId}/preview?t=${Date.now()}`;

        try {
            this.utils.showNotification('Opening document...', 'info');
            const newWindow = window.open(directFileUrl, '_blank');
            if (newWindow) {
                newWindow.focus();
            } else {
                this.utils.showNotification('Pop-up blocked. Opening in current tab...', 'warning');
                window.location.href = directFileUrl;
            }
        } catch (error) {
            this.utils.showNotification('Preview failed: ' + error.message, 'error');
        }
    }

    async downloadDocument(documentId) {
        const conversation = this.parent.getSelectedConversation();
        let conversationId = conversation?.id || this.parent.getCurrentConversationId() ||
                          this.getConversationIdFromDocument(documentId);

        if (!conversationId) {
            this.utils.showNotification('Unable to determine conversation context', 'error');
            return;
        }

        try {
            const downloadUrl = `${this.apiBaseUrl}/api/conversations/${conversationId}/documents/${documentId}/download`;
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = '';
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            setTimeout(() => { document.body.removeChild(link); }, 100);
            this.utils.showNotification('Download started', 'success');
        } catch (error) {
            this.utils.showNotification('Download failed: ' + error.message, 'error');
        }
    }

    async deleteDocument(documentId) {
        const conversation = this.parent.getSelectedConversation();
        let conversationId = conversation?.id || this.parent.getCurrentConversationId() ||
                          this.getConversationIdFromDocument(documentId);

        if (!conversationId) return;

        if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) return;

        try {
            const result = await this.parent.apiCall(`/api/conversations/${conversationId}/documents/${documentId}`, {
                method: 'DELETE'
            });

            if (result.success) {
                this.utils.showNotification('Document deleted successfully.', 'success');
                await this.loadDocuments();
            } else {
                this.utils.showNotification(`Delete failed: ${result.error}`, 'error');
            }
        } catch (error) {
            this.utils.showNotification('Delete failed: ' + error.message, 'error');
        }
    }

    getConversationIdFromDocument(documentId) {
        if (this.currentDocuments) {
            const doc = this.currentDocuments.find(d => d.id === documentId);
            if (doc && doc.conversation_id) return doc.conversation_id;
        }
        return null;
    }

    getDocumentIconCompact(mimeType, documentType) {
        if (mimeType && mimeType.startsWith('image/')) return '🖼️';
        if (mimeType === 'application/pdf') return '📄';
        if (documentType === 'Bank Statement' || documentType === '4 Months Bank Statement') return '🏦';
        if (documentType === 'Tax Return') return '📊';
        if (documentType === "Driver's License") return '🪪';
        if (documentType === 'Voided Check') return '💳';
        if (documentType === 'Signed Application') return '✍️';
        if (documentType === 'FCS Document') return '📈';
        return '📎';
    }

    guessDocumentType(filename) {
        const lower = filename.toLowerCase();
        if (lower.includes('bank') || lower.includes('statement')) return 'Bank Statement';
        if (lower.includes('tax') || lower.includes('1120') || lower.includes('1040')) return 'Tax Return';
        if (lower.includes('license')) return "Driver's License";
        if (lower.includes('application')) return 'Signed Application';
        return 'Other';
    }

    shouldAutoProcess(filename) {
        const lower = filename.toLowerCase();
        return lower.includes('bank') || lower.includes('statement') || lower.includes('tax');
    }

    toggleFCSGenerationSection() {
        const fcsSection = document.getElementById('fcsGenerationSection');
        if (!fcsSection) return;

        const hasDocuments = this.currentDocuments && this.currentDocuments.length > 0;
        const hasBankStatements = this.currentDocuments && this.currentDocuments.some(doc =>
            doc.filename && (doc.filename.toLowerCase().includes('statement') ||
                           doc.filename.toLowerCase().includes('bank') ||
                           doc.type === 'Bank Statement' ||
                           doc.document_type === 'Bank Statement')
        );

        if (hasDocuments || hasBankStatements) {
            fcsSection.classList.remove('hidden');
        } else {
            fcsSection.classList.add('hidden');
        }
    }

    updateDocumentsSummary() {
        const summaryDiv = document.getElementById('documentsSummary');
        if (!summaryDiv) return;
        summaryDiv.classList.add('hidden');
    }

    updateDocumentProcessingStatus(documentId, status, error) {
        // Status logic if needed
    }

    // Template for documents tab
    // CLEANED: Inline styles moved to CSS
    createDocumentsTabTemplate(documents = []) {
        const conversationId = this.parent.getCurrentConversationId() || '';

        return `
            <div class="documents-section">
                <div class="documents-header hidden">
                    <h3>Documents</h3>
                    <input type="file" id="documentUpload" multiple
                           accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.csv,.xlsx"
                           class="hidden">
                </div>

                <div class="fcs-section" id="fcsGenerationSection">
                    <div class="fcs-info">
                        <h4>📊 FCS Report Generation</h4>
                        <p>Generate financial analysis from uploaded bank statements</p>
                    </div>
                    <button id="generateFCSBtn"
                            class="btn btn-primary btn-sm"
                            data-conversation-id="${conversationId}">
                        📈 Generate FCS Report
                    </button>
                </div>

                <div class="drag-drop-zone" id="dragDropZone">
                    <div class="drag-drop-content">
                        <div class="drag-drop-icon">📎</div>
                        <h4>Drag & Drop Documents Here</h4>
                        <p>Or <button type="button" class="btn-link" id="browseFilesBtn">browse files</button></p>
                        <p class="drag-drop-hint">
                            Supports: PDF, JPG, PNG, DOC, DOCX, CSV, XLSX (Max 50MB each)
                        </p>
                    </div>
                    <div class="upload-progress hidden" id="uploadProgress">
                        <div class="progress-bar">
                            <div class="progress-fill" id="progressFill"></div>
                        </div>
                        <div class="progress-text" id="progressText">Uploading...</div>
                    </div>
                </div>

                <div class="document-type-selection hidden" id="documentTypeSelection">
                    <h4>Categorize Documents</h4>
                    <div class="type-selection-grid" id="typeSelectionGrid"></div>
                    <div class="type-selection-actions">
                        <button class="btn btn-primary" id="confirmUploadBtn">Upload Documents</button>
                        <button class="btn btn-secondary" id="cancelUploadBtn">Cancel</button>
                    </div>
                </div>

                <div class="documents-list" id="documentsList">
                    <div class="loading-state" id="documentsLoading">
                        <div class="loading-spinner"></div>
                        <p>Loading documents...</p>
                    </div>
                </div>

                <div class="documents-summary hidden" id="documentsSummary"></div>
            </div>
        `;
    }
}
