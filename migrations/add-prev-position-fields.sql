-- Add previous position fields to lender_submissions
-- Tracks details of prior MCA when logging 2nd+ position deals

ALTER TABLE lender_submissions
ADD COLUMN IF NOT EXISTS term_unit VARCHAR(20),
ADD COLUMN IF NOT EXISTS payment_frequency VARCHAR(20),
ADD COLUMN IF NOT EXISTS prev_amount DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS prev_factor_rate DECIMAL(6,4),
ADD COLUMN IF NOT EXISTS prev_term_length INTEGER,
ADD COLUMN IF NOT EXISTS prev_term_unit VARCHAR(20),
ADD COLUMN IF NOT EXISTS prev_payment_frequency VARCHAR(20);

-- Comments for documentation
COMMENT ON COLUMN lender_submissions.term_unit IS 'Unit for new offer term (Days, Weeks, Months)';
COMMENT ON COLUMN lender_submissions.payment_frequency IS 'Payment frequency for new offer (daily, weekly, etc)';
COMMENT ON COLUMN lender_submissions.prev_amount IS 'Previous position MCA amount';
COMMENT ON COLUMN lender_submissions.prev_factor_rate IS 'Previous position factor rate';
COMMENT ON COLUMN lender_submissions.prev_term_length IS 'Previous position term length';
COMMENT ON COLUMN lender_submissions.prev_term_unit IS 'Previous position term unit';
COMMENT ON COLUMN lender_submissions.prev_payment_frequency IS 'Previous position payment frequency';
