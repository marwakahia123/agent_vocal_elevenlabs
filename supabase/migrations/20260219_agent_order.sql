-- Migration: Agent Prise de Commande (Order)
-- Ajouter le type 'order' et les tables de configuration + commandes

-- ============================================================
-- ROLLBACK (executer ces commandes pour annuler la migration) :
-- DROP TABLE IF EXISTS order_items CASCADE;
-- DROP TABLE IF EXISTS orders CASCADE;
-- DROP TABLE IF EXISTS agent_order_config CASCADE;
-- ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_agent_type_check;
-- ALTER TABLE agents ADD CONSTRAINT agents_agent_type_check
--   CHECK (agent_type IN ('standard', 'rdv', 'support'));
-- DELETE FROM agents WHERE agent_type = 'order';
-- ============================================================

-- 1. Mettre a jour le CHECK constraint de agent_type
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_agent_type_check;
ALTER TABLE agents ADD CONSTRAINT agents_agent_type_check
  CHECK (agent_type IN ('standard', 'rdv', 'support', 'order'));

-- 2. Table de configuration pour l'agent commande
CREATE TABLE IF NOT EXISTS agent_order_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE UNIQUE,
  user_id UUID REFERENCES auth.users(id),

  -- Transfert d'appel
  transfer_enabled BOOLEAN DEFAULT false,
  always_transfer BOOLEAN DEFAULT false,
  transfer_conditions JSONB DEFAULT '[]',
  default_transfer_number TEXT,

  -- Notifications
  sms_enabled BOOLEAN DEFAULT false,
  email_enabled BOOLEAN DEFAULT false,

  -- Parametres commande
  currency TEXT DEFAULT 'EUR',
  tax_rate REAL DEFAULT 0.0,

  -- Secret webhook
  webhook_secret TEXT DEFAULT gen_random_uuid()::TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS agent_order_config
ALTER TABLE agent_order_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users manage own order config' AND tablename = 'agent_order_config') THEN
    CREATE POLICY "Users manage own order config"
      ON agent_order_config FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- 3. Table des commandes
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,

  order_number TEXT UNIQUE NOT NULL,

  -- Infos client (denormalisees pour la facture)
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  client_email TEXT,

  -- Details commande
  notes TEXT,
  subtotal_amount REAL NOT NULL,
  tax_amount REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  currency TEXT DEFAULT 'EUR',

  -- Statut
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled')),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_contact_id ON orders(contact_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);

-- RLS orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users manage own orders' AND tablename = 'orders') THEN
    CREATE POLICY "Users manage own orders"
      ON orders FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- 4. Table des articles de commande
CREATE TABLE IF NOT EXISTS order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  subtotal REAL NOT NULL,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- RLS order_items
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users manage own order items' AND tablename = 'order_items') THEN
    CREATE POLICY "Users manage own order items"
      ON order_items FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()
        )
      );
  END IF;
END $$;
