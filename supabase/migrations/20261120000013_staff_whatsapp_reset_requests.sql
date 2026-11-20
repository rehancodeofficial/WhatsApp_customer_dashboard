-- Staff WhatsApp number (new passwords from the Admin are sent there), and the reset-request table
-- from migration 8 that was never applied on the live database (service role only).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp TEXT;

CREATE TABLE IF NOT EXISTS password_reset_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'agent',
    status TEXT NOT NULL DEFAULT 'pending',
    reason TEXT,
    verification_notes TEXT,
    temporary_password TEXT,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pw_reset_user_id ON password_reset_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_pw_reset_status ON password_reset_requests(status);
CREATE INDEX IF NOT EXISTS idx_pw_reset_email ON password_reset_requests(email);
ALTER TABLE password_reset_requests ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
