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
