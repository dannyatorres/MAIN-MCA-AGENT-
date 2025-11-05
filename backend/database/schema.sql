-- MCA Command Center Database Schema
-- Create these tables in Supabase

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Conversations table - Main conversation tracking
CREATE TABLE conversations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    lead_phone VARCHAR(20) NOT NULL UNIQUE,
    business_name VARCHAR(255),
    contact_name VARCHAR(255),
    state VARCHAR(50) NOT NULL DEFAULT 'NEW',
    current_step VARCHAR(100),
    priority INTEGER DEFAULT 0,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_agent VARCHAR(100),
    tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Messages table - All SMS and system messages
CREATE TABLE messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    message_type VARCHAR(20) NOT NULL DEFAULT 'sms' CHECK (message_type IN ('sms', 'system', 'ai', 'manual')),
    sent_by VARCHAR(100), -- agent name or 'system' or 'ai'
    status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
    twilio_sid VARCHAR(100),
    error_message TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- FCS Results table - Financial Control Sheet data
CREATE TABLE fcs_results (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    business_name VARCHAR(255),
    monthly_revenue DECIMAL(12,2),
    true_revenue DECIMAL(12,2),
    negative_days INTEGER,
    deposits_per_month INTEGER,
    cash_flow_score INTEGER,
    existing_mcas JSONB DEFAULT '[]'::jsonb,
    bank_balance_avg DECIMAL(12,2),
    recommendations TEXT,
    risk_factors JSONB DEFAULT '[]'::jsonb,
    raw_analysis JSONB,
    summary TEXT,
    processed_by VARCHAR(50) DEFAULT 'n8n',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    file_url TEXT,
    processing_status VARCHAR(20) DEFAULT 'completed'
);

-- Lender Matches table - Qualified lenders for each conversation
CREATE TABLE lender_matches (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    lender_name VARCHAR(255) NOT NULL,
    tier INTEGER,
    position INTEGER,
    qualified BOOLEAN DEFAULT TRUE,
    blocking_reason TEXT,
    max_amount DECIMAL(12,2),
    factor_rate DECIMAL(4,3),
    term_months INTEGER,
    is_preferred BOOLEAN DEFAULT FALSE,
    match_score INTEGER,
    requirements JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversation Context table - Key-value storage for conversation state
CREATE TABLE conversation_context (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    context_key VARCHAR(100) NOT NULL,
    context_value TEXT,
    context_type VARCHAR(20) DEFAULT 'string' CHECK (context_type IN ('string', 'number', 'boolean', 'json')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(conversation_id, context_key)
);

-- Agent Actions table - Audit trail of all actions
CREATE TABLE agent_actions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL, -- 'message_sent', 'fcs_triggered', 'state_changed', etc.
    action_details JSONB NOT NULL,
    performed_by VARCHAR(100) NOT NULL, -- agent name, 'system', 'ai'
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    result VARCHAR(20) DEFAULT 'success' CHECK (result IN ('success', 'failed', 'pending'))
);

-- FCS Queue table - Track FCS processing queue
CREATE TABLE fcs_queue (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    business_name VARCHAR(255) NOT NULL,
    request_data JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error_message TEXT,
    webhook_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- System Settings table - Configuration
CREATE TABLE system_settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    setting_type VARCHAR(20) DEFAULT 'string' CHECK (setting_type IN ('string', 'number', 'boolean', 'json')),
    description TEXT,
    updated_by VARCHAR(100),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_conversations_phone ON conversations(lead_phone);
CREATE INDEX idx_conversations_state ON conversations(state);
CREATE INDEX idx_conversations_last_activity ON conversations(last_activity DESC);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX idx_fcs_results_conversation_id ON fcs_results(conversation_id);
CREATE INDEX idx_lender_matches_conversation_id ON lender_matches(conversation_id);
CREATE INDEX idx_lender_matches_qualified ON lender_matches(qualified);
CREATE INDEX idx_context_conversation_key ON conversation_context(conversation_id, context_key);
CREATE INDEX idx_agent_actions_conversation_id ON agent_actions(conversation_id);
CREATE INDEX idx_agent_actions_timestamp ON agent_actions(timestamp DESC);
CREATE INDEX idx_fcs_queue_status ON fcs_queue(status);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply the trigger to tables with updated_at
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversation_context_updated_at BEFORE UPDATE ON conversation_context FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default system settings
INSERT INTO system_settings (setting_key, setting_value, setting_type, description) VALUES
('ai_model', 'gpt-4', 'string', 'OpenAI model to use for responses'),
('max_message_length', '160', 'number', 'Maximum SMS message length'),
('fcs_timeout_minutes', '30', 'number', 'Timeout for FCS processing'),
('auto_qualify_lenders', 'true', 'boolean', 'Automatically run lender qualification after FCS'),
('business_hours_start', '09:00', 'string', 'Business hours start time'),
('business_hours_end', '18:00', 'string', 'Business hours end time'),
('max_concurrent_conversations', '50', 'number', 'Maximum concurrent conversations to handle');

-- RLS (Row Level Security) policies if needed
-- ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can view their own conversations" ON conversations FOR SELECT USING (auth.uid() = user_id);