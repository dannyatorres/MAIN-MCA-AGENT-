-- Add thread_id column to processed_emails for thread-level deduplication
-- This prevents processing replies in already-processed email threads

ALTER TABLE processed_emails ADD COLUMN IF NOT EXISTS thread_id TEXT;
CREATE INDEX IF NOT EXISTS idx_processed_emails_thread ON processed_emails(thread_id);
