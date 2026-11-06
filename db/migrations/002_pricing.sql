-- Migración 002 · Ajuste de economía (idempotente)
-- 15 mensajes gratis el día de registro, 5 los días siguientes; 3 créditos por mensaje.
INSERT INTO app_settings (key, value) VALUES ('free_messages_first_day', '15')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
UPDATE app_settings SET value = '5', updated_at = now() WHERE key = 'free_messages_per_day';
UPDATE app_settings SET value = '3', updated_at = now() WHERE key = 'credits_per_message';
