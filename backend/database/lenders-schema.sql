-- Lenders Table Schema for MCA Command Center
-- This table stores lender information for the lender management system

-- Create lenders table
CREATE TABLE IF NOT EXISTS lenders (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    company VARCHAR(255),
    
    -- Financial criteria
    min_amount DECIMAL(15,2),
    max_amount DECIMAL(15,2),
    
    -- Qualification criteria (stored as JSON arrays)
    industries JSONB, -- Array of industry names
    states JSONB,    -- Array of state codes
    
    -- Additional criteria
    credit_score_min INTEGER,
    time_in_business_min INTEGER, -- in months
    
    -- Additional notes
    notes TEXT,
    
    -- Tracking
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_lenders_email ON lenders(email);
CREATE INDEX IF NOT EXISTS idx_lenders_min_amount ON lenders(min_amount);
CREATE INDEX IF NOT EXISTS idx_lenders_max_amount ON lenders(max_amount);
CREATE INDEX IF NOT EXISTS idx_lenders_industries ON lenders USING GIN(industries);
CREATE INDEX IF NOT EXISTS idx_lenders_states ON lenders USING GIN(states);

-- Create lender_submissions table to track email submissions
CREATE TABLE IF NOT EXISTS lender_submissions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    conversation_id UUID NOT NULL,
    lender_ids JSONB NOT NULL,     -- Array of lender IDs that were contacted
    business_data JSONB NOT NULL,  -- Business information that was sent
    documents JSONB,               -- Documents that were attached
    email_results JSONB,           -- Results from email service (success/failure counts)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for lender submissions
CREATE INDEX IF NOT EXISTS idx_lender_submissions_conversation ON lender_submissions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_lender_submissions_created_at ON lender_submissions(created_at);

-- Sample lenders for testing (optional)
-- INSERT INTO lenders (name, email, phone, company, min_amount, max_amount, industries, states, credit_score_min, time_in_business_min, notes)
-- VALUES 
--     ('John Doe', 'john@funding123.com', '555-0123', 'Funding123', 10000, 500000, '["retail", "restaurant", "construction"]', '["CA", "NY", "FL"]', 600, 6, 'Specializes in small business funding'),
--     ('Jane Smith', 'jane@capitalplus.com', '555-0456', 'CapitalPlus', 25000, 1000000, '["healthcare", "manufacturing", "technology"]', '["TX", "IL", "WA"]', 650, 12, 'Focus on larger deals'),
--     ('Mike Johnson', 'mike@quickcash.com', '555-0789', 'QuickCash Solutions', 5000, 250000, '["retail", "services", "automotive"]', '["GA", "NC", "SC"]', 550, 3, 'Fast approval process');