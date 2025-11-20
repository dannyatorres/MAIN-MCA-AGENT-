-- Migration: Add Partner/Owner 2 Support
-- Description: Adds columns for second owner/partner information to enable dual-owner applications
-- Date: 2025-01-20

-- 1. Fix "Type of Business" (Saved in lead_details)
ALTER TABLE lead_details
ADD COLUMN IF NOT EXISTS business_type VARCHAR(255);

-- 2. Fix "Ownership %" (Saved in conversations)
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS ownership_percent NUMERIC(5,2);

-- 3. Add the "Partner / Owner 2" Columns (Saved in conversations)
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS owner2_first_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS owner2_last_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS owner2_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS owner2_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS owner2_address TEXT,
ADD COLUMN IF NOT EXISTS owner2_city VARCHAR(255),
ADD COLUMN IF NOT EXISTS owner2_state VARCHAR(50),
ADD COLUMN IF NOT EXISTS owner2_zip VARCHAR(20),
ADD COLUMN IF NOT EXISTS owner2_ssn VARCHAR(255),
ADD COLUMN IF NOT EXISTS owner2_dob DATE,
ADD COLUMN IF NOT EXISTS owner2_ownership_percent NUMERIC(5,2);

-- Verification Queries (Optional - Run after migration)
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'conversations' AND column_name LIKE 'owner2%';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'lead_details' AND column_name = 'business_type';
