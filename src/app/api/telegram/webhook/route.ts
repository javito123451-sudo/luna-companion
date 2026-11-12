import { webhookCallback } from "grammy";
import { getBot } from "@/bot/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  // Fail closed: without Telegram's webhook secret, this endpoint must not
  // accept unauthenticated updates (including payment confirmations).
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    console.error("[webhook] TELEGRAM_WEBHOOK_SECRET missing or invalid");
    return Response.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  try {
    const handle = webhookCallback(getBot(), "std/http", {
      secretToken: secret,
      timeoutMilliseconds: 55_000,
      onTimeout: "return",
    });
    return await handle(req);
  } catch (err) {
    // A 5xx tells Telegram to retry the update; 200 would silently discard it.
    console.error("[webhook] error", err);
    return new Response("Webhook processing failed", { status: 500 });
  }
}
