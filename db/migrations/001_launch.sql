-- Luna Companions · Migración 001 · Lanzamiento comercial
-- Idempotente: se puede ejecutar más de una vez.

-- ── Ajustes configurables ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app_settings (key, value) VALUES
  ('free_messages_per_day', '15'),
  ('credits_per_message', '2'),
  ('message_retention_days', '90'),
  ('credit_expiry_months', '12')
ON CONFLICT (key) DO NOTHING;

-- ── Packs de créditos (precios editables) ───────────────────────────
CREATE TABLE IF NOT EXISTS credit_packs (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  credits     integer NOT NULL CHECK (credits > 0),
  bonus_pct   integer NOT NULL DEFAULT 0 CHECK (bonus_pct BETWEEN 0 AND 100),
  stars       integer NOT NULL CHECK (stars > 0),
  featured    boolean NOT NULL DEFAULT false,
  active      boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO credit_packs (id, name, credits, bonus_pct, stars, featured, sort_order) VALUES
  ('starter', 'Starter', 100,  0,  100,  false, 1),
  ('popular', 'Popular', 300,  10, 300,  true,  2),
  ('premium', 'Premium', 800,  20, 800,  false, 3),
  ('vip',     'VIP',     2000, 30, 2000, false, 4)
ON CONFLICT (id) DO NOTHING;

-- ── Usuarios: cumplimiento, cuota diaria y estado ───────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_name            text,
  ADD COLUMN IF NOT EXISTS terms_accepted_at     timestamptz,
  ADD COLUMN IF NOT EXISTS is_blocked            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_reason        text,
  ADD COLUMN IF NOT EXISTS blocked_at            timestamptz,
  ADD COLUMN IF NOT EXISTS flagged_for_review_at timestamptz,
  ADD COLUMN IF NOT EXISTS pending_action        text,
  ADD COLUMN IF NOT EXISTS free_msgs_day         date,
  ADD COLUMN IF NOT EXISTS free_msgs_used        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_seen_at          timestamptz,
  ADD COLUMN IF NOT EXISTS data_erased_at        timestamptz;

-- La fecha de nacimiento no puede cambiarse una vez fijada.
CREATE OR REPLACE FUNCTION users_lock_birth_date() RETURNS trigger AS $$
BEGIN
  IF OLD.birth_date IS NOT NULL AND NEW.birth_date IS NOT NULL
     AND NEW.birth_date <> OLD.birth_date THEN
    RAISE EXCEPTION 'birth_date is immutable';
  END IF;
  -- Un bloqueo por minoría de edad es permanente.
  IF OLD.blocked_reason = 'minor_declared' AND
     (NEW.is_blocked = false OR NEW.blocked_reason IS DISTINCT FROM 'minor_declared') THEN
    RAISE EXCEPTION 'minor block is permanent';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_users_lock_birth_date ON users;
CREATE TRIGGER trg_users_lock_birth_date BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION users_lock_birth_date();

-- ── Companions ──────────────────────────────────────────────────────
ALTER TABLE companions
  ADD COLUMN IF NOT EXISTS avatar_pathname text,
  ADD COLUMN IF NOT EXISTS avatar_file_id  text,
  ADD COLUMN IF NOT EXISTS sort_order      integer NOT NULL DEFAULT 0;

-- Todas las companions son adultas de 25 años o más.
UPDATE companions c SET
  system_prompt = regexp_replace(c.system_prompt, '(^|[^0-9])(1[0-9]|2[0-4]) años', '\1' || a.age || ' años', 'g'),
  personality_summary = regexp_replace(coalesce(c.personality_summary, ''), '(^|[^0-9])(1[0-9]|2[0-4]) años', '\1' || a.age || ' años', 'g')
FROM (VALUES ('claire', '27'), ('luna', '26'), ('sakura', '28'), ('aurora', '25')) AS a(slug, age)
WHERE c.slug = a.slug;
UPDATE companions SET sort_order = CASE slug WHEN 'luna' THEN 1 WHEN 'claire' THEN 2 WHEN 'aurora' THEN 3 WHEN 'sakura' THEN 4 ELSE 9 END;

-- ── Contenido ───────────────────────────────────────────────────────
ALTER TABLE content_assets
  ADD COLUMN IF NOT EXISTS pathname                 text,
  ADD COLUMN IF NOT EXISTS blurred_preview_url      text,
  ADD COLUMN IF NOT EXISTS preview_pathname         text,
  ADD COLUMN IF NOT EXISTS media_type               text NOT NULL DEFAULT 'photo',
  ADD COLUMN IF NOT EXISTS active                   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_generated_confirmed   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_file_id         text,
  ADD COLUMN IF NOT EXISTS telegram_preview_file_id text,
  ADD COLUMN IF NOT EXISTS updated_at               timestamptz DEFAULT now();
DO $$ BEGIN
  ALTER TABLE content_assets ADD CONSTRAINT content_assets_tier_chk CHECK (tier IN ('basico','medio','premium'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE content_assets ADD CONSTRAINT content_assets_cost_chk CHECK (credit_cost > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE unlocked_content ADD COLUMN IF NOT EXISTS credits_spent integer;

-- Eliminar placeholders de placehold.co (y cualquier referencia).
DELETE FROM unlocked_content WHERE content_asset_id IN (SELECT id FROM content_assets WHERE storage_url LIKE '%placehold.co%');
UPDATE credit_transactions SET content_asset_id = NULL WHERE content_asset_id IN (SELECT id FROM content_assets WHERE storage_url LIKE '%placehold.co%');
DELETE FROM content_assets WHERE storage_url LIKE '%placehold.co%';

-- ── Pagos ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid NOT NULL REFERENCES users(id),
  pack_id                     text NOT NULL REFERENCES credit_packs(id),
  stars                       integer NOT NULL,
  credits                     integer NOT NULL,
  invoice_payload             text NOT NULL UNIQUE,
  telegram_payment_charge_id  text UNIQUE,
  status                      text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','paid','refunded','failed')),
  batch_id                    uuid REFERENCES credit_batches(id),
  credits_reverted            integer,
  refund_reason               text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  pre_checkout_at             timestamptz,
  paid_at                     timestamptz,
  refunded_at                 timestamptz,
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_user_idx ON payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_paid_idx ON payments(paid_at) WHERE status IN ('paid','refunded');

-- ── Créditos ────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS credit_batches_purchase_reference_uniq
  ON credit_batches(purchase_reference) WHERE purchase_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS credit_batches_fifo_idx
  ON credit_batches(user_id, expires_at) WHERE credits_remaining > 0;
DO $$ BEGIN
  ALTER TABLE credit_batches ADD CONSTRAINT credit_batches_remaining_chk
    CHECK (credits_remaining >= 0 AND credits_remaining <= credits_total);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE credit_transactions
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES payments(id),
  ADD COLUMN IF NOT EXISTS note       text;
CREATE INDEX IF NOT EXISTS credit_transactions_user_idx ON credit_transactions(user_id, created_at DESC);

-- ── Conversación, seguridad y soporte ───────────────────────────────
CREATE INDEX IF NOT EXISTS conversation_messages_user_idx ON conversation_messages(user_id, companion_id, created_at DESC);
CREATE INDEX IF NOT EXISTS conversation_messages_created_idx ON conversation_messages(created_at);

CREATE TABLE IF NOT EXISTS safety_flags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id),
  kind        text NOT NULL,
  matched     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  resolution  text
);
CREATE INDEX IF NOT EXISTS safety_flags_open_idx ON safety_flags(created_at) WHERE reviewed_at IS NULL;

CREATE TABLE IF NOT EXISTS support_tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id),
  kind        text NOT NULL DEFAULT 'payment',
  message     text NOT NULL,
  status      text NOT NULL DEFAULT 'open',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Deduplicación de updates de Telegram (reintentos del webhook).
CREATE TABLE IF NOT EXISTS telegram_updates (
  update_id   bigint PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now()
);
