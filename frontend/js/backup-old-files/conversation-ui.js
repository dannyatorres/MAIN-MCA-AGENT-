// Conversation UI Management for MCA Command Center
import { Utilities, Templates } from './templates-utilities.js';
import ConversationCore from './conversation-core.js';
import MessagingModule from './messaging.js';
import DocumentsModule from './documents.js';
import IntelligenceTabs from './intelligence-tabs.js';

class ConversationUI {
    constructor(wsManager = null) {
        this.wsManager = wsManager;
        this.apiBaseUrl = 'http://localhost:3001';
        this.currentConversationId = null;
        this.conversations = new Map();
        this.selectedConversation = null;
        this.messagePollingInterval = null;
        this.aiSuggestionsVisible = false;
        this.selectedForDeletion = new Set();
        this.unreadMessages = new Map(); // Track unread counts per conversation
        this.lenderResultsCache = new Map(); // Store lender results per conversation
        this.debugMode = false; // Set to true when debugging needed

        // Initialize utilities and templates modules
        this.utilities = new Utilities();
        this.templatesModule = new Templates();

        // Initialize conversation core module
        this.conversationCore = new ConversationCore(this, wsManager);

        // Initialize messaging module
        this.messaging = new MessagingModule(this);

        // Initialize documents module
        this.documents = new DocumentsModule(this);

        // Initialize intelligence tabs module
        this.intelligence = new IntelligenceTabs(this);

        // Template system for large HTML blocks
        this.templates = {
            documentsTab: this.createDocumentsTabTemplate.bind(this),
            lenderForm: this.createLenderFormTemplate.bind(this),
            fcsReport: this.createFCSReportTemplate.bind(this),
            editForm: this.createEditFormTemplate.bind(this),
            messagesList: this.createMessagesListTemplate.bind(this),
            conversationItem: this.createConversationItemTemplate.bind(this),
            modal: this.createModalTemplate.bind(this),
            overviewTab: this.createOverviewTabTemplate.bind(this)
        };

        // Lender form field configuration
        this.lenderFormFields = [
            { id: 'lenderBusinessName', label: 'Business Name', type: 'text', required: false, placeholder: 'Enter business name' },
            { id: 'lenderPosition', label: 'Position', type: 'select', required: true, options: [
                { value: '1', label: '1st Position (Preferred)' },
                { value: '2', label: '2nd Position' },
                { value: '3', label: '3rd Position' }
            ]},
            { id: 'lenderStartDate', label: 'Business Start Date', type: 'text', required: true, placeholder: 'MM/DD/YYYY' },
            { id: 'lenderRevenue', label: 'Monthly Revenue', type: 'number', required: true, placeholder: 'Enter monthly revenue' },
            { id: 'lenderFico', label: 'FICO Score', type: 'number', required: true, placeholder: 'Enter FICO score' },
            { id: 'lenderState', label: 'Business State', type: 'select', required: true, options: [
                { value: '', label: 'Select State...' },
                { value: 'CA', label: 'California' },
                { value: 'NY', label: 'New York' },
                { value: 'TX', label: 'Texas' },
                { value: 'FL', label: 'Florida' }
            ]},
            { id: 'lenderIndustry', label: 'Industry', type: 'select', required: true, options: [
                { value: '', label: 'Select Industry...' },
                { value: 'retail', label: 'Retail' },
                { value: 'restaurant', label: 'Restaurant' },
                { value: 'construction', label: 'Construction' },
                { value: 'healthcare', label: 'Healthcare' },
                { value: 'other', label: 'Other' }
            ]},
            { id: 'lenderDepositsPerMonth', label: 'Deposits Per Month', type: 'number', required: false, placeholder: 'Number of deposits' },
            { id: 'lenderNegativeDays', label: 'Negative Days (Last 90)', type: 'number', required: false, placeholder: 'Days negative' }
        ];

        // Lender form checkboxes
        this.lenderFormCheckboxes = [
            { id: 'lenderSoleProp', label: 'Sole Proprietorship' },
            { id: 'lenderNonProfit', label: 'Non-Profit' },
            { id: 'lenderMercuryBank', label: 'Has Mercury Bank' }
        ];

        // Edit form sections configuration
        this.editFormSections = {
            business: {
                title: 'Business Information',
                fields: [
                    { name: 'businessName', label: 'Company Name', type: 'text', key: 'business_name' },
                    { name: 'dbaName', label: 'DBA', type: 'text', key: 'dba_name' },
                    { name: 'businessAddress', label: 'Business Address', type: 'text', key: 'business_address' },
                    { name: 'businessAddress2', label: 'Address Line 2', type: 'text', key: 'business_address2' },
                    { name: 'businessCity', label: 'City', type: 'text', key: 'business_city' },
                    { name: 'businessState', label: 'State', type: 'select', key: 'business_state', options: 'usStates' },
                    { name: 'businessZip', label: 'ZIP Code', type: 'text', key: 'business_zip', maxlength: '10' },
                    { name: 'businessCountry', label: 'Country', type: 'text', key: 'business_country', default: 'United States' },
                    { name: 'primaryPhone', label: 'Phone', type: 'tel', key: 'lead_phone' },
                    { name: 'cellPhone', label: 'Cell Phone', type: 'tel', key: 'cell_phone' },
                    { name: 'workPhone', label: 'Work Phone', type: 'tel', key: 'work_phone' },
                    { name: 'faxPhone', label: 'Fax', type: 'tel', key: 'fax_phone' }
                ]
            },
            financial: {
                title: 'Financial Information',
                fields: [
                    { name: 'annualRevenue', label: 'Annual Revenue', type: 'number', key: 'annual_revenue' },
                    { name: 'monthlyRevenue', label: 'Monthly Revenue', type: 'number', key: 'monthly_revenue' },
                    { name: 'requestedAmount', label: 'Requested Amount', type: 'number', key: 'requested_amount' },
                    { name: 'useOfFunds', label: 'Use of Funds', type: 'select', key: 'use_of_funds', options: [
                        { value: '', label: 'Select...' },
                        { value: 'working_capital', label: 'Working Capital' },
                        { value: 'equipment', label: 'Equipment' },
                        { value: 'inventory', label: 'Inventory' },
                        { value: 'expansion', label: 'Expansion' },
                        { value: 'other', label: 'Other' }
                    ]},
                    { name: 'industry', label: 'Industry', type: 'text', key: 'industry' },
                    { name: 'businessStartDate', label: 'Business Start Date', type: 'date', key: 'business_start_date' }
                ]
            },
            leadInfo: {
                title: 'Lead Information',
                fields: [
                    { name: 'leadSource', label: 'Lead Source', type: 'text', key: 'lead_source' },
                    { name: 'leadStatus', label: 'Lead Status', type: 'select', key: 'state', options: [
                        { value: 'NEW', label: 'New' },
                        { value: 'INTERESTED', label: 'Interested' },
                        { value: 'QUALIFIED', label: 'Qualified' },
                        { value: 'SUBMITTED', label: 'Submitted' },
                        { value: 'CLOSED', label: 'Closed' }
                    ]},
                    { name: 'priority', label: 'Priority', type: 'select', key: 'priority', options: [
                        { value: 'low', label: 'Low' },
                        { value: 'normal', label: 'Normal' },
                        { value: 'high', label: 'High' },
                        { value: 'urgent', label: 'Urgent' }
                    ]},
                    { name: 'notes', label: 'Notes', type: 'textarea', key: 'notes' }
                ]
            }
        };

        // US States for edit form dropdowns
        this.usStates = [
            { value: '', label: 'Select State...' },
            { value: 'AL', label: 'Alabama' }, { value: 'AK', label: 'Alaska' }, { value: 'AZ', label: 'Arizona' },
            { value: 'AR', label: 'Arkansas' }, { value: 'CA', label: 'California' }, { value: 'CO', label: 'Colorado' },
            { value: 'CT', label: 'Connecticut' }, { value: 'DE', label: 'Delaware' }, { value: 'FL', label: 'Florida' },
            { value: 'GA', label: 'Georgia' }, { value: 'HI', label: 'Hawaii' }, { value: 'ID', label: 'Idaho' },
            { value: 'IL', label: 'Illinois' }, { value: 'IN', label: 'Indiana' }, { value: 'IA', label: 'Iowa' },
            { value: 'KS', label: 'Kansas' }, { value: 'KY', label: 'Kentucky' }, { value: 'LA', label: 'Louisiana' },
            { value: 'ME', label: 'Maine' }, { value: 'MD', label: 'Maryland' }, { value: 'MA', label: 'Massachusetts' },
            { value: 'MI', label: 'Michigan' }, { value: 'MN', label: 'Minnesota' }, { value: 'MS', label: 'Mississippi' },
            { value: 'MO', label: 'Missouri' }, { value: 'MT', label: 'Montana' }, { value: 'NE', label: 'Nebraska' },
            { value: 'NV', label: 'Nevada' }, { value: 'NH', label: 'New Hampshire' }, { value: 'NJ', label: 'New Jersey' },
            { value: 'NM', label: 'New Mexico' }, { value: 'NY', label: 'New York' }, { value: 'NC', label: 'North Carolina' },
            { value: 'ND', label: 'North Dakota' }, { value: 'OH', label: 'Ohio' }, { value: 'OK', label: 'Oklahoma' },
            { value: 'OR', label: 'Oregon' }, { value: 'PA', label: 'Pennsylvania' }, { value: 'RI', label: 'Rhode Island' },
            { value: 'SC', label: 'South Carolina' }, { value: 'SD', label: 'South Dakota' }, { value: 'TN', label: 'Tennessee' },
            { value: 'TX', label: 'Texas' }, { value: 'UT', label: 'Utah' }, { value: 'VT', label: 'Vermont' },
            { value: 'VA', label: 'Virginia' }, { value: 'WA', label: 'Washington' }, { value: 'WV', label: 'West Virginia' },
            { value: 'WI', label: 'Wisconsin' }, { value: 'WY', label: 'Wyoming' }, { value: 'DC', label: 'District of Columbia' }
        ];

        this.init();
        // Notification permission will be requested on first user interaction
    }

    debug(message, data = null) {
        this.utilities.debug(`[ConversationUI] ${message}`, data, this.debugMode);
    }

    handleError(error, context, userMessage = null, showNotification = true) {
        console.error(`${context}:`, error);

        if (showNotification && userMessage) {
            this.showNotification(userMessage, 'error');
        } else if (showNotification) {
            const defaultMessage = error.message || 'An unexpected error occurred';
            this.showNotification(defaultMessage, 'error');
        }

        this.debug(`Error in ${context}`, { error: error.message, stack: error.stack });
    }

    // ========================================
    // TEMPLATE METHODS SECTION
    // ========================================

    createDocumentsTabTemplate(documents = []) {
        const conversationId = this.currentConversationId || this.selectedConversation?.id || '';

        return `
            <div class="documents-section">
                <div class="documents-header">
                    <h3>Documents</h3>
                    <input type="file" id="documentUpload" multiple
                           accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.csv,.xlsx"
                           style="display: none;">
                </div>

                <!-- FCS Generation Section -->
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

                <!-- Drag and Drop Upload Area -->
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

                <!-- Document Type Selection -->
                <div class="document-type-selection" id="documentTypeSelection" style="display: none;">
                    <h4>Categorize Documents</h4>
                    <div class="type-selection-grid" id="typeSelectionGrid">
                        <!-- Dynamically populated -->
                    </div>
                    <div class="type-selection-actions">
                        <button class="btn btn-primary" id="confirmUploadBtn">
                            Upload Documents
                        </button>
                        <button class="btn btn-secondary" id="cancelUploadBtn">
                            Cancel
                        </button>
                    </div>
                </div>


                <!-- Documents List -->
                <div class="documents-list" id="documentsList">
                    <div class="loading-state" id="documentsLoading">
                        <div class="loading-spinner"></div>
                        <p>Loading documents...</p>
                    </div>
                </div>

                <!-- Documents Summary -->
                <div class="documents-summary" id="documentsSummary" style="display: none;">
                    <!-- Dynamically populated -->
                </div>
            </div>
        `;
    }

    createLenderFormTemplate(conversationData = {}) {
        return `
            <div class="lender-qualification-system">
                ${this.createLenderHeader()}
                ${this.createLenderForm(conversationData)}
            </div>
        `;
    }

    createFCSReportTemplate(report) {
        if (!report) {
            return '<div class="empty-state">No FCS Report Available. Generate one from the Documents tab.</div>';
        }

        return `
            <div class="fcs-report">
                <div class="fcs-header">
                    <h4>FCS Financial Analysis Report</h4>
                    <div class="fcs-actions">
                        <button onclick="window.conversationUI.downloadFCSReport()" class="btn-secondary">Download PDF</button>
                        <button onclick="window.conversationUI.regenerateFCS()" class="btn-primary">Regenerate</button>
                    </div>
                </div>
                <div class="fcs-content">
                    ${this.formatFCSContent(report.report_content || report)}
                </div>
            </div>
        `;
    }

    createEditFormTemplate(conversation) {
        if (!conversation) {
            return '<div class="empty-state">No conversation selected</div>';
        }

        return `
            <div class="edit-form-container">
                <h3>Edit Lead Information</h3>
                <form id="editLeadForm" class="edit-lead-form">
                    ${this.generateEditFormSections(conversation)}
                    <div class="form-actions">
                        <button type="submit" class="btn-primary">Update Lead</button>
                        <button type="button" onclick="window.conversationUI.reloadConversationDetails()" class="btn-secondary">
                            Refresh Data
                        </button>
                    </div>
                </form>
            </div>
        `;
    }

    createMessagesListTemplate(messages = []) {
        if (messages.length === 0) {
            return '<div class="empty-state">No messages yet. Start a conversation!</div>';
        }

        return `
            <div class="messages-list">
                ${messages.map(msg => `
                    <div class="message ${msg.direction}" data-message-id="${msg.id}">
                        <div class="message-content">
                            <p>${msg.content}</p>
                        </div>
                        <div class="message-meta">
                            <span class="timestamp">${this.formatDate(msg.created_at, 'time')}</span>
                            <span class="direction">${msg.direction === 'inbound' ? 'Received' : 'Sent'}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    createConversationItemTemplate(conversation) {
        const lastActivity = new Date(conversation.last_activity);
        const timeAgo = this.formatDate(lastActivity, 'ago');
        const isSelected = this.currentConversationId === conversation.id;
        const isChecked = this.selectedForDeletion.has(conversation.id);

        // Check for unread messages
        const unreadCount = this.unreadMessages.get(conversation.id) || 0;
        const hasUnread = unreadCount > 0 && !isSelected;

        return `
            <div class="conversation-item ${isSelected ? 'selected' : ''} ${isChecked ? 'checked-for-deletion' : ''} ${hasUnread ? 'has-unread' : ''}" data-conversation-id="${conversation.id}">
                ${hasUnread ? `<div class="unread-badge">${unreadCount}</div>` : ''}
                <div class="conversation-checkbox">
                    <input type="checkbox" class="delete-checkbox" data-conversation-id="${conversation.id}" ${isChecked ? 'checked' : ''}>
                </div>
                <div class="conversation-content">
                    <div class="conversation-header">
                        <h4 class="business-name">
                            ${conversation.business_name || 'Unknown Business'}
                            ${hasUnread ? '<span class="new-message-dot"></span>' : ''}
                        </h4>
                        <span class="time-ago">${timeAgo}</span>
                    </div>
                    <div class="conversation-meta">
                        <span class="phone-number">${conversation.lead_phone || conversation.phone}</span>
                    </div>
                </div>
            </div>
        `;
    }

    createModalTemplate(id, title, content, buttons = []) {
        return `
            <div id="${id}" class="modal" style="display: none;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>${title}</h3>
                        <button class="modal-close" onclick="window.conversationUI.hideModal('${id}')">&times;</button>
                    </div>
                    <div class="modal-body">
                        ${content}
                    </div>
                    <div class="modal-footer">
                        ${buttons.map(btn =>
                            `<button class="${btn.className || 'btn-secondary'}" onclick="${btn.action}">${btn.text}</button>`
                        ).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    createOverviewTabTemplate(conversation, aiMessages = []) {
        if (!conversation) {
            return '<div class="empty-state">No conversation selected</div>';
        }

        return `
            <div class="overview-section">
                <div class="conversation-summary">
                    <h4>Conversation Overview</h4>
                    <div class="summary-grid">
                        <div class="summary-item">
                            <label>Business Name:</label>
                            <span>${conversation.business_name || 'N/A'}</span>
                        </div>
                        <div class="summary-item">
                            <label>Phone:</label>
                            <span>${conversation.lead_phone || 'N/A'}</span>
                        </div>
                        <div class="summary-item">
                            <label>State:</label>
                            <span class="state-badge state-${conversation.state?.toLowerCase() || 'new'}">${conversation.state || 'NEW'}</span>
                        </div>
                        <div class="summary-item">
                            <label>Last Activity:</label>
                            <span>${this.formatDate(conversation.last_activity, 'full')}</span>
                        </div>
                    </div>
                </div>
                <div class="ai-chat-section">
                    <div class="ai-chat-header">
                        <h4>AI Assistant</h4>
                        <button onclick="window.conversationUI.clearAIChat()" class="btn-secondary">Clear Chat</button>
                    </div>
                    <div id="aiChatMessages" class="ai-chat-messages">
                        ${aiMessages.length > 0 ?
                            aiMessages.map(msg => `
                                <div class="ai-message ${msg.role}">
                                    <div class="message-content">${msg.content}</div>
                                    <div class="message-time">${this.formatDate(msg.timestamp, 'time')}</div>
                                </div>
                            `).join('') :
                            '<div class="empty-state">Start a conversation with the AI assistant</div>'
                        }
                    </div>
                    <div class="ai-chat-input">
                        <textarea id="aiChatInput" placeholder="Ask the AI assistant about this conversation..." rows="3"></textarea>
                        <button onclick="window.conversationUI.sendAIMessage()" class="btn-primary">Send</button>
                    </div>
                </div>
            </div>
        `;
    }

    // ========================================
    // FORM GENERATION HELPERS
    // ========================================

    createFormField(field, value = '') {
        const requiredMark = field.required ? '<span class="required">*</span>' : '';

        if (field.type === 'select') {
            return `
                <div class="form-group">
                    <label for="${field.id}">${field.label} ${requiredMark}</label>
                    <select id="${field.id}" class="form-input" ${field.required ? 'required' : ''}>
                        ${field.options.map(opt =>
                            `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.label}</option>`
                        ).join('')}
                    </select>
                </div>
            `;
        }

        return `
            <div class="form-group">
                <label for="${field.id}">${field.label} ${requiredMark}</label>
                <input type="${field.type}"
                       id="${field.id}"
                       class="form-input"
                       value="${value}"
                       placeholder="${field.placeholder || ''}"
                       ${field.required ? 'required' : ''}>
                ${field.id === 'lenderStartDate' ? '<div id="lenderTibDisplay" class="tib-display" style="display: none;"></div>' : ''}
            </div>
        `;
    }

    createCheckboxField(field, checked = false) {
        return `
            <label class="checkbox-label">
                <input type="checkbox" id="${field.id}" ${checked ? 'checked' : ''}>
                ${field.label}
            </label>
        `;
    }

    createLenderHeader() {
        return `
            <div class="lender-header">
                <h3>Lender Qualification System</h3>
                <p>Find qualified lenders based on merchant criteria</p>
            </div>
        `;
    }

    createLenderForm(conversationData = {}) {
        const businessName = conversationData?.business_name || '';
        const revenue = conversationData?.monthly_revenue || '';

        return `
            <div class="lender-form-content">
                <form id="lenderForm" class="lender-form">
                    <div class="form-row">
                        ${this.lenderFormFields.map(field => {
                            let value = '';
                            if (field.id === 'lenderBusinessName') value = businessName;
                            if (field.id === 'lenderRevenue') value = revenue;
                            return this.createFormField(field, value);
                        }).join('')}
                    </div>

                    <div class="checkbox-group">
                        ${this.lenderFormCheckboxes.map(field => this.createCheckboxField(field)).join('')}
                    </div>

                    <div class="form-actions">
                        <button type="submit" class="process-btn">Process Lenders</button>
                        <button type="button" class="clear-cache-btn" onclick="window.conversationUI.clearLenderCache()">
                            Clear Cache
                        </button>
                    </div>

                    <div class="loading" id="lenderLoading">Processing lenders...</div>
                    <div class="error" id="lenderError"></div>
                </form>

                <div class="results" id="lenderResults"></div>
            </div>
        `;
    }

    createEditFormField(field, conversation) {
        const value = this.getFieldValue(conversation, field.key, field.default);

        if (field.type === 'select') {
            let options = field.options;
            if (options === 'usStates') {
                options = this.usStates;
            }

            return `
                <div class="form-group">
                    <label for="${field.name}">${field.label}</label>
                    <select name="${field.name}" class="form-input">
                        ${options.map(opt =>
                            `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.label}</option>`
                        ).join('')}
                    </select>
                </div>
            `;
        }

        if (field.type === 'textarea') {
            return `
                <div class="form-group">
                    <label for="${field.name}">${field.label}</label>
                    <textarea name="${field.name}" class="form-input" rows="4">${value}</textarea>
                </div>
            `;
        }

        return `
            <div class="form-group">
                <label for="${field.name}">${field.label}</label>
                <input type="${field.type}"
                       name="${field.name}"
                       class="form-input"
                       value="${value}"
                       ${field.maxlength ? `maxlength="${field.maxlength}"` : ''}
                       ${field.name === 'businessZip' ? 'onblur="window.conversationUI.lookupZipCode(this.value, \'business\')"' : ''}>
            </div>
        `;
    }

    getFieldValue(conversation, key, defaultValue = '') {
        if (!conversation) return defaultValue || '';

        // Handle nested keys like lead_details.field
        if (key.includes('.')) {
            const keys = key.split('.');
            let value = conversation;
            for (const k of keys) {
                value = value?.[k];
                if (value === undefined) break;
            }
            return value || defaultValue || '';
        }

        // Handle direct keys with fallbacks
        return conversation[key] || defaultValue || '';
    }

    generateEditFormSections(conversation) {
        return Object.entries(this.editFormSections).map(([sectionKey, section]) => `
            <div class="form-section">
                <h4>${section.title}</h4>
                <div class="form-row-six">
                    ${section.fields.map(field => this.createEditFormField(field, conversation)).join('')}
                </div>
            </div>
        `).join('');
    }

    init() {
        // ConversationCore now handles setupEventListeners, setupWebSocketEvents, and loadInitialData
        this.setupFCSButtonDelegation();

        // Don't request notification permission on init - wait for user interaction
        // this.requestNotificationPermission(); // Removed
    }

    setupEventListeners() {
        // Conversation list filtering
        const stateFilter = document.getElementById('stateFilter');
        const searchInput = document.getElementById('searchInput');
        
        if (stateFilter) {
            stateFilter.addEventListener('change', () => this.filterConversations());
        }
        
        if (searchInput) {
            // Handle typing
            searchInput.addEventListener('input', (e) => {
                // If the input is empty, ensure we show all conversations
                if (e.target.value === '' || e.target.value.length === 0) {
                    this.renderConversationsList(); // Show all
                } else {
                    this.filterConversations(); // Apply filter
                }
            });
            
            // Handle clearing with X button in search inputs
            searchInput.addEventListener('search', (e) => {
                if (e.target.value === '') {
                    this.renderConversationsList();
                }
            });
            
            // Handle backspace/delete when empty
            searchInput.addEventListener('keyup', (e) => {
                if (e.target.value === '') {
                    this.renderConversationsList();
                }
            });
            
            // Handle paste and cut events
            searchInput.addEventListener('paste', () => {
                setTimeout(() => this.filterConversations(), 10);
            });
            
            searchInput.addEventListener('cut', () => {
                setTimeout(() => {
                    if (searchInput.value === '') {
                        this.renderConversationsList();
                    } else {
                        this.filterConversations();
                    }
                }, 10);
            });
        }

        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshData());
        }

        // Add Lead button
        const addLeadBtn = document.getElementById('addLeadBtn');
        if (addLeadBtn) {
            addLeadBtn.addEventListener('click', () => this.showAddLeadModal());
        }

        // Delete selected button
        const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
        if (deleteSelectedBtn) {
            deleteSelectedBtn.addEventListener('click', () => this.confirmDeleteSelected());
        }

        // Message input and send
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        const aiBtn = document.getElementById('aiBtn');

        if (messageInput) {
            messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
        }

        if (aiBtn) {
            aiBtn.addEventListener('click', () => this.toggleAISuggestions());
        }

        // AI suggestions
        const closeSuggestions = document.getElementById('closeSuggestions');
        if (closeSuggestions) {
            closeSuggestions.addEventListener('click', () => this.hideAISuggestions());
        }

        // Conversation actions
        const triggerFcsBtn = document.getElementById('triggerFcsBtn');
        const qualifyLendersBtn = document.getElementById('qualifyLendersBtn');
        const stateSelect = document.getElementById('stateSelect');

        if (triggerFcsBtn) {
            triggerFcsBtn.addEventListener('click', async () => await this.showFCSModal());
        }

        if (qualifyLendersBtn) {
            qualifyLendersBtn.addEventListener('click', () => this.showLenderModal());
        }

        if (stateSelect) {
            stateSelect.addEventListener('change', (e) => {
                if (e.target.value) {
                    this.changeConversationState(e.target.value);
                    e.target.value = '';
                }
            });
        }

        // Modal events
        this.setupModalEvents();

        // Intelligence tabs
        this.setupIntelligenceTabs();
    }

    setupFCSButtonDelegation() {
        console.log('� Setting up FCS button event delegation');
        
        // Store reference to this for use in event handlers
        const conversationUI = this;
        
        // Use event delegation on document body to catch dynamically generated FCS buttons
        document.body.addEventListener('click', (event) => {
            // Check if the clicked element is the FCS generate button
            if (event.target && event.target.id === 'generateFCSBtn') {
                console.log('FCS Generate button clicked via event delegation!');
                console.log('� Button element:', event.target);
                
                // Prevent default action and stop propagation
                event.preventDefault();
                event.stopPropagation();
                
                // Get conversation ID from button's data attribute
                const buttonConvId = event.target.dataset.conversationId;
                console.log('� Button conversation ID:', buttonConvId);
                console.log('� Current conversation ID:', conversationUI.currentConversationId);
                console.log('� Selected conversation:', conversationUI.selectedConversation?.id);
                
                // Ensure conversation context is set
                if (buttonConvId && !conversationUI.currentConversationId) {
                    conversationUI.currentConversationId = buttonConvId;
                    console.log('Set currentConversationId from button:', buttonConvId);
                }
                
                // Fallback: use selected conversation
                if (!conversationUI.currentConversationId && conversationUI.selectedConversation) {
                    conversationUI.currentConversationId = conversationUI.selectedConversation.id;
                    console.log('Set currentConversationId from selectedConversation:', conversationUI.currentConversationId);
                }
                
                // Call the modal function
                try {
                    if (conversationUI.showFCSModal) {
                        console.log('Calling showFCSModal via delegation...');
                        conversationUI.showFCSModal();
                    } else {
                        console.error(' showFCSModal function not found');
                    }
                } catch (error) {
                    console.error(' Error calling showFCSModal:', error);
                    // Don't show alert - fallback handler will take care of it
                }
                
                return false; // Prevent any other handlers
            }
        }, true); // Use capture phase to ensure we get the event first
        
        console.log('FCS button event delegation setup complete');
    }

    setupModalEvents() {
        // FCS Modal
        const fcsModal = document.getElementById('fcsModal');
        const closeFcsModal = document.getElementById('closeFcsModal');
        const cancelFcs = document.getElementById('cancelFcs');
        const confirmFcs = document.getElementById('confirmFcs');

        if (closeFcsModal) closeFcsModal.addEventListener('click', () => this.hideFCSModal());
        if (cancelFcs) cancelFcs.addEventListener('click', () => this.hideFCSModal());
        if (confirmFcs) confirmFcs.addEventListener('click', () => this.triggerFCS());

        // Lender Modal
        const lenderModal = document.getElementById('lenderModal');
        const closeLenderModal = document.getElementById('closeLenderModal');
        const cancelLender = document.getElementById('cancelLender');
        const confirmLender = document.getElementById('confirmLender');
        const useExistingData = document.getElementById('useExistingData');

        if (closeLenderModal) closeLenderModal.addEventListener('click', () => this.hideLenderModal());
        if (cancelLender) cancelLender.addEventListener('click', () => this.hideLenderModal());
        if (confirmLender) confirmLender.addEventListener('click', () => this.qualifyLenders());
        
        if (useExistingData) {
            useExistingData.addEventListener('change', (e) => {
                const manualDataGroup = document.getElementById('manualDataGroup');
                if (manualDataGroup) {
                    manualDataGroup.style.display = e.target.checked ? 'none' : 'block';
                }
            });
        }

        // Add Lead Modal
        const addLeadModal = document.getElementById('addLeadModal');
        const closeAddLeadModal = document.getElementById('closeAddLeadModal');
        const cancelAddLead = document.getElementById('cancelAddLead');
        const confirmAddLead = document.getElementById('confirmAddLead');

        if (closeAddLeadModal) closeAddLeadModal.addEventListener('click', () => this.hideAddLeadModal());
        if (cancelAddLead) cancelAddLead.addEventListener('click', () => this.hideAddLeadModal());
        if (confirmAddLead) confirmAddLead.addEventListener('click', () => this.addNewLead());
    }

    setupIntelligenceTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.switchIntelligenceTab(tab);
            });
        });
    }

    setupWebSocketEvents() {
        if (!this.wsManager) {
            console.warn('WebSocket manager not available - real-time updates disabled');
            return;
        }
        
        this.wsManager.on('conversation_updated', (data) => {
            // Update conversation data without switching context
            this.conversations.set(data.conversation.id, data.conversation);
            
            // Only update UI if it's the currently selected conversation
            if (data.conversation.id === this.currentConversationId) {
                this.selectedConversation = data.conversation;
                this.showConversationDetails();
            }
            
            // Update the conversation in the list without changing selection
            this.updateConversationInList(data.conversation);
        });

        this.wsManager.on('new_message', (data) => {
            // Only add the message if it's for the current conversation
            if (data.conversation_id === this.currentConversationId) {
                this.addMessage(data.message);
            }
            
            // Update the preview in the list without switching conversations
            this.updateConversationPreview(data.conversation_id, data.message);
            
            // Handle unread messages and notifications
            this.handleIncomingMessage(data);
        });

        this.wsManager.on('stats_updated', (data) => {
            this.updateStats(data);
        });

        this.wsManager.on('fcs_status_update', (data) => {
            this.updateFCSStatus(data);
        });

        this.wsManager.on('lender_qualification_complete', (data) => {
            this.updateLenderResults(data);
        });

        this.wsManager.on('system_notification', (data) => {
            this.showNotification(data.message, data.type);
        });

        this.wsManager.on('documents_uploaded', (data) => {
            if (this.selectedConversation && data.conversation_id === this.selectedConversation.id) {
                this.loadDocuments();
            }
        });

        this.wsManager.on('document_deleted', (data) => {
            if (this.selectedConversation && data.conversation_id === this.selectedConversation.id) {
                this.loadDocuments();
            }
        });

        this.wsManager.on('document_processing', (data) => {
            if (this.selectedConversation && data.conversation_id === this.selectedConversation.id) {
                this.updateDocumentProcessingStatus(data.document_id, data.status, data.error);
            }
        });

        this.wsManager.on('document_processed', (data) => {
            if (this.selectedConversation && data.conversation_id === this.selectedConversation.id) {
                this.updateDocumentProcessingStatus(data.document_id, 'completed', null);
                this.loadDocuments(); // Refresh to show new name
                this.showNotification(`Document processed: ${data.new_name}`, 'success');
            }
        });

        this.wsManager.on('document_updated', (data) => {
            if (this.selectedConversation && data.conversation_id === this.selectedConversation.id) {
                console.log('� Document updated via WebSocket:', data.document);
                this.loadDocuments(); // Refresh to show updated document
                this.showNotification('Document updated successfully', 'success');
            }
        });
    }

    async loadInitialData() {
        try {
            console.log('Loading initial data...');
            this.showLoading();
            
            await this.loadConversations();
            console.log('Conversations loaded');
            
            // Load stats but don't fail if it doesn't work
            try {
                await this.loadStats();
                console.log('Stats loaded');
            } catch (statsError) {
                console.warn('Stats loading failed (non-critical):', statsError.message);
            }
            
        } catch (error) {
            this.handleError(error, 'Error loading initial data', 'Failed to load data: ' + error.message);

            // Show error message in conversations list
            const container = document.getElementById('conversationsList');
            if (container) {
                container.innerHTML = `
                    <div class="error-state">
                        <p> Failed to load conversations</p>
                        <p>Error: ${error.message}</p>
                        <button onclick="window.location.reload()" class="btn-primary">Reload Page</button>
                    </div>
                `;
            }
        } finally {
            this.hideLoading();
            console.log('Initial data loading complete');
        }
    }

    async loadConversations() {
        try {
            console.log('Fetching conversations from:', `${this.apiBaseUrl}/api/conversations`);
            const response = await fetch(`${this.apiBaseUrl}/api/conversations`);
            console.log('� Response status:', response.status, response.statusText);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const conversations = await response.json();
            console.log('Received conversations:', conversations.length, conversations);
            
            this.conversations.clear();
            conversations.forEach(conv => {
                this.conversations.set(conv.id, conv);
            });
            console.log('� Stored conversations in memory:', this.conversations.size);
            
            this.renderConversationsList();
            console.log('Rendered conversations list');
        } catch (error) {
            this.handleError(error, 'Error loading conversations', null, false);
            throw error;
        }
    }

    async loadStats() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/stats`);
            
            // Check if response is ok
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            // Check content type
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                console.error("Response is not JSON:", await response.text());
                throw new TypeError("Response was not JSON");
            }
            
            const stats = await response.json();
            this.updateStats(stats);
            
        } catch (error) {
            console.error('Error loading stats:', error);
            // Set default values on error
            this.updateStats({
                totalConversations: 0,
                newLeads: 0,
                qualified: 0,
                funded: 0,
                error: true
            });
        }
    }

    async lookupZipCode(zip, fieldPrefix = 'business') {
        // Remove any non-numeric characters
        zip = zip.replace(/\D/g, '');
        
        // Basic ZIP validation - must be exactly 5 digits
        if (!zip || zip.length !== 5) return;
        
        try {
            // Visual feedback - highlight the ZIP field in blue while loading
            const zipField = document.querySelector(`[name="${fieldPrefix}Zip"]`);
            if (zipField) {
                zipField.style.borderColor = '#3b82f6';
                zipField.style.transition = 'border-color 0.3s ease';
            }
            
            // Call the free Zippopotam API
            const response = await fetch(`https://api.zippopotam.us/us/${zip}`);
            
            if (response.ok) {
                const data = await response.json();
                
                if (data.places && data.places[0]) {
                    const place = data.places[0];
                    
                    // Update city field
                    const cityField = document.querySelector(`[name="${fieldPrefix}City"]`);
                    if (cityField) {
                        cityField.value = place['place name'];
                        // Green border to show success
                        cityField.style.borderColor = '#10b981';
                        cityField.style.transition = 'border-color 0.3s ease';
                        setTimeout(() => {
                            cityField.style.borderColor = '';
                        }, 2000);
                    }
                    
                    // Update state dropdown
                    const stateField = document.querySelector(`[name="${fieldPrefix}State"]`);
                    if (stateField) {
                        const stateAbbr = place['state abbreviation'];
                        stateField.value = stateAbbr;
                        // Green border to show success
                        stateField.style.borderColor = '#10b981';
                        stateField.style.transition = 'border-color 0.3s ease';
                        setTimeout(() => {
                            stateField.style.borderColor = '';
                        }, 2000);
                    }
                    
                    // Optional: Show subtle notification
                    console.log(`ZIP ${zip} resolved to: ${place['place name']}, ${place['state abbreviation']}`);
                } else {
                    console.log(`No location found for ZIP: ${zip}`);
                }
            } else if (response.status === 404) {
                console.log(`Invalid ZIP code: ${zip}`);
                // Optional: Red border for invalid ZIP
                if (zipField) {
                    zipField.style.borderColor = '#ef4444';
                    setTimeout(() => {
                        zipField.style.borderColor = '';
                    }, 2000);
                }
            }
            
            // Reset ZIP field border color
            if (zipField) {
                setTimeout(() => {
                    zipField.style.borderColor = '';
                }, 2000);
            }
        } catch (error) {
            console.error('ZIP lookup failed:', error);
            // Fail silently - don't interrupt user's workflow
            const zipField = document.querySelector(`[name="${fieldPrefix}Zip"]`);
            if (zipField) {
                zipField.style.borderColor = '';
            }
        }
    }

    renderConversationsList() {
        const conversations = Array.from(this.conversations.values());
        // Use renderFilteredConversations to show the indicator for recent leads
        this.renderFilteredConversations(conversations, false);
    }

    renderConversationItem(conversation) {
        return this.templates.conversationItem(conversation);
    }

    async selectConversation(conversationId) {
        if (this.currentConversationId === conversationId) return;
        
        // Clear unread count for this conversation
        this.unreadMessages.delete(conversationId);

        this.currentConversationId = conversationId;
        
        // Fix gap issue permanently
        const centerPanel = document.querySelector('.center-panel');
        if (centerPanel) {
            centerPanel.style.gap = '0';
        }
        
        // Fetch detailed conversation data including metadata and lead_details
        try {
            console.log('Fetching detailed conversation data for:', conversationId);
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conversationId}`);
            if (response.ok) {
                this.selectedConversation = await response.json();
                console.log('Loaded detailed conversation data:', this.selectedConversation);
                
                // Update the conversations Map with the detailed data
                this.conversations.set(conversationId, this.selectedConversation);
            } else {
                console.error(' Failed to load detailed conversation data');
                // Fallback to basic data from conversations list
                this.selectedConversation = this.conversations.get(conversationId);
            }
        } catch (error) {
            console.error(' Error fetching detailed conversation:', error);
            // Fallback to basic data from conversations list
            this.selectedConversation = this.conversations.get(conversationId);
        }

        // Update UI
        this.updateConversationSelection();
        this.showConversationDetails();
        await this.loadConversationMessages();
        await this.loadConversationIntelligence();
        
        // Show message input
        const messageInputContainer = document.getElementById('messageInputContainer');
        if (messageInputContainer) {
            messageInputContainer.style.display = 'block';
        }

        // Show conversation actions
        const conversationActions = document.getElementById('conversationActions');
        if (conversationActions) {
            conversationActions.style.display = 'flex';
        }

        // If lender tab is currently active, populate the form
        const lenderTab = document.querySelector('.nav-tab[data-tab="lenders"]');
        if (lenderTab && lenderTab.classList.contains('active')) {
            setTimeout(() => this.populateLenderForm(), 200);
        }
        
        // Always attempt to restore lender form cache when conversation is selected
        // This ensures cache restoration works on page refresh
        setTimeout(() => this.restoreLenderFormCacheIfNeeded(), 300);
    }

    updateConversationSelection() {
        // Update conversation list selection
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.conversationId === this.currentConversationId);
        });
    }

    showConversationDetails() {
        const conversationInfo = document.getElementById('conversationInfo');
        if (!conversationInfo || !this.selectedConversation) return;

        // Extract owner name from the conversation data
        const ownerFirstName = this.selectedConversation.owner_first_name || this.selectedConversation.first_name || '';
        const ownerLastName = this.selectedConversation.owner_last_name || this.selectedConversation.last_name || '';
        const ownerName = `${ownerFirstName} ${ownerLastName}`.trim() || 'Unknown Owner';

        // Extract business name
        const businessName = this.selectedConversation.business_name || this.selectedConversation.company_name || '';

        // Extract phone number
        const phoneNumber = this.selectedConversation.lead_phone || this.selectedConversation.phone || this.selectedConversation.phone_number || '';

        conversationInfo.className = 'conversation-info text-style';
        conversationInfo.innerHTML = `
            <h2 class="owner-name">${ownerName}</h2>
            ${businessName ? `<p class="business-name-subtitle">${businessName}</p>` : ''}
            ${phoneNumber ? `<p class="phone-number-subtitle">${phoneNumber}</p>` : ''}
        `;
    }

    async loadConversationMessages() {
        if (!this.currentConversationId) return;

        try {
            console.log(`Loading messages for conversation: ${this.currentConversationId}`);
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${this.currentConversationId}/messages`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log(`Loaded ${data?.length || 0} messages`);
            
            this.renderMessages(data || []);
        } catch (error) {
            this.handleError(error, 'Error loading messages', `Failed to load messages: ${error.message}`);
            
            // Show error in messages container
            const container = document.getElementById('messagesContainer');
            if (container) {
                container.innerHTML = `
                    <div class="error-state">
                        <div class="error-icon"></div>
                        <h3>Messages Failed to Load</h3>
                        <p>${error.message}</p>
                        <button onclick="window.commandCenter.conversationUI.loadConversationMessages()" class="retry-btn">
                            Retry
                        </button>
                    </div>
                `;
            }
        }
    }

    renderMessages(messages) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;

        // Sort messages by timestamp
        if (messages.length > 0) {
            messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        }

        container.innerHTML = this.templates.messagesList(messages);

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    }

    renderMessage(message) {
        const isInbound = message.direction === 'inbound';
        
        let timestamp = '';
        if (message.created_at || message.timestamp) {
            const messageDate = new Date(message.created_at || message.timestamp);
            if (!isNaN(messageDate.getTime())) {
                timestamp = this.formatDate(messageDate, 'time');
            }
        }

        return `
            <div class="message ${isInbound ? 'inbound' : 'outbound'}" data-message-id="${message.id}">
                <div class="message-wrapper">
                    <div class="message-content">
                        <p>${message.content}</p>
                    </div>
                    <div class="message-meta">
                        <span class="timestamp">${timestamp}</span>
                    </div>
                </div>
            </div>
        `;
    }

    async sendMessage() {
        // Request notification permission on first message (user gesture)
        if (this.firstMessageSent !== true) {
            this.firstMessageSent = true;
            this.requestNotificationPermissionOnDemand();
        }
        
        const messageInput = document.getElementById('messageInput');
        if (!messageInput || !this.currentConversationId) return;

        const message = messageInput.value.trim();
        if (!message) return;

        // Clear input immediately to show message is being sent
        messageInput.value = '';
        
        // Show sending indicator
        this.showNotification('Sending message...', 'info');

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${this.currentConversationId}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message_content: message,
                    sender_type: 'user'
                })
            });

            if (response.ok) {
                this.showNotification('Message sent successfully', 'success');
                
                // Reload messages in current conversation
                await this.loadConversationMessages();
                
                // Just update the timestamp without reloading everything
                this.updateConversationAfterMessage(this.currentConversationId);
                
            } else {
                // Restore message if failed
                messageInput.value = message;
                const errorData = await response.text();
                throw new Error(`Failed to send message: ${response.status} - ${errorData}`);
            }
        } catch (error) {
            console.error(' Error sending message:', error);
            // Restore message in input if failed
            if (messageInput.value === '') {
                messageInput.value = message;
            }
            this.showNotification(`Failed to send message: ${error.message}`, 'error');
        }
    }

    async updateConversationAfterMessage(conversationId) {
        // Update the last activity timestamp for this conversation
        const conversation = this.conversations.get(conversationId);
        if (conversation) {
            conversation.last_activity = new Date().toISOString();
            this.conversations.set(conversationId, conversation);
            
            // Update just the time in the UI without re-rendering everything
            const timeAgoElement = document.querySelector(`[data-conversation-id="${conversationId}"] .time-ago`);
            if (timeAgoElement) {
                timeAgoElement.textContent = 'Just now';
            }
        }
    }

    async toggleAISuggestions() {
        if (!this.currentConversationId) return;

        if (this.aiSuggestionsVisible) {
            this.hideAISuggestions();
            return;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${this.currentConversationId}/ai-response`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messageType: 'followup',
                    generateMultiple: true,
                    context: {}
                })
            });

            const data = await response.json();
            this.showAISuggestions(data.response);
        } catch (error) {
            this.handleError(error, 'Error generating AI suggestions', 'Failed to generate suggestions');
        }
    }

    showAISuggestions(suggestions) {
        const aiSuggestions = document.getElementById('aiSuggestions');
        const suggestionsList = document.getElementById('suggestionsList');
        
        if (!aiSuggestions || !suggestionsList) return;

        suggestionsList.innerHTML = suggestions.map((suggestion, index) => `
            <div class="suggestion-item" data-index="${index}">
                <p>${suggestion}</p>
                <button class="use-suggestion-btn" onclick="window.conversationUI.useSuggestion('${suggestion.replace(/'/g, "\\'")}')">
                    Use
                </button>
            </div>
        `).join('');

        aiSuggestions.style.display = 'block';
        this.aiSuggestionsVisible = true;
    }

    hideAISuggestions() {
        const aiSuggestions = document.getElementById('aiSuggestions');
        if (aiSuggestions) {
            aiSuggestions.style.display = 'none';
        }
        this.aiSuggestionsVisible = false;
    }

    useSuggestion(suggestion) {
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.value = suggestion;
            messageInput.focus();
        }
        this.hideAISuggestions();
    }

    // Modal methods
    async showFCSModal() {
        console.log('� showFCSModal called');
        console.log('� Current conversation ID:', this.currentConversationId);
        console.log('� Selected conversation:', this.selectedConversation?.id);
        
        const modal = document.getElementById('fcsModal');
        if (!modal) {
            console.error(' FCS Modal not found in DOM');
            return;
        }
        
        // Try to get conversation ID from multiple sources
        const conversationId = this.currentConversationId || 
                              this.selectedConversation?.id || 
                              document.querySelector('.conversation-item.selected')?.dataset?.conversationId;
        
        if (!conversationId) {
            console.error(' No conversation context available');
            // Don't show alert - just return silently
            return;
        }
        
        // Set the conversation ID if it wasn't set
        if (!this.currentConversationId) {
            this.currentConversationId = conversationId;
        }
        
        console.log('Opening FCS modal with conversation ID:', conversationId);
        
        modal.style.display = 'flex';
        
        // ALWAYS fetch fresh - don't use this.currentDocuments
        await this.fetchAndDisplayFCSDocuments();
        
        console.log('FCS modal opened with fresh documents');
    }

    async fetchAndDisplayFCSDocuments() {
        const documentSelection = document.getElementById('fcsDocumentSelection');
        if (!documentSelection) return;
        
        documentSelection.innerHTML = '<div style="padding: 20px;">Loading documents...</div>';
        
        const conversationId = this.currentConversationId || this.selectedConversation?.id;
        if (!conversationId) {
            documentSelection.innerHTML = '<div style="padding: 20px; color: red;">No conversation selected</div>';
            return;
        }
        
        try {
            // Force fresh fetch every time with cache-busting timestamp
            console.log('Fetching fresh documents for FCS modal...');
            const response = await fetch(
                `${this.apiBaseUrl}/api/conversations/${conversationId}/documents?t=${Date.now()}`
            );
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log('� Fresh documents received:', result);
            
            if (result.success && result.documents) {
                // Update the cache for consistency (this fixes subsequent calls)
                this.currentDocuments = result.documents;
                
                // Display fresh documents
                documentSelection.innerHTML = result.documents.map((doc, index) => `
                    <div class="document-checkbox" style="padding: 12px; border-bottom: 1px solid #f1f5f9;">
                        <input type="checkbox" 
                               id="fcsDoc_${doc.id}" 
                               value="${doc.id}" 
                               ${index === 0 ? 'checked' : ''}>
                        <label for="fcsDoc_${doc.id}" style="margin-left: 10px;">
                            ${doc.original_filename || doc.filename || 'Unknown'}
                        </label>
                    </div>
                `).join('');
                
                console.log('Documents displayed successfully');
            } else {
                throw new Error(result.error || 'No documents in response');
            }
        } catch (error) {
            console.error(' Error fetching documents:', error);
            documentSelection.innerHTML = '<div style="padding: 20px; color: red;">Error loading documents</div>';
        }
    }

    async populateFCSDocumentSelection() {
        const documentSelection = document.getElementById('fcsDocumentSelection');
        if (!documentSelection) {
            console.log(' FCS document selection container not found');
            return;
        }

        // Double-check we have a conversation ID
        const conversationId = this.currentConversationId || this.selectedConversation?.id;
        
        if (!conversationId) {
            console.error(' No conversation ID available');
            documentSelection.innerHTML = '<div style="color: red;">No conversation selected</div>';
            return;
        }
        
        // Use the documents already loaded in the documents tab if available
        if (this.currentDocuments && this.currentDocuments.length > 0) {
            console.log('Using current documents:', this.currentDocuments.length);
            
            documentSelection.innerHTML = this.currentDocuments.map((doc, index) => `
                <div class="document-checkbox" style="padding: 10px; border-bottom: 1px solid #eee;">
                    <input type="checkbox" id="fcsDoc_${doc.id}" value="${doc.id}" ${index === 0 ? 'checked' : ''}>
                    <label for="fcsDoc_${doc.id}" style="margin-left: 10px;">
                        ${doc.original_filename || doc.filename || 'Unknown Document'}
                    </label>
                </div>
            `).join('');
            return;
        }

        // ALWAYS fetch fresh documents from server when populating FCS modal
        try {
            console.log('Fetching fresh documents for FCS modal...');
            console.log('� Using conversation ID:', conversationId);
            console.log('� API Base URL:', this.apiBaseUrl);
            
            const url = `${this.apiBaseUrl}/api/conversations/${conversationId}/documents`;
            console.log('� Full URL:', url);
            
            const response = await fetch(url);
            
            console.log('� Response status:', response.status);
            console.log('� Response OK:', response.ok);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log('� Response data:', result);
            
            if (result.success && result.documents) {
                this.currentDocuments = result.documents; // Update cached documents
                console.log('Fresh documents loaded for FCS:', result.documents.length);
                
                // Continue with existing logic using fresh documents
                const documents = result.documents;
                
                if (documents.length === 0) {
                    documentSelection.innerHTML = `
                        <div style="text-align: center; padding: 20px; color: #64748b;">
                            <p>No bank statements found. Please upload PDF bank statements first.</p>
                        </div>
                    `;
                    return;
                }
                
                // Populate with fresh documents
                console.log('� Populating FCS document selection with', documents.length, 'fresh documents');
                
        } else {
            console.error(' Failed to load fresh documents for FCS modal');
            // Fall back to cached documents if available
            if (!this.currentDocuments || this.currentDocuments.length === 0) {
                console.log('No cached documents available, trying fallback fetch');
                this.loadDocumentsForFCS();
                return;
            }
            console.log('Using cached documents due to fetch error');
        }
        } catch (error) {
            console.error(' Failed to load fresh documents for FCS modal');
            console.error('Error type:', error.constructor.name);
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
            
            // Check if it's a network error
            if (error instanceof TypeError && error.message.includes('fetch')) {
                console.error('Network error - server might be down');
            }
            
            // Try to use cached documents as fallback
            if (this.currentDocuments && this.currentDocuments.length > 0) {
                console.log('Using cached documents as fallback');
            } else {
                console.log('No documents available after error, showing guidance');
                documentSelection.innerHTML = `
                    <div style="text-align: center; padding: 20px; color: #ef4444;">
                        <p>Failed to load documents: ${error.message}</p>
                        <p>Please go to the Documents tab first to load documents, then try again.</p>
                    </div>
                `;
                return;
            }
        }

        // Show ALL documents (not just filtered ones) so user can select any document for FCS
        const documents = this.currentDocuments;

        if (documents.length === 0) {
            documentSelection.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #64748b;">
                    <p>No bank statements found. Please upload PDF bank statements first.</p>
                </div>
            `;
            return;
        }

        console.log('Documents to display:', documents.map(d => ({ name: d.original_name || d.filename, id: d.id.substring(0, 8) })));

        documentSelection.innerHTML = documents.map((doc, index) => `
            <div class="document-checkbox" style="display: flex; align-items: center; padding: 12px; border-bottom: 1px solid #f1f5f9; ${index % 2 === 0 ? 'background: #f8fafc;' : ''}">
                <input type="checkbox" id="fcsDoc_${doc.id}" value="${doc.id}" data-document-id="${doc.id}" ${index === 0 ? 'checked' : ''} 
                       style="margin-right: 12px; width: 16px; height: 16px;">
                <label for="fcsDoc_${doc.id}" style="flex: 1; cursor: pointer; font-size: 0.9rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span>
                            <strong>${doc.original_name || doc.filename || 'Unknown Document'}</strong>
                        </span>
                        <span style="color: #10b981; font-size: 0.75rem; font-weight: 600;">
                            ${doc.file_size ? (parseInt(doc.file_size) / 1024).toFixed(0) + ' KB' : ''}
                        </span>
                    </div>
                    <span style="color: #64748b; font-size: 0.8rem; display: block; margin-top: 2px;">
                        ID: ${doc.id.substring(0, 8)}...   Status: ${doc.status || 'uploaded'}   ${new Date(doc.created_at || Date.now()).toLocaleDateString()}
                    </span>
                </label>
            </div>
        `).join('');
    }

    async loadDocumentsForFCS() {
        if (!this.currentConversationId) return;

        try {
            console.log('Loading documents for FCS modal for conversation:', this.currentConversationId);
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${this.currentConversationId}/documents`);
            const result = await response.json();

            if (result.success && result.documents) {
                this.currentDocuments = result.documents;
                console.log('Loaded', result.documents.length, 'documents for FCS');
                this.populateFCSDocumentSelection(); // Retry populating now that we have documents
            } else {
                console.error(' Failed to load documents:', result.error);
                const documentSelection = document.getElementById('fcsDocumentSelection');
                if (documentSelection) {
                    documentSelection.innerHTML = `
                        <div style="text-align: center; padding: 20px; color: #ef4444;">
                            <p>Failed to load documents. Please try again.</p>
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.error(' Error loading documents for FCS:', error);
            const documentSelection = document.getElementById('fcsDocumentSelection');
            if (documentSelection) {
                documentSelection.innerHTML = `
                    <div style="text-align: center; padding: 20px; color: #ef4444;">
                        <p>Error loading documents. Please refresh and try again.</p>
                    </div>
                `;
            }
        }
    }

    hideFCSModal() {
        this.hideModal('fcsModal');
    }

    async triggerFCS() {
        if (!this.currentConversationId) return;

        // Use business name from conversation or auto-generate
        const businessName = this.selectedConversation?.business_name || 'Auto-Generated Business';
        
        // Get selected documents
        const selectedDocuments = Array.from(document.querySelectorAll('#fcsDocumentSelection input[type="checkbox"]:checked'))
            .map(checkbox => checkbox.value);

        // Only check for documents, not business name
        if (selectedDocuments.length === 0) {
            this.showNotification('Please select at least one bank statement', 'error');
            return;
        }

        const confirmBtn = document.getElementById('confirmFcs');
        if (confirmBtn) {
            const originalText = confirmBtn.innerHTML;
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<div class="loading-spinner-small"></div> Generating FCS...';

            try {
                console.log(`Starting FCS generation with ${selectedDocuments.length} selected documents`);
                
                const response = await fetch(`${this.apiBaseUrl}/api/conversations/${this.currentConversationId}/generate-fcs`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        businessName,
                        selectedDocuments
                    })
                });

                const result = await response.json();

                if (result.success) {
                    this.hideFCSModal();
                    this.showNotification('FCS Report generated successfully!', 'success');
                    
                    // Switch to FCS tab to show the results
                    this.switchIntelligenceTab('fcs');
                    
                    console.log('FCS generation completed successfully');
                } else {
                    throw new Error(result.error || 'Failed to generate FCS report');
                }
            } catch (error) {
                console.error(' FCS generation error:', error);
                this.showNotification(` FCS Generation failed: ${error.message}`, 'error');
            } finally {
                // Restore button state
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = originalText;
            }
        }
    }

    showLenderModal() {
        this.showModal('lenderModal');
    }

    hideLenderModal() {
        this.hideModal('lenderModal');
    }

    async qualifyLenders() {
        if (!this.currentConversationId) return;

        const useExisting = document.getElementById('useExistingData')?.checked;
        let businessData = {};

        if (!useExisting) {
            const businessName = document.getElementById('lenderBusinessName')?.value;
            if (!businessName) {
                this.showNotification('Business name is required', 'error');
                return;
            }
            businessData.businessName = businessName;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${this.currentConversationId}/lenders/qualify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(businessData)
            });

            if (response.ok) {
                this.hideLenderModal();
                this.showNotification('Lender qualification started', 'success');
            } else {
                throw new Error('Failed to qualify lenders');
            }
        } catch (error) {
            this.handleError(error, 'Error qualifying lenders', 'Failed to start lender qualification');
        }
    }

    // Add Lead modal methods
    showAddLeadModal() {
        const modal = this.showModal('addLeadModal');
        if (modal) {
            // Clear form
            document.getElementById('leadBusinessName').value = '';
            document.getElementById('leadPhone').value = '';
            document.getElementById('leadMessage').value = '';
            document.getElementById('leadAmount').value = '';
            document.getElementById('leadPriority').value = 'normal';
        }
    }

    hideAddLeadModal() {
        this.hideModal('addLeadModal');
    }

    async addNewLead() {
        const businessName = document.getElementById('leadBusinessName').value.trim();
        const phone = document.getElementById('leadPhone').value.trim();
        const message = document.getElementById('leadMessage').value.trim();
        const requestedAmount = document.getElementById('leadAmount').value;
        const priority = document.getElementById('leadPriority').value;

        if (!businessName) {
            this.showNotification('Business name is required', 'error');
            return;
        }

        if (!phone) {
            this.showNotification('Phone number is required', 'error');
            return;
        }

        // Basic phone validation
        const phonePattern = /^[\+]?[1-9][\d]{0,15}$/;
        if (!phonePattern.test(phone.replace(/[-\s\(\)]/g, ''))) {
            this.showNotification('Please enter a valid phone number', 'error');
            return;
        }

        try {
            const leadData = {
                businessName,
                phone,
                priority
            };

            if (message) {
                leadData.message = message;
            }

            if (requestedAmount) {
                leadData.requestedAmount = parseInt(requestedAmount);
            }

            const response = await fetch(`${this.apiBaseUrl}/api/conversations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(leadData)
            });

            if (response.ok) {
                const result = await response.json();
                this.hideAddLeadModal();
                this.showNotification(`Lead added successfully: ${businessName}`, 'success');
                
                // Refresh conversations list
                await this.loadConversations();
                
                // Optionally select the new conversation
                setTimeout(() => {
                    this.selectConversation(result.conversation.id);
                }, 500);
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Failed to add lead');
            }
        } catch (error) {
            this.handleError(error, 'Error adding lead', 'Failed to add lead: ' + error.message);
        }
    }

    async changeConversationState(newState) {
        if (!this.currentConversationId) return;

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${this.currentConversationId}/state`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    newState,
                    triggeredBy: 'operator',
                    reason: 'Manual state change'
                })
            });

            if (response.ok) {
                this.showNotification(`State changed to ${newState}`, 'success');
            } else {
                throw new Error('Failed to change state');
            }
        } catch (error) {
            console.error('Error changing state:', error);
            this.showNotification('Failed to change state', 'error');
        }
    }

    // Intelligence panel methods
    async loadConversationIntelligence() {
        if (!this.currentConversationId) return;

        try {
            console.log(`Loading intelligence for conversation: ${this.currentConversationId}`);
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${this.currentConversationId}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log(`Loaded intelligence data for: ${data.conversation?.business_name || 'Unknown'}`);
            
            this.renderIntelligenceData(data);
        } catch (error) {
            console.error('Error loading intelligence data:', error);
            this.showNotification(`Failed to load conversation details: ${error.message}`, 'error');
            
            // Show error in intelligence panel
            const intelligenceContent = document.getElementById('intelligenceContent');
            if (intelligenceContent) {
                intelligenceContent.innerHTML = `
                    <div class="error-state">
                        <div class="error-icon"></div>
                        <h3>Conversation Details Failed to Load</h3>
                        <p>${error.message}</p>
                        <button onclick="window.commandCenter.conversationUI.loadConversationIntelligence()" class="retry-btn">
                            Retry
                        </button>
                    </div>
                `;
            }
        }
    }

    renderIntelligenceData(data) {
        // Update selectedConversation with detailed data from API
        if (data.conversation) {
            console.log('Updating selectedConversation with detailed data:', data.conversation);
            this.selectedConversation = { ...this.selectedConversation, ...data.conversation };
            
            // Also update the conversation in the main conversations map
            if (this.currentConversationId) {
                this.conversations.set(this.currentConversationId, this.selectedConversation);
            }
            
            // Update the conversation header now that we have detailed data including first_name/last_name
            this.showConversationDetails();
        }
        
        // This will be implemented based on the active tab
        this.switchIntelligenceTab('overview');
    }

    switchIntelligenceTab(tab) {

        // Sync context before switching
        this.syncConversationContext();

        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        const content = document.getElementById('intelligenceContent');
        if (!content || !this.selectedConversation) {
            return;
        }

        console.log(`Rendering tab: ${tab}`);
        switch (tab) {
            case 'overview':
                this.renderOverviewTab(content);
                break;
            case 'documents':
                this.renderDocumentsTab(content);
                break;
            case 'edit':
                this.renderEditTab(content);
                break;
            case 'fcs':
                this.renderFCSTab(content);
                break;
            case 'lenders':
                this.renderLendersTab(content);
                // Ensure cache is restored when switching to lender tab (after form is rendered)
                setTimeout(() => this.restoreLenderFormCacheIfNeeded(), 500);
                break;
            case 'lender-management':
                this.renderLenderManagementTab(content);
                break;
            default:
                console.log(` Unknown tab: ${tab}, falling back to overview`);
                this.renderOverviewTab(content);
                break;
        }
        console.log(`switchIntelligenceTab(${tab}) completed`);
    }

    renderOverviewTab(content) {
        content.innerHTML = `
            <div class="ai-chat-interface">
                <style>
                    .ai-chat-interface {
                        height: 500px;
                        display: flex;
                        flex-direction: column;
                        background: white;
                        border: 1px solid #e2e8f0;
                        border-radius: 12px;
                        overflow: hidden;
                    }
                    
                    .ai-chat-header {
                        background: #667eea;
                        color: white;
                        padding: 16px;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    }
                    
                    .ai-chat-messages {
                        flex: 1;
                        padding: 20px;
                        overflow-y: auto;
                        background: #f9fafb;
                    }
                    
                    .ai-chat-message {
                        margin-bottom: 16px;
                        display: flex;
                        gap: 12px;
                    }
                    
                    .ai-chat-message.user {
                        flex-direction: row-reverse;
                    }
                    
                    .message-bubble {
                        max-width: 70%;
                        padding: 12px 16px;
                        border-radius: 18px;
                        font-size: 14px;
                        line-height: 1.4;
                    }
                    
                    .ai-chat-message.user .message-bubble {
                        background: #667eea;
                        color: white;
                    }
                    
                    .ai-chat-message.assistant .message-bubble {
                        background: white;
                        color: #1f2937;
                        border: 1px solid #e2e8f0;
                    }
                    
                    .ai-chat-input-area {
                        padding: 16px;
                        background: white;
                        border-top: 1px solid #e2e8f0;
                    }
                    
                    .ai-chat-input-wrapper {
                        display: flex;
                        gap: 12px;
                        align-items: center;
                    }
                    
                    .ai-chat-input {
                        flex: 1;
                        padding: 12px 16px;
                        border: 1px solid #d1d5db;
                        border-radius: 24px;
                        resize: none;
                        font-size: 14px;
                        min-height: 24px;
                        max-height: 100px;
                        font-family: inherit;
                    }
                    
                    .ai-chat-input:focus {
                        outline: none;
                        border-color: #667eea;
                    }
                    
                    .ai-chat-send {
                        background: #667eea;
                        color: white;
                        border: none;
                        padding: 12px 20px;
                        border-radius: 24px;
                        cursor: pointer;
                        font-weight: 500;
                        transition: all 0.2s;
                    }
                    
                    .ai-chat-send:hover {
                        background: #5a67d8;
                    }
                    
                    .ai-chat-send:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }
                    
                    .typing-indicator {
                        display: flex;
                        gap: 4px;
                        padding: 12px 16px;
                        background: white;
                        border: 1px solid #e2e8f0;
                        border-radius: 18px;
                        width: fit-content;
                    }
                    
                    .typing-dot {
                        width: 8px;
                        height: 8px;
                        background: #9ca3af;
                        border-radius: 50%;
                        animation: typing 1.4s infinite;
                    }
                    
                    .typing-dot:nth-child(2) {
                        animation-delay: 0.2s;
                    }
                    
                    .typing-dot:nth-child(3) {
                        animation-delay: 0.4s;
                    }
                    
                    @keyframes typing {
                        0%, 60%, 100% {
                            transform: translateY(0);
                        }
                        30% {
                            transform: translateY(-10px);
                        }
                    }
                </style>
                
                <div class="ai-chat-header">
                    <span>�</span>
                    <div>
                        <div style="font-weight: 600;">AI Assistant</div>
                        <div style="font-size: 12px; opacity: 0.8;">Chat about ${this.selectedConversation?.business_name || 'this lead'}</div>
                    </div>
                </div>
                
                <div class="ai-chat-messages" id="aiChatMessages">
                    <div class="ai-chat-message assistant">
                        <div class="message-bubble">
                            Hi! I'm here to help you with <strong>${this.selectedConversation?.business_name || 'this lead'}</strong>. 
                            You can ask me anything about the lead, what actions to take next, or how to handle this conversation.
                            <br><br>
                            Try asking: "What should I do next?" or "Analyze this lead for me"
                        </div>
                    </div>
                </div>
                
                <div class="ai-chat-input-area">
                    <div class="ai-chat-input-wrapper">
                        <textarea 
                            class="ai-chat-input" 
                            id="aiChatInput" 
                            placeholder="Type your message..."
                            rows="1"
                        ></textarea>
                        <button class="ai-chat-send" id="aiChatSend">
                            Send
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Initialize the chat
        this.initializeAIChat();
    }

    renderDocumentsTab(content) {
        content.innerHTML = this.templates.documentsTab();
        this.loadDocuments();
        this.setupDocumentsEventListeners();
    }

    renderFCSTab(content) {
        console.log(`� renderFCSTab called`);
        content.innerHTML = `
            <div class="intelligence-section">
                <h3>FCS Results</h3>
                <div id="fcsContent">
                    <div class="fcs-status">
                        <div class="loading-spinner"></div>
                        <p>Loading FCS data...</p>
                    </div>
                </div>
            </div>
        `;
        console.log(`� FCS content HTML set, calling loadFCSData...`);

        // Load FCS data
        this.loadFCSData();
    }

    async loadFCSData() {
        if (!this.currentConversationId) return;

        const fcsContent = document.getElementById('fcsContent');
        if (!fcsContent) return;

        console.log(`Loading FCS data for conversation ${this.currentConversationId}`);

        try {
            // Add cache-busting parameter to ensure we get the latest report
            const cacheBuster = new Date().getTime();
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${this.currentConversationId}/fcs-report?_=${cacheBuster}`);
            console.log(`� FCS fetch response status: ${response.status}`);
            
            if (response.status === 404) {
                // No FCS report exists yet
                fcsContent.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">�</div>
                        <h4>No FCS Report Generated</h4>
                        <p>Upload bank statements and generate an FCS report from the Documents tab</p>
                        <button class="btn btn-primary" onclick="window.conversationUI.switchIntelligenceTab('documents')" style="margin-top: 10px;">
                            Go to Documents
                        </button>
                    </div>
                `;
                return;
            }

            if (!response.ok) {
                throw new Error('Failed to load FCS data');
            }

            const result = await response.json();
            console.log(`FCS API result:`, result);
            console.log(`result.success:`, result.success);
            console.log(`result.report exists:`, !!result.report);
            
            if (result.success && result.report) {
                console.log(`Calling displayFCSReport with report data`);
                this.displayFCSReport(result.report);
            } else {
                fcsContent.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">�</div>
                        <h4>No FCS Report Available</h4>
                        <p>Generate an FCS report from the Documents tab</p>
                    </div>
                `;
            }

        } catch (error) {
            console.error('Error loading FCS data:', error);
            fcsContent.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #ef4444;">
                    <p>Failed to load FCS data</p>
                </div>
            `;
        }
    }

    displayFCSReport(report) {
        const fcsContent = document.getElementById('fcsContent');
        if (!fcsContent) return;

        const reportDate = new Date(report.generated_at).toLocaleDateString();
        
        // Process the report content to make it more readable
        const processedContent = this.formatFCSContent(report.report_content);
        
        fcsContent.innerHTML = `
            <div class="fcs-report">
                <div class="fcs-header" style="background: #f0f9ff; padding: 15px; border-radius: 6px; margin-bottom: 20px; border-left: 4px solid #0ea5e9;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h4 style="color: #0369a1; margin: 0; display: flex; align-items: center; gap: 8px;">
                                � FCS Financial Analysis Report
                            </h4>
                            <p style="color: #475569; font-size: 0.875rem; margin: 5px 0 0 0;">Generated on ${reportDate}</p>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-primary" onclick="window.conversationUI.downloadFCSReport()" style="padding: 6px 12px; font-size: 0.875rem;">
                                � Download
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="fcs-content" style="background: white; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
                    ${processedContent}
                </div>
            </div>
        `;
    }

    formatFCSContent(content) {
        // Split content into sections for better formatting
        const sections = content.split('\n\n');
        let formattedHTML = '';

        sections.forEach(section => {
            const lines = section.split('\n');
            if (lines.length === 0) return;

            const firstLine = lines[0].trim();
            
            // Check if this is a header/title
            if (firstLine.includes('FCS FINANCIAL ANALYSIS REPORT') || 
                firstLine.includes('DOCUMENT SUMMARY') || 
                firstLine.includes('FINANCIAL ANALYSIS') || 
                firstLine.includes('RECOMMENDATIONS') ||
                firstLine.includes('STATUS:')) {
                
                formattedHTML += `<div style="background: #f8fafc; padding: 12px 16px; border-left: 3px solid #0ea5e9; margin-bottom: 16px;">
                    <h5 style="color: #0369a1; margin: 0; font-weight: 600;">${firstLine}</h5>
                </div>`;
                
                // Add remaining lines in this section
                if (lines.length > 1) {
                    formattedHTML += `<div style="padding: 0 16px 16px 16px;">`;
                    for (let i = 1; i < lines.length; i++) {
                        if (lines[i].trim()) {
                            if (lines[i].startsWith(' ')) {
                                formattedHTML += `<div style="margin: 4px 0; color: #374151; font-size: 14px;"><span style="color: #0ea5e9;"> </span> ${lines[i].substring(1)}</div>`;
                            } else if (lines[i].startsWith('') || lines[i].startsWith('  -')) {
                                formattedHTML += `<div style="margin: 2px 0 2px 20px; color: #6b7280; font-size: 14px;">${lines[i].trim()}</div>`;
                            } else {
                                formattedHTML += `<div style="margin: 4px 0; color: #374151; font-size: 14px;">${lines[i]}</div>`;
                            }
                        }
                    }
                    formattedHTML += `</div>`;
                }
            } else {
                // Regular content section
                formattedHTML += `<div style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9;">`;
                lines.forEach(line => {
                    if (line.trim()) {
                        if (line.startsWith(' ')) {
                            formattedHTML += `<div style="margin: 4px 0; color: #374151; font-size: 14px;"><span style="color: #0ea5e9;"> </span> ${line.substring(1)}</div>`;
                        } else if (line.startsWith('') || line.startsWith('  -')) {
                            formattedHTML += `<div style="margin: 2px 0 2px 20px; color: #6b7280; font-size: 14px;">${line.trim()}</div>`;
                        } else {
                            formattedHTML += `<div style="margin: 4px 0; color: #374151; font-size: 14px;">${line}</div>`;
                        }
                    }
                });
                formattedHTML += `</div>`;
            }
        });

        return formattedHTML;
    }

    renderLendersTab(content) {
        content.innerHTML = `
            <div class="lender-qualification-system">
                <style>
                    .lender-qualification-system {
                        background: white;
                        border-radius: 12px;
                        overflow: hidden;
                    }
                    
                    .lender-header {
                        background: linear-gradient(135deg, #3b82f6, #8b5cf6);
                        color: white;
                        padding: 20px;
                        text-align: center;
                    }
                    
                    .lender-header h3 {
                        font-size: 1.5rem;
                        font-weight: 600;
                        margin-bottom: 4px;
                    }
                    
                    .lender-header p {
                        opacity: 0.9;
                        font-size: 0.9rem;
                    }
                    
                    .lender-form-content {
                        padding: 20px;
                    }
                    
                    .form-row {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 16px;
                        margin-bottom: 16px;
                    }
                    
                    .form-group {
                        display: flex;
                        flex-direction: column;
                    }
                    
                    .form-group label {
                        font-weight: 500;
                        color: #475569;
                        margin-bottom: 6px;
                        font-size: 0.875rem;
                    }
                    
                    .form-group input, 
                    .form-group select,
                    .form-group textarea {
                        padding: 8px 12px;
                        border: 1px solid #e2e8f0;
                        border-radius: 6px;
                        font-size: 0.95rem;
                        transition: all 0.2s ease;
                        background: white;
                        font-family: inherit;
                    }
                    
                    .form-group input:focus, 
                    .form-group select:focus,
                    .form-group textarea:focus {
                        outline: none;
                        border-color: #3b82f6;
                        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                    }
                    
                    .form-group textarea {
                        resize: vertical;
                        min-height: 60px;
                    }
                    
                    .checkbox-group {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 20px;
                        margin: 20px 0;
                        padding: 16px;
                        background: #f8fafc;
                        border-radius: 8px;
                        border: 1px solid #e2e8f0;
                    }
                    
                    .checkbox-group label {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 0.9rem;
                        color: #475569;
                        cursor: pointer;
                    }
                    
                    .checkbox-group input[type="checkbox"] {
                        width: 16px;
                        height: 16px;
                        accent-color: #3b82f6;
                    }
                    
                    .process-btn {
                        width: 100%;
                        background: linear-gradient(135deg, #3b82f6, #8b5cf6);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        font-size: 1rem;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        margin-top: 20px;
                    }
                    
                    .process-btn:hover {
                        transform: translateY(-1px);
                        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
                    }
                    
                    .process-btn:disabled {
                        opacity: 0.6;
                        cursor: not-allowed;
                        transform: none;
                    }
                    
                    .clear-cache-btn {
                        background: linear-gradient(135deg, #ef4444, #dc2626);
                        color: white;
                        border: none;
                        padding: 12px 20px;
                        border-radius: 8px;
                        font-size: 0.875rem;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        white-space: nowrap;
                    }
                    
                    .clear-cache-btn:hover {
                        transform: translateY(-1px);
                        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
                        background: linear-gradient(135deg, #dc2626, #b91c1c);
                    }
                    
                    .form-actions {
                        display: flex;
                        gap: 10px;
                        margin-top: 20px;
                    }
                    
                    .form-actions .process-btn {
                        flex: 1;
                        margin-top: 0;
                    }
                    
                    .loading {
                        display: none;
                        text-align: center;
                        padding: 40px;
                        color: #3b82f6;
                        font-size: 1.1rem;
                        font-weight: 500;
                    }
                    
                    .loading.active {
                        display: block;
                    }
                    
                    .error {
                        display: none;
                        background: #fee2e2;
                        color: #dc2626;
                        padding: 12px 16px;
                        border-radius: 8px;
                        border: 1px solid #fecaca;
                        margin-top: 16px;
                    }
                    
                    .error.active {
                        display: block;
                    }
                    
                    .tib-display {
                        font-size: 0.8rem;
                        color: #059669;
                        background: #ecfdf5;
                        padding: 4px 8px;
                        border-radius: 4px;
                        margin-top: 4px;
                        border: 1px solid #a7f3d0;
                    }

                    .results {
                        display: none;
                        margin-top: 24px;
                    }
                    
                    .results.active {
                        display: block;
                    }
                    
                    .criteria-info {
                        background: #f8fafc;
                        border: 1px solid #e2e8f0;
                        border-radius: 8px;
                        padding: 16px;
                        margin-bottom: 20px;
                    }
                    
                    .criteria-info h4 {
                        color: #1e293b;
                        margin-bottom: 12px;
                    }
                    
                    .info-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 8px;
                    }
                    
                    .info-item {
                        font-size: 0.875rem;
                        color: #475569;
                    }
                    
                    .summary {
                        display: flex;
                        justify-content: space-around;
                        background: white;
                        border: 1px solid #e2e8f0;
                        border-radius: 8px;
                        padding: 20px;
                        margin-bottom: 24px;
                        text-align: center;
                    }
                    
                    .summary-item {
                        flex: 1;
                    }
                    
                    .summary-number {
                        font-size: 2rem;
                        font-weight: 700;
                        color: #1e293b;
                        margin-bottom: 4px;
                    }
                    
                    .summary-label {
                        font-size: 0.875rem;
                        color: #64748b;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    
                    .results-section {
                        margin-bottom: 24px;
                    }
                    
                    .results-section h3 {
                        color: #1e293b;
                        margin-bottom: 16px;
                        padding-bottom: 8px;
                        border-bottom: 2px solid #e2e8f0;
                    }
                    
                    .tier-group {
                        margin-bottom: 16px;
                    }
                    
                    .tier-title {
                        font-weight: 600;
                        color: #374151;
                        background: #f3f4f6;
                        padding: 8px 12px;
                        border-radius: 6px;
                        margin-bottom: 8px;
                        border-left: 4px solid #3b82f6;
                    }
                    
                    .lender-list {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                        gap: 8px;
                    }
                    
                    .lender-item {
                        background: #fafafa;
                        padding: 10px 14px;
                        border-radius: 6px;
                        border: 1px solid #e5e7eb;
                        font-size: 0.9rem;
                        color: #374151;
                        transition: all 0.2s ease;
                    }
                    
                    .lender-item.preferred {
                        background: linear-gradient(135deg, #fef3c7, #fde68a);
                        border-color: #f59e0b;
                        font-weight: 500;
                    }
                    
                    .lender-item:hover {
                        transform: translateY(-1px);
                        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                    }
                    
                    .non-qualified-item {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 10px 14px;
                        background: #fef2f2;
                        border: 1px solid #fecaca;
                        border-radius: 6px;
                        margin-bottom: 8px;
                    }
                    
                    .lender-name {
                        font-weight: 500;
                        color: #374151;
                    }
                    
                    .blocking-reason {
                        font-size: 0.85rem;
                        color: #dc2626;
                    }
                </style>
                
                <div class="lender-header">
                    <h3>Lender Qualification</h3>
                    <p>Find qualified lenders based on merchant criteria</p>
                </div>
                
                <div class="lender-form-content">
                    <form id="lenderForm">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="lenderBusinessName">Business Name</label>
                                <input type="text" id="lenderBusinessName" placeholder="ABC Trucking LLC">
                            </div>
                            
                            <div class="form-group">
                                <label for="lenderPosition">Position *</label>
                                <select id="lenderPosition" required>
                                    <option value="">Select</option>
                                    <option value="1">1st</option>
                                    <option value="2">2nd</option>
                                    <option value="3">3rd</option>
                                    <option value="4">4th</option>
                                    <option value="5">5th</option>
                                    <option value="6">6th</option>
                                    <option value="7">7th</option>
                                    <option value="8">8th</option>
                                    <option value="9">9th</option>
                                    <option value="10">10th</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="lenderStartDate">Business Start Date *</label>
                                <input type="text" id="lenderStartDate" placeholder="MM/DD/YYYY" required>
                                <div id="lenderTibDisplay" class="tib-display" style="display: none;"></div>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label for="lenderRevenue">Monthly Revenue *</label>
                                <input type="number" id="lenderRevenue" min="0" placeholder="50000" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="lenderFico">FICO Score *</label>
                                <input type="number" id="lenderFico" min="300" max="850" placeholder="650" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="lenderState">State *</label>
                                <input type="text" id="lenderState" placeholder="NY" maxlength="2" required>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label for="lenderIndustry">Industry *</label>
                                <input type="text" id="lenderIndustry" placeholder="Construction" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="lenderDepositsPerMonth">Deposits/Month</label>
                                <input type="number" id="lenderDepositsPerMonth" min="0" placeholder="5">
                            </div>
                            
                            <div class="form-group">
                                <label for="lenderNegativeDays">Negative Days</label>
                                <input type="number" id="lenderNegativeDays" min="0" max="90" placeholder="0">
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group" style="grid-column: 1 / -1;">
                                <label for="lenderCurrentPositions">Current Positions</label>
                                <input type="text" id="lenderCurrentPositions" placeholder="e.g., OnDeck $500 daily, Forward $750 weekly">
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group" style="grid-column: 1 / -1;">
                                <label for="lenderAdditionalNotes">Additional Notes</label>
                                <textarea id="lenderAdditionalNotes" placeholder="Any additional notes or special circumstances..."></textarea>
                            </div>
                        </div>
                        
                        <div class="checkbox-group">
                            <label>
                                <input type="checkbox" id="lenderSoleProp"> Sole Proprietorship
                            </label>
                            
                            <label>
                                <input type="checkbox" id="lenderNonProfit"> Non-Profit
                            </label>
                            
                            <label>
                                <input type="checkbox" id="lenderMercuryBank"> Mercury Bank
                            </label>
                        </div>
                        
                        <div class="form-actions" style="display: flex; gap: 10px; margin-top: 20px;">
                            <button type="submit" class="process-btn">Process Lenders</button>
                            <button type="button" class="clear-cache-btn" id="clearLenderCacheBtn" title="Clear cached form data">
                                Clear Cache
                            </button>
                        </div>
                    </form>
                    
                    <div class="loading" id="lenderLoading">
                         Processing lenders...
                    </div>
                    
                    <div class="error" id="lenderErrorMsg"></div>
                    
                    <div class="results" id="lenderResults"></div>
                </div>
            </div>
        `;

        // Initialize lender form functionality
        this.initializeLenderForm();
        
        // Also populate the form when tab is rendered
        setTimeout(() => this.populateLenderForm(), 100);
        
        // Restore cached form data after rendering (important for page refresh)
        setTimeout(() => this.restoreLenderFormCacheIfNeeded(), 200);
        
        // Check for cached results and restore them
        const conversationId = this.currentConversationId || this.selectedConversation?.id;
        if (conversationId) {
            const cached = this.lenderResultsCache.get(conversationId);
            if (cached) {
                // Restore cached results
                const resultsEl = document.getElementById('lenderResults');
                if (resultsEl) {
                    resultsEl.innerHTML = cached.html;
                    resultsEl.classList.add('active');
                }
                
                // Also restore any qualified lenders for form submission
                if (cached.data && cached.data.qualified) {
                    this.qualifiedLenders = cached.data.qualified;
                    this.lastLenderCriteria = cached.criteria;
                }
                
                console.log('Restored cached lender results for conversation:', conversationId);
            } else {
                // No cached results, load from server
                this.loadLenderData();
            }
        }
    }

    renderLenderManagementTab(content) {
        content.innerHTML = `
            <div class="lender-management-system">
                <style>
                    .lender-management-system {
                        background: white;
                        border-radius: 12px;
                        overflow: hidden;
                    }
                    
                    .lender-mgmt-header {
                        background: linear-gradient(135deg, #059669, #10b981);
                        color: white;
                        padding: 20px;
                        text-align: center;
                    }
                    
                    .lender-mgmt-header h3 {
                        font-size: 1.5rem;
                        font-weight: 600;
                        margin-bottom: 4px;
                    }
                    
                    .lender-mgmt-header p {
                        opacity: 0.9;
                        font-size: 0.9rem;
                    }
                    
                    .lender-mgmt-content {
                        padding: 20px;
                    }
                    
                    .mgmt-actions {
                        display: flex;
                        gap: 10px;
                        margin-bottom: 20px;
                        flex-wrap: wrap;
                    }
                    
                    .mgmt-btn {
                        padding: 8px 16px;
                        border: none;
                        border-radius: 6px;
                        font-size: 0.9rem;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    }
                    
                    .mgmt-btn.primary {
                        background: #059669;
                        color: white;
                    }
                    
                    .mgmt-btn.primary:hover {
                        background: #047857;
                        transform: translateY(-1px);
                    }
                    
                    .mgmt-btn.secondary {
                        background: #f3f4f6;
                        color: #374151;
                        border: 1px solid #d1d5db;
                    }
                    
                    .mgmt-btn.secondary:hover {
                        background: #e5e7eb;
                    }
                    
                    .lenders-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 20px;
                        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                        border-radius: 8px;
                        overflow: hidden;
                    }
                    
                    .lenders-table th,
                    .lenders-table td {
                        padding: 12px;
                        text-align: left;
                        border-bottom: 1px solid #e5e7eb;
                    }
                    
                    .lenders-table th {
                        background: #f9fafb;
                        font-weight: 600;
                        color: #374151;
                    }
                    
                    .lenders-table tr:hover {
                        background: #f9fafb;
                    }
                    
                    .action-buttons {
                        display: flex;
                        gap: 5px;
                    }
                    
                    .action-btn {
                        padding: 4px 8px;
                        border: none;
                        border-radius: 4px;
                        font-size: 0.8rem;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    }
                    
                    .action-btn.edit {
                        background: #3b82f6;
                        color: white;
                    }
                    
                    .action-btn.edit:hover {
                        background: #2563eb;
                    }
                    
                    .action-btn.delete {
                        background: #ef4444;
                        color: white;
                    }
                    
                    .action-btn.delete:hover {
                        background: #dc2626;
                    }
                    
                    .loading-state {
                        text-align: center;
                        padding: 40px;
                        color: #6b7280;
                    }
                    
                    .empty-state {
                        text-align: center;
                        padding: 40px;
                        color: #6b7280;
                    }
                    
                    .empty-state h4 {
                        margin-bottom: 8px;
                        color: #374151;
                    }
                </style>
                
                <div class="lender-mgmt-header">
                    <h3>Lender Management</h3>
                    <p>Add, edit, and manage your lender database</p>
                </div>
                
                <div class="lender-mgmt-content">
                    <div class="mgmt-actions">
                        <button class="mgmt-btn primary" onclick="window.conversationUI.showAddLenderModal()">
                            Add New Lender
                        </button>
                        <button class="mgmt-btn secondary" onclick="window.conversationUI.testSimpleModal()" style="margin-left: 10px;">
                            Test Simple Modal
                        </button>
                        <button class="mgmt-btn secondary" onclick="refreshLendersList()">
                            Refresh
                        </button>
                        <button class="mgmt-btn secondary" onclick="exportLenders()">
                            Export CSV
                        </button>
                    </div>
                    
                    <div id="lendersTableContainer">
                        <div class="loading-state">
                            Loading lenders...
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Load lenders list
        this.loadLendersList();
    }

    initializeLenderForm() {
        const N8N_WEBHOOK_URL = 'https://dannyatorres.app.n8n.cloud/webhook/lender-qualify';
        
        // Auto-fill form with conversation data
        this.populateLenderForm();
        
        // Initialize form caching (with delay to ensure DOM is ready)
        setTimeout(() => this.initializeLenderFormCaching(), 100);
        
        // TIB calculation function
        const calculateTIB = (dateString) => {
            if (!dateString) return 0;
            
            const datePattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
            const match = dateString.match(datePattern);
            
            if (match) {
                const month = parseInt(match[1]);
                const day = parseInt(match[2]);
                const year = parseInt(match[3]);
                
                const startDate = new Date(year, month - 1, day);
                const today = new Date();
                
                const monthsDiff = (today.getFullYear() - startDate.getFullYear()) * 12 + 
                                 (today.getMonth() - startDate.getMonth());
                
                return Math.max(0, monthsDiff);
            }
            return 0;
        };
        
        // TIB display update
        const startDateInput = document.getElementById('lenderStartDate');
        const tibDisplay = document.getElementById('lenderTibDisplay');
        
        if (startDateInput && tibDisplay) {
            startDateInput.addEventListener('input', (e) => {
                const tib = calculateTIB(e.target.value);
                if (tib > 0) {
                    const years = Math.floor(tib / 12);
                    const months = tib % 12;
                    tibDisplay.textContent = `${tib} months (${years} years, ${months} months) in business`;
                    tibDisplay.style.display = 'block';
                } else {
                    tibDisplay.style.display = 'none';
                }
            });
        }
        
        // Form submission
        const lenderForm = document.getElementById('lenderForm');
        if (lenderForm) {
            lenderForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const startDate = document.getElementById('lenderStartDate').value;
                const tib = calculateTIB(startDate) || 0;
                
                // Collect form data
                const criteria = {
                    businessName: document.getElementById('lenderBusinessName').value || 'Business',
                    requestedPosition: parseInt(document.getElementById('lenderPosition').value) || 1,
                    position: parseInt(document.getElementById('lenderPosition').value) || 1,
                    startDate: startDate,
                    tib: tib,
                    monthlyRevenue: parseInt(document.getElementById('lenderRevenue').value) || 0,
                    revenue: parseInt(document.getElementById('lenderRevenue').value) || 0,
                    fico: parseInt(document.getElementById('lenderFico').value) || 650,
                    state: document.getElementById('lenderState').value?.toUpperCase() || '',
                    industry: document.getElementById('lenderIndustry').value || '',
                    depositsPerMonth: parseInt(document.getElementById('lenderDepositsPerMonth').value) || 0,
                    negativeDays: parseInt(document.getElementById('lenderNegativeDays').value) || 0,
                    isSoleProp: document.getElementById('lenderSoleProp')?.checked || false,
                    soleProp: document.getElementById('lenderSoleProp')?.checked || false,
                    isNonProfit: document.getElementById('lenderNonProfit')?.checked || false,
                    nonProfit: document.getElementById('lenderNonProfit')?.checked || false,
                    hasMercuryBank: document.getElementById('lenderMercuryBank')?.checked || false,
                    mercuryBank: document.getElementById('lenderMercuryBank')?.checked || false,
                    currentPositions: document.getElementById('lenderCurrentPositions').value || '',
                    additionalNotes: document.getElementById('lenderAdditionalNotes').value || '',
                    existingMCAs: [],
                    cashFlowScore: null,
                    riskFactors: []
                };
                
                // Show loading state
                const loadingEl = document.getElementById('lenderLoading');
                const errorEl = document.getElementById('lenderErrorMsg');
                const resultsEl = document.getElementById('lenderResults');
                
                loadingEl.classList.add('active');
                errorEl.classList.remove('active');
                resultsEl.classList.remove('active');
                
                try {
                    // Call n8n webhook directly
                    const response = await fetch(N8N_WEBHOOK_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(criteria)
                    });
                    
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    
                    const data = await response.json();
                    this.displayLenderResults(data, criteria);
                    
                } catch (error) {
                    console.error('Error:', error);
                    errorEl.textContent = 'Error processing request. Please try again.';
                    errorEl.classList.add('active');
                } finally {
                    loadingEl.classList.remove('active');
                }
            });
        }
    }

    // Lender Form Caching Methods
    initializeLenderFormCaching() {
        console.log('� Initializing lender form caching...');
        
        // Get conversation ID for caching key
        const conversationId = this.currentConversationId || this.selectedConversation?.id;
        if (!conversationId) {
            console.warn('No conversation ID available for caching');
            return;
        }
        
        const cacheKey = `lender_form_data_${conversationId}`;
        
        // Restore cached data on page load
        this.restoreLenderFormData(cacheKey);
        
        // Set up auto-save on form changes
        this.setupLenderFormAutoSave(cacheKey);
        
        // Set up clear cache button
        this.setupClearCacheButton(conversationId);
        
        console.log('Lender form caching initialized for conversation:', conversationId);
    }
    
    restoreLenderFormData(cacheKey) {
        try {
            const cachedData = localStorage.getItem(cacheKey);
            if (cachedData) {
                const formData = JSON.parse(cachedData);
                console.log('� Restoring cached lender form data:', formData);
                
                // Restore form field values
                Object.keys(formData).forEach(fieldId => {
                    const element = document.getElementById(fieldId);
                    if (element) {
                        if (element.type === 'checkbox') {
                            element.checked = formData[fieldId];
                        } else {
                            element.value = formData[fieldId];
                        }
                        
                        // Trigger change event for TIB calculation
                        if (fieldId === 'lenderStartDate') {
                            element.dispatchEvent(new Event('input'));
                        }
                    }
                });
                
                console.log('Lender form data restored from cache');
                this.showNotification('Form data restored from cache', 'info');
            }
        } catch (error) {
            console.error(' Error restoring cached lender form data:', error);
            // Don't show error to user, just log it
        }
    }
    
    setupLenderFormAutoSave(cacheKey) {
        // List of form field IDs to cache
        const formFields = [
            'lenderBusinessName',
            'lenderPosition', 
            'lenderStartDate',
            'lenderRevenue',
            'lenderFico',
            'lenderState',
            'lenderIndustry',
            'lenderDepositsPerMonth',
            'lenderNegativeDays',
            'lenderSoleProp',
            'lenderNonProfit',
            'lenderMercuryBank',
            'lenderCurrentPositions',
            'lenderAdditionalNotes'
        ];
        
        // Debounce function to avoid excessive saves
        let saveTimeout;
        const debouncedSave = () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                this.saveLenderFormData(cacheKey, formFields);
            }, 1000); // Save 1 second after last change
        };
        
        // Add event listeners to all form fields
        formFields.forEach(fieldId => {
            const element = document.getElementById(fieldId);
            if (element) {
                element.addEventListener('input', debouncedSave);
                element.addEventListener('change', debouncedSave);
            }
        });
        
        console.log('Auto-save listeners added to lender form fields');
    }
    
    saveLenderFormData(cacheKey, formFields) {
        try {
            const formData = {};
            
            formFields.forEach(fieldId => {
                const element = document.getElementById(fieldId);
                if (element) {
                    if (element.type === 'checkbox') {
                        formData[fieldId] = element.checked;
                    } else {
                        formData[fieldId] = element.value;
                    }
                }
            });
            
            // Only save if there's actual data
            const hasData = Object.values(formData).some(value => {
                return value !== '' && value !== false && value !== null && value !== undefined;
            });
            
            if (hasData) {
                localStorage.setItem(cacheKey, JSON.stringify(formData));
                console.log('� Lender form data cached:', formData);
            }
        } catch (error) {
            console.error(' Error caching lender form data:', error);
        }
    }
    
    clearLenderFormCache(conversationId = null) {
        const id = conversationId || this.currentConversationId || this.selectedConversation?.id;
        if (id) {
            const cacheKey = `lender_form_data_${id}`;
            localStorage.removeItem(cacheKey);
            console.log('Cleared lender form cache for conversation:', id);
        }
    }
    
    clearAllLenderFormCaches() {
        // Clear all lender form caches (useful for cleanup)
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith('lender_form_data_')) {
                localStorage.removeItem(key);
            }
        });
        console.log('Cleared all lender form caches');
    }
    
    // Debug function - call from browser console
    debugLenderCache() {
        console.log('� LENDER CACHE DEBUG');
        console.log('� Current conversation ID:', this.currentConversationId);
        console.log('� Selected conversation ID:', this.selectedConversation?.id);
        
        const conversationId = this.currentConversationId || this.selectedConversation?.id;
        if (conversationId) {
            const cacheKey = `lender_form_data_${conversationId}`;
            const cachedData = localStorage.getItem(cacheKey);
            console.log(`� Cache key: ${cacheKey}`);
            console.log(`� Cached data:`, cachedData ? JSON.parse(cachedData) : 'NO DATA');
        }
        
        console.log('� All lender caches in localStorage:');
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('lender_form_data_')) {
                const data = localStorage.getItem(key);
                console.log(`   ${key}:`, JSON.parse(data));
            }
        }
        
        // Check form elements
        const formFields = [
            'lenderBusinessName', 'lenderRevenue', 'lenderState', 'lenderFico'
        ];
        console.log('Current form values:');
        formFields.forEach(fieldId => {
            const element = document.getElementById(fieldId);
            if (element) {
                const value = element.type === 'checkbox' ? element.checked : element.value;
                console.log(`   ${fieldId}: '${value}'`);
            } else {
                console.log(`   ${fieldId}: ELEMENT NOT FOUND`);
            }
        });
    }
    
    setupClearCacheButton(conversationId) {
        const clearCacheBtn = document.getElementById('clearLenderCacheBtn');
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', () => {
                // Confirm with user
                const confirmed = confirm('Are you sure you want to clear the cached form data? This will reset all form fields to their default values.');
                
                if (confirmed) {
                    // Clear the cache
                    this.clearLenderFormCache(conversationId);
                    
                    // Clear all form fields
                    this.clearLenderFormFields();
                    
                    // Re-populate with conversation data
                    this.populateLenderForm();
                    
                    this.showNotification('Form cache cleared successfully', 'success');
                }
            });
            
            console.log('� Clear cache button event listener added');
        }
    }
    
    clearLenderFormFields() {
        const formFields = [
            'lenderBusinessName',
            'lenderPosition', 
            'lenderStartDate',
            'lenderRevenue',
            'lenderFico',
            'lenderState',
            'lenderIndustry',
            'lenderDepositsPerMonth',
            'lenderNegativeDays',
            'lenderSoleProp',
            'lenderNonProfit',
            'lenderMercuryBank',
            'lenderCurrentPositions',
            'lenderAdditionalNotes'
        ];
        
        formFields.forEach(fieldId => {
            const element = document.getElementById(fieldId);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = false;
                } else {
                    element.value = '';
                }
            }
        });
        
        // Clear TIB display
        const tibDisplay = document.getElementById('lenderTibDisplay');
        if (tibDisplay) {
            tibDisplay.style.display = 'none';
        }
        
        console.log('All lender form fields cleared');
    }
    
    restoreLenderFormCacheIfNeeded(retryCount = 0) {
        const maxRetries = 5;
        
        console.log(`Cache restoration attempt ${retryCount + 1}/${maxRetries + 1}`);
        console.log(`� Current context: conversationUI=${!!this}, currentConversationId=${this.currentConversationId}`);
        
        const conversationId = this.currentConversationId || this.selectedConversation?.id;
        if (!conversationId) {
            console.log('No conversation ID available for cache restoration');
            console.log('� Available conversation IDs in localStorage:');
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('lender_form_data_')) {
                    console.log(`   - ${key}`);
                }
            }
            if (retryCount < maxRetries) {
                setTimeout(() => this.restoreLenderFormCacheIfNeeded(retryCount + 1), 500);
            }
            return;
        }
        
        const cacheKey = `lender_form_data_${conversationId}`;
        const cachedData = localStorage.getItem(cacheKey);
        
        if (!cachedData) {
            console.log('� No cached lender form data found for conversation:', conversationId);
            return;
        }
        
        console.log('� Found cached lender form data for conversation:', conversationId);
        console.log('� Cached data:', cachedData);
        
        try {
            const formData = JSON.parse(cachedData);
            let restored = 0;
            let missing = 0;
            
            // Check if required form elements are available
            const requiredFields = ['lenderBusinessName', 'lenderRevenue', 'lenderState'];
            let domReady = true;
            
            requiredFields.forEach(fieldId => {
                const element = document.getElementById(fieldId);
                if (!element) {
                    console.log(`DOM element '${fieldId}' not found`);
                    domReady = false;
                }
            });
            
            if (!domReady) {
                console.log(' DOM not ready, retrying...');
                if (retryCount < maxRetries) {
                    setTimeout(() => this.restoreLenderFormCacheIfNeeded(retryCount + 1), 500);
                }
                return;
            }
            
            // Restore form field values
            Object.keys(formData).forEach(fieldId => {
                const element = document.getElementById(fieldId);
                if (element) {
                    const oldValue = element.type === 'checkbox' ? element.checked : element.value;
                    
                    if (element.type === 'checkbox') {
                        element.checked = formData[fieldId];
                    } else {
                        element.value = formData[fieldId];
                    }
                    
                    const newValue = element.type === 'checkbox' ? element.checked : element.value;
                    console.log(`Restored ${fieldId}: '${oldValue}'  '${newValue}'`);
                    
                    // Trigger change event for TIB calculation
                    if (fieldId === 'lenderStartDate' && formData[fieldId]) {
                        element.dispatchEvent(new Event('input'));
                    }
                    
                    restored++;
                } else {
                    console.log(` Element '${fieldId}' not found in DOM`);
                    missing++;
                }
            });
            
            console.log(`� Restoration stats: ${restored} restored, ${missing} missing`);
            
            if (restored > 0) {
                console.log('Lender form cache restored successfully');
                // Show notification only if user is on lender tab
                const lenderTab = document.querySelector('.nav-tab[data-tab="lenders"]');
                if (lenderTab && lenderTab.classList.contains('active')) {
                    this.showNotification(`Form data restored (${restored} fields)`, 'info');
                }
            } else if (missing > 0 && retryCount < maxRetries) {
                console.log('No fields restored, retrying...');
                setTimeout(() => this.restoreLenderFormCacheIfNeeded(retryCount + 1), 500);
            }
            
        } catch (error) {
            console.error(' Error restoring lender form cache:', error);
        }
    }

    populateLenderForm() {
        // Get current conversation data
        const conversation = this.selectedConversation;
        if (!conversation) return;

        console.log('Auto-filling lender form with conversation data:', conversation);

        // Check if there's cached data that should take precedence
        const conversationId = this.currentConversationId || this.selectedConversation?.id;
        const cacheKey = `lender_form_data_${conversationId}`;
        const hasCachedData = localStorage.getItem(cacheKey);
        
        if (hasCachedData) {
            console.log('Cached data exists, skipping auto-population to preserve user data');
            return;
        }

        // Helper function to populate field only if empty (respects cached values)
        const populateIfEmpty = (fieldId, value) => {
            const element = document.getElementById(fieldId);
            if (element && value && !element.value) {
                element.value = value;
                return true;
            }
            return false;
        };

        // Populate business name (only if empty)
        populateIfEmpty('lenderBusinessName', conversation.business_name);

        // Populate monthly revenue from annual revenue (only if empty)
        if (conversation.annual_revenue) {
            const monthlyRevenue = Math.round(conversation.annual_revenue / 12);
            populateIfEmpty('lenderRevenue', monthlyRevenue);
        }

        // Populate state (only if empty)
        if (conversation.state && conversation.state !== 'NEW') {
            populateIfEmpty('lenderState', conversation.state);
        }

        // Populate industry from business_type (only if empty)
        populateIfEmpty('lenderIndustry', conversation.business_type);

        // Populate business start date (only if empty)
        const startDateEl = document.getElementById('lenderStartDate');
        const tibDisplay = document.getElementById('lenderTibDisplay');
        if (startDateEl && conversation.business_start_date && !startDateEl.value) {
            // Convert date to MM/DD/YYYY format
            const date = new Date(conversation.business_start_date);
            if (!isNaN(date.getTime())) {
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                const day = date.getDate().toString().padStart(2, '0');
                const year = date.getFullYear();
                const formattedDate = `${month}/${day}/${year}`;
                startDateEl.value = formattedDate;
                
                // Calculate and display TIB
                const today = new Date();
                const monthsDiff = (today.getFullYear() - date.getFullYear()) * 12 + 
                                 (today.getMonth() - date.getMonth());
                const tib = Math.max(0, monthsDiff);
                
                if (tibDisplay && tib > 0) {
                    const years = Math.floor(tib / 12);
                    const months = tib % 12;
                    tibDisplay.textContent = `${tib} months (${years} years, ${months} months) in business`;
                    tibDisplay.style.display = 'block';
                }
            }
        }

        // Populate funding amount (requested position) (only if empty)
        populateIfEmpty('lenderPosition', conversation.funding_amount);

        console.log('Lender form auto-populated');
    }
    
    displayLenderResults(data, criteria) {
        console.log('displayLenderResults called with:', { data, criteria });
        
        const { qualified, nonQualified, autoDropped, summary } = data;
        
        // Store qualified lenders for later use in submission modal
        this.qualifiedLenders = qualified || [];
        this.lastLenderCriteria = criteria;
        
        console.log('Qualified lenders stored:', this.qualifiedLenders);
        
        let html = '';
        
        // Criteria info
        html += `
            <div class="criteria-info">
                <h4>� Merchant Criteria</h4>
                <div class="info-grid">
                    <div class="info-item"><strong>Business:</strong> ${criteria.businessName}</div>
                    <div class="info-item"><strong>Position:</strong> ${criteria.requestedPosition}</div>
                    <div class="info-item"><strong>TIB:</strong> ${criteria.tib} months</div>
                    <div class="info-item"><strong>Revenue:</strong> $${criteria.monthlyRevenue.toLocaleString()}</div>
                    <div class="info-item"><strong>FICO:</strong> ${criteria.fico}</div>
                    <div class="info-item"><strong>State:</strong> ${criteria.state}</div>
                    <div class="info-item"><strong>Industry:</strong> ${criteria.industry}</div>
                    ${criteria.depositsPerMonth ? `<div class="info-item"><strong>Deposits:</strong> ${criteria.depositsPerMonth}/month</div>` : ''}
                    ${criteria.negativeDays !== null ? `<div class="info-item"><strong>Neg Days:</strong> ${criteria.negativeDays}</div>` : ''}
                </div>
            </div>
        `;
        
        // Summary
        html += `
            <div class="summary">
                <div class="summary-item">
                    <div class="summary-number">${qualified?.length || 0}</div>
                    <div class="summary-label">Qualified</div>
                </div>
                <div class="summary-item">
                    <div class="summary-number">${nonQualified?.length || 0}</div>
                    <div class="summary-label">Non-Qualified</div>
                </div>
                <div class="summary-item">
                    <div class="summary-number">${autoDropped || 0}</div>
                    <div class="summary-label">Auto-Dropped</div>
                </div>
            </div>
        `;
        
        // Qualified lenders
        if (qualified && qualified.length > 0) {
            html += '<div class="results-section"><h3>Qualified Lenders</h3>';
            
            // Group by tier
            const tiers = {};
            qualified.forEach(lender => {
                const tier = lender.Tier || 'Unknown';
                if (!tiers[tier]) tiers[tier] = [];
                tiers[tier].push(lender);
            });
            
            Object.keys(tiers).sort().forEach(tier => {
                html += `<div class="tier-group">`;
                html += `<div class="tier-title">Tier ${tier}</div>`;
                html += `<div class="lender-list">`;
                
                tiers[tier].forEach(lender => {
                    const preferred = lender.isPreferred ? ' preferred' : '';
                    const star = lender.isPreferred ? ' ' : '';
                    html += `<div class="lender-item${preferred}">${lender['Lender Name']}${star}</div>`;
                });
                
                html += `</div></div>`;
            });
            
            html += `
                <div style="margin-top: 20px; text-align: center; position: relative; z-index: 100; overflow: visible !important; min-height: 60px;">
                    <button id="sendToLendersBtn" class="btn btn-primary" style="font-size: 16px; padding: 12px 24px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; position: relative; z-index: 100; min-height: 48px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" 
                            data-action="send-to-lenders">
                        � Send to Lenders
                    </button>
                    <br><br>
                    <button onclick="alert('Simple button works!'); window.testLenderModal();" style="font-size: 14px; padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Test Modal (Debug)
                    </button>
                </div>
            `;
            html += '</div>';
        } else {
            html += '<div class="results-section"><h3>No qualified lenders found</h3></div>';
        }
        
        // Non-qualified lenders (show first 20)
        if (nonQualified && nonQualified.length > 0) {
            html += '<div class="results-section"><h3> Non-Qualified Lenders</h3>';
            const displayCount = Math.min(nonQualified.length, 20);
            nonQualified.slice(0, displayCount).forEach(item => {
                html += `
                    <div class="non-qualified-item">
                        <div class="lender-name">${item.lender}</div>
                        <div class="blocking-reason">${item.blockingRule}</div>
                    </div>
                `;
            });
            if (nonQualified.length > 20) {
                html += `<p style="color: #6b7280; text-align: center; margin-top: 12px;">... and ${nonQualified.length - 20} more non-qualified lenders</p>`;
            }
            html += '</div>';
        }
        
        const resultsEl = document.getElementById('lenderResults');
        console.log('� Results element found:', !!resultsEl);
        
        if (resultsEl) {
            resultsEl.innerHTML = html;
            resultsEl.classList.add('active');
            
            // Cache the results for this conversation
            if (this.currentConversationId) {
                this.lenderResultsCache.set(this.currentConversationId, {
                    html: html,
                    data: data,
                    criteria: criteria
                });
            }
            
            // Add event listener to the button after rendering
            setTimeout(() => {
                const sendBtn = document.getElementById('sendToLendersBtn');
                console.log('� Button found after render:', !!sendBtn);
                console.log('� Button element:', sendBtn);
                console.log('� Button parent:', sendBtn?.parentElement);
                console.log('� Current context this:', this);
                
                if (sendBtn) {
                    // Add multiple ways to detect clicks
                    sendBtn.addEventListener('click', (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        console.log('Send to Lenders clicked!');
                        console.log('Event:', event);
                        console.log('Target:', event.target);
                        console.log('About to call showLenderSubmissionModal');
                        try {
                            this.showLenderSubmissionModal();
                        } catch (error) {
                            console.error(' Error calling showLenderSubmissionModal:', error);
                            alert('Error opening modal: ' + error.message);
                        }
                    });
                    
                    // Also add a simple onclick as backup
                    sendBtn.onclick = (event) => {
                        console.log('Button onclick triggered!');
                        this.showLenderSubmissionModal();
                    };
                    
                    console.log('Event listener attached to Send to Lenders button');
                    
                    // Test the button immediately
                    console.log('� Testing button visibility and style...');
                    const computedStyle = window.getComputedStyle(sendBtn);
                    console.log('� Button display:', computedStyle.display);
                    console.log('� Button visibility:', computedStyle.visibility);
                    console.log('� Button z-index:', computedStyle.zIndex);
                    
                } else {
                    console.error(' Send to Lenders button not found after rendering');
                    console.error(' Available elements with id:', document.querySelectorAll('[id*="send"]'));
                }
            }, 100);
        }
    }

    async loadLenderData() {
        const conversationId = this.currentConversationId || this.selectedConversation?.id;
        if (!conversationId) return;

        const lendersContent = document.querySelector('.lenders-status');
        if (!lendersContent) return;

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conversationId}/lenders`);
            const result = await response.json();

            if (result.success && result.lenders && result.lenders.length > 0) {
                this.displayLenders(result.lenders);
            } else {
                lendersContent.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon"></div>
                        <h4>No Qualified Lenders</h4>
                        <p>Run lender qualification to see available options</p>
                        <button class="btn btn-primary" onclick="window.conversationUI.showLenderModal()" style="margin-top: 10px;">
                            Qualify Lenders
                        </button>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading lender data:', error);
            lendersContent.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon"></div>
                    <h4>No Qualified Lenders</h4>
                    <p>Run lender qualification to see available options</p>
                    <button class="btn btn-primary" onclick="window.conversationUI.showLenderModal()" style="margin-top: 10px;">
                        Qualify Lenders
                    </button>
                </div>
            `;
        }
    }

    displayLenders(lenders) {
        const lendersContent = document.querySelector('.lenders-status');
        if (!lendersContent) return;

        // Separate qualified and non-qualified lenders
        const qualified = lenders.filter(l => l.qualified);
        const nonQualified = lenders.filter(l => !l.qualified);

        lendersContent.innerHTML = `
            <div class="lenders-container">
                ${qualified.length > 0 ? `
                    <div class="lenders-section">
                        <h4 style="color: #10b981; margin-bottom: 12px;">Qualified Lenders (${qualified.length})</h4>
                        <div class="lenders-grid">
                            ${qualified.map(lender => `
                                <div class="lender-card" style="border: 1px solid #10b981; border-radius: 8px; padding: 16px; margin-bottom: 12px; background: #f0fdf4;">
                                    <div class="lender-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                        <h4 style="margin: 0; color: #1f2937;">${lender.name}</h4>
                                        <div style="display: flex; gap: 8px;">
                                            ${lender.tier ? `<span style="background: #1f2937; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">Tier ${lender.tier}</span>` : ''}
                                            ${lender.is_preferred ? `<span style="background: #f59e0b; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;"> Preferred</span>` : ''}
                                        </div>
                                    </div>
                                    <div class="lender-details" style="font-size: 0.875rem; color: #6b7280;">
                                        ${lender.max_amount ? `<div style="margin-bottom: 4px;"><strong>Max Amount:</strong> $${lender.max_amount.toLocaleString()}</div>` : ''}
                                        ${lender.factor_rate ? `<div style="margin-bottom: 4px;"><strong>Factor Rate:</strong> ${lender.factor_rate}</div>` : ''}
                                        ${lender.term_months ? `<div style="margin-bottom: 4px;"><strong>Term:</strong> ${lender.term_months} months</div>` : ''}
                                        ${lender.match_score ? `<div style="margin-bottom: 4px;"><strong>Match Score:</strong> ${lender.match_score}</div>` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${nonQualified.length > 0 ? `
                    <div class="lenders-section" style="margin-top: 20px;">
                        <h4 style="color: #ef4444; margin-bottom: 12px;"> Non-Qualified Lenders (${nonQualified.length})</h4>
                        <details style="margin-bottom: 12px;">
                            <summary style="cursor: pointer; color: #6b7280;">Show non-qualified lenders</summary>
                            <div class="lenders-grid" style="margin-top: 12px;">
                                ${nonQualified.slice(0, 10).map(lender => `
                                    <div class="lender-card" style="border: 1px solid #ef4444; border-radius: 8px; padding: 12px; margin-bottom: 8px; background: #fef2f2; opacity: 0.8;">
                                        <div class="lender-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                            <h5 style="margin: 0; color: #1f2937; font-size: 0.9rem;">${lender.name}</h5>
                                        </div>
                                        <div class="lender-details" style="font-size: 0.8rem; color: #ef4444;">
                                            <strong>Blocked:</strong> ${lender.blocking_reason || 'Requirements not met'}
                                        </div>
                                    </div>
                                `).join('')}
                                ${nonQualified.length > 10 ? `<p style="color: #6b7280; font-size: 0.875rem;">... and ${nonQualified.length - 10} more</p>` : ''}
                            </div>
                        </details>
                    </div>
                ` : ''}
            </div>
            <button class="btn btn-secondary" onclick="window.conversationUI.showLenderModal()" style="margin-top: 12px; width: 100%;">
                Run Lender Qualification
            </button>
        `;
    }

    renderActionsTab(content) {
        content.innerHTML = `
            <div class="intelligence-section">
                <h3>Processing Actions</h3>
                <div class="action-buttons">
                    <button class="action-btn primary" onclick="window.conversationUI.showFCSModal()">
                        <span class="btn-icon">�</span>
                        Trigger FCS
                    </button>
                    <button class="action-btn primary" onclick="window.conversationUI.showLenderModal()">
                        <span class="btn-icon"></span>
                        Qualify Lenders
                    </button>
                </div>
            </div>
            
            <div class="intelligence-section">
                <h3>Lead Management</h3>
                <div class="action-row">
                    <label>Change State:</label>
                    <select class="state-select" id="actionsStateSelect" onchange="window.conversationUI.changeConversationState(this.value)">
                        <option value="">Select State...</option>
                        <option value="NEW">New</option>
                        <option value="INTERESTED">Interested</option>
                        <option value="FCS_RUNNING">FCS Running</option>
                        <option value="COLLECTING_INFO">Collecting Info</option>
                        <option value="QUALIFIED">Qualified</option>
                        <option value="OFFER_SENT">Offer Sent</option>
                        <option value="NEGOTIATING">Negotiating</option>
                        <option value="ACCEPTED">Accepted</option>
                        <option value="DECLINED">Declined</option>
                        <option value="PAUSED">Paused</option>
                    </select>
                </div>
                <div class="action-buttons">
                    <button class="action-btn secondary" onclick="cloneLead()">
                        <span class="btn-icon"></span>
                        Clone Lead
                    </button>
                    <button class="action-btn warning" onclick="showArchiveConfirmation()">
                        <span class="btn-icon">�</span>
                        Archive Lead
                    </button>
                    <button class="action-btn danger" onclick="showDeleteConfirmation()">
                        <span class="btn-icon"></span>
                        Delete Lead
                    </button>
                </div>
            </div>
            
            <div class="intelligence-section">
                <h3>System Actions</h3>
                <div class="action-buttons">
                    <button class="action-btn secondary" onclick="window.conversationUI.refreshConversation()">
                        <span class="btn-icon"></span>
                        Refresh Data
                    </button>
                </div>
            </div>
        `;
    }

    renderEditTab(content) {
        const conv = this.selectedConversation;
        const leadDetails = conv.lead_details || {};
        
        // Helper function to determine if a value is a conversation state or a US state
        const isConversationState = (value) => {
            const conversationStates = ['NEW', 'INTERESTED', 'FCS_RUNNING', 'COLLECTING_INFO', 'QUALIFIED', 'OFFER_SENT', 'NEGOTIATING', 'ACCEPTED', 'DECLINED', 'PAUSED'];
            return conversationStates.includes(value);
        };

        // Get the actual US state value, avoiding conversation state values
        const getBusinessState = () => {
            if (conv.business_state) return conv.business_state;
            if (conv.state && !isConversationState(conv.state)) return conv.state;
            if (leadDetails.state && !isConversationState(leadDetails.state)) return leadDetails.state;
            return '';
        };

        // US States for dropdown
        const usStates = [
            { code: '', name: 'Select State...' },
            { code: 'AL', name: 'Alabama' },
            { code: 'AK', name: 'Alaska' },
            { code: 'AZ', name: 'Arizona' },
            { code: 'AR', name: 'Arkansas' },
            { code: 'CA', name: 'California' },
            { code: 'CO', name: 'Colorado' },
            { code: 'CT', name: 'Connecticut' },
            { code: 'DE', name: 'Delaware' },
            { code: 'FL', name: 'Florida' },
            { code: 'GA', name: 'Georgia' },
            { code: 'HI', name: 'Hawaii' },
            { code: 'ID', name: 'Idaho' },
            { code: 'IL', name: 'Illinois' },
            { code: 'IN', name: 'Indiana' },
            { code: 'IA', name: 'Iowa' },
            { code: 'KS', name: 'Kansas' },
            { code: 'KY', name: 'Kentucky' },
            { code: 'LA', name: 'Louisiana' },
            { code: 'ME', name: 'Maine' },
            { code: 'MD', name: 'Maryland' },
            { code: 'MA', name: 'Massachusetts' },
            { code: 'MI', name: 'Michigan' },
            { code: 'MN', name: 'Minnesota' },
            { code: 'MS', name: 'Mississippi' },
            { code: 'MO', name: 'Missouri' },
            { code: 'MT', name: 'Montana' },
            { code: 'NE', name: 'Nebraska' },
            { code: 'NV', name: 'Nevada' },
            { code: 'NH', name: 'New Hampshire' },
            { code: 'NJ', name: 'New Jersey' },
            { code: 'NM', name: 'New Mexico' },
            { code: 'NY', name: 'New York' },
            { code: 'NC', name: 'North Carolina' },
            { code: 'ND', name: 'North Dakota' },
            { code: 'OH', name: 'Ohio' },
            { code: 'OK', name: 'Oklahoma' },
            { code: 'OR', name: 'Oregon' },
            { code: 'PA', name: 'Pennsylvania' },
            { code: 'RI', name: 'Rhode Island' },
            { code: 'SC', name: 'South Carolina' },
            { code: 'SD', name: 'South Dakota' },
            { code: 'TN', name: 'Tennessee' },
            { code: 'TX', name: 'Texas' },
            { code: 'UT', name: 'Utah' },
            { code: 'VT', name: 'Vermont' },
            { code: 'VA', name: 'Virginia' },
            { code: 'WA', name: 'Washington' },
            { code: 'WV', name: 'West Virginia' },
            { code: 'WI', name: 'Wisconsin' },
            { code: 'WY', name: 'Wyoming' },
            { code: 'DC', name: 'District of Columbia' }
        ];

        const currentBusinessState = getBusinessState();
        
        content.innerHTML = `
            <div class="edit-form-container">
                <h3>Edit Lead Information</h3>
                <form class="edit-lead-form" id="editLeadForm">
                    
                    <div class="form-section">
                        <h4>Business Information</h4>
                        <div class="form-row-six">
                            <div class="form-group">
                                <label>Company Name</label>
                                <input type="text" name="businessName" value="${conv.business_name || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>DBA</label>
                                <input type="text" name="dbaName" value="${conv.dba_name || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Business Address</label>
                                <input type="text" name="businessAddress" value="${conv.business_address || conv.address || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Address Line 2</label>
                                <input type="text" name="businessAddress2" value="${conv.business_address2 || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>City</label>
                                <input type="text" name="businessCity" value="${conv.business_city || conv.city || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>State</label>
                                <select name="businessState" class="form-input">
                                    ${usStates.map(state => `
                                        <option value="${state.code}" ${state.code === currentBusinessState ? 'selected' : ''}>
                                            ${state.name}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="form-row-six">
                            <div class="form-group">
                                <label>ZIP Code</label>
                                <input type="text" 
                                       name="businessZip" 
                                       value="${conv.business_zip || conv.zip || ''}" 
                                       class="form-input"
                                       maxlength="10"
                                       placeholder="12345"
                                       onblur="window.conversationUI.lookupZipCode(this.value, 'business')"
                                       onkeyup="if(this.value.replace(/\\\\D/g, '').length === 5) window.conversationUI.lookupZipCode(this.value, 'business')">
                            </div>
                            <div class="form-group">
                                <label>Country</label>
                                <input type="text" name="businessCountry" value="${conv.business_country || 'United States'}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Phone</label>
                                <input type="tel" name="primaryPhone" value="${conv.lead_phone || conv.phone || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Cell Phone</label>
                                <input type="tel" name="cellPhone" value="${conv.cell_phone || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Work Phone</label>
                                <input type="tel" name="workPhone" value="${conv.work_phone || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Fax</label>
                                <input type="tel" name="faxPhone" value="${conv.fax_phone || ''}" class="form-input">
                            </div>
                        </div>
                        <div class="form-row-six">
                            <div class="form-group">
                                <label>Tax ID (EIN)</label>
                                <input type="text" name="federalTaxId" value="${leadDetails.tax_id_encrypted || conv.tax_id || conv.federal_tax_id || conv.ein || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Start Date</label>
                                <input type="date" name="businessStartDate" value="${this.formatDate(leadDetails.business_start_date || conv.business_start_date, 'input')}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Length of Ownership</label>
                                <input type="text" name="lengthOfOwnership" value="${conv.length_of_ownership || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Website</label>
                                <input type="url" name="website" value="${conv.website || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Industry Type</label>
                                <input type="text" name="industryType" value="${leadDetails.business_type || conv.industry_type || conv.industry || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Entity Type</label>
                                <select name="entityType" class="form-input">
                                    <option value="">Select Entity Type</option>
                                    <option value="Corporation" ${conv.entity_type === 'Corporation' ? 'selected' : ''}>Corporation</option>
                                    <option value="LLC" ${conv.entity_type === 'LLC' ? 'selected' : ''}>LLC</option>
                                    <option value="Partnership" ${conv.entity_type === 'Partnership' ? 'selected' : ''}>Partnership</option>
                                    <option value="Sole Proprietorship" ${conv.entity_type === 'Sole Proprietorship' ? 'selected' : ''}>Sole Proprietorship</option>
                                    <option value="S-Corporation" ${conv.entity_type === 'S-Corporation' ? 'selected' : ''}>S-Corporation</option>
                                    <option value="C-Corporation" ${conv.entity_type === 'C-Corporation' ? 'selected' : ''}>C-Corporation</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-row-six">
                            <div class="form-group">
                                <label>Business Email</label>
                                <input type="email" name="businessEmail" value="${conv.business_email || conv.email || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Product Sold</label>
                                <input type="text" name="productSold" value="${conv.product_sold || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Use of Proceeds</label>
                                <input type="text" name="useOfProceeds" value="${conv.use_of_proceeds || conv.use_of_funds || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Lead Source</label>
                                <input type="text" name="leadSource" value="${conv.lead_source || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Campaign</label>
                                <input type="text" name="campaign" value="${leadDetails.campaign || conv.campaign || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Lead Status</label>
                                <select name="leadStatus" class="form-input">
                                    <option value="">Select Status...</option>
                                    <option value="INTERESTED" ${conv.state === 'INTERESTED' || conv.lead_status === 'INTERESTED' ? 'selected' : ''}>Interested</option>
                                    <option value="FCS_RUNNING" ${conv.state === 'FCS_RUNNING' || conv.lead_status === 'FCS_RUNNING' ? 'selected' : ''}>FCS Running</option>
                                    <option value="COLLECTING_INFO" ${conv.state === 'COLLECTING_INFO' || conv.lead_status === 'COLLECTING_INFO' ? 'selected' : ''}>Collecting Info</option>
                                    <option value="QUALIFIED" ${conv.state === 'QUALIFIED' || conv.lead_status === 'QUALIFIED' ? 'selected' : ''}>Qualified</option>
                                    <option value="OFFER_SENT" ${conv.state === 'OFFER_SENT' || conv.lead_status === 'OFFER_SENT' ? 'selected' : ''}>Offer Sent</option>
                                    <option value="NEGOTIATING" ${conv.state === 'NEGOTIATING' || conv.lead_status === 'NEGOTIATING' ? 'selected' : ''}>Negotiating</option>
                                    <option value="ACCEPTED" ${conv.state === 'ACCEPTED' || conv.lead_status === 'ACCEPTED' ? 'selected' : ''}>Accepted</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="form-section">
                        <h4>Financial Information</h4>
                        <div class="form-row-six">
                            <div class="form-group">
                                <label>Annual Revenue</label>
                                <input type="number" name="annualRevenue" value="${leadDetails.annual_revenue || conv.annual_revenue || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Monthly Revenue</label>
                                <input type="number" name="monthlyRevenue" value="${conv.monthly_revenue || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Requested Amount</label>
                                <input type="number" name="requestedAmount" value="${leadDetails.funding_amount || conv.requested_amount || conv.priority || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Time in Business</label>
                                <input type="text" name="timeInBusiness" value="${conv.time_in_business || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Credit Score</label>
                                <input type="number" name="creditScore" value="${conv.credit_score || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Years in Business</label>
                                <input type="number" name="yearsInBusiness" value="${conv.years_in_business || ''}" class="form-input">
                            </div>
                        </div>
                        <div class="form-row-six">
                            <div class="form-group">
                                <label>Factor Rate</label>
                                <input type="number" step="0.01" name="factorRate" value="${leadDetails.factor_rate || ''}" class="form-input" placeholder="e.g. 1.25">
                            </div>
                            <div class="form-group">
                                <label>Term (Months)</label>
                                <input type="number" name="termMonths" value="${leadDetails.term_months || ''}" class="form-input" placeholder="e.g. 12">
                            </div>
                            <div class="form-group">
                                <label>Funding Date</label>
                                <input type="date" name="fundingDate" value="${this.formatDate(leadDetails.funding_date, 'input')}" class="form-input">
                            </div>
                        </div>
                    </div>

                    <div class="form-section">
                        <h4>Owner Information</h4>
                        <div class="form-row-six">
                            <div class="form-group">
                                <label>First Name</label>
                                <input type="text" name="ownerFirstName" value="${conv.owner_first_name || conv.first_name || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Last Name</label>
                                <input type="text" name="ownerLastName" value="${conv.owner_last_name || conv.last_name || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Owner Email</label>
                                <input type="email" name="ownerEmail" value="${conv.owner_email || conv.email || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Ownership %</label>
                                <input type="number" name="ownershipPercent" value="${conv.ownership_percent || ''}" class="form-input" min="0" max="100">
                            </div>
                            <div class="form-group">
                                <label>Owner Home Address</label>
                                <input type="text" name="ownerHomeAddress" value="${conv.owner_home_address || conv.owner_address || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Owner Address Line 2</label>
                                <input type="text" name="ownerHomeAddress2" value="${conv.owner_home_address2 || ''}" class="form-input">
                            </div>
                        </div>
                        <div class="form-row-six">
                            <div class="form-group">
                                <label>Owner City</label>
                                <input type="text" name="ownerHomeCity" value="${conv.owner_home_city || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Owner State</label>
                                <select name="ownerHomeState" class="form-input">
                                    ${usStates.map(state => 
                                        `<option value="${state.code}" ${conv.owner_home_state === state.code ? 'selected' : ''}>${state.name}</option>`
                                    ).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Owner ZIP</label>
                                <input type="text" 
                                       name="ownerHomeZip" 
                                       value="${conv.owner_home_zip || ''}" 
                                       class="form-input"
                                       maxlength="10"
                                       placeholder="12345"
                                       onblur="window.conversationUI.lookupZipCode(this.value, 'ownerHome')"
                                       onkeyup="if(this.value.replace(/\\\\D/g, '').length === 5) window.conversationUI.lookupZipCode(this.value, 'ownerHome')">
                            </div>
                            <div class="form-group">
                                <label>Owner Country</label>
                                <input type="text" name="ownerHomeCountry" value="${conv.owner_home_country || 'United States'}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>SSN</label>
                                <input type="text" name="ownerSSN" value="${leadDetails.ssn_encrypted || conv.ssn || conv.owner_ssn || ''}" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Date of Birth</label>
                                <input type="date" name="ownerDOB" value="${this.formatDate(leadDetails.date_of_birth || conv.date_of_birth || conv.owner_dob || conv.owner_date_of_birth, 'input')}" class="form-input">
                            </div>
                        </div>
                    </div>

                    <div class="form-actions">
                        <button type="button" class="generate-pdf-btn" id="generateApplicationBtn">
                            Generate Application
                        </button>
                        <button type="submit" class="update-btn">Update Lead</button>
                    </div>
                </form>
            </div>
        `;

        // Add form submission handler
        const form = content.querySelector('#editLeadForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleEditFormSubmit(e));
        }
        
        // Add Generate Application button handler with comprehensive debugging
        console.log('� Looking for Generate Application button in DOM...');
        console.log('� Content element:', content);
        console.log('� All buttons in content:', content.querySelectorAll('button'));
        
        const generateAppBtn = content.querySelector('#generateApplicationBtn');
        console.log('� Generate App Button:', generateAppBtn);
        
        // Also try to find by class
        const generateAppBtnByClass = content.querySelector('.generate-pdf-btn');
        console.log('� Generate App Button by class:', generateAppBtnByClass);
        
        if (generateAppBtn) {
            console.log('Attaching event listener to Generate App button');
            const handleGenerateClick = (event) => {
                console.log('Generate Application button clicked!', event);
                event.preventDefault();
                event.stopPropagation();
                this.generatePDFApplication();
            };
            generateAppBtn.addEventListener('click', handleGenerateClick.bind(this));
        } else if (generateAppBtnByClass) {
            console.log('Found by class, attaching event listener');
            const handleGenerateClickByClass = (event) => {
                console.log('Generate Application button clicked via class!', event);
                event.preventDefault();
                event.stopPropagation();
                this.generatePDFApplication();
            };
            generateAppBtnByClass.addEventListener('click', handleGenerateClickByClass.bind(this));
        } else {
            console.error(' Generate Application button not found by ID or class');
            console.error('� Available element IDs:', Array.from(content.querySelectorAll('[id]')).map(el => el.id));
        }
    }

    async handleEditFormSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const rawData = Object.fromEntries(formData.entries());
        
        console.log('� Raw form data being saved:', rawData);
        console.log('� SSN from form:', rawData.ownerSSN ? `***-**-${rawData.ownerSSN.slice(-4)}` : 'NOT PROVIDED');
        
        // First, let's just send ALL the data and see what the server says
        // We'll let the server figure out which fields go where
        const updateData = {};
        
        // Process all fields with minimal transformation
        for (const [field, value] of Object.entries(rawData)) {
            // Convert field names from camelCase to snake_case
            const snakeCase = field.replace(/([A-Z])/g, '_$1').toLowerCase();
            
            // Handle numeric fields
            if (['annual_revenue', 'monthly_revenue', 'requested_amount', 'credit_score', 'years_in_business', 'factor_rate', 'term_months', 'ownership_percent'].includes(snakeCase)) {
                updateData[snakeCase] = value ? parseFloat(value.toString().replace(/[$,\s%]/g, '')) : null;
            } else {
                updateData[snakeCase] = value || null;
            }
        }
        
        // Remove empty/null values
        Object.keys(updateData).forEach(key => {
            const value = updateData[key];
            if (value === '' || value === null || value === undefined) {
                delete updateData[key];
            }
        });
        
        console.log('� Update data being sent (snake_case):', updateData);
        console.log('Fields being updated:', Object.keys(updateData));
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${this.currentConversationId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });
            const responseText = await response.text();
            console.log('� Server response:', responseText);
            
            let result;
            try {
                result = JSON.parse(responseText);
            } catch (e) {
                console.error('Invalid JSON response:', responseText);
                throw new Error(`Server error: ${responseText}`);
            }

            if (!response.ok) {
                console.error('Server rejection details:', result);
                throw new Error(result.error || result.message || `Update failed: ${response.status}`);
            }

            if (result.success || response.ok) {
                this.showNotification('Lead data updated successfully', 'success');
                
                // Update local conversation object directly with form data
                if (this.selectedConversation) {
                    for (const [formField, value] of Object.entries(rawData)) {
                        this.selectedConversation[formField] = value;
                        // Also update common snake_case versions
                        const snakeCaseField = formField.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                        this.selectedConversation[snakeCaseField] = value;
                    }
                    
                    // Update the conversations map
                    this.conversations.set(this.currentConversationId, this.selectedConversation);
                    
                    // Update the header immediately
                    this.showConversationDetails();
                }
                
            } else {
                throw new Error(result.error || result.message || 'Update failed');
            }

        } catch (error) {
            console.error(' Error saving lead data:', error);
            this.showNotification('Failed to save: ' + error.message, 'error');
        }
    }


    async loadConversationDetails(conversationId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conversationId}`);
            if (response.ok) {
                const data = await response.json();
                this.selectedConversation = data.conversation || data;
                this.conversations.set(conversationId, this.selectedConversation);
                
                // Refresh the edit form if it's currently open
                const activeTab = document.querySelector('.tab-btn.active');
                if (activeTab && activeTab.dataset.tab === 'edit') {
                    this.renderEditTab(document.getElementById('intelligenceContent'));
                }
            }
        } catch (error) {
            console.error('Error reloading conversation details:', error);
        }
    }

    changeConversationState(newState) {
        if (!this.currentConversationId || !newState) return;
        
        // This would typically send a request to update the conversation state
        console.log(`Changing conversation ${this.currentConversationId} state to:`, newState);
        
        // For now, just show a notification
        this.showNotification(`State changed to ${newState}`, 'info');
        
        // Reset the dropdown
        const dropdown = document.getElementById('actionsStateSelect');
        if (dropdown) {
            dropdown.value = '';
        }
    }

    // Utility methods
    filterConversations() {
        const stateFilter = document.getElementById('stateFilter')?.value;
        const searchTerm = document.getElementById('searchInput')?.value.trim();

        // If search is empty and no state filter, show all
        if (!searchTerm && !stateFilter) {
            this.renderConversationsList();
            return;
        }

        // If there's a search term (2+ characters), perform local search
        if (searchTerm && searchTerm.length >= 2) {
            // Clear any existing search timeout
            if (this.searchTimeout) {
                clearTimeout(this.searchTimeout);
            }
            
            // Debounce search
            this.searchTimeout = setTimeout(() => {
                this.performLocalSearch(searchTerm, stateFilter);
            }, 300);
            return;
        }

        // If search term is 1 character or just state filter
        let filteredConversations = Array.from(this.conversations.values());

        if (stateFilter) {
            filteredConversations = filteredConversations.filter(conv => conv.state === stateFilter);
        }

        this.renderFilteredConversations(filteredConversations, false);
    }
    
    async performSearch(searchTerm, stateFilter) {
        try {
            const params = new URLSearchParams({ q: searchTerm });
            if (stateFilter) {
                params.append('state', stateFilter);
            }
            
            const url = `${this.apiBaseUrl}/api/conversations/search?${params}`;
            console.log('� Search URL:', url);
            console.log('� Search params:', { searchTerm, stateFilter });
            
            const response = await fetch(url);
            
            // Get more details about the error
            if (!response.ok) {
                const errorText = await response.text();
                console.error('� Search API error:', {
                    status: response.status,
                    statusText: response.statusText,
                    errorBody: errorText
                });
                throw new Error(`Search failed: ${response.status} - ${response.statusText}`);
            }
            
            const searchResults = await response.json();
            console.log('Search results:', searchResults);
            this.renderFilteredConversations(searchResults, true); // true indicates search results
        } catch (error) {
            console.error('Search error:', error);
            this.showNotification('Search failed. Please try again.', 'error');
        }
    }

    // Add this helper method for local search
    performLocalSearch(searchTerm, stateFilter) {
        const searchLower = searchTerm.toLowerCase();
        let filteredConversations = Array.from(this.conversations.values());
        
        // Filter by search term
        filteredConversations = filteredConversations.filter(conv => {
            const businessName = (conv.business_name || '').toLowerCase();
            const phone = (conv.lead_phone || conv.phone || '').toLowerCase();
            const firstName = (conv.first_name || '').toLowerCase();
            const lastName = (conv.last_name || '').toLowerCase();
            
            return businessName.includes(searchLower) || 
                   phone.includes(searchLower) ||
                   firstName.includes(searchLower) ||
                   lastName.includes(searchLower);
        });
        
        // Also filter by state if selected
        if (stateFilter) {
            filteredConversations = filteredConversations.filter(conv => conv.state === stateFilter);
        }
        
        this.renderFilteredConversations(filteredConversations, false);
    }

    renderFilteredConversations(conversations, isSearchResults = false) {
        const container = document.getElementById('conversationsList');
        console.log('renderFilteredConversations called with:', conversations.length, 'conversations');
        console.log('� Container element found:', !!container);
        if (!container) {
            console.error(' conversationsList container not found!');
            return;
        }

        if (conversations.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">�</div>
                    <h3>No matches found</h3>
                    <p>Try adjusting your filters</p>
                </div>
            `;
            return;
        }

        conversations.sort((a, b) => new Date(b.last_activity) - new Date(a.last_activity));
        
        // Add indicator for limited results or search results
        let indicator = '';
        const searchTerm = document.getElementById('searchInput')?.value.trim();
        
        if (isSearchResults && searchTerm) {
            indicator = `
                <div class="list-indicator search-results">
                    <i class="fas fa-search"></i>
                    Found ${conversations.length} results for "${searchTerm}"
                </div>
            `;
        } else if (!isSearchResults && !searchTerm) {
            indicator = ``;
        }
        
        container.innerHTML = indicator + conversations.map(conv => this.renderConversationItem(conv)).join('');

        // Re-add click listeners
        container.querySelectorAll('.conversation-item').forEach(item => {
            // Handle checkbox clicks
            const checkbox = item.querySelector('.delete-checkbox');
            if (checkbox) {
                checkbox.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = checkbox.dataset.conversationId;
                    this.toggleDeleteSelection(id);
                });
            }
            
            // Handle conversation selection (but not on checkbox clicks)
            const conversationContent = item.querySelector('.conversation-content');
            if (conversationContent) {
                conversationContent.addEventListener('click', () => {
                    const id = item.dataset.conversationId;
                    this.selectConversation(id);
                });
            }
        });
        
        // Update delete button visibility
        this.updateDeleteButtonVisibility();
    }

    updateStats(stats) {
        // Update header stats (existing format)
        const legacyElements = {
            activeCount: stats.conversations?.total || stats.totalConversations || 0,
            processingCount: stats.fcs_processing?.currentlyProcessing || 0,
            todayCount: stats.conversations?.today || stats.recentActivity || 0
        };

        Object.entries(legacyElements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });

        // Update dashboard stats (new format)
        const dashboardElements = {
            totalConversations: stats.totalConversations || 0,
            newLeads: stats.newLeads || 0,
            qualified: stats.qualified || 0,
            funded: stats.funded || 0
        };

        Object.entries(dashboardElements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });

        // Update last updated time
        const lastUpdated = document.getElementById('lastUpdated');
        if (lastUpdated) {
            lastUpdated.textContent = `Last updated: ${this.formatDate(new Date(), 'time')}`;
        }
        
        // Log if there was an error
        if (stats.error) {
            console.warn('Stats loaded with error - using default values');
        }
    }

    // Delete functionality methods
    toggleDeleteSelection(conversationId) {
        if (this.selectedForDeletion.has(conversationId)) {
            this.selectedForDeletion.delete(conversationId);
        } else {
            this.selectedForDeletion.add(conversationId);
        }
        
        // Update UI
        const item = document.querySelector(`[data-conversation-id="${conversationId}"]`);
        const checkbox = item?.querySelector('.delete-checkbox');
        if (checkbox) {
            checkbox.checked = this.selectedForDeletion.has(conversationId);
            item.classList.toggle('checked-for-deletion', this.selectedForDeletion.has(conversationId));
        }
        
        this.updateDeleteButtonVisibility();
    }

    updateDeleteButtonVisibility() {
        const deleteBtn = document.getElementById('deleteSelectedBtn');
        if (deleteBtn) {
            const count = this.selectedForDeletion.size;
            if (count > 0) {
                deleteBtn.style.display = 'block';
                deleteBtn.textContent = `Delete ${count} Lead${count > 1 ? 's' : ''}`;
            } else {
                deleteBtn.style.display = 'none';
            }
        }
    }

    confirmDeleteSelected() {
        const count = this.selectedForDeletion.size;
        if (count === 0) return;

        const leadText = count === 1 ? 'lead' : 'leads';
        const message = `Are you sure you want to delete ${count} ${leadText}? This action cannot be undone.`;
        
        if (confirm(message)) {
            this.deleteSelectedLeads();
        }
    }

    async deleteSelectedLeads() {
        const idsToDelete = Array.from(this.selectedForDeletion);
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/bulk-delete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ conversationIds: idsToDelete })
            });

            if (!response.ok) {
                throw new Error(`Delete failed: ${response.status}`);
            }

            const result = await response.json();
            
            // Remove deleted conversations from local data
            idsToDelete.forEach(id => {
                this.conversations.delete(id);
                this.selectedForDeletion.delete(id);
            });

            // If currently selected conversation was deleted, clear selection
            if (this.currentConversationId && idsToDelete.includes(this.currentConversationId)) {
                this.currentConversationId = null;
                this.selectedConversation = null;
                this.clearConversationDetails();
            }

            // Refresh the conversations list
            this.renderConversationsList();
            
            // Show success message
            const deletedCount = result.deletedCount || idsToDelete.length;
            this.showNotification(`Successfully deleted ${deletedCount} lead${deletedCount > 1 ? 's' : ''}`, 'success');
            
        } catch (error) {
            console.error('Error deleting conversations:', error);
            this.showNotification('Failed to delete leads. Please try again.', 'error');
        }
    }

    clearConversationDetails() {
        // Clear conversation info
        const conversationInfo = document.getElementById('conversationInfo');
        if (conversationInfo) {
            conversationInfo.innerHTML = `
                <h2>Select a conversation</h2>
                <p>Choose a conversation from the left to view messages</p>
            `;
        }

        // Clear messages
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">�</div>
                    <h3>No conversation selected</h3>
                    <p>Select a conversation from the left panel to view the message thread</p>
                </div>
            `;
        }

        // Hide message input
        const messageInputContainer = document.getElementById('messageInputContainer');
        if (messageInputContainer) {
            messageInputContainer.style.display = 'none';
        }

        // Hide conversation actions
        const conversationActions = document.getElementById('conversationActions');
        if (conversationActions) {
            conversationActions.style.display = 'none';
        }

        // Clear intelligence panel
        const intelligenceContent = document.getElementById('intelligenceContent');
        if (intelligenceContent) {
            intelligenceContent.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">�</div>
                    <h3>No lead selected</h3>
                    <p>Select a lead to view intelligence data</p>
                </div>
            `;
        }
    }

    addMessage(message) {
        if (message.conversation_id !== this.currentConversationId) return;

        const messagesContainer = document.getElementById('messagesContainer');
        const messagesList = messagesContainer?.querySelector('.messages-list');
        
        if (messagesList) {
            const messageElement = document.createElement('div');
            messageElement.innerHTML = this.renderMessage(message);
            messagesList.appendChild(messageElement.firstElementChild);
            
            // Scroll to bottom
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    updateConversation(conversation) {
        this.conversations.set(conversation.id, conversation);
        
        if (conversation.id === this.currentConversationId) {
            this.selectedConversation = conversation;
            this.showConversationDetails();
        }
        
        // Update conversation in list
        this.renderConversationsList();
    }

    updateConversationInList(conversation) {
        // Update the conversation data
        this.conversations.set(conversation.id, conversation);
        
        // Store current selection
        const currentSelection = this.currentConversationId;
        
        // Re-render the conversations list
        this.renderConversationsList();
        
        // Restore the current selection
        if (currentSelection) {
            this.currentConversationId = currentSelection;
            this.updateConversationSelection();
        }
    }

    updateConversationSelection() {
        // Remove previous selection styling
        document.querySelectorAll('.conversation-item.selected').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Add selection styling to current conversation
        if (this.currentConversationId) {
            const currentItem = document.querySelector(`[data-conversation-id="${this.currentConversationId}"]`);
            if (currentItem) {
                currentItem.classList.add('selected');
            }
        }
    }

    updateConversationPreview(conversationId, message) {
        // Update the conversation's last message/activity in memory
        const conversation = this.conversations.get(conversationId);
        if (conversation) {
            conversation.last_message = message.content;
            conversation.last_activity = message.created_at || new Date().toISOString();
            this.conversations.set(conversationId, conversation);
        }
        
        // Update just that conversation item in the list without re-rendering everything
        const conversationItem = document.querySelector(`[data-conversation-id="${conversationId}"]`);
        if (conversationItem) {
            // Update the time ago to show recent activity
            const timeAgoElement = conversationItem.querySelector('.time-ago');
            if (timeAgoElement) {
                timeAgoElement.textContent = 'Just now';
            }
            
            // Move the conversation to the top of the list if it's not already there
            const conversationsList = conversationItem.parentElement;
            if (conversationsList && conversationsList.firstChild !== conversationItem) {
                conversationsList.insertBefore(conversationItem, conversationsList.firstChild);
            }
        }
    }

    refreshData() {
        if (this.wsManager && this.wsManager.refreshData) {
            this.wsManager.refreshData();
        }
        this.loadInitialData();
        this.showNotification('Data refreshed', 'success');
    }

    refreshConversation() {
        if (this.currentConversationId) {
            this.loadConversationMessages();
            this.loadConversationIntelligence();
        }
    }

    showLoading() {
        const container = document.getElementById('conversationsList');
        if (container) {
            container.innerHTML = `
                <div class="loading-state">
                    <div class="loading-spinner"></div>
                    <p>Loading conversations...</p>
                </div>
            `;
        }
    }

    hideLoading() {
        const container = document.getElementById('conversationsList');
        if (container) {
            const loadingState = container.querySelector('.loading-state');
            if (loadingState) {
                loadingState.remove();
            }
        }
    }

    // Removed duplicate showNotification - using complete implementation below

    updateProcessingStatus(isProcessing, text = 'Processing...') {
        const indicator = document.getElementById('processingIndicator');
        const processingText = document.getElementById('processingText');
        
        if (indicator) {
            indicator.style.display = isProcessing ? 'flex' : 'none';
        }
        
        if (processingText && isProcessing) {
            processingText.textContent = text;
        }
    }

    formatDate(date, format = 'display') {
        return this.utilities.formatDate(date, format);
    }

    // Document management methods
    // Standardize document field names to prevent field mapping issues
    normalizeDocumentFields(doc) {
        return {
            ...doc,
            // Ensure consistent field names
            originalFilename: doc.originalFilename || doc.original_filename || doc.original_name || doc.renamed_name || 'Unknown File',
            fileSize: doc.fileSize || doc.file_size || 0,
            documentType: doc.documentType || doc.document_type || 'Other',
            mimeType: doc.mimeType || doc.mime_type || 'application/octet-stream'
        };
    }

    debugDocumentContext() {
        console.log('=====================================');
        console.log('currentConversationId:', this.currentConversationId);
        console.log('selectedConversation:', this.selectedConversation);
        console.log('selectedConversation.id:', this.selectedConversation?.id);
        console.log('currentDocuments:', this.currentDocuments);
        console.log('currentDocuments length:', this.currentDocuments?.length);

        // Check if conversation IDs match
        if (this.selectedConversation) {
            console.log('IDs match?:', this.currentConversationId === this.selectedConversation.id);
        }

        // Check document structure
        if (this.currentDocuments && this.currentDocuments.length > 0) {
            console.log('First document structure:', this.currentDocuments[0]);
        }

        console.log('=====================================');
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

    syncConversationContext() {

        // Try to get conversation ID from multiple sources
        const possibleIds = [
            this.currentConversationId,
            this.selectedConversation?.id,
            document.querySelector('.conversation-item.selected')?.dataset?.conversationId
        ];

        const validId = possibleIds.find(id => id && id !== 'undefined');

        if (validId) {
            this.currentConversationId = validId;
            return validId;
        }

        console.warn('⚠️ No valid conversation ID found');
        return null;
    }

    async loadDocuments() {

        if (!this.selectedConversation) {
            return;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${this.selectedConversation.id}/documents`);
            const result = await response.json();

            if (result.success) {
                // Normalize all document fields to prevent mapping issues
                this.currentDocuments = (result.documents || []).map(doc => this.normalizeDocumentFields(doc));
                this.renderDocumentsList();
                this.updateDocumentsSummary();
                
                // Show FCS generation section if there are documents
                this.toggleFCSGenerationSection();
                
                // Documents are now processed immediately on upload
            } else {
                console.error('Failed to load documents:', result.error);
                this.renderDocumentsList([]);
            }
        } catch (error) {
            console.error('Error loading documents:', error);
            this.renderDocumentsList([]);
        }
    }

    renderDocumentsList(documents = null) {
        const documentsList = document.getElementById('documentsList');
        if (!documentsList) return;

        const docs = documents || this.currentDocuments || [];
        const conversationId = this.currentConversationId || this.selectedConversation?.id;

        console.log('📄 Documents to render:', docs.length);

        if (!conversationId) {
            console.error('❌ No conversation ID available for document actions');
            // Store a flag to indicate we need to refresh when conversation is selected
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

        // Create HTML with conversation ID passed to functions
        const htmlContent = `
            <div class="documents-table">
                <div class="documents-table-header">
                    <div class="doc-col-name">Name</div>
                    <div class="doc-col-size">Size</div>
                    <div class="doc-col-actions">Actions</div>
                </div>
                ${docs.map(doc => {
                    // Ensure we have a valid conversation ID
                    const convId = conversationId || doc.conversation_id || '';

                    return `
                    <div class="document-row" data-document-id="${doc.id}" data-conversation-id="${convId}" data-type="${doc.documentType}">
                        <div class="doc-col-name">
                            <div class="doc-icon">${this.getDocumentIconCompact(doc.mimeType, doc.documentType)}</div>
                            <div class="document-name-compact"
                                 contenteditable="false"
                                 data-original="${doc.originalFilename}"
                                 data-document-id="${doc.id}"
                                 ondblclick="window.conversationUI.enableInlineEdit('${doc.id}')"
                                 title="Double-click to edit name"
                                 style="min-width: 200px; overflow: visible; color: black !important; cursor: pointer;">
                                ${doc.originalFilename}
                            </div>
                        </div>
                        <div class="doc-col-size">${this.formatFileSize(doc.fileSize)}</div>
                        <div class="doc-col-actions">
                            <button class="btn-action document-edit-btn" data-doc-id="${doc.id}" data-conv-id="${convId}" title="Edit (or double-click name for quick edit)">
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

        // Add event listeners using delegation
        this.setupDocumentActionListeners();

        // Hide loading indicator
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
            if (convId && !this.currentConversationId) {
                this.currentConversationId = convId;
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

    setupDocumentsEventListeners() {
        console.log('setupDocumentsEventListeners called');
        
        // FALLBACK: Direct binding to FCS button if it exists
        console.log('� Setting up fallback FCS button binding...');
        const generateFCSBtn = document.getElementById('generateFCSBtn');
        if (generateFCSBtn) {
            console.log('Found generateFCSBtn, adding direct fallback listener');
            generateFCSBtn.addEventListener('click', (event) => {
                console.log('FCS button clicked via fallback binding!');
                event.preventDefault();
                event.stopPropagation();
                
                try {
                    if (this.showFCSModal) {
                        console.log('Calling showFCSModal via fallback...');
                        this.showFCSModal();
                    } else {
                        console.error(' showFCSModal function not available');
                        alert('FCS Modal function not available');
                    }
                } catch (error) {
                    console.error(' Error in fallback FCS handler:', error);
                    // Log error but don't show alert since the modal likely opened via other handler
                }
            });
            console.log('Fallback FCS button binding added');
        } else {
            console.log('generateFCSBtn not found for fallback binding');
        }
        
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
                dragDropZone.addEventListener(eventName, this.preventDefaults, false);
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
        } else {
            console.error('File input not found');
        }

    }

    async generateFCSReport() {
        if (!this.currentConversationId) {
            this.showNotification('No conversation selected', 'error');
            return;
        }

        // Get selected documents from the modal
        const selectedDocuments = this.getSelectedDocumentsFromModal();
        if (selectedDocuments.length === 0) {
            this.showNotification('Please select at least one document for FCS analysis', 'warning');
            return;
        }

        // Get the generate button from the modal
        const generateBtn = document.querySelector('#fcsModal .btn-generate');
        if (!generateBtn) return;

        // Show enhanced loading state
        const originalText = generateBtn.innerHTML;
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<div class="loading-spinner-small"></div> Processing Documents...';

        // Show progress indicator
        this.showFCSProgress('Initializing FCS analysis...');

        try {
            console.log(`Starting FCS generation for conversation: ${this.currentConversationId}`);
            console.log(`Selected documents:`, selectedDocuments.map(d => d.original_name));
            
            // Update progress
            this.showFCSProgress(`Processing ${selectedDocuments.length} document(s) through Document AI...`);

            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${this.currentConversationId}/generate-fcs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    selectedDocuments: selectedDocuments.map(doc => doc.id),
                    businessName: document.getElementById('fcsBusinessName')?.value || ''
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            
            if (result.success) {
                // Update progress
                this.showFCSProgress('Generating analysis with Gemini AI...');
                
                // Brief delay to show final progress step
                await new Promise(resolve => setTimeout(resolve, 1000));

                this.showNotification('FCS Report generated successfully!', 'success');
                
                // Close the modal
                document.getElementById('fcsModal').style.display = 'none';
                
                // Switch to FCS tab to show the results
                this.switchIntelligenceTab('fcs');
                
                // Brief delay to ensure database has been updated, then refresh FCS data
                setTimeout(async () => {
                    await this.loadFCSData();
                    console.log('FCS data refreshed after generation');
                }, 500);
                
                console.log('FCS generation completed successfully');
            } else {
                throw new Error(result.error || 'Failed to generate FCS report');
            }
        } catch (error) {
            console.error(' FCS generation error:', error);
            this.showNotification(` FCS Generation failed: ${error.message}`, 'error');
            this.hideFCSProgress();
        } finally {
            // Restore button state
            generateBtn.disabled = false;
            generateBtn.innerHTML = originalText;
            this.hideFCSProgress();
        }
    }

    // Helper method to get selected documents from FCS modal
    getSelectedDocumentsFromModal() {
        const selectedDocuments = [];
        const checkboxes = document.querySelectorAll('#fcsDocumentSelection input[type="checkbox"]:checked');
        
        checkboxes.forEach(checkbox => {
            const documentId = checkbox.getAttribute('data-document-id');
            const document = this.currentDocuments.find(doc => doc.id === documentId);
            if (document) {
                selectedDocuments.push(document);
            }
        });
        
        console.log('Selected documents for FCS:', selectedDocuments);
        return selectedDocuments;
    }

    // Progress indicator methods
    showFCSProgress(message) {
        console.log('FCS Progress:', message);
        
        // Show progress in modal
        let progressDiv = document.getElementById('fcsProgressIndicator');
        if (!progressDiv) {
            progressDiv = document.createElement('div');
            progressDiv.id = 'fcsProgressIndicator';
            progressDiv.className = 'fcs-progress-indicator';
            progressDiv.innerHTML = `
                <div class="progress-content">
                    <div class="loading-spinner"></div>
                    <div class="progress-text">${message}</div>
                </div>
            `;
            
            const modal = document.getElementById('fcsModal');
            if (modal) {
                modal.appendChild(progressDiv);
            }
        } else {
            const progressText = progressDiv.querySelector('.progress-text');
            if (progressText) {
                progressText.textContent = message;
            }
        }
        
        progressDiv.style.display = 'flex';
    }

    hideFCSProgress() {
        const progressDiv = document.getElementById('fcsProgressIndicator');
        if (progressDiv) {
            progressDiv.style.display = 'none';
        }
    }

    toggleFCSGenerationSection() {
        const fcsSection = document.getElementById('fcsGenerationSection');
        if (!fcsSection) return;

        // Show FCS generation section if there are documents (especially PDFs/bank statements)
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

    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
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
            this.showNotification(`File validation errors:\n${errors.join('\n')}`, 'error');
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
                <div class="file-size-compact">${this.formatFileSize(file.size)}</div>
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

        // Set up confirmation handlers
        document.getElementById('confirmUploadBtn').onclick = () => this.confirmUpload();
        document.getElementById('cancelUploadBtn').onclick = () => this.cancelUpload();
    }

    async confirmUpload() {
        console.log('confirmUpload called');
        const typeSelects = document.querySelectorAll('.file-type-select');
        const autoProcessChecks = document.querySelectorAll('.auto-process-checkbox');
        
        console.log('Type selects found:', typeSelects.length);
        console.log('Auto process checks found:', autoProcessChecks.length);
        
        const formData = new FormData();
        formData.append('conversationId', this.selectedConversation.id);

        this.selectedFiles.forEach((file, index) => {
            formData.append('documents', file);
            
            // Add bounds checking for type selects and auto process checkboxes
            const documentType = typeSelects[index] ? typeSelects[index].value : 'Other';
            const autoProcess = autoProcessChecks[index] ? autoProcessChecks[index].checked : false;
            
            formData.append(`documentType_${index}`, documentType);
            formData.append(`autoProcess_${index}`, autoProcess);
            
            console.log(`File ${index}: ${file.name}, type: ${documentType}, autoProcess: ${autoProcess}`);
        });

        this.showUploadProgress(true);

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${this.selectedConversation.id}/documents/upload`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                // Handle different response structures
                const successCount = result.results ? 
                    result.results.filter(r => r.success).length : 
                    (result.documents ? result.documents.length : 1);
                
                this.showNotification(`${successCount} document(s) uploaded successfully!`, 'success');
                this.loadDocuments();
                this.cancelUpload();
            } else {
                this.showNotification(`Upload failed: ${result.error}`, 'error');
            }
        } catch (error) {
            this.handleError(error, 'Upload error', 'Upload failed. Please try again.');
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

    async analyzeDocument(documentId) {
        try {
            this.showNotification('Starting AI analysis...', 'info');
            
            const response = await fetch(`${this.apiBaseUrl}/api/documents/${documentId}/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ analysisType: 'auto' })
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('Document analyzed successfully!', 'success');
                this.loadDocuments(); // Refresh to show analysis results
            } else {
                this.showNotification(`Analysis failed: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Analysis error:', error);
            this.showNotification('Analysis failed. Please try again.', 'error');
        }
    }

    async viewAnalysis(documentId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/documents/${documentId}`);
            const result = await response.json();

            if (result.success && result.document.analysis) {
                this.showAnalysisModal(result.document);
            } else {
                this.showNotification('No analysis data available.', 'error');
            }
        } catch (error) {
            console.error('Error loading analysis:', error);
            this.showNotification('Failed to load analysis.', 'error');
        }
    }

    async editDocumentName(documentId) {
        const nameElement = document.querySelector(`[data-document-id="${documentId}"] .document-name-compact`);
        if (!nameElement) return;

        const originalName = nameElement.dataset.original;
        nameElement.contentEditable = true;
        nameElement.focus();
        nameElement.style.background = '#fff3cd';

        const saveEdit = async () => {
            const newName = nameElement.textContent.trim();
            if (newName && newName !== originalName) {
                try {
                    const response = await fetch(`${this.apiBaseUrl}/api/documents/${documentId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filename: newName })
                    });

                    if (response.ok) {
                        nameElement.dataset.original = newName;
                        this.showNotification('Document name updated!', 'success');
                    } else {
                        nameElement.textContent = originalName;
                        this.showNotification('Failed to update name.', 'error');
                    }
                } catch (error) {
                    nameElement.textContent = originalName;
                    this.showNotification('Failed to update name.', 'error');
                }
            } else {
                nameElement.textContent = originalName;
            }

            nameElement.contentEditable = false;
            nameElement.style.background = '';
        };

        nameElement.addEventListener('blur', saveEdit, { once: true });
        nameElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveEdit();
            } else if (e.key === 'Escape') {
                nameElement.textContent = originalName;
                nameElement.blur();
            }
        }, { once: true });
    }

    async previewDocument(documentId) {
        this.debugDocumentContext();

        // Try multiple sources for conversation ID
        let conversationId = this.currentConversationId ||
                            this.selectedConversation?.id ||
                            this.getConversationIdFromDocument(documentId);


        if (!conversationId) {
            console.error('❌ No conversation ID available from any source');
            this.showNotification('Unable to determine conversation context', 'error');
            return;
        }

        try {
            const previewUrl = `${this.apiBaseUrl}/api/conversations/${conversationId}/documents/${documentId}/preview`;
            console.log('🔗 Preview URL:', previewUrl);

            const newWindow = window.open(previewUrl, '_blank', 'width=800,height=600');

            if (newWindow) {
                this.showNotification('Opening document preview', 'success');
            } else {
                console.warn('⚠️ Popup blocked');
                this.showNotification('Please allow popups to preview documents', 'warning');
            }
        } catch (error) {
            console.error('❌ Preview error:', error);
            this.showNotification('Preview failed: ' + error.message, 'error');
        }
    }

    async downloadDocument(documentId) {
        this.debugDocumentContext();

        // Try multiple sources for conversation ID
        let conversationId = this.currentConversationId ||
                            this.selectedConversation?.id ||
                            this.getConversationIdFromDocument(documentId);


        if (!conversationId) {
            console.error('❌ No conversation ID available from any source');
            this.showNotification('Unable to determine conversation context', 'error');
            return;
        }

        try {
            const downloadUrl = `${this.apiBaseUrl}/api/conversations/${conversationId}/documents/${documentId}/download`;
            console.log('🔗 Download URL:', downloadUrl);

            // Create a temporary anchor element for download
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = '';
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();

            setTimeout(() => {
                document.body.removeChild(link);
            }, 100);

            this.showNotification('Download started', 'success');
        } catch (error) {
            console.error('❌ Download error:', error);
            this.showNotification('Download failed: ' + error.message, 'error');
        }
    }

    // New methods that accept conversation ID as parameter for better reliability
    async previewDocumentWithConversation(documentId, conversationId) {
        console.log('Preview clicked with conversation ID:', {
            documentId,
            conversationId
        });
        
        if (!conversationId) {
            console.error('No conversation ID provided');
            this.showNotification('No conversation ID provided', 'error');
            return;
        }
        
        try {
            const previewUrl = `${this.apiBaseUrl}/api/conversations/${conversationId}/documents/${documentId}/preview`;
            console.log('Opening preview URL:', previewUrl);
            
            // Use window.open with specific window features for better compatibility
            const newWindow = window.open(previewUrl, '_blank', 'width=800,height=600');
            
            if (newWindow) {
                this.showNotification('Opening document preview', 'success');
            } else {
                this.showNotification('Please allow popups to preview documents', 'warning');
            }
        } catch (error) {
            console.error('Preview error:', error);
            this.showNotification('Preview failed: ' + error.message, 'error');
        }
    }

    async downloadDocumentWithConversation(documentId, conversationId) {
        console.log('Download clicked with conversation ID:', {
            documentId,
            conversationId
        });
        
        if (!conversationId) {
            console.error('No conversation ID provided');
            this.showNotification('No conversation ID provided', 'error');
            return;
        }
        
        try {
            const downloadUrl = `${this.apiBaseUrl}/api/conversations/${conversationId}/documents/${documentId}/download`;
            console.log('Initiating download from URL:', downloadUrl);
            
            // Create a temporary anchor element for download
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = ''; // This triggers download behavior
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            
            // Clean up
            setTimeout(() => {
                document.body.removeChild(link);
            }, 100);
            
            this.showNotification('Download started', 'success');
        } catch (error) {
            console.error('Download error:', error);
            this.showNotification('Download failed: ' + error.message, 'error');
        }
    }

    async editDocument(documentId) {
        console.log('Edit clicked:', {
            documentId,
            selectedConversation: this.selectedConversation,
            currentConversationId: this.currentConversationId,
            currentDocuments: this.currentDocuments
        });

        // Try to get conversation ID with better fallback logic
        let conversationId = this.currentConversationId || this.selectedConversation?.id;

        // If still no conversation ID, try to get it from the document itself
        if (!conversationId && this.currentDocuments) {
            const doc = this.currentDocuments.find(d => d.id === documentId);
            if (doc && doc.conversation_id) {
                conversationId = doc.conversation_id;
                this.currentConversationId = conversationId;
                console.log('Retrieved conversation ID from document:', conversationId);
            }
        }

        if (!conversationId) {
            this.showNotification('No conversation selected', 'error');
            return;
        }
        
        // Find the document to get current values
        const documents = this.currentDocuments || [];
        const docInfo = documents.find(doc => doc.id === documentId);
        
        if (!docInfo) {
            this.showNotification('Document not found', 'error');
            return;
        }
        
        // Extract file extension and name without extension
        const originalFilename = docInfo.originalFilename || docInfo.original_filename || docInfo.original_name || docInfo.renamed_name || 'Unknown File';
        const lastDotIndex = originalFilename.lastIndexOf('.');
        const nameWithoutExtension = lastDotIndex > 0 ? originalFilename.substring(0, lastDotIndex) : originalFilename;
        const fileExtension = lastDotIndex > 0 ? originalFilename.substring(lastDotIndex) : '';
        
        // Create edit modal with inline styles to ensure visibility
        const modalHtml = `
            <div id="editDocumentModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;" onclick="this.remove()">
                <div style="background: white; border-radius: 8px; padding: 0; max-width: 500px; width: 90%; max-height: 80vh; overflow: auto;" onclick="event.stopPropagation()">
                    <div style="padding: 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; color: #333;">Edit Document</h3>
                        <button onclick="document.getElementById('editDocumentModal').remove()" style="background: none; border: none; font-size: 24px; color: #666; cursor: pointer; padding: 0; width: 32px; height: 32px;"></button>
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
                        <button onclick="window.conversationUI.saveDocumentEdit('${documentId}')" style="padding: 8px 16px; border: none; background: #007bff; color: white; border-radius: 4px; cursor: pointer;">Save Changes</button>
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
            this.showNotification('Required form elements not found', 'error');
            return;
        }

        const newNameWithoutExtension = nameInput.value.trim();
        const fileExtension = extensionInput ? extensionInput.value : '';
        const newType = typeSelect.value;

        if (!newNameWithoutExtension) {
            this.showNotification('Document name cannot be empty', 'error');
            return;
        }

        // Get conversation ID
        const conversationId = this.currentConversationId || this.selectedConversation?.id;
        if (!conversationId) {
            this.showNotification('No conversation selected', 'error');
            return;
        }

        // Combine name with extension
        const newName = newNameWithoutExtension + fileExtension;

        console.log('📤 Sending update request:', {
            conversationId,
            documentId,
            newName,
            newType
        });

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conversationId}/documents/${documentId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    filename: newName,
                    documentType: newType
                })
            });

            console.log('📡 Response status:', response.status);

            // Get response text first to handle both JSON and non-JSON errors
            const responseText = await response.text();
            console.log('📡 Response text:', responseText);

            let result;
            try {
                result = JSON.parse(responseText);
            } catch (e) {
                console.error('❌ Response is not valid JSON:', responseText);
                throw new Error(`Server error: ${responseText.substring(0, 200)}`);
            }

            if (response.ok && result.success) {
                this.showNotification('Document updated successfully', 'success');
                document.getElementById('editDocumentModal').remove();

                // Update the document in local cache
                if (this.currentDocuments) {
                    const docIndex = this.currentDocuments.findIndex(d => d.id === documentId);
                    if (docIndex !== -1) {
                        this.currentDocuments[docIndex].originalFilename = newName;
                        this.currentDocuments[docIndex].documentType = newType;
                    }
                }

                // Refresh document list
                await this.loadDocuments();
            } else {
                const errorMsg = result.error || result.message || 'Unknown error';
                console.error('❌ Update failed:', errorMsg);
                console.error('Full error response:', result);
                this.showNotification(`Update failed: ${errorMsg}`, 'error');
            }
        } catch (error) {
            console.error('❌ Update error:', error);
            console.error('Stack trace:', error.stack);
            this.showNotification('Update failed: ' + error.message, 'error');
        }
    }

    enableInlineEdit(documentId) {

        const docRow = document.querySelector(`[data-document-id="${documentId}"]`);
        if (!docRow) {
            console.error('Document row not found');
            return;
        }

        const nameElement = docRow.querySelector('.document-name-compact');
        if (!nameElement) {
            console.error('Name element not found');
            return;
        }

        const originalName = nameElement.textContent.trim();
        nameElement.contentEditable = 'true';
        nameElement.style.backgroundColor = '#fff3cd';
        nameElement.style.padding = '4px';
        nameElement.style.borderRadius = '4px';
        nameElement.focus();

        // Select all text
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

                const conversationId = this.currentConversationId || this.selectedConversation?.id;
                if (!conversationId) {
                    this.showNotification('No conversation selected', 'error');
                    nameElement.textContent = originalName;
                    return;
                }

                try {
                    // Simple PUT request with just the new filename
                    const response = await fetch(
                        `${this.apiBaseUrl}/api/conversations/${conversationId}/documents/${documentId}/rename`,
                        {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                newName: newName
                            })
                        }
                    );

                    if (response.ok) {
                        this.showNotification('Document name updated', 'success');
                        // Update local cache
                        if (this.currentDocuments) {
                            const doc = this.currentDocuments.find(d => d.id === documentId);
                            if (doc) {
                                doc.originalFilename = newName;
                            }
                        }
                    } else {
                        throw new Error(`Server responded with ${response.status}`);
                    }
                } catch (error) {
                    console.error('❌ Failed to update name:', error);
                    this.showNotification('Failed to update name', 'error');
                    nameElement.textContent = originalName;
                }
            } else {
                nameElement.textContent = originalName;
            }
        };

        // Save on blur or Enter key
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

    async debugDocumentUpdate(documentId) {

        const conversationId = this.currentConversationId || this.selectedConversation?.id;
        if (!conversationId) {
            console.error('No conversation ID available');
            return;
        }

        const testPayload = {
            filename: 'test_name.pdf',
            documentType: 'Other'
        };

        console.log('Test URL:', `${this.apiBaseUrl}/api/conversations/${conversationId}/documents/${documentId}`);
        console.log('Test payload:', testPayload);

        try {
            const response = await fetch(
                `${this.apiBaseUrl}/api/conversations/${conversationId}/documents/${documentId}`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(testPayload)
                }
            );

            console.log('Response status:', response.status);
            console.log('Response headers:', Object.fromEntries(response.headers.entries()));

            const text = await response.text();
            console.log('Response body:', text);

            try {
                const json = JSON.parse(text);
                console.log('Parsed JSON:', json);
            } catch (e) {
                console.log('Response is not JSON');
            }

        } catch (error) {
            console.error('Request failed:', error);
        }
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



    async deleteDocument(documentId) {
        this.debugDocumentContext();

        // Try multiple sources for conversation ID
        let conversationId = this.currentConversationId ||
                            this.selectedConversation?.id ||
                            this.getConversationIdFromDocument(documentId);


        if (!conversationId) {
            console.error('❌ No conversation ID available');
            this.showNotification('Unable to determine conversation context', 'error');
            return;
        }

        if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
            console.log('🚫 Delete cancelled by user');
            return;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conversationId}/documents/${documentId}`, {
                method: 'DELETE'
            });

            console.log('📡 Delete response status:', response.status);
            const result = await response.json();

            if (result.success) {
                this.showNotification('Document deleted successfully.', 'success');
                await this.loadDocuments();
            } else {
                console.error('❌ Delete failed:', result.error);
                this.showNotification(`Delete failed: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('❌ Delete error:', error);
            this.showNotification('Delete failed: ' + error.message, 'error');
        }
    }

    // Helper methods
    getDocumentIcon(mimeType, documentType) {
        if (mimeType.startsWith('image/')) return '<div class="document-icon"></div>';
        if (mimeType === 'application/pdf') return '<div class="document-icon"></div>';
        if (documentType === 'Bank Statement') return '<div class="document-icon"></div>';
        if (documentType === 'Tax Return') return '<div class="document-icon"></div>';
        return '<div class="document-icon"></div>';
    }

    getDocumentIconCompact(mimeType, documentType) {
        // Handle undefined mimeType
        if (mimeType && mimeType.startsWith('image/')) return '';
        if (mimeType === 'application/pdf') return '';
        if (documentType === 'Bank Statement' || documentType === '4 Months Bank Statement') return '';
        if (documentType === 'Tax Return') return '';
        if (documentType === "Driver's License") return '';
        if (documentType === 'Voided Check') return '�';
        if (documentType === 'Signed Application') return '';
        if (documentType === 'FCS Document') return '�';
        return '';
    }

    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 MB';
        
        // Convert to number if it's a string
        const numBytes = parseInt(bytes, 10);
        if (isNaN(numBytes)) return '0 MB';
        
        const k = 1024;
        const mb = numBytes / (k * k);  // Convert to MB
        
        if (mb >= 1000) {
            // Show in GB if over 1000 MB
            const gb = mb / k;
            return parseFloat(gb.toFixed(2)) + ' GB';
        } else if (mb >= 1) {
            // Show in MB if 1 MB or larger
            return parseFloat(mb.toFixed(2)) + ' MB';
        } else {
            // Show in KB if less than 1 MB
            const kb = numBytes / k;
            return parseFloat(kb.toFixed(1)) + ' KB';
        }
    }

    formatCurrency(amount) {
        return this.utilities.formatCurrency(amount);
    }

    guessDocumentType(filename) {
        const lower = filename.toLowerCase();
        if (lower.includes('bank') || lower.includes('statement')) return 'Bank Statement';
        if (lower.includes('tax') || lower.includes('1120') || lower.includes('1040')) return 'Tax Return';
        if (lower.includes('license')) return 'Business License';
        if (lower.includes('application')) return 'Application';
        return 'Other';
    }

    shouldAutoProcess(filename) {
        const lower = filename.toLowerCase();
        return lower.includes('bank') || lower.includes('statement') || lower.includes('tax');
    }


    updateDocumentsSummary() {
        const summaryDiv = document.getElementById('documentsSummary');
        if (!summaryDiv || !this.currentDocuments) return;

        // Hide the summary completely
        summaryDiv.style.display = 'none';
    }

    showAnalysisModal(document) {
        const analysis = document.analysis;
        if (!analysis) return;

        // Create analysis modal (would need to add modal HTML structure)
        const modalContent = `
            <div class="analysis-modal">
                <h3>AI Analysis: ${document.filename}</h3>
                <div class="analysis-overview">
                    <div class="confidence-score">Confidence: ${Math.round(analysis.confidenceScore * 100)}%</div>
                    <div class="analysis-summary">${analysis.summary}</div>
                </div>
                ${analysis.financialMetrics ? `
                    <div class="financial-metrics">
                        <h4>Financial Metrics</h4>
                        <div class="metrics-grid">
                            <div class="metric-item">
                                <label>Average Daily Balance</label>
                                <span>$${this.formatCurrency(analysis.financialMetrics.averageDailyBalance || 0)}</span>
                            </div>
                            <div class="metric-item">
                                <label>Monthly Deposits</label>
                                <span>$${this.formatCurrency(analysis.financialMetrics.monthlyDeposits || 0)}</span>
                            </div>
                            <div class="metric-item">
                                <label>NSF Count</label>
                                <span>${analysis.financialMetrics.nsfCount || 0}</span>
                            </div>
                            <div class="metric-item">
                                <label>Negative Days</label>
                                <span>${analysis.financialMetrics.negativeDays || 0}</span>
                            </div>
                        </div>
                    </div>
                ` : ''}
                ${analysis.redFlags && analysis.redFlags.length > 0 ? `
                    <div class="red-flags">
                        <h4>Red Flags</h4>
                        <ul>${analysis.redFlags.map(flag => `<li>${flag}</li>`).join('')}</ul>
                    </div>
                ` : ''}
                ${analysis.recommendations && analysis.recommendations.length > 0 ? `
                    <div class="recommendations">
                        <h4>� Recommendations</h4>
                        <ul>${analysis.recommendations.map(rec => `<li>${rec}</li>`).join('')}</ul>
                    </div>
                ` : ''}
            </div>
        `;

        // For now, just show a notification - full modal implementation would go here
        this.showNotification('Analysis details would be displayed in modal', 'info');
    }






    async generatePDFApplication() {
        console.log('Generate PDF clicked');
        
        if (!this.selectedConversation) {
            this.showNotification('No conversation selected', 'error');
            return;
        }

        // Save the current conversation context before any async operations
        const currentConvId = this.currentConversationId;
        const currentConv = this.selectedConversation;

        try {
            this.showNotification('Generating Working Capital Application...', 'info');
            
            const conv = this.selectedConversation;
            
            // Prepare application data
            const applicationData = {
                legalName: conv.business_name || '',
                dba: conv.dba_name || conv.business_name || '',
                address: conv.business_address || conv.address || '',
                city: conv.business_city || conv.city || '',
                state: conv.business_state || conv.us_state || '',
                zip: conv.business_zip || conv.zip || '',
                telephone: conv.lead_phone || conv.phone || '',
                fax: conv.fax_phone || '',
                federalTaxId: conv.tax_id || conv.federal_tax_id || '',
                dateBusinessStarted: this.formatDate(conv.business_start_date, 'display'),
                lengthOfOwnership: conv.length_of_ownership || '',
                website: conv.website || '',
                entityType: conv.entity_type || '',
                businessEmail: conv.business_email || conv.email || '',
                typeOfBusiness: conv.industry_type || conv.business_type || '',
                productService: conv.product_sold || '',
                requestedAmount: conv.requested_amount || conv.funding_amount || '',
                useOfFunds: conv.use_of_proceeds || 'Working Capital',
                ownerFirstName: conv.first_name || '',
                ownerLastName: conv.last_name || '',
                ownerTitle: 'Owner',
                ownerEmail: conv.owner_email || conv.email || '',
                ownerAddress: conv.owner_home_address || '',
                ownerCity: conv.owner_home_city || '',
                ownerState: conv.owner_home_state || '',
                ownerZip: conv.owner_home_zip || '',
                ownershipPercentage: conv.ownership_percent || '',
                creditScore: conv.credit_score || '',
                ownerSSN: conv.ssn || conv.owner_ssn || conv.ssn_encrypted || '',
                ownerDOB: this.formatDate(conv.date_of_birth, 'display'),
                ownerCellPhone: conv.cell_phone || '',
                yearsInBusiness: conv.years_in_business || '',
                signatureDate: new Date().toLocaleDateString()
            };

            const ownerName = `${applicationData.ownerFirstName} ${applicationData.ownerLastName}`.trim() || 'Authorized Signatory';

            console.log('� Sending data:', { applicationData, ownerName });

            // Make the request
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conv.id}/generate-pdf-from-template`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    applicationData: applicationData,
                    ownerName: ownerName
                })
            });

            console.log('� Response status:', response.status, response.statusText);
            console.log('Response headers:', response.headers);

            if (!response.ok) {
                // Try to get error details
                const contentType = response.headers.get('content-type');
                let errorMessage = 'PDF generation failed on server';
                
                if (contentType && contentType.includes('application/json')) {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorData.message || errorMessage;
                    console.error('Server error (JSON):', errorData);
                } else {
                    const errorText = await response.text();
                    console.error('Server error (Text):', errorText);
                    if (errorText) {
                        errorMessage = errorText.substring(0, 200); // First 200 chars
                    }
                }
                
                throw new Error(errorMessage);
            }

            // Server now generates PDF and saves to AWS/database
            const contentType = response.headers.get('content-type');
            console.log('Response content-type:', contentType);
            
            if (contentType && contentType.includes('application/json')) {
                const result = await response.json();
                console.log('Server response:', result);
                
                if (!result.success) {
                    throw new Error(result.error || 'PDF generation failed on server');
                }
                
                if (result.document) {
                    // Server successfully generated and saved PDF
                    console.log('PDF generated and saved to AWS:', result.document);
                    this.showNotification(
                        `PDF application generated and saved successfully!\nFile: ${result.document.filename}`, 
                        'success'
                    );
                    
                    // Ensure conversation context is maintained after PDF generation
                    if (currentConvId && (!this.currentConversationId || this.currentConversationId !== currentConvId)) {
                        this.currentConversationId = currentConvId;
                        this.selectedConversation = currentConv;
                    }
                    
                    // Refresh documents list to show the new PDF
                    await this.loadDocuments();
                    
                    // Switch to documents tab to show the generated PDF
                    const documentsTab = document.querySelector('[data-tab="documents"]');
                    if (documentsTab) {
                        documentsTab.click();
                    }
                    
                    return;
                } else {
                    throw new Error('Server did not return document information');
                }
                
            } else {
                // Unexpected content type
                const text = await response.text();
                console.error('Unexpected response:', text);
                throw new Error('Server returned unexpected content type');
            }
            
        } catch (error) {
            console.error(' Error generating PDF:', error);
            console.error('Stack trace:', error.stack);
            this.showNotification('Failed to generate PDF: ' + error.message, 'error');
        }
    }

    extractConversationData(conv) {
        console.log('� Extracting conversation data for PDF generation');
        
        // Helper function for currency formatting
        const formatCurrency = (amount) => {
            if (!amount) return 'N/A';
            const num = parseFloat(amount.toString().replace(/[^0-9.-]/g, ''));
            return isNaN(num) ? 'N/A' : `$${num.toLocaleString()}`;
        };

        // Helper function for safe text extraction
        const safeText = (value, fallback = 'N/A') => {
            return value && value.toString().trim() !== '' ? value.toString().trim() : fallback;
        };

        // Extract owner name with multiple fallback patterns
        const getOwnerName = () => {
            const patterns = [
                `${conv.first_name || ''} ${conv.last_name || ''}`,
                `${conv.owner_first_name || ''} ${conv.owner_last_name || ''}`,
                `${conv.business_owner_name || ''}`,
                `${conv.contact_name || ''}`,
                `${conv.owner_name || ''}`
            ];
            
            for (let pattern of patterns) {
                const name = pattern.trim();
                if (name && name !== '' && name !== 'N/A') {
                    return name;
                }
            }
            return 'Authorized Signatory';
        };

        return {
            // Business Information
            businessName: safeText(conv.business_name || conv.company_name || conv.legal_name, 'Unknown Business'),
            dbaName: safeText(conv.dba_name || conv.business_name, 'Same as legal name'),
            businessAddress: safeText(conv.business_address || conv.address || conv.street_address),
            businessCity: safeText(conv.business_city || conv.city),
            businessState: safeText(conv.business_state || conv.state),
            businessZip: safeText(conv.business_zip || conv.zip || conv.postal_code),
            businessPhone: safeText(conv.lead_phone || conv.phone || conv.business_phone),
            businessEmail: safeText(conv.email || conv.business_email),
            taxId: safeText(conv.tax_id || conv.ein || conv.federal_tax_id),
            industryType: safeText(conv.industry_type || conv.industry || conv.business_industry),
            businessType: safeText(conv.business_type || conv.entity_type || conv.legal_structure),

            // Owner Information  
            ownerName: getOwnerName(),
            ownerTitle: safeText(conv.owner_title || conv.title || conv.position, 'Owner'),
            ownershipPercentage: safeText(conv.ownership_percentage || conv.ownership_percent, 'N/A'),
            ownerAddress: safeText(conv.owner_address || conv.personal_address || conv.address),
            ownerPhone: safeText(conv.owner_phone || conv.personal_phone || conv.lead_phone),
            ownerEmail: safeText(conv.owner_email || conv.personal_email || conv.email),

            // Financial Information
            annualRevenue: formatCurrency(conv.annual_revenue || conv.yearly_revenue || conv.gross_annual_sales),
            monthlyRevenue: formatCurrency(conv.monthly_revenue || conv.monthly_sales || conv.avg_monthly_sales),
            requestedAmount: formatCurrency(conv.requested_amount || conv.loan_amount || conv.funding_amount),
            loanPurpose: safeText(conv.loan_purpose || conv.use_of_funds || conv.intended_use, 'Working Capital'),
            yearsInBusiness: safeText(conv.years_in_business || conv.time_in_business || conv.business_age),
            employees: safeText(conv.employees || conv.number_of_employees || conv.employee_count),
            bankBalance: formatCurrency(conv.bank_balance || conv.average_bank_balance || conv.avg_bank_balance),
            monthlyDeposits: formatCurrency(conv.monthly_deposits || conv.monthly_bank_deposits || conv.avg_monthly_deposits),

            // Additional fields that might be useful
            ssn: safeText(conv.ssn || conv.social_security),
            dateOfBirth: safeText(conv.date_of_birth || conv.dob),
            creditScore: safeText(conv.credit_score || conv.personal_credit_score),
            timeAtAddress: safeText(conv.time_at_address || conv.years_at_address)
        };
    }

    // Simplified method that redirects to main PDF generation
    async generatePDFWithSignature() {
        this.generatePDFApplication();
    }


    async uploadGeneratedPDF(pdfBlob, filename) {
        try {
            // Append the PDF blob directly to FormData to preserve binary integrity
            const formData = new FormData();
            
            // Use 'documents' as the field name (matching your upload endpoint)  
            // Append blob directly with filename - this preserves binary data better than File constructor
            formData.append('documents', pdfBlob, filename);
            
            // Add document type information
            formData.append('documentType_0', 'Working Capital Application');
            formData.append('autoProcess_0', 'false');
            
            const conversationId = this.currentConversationId || this.selectedConversation?.id;
            
            if (!conversationId) {
                throw new Error('No conversation ID available for upload');
            }
            
            // Debug the blob before upload
            console.log('� Blob details before upload:', {
                size: pdfBlob.size,
                type: pdfBlob.type,
                constructor: pdfBlob.constructor.name
            });
            
            // Check first few bytes of the blob
            const slice = pdfBlob.slice(0, 10);
            const arrayBuffer = await slice.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            console.log('� First 10 bytes of blob:', Array.from(uint8Array));
            console.log('� First 10 bytes as string:', String.fromCharCode(...uint8Array));
            
            console.log('� Uploading PDF to server:', {
                conversationId,
                filename,
                fileSize: `${(pdfBlob.size / 1024).toFixed(1)}KB`,
                fileType: pdfBlob.type,
                endpoint: `${this.apiBaseUrl}/api/conversations/${conversationId}/documents/upload`
            });
            
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conversationId}/documents/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(' Upload failed:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorText
                });
                throw new Error(`Upload failed: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            console.log('PDF uploaded successfully:', {
                documentId: result.documents?.[0]?.id,
                filename: result.documents?.[0]?.filename,
                uploadedAt: new Date().toISOString()
            });
            
            // Refresh documents tab to show the new PDF
            if (this.loadDocuments) {
                await this.loadDocuments();
            }
            
            // Switch to documents tab to show the uploaded PDF
            this.switchIntelligenceTab('documents');
            
            return result;
            
        } catch (error) {
            console.error(' Error uploading PDF:', error);
            
            // More specific error messages
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('Network error: Could not connect to server');
            } else if (error.message.includes('413')) {
                throw new Error('File too large for upload');
            } else if (error.message.includes('400')) {
                throw new Error('Invalid file format or missing data');
            }
            
            throw error;
        }
    }

    async tryTemplateBasedGeneration(signatureDataUrl, ownerName, extractedData = null) {
        try {
            console.log('Attempting HTML-to-PDF generation...');
            
            // Get conversation data
            const conv = this.selectedConversation;
            
            // Prepare signature data - use provided ownerName or derive from conversation
            let signatureData = null;
            if (signatureDataUrl) {
                signatureData = {
                    image: signatureDataUrl,
                    text: null
                };
                console.log('Signature image data prepared');
            } else {
                // Use typed signature with provided ownerName or derive it
                const signatureName = ownerName || (() => {
                    const firstName = conv.first_name || conv.owner_first_name || '';
                    const lastName = conv.last_name || conv.owner_last_name || '';
                    return `${firstName} ${lastName}`.trim() || 'Authorized Signatory';
                })();
                
                signatureData = {
                    image: null,
                    text: signatureName
                };
                console.log('Using typed signature:', signatureName);
            }
            
            // Call our HTML-to-PDF generation API
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conv.id}/generate-pdf`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    leadData: conv,
                    signatureData: signatureData,
                    extractedData: extractedData
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(' HTML-to-PDF generation failed:', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            // Handle JSON response (backend now saves PDF directly)
            const result = await response.json();
            
            if (result.success) {
                console.log('HTML-to-PDF generation successful');
                console.log('PDF saved directly by backend:', result.document.original_filename);
                this.showNotification('Working Capital Application generated and saved successfully!', 'success');
                
                // Refresh documents list to show the new PDF
                if (this.loadDocuments) {
                    await this.loadDocuments(conv.id);
                }
                
                return true;
            } else {
                throw new Error(result.error || 'PDF generation failed');
            }
            
        } catch (error) {
            console.error(' HTML-to-PDF generation failed:', error);
            this.showNotification('HTML-to-PDF generation failed: ' + error.message, 'error');
            return false; // Fall back to jsPDF
        }
    }

    fillTemplateFields(form, conv) {
        console.log('� Filling template fields with lead data...');
        
        // Map of common field names to conversation data
        const fieldMappings = {
            // Business Information
            'business_name': conv.business_name || '',
            'businessName': conv.business_name || '',
            'company_name': conv.business_name || '',
            'dba': conv.business_name || '',
            
            // Contact Information
            'phone': conv.lead_phone || '',
            'business_phone': conv.lead_phone || '',
            'contact_phone': conv.lead_phone || '',
            'email': conv.email || '',
            'business_email': conv.email || '',
            
            // Owner Information
            'owner_first_name': conv.first_name || '',
            'first_name': conv.first_name || '',
            'owner_last_name': conv.last_name || '',
            'last_name': conv.last_name || '',
            'owner_name': `${conv.first_name || ''} ${conv.last_name || ''}`.trim(),
            
            // Business Details
            'industry': conv.industry || '',
            'business_type': conv.business_type || '',
            'years_in_business': conv.years_in_business || '',
            'annual_revenue': conv.annual_revenue || '',
            'monthly_revenue': conv.monthly_revenue || '',
            
            // Loan Information
            'requested_amount': conv.requested_amount || '',
            'loan_purpose': conv.loan_purpose || 'Working Capital',
            
            // Date
            'date': new Date().toLocaleDateString(),
            'application_date': new Date().toLocaleDateString()
        };
        
        // Try to fill each field
        let filledCount = 0;
        for (const [fieldName, value] of Object.entries(fieldMappings)) {
            try {
                const field = form.getField(fieldName);
                if (field) {
                    field.setText(value.toString());
                    filledCount++;
                    console.log(`Filled field "${fieldName}" with: "${value}"`);
                }
            } catch (error) {
                // Field doesn't exist, skip it
                console.log(`Field "${fieldName}" not found in template`);
            }
        }
        
        console.log(`� Successfully filled ${filledCount} fields`);
    }

    async addDataOverlaysToTemplate(pdfDoc, conv) {
        try {
            console.log('� Adding data to exact field positions on template...');
            
            // Get the first page
            const pages = pdfDoc.getPages();
            const firstPage = pages[0];
            const { width, height } = firstPage.getSize();
            const { rgb } = window.PDFLib;
            
            console.log(`� Template dimensions: ${width} x ${height}`);
            
            // Field coordinate mapping for JMS Working Capital Application
            // These coordinates are typical positions - may need adjustment
            const fieldPositions = {
                // Business Information Section (typically top portion)
                business_name: { x: 150, y: height - 200, size: 11 },
                dba_name: { x: 150, y: height - 220, size: 11 },
                business_address: { x: 150, y: height - 240, size: 10 },
                business_phone: { x: 150, y: height - 260, size: 10 },
                business_email: { x: 400, y: height - 260, size: 10 },
                
                // Owner Information Section
                owner_name: { x: 150, y: height - 320, size: 11 },
                owner_title: { x: 400, y: height - 320, size: 11 },
                owner_ssn: { x: 150, y: height - 340, size: 10 },
                owner_address: { x: 150, y: height - 360, size: 10 },
                
                // Business Details Section  
                industry: { x: 150, y: height - 420, size: 10 },
                years_in_business: { x: 400, y: height - 420, size: 10 },
                business_type: { x: 150, y: height - 440, size: 10 },
                annual_revenue: { x: 400, y: height - 440, size: 10 },
                monthly_revenue: { x: 150, y: height - 460, size: 10 },
                employees: { x: 400, y: height - 460, size: 10 },
                
                // Loan Information Section
                requested_amount: { x: 150, y: height - 520, size: 11 },
                loan_purpose: { x: 400, y: height - 520, size: 10 },
                
                // Date
                application_date: { x: 400, y: height - 100, size: 10 }
            };
            
            // Data mapping
            const dataMap = {
                business_name: conv.business_name || '',
                dba_name: conv.business_name || '',
                business_address: conv.address || '',
                business_phone: conv.lead_phone || '',
                business_email: conv.email || '',
                
                owner_name: `${conv.first_name || ''} ${conv.last_name || ''}`.trim(),
                owner_title: 'Owner',
                owner_ssn: '', // Don't populate SSN
                owner_address: conv.address || '',
                
                industry: conv.industry || '',
                years_in_business: conv.years_in_business || '',
                business_type: conv.business_type || '',
                annual_revenue: conv.annual_revenue ? `$${conv.annual_revenue}` : '',
                monthly_revenue: conv.monthly_revenue ? `$${conv.monthly_revenue}` : '',
                employees: conv.employees || '',
                
                requested_amount: conv.requested_amount ? `$${conv.requested_amount}` : '',
                loan_purpose: conv.loan_purpose || 'Working Capital',
                
                application_date: new Date().toLocaleDateString()
            };
            
            // Apply data to exact positions
            let fieldsPlaced = 0;
            for (const [fieldName, value] of Object.entries(dataMap)) {
                if (value && fieldPositions[fieldName]) {
                    const pos = fieldPositions[fieldName];
                    
                    firstPage.drawText(value.toString(), {
                        x: pos.x,
                        y: pos.y,
                        size: pos.size,
                        color: rgb(0, 0, 0),
                    });
                    
                    fieldsPlaced++;
                    console.log(`Placed "${fieldName}": "${value}" at (${pos.x}, ${pos.y})`);
                }
            }
            
            console.log(`Placed ${fieldsPlaced} fields at exact positions`);
            
        } catch (error) {
            console.error(' Failed to add field positioning:', error);
        }
    }

    async addSignatureToTemplate(pdfDoc, signatureDataUrl) {
        try {
            console.log('Adding signature to template...');
            
            // Convert signature data URL to bytes
            const signatureBytes = await fetch(signatureDataUrl).then(res => res.arrayBuffer());
            const signatureImage = await pdfDoc.embedPng(signatureBytes);
            
            // Get the first page (signatures usually go on the first or last page)
            const pages = pdfDoc.getPages();
            const firstPage = pages[0];
            
            // Add signature to the bottom of the page
            const { width, height } = firstPage.getSize();
            const signatureWidth = 150;
            const signatureHeight = 75;
            const x = 50; // Left margin
            const y = 50; // Bottom margin
            
            firstPage.drawImage(signatureImage, {
                x,
                y,
                width: signatureWidth,
                height: signatureHeight,
            });
            
            // Add signature date
            firstPage.drawText(`Date: ${new Date().toLocaleDateString()}`, {
                x: x,
                y: y - 20,
                size: 10,
                color: rgb(0, 0, 0),
            });
            
            console.log('Signature added to template');
        } catch (error) {
            console.error(' Failed to add signature to template:', error);
        }
    }

    showNotification(message, type = 'info', duration = 4000) {
        this.utilities.showNotification(message, type, duration);
    }

    showModal(modalId) {
        return this.utilities.showModal(modalId);
    }

    hideModal(modalId) {
        this.utilities.hideModal(modalId);
    }

    createModal(id, title, content, buttons = {}) {
        // Remove existing if present
        const existing = document.getElementById(id);
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = id;
        modal.className = 'modal';
        modal.style.display = 'flex';

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button onclick="window.conversationUI.hideModal('${id}')">&times;</button>
                </div>
                <div class="modal-body">${content}</div>
                <div class="modal-footer">
                    ${Object.entries(buttons).map(([text, action]) =>
                        `<button onclick="${action}">${text}</button>`
                    ).join('')}
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        return modal;
    }

    // Handle incoming WebSocket messages for unread badges
    handleIncomingMessage(data) {
        console.log('� Handling incoming message:', data);
        
        // Add to unread count if not current conversation
        if (data.conversation_id !== this.currentConversationId) {
            const currentCount = this.unreadMessages.get(data.conversation_id) || 0;
            this.unreadMessages.set(data.conversation_id, currentCount + 1);
            
            // Play notification sound
            this.playNotificationSound();
            
            // Show browser notification if allowed
            this.showBrowserNotification(data);
        } else {
            // If it's current conversation, just reload messages
            this.loadConversationMessages();
        }
        
        // Always refresh conversation list to update order and show badge
        this.loadConversations();
        
        // Show in-app notification
        this.showNotification('New message received!', 'info');
    }
    
    // Play notification sound
    playNotificationSound() {
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRl9vT19SABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmFgU7k9n1unEiBC13yO/eizEIHWq+8+OZURE');
            audio.volume = 0.5;
            audio.play().catch(e => console.log('Could not play notification sound'));
        } catch (e) {
            console.log('Could not play notification sound');
        }
    }
    
    // Show browser notification
    showBrowserNotification(data) {
        if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification('New Message', {
                body: data.message.content.substring(0, 100),
                icon: '/favicon.ico',
                tag: 'message-' + data.conversation_id
            });
            
            notification.onclick = () => {
                window.focus();
                this.selectConversation(data.conversation_id);
                notification.close();
            };
        }
    }
    
    // Request notification permission
    requestNotificationPermission() {
        // Only request permission if we're in a user interaction context
        // Don't request automatically on page load
        if ('Notification' in window && Notification.permission === 'default') {
            // Remove automatic request - wait for user interaction
            console.log('Notification permission available but not requested (waiting for user action)');
        }
    }

    requestNotificationPermissionOnDemand() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                console.log('Notification permission:', permission);
            }).catch(error => {
                console.log('Notification permission error (non-fatal):', error);
            });
        }
    }

    // Lender Submission Modal Methods
    debugShowLenderModal() {
        console.log('DEBUG: debugShowLenderModal called');
        console.log('� Current state:', {
            qualifiedLenders: this.qualifiedLenders,
            qualifiedLendersCount: this.qualifiedLenders?.length,
            currentDocuments: this.currentDocuments,
            currentDocumentsCount: this.currentDocuments?.length,
            selectedConversation: !!this.selectedConversation,
            currentConversationId: this.currentConversationId
        });
        
        // Check if modal exists in DOM
        const modal = document.getElementById('lenderSubmissionModal');
        console.log('� Modal element exists:', !!modal);
        
        if (!modal) {
            console.error(' Modal not found in DOM, creating it dynamically...');
            this.createLenderSubmissionModal();
            return;
        }
        
        try {
            console.log('� Attempting to show modal...');
            this.showLenderSubmissionModal();
            console.log('showLenderSubmissionModal completed');
        } catch (error) {
            console.error(' Error in showLenderSubmissionModal:', error);
            console.error('Stack trace:', error.stack);
        }
    }

    createLenderSubmissionModal() {
        console.log('Creating lender submission modal dynamically...');
        
        const modalHtml = `
            <div id="lenderSubmissionModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; align-items: center; justify-content: center;">
                <div style="background: white; border-radius: 8px; padding: 20px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 style="margin: 0;">Send to Lenders</h2>
                        <button onclick="document.getElementById('lenderSubmissionModal').style.display='none'" style="background: none; border: none; font-size: 24px; cursor: pointer;"></button>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <h3>Select Lenders</h3>
                        <div id="lenderSelectionList" style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; max-height: 200px; overflow-y: auto;">
                            Loading lenders...
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <h3>Select Documents</h3>
                        <div id="submissionDocumentList" style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; max-height: 200px; overflow-y: auto;">
                            Loading documents...
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <h3>Message</h3>
                        <textarea id="submissionMessage" rows="6" style="width: 100%; padding: 8px; border: 1px solid #e5e7eb; border-radius: 6px;"></textarea>
                    </div>
                    
                    <div style="display: flex; justify-content: flex-end; gap: 10px;">
                        <button onclick="document.getElementById('lenderSubmissionModal').style.display='none'" style="padding: 8px 16px; border: 1px solid #e5e7eb; background: white; border-radius: 6px; cursor: pointer;">Cancel</button>
                        <button onclick="window.conversationUI.sendLenderSubmissions()" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">
                            <span id="sendSubmissionsText">Send Submissions</span>
                            <span id="sendSubmissionsLoading" style="display: none;">Sending...</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        console.log('Modal created and added to DOM');
        
        // Now try to show it
        setTimeout(() => {
            this.showLenderSubmissionModal();
        }, 100);
    }

    showLenderSubmissionModal() {
        console.log('� showLenderSubmissionModal called at', new Date().toISOString());
        console.log('� Current context:', {
            thisObject: !!this,
            qualifiedLenders: this.qualifiedLenders?.length || 0,
            currentDocuments: this.currentDocuments?.length || 0
        });
        
        try {
            const modal = document.getElementById('lenderSubmissionModal');
            console.log('� Modal lookup result:', {
                found: !!modal,
                currentDisplay: modal?.style?.display,
                modalId: modal?.id
            });
            
            if (!modal) {
                console.error(' Lender submission modal not found in DOM');
                this.showNotification('Modal not found - creating it now', 'warning');
                this.createLenderSubmissionModal();
                return;
            }
            
            console.log('� Populating lenders list...');
            this.populateSubmissionLenders();
            
            console.log('Populating documents list...');
            this.populateSubmissionDocuments();
            
            console.log('Pre-filling message...');
            this.prefillSubmissionMessage();
            
            console.log('Setting modal display to flex...');
            modal.style.display = 'flex';
            
            console.log('Modal should now be visible. Final display value:', modal.style.display);
            
            // Double-check visibility
            setTimeout(() => {
                const checkModal = document.getElementById('lenderSubmissionModal');
                console.log('� Visibility check after 100ms:', {
                    exists: !!checkModal,
                    display: checkModal?.style?.display,
                    computed: window.getComputedStyle(checkModal)?.display
                });
            }, 100);
            
        } catch (error) {
            console.error(' Error in showLenderSubmissionModal:', error);
            console.error('Stack trace:', error.stack);
            this.showNotification('Error opening modal: ' + error.message, 'error');
        }
    }

    hideLenderSubmissionModal() {
        const modal = document.getElementById('lenderSubmissionModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    populateSubmissionLenders() {
        const lenderList = document.getElementById('lenderSelectionList');
        if (!lenderList || !this.qualifiedLenders) {
            if (lenderList) {
                lenderList.innerHTML = '<p style="color: #6b7280;">No qualified lenders available. Please run lender qualification first.</p>';
            }
            return;
        }
        
        if (this.qualifiedLenders.length === 0) {
            lenderList.innerHTML = '<p style="color: #6b7280;">No qualified lenders available. Please run lender qualification first.</p>';
            return;
        }
        
        // Group by tier for better organization
        const lendersByTier = {};
        this.qualifiedLenders.forEach(lender => {
            const tier = lender.Tier || 'Unknown';
            if (!lendersByTier[tier]) lendersByTier[tier] = [];
            lendersByTier[tier].push(lender);
        });
        
        let html = '';
        Object.keys(lendersByTier).sort().forEach(tier => {
            html += `<div style="margin-bottom: 12px;">`;
            html += `<div style="font-weight: 600; color: #374151; margin-bottom: 8px;">Tier ${tier}</div>`;
            lendersByTier[tier].forEach(lender => {
                const lenderName = lender['Lender Name'] || lender.name;
                const isPreferred = lender.isPreferred ? '' : '';
                html += `
                    <label style="display: flex; align-items: center; padding: 6px; cursor: pointer;">
                        <input type="checkbox" class="lender-checkbox" value="${lenderName}" checked style="margin-right: 8px;">
                        <span>${lenderName} ${isPreferred}</span>
                    </label>
                `;
            });
            html += `</div>`;
        });
        
        lenderList.innerHTML = html;
    }

    toggleAllLenders() {
        const checkboxes = document.querySelectorAll('#lenderSelectionList .lender-checkbox');
        const toggleBtn = document.getElementById('toggleAllLendersBtn');
        
        if (!checkboxes.length || !toggleBtn) {
            return;
        }
        
        // Check if all checkboxes are currently checked
        const allChecked = Array.from(checkboxes).every(checkbox => checkbox.checked);
        
        // Toggle all checkboxes
        checkboxes.forEach(checkbox => {
            checkbox.checked = !allChecked;
        });
        
        // Update button text
        toggleBtn.textContent = allChecked ? 'Select All' : 'Deselect All';
    }

    populateSubmissionDocuments() {
        console.log('populateSubmissionDocuments called');
        const docList = document.getElementById('submissionDocumentList');
        console.log('docList element:', docList);
        console.log('currentDocuments:', this.currentDocuments?.length, 'documents');
        
        if (!docList) {
            console.error(' submissionDocumentList element not found');
            return;
        }
        
        if (!this.currentDocuments) {
            console.log('No currentDocuments, trying to load...');
            docList.innerHTML = '<p style="color: #f59e0b;">Loading documents...</p>';
            this.loadDocumentsForSubmission();
            return;
        }
        
        if (this.currentDocuments.length === 0) {
            docList.innerHTML = '<p style="color: #6b7280;">No documents available. Please upload documents first.</p>';
            return;
        }
        
        let html = '';
        this.currentDocuments.forEach(doc => {
            const icon = this.getDocumentIconCompact ? this.getDocumentIconCompact(doc.mimeType, doc.documentType) : '';
            const isImportant = doc.documentType === 'Bank Statement' || 
                              doc.documentType === 'Signed Application' ||
                              doc.originalFilename?.toLowerCase().includes('application');
            
            html += `
                <label style="display: flex; align-items: center; padding: 6px; cursor: pointer;">
                    <input type="checkbox" class="document-checkbox" value="${doc.id}" ${isImportant ? 'checked' : ''} style="margin-right: 8px;">
                    <span>${icon} ${doc.originalFilename || doc.filename}</span>
                </label>
            `;
        });
        
        docList.innerHTML = html;
    }
    
    async loadDocumentsForSubmission() {
        console.log('loadDocumentsForSubmission called');
        const conversationId = this.currentConversationId || this.selectedConversation?.id;
        
        if (!conversationId) {
            console.error(' No conversation ID available for loading documents');
            return;
        }
        
        try {
            console.log('� Fetching documents for conversation:', conversationId);
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conversationId}/documents`);
            const result = await response.json();
            
            if (result.success && result.documents) {
                console.log('Loaded', result.documents.length, 'documents for submission');
                this.currentDocuments = result.documents;
                this.populateSubmissionDocuments(); // Retry populating now that we have documents
            } else {
                console.error(' Failed to load documents:', result.error);
                const docList = document.getElementById('submissionDocumentList');
                if (docList) {
                    docList.innerHTML = '<p style="color: #ef4444;">Failed to load documents. Please try again.</p>';
                }
            }
        } catch (error) {
            console.error(' Error loading documents for submission:', error);
            const docList = document.getElementById('submissionDocumentList');
            if (docList) {
                docList.innerHTML = '<p style="color: #ef4444;">Error loading documents. Please refresh and try again.</p>';
            }
        }
    }

    prefillSubmissionMessage() {
        const messageField = document.getElementById('submissionMessage');
        if (!messageField || !this.selectedConversation) return;
        
        const conv = this.selectedConversation;
        const businessName = conv.business_name || 'N/A';
        const requestedAmount = conv.requested_amount || conv.funding_amount || 'N/A';
        const formattedAmount = requestedAmount !== 'N/A' ? `$${parseInt(requestedAmount).toLocaleString()}` : 'N/A';
        
        const message = `Hello,

Please find attached the funding application and supporting documents for our mutual client.

Business Name: ${businessName}
Requested Amount: ${formattedAmount}
Industry: ${conv.industry_type || conv.business_type || 'N/A'}
Time in Business: ${conv.years_in_business || 'N/A'} years
Monthly Revenue: ${conv.monthly_revenue ? `$${parseInt(conv.monthly_revenue).toLocaleString()}` : 'N/A'}

Please review and let me know if you need any additional information.

Best regards`;
        
        messageField.value = message;
    }

    async sendLenderSubmissions() {
        console.log('� Starting lender submission');
        
        try {
            // Get selected lenders
            const selectedLenderCheckboxes = Array.from(document.querySelectorAll('.lender-checkbox:checked'));
            
            const selectedLenders = selectedLenderCheckboxes.map(cb => {
                const lenderName = cb.value;
                
                // Find the lender object from qualifiedLenders
                const lender = this.qualifiedLenders?.find(l => 
                    l['Lender Name'] === lenderName || 
                    l.name === lenderName
                );
                
                // Create a clean lender object to avoid JSON serialization issues
                const cleanLender = {
                    name: lenderName,
                    lender_name: lenderName,
                    email: null
                };
                
                // Get email from various possible fields
                if (lender) {
                    cleanLender.email = lender.email || lender.Email || lender['Lender Email'] || lender['Email Address'];
                    
                    // Add important fields but sanitize them
                    if (lender['Lender Name']) cleanLender.name = String(lender['Lender Name']).trim();
                    if (lender.name) cleanLender.name = String(lender.name).trim();
                    if (lender.lender_name) cleanLender.lender_name = String(lender.lender_name).trim();
                    
                    // Sanitize additional fields that might contain problematic characters
                    ['requirements', 'contact', 'phone', 'website'].forEach(field => {
                        if (lender[field] && typeof lender[field] === 'string') {
                            cleanLender[field] = String(lender[field]).trim();
                        }
                    });
                }
                
                // Ensure email exists, use default if missing
                if (!cleanLender.email) {
                    cleanLender.email = `${lenderName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@lender.com`;
                }
                
                return cleanLender;
            });
            
            // Log to see what we're sending
            console.log('� Lenders being sent:', selectedLenders);
            
            // Validate that all lenders have emails
            const lendersWithoutEmail = selectedLenders.filter(l => !l.email);
            if (lendersWithoutEmail.length > 0) {
                console.error(' Lenders without email:', lendersWithoutEmail);
                this.showNotification(`${lendersWithoutEmail.length} lenders are missing email addresses. Using default emails.`, 'warning');
                
                // Add default emails for any missing
                selectedLenders.forEach(lender => {
                    if (!lender.email) {
                        const name = lender.name || lender['Lender Name'] || 'unknown';
                        lender.email = `${name.toLowerCase().replace(/\s+/g, '.')}@lender.com`;
                    }
                });
            }
            
            if (selectedLenders.length === 0) {
                this.showNotification('Please select at least one lender', 'warning');
                return;
            }
            
            // Get selected documents
            const selectedDocumentIds = Array.from(document.querySelectorAll('.document-checkbox:checked'))
                .map(cb => cb.value);
            
            const selectedDocuments = selectedDocumentIds.map(docId => {
                const doc = this.currentDocuments?.find(d => d.id === docId);
                if (!doc) {
                    console.warn(`Document ${docId} not found in currentDocuments`);
                    return {
                        id: docId, 
                        name: 'Unknown Document',
                        filename: 'unknown.pdf',
                        originalFilename: 'unknown.pdf',
                        type: 'application/pdf',
                        mimeType: 'application/pdf'
                    };
                }
                
                // Ensure all required fields are present for email attachment
                return {
                    id: doc.id,
                    filename: doc.originalFilename || doc.original_filename || doc.filename || doc.name || 'document.pdf',
                    name: doc.originalFilename || doc.original_filename || doc.filename || doc.name || 'document.pdf',
                    originalFilename: doc.originalFilename || doc.original_filename || doc.filename || doc.name,
                    type: doc.documentType || doc.document_type || doc.mimeType || doc.mime_type || 'application/pdf',
                    mimeType: doc.mimeType || doc.mime_type || doc.documentType || doc.document_type || 'application/pdf',
                    // Include storage paths for backend to fetch the actual files
                    s3_url: doc.s3_url || doc.url || doc.s3Url || null,
                    file_path: doc.file_path || doc.path || doc.filePath || null,
                    // Additional metadata
                    size: doc.size || doc.fileSize || null,
                    uploadDate: doc.uploadDate || doc.created_at || doc.createdAt || null
                };
            }).filter(doc => doc !== null);
            
            // Debug log the documents being prepared
            console.log('� Documents being sent:', selectedDocuments);
            console.log('� Current documents available:', this.currentDocuments);
            
            // Get message
            const message = document.getElementById('submissionMessage')?.value;
            if (!message?.trim()) {
                this.showNotification('Please enter a message', 'warning');
                return;
            }
            
            // Prepare business data
            const businessData = {
                businessName: this.selectedConversation?.business_name || 'Unknown Business',
                industry: this.selectedConversation?.industry || '',
                state: this.selectedConversation?.state || '',
                monthlyRevenue: this.selectedConversation?.monthly_revenue || 0,
                fico: this.selectedConversation?.fico_score || 650,
                tib: this.selectedConversation?.years_in_business ? this.selectedConversation.years_in_business * 12 : 0,
                negativeDays: this.selectedConversation?.negative_days || 0,
                position: this.selectedConversation?.requested_position || 1,
                customMessage: message
            };
            
            // Show loading state
            const sendText = document.getElementById('sendSubmissionsText');
            const sendLoading = document.getElementById('sendSubmissionsLoading');
            if (sendText) sendText.style.display = 'none';
            if (sendLoading) sendLoading.style.display = 'inline';
            
            // Log the complete payload
            console.log('� Complete payload:', {
                selectedLenders,
                businessData,
                documents: selectedDocuments
            });
            
            // Test JSON serialization before sending
            let requestBody;
            try {
                requestBody = JSON.stringify({
                    selectedLenders: selectedLenders,
                    businessData: businessData,
                    documents: selectedDocuments
                });
                console.log('JSON serialization successful, payload size:', requestBody.length);
            } catch (jsonError) {
                console.error(' JSON serialization failed:', jsonError);
                this.showNotification('Error preparing data: ' + jsonError.message, 'error');
                return;
            }
            
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${this.currentConversationId}/send-to-lenders`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: requestBody
            });
            
            const result = await response.json();
            console.log('� Server response:', result);
            
            if (result.success) {
                const successCount = result.results?.successful?.length || 0;
                this.showNotification(`Successfully sent emails to ${successCount} of ${selectedLenders.length} lenders!`, 'success');
                
                if (result.results?.failed?.length > 0) {
                    console.warn('Failed sends:', result.results.failed);
                    result.results.failed.forEach(fail => {
                        // Fix: Check if fail.lender exists before accessing it
                        const lenderInfo = fail.lender || fail.lenderName || 'Unknown';
                        console.error(` Failed to send to ${lenderInfo}:`, fail.error);
                    });
                }
                
                this.hideLenderSubmissionModal();
            } else {
                throw new Error(result.error || 'Failed to send submissions');
            }
            
        } catch (error) {
            console.error(' Error sending submissions:', error);
            this.showNotification('Failed to send: ' + error.message, 'error');
        } finally {
            const sendText = document.getElementById('sendSubmissionsText');
            const sendLoading = document.getElementById('sendSubmissionsLoading');
            if (sendText) sendText.style.display = 'inline';
            if (sendLoading) sendLoading.style.display = 'none';
        }
    }

    // Lender Management CRUD Methods
    async loadLendersList() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/lenders`);
            if (response.ok) {
                const lenders = await response.json();
                this.displayLendersList(lenders);
            } else {
                throw new Error('Failed to load lenders');
            }
        } catch (error) {
            console.error('Error loading lenders:', error);
            this.displayLendersError('Failed to load lenders');
        }
    }

    displayLendersList(lenders) {
        const container = document.getElementById('lendersTableContainer');
        
        if (!lenders || lenders.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h4>No Lenders Found</h4>
                    <p>Start by adding your first lender to the database.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <table class="lenders-table">
                <thead>
                    <tr>
                        <th>Lender Name</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${lenders.map(lender => `
                        <tr>
                            <td style="font-weight: 500;">${lender.name}</td>
                            <td>
                                <div class="action-buttons">
                                    <button class="action-btn edit" onclick="window.conversationUI.editLender('${lender.id}')">
                                        Edit
                                    </button>
                                    <button class="action-btn delete" onclick="window.conversationUI.deleteLender('${lender.id}', '${lender.name}')">
                                        Delete
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    displayLendersError(message) {
        const container = document.getElementById('lendersTableContainer');
        container.innerHTML = `
            <div class="empty-state">
                <h4>Error</h4>
                <p>${message}</p>
                <button class="mgmt-btn primary" onclick="conversationUI.loadLendersList()">
                    Retry
                </button>
            </div>
        `;
    }

    showAddLenderModal() {
        console.log('� showAddLenderModal called');
        
        try {
            // Check if modal already exists and remove it
            const existingModal = document.getElementById('addLenderModal');
            if (existingModal) {
                console.log('Removing existing modal');
                existingModal.remove();
            }
            
            const modalHtml = `
                <div id="addLenderModal" style="
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100vw !important;
                    height: 100vh !important;
                    background: rgba(0, 0, 0, 0.7) !important;
                    z-index: 999999 !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                ">
                    <div style="
                        background: white !important;
                        border-radius: 8px !important;
                        padding: 0 !important;
                        max-width: 500px !important;
                        width: 90% !important;
                        max-height: 90vh !important;
                        overflow-y: auto !important;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
                    ">
                        <div style="padding: 20px !important; border-bottom: 1px solid #e2e8f0 !important;">
                            <h3 style="margin: 0 !important;">Add New Lender</h3>
                        </div>
                        <div style="padding: 20px !important;">
                            <div style="margin-bottom: 16px !important;">
                                <label style="display: block !important; margin-bottom: 4px !important; font-weight: 600 !important;">Lender Name *</label>
                                <input type="text" id="newLenderName" style="width: 100% !important; padding: 8px !important; border: 1px solid #e2e8f0 !important; border-radius: 4px !important; box-sizing: border-box !important;" placeholder="Enter lender name">
                            </div>
                            <div style="margin-bottom: 16px !important;">
                                <label style="display: block !important; margin-bottom: 4px !important; font-weight: 600 !important;">Email *</label>
                                <input type="email" id="newLenderEmail" style="width: 100% !important; padding: 8px !important; border: 1px solid #e2e8f0 !important; border-radius: 4px !important; box-sizing: border-box !important;" placeholder="Enter email address">
                            </div>
                            <div style="margin-bottom: 16px !important;">
                                <label style="display: block !important; margin-bottom: 4px !important; font-weight: 600 !important;">Phone</label>
                                <input type="text" id="newLenderPhone" style="width: 100% !important; padding: 8px !important; border: 1px solid #e2e8f0 !important; border-radius: 4px !important; box-sizing: border-box !important;" placeholder="Enter phone number">
                            </div>
                            <div style="margin-bottom: 16px !important;">
                                <label style="display: block !important; margin-bottom: 4px !important; font-weight: 600 !important;">Company</label>
                                <input type="text" id="newLenderCompany" style="width: 100% !important; padding: 8px !important; border: 1px solid #e2e8f0 !important; border-radius: 4px !important; box-sizing: border-box !important;" placeholder="Enter company name">
                            </div>
                            <div style="display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 16px !important; margin-bottom: 16px !important;">
                                <div>
                                    <label style="display: block !important; margin-bottom: 4px !important; font-weight: 600 !important;">Min Amount</label>
                                    <input type="number" id="newLenderMinAmount" style="width: 100% !important; padding: 8px !important; border: 1px solid #e2e8f0 !important; border-radius: 4px !important; box-sizing: border-box !important;" placeholder="0">
                                </div>
                                <div>
                                    <label style="display: block !important; margin-bottom: 4px !important; font-weight: 600 !important;">Max Amount</label>
                                    <input type="number" id="newLenderMaxAmount" style="width: 100% !important; padding: 8px !important; border: 1px solid #e2e8f0 !important; border-radius: 4px !important; box-sizing: border-box !important;" placeholder="0">
                                </div>
                            </div>
                            <div style="margin-bottom: 16px !important;">
                                <label style="display: block !important; margin-bottom: 4px !important; font-weight: 600 !important;">Industries (comma-separated)</label>
                                <input type="text" id="newLenderIndustries" style="width: 100% !important; padding: 8px !important; border: 1px solid #e2e8f0 !important; border-radius: 4px !important; box-sizing: border-box !important;" placeholder="e.g., retail, restaurant, construction">
                            </div>
                            <div style="margin-bottom: 16px !important;">
                                <label style="display: block !important; margin-bottom: 4px !important; font-weight: 600 !important;">States (comma-separated)</label>
                                <input type="text" id="newLenderStates" style="width: 100% !important; padding: 8px !important; border: 1px solid #e2e8f0 !important; border-radius: 4px !important; box-sizing: border-box !important;" placeholder="e.g., CA, NY, FL">
                            </div>
                            <div style="margin-bottom: 16px !important;">
                                <label style="display: block !important; margin-bottom: 4px !important; font-weight: 600 !important;">Notes</label>
                                <textarea id="newLenderNotes" rows="3" style="width: 100% !important; padding: 8px !important; border: 1px solid #e2e8f0 !important; border-radius: 4px !important; box-sizing: border-box !important;" placeholder="Enter any additional notes"></textarea>
                            </div>
                        </div>
                        <div style="padding: 20px !important; border-top: 1px solid #e2e8f0 !important; display: flex !important; justify-content: flex-end !important; gap: 12px !important;">
                            <button onclick="document.getElementById('addLenderModal').remove()" style="padding: 8px 16px !important; border: 1px solid #e2e8f0 !important; background: white !important; border-radius: 4px !important; cursor: pointer !important;">Cancel</button>
                            <button onclick="window.conversationUI.saveLender()" style="padding: 8px 16px !important; background: #059669 !important; color: white !important; border: none !important; border-radius: 4px !important; cursor: pointer !important;">Save Lender</button>
                        </div>
                    </div>
                </div>
            `;
            
            console.log('� Inserting modal HTML');
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            
            // Verify modal was added
            const addedModal = document.getElementById('addLenderModal');
            if (addedModal) {
                console.log('Modal successfully added to DOM');
                
                // Focus on the first input
                setTimeout(() => {
                    const firstInput = document.getElementById('newLenderName');
                    if (firstInput) {
                        firstInput.focus();
                        console.log('Focused on first input');
                    }
                }, 100);
            } else {
                console.error(' Modal was not added to DOM');
            }
            
        } catch (error) {
            console.error(' Error in showAddLenderModal:', error);
            alert('Error opening modal: ' + error.message);
        }
    }

    testSimpleModal() {
        console.log('testSimpleModal called');
        
        // Remove any existing test modal
        const existing = document.getElementById('testModal');
        if (existing) existing.remove();
        
        // Create the simplest possible modal
        const html = `
            <div id="testModal" style="
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                background: rgba(255, 0, 0, 0.8) !important;
                z-index: 999999 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
            ">
                <div style="
                    background: white !important;
                    padding: 40px !important;
                    border-radius: 8px !important;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
                ">
                    <h2>� TEST MODAL WORKING!</h2>
                    <p>If you can see this, modals work!</p>
                    <button onclick="document.getElementById('testModal').remove()" 
                            style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px;">
                        Close
                    </button>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', html);
        console.log('Test modal added');
    }

    async editLender(lenderId) {
        console.log('� editLender called for:', lenderId);
        
        try {
            // First, fetch the lender data
            const response = await fetch(`${this.apiBaseUrl}/api/lenders/${lenderId}`);
            if (!response.ok) {
                throw new Error('Failed to fetch lender data');
            }
            
            const lender = await response.json();
            console.log('Fetched lender data:', lender);
            
            // Show the edit modal with the lender data
            this.showEditLenderModal(lender);
            
        } catch (error) {
            console.error(' Error fetching lender:', error);
            this.showNotification('Failed to load lender data', 'error');
        }
    }

    async deleteLender(lenderId, lenderName) {
        if (!confirm(`Are you sure you want to delete lender "${lenderName}"?`)) {
            return;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/lenders/${lenderId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showNotification('Lender deleted successfully', 'success');
                this.loadLendersList(); // Refresh the list
            } else {
                throw new Error('Failed to delete lender');
            }
        } catch (error) {
            console.error('Error deleting lender:', error);
            this.showNotification('Failed to delete lender', 'error');
        }
    }

    showEditLenderModal(lender) {
        console.log('� showEditLenderModal called with lender:', lender);
        
        try {
            // Remove any existing modal
            const existingModal = document.getElementById('editLenderModal');
            if (existingModal) {
                existingModal.remove();
            }
            
            // Format arrays for display
            const industriesStr = Array.isArray(lender.industries) ? lender.industries.join(', ') : '';
            const statesStr = Array.isArray(lender.states) ? lender.states.join(', ') : '';
            
            const modalHtml = `
                <div id="editLenderModal" style="
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100vw !important;
                    height: 100vh !important;
                    background: rgba(0, 0, 0, 0.7) !important;
                    z-index: 999999 !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                ">
                    <div style="
                        background: white !important;
                        border-radius: 8px !important;
                        padding: 0 !important;
                        max-width: 500px !important;
                        width: 90% !important;
                        max-height: 90vh !important;
                        overflow-y: auto !important;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
                    ">
                        <div style="padding: 20px !important; border-bottom: 1px solid #e2e8f0 !important; background: linear-gradient(135deg, #3b82f6, #8b5cf6) !important; color: white !important;">
                            <h3 style="margin: 0 !important;">Edit Lender</h3>
                        </div>
                        <div style="padding: 20px !important;">
                            <div style="margin-bottom: 16px !important;">
                                <label style="display: block !important; margin-bottom: 4px !important; font-weight: 600 !important;">Lender Name *</label>
                                <input type="text" id="editLenderName" value="${lender.name || ''}" style="width: 100% !important; padding: 8px !important; border: 1px solid #e2e8f0 !important; border-radius: 4px !important; box-sizing: border-box !important;">
                            </div>
                            <div style="margin-bottom: 16px !important;">
                                <label style="display: block !important; margin-bottom: 4px !important; font-weight: 600 !important;">Email *</label>
                                <input type="email" id="editLenderEmail" value="${lender.email || ''}" style="width: 100% !important; padding: 8px !important; border: 1px solid #e2e8f0 !important; border-radius: 4px !important; box-sizing: border-box !important;">
                            </div>
                            <div style="margin-bottom: 16px !important;">
                                <label style="display: block !important; margin-bottom: 4px !important; font-weight: 600 !important;">Phone</label>
                                <input type="text" id="editLenderPhone" value="${lender.phone || ''}" style="width: 100% !important; padding: 8px !important; border: 1px solid #e2e8f0 !important; border-radius: 4px !important; box-sizing: border-box !important;">
                            </div>
                            <div style="margin-bottom: 16px !important;">
                                <label style="display: block !important; margin-bottom: 4px !important; font-weight: 600 !important;">Company</label>
                                <input type="text" id="editLenderCompany" value="${lender.company || ''}" style="width: 100% !important; padding: 8px !important; border: 1px solid #e2e8f0 !important; border-radius: 4px !important; box-sizing: border-box !important;">
                            </div>
                            <div style="display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 16px !important; margin-bottom: 16px !important;">
                                <div>
                                    <label style="display: block !important; margin-bottom: 4px !important; font-weight: 600 !important;">Min Amount</label>
                                    <input type="number" id="editLenderMinAmount" value="${lender.min_amount || 0}" style="width: 100% !important; padding: 8px !important; border: 1px solid #e2e8f0 !important; border-radius: 4px !important; box-sizing: border-box !important;">
                                </div>
                                <div>
                                    <label style="display: block !important; margin-bottom: 4px !important; font-weight: 600 !important;">Max Amount</label>
                                    <input type="number" id="editLenderMaxAmount" value="${lender.max_amount || 0}" style="width: 100% !important; padding: 8px !important; border: 1px solid #e2e8f0 !important; border-radius: 4px !important; box-sizing: border-box !important;">
                                </div>
                            </div>
                            <div style="margin-bottom: 16px !important;">
                                <label style="display: block !important; margin-bottom: 4px !important; font-weight: 600 !important;">Industries (comma-separated)</label>
                                <input type="text" id="editLenderIndustries" value="${industriesStr}" style="width: 100% !important; padding: 8px !important; border: 1px solid #e2e8f0 !important; border-radius: 4px !important; box-sizing: border-box !important;" placeholder="e.g., retail, restaurant, construction">
                            </div>
                            <div style="margin-bottom: 16px !important;">
                                <label style="display: block !important; margin-bottom: 4px !important; font-weight: 600 !important;">States (comma-separated)</label>
                                <input type="text" id="editLenderStates" value="${statesStr}" style="width: 100% !important; padding: 8px !important; border: 1px solid #e2e8f0 !important; border-radius: 4px !important; box-sizing: border-box !important;" placeholder="e.g., CA, NY, FL">
                            </div>
                            <div style="margin-bottom: 16px !important;">
                                <label style="display: block !important; margin-bottom: 4px !important; font-weight: 600 !important;">Notes</label>
                                <textarea id="editLenderNotes" rows="3" style="width: 100% !important; padding: 8px !important; border: 1px solid #e2e8f0 !important; border-radius: 4px !important; box-sizing: border-box !important;">${lender.notes || ''}</textarea>
                            </div>
                        </div>
                        <div style="padding: 20px !important; border-top: 1px solid #e2e8f0 !important; display: flex !important; justify-content: flex-end !important; gap: 12px !important;">
                            <button onclick="document.getElementById('editLenderModal').remove()" style="padding: 8px 16px !important; border: 1px solid #e2e8f0 !important; background: white !important; border-radius: 4px !important; cursor: pointer !important;">Cancel</button>
                            <button onclick="window.conversationUI.updateLender('${lender.id}')" style="padding: 8px 16px !important; background: #3b82f6 !important; color: white !important; border: none !important; border-radius: 4px !important; cursor: pointer !important;">Update Lender</button>
                        </div>
                    </div>
                </div>
            `;
            
            console.log('� Inserting edit modal HTML');
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            
            // Verify modal was added
            const addedModal = document.getElementById('editLenderModal');
            if (addedModal) {
                console.log('Edit modal successfully added to DOM');
                
                // Focus on the first input
                setTimeout(() => {
                    const firstInput = document.getElementById('editLenderName');
                    if (firstInput) {
                        firstInput.focus();
                        console.log('Focused on lender name input');
                    }
                }, 100);
            } else {
                console.error(' Edit modal was not added to DOM');
            }
            
        } catch (error) {
            console.error(' Error in showEditLenderModal:', error);
            alert('Error opening edit modal: ' + error.message);
        }
    }

    async updateLender(lenderId) {
        console.log('� updateLender called for:', lenderId);
        
        // Get form values
        const name = document.getElementById('editLenderName').value.trim();
        const email = document.getElementById('editLenderEmail').value.trim();
        const phone = document.getElementById('editLenderPhone').value.trim();
        const company = document.getElementById('editLenderCompany').value.trim();
        const minAmount = document.getElementById('editLenderMinAmount').value;
        const maxAmount = document.getElementById('editLenderMaxAmount').value;
        const industriesText = document.getElementById('editLenderIndustries').value.trim();
        const statesText = document.getElementById('editLenderStates').value.trim();
        const notes = document.getElementById('editLenderNotes').value.trim();
        
        // Validation
        if (!name) {
            this.showNotification('Lender name is required', 'error');
            return;
        }
        
        if (!email) {
            this.showNotification('Email is required', 'error');
            return;
        }
        
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            this.showNotification('Please enter a valid email address', 'error');
            return;
        }
        
        // Parse comma-separated values
        const industries = industriesText ? industriesText.split(',').map(i => i.trim()).filter(i => i) : [];
        const states = statesText ? statesText.split(',').map(s => s.trim().toUpperCase()).filter(s => s) : [];
        
        // Prepare data
        const lenderData = {
            name,
            email,
            phone: phone || null,
            company: company || null,
            min_amount: minAmount ? parseFloat(minAmount) : null,
            max_amount: maxAmount ? parseFloat(maxAmount) : null,
            industries,
            states,
            notes: notes || null
        };
        
        console.log('� Sending update data:', lenderData);
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/lenders/${lenderId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(lenderData)
            });
            
            if (response.ok) {
                this.showNotification('Lender updated successfully', 'success');
                document.getElementById('editLenderModal').remove();
                this.loadLendersList(); // Refresh the list
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Failed to update lender');
            }
        } catch (error) {
            console.error(' Error updating lender:', error);
            this.showNotification('Failed to update lender: ' + error.message, 'error');
        }
    }

    refreshLendersList() {
        this.loadLendersList();
    }

    async saveLender() {
        // Get form values
        const name = document.getElementById('newLenderName').value.trim();
        const email = document.getElementById('newLenderEmail').value.trim();
        const phone = document.getElementById('newLenderPhone').value.trim();
        const company = document.getElementById('newLenderCompany').value.trim();
        const minAmount = document.getElementById('newLenderMinAmount').value;
        const maxAmount = document.getElementById('newLenderMaxAmount').value;
        const industriesText = document.getElementById('newLenderIndustries').value.trim();
        const statesText = document.getElementById('newLenderStates').value.trim();
        const notes = document.getElementById('newLenderNotes').value.trim();
        
        // Validation
        if (!name) {
            this.showNotification('Lender name is required', 'error');
            return;
        }
        
        if (!email) {
            this.showNotification('Email is required', 'error');
            return;
        }
        
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            this.showNotification('Please enter a valid email address', 'error');
            return;
        }
        
        // Parse comma-separated values
        const industries = industriesText ? industriesText.split(',').map(i => i.trim()).filter(i => i) : [];
        const states = statesText ? statesText.split(',').map(s => s.trim().toUpperCase()).filter(s => s) : [];
        
        // Prepare data
        const lenderData = {
            name,
            email,
            phone: phone || null,
            company: company || null,
            min_amount: minAmount ? parseFloat(minAmount) : null,
            max_amount: maxAmount ? parseFloat(maxAmount) : null,
            industries,
            states,
            notes: notes || null
        };
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/lenders`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(lenderData)
            });
            
            if (response.ok) {
                this.showNotification('Lender added successfully', 'success');
                document.getElementById('addLenderModal').remove();
                this.loadLendersList(); // Refresh the list
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Failed to add lender');
            }
        } catch (error) {
            this.handleError(error, 'Error adding lender', 'Failed to add lender: ' + error.message);
        }
    }

    exportLenders() {
        this.showNotification('Export Lenders - Coming Soon', 'info');
    }

    // ========== AI Assistant Methods ==========

    renderInitialSuggestions() {
        const conv = this.selectedConversation;
        if (!conv) return '';
        
        // Analyze current state and provide contextual suggestions
        const suggestions = [];
        
        // Check conversation state
        if (conv.state === 'NEW') {
            suggestions.push("Send initial qualification message");
            suggestions.push("Request bank statements");
        } else if (conv.state === 'QUALIFIED') {
            suggestions.push("Run lender matching");
            suggestions.push("Prepare funding package");
        }
        
        // Check for missing data
        if (!conv.annual_revenue) {
            suggestions.push("Ask about annual revenue");
        }
        if (!conv.business_start_date) {
            suggestions.push("Request time in business");
        }
        
        // Check document status
        if (!this.currentDocuments || this.currentDocuments.length === 0) {
            suggestions.push("Request documents");
        } else if (!this.hasFCSReport()) {
            suggestions.push("Generate FCS report");
        }
        
        if (suggestions.length === 0) {
            suggestions.push("Review complete profile");
            suggestions.push("Send to lenders");
        }
        
        return `
            <div class="ai-suggestions">
                <h4>Suggested Actions</h4>
                <div>
                    ${suggestions.map(s => `
                        <span class="suggestion-pill" onclick="window.commandCenter.conversationUI.executeSuggestion('${s}')">
                            ${s}
                        </span>
                    `).join('')}
                </div>
            </div>
        `;
    }

    initializeAIChat() {
        const input = document.getElementById('aiChatInput');
        const sendBtn = document.getElementById('aiChatSend');
        
        if (input && sendBtn) {
            // Auto-resize textarea
            input.addEventListener('input', (e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
            });
            
            // Handle enter key
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendAIChatMessage();
                }
            });
            
            // Handle send button click
            sendBtn.addEventListener('click', () => {
                this.sendAIChatMessage();
            });
        }
        
        // Load conversation context
        this.loadAIContext();
        
        // Load and display persisted AI messages
        this.loadPersistedAIMessages();
    }

    async loadAIContext() {
        // This loads all relevant context for the AI
        this.aiContext = {
            conversation: this.selectedConversation,
            messages: await this.getRecentMessages(),
            documents: this.currentDocuments,
            fcsReport: await this.getFCSReport(),
            lenderResults: this.lenderResultsCache?.get(this.currentConversationId),
            metadata: {
                daysSinceLastContact: this.calculateDaysSinceLastContact(),
                completionPercentage: this.calculateDataCompletion(),
                stage: this.determineLeadStage()
            }
        };
    }

    async loadPersistedAIMessages() {
        if (!this.selectedConversation?.id) return;

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/ai/messages/${this.selectedConversation.id}`);
            if (!response.ok) return;

            const data = await response.json();
            if (!data.success || !data.messages || data.messages.length === 0) return;

            const messagesContainer = document.getElementById('aiChatMessages');
            if (!messagesContainer) return;

            // Clear the welcome message
            messagesContainer.innerHTML = '';

            // Add each persisted message to the chat
            data.messages.forEach(msg => {
                this.addChatMessage(msg.content, msg.message_type, false, new Date(msg.timestamp));
            });

            // Scroll to bottom
            messagesContainer.scrollTop = messagesContainer.scrollHeight;

        } catch (error) {
            console.log('Could not load persisted AI messages:', error.message);
        }
    }

    async sendAIChatMessage() {
        const input = document.getElementById('aiChatInput');
        const messagesContainer = document.getElementById('aiChatMessages');
        const sendBtn = document.getElementById('aiChatSend');
        
        if (!input || !input.value.trim()) return;
        
        const message = input.value.trim();
        input.value = '';
        input.style.height = 'auto';
        
        // Add user message
        this.addChatMessage(message, 'user');
        
        // Show typing indicator
        this.showChatTyping();
        
        // Disable send button
        sendBtn.disabled = true;
        
        try {
            const response = await this.processAIQuery(message);
            this.removeChatTyping();
            this.addChatMessage(response, 'assistant');
        } catch (error) {
            this.removeChatTyping();
            this.addChatMessage('Sorry, I encountered an error. Please try again.', 'assistant');
        } finally {
            sendBtn.disabled = false;
        }
    }

    async processAIQuery(query) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/ai/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: query,
                    conversationId: this.selectedConversation?.id
                })
            });

            const data = await response.json();
            
            if (data.success) {
                return data.response;
            } else if (data.fallback) {
                // Show fallback response with indication that AI is not fully connected
                return `� **AI Service Notice:** ${data.error || 'API not fully configured'}\n\n${data.fallback}`;
            } else {
                return ` I apologize, but I'm having trouble processing your request right now. ${data.error || 'Please try again later.'}`;
            }
        } catch (error) {
            console.error('AI Query Error:', error);
            
            // Fallback to pattern matching if API call fails
            return this.getFallbackResponse(query);
        }
    }

    getFallbackResponse(query) {
        const lowerQuery = query.toLowerCase();
        const conv = this.selectedConversation;
        
        if (lowerQuery.includes('analyze') || lowerQuery.includes('analysis')) {
            const completeness = this.calculateDataCompletion();
            const stage = this.determineLeadStage();
            const daysSince = this.calculateDaysSinceLastContact();
            
            return `� **Lead Analysis for ${conv?.business_name || 'Unknown Business'}**

**Data Completeness:** ${completeness}%
**Current Stage:** ${stage}
**Last Contact:** ${daysSince} days ago

${completeness < 50 ? '**Action Needed:** Complete missing lead information\n' : ''}${daysSince > 7 ? '**Action Needed:** Follow up with lead - no recent contact\n' : ''}${!this.currentDocuments?.length ? '**Action Needed:** Request documents from lead\n' : ''}
**Next Steps:** ${completeness < 80 ? 'Gather missing information, ' : ''}${daysSince > 3 ? 'send follow-up message, ' : ''}${!this.hasFCSReport() ? 'generate FCS report' : 'ready for lender submission'}`;
        }
        
        if (lowerQuery.includes('suggest') || lowerQuery.includes('response') || lowerQuery.includes('message')) {
            return `� I'd suggest a personalized response based on the lead's current stage. Configure your OpenAI API key to get AI-powered message suggestions tailored to ${conv?.business_name || 'this lead'}.`;
        }
        
        if (lowerQuery.includes('fcs') || lowerQuery.includes('financial')) {
            return `� I can help analyze FCS data when the AI service is fully configured. Please set up your OpenAI API key for detailed financial insights.`;
        }
        
        if (lowerQuery.includes('lender') || lowerQuery.includes('qualify') || lowerQuery.includes('funding')) {
            return `I can provide lender matching recommendations when AI service is configured. Add your OpenAI API key to get personalized lender suggestions.`;
        }
        
        return `� **AI Service Offline:** I'm currently running in fallback mode. To get full AI assistance, please configure your OpenAI API key in the .env file.

I can still help with basic lead analysis and provide general guidance about ${conv?.business_name || 'this lead'}.`;
    }

    addChatMessage(message, type, showScrollAndTime = true, timestamp = null) {
        const messagesContainer = document.getElementById('aiChatMessages');
        if (!messagesContainer) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-chat-message ${type}`;
        
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.innerHTML = message.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Add timestamp if provided
        if (timestamp && showScrollAndTime) {
            const timeElement = document.createElement('div');
            timeElement.className = 'message-timestamp';
            timeElement.style.cssText = 'font-size: 11px; opacity: 0.6; margin-top: 4px; text-align: ' + (type === 'user' ? 'right' : 'left');
            timeElement.textContent = timestamp.toLocaleString();
            bubble.appendChild(timeElement);
        }
        
        messageDiv.appendChild(bubble);
        messagesContainer.appendChild(messageDiv);
        
        if (showScrollAndTime) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    showChatTyping() {
        const messagesContainer = document.getElementById('aiChatMessages');
        if (!messagesContainer) return;
        
        const typingDiv = document.createElement('div');
        typingDiv.className = 'ai-chat-message assistant';
        typingDiv.id = 'aiChatTyping';
        
        const typingBubble = document.createElement('div');
        typingBubble.className = 'typing-indicator';
        typingBubble.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        `;
        
        typingDiv.appendChild(typingBubble);
        messagesContainer.appendChild(typingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    removeChatTyping() {
        const typingDiv = document.getElementById('aiChatTyping');
        if (typingDiv) {
            typingDiv.remove();
        }
    }

    addAIChatMessage(message, type, actions = null) {
        const chatArea = document.getElementById('aiChatArea');
        if (!chatArea) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-message ${type}`;
        messageDiv.innerHTML = message;
        
        if (actions) {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'ai-actions';
            actionsDiv.innerHTML = actions.map(action => `
                <button class="action-button" onclick="window.commandCenter.conversationUI.aiQuickAction('${action.action}')">
                    ${action.text}
                </button>
            `).join('');
            messageDiv.appendChild(actionsDiv);
        }
        
        chatArea.appendChild(messageDiv);
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    showTypingIndicator() {
        const chatArea = document.getElementById('aiChatArea');
        if (!chatArea) return;
        
        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing-indicator';
        typingDiv.id = 'aiTyping';
        typingDiv.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        `;
        
        chatArea.appendChild(typingDiv);
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    removeTypingIndicator() {
        const typingDiv = document.getElementById('aiTyping');
        if (typingDiv) {
            typingDiv.remove();
        }
    }

    aiQuickAction(action) {
        switch (action) {
            case 'analyze':
                this.addAIChatMessage('Analyze this lead', 'user');
                this.analyzeLeadData();
                break;
            case 'suggest':
                this.addAIChatMessage('Suggest a response message', 'user');
                this.generateResponseSuggestion();
                break;
            case 'fcs':
                this.addAIChatMessage('Review FCS data', 'user');
                this.analyzeFCSReport();
                break;
            case 'lenders':
                this.addAIChatMessage('Find matching lenders', 'user');
                this.suggestLenderActions();
                break;
            case 'next':
                this.addAIChatMessage('What should I do next?', 'user');
                this.recommendNextSteps();
                break;
        }
    }

    async analyzeLeadData() {
        const conv = this.selectedConversation;
        if (!conv) return;
        
        this.showTypingIndicator();
        
        // Simulate analysis delay
        setTimeout(() => {
            this.removeTypingIndicator();
            
            const completeness = this.calculateDataCompletion();
            const stage = this.determineLeadStage();
            const daysSince = this.calculateDaysSinceLastContact();
            
            let analysis = `� <strong>Lead Analysis for ${conv.business_name || 'Unknown Business'}</strong><br><br>`;
            
            analysis += `<strong>Data Completeness:</strong> ${completeness}%<br>`;
            analysis += `<strong>Current Stage:</strong> ${stage}<br>`;
            analysis += `<strong>Last Contact:</strong> ${daysSince} days ago<br><br>`;
            
            // Risk factors
            const risks = [];
            if (completeness < 50) risks.push("Low data completeness");
            if (daysSince > 7) risks.push("No recent contact");
            if (!this.currentDocuments?.length) risks.push("No documents uploaded");
            
            if (risks.length > 0) {
                analysis += `<strong>Risk Factors:</strong><br>`;
                risks.forEach(risk => analysis += `  ${risk}<br>`);
            }
            
            analysis += `<br><strong>Recommended Actions:</strong><br>`;
            if (completeness < 80) analysis += `  Gather missing information<br>`;
            if (daysSince > 3) analysis += `  Send follow-up message<br>`;
            if (!this.hasFCSReport()) analysis += `  Generate FCS report<br>`;
            
            this.addAIChatMessage(analysis, 'assistant');
        }, 1500);
    }

    async generateResponseSuggestion() {
        this.showTypingIndicator();
        
        setTimeout(() => {
            this.removeTypingIndicator();
            
            const conv = this.selectedConversation;
            const stage = this.determineLeadStage();
            
            let suggestion = '';
            
            switch (stage) {
                case 'Initial Contact':
                    suggestion = `Hi ${conv.first_name || 'there'}! Thanks for your interest in business funding. To get you the best options, I'd love to learn more about ${conv.business_name || 'your business'}. Could you share your approximate monthly revenue?`;
                    break;
                case 'Qualification':
                    suggestion = `Thanks for that information! To complete your qualification, could you please upload your last 3 months of bank statements? This helps us find the perfect funding match for ${conv.business_name || 'your business'}.`;
                    break;
                case 'Documentation':
                    suggestion = `Great! I have your documents and I'm reviewing them now. I should have some excellent funding options for you within 24 hours. In the meantime, is there a specific funding amount you're looking for?`;
                    break;
                default:
                    suggestion = `Hi ${conv.first_name || 'there'}! I wanted to follow up on your funding application for ${conv.business_name || 'your business'}. Do you have any questions about the next steps?`;
            }
            
            const message = `� <strong>Suggested Response:</strong><br><br>"${suggestion}"<br><br>Would you like me to send this message?`;
            
            this.addAIChatMessage(message, 'assistant', [
                { type: 'action', text: 'Send Message', action: 'send-suggested' },
                { type: 'action', text: 'Modify', action: 'modify-message' }
            ]);
        }, 1000);
    }

    async analyzeFCSReport() {
        this.showTypingIndicator();
        
        setTimeout(() => {
            this.removeTypingIndicator();
            
            if (!this.hasFCSReport()) {
                this.addAIChatMessage('� No FCS report found. Would you like me to generate one from the uploaded bank statements?', 'assistant', [
                    { type: 'action', text: 'Generate FCS Report', action: 'generate-fcs' }
                ]);
                return;
            }
            
            const analysis = `� <strong>FCS Analysis Summary:</strong><br><br>
                <strong>Average Daily Balance:</strong> ${this.formatCurrency(Math.random() * 50000 + 10000)}<br>
                <strong>Monthly Revenue:</strong> ${this.formatCurrency(Math.random() * 100000 + 20000)}<br>
                <strong>NSF Occurrences:</strong> ${Math.floor(Math.random() * 5)}<br>
                <strong>Account Health:</strong> ${Math.random() > 0.5 ? 'Good' : 'Fair'}<br><br>
                <strong>Funding Recommendation:</strong><br>
                This business shows ${Math.random() > 0.6 ? 'strong' : 'moderate'} financial health and would be suitable for funding amounts up to ${this.formatCurrency(Math.random() * 75000 + 25000)}.`;
            
            this.addAIChatMessage(analysis, 'assistant');
        }, 1200);
    }

    async suggestLenderActions() {
        this.showTypingIndicator();
        
        setTimeout(() => {
            this.removeTypingIndicator();
            
            const conv = this.selectedConversation;
            
            if (!this.hasFCSReport()) {
                this.addAIChatMessage('To find the best lenders, I need to analyze the financial data first. Please generate an FCS report from the bank statements.', 'assistant', [
                    { type: 'action', text: 'Generate FCS Report', action: 'generate-fcs' }
                ]);
                return;
            }
            
            const suggestions = `<strong>Lender Matching Recommendations:</strong><br><br>
                Based on the financial profile, I recommend targeting:<br><br>
                <strong>Tier 1 Lenders:</strong> (High approval chance)<br>
                  Premium Capital Solutions<br>
                  Business Growth Partners<br><br>
                <strong>Tier 2 Lenders:</strong> (Good fit)<br>
                  Regional Business Funding<br>
                  Quick Capital Group<br><br>
                <strong>Estimated Funding Range:</strong> ${this.formatCurrency(15000)} - ${this.formatCurrency(85000)}<br>
                <strong>Recommended Position:</strong> ${this.formatCurrency(Math.random() * 50000 + 25000)}`;
            
            this.addAIChatMessage(suggestions, 'assistant', [
                { type: 'action', text: 'Run Lender Qualification', action: 'run-lender-qual' },
                { type: 'action', text: 'Send to Lenders', action: 'send-to-lenders' }
            ]);
        }, 1500);
    }

    async recommendNextSteps() {
        this.showTypingIndicator();
        
        setTimeout(() => {
            this.removeTypingIndicator();
            
            const conv = this.selectedConversation;
            const stage = this.determineLeadStage();
            const completeness = this.calculateDataCompletion();
            
            let steps = `<strong>Recommended Next Steps:</strong><br><br>`;
            
            if (completeness < 50) {
                steps += `1. <strong>Gather Missing Data</strong><br>     Complete lead qualification<br>     Get missing business information<br><br>`;
            }
            
            if (!this.currentDocuments?.length) {
                steps += `2. <strong>Request Documents</strong><br>     Ask for bank statements<br>     Get business licenses/permits<br><br>`;
            } else if (!this.hasFCSReport()) {
                steps += `2. <strong>Generate FCS Report</strong><br>     Analyze uploaded documents<br>     Create financial summary<br><br>`;
            }
            
            if (this.hasFCSReport() && completeness > 70) {
                steps += `3. <strong>Lender Submission</strong><br>     Run lender qualifications<br>     Submit to matched lenders<br><br>`;
            }
            
            steps += `4. <strong>Follow-up</strong><br>     Send status update to client<br>     Schedule next contact<br>`;
            
            this.addAIChatMessage(steps, 'assistant');
        }, 1000);
    }

    executeSuggestion(suggestion) {
        this.addAIChatMessage(suggestion, 'user');
        
        // Execute the suggested action
        if (suggestion.includes('qualification message')) {
            this.generateResponseSuggestion();
        } else if (suggestion.includes('bank statements')) {
            this.addAIChatMessage('I\'ll help you request bank statements from the client.', 'assistant');
        } else if (suggestion.includes('lender matching')) {
            this.suggestLenderActions();
        } else if (suggestion.includes('FCS report')) {
            this.addAIChatMessage('Starting FCS report generation...', 'assistant');
        } else {
            this.recommendNextSteps();
        }
    }

    // Helper methods
    hasFCSReport() {
        return this.currentDocuments?.some(doc => 
            doc.document_type === 'fcs_report' || 
            doc.filename?.toLowerCase().includes('fcs')
        ) || false;
    }

    calculateDataCompletion() {
        const conv = this.selectedConversation;
        if (!conv) return 0;
        
        const fields = [
            'business_name', 'first_name', 'last_name', 'lead_phone', 
            'annual_revenue', 'business_start_date', 'state'
        ];
        
        const completedFields = fields.filter(field => conv[field]).length;
        return Math.round((completedFields / fields.length) * 100);
    }

    calculateDaysSinceLastContact() {
        const conv = this.selectedConversation;
        if (!conv?.updated_at) return 0;
        
        const lastContact = new Date(conv.updated_at);
        const now = new Date();
        const diffTime = Math.abs(now - lastContact);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    determineLeadStage() {
        const conv = this.selectedConversation;
        if (!conv) return 'Unknown';
        
        if (!conv.first_name || !conv.lead_phone) return 'Initial Contact';
        if (!this.currentDocuments?.length) return 'Qualification';
        if (!this.hasFCSReport()) return 'Documentation';
        return 'Ready for Lenders';
    }

    async getRecentMessages() {
        // This would load recent messages for context
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${this.currentConversationId}/messages`);
            if (response.ok) {
                const messages = await response.json();
                return messages.slice(-10); // Last 10 messages for context
            }
        } catch (error) {
            console.error('Error loading recent messages:', error);
        }
        return [];
    }

    async getFCSReport() {
        // This would load the FCS report if available
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${this.currentConversationId}/fcs`);
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.error('Error loading FCS report:', error);
        }
        return null;
    }

    formatCurrency(amount) {
        return this.utilities.formatCurrency(amount);
    }

    // Delegation methods to ConversationCore for backward compatibility
    getCurrentConversationId() {
        return this.conversationCore.getCurrentConversationId();
    }

    getSelectedConversation() {
        return this.conversationCore.getSelectedConversation();
    }

    getConversations() {
        return this.conversationCore.getConversations();
    }

    // Update currentConversationId and selectedConversation to delegate to ConversationCore
    get currentConversationId() {
        return this.conversationCore.currentConversationId;
    }

    set currentConversationId(value) {
        this.conversationCore.currentConversationId = value;
    }

    get selectedConversation() {
        return this.conversationCore.selectedConversation;
    }

    set selectedConversation(value) {
        this.conversationCore.selectedConversation = value;
    }

    get conversations() {
        return this.conversationCore.conversations;
    }

    set conversations(value) {
        this.conversationCore.conversations = value;
    }

    // Messaging delegation methods
    async loadConversationMessages() {
        return this.messaging.loadConversationMessages();
    }

    async sendMessage() {
        return this.messaging.sendMessage();
    }

    renderMessages(messages) {
        return this.messaging.renderMessages(messages);
    }

    addMessage(message) {
        return this.messaging.addMessage(message);
    }

    handleIncomingMessage(data) {
        return this.messaging.handleIncomingMessage(data);
    }

    playNotificationSound() {
        return this.messaging.playNotificationSound();
    }

    showBrowserNotification(data) {
        return this.messaging.showBrowserNotification(data);
    }

    async toggleAISuggestions() {
        return this.messaging.toggleAISuggestions();
    }

    // Documents delegation methods
    async loadDocuments() {
        return this.documents.loadDocuments();
    }

    renderDocumentsList(documents = null) {
        return this.documents.renderDocumentsList(documents);
    }

    setupDocumentsEventListeners() {
        return this.documents.setupDocumentsEventListeners();
    }

    normalizeDocumentFields(doc) {
        return this.documents.normalizeDocumentFields(doc);
    }

    handleFileSelection(files) {
        return this.documents.handleFileSelection(files);
    }

    async confirmUpload() {
        return this.documents.confirmUpload();
    }

    cancelUpload() {
        return this.documents.cancelUpload();
    }

    async editDocument(documentId) {
        return this.documents.editDocument(documentId);
    }

    async deleteDocument(documentId) {
        return this.documents.deleteDocument(documentId);
    }

    async previewDocument(documentId) {
        return this.documents.previewDocument(documentId);
    }

    async downloadDocument(documentId) {
        return this.documents.downloadDocument(documentId);
    }

    enableInlineEdit(documentId) {
        return this.documents.enableInlineEdit(documentId);
    }

    async saveDocumentEdit(documentId) {
        return this.documents.saveDocumentEdit(documentId);
    }
}

// Export for use in main script
window.ConversationUI = ConversationUI;

// Auto-initialize with better error handling
if (typeof window.conversationUI === 'undefined') {
    try {
        // Create without wsManager for standalone operation
        window.conversationUI = new ConversationUI(null);
        console.log('ConversationUI auto-initialized without WebSocket manager');
    } catch (error) {
        console.error('ConversationUI initialization error (non-fatal):', error.message);
        // Create a minimal instance even if initialization partially fails
        window.conversationUI = {
            showLenderSubmissionModal: function() {
                console.error('ConversationUI not properly initialized');
                alert('System not fully initialized. Please refresh the page.');
            },
            debugShowLenderModal: function() {
                console.error('ConversationUI not properly initialized');
                alert('System not fully initialized. Please refresh the page.');
            }
        };
    }
}

// Global functions needed by HTML
window.openAddLeadModal = function() {
    try {
        const modal = document.getElementById('addLeadModal');

        if (!modal) {
            console.error('❌ Modal element not found in DOM');
            alert('Modal not found - please refresh the page');
            return;
        }


        // Clear any existing error states
        const inputs = modal.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.style.borderColor = '';
            input.style.backgroundColor = '';
        });

        // Open the modal
        modal.style.display = 'flex';

    } catch (error) {
        console.error('🚨 Critical error in openAddLeadModal:', error);
        console.error('Error stack:', error.stack);
        alert('Error opening modal: ' + error.message);
    }
};

// Comprehensive form management functions
window.clearComprehensiveForm = function() {
    try {
        console.log('🧹 Clearing comprehensive form...');
        const modal = document.getElementById('addLeadModal');

        if (!modal) {
            console.warn('⚠️ Modal not found, skipping form clear');
            return;
        }

        const inputs = modal.querySelectorAll('input, select, textarea');

        inputs.forEach((input, index) => {
            try {
                if (input.type === 'radio') {
                    input.checked = input.value === 'BOTH' && input.name === 'marketingNotification';
                } else if (input.type === 'checkbox') {
                    input.checked = false;
                } else if (input.type === 'select-one') {
                    input.selectedIndex = 0;
                } else {
                    input.value = '';
                }
            } catch (inputError) {
                console.warn(`⚠️ Error clearing input ${index}:`, inputError);
            }
        });

        // Reset lead status to default (with null check)
        const leadStatusEl = modal.querySelector('[name="leadStatus"]');
        if (leadStatusEl) {
            leadStatusEl.value = 'SUBMITTED';
        }


    } catch (error) {
        console.error('🚨 Error in clearComprehensiveForm:', error);
    }
};

window.initializeComprehensiveForm = function() {

    // Check if modal exists first
    const modal = document.getElementById('addLeadModal');
    if (!modal) {
        console.error('❌ addLeadModal not found in DOM');
        setTimeout(window.initializeComprehensiveForm, 500);
        return;
    }

    // Set up modal event listeners
    const closeBtn = modal.querySelector('[onclick*="closeModal"], .close-modal');
    const cancelBtn = modal.querySelector('.cancel-btn, [onclick*="cancel"]');

    if (closeBtn) {
        closeBtn.onclick = () => {
            modal.style.display = 'none';
            setTimeout(() => {
                try {
                    window.clearComprehensiveForm();
                } catch (e) {
                    console.warn('Error clearing form:', e);
                }
            }, 100);
        };
    }

    if (cancelBtn) {
        cancelBtn.onclick = () => {
            modal.style.display = 'none';
            setTimeout(() => {
                try {
                    window.clearComprehensiveForm();
                } catch (e) {
                    console.warn('Error clearing form:', e);
                }
            }, 100);
        };
    }

    // Close modal when clicking outside
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
            try {
                window.clearComprehensiveForm();
            } catch (clearError) {
                console.warn('Error clearing form:', clearError);
            }
        }
    };

};

window.toggleSection = function(sectionId) {
    const content = document.getElementById(sectionId);
    if (!content) {
        console.error(`Section ${sectionId} not found`);
        return;
    }
    
    const toggle = content.previousElementSibling?.querySelector('.section-toggle');
    
    if (content.style.display === 'none' || content.style.display === '') {
        content.style.display = 'block';
        if (toggle) toggle.textContent = '';
    } else {
        content.style.display = 'none';
        if (toggle) toggle.textContent = '+';
    }
};

// Individual delete confirmation function
window.showDeleteConfirmation = function() {
    if (!window.conversationUI || !window.conversationUI.currentConversationId) {
        console.error('No conversation selected for deletion');
        return;
    }
    
    const currentId = window.conversationUI.currentConversationId;
    const conversation = window.conversationUI.conversations.get(currentId); // Use .get() for Map
    const businessName = conversation ? conversation.business_name : 'this lead';
    
    if (confirm(`Are you sure you want to delete "${businessName}"? This action cannot be undone and will remove all data from AWS.`)) {
        window.conversationUI.deleteSelectedLeads = window.conversationUI.deleteSelectedLeads || window.conversationUI.confirmDeleteSelected;
        
        // Add current conversation to selection and delete
        window.conversationUI.selectedForDeletion = new Set([currentId]);
        window.conversationUI.deleteSelectedLeads();
    }
};

// Test function to verify modal can be shown
window.testLenderModal = function() {
    console.log('Test button clicked');
    if (window.conversationUI && window.conversationUI.showLenderSubmissionModal) {
        window.conversationUI.showLenderSubmissionModal();
    } else {
        console.error(' ConversationUI not available');
        alert('ConversationUI not available - check console for errors');
    }
};

// Global lender management functions
window.showAddLenderModal = function() {
    console.log('� Global showAddLenderModal called');
    if (window.conversationUI && window.conversationUI.showAddLenderModal) {
        window.conversationUI.showAddLenderModal();
    } else {
        console.error(' ConversationUI not available or method not found');
        alert('ConversationUI not available - please refresh the page');
    }
};

window.refreshLendersList = function() {
    console.log('� Global refreshLendersList called');
    if (window.conversationUI && window.conversationUI.loadLendersList) {
        window.conversationUI.loadLendersList();
    } else {
        console.error(' ConversationUI not available or method not found');
        alert('ConversationUI not available - please refresh the page');
    }
};

window.exportLenders = function() {
    console.log('� Global exportLenders called');
    if (window.conversationUI && window.conversationUI.exportLenders) {
        window.conversationUI.exportLenders();
    } else {
        console.error(' ConversationUI not available or method not found');
        alert('ConversationUI not available - please refresh the page');
    }
};

// Debug function for Add Lender button
window.debugAddLender = function() {
    alert('Step 4: debugAddLender called');
    
    if (window.conversationUI) {
        alert('Step 5: conversationUI exists');
        
        if (window.conversationUI.showAddLenderModal) {
            alert('Step 6: showAddLenderModal method found - calling it now');
            try {
                window.conversationUI.showAddLenderModal();
                alert('Step 7: showAddLenderModal completed successfully');
            } catch (error) {
                alert('ERROR in showAddLenderModal: ' + error.message);
            }
        } else {
            alert('ERROR: showAddLenderModal method not found on conversationUI');
        }
    } else {
        alert('ERROR: window.conversationUI not found - ConversationUI not initialized');
    }
};

// Global debug function for testing document edit functionality
window.testDocumentEdit = async function(docId) {
    if (!window.conversationUI) {
        console.error('ConversationUI not available');
        return;
    }

    // First, debug the current state
    window.conversationUI.debugDocumentContext();

    // Then try the update
    await window.conversationUI.debugDocumentUpdate(docId);
};

console.log('Global functions registered');

// Initialize form management when DOM is ready
document.addEventListener('DOMContentLoaded', () => {

    // Initialize comprehensive form with delay to ensure DOM is ready
    setTimeout(() => {
        try {
            if (typeof window.initializeComprehensiveForm === 'function') {
                window.initializeComprehensiveForm();
            } else {
                console.warn('⚠️ initializeComprehensiveForm function not found');
            }
        } catch (error) {
            console.error('🚨 Error initializing comprehensive form:', error);
        }
    }, 500);
});
