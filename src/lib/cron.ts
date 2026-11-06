import type { Api } from "grammy";
import { q, tx } from "./db";
import { getSettings } from "./settings";
import { T } from "./texts";

/** Avisos de caducidad (7 y 2 días), caducidad de lotes, retención de mensajes y limpieza. */
export async function runDailyJobs(api: Api) {
  const out: Record<string, number> = { warned7: 0, warned2: 0, expiredBatches: 0, purgedMessages: 0 };

  for (const [days, col, key] of [[7, "warning_7d_sent_at", "warned7"], [2, "warning_2d_sent_at", "warned2"]] as const) {
    const lower = days === 7 ? 2 : 0;
    const rows = await q<{ user_id: string; telegram_id: string; credits: string; first_expiry: string; ids: string[] }>(
      `SELECT b.user_id, u.telegram_id, SUM(b.credits_remaining) AS credits, MIN(b.expires_at) AS first_expiry, array_agg(b.id) AS ids
         FROM credit_batches b JOIN users u ON u.id = b.user_id
        WHERE b.credits_remaining > 0 AND b.${col} IS NULL
          AND b.expires_at > now() + make_interval(days => $1) AND b.expires_at <= now() + make_interval(days => $2)
          AND NOT u.is_blocked
        GROUP BY b.user_id, u.telegram_id`,
      [lower, days],
    );
    for (const r of rows) {
      try {
        await api.sendMessage(Number(r.telegram_id), T.expiryWarning(Number(r.credits), r.first_expiry, days), {
          disable_notification: false,
        });
        await q(`UPDATE credit_batches SET ${col} = now() WHERE id = ANY($1::uuid[])`, [r.ids]);
        out[key]++;
      } catch (e) {
        console.error("[cron] aviso", r.user_id, e);
      }
    }
  }

  out.expiredBatches = await tx(async (c) => {
    const expired = await c.query(
      `UPDATE credit_batches b SET credits_remaining = 0
         FROM (SELECT id, credits_remaining AS left_over FROM credit_batches WHERE credits_remaining > 0 AND expires_at <= now() FOR UPDATE) e
        WHERE b.id = e.id
        RETURNING b.id, b.user_id, e.left_over`,
    );
    for (const r of expired.rows) {
      await c.query(`INSERT INTO credit_transactions (user_id, batch_id, amount, type) VALUES ($1,$2,$3,'expire')`, [r.user_id, r.id, -Number(r.left_over)]);
    }
    return expired.rows.length;
  });

  const { messageRetentionDays } = await getSettings();
  const purged = await q(`DELETE FROM conversation_messages WHERE created_at < now() - make_interval(days => $1) RETURNING 1`, [messageRetentionDays]);
  out.purgedMessages = purged.length;
  await q(`DELETE FROM telegram_updates WHERE created_at < now() - interval '3 days'`);
  await q(`UPDATE payments SET status = 'failed', updated_at = now() WHERE status = 'pending' AND created_at < now() - interval '2 days'`);
  return out;
}
