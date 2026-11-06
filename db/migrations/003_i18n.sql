-- Migración 003 · Idiomas (español + inglés). Idempotente.
ALTER TABLE users ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'es';
ALTER TABLE companions ADD COLUMN IF NOT EXISTS i18n jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS caption_en text;

-- El saludo de cada companion se muestra cada vez que se elige, no solo tras verificar la edad.
UPDATE companions SET welcome_message = regexp_replace(welcome_message, '^✅\s*Verificación completada\.\s*', '')
  WHERE welcome_message LIKE '✅%';

UPDATE companions SET i18n = jsonb_build_object('en', jsonb_build_object(
  'tagline', 'Affectionate, warm and always ready to listen.',
  'personality_summary', '26-year-old Latina woman, dark-haired, warm and attentive. Affectionate, fun and spontaneous.',
  'welcome_message', 'Hi! I''m Luna 💜 How''s your day going?',
  'ai_disclosure_text', 'Luna is an artificial intelligence character, not a real person. Conversations and content are AI-generated.'
)) WHERE slug = 'luna';

UPDATE companions SET i18n = jsonb_build_object('en', jsonb_build_object(
  'tagline', 'Charismatic, self-assured and with a humour that hooks you.',
  'personality_summary', '27-year-old woman, blonde with blue eyes, elegant and confident. Charismatic, fun and thoughtful.',
  'welcome_message', 'Hey! I''m Claire ✨ Tell me, how are you doing?',
  'ai_disclosure_text', 'Claire is an artificial intelligence character, not a real person. Conversations and content are AI-generated.'
)) WHERE slug = 'claire';

UPDATE companions SET i18n = jsonb_build_object('en', jsonb_build_object(
  'tagline', 'Magnetic, empathetic and always up for a good conversation.',
  'personality_summary', '25-year-old Black woman, confident, creative and magnetic. Affectionate, fun and very expressive.',
  'welcome_message', 'Hey! I''m Aurora 💫 What''s new with you?',
  'ai_disclosure_text', 'Aurora is an artificial intelligence character, not a real person. Conversations and content are AI-generated.'
)) WHERE slug = 'aurora';

UPDATE companions SET i18n = jsonb_build_object('en', jsonb_build_object(
  'tagline', 'Tender, attentive and with a calm charm.',
  'personality_summary', '28-year-old Japanese woman, gentle, sensitive, intelligent and empathetic. Tender and deeply close.',
  'welcome_message', 'Hi, I''m Sakura 🌸 I''m glad you''re here.',
  'ai_disclosure_text', 'Sakura is an artificial intelligence character, not a real person. Conversations and content are AI-generated.'
)) WHERE slug = 'sakura';
