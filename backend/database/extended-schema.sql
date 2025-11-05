-- Extended MCA Command Center Schema for CSV Import
-- This extends the existing schema to support detailed lead information

-- Add new columns to existing conversations table
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS first_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS cell_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS address VARCHAR(500),
ADD COLUMN IF NOT EXISTS city VARCHAR(100),
ADD COLUMN IF NOT EXISTS state VARCHAR(20),
ADD COLUMN IF NOT EXISTS zip VARCHAR(20),
ADD COLUMN IF NOT EXISTS lead_source VARCHAR(100),
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create new lead_details table for extended information
CREATE TABLE IF NOT EXISTS lead_details (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    
    -- Business Information
    business_type VARCHAR(255),
    annual_revenue DECIMAL(15,2),
    business_start_date DATE,
    
    -- Funding Information  
    funding_amount DECIMAL(15,2),
    factor_rate DECIMAL(6,4), -- e.g., 1.2500 for 1.25
    funding_date DATE,
    term_months INTEGER,
    
    -- Marketing Information
    campaign VARCHAR(255),
    
    -- Personal Information
    date_of_birth DATE,
    
    -- Encrypted Sensitive Fields (stored as TEXT to hold encrypted data)
    tax_id_encrypted TEXT, -- Encrypted TaxID
    ssn_encrypted TEXT,    -- Encrypted SSN
    encryption_key_id VARCHAR(100), -- Reference to encryption key used
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100) DEFAULT 'system',
    
    -- Constraints
    UNIQUE(conversation_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_lead_details_conversation_id ON lead_details(conversation_id);
CREATE INDEX IF NOT EXISTS idx_lead_details_business_type ON lead_details(business_type);
CREATE INDEX IF NOT EXISTS idx_lead_details_annual_revenue ON lead_details(annual_revenue);
CREATE INDEX IF NOT EXISTS idx_lead_details_funding_date ON lead_details(funding_date);
CREATE INDEX IF NOT EXISTS idx_conversations_email ON conversations(email);
CREATE INDEX IF NOT EXISTS idx_conversations_cell_phone ON conversations(cell_phone);
CREATE INDEX IF NOT EXISTS idx_conversations_first_last ON conversations(first_name, last_name);

-- Create CSV import tracking table
CREATE TABLE IF NOT EXISTS csv_imports (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    total_rows INTEGER NOT NULL,
    processed_rows INTEGER DEFAULT 0,
    successful_rows INTEGER DEFAULT 0,
    failed_rows INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_log JSONB DEFAULT '[]'::jsonb,
    column_mapping JSONB NOT NULL, -- Maps CSV columns to database fields
    import_settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    imported_by VARCHAR(100) DEFAULT 'system'
);

-- Create import errors table for detailed error tracking
CREATE TABLE IF NOT EXISTS import_errors (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    import_id UUID REFERENCES csv_imports(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    error_type VARCHAR(100) NOT NULL,
    error_message TEXT NOT NULL,
    row_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create encryption keys table (for managing encryption keys securely)
CREATE TABLE IF NOT EXISTS encryption_keys (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    key_id VARCHAR(100) NOT NULL UNIQUE,
    key_name VARCHAR(255) NOT NULL,
    algorithm VARCHAR(50) NOT NULL DEFAULT 'AES-256-GCM',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_by VARCHAR(100) DEFAULT 'system'
);

-- Insert default encryption key reference (actual key stored securely in environment)
INSERT INTO encryption_keys (key_id, key_name, algorithm) 
VALUES ('default-2025', 'Default Encryption Key 2025', 'AES-256-GCM')
ON CONFLICT (key_id) DO NOTHING;

-- Update trigger for lead_details
CREATE TRIGGER update_lead_details_updated_at 
    BEFORE UPDATE ON lead_details 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add some helpful views for reporting (without exposing encrypted data)
CREATE OR REPLACE VIEW conversation_summary AS
SELECT 
    c.id,
    COALESCE(c.first_name || ' ' || c.last_name, c.business_name) as full_name,
    c.business_name,
    c.lead_phone,
    c.cell_phone,
    c.email,
    c.city,
    c.state,
    c.lead_source,
    c.state as conversation_state,
    c.priority,
    c.created_at,
    c.last_activity,
    ld.business_type,
    ld.annual_revenue,
    ld.funding_amount,
    ld.factor_rate,
    ld.funding_date,
    ld.term_months,
    ld.campaign,
    -- Note: Encrypted fields are NOT included in this view
    CASE WHEN ld.tax_id_encrypted IS NOT NULL THEN '***ENCRYPTED***' ELSE NULL END as has_tax_id,
    CASE WHEN ld.ssn_encrypted IS NOT NULL THEN '***ENCRYPTED***' ELSE NULL END as has_ssn
FROM conversations c
LEFT JOIN lead_details ld ON c.id = ld.conversation_id;

-- Create stored procedure for secure data access (placeholder for encryption functions)
CREATE OR REPLACE FUNCTION get_encrypted_field(
    conversation_id_param UUID,
    field_name VARCHAR,
    user_role VARCHAR DEFAULT 'user'
) RETURNS TEXT AS $$
DECLARE
    encrypted_data TEXT;
    key_id VARCHAR;
BEGIN
    -- Security check - only certain roles can access encrypted data
    IF user_role NOT IN ('admin', 'manager') THEN
        RETURN 'ACCESS_DENIED';
    END IF;
    
    -- Get encrypted data and key ID
    IF field_name = 'tax_id' THEN
        SELECT tax_id_encrypted, encryption_key_id 
        INTO encrypted_data, key_id
        FROM lead_details 
        WHERE conversation_id = conversation_id_param;
    ELSIF field_name = 'ssn' THEN
        SELECT ssn_encrypted, encryption_key_id 
        INTO encrypted_data, key_id
        FROM lead_details 
        WHERE conversation_id = conversation_id_param;
    ELSE
        RETURN 'INVALID_FIELD';
    END IF;
    
    -- Return encrypted data (decryption would happen in application layer)
    -- In production, this would decrypt using the key_id
    RETURN COALESCE(encrypted_data, 'NOT_FOUND');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT SELECT ON conversation_summary TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_encrypted_field(UUID, VARCHAR, VARCHAR) TO PUBLIC;