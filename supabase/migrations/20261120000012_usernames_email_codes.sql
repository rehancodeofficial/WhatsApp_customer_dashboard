-- Sign in with a username instead of the email, and one-time codes sent by email
-- (Admin's second step when the authenticator app is not at hand).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_username ON profiles (lower(username)) WHERE username IS NOT NULL;

-- Existing users: username = the part of their email before the @ (made unique with a number if needed).
DO $$
DECLARE r RECORD; base TEXT; candidate TEXT; n INT;
BEGIN
  FOR r IN SELECT p.id, u.email FROM profiles p JOIN auth.users u ON u.id = p.id WHERE p.username IS NULL ORDER BY p.created_at LOOP
    base := lower(regexp_replace(split_part(r.email, '@', 1), '[^a-zA-Z0-9._-]', '', 'g'));
    IF base = '' THEN base := 'user'; END IF;
    candidate := base; n := 1;
    WHILE EXISTS (SELECT 1 FROM profiles WHERE lower(username) = candidate) LOOP
      n := n + 1; candidate := base || n;
    END LOOP;
    UPDATE profiles SET username = candidate WHERE id = r.id;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS email_codes (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL,                 -- 'login'
    code_hash TEXT NOT NULL,               -- sha256 of the 6 digits
    sent_to TEXT NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_codes_user ON email_codes(user_id, purpose, created_at DESC);
ALTER TABLE email_codes ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
