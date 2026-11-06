import { one, q, Queryable } from "./db";

export type Allocation = { batchId: string; amount: number };

export type SpendResult =
  | { ok: true; allocations: Allocation[]; balanceAfter: number }
  | { ok: false; balance: number };

export async function getBalance(userId: string, c?: Queryable): Promise<number> {
  const r = await one<{ total: string }>(
    `SELECT COALESCE(SUM(credits_remaining),0) AS total FROM credit_batches
      WHERE user_id = $1 AND credits_remaining > 0 AND expires_at > now()`,
    [userId],
    c,
  );
  return Number(r?.total ?? 0);
}

/**
 * Descuenta `amount` créditos por orden de caducidad (FIFO).
 * Debe llamarse dentro de una transacción: bloquea los lotes con SELECT … FOR UPDATE
 * y nunca deja saldo negativo.
 */
export async function spendCredits(
  c: Queryable,
  userId: string,
  amount: number,
  type: string,
  opts: { assetId?: string | null; note?: string | null; paymentId?: string | null } = {},
): Promise<SpendResult> {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("invalid amount");
  const batches = await q<{ id: string; credits_remaining: number }>(
    `SELECT id, credits_remaining FROM credit_batches
      WHERE user_id = $1 AND credits_remaining > 0 AND expires_at > now()
      ORDER BY expires_at ASC, created_at ASC
      FOR UPDATE`,
    [userId],
    c,
  );
  const available = batches.reduce((s, b) => s + Number(b.credits_remaining), 0);
  if (available < amount) return { ok: false, balance: available };

  let pending = amount;
  const allocations: Allocation[] = [];
  for (const b of batches) {
    if (pending === 0) break;
    const take = Math.min(pending, Number(b.credits_remaining));
    await c.query(
      `UPDATE credit_batches SET credits_remaining = credits_remaining - $2 WHERE id = $1 AND credits_remaining >= $2`,
      [b.id, take],
    );
    await c.query(
      `INSERT INTO credit_transactions (user_id, batch_id, amount, type, content_asset_id, payment_id, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, b.id, -take, type, opts.assetId ?? null, opts.paymentId ?? null, opts.note ?? null],
    );
    allocations.push({ batchId: b.id, amount: take });
    pending -= take;
  }
  return { ok: true, allocations, balanceAfter: available - amount };
}

/** Devuelve créditos a los lotes exactos de los que salieron (p. ej. si falla la IA). */
export async function restoreAllocations(c: Queryable, userId: string, allocations: Allocation[], note: string) {
  for (const a of allocations) {
    await c.query(
      `UPDATE credit_batches SET credits_remaining = LEAST(credits_total, credits_remaining + $2) WHERE id = $1`,
      [a.batchId, a.amount],
    );
    await c.query(
      `INSERT INTO credit_transactions (user_id, batch_id, amount, type, note) VALUES ($1,$2,$3,'restore',$4)`,
      [userId, a.batchId, a.amount, note],
    );
  }
}

/**
 * Crea un lote de créditos de compra. Idempotente por `reference`
 * (índice UNIQUE sobre credit_batches.purchase_reference). Devuelve null si ya existía.
 */
export async function grantPurchaseBatch(
  c: Queryable,
  p: { userId: string; credits: number; reference: string; months: number; paymentId: string; source?: string },
): Promise<{ id: string; expires_at: string } | null> {
  const batch = await one<{ id: string; expires_at: string }>(
    `INSERT INTO credit_batches (user_id, credits_total, credits_remaining, source, purchase_reference, purchased_at, expires_at)
     VALUES ($1, $2, $2, $3, $4, now(), now() + make_interval(months => $5))
     ON CONFLICT (purchase_reference) WHERE purchase_reference IS NOT NULL DO NOTHING
     RETURNING id, expires_at`,
    [p.userId, p.credits, p.source ?? "telegram_stars", p.reference, p.months],
    c,
  );
  if (!batch) return null;
  await c.query(
    `INSERT INTO credit_transactions (user_id, batch_id, amount, type, payment_id) VALUES ($1,$2,$3,'purchase',$4)`,
    [p.userId, batch.id, p.credits, p.paymentId],
  );
  return batch;
}

export async function listActiveBatches(userId: string) {
  return q<{ credits_remaining: number; credits_total: number; expires_at: string; source: string }>(
    `SELECT credits_remaining, credits_total, expires_at, source FROM credit_batches
      WHERE user_id = $1 AND credits_remaining > 0 AND expires_at > now()
      ORDER BY expires_at ASC LIMIT 10`,
    [userId],
  );
}

export async function listRecentTransactions(userId: string, limit = 8) {
  return q<{ amount: number; type: string; created_at: string; note: string | null }>(
    // Un mismo movimiento repartido entre varios lotes (FIFO) se muestra como una sola línea.
    `SELECT SUM(amount)::int AS amount, type, created_at, MAX(note) AS note FROM credit_transactions
      WHERE user_id = $1
      GROUP BY type, created_at, content_asset_id, payment_id
      ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
}
