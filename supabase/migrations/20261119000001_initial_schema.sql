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
