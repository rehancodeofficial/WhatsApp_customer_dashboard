-- Owner password reset by email (link valid 15 minutes) and the recovery address it goes to.
-- Two-factor authentication uses Supabase Auth MFA (TOTP: Microsoft / Google Authenticator), no table needed.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS recovery_email TEXT;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,          -- sha256 of the token in the link; the token itself is never stored
    sent_to TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id, created_at DESC);
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

UPDATE profiles SET recovery_email = 'qasimvayani@hotmail.com' WHERE role = 'owner' AND recovery_email IS NULL;
NOTIFY pgrst, 'reload schema';
