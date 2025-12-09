-- Life OS Mobile: Session Checkpoints Table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS session_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  task_description TEXT NOT NULL,
  completed_steps JSONB DEFAULT '[]'::jsonb,
  current_step TEXT,
  next_steps JSONB DEFAULT '[]'::jsonb,
  messages JSONB DEFAULT '[]'::jsonb,
  token_usage JSONB DEFAULT '{}'::jsonb,
  context_variables JSONB DEFAULT '{}'::jsonb,
  continuation_prompt TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned', 'resumed', 'superseded')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for finding active checkpoints
CREATE INDEX IF NOT EXISTS idx_checkpoints_status ON session_checkpoints(status);
CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON session_checkpoints(session_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_created ON session_checkpoints(created_at DESC);

-- Enable Row Level Security (optional - for multi-user deployment)
-- ALTER TABLE session_checkpoints ENABLE ROW LEVEL SECURITY;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_session_checkpoints_updated_at
    BEFORE UPDATE ON session_checkpoints
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust based on your setup)
GRANT ALL ON session_checkpoints TO authenticated;
GRANT ALL ON session_checkpoints TO service_role;
