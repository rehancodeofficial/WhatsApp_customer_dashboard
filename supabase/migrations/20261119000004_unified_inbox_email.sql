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
