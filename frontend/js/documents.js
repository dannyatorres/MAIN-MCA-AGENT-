// documents.js - Complete document management functionality

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
        // Document-specific initialization if needed
    }

    setupDocumentsEventListeners() {
        console.log('setupDocumentsEventListeners called');

        const dragDropZone = document.getElementById('dragDropZone');
        const fileInput = document.getElementById('documentUpload');
        const browseBtn = document.getElementById('browseFilesBtn');

        console.log('Elements found:', {
            dragDropZone: !!dragDropZone,
            fileInput: !!fileInput,
            browseBtn: !!browseBtn
        });

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
                    console.log('Browse button clicked');
                    fileInput.click();
                });
            }
            fileInput.addEventListener('change', (e) => {
                console.log('File input changed, files:', e.target.files.length);
                if (e.target.files.length > 0) {
                    this.handleFileSelection(Array.from(e.target.files));
                }
            });
        }
    }

    async loadDocuments() {
        const conversation = this.parent.getSelectedConversation();
        const conversationId = this.parent.getCurrentConversationId();

        console.log('=== DOCUMENTS LOADING DEBUG ===');
        console.log('Selected conversation:', conversation?.id);
        console.log('Parent current ID:', conversationId);
        console.log('================================');

        // Try to use conversation ID even if conversation object is null
        const targetId = conversation?.id || conversationId;

        if (!targetId) {
            console.error('❌ No conversation ID available, cannot load documents');
            this.renderDocumentsList([]);

            // Show user-friendly error in UI
            const documentsList = document.getElementById('documentsList');
            if (documentsList) {
                documentsList.innerHTML = `
                    <div class="error-state" style="text-align: center; padding: 40px;">
                        <div class="error-icon" style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                        <h4 style="color: #dc2626; margin-bottom: 8px;">No Conversation Selected</h4>
                        <p style="color: #6b7280;">Please select a conversation from the list to view documents.</p>
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

                // Show error in UI
                const documentsList = document.getElementById('documentsList');
                if (documentsList) {
                    documentsList.innerHTML = `
                        <div class="error-state" style="text-align: center; padding: 40px;">
                            <div class="error-icon" style="font-size: 48px; margin-bottom: 16px;">❌</div>
                            <h4 style="color: #dc2626; margin-bottom: 8px;">Failed to Load Documents</h4>
                            <p style="color: #6b7280; margin-bottom: 16px;">${result.error || 'Unknown error'}</p>
                            <button onclick="window.conversationUI.documents.loadDocuments()"
                                    class="btn btn-primary">
                                Retry
                            </button>
                        </div>
                    `;
                }
                this.renderDocumentsList([]);
            }
        } catch (error) {
            console.error('❌ Error loading documents:', error);

            // Show error in UI
            const documentsList = document.getElementById('documentsList');
            if (documentsList) {
                documentsList.innerHTML = `
                    <div class="error-state" style="text-align: center; padding: 40px;">
                        <div class="error-icon" style="font-size: 48px; margin-bottom: 16px;">❌</div>
                        <h4 style="color: #dc2626; margin-bottom: 8px;">Error Loading Documents</h4>
                        <p style="color: #6b7280; margin-bottom: 8px;">${error.message}</p>
                        <p style="color: #9ca3af; font-size: 14px; margin-bottom: 16px;">Check console for details</p>
                        <button onclick="window.conversationUI.documents.loadDocuments()"
                                class="btn btn-primary">
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

        console.log('Documents to render:', docs.length);

        if (!conversationId) {
            console.error('No conversation ID available for document actions');
            this.documentsNeedRefresh = true;
        }

        if (docs.length === 0) {
            documentsList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📄</div>
                    <h4>No documents uploaded</h4>
                    <p>Upload bank statements, tax returns, and other documents for this lead</p>
                </div>
            `;
            return;
        }

        const htmlContent = `
            <div class="documents-table">
                <div class="documents-table-header">
                    <div class="doc-col-name">Name</div>
                    <div class="doc-col-size">Size</div>
                    <div class="doc-col-actions">Actions</div>
                </div>
                ${docs.map(doc => {
                    const convId = conversationId || doc.conversation_id || '';
                    return `
                    <div class="document-row" data-document-id="${doc.id}" data-conversation-id="${convId}" data-type="${doc.documentType}">
                        <div class="doc-col-name">
                            <div class="doc-icon">${this.getDocumentIconCompact(doc.mimeType, doc.documentType)}</div>
                            <div class="document-name-compact"
                                 contenteditable="false"
                                 data-original="${doc.originalFilename}"
                                 data-document-id="${doc.id}"
                                 ondblclick="window.conversationUI.documents.enableInlineEdit('${doc.id}')"
                                 title="Double-click to edit name"
                                 style="min-width: 200px; overflow: visible; color: black !important; cursor: pointer;">
                                ${doc.originalFilename}
                            </div>
                        </div>
                        <div class="doc-col-size">${this.utils.formatFileSize(doc.fileSize)}</div>
                        <div class="doc-col-actions">
                            <button class="btn-action document-edit-btn" data-doc-id="${doc.id}" data-conv-id="${convId}" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-action document-preview-btn" data-doc-id="${doc.id}" data-conv-id="${convId}" title="Preview">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn-action document-download-btn" data-doc-id="${doc.id}" data-conv-id="${convId}" title="Download">
                                <i class="fas fa-download"></i>
                            </button>
                            <button class="btn-action btn-danger-compact document-delete-btn" data-doc-id="${doc.id}" data-conv-id="${convId}" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        `;

        documentsList.innerHTML = htmlContent;
        this.setupDocumentActionListeners();

        const loading = document.getElementById('documentsLoading');
        if (loading) loading.style.display = 'none';
    }

    setupDocumentActionListeners() {
        const documentsList = document.getElementById('documentsList');
        if (!documentsList) return;

        // Remove existing listeners to prevent duplicates
        documentsList.replaceWith(documentsList.cloneNode(true));
        const newDocumentsList = document.getElementById('documentsList');

        // Add click event delegation
        newDocumentsList.addEventListener('click', (event) => {
            const target = event.target.closest('button');
            if (!target) return;

            const docId = target.dataset.docId;
            const convId = target.dataset.convId;

            // Ensure conversation context
            if (convId && !this.parent.getCurrentConversationId()) {
                this.parent.currentConversationId = convId;
            }

            if (target.classList.contains('document-edit-btn')) {
                this.editDocument(docId);
            } else if (target.classList.contains('document-preview-btn')) {
                this.previewDocument(docId);
            } else if (target.classList.contains('document-download-btn')) {
                this.downloadDocument(docId);
            } else if (target.classList.contains('document-delete-btn')) {
                this.deleteDocument(docId);
            }
        });
    }

    handleFileSelection(files) {
        console.log('handleFileSelection called with files:', files);
        const validFiles = this.validateFiles(files);
        console.log('Valid files after validation:', validFiles);
        if (validFiles.length === 0) {
            console.log('No valid files, returning');
            return;
        }

        // Append to existing files instead of replacing them
        this.selectedFiles = [...this.selectedFiles, ...validFiles];
        console.log('Total selected files:', this.selectedFiles.length);
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

        typeSelectionDiv.style.display = 'block';

        document.getElementById('confirmUploadBtn').onclick = () => this.confirmUpload();
        document.getElementById('cancelUploadBtn').onclick = () => this.cancelUpload();
    }

    async confirmUpload() {
        console.log('confirmUpload called');
        const typeSelects = document.querySelectorAll('.file-type-select-compact');
        const autoProcessChecks = document.querySelectorAll('.auto-process-checkbox');
        const conversation = this.parent.getSelectedConversation();

        if (!conversation) {
            this.utils.showNotification('No conversation selected', 'error');
            return;
        }

        this.showUploadProgress(true);

        try {
            // Upload files one by one to S3
            const uploadResults = [];

            for (let index = 0; index < this.selectedFiles.length; index++) {
                const file = this.selectedFiles[index];
                const documentType = typeSelects[index] ? typeSelects[index].value : 'Other';

                console.log(`Uploading file ${index + 1}/${this.selectedFiles.length}: ${file.name}, type: ${documentType}`);

                // Create FormData for single file upload
                const formData = new FormData();
                formData.append('file', file);  // Changed from 'documents' to 'file'
                formData.append('conversation_id', conversation.id);  // Changed from 'conversationId'
                formData.append('document_type', documentType);  // Changed from 'documentType_{index}'

                // Upload to S3 via /api/documents/upload
                const response = await fetch(`${this.parent.apiBaseUrl}/api/documents/upload`, {
                    method: 'POST',
                    headers: {
                        'Authorization': this.parent.apiAuth
                        // NO Content-Type! Browser sets it automatically for FormData
                    },
                    body: formData
                });

                if (!response.ok) {
                    console.error(`Upload failed for ${file.name}: ${response.status}`);
                    uploadResults.push({ success: false, filename: file.name });
                    continue;
                }

                const result = await response.json();

                if (result.success) {
                    console.log(`✅ Uploaded to S3: ${result.s3_url}`);
                    uploadResults.push({ success: true, filename: file.name, document: result.document });
                } else {
                    uploadResults.push({ success: false, filename: file.name });
                }
            }

            const successCount = uploadResults.filter(r => r.success).length;
            const failedCount = uploadResults.filter(r => !r.success).length;

            if (successCount > 0) {
                this.utils.showNotification(
                    `${successCount} document(s) uploaded successfully to S3!` +
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
        document.getElementById('documentTypeSelection').style.display = 'none';
        this.selectedFiles = [];
        document.getElementById('documentUpload').value = '';
    }

    showUploadProgress(show) {
        const progressDiv = document.getElementById('uploadProgress');
        const dragDropContent = document.querySelector('.drag-drop-content');

        if (progressDiv && dragDropContent) {
            progressDiv.style.display = show ? 'block' : 'none';
            dragDropContent.style.display = show ? 'none' : 'block';
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

        const modalHtml = `
            <div id="editDocumentModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;" onclick="this.remove()">
                <div style="background: white; border-radius: 8px; padding: 0; max-width: 500px; width: 90%; max-height: 80vh; overflow: auto;" onclick="event.stopPropagation()">
                    <div style="padding: 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; color: #333;">Edit Document</h3>
                        <button onclick="document.getElementById('editDocumentModal').remove()" style="background: none; border: none; font-size: 24px; color: #666; cursor: pointer;">×</button>
                    </div>
                    <div style="padding: 20px;">
                        <div style="margin-bottom: 20px;">
                            <label for="editDocumentName" style="display: block; margin-bottom: 5px; font-weight: 600; color: #333;">Document Name:</label>
                            <div style="display: flex; align-items: center; gap: 5px;">
                                <input type="text" id="editDocumentName" value="${nameWithoutExtension}" style="flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                                ${fileExtension ? `<span style="color: #666; font-weight: 500; padding: 8px; background: #f8f9fa; border-radius: 4px; border: 1px solid #ddd;">${fileExtension}</span>` : ''}
                            </div>
                            <small style="color: #666; font-size: 12px; margin-top: 5px; display: block;">File extension will be preserved automatically</small>
                            <input type="hidden" id="editDocumentExtension" value="${fileExtension}">
                        </div>
                        <div style="margin-bottom: 20px;">
                            <label for="editDocumentType" style="display: block; margin-bottom: 5px; font-weight: 600; color: #333;">Document Type:</label>
                            <select id="editDocumentType" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
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
                    <div style="padding: 20px; border-top: 1px solid #eee; display: flex; gap: 10px; justify-content: flex-end;">
                        <button id="cancelEditModal" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">Cancel</button>
                        <button id="saveDocumentEdit" data-document-id="${documentId}" style="padding: 8px 16px; border: none; background: #007bff; color: white; border-radius: 4px; cursor: pointer;">Save Changes</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Add event listeners after modal is inserted
        const modal = document.getElementById('editDocumentModal');
        const closeBtn = document.getElementById('closeEditModal');
        const cancelBtn = document.getElementById('cancelEditModal');
        const saveBtn = document.getElementById('saveDocumentEdit');

        const closeModal = () => {
            modal.remove();
        };

        // Close button (if exists)
        if (closeBtn) {
            closeBtn.addEventListener('click', closeModal);
        }

        // Cancel button
        cancelBtn.addEventListener('click', closeModal);

        // Click outside modal
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        // Save button - THIS IS THE KEY FIX
        saveBtn.addEventListener('click', () => {
            console.log('Save button clicked for document:', documentId);
            this.saveDocumentEdit(documentId);
        });
    }

    async saveDocumentEdit(documentId) {
        console.log('saveDocumentEdit called with documentId:', documentId);

        const nameInput = document.getElementById('editDocumentName');
        const typeSelect = document.getElementById('editDocumentType');
        const extensionInput = document.getElementById('editDocumentExtension');

        console.log('Form elements found:', {
            nameInput: !!nameInput,
            typeSelect: !!typeSelect,
            extensionInput: !!extensionInput
        });

        if (!nameInput || !typeSelect) {
            this.utils.showNotification('Required form elements not found', 'error');
            return;
        }

        const newNameWithoutExtension = nameInput.value.trim();
        const fileExtension = extensionInput ? extensionInput.value : '';
        const newType = typeSelect.value;

        console.log('Form values:', {
            newNameWithoutExtension,
            fileExtension,
            newType
        });

        if (!newNameWithoutExtension) {
            this.utils.showNotification('Document name cannot be empty', 'error');
            return;
        }

        const newName = newNameWithoutExtension + fileExtension;

        // Update the local document data immediately for better UX
        if (this.currentDocuments) {
            const docIndex = this.currentDocuments.findIndex(d => d.id === documentId);
            if (docIndex !== -1) {
                this.currentDocuments[docIndex].originalFilename = newName;
                this.currentDocuments[docIndex].documentType = newType;
            }
        }

        // Get conversation ID from current context
        const conversation = this.parent.getSelectedConversation();

        console.log('Conversation context:', {
            hasConversation: !!conversation,
            conversationId: conversation?.id
        });

        if (!conversation) {
            this.utils.showNotification('No conversation selected', 'error');
            return;
        }

        // Save to server with correct endpoint
        try {
            console.log('Sending update request...');
            const result = await this.parent.apiCall(`/api/conversations/${conversation.id}/documents/${documentId}`, {
                method: 'PUT',
                body: JSON.stringify({
                    filename: newName,
                    documentType: newType
                })
            });

            console.log('Response data:', result);

            if (result.success) {
                // Update the UI after successful server update
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

            // Revert the local changes on error
            if (this.currentDocuments) {
                const docIndex = this.currentDocuments.findIndex(d => d.id === documentId);
                if (docIndex !== -1) {
                    // Reload from server to get original data
                    await this.loadDocuments();
                }
            }
        }
    }

    enableInlineEdit(documentId) {
        const docRow = document.querySelector(`[data-document-id="${documentId}"]`);
        if (!docRow) return;

        const nameElement = docRow.querySelector('.document-name-compact');
        if (!nameElement) return;

        const originalName = nameElement.textContent.trim();
        nameElement.contentEditable = 'true';
        nameElement.style.backgroundColor = '#fff3cd';
        nameElement.style.padding = '4px';
        nameElement.style.borderRadius = '4px';
        nameElement.focus();

        const range = document.createRange();
        range.selectNodeContents(nameElement);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        const saveEdit = async () => {
            const newName = nameElement.textContent.trim();
            nameElement.contentEditable = 'false';
            nameElement.style.backgroundColor = '';

            if (newName && newName !== originalName) {
                // Save to backend - don't revert here
                this.saveDocumentRename(documentId, newName, originalName, nameElement);
            } else {
                // Only revert if name is empty or unchanged
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
            nameElement.style.opacity = '0.6';
            this.utils.showNotification('Renaming document...', 'info');

            // Try the simple endpoint first (more reliable)
            const result = await this.parent.apiCall(`/api/documents/${documentId}`, {
                method: 'PUT',
                body: JSON.stringify({
                    filename: newName
                })
            });

            if (result.success) {
                // Update local cache immediately
                const docIndex = this.currentDocuments.findIndex(d => d.id === documentId);
                if (docIndex !== -1) {
                    this.currentDocuments[docIndex].originalFilename = newName;
                    this.currentDocuments[docIndex].original_filename = newName;
                }

                // Update the DOM element
                nameElement.textContent = newName;
                nameElement.style.opacity = '1';

                this.utils.showNotification('Document renamed successfully', 'success');

            } else {
                throw new Error(result.error || result.message || 'Failed to rename document');
            }
        } catch (error) {
            console.error('Error renaming document:', error);
            nameElement.textContent = originalName;
            nameElement.style.opacity = '1';
            this.utils.showNotification(`Failed to rename: ${error.message}`, 'error');
        }
    }

    async previewDocument(documentId) {
        console.log('👁️ Preview clicked for:', documentId);

        const conversation = this.parent.getSelectedConversation();
        let conversationId = conversation?.id || this.parent.getCurrentConversationId() ||
                          this.getConversationIdFromDocument(documentId);

        if (!conversationId) {
            console.error('No conversation ID available');
            this.utils.showNotification('Unable to determine conversation context', 'error');
            return;
        }

        // 1. Construct the direct file URL (This is the actual PDF/Image)
        // We add a timestamp to prevent caching issues
        const directFileUrl = `${this.apiBaseUrl}/api/conversations/${conversationId}/documents/${documentId}/preview?t=${Date.now()}`;
        console.log('🔗 Target URL:', directFileUrl);

        try {
            this.utils.showNotification('Opening document...', 'info');

            // 2. Try to open immediately (Best for Pop-up blockers)
            // We do this BEFORE any await/fetch to satisfy "User Activation" rules
            const newWindow = window.open(directFileUrl, '_blank');

            if (newWindow) {
                // Success! The window opened.
                newWindow.focus();
                console.log('✅ Window opened successfully');
            } else {
                // Failed! Pop-up blocker active.
                console.warn('⚠️ Pop-up blocked. Falling back to current tab.');
                this.utils.showNotification('Pop-up blocked. Opening in current tab...', 'warning');
                window.location.href = directFileUrl;
            }

        } catch (error) {
            console.error('Preview error:', error);
            this.utils.showNotification('Preview failed: ' + error.message, 'error');
        }
    }

    async downloadDocument(documentId) {
        const conversation = this.parent.getSelectedConversation();
        let conversationId = conversation?.id || this.parent.getCurrentConversationId() ||
                          this.getConversationIdFromDocument(documentId);

        if (!conversationId) {
            console.error('No conversation ID available');
            this.utils.showNotification('Unable to determine conversation context', 'error');
            return;
        }

        console.log('Downloading document:', documentId, 'from conversation:', conversationId);

        try {
            // Build the download URL
            const downloadUrl = `${this.apiBaseUrl}/api/conversations/${conversationId}/documents/${documentId}/download`;

            console.log('Download URL:', downloadUrl);

            // Create a temporary link and trigger download
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = ''; // Let the server set the filename via Content-Disposition
            link.style.display = 'none';

            document.body.appendChild(link);
            link.click();

            // Clean up
            setTimeout(() => {
                document.body.removeChild(link);
            }, 100);

            this.utils.showNotification('Download started', 'success');

        } catch (error) {
            console.error('Download error:', error);
            this.utils.showNotification('Download failed: ' + error.message, 'error');
        }
    }

    async deleteDocument(documentId) {
        const conversation = this.parent.getSelectedConversation();
        let conversationId = conversation?.id || this.parent.getCurrentConversationId() ||
                          this.getConversationIdFromDocument(documentId);

        if (!conversationId) {
            console.error('No conversation ID available');
            this.utils.showNotification('Unable to determine conversation context', 'error');
            return;
        }

        if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
            return;
        }

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
            console.error('Delete error:', error);
            this.utils.showNotification('Delete failed: ' + error.message, 'error');
        }
    }

    getConversationIdFromDocument(documentId) {
        if (this.currentDocuments) {
            const doc = this.currentDocuments.find(d => d.id === documentId);
            if (doc && doc.conversation_id) {
                return doc.conversation_id;
            }
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
            fcsSection.style.display = 'block';
        } else {
            fcsSection.style.display = 'none';
        }
    }

    updateDocumentsSummary() {
        const summaryDiv = document.getElementById('documentsSummary');
        if (!summaryDiv || !this.currentDocuments) return;
        summaryDiv.style.display = 'none';
    }

    updateDocumentProcessingStatus(documentId, status, error) {
        const documentElement = document.querySelector(`[data-document-id="${documentId}"]`);
        if (!documentElement) return;

        const statusElement = documentElement.querySelector('.document-status') ||
                             documentElement.querySelector('.doc-col-status');

        if (statusElement) {
            switch (status) {
                case 'processing':
                    statusElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
                    statusElement.className = 'doc-col-status processing';
                    break;
                case 'completed':
                    statusElement.innerHTML = '<i class="fas fa-check text-success"></i> Processed';
                    statusElement.className = 'doc-col-status processed';
                    break;
                case 'failed':
                    statusElement.innerHTML = '<i class="fas fa-times text-danger"></i> Failed';
                    statusElement.className = 'doc-col-status failed';
                    if (error) {
                        statusElement.title = error;
                    }
                    break;
            }
        }
    }

    // Template for documents tab
    createDocumentsTabTemplate(documents = []) {
        const conversationId = this.parent.getCurrentConversationId() || '';

        return `
            <div class="documents-section">
                <div class="documents-header">
                    <h3>Documents</h3>
                    <input type="file" id="documentUpload" multiple
                           accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.csv,.xlsx"
                           style="display: none;">
                </div>

                <div class="fcs-generation-section" id="fcsGenerationSection" style="display: block; margin-bottom: 20px; padding: 15px; background: #f0f9ff; border-radius: 8px; border: 1px solid #0ea5e9;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h4 style="margin: 0; color: #0369a1; display: flex; align-items: center; gap: 8px;">
                                📊 FCS Report Generation
                            </h4>
                            <p style="margin: 5px 0 0 0; color: #64748b; font-size: 0.85rem;">
                                Generate financial analysis from uploaded bank statements
                            </p>
                        </div>
                        <button id="generateFCSBtn"
                                class="btn btn-primary"
                                data-conversation-id="${conversationId}"
                                style="display: flex; align-items: center; gap: 8px; padding: 10px 16px;">
                            📈 Generate FCS Report
                        </button>
                    </div>
                </div>

                <div class="drag-drop-zone" id="dragDropZone">
                    <div class="drag-drop-content">
                        <div class="drag-drop-icon">📎</div>
                        <h4>Drag & Drop Documents Here</h4>
                        <p>Or <button type="button" class="link-btn" id="browseFilesBtn">browse files</button></p>
                        <p class="drag-drop-hint">
                            Supports: PDF, JPG, PNG, DOC, DOCX, CSV, XLSX (Max 50MB each)
                        </p>
                    </div>
                    <div class="upload-progress" id="uploadProgress" style="display: none;">
                        <div class="progress-bar">
                            <div class="progress-fill" id="progressFill"></div>
                        </div>
                        <div class="progress-text" id="progressText">Uploading...</div>
                    </div>
                </div>

                <div class="document-type-selection" id="documentTypeSelection" style="display: none;">
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

                <div class="documents-summary" id="documentsSummary" style="display: none;"></div>
            </div>
        `;
    }
}