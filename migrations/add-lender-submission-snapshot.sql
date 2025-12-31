-- Add snapshot column to lender_submissions
-- Captures deal state at time of submission for historical analysis

ALTER TABLE lender_submissions
ADD COLUMN IF NOT EXISTS snapshot JSONB;

-- Add comment for documentation
COMMENT ON COLUMN lender_submissions.snapshot IS 'JSON snapshot of deal criteria at time of submission (industry, state, revenue, fico, tib, position info)';
