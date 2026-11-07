import { isAdmin, unauthorized } from "@/lib/admin-auth";
import { setCompanionReference } from "@/lib/content";
import { one, q } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  return Response.json({
    companions: await q(`SELECT slug, name, active, (avatar_pathname IS NOT NULL) AS has_reference FROM companions ORDER BY sort_order, name`),
  });
}

/** Sube la foto de referencia de una companion (multipart: companion, file, ai_confirm=yes). */
export async function POST(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  const form = await req.formData();
  const file = form.get("file");
  const slug = String(form.get("companion") ?? "");
  if (form.get("ai_confirm") !== "yes")
    return Response.json({ error: "Debes confirmar que la imagen es 100 % IA y representa a un personaje ficticio adulto." }, { status: 400 });
  if (!(file instanceof File) || !file.size) return Response.json({ error: "Falta el archivo" }, { status: 400 });
  if (file.size > 4 * 1024 * 1024) return Response.json({ error: "Máximo 4 MB" }, { status: 400 });
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return Response.json({ error: "Formato admitido: JPG, PNG o WebP" }, { status: 400 });
  const c = await one<{ id: string; slug: string }>(`SELECT id, slug FROM companions WHERE slug = $1`, [slug]);
  if (!c) return Response.json({ error: "Companion no encontrada" }, { status: 400 });
  await setCompanionReference(c.id, c.slug, Buffer.from(await file.arrayBuffer()));
  return Response.json({ ok: true });
}
