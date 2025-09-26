// intelligence-tabs.js - Complete intelligence panel tab management

export default class IntelligenceTabs {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = parent.apiBaseUrl;
        this.utils = parent.utils;
        this.templates = parent.templates;

        // Cache for AI chat content per conversation
        this.aiChatCache = new Map();

        this.init();
    }

    init() {
        this.setupIntelligenceTabs();
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

    async loadConversationIntelligence(conversationId = null) {
        // Use passed conversationId or fall back to parent's current
        const convId = conversationId || this.parent.getCurrentConversationId() || this.parent.currentConversationId;

        if (!convId) {
            console.error('No conversation ID available for loading intelligence');
            return;
        }

        try {
            console.log(`Loading intelligence for conversation: ${convId}`);
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${convId}`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            const conversationData = data.conversation || data;

            console.log(`Loaded intelligence data for: ${conversationData.business_name || 'Unknown'}`);

            // Update parent's selected conversation with fresh data
            if (this.parent) {
                this.parent.selectedConversation = conversationData;
                this.parent.currentConversationId = convId;

                // Also update core's references if available
                if (this.parent.core) {
                    this.parent.core.selectedConversation = conversationData;
                    this.parent.core.currentConversationId = convId;
                    this.parent.core.conversations.set(convId, conversationData);
                }
            }

            // Now render with the fresh data
            this.renderIntelligenceData(data);
        } catch (error) {
            console.error('Error loading intelligence data:', error);
            this.utils.showNotification(`Failed to load conversation details: ${error.message}`, 'error');

            const intelligenceContent = document.getElementById('intelligenceContent');
            if (intelligenceContent) {
                intelligenceContent.innerHTML = `
                    <div class="error-state">
                        <div class="error-icon">⚠️</div>
                        <h3>Conversation Details Failed to Load</h3>
                        <p>${error.message}</p>
                        <button onclick="window.conversationUI.intelligence.loadConversationIntelligence('${convId}')" class="retry-btn">
                            Retry
                        </button>
                    </div>
                `;
            }
        }
    }

    renderIntelligenceData(data) {
        const conversationData = data.conversation || data;

        // Ensure we have the conversation ID
        const convId = conversationData.id || this.parent.getCurrentConversationId() || this.parent.currentConversationId;

        // Update all references with fresh data
        if (this.parent) {
            this.parent.selectedConversation = conversationData;
            this.parent.currentConversationId = convId;

            if (this.parent.core) {
                this.parent.core.selectedConversation = conversationData;
                this.parent.core.currentConversationId = convId;
                this.parent.core.conversations.set(convId, conversationData);

                // Update the conversation header with fresh data
                this.parent.core.showConversationDetails();
            }
        }

        // Preserve current tab or default to AI assistant tab
        const currentActiveTab = document.querySelector('.tab-btn.active');
        const currentTab = currentActiveTab?.dataset.tab || 'ai-assistant';
        console.log(`Rendering intelligence tab: ${currentTab} for conversation: ${convId}`);

        this.switchIntelligenceTab(currentTab);
    }

    switchIntelligenceTab(tab) {
        // Sync context before switching
        if (this.parent.core) {
            this.parent.core.syncConversationContext();
        }

        // Cache AI chat content before switching away from ai-assistant tab
        const currentActiveTab = document.querySelector('.tab-btn.active');
        if (currentActiveTab && currentActiveTab.dataset.tab === 'ai-assistant' && tab !== 'ai-assistant') {
            console.log(`🔄 Switching from AI Assistant to ${tab} - saving state`);
            this.saveAIChatState();
        }

        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        const content = document.getElementById('intelligenceContent');
        const conversation = this.parent.getSelectedConversation();

        if (!content || !conversation) {
            return;
        }

        console.log(`Rendering tab: ${tab}`);
        switch (tab) {
            case 'ai-assistant':
                this.renderAIAssistantTab(content);
                break;
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
                setTimeout(() => this.parent.lenders?.restoreLenderFormCacheIfNeeded(), 500);
                break;
            case 'lender-management':
                this.renderLenderManagementTab(content);
                break;
            default:
                console.log(`Unknown tab: ${tab}, falling back to AI Assistant`);
                this.renderAIAssistantTab(content);
                break;
        }
        console.log(`switchIntelligenceTab(${tab}) completed`);
    }

    renderOverviewTab(content) {
        const conversation = this.parent.getSelectedConversation();
        content.innerHTML = this.templates.overviewTab(conversation);

        // AI chat initialization is handled in AI Assistant tab
    }

    renderAIAssistantTab(content) {
        const conversation = this.parent.getSelectedConversation();
        if (!conversation) {
            content.innerHTML = '<div class="empty-state">No conversation selected</div>';
            return;
        }

        const conversationId = this.parent.getCurrentConversationId();
        console.log(`Rendering AI Assistant tab for conversation: ${conversationId}`);

        // Check if we have cached content for this conversation
        if (this.aiChatCache.has(conversationId)) {
            const cachedContent = this.aiChatCache.get(conversationId);
            console.log(`🔄 Found cache for conversation: ${conversationId} (${cachedContent.messageCount} messages, ${Math.round((Date.now() - cachedContent.timestamp) / 1000)}s ago)`);

            // Check if current content is different from cached content
            const currentAISection = content.querySelector('.ai-assistant-section');
            const shouldRestore = !currentAISection ||
                                currentAISection.dataset.conversationId !== conversationId ||
                                content.innerHTML !== cachedContent.html;

            if (shouldRestore) {
                console.log('📋 Restoring AI chat from cache');
                content.innerHTML = cachedContent.html;

                // Restore event handlers with better timing
                setTimeout(() => {
                    if (this.parent.ai) {
                        this.parent.ai.setupEventHandlers();
                        this.parent.ai.currentConversationId = conversationId;
                        this.parent.ai.isInitialized = true;
                        console.log('✅ AI chat restored and handlers setup');
                    }
                }, 50);
                return;
            } else {
                console.log('✨ AI assistant already properly rendered');
                return;
            }
        }

        // Create full-screen AI assistant interface
        content.innerHTML = `
            <div class="ai-assistant-section" data-conversation-id="${conversationId}" style="height: calc(100vh - 200px); display: flex; flex-direction: column;">
                <div class="ai-chat-interface" style="height: 100%; display: flex; flex-direction: column; background: #f9fafb; border-radius: 8px; max-height: 100%;">
                    <div class="ai-chat-header" style="padding: 12px 16px; background: transparent; border-bottom: 1px solid #e5e7eb;">
                        <div style="display: flex; align-items: center; justify-content: center;">
                            <span style="font-weight: 600; color: #374151; font-size: 15px;">Chat about ${conversation.business_name || 'this project'}</span>
                        </div>
                    </div>
                    <div class="ai-chat-messages" id="aiChatMessages" style="flex: 1; overflow-y: auto; padding: 24px; background: transparent; min-height: 0;">
                        <div class="ai-loading-state" style="text-align: center; padding: 20px; color: #9ca3af;">
                            <div class="typing-dot" style="display: inline-block; width: 8px; height: 8px; background: #9ca3af; border-radius: 50%; animation: typing 1.4s infinite; margin: 0 2px;"></div>
                            <div class="typing-dot" style="display: inline-block; width: 8px; height: 8px; background: #9ca3af; border-radius: 50%; animation: typing 1.4s infinite; animation-delay: 0.2s; margin: 0 2px;"></div>
                            <div class="typing-dot" style="display: inline-block; width: 8px; height: 8px; background: #9ca3af; border-radius: 50%; animation: typing 1.4s infinite; animation-delay: 0.4s; margin: 0 2px;"></div>
                        </div>
                    </div>

                    <div class="ai-chat-input-area" style="padding: 20px; background: white; border-radius: 0 0 8px 8px; flex-shrink: 0; border-top: 1px solid #e5e7eb;">
                        <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
                            <button onclick="console.log('Test button clicked'); window.conversationUI?.ai?.askQuestion('What should I do next?');"
                                    style="padding: 8px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; font-size: 13px; color: #475569; transition: all 0.2s; font-weight: 500;">
                                What's next?
                            </button>
                            <button onclick="window.conversationUI.ai.askQuestion('Analyze this lead')"
                                    style="padding: 8px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; font-size: 13px; color: #475569; transition: all 0.2s; font-weight: 500;">
                                Analyze
                            </button>
                            <button onclick="window.conversationUI.ai.askQuestion('Generate follow-up message')"
                                    style="padding: 8px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; font-size: 13px; color: #475569; transition: all 0.2s; font-weight: 500;">
                                Follow-up
                            </button>
                            <button onclick="window.conversationUI.ai.askQuestion('What documents do I need?')"
                                    style="padding: 8px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; font-size: 13px; color: #475569; transition: all 0.2s; font-weight: 500;">
                                Documents
                            </button>
                        </div>
                        <div style="display: flex; gap: 12px; align-items: flex-end;">
                            <textarea
                                id="aiChatInput"
                                placeholder="Type your message..."
                                rows="1"
                                style="flex: 1; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; resize: none; font-family: inherit; font-size: 14px;"
                            ></textarea>
                            <button
                                id="aiChatSend"
                                onclick="window.conversationUI?.ai?.sendAIMessage(); console.log('Direct onclick called');"
                                style="padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                                Send
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Initialize AI chat functionality
        setTimeout(() => {
            if (this.parent.ai) {
                this.parent.ai.initializeAIChat();
                // Cache the initial state after initialization
                setTimeout(() => this.saveAIChatState(), 200);
            }
        }, 100);
    }

    renderDocumentsTab(content) {
        if (this.parent.documents) {
            content.innerHTML = this.parent.documents.createDocumentsTabTemplate();
            this.parent.documents.loadDocuments();
            this.parent.documents.setupDocumentsEventListeners();
        }
    }

    renderEditTab(content) {
        const conversation = this.parent.getSelectedConversation();
        if (!conversation) {
            content.innerHTML = '<div class="empty-state">No conversation selected</div>';
            return;
        }

        // Simple button to open the modal instead of inline form
        content.innerHTML = `
            <div style="padding: 40px; text-align: center;">
                <h3 style="margin-bottom: 20px;">Edit Lead Information</h3>
                <p style="margin-bottom: 30px; color: #6b7280;">
                    Update business details, financial information, and owner data for<br>
                    <strong>${conversation.business_name || 'this lead'}</strong>
                </p>
                <button id="openEditModalBtn" class="btn btn-primary" style="padding: 12px 30px; font-size: 16px;">
                    <i class="fas fa-edit"></i> Edit Lead Details
                </button>
            </div>
        `;

        // Set up the button to open modal
        const openBtn = content.querySelector('#openEditModalBtn');
        if (openBtn) {
            openBtn.addEventListener('click', () => this.openEditModal());
        }
    }

    openEditModal() {
        const conversation = this.parent.getSelectedConversation();
        if (!conversation) return;

        const modal = document.getElementById('editLeadInlineModal');
        const modalContent = document.getElementById('editLeadInlineContent');

        // Insert the form into the modal
        modalContent.innerHTML = this.createEditFormTemplate(conversation);

        // Show the modal
        modal.style.display = 'flex';

        // Set up form handlers
        const form = modalContent.querySelector('#editLeadForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleEditFormSubmit(e));
        }

        // Set up Generate Application button
        this.setupGenerateApplicationButton(modalContent);

        // Set up close button
        const closeBtn = document.getElementById('closeEditLeadInlineModal');
        if (closeBtn) {
            closeBtn.onclick = () => {
                modal.style.display = 'none';
            };
        }

        // Close on outside click
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        };
    }

    renderFCSTab(content) {
        console.log('renderFCSTab called');
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

        // Load FCS data if FCS module is available
        if (this.parent.fcs) {
            this.parent.fcs.loadFCSData();
        }
    }

    renderLendersTab(content) {
        const conversation = this.parent.getSelectedConversation();
        if (!conversation) {
            content.innerHTML = '<div class="empty-state">No conversation selected</div>';
            return;
        }

        if (!this.parent.lenders) {
            content.innerHTML = '<div class="empty-state">Lenders module not available</div>';
            return;
        }

        // Simple button to open the modal instead of inline form
        content.innerHTML = `
            <div style="padding: 40px; text-align: center;">
                <h3 style="margin-bottom: 20px;">Lender Qualification & Submission</h3>
                <p style="margin-bottom: 30px; color: #6b7280;">
                    Qualify and submit <strong>${conversation.business_name || 'this lead'}</strong><br>
                    to matching lenders based on business profile and financing needs
                </p>
                <button id="openLendersModalBtn" class="btn btn-primary" style="padding: 12px 30px; font-size: 16px;">
                    <i class="fas fa-university"></i> Open Lender Tools
                </button>
            </div>
        `;

        // Set up the button to open modal
        const openBtn = content.querySelector('#openLendersModalBtn');
        if (openBtn) {
            openBtn.addEventListener('click', () => this.openLendersModal());
        }
    }

    openLendersModal() {
        const conversation = this.parent.getSelectedConversation();
        if (!conversation || !this.parent.lenders) return;

        const modal = document.getElementById('lendersInlineModal');
        const modalContent = document.getElementById('lendersInlineContent');

        // Insert the lender form into the modal
        modalContent.innerHTML = this.parent.lenders.createLenderFormTemplate(conversation);

        // Show the modal
        modal.style.display = 'flex';

        // Initialize all the lender form functionality (preserving all original logic)
        this.parent.lenders.initializeLenderForm();
        setTimeout(() => this.parent.lenders.populateLenderForm(), 100);
        setTimeout(() => this.parent.lenders.restoreLenderFormCacheIfNeeded(), 200);

        // Check for cached results and restore them
        const conversationId = this.parent.getCurrentConversationId();
        if (conversationId && this.parent.lenders.lenderResultsCache) {
            const cached = this.parent.lenders.lenderResultsCache.get(conversationId);
            if (cached) {
                const resultsEl = modalContent.querySelector('#lenderResults');
                if (resultsEl) {
                    resultsEl.innerHTML = cached.html;
                    resultsEl.classList.add('active');
                }

                if (cached.data && cached.data.qualified) {
                    this.parent.lenders.qualifiedLenders = cached.data.qualified;
                    this.parent.lenders.lastLenderCriteria = cached.criteria;
                }
            } else {
                this.parent.lenders.loadLenderData();
            }
        }

        // Set up close button
        const closeBtn = document.getElementById('closeLendersInlineModal');
        if (closeBtn) {
            closeBtn.onclick = () => {
                modal.style.display = 'none';
            };
        }

        // Close on outside click
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        };
    }

    renderLenderManagementTab(content) {
        if (this.parent.lenders) {
            content.innerHTML = this.parent.lenders.createLenderManagementTemplate();
            this.parent.lenders.loadLendersList();
        }
    }

    createEditFormTemplate(conversation) {
        const conv = conversation;
        const leadDetails = conv.lead_details || {};
        const usStates = this.utils.getUSStates();

        // Helper function to determine if a value is a conversation state or a US state
        const isConversationState = (value) => {
            const conversationStates = ['NEW', 'INTERESTED', 'FCS_RUNNING', 'COLLECTING_INFO', 'QUALIFIED', 'OFFER_SENT', 'NEGOTIATING', 'ACCEPTED', 'DECLINED', 'PAUSED'];
            return conversationStates.includes(value);
        };

        // Get the actual US state value
        const getBusinessState = () => {
            if (conv.business_state) return conv.business_state;
            if (conv.state && !isConversationState(conv.state)) return conv.state;
            if (leadDetails.state && !isConversationState(leadDetails.state)) return leadDetails.state;
            return '';
        };

        const currentBusinessState = getBusinessState();

        return `
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
                                        <option value="${state.value}" ${state.value === currentBusinessState ? 'selected' : ''}>
                                            ${state.label}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="form-row-six">
                            <div class="form-group">
                                <label>ZIP Code</label>
                                <input type="text" name="businessZip" value="${conv.business_zip || conv.zip || ''}"
                                       class="form-input" maxlength="10" placeholder="12345"
                                       onblur="window.conversationUI.utils.lookupZipCode(this.value, 'business')"
                                       onkeyup="if(this.value.replace(/\\D/g, '').length === 5) window.conversationUI.utils.lookupZipCode(this.value, 'business')">
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
                                <input type="date" name="businessStartDate" value="${this.utils.formatDate(leadDetails.business_start_date || conv.business_start_date, 'input')}" class="form-input">
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
                        ${this.createAdditionalBusinessFields(conv, leadDetails)}
                    </div>

                    ${this.createFinancialSection(conv, leadDetails)}
                    ${this.createOwnerSection(conv, leadDetails)}

                    <div class="form-actions" style="display: flex; gap: 16px; justify-content: center; margin-top: 30px; padding: 20px;">
                        <button type="button" class="generate-pdf-btn" id="generateApplicationBtn"
                                style="padding: 12px 24px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer;">
                            Generate Application
                        </button>
                        <button type="submit" class="update-btn"
                                style="padding: 12px 24px; background: #10b981; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer;">
                            Update Lead
                        </button>
                    </div>
                </form>
            </div>
        `;
    }

    createAdditionalBusinessFields(conv, leadDetails) {
        return `
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
        `;
    }

    createFinancialSection(conv, leadDetails) {
        return `
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
                        <input type="date" name="fundingDate" value="${this.utils.formatDate(leadDetails.funding_date, 'input')}" class="form-input">
                    </div>
                </div>
            </div>
        `;
    }

    createOwnerSection(conv, leadDetails) {
        const usStates = this.utils.getUSStates();

        return `
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
                                `<option value="${state.value}" ${conv.owner_home_state === state.value ? 'selected' : ''}>${state.label}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Owner ZIP</label>
                        <input type="text" name="ownerHomeZip" value="${conv.owner_home_zip || ''}"
                               class="form-input" maxlength="10" placeholder="12345"
                               onblur="window.conversationUI.utils.lookupZipCode(this.value, 'ownerHome')"
                               onkeyup="if(this.value.replace(/\\D/g, '').length === 5) window.conversationUI.utils.lookupZipCode(this.value, 'ownerHome')">
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
                        <input type="date" name="ownerDOB" value="${this.utils.formatDate(leadDetails.date_of_birth || conv.date_of_birth || conv.owner_dob || conv.owner_date_of_birth, 'input')}" class="form-input">
                    </div>
                </div>
            </div>
        `;
    }

    async handleEditFormSubmit(e) {
        e.preventDefault();

        const formData = new FormData(e.target);
        const rawData = Object.fromEntries(formData.entries());

        console.log('Raw form data being saved:', rawData);

        const updateData = {};

        // Process all fields with minimal transformation
        for (const [field, value] of Object.entries(rawData)) {
            // Convert field names from camelCase to snake_case
            const snakeCase = field.replace(/([A-Z])/g, '_$1').toLowerCase();

            // Handle numeric fields
            if (['annual_revenue', 'monthly_revenue', 'requested_amount', 'credit_score',
                 'years_in_business', 'factor_rate', 'term_months', 'ownership_percent'].includes(snakeCase)) {
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

        console.log('Update data being sent:', updateData);

        const conversationId = this.parent.getCurrentConversationId();

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${conversationId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });

            const responseText = await response.text();
            console.log('Server response:', responseText);

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
                this.utils.showNotification('Lead data updated successfully', 'success');

                // Close the modal
                const modal = document.getElementById('editLeadInlineModal');
                if (modal) {
                    modal.style.display = 'none';
                }

                // Update local conversation object
                const selectedConversation = this.parent.getSelectedConversation();
                if (selectedConversation) {
                    for (const [formField, value] of Object.entries(rawData)) {
                        selectedConversation[formField] = value;
                        const snakeCaseField = formField.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                        selectedConversation[snakeCaseField] = value;
                    }

                    // Update the conversations map
                    if (this.parent.core) {
                        this.parent.core.conversations.set(conversationId, selectedConversation);
                        this.parent.core.showConversationDetails();
                    }
                }
            } else {
                throw new Error(result.error || result.message || 'Update failed');
            }

        } catch (error) {
            console.error('Error saving lead data:', error);
            this.utils.showNotification('Failed to save: ' + error.message, 'error');
        }
    }

    setupGenerateApplicationButton(content) {
        console.log('Looking for Generate Application button in DOM...');

        const generateAppBtn = content.querySelector('#generateApplicationBtn');
        console.log('Generate App Button:', generateAppBtn);

        if (generateAppBtn) {
            console.log('Attaching event listener to Generate App button');
            generateAppBtn.addEventListener('click', (event) => {
                console.log('Generate Application button clicked!', event);
                event.preventDefault();
                event.stopPropagation();
                this.generatePDFApplication();
            });
        } else {
            console.error('Generate Application button not found');
        }
    }

    async generatePDFApplication() {
        console.log('Generate PDF clicked - Client-side generation');

        const selectedConversation = this.parent.getSelectedConversation();
        if (!selectedConversation) {
            this.utils.showNotification('No conversation selected', 'error');
            return;
        }

        try {
            this.utils.showNotification('Generating Working Capital Application...', 'info');

            const conv = selectedConversation;

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
                dateBusinessStarted: this.utils.formatDate(conv.business_start_date, 'display'),
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
                ownerDOB: this.utils.formatDate(conv.date_of_birth, 'display'),
                ownerCellPhone: conv.cell_phone || '',
                yearsInBusiness: conv.years_in_business || '',
                signatureDate: new Date().toLocaleDateString()
            };

            const ownerName = `${applicationData.ownerFirstName} ${applicationData.ownerLastName}`.trim() || 'Authorized Signatory';

            console.log('Requesting HTML template from server...');

            // Get HTML template from backend
            const templateResponse = await fetch(`${this.apiBaseUrl}/api/conversations/${conv.id}/generate-html-template`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    applicationData: applicationData,
                    ownerName: ownerName
                })
            });

            if (!templateResponse.ok) {
                throw new Error('Failed to get HTML template');
            }

            const htmlContent = await templateResponse.text();

            console.log('Received HTML template from server');

            // Create an iframe for better CSS isolation and rendering
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.left = '-10000px';
            iframe.style.top = '0';
            iframe.style.width = '940px';
            iframe.style.height = '1200px';
            iframe.style.border = 'none';
            document.body.appendChild(iframe);

            // Write the HTML to iframe
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            iframeDoc.open();
            iframeDoc.write(htmlContent);
            iframeDoc.close();

            // Add CSS to fix text positioning in input fields
            const style = iframeDoc.createElement('style');
            style.textContent = `
                /* Override any height constraints from app5.html */
                input[type="text"],
                input[type="email"],
                input[type="tel"],
                input[type="number"],
                input[type="date"],
                input[type="url"] {
                    padding: 2px 4px !important;
                    line-height: 1.2 !important;
                    height: 24px !important;
                    min-height: 24px !important;
                    max-height: none !important;
                    vertical-align: middle !important;
                    overflow: visible !important;
                }

                /* Ensure form fields don't clip content */
                .form-field {
                    overflow: visible !important;
                    height: auto !important;
                    min-height: 26px !important;
                }

                .form-field input {
                    margin-top: -5px !important;
                }

                /* Override any clipping from parent containers */
                .form-row {
                    overflow: visible !important;
                }
            `;
            iframeDoc.head.appendChild(style);

            // Wait for rendering
            await new Promise(resolve => setTimeout(resolve, 500));

            console.log('Converting to PDF with html2canvas...');
            this.utils.showNotification('Converting to PDF...', 'info');

            // Capture with html2canvas - use the existing styling from app5.html
            const canvas = await html2canvas(iframeDoc.body, {
                scale: 2,  // High quality
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false,
                width: 940,
                height: iframeDoc.body.scrollHeight,
                onclone: (clonedDoc) => {
                    // Additional fix in the cloned document
                    const inputs = clonedDoc.querySelectorAll('input');
                    inputs.forEach(input => {
                        if (input.value) {
                            // Adjust the input styling to ensure text is visible
                            input.style.lineHeight = 'normal';
                            input.style.paddingTop = '0';
                            input.style.paddingBottom = '0';
                            input.style.height = 'auto';
                            input.style.overflow = 'visible';
                        }
                    });
                }
            });

            // Remove iframe
            document.body.removeChild(iframe);

            // Create PDF
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
                compress: true
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const imgWidth = 210;
            const pageHeight = 297;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            const filename = `WCA_${conv.business_name || 'Application'}_${new Date().toISOString().split('T')[0]}.pdf`;
            const pdfBase64 = pdf.output('datauristring').split(',')[1];

            console.log('Saving to AWS...');
            this.utils.showNotification('Saving PDF to documents...', 'info');

            // Save to AWS server
            const saveResponse = await fetch(`${this.apiBaseUrl}/api/conversations/${conv.id}/save-generated-pdf`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    conversationId: conv.id,
                    pdfBase64: pdfBase64,
                    filename: filename,
                    documentId: crypto.randomUUID()
                })
            });

            const saveResult = await saveResponse.json();

            if (saveResult.success) {
                this.utils.showNotification('PDF generated and saved to AWS successfully!', 'success');

                // Refresh documents
                if (this.parent.documents) {
                    await this.parent.documents.loadDocuments();
                }

                // Switch to documents tab
                const documentsTab = document.querySelector('[data-tab="documents"]');
                if (documentsTab) {
                    documentsTab.click();
                }
            } else {
                throw new Error(saveResult.error || 'Failed to save PDF to AWS');
            }

        } catch (error) {
            console.error('Error generating PDF:', error);
            this.utils.showNotification('Failed to generate PDF: ' + error.message, 'error');
        }
    }

    saveAIChatState() {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) {
            console.log('❌ No conversation ID for saving AI chat state');
            return;
        }

        const content = document.getElementById('intelligenceContent');
        const aiSection = content?.querySelector('.ai-assistant-section');

        if (aiSection) {
            // Only save if there are actual messages (not just welcome message)
            const messagesContainer = aiSection.querySelector('#aiChatMessages');
            const messages = messagesContainer?.querySelectorAll('.ai-chat-message');

            console.log(`💾 Saving AI chat state for conversation: ${conversationId} (${messages?.length || 0} messages)`);
            this.aiChatCache.set(conversationId, {
                html: content.innerHTML,
                timestamp: Date.now(),
                messageCount: messages?.length || 0
            });
        } else {
            console.log('⚠️ No AI section found to save');
        }
    }

    clearAIChatCache(conversationId = null) {
        if (conversationId) {
            this.aiChatCache.delete(conversationId);
            console.log('Cleared AI chat cache for conversation:', conversationId);
        } else {
            this.aiChatCache.clear();
            console.log('Cleared all AI chat cache');
        }
    }
}