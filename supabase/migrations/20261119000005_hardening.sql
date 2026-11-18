-- Migration 5: atomic inbound counter, staff profile bootstrap, and locking down RPCs.

-- 1. Atomic unread increment for each inbound customer message (no lost updates under load)
CREATE OR REPLACE FUNCTION bump_inbound(p_conversation_id UUID, p_preview TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE conversations
    SET unread_count = unread_count + 1,
        last_message_at = now(),
        last_customer_message_at = now(),
        last_message_preview = left(p_preview, 200),
        status = 'open',
        updated_at = now()
    WHERE id = p_conversation_id;
$$;

-- 2. set_ai_mode / auto-resume run with a fixed search_path
ALTER FUNCTION set_ai_mode(UUID, conversation_mode, UUID, TEXT, TIMESTAMPTZ) SET search_path = public;
ALTER FUNCTION check_and_resume_ai_modes() SET search_path = public;

-- 3. Only the server (service role) may call these. Without this, any visitor holding the
--    public anon key could pause or resume the AI for any customer through PostgREST.
REVOKE EXECUTE ON FUNCTION set_ai_mode(UUID, conversation_mode, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION check_and_resume_ai_modes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION bump_inbound(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION set_ai_mode(UUID, conversation_mode, UUID, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION check_and_resume_ai_modes() TO service_role;
GRANT EXECUTE ON FUNCTION bump_inbound(UUID, TEXT) TO service_role;

-- 4. Browsers only READ (for Realtime). All writes go through the server API.
DROP POLICY IF EXISTS "Allow staff to insert messages" ON messages;
DROP POLICY IF EXISTS "Allow staff to update messages" ON messages;
DROP POLICY IF EXISTS "Allow staff to update conversations" ON conversations;
DROP POLICY IF EXISTS "Allow authenticated staff to update contacts" ON contacts;
DROP POLICY IF EXISTS "Allow authenticated staff to insert contacts" ON contacts;
DROP POLICY IF EXISTS "Allow users to update own profile" ON profiles;

-- Only people listed in profiles count as staff (a random sign-up sees nothing).
DROP POLICY IF EXISTS "Allow authenticated staff to read contacts" ON contacts;
CREATE POLICY "Staff read contacts" ON contacts FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Allow staff to select conversations" ON conversations;
CREATE POLICY "Staff read conversations" ON conversations FOR SELECT TO authenticated
    USING (is_owner(auth.uid()) OR (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()) AND (assigned_to IS NULL OR assigned_to = auth.uid())));

-- Messages / events inherit visibility from the conversation (RLS applies inside the subquery).
DROP POLICY IF EXISTS "Allow staff to select messages" ON messages;
CREATE POLICY "Staff read messages" ON messages FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id));

DROP POLICY IF EXISTS "Allow staff to select ai_mode_events" ON ai_mode_events;
CREATE POLICY "Staff read ai_mode_events" ON ai_mode_events FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = ai_mode_events.conversation_id));

-- 5. Make the first account the owner automatically; later accounts become agents.
--    (Create staff accounts in Supabase -> Authentication -> Users -> "Add user".)
CREATE OR REPLACE FUNCTION handle_new_staff_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO profiles (id, full_name, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        CASE WHEN EXISTS (SELECT 1 FROM profiles) THEN 'agent'::user_role ELSE 'owner'::user_role END
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_staff ON auth.users;
CREATE TRIGGER on_auth_user_created_staff
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_staff_user();

-- 6. Helpful indexes for search and the 24h window
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_resume_at ON conversations(resume_at) WHERE resume_at IS NOT NULL;

-- 7. Optional: auto-resume timed pauses every minute inside the database (needs the pg_cron extension,
--    enable it in Supabase -> Database -> Extensions). Safe to skip if you use the Vercel cron instead.
-- SELECT cron.schedule('phonebuzz-auto-resume', '* * * * *', $$SELECT check_and_resume_ai_modes();$$);
