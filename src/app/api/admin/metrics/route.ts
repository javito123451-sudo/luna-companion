import { isAdmin, unauthorized } from "@/lib/admin-auth";
import { getMetrics } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  return Response.json(await getMetrics());
}
