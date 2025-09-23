// documents.js - Complete document management functionality

export default class DocumentsModule {
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
        if (!conversation) return;

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conversation.id}/documents`);
            const result = await response.json();

            if (result.success) {
                this.currentDocuments = (result.documents || []).map(doc => this.normalizeDocumentFields(doc));
                this.renderDocumentsList();
                this.updateDocumentsSummary();
                this.toggleFCSGenerationSection();
            } else {
                console.error('Failed to load documents:', result.error);
                this.renderDocumentsList([]);
            }
        } catch (error) {
            console.error('Error loading documents:', error);
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

        this.selectedFiles = validFiles;
        console.log('Showing document type selection');
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

        const formData = new FormData();
        formData.append('conversationId', conversation.id);

        this.selectedFiles.forEach((file, index) => {
            formData.append('documents', file);

            const documentType = typeSelects[index] ? typeSelects[index].value : 'Other';
            const autoProcess = autoProcessChecks[index] ? autoProcessChecks[index].checked : false;

            formData.append(`documentType_${index}`, documentType);
            formData.append(`autoProcess_${index}`, autoProcess);

            console.log(`File ${index}: ${file.name}, type: ${documentType}, autoProcess: ${autoProcess}`);
        });

        this.showUploadProgress(true);

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conversation.id}/documents/upload`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                const successCount = result.results ?
                    result.results.filter(r => r.success).length :
                    (result.documents ? result.documents.length : 1);

                this.utils.showNotification(`${successCount} document(s) uploaded successfully!`, 'success');
                this.loadDocuments();
                this.cancelUpload();
            } else {
                this.utils.showNotification(`Upload failed: ${result.error}`, 'error');
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
                        <button onclick="document.getElementById('editDocumentModal').remove()" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">Cancel</button>
                        <button onclick="window.conversationUI.documents.saveDocumentEdit('${documentId}')" style="padding: 8px 16px; border: none; background: #007bff; color: white; border-radius: 4px; cursor: pointer;">Save Changes</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async saveDocumentEdit(documentId) {
        const nameInput = document.getElementById('editDocumentName');
        const typeSelect = document.getElementById('editDocumentType');
        const extensionInput = document.getElementById('editDocumentExtension');

        if (!nameInput || !typeSelect) {
            this.utils.showNotification('Required form elements not found', 'error');
            return;
        }

        const newNameWithoutExtension = nameInput.value.trim();
        const fileExtension = extensionInput ? extensionInput.value : '';
        const newType = typeSelect.value;

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

        // Update the UI immediately
        this.renderDocumentsList();
        document.getElementById('editDocumentModal').remove();
        this.utils.showNotification('Document name updated locally', 'success');

        // Note: Server-side update is disabled due to database constraints
        // In a production environment, you would implement proper backend support
        console.log('Document updated locally:', {
            documentId,
            newName,
            newType
        });
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
                // Update local data immediately
                if (this.currentDocuments) {
                    const doc = this.currentDocuments.find(d => d.id === documentId);
                    if (doc) {
                        doc.originalFilename = newName;
                    }
                }
                this.utils.showNotification('Document name updated locally', 'success');
                console.log('Document renamed locally:', { documentId, oldName: originalName, newName });
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

    async previewDocument(documentId) {
        const conversation = this.parent.getSelectedConversation();
        let conversationId = conversation?.id || this.parent.getCurrentConversationId() ||
                          this.getConversationIdFromDocument(documentId);

        if (!conversationId) {
            console.error('No conversation ID available');
            this.utils.showNotification('Unable to determine conversation context', 'error');
            return;
        }

        try {
            // First try to open the direct file URL (for PDF viewing)
            const directFileUrl = `${this.apiBaseUrl}/api/conversations/${conversationId}/documents/${documentId}/file`;
            console.log('Attempting to open direct file URL:', directFileUrl);

            // Check if the file is available by making a HEAD request
            try {
                const response = await fetch(directFileUrl, { method: 'HEAD' });

                if (response.ok) {
                    // File exists, open it directly (PDF will display in browser)
                    window.open(directFileUrl, '_blank');
                    this.utils.showNotification('Opening document...', 'success');
                    return;
                }
            } catch (headError) {
                console.log('Direct file not available, falling back to preview page');
            }

            // Fall back to HTML preview if direct file isn't available
            const previewUrl = `${this.apiBaseUrl}/api/conversations/${conversationId}/documents/${documentId}/preview`;
            console.log('Opening preview URL:', previewUrl);

            // Open in new tab without window parameters to avoid popup window
            const newWindow = window.open(previewUrl, '_blank');

            if (newWindow) {
                this.utils.showNotification('Opening document preview in new tab', 'success');
            } else {
                this.utils.showNotification('Please allow popups to preview documents', 'warning');
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

        try {
            // First check if download is available
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conversationId}/documents/${documentId}/download`);
            const result = await response.json();

            if (!result.success) {
                this.utils.showNotification(result.message || 'File not available for download', 'warning');
                return;
            }

            // If successful, proceed with download
            const downloadUrl = `${this.apiBaseUrl}/api/conversations/${conversationId}/documents/${documentId}/download`;
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = '';
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();

            setTimeout(() => {
                document.body.removeChild(link);
            }, 100);

            this.utils.showNotification('Download started', 'success');
        } catch (error) {
            console.error('Download error:', error);
            this.utils.showNotification('Download failed: File not available on server', 'error');
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
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conversationId}/documents/${documentId}`, {
                method: 'DELETE'
            });

            const result = await response.json();

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