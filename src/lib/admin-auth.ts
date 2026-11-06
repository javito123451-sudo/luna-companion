import { timingSafeEqual } from "crypto";

function safeEq(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Endpoints admin: cabecera `x-admin-secret` = ADMIN_UPLOAD_SECRET (o ADMIN_OPS_SECRET para operaciones). */
export function isAdmin(req: Request): boolean {
  const got = req.headers.get("x-admin-secret") ?? "";
  if (!got) return false;
  return [process.env.ADMIN_UPLOAD_SECRET, process.env.ADMIN_OPS_SECRET].some((s) => !!s && s.length >= 8 && safeEq(got, s));
}

export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });

export function isCron(req: Request): boolean {
  const s = process.env.CRON_SECRET;
  return !!s && safeEq(req.headers.get("authorization") ?? "", `Bearer ${s}`);
}
