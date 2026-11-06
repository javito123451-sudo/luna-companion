import { get, put, del } from "@vercel/blob";
import { InputFile, Api } from "grammy";
import { one, q } from "./db";
import { Lang, tr } from "./texts";

export type Asset = {
  id: string;
  companion_id: string;
  tier: string;
  credit_cost: number;
  caption: string | null;
  caption_en?: string | null;
  pathname: string | null;
  preview_pathname: string | null;
  telegram_file_id: string | null;
  telegram_preview_file_id: string | null;
  active: boolean;
};

const BLOB_ACCESS = "private" as const;

/** Sustituible en tests. */
export const blobIO = {
  async put(pathname: string, body: Buffer, contentType: string) {
    const r = await put(pathname, body, { access: BLOB_ACCESS, contentType, addRandomSuffix: true });
    return { url: r.url, pathname: r.pathname };
  },
  async get(pathname: string): Promise<Buffer> {
    const r = await get(pathname, { access: BLOB_ACCESS });
    if (!r || r.statusCode !== 200 || !r.stream) throw new Error(`blob no encontrado: ${pathname}`);
    const chunks: Uint8Array[] = [];
    const reader = (r.stream as ReadableStream<Uint8Array>).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    return Buffer.concat(chunks);
  },
  async del(urls: string[]) {
    if (urls.length) await del(urls);
  },
};

/** Normaliza la imagen (elimina EXIF) y genera la vista previa difuminada. */
export async function processImage(input: Buffer): Promise<{ full: Buffer; preview: Buffer }> {
  const sharp = (await import("sharp")).default;
  const full = await sharp(input).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  const preview = await sharp(input)
    .rotate()
    .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
    .blur(38)
    .modulate({ brightness: 0.92, saturation: 0.9 })
    .jpeg({ quality: 70 })
    .toBuffer();
  return { full, preview };
}

export async function createAsset(input: {
  file: Buffer;
  companionId: string;
  companionSlug: string;
  tier: "basico" | "medio" | "premium";
  creditCost: number;
  caption: string | null;
  captionEn?: string | null;
}) {
  const { full, preview } = await processImage(input.file);
  const base = `content/${input.companionSlug}/${input.tier}`;
  const original = await blobIO.put(`${base}/asset.jpg`, full, "image/jpeg");
  const blurred = await blobIO.put(`${base}/preview.jpg`, preview, "image/jpeg");
  return one<{ id: string }>(
    `INSERT INTO content_assets (companion_id, tier, credit_cost, caption, caption_en, storage_url, pathname, blurred_preview_url, preview_pathname, media_type, active, ai_generated_confirmed)
     VALUES ($1,$2,$3,$4,$9,$5,$6,$7,$8,'photo',true,true) RETURNING id`,
    [input.companionId, input.tier, input.creditCost, input.caption, original.url, original.pathname, blurred.url, blurred.pathname, input.captionEn ?? null],
  );
}

/**
 * Envía un asset por el bot (nunca una URL pública). Reutiliza el file_id de Telegram en reenvíos.
 * El contenido completo se envía con protect_content (no se puede reenviar ni guardar).
 */
export async function sendAsset(
  api: Api,
  chatId: number,
  asset: Asset,
  mode: "preview" | "full",
  opts: { caption: string; reply_markup?: any },
) {
  const isPreview = mode === "preview";
  const cachedId = isPreview ? asset.telegram_preview_file_id : asset.telegram_file_id;
  const pathname = isPreview ? asset.preview_pathname : asset.pathname;
  if (!cachedId && !pathname) throw new Error(`asset ${asset.id} sin archivo`);
  const photo = cachedId ?? new InputFile(await blobIO.get(pathname!), isPreview ? "preview.jpg" : "luna.jpg");
  const msg = await api.sendPhoto(chatId, photo, {
    caption: opts.caption,
    parse_mode: "HTML",
    has_spoiler: true,
    protect_content: true,
    reply_markup: opts.reply_markup,
  });
  if (!cachedId && msg.photo?.length) {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    await q(
      `UPDATE content_assets SET ${isPreview ? "telegram_preview_file_id" : "telegram_file_id"} = $2, updated_at = now() WHERE id = $1`,
      [asset.id, fileId],
    );
  }
  return msg;
}

export async function deliverUnlocked(api: Api, chatId: number, asset: Asset, lang: Lang = "es") {
  return sendAsset(api, chatId, asset, "full", { caption: tr(lang).previewCaption(asset, true) });
}
