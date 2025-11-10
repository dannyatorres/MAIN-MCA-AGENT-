-- Add us_state column to conversations table for US state
-- This separates US state from conversation status

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS us_state VARCHAR(20);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_conversations_us_state ON conversations(us_state);

-- Add owner state fields as well
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS owner_state VARCHAR(20);

-- Comment to document the fields
COMMENT ON COLUMN conversations.state IS 'Conversation status: NEW, ACTIVE, QUALIFIED, FUNDED, etc.';
COMMENT ON COLUMN conversations.us_state IS 'US State: Oklahoma, Texas, California, etc.';
COMMENT ON COLUMN conversations.owner_state IS 'Owner home state (can differ from business state)';
