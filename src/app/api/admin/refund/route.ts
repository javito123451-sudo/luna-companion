import { isAdmin, unauthorized } from "@/lib/admin-auth";
import { refundPayment } from "@/lib/payments";
import { tr } from "@/lib/texts";
import { getBot } from "@/bot/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const chargeId = String(body.charge_id ?? "").trim();
  const reason = String(body.reason ?? "reembolso manual").slice(0, 300);
  if (!chargeId) return Response.json({ error: "charge_id requerido" }, { status: 400 });
  const api = getBot().api;
  try {
    const r = await refundPayment(api, chargeId, reason);
    if (r.status === "refunded") {
      await api.sendMessage(r.telegramId, tr(r.language).refundNotice(r.creditsReverted, r.stars), { parse_mode: "HTML" }).catch(() => undefined);
    }
    return Response.json({ ok: true, ...r });
  } catch (e: any) {
    console.error("[admin/refund]", e);
    return Response.json({ error: e?.description ?? e?.message ?? "error" }, { status: 400 });
  }
}
