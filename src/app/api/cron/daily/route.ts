import { isCron } from "@/lib/admin-auth";
import { runDailyJobs } from "@/lib/cron";
import { getBot } from "@/bot/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isCron(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const result = await runDailyJobs(getBot().api);
  return Response.json(result);
}
