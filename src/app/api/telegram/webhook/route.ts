import { webhookCallback } from "grammy";
import { getBot } from "@/bot/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const handle = webhookCallback(getBot(), "std/http", {
      secretToken: process.env.TELEGRAM_WEBHOOK_SECRET,
      timeoutMilliseconds: 55_000,
      onTimeout: "return",
    });
    return await handle(req);
  } catch (err) {
    console.error("[webhook] error", err);
    // 200 para que Telegram no reintente indefinidamente un update que falla siempre.
    return new Response("OK", { status: 200 });
  }
}
