import { Bot, Context, InlineKeyboard, Keyboard, type Api } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { one, q, tx } from "../lib/db";
import { getBalance, listActiveBatches, listRecentTransactions, restoreAllocations, spendCredits } from "../lib/credits";
import { Asset, deliverUnlocked, sendAsset } from "../lib/content";
import { Companion, generateReply, HistoryMessage } from "../lib/llm";
import { listActivePacks, packTotal, processSuccessfulPayment, refundPayment, sendPackInvoice, validatePreCheckout } from "../lib/payments";
import { detectCrisis, detectMinorSignal, detectProhibitedRequest, parseBirthDate } from "../lib/safety";
import { getSettings, legalUrl } from "../lib/settings";
import { MENU, T } from "../lib/texts";
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

export const mainMenu = () =>
  new Keyboard()
    .text(MENU.chat).text(MENU.gallery).row()
    .text(MENU.shop).text(MENU.balance).row()
    .text(MENU.switch).text(MENU.help)
    .resized()
    .persistent();

const legalKeyboard = () =>
  new InlineKeyboard().url("Términos", legalUrl("terminos")).url("Privacidad", legalUrl("privacidad")).row().url("Reembolsos", legalUrl("reembolsos"));

async function activeCompanion(u: User): Promise<(Companion & { tagline: string | null }) | null> {
  if (!u.active_companion_id) return null;
  return one(`SELECT * FROM companions WHERE id = $1 AND active = 1`, [u.active_companion_id]);
}

async function showWelcome(ctx: Ctx) {
  await ctx.reply(T.welcome(), { ...HTML, reply_markup: new InlineKeyboard().text("Continuar", "onb:go") });
}

async function showAgeGate(ctx: Ctx, u: User) {
  await setPending(u.id, "await_birthdate");
  await ctx.reply(T.ageGate(), { ...HTML, reply_markup: { remove_keyboard: true } });
}

async function showCatalog(ctx: Ctx) {
  const list = await q<any>(`SELECT * FROM companions WHERE active = 1 ORDER BY sort_order, name`);
  await ctx.reply(T.catalogIntro(), { ...HTML, reply_markup: mainMenu() });
  for (const c of list) {
    const kb = new InlineKeyboard().text(`Conversar con ${c.name}`, `comp:${c.slug}`);
    if (c.avatar_file_id || c.avatar_pathname) {
      try {
        const { blobIO } = await import("../lib/content");
        const { InputFile } = await import("grammy");
        const photo = c.avatar_file_id ?? new InputFile(await blobIO.get(c.avatar_pathname), `${c.slug}.jpg`);
        const m = await ctx.replyWithPhoto(photo, { caption: T.companionCard(c), parse_mode: "HTML", reply_markup: kb });
        if (!c.avatar_file_id && m.photo?.length) {
          await q(`UPDATE companions SET avatar_file_id = $2 WHERE id = $1`, [c.id, m.photo[m.photo.length - 1].file_id]);
        }
        continue;
      } catch (e) {
        console.error("[catalog] avatar", c.slug, e);
      }
    }
    await ctx.reply(T.companionCard(c), { ...HTML, reply_markup: kb });
  }
}

async function showShop(ctx: Ctx) {
  const packs = await listActivePacks();
  const kb = new InlineKeyboard();
  for (const p of packs) kb.text(T.packButton({ name: p.name, total: packTotal(p), stars: p.stars, featured: p.featured }), `buy:${p.id}`).row();
  await ctx.reply(T.shopIntro(), { ...HTML, reply_markup: kb });
}

async function showBalance(ctx: Ctx, u: User) {
  const s = await getSettings();
  const [total, batches, txs, freeLeft] = await Promise.all([
    getBalance(u.id),
    listActiveBatches(u.id),
    listRecentTransactions(u.id, 8),
    freeLeftToday(u.id, s.freeMessagesPerDay),
  ]);
  await ctx.reply(T.balance({ total, batches, txs, freeLeft, freePerDay: s.freeMessagesPerDay }), {
    ...HTML,
    reply_markup: new InlineKeyboard().text("Recargar", "shop"),
  });
}

const PAGE = 5;
async function showGallery(ctx: Ctx, u: User, offset = 0) {
  if (!canUseContent(u)) return ctx.reply(T.contentRestricted());
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
  if (!assets.length && offset === 0) return ctx.reply(T.galleryEmpty(comp.name), HTML);
  if (offset === 0) await ctx.reply(T.galleryIntro(comp.name, await getBalance(u.id)), HTML);
  for (const a of assets.slice(0, PAGE)) {
    const kb = a.unlocked
      ? new InlineKeyboard().text("Ver de nuevo", `unl:${a.id}`)
      : new InlineKeyboard().text(`Desbloquear · ${a.credit_cost} créditos`, `unl:${a.id}`);
    try {
      await sendAsset(ctx.api, ctx.chat!.id, a, "preview", { caption: T.previewCaption(a, a.unlocked), reply_markup: kb });
    } catch (e) {
      console.error("[gallery] preview", a.id, e);
    }
  }
  if (assets.length > PAGE) {
    await ctx.reply("¿Quieres ver más?", { reply_markup: new InlineKeyboard().text("Ver más", `gal:${offset + PAGE}`) });
  }
}

async function askCompanion(ctx: Ctx) {
  await ctx.reply(T.needCompanion(), HTML);
  await showCatalog(ctx);
}

/** Devuelve true si el usuario puede seguir; si no, responde y devuelve false. */
async function gate(ctx: Ctx, opts: { allowUnverified?: boolean } = {}): Promise<boolean> {
  const u = ctx.user!;
  if (u.is_blocked) {
    await ctx.reply(T.blocked(), HTML);
    return false;
  }
  if (u.flagged_for_review_at) {
    await ctx.reply(T.underReview(), HTML);
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
    return ctx.reply(T.minorCut(comp.name), HTML);
  }
  if (detectCrisis(text)) {
    await logSafety(u.id, "crisis", null);
    return ctx.reply(T.crisis(), HTML);
  }
  const prohibited = detectProhibitedRequest(text);
  if (prohibited) {
    await logSafety(u.id, "prohibited_request", prohibited);
    return ctx.reply(T.prohibited(), HTML);
  }

  const s = await getSettings();
  const freeLeft = await consumeFreeMessage(u.id, s.freeMessagesPerDay);
  let allocations: { batchId: string; amount: number }[] | null = null;
  if (freeLeft === null) {
    const r = await tx((c) => spendCredits(c, u.id, s.creditsPerMessage, "spend_message", { note: comp.slug }));
    if (!r.ok) {
      return ctx.reply(T.noCredits(s.creditsPerMessage, r.balance), {
        ...HTML,
        reply_markup: new InlineKeyboard().text("Ir a la tienda", "shop"),
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
    reply = await generateReply(comp, history, text);
  } catch (e) {
    console.error("[chat] LLM", e);
    if (allocations) await tx((c) => restoreAllocations(c, u.id, allocations!, "fallo de IA"));
    else await refundFreeMessage(u.id);
    return ctx.reply(T.llmError(), HTML);
  }

  await q(
    `INSERT INTO conversation_messages (user_id, companion_id, role, content, source) VALUES ($1,$2,'user',$3,'telegram'), ($1,$2,'bot',$4,'llm')`,
    [u.id, comp.id, text, reply],
  );
  await ctx.reply(reply);

  if (freeLeft === 3) await ctx.reply(T.freeLeft3(), HTML);
  if (freeLeft === 0) {
    await ctx.reply(T.freeExhausted(s.creditsPerMessage), { ...HTML, reply_markup: new InlineKeyboard().text("Ver la tienda", "shop") });
  }
}

async function handleUnlockRequest(ctx: Ctx, assetId: string) {
  const u = ctx.user!;
  if (!canUseContent(u)) return ctx.reply(T.contentRestricted());
  const asset = await one<Asset>(`SELECT * FROM content_assets WHERE id = $1 AND active`, [assetId]);
  if (!asset) return ctx.reply("Este contenido ya no está disponible.");
  const owned = await one(`SELECT 1 FROM unlocked_content WHERE user_id = $1 AND content_asset_id = $2`, [u.id, assetId]);
  if (owned) return deliverUnlocked(ctx.api, ctx.chat!.id, asset);
  const balance = await getBalance(u.id);
  if (balance < asset.credit_cost) {
    return ctx.reply(T.unlockInsufficient(asset.credit_cost, balance), { ...HTML, reply_markup: new InlineKeyboard().text("Recargar", "shop") });
  }
  await ctx.reply(T.unlockConfirm(asset.credit_cost, balance), {
    ...HTML,
    reply_markup: new InlineKeyboard().text("Confirmar", `unc:${asset.id}`).text("Cancelar", "x"),
  });
}

async function handleUnlockConfirm(ctx: Ctx, assetId: string) {
  const u = ctx.user!;
  if (!canUseContent(u)) return ctx.reply(T.contentRestricted());
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
  if (result.kind === "gone") return ctx.reply("Este contenido ya no está disponible.");
  if (result.kind === "insufficient") {
    return ctx.reply(T.unlockInsufficient(result.cost, result.balance), { ...HTML, reply_markup: new InlineKeyboard().text("Recargar", "shop") });
  }
  await deliverUnlocked(ctx.api, ctx.chat!.id, result.asset);
  if (result.kind === "unlocked") await ctx.reply(T.unlockDone(result.balance), HTML);
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
    let verdict;
    try {
      verdict = await validatePreCheckout({ telegramId: pq.from.id, payload: pq.invoice_payload, currency: pq.currency, totalAmount: pq.total_amount });
    } catch (e) {
      console.error("[pre_checkout]", e);
      verdict = { ok: false as const, error: T.preCheckoutErrors.generic };
    }
    if (verdict.ok) await ctx.answerPreCheckoutQuery(true);
    else await ctx.answerPreCheckoutQuery(false, { error_message: verdict.error });
  });

  bot.use(async (ctx, next) => {
    if (ctx.from && !ctx.from.is_bot) ctx.user = await upsertUser(ctx.from);
    await next();
  });

  bot.on("message:successful_payment", async (ctx) => {
    const sp = ctx.message.successful_payment;
    const out = await processSuccessfulPayment({
      telegramId: ctx.from.id,
      payload: sp.invoice_payload,
      chargeId: sp.telegram_payment_charge_id,
      totalAmount: sp.total_amount,
    });
    if (out.status === "credited") {
      await ctx.reply(T.receipt(out), { ...HTML, reply_markup: mainMenu() });
    } else if (out.status === "unknown_payload") {
      await ctx.reply(`Hemos recibido tu pago (ref. <code>${out.reference}</code>) y lo estamos revisando. Escribe /paysupport si necesitas ayuda.`, HTML);
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
    if (u.is_blocked) return ctx.reply(T.blocked(), HTML);
    if (!u.age_verified_at) return showWelcome(ctx);
    if (!(await gate(ctx))) return;
    await showCatalog(ctx);
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
  bot.command(["companions", "cambiar"], async (ctx) => {
    if (!(await gate(ctx))) return;
    await showCatalog(ctx);
  });
  bot.command("info", async (ctx) => {
    const comp = ctx.user ? await activeCompanion(ctx.user) : null;
    await ctx.reply(T.info(comp?.ai_disclosure_text ?? null), HTML);
  });
  bot.command(["ayuda", "help"], (ctx) => ctx.reply(T.help(), { ...HTML, reply_markup: legalKeyboard() }));
  bot.command(["terminos", "terms"], (ctx) => ctx.reply(T.terms(), { ...HTML, reply_markup: legalKeyboard() }));
  bot.command(["privacidad", "privacy"], async (ctx) => {
    const s = await getSettings();
    await ctx.reply(T.privacy(s.messageRetentionDays), { ...HTML, reply_markup: legalKeyboard() });
  });
  bot.command(["paysupport", "soporte", "support"], async (ctx) => {
    await setPending(ctx.user!.id, "await_support");
    await ctx.reply(T.paySupport(process.env.SUPPORT_CONTACT || null), HTML);
  });
  bot.command("borrar_datos", (ctx) =>
    ctx.reply(T.eraseConfirm(), { ...HTML, reply_markup: new InlineKeyboard().text("Sí, eliminar mis datos", "erase:yes").text("Cancelar", "erase:no") }),
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
        return ctx.reply(T.eraseDone(), { reply_markup: { remove_keyboard: true } });
      }
      return ctx.reply(T.eraseCancelled());
    }
    if (action === "x") {
      await ctx.editMessageReplyMarkup().catch(() => undefined);
      return ctx.reply(T.cancelled());
    }
    if (action === "onb") {
      if (u.is_blocked) return ctx.reply(T.blocked(), HTML);
      if (u.age_verified_at) return showCatalog(ctx);
      return showAgeGate(ctx, u);
    }

    if (!(await gate(ctx))) return;
    switch (action) {
      case "comp": {
        const c = await one<any>(`SELECT * FROM companions WHERE slug = $1 AND active = 1`, [arg]);
        if (!c) return ctx.reply("Esta companion no está disponible.");
        await q(`UPDATE users SET active_companion_id = $2 WHERE id = $1`, [u.id, c.id]);
        await ctx.reply(T.companionChosen(c.name), { ...HTML, reply_markup: mainMenu() });
        return ctx.reply(c.welcome_message);
      }
      case "shop":
        return showShop(ctx);
      case "buy": {
        const pack = await sendPackInvoice(ctx.api, ctx.chat!.id, u.id, arg);
        if (!pack) return ctx.reply(T.preCheckoutErrors.pack);
        return;
      }
      case "gal":
        return showGallery(ctx, u, Number(arg) || 0);
      case "unl":
        return handleUnlockRequest(ctx, arg);
      case "unc":
        return handleUnlockConfirm(ctx, arg);
    }
  });

  bot.on("message:text", async (ctx) => {
    const u = ctx.user!;
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return ctx.reply(T.help(), HTML);

    if (u.pending_action === "await_support") {
      await setPending(u.id, null);
      await q(`INSERT INTO support_tickets (user_id, kind, message) VALUES ($1,'payment',$2)`, [u.id, text.slice(0, 4000)]);
      const admin = process.env.ADMIN_TELEGRAM_ID;
      if (admin) {
        await ctx.api
          .sendMessage(Number(admin), `Nueva consulta de pagos\nUsuario: ${u.telegram_id}\n\n${text.slice(0, 3500)}`)
          .catch((e) => console.error("[support] notify", e));
      }
      return ctx.reply(T.paySupportReceived());
    }

    if (u.is_blocked) return ctx.reply(T.blocked(), HTML);

    if (!u.age_verified_at) {
      if (u.pending_action !== "await_birthdate") return showWelcome(ctx);
      const parsed = parseBirthDate(text);
      if (!parsed) return ctx.reply(T.ageInvalid(), HTML);
      const outcome = await recordBirthDate(u.id, parsed.iso, parsed.age);
      if (outcome === "minor") return ctx.reply(T.ageRejected(), { reply_markup: { remove_keyboard: true } });
      await ctx.reply(T.aiDisclosure(), HTML);
      return showCatalog(ctx);
    }

    if (!(await gate(ctx))) return;

    switch (text) {
      case MENU.chat: {
        const c = await activeCompanion(u);
        return c ? ctx.reply(T.chatHint(c.name), HTML) : askCompanion(ctx);
      }
      case MENU.gallery:
        return showGallery(ctx, u);
      case MENU.shop:
        return showShop(ctx);
      case MENU.balance:
        return showBalance(ctx, u);
      case MENU.switch:
        return showCatalog(ctx);
      case MENU.help:
        return ctx.reply(T.help(), { ...HTML, reply_markup: legalKeyboard() });
    }
    return handleChat(ctx, text);
  });

  bot.on("message", async (ctx) => {
    if (ctx.user?.age_verified_at) await ctx.reply("Por ahora solo puedo leer mensajes de texto.");
  });

  bot.catch((err) => console.error("[bot] error no controlado", err.error));
  return bot;
}

export const BOT_COMMANDS = [
  { command: "start", description: "Inicio" },
  { command: "tienda", description: "Comprar créditos" },
  { command: "saldo", description: "Saldo, caducidad y movimientos" },
  { command: "galeria", description: "Contenido exclusivo" },
  { command: "companions", description: "Cambiar de companion" },
  { command: "info", description: "Aviso sobre la inteligencia artificial" },
  { command: "paysupport", description: "Ayuda con pagos" },
  { command: "terminos", description: "Términos de uso" },
  { command: "privacidad", description: "Privacidad y tus datos" },
  { command: "borrar_datos", description: "Eliminar tus datos" },
  { command: "ayuda", description: "Ayuda" },
];

export async function configureBot(api: Api, webhookUrl: string, secret: string | undefined) {
  await api.setWebhook(webhookUrl, {
    secret_token: secret,
    allowed_updates: ["message", "callback_query", "pre_checkout_query"],
    max_connections: 40,
  });
  await api.setMyCommands(BOT_COMMANDS);
  await api.setMyCommands(BOT_COMMANDS, { language_code: "es" });
  await api.setMyDescription(
    "Luna Companions: conversaciones privadas con compañeras creadas con inteligencia artificial. Servicio exclusivo para mayores de 18 años.",
  );
  await api.setMyShortDescription("Compañeras de IA, conversaciones privadas. Solo +18.");
  await api.setChatMenuButton({ menu_button: { type: "commands" } });
}

let singleton: Bot<Ctx> | null = null;
export function getBot() {
  if (!singleton) singleton = createBot();
  return singleton;
}
