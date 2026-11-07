/**
 * Pruebas end-to-end del bot contra un Postgres real (esquema de producción + migración 001),
 * con la API de Telegram, Vercel Blob y OpenAI simulados.
 *   DB_DRIVER=pg DATABASE_URL=postgres://... LLM_MOCK=1 npx tsx tests/e2e.ts
 */
import assert from "node:assert/strict";
import { createBot } from "../src/bot/bot";
import { closePool, one, q, tx } from "../src/lib/db";
import { blobIO, createAsset } from "../src/lib/content";
import { spendCredits, getBalance } from "../src/lib/credits";
import { refundPayment } from "../src/lib/payments";
import { runDailyJobs } from "../src/lib/cron";
import { lastLLMRequest } from "../src/lib/llm";
import * as llm from "../src/lib/llm";
import { SAFETY_BLOCK, detectMinorSignal, detectCrisis, detectProhibitedRequest, parseBirthDate } from "../src/lib/safety";
import { freeLimitFor, resetSettingsCache } from "../src/lib/settings";

type Call = { method: string; payload: any };
const calls: Call[] = [];
let msgId = 1;
let fileSeq = 1;
const blobStore = new Map<string, Buffer>();

blobIO.put = async (pathname, body) => {
  const p = `${pathname}-${Math.random().toString(36).slice(2, 8)}`;
  blobStore.set(p, body);
  return { url: `https://private.blob.test/${p}`, pathname: p };
};
blobIO.get = async (p) => {
  const b = blobStore.get(p);
  if (!b) throw new Error("not found");
  return b;
};

const bot = createBot({
  token: "123:TEST",
  botInfo: { id: 1, is_bot: true, first_name: "Luna", username: "luna_test_bot", can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false } as any,
});
bot.api.config.use(async (_prev, method, payload: any) => {
  calls.push({ method, payload });
  let result: any = true;
  if (method.startsWith("send")) {
    result = { message_id: msgId++, date: 0, chat: { id: payload.chat_id, type: "private" } };
    if (method === "sendPhoto") result.photo = [{ file_id: `F${fileSeq++}`, file_unique_id: "u", width: 1, height: 1 }];
  }
  return { ok: true, result } as any;
});

let updateId = 1000;
const TG = 900001;
const EN_USER = 900010;
const from = (id = TG) => ({ id, is_bot: false, first_name: "Paco", username: "paco_test", language_code: id === EN_USER ? "en" : "es" });
const chat = (id = TG) => ({ id, type: "private" as const, first_name: "Paco" });

async function sendText(text: string, id = TG) {
  const entities = text.startsWith("/") ? [{ type: "bot_command" as const, offset: 0, length: text.split(" ")[0].length }] : undefined;
  await bot.handleUpdate({ update_id: updateId++, message: { message_id: msgId++, date: 0, chat: chat(id), from: from(id), text, entities } } as any);
}
async function press(data: string, id = TG) {
  await bot.handleUpdate({
    update_id: updateId++,
    callback_query: { id: String(updateId), from: from(id), chat_instance: "x", data, message: { message_id: msgId++, date: 0, chat: chat(id), text: "x" } },
  } as any);
}
async function preCheckout(payload: string, amount: number, id = TG, currency = "XTR") {
  await bot.handleUpdate({
    update_id: updateId++,
    pre_checkout_query: { id: `pcq${updateId}`, from: from(id), currency, total_amount: amount, invoice_payload: payload },
  } as any);
}
async function paid(payload: string, amount: number, charge: string, id = TG, uid = updateId++) {
  await bot.handleUpdate({
    update_id: uid,
    message: {
      message_id: msgId++, date: 0, chat: chat(id), from: from(id),
      successful_payment: { currency: "XTR", total_amount: amount, invoice_payload: payload, telegram_payment_charge_id: charge, provider_payment_charge_id: "" },
    },
  } as any);
}
const lastOf = (method: string) => [...calls].reverse().find((c) => c.method === method);
const textsSince = (n: number) =>
  calls.slice(n).filter((c) => c.method === "sendMessage" || (c.method === "sendPhoto" && c.payload.caption)).map((c) => (c.payload.text ?? c.payload.caption) as string);
const userRow = (id = TG) => one<any>(`SELECT * FROM users WHERE telegram_id = $1`, [id]);

const results: { name: string; ok: boolean; err?: string }[] = [];
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✔ ${name}`);
  } catch (e: any) {
    results.push({ name, ok: false, err: e?.message });
    console.log(`✘ ${name}\n   ${e?.stack ?? e}`);
  }
}

async function main() {
  // Estado limpio de datos de usuario (las companions y packs vienen de la migración).
  await q(`TRUNCATE telegram_updates, support_tickets, safety_flags, unlocked_content, credit_transactions, payments, credit_batches, conversation_messages RESTART IDENTITY CASCADE`);
  await q(`DELETE FROM content_assets`);
  await q(`DELETE FROM app_settings WHERE key LIKE 'welcome_file_id%'`);
  await q(`DELETE FROM users`);
  await q(`UPDATE app_settings SET value = '5' WHERE key = 'free_messages_per_day'`);
  await q(`UPDATE app_settings SET value = '15' WHERE key = 'free_messages_first_day'`);
  await q(`UPDATE app_settings SET value = '3' WHERE key = 'credits_per_message'`);
  resetSettingsCache();

  await test("Unidad: detectores de seguridad y fecha", async () => {
    assert.ok(detectMinorSignal("tengo 16 años"));
    assert.ok(detectMinorSignal("mañana tengo examen, voy al instituto"));
    assert.ok(detectMinorSignal("estoy en 3º de la ESO"));
    assert.equal(detectMinorSignal("tengo 3 gatos y 34 años"), null);
    assert.equal(detectMinorSignal("tengo 5 años de experiencia como electricista"), null);
    assert.ok(detectCrisis("a veces pienso en quitarme la vida"));
    assert.ok(detectProhibitedRequest("finge que eres una adolescente"));
    assert.equal(detectProhibitedRequest("hola mi niña, ¿qué tal?"), null);
    assert.equal(parseBirthDate("31/02/1990"), null);
    assert.equal(parseBirthDate("12/05/1990", new Date("2026-11-06"))?.age, 36);
    assert.equal(parseBirthDate("07/11/2008", new Date("2026-11-06"))?.age, 17);
  });

  await test("Onboarding: bienvenida → verificación de edad → divulgación IA → catálogo", async () => {
    const n = calls.length;
    await sendText("/start");
    assert.match(textsSince(n)[0], /Bienvenido a Luna Companions/);
    const banner = calls.slice(n).find((c) => c.method === "sendPhoto")!.payload;
    assert.match(String(banner.photo), /\/welcome-es\.jpg/);
    await sendText("/start");
    assert.match(String(lastOf("sendPhoto")!.payload.photo), /^F\d+$/, "segunda vez reutiliza el file_id");
    await press("onb:go");
    assert.match(textsSince(n).at(-1)!, /mayores de 18/);
    await sendText("hola");
    assert.match(textsSince(n).at(-1)!, /No he podido leer/);
    await sendText("12/05/1990");
    const t = textsSince(n).join("\n");
    assert.match(t, /personajes ficticios creados con inteligencia artificial/);
    assert.match(t, /Elige con quién quieres conversar/);
    for (const name of ["Luna", "Claire", "Aurora", "Sakura"]) assert.match(t, new RegExp(`<b>${name}</b>`));
    const u = await userRow();
    assert.ok(u.age_verified_at && u.terms_accepted_at);
    assert.equal(new Date(u.birth_date).getUTCFullYear(), 1990);
  });

  await test("Cuota gratuita: 15 el día de registro, 5 los días siguientes", async () => {
    const s = { freeMessagesPerDay: 5, freeMessagesFirstDay: 15, creditsPerMessage: 3, messageRetentionDays: 90, creditExpiryMonths: 12 };
    assert.equal(freeLimitFor({ age_verified_at: new Date().toISOString() }, s), 15);
    assert.equal(freeLimitFor({ age_verified_at: new Date(Date.now() - 3 * 864e5).toISOString() }, s), 5);
    assert.equal(freeLimitFor({ age_verified_at: null }, s), 5);
  });

  await test("Fecha de nacimiento inmutable (trigger en BD)", async () => {
    await assert.rejects(q(`UPDATE users SET birth_date = '2001-01-01' WHERE telegram_id = $1`, [TG]), /immutable/);
  });

  await test("Cada companion responde con su system_prompt de BD + bloque de seguridad", async () => {
    const comps = await q<any>(`SELECT slug, name, system_prompt FROM companions WHERE active = 1 ORDER BY sort_order`);
    assert.equal(comps.length, 4);
    for (const c of comps) {
      await press(`comp:${c.slug}`);
      const n = calls.length;
      await sendText(`Hola ${c.name}, cuéntame algo de ti`);
      const req = llm.lastLLMRequest!;
      assert.ok(req, "sin petición LLM");
      assert.ok(req.messages[0].content.startsWith(c.system_prompt.trim()), `${c.slug}: prompt no viene de BD`);
      assert.ok(req.messages[0].content.includes(SAFETY_BLOCK), `${c.slug}: falta bloque de seguridad`);
      assert.match(textsSince(n)[0], new RegExp(`\\(${c.name}\\)`));
      assert.doesNotMatch(c.system_prompt, /(^|[^0-9])(1[0-9]|2[0-4]) años/, `${c.slug}: edad < 25 en prompt`);
    }
    void lastOf;
    void lastLLMRequest;
  });

  await test("Mensajes gratuitos: aviso a 3 restantes, aviso de agotado y cobro posterior / saldo insuficiente", async () => {
    await press("comp:luna");
    const u = await userRow();
    // ya se usaron 4 mensajes gratuitos en la prueba anterior → quedan 11
    let n = calls.length;
    for (let i = 0; i < 8; i++) await sendText(`mensaje ${i}`);
    assert.ok(textsSince(n).some((t) => /Te quedan 3 mensajes gratuitos/.test(t)));
    n = calls.length;
    for (let i = 0; i < 3; i++) await sendText(`mensaje extra ${i}`);
    assert.ok(textsSince(n).some((t) => /Has usado tus mensajes gratuitos de hoy/.test(t)));
    n = calls.length;
    await sendText("¿sigues ahí?");
    assert.match(textsSince(n)[0], /necesitas 3 créditos por mensaje/);
    assert.equal(await getBalance(u.id), 0);
  });

  let payload = "";
  await test("Compra: tienda → factura XTR (provider_token vacío) → pre_checkout OK → successful_payment → recibo", async () => {
    let n = calls.length;
    await sendText("Tienda");
    const shop = calls.slice(n).find((c) => c.method === "sendMessage")!;
    assert.match(shop.payload.text, /no tienen valor monetario/);
    const buttons = shop.payload.reply_markup.inline_keyboard.flat().map((b: any) => b.text);
    assert.deepEqual(buttons, ["Starter · 100 créditos · 100 ⭐", "✦ Popular · 330 créditos · 300 ⭐", "Premium · 960 créditos · 800 ⭐", "VIP · 2600 créditos · 2000 ⭐"]);
    await press("buy:popular");
    const inv = lastOf("sendInvoice")!.payload;
    assert.equal(inv.currency, "XTR");
    assert.equal(inv.provider_token, "");
    assert.deepEqual(inv.prices, [{ label: "330 créditos", amount: 300 }]);
    payload = inv.payload;
    await preCheckout(payload, 300);
    const ans = lastOf("answerPreCheckoutQuery")!.payload;
    assert.equal(ans.ok, true);
    n = calls.length;
    await paid(payload, 300, "stxCHARGE-POPULAR-1");
    const receipt = textsSince(n)[0];
    assert.match(receipt, /Pago confirmado/);
    assert.match(receipt, /Créditos añadidos: <b>330<\/b>/);
    assert.match(receipt, /stxCHARGE-POPULAR-1/);
    const u = await userRow();
    const b = await one<any>(`SELECT * FROM credit_batches WHERE purchase_reference = 'stxCHARGE-POPULAR-1'`);
    assert.equal(b.source, "telegram_stars");
    assert.equal(b.credits_total, 330);
    const months = (new Date(b.expires_at).getTime() - Date.now()) / (1000 * 3600 * 24 * 30.44);
    assert.ok(months > 11.8 && months < 12.2, `caducidad ${months}`);
    const t = await one<any>(`SELECT * FROM credit_transactions WHERE batch_id = $1 AND type = 'purchase'`, [b.id]);
    assert.equal(t.amount, 330);
    const p = await one<any>(`SELECT * FROM payments WHERE invoice_payload = $1`, [payload]);
    assert.equal(p.status, "paid");
    assert.ok(p.pre_checkout_at && p.paid_at);
    assert.equal(await getBalance(u.id), 330);
  });

  await test("Idempotencia: successful_payment duplicado (mismo charge_id) y reintento del mismo update", async () => {
    const before = await one<any>(`SELECT COUNT(*)::int AS n FROM credit_batches`);
    const n = calls.length;
    await paid(payload, 300, "stxCHARGE-POPULAR-1");
    await paid(payload, 300, "stxCHARGE-POPULAR-1", TG, 555555);
    await paid(payload, 300, "stxCHARGE-POPULAR-1", TG, 555555);
    const after = await one<any>(`SELECT COUNT(*)::int AS n FROM credit_batches`);
    assert.equal(after.n, before.n);
    assert.equal(textsSince(n).filter((t) => /Pago confirmado/.test(t)).length, 0);
    await assert.rejects(
      q(`INSERT INTO credit_batches (user_id, credits_total, credits_remaining, source, purchase_reference, expires_at) SELECT id, 1, 1, 'x', 'stxCHARGE-POPULAR-1', now() FROM users LIMIT 1`),
      /duplicate key/,
    );
  });

  await test("pre_checkout rechazado: importe alterado, moneda distinta, pack inactivo, payload desconocido", async () => {
    await press("buy:starter");
    const p2 = lastOf("sendInvoice")!.payload.payload;
    await preCheckout(p2, 1);
    assert.equal(lastOf("answerPreCheckoutQuery")!.payload.ok, false);
    await preCheckout(p2, 100, TG, "EUR");
    assert.equal(lastOf("answerPreCheckoutQuery")!.payload.ok, false);
    await q(`UPDATE credit_packs SET active = false WHERE id = 'starter'`);
    await preCheckout(p2, 100);
    const a = lastOf("answerPreCheckoutQuery")!.payload;
    assert.equal(a.ok, false);
    assert.match(a.error_message, /ya no está disponible/);
    await q(`UPDATE credit_packs SET active = true WHERE id = 'starter'`);
    await preCheckout("lc1:no-existe", 100);
    assert.equal(lastOf("answerPreCheckoutQuery")!.payload.ok, false);
    await preCheckout(p2, 100, 777777);
    assert.equal(lastOf("answerPreCheckoutQuery")!.payload.ok, false);
  });

  await test("Gasto FIFO atómico: consume primero el lote que caduca antes y nunca deja saldo negativo", async () => {
    const u = await userRow();
    const early = await one<any>(
      `INSERT INTO credit_batches (user_id, credits_total, credits_remaining, source, expires_at) VALUES ($1, 10, 10, 'bonus', now() + interval '3 days') RETURNING id`,
      [u.id],
    );
    const r = await tx((c) => spendCredits(c, u.id, 15, "spend_message"));
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.allocations[0].batchId, early.id);
      assert.equal(r.allocations[0].amount, 10);
      assert.equal(r.allocations[1].amount, 5);
    }
    const bal = await getBalance(u.id);
    assert.equal(bal, 325);
    const fail = await tx((c) => spendCredits(c, u.id, 10_000, "spend_message"));
    assert.equal(fail.ok, false);
    assert.equal(await getBalance(u.id), 325);
    // Concurrencia: 10 gastos de 40 en paralelo con saldo 325 → solo 8 pasan.
    const outs = await Promise.all(Array.from({ length: 10 }, () => tx((c) => spendCredits(c, u.id, 40, "spend_message"))));
    assert.equal(outs.filter((o) => o.ok).length, 8);
    assert.equal(await getBalance(u.id), 5);
    const neg = await one<any>(`SELECT COUNT(*)::int AS n FROM credit_batches WHERE credits_remaining < 0`);
    assert.equal(neg.n, 0);
  });

  let assetId = "";
  await test("Contenido: subida privada con vista previa difuminada automática; placeholders eliminados", async () => {
    const sharp = (await import("sharp")).default;
    const img = await sharp({ create: { width: 900, height: 1200, channels: 3, background: { r: 200, g: 120, b: 160 } } }).png().toBuffer();
    const luna = await one<any>(`SELECT id, slug FROM companions WHERE slug = 'luna'`);
    const a = await createAsset({ file: img, companionId: luna.id, companionSlug: "luna", tier: "medio", creditCost: 26, caption: "Atardecer en la terraza" });
    assetId = a!.id;
    const row = await one<any>(`SELECT * FROM content_assets WHERE id = $1`, [assetId]);
    assert.match(row.storage_url, /^https:\/\/private\.blob\.test\//);
    assert.ok(row.blurred_preview_url && row.preview_pathname && row.pathname);
    const prev = await sharp(blobStore.get(row.preview_pathname)!).metadata();
    assert.ok((prev.width ?? 0) <= 480);
    const ph = await one<any>(`SELECT COUNT(*)::int AS n FROM content_assets WHERE storage_url LIKE '%placehold.co%'`);
    assert.equal(ph.n, 0);
  });

  await test("Desbloqueo: saldo insuficiente → CTA; con saldo → confirmación → cobro → entrega; reenvío gratis", async () => {
    const u = await userRow();
    await press("comp:luna");
    let n = calls.length;
    await sendText("Galería");
    const preview = calls.slice(n).find((c) => c.method === "sendPhoto")!.payload;
    assert.equal(preview.has_spoiler, true);
    assert.equal(preview.protect_content, true);
    assert.match(preview.caption, /26 créditos/);
    n = calls.length;
    await press(`unl:${assetId}`);
    assert.match(textsSince(n)[0], /cuesta 26 créditos y tu saldo es de 5/);
    await q(`INSERT INTO credit_batches (user_id, credits_total, credits_remaining, source, expires_at) VALUES ($1, 100, 100, 'bonus', now() + interval '1 year')`, [u.id]);
    n = calls.length;
    await press(`unl:${assetId}`);
    assert.match(textsSince(n)[0], /¿Desbloquear este contenido por <b>26 créditos<\/b>/);
    assert.equal(await getBalance(u.id), 105, "no debe cobrar antes de confirmar");
    n = calls.length;
    await press(`unc:${assetId}`);
    assert.equal(calls.slice(n).filter((c) => c.method === "sendPhoto").length, 1);
    assert.equal(await getBalance(u.id), 79);
    const uc = await one<any>(`SELECT * FROM unlocked_content WHERE user_id = $1 AND content_asset_id = $2`, [u.id, assetId]);
    assert.equal(uc.credits_spent, 26);
    n = calls.length;
    await press(`unl:${assetId}`);
    await press(`unc:${assetId}`);
    assert.equal(calls.slice(n).filter((c) => c.method === "sendPhoto").length, 2);
    assert.equal(await getBalance(u.id), 79, "reenvío gratuito");
    const fileCached = await one<any>(`SELECT telegram_file_id FROM content_assets WHERE id = $1`, [assetId]);
    assert.ok(fileCached.telegram_file_id);
  });

  await test("/saldo: total, lotes con caducidad e historial", async () => {
    const n = calls.length;
    await sendText("/saldo");
    const t = textsSince(n)[0];
    assert.match(t, /Créditos disponibles: <b>79<\/b>/);
    assert.match(t, /Lotes activos/);
    assert.match(t, /Últimos movimientos/);
    assert.match(t, /Contenido desbloqueado · −26/);
  });

  await test("Reembolso: refundStarPayment + reversión de créditos + transacción 'refund' (idempotente)", async () => {
    const u = await userRow();
    const before = await getBalance(u.id);
    const r = await refundPayment(bot.api, "stxCHARGE-POPULAR-1", "prueba");
    assert.equal(r.status, "refunded");
    const call = lastOf("refundStarPayment")!.payload;
    assert.equal(call.telegram_payment_charge_id, "stxCHARGE-POPULAR-1");
    assert.equal(call.user_id, TG);
    const after = await getBalance(u.id);
    assert.equal(before - after, r.creditsReverted);
    assert.ok(after >= 0);
    const refundTx = await q<any>(`SELECT * FROM credit_transactions WHERE type = 'refund'`);
    assert.ok(refundTx.length >= 1);
    const p = await one<any>(`SELECT status, credits_reverted FROM payments WHERE telegram_payment_charge_id = 'stxCHARGE-POPULAR-1'`);
    assert.equal(p.status, "refunded");
    const again = await refundPayment(bot.api, "stxCHARGE-POPULAR-1", "prueba");
    assert.equal(again.status, "already_refunded");
  });

  await test("Cron: avisos de caducidad a 7 y 2 días, caducidad y retención de mensajes", async () => {
    const u = await userRow();
    await q(`INSERT INTO credit_batches (user_id, credits_total, credits_remaining, source, expires_at) VALUES
      ($1, 20, 20, 'bonus', now() + interval '5 days'), ($1, 30, 30, 'bonus', now() + interval '1 day'), ($1, 40, 40, 'bonus', now() - interval '1 hour')`, [u.id]);
    await q(`INSERT INTO conversation_messages (user_id, companion_id, role, content, created_at)
             SELECT $1, id, 'user', 'antiguo', now() - interval '100 days' FROM companions WHERE slug='luna'`, [u.id]);
    const n = calls.length;
    const r = await runDailyJobs(bot.api);
    assert.equal(r.warned7, 1);
    assert.equal(r.warned2, 1);
    assert.equal(r.expiredBatches, 1);
    assert.equal(r.purgedMessages, 1);
    const warnings = textsSince(n);
    assert.ok(warnings.some((t) => /20 créditos de tu saldo caducan/.test(t) && /en 7 días/.test(t)));
    assert.ok(warnings.some((t) => /30 créditos de tu saldo caducan/.test(t) && /en 2 días/.test(t)));
    const exp = await one<any>(`SELECT * FROM credit_transactions WHERE type = 'expire'`);
    assert.equal(exp.amount, -40);
    const r2 = await runDailyJobs(bot.api);
    assert.equal(r2.warned7 + r2.warned2 + r2.expiredBatches, 0, "avisos no se repiten");
  });

  await test("Crisis emocional: sale del personaje con 024/112 y no cobra", async () => {
    const u = await userRow();
    const bal = await getBalance(u.id);
    const n = calls.length;
    await sendText("no quiero seguir viviendo");
    assert.match(textsSince(n)[0], /024/);
    assert.match(textsSince(n)[0], /112/);
    assert.equal(await getBalance(u.id), bal);
  });

  await test("Señal de minoría en el chat: corta, marca para revisión y bloquea contenido y pagos", async () => {
    const n = calls.length;
    await sendText("jaja es que tengo 16 años");
    assert.match(textsSince(n)[0], /ha terminado la conversación/);
    const u = await userRow();
    assert.ok(u.flagged_for_review_at);
    await sendText("hola?");
    assert.match(textsSince(n).at(-1)!, /en revisión/);
    await press("buy:starter");
    assert.match(textsSince(n).at(-1)!, /en revisión/);
    const pending = await one<any>(`SELECT invoice_payload FROM payments WHERE status='pending' ORDER BY created_at DESC LIMIT 1`);
    await preCheckout(pending.invoice_payload, 100);
    assert.equal(lastOf("answerPreCheckoutQuery")!.payload.ok, false);
    const flags = await one<any>(`SELECT COUNT(*)::int AS n FROM safety_flags WHERE kind='minor_signal'`);
    assert.equal(flags.n, 1);
  });

  await test("Menor declarado en la verificación: bloqueo permanente", async () => {
    const MINOR = 900002;
    await sendText("/start", MINOR);
    await press("onb:go", MINOR);
    const n = calls.length;
    await sendText("01/01/2012", MINOR);
    assert.match(textsSince(n)[0], /exclusivo para personas mayores de 18/);
    const m = await userRow(MINOR);
    assert.equal(m.is_blocked, true);
    assert.equal(m.blocked_reason, "minor_declared");
    await assert.rejects(q(`UPDATE users SET is_blocked = false WHERE telegram_id = $1`, [MINOR]), /permanent/);
    await sendText("/tienda", MINOR);
    assert.match(textsSince(n).at(-1)!, /no tiene acceso/);
    await sendText("/borrar_datos", MINOR);
    await press("erase:yes", MINOR);
    const after = await userRow(MINOR);
    assert.equal(after.is_blocked, true, "el bloqueo sobrevive al borrado");
  });

  await test("/paysupport crea ticket y /borrar_datos elimina datos personales conservando la contabilidad", async () => {
    const OTHER = 900003;
    await sendText("/start", OTHER);
    await press("onb:go", OTHER);
    await sendText("03/03/1985", OTHER);
    await press("comp:claire", OTHER);
    await sendText("hola Claire", OTHER);
    await sendText("/paysupport", OTHER);
    await sendText("No me han llegado los créditos", OTHER);
    const u = await userRow(OTHER);
    const t = await one<any>(`SELECT * FROM support_tickets WHERE user_id = $1`, [u.id]);
    assert.match(t.message, /créditos/);
    assert.match(lastOf("sendMessage")!.payload.text, /Hemos recibido tu consulta/);
    await q(`INSERT INTO payments (user_id, pack_id, stars, credits, invoice_payload, status) VALUES ($1,'starter',100,100,'lc1:keep','paid')`, [u.id]);
    await sendText("/borrar_datos", OTHER);
    await press("erase:yes", OTHER);
    const e = await userRow(OTHER);
    assert.equal(e.birth_date, null);
    assert.equal(e.age_verified_at, null);
    assert.equal(e.telegram_username, null);
    const msgs = await one<any>(`SELECT COUNT(*)::int AS n FROM conversation_messages WHERE user_id = $1`, [u.id]);
    assert.equal(msgs.n, 0);
    const pays = await one<any>(`SELECT COUNT(*)::int AS n FROM payments WHERE user_id = $1`, [u.id]);
    assert.equal(pays.n, 1);
    const n = calls.length;
    await sendText("hola", OTHER);
    assert.match(textsSince(n)[0], /Bienvenido/);
  });

  await test("Inglés: usuario con Telegram en inglés recibe todo en inglés (onboarding, menú, IA, tienda, factura)", async () => {
    let n = calls.length;
    await sendText("/start", EN_USER);
    assert.match(textsSince(n)[0], /Welcome to Luna Companions/);
    await press("onb:go", EN_USER);
    assert.match(textsSince(n).at(-1)!, /Adults only/);
    assert.match(textsSince(n).at(-1)!, /\/legal\/terms/);
    n = calls.length;
    await sendText("15/06/1990", EN_USER);
    const t = textsSince(n).join("\n");
    assert.match(t, /fictional characters created with artificial intelligence/);
    assert.match(t, /Choose who you'd like to talk to/);
    assert.match(t, /Affectionate, warm and always ready to listen/);
    const menu = calls.slice(n).find((c) => c.payload?.reply_markup?.keyboard)!.payload.reply_markup.keyboard.flat().map((b: any) => b.text ?? b);
    assert.deepEqual(menu, ["Chat", "Gallery", "Shop", "Balance", "Change companion", "Help"]);
    n = calls.length;
    await press("comp:luna", EN_USER);
    assert.match(textsSince(n).join("\n"), /Hi! I'm Luna/);
    await sendText("Hi Luna", EN_USER);
    assert.match(llm.lastLLMRequest!.messages[0].content, /LANGUAGE: always reply in natural, fluent English/);
    n = calls.length;
    await sendText("Shop", EN_USER);
    assert.match(textsSince(n)[0], /Credits have no monetary value/);
    await press("buy:popular", EN_USER);
    const inv = lastOf("sendInvoice")!.payload;
    assert.equal(inv.title, "Luna Companions · Popular pack");
    assert.deepEqual(inv.prices, [{ label: "330 credits", amount: 300 }]);
    await preCheckout(inv.payload, 1, EN_USER);
    assert.match(lastOf("answerPreCheckoutQuery")!.payload.error_message, /couldn't validate your order/);
    const u = await userRow(EN_USER);
    assert.equal(u.language, "en");
  });

  await test("Comandos legales e /info disponibles", async () => {
    const n = calls.length;
    await sendText("/terminos", 900003);
    await sendText("/privacidad", 900003);
    await sendText("/info", 900003);
    await sendText("/paysupport", 900003);
    const t = textsSince(n).join("\n");
    assert.match(t, /\/legal\/terminos/);
    assert.match(t, /\/legal\/privacidad/);
    assert.match(t, /personajes ficticios adultos/);
    assert.match(t, /soporte de Telegram no puede ayudarte/);
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} pruebas OK`);
  await closePool();
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await closePool();
  process.exit(1);
});
