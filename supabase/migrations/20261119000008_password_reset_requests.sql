-- Migration 8: Password Reset Requests for Staff & Admin Workflow
-- Staff members can request a password reset, which creates a pending request.
-- Admins can review, verify, approve, and send/set the new password for the staff user.
-- Admins themselves receive an official direct recovery email via Supabase Auth reset password email.

CREATE TABLE IF NOT EXISTS password_reset_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'agent',
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'completed'
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

-- Service role has full access
CREATE POLICY "Service role full access on password_reset_requests"
    ON password_reset_requests FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated admins can view and update password reset requests
CREATE POLICY "Admins can view password_reset_requests"
    ON password_reset_requests FOR SELECT
    TO authenticated
    USING (is_owner(auth.uid()));

CREATE POLICY "Admins can update password_reset_requests"
    ON password_reset_requests FOR UPDATE
    TO authenticated
    USING (is_owner(auth.uid()));
