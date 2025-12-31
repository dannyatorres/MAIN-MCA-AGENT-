-- Add stack tracking fields to lender_submissions
-- Run this migration to track existing positions and withholding info

ALTER TABLE lender_submissions
ADD COLUMN IF NOT EXISTS existing_positions_count INTEGER,
ADD COLUMN IF NOT EXISTS total_daily_withhold DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS days_into_stack INTEGER;

-- Add comments for documentation
COMMENT ON COLUMN lender_submissions.existing_positions_count IS 'Number of existing MCA positions at time of submission';
COMMENT ON COLUMN lender_submissions.total_daily_withhold IS 'Total daily withholding amount across all positions';
COMMENT ON COLUMN lender_submissions.days_into_stack IS 'Days into the current stack/position';
