// js/intelligence-tabs/ai-tab.js

export class AIAssistantTab {
    constructor(parent) {
        this.parent = parent; // Reference to CommandCenter
    }

    render(container) {
        console.log('🤖 Rendering AI Assistant Tab');

        const conversation = this.parent.getSelectedConversation();
        if (!conversation) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 60px 20px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">💬</div>
                    <h3 style="color: #6b7280; margin-bottom: 8px;">No Conversation Selected</h3>
                    <p style="color: #9ca3af;">Select a lead to start the AI assistant.</p>
                </div>
            `;
            return;
        }

        // 1. Check if AI Module exists
        if (!this.parent.ai) {
            container.innerHTML = `
                <div class="error-state" style="text-align: center; padding: 40px;">
                    <div class="loading-spinner"></div>
                    <p style="color: #6b7280; margin-top: 10px;">AI Module Loading...</p>
                </div>
            `;
            return;
        }

        // CLEAN HTML - No Inline Styles
        container.innerHTML = `
            <div class="ai-assistant-section">
                <div id="aiChatMessages">
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

                        <button id="aiChatSend" onclick="window.conversationUI.ai.sendAIMessage()">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                    <div style="font-size: 10px; color: #9ca3af; margin-top: 8px; text-align: center;">
                        AI can make mistakes. Verify important financial details.
                    </div>
                </div>
            </div>
        `;

        // 3. Initialize the Logic (The Brain)
        // We must RESET the AI module so it knows to re-attach to this new HTML
        setTimeout(() => {
            if (this.parent.ai) {
                console.log('🔄 Re-binding AI Logic to View');
                this.parent.ai.isInitialized = false;
                this.parent.ai.currentConversationId = null; // Force context refresh
                this.parent.ai.initializeAIChat();
            }
        }, 50);
    }

    // Optional: Save state before switching away
    saveState() {
        // If you want to implement caching later, do it here
    }
}

// Expose globally for non-module scripts (optional)
window.AIAssistantTab = AIAssistantTab;
