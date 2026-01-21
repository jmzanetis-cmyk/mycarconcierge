-- Merch Orders Migration
-- Table for storing merchandise orders from the shop with Printful integration

CREATE TABLE IF NOT EXISTS merch_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    stripe_session_id TEXT UNIQUE,
    stripe_payment_intent TEXT,
    printful_order_id TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal INTEGER NOT NULL DEFAULT 0,
    shipping INTEGER NOT NULL DEFAULT 0,
    tax INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    shipping_name TEXT,
    shipping_address TEXT,
    shipping_city TEXT,
    shipping_state TEXT,
    shipping_zip TEXT,
    shipping_country TEXT DEFAULT 'US',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled')),
    tracking_number TEXT,
    tracking_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merch_orders_member_id ON merch_orders(member_id);
CREATE INDEX IF NOT EXISTS idx_merch_orders_status ON merch_orders(status);
CREATE INDEX IF NOT EXISTS idx_merch_orders_stripe_session ON merch_orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_merch_orders_printful_order ON merch_orders(printful_order_id);
CREATE INDEX IF NOT EXISTS idx_merch_orders_created_at ON merch_orders(created_at DESC);

ALTER TABLE merch_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view own orders" ON merch_orders;
CREATE POLICY "Members can view own orders" ON merch_orders
    FOR SELECT
    USING (auth.uid() = member_id);

DROP POLICY IF EXISTS "Members can insert own orders" ON merch_orders;
CREATE POLICY "Members can insert own orders" ON merch_orders
    FOR INSERT
    WITH CHECK (auth.uid() = member_id);

DROP POLICY IF EXISTS "Service role can manage all orders" ON merch_orders;
CREATE POLICY "Service role can manage all orders" ON merch_orders
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admins can view all orders" ON merch_orders;
CREATE POLICY "Admins can view all orders" ON merch_orders
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can update all orders" ON merch_orders;
CREATE POLICY "Admins can update all orders" ON merch_orders
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

CREATE OR REPLACE FUNCTION update_merch_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_merch_orders_updated_at ON merch_orders;
CREATE TRIGGER trigger_update_merch_orders_updated_at
    BEFORE UPDATE ON merch_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_merch_orders_updated_at();
