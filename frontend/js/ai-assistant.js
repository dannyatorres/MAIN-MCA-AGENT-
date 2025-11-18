// ai-assistant.js - AI assistant chat functionality
//
// IMPORTANT: This module is WEBSOCKET-INDEPENDENT
// - Uses HTTP fetch() for all AI communication
// - Does NOT require WebSocket connection
// - Will work even if WebSocket is disconnected
// - Only saves messages to database via HTTP POST

class AIAssistant {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = parent.apiBaseUrl || window.location.origin;
        console.log('🔧 AI Assistant API Base URL:', this.apiBaseUrl);
        this.utils = parent.utils;

        // AI state
        this.aiContext = [];
        this.isTyping = false;
        this.currentConversationId = null;
        this.isInitialized = false;

        this.init();
    }

    init() {
        console.log('AI Assistant initialized');
    }

    initializeAIChat() {
        console.log('Initializing AI chat interface');

        const conversationId = this.parent.getCurrentConversationId();

        // Reset initialization for new conversations
        if (this.currentConversationId !== conversationId) {
            this.isInitialized = false;
            this.currentConversationId = conversationId;
        }

        // Prevent multiple initializations for same conversation
        if (this.isInitialized) {
            console.log('AI chat already initialized for this conversation, skipping...');
            return;
        }

        this.isInitialized = true;

        // Loading dots are already in the initial HTML template, just proceed to load history

        // Setup event handlers
        this.setupEventHandlers();
        this.loadAIContext();

        // Load history first, THEN show welcome only if no history
        this.loadChatHistory();
    }

    askQuestion(question) {
        console.log('Quick question:', question);
        const input = document.getElementById('aiChatInput');
        if (input) {
            input.value = question;
            this.sendAIMessage();
        }
    }

    async sendAIMessage() {
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('🤖 [FRONTEND] sendAIMessage CALLED');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('ℹ️  AI Chat is WEBSOCKET-INDEPENDENT - Uses HTTP fetch() only');
        console.log('ℹ️  WebSocket state:', window.globalSocket?.connected ? 'Connected' : 'Disconnected/Not Initialized');
        console.log('ℹ️  AI chat will work regardless of WebSocket state');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('🔍 Step 1: Function entry');

        const input = document.getElementById('aiChatInput');
        const messagesContainer = document.getElementById('aiChatMessages');

        console.log('🔍 Step 2: Got DOM elements:', {
            hasInput: !!input,
            hasContainer: !!messagesContainer,
            inputValue: input?.value
        });

        if (!input || !messagesContainer) {
            console.error('❌ ABORT: Input or container not found');
            return;
        }

        const message = input.value.trim();
        console.log('🔍 Step 3: Message value:', message);

        if (!message) {
            console.log('❌ ABORT: No message to send');
            return;
        }

        // Clear input
        console.log('🔍 Step 4: Clearing input');
        input.value = '';
        input.style.height = 'auto';

        // Add user message to UI only (backend will save both messages after AI responds)
        console.log('🔍 Step 5: Adding user message to chat UI (NOT saving to DB yet)');
        this.addMessageToChat('user', message, false);

        // Show typing indicator
        console.log('🔍 Step 6: Showing typing indicator');
        this.showTypingIndicator();

        try {
            const conversationId = this.parent.getCurrentConversationId();
            console.log('🔍 Step 7: Got conversation ID:', conversationId);
            console.log('🚀 Sending AI request:', { conversationId, query: message.substring(0, 50) });

            // Refresh AI context
            console.log('🔍 Step 8: Loading AI context...');
            await this.loadAIContext();
            console.log('✅ Step 8: AI context loaded successfully');

            // Build the full URL
            const apiUrl = `${this.apiBaseUrl || window.location.origin}/api/ai/chat`;
            console.log('🔍 Step 9: Built API URL:', apiUrl);
            console.log('📍 Full URL details:', {
                apiBaseUrl: this.apiBaseUrl,
                windowOrigin: window.location.origin,
                finalUrl: apiUrl
            });

            console.log('🔍 Step 10: About to make fetch request...');
            console.log('📤 Request payload:', {
                query: message,
                conversationId: conversationId,
                contextLength: this.aiContext?.length
            });

            // Make direct fetch call with proper settings
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include', // Important for cookies/auth
                body: JSON.stringify({
                    query: message,
                    conversationId: conversationId,
                    includeContext: true  // Backend builds its own context
                })
            });

            console.log('✅ Step 10: Fetch completed!');
            console.log('📡 Step 11: Response status:', response.status, response.statusText);

            if (!response.ok) {
                console.log('❌ Step 11: Response NOT OK');
                const errorText = await response.text();
                console.error('❌ API Error:', response.status, errorText);
                throw new Error(`API error: ${response.status} - ${errorText}`);
            }

            console.log('🔍 Step 12: Parsing response JSON...');
            const data = await response.json();
            console.log('✅ Step 12: JSON parsed successfully');
            console.log('📥 Step 13: Received AI response:', {
                success: data.success,
                hasResponse: !!data.response,
                responseLength: data.response?.length,
                responsePreview: data.response?.substring(0, 100)
            });

            console.log('🔍 Step 14: Hiding typing indicator');
            this.hideTypingIndicator();

            if (data.response) {
                console.log('✅ Step 15: Got response, adding to chat UI');
                console.log('ℹ️  Backend already saved both messages to database');

                // Prevent any reloads during message display
                window.aiChatPreventReload = true;
                console.log('🔒 Preventing reloads for 2 seconds');

                this.addMessageToChat('assistant', data.response, false);

                // Re-enable reloads after message is displayed
                setTimeout(() => {
                    window.aiChatPreventReload = false;
                    console.log('🔓 Reloads re-enabled');
                }, 2000);

                if (!data.success && data.error) {
                    console.warn('⚠️ AI responded with fallback:', data.error);
                }
                console.log('═══════════════════════════════════════════════════════════════');
                console.log('🎉 [FRONTEND] AI CHAT COMPLETED SUCCESSFULLY');
                console.log('═══════════════════════════════════════════════════════════════');
            } else {
                console.log('❌ Step 15: No response in data');
                throw new Error(data.error || 'No response received');
            }

        } catch (error) {
            console.log('═══════════════════════════════════════════════════════════════');
            console.log('❌ [FRONTEND] AI CHAT ERROR CAUGHT');
            console.log('═══════════════════════════════════════════════════════════════');
            console.error('❌ AI chat error:', error);
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            console.log('═══════════════════════════════════════════════════════════════');

            this.hideTypingIndicator();

            let errorMessage = 'I apologize, but I encountered an error connecting to the AI service. ';

            if (error.message.includes('401')) {
                errorMessage = 'Authentication failed. Please refresh the page and try again.';
            } else if (error.message.includes('404')) {
                errorMessage = 'AI service endpoint not found. Please contact support.';
            } else if (error.message.includes('Load failed') || error.message.includes('fetch')) {
                errorMessage = 'Unable to connect to the server. Please check your connection and try again.';
            } else {
                errorMessage += 'Please try again.';
            }

            this.addMessageToChat('assistant', errorMessage, false);
        }
    }

    addMessageToChat(role, content, saveToDatabase = true) {
        const messagesContainer = document.getElementById('aiChatMessages');
        if (!messagesContainer) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-chat-message ${role}`;
        messageDiv.style.marginBottom = '12px';

        const messageBubble = document.createElement('div');
        messageBubble.className = 'message-bubble';
        messageBubble.style.cssText = role === 'user'
            ? 'background: #667eea; color: white; padding: 10px 14px; border-radius: 18px; max-width: 70%; margin-left: auto; text-align: right; word-wrap: break-word; overflow-wrap: break-word; white-space: pre-wrap;'
            : 'background: white; color: #1f2937; padding: 10px 14px; border-radius: 18px; max-width: 70%; border: 1px solid #e5e7eb; word-wrap: break-word; overflow-wrap: break-word; white-space: pre-wrap;';

        // Format the content (convert line breaks, etc)
        messageBubble.innerHTML = this.formatAIResponse(content);

        if (role === 'user') {
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.justifyContent = 'flex-end';
            wrapper.appendChild(messageBubble);
            messageDiv.appendChild(wrapper);
        } else {
            messageDiv.appendChild(messageBubble);
        }

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Save to database if requested
        if (saveToDatabase) {
            this.saveMessageToDatabase(role, content);
        }

        // DISABLED: Cache update was causing reload during message display
        // Only save cache when user manually switches tabs, not after every message
        /*
        if (this.parent.intelligence && this.parent.intelligence.saveAIChatState) {
            requestAnimationFrame(() => {
                this.parent.intelligence.saveAIChatState();
            });
        }
        */
    }

    formatAIResponse(content) {
        let formatted = content;

        // Fix encoding issues
        formatted = formatted.replace(/â€¢/g, '•');
        formatted = formatted.replace(/â€™/g, "'");
        formatted = formatted.replace(/â€œ/g, '"');
        formatted = formatted.replace(/â€/g, '"');

        // Convert line breaks
        formatted = formatted.replace(/\n/g, '<br>');

        // Bold text
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // Bullet points with better styling
        formatted = formatted.replace(/^• /gm, '<span style="color: #667eea;">•</span> ');

        return formatted;
    }

    showTypingIndicator() {
        const messagesContainer = document.getElementById('aiChatMessages');
        if (!messagesContainer) return;

        this.hideTypingIndicator();

        const typingDiv = document.createElement('div');
        typingDiv.id = 'aiTypingIndicator';
        typingDiv.style.marginBottom = '12px';

        typingDiv.innerHTML = `
            <div style="display: inline-flex; gap: 4px; padding: 12px 16px; background: white; border: 1px solid #e5e7eb; border-radius: 18px;">
                <div class="typing-dot" style="width: 8px; height: 8px; background: #9ca3af; border-radius: 50%; animation: typing 1.4s infinite;"></div>
                <div class="typing-dot" style="width: 8px; height: 8px; background: #9ca3af; border-radius: 50%; animation: typing 1.4s infinite; animation-delay: 0.2s;"></div>
                <div class="typing-dot" style="width: 8px; height: 8px; background: #9ca3af; border-radius: 50%; animation: typing 1.4s infinite; animation-delay: 0.4s;"></div>
            </div>
        `;

        messagesContainer.appendChild(typingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    hideTypingIndicator() {
        const indicator = document.getElementById('aiTypingIndicator');
        if (indicator) {
            indicator.remove();
        }
    }

    async loadChatHistory() {
        // Prevent reload during message display
        if (window.aiChatPreventReload) {
            console.log('⚠️ Prevented chat history reload during message display');
            return;
        }

        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) return;

        console.log('📚 Loading chat history for conversation:', conversationId);

        const messagesContainer = document.getElementById('aiChatMessages');
        if (!messagesContainer) return;

        // Keep loading state while we check all sources
        let hasHistory = false;

        try {
            // Try to load from database first
            const data = await this.parent.apiCall(`/api/ai/chat/${conversationId}`);
            if (data.messages && data.messages.length > 0) {
                console.log('✅ Loaded chat history from database:', data.messages.length, 'messages');
                messagesContainer.innerHTML = '';  // Clear loading state
                this.renderChatHistory(data.messages);
                hasHistory = true;
            }
        } catch (error) {
            console.log('🔍 Failed to load history from database:', error.message);
        }

        // Only check memory if database didn't have messages
        if (!hasHistory && this.memoryMessages && this.memoryMessages.has(conversationId)) {
            const memoryHistory = this.memoryMessages.get(conversationId);
            if (memoryHistory && memoryHistory.length > 0) {
                console.log('💭 Loaded chat history from memory:', memoryHistory.length, 'messages');
                messagesContainer.innerHTML = '';  // Clear loading state
                this.renderChatHistory(memoryHistory);
                hasHistory = true;
            }
        }

        // Only show welcome message if no history found anywhere
        if (!hasHistory) {
            console.log('🆕 No chat history found, showing welcome message');
            messagesContainer.innerHTML = '';  // Clear loading state
            this.showWelcomeMessage();
        }
    }

    renderChatHistory(messages) {
        const messagesContainer = document.getElementById('aiChatMessages');
        if (!messagesContainer) return;

        messagesContainer.innerHTML = '';

        // Ensure messages is an array
        if (!Array.isArray(messages)) {
            console.warn('Expected messages to be an array, got:', typeof messages, messages);
            return;
        }

        messages.forEach(message => {
            this.addMessageToChat(message.role, message.content, false);
        });
    }

    showWelcomeMessage() {
        const conversation = this.parent.getSelectedConversation();
        const businessName = conversation?.business_name || 'this lead';
        const welcomeMessage = `Hi! I'm here to help you with **${businessName}**. Ask me anything about:\n\n• Lead qualification and next steps\n• How to handle this conversation\n• Document requirements\n• Best follow-up strategies\n\nWhat would you like to know?`;

        this.addMessageToChat('assistant', welcomeMessage, false);
    }

    async saveMessageToDatabase(role, content) {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) {
            console.log('❌ No conversation ID for saving AI message');
            return;
        }

        console.log('💾 Attempting to save AI message to database:', {
            conversationId,
            role,
            content: content.substring(0, 50) + '...',
            endpoint: `${this.apiBaseUrl}/api/ai/chat/${conversationId}/messages`
        });

        try {
            const result = await this.parent.apiCall(`/api/ai/chat/${conversationId}/messages`, {
                method: 'POST',
                body: JSON.stringify({
                    role: role,
                    content: content
                })
            });

            if (result.success) {
                console.log('✅ AI message saved to database successfully');
            } else {
                console.error('❌ Failed to save AI message to database:', result.error);
            }
        } catch (error) {
            console.error('❌ Error saving AI message to database:', error);
            // For now, store in memory as fallback
            this.storeMessageInMemory(conversationId, role, content);
        }
    }

    storeMessageInMemory(conversationId, role, content) {
        if (!this.memoryMessages) {
            this.memoryMessages = new Map();
        }

        if (!this.memoryMessages.has(conversationId)) {
            this.memoryMessages.set(conversationId, []);
        }

        this.memoryMessages.get(conversationId).push({
            role,
            content,
            created_at: new Date().toISOString()
        });

        console.log('💭 Stored AI message in memory as fallback');
    }

    setupEventHandlers() {
        const chatInput = document.getElementById('aiChatInput');
        const sendButton = document.getElementById('aiChatSend');

        console.log('Setting up event handlers:', { input: !!chatInput, button: !!sendButton });

        if (chatInput) {
            // Remove existing listeners by cloning the element
            const newInput = chatInput.cloneNode(true);
            chatInput.parentNode.replaceChild(newInput, chatInput);

            // Auto-resize textarea
            newInput.addEventListener('input', (e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
            });

            // Handle Enter key
            newInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    console.log('Enter key pressed, sending message');
                    this.sendAIMessage();
                }
            });
        }

        if (sendButton) {
            // Remove existing listeners by cloning the element
            const newButton = sendButton.cloneNode(true);
            sendButton.parentNode.replaceChild(newButton, sendButton);

            // Add click handler
            newButton.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Send button clicked');
                this.sendAIMessage();
            });
        } else {
            console.error('Send button not found!');
        }
    }

    async loadAIContext() {
        const conversation = this.parent.getSelectedConversation();
        if (!conversation) return;

        console.log('🧠 Loading AI context with FCS data for conversation:', conversation.id);

        // Start with basic conversation context
        this.aiContext = [{
            role: 'system',
            content: `AI Assistant for lead: ${conversation.business_name || 'Unknown'}`
        }];

        // Try to load FCS data to enhance AI context
        try {
            const conversationId = this.parent.getCurrentConversationId();
            const fcsData = await this.parent.apiCall(`/api/conversations/${conversationId}/fcs-report`);

                if (fcsData.success && fcsData.report) {
                    console.log('✅ FCS data loaded for AI context');

                    // Check if we have AWS file URL for additional data
                    let fcsDetails = fcsData.report.report_content;

                    // If there's an AWS file URL, try to fetch additional FCS details
                    const rawAnalysis = fcsData.report.raw_analysis;
                    if (rawAnalysis) {
                        try {
                            const parsedAnalysis = JSON.parse(rawAnalysis);
                            if (parsedAnalysis.aws_file_url) {
                                console.log('📁 Found AWS FCS file URL:', parsedAnalysis.aws_file_url);

                                // Fetch detailed FCS data from AWS
                                const awsResponse = await fetch(parsedAnalysis.aws_file_url);
                                if (awsResponse.ok) {
                                    const awsFcsData = await awsResponse.text();
                                    fcsDetails = awsFcsData;
                                    console.log('✅ Enhanced FCS data loaded from AWS');
                                }
                            }
                        } catch (parseError) {
                            console.log('📄 Using database FCS summary (AWS data unavailable)');
                        }
                    }

                    // Enhanced AI context with FCS data
                    this.aiContext = [
                        {
                            role: 'system',
                            content: `AI Assistant for ${fcsData.report.business_name || conversation.business_name || 'Unknown Business'}

CONVERSATION CONTEXT:
- Business Name: ${conversation.business_name || 'Unknown'}
- Contact: ${conversation.first_name} ${conversation.last_name}
- Phone: ${conversation.phone || 'Not provided'}
- Email: ${conversation.email || 'Not provided'}
- Requested Amount: ${conversation.requested_amount || 'Not specified'}

FINANCIAL ANALYSIS (FCS REPORT):
${fcsDetails}

INSTRUCTIONS:
You are an expert MCA (Merchant Cash Advance) advisor with access to this business's financial analysis. Use this FCS data to provide:
- Lead qualification insights
- Revenue and cash flow analysis
- Risk assessment recommendations
- Next steps for underwriting
- Document requirements
- Follow-up strategies

Always reference specific financial metrics from the FCS when making recommendations. Be professional, helpful, and focus on actionable business insights.`
                        }
                    ];
                } else {
                    console.log('📄 No FCS report available - using basic context');
                }
        } catch (error) {
            console.log('⚠️ Failed to load FCS context:', error.message);
            console.log('📄 Continuing with basic AI context');
        }

        console.log('🧠 AI context loaded with', this.aiContext.length, 'system messages');
    }
}