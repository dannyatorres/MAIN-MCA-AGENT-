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
        
        // ✅ NEW: Cache Store
        this.documentsCache = new Map();

        this.init();
    }

    init() {
        // Document-specific initialization
    }

    setupDocumentsEventListeners() {
        console.log('setupDocumentsEventListeners called');

        const dragDropZone = document.getElementById('dragDropZone');
        const fileInput = document.getElementById('documentUpload');

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

            // Click the entire upload bar to browse files
            dragDropZone.addEventListener('click', () => {
                if (fileInput) fileInput.click();
            });
        }

        // File input change handler
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleFileSelection(Array.from(e.target.files));
                }
            });
        }

        // Generate FCS button handler
        const generateFCSBtn = document.getElementById('generateFCSBtn');
        if (generateFCSBtn) {
            generateFCSBtn.addEventListener('click', async () => {
                const conversationId = generateFCSBtn.dataset.conversationId || this.parent.getCurrentConversationId();

                if (!conversationId) {
                    this.utils.showNotification('No conversation selected', 'error');
                    return;
                }

                generateFCSBtn.disabled = true;
                generateFCSBtn.innerHTML = '<span class="loading-spinner small"></span> Generating...';

                try {
                    if (this.parent.fcs && typeof this.parent.fcs.triggerSyncAndAnalyze === 'function') {
                        await this.parent.fcs.triggerSyncAndAnalyze();
                        this.utils.showNotification('FCS Report generated!', 'success');
                    } else {
                        throw new Error('FCS module not available');
                    }
                } catch (error) {
                    console.error('FCS Generation error:', error);
                    this.utils.showNotification('FCS generation failed: ' + error.message, 'error');
                } finally {
                    generateFCSBtn.disabled = false;
                    generateFCSBtn.innerHTML = 'Generate';
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

        // 1. INSTANT RENDER FROM CACHE
        if (this.documentsCache.has(targetId)) {
            console.log(`⚡ [Cache] Rendering documents for ${targetId}`);
            this.currentDocuments = this.documentsCache.get(targetId);
            this.renderDocumentsList();
            this.toggleFCSGenerationSection();
        } else {
            // Only show spinner if we have NO data
            if (documentsList) {
                 documentsList.innerHTML = `
                    <div class="loading-state" id="documentsLoading">
                        <div class="loading-spinner small"></div>
                        <span>Loading documents...</span>
                    </div>`;
            }
        }

        try {
            console.log(`📄 Loading documents for conversation: ${targetId}`);
            const result = await this.parent.apiCall(`/api/conversations/${targetId}/documents`);

            if (result.success) {
                const freshDocs = (result.documents || []).map(doc => this.normalizeDocumentFields(doc));
                
                // Update Cache & Current State
                this.documentsCache.set(targetId, freshDocs);
                this.currentDocuments = freshDocs;
                
                // Update UI (only if user is still on this tab)
                if (this.parent.getCurrentConversationId() == targetId) {
                    this.renderDocumentsList();
                    this.updateDocumentsSummary();
                    this.toggleFCSGenerationSection();
                }
            } else {
                // If cache existed, we just stay on old data silently. If not, show error.
                if (!this.documentsCache.has(targetId) && documentsList) {
                    documentsList.innerHTML = `<div class="doc-state-container error-state">...</div>`;
                }
            }
        } catch (error) {
            console.error('❌ Error loading documents:', error);
            if (!this.documentsCache.has(targetId) && documentsList) {
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

        // Empty State - Clean Card Style
        if (docs.length === 0) {
            documentsList.innerHTML = `
                <div class="empty-state-card">
                    <div class="empty-state-icon">📁</div>
                    <div class="empty-state-text">
                        <h4>No Documents</h4>
                        <p>Upload bank statements, applications, or other files to get started.</p>
                    </div>
                </div>
            `;
            return;
        }

        // Card-Based Document List
        const htmlContent = `
            <div class="documents-list-container">
                ${docs.map(doc => {
                    const convId = conversationId || doc.conversation_id || '';
                    const iconType = this.getDocIconType(doc.mimeType, doc.documentType);
                    const docTypeLabel = doc.documentType || 'Document';

                    return `
                    <div class="doc-card" data-document-id="${doc.id}">
                        <div class="doc-icon-box ${iconType}">
                            <i class="${this.getFileIconClass(doc.mimeType, doc.documentType)}"></i>
                        </div>
                        <div class="doc-info">
                            <div class="doc-name"
                                 title="${doc.originalFilename}"
                                 ondblclick="window.conversationUI.documents.enableInlineEdit('${doc.id}')">
                                ${doc.originalFilename}
                            </div>
                            <div class="doc-meta">
                                <span class="doc-tag">${docTypeLabel}</span>
                                <span>${this.utils.formatFileSize(doc.fileSize)}</span>
                            </div>
                        </div>
                        <div class="doc-actions">
                            <button class="btn-icon-sm document-preview-btn" data-doc-id="${doc.id}" data-conv-id="${convId}" title="Preview">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn-icon-sm document-edit-btn" data-doc-id="${doc.id}" data-conv-id="${convId}" title="Edit">
                                <i class="fas fa-pen"></i>
                            </button>
                            <button class="btn-icon-sm document-download-btn" data-doc-id="${doc.id}" data-conv-id="${convId}" title="Download">
                                <i class="fas fa-download"></i>
                            </button>
                            <button class="btn-icon-sm delete document-delete-btn" data-doc-id="${doc.id}" data-conv-id="${convId}" title="Delete">
                                <i class="fas fa-trash-alt"></i>
                            </button>
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

    // Helper: Determine icon color class based on file type
    getDocIconType(mimeType, docType) {
        if (mimeType?.includes('pdf')) return 'pdf';
        if (mimeType?.includes('image')) return 'img';
        if (mimeType?.includes('sheet') || mimeType?.includes('csv') || mimeType?.includes('excel')) return 'xls';
        if (mimeType?.includes('word') || mimeType?.includes('doc')) return 'doc';
        if (docType === 'Bank Statement' || docType === '4 Months Bank Statement') return 'xls';
        if (docType === 'Tax Return') return 'pdf';
        return 'doc';
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

    setupDocumentActionListeners() {
        const documentsList = document.getElementById('documentsList');
        if (!documentsList) return;

        // Clear old listeners by cloning the node
        const newDocumentsList = documentsList.cloneNode(true);
        documentsList.parentNode.replaceChild(newDocumentsList, documentsList);

        // Event delegation for action buttons
        newDocumentsList.addEventListener('click', (event) => {
            const btn = event.target.closest('button');
            if (!btn) return;

            const docId = btn.dataset.docId;
            const convId = btn.dataset.convId;

            if (!docId) return;

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

        // 1. Get Button References
        const confirmBtn = document.getElementById('confirmUploadBtn');
        const cancelBtn = document.getElementById('cancelUploadBtn');

        if (!conversation) {
            this.utils.showNotification('No conversation selected', 'error');
            return;
        }

        // 2. UI LOCK: Disable buttons and show loading state
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
            confirmBtn.style.opacity = '0.7';
            confirmBtn.style.cursor = 'not-allowed';
        }
        if (cancelBtn) cancelBtn.style.display = 'none'; // Hide cancel during upload

        this.showUploadProgress(true);

        try {
            const uploadResults = [];
            const totalFiles = this.selectedFiles.length;

            for (let index = 0; index < totalFiles; index++) {
                // 3. Update Progress Bar
                this.updateProgressBar((index / totalFiles) * 100);

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

            // Finish Progress Bar
            this.updateProgressBar(100);

            const successCount = uploadResults.filter(r => r.success).length;
            const failedCount = uploadResults.filter(r => !r.success).length;

            if (successCount > 0) {
                this.utils.showNotification(
                    `${successCount} document(s) uploaded successfully!` +
                    (failedCount > 0 ? ` (${failedCount} failed)` : ''),
                    successCount === this.selectedFiles.length ? 'success' : 'warning'
                );
                // Wait a moment so user sees 100% bar
                setTimeout(() => {
                    this.loadDocuments();
                    this.cancelUpload();
                }, 500);
            } else {
                this.utils.showNotification('All uploads failed. Please try again.', 'error');
                // Re-enable button on total failure
                this.resetUploadButton(confirmBtn, cancelBtn);
            }
        } catch (error) {
            this.utils.handleError(error, 'Upload error', 'Upload failed. Please try again.');
            this.resetUploadButton(confirmBtn, cancelBtn);
        }
    }

    // Helper to reset button state if error occurs
    resetUploadButton(confirmBtn, cancelBtn) {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = 'Upload';
            confirmBtn.style.opacity = '1';
            confirmBtn.style.cursor = 'pointer';
        }
        if (cancelBtn) cancelBtn.style.display = 'inline-block';
        this.showUploadProgress(false);
    }

    // Helper to update progress bar width
    updateProgressBar(percentage) {
        const fill = document.getElementById('progressFill');
        if (fill) {
            fill.style.width = `${percentage}%`;
        }
    }

    cancelUpload() {
        document.getElementById('documentTypeSelection').classList.add('hidden');
        this.selectedFiles = [];
        document.getElementById('documentUpload').value = '';
    }

    showUploadProgress(show) {
        const progressBar = document.getElementById('uploadProgress');
        const uploadBar = document.getElementById('dragDropZone');

        if (progressBar) {
            // Toggle the class that makes it block/visible
            if (show) {
                progressBar.classList.add('active');
            } else {
                progressBar.classList.remove('active');
            }
        }

        if (uploadBar) {
            // Toggle the class that handles opacity and clicking
            if (show) {
                uploadBar.classList.add('is-uploading');
            } else {
                uploadBar.classList.remove('is-uploading');
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
                
                // ✅ NEW: Update Cache immediately
                const conversationId = this.parent.getCurrentConversationId();
                if (conversationId) {
                    this.documentsCache.set(conversationId, [...this.currentDocuments]);
                }
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

        // Selector matches the .doc-name element in card layout
        const nameElement = docRow.querySelector('.doc-name');
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

    // Template for documents tab - Clean Card Design
    createDocumentsTabTemplate(documents = []) {
        const conversationId = this.parent.getCurrentConversationId() || '';

        return `
            <div class="documents-section">
                <input type="file" id="documentUpload" multiple
                       accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.csv,.xlsx"
                       class="hidden">

                <div class="fcs-section hidden" id="fcsGenerationSection">
                    <div class="fcs-info">
                        <h4>📊 FCS Report</h4>
                        <p>Generate financial analysis from bank statements</p>
                    </div>
                    <button id="generateFCSBtn"
                            class="btn btn-primary btn-sm"
                            data-conversation-id="${conversationId}">
                        Generate
                    </button>
                </div>

                <div class="upload-bar" id="dragDropZone">
                    <div class="upload-bar-content">
                        <div class="upload-icon-small"><i class="fas fa-cloud-upload-alt"></i></div>
                        <div>
                            <div class="upload-text">Upload Documents</div>
                            <div class="upload-hint">Drag & drop or click to browse</div>
                        </div>
                    </div>
                    <div class="upload-hint">Max 50MB</div>
                </div>

                <div class="upload-progress-bar" id="uploadProgress">
                    <div class="upload-progress-fill" id="progressFill"></div>
                </div>

                <div class="document-type-selection hidden" id="documentTypeSelection">
                    <h4>Categorize Documents</h4>
                    <div class="type-selection-grid" id="typeSelectionGrid"></div>
                    <div class="type-selection-actions">
                        <button class="btn btn-primary btn-sm" id="confirmUploadBtn">Upload</button>
                        <button class="btn btn-secondary btn-sm" id="cancelUploadBtn">Cancel</button>
                    </div>
                </div>

                <div class="documents-list" id="documentsList">
                    <div class="loading-state" id="documentsLoading">
                        <div class="loading-spinner small"></div>
                        <span>Loading documents...</span>
                    </div>
                </div>
            </div>
        `;
    }
}
