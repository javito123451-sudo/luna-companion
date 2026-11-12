import { Bot, Context, InlineKeyboard, Keyboard, type Api } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { one, q, tx } from "../lib/db";
import { getBalance, listActiveBatches, listRecentTransactions, restoreAllocations, spendCredits } from "../lib/credits";
import { Asset, createAsset, deliverUnlocked, sendAsset } from "../lib/content";
import { buildImagePrompt, detectPhotoIntent, photoIO, refUrl } from "../lib/photogen";
import { Companion, generateReply, HistoryMessage } from "../lib/llm";
import { listActivePacks, packTotal, processSuccessfulPayment, refundPayment, sendPackInvoice, validatePreCheckout } from "../lib/payments";
import { detectCrisis, detectMinorSignal, detectProhibitedRequest, parseBirthDate } from "../lib/safety";
import { appUrl, freeLimitFor, getSettings, legalUrl } from "../lib/settings";
import { detectLang, Lang, menuAction, MENUS, tr } from "../lib/texts";
import {
  canUseContent,
  consumeFreeMessage,
  eraseUserData,
  flagMinorSignal,
  freeLeftToday,
  logSafety,
  recordBirthDate,
  refundFreeMessage,
  setPending,
  upsertUser,
  User,
} from "../lib/users";

type Ctx = Context & { user?: User };

const HTML = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };

/** Idioma del usuario: el guardado, o el de su Telegram si aún no está cargado. */
const langOf = (ctx: Ctx): Lang => (ctx.user?.language as Lang) ?? detectLang(ctx.from?.language_code);
const L = (ctx: Ctx) => tr(langOf(ctx));

/** Campos de la companion en el idioma del usuario (columna i18n con traducciones). */
function loc<C extends { i18n?: any }>(c: C, lang: Lang): C {
  const t = lang === "en" ? c.i18n?.en : null;
  return t ? { ...c, ...Object.fromEntries(Object.entries(t).filter(([, v]) => !!v)) } : c;
}

export const mainMenu = (lang: Lang = "es") => {
  const M = MENUS[lang];
  return new Keyboard()
    .text(M.chat).text(M.gallery).row()
    .text(M.shop).text(M.balance).row()
    .text(M.switch).text(M.help)
    .resized()
    .persistent();
};

const legalKeyboard = (ctx: Ctx) => {
  const lang = langOf(ctx);
  const b = tr(lang).btn;
  return new InlineKeyboard()
    .url(b.terms, legalUrl("terminos", lang))
    .url(b.privacy, legalUrl("privacidad", lang))
    .row()
    .url(b.refunds, legalUrl("reembolsos", lang));
};

async function activeCompanion(u: User): Promise<(Companion & { tagline: string | null }) | null> {
  if (!u.active_companion_id) return null;
  return one(`SELECT * FROM companions WHERE id = $1 AND active = 1`, [u.active_companion_id]);
}

/** Cambia esta versión al sustituir public/welcome-*.jpg para que Telegram no reutilice el banner antiguo. */
const WELCOME_VERSION = "v1";

/** Envía el banner de marca con un texto; reutiliza el file_id de Telegram tras el primer envío. */
async function sendBanner(ctx: Ctx, caption: string, reply_markup: any) {
  const lang = langOf(ctx);
  const opts = { ...HTML, reply_markup };
  const base = appUrl();
  if (base) {
    const key = `welcome_file_id_${lang}_${WELCOME_VERSION}`;
    try {
      const cached = await one<{ value: string }>(`SELECT value FROM app_settings WHERE key = $1`, [key]);
      const photo = cached?.value ?? `${base}/welcome-${lang}.jpg?${WELCOME_VERSION}`;
      const m = await ctx.replyWithPhoto(photo, { caption, ...opts });
      if (!cached && m.photo?.length) {
        await q(
          `INSERT INTO app_settings (key, value) VALUES ($1, to_jsonb($2::text)) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [key, m.photo[m.photo.length - 1].file_id],
        );
      }
      return;
    } catch (e) {
      console.error("[banner]", e);
    }
  }
  await ctx.reply(caption, opts);
}

async function showWelcome(ctx: Ctx) {
  await sendBanner(ctx, L(ctx).welcome(), new InlineKeyboard().text(L(ctx).btn.continue, "onb:go"));
}

async function showAgeGate(ctx: Ctx, u: User) {
  await setPending(u.id, "await_birthdate");
  await ctx.reply(L(ctx).ageGate(), { ...HTML, reply_markup: { remove_keyboard: true } });
}

async function showCatalog(ctx: Ctx, opts: { banner?: boolean } = {}) {
  const list = await q<any>(`SELECT * FROM companions WHERE active = 1 ORDER BY sort_order, name`);
  if (opts.banner) await sendBanner(ctx, L(ctx).catalogIntro(), mainMenu(langOf(ctx)));
  else await ctx.reply(L(ctx).catalogIntro(), { ...HTML, reply_markup: mainMenu(langOf(ctx)) });
  for (const raw of list) {
    const c = loc(raw, langOf(ctx));
    const kb = new InlineKeyboard().text(L(ctx).btn.talkTo(c.name), `comp:${c.slug}`);
    if (c.avatar_file_id || c.avatar_pathname) {
      try {
        const { blobIO } = await import("../lib/content");
        const { InputFile } = await import("grammy");
        const photo = c.avatar_file_id ?? new InputFile(await blobIO.get(c.avatar_pathname), `${c.slug}.jpg`);
        const m = await ctx.replyWithPhoto(photo, { caption: L(ctx).companionCard(c), parse_mode: "HTML", reply_markup: kb });
        if (!c.avatar_file_id && m.photo?.length) {
          await q(`UPDATE companions SET avatar_file_id = $2 WHERE id = $1`, [c.id, m.photo[m.photo.length - 1].file_id]);
        }
        continue;
      } catch (e) {
        console.error("[catalog] avatar", c.slug, e);
      }
    }
    await ctx.reply(L(ctx).companionCard(c), { ...HTML, reply_markup: kb });
  }
}

async function showShop(ctx: Ctx) {
  const packs = await listActivePacks();
  const kb = new InlineKeyboard();
  for (const p of packs) kb.text(L(ctx).packButton({ name: p.name, total: packTotal(p), stars: p.stars, featured: p.featured }), `buy:${p.id}`).row();
  await ctx.reply(L(ctx).shopIntro(), { ...HTML, reply_markup: kb });
}

async function showBalance(ctx: Ctx, u: User) {
  const s = await getSettings();
  const [total, batches, txs, freeLeft] = await Promise.all([
    getBalance(u.id),
    listActiveBatches(u.id),
    listRecentTransactions(u.id, 8),
    freeLeftToday(u.id, freeLimitFor(u, s)),
  ]);
  await ctx.reply(L(ctx).balance({ total, batches, txs, freeLeft, freePerDay: freeLimitFor(u, s) }), {
    ...HTML,
    reply_markup: new InlineKeyboard().text(L(ctx).btn.topUp, "shop"),
  });
}

const PAGE = 5;
async function showGallery(ctx: Ctx, u: User, offset = 0) {
  if (!canUseContent(u)) return ctx.reply(L(ctx).contentRestricted());
  const comp = await activeCompanion(u);
  if (!comp) return askCompanion(ctx);
  const assets = await q<Asset & { unlocked: boolean }>(
    `SELECT a.*, (uc.user_id IS NOT NULL) AS unlocked FROM content_assets a
       LEFT JOIN unlocked_content uc ON uc.content_asset_id = a.id AND uc.user_id = $2
      WHERE a.companion_id = $1 AND a.active
      ORDER BY CASE a.tier WHEN 'basico' THEN 1 WHEN 'medio' THEN 2 ELSE 3 END, a.created_at
      LIMIT $3 OFFSET $4`,
    [comp.id, u.id, PAGE + 1, offset],
  );
  if (!assets.length && offset === 0) return ctx.reply(L(ctx).galleryEmpty(comp.name), HTML);
  if (offset === 0) await ctx.reply(L(ctx).galleryIntro(comp.name, await getBalance(u.id)), HTML);
  for (const a of assets.slice(0, PAGE)) {
    const kb = a.unlocked
      ? new InlineKeyboard().text(L(ctx).btn.seeAgain, `unl:${a.id}`)
      : new InlineKeyboard().text(L(ctx).btn.unlock(a.credit_cost), `unl:${a.id}`);
    try {
      await sendAsset(ctx.api, ctx.chat!.id, a, "preview", { caption: L(ctx).previewCaption(a, a.unlocked), reply_markup: kb });
    } catch (e) {
      console.error("[gallery] preview", a.id, e);
    }
  }
  if (assets.length > PAGE) {
    await ctx.reply(L(ctx).moreQuestion(), { reply_markup: new InlineKeyboard().text(L(ctx).btn.seeMore, `gal:${offset + PAGE}`) });
  }
}

async function askCompanion(ctx: Ctx) {
  await ctx.reply(L(ctx).needCompanion(), HTML);
  await showCatalog(ctx);
}

/** Devuelve true si el usuario puede seguir; si no, responde y devuelve false. */
async function gate(ctx: Ctx, opts: { allowUnverified?: boolean } = {}): Promise<boolean> {
  const u = ctx.user!;
  if (u.is_blocked) {
    await ctx.reply(L(ctx).blocked(), HTML);
    return false;
  }
  if (u.flagged_for_review_at) {
    await ctx.reply(L(ctx).underReview(), HTML);
    return false;
  }
  if (!u.age_verified_at && !opts.allowUnverified) {
    await showWelcome(ctx);
    return false;
  }
  return true;
}

async function handleChat(ctx: Ctx, text: string) {
  const u = ctx.user!;
  const comp = await activeCompanion(u);
  if (!comp) return askCompanion(ctx);

  const minor = detectMinorSignal(text);
  if (minor) {
    await flagMinorSignal(u.id, minor);
    return ctx.reply(L(ctx).minorCut(comp.name), HTML);
  }
  if (detectCrisis(text)) {
    await logSafety(u.id, "crisis", null);
    return ctx.reply(L(ctx).crisis(), HTML);
  }
  const prohibited = detectProhibitedRequest(text);
  if (prohibited) {
    await logSafety(u.id, "prohibited_request", prohibited);
    return ctx.reply(L(ctx).prohibited(), HTML);
  }

  if (detectPhotoIntent(text)) return handlePhotoRequest(ctx, comp, text);

  const s = await getSettings();
  const freeLeft = await consumeFreeMessage(u.id, freeLimitFor(u, s));
  let allocations: { batchId: string; amount: number }[] | null = null;
  if (freeLeft === null) {
    const r = await tx((c) => spendCredits(c, u.id, s.creditsPerMessage, "spend_message", { note: comp.slug }));
    if (!r.ok) {
      return ctx.reply(L(ctx).noCredits(s.creditsPerMessage, r.balance), {
        ...HTML,
        reply_markup: new InlineKeyboard().text(L(ctx).btn.goShop, "shop"),
      });
    }
    allocations = r.allocations;
  }

  await ctx.replyWithChatAction("typing").catch(() => undefined);
  const history = (
    await q<{ role: "user" | "bot"; content: string }>(
      `SELECT role, content FROM conversation_messages WHERE user_id = $1 AND companion_id = $2 ORDER BY created_at DESC LIMIT 16`,
      [u.id, comp.id],
    )
  ).reverse() as HistoryMessage[];

  let reply: string;
  try {
    reply = await generateReply(comp, history, text, langOf(ctx));
  } catch (e) {
    console.error("[chat] LLM", e);
    if (allocations) await tx((c) => restoreAllocations(c, u.id, allocations!, "fallo de IA"));
    else await refundFreeMessage(u.id);
    return ctx.reply(L(ctx).llmError(), HTML);
  }

  await q(
    `INSERT INTO conversation_messages (user_id, companion_id, role, content, source) VALUES ($1,$2,'user',$3,'telegram'), ($1,$2,'bot',$4,'llm')`,
    [u.id, comp.id, text, reply],
  );
  await ctx.reply(reply);

  if (freeLeft === 3) await ctx.reply(L(ctx).freeLeft3(), HTML);
  if (freeLeft === 0) {
    await ctx.reply(L(ctx).freeExhausted(s.creditsPerMessage), { ...HTML, reply_markup: new InlineKeyboard().text(L(ctx).btn.seeShop, "shop") });
  }
}

async function handleUnlockRequest(ctx: Ctx, assetId: string) {
  const u = ctx.user!;
  if (!canUseContent(u)) return ctx.reply(L(ctx).contentRestricted());
  const asset = await one<Asset>(`SELECT * FROM content_assets WHERE id = $1 AND active`, [assetId]);
  if (!asset) return ctx.reply(L(ctx).contentGone());
  const owned = await one(`SELECT 1 FROM unlocked_content WHERE user_id = $1 AND content_asset_id = $2`, [u.id, assetId]);
  if (owned) return deliverUnlocked(ctx.api, ctx.chat!.id, asset, langOf(ctx));
  const balance = await getBalance(u.id);
  if (balance < asset.credit_cost) {
    return ctx.reply(L(ctx).unlockInsufficient(asset.credit_cost, balance), { ...HTML, reply_markup: new InlineKeyboard().text(L(ctx).btn.topUp, "shop") });
  }
  await ctx.reply(L(ctx).unlockConfirm(asset.credit_cost, balance), {
    ...HTML,
    reply_markup: new InlineKeyboard().text(L(ctx).btn.confirm, `unc:${asset.id}`).text(L(ctx).btn.cancel, "x"),
  });
}

async function handleUnlockConfirm(ctx: Ctx, assetId: string) {
  const u = ctx.user!;
  if (!canUseContent(u)) return ctx.reply(L(ctx).contentRestricted());
  const result = await tx(async (c) => {
    const asset = await one<Asset>(`SELECT * FROM content_assets WHERE id = $1 AND active`, [assetId], c);
    if (!asset) return { kind: "gone" as const };
    const ins = await one(
      `INSERT INTO unlocked_content (user_id, content_asset_id, credits_spent) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, content_asset_id) DO NOTHING RETURNING 1 AS ok`,
      [u.id, assetId, asset.credit_cost],
      c,
    );
    if (!ins) return { kind: "owned" as const, asset };
    const r = await spendCredits(c, u.id, asset.credit_cost, "spend_unlock", { assetId });
    if (!r.ok) throw Object.assign(new Error("insufficient"), { balance: r.balance, cost: asset.credit_cost });
    return { kind: "unlocked" as const, asset, balance: r.balanceAfter };
  }).catch((e) => {
    if (e?.message === "insufficient") return { kind: "insufficient" as const, balance: e.balance as number, cost: e.cost as number };
    throw e;
  });

  await ctx.editMessageReplyMarkup().catch(() => undefined);
  if (result.kind === "gone") return ctx.reply(L(ctx).contentGone());
  if (result.kind === "insufficient") {
    return ctx.reply(L(ctx).unlockInsufficient(result.cost, result.balance), { ...HTML, reply_markup: new InlineKeyboard().text(L(ctx).btn.topUp, "shop") });
  }
  await deliverUnlocked(ctx.api, ctx.chat!.id, result.asset, langOf(ctx));
  if (result.kind === "unlocked") await ctx.reply(L(ctx).unlockDone(result.balance), HTML);
}

// ── Fotos personalizadas ──────────────────────────────────────────────────
/** Ofrece una foto de la galería que el usuario aún no tenga (alternativa cuando no se puede generar). */
async function offerGallery(ctx: Ctx, comp: { id: string; name: string }, intro?: string) {
  const u = ctx.user!;
  const a = await one<Asset>(
    `SELECT a.* FROM content_assets a
      WHERE a.companion_id = $1 AND a.active
        AND NOT EXISTS (SELECT 1 FROM unlocked_content uc WHERE uc.content_asset_id = a.id AND uc.user_id = $2)
      ORDER BY random() LIMIT 1`,
    [comp.id, u.id],
  );
  if (intro) await ctx.reply(intro, HTML);
  if (!a) return ctx.reply(L(ctx).galleryEmpty(comp.name), HTML);
  await ctx.reply(L(ctx).photoFromGallery(comp.name), HTML);
  return sendAsset(ctx.api, ctx.chat!.id, a, "preview", {
    caption: L(ctx).previewCaption(a, false),
    reply_markup: new InlineKeyboard().text(L(ctx).btn.unlock(a.credit_cost), `unl:${a.id}`),
  });
}

async function handlePhotoRequest(ctx: Ctx, comp: Companion & { id: string }, text: string) {
  const u = ctx.user!;
  if (!canUseContent(u)) return ctx.reply(L(ctx).contentRestricted());
  if (!photoIO.enabled()) return offerGallery(ctx, comp, L(ctx).photoUnavailable());
  const s = await getSettings();
  const today = await one<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM photo_requests
      WHERE user_id = $1 AND status IN ('generating','done') AND created_at > (date_trunc('day', now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid')`,
    [u.id],
  );
  if ((today?.n ?? 0) >= s.photoGenDailyLimit) return offerGallery(ctx, comp, L(ctx).photoLimit(s.photoGenDailyLimit));

  await ctx.replyWithChatAction("typing").catch(() => undefined);
  let plan;
  try {
    plan = await photoIO.planScene(text, comp.name);
  } catch (e) {
    console.error("[photo] plan", e);
    return offerGallery(ctx, comp, L(ctx).photoUnavailable());
  }
  if (!plan.allowed || !plan.scene.trim()) {
    await logSafety(u.id, "photo_refused", (plan.reason || "").slice(0, 200));
    return ctx.reply(L(ctx).photoRefused(comp.name), HTML);
  }
  const req = await one<{ id: string }>(
    `INSERT INTO photo_requests (user_id, companion_id, user_text, scene, caption_es, caption_en, credits)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [u.id, comp.id, text.slice(0, 1000), plan.scene, plan.caption_es.slice(0, 80), plan.caption_en.slice(0, 80), s.creditsPerGeneratedPhoto],
  );
  const caption = langOf(ctx) === "en" ? plan.caption_en : plan.caption_es;
  return ctx.reply(L(ctx).photoOffer(comp.name, caption, s.creditsPerGeneratedPhoto), {
    ...HTML,
    reply_markup: new InlineKeyboard()
      .text(L(ctx).btn.createPhoto(s.creditsPerGeneratedPhoto), `pg:${req!.id}`)
      .row()
      .text(L(ctx).btn.viewGallery, "gal:0")
      .text(L(ctx).btn.cancel, "x"),
  });
}

async function handlePhotoGenerate(ctx: Ctx, requestId: string) {
  const u = ctx.user!;
  if (!canUseContent(u)) return ctx.reply(L(ctx).contentRestricted());
  await ctx.editMessageReplyMarkup().catch(() => undefined);
  const r = await one<any>(
    `UPDATE photo_requests SET status = 'generating', updated_at = now()
      WHERE id = $1 AND user_id = $2 AND status = 'pending' AND created_at > now() - interval '1 hour'
      RETURNING *`,
    [requestId, u.id],
  );
  if (!r) return ctx.reply(L(ctx).photoExpired());
  const comp = await one<any>(`SELECT * FROM companions WHERE id = $1`, [r.companion_id]);

  const spend = await tx((c) => spendCredits(c, u.id, r.credits, "spend_photo", { note: comp.slug }));
  if (!spend.ok) {
    await q(`UPDATE photo_requests SET status = 'cancelled', reason = 'saldo insuficiente', updated_at = now() WHERE id = $1`, [r.id]);
    return ctx.reply(L(ctx).unlockInsufficient(r.credits, spend.balance), {
      ...HTML,
      reply_markup: new InlineKeyboard().text(L(ctx).btn.topUp, "shop"),
    });
  }

  await ctx.reply(L(ctx).photoGenerating(comp.name), HTML);
  await ctx.replyWithChatAction("upload_photo").catch(() => undefined);
  const prompt = buildImagePrompt(comp.image_profile || `${comp.name}, an elegant adult woman`, r.scene);
  try {
    const image = await photoIO.generate(prompt, comp.avatar_pathname ? refUrl(comp.slug) : null);
    const check = await photoIO.checkImage(image);
    if (!check.ok) throw Object.assign(new Error("revisión de seguridad"), { rejected: true, details: check.details });

    const asset = await createAsset({
      file: image,
      companionId: comp.id,
      companionSlug: comp.slug,
      tier: "medio",
      creditCost: r.credits,
      caption: r.caption_es,
      captionEn: r.caption_en,
      source: "generated",
      active: false, // se guarda siempre; pasa a la galería pública solo si lo apruebas en el panel
      requestedBy: u.id,
      generationPrompt: prompt,
      moderation: check.details,
    });
    await q(
      `INSERT INTO unlocked_content (user_id, content_asset_id, credits_spent) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [u.id, asset!.id, r.credits],
    );
    await q(`UPDATE photo_requests SET status = 'done', asset_id = $2, updated_at = now() WHERE id = $1`, [r.id, asset!.id]);
    const full = await one<Asset>(`SELECT * FROM content_assets WHERE id = $1`, [asset!.id]);
    await deliverUnlocked(ctx.api, ctx.chat!.id, full!, langOf(ctx));
    return ctx.reply(L(ctx).photoDone(spend.balanceAfter), HTML);
  } catch (e: any) {
    console.error("[photo] generate", e?.message ?? e);
    await tx((c) => restoreAllocations(c, u.id, spend.allocations, "foto no generada"));
    await q(`UPDATE photo_requests SET status = $2, reason = $3, updated_at = now() WHERE id = $1`, [
      r.id,
      e?.rejected ? "rejected" : "failed",
      String(e?.message ?? "error").slice(0, 300),
    ]);
    if (e?.rejected) await logSafety(u.id, "photo_output_rejected", JSON.stringify(e?.details ?? {}).slice(0, 300));
    return offerGallery(ctx, comp, L(ctx).photoFailed());
  }
}

export function createBot(opts: { token?: string; botInfo?: UserFromGetMe; testEnv?: boolean } = {}) {
  const token = opts.token ?? process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN");
  const bot = new Bot<Ctx>(token, {
    botInfo: opts.botInfo,
    client: { environment: opts.testEnv ?? process.env.TELEGRAM_TEST_ENV === "1" ? "test" : "prod" },
  });

  bot.use(async (ctx, next) => {
    const r = await one(`INSERT INTO telegram_updates (update_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING 1 AS ok`, [ctx.update.update_id]);
    if (!r) return;
    await next();
  });

  bot.on("pre_checkout_query", async (ctx) => {
    const pq = ctx.preCheckoutQuery;
    let verdict: Awaited<ReturnType<typeof validatePreCheckout>>;
    try {
      verdict = await validatePreCheckout({ telegramId: pq.from.id, payload: pq.invoice_payload, currency: pq.currency, totalAmount: pq.total_amount });
    } catch (e) {
      console.error("[pre_checkout]", e);
      verdict = { ok: false, code: "generic" };
    }
    if (verdict.ok) await ctx.answerPreCheckoutQuery(true);
    else await ctx.answerPreCheckoutQuery(false, { error_message: L(ctx).preCheckoutErrors[verdict.code] });
  });

  bot.use(async (ctx, next) => {
    if (ctx.from && !ctx.from.is_bot) ctx.user = await upsertUser({ ...ctx.from, language: detectLang(ctx.from.language_code) });
    await next();
  });

  bot.on("message:successful_payment", async (ctx) => {
    const sp = ctx.message.successful_payment;
    const out = await processSuccessfulPayment({
      telegramId: ctx.from.id,
      payload: sp.invoice_payload,
      chargeId: sp.telegram_payment_charge_id,
      totalAmount: sp.total_amount,
      currency: sp.currency,
    });
    if (out.status === "credited") {
      await ctx.reply(L(ctx).receipt(out), { ...HTML, reply_markup: mainMenu(langOf(ctx)) });
    } else if (out.status === "unknown_payload" || out.status === "invalid_payment") {
      await ctx.reply(L(ctx).paymentUnknown(out.reference), HTML);
    }
  });

  bot.on("message:refunded_payment", async (ctx) => {
    const rp = (ctx.message as any).refunded_payment;
    try {
      await refundPayment(null, rp.telegram_payment_charge_id, "reembolso notificado por Telegram", { alreadyRefundedByTelegram: true });
    } catch (e) {
      console.error("[refunded_payment]", e);
    }
  });

  bot.command("start", async (ctx) => {
    const u = ctx.user!;
    if (u.is_blocked) return ctx.reply(L(ctx).blocked(), HTML);
    if (!u.age_verified_at) return showWelcome(ctx);
    if (!(await gate(ctx))) return;
    await showCatalog(ctx, { banner: true });
  });

  bot.command(["tienda", "shop"], async (ctx) => {
    if (!(await gate(ctx))) return;
    await showShop(ctx);
  });
  bot.command(["saldo", "balance"], async (ctx) => {
    if (!(await gate(ctx, { allowUnverified: true }))) return;
    await showBalance(ctx, ctx.user!);
  });
  bot.command(["galeria", "gallery"], async (ctx) => {
    if (!(await gate(ctx))) return;
    await showGallery(ctx, ctx.user!);
  });
  bot.command(["foto", "photo"], async (ctx) => {
    if (!(await gate(ctx))) return;
    const comp = await activeCompanion(ctx.user!);
    if (!comp) return askCompanion(ctx);
    await handlePhotoRequest(ctx, comp, ctx.match?.trim() || "una foto tuya");
  });
  bot.command(["companions", "cambiar"], async (ctx) => {
    if (!(await gate(ctx))) return;
    await showCatalog(ctx);
  });
  bot.command("info", async (ctx) => {
    const comp = ctx.user ? await activeCompanion(ctx.user) : null;
    await ctx.reply(L(ctx).info(comp ? loc(comp as any, langOf(ctx)).ai_disclosure_text : null), HTML);
  });
  bot.command(["ayuda", "help"], (ctx) => ctx.reply(L(ctx).help(), { ...HTML, reply_markup: legalKeyboard(ctx) }));
  bot.command(["terminos", "terms"], (ctx) => ctx.reply(L(ctx).terms(), { ...HTML, reply_markup: legalKeyboard(ctx) }));
  bot.command(["privacidad", "privacy"], async (ctx) => {
    const s = await getSettings();
    await ctx.reply(L(ctx).privacy(s.messageRetentionDays), { ...HTML, reply_markup: legalKeyboard(ctx) });
  });
  bot.command(["paysupport", "soporte", "support"], async (ctx) => {
    await setPending(ctx.user!.id, "await_support");
    await ctx.reply(L(ctx).paySupport(process.env.SUPPORT_CONTACT || null), HTML);
  });
  bot.command("borrar_datos", (ctx) =>
    ctx.reply(L(ctx).eraseConfirm(), { ...HTML, reply_markup: new InlineKeyboard().text(L(ctx).btn.eraseYes, "erase:yes").text(L(ctx).btn.cancel, "erase:no") }),
  );

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const u = ctx.user!;
    await ctx.answerCallbackQuery().catch(() => undefined);
    const [action, arg] = data.split(":");

    if (action === "erase") {
      await ctx.editMessageReplyMarkup().catch(() => undefined);
      if (arg === "yes") {
        await eraseUserData(u.id);
        return ctx.reply(L(ctx).eraseDone(), { reply_markup: { remove_keyboard: true } });
      }
      return ctx.reply(L(ctx).eraseCancelled());
    }
    if (action === "x") {
      await ctx.editMessageReplyMarkup().catch(() => undefined);
      return ctx.reply(L(ctx).cancelled());
    }
    if (action === "onb") {
      if (u.is_blocked) return ctx.reply(L(ctx).blocked(), HTML);
      if (u.age_verified_at) return showCatalog(ctx);
      return showAgeGate(ctx, u);
    }

    if (!(await gate(ctx))) return;
    switch (action) {
      case "comp": {
        const c = await one<any>(`SELECT * FROM companions WHERE slug = $1 AND active = 1`, [arg]);
        if (!c) return ctx.reply(L(ctx).companionUnavailable());
        await q(`UPDATE users SET active_companion_id = $2 WHERE id = $1`, [u.id, c.id]);
        await ctx.reply(L(ctx).companionChosen(c.name), { ...HTML, reply_markup: mainMenu(langOf(ctx)) });
        return ctx.reply(loc(c, langOf(ctx)).welcome_message);
      }
      case "shop":
        return showShop(ctx);
      case "buy": {
        const pack = await sendPackInvoice(ctx.api, ctx.chat!.id, u.id, arg, langOf(ctx));
        if (!pack) return ctx.reply(L(ctx).preCheckoutErrors.pack);
        return;
      }
      case "gal":
        return showGallery(ctx, u, Number(arg) || 0);
      case "unl":
        return handleUnlockRequest(ctx, arg);
      case "unc":
        return handleUnlockConfirm(ctx, arg);
      case "pg":
        return handlePhotoGenerate(ctx, arg);
    }
  });

  bot.on("message:text", async (ctx) => {
    const u = ctx.user!;
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return ctx.reply(L(ctx).help(), HTML);

    if (u.pending_action === "await_support") {
      await setPending(u.id, null);
      await q(`INSERT INTO support_tickets (user_id, kind, message) VALUES ($1,'payment',$2)`, [u.id, text.slice(0, 4000)]);
      const admin = process.env.ADMIN_TELEGRAM_ID;
      if (admin) {
        await ctx.api
          .sendMessage(Number(admin), `Nueva consulta de pagos\nUsuario: ${u.telegram_id}\n\n${text.slice(0, 3500)}`)
          .catch((e) => console.error("[support] notify", e));
      }
      return ctx.reply(L(ctx).paySupportReceived());
    }

    if (u.is_blocked) return ctx.reply(L(ctx).blocked(), HTML);

    if (!u.age_verified_at) {
      if (u.pending_action !== "await_birthdate") return showWelcome(ctx);
      const parsed = parseBirthDate(text);
      if (!parsed) return ctx.reply(L(ctx).ageInvalid(), HTML);
      const outcome = await recordBirthDate(u.id, parsed.iso, parsed.age);
      if (outcome === "minor") return ctx.reply(L(ctx).ageRejected(), { reply_markup: { remove_keyboard: true } });
      await ctx.reply(L(ctx).aiDisclosure(), HTML);
      return showCatalog(ctx);
    }

    if (!(await gate(ctx))) return;

    switch (menuAction(text)) {
      case "chat": {
        const c = await activeCompanion(u);
        return c ? ctx.reply(L(ctx).chatHint(c.name), HTML) : askCompanion(ctx);
      }
      case "gallery":
        return showGallery(ctx, u);
      case "shop":
        return showShop(ctx);
      case "balance":
        return showBalance(ctx, u);
      case "switch":
        return showCatalog(ctx);
      case "help":
        return ctx.reply(L(ctx).help(), { ...HTML, reply_markup: legalKeyboard(ctx) });
    }
    return handleChat(ctx, text);
  });

  bot.on("message", async (ctx) => {
    if (ctx.user?.age_verified_at) await ctx.reply(L(ctx).textOnly());
  });

  bot.catch((err) => console.error("[bot] error no controlado", err.error));
  return bot;
}

export const BOT_COMMANDS = [
  { command: "start", description: "Inicio" },
  { command: "tienda", description: "Comprar créditos" },
  { command: "saldo", description: "Saldo, caducidad y movimientos" },
  { command: "galeria", description: "Contenido exclusivo" },
  { command: "foto", description: "Pedir una foto personalizada" },
  { command: "companions", description: "Cambiar de companion" },
  { command: "info", description: "Aviso sobre la inteligencia artificial" },
  { command: "paysupport", description: "Ayuda con pagos" },
  { command: "terminos", description: "Términos de uso" },
  { command: "privacidad", description: "Privacidad y tus datos" },
  { command: "borrar_datos", description: "Eliminar tus datos" },
  { command: "ayuda", description: "Ayuda" },
];

export const BOT_COMMANDS_EN = [
  { command: "start", description: "Home" },
  { command: "tienda", description: "Buy credits" },
  { command: "saldo", description: "Balance, expiry and activity" },
  { command: "galeria", description: "Exclusive content" },
  { command: "foto", description: "Ask for a custom photo" },
  { command: "companions", description: "Change companion" },
  { command: "info", description: "Artificial intelligence notice" },
  { command: "paysupport", description: "Payment help" },
  { command: "terminos", description: "Terms of use" },
  { command: "privacidad", description: "Privacy and your data" },
  { command: "borrar_datos", description: "Delete your data" },
  { command: "ayuda", description: "Help" },
];

export async function configureBot(api: Api, webhookUrl: string, secret: string | undefined) {
  await api.setWebhook(webhookUrl, {
    secret_token: secret,
    allowed_updates: ["message", "callback_query", "pre_checkout_query"],
    max_connections: 40,
  });
  // Por defecto (cualquier idioma) en inglés; para Telegram en español, en español.
  await api.setMyCommands(BOT_COMMANDS_EN);
  await api.setMyCommands(BOT_COMMANDS, { language_code: "es" });
  await api.setMyDescription(
    "Dreamora: private conversations with companions created with artificial intelligence. Adults only (18+).",
  );
  await api.setMyDescription(
    "Dreamora: conversaciones privadas con compañeras creadas con inteligencia artificial. Servicio exclusivo para mayores de 18 años.",
    { language_code: "es" },
  );
  await api.setMyShortDescription("AI companions, private conversations. 18+ only.");
  await api.setMyShortDescription("Compañeras de IA, conversaciones privadas. Solo +18.", { language_code: "es" });
  await api.setChatMenuButton({ menu_button: { type: "commands" } });
}

let singleton: Bot<Ctx> | null = null;
export function getBot() {
  if (!singleton) singleton = createBot();
  return singleton;
}
