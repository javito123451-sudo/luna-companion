import { isAdmin, unauthorized } from "@/lib/admin-auth";
import { createAsset } from "@/lib/content";
import { one, q } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIERS = ["basico", "medio", "premium"] as const;
const MAX_BYTES = 15 * 1024 * 1024;

export async function GET(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  const rows = await q(
    `SELECT a.id, a.tier, a.credit_cost, a.caption, a.active, a.created_at, c.name AS companion, c.slug,
            COUNT(uc.user_id)::int AS sales, COALESCE(SUM(uc.credits_spent),0)::int AS credits
       FROM content_assets a JOIN companions c ON c.id = a.companion_id
       LEFT JOIN unlocked_content uc ON uc.content_asset_id = a.id
      GROUP BY a.id, c.name, c.slug ORDER BY a.created_at DESC`,
  );
  return Response.json({ assets: rows });
}

export async function POST(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  const form = await req.formData();
  const file = form.get("file");
  const slug = String(form.get("companion") ?? "");
  const tier = String(form.get("tier") ?? "") as (typeof TIERS)[number];
  const cost = Number(form.get("credit_cost"));
  const caption = String(form.get("caption") ?? "").trim().slice(0, 500) || null;
  if (form.get("ai_confirm") !== "yes")
    return Response.json({ error: "Debes confirmar que el contenido es 100 % generado por IA y representa a un personaje ficticio adulto." }, { status: 400 });
  if (!(file instanceof File) || !file.size) return Response.json({ error: "Falta el archivo" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Máximo 15 MB" }, { status: 400 });
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return Response.json({ error: "Formato admitido: JPG, PNG o WebP" }, { status: 400 });
  if (!TIERS.includes(tier)) return Response.json({ error: "Tier inválido" }, { status: 400 });
  if (!Number.isInteger(cost) || cost < 1 || cost > 10000) return Response.json({ error: "Coste inválido" }, { status: 400 });
  const comp = await one<{ id: string; slug: string }>(`SELECT id, slug FROM companions WHERE slug = $1`, [slug]);
  if (!comp) return Response.json({ error: "Companion no encontrada" }, { status: 400 });
  try {
    const created = await createAsset({
      file: Buffer.from(await file.arrayBuffer()),
      companionId: comp.id,
      companionSlug: comp.slug,
      tier,
      creditCost: cost,
      caption,
    });
    return Response.json({ ok: true, id: created?.id });
  } catch (e: any) {
    console.error("[admin/assets] upload", e);
    return Response.json({ error: `No se pudo subir: ${e?.message ?? "error"}` }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "string") return Response.json({ error: "id requerido" }, { status: 400 });
  const row = await one(
    `UPDATE content_assets SET active = COALESCE($2, active), credit_cost = COALESCE($3, credit_cost), updated_at = now()
      WHERE id = $1 RETURNING id, active, credit_cost`,
    [body.id, typeof body.active === "boolean" ? body.active : null, Number.isInteger(body.credit_cost) && body.credit_cost > 0 ? body.credit_cost : null],
  );
  return row ? Response.json({ ok: true, asset: row }) : Response.json({ error: "no encontrado" }, { status: 404 });
}
