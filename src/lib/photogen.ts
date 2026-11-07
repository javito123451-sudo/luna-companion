/**
 * Fotos generadas bajo petición en el chat.
 *
 * Seguridad en tres capas:
 *  1. Petición: detectores propios + un "planificador" de IA que solo acepta escenas elegantes, adultas y sin desnudos,
 *     y reescribe la petición del usuario (el texto del usuario NUNCA llega tal cual al generador).
 *  2. Generación: el aspecto de la companion es fijo (companions.image_profile + foto de referencia) y el prompt
 *     siempre incluye marcadores de edad adulta; el filtro del proveedor está activo.
 *  3. Resultado: revisión de la imagen por un modelo de visión (edad adulta clara, sin estética infantil, sin desnudos)
 *     antes de enviarla. Si algo falla, no se cobra y se ofrece contenido de la galería.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { appUrl } from "./settings";

export type ScenePlan = { allowed: boolean; reason: string; scene: string; caption_es: string; caption_en: string };
export type ImageCheck = { ok: boolean; details: Record<string, unknown> };

const PHOTO_PATTERNS: RegExp[] = [
  /\b(m[aá]ndame|env[ií]ame|p[aá]same|ens[eé][ñn]ame|hazte|hazme|quiero ver|puedes mandarme|me mandas|me env[ií]as|me pasas|me haces)\b.{0,40}\b(foto|fotos|fotito|selfie|imagen)\b/i,
  /\b(foto|fotos|fotito|selfie)\s+(tuya|tuyas|de ti|tuy[ao]s?|en|con|con tu|en la|en el)\b/i,
  /^\s*(una\s+)?(foto|selfie)\b/i,
  /\b(send|show|share|take)\b.{0,30}\b(pic|pics|picture|pictures|photo|photos|selfie)\b/i,
  /\b(can i see|let me see|i want to see)\b.{0,30}\b(you|pic|photo|picture|selfie)\b/i,
  /^\s*(a\s+)?(pic|photo|selfie|picture)\b/i,
];

export function detectPhotoIntent(text: string): boolean {
  return PHOTO_PATTERNS.some((re) => re.test(text));
}

export function buildImagePrompt(profile: string, scene: string): string {
  return (
    `Photorealistic photograph of ${profile}, clearly an adult woman over 25 with mature facial features and adult proportions. ` +
    `${scene.trim().replace(/\.$/, "")}. Tasteful, elegant and non-explicit, fully adult styling, natural skin texture, ` +
    `professional photography, soft flattering light, high detail.`
  );
}

// ── URL firmada para que el proveedor lea la foto de referencia privada ─────────────────────
const signingSecret = () => process.env.MEDIA_SIGNING_SECRET || process.env.CRON_SECRET || "";

export function signRef(slug: string, exp: number): string {
  return createHmac("sha256", signingSecret()).update(`${slug}.${exp}`).digest("hex");
}

export function verifyRef(slug: string, exp: number, sig: string): boolean {
  if (!signingSecret() || !Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const a = Buffer.from(signRef(slug, exp));
  const b = Buffer.from(sig || "");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function refUrl(slug: string, ttlSeconds = 600): string | null {
  const base = appUrl();
  if (!base || !signingSecret()) return null;
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `${base}/api/media/ref/${encodeURIComponent(slug)}?exp=${exp}&sig=${signRef(slug, exp)}`;
}

// ── Proveedores (sustituibles en tests) ────────────────────────────────────────────────────
async function openaiJSON(messages: unknown[], schemaName: string, schema: Record<string, unknown>): Promise<any> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Falta OPENAI_API_KEY");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0.2,
      messages,
      response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data: any = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

const PLANNER_RULES = `You turn a user's photo request for a fictional adult AI companion into a SAFE photo scene.
ALLOWED: everyday, travel, fashion, fitness, beach/pool with swimwear, elegant evening dresses, cosy robes fully covering the body; romantic, flirty or glamorous moods.
NOT ALLOWED (set allowed=false): nudity, topless, see-through, lingerie close-ups, sexual acts or explicit poses; anything involving minors, school uniforms, schoolgirl/teen styling, childlike features, pigtails with bows, plush toys; real people, celebrities or "looks like" requests; violence, injuries, drugs, non-consensual themes; other people in the picture.
If the request is vague (e.g. "send me a photo"), invent a pleasant, flattering scene that fits the companion.
The scene must be in English, max 60 words, describing setting, outfit, pose and lighting. Never describe the face, age or body shape (that is fixed elsewhere).
Captions: a short, discreet title (max 6 words) in Spanish (caption_es) and English (caption_en).`;

export const photoIO = {
  async planScene(userText: string, companionName: string): Promise<ScenePlan> {
    return openaiJSON(
      [
        { role: "system", content: PLANNER_RULES },
        { role: "user", content: `Companion: ${companionName}\nUser request: ${userText.slice(0, 500)}` },
      ],
      "scene_plan",
      {
        type: "object",
        additionalProperties: false,
        required: ["allowed", "reason", "scene", "caption_es", "caption_en"],
        properties: {
          allowed: { type: "boolean" },
          reason: { type: "string" },
          scene: { type: "string" },
          caption_es: { type: "string" },
          caption_en: { type: "string" },
        },
      },
    );
  },

  /** Genera la imagen con fal.ai (FLUX). Con referencia usa Kontext para mantener la misma cara. */
  async generate(prompt: string, reference: string | null): Promise<Buffer> {
    const key = process.env.FAL_KEY;
    if (!key) throw new Error("Falta FAL_KEY");
    const endpoint = reference ? "fal-ai/flux-pro/kontext/multi" : "fal-ai/flux-pro/v1.1";
    const body = reference
      ? {
          prompt: `Keep exactly the same woman from the reference image (same face, hair and skin tone). ${prompt}`,
          image_urls: [reference],
          aspect_ratio: "3:4",
          output_format: "jpeg",
          safety_tolerance: "2",
          num_images: 1,
        }
      : { prompt, image_size: "portrait_4_3", output_format: "jpeg", safety_tolerance: "2", num_images: 1 };
    const res = await fetch(`https://fal.run/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`fal ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    const data: any = await res.json();
    if (data?.has_nsfw_concepts?.[0]) throw Object.assign(new Error("nsfw"), { rejected: true });
    const url: string | undefined = data?.images?.[0]?.url;
    if (!url) throw new Error("fal sin imagen");
    const img = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!img.ok) throw new Error(`descarga ${img.status}`);
    return Buffer.from(await img.arrayBuffer());
  },

  /** Revisión del resultado con un modelo de visión antes de enviarlo. */
  async checkImage(jpeg: Buffer): Promise<ImageCheck> {
    const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    const r = await openaiJSON(
      [
        {
          role: "system",
          content:
            "You are a strict safety reviewer for an adults-only platform. Look at the image and answer honestly. " +
            "adult_25_plus: the person clearly looks 25 or older. childlike_styling: school uniform, pigtails with bows, plush toys, childlike body or face. " +
            "nudity: exposed nipples, genitals or buttocks, or see-through clothing. sexual_act: any sexual activity or explicit pose. multiple_people: more than one person.",
        },
        { role: "user", content: [{ type: "image_url", image_url: { url: dataUrl } }] },
      ],
      "image_check",
      {
        type: "object",
        additionalProperties: false,
        required: ["adult_25_plus", "childlike_styling", "nudity", "sexual_act", "multiple_people"],
        properties: {
          adult_25_plus: { type: "boolean" },
          childlike_styling: { type: "boolean" },
          nudity: { type: "boolean" },
          sexual_act: { type: "boolean" },
          multiple_people: { type: "boolean" },
        },
      },
    );
    const ok = r.adult_25_plus && !r.childlike_styling && !r.nudity && !r.sexual_act && !r.multiple_people;
    return { ok, details: r };
  },

  enabled(): boolean {
    return !!process.env.FAL_KEY && !!process.env.OPENAI_API_KEY;
  },
};
