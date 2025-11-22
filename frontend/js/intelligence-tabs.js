// intelligence-tabs.js - Complete intelligence panel tab management
import { LeadFormsTab } from './intelligence-tabs/lead-forms.js';

class IntelligenceTabs {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = parent.apiBaseUrl;
        this.utils = parent.utils;
        this.templates = parent.templates;

        // Cache for AI chat content per conversation
        this.aiChatCache = new Map();

        // Initialize sub-tab modules
        this.leadFormsTab = new LeadFormsTab(parent);

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
            const data = await this.parent.apiCall(`/api/conversations/${convId}`);
            const conversationData = data.conversation || data;

            console.log(`Loaded intelligence data for: ${conversationData.business_name || 'Unknown'}`);

            // Update parent's selected conversation with fresh data
            if (this.parent) {
                this.parent.selectedConversation = conversationData;
                this.parent.currentConversationId = convId;

                // Also update conversationUI's references if available
                if (this.parent.conversationUI) {
                    this.parent.conversationUI.selectedConversation = conversationData;
                    this.parent.conversationUI.currentConversationId = convId;
                    this.parent.conversationUI.conversations.set(convId, conversationData);
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

            if (this.parent.conversationUI) {
                this.parent.conversationUI.selectedConversation = conversationData;
                this.parent.conversationUI.currentConversationId = convId;
                this.parent.conversationUI.conversations.set(convId, conversationData);

                // Update the conversation header with fresh data
                this.parent.conversationUI.showConversationDetails();
            }
        }

        // Preserve current tab or default to AI assistant tab
        const currentActiveTab = document.querySelector('.tab-btn.active');
        const currentTab = currentActiveTab?.dataset.tab || 'ai-assistant';
        console.log(`Rendering intelligence tab: ${currentTab} for conversation: ${convId}`);

        this.switchIntelligenceTab(currentTab);
    }

    async switchIntelligenceTab(tab) {
        console.log(`Switching to tab: ${tab}`);

        // Sync context before switching
        if (this.parent.conversationUI) {
            this.parent.conversationUI.syncConversationContext();
        }

        // Cache AI chat content before switching away from ai-assistant tab
        const currentActiveTab = document.querySelector('.tab-btn.active');
        if (currentActiveTab && currentActiveTab.dataset.tab === 'ai-assistant' && tab !== 'ai-assistant') {
            console.log(`🔄 Switching from AI Assistant to ${tab} - saving state`);
            this.saveAIChatState();
        }

        // Update tab buttons FIRST before anything else
        const tabButtons = document.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            if (btn.dataset.tab === tab) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        const content = document.getElementById('intelligenceContent');
        const conversation = this.parent.getSelectedConversation();

        if (!content || !conversation) {
            return;
        }

        // OPTIONAL: Disable cache deletion for instant tab switching
        // Previously this forced a reload every time, causing loading spinner.
        // Now the AI tab loads instantly from cache and only refreshes if needed.
        /*
        if (tab === 'ai-assistant') {
            console.log('Returning to AI Assistant tab, forcing fresh reload...');
            const convId = this.parent.getCurrentConversationId();

            if (convId) {
                // Clear the cache for this conversation to force fresh reload
                if (this.aiChatCache && this.aiChatCache.has(convId)) {
                    this.aiChatCache.delete(convId);
                    console.log('Cache cleared for conversation:', convId);
                }
            }
        }
        */

        console.log(`Rendering tab: ${tab}`);
        switch (tab) {
            case 'ai-assistant':
                this.renderAIAssistantTab(content);
                break;
            case 'overview':
                this.renderOverviewTab(content);
                break;
            case 'documents':
                await this.renderDocumentsTab(content);
                break;
            case 'edit':
                this.renderEditTab(content);
                break;
            case 'fcs':
                this.renderFCSTab(content);
                break;
            case 'lenders':
                this.renderLendersTab(content);
                setTimeout(() => {
                    this.parent.lenders?.restoreLenderFormCacheIfNeeded();

                    // Check if we have cached lender results and restore them
                    const conversationId = this.parent.getCurrentConversationId();
                    if (conversationId && this.parent.lenders?.lenderResultsCache.has(conversationId)) {
                        const cached = this.parent.lenders.lenderResultsCache.get(conversationId);

                        // Restore the cached results
                        const resultsEl = document.getElementById('lenderResults');
                        if (resultsEl && cached.html) {
                            console.log('Restoring cached lender results for conversation:', conversationId);
                            resultsEl.innerHTML = cached.html;
                            resultsEl.classList.add('active');

                            // Reattach event listeners for the restored content
                            this.parent.lenders.reattachResultsEventListeners(cached.data, cached.criteria);
                        }
                    }
                }, 500);
                break;
            case 'lender-management':
                this.renderLenderManagementTab(content);
                break;
            case 'email':
                this.renderEmailTab(content);
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

                // Check if messages are still in loading state
                const messagesDiv = content.querySelector('#aiChatMessages');
                const hasLoadingState = messagesDiv && messagesDiv.querySelector('.ai-loading-state');

                if (hasLoadingState) {
                    console.log('⚠️ Cached content still has loading state, forcing refresh');
                    // Force re-initialize to load actual messages
                    setTimeout(() => {
                        if (this.parent.ai) {
                            this.parent.ai.initializeAIChat();
                        }
                    }, 100);
                } else {
                    // Restore event handlers with better timing
                    setTimeout(() => {
                        if (this.parent.ai) {
                            this.parent.ai.setupEventHandlers();
                            this.parent.ai.currentConversationId = conversationId;
                            this.parent.ai.isInitialized = true;
                            console.log('✅ AI chat restored and handlers setup');
                        }
                    }, 50);
                }
                return;
            } else {
                console.log('✨ AI assistant already properly rendered');
                return;
            }
        }

        // Create full-screen AI assistant interface
        content.innerHTML = `
            <div class="ai-assistant-section" data-conversation-id="${conversationId}" style="height: calc(100vh - 200px); display: flex; flex-direction: column; width: 100%; max-width: 100%; overflow: hidden;">
                <div class="ai-chat-interface" style="height: 100%; display: flex; flex-direction: column; background: #f9fafb; border-radius: 8px; max-height: 100%; width: 100%; max-width: 100%; overflow: hidden;">
                    <div class="ai-chat-header" style="padding: 12px 16px; background: transparent; border-bottom: 1px solid #e5e7eb;">
                        <div style="display: flex; align-items: center; justify-content: center;">
                            <span style="font-weight: 600; color: #374151; font-size: 15px;">Chat about ${conversation.business_name || 'this project'}</span>
                        </div>
                    </div>
                    <div class="ai-chat-messages" id="aiChatMessages" style="flex: 1; overflow-y: auto; overflow-x: hidden; padding: 24px; background: transparent; min-height: 0; min-width: 0; width: 100%; max-width: 100%; scrollbar-width: none; -ms-overflow-style: none;">
                        <div class="ai-loading-state" style="text-align: center; padding: 20px; color: #9ca3af;">
                            <div class="typing-dot" style="display: inline-block; width: 8px; height: 8px; background: #9ca3af; border-radius: 50%; animation: typing 1.4s infinite; margin: 0 2px;"></div>
                            <div class="typing-dot" style="display: inline-block; width: 8px; height: 8px; background: #9ca3af; border-radius: 50%; animation: typing 1.4s infinite; animation-delay: 0.2s; margin: 0 2px;"></div>
                            <div class="typing-dot" style="display: inline-block; width: 8px; height: 8px; background: #9ca3af; border-radius: 50%; animation: typing 1.4s infinite; animation-delay: 0.4s; margin: 0 2px;"></div>
                        </div>
                    </div>

                    <div class="ai-chat-input-area" style="padding: 20px; background: white; border-radius: 0 0 8px 8px; flex-shrink: 0; border-top: 1px solid #e5e7eb;">
                        <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; align-items: center;">
                            <button onclick="console.log('Test button clicked'); window.conversationUI?.ai?.askQuestion('What should I do next?');"
                                    style="padding: 8px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; font-size: 13px; color: #475569; transition: all 0.2s; font-weight: 500;">
                                What's next?
                            </button>
                            <label style="display: flex; align-items: center; gap: 6px; padding: 8px 14px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; cursor: pointer; font-size: 13px; color: #16a34a; font-weight: 500;">
                                <input type="checkbox" id="fundMyDealCheckbox" style="width: 16px; height: 16px; cursor: pointer;">
                                <span>Fund My Deal</span>
                            </label>
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
                // 🔴 CRITICAL FIX START: Reset AI module state
                // We just destroyed and recreated the DOM, so we must tell the AI module
                // to forget its previous state and re-attach event listeners.
                console.log('🔄 Forcing AI Assistant re-initialization...');
                this.parent.ai.isInitialized = false;
                this.parent.ai.currentConversationId = null;
                // 🔴 CRITICAL FIX END

                this.parent.ai.initializeAIChat();
                // Cache the initial state after initialization
                setTimeout(() => this.saveAIChatState(), 200);

                // 📜 SCROLL FIX: Force scroll to bottom after rendering
                setTimeout(() => {
                    const messagesDiv = document.getElementById('aiChatMessages');
                    if (messagesDiv) {
                        messagesDiv.scrollTop = messagesDiv.scrollHeight;
                        console.log('📜 Forced scroll to bottom');
                    }
                }, 150);

                // Safety timeout: If loading dots are still visible after 10 seconds, clear them
                setTimeout(() => {
                    const messagesDiv = document.getElementById('aiChatMessages');
                    const loadingState = messagesDiv?.querySelector('.ai-loading-state');
                    if (loadingState) {
                        console.warn('⚠️ AI chat loading timed out - clearing loading state');
                        messagesDiv.innerHTML = `
                            <div style="text-align: center; padding: 40px 20px;">
                                <div style="font-size: 48px; margin-bottom: 16px;">💬</div>
                                <h3 style="color: #6b7280; margin-bottom: 8px;">No messages yet</h3>
                                <p style="color: #9ca3af;">Start a conversation with the AI assistant</p>
                            </div>
                        `;
                    }
                }, 10000);
            } else {
                // AI module not available - clear loading state and show empty state
                console.error('❌ AI module not available');
                const messagesDiv = document.getElementById('aiChatMessages');
                if (messagesDiv) {
                    messagesDiv.innerHTML = `
                        <div style="text-align: center; padding: 40px 20px;">
                            <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                            <h3 style="color: #6b7280; margin-bottom: 8px;">AI Module Not Available</h3>
                            <p style="color: #9ca3af;">The AI assistant module failed to load. Please refresh the page.</p>
                        </div>
                    `;
                }
            }
        }, 100);
    }

    async renderDocumentsTab(content) {
        console.log('📄 Rendering Documents Tab');

        if (!this.parent.documents) {
            console.error('❌ Documents module not available');
            content.innerHTML = `
                <div class="error-state" style="text-align: center; padding: 40px;">
                    <div class="error-icon" style="font-size: 48px; margin-bottom: 16px;">❌</div>
                    <h4 style="color: #dc2626;">Documents Module Not Loaded</h4>
                    <p style="color: #6b7280;">The documents module failed to initialize.</p>
                </div>
            `;
            return;
        }

        // Render template first
        content.innerHTML = this.parent.documents.createDocumentsTabTemplate();

        // Setup event listeners
        this.parent.documents.setupDocumentsEventListeners();

        // Load documents with slight delay to ensure DOM is ready
        setTimeout(async () => {
            try {
                await this.parent.documents.loadDocuments();
            } catch (error) {
                console.error('❌ Failed to load documents in tab:', error);
            }
        }, 100);
    }

    renderEditTab(content) {
        console.log('renderEditTab called - delegating to LeadFormsTab');
        // Delegate to the LeadFormsTab module
        this.leadFormsTab.render(content);
    }

    // NEW: Full "Create Mode" with Auto-Formatting & Zip Lookup
    showCreateLeadModal() {
        console.log('showCreateLeadModal called - delegating to LeadFormsTab');
        // Delegate to the LeadFormsTab module
        this.leadFormsTab.openCreateModal();
    }


    // EXISTING: "Edit Mode" (Pre-filled with data)
    showEditLeadModal(conv) {
        console.log('showEditLeadModal called - delegating to LeadFormsTab');
        // Delegate to the LeadFormsTab module
        this.leadFormsTab.openEditModal(conv);
    }

            const saved = await this.handleEditLeadSave(conv);
            if (saved) {
                document.getElementById('editLeadModal').remove();
                // Switch to AI tab
                document.querySelector('[data-tab="ai-assistant"]')?.click();
            }
        });

        // PDF Handler
        document.getElementById('generateAppBtnModal').addEventListener('click', async (e) => {
            e.preventDefault();
            const saved = await this.handleEditLeadSave(conv);
            if (saved) {
                const missingFields = this.checkRequiredFieldsForPDF(conv);
                if (missingFields.length > 0) {
                    this.utils.showNotification(`Missing: ${missingFields.map(f=>f.label).join(', ')}`, 'error');
                    return;
                }
                document.getElementById('editLeadModal').remove();
                document.querySelector('[data-tab="documents"]')?.click();
                await this.proceedWithPDFGeneration(conv);
            }
        });
    }

    async handleEditLeadSave(conv) {
        const form = document.getElementById('editLeadForm');
        if (!form) return false;

        // UI Feedback
        const submitButton = form.querySelector('button[type="submit"]');
        const originalButtonHTML = submitButton ? submitButton.innerHTML : 'Save';
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.innerHTML = 'Saving...';
        }

        const formData = new FormData(form);
        let data = Object.fromEntries(formData.entries());

        // --- DATA CLEANING (The Fix) ---
        const cleanData = (obj) => {
            const cleaned = { ...obj };
            // Fields that MUST be numbers in the database
            const numericFields = [
                'annual_revenue', 'monthly_revenue', 'requested_amount',
                'ownership_percentage', 'owner2_ownership_percentage', // Added Partner field
                'credit_score', 'years_in_business',
                'factor_rate', 'term_months', 'funding_amount'
            ];

            for (const key of Object.keys(cleaned)) {
                // 1. Convert empty strings to null
                if (cleaned[key] === '' || cleaned[key] === undefined) {
                    delete cleaned[key]; // Don't send empty fields
                }
                // 2. Clean numeric fields (remove $ , %)
                else if (numericFields.includes(key)) {
                    cleaned[key] = parseFloat(cleaned[key].toString().replace(/[^0-9.]/g, ''));
                }
            }

            // Special handling: Copy Business Address to Owner if checked
            const sameAddressCheckbox = document.getElementById('sameAsBusinessAddress');
            if (sameAddressCheckbox && sameAddressCheckbox.checked) {
                cleaned.owner_address = cleaned.business_address;
                cleaned.owner_city = cleaned.business_city;
                cleaned.owner_state = cleaned.us_state;
                cleaned.owner_zip = cleaned.business_zip;
            }

            // Handle Checkboxes (Arrays)
            if (cleaned.payment_methods) {
                 // If multiple checked, FormData only takes last.
                 // Ideally handle with getAll, but for now specific handling:
                 const checked = form.querySelectorAll('input[name="payment_methods"]:checked');
                 cleaned.payment_methods = Array.from(checked).map(cb => cb.value).join(', ');
            }

            return cleaned;
        };

        const updates = cleanData(data);
        // -------------------------------

        console.log('📤 Saving cleaned lead data:', updates);

        try {
            // Save to backend
            await this.parent.apiCall(`/api/conversations/${conv.id}`, {
                method: 'PUT',
                body: JSON.stringify(updates)
            });

            // Update local objects
            Object.assign(conv, updates);
            if (this.parent.conversationUI) {
                this.parent.conversationUI.loadConversations(); // Refresh list
            }

            // Success UI
            if (submitButton) {
                submitButton.innerHTML = '✅ Saved!';
                setTimeout(() => {
                    submitButton.disabled = false;
                    submitButton.innerHTML = originalButtonHTML;
                }, 1000);
            }

            this.utils.showNotification('Lead saved successfully', 'success');
            return true;

        } catch (error) {
            console.error('❌ Error saving lead:', error);
            this.utils.showNotification('Failed to save: ' + error.message, 'error');
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.innerHTML = originalButtonHTML;
            }
            return false;
        }
    }

    checkRequiredFieldsForPDF(conv) {
        const required = [];
        // Helper to check if value exists
        const has = (keys) => keys.some(k => conv[k] && conv[k].toString().trim() !== '');

        // --- 1. STRICT BUSINESS ESSENTIALS ---
        if (!has(['business_name', 'legal_name'])) required.push({ field: 'business_name', label: 'Legal/Corporate Name' });
        if (!has(['lead_phone', 'phone', 'primary_phone'])) required.push({ field: 'lead_phone', label: 'Primary Phone' });

        // Strict Address
        if (!has(['business_address', 'address'])) required.push({ field: 'business_address', label: 'Business Address' });
        if (!has(['business_city', 'city'])) required.push({ field: 'business_city', label: 'Business City' });
        if (!has(['us_state', 'business_state', 'state'])) required.push({ field: 'us_state', label: 'Business State' });
        if (!has(['business_zip', 'zip'])) required.push({ field: 'business_zip', label: 'Business Zip' });

        // Strict Business Details
        if (!has(['federal_tax_id', 'tax_id', 'tax_id_encrypted'])) required.push({ field: 'tax_id', label: 'Federal Tax ID' });
        if (!has(['business_start_date', 'date_started'])) required.push({ field: 'business_start_date', label: 'Date Business Started' });
        if (!has(['entity_type'])) required.push({ field: 'entity_type', label: 'Entity Type' });
        if (!has(['industry_type', 'business_type', 'industry'])) required.push({ field: 'industry', label: 'Type of Business' });

        // --- 2. FINANCIALS ---
        // Requested Amount is STRICT
        if (!has(['requested_amount', 'funding_amount'])) required.push({ field: 'requested_amount', label: 'Requested Amount' });

        // Gross Annual Sales is RELAXED (Optional) -> Removed from check
        // Use of Proceeds is RELAXED (Optional) -> Removed from check

        // --- 3. STRICT OWNER INFO ---
        if (!has(['first_name', 'owner_first_name'])) required.push({ field: 'first_name', label: 'Owner First Name' });
        if (!has(['last_name', 'owner_last_name'])) required.push({ field: 'last_name', label: 'Owner Last Name' });
        if (!has(['ssn', 'owner_ssn', 'ssn_encrypted'])) required.push({ field: 'ssn', label: 'SSN' });
        if (!has(['date_of_birth', 'dob', 'owner_dob'])) required.push({ field: 'date_of_birth', label: 'Date of Birth' });
        if (!has(['ownership_percentage', 'ownership_percent'])) required.push({ field: 'ownership_percentage', label: 'Ownership %' });

        // Strict Owner Home Address
        if (!has(['owner_address', 'owner_home_address'])) required.push({ field: 'owner_address', label: 'Owner Home Address' });
        if (!has(['owner_city', 'owner_home_city'])) required.push({ field: 'owner_city', label: 'Owner City' });
        if (!has(['owner_state', 'owner_home_state'])) required.push({ field: 'owner_state', label: 'Owner State' });
        if (!has(['owner_zip', 'owner_home_zip'])) required.push({ field: 'owner_zip', label: 'Owner Zip' });

        return required;
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

            // Attach auto-formatters to form fields
            this.attachInputFormatters(form);
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

        // ✅ Check if fcsResults already exists and has content
        let fcsResults = document.getElementById('fcsResults');
        const hasFCSContent = fcsResults && fcsResults.innerHTML.trim() !== '' && fcsResults.style.display !== 'none';

        if (hasFCSContent) {
            console.log('✅ FCS results already rendered, preserving existing content');
            // Don't re-render! Just make sure it's visible
            fcsResults.style.display = 'block';
            return;
        }

        // ✅ Only clear and rebuild if no content exists
        console.log('📄 No existing FCS content, creating fresh structure');

        content.innerHTML = `
            <div class="intelligence-section">
                <div id="fcsResults" style="display: none;"></div>
                <div id="fcsLoading" style="display: none;"></div>
                <div id="fcsErrorMsg" style="display: none;"></div>
            </div>
        `;

        // CRITICAL: Check if we're in generation mode BEFORE trying to load
        if (this.parent.fcs && this.parent.fcs._fcsGenerationInProgress) {
            const generatingConvId = this.parent.fcs._generatingForConversation;
            const currentConvId = this.parent.getCurrentConversationId();

            console.log('Generation in progress check:', {
                generating: true,
                generatingFor: generatingConvId,
                current: currentConvId,
                match: generatingConvId === currentConvId
            });

            if (generatingConvId === currentConvId) {
                console.log('🚫 NOT loading old data - generation in progress');

                // Show loading state in fcsResults
                fcsResults = document.getElementById('fcsResults');
                if (fcsResults) {
                    fcsResults.innerHTML = `
                        <div style="text-align: center; padding: 60px 40px;">
                            <style>
                                @keyframes spin {
                                    0% { transform: rotate(0deg); }
                                    100% { transform: rotate(360deg); }
                                }
                            </style>
                            <div style="margin: 0 auto 24px; width: 48px; height: 48px; border: 3px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                            <h3 style="color: #3b82f6; margin: 0 0 12px 0; font-size: 20px;">Generating NEW FCS Report</h3>
                            <p style="color: #6b7280; font-size: 15px; margin: 0;">Analyzing documents with AI...</p>
                            <p style="color: #ef4444; font-size: 13px; margin: 16px 0 0 0; font-weight: 600;">⚠️ Do not refresh or switch tabs</p>
                        </div>
                    `;
                    fcsResults.style.display = 'block';
                }
                return; // EXIT - don't call loadFCSData
            }
        }

        // Only load existing FCS data if NOT generating
        if (this.parent.fcs) {
            console.log('✅ Safe to load existing FCS data');
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

    renderEmailTab(content) {
        if (this.parent.emailTab) {
            this.parent.emailTab.render();
        } else {
            content.innerHTML = '<div class="empty-state">Email module not available</div>';
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
                    ${this.createPartnerSection(conv, leadDetails)}

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

    createPartnerSection(conv, leadDetails) {
        const usStates = this.utils.getUSStates();

        // Helper to get value from root conv OR lead_details
        const getVal = (key) => conv[key] || leadDetails[key] || '';

        // Note: CamelCase names here will be converted to snake_case by handleEditFormSubmit
        // e.g. name="owner2FirstName" -> saves as "owner2_first_name"

        return `
            <div class="form-section">
                <div class="section-header" style="background: #525252;">
                    <h4>Owner / Officer 2 Information (Optional)</h4>
                </div>
                <div class="form-row-six">
                    <div class="form-group">
                        <label>First Name</label>
                        <input type="text" name="owner2FirstName" value="${getVal('owner2_first_name')}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>Last Name</label>
                        <input type="text" name="owner2LastName" value="${getVal('owner2_last_name')}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" name="owner2Email" value="${getVal('owner2_email')}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>Ownership %</label>
                        <input type="number" name="owner2OwnershipPercent" value="${getVal('owner2_ownership_percent')}" class="form-input" min="0" max="100">
                    </div>
                    <div class="form-group">
                        <label>Home Address</label>
                        <input type="text" name="owner2Address" value="${getVal('owner2_address')}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>City</label>
                        <input type="text" name="owner2City" value="${getVal('owner2_city')}" class="form-input">
                    </div>
                </div>
                <div class="form-row-six">
                    <div class="form-group">
                        <label>State</label>
                        <select name="owner2State" class="form-input">
                            <option value="">Select State</option>
                            ${usStates.map(state =>
                                `<option value="${state.value}" ${getVal('owner2_state') === state.value ? 'selected' : ''}>${state.label}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>ZIP</label>
                        <input type="text" name="owner2Zip" value="${getVal('owner2_zip')}"
                               class="form-input" maxlength="10"
                               onblur="window.conversationUI.utils.lookupZipCode(this.value, 'owner2')"
                               onkeyup="if(this.value.replace(/\\D/g, '').length === 5) window.conversationUI.utils.lookupZipCode(this.value, 'owner2')">
                    </div>
                    <div class="form-group">
                        <label>Phone</label>
                        <input type="tel" name="owner2Phone" value="${getVal('owner2_phone')}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>SSN</label>
                        <input type="text" name="owner2SSN" value="${getVal('owner2_ssn')}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>Date of Birth</label>
                        <input type="date" name="owner2DOB" value="${this.utils.formatDate(getVal('owner2_dob'), 'input')}" class="form-input">
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
                 'years_in_business', 'factor_rate', 'term_months', 'ownership_percent', 'owner2_ownership_percent'].includes(snakeCase)) {
                updateData[snakeCase] = value ? parseFloat(value.toString().replace(/[$,\s%]/g, '')) : null;
            }
            // Strip formatting from SSN, phone, and EIN fields
            else if (['owner_s_s_n', 'owner1_s_s_n', 'owner2_s_s_n', 'primary_phone', 'cell_phone',
                      'work_phone', 'fax_phone', 'owner1_phone', 'owner2_phone', 'federal_tax_id', 'tax_id'].includes(snakeCase)) {
                updateData[snakeCase] = value ? value.replace(/\D/g, '') : null;
            }
            else {
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
            const result = await this.parent.apiCall(`/api/conversations/${conversationId}`, {
                method: 'PUT',
                body: JSON.stringify(updateData)
            });

            if (result.success) {
                this.utils.showNotification('Lead data updated successfully', 'success');

                // Close the modal
                const modal = document.getElementById('editLeadInlineModal');
                if (modal) {
                    modal.style.display = 'none';
                }

                // Reload the full conversation data from server to get updated lead_details
                try {
                    const refreshData = await this.parent.apiCall(`/api/conversations/${conversationId}`);
                    const updatedConversation = refreshData.conversation || refreshData;

                    // Update the local conversation object with fresh server data
                    if (this.parent) {
                        this.parent.selectedConversation = updatedConversation;

                        if (this.parent.conversationUI) {
                            this.parent.conversationUI.conversations.set(conversationId, updatedConversation);
                            this.parent.conversationUI.selectedConversation = updatedConversation;
                            this.parent.conversationUI.showConversationDetails();
                            // Refresh the conversation list panel to show updated name
                            this.parent.conversationUI.renderConversationsList();
                        }
                    }
                } catch (refreshError) {
                    console.error('Error refreshing conversation data:', refreshError);
                    // Non-critical error, just log it
                }
            } else {
                throw new Error(result.error || result.message || 'Update failed');
            }

        } catch (error) {
            console.error('Error saving lead data:', error);
            this.utils.showNotification('Failed to save: ' + error.message, 'error');
        }
    }

    // Auto-formatting helper functions
    formatSSN(value) {
        if (!value) return '';
        const digits = String(value).replace(/\D/g, '');
        if (!digits) return '';
        if (digits.length <= 3) return digits;
        if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
        return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 9)}`;
    }

    formatPhone(value) {
        if (!value) return '';
        const digits = String(value).replace(/\D/g, '');
        if (!digits) return '';
        if (digits.length <= 3) return digits;
        if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    }

    formatEIN(value) {
        if (!value) return '';
        const digits = String(value).replace(/\D/g, '');
        if (!digits) return '';
        if (digits.length <= 2) return digits;
        return `${digits.slice(0, 2)}-${digits.slice(2, 9)}`;
    }

    attachInputFormatters(form) {
        // SSN fields - Added owner2_ssn
        const ssnFields = form.querySelectorAll('input[name="ownerSSN"], input[name="owner1SSN"], input[name="owner2SSN"], input[name="ssn"], input[name="owner2_ssn"]');
        ssnFields.forEach(field => {
            // Format existing value on load
            if (field.value) {
                field.value = this.formatSSN(field.value);
            }

            field.addEventListener('input', (e) => {
                const cursorPos = e.target.selectionStart;
                const oldLength = e.target.value.length;
                e.target.value = this.formatSSN(e.target.value);
                const newLength = e.target.value.length;
                e.target.setSelectionRange(cursorPos + (newLength - oldLength), cursorPos + (newLength - oldLength));
            });
        });

        // Phone fields - Added owner2_phone
        const phoneFields = form.querySelectorAll('input[name="primaryPhone"], input[name="lead_phone"], input[name="cellPhone"], input[name="workPhone"], input[name="faxPhone"], input[name="owner1Phone"], input[name="owner2Phone"], input[name="owner2_phone"]');
        phoneFields.forEach(field => {
            // Format existing value on load
            if (field.value) {
                field.value = this.formatPhone(field.value);
            }

            field.addEventListener('input', (e) => {
                const cursorPos = e.target.selectionStart;
                const oldLength = e.target.value.length;
                e.target.value = this.formatPhone(e.target.value);
                const newLength = e.target.value.length;
                e.target.setSelectionRange(cursorPos + (newLength - oldLength), cursorPos + (newLength - oldLength));
            });
        });

        // EIN/Tax ID fields
        const einFields = form.querySelectorAll('input[name="federalTaxId"], input[name="taxId"]');
        einFields.forEach(field => {
            // Format existing value on load
            if (field.value) {
                field.value = this.formatEIN(field.value);
            }

            field.addEventListener('input', (e) => {
                const cursorPos = e.target.selectionStart;
                const oldLength = e.target.value.length;
                e.target.value = this.formatEIN(e.target.value);
                const newLength = e.target.value.length;
                e.target.setSelectionRange(cursorPos + (newLength - oldLength), cursorPos + (newLength - oldLength));
            });
        });
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
        console.log('Generate PDF Application clicked');

        const conv = this.parent.getSelectedConversation();
        if (!conv) {
            this.utils.showNotification('No conversation selected', 'error');
            return;
        }

        // ✅ Show form first, then generate PDF after user fills it
        this.showApplicationForm(conv);
    }

    async proceedWithPDFGeneration(conv) {
        console.log('Proceeding with Server-Side PDF generation...');
        this.utils.showNotification('Generating PDF on server...', 'info');

        try {
            // Date Helper
            const formatDate = (val) => {
                if (!val) return '';
                try {
                    const d = new Date(val);
                    if (isNaN(d.getTime())) return '';
                    return d.toLocaleDateString('en-US');
                } catch (e) { return ''; }
            };

            // Prepare application data
            const rawSSN = conv.ssn || conv.owner_ssn || conv.ssn_encrypted || '';
            const rawTaxId = conv.tax_id || conv.federal_tax_id || conv.tax_id_encrypted || '';
            const rawPhone = conv.lead_phone || conv.phone || '';

            const applicationData = {
                legalName: conv.business_name || '',
                dba: conv.dba_name || conv.business_name || '',
                address: conv.business_address || conv.address || '',
                city: conv.business_city || conv.city || '',
                state: conv.business_state || conv.us_state || '',
                zip: conv.business_zip || conv.zip || '',
                telephone: rawPhone,
                fax: conv.fax_phone || '',

                // Financials
                federalTaxId: rawTaxId,
                dateBusinessStarted: formatDate(conv.business_start_date),
                annualRevenue: conv.annual_revenue || '',
                requestedAmount: conv.requested_amount || conv.funding_amount || '',
                useOfFunds: conv.use_of_proceeds || 'Working Capital',

                // Details
                entityType: conv.entity_type || '',
                businessEmail: conv.email || conv.business_email || '',
                typeOfBusiness: conv.industry_type || conv.industry || '',

                // Owner
                ownerFirstName: conv.first_name || '',
                ownerLastName: conv.last_name || '',
                ownerTitle: 'Owner',
                ownerEmail: conv.email || conv.owner_email || '',
                ownerAddress: conv.owner_address || conv.business_address || '',
                ownerCity: conv.owner_city || conv.business_city || '',
                ownerState: conv.owner_state || conv.us_state || '',
                ownerZip: conv.owner_zip || conv.business_zip || '',
                ownershipPercentage: conv.ownership_percentage || '',
                creditScore: conv.credit_score || '',
                ownerSSN: rawSSN,
                ownerDOB: formatDate(conv.date_of_birth),

                // ✅ PARTNER / OWNER 2 MAPPING
                owner2FirstName: conv.owner2_first_name || '',
                owner2LastName: conv.owner2_last_name || '',
                owner2Email: conv.owner2_email || '',
                owner2Phone: conv.owner2_phone || '',
                owner2Address: conv.owner2_home_address || '',
                owner2City: conv.owner2_home_city || '',
                owner2State: conv.owner2_home_state || '',
                owner2Zip: conv.owner2_home_zip || '',
                owner2SSN: conv.owner2_ssn || '',
                owner2DOB: formatDate(conv.owner2_dob),
                owner2Percentage: conv.owner2_ownership_percentage || '',

                signatureDate: new Date().toLocaleDateString('en-US')
            };

            const ownerName = `${applicationData.ownerFirstName} ${applicationData.ownerLastName}`.trim() || 'Authorized Signatory';

            console.log('📤 Sending data to Puppeteer endpoint:', applicationData);

            // Call the NEW Backend Endpoint (Puppeteer)
            // Note: We send the DATA, not the HTML. The backend builds the PDF.
            const result = await this.parent.apiCall(`/api/conversations/${conv.id}/generate-pdf-document`, {
                method: 'POST',
                body: JSON.stringify({
                    applicationData: applicationData,
                    ownerName: ownerName
                })
            });

            if (result.success) {
                this.utils.showNotification('PDF Generated & Saved!', 'success');

                // Refresh documents tab
                if (this.parent.documents) {
                    await this.parent.documents.loadDocuments();
                    const docTab = document.querySelector('[data-tab="documents"]');
                    if (docTab) docTab.click();
                }
            } else {
                throw new Error(result.error || 'Unknown server error');
            }

        } catch (error) {
            console.error('Error generating PDF:', error);
            this.utils.showNotification('Failed to generate PDF: ' + error.message, 'error');
        }
    }

    showApplicationForm(conv) {
        const modalHTML = `
            <div id="appFormModal" style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow-y: auto;
            ">
                <div style="
                    background: white;
                    border-radius: 8px;
                    width: 90%;
                    max-width: 700px;
                    max-height: 90vh;
                    overflow-y: auto;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    margin: 20px;
                ">
                    <!-- Header -->
                    <div style="
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        padding: 20px 24px;
                        border-radius: 8px 8px 0 0;
                        position: sticky;
                        top: 0;
                        z-index: 10;
                    ">
                        <h2 style="margin: 0; font-size: 20px;">Generate Application PDF</h2>
                        <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">
                            Fill in the required fields
                        </p>
                    </div>

                    <!-- Form -->
                    <form id="appForm" style="padding: 24px;">

                        <!-- BUSINESS INFORMATION -->
                        <div style="margin-bottom: 28px;">
                            <h3 style="
                                color: #1e40af;
                                font-size: 16px;
                                font-weight: 700;
                                margin: 0 0 16px 0;
                                padding-bottom: 8px;
                                border-bottom: 2px solid #3b82f6;
                            ">Business Information</h3>

                            <div style="display: flex; flex-direction: column; gap: 14px;">
                                <!-- Legal/Corporate Name & DBA -->
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 4px;">
                                            Legal/Corporate Name <span style="color: #ef4444;">*</span>
                                        </label>
                                        <input type="text" name="business_name" value="${conv.business_name || ''}" required
                                            placeholder="Brothers Financial Services LLC"
                                            style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    </div>
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 4px;">
                                            DBA <span style="color: #ef4444;">*</span>
                                        </label>
                                        <input type="text" name="dba_name" value="${conv.dba_name || conv.business_name || ''}" required
                                            placeholder="Same as legal name or different"
                                            style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    </div>
                                </div>

                                <!-- Physical Address -->
                                <div>
                                    <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 4px;">
                                        Physical Address <span style="color: #ef4444;">*</span>
                                    </label>
                                    <input type="text" name="business_address" value="${conv.business_address || conv.address || ''}" required
                                        placeholder="3925 shady hill trail"
                                        style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                </div>

                                <!-- City, State, Zip -->
                                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px;">
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 4px;">
                                            City <span style="color: #ef4444;">*</span>
                                        </label>
                                        <input type="text" name="business_city" value="${conv.business_city || conv.city || ''}" required
                                            placeholder="Edmond"
                                            style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    </div>
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 4px;">
                                            State <span style="color: #ef4444;">*</span>
                                        </label>
                                        <input type="text" name="us_state" value="${conv.us_state || conv.state || conv.business_state || ''}" required
                                            placeholder="Oklahoma"
                                            style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    </div>
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 4px;">
                                            Zip <span style="color: #ef4444;">*</span>
                                        </label>
                                        <input type="text" name="business_zip" value="${conv.business_zip || conv.zip || ''}" required
                                            placeholder="73034"
                                            style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    </div>
                                </div>

                                <!-- Tax ID & Date Started -->
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 4px;">
                                            Federal Tax ID <span style="color: #ef4444;">*</span>
                                        </label>
                                        <input type="text" name="tax_id" value="${conv.tax_id || conv.federal_tax_id || ''}" required
                                            placeholder="86-3156904"
                                            style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    </div>
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 4px;">
                                            Date Business Started <span style="color: #ef4444;">*</span>
                                        </label>
                                        <input type="date" name="business_start_date" value="${conv.business_start_date || ''}" required
                                            style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    </div>
                                </div>

                                <!-- Entity Type & Type of Business -->
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 4px;">
                                            Type of Entity <span style="color: #ef4444;">*</span>
                                        </label>
                                        <select name="entity_type" required
                                            style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                            <option value="">Select...</option>
                                            <option value="Sole Proprietorship" ${conv.entity_type === 'Sole Proprietorship' ? 'selected' : ''}>Sole Proprietorship</option>
                                            <option value="Partnership" ${conv.entity_type === 'Partnership' ? 'selected' : ''}>Partnership</option>
                                            <option value="Corporation" ${conv.entity_type === 'Corporation' ? 'selected' : ''}>Corporation</option>
                                            <option value="LLC" ${conv.entity_type === 'LLC' ? 'selected' : ''}>LLC</option>
                                            <option value="Other" ${conv.entity_type === 'Other' ? 'selected' : ''}>Other</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 4px;">
                                            Type of Business <span style="color: #ef4444;">*</span>
                                        </label>
                                        <input type="text" name="industry_type" value="${conv.industry_type || conv.business_type || ''}" required
                                            placeholder="FINANCE"
                                            style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    </div>
                                </div>

                                <!-- Use of Proceeds, Requested Amount, Annual Sales -->
                                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 4px;">
                                            Use of Proceeds <span style="color: #ef4444;">*</span>
                                        </label>
                                        <input type="text" name="use_of_proceeds" value="${conv.use_of_proceeds || 'working capital'}" required
                                            placeholder="working capital"
                                            style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    </div>
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 4px;">
                                            Requested Amount <span style="color: #ef4444;">*</span>
                                        </label>
                                        <input type="number" name="requested_amount" value="${conv.requested_amount || conv.funding_amount || ''}" required
                                            placeholder="150000"
                                            style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    </div>
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 4px;">
                                            Gross Annual Sales <span style="color: #ef4444;">*</span>
                                        </label>
                                        <input type="number" name="annual_revenue" value="${conv.annual_revenue || ''}" required
                                            placeholder="2000000"
                                            style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- OWNER/OFFICER INFORMATION -->
                        <div style="margin-bottom: 28px;">
                            <h3 style="
                                color: #1e40af;
                                font-size: 16px;
                                font-weight: 700;
                                margin: 0 0 16px 0;
                                padding-bottom: 8px;
                                border-bottom: 2px solid #3b82f6;
                            ">Owner/Officer Information</h3>

                            <div style="display: flex; flex-direction: column; gap: 14px;">
                                <!-- Owner First & Last Name -->
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 4px;">
                                            Owner First Name <span style="color: #ef4444;">*</span>
                                        </label>
                                        <input type="text" name="first_name" value="${conv.first_name || conv.owner_first_name || ''}" required
                                            placeholder="Joseph"
                                            style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    </div>
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 4px;">
                                            Owner Last Name <span style="color: #ef4444;">*</span>
                                        </label>
                                        <input type="text" name="last_name" value="${conv.last_name || conv.owner_last_name || ''}" required
                                            placeholder="Yako"
                                            style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    </div>
                                </div>

                                <!-- Same as Business Address Checkbox -->
                                <div>
                                    <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #374151; margin-bottom: 8px; cursor: pointer;">
                                        <input type="checkbox" id="sameAsBusinessAddress"
                                            ${!conv.owner_home_address || conv.owner_home_address === conv.business_address ? 'checked' : ''}
                                            onchange="
                                                const ownerAddr = document.querySelector('[name=owner_home_address]');
                                                const ownerCity = document.querySelector('[name=owner_home_city]');
                                                const ownerState = document.querySelector('[name=owner_home_state]');
                                                const ownerZip = document.querySelector('[name=owner_home_zip]');

                                                if (this.checked) {
                                                    ownerAddr.value = document.querySelector('[name=business_address]').value;
                                                    ownerCity.value = document.querySelector('[name=business_city]').value;
                                                    ownerState.value = document.querySelector('[name=us_state]').value;
                                                    ownerZip.value = document.querySelector('[name=business_zip]').value;
                                                    ownerAddr.disabled = true;
                                                    ownerCity.disabled = true;
                                                    ownerState.disabled = true;
                                                    ownerZip.disabled = true;
                                                } else {
                                                    ownerAddr.disabled = false;
                                                    ownerCity.disabled = false;
                                                    ownerState.disabled = false;
                                                    ownerZip.disabled = false;
                                                }
                                            ">
                                        <span style="font-weight: 600;">Owner home address same as business</span>
                                    </label>

                                    <!-- Home Address -->
                                    <input type="text" name="owner_home_address"
                                        value="${conv.owner_home_address || conv.owner_address || conv.business_address || conv.address || ''}"
                                        ${!conv.owner_home_address || conv.owner_home_address === conv.business_address ? 'disabled' : ''}
                                        required
                                        placeholder="3925 shady hill trail"
                                        style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; margin-bottom: 8px;">

                                    <!-- City, State, Zip -->
                                    <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px;">
                                        <input type="text" name="owner_home_city"
                                            value="${conv.owner_home_city || conv.business_city || conv.city || ''}"
                                            ${!conv.owner_home_address || conv.owner_home_address === conv.business_address ? 'disabled' : ''}
                                            required
                                            placeholder="Edmond"
                                            style="padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                        <input type="text" name="owner_home_state"
                                            value="${conv.owner_home_state || conv.business_state || conv.us_state || ''}"
                                            ${!conv.owner_home_address || conv.owner_home_address === conv.business_address ? 'disabled' : ''}
                                            required
                                            placeholder="Oklahoma"
                                            style="padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                        <input type="text" name="owner_home_zip"
                                            value="${conv.owner_home_zip || conv.business_zip || conv.zip || ''}"
                                            ${!conv.owner_home_address || conv.owner_home_address === conv.business_address ? 'disabled' : ''}
                                            required
                                            placeholder="73034"
                                            style="padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    </div>
                                </div>

                                <!-- Ownership %, SSN, DOB -->
                                <div style="display: grid; grid-template-columns: 100px 1fr 1fr; gap: 12px;">
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 4px;">
                                            Ownership % <span style="color: #ef4444;">*</span>
                                        </label>
                                        <input type="number" name="ownership_percent" value="${conv.ownership_percent || '100'}" required
                                            placeholder="100"
                                            style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    </div>
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 4px;">
                                            SSN <span style="color: #ef4444;">*</span>
                                        </label>
                                        <input type="text" name="ssn" value="${conv.ssn || conv.owner_ssn || ''}" required
                                            placeholder="604-27-0200"
                                            style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    </div>
                                    <div>
                                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 4px;">
                                            Date of Birth <span style="color: #ef4444;">*</span>
                                        </label>
                                        <input type="date" name="date_of_birth" value="${conv.date_of_birth || conv.owner_dob || ''}" required
                                            style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Actions -->
                        <div style="
                            display: flex;
                            gap: 12px;
                            justify-content: flex-end;
                            padding-top: 20px;
                            border-top: 2px solid #e5e7eb;
                        ">
                            <button type="button" onclick="document.getElementById('appFormModal').remove()" style="
                                padding: 10px 24px;
                                background: white;
                                color: #374151;
                                border: 1px solid #d1d5db;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 500;
                            ">Cancel</button>
                            <button type="submit" style="
                                padding: 10px 24px;
                                background: #667eea;
                                color: white;
                                border: none;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 600;
                            ">📄 Generate PDF</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Handle form submission
        document.getElementById('appForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleApplicationFormSubmit(conv);
        });
    }

    async handleApplicationFormSubmit(conv) {
        const form = document.getElementById('appForm');
        const formData = new FormData(form);

        // Build update object with correct field mapping
        const updates = {};

        // Get all form fields and map to database columns
        for (let [key, value] of formData.entries()) {
            // Only include non-empty values
            if (value && value.trim() !== '') {
                // ✅ Map frontend field names to database column names
                switch(key) {
                    case 'business_address':
                        updates.address = value;
                        break;
                    case 'business_city':
                        updates.city = value;
                        break;
                    case 'us_state':
                        updates.us_state = value;
                        break;
                    case 'business_zip':
                        updates.zip = value;
                        break;
                    case 'tax_id':
                        updates.federal_tax_id = value;
                        break;
                    case 'business_start_date':
                        updates.business_start_date = value;
                        break;
                    case 'annual_revenue':
                        updates.annual_revenue = parseFloat(value);
                        updates.monthly_revenue = parseFloat(value) / 12;
                        break;
                    case 'entity_type':
                        updates.entity_type = value;
                        break;
                    case 'industry_type':
                        updates.industry_type = value;
                        break;
                    default:
                        // All other fields keep same name
                        updates[key] = value;
                }
            }
        }

        // Copy business address to owner if checkbox is checked
        if (document.getElementById('sameAsBusinessAddress')?.checked) {
            updates.owner_home_address = updates.address;
            updates.owner_home_city = updates.city;
            updates.owner_home_state = updates.us_state;
            updates.owner_home_zip = updates.zip;
        }

        console.log('📤 Saving application data:', updates);

        try {
            // Save to database
            await this.parent.apiCall(`/api/conversations/${conv.id}`, {
                method: 'PUT',
                body: JSON.stringify(updates)
            });

            console.log('✅ Save successful');

            // Update local conversation object
            Object.assign(conv, updates);

            // Close modal
            document.getElementById('appFormModal').remove();

            // Show progress
            this.utils.showNotification('Generating PDF application...', 'info');

            // Generate PDF (existing code)
            await this.proceedWithPDFGeneration(conv);

        } catch (error) {
            console.error('❌ Error saving application data:', error);
            console.error('Data that failed:', updates);
            this.utils.showNotification('Failed to save: ' + error.message, 'error');
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

// EXPORT: Connect the HTML button to our new modal
window.openRichCreateModal = () => {
    console.log('🚀 Launching Zero-Entry Create Modal...');

    // CORRECT PATH: Check window.conversationUI directly
    if (window.conversationUI && window.conversationUI.intelligence) {
        window.conversationUI.intelligence.showCreateLeadModal();
    }
    // FALLBACK: Check if it's nested under commandCenter (just in case)
    else if (window.commandCenter && window.commandCenter.conversationUI && window.commandCenter.conversationUI.intelligence) {
        window.commandCenter.conversationUI.intelligence.showCreateLeadModal();
    }
    else {
        console.error('❌ Intelligence module not found.');
        console.log('Debug info:', {
            hasConversationUI: !!window.conversationUI,
            hasCommandCenter: !!window.commandCenter
        });
        alert('System is still loading. Please refresh and try again.');
    }
};