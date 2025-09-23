-- Documents and AI Analysis Schema for MCA Command Center
-- This creates tables for document storage and LLM processing results

-- Enable UUID extension if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Documents table for storing file metadata and S3 references
CREATE TABLE IF NOT EXISTS documents (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    
    -- File metadata
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL, -- Size in bytes
    mime_type VARCHAR(100) NOT NULL,
    file_extension VARCHAR(10) NOT NULL,
    
    -- Document categorization
    document_type VARCHAR(50) NOT NULL DEFAULT 'Other', 
    -- Bank Statement, Tax Return, Application, FCS Sheet, Business License, Financial Statement, Other
    document_subtype VARCHAR(100), -- 3 Month Bank Statement, Annual Tax Return, etc.
    
    -- S3 storage information
    s3_bucket VARCHAR(100),
    s3_key VARCHAR(500) NOT NULL, -- Full S3 key path
    s3_url VARCHAR(1000), -- Pre-signed or public URL if needed
    
    -- Processing status
    processing_status VARCHAR(50) DEFAULT 'uploaded',
    -- uploaded, processing, processed, failed, archived
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    
    -- User and system tracking
    uploaded_by VARCHAR(100), -- User who uploaded
    tags TEXT[], -- Array of tags for organization
    notes TEXT,
    
    -- Indexes for fast queries
    CONSTRAINT valid_document_type CHECK (document_type IN (
        'Bank Statement', 'Tax Return', 'Application', 'FCS Sheet', 
        'Business License', 'Financial Statement', 'Legal Document', 'Other'
    )),
    CONSTRAINT valid_processing_status CHECK (processing_status IN (
        'uploaded', 'processing', 'processed', 'failed', 'archived'
    ))
);

-- Document analysis table for storing LLM processing results
CREATE TABLE IF NOT EXISTS document_analysis (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    
    -- Analysis metadata
    analysis_type VARCHAR(50) NOT NULL DEFAULT 'bank_statement',
    -- bank_statement, tax_return, financial_statement, general
    llm_provider VARCHAR(50) NOT NULL, -- openai, anthropic, aws_bedrock
    model_used VARCHAR(100) NOT NULL, -- gpt-4, claude-3, etc.
    
    -- Bank statement specific analysis
    average_daily_balance DECIMAL(15,2),
    monthly_deposits DECIMAL(15,2),
    number_of_deposits INTEGER,
    nsf_count INTEGER DEFAULT 0,
    negative_days INTEGER DEFAULT 0,
    
    -- Financial metrics
    total_income DECIMAL(15,2),
    total_expenses DECIMAL(15,2),
    net_cash_flow DECIMAL(15,2),
    
    -- Analysis period
    analysis_start_date DATE,
    analysis_end_date DATE,
    analysis_period_months INTEGER,
    
    -- Raw and processed results
    raw_llm_response JSONB, -- Complete LLM response
    extracted_data JSONB, -- Structured extracted data
    confidence_score DECIMAL(3,2), -- 0.00 to 1.00
    
    -- Summary and insights
    summary TEXT,
    insights TEXT[],
    red_flags TEXT[],
    recommendations TEXT[],
    
    -- Processing metadata
    processing_time_ms INTEGER,
    tokens_used INTEGER,
    cost_usd DECIMAL(10,4),
    
    -- Status and validation
    analysis_status VARCHAR(50) DEFAULT 'completed',
    -- processing, completed, failed, reviewed, approved
    reviewed_by VARCHAR(100),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    review_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_analysis_type CHECK (analysis_type IN (
        'bank_statement', 'tax_return', 'financial_statement', 'general'
    )),
    CONSTRAINT valid_analysis_status CHECK (analysis_status IN (
        'processing', 'completed', 'failed', 'reviewed', 'approved'
    )),
    CONSTRAINT valid_confidence CHECK (confidence_score >= 0.00 AND confidence_score <= 1.00)
);

-- Document processing queue for async processing
CREATE TABLE IF NOT EXISTS document_processing_queue (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    
    -- Processing configuration
    processing_type VARCHAR(50) NOT NULL, -- llm_analysis, ocr_extraction, thumbnail_generation
    priority INTEGER DEFAULT 5, -- 1-10, higher is more important
    
    -- Queue status
    status VARCHAR(50) DEFAULT 'queued',
    -- queued, processing, completed, failed, retrying
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    
    -- Processing metadata
    processor_instance VARCHAR(100), -- Which instance is processing
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    
    -- Configuration and context
    processing_config JSONB, -- Configuration for the specific processing type
    context_data JSONB, -- Additional context data
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_processing_status CHECK (status IN (
        'queued', 'processing', 'completed', 'failed', 'retrying'
    ))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_conversation_id ON documents(conversation_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(processing_status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_s3_key ON documents(s3_key);

CREATE INDEX IF NOT EXISTS idx_document_analysis_document_id ON document_analysis(document_id);
CREATE INDEX IF NOT EXISTS idx_document_analysis_conversation_id ON document_analysis(conversation_id);
CREATE INDEX IF NOT EXISTS idx_document_analysis_type ON document_analysis(analysis_type);
CREATE INDEX IF NOT EXISTS idx_document_analysis_status ON document_analysis(analysis_status);
CREATE INDEX IF NOT EXISTS idx_document_analysis_created_at ON document_analysis(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_processing_queue_status ON document_processing_queue(status);
CREATE INDEX IF NOT EXISTS idx_processing_queue_priority ON document_processing_queue(priority DESC);
CREATE INDEX IF NOT EXISTS idx_processing_queue_created_at ON document_processing_queue(created_at);

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_documents_updated_at 
    BEFORE UPDATE ON documents 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_document_analysis_updated_at 
    BEFORE UPDATE ON document_analysis 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_processing_queue_updated_at 
    BEFORE UPDATE ON document_processing_queue 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample document types for reference
INSERT INTO lookup_values (category, name, value, description, is_active) VALUES
('document_type', 'Bank Statement', 'Bank Statement', 'Monthly or quarterly bank statements', true),
('document_type', 'Tax Return', 'Tax Return', 'Business tax returns', true),
('document_type', 'Application', 'Application', 'MCA application forms', true),
('document_type', 'FCS Sheet', 'FCS Sheet', 'Financial condition sheets', true),
('document_type', 'Business License', 'Business License', 'Business licenses and permits', true),
('document_type', 'Financial Statement', 'Financial Statement', 'P&L, Balance Sheet, Cash Flow', true),
('document_type', 'Legal Document', 'Legal Document', 'Contracts, agreements, legal docs', true),
('document_type', 'Other', 'Other', 'Other supporting documents', true)
ON CONFLICT (category, name) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE documents IS 'Stores metadata for all uploaded documents linked to conversations';
COMMENT ON TABLE document_analysis IS 'Stores LLM analysis results for processed documents';
COMMENT ON TABLE document_processing_queue IS 'Queue for async document processing tasks';

COMMENT ON COLUMN documents.s3_key IS 'Full S3 object key including folder structure';
COMMENT ON COLUMN document_analysis.extracted_data IS 'Structured JSON data extracted by LLM';
COMMENT ON COLUMN document_analysis.confidence_score IS 'LLM confidence in analysis accuracy (0-1)';
COMMENT ON COLUMN document_processing_queue.processing_config IS 'Configuration for specific processing type';