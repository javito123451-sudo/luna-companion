import { one, q, tx } from "./db";

export type User = {
  id: string;
  telegram_id: number;
  age_verified_at: string | null;
  birth_date: string | null;
  active_companion_id: string | null;
  is_blocked: boolean;
  blocked_reason: string | null;
  flagged_for_review_at: string | null;
  pending_action: string | null;
  free_msgs_day: string | null;
  free_msgs_used: number;
  terms_accepted_at: string | null;
};

export async function upsertUser(from: { id: number; username?: string; first_name?: string }): Promise<User> {
  const row = await one<User>(
    `INSERT INTO users (telegram_id, telegram_username, first_name, last_seen_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (telegram_id) DO UPDATE SET
       telegram_username = CASE WHEN users.data_erased_at IS NULL OR users.age_verified_at IS NOT NULL THEN EXCLUDED.telegram_username ELSE users.telegram_username END,
       first_name = CASE WHEN users.data_erased_at IS NULL OR users.age_verified_at IS NOT NULL THEN EXCLUDED.first_name ELSE users.first_name END,
       last_seen_at = now()
     RETURNING *`,
    [from.id, from.username ?? null, from.first_name ?? null],
  );
  return normalize(row!);
}

function normalize(u: any): User {
  return { ...u, telegram_id: Number(u.telegram_id), free_msgs_used: Number(u.free_msgs_used ?? 0) };
}

export const canUseContent = (u: User) => !u.is_blocked && !u.flagged_for_review_at && !!u.age_verified_at;

export async function setPending(userId: string, action: string | null) {
  await q(`UPDATE users SET pending_action = $2 WHERE id = $1`, [userId, action]);
}

/** Verificación de edad. La fecha queda fijada (trigger en BD); un menor queda bloqueado para siempre. */
export async function recordBirthDate(userId: string, iso: string, age: number) {
  if (age < 18) {
    await tx(async (c) => {
      await c.query(
        `UPDATE users SET birth_date = COALESCE(birth_date, $2::date), is_blocked = true, blocked_reason = 'minor_declared',
                blocked_at = now(), pending_action = NULL WHERE id = $1`,
        [userId, iso],
      );
      await c.query(`INSERT INTO safety_flags (user_id, kind, matched) VALUES ($1,'minor_declared',$2)`, [userId, `edad declarada ${age}`]);
    });
    return "minor" as const;
  }
  const r = await one<{ birth_date: string }>(
    `UPDATE users SET birth_date = COALESCE(birth_date, $2::date), age_verified_at = now(), terms_accepted_at = now(),
            onboarding_step = 'catalog', pending_action = NULL
      WHERE id = $1 RETURNING birth_date`,
    [userId, iso],
  );
  return r ? ("adult" as const) : ("error" as const);
}

export async function flagMinorSignal(userId: string, matched: string) {
  await tx(async (c) => {
    await c.query(`UPDATE users SET flagged_for_review_at = COALESCE(flagged_for_review_at, now()) WHERE id = $1`, [userId]);
    await c.query(`INSERT INTO safety_flags (user_id, kind, matched) VALUES ($1,'minor_signal',$2)`, [userId, matched]);
  });
}

export async function logSafety(userId: string, kind: string, matched: string | null) {
  await q(`INSERT INTO safety_flags (user_id, kind, matched) VALUES ($1,$2,$3)`, [userId, kind, matched]);
}

/**
 * Consume un mensaje gratuito del día (zona horaria Europe/Madrid) de forma atómica.
 * Devuelve los gratuitos restantes tras consumir, o null si ya no quedaban.
 */
export async function consumeFreeMessage(userId: string, perDay: number): Promise<number | null> {
  const r = await one<{ free_msgs_used: number }>(
    `UPDATE users SET
        free_msgs_used = CASE WHEN free_msgs_day = (now() AT TIME ZONE 'Europe/Madrid')::date THEN free_msgs_used + 1 ELSE 1 END,
        free_msgs_day = (now() AT TIME ZONE 'Europe/Madrid')::date
      WHERE id = $1 AND (free_msgs_day IS DISTINCT FROM (now() AT TIME ZONE 'Europe/Madrid')::date OR free_msgs_used < $2)
      RETURNING free_msgs_used`,
    [userId, perDay],
  );
  return r ? perDay - Number(r.free_msgs_used) : null;
}

export async function refundFreeMessage(userId: string) {
  await q(`UPDATE users SET free_msgs_used = GREATEST(free_msgs_used - 1, 0) WHERE id = $1`, [userId]);
}

export async function freeLeftToday(userId: string, perDay: number): Promise<number> {
  const r = await one<{ used: number }>(
    `SELECT CASE WHEN free_msgs_day = (now() AT TIME ZONE 'Europe/Madrid')::date THEN free_msgs_used ELSE 0 END AS used FROM users WHERE id = $1`,
    [userId],
  );
  return Math.max(0, perDay - Number(r?.used ?? 0));
}

/**
 * Derecho de supresión (RGPD): borra conversaciones y datos personales. Conserva pagos,
 * lotes y transacciones de créditos (obligación contable) y los bloqueos de seguridad.
 */
export async function eraseUserData(userId: string) {
  await tx(async (c) => {
    await c.query(`DELETE FROM conversation_messages WHERE user_id = $1`, [userId]);
    await c.query(`DELETE FROM support_tickets WHERE user_id = $1`, [userId]);
    await c.query(`UPDATE safety_flags SET matched = NULL WHERE user_id = $1`, [userId]);
    await c.query(
      `UPDATE users SET telegram_username = NULL, first_name = NULL,
              birth_date = CASE WHEN blocked_reason = 'minor_declared' THEN birth_date ELSE NULL END,
              age_verified_at = NULL, terms_accepted_at = NULL, active_companion_id = NULL, pending_action = NULL,
              onboarding_step = 'start', data_erased_at = now()
        WHERE id = $1`,
      [userId],
    );
  });
}
