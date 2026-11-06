-- Esquema existente en producción antes del lanzamiento (referencia / entornos locales).
CREATE TABLE IF NOT EXISTS companions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  tagline text,
  avatar_initial text NOT NULL,
  avatar_gradient_from text NOT NULL,
  avatar_gradient_to text NOT NULL,
  personality_summary text,
  system_prompt text NOT NULL,
  welcome_message text NOT NULL,
  ai_disclosure_text text NOT NULL,
  active integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL CONSTRAINT users_telegram_id_unique UNIQUE,
  telegram_username text,
  onboarding_step text DEFAULT 'start',
  age_verified_at timestamptz,
  birth_date date,
  created_at timestamptz DEFAULT now(),
  active_companion_id uuid REFERENCES companions(id)
);
CREATE TABLE IF NOT EXISTS content_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caption text,
  credit_cost integer NOT NULL,
  storage_url text NOT NULL,
  created_at timestamptz DEFAULT now(),
  tier text DEFAULT 'basico',
  companion_id uuid NOT NULL REFERENCES companions(id)
);
CREATE TABLE IF NOT EXISTS conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  companion_id uuid NOT NULL REFERENCES companions(id),
  role text NOT NULL,
  content text NOT NULL,
  source text,
  intent_id text,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS credit_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  credits_total integer NOT NULL,
  credits_remaining integer NOT NULL,
  source text NOT NULL,
  purchase_reference text,
  purchased_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  warning_7d_sent_at timestamptz,
  warning_2d_sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  batch_id uuid REFERENCES credit_batches(id),
  amount integer NOT NULL,
  type text NOT NULL,
  content_asset_id uuid REFERENCES content_assets(id),
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS unlocked_content (
  user_id uuid NOT NULL REFERENCES users(id),
  content_asset_id uuid NOT NULL REFERENCES content_assets(id),
  unlocked_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, content_asset_id)
);
