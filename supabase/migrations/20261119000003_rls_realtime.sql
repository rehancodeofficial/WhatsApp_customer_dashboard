-- Migration 3: Row Level Security (RLS) & Realtime Publication

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_mode_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE n8n_chat_histories ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current user is owner
CREATE OR REPLACE FUNCTION is_owner(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = user_id AND role = 'owner'
    );
$$;

-- 1. Profiles policies
CREATE POLICY "Allow authenticated users to read profiles"
    ON profiles FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow users to update own profile"
    ON profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id);

-- 2. Contacts policies
CREATE POLICY "Allow authenticated staff to read contacts"
    ON contacts FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated staff to update contacts"
    ON contacts FOR UPDATE
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated staff to insert contacts"
    ON contacts FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- 3. Conversations policies
-- Owners can see all; Agents see assigned or unassigned
CREATE POLICY "Allow staff to select conversations"
    ON conversations FOR SELECT
    TO authenticated
    USING (
        is_owner(auth.uid()) 
        OR assigned_to = auth.uid() 
        OR assigned_to IS NULL
    );

CREATE POLICY "Allow staff to update conversations"
    ON conversations FOR UPDATE
    TO authenticated
    USING (
        is_owner(auth.uid()) 
        OR assigned_to = auth.uid() 
        OR assigned_to IS NULL
    );

-- 4. Messages policies
CREATE POLICY "Allow staff to select messages"
    ON messages FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM conversations c
            WHERE c.id = messages.conversation_id
            AND (is_owner(auth.uid()) OR c.assigned_to = auth.uid() OR c.assigned_to IS NULL)
        )
    );

CREATE POLICY "Allow staff to insert messages"
    ON messages FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Allow staff to update messages"
    ON messages FOR UPDATE
    TO authenticated
    USING (true);

-- 5. AI mode events policies
CREATE POLICY "Allow staff to select ai_mode_events"
    ON ai_mode_events FOR SELECT
    TO authenticated
    USING (true);

-- 6. n8n_chat_histories policies
CREATE POLICY "Allow service role full access to n8n_chat_histories"
    ON n8n_chat_histories FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Realtime publication setup
-- Enable realtime on conversations and messages tables
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE messages;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'contacts'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
    END IF;
END $$;
