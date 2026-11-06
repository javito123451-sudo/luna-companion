# Luna Companions

Bot de Telegram de AI companions para adultos (+18). Next.js 14 (App Router) + grammY + Neon Postgres + Vercel Blob (privado). Pagos con Telegram Stars (XTR).

## Estructura
- `src/bot/bot.ts` — bot (onboarding, chat, tienda, galería, comandos).
- `src/lib/` — créditos (FIFO atómico), pagos Stars, contenido, seguridad, textos, cron, métricas.
- `src/app/api/telegram/webhook` — webhook de Telegram.
- `src/app/api/admin/*` — API admin (cabecera `x-admin-secret`).
- `src/app/admin` — panel admin. `src/app/legal/*` — páginas legales.
- `db/migrations/` — `000_baseline.sql` (esquema previo) y `001_launch.sql` (lanzamiento, idempotente).
- `tests/e2e.ts` — pruebas end-to-end (Postgres real + Telegram/Blob/OpenAI simulados).

## Pruebas
```
DB_DRIVER=pg DATABASE_URL=postgres://... LLM_MOCK=1 NEXT_PUBLIC_APP_URL=https://example.test npm run test:e2e
```

## Variables
Ver `.env.example`.

## Puesta en marcha (un comando)
Requisitos: Node 20+, git, GitHub CLI (`gh auth login`) y Vercel CLI (`npm i -g vercel` y `vercel login`).

```
node scripts/setup.mjs
```
Enlaza el proyecto de Vercel, limpia variables obsoletas, crea y conecta el Blob store privado,
crea el repo privado en GitHub, hace push, conecta Git con Vercel y despliega a producción.
