-- =============================================================================
-- PhoneBuzz Dashboard: COMPLETE DATABASE (fresh Supabase project)
-- Generated from supabase/migrations/ (1 → 8). Paste the whole file into
-- Supabase → SQL Editor → Run. Safe to re-run: every statement is idempotent
-- except the policies in migration 3 (if you re-run on an existing database,
-- run only the newest migration file instead).
--
-- Tables: profiles, staff_roles, contacts (= customers), conversations, messages,
--         ai_mode_events, n8n_chat_histories, suppliers, products,
--         inventory_movements, orders, order_items, broadcasts, broadcast_recipients
-- View:   customer_stats
-- =============================================================================



-- >>>>>>>>>> 20261119000001_initial_schema.sql
-- Migration 1: Schema creation for PhoneBuzz WhatsApp Dashboard

-- gen_random_uuid() is built into PostgreSQL 13+, no extension needed

-- Enums
DO $$ BEGIN
    CREATE TYPE conversation_mode AS ENUM ('ai', 'human', 'handoff');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE conversation_status AS ENUM ('open', 'closed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE message_sender_type AS ENUM ('customer', 'ai', 'agent', 'system');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE message_type AS ENUM ('text', 'image', 'audio', 'document', 'template', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE message_status AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('owner', 'agent');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Profiles (linked with Supabase Auth auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role user_role DEFAULT 'agent' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Contacts
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wa_id TEXT UNIQUE NOT NULL, -- phone in E.164 format without +
    name TEXT,
    profile_name TEXT,
    country TEXT,
    preferred_language TEXT DEFAULT 'en',
    lead_id TEXT, -- matches Google Sheet Lead_ID
    lead_status TEXT, -- matches Google Sheet Lead_Status
    tags TEXT[] DEFAULT '{}'::TEXT[],
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contacts_wa_id ON contacts(wa_id);
CREATE INDEX IF NOT EXISTS idx_contacts_lead_id ON contacts(lead_id);

-- 3. Conversations
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID UNIQUE NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    ai_enabled BOOLEAN DEFAULT true NOT NULL,
    mode conversation_mode DEFAULT 'ai' NOT NULL,
    paused_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    paused_at TIMESTAMPTZ,
    resume_at TIMESTAMPTZ,
    assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
    last_message_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    last_customer_message_at TIMESTAMPTZ,
    unread_count INTEGER DEFAULT 0 NOT NULL,
    last_message_preview TEXT,
    status conversation_status DEFAULT 'open' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_contact_id ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_mode ON conversations(mode);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_to ON conversations(assigned_to);

-- 4. Messages
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    wa_message_id TEXT UNIQUE, -- Meta wamid / idempotency key
    direction message_direction NOT NULL,
    sender_type message_sender_type NOT NULL,
    sender_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    type message_type DEFAULT 'text' NOT NULL,
    body TEXT,
    media_url TEXT,
    media_mime TEXT,
    transcript_or_caption TEXT,
    status message_status DEFAULT 'sent' NOT NULL,
    error_code TEXT,
    error_message TEXT,
    raw JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_wa_message_id ON messages(wa_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at ASC);

-- 5. AI Mode Events (audit trail)
CREATE TABLE IF NOT EXISTS ai_mode_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    from_mode conversation_mode,
    to_mode conversation_mode NOT NULL,
    changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_mode_events_conversation_id ON ai_mode_events(conversation_id);

-- 6. n8n Chat Memory Table (compat with n8n Postgres Chat Memory node)
CREATE TABLE IF NOT EXISTS n8n_chat_histories (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    message JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_n8n_chat_histories_session_id ON n8n_chat_histories(session_id);

-- >>>>>>>>>> 20261119000002_functions_triggers.sql
-- Migration 2: Functions and triggers

-- set_ai_mode function (Atomic, race-safe with SELECT ... FOR UPDATE)
CREATE OR REPLACE FUNCTION set_ai_mode(
    p_conversation_id UUID,
    p_mode conversation_mode,
    p_user_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
    p_resume_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS conversations
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_conversation conversations;
    v_prev_mode conversation_mode;
    v_ai_enabled BOOLEAN;
    v_paused_at TIMESTAMPTZ;
BEGIN
    -- Acquire exclusive row lock to avoid race conditions
    SELECT * INTO v_conversation
    FROM conversations
    WHERE id = p_conversation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conversation % not found', p_conversation_id;
    END IF;

    v_prev_mode := v_conversation.mode;
    v_ai_enabled := (p_mode = 'ai');
    v_paused_at := CASE WHEN p_mode != 'ai' THEN now() ELSE NULL END;

    -- Update conversation
    UPDATE conversations
    SET
        mode = p_mode,
        ai_enabled = v_ai_enabled,
        paused_by = CASE WHEN p_mode != 'ai' THEN p_user_id ELSE NULL END,
        paused_at = v_paused_at,
        resume_at = CASE WHEN p_mode != 'ai' THEN p_resume_at ELSE NULL END,
        updated_at = now()
    WHERE id = p_conversation_id
    RETURNING * INTO v_conversation;

    -- Insert audit log event
    INSERT INTO ai_mode_events (
        conversation_id,
        from_mode,
        to_mode,
        changed_by,
        reason
    ) VALUES (
        p_conversation_id,
        v_prev_mode,
        p_mode,
        p_user_id,
        p_reason
    );

    RETURN v_conversation;
END;
$$;

-- Auto-resume expired pauses function (can be invoked by pg_cron or scheduled endpoint)
CREATE OR REPLACE FUNCTION check_and_resume_ai_modes()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER := 0;
    r RECORD;
BEGIN
    FOR r IN
        SELECT id FROM conversations
        WHERE mode != 'ai'
          AND resume_at IS NOT NULL
          AND resume_at <= now()
        FOR UPDATE SKIP LOCKED
    LOOP
        PERFORM set_ai_mode(r.id, 'ai', NULL, 'Auto-resumed after scheduled pause time elapsed');
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- >>>>>>>>>> 20261119000003_rls_realtime.sql
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

-- >>>>>>>>>> 20261119000004_unified_inbox_email.sql
-- Migration 4: Support Email & Unified Multi-Channel Inbox

DO $$ BEGIN
    CREATE TYPE communication_channel AS ENUM ('whatsapp', 'email');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Contacts additions
ALTER TABLE contacts 
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS company TEXT,
    ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);

-- 2. Conversations additions
ALTER TABLE conversations 
    ADD COLUMN IF NOT EXISTS channel communication_channel DEFAULT 'whatsapp' NOT NULL,
    ADD COLUMN IF NOT EXISTS subject TEXT, -- for email threads
    ADD COLUMN IF NOT EXISTS is_starred BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'none'; -- 'none', 'pending', 'verified'

CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel);
CREATE INDEX IF NOT EXISTS idx_conversations_starred ON conversations(is_starred);
CREATE INDEX IF NOT EXISTS idx_conversations_archived ON conversations(is_archived);

-- 3. Messages additions
ALTER TABLE messages 
    ADD COLUMN IF NOT EXISTS channel communication_channel DEFAULT 'whatsapp' NOT NULL,
    ADD COLUMN IF NOT EXISTS subject TEXT, -- for email subjects
    ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- >>>>>>>>>> 20261119000005_hardening.sql
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

-- >>>>>>>>>> 20261119000006_roles_admin_management.sql
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

-- >>>>>>>>>> 20261119000007_business_modules.sql
-- Migration 7: Business modules that replace the Google Sheets
--   * custom staff roles with per-permission check marks (Admin = owner keeps full access)
--   * customer records (tier, preferred brands), suppliers, products / inventory,
--     inventory movement log, orders + order lines, broadcasts + recipients
-- Safe to run more than once.

-- =========================================================================
-- 1. Custom staff roles (Admin creates them, ticks the permissions each one gets)
-- =========================================================================
CREATE TABLE IF NOT EXISTS staff_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    permissions TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin-only permissions can never be stored on a custom role.
CREATE OR REPLACE FUNCTION strip_admin_only_permissions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.permissions := ARRAY(
        SELECT DISTINCT p FROM unnest(NEW.permissions) p
        WHERE p NOT IN ('staff.manage', 'settings.view')
    );
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_staff_roles_strip ON staff_roles;
CREATE TRIGGER trg_staff_roles_strip BEFORE INSERT OR UPDATE ON staff_roles
    FOR EACH ROW EXECUTE FUNCTION strip_admin_only_permissions();

INSERT INTO staff_roles (name, description, permissions) VALUES
    ('Management', 'Works the inbox: reads chats, replies, AI on/off',
        ARRAY['chats.view','chats.reply','ai.toggle','chats.organize','customers.view']),
    ('Viewer', 'Read-only: chat logs and records',
        ARRAY['chats.view','customers.view','inventory.view','orders.view','suppliers.view'])
ON CONFLICT (name) DO NOTHING;

-- profiles.role stays: 'owner' = Admin (everything), 'agent' = staff limited by role_id.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES staff_roles(id) ON DELETE SET NULL;
UPDATE profiles SET role_id = (SELECT id FROM staff_roles WHERE name = 'Management')
    WHERE role = 'agent' AND role_id IS NULL;

-- =========================================================================
-- 2. Customer record fields (customers = contacts)
-- =========================================================================
ALTER TABLE contacts
    ADD COLUMN IF NOT EXISTS city TEXT,
    ADD COLUMN IF NOT EXISTS payment_tier TEXT CHECK (payment_tier IN ('high', 'medium', 'low')),
    ADD COLUMN IF NOT EXISTS preferred_brands TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT true;
-- payment_tier NULL = automatic (from total spent, see customer_stats). A value = set by hand.
CREATE INDEX IF NOT EXISTS idx_contacts_country ON contacts(country);
CREATE INDEX IF NOT EXISTS idx_contacts_brands ON contacts USING GIN (preferred_brands);

-- =========================================================================
-- 3. Suppliers
-- =========================================================================
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    company TEXT,
    phone TEXT,
    email TEXT,
    country TEXT,
    brands TEXT[] NOT NULL DEFAULT '{}',
    rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
    notes TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================================
-- 4. Products / inventory
-- =========================================================================
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT NOT NULL UNIQUE,
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    variant TEXT,                       -- e.g. "256GB Natural Titanium"
    condition TEXT NOT NULL DEFAULT 'new' CHECK (condition IN ('new', 'refurbished', 'used')),
    category TEXT NOT NULL DEFAULT 'smartphone',
    cost_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
    sale_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
    currency TEXT NOT NULL DEFAULT 'AED',
    stock_qty INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER NOT NULL DEFAULT 10,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    location TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);

-- Every stock change is a row here; a trigger keeps products.stock_qty in sync.
CREATE TABLE IF NOT EXISTS inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('in', 'out', 'adjustment', 'return')),
    quantity INTEGER NOT NULL,          -- signed: + adds stock, - removes stock
    unit_cost NUMERIC(12,2),
    reference TEXT,                     -- order number, purchase order, ...
    note TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_movements_product_created ON inventory_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_created ON inventory_movements(created_at DESC);

CREATE OR REPLACE FUNCTION apply_inventory_movement()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE products SET stock_qty = stock_qty + NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_apply_inventory_movement ON inventory_movements;
CREATE TRIGGER trg_apply_inventory_movement AFTER INSERT ON inventory_movements
    FOR EACH ROW EXECUTE FUNCTION apply_inventory_movement();

-- =========================================================================
-- 5. Orders
-- =========================================================================
CREATE SEQUENCE IF NOT EXISTS order_no_seq START 10001;

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_no TEXT NOT NULL UNIQUE DEFAULT ('ORD-' || nextval('order_no_seq')),
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'paid', 'shipped', 'delivered', 'cancelled')),
    payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'refunded')),
    source TEXT NOT NULL DEFAULT 'dashboard',   -- 'whatsapp_ai', 'dashboard', 'broadcast', ...
    currency TEXT NOT NULL DEFAULT 'AED',
    subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount NUMERIC(14,2) NOT NULL DEFAULT 0,
    total NUMERIC(14,2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_contact ON orders(contact_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    line_total NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

-- Create an order with its lines and take the stock out, all in one transaction.
-- p = { contact_id, status, payment_status, source, currency, discount, notes, created_by,
--       items: [{ product_id, description, quantity, unit_price }] }
CREATE OR REPLACE FUNCTION create_order(p JSONB)
RETURNS orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    o orders;
    it JSONB;
    v_sub NUMERIC(14,2) := 0;
    v_stock INTEGER;
BEGIN
    IF jsonb_array_length(COALESCE(p->'items', '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'An order needs at least one item';
    END IF;

    INSERT INTO orders (contact_id, status, payment_status, source, currency, discount, notes, created_by)
    VALUES (
        NULLIF(p->>'contact_id', '')::uuid,
        COALESCE(p->>'status', 'pending'),
        COALESCE(p->>'payment_status', 'unpaid'),
        COALESCE(p->>'source', 'dashboard'),
        COALESCE(p->>'currency', 'AED'),
        COALESCE((p->>'discount')::numeric, 0),
        p->>'notes',
        NULLIF(p->>'created_by', '')::uuid
    ) RETURNING * INTO o;

    FOR it IN SELECT * FROM jsonb_array_elements(p->'items') LOOP
        IF NULLIF(it->>'product_id', '') IS NOT NULL THEN
            SELECT stock_qty INTO v_stock FROM products WHERE id = (it->>'product_id')::uuid FOR UPDATE;
            IF v_stock IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;
            IF v_stock < (it->>'quantity')::int THEN
                RAISE EXCEPTION 'Not enough stock for % (have %, need %)', it->>'description', v_stock, it->>'quantity';
            END IF;
        END IF;
        INSERT INTO order_items (order_id, product_id, description, quantity, unit_price)
        VALUES (o.id, NULLIF(it->>'product_id', '')::uuid, it->>'description', (it->>'quantity')::int, (it->>'unit_price')::numeric);
        v_sub := v_sub + (it->>'quantity')::int * (it->>'unit_price')::numeric;
        IF NULLIF(it->>'product_id', '') IS NOT NULL AND COALESCE(p->>'status', 'pending') <> 'cancelled' THEN
            INSERT INTO inventory_movements (product_id, type, quantity, reference, note, created_by)
            VALUES ((it->>'product_id')::uuid, 'out', -((it->>'quantity')::int), o.order_no, 'Sold', NULLIF(p->>'created_by', '')::uuid);
        END IF;
    END LOOP;

    UPDATE orders SET subtotal = v_sub, total = GREATEST(v_sub - discount, 0) WHERE id = o.id RETURNING * INTO o;
    RETURN o;
END;
$$;

-- Only the dashboard server (service role) may create orders; browsers cannot call this directly.
REVOKE ALL ON FUNCTION create_order(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_order(JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION create_order(JSONB) TO service_role;

-- Cancelling an order puts its stock back once.
CREATE OR REPLACE FUNCTION restock_cancelled_order()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
        INSERT INTO inventory_movements (product_id, type, quantity, reference, note)
        SELECT product_id, 'return', quantity, NEW.order_no, 'Order cancelled'
        FROM order_items WHERE order_id = NEW.id AND product_id IS NOT NULL;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_restock_cancelled_order ON orders;
CREATE TRIGGER trg_restock_cancelled_order BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION restock_cancelled_order();

-- =========================================================================
-- 6. Customer stats (orders, spend, brands bought) for records + broadcast filters
-- =========================================================================
-- One row per customer. Spend and brands are computed separately so multi-line orders never double count.
CREATE OR REPLACE VIEW customer_stats AS
WITH spend AS (
    SELECT contact_id, COUNT(*) AS order_count, SUM(total) AS total_spent, MAX(created_at) AS last_order_at
    FROM orders WHERE status <> 'cancelled' AND contact_id IS NOT NULL GROUP BY contact_id
), brands AS (
    SELECT o.contact_id, ARRAY_AGG(DISTINCT p.brand) AS brands_bought
    FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id
    WHERE o.status <> 'cancelled' AND o.contact_id IS NOT NULL GROUP BY o.contact_id
)
SELECT c.id AS contact_id,
       COALESCE(s.order_count, 0) AS order_count,
       COALESCE(s.total_spent, 0) AS total_spent,
       s.last_order_at,
       COALESCE(b.brands_bought, '{}') AS brands_bought
FROM contacts c
LEFT JOIN spend s ON s.contact_id = c.id
LEFT JOIN brands b ON b.contact_id = c.id;

-- =========================================================================
-- 7. Broadcasts (owner sends a product offer to a filtered customer list)
-- =========================================================================
CREATE TABLE IF NOT EXISTS broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    product_ids UUID[] NOT NULL DEFAULT '{}',
    filters JSONB NOT NULL DEFAULT '{}',          -- { countries:[], tiers:[], brands:[] }
    template_name TEXT,                           -- used for customers outside the 24h window
    ai_suggested BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent', 'partial', 'failed')),
    total_recipients INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_broadcasts_created ON broadcasts(created_at DESC);

CREATE TABLE IF NOT EXISTS broadcast_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broadcast_id UUID NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    wa_id TEXT NOT NULL,
    name TEXT,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed')),
    wa_message_id TEXT,
    error TEXT,
    sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast ON broadcast_recipients(broadcast_id);

-- =========================================================================
-- 8. updated_at helpers
-- =========================================================================
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_products_touch ON products;
CREATE TRIGGER trg_products_touch BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS trg_suppliers_touch ON suppliers;
CREATE TRIGGER trg_suppliers_touch BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- =========================================================================
-- 9. Row Level Security: active staff may read; all writes go through the
--    dashboard server (service role), which checks each permission.
-- =========================================================================
ALTER TABLE staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_recipients ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['staff_roles','suppliers','products','inventory_movements','orders','order_items','broadcasts','broadcast_recipients'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Staff read %1$s" ON %1$I', t);
        EXECUTE format('CREATE POLICY "Staff read %1$s" ON %1$I FOR SELECT TO authenticated USING (is_active_staff(auth.uid()))', t);
    END LOOP;
END $$;

-- Views run with the caller's rights so RLS on the base tables applies.
ALTER VIEW customer_stats SET (security_invoker = true);

-- >>>>>>>>>> 20261119000008_sheets_parity_notifications.sql
-- Migration 8: everything the n8n flow keeps in Google Sheets, plus owner notifications.
--   Sheets → tables:
--     Customer_Leads / Customers → contacts (+ customer_inquiries history)
--     Inventory                  → products (+ inventory_movements)
--     Orders / Order_Items       → orders / order_items
--     Suppliers                  → suppliers
--     Supplier_Requests          → supplier_requests
--     Supplier_Quotes            → supplier_quotes
--     Supplier_Demands           → supplier_demands
--     Customer_Chats / Supplier_Chats / Chat_Log → messages (contacts.kind = customer | supplier)
--   Owner WhatsApp alerts       → notifications
-- The sheet IDs (Lead_ID, ID, Order_ID, Supplier_ID, Request_ID, ...) are kept as *_code columns,
-- so n8n can keep using them. Safe to run more than once.

-- ---------------------------------------------------------------- contacts
ALTER TABLE contacts
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'customer' CHECK (kind IN ('customer', 'supplier')),
    ADD COLUMN IF NOT EXISTS customer_code TEXT,          -- Customers.Customer_ID
    ADD COLUMN IF NOT EXISTS delivery_address TEXT,
    ADD COLUMN IF NOT EXISTS payment_method TEXT,
    ADD COLUMN IF NOT EXISTS last_email_id TEXT,
    ADD COLUMN IF NOT EXISTS offer JSONB;                 -- latest price offer (Offer_* columns)
CREATE INDEX IF NOT EXISTS idx_contacts_kind ON contacts(kind);
CREATE INDEX IF NOT EXISTS idx_contacts_lead_id ON contacts(lead_id);
CREATE INDEX IF NOT EXISTS idx_contacts_customer_code ON contacts(customer_code);

-- Every product a customer asked about (Brand / Model / Storage / Grade / Color / Quantity / Quoted_Price).
CREATE TABLE IF NOT EXISTS customer_inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    wa_id TEXT,
    lead_code TEXT,
    brand TEXT,
    model TEXT,
    storage TEXT,
    grade TEXT,
    color TEXT,
    quantity INTEGER,
    quoted_price NUMERIC(12,2),
    status TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inquiries_contact ON customer_inquiries(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_brand ON customer_inquiries(brand);

-- ---------------------------------------------------------------- products (Inventory sheet)
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS storage TEXT,
    ADD COLUMN IF NOT EXISTS color TEXT,
    ADD COLUMN IF NOT EXISTS grade TEXT,
    ADD COLUMN IF NOT EXISTS market_region TEXT,
    ADD COLUMN IF NOT EXISTS reserved_qty INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS notes TEXT;

-- ---------------------------------------------------------------- suppliers
ALTER TABLE suppliers
    ADD COLUMN IF NOT EXISTS code TEXT,                   -- Suppliers.Supplier_ID
    ADD COLUMN IF NOT EXISTS contact_person TEXT,
    ADD COLUMN IF NOT EXISTS preferred_language TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_code ON suppliers(code) WHERE code IS NOT NULL;

-- ---------------------------------------------------------------- orders
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS handoff_status TEXT,
    ADD COLUMN IF NOT EXISTS payment_method TEXT,
    ADD COLUMN IF NOT EXISTS owner_chat_link TEXT;
ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS item_code TEXT,              -- Order_Items.Order_Item_ID (+ grade)
    ADD COLUMN IF NOT EXISTS grade TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_items_code ON order_items(item_code) WHERE item_code IS NOT NULL;

-- ---------------------------------------------------------------- sourcing
CREATE TABLE IF NOT EXISTS supplier_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_code TEXT NOT NULL UNIQUE,                    -- Request_ID (e.g. SR-20261106192943)
    request_date TIMESTAMPTZ,
    customer_name TEXT,
    wa_id TEXT,
    email TEXT,
    customer_market TEXT,
    brand TEXT,
    model TEXT,
    storage TEXT,
    grade TEXT,
    color TEXT,
    quantity INTEGER,
    status TEXT,
    notes TEXT,
    expires_at TIMESTAMPTZ,
    selected_supplier_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_code TEXT NOT NULL UNIQUE,                      -- Quote_ID
    request_code TEXT,
    supplier_code TEXT,
    supplier_name TEXT,
    contact_person TEXT,
    wa_id TEXT,
    location TEXT,
    brand TEXT,
    model TEXT,
    storage TEXT,
    grade TEXT,
    color TEXT,
    requested_qty INTEGER,
    price_per_unit NUMERIC(12,2),
    currency TEXT,
    delivery_days INTEGER,
    available_qty INTEGER,
    supplier_reply TEXT,
    status TEXT,
    sent_at TIMESTAMPTZ,
    replied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quotes_request ON supplier_quotes(request_code);

CREATE TABLE IF NOT EXISTS supplier_demands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    demand_code TEXT NOT NULL UNIQUE,                     -- Demand_ID
    supplier_code TEXT,
    product_code TEXT,                                    -- Inventory ID (= products.sku)
    expected_unit_price NUMERIC(14,2),
    offered_unit_price NUMERIC(14,2),
    confirmed_quantity INTEGER,
    delivery_time TEXT,
    total_cost NUMERIC(14,2),
    payment_status TEXT,
    tracking_reference TEXT,
    requested_quantity INTEGER,
    delivery_location TEXT,
    demand_date TIMESTAMPTZ,
    status TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- owner notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL DEFAULT 'info',                    -- handoff, order, payment, supplier, error, info
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    wa_id TEXT,                                           -- the customer / supplier it is about
    party TEXT CHECK (party IN ('customer', 'supplier')),
    order_no TEXT,
    request_code TEXT,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(created_at DESC) WHERE read_at IS NULL;

-- ---------------------------------------------------------------- touch + RLS + realtime
DROP TRIGGER IF EXISTS trg_supplier_requests_touch ON supplier_requests;
CREATE TRIGGER trg_supplier_requests_touch BEFORE UPDATE ON supplier_requests FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS trg_supplier_quotes_touch ON supplier_quotes;
CREATE TRIGGER trg_supplier_quotes_touch BEFORE UPDATE ON supplier_quotes FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS trg_supplier_demands_touch ON supplier_demands;
CREATE TRIGGER trg_supplier_demands_touch BEFORE UPDATE ON supplier_demands FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['customer_inquiries','supplier_requests','supplier_quotes','supplier_demands','notifications'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "Staff read %1$s" ON %1$I', t);
        EXECUTE format('CREATE POLICY "Staff read %1$s" ON %1$I FOR SELECT TO authenticated USING (is_active_staff(auth.uid()))', t);
    END LOOP;
END $$;

-- New notifications appear live in the dashboard.
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

-- Default roles: chats are view-only now (reply / AI toggle are Admin-only).
UPDATE staff_roles SET permissions = ARRAY['chats.view','supplier_chats.view','chats.organize','customers.view','notifications.view']
    WHERE name = 'Management';
UPDATE staff_roles SET permissions = array_remove(array_remove(permissions, 'chats.reply'), 'ai.toggle');

-- Admin-only permissions are stripped from custom roles (extends migration 7's trigger).
CREATE OR REPLACE FUNCTION strip_admin_only_permissions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.permissions := ARRAY(
        SELECT DISTINCT p FROM unnest(NEW.permissions) p
        WHERE p NOT IN ('staff.manage', 'settings.view', 'chats.reply', 'ai.toggle')
    );
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;
