// js/ai-assistant.js
// COMPLETE REFACTOR: Merged View (Tab) and Logic (Controller)
// This class now handles rendering its own UI and managing the chat logic.

export class AIAssistant {
    constructor(parent) {
        this.parent = parent;
        this.apiBaseUrl = parent.apiBaseUrl || window.location.origin;
        this.utils = parent.utils;

        // AI state
        this.aiContext = [];
        this.isTyping = false;
        this.currentConversationId = null;
        this.isInitialized = false;
        this.memoryMessages = new Map();

        console.log('🔧 AI Assistant Module Loaded');
    }

    // ============================================================
    // 1. VIEW / RENDER LOGIC (Formerly in ai-tab.js)
    // ============================================================

    /**
     * Called by IntelligenceManager when the AI tab is clicked
     * @param {HTMLElement} container - The DOM element to render into
     */
    render(container) {
        console.log('🤖 Rendering AI Assistant Interface');
        const conversation = this.parent.getSelectedConversation();

        if (!conversation) {
            this.renderEmptyState(container);
            return;
        }

        // Render the Main UI
        container.innerHTML = `
            <div class="ai-assistant-section">
                <div id="aiChatMessages" class="ai-chat-messages">
                    <div style="text-align: center; color: #9ca3af; margin-top: 60px;">
                        <div class="ai-thinking" style="margin: 0 auto 10px;">
                            <div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div>
                        </div>
                        <p style="font-size: 12px;">Connecting to Neural Core...</p>
                    </div>
                </div>

                <div class="ai-input-area">
                    <div class="ai-input-wrapper">
                        <textarea id="aiChatInput" placeholder="Ask AI about ${conversation.business_name || 'this deal'}..." rows="1"></textarea>
                        <button id="aiChatSend" type="button">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                    <div style="font-size: 10px; color: #9ca3af; margin-top: 8px; text-align: center;">
                        AI can make mistakes. Verify important financial details.
                    </div>
                </div>
            </div>
        `;

        // Initialize Logic immediately (No setTimeout needed anymore)
        this.initializeAIChat();
    }

    renderEmptyState(container) {
        container.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 60px 20px;">
                <div style="font-size: 48px; margin-bottom: 16px;">💬</div>
                <h3 style="color: #6b7280; margin-bottom: 8px;">No Conversation Selected</h3>
                <p style="color: #9ca3af;">Select a lead to start the AI assistant.</p>
            </div>
        `;
    }

    // ============================================================
    // 2. CONTROLLER LOGIC
    // ============================================================

    initializeAIChat() {
        const conversationId = this.parent.getCurrentConversationId();

        // Check if we need to reset state for a new conversation
        if (this.currentConversationId !== conversationId) {
            this.isInitialized = false;
            this.currentConversationId = conversationId;
            // Clear UI if it exists from a previous render
            const msgs = document.getElementById('aiChatMessages');
            if (msgs) msgs.innerHTML = '';
        }

        console.log('⚡ Initializing AI Logic for ID:', conversationId);

        // 1. Bind Events to the elements we just rendered
        this.setupEventHandlers();

        // 2. Load Context (FCS Data, System Prompts)
        this.loadAIContext();

        // 3. Load Chat History
        this.loadChatHistory();

        this.isInitialized = true;
    }

    setupEventHandlers() {
        const chatInput = document.getElementById('aiChatInput');
        const sendButton = document.getElementById('aiChatSend');

        if (!chatInput || !sendButton) {
            console.error('❌ AI UI Elements not found during binding');
            return;
        }

        // Auto-resize textarea
        chatInput.addEventListener('input', (e) => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
        });

        // Handle Enter key
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendAIMessage();
            }
        });

        // Add click handler
        sendButton.onclick = (e) => {
            e.preventDefault();
            this.sendAIMessage();
        };
    }

    // ============================================================
    // 3. MESSAGING LOGIC
    // ============================================================

    askQuestion(question) {
        console.log('Quick question:', question);
        const input = document.getElementById('aiChatInput');
        if (input) {
            input.value = question;
            this.sendAIMessage();
        }
    }

    async sendAIMessage() {
        const input = document.getElementById('aiChatInput');
        if (!input) return;

        const message = input.value.trim();
        const conversationId = this.parent.getCurrentConversationId();

        if (!message || !conversationId) return;

        // UI Updates
        input.value = '';
        input.style.height = 'auto';
        this.addMessageToChat('user', message, false); // Optimistic UI update
        this.showTypingIndicator();

        try {
            const data = await this.parent.apiCall('/api/ai/chat', {
                method: 'POST',
                body: JSON.stringify({
                    query: message,
                    conversationId: conversationId,
                    includeContext: true
                })
            });

            this.hideTypingIndicator();

            if (data.success && (data.response || data.fallback)) {
                this.addMessageToChat('assistant', data.response || data.fallback, false);
            } else {
                throw new Error(data.error || 'Unknown error');
            }

        } catch (error) {
            console.error('❌ AI Chat Error:', error);
            this.hideTypingIndicator();
            this.addMessageToChat('assistant', 'Connection error. Please try again.', false);
        }
    }

    addMessageToChat(role, content, saveToDatabase = true) {
        const messagesContainer = document.getElementById('aiChatMessages');
        if (!messagesContainer) return;

        const messageRow = document.createElement('div');
        messageRow.className = `ai-message-row ${role === 'user' ? 'user' : 'assistant'}`;

        const messageBubble = document.createElement('div');
        messageBubble.className = role === 'user' ? 'ai-bubble-user' : 'ai-bubble-ai';
        messageBubble.innerHTML = this.formatAIResponse(content);

        messageRow.appendChild(messageBubble);
        messagesContainer.appendChild(messageRow);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        if (saveToDatabase) {
            this.saveMessageToDatabase(role, content);
        }
    }

    formatAIResponse(content) {
        if (!content) return '';
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
        this.hideTypingIndicator(); // Clear existing
        const container = document.getElementById('aiChatMessages');
        if (!container) return;

        const typingDiv = document.createElement('div');
        typingDiv.id = 'aiTypingIndicator';
        typingDiv.className = 'ai-message-row assistant';
        typingDiv.innerHTML = `
            <div class="ai-thinking">
                <div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div>
            </div>`;

        container.appendChild(typingDiv);
        container.scrollTop = container.scrollHeight;
    }

    hideTypingIndicator() {
        const indicator = document.getElementById('aiTypingIndicator');
        if (indicator) indicator.remove();
    }

    // ============================================================
    // 4. DATA LOADING
    // ============================================================

    async loadChatHistory() {
        const conversationId = this.parent.getCurrentConversationId();
        const messagesContainer = document.getElementById('aiChatMessages');
        if (!messagesContainer || !conversationId) return;

        let hasHistory = false;

        try {
            const data = await this.parent.apiCall(`/api/ai/chat/${conversationId}`);
            if (data.messages && data.messages.length > 0) {
                messagesContainer.innerHTML = ''; // Clear "Connecting..." message
                data.messages.forEach(msg => this.addMessageToChat(msg.role, msg.content, false));
                hasHistory = true;
            }
        } catch (error) {
            console.log('Error loading history:', error);
        }

        // Check memory if database didn't have messages
        if (!hasHistory && this.memoryMessages.has(conversationId)) {
            const memoryHistory = this.memoryMessages.get(conversationId);
            if (memoryHistory && memoryHistory.length > 0) {
                messagesContainer.innerHTML = '';
                memoryHistory.forEach(msg => this.addMessageToChat(msg.role, msg.content, false));
                hasHistory = true;
            }
        }

        if (!hasHistory) {
            messagesContainer.innerHTML = '';
            this.showWelcomeMessage();
        }
    }

    showWelcomeMessage() {
        const conversation = this.parent.getSelectedConversation();
        const businessName = conversation?.business_name || 'this lead';
        const welcomeMessage = `Hi! I'm here to help you with **${businessName}**. Ask me anything about:\n\n• Lead qualification and next steps\n• How to handle this conversation\n• Document requirements\n• Best follow-up strategies\n\nWhat would you like to know?`;

        this.addMessageToChat('assistant', welcomeMessage, false);
    }

    async saveMessageToDatabase(role, content) {
        const conversationId = this.parent.getCurrentConversationId();
        if (!conversationId) return;

        try {
            await this.parent.apiCall(`/api/ai/chat/${conversationId}/messages`, {
                method: 'POST',
                body: JSON.stringify({ role, content })
            });
        } catch (error) {
            console.warn('Failed to save message to database:', error);
            // Store in memory as fallback
            this.storeMessageInMemory(conversationId, role, content);
        }
    }

    storeMessageInMemory(conversationId, role, content) {
        if (!this.memoryMessages.has(conversationId)) {
            this.memoryMessages.set(conversationId, []);
        }

        this.memoryMessages.get(conversationId).push({
            role,
            content,
            created_at: new Date().toISOString()
        });
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

                let fcsDetails = fcsData.report.report_content;

                // If there's an AWS file URL, try to fetch additional FCS details
                const rawAnalysis = fcsData.report.raw_analysis;
                if (rawAnalysis) {
                    try {
                        const parsedAnalysis = JSON.parse(rawAnalysis);
                        if (parsedAnalysis.aws_file_url) {
                            const awsResponse = await fetch(parsedAnalysis.aws_file_url);
                            if (awsResponse.ok) {
                                fcsDetails = await awsResponse.text();
                                console.log('✅ Enhanced FCS data loaded from AWS');
                            }
                        }
                    } catch (parseError) {
                        console.log('📄 Using database FCS summary');
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
        }

        console.log('🧠 AI context loaded with', this.aiContext.length, 'system messages');
    }
}

// Expose globally for non-module scripts
window.AIAssistant = AIAssistant;
