import { isAdmin, unauthorized } from "@/lib/admin-auth";
import { q } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  return Response.json({ companions: await q(`SELECT slug, name, active FROM companions ORDER BY sort_order, name`) });
}
