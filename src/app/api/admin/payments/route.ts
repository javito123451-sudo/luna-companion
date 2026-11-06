import { isAdmin, unauthorized } from "@/lib/admin-auth";
import { q } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  const rows = await q(
    `SELECT p.id, p.pack_id, p.stars, p.credits, p.status, p.telegram_payment_charge_id AS charge_id, p.credits_reverted,
            p.created_at, p.paid_at, p.refunded_at, u.telegram_id::text AS telegram_id
       FROM payments p JOIN users u ON u.id = p.user_id
      WHERE p.status <> 'pending' OR p.created_at > now() - interval '1 day'
      ORDER BY p.created_at DESC LIMIT 200`,
  );
  return Response.json({ payments: rows });
}
