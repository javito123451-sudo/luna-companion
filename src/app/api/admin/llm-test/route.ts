import { isAdmin, unauthorized } from "@/lib/admin-auth";
import { one } from "@/lib/db";
import { buildSystemPrompt, generateReply } from "@/lib/llm";
import { SAFETY_BLOCK } from "@/lib/safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  const { slug, message } = await req.json().catch(() => ({}));
  const c = await one<any>(`SELECT * FROM companions WHERE slug = $1`, [slug]);
  if (!c) return Response.json({ error: "companion no encontrada" }, { status: 404 });
  const prompt = buildSystemPrompt(c);
  const reply = await generateReply(c, [], String(message ?? "Hola, ¿quién eres?").slice(0, 500));
  return Response.json({
    slug,
    promptFromDb: prompt.startsWith(c.system_prompt.trim()),
    safetyBlockIncluded: prompt.includes(SAFETY_BLOCK),
    promptChars: prompt.length,
    reply,
  });
}
