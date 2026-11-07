import { blobIO } from "@/lib/content";
import { one } from "@/lib/db";
import { verifyRef } from "@/lib/photogen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Foto de referencia de una companion, solo con URL firmada y de corta duración (la usa el generador de imágenes). */
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const url = new URL(req.url);
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";
  if (!verifyRef(params.slug, exp, sig)) return new Response("Forbidden", { status: 403 });
  const c = await one<{ avatar_pathname: string | null }>(`SELECT avatar_pathname FROM companions WHERE slug = $1`, [params.slug]);
  if (!c?.avatar_pathname) return new Response("Not found", { status: 404 });
  const buf = await blobIO.get(c.avatar_pathname);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
  });
}
