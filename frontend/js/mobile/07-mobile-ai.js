// 07-mobile-ai.js
Object.assign(window.MobileApp.prototype, {
        // ============ AI ASSISTANT ============
        async loadAiChat() {
            const container = document.getElementById('mobileAiMessages');
            if (!container || !this.currentConversationId) return;

            container.innerHTML = `
                <div class="ai-loading-container">
                    <div class="ai-thinking">
                        <div class="ai-dot"></div>
                        <div class="ai-dot"></div>
                        <div class="ai-dot"></div>
                    </div>
                    <p>Loading AI chat...</p>
                </div>
            `;

            try {
                const data = await this.apiCall(`/api/ai/chat/${this.currentConversationId}`);

                container.innerHTML = '';

                if (data.messages && data.messages.length > 0) {
                    this.aiMessages = data.messages;
                    this.aiMessages.forEach(msg => this.addAiMessage(msg.role, msg.content));
                } else {
                    const businessName = this.selectedConversation?.business_name || 'this deal';
                    this.addAiMessage('assistant', `How can I help you with **${businessName}** today?`);
                }

                this.scrollAiToBottom();
            } catch (err) {
                container.innerHTML = `
                    <div class="ai-loading-container">
                        <p>Failed to load AI chat</p>
                    </div>
                `;
            }
        }

        addAiMessage(role, content) {
            const container = document.getElementById('mobileAiMessages');
            if (!container) return;

            const row = document.createElement('div');
            row.className = `ai-message-row ${role}`;

            const bubble = document.createElement('div');
            bubble.className = role === 'user' ? 'ai-bubble-user' : 'ai-bubble-ai';
            bubble.innerHTML = this.formatAiContent(content);

            row.appendChild(bubble);
            container.appendChild(row);
        }

        formatAiContent(content) {
            if (!content) return '';
            return content
                .replace(/\n/g, '<br>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        }

        showAiTyping() {
            const container = document.getElementById('mobileAiMessages');
            if (!container) return;

            const existing = document.getElementById('aiTyping');
            if (existing) existing.remove();

            const row = document.createElement('div');
            row.id = 'aiTyping';
            row.className = 'ai-message-row assistant';
            row.innerHTML = `
                <div class="ai-thinking">
                    <div class="ai-dot"></div>
                    <div class="ai-dot"></div>
                    <div class="ai-dot"></div>
                </div>
            `;
            container.appendChild(row);
            this.scrollAiToBottom();
        }

        hideAiTyping() {
            const typing = document.getElementById('aiTyping');
            if (typing) typing.remove();
        }

        async sendAiMessage() {
            const input = document.getElementById('mobileAiInput');
            if (!input) return;

            const message = input.value.trim();
            if (!message || !this.currentConversationId) return;

            input.value = '';
            input.style.height = 'auto';

            this.addAiMessage('user', message);
            this.scrollAiToBottom();
            this.showAiTyping();

            try {
                const data = await this.apiCall('/api/ai/chat', {
                    method: 'POST',
                    body: JSON.stringify({
                        query: message,
                        conversationId: this.currentConversationId,
                        includeContext: true
                    })
                });

                this.hideAiTyping();

                if (data.success && (data.response || data.fallback)) {
                    this.addAiMessage('assistant', data.response || data.fallback);
                } else {
                    this.addAiMessage('assistant', 'Sorry, I encountered an error. Please try again.');
                }
            } catch (err) {
                this.hideAiTyping();
                this.addAiMessage('assistant', 'Connection error. Please try again.');
            }

            this.scrollAiToBottom();
        }

        scrollAiToBottom() {
            const container = document.getElementById('mobileAiMessages');
            if (container) {
                requestAnimationFrame(() => {
                    container.scrollTop = container.scrollHeight;
                });
            }
        }

});
