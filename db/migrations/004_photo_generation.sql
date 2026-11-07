-- Migración 004 · Fotos generadas bajo petición en el chat. Idempotente.

-- Contenido: origen y trazabilidad de las fotos generadas.
ALTER TABLE content_assets
  ADD COLUMN IF NOT EXISTS source            text NOT NULL DEFAULT 'gallery',
  ADD COLUMN IF NOT EXISTS requested_by      uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS generation_prompt text,
  ADD COLUMN IF NOT EXISTS moderation        jsonb;
CREATE INDEX IF NOT EXISTS content_assets_source_idx ON content_assets(source, created_at DESC);

-- Apariencia fija de cada companion para el generador (en inglés).
ALTER TABLE companions ADD COLUMN IF NOT EXISTS image_profile text;
UPDATE companions SET image_profile = CASE slug
  WHEN 'luna'   THEN 'a 26-year-old Latina woman with long dark wavy hair, warm brown eyes, tanned skin and a warm playful smile'
  WHEN 'claire' THEN 'a 27-year-old brunette woman with long wavy hair with caramel highlights, hazel eyes, elegant and confident'
  WHEN 'aurora' THEN 'a 25-year-old Black woman with long box braids with gold cuffs, radiant brown skin, expressive dark eyes and a bold smile'
  WHEN 'sakura' THEN 'a 28-year-old Japanese woman with long straight black hair worn loose, refined mature features and a serene smile'
  ELSE image_profile END
WHERE image_profile IS NULL;

-- Peticiones de foto (pendientes de confirmar, generadas, rechazadas o fallidas).
CREATE TABLE IF NOT EXISTS photo_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  companion_id  uuid NOT NULL REFERENCES companions(id),
  user_text     text NOT NULL,
  scene         text,
  caption_es    text,
  caption_en    text,
  credits       integer NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','generating','done','rejected','failed','cancelled')),
  reason        text,
  asset_id      uuid REFERENCES content_assets(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS photo_requests_user_idx ON photo_requests(user_id, created_at DESC);

-- Ajustes: precio y límite diario por usuario.
INSERT INTO app_settings (key, value) VALUES
  ('credits_per_generated_photo', '40'),
  ('photo_gen_daily_limit', '10')
ON CONFLICT (key) DO NOTHING;
