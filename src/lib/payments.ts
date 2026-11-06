import { randomUUID } from "crypto";
import type { Api } from "grammy";
import { one, q, tx } from "./db";
import { getBalance, grantPurchaseBatch, spendCredits } from "./credits";
import { getSettings } from "./settings";
import { Lang, tr } from "./texts";

export type Pack = {
  id: string;
  name: string;
  credits: number;
  bonus_pct: number;
  stars: number;
  featured: boolean;
  active: boolean;
};

export const packBonus = (p: Pack) => Math.round((p.credits * p.bonus_pct) / 100);
export const packTotal = (p: Pack) => p.credits + packBonus(p);

export async function listActivePacks(): Promise<Pack[]> {
  return q<Pack>(`SELECT * FROM credit_packs WHERE active ORDER BY sort_order, stars`);
}

/** Crea el registro de pago pendiente y envía la factura en Stars (XTR, provider_token vacío). */
export async function sendPackInvoice(api: Api, chatId: number, userId: string, packId: string, lang: Lang = "es") {
  const T = tr(lang);
  const pack = await one<Pack>(`SELECT * FROM credit_packs WHERE id = $1 AND active`, [packId]);
  if (!pack) return null;
  const payload = `lc1:${randomUUID()}`;
  const total = packTotal(pack);
  await q(
    `INSERT INTO payments (user_id, pack_id, stars, credits, invoice_payload, status) VALUES ($1,$2,$3,$4,$5,'pending')`,
    [userId, pack.id, pack.stars, total, payload],
  );
  await api.sendInvoice(
    chatId,
    T.invoiceTitle(pack.name),
    T.invoiceDescription(total, packBonus(pack)),
    payload,
    "XTR",
    [{ label: T.invoiceLabel(total), amount: pack.stars }],
    { provider_token: "", protect_content: true } as any,
  );
  return pack;
}

export type PreCheckoutCode = "generic" | "age" | "blocked" | "pack";
export type PreCheckoutVerdict = { ok: true } | { ok: false; code: PreCheckoutCode };

/** Validación para answerPreCheckoutQuery (< 10 s). */
export async function validatePreCheckout(p: {
  telegramId: number;
  payload: string;
  currency: string;
  totalAmount: number;
}): Promise<PreCheckoutVerdict> {
  if (p.currency !== "XTR") return { ok: false, code: "generic" };
  const row = await one<any>(
    `SELECT p.id, p.status, p.stars, u.telegram_id, u.is_blocked, u.age_verified_at, u.flagged_for_review_at, k.active AS pack_active, k.stars AS pack_stars
       FROM payments p JOIN users u ON u.id = p.user_id JOIN credit_packs k ON k.id = p.pack_id
      WHERE p.invoice_payload = $1`,
    [p.payload],
  );
  if (!row || Number(row.telegram_id) !== p.telegramId) return { ok: false, code: "generic" };
  if (row.is_blocked || row.flagged_for_review_at) return { ok: false, code: "blocked" };
  if (!row.age_verified_at) return { ok: false, code: "age" };
  if (!row.pack_active) return { ok: false, code: "pack" };
  if (row.status !== "pending" || Number(row.stars) !== p.totalAmount) return { ok: false, code: "generic" };
  await q(`UPDATE payments SET pre_checkout_at = now(), updated_at = now() WHERE id = $1`, [row.id]);
  return { ok: true };
}

export type PaymentOutcome =
  | { status: "credited"; pack: string; credits: number; balance: number; expires: string; reference: string }
  | { status: "duplicate"; reference: string }
  | { status: "unknown_payload"; reference: string };

/**
 * successful_payment → en UNA transacción: lote de créditos (12 meses), transacción 'purchase'
 * y actualización del pago. Idempotente por telegram_payment_charge_id.
 */
export async function processSuccessfulPayment(p: {
  telegramId: number;
  payload: string;
  chargeId: string;
  totalAmount: number;
}): Promise<PaymentOutcome> {
  const { creditExpiryMonths } = await getSettings();
  return tx(async (c) => {
    const pay = await one<any>(
      `SELECT p.*, k.name AS pack_name FROM payments p JOIN credit_packs k ON k.id = p.pack_id
        WHERE p.invoice_payload = $1 FOR UPDATE OF p`,
      [p.payload],
      c,
    );
    if (!pay) {
      console.error("[payments] successful_payment con payload desconocido", { charge: p.chargeId });
      return { status: "unknown_payload", reference: p.chargeId } as const;
    }
    if (pay.status === "paid" || pay.status === "refunded" || pay.telegram_payment_charge_id) {
      return { status: "duplicate", reference: p.chargeId } as const;
    }
    const batch = await grantPurchaseBatch(c, {
      userId: pay.user_id,
      credits: Number(pay.credits),
      reference: p.chargeId,
      months: creditExpiryMonths,
      paymentId: pay.id,
    });
    if (!batch) return { status: "duplicate", reference: p.chargeId } as const;
    await c.query(
      `UPDATE payments SET status='paid', telegram_payment_charge_id=$2, paid_at=now(), batch_id=$3, updated_at=now() WHERE id=$1`,
      [pay.id, p.chargeId, batch.id],
    );
    const balance = await getBalance(pay.user_id, c);
    return {
      status: "credited",
      pack: pay.pack_name,
      credits: Number(pay.credits),
      balance,
      expires: batch.expires_at,
      reference: p.chargeId,
    } as const;
  });
}

/**
 * Reembolso: refundStarPayment + reversión de créditos y transacción 'refund', todo dentro
 * de la misma transacción de BD (si Telegram falla, no se toca nada).
 * Se retiran primero los créditos que queden en el lote de la compra; si el usuario ya gastó
 * parte, se retira la diferencia de otros lotes (FIFO) hasta donde alcance el saldo, sin negativos.
 */
export async function refundPayment(
  api: Api | null,
  chargeId: string,
  reason: string,
  opts: { alreadyRefundedByTelegram?: boolean } = {},
) {
  return tx(async (c) => {
    const pay = await one<any>(
      `SELECT p.*, u.telegram_id, u.language FROM payments p JOIN users u ON u.id = p.user_id
        WHERE p.telegram_payment_charge_id = $1 FOR UPDATE OF p`,
      [chargeId],
      c,
    );
    if (!pay) throw new Error("pago no encontrado");
    if (pay.status === "refunded") return { status: "already_refunded" as const, creditsReverted: Number(pay.credits_reverted ?? 0) };
    if (pay.status !== "paid") throw new Error(`estado no reembolsable: ${pay.status}`);

    const batch = await one<any>(`SELECT id, credits_remaining FROM credit_batches WHERE id = $1 FOR UPDATE`, [pay.batch_id], c);
    let reverted = 0;
    const fromBatch = Math.min(Number(batch?.credits_remaining ?? 0), Number(pay.credits));
    if (fromBatch > 0) {
      await c.query(`UPDATE credit_batches SET credits_remaining = credits_remaining - $2 WHERE id = $1`, [batch.id, fromBatch]);
      await c.query(
        `INSERT INTO credit_transactions (user_id, batch_id, amount, type, payment_id, note) VALUES ($1,$2,$3,'refund',$4,$5)`,
        [pay.user_id, batch.id, -fromBatch, pay.id, reason],
      );
      reverted += fromBatch;
    }
    const missing = Number(pay.credits) - fromBatch;
    if (missing > 0) {
      const balance = await getBalance(pay.user_id, c);
      const take = Math.min(missing, balance);
      if (take > 0) {
        const r = await spendCredits(c, pay.user_id, take, "refund", { paymentId: pay.id, note: reason });
        if (r.ok) reverted += take;
      }
    }
    await c.query(
      `UPDATE payments SET status='refunded', refunded_at=now(), credits_reverted=$2, refund_reason=$3, updated_at=now() WHERE id=$1`,
      [pay.id, reverted, reason],
    );
    if (api && !opts.alreadyRefundedByTelegram) {
      await api.refundStarPayment(Number(pay.telegram_id), chargeId);
    }
    return {
      status: "refunded" as const,
      creditsReverted: reverted,
      stars: Number(pay.stars),
      telegramId: Number(pay.telegram_id),
      language: (pay.language ?? "es") as Lang,
    };
  });
}
