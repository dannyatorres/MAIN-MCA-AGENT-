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
        console.log('🤖 [FRONTEND] sendAIMessage Triggered');

        const input = document.getElementById('aiChatInput');
        const messagesContainer = document.getElementById('aiChatMessages');

        if (!input || !messagesContainer) {
            console.error('❌ ABORT: Input or container not found');
            return;
        }

        const message = input.value.trim();
        const conversationId = this.parent.getCurrentConversationId();

        if (!message) return;
        if (!conversationId) {
            console.error('❌ ABORT: No conversation ID selected');
            this.parent.utils.showNotification('Please select a conversation first', 'error');
            return;
        }

        // 1. Clear input & Reset Height
        input.value = '';
        input.style.height = 'auto';

        // 2. Add User Message to UI
        this.addMessageToChat('user', message, false);

        // 3. Show Typing Indicator
        this.showTypingIndicator();

        try {
            console.log('🚀 Sending AI Request for Conversation:', conversationId);

            // 4. Use Central API Call (Fixes URL, Auth, and Headers)
            const data = await this.parent.apiCall('/api/ai/chat', {
                method: 'POST',
                body: JSON.stringify({
                    query: message,
                    conversationId: conversationId,
                    includeContext: true // ✅ Tells backend to load DB context
                })
            });

            console.log('📥 Received AI Response:', data);

            // 5. Remove Typing Indicator
            this.hideTypingIndicator();

            // 6. Add AI Response to UI
            if (data.success && (data.response || data.fallback)) {
                // Prevent reloading history while adding the new message
                window.aiChatPreventReload = true;

                this.addMessageToChat('assistant', data.response || data.fallback, false);

                // Re-enable history reloading after a moment
                setTimeout(() => {
                    window.aiChatPreventReload = false;
                }, 2000);
            } else {
                throw new Error(data.error || 'Unknown error from AI service');
            }

        } catch (error) {
            console.error('❌ AI Chat Error:', error);
            this.hideTypingIndicator();

            // Show error in chat bubble
            this.addMessageToChat('assistant', 'I apologize, but I encountered a connection error. Please try again.', false);
        }
    }

    addMessageToChat(role, content, saveToDatabase = true) {
        const messagesContainer = document.getElementById('aiChatMessages');
        if (!messagesContainer) return;

        // Create Row
        const messageRow = document.createElement('div');
        messageRow.className = `ai-message-row ${role === 'user' ? 'user' : 'assistant'}`;

        // Create Bubble
        const messageBubble = document.createElement('div');

        // USE CSS CLASSES NOT INLINE STYLES
        if (role === 'user') {
            messageBubble.className = 'ai-bubble-user';
        } else {
            messageBubble.className = 'ai-bubble-ai';
        }

        // Format Content
        messageBubble.innerHTML = this.formatAIResponse(content);

        // Append
        messageRow.appendChild(messageBubble);
        messagesContainer.appendChild(messageRow);

        // Scroll
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

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
        typingDiv.className = 'ai-message-row assistant';

        // Use new CSS classes
        typingDiv.innerHTML = `
            <div class="ai-thinking">
                <div class="ai-dot"></div>
                <div class="ai-dot"></div>
                <div class="ai-dot"></div>
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