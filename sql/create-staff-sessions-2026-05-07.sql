CREATE TABLE IF NOT EXISTS staff_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT 'New conversation',
  history    JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_sessions_staff
  ON staff_sessions(staff_id, updated_at DESC);

CREATE OR REPLACE FUNCTION update_staff_sessions_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_staff_sessions_ts ON staff_sessions;
CREATE TRIGGER trg_staff_sessions_ts
  BEFORE UPDATE ON staff_sessions
  FOR EACH ROW EXECUTE FUNCTION update_staff_sessions_timestamp();

ALTER TABLE staff_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_sessions_own" ON staff_sessions;
CREATE POLICY "staff_sessions_own" ON staff_sessions
  FOR ALL USING (auth.uid() = staff_id)
  WITH CHECK (auth.uid() = staff_id);

SELECT 'staff_sessions table ready' as status;
