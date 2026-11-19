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
