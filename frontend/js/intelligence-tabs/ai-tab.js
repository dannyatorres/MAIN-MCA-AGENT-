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

        // 2. Render the Chat Interface Structure
        // This creates the "Body" for the AI to inhabit
        container.innerHTML = `
            <div class="ai-assistant-section" style="height: calc(100vh - 200px); display: flex; flex-direction: column; background: white;">
                <div id="aiChatMessages" style="
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                ">
                    <div style="text-align: center; color: #9ca3af; margin-top: 40px;">
                        <div class="loading-spinner small"></div>
                        <p style="font-size: 12px; margin-top: 8px;">Connecting to AI Agent...</p>
                    </div>
                </div>

                <div class="ai-input-area" style="
                    padding: 20px;
                    border-top: 1px solid #f3f4f6;
                    background: white;
                ">
                    <div style="position: relative;">
                        <textarea id="aiChatInput" placeholder="Ask AI about this deal..." style="
                            width: 100%;
                            padding: 12px 40px 12px 16px;
                            border: 1px solid #e5e7eb;
                            border-radius: 12px;
                            font-family: inherit;
                            font-size: 14px;
                            resize: none;
                            outline: none;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.02);
                            min-height: 48px;
                        "></textarea>

                        <button id="aiChatSend" onclick="window.conversationUI.ai.sendAIMessage()" style="
                            position: absolute;
                            right: 8px;
                            bottom: 8px;
                            width: 32px;
                            height: 32px;
                            background: #111827;
                            color: white;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            transition: transform 0.1s;
                        ">
                            <i class="fas fa-paper-plane" style="font-size: 12px;"></i>
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
