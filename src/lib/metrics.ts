import { one, q } from "./db";

export async function getMetrics() {
  const [users, revenue, byDay, byPack, top, flags] = await Promise.all([
    one<any>(`SELECT COUNT(*)::int AS total,
                     COUNT(*) FILTER (WHERE age_verified_at IS NOT NULL)::int AS verified,
                     COUNT(*) FILTER (WHERE is_blocked)::int AS blocked,
                     COUNT(*) FILTER (WHERE flagged_for_review_at IS NOT NULL)::int AS in_review,
                     COUNT(*) FILTER (WHERE last_seen_at > now() - interval '7 days')::int AS active_7d
                FROM users`),
    one<any>(`SELECT COUNT(DISTINCT user_id) FILTER (WHERE status = 'paid')::int AS buyers,
                     COALESCE(SUM(stars) FILTER (WHERE status = 'paid'),0)::int AS stars_net,
                     COALESCE(SUM(stars) FILTER (WHERE status IN ('paid','refunded')),0)::int AS stars_gross,
                     COUNT(*) FILTER (WHERE status = 'paid')::int AS orders,
                     COUNT(*) FILTER (WHERE status = 'refunded')::int AS refunds
                FROM payments`),
    q(`SELECT to_char(date_trunc('day', paid_at AT TIME ZONE 'Europe/Madrid'), 'YYYY-MM-DD') AS day,
              SUM(stars)::int AS stars, COUNT(*)::int AS orders
         FROM payments WHERE status = 'paid' AND paid_at > now() - interval '30 days'
        GROUP BY 1 ORDER BY 1`),
    q(`SELECT k.id, k.name, COUNT(p.id)::int AS orders, COALESCE(SUM(p.stars),0)::int AS stars
         FROM credit_packs k LEFT JOIN payments p ON p.pack_id = k.id AND p.status = 'paid'
        GROUP BY k.id, k.name, k.sort_order ORDER BY k.sort_order`),
    q(`SELECT a.id, c.name AS companion, a.tier, a.caption, COUNT(uc.user_id)::int AS unlocks, COALESCE(SUM(uc.credits_spent),0)::int AS credits
         FROM content_assets a JOIN companions c ON c.id = a.companion_id
         JOIN unlocked_content uc ON uc.content_asset_id = a.id
        GROUP BY a.id, c.name ORDER BY unlocks DESC LIMIT 10`),
    one<any>(`SELECT COUNT(*) FILTER (WHERE reviewed_at IS NULL)::int AS open FROM safety_flags`),
  ]);
  const verified = users?.verified ?? 0;
  return {
    users,
    conversionFirstPurchase: verified ? +(revenue.buyers / verified).toFixed(4) : 0,
    arpuStars: verified ? +(revenue.stars_net / verified).toFixed(2) : 0,
    arppuStars: revenue.buyers ? +(revenue.stars_net / revenue.buyers).toFixed(2) : 0,
    revenue,
    revenueByDay: byDay,
    revenueByPack: byPack,
    topContent: top,
    openSafetyFlags: flags?.open ?? 0,
  };
}
