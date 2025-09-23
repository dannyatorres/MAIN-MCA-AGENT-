-- AI Chat Messages Schema
-- Stores AI assistant chat history for each conversation

CREATE TABLE IF NOT EXISTS ai_chat_messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,

    -- Message details
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- AI request metadata (for assistant messages)
    ai_model VARCHAR(100),
    ai_tokens_used INTEGER,
    ai_context_used BOOLEAN DEFAULT false,
    ai_response_time_ms INTEGER
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_conversation_id ON ai_chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_created_at ON ai_chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_role ON ai_chat_messages(role);

-- Update trigger for ai_chat_messages
CREATE OR REPLACE TRIGGER update_ai_chat_messages_updated_at
    BEFORE UPDATE ON ai_chat_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_chat_messages TO PUBLIC;