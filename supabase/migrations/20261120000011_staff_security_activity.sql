-- Staff security: account lock after 3 wrong passwords, password vault the Admin can open with 2FA,
-- and an activity log of what every user does in the dashboard.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS failed_logins INT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- AES-256-GCM encrypted copy of the latest password (key on the server only). Shown to the Admin
-- only after a fresh authenticator code. Service role only (RLS on, no policies).
CREATE TABLE IF NOT EXISTS staff_secrets (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    enc TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID
);
ALTER TABLE staff_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS activity_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID,
    user_name TEXT,
    user_email TEXT,
    role TEXT,
    action TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id, created_at DESC);
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
