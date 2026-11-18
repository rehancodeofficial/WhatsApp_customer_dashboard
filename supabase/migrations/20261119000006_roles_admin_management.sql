-- Migration 6: Admin / Management roles.
--   owner  = "Admin"       full access (staff accounts, payments, analytics, settings)
--   agent  = "Management"  inbox only: all chats, AI on/off, replies
-- Both roles see every customer chat. Permissions are enforced in the API; RLS only controls reads.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION is_active_staff(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (SELECT 1 FROM profiles WHERE id = user_id AND active);
$$;

DROP POLICY IF EXISTS "Staff read conversations" ON conversations;
CREATE POLICY "Staff read conversations" ON conversations FOR SELECT TO authenticated
    USING (is_active_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff read contacts" ON contacts;
CREATE POLICY "Staff read contacts" ON contacts FOR SELECT TO authenticated
    USING (is_active_staff(auth.uid()));

-- Staff can read their own profile; Admins can read all (writes go through the server API only).
DROP POLICY IF EXISTS "Allow authenticated users to read profiles" ON profiles;
CREATE POLICY "Staff read profiles" ON profiles FOR SELECT TO authenticated
    USING (id = auth.uid() OR is_owner(auth.uid()));
