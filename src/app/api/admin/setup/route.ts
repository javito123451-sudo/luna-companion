import { isAdmin, unauthorized } from "@/lib/admin-auth";
import { appUrl } from "@/lib/settings";
import { configureBot, getBot } from "@/bot/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  const url = `${appUrl()}/api/telegram/webhook`;
  await configureBot(getBot().api, url, process.env.TELEGRAM_WEBHOOK_SECRET);
  return GET(req);
}

export async function GET(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  const api = getBot().api;
  const [info, me] = await Promise.all([api.getWebhookInfo(), api.getMe()]);
  return Response.json({
    bot: me.username,
    webhook: {
      url: info.url,
      pending_update_count: info.pending_update_count,
      last_error_date: info.last_error_date ?? null,
      last_error_message: info.last_error_message ?? null,
      allowed_updates: info.allowed_updates ?? null,
      has_custom_certificate: info.has_custom_certificate,
    },
  });
}
