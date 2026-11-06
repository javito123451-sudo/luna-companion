import { q } from "./db";

export type Settings = {
  freeMessagesPerDay: number;
  creditsPerMessage: number;
  messageRetentionDays: number;
  creditExpiryMonths: number;
};

const DEFAULTS: Settings = {
  freeMessagesPerDay: 15,
  creditsPerMessage: 2,
  messageRetentionDays: 90,
  creditExpiryMonths: 12,
};

let cache: { at: number; value: Settings } | null = null;

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  const rows = await q<{ key: string; value: unknown }>("SELECT key, value FROM app_settings");
  const map = new Map(rows.map((r) => [r.key, Number(r.value)]));
  const pick = (k: string, d: number) => {
    const v = map.get(k);
    return typeof v === "number" && Number.isFinite(v) ? v : d;
  };
  const value: Settings = {
    freeMessagesPerDay: pick("free_messages_per_day", DEFAULTS.freeMessagesPerDay),
    creditsPerMessage: pick("credits_per_message", DEFAULTS.creditsPerMessage),
    messageRetentionDays: pick("message_retention_days", DEFAULTS.messageRetentionDays),
    creditExpiryMonths: pick("credit_expiry_months", DEFAULTS.creditExpiryMonths),
  };
  cache = { at: Date.now(), value };
  return value;
}

export function resetSettingsCache() {
  cache = null;
}

export function appUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return raw.replace(/\/+$/, "");
}

export const legalUrl = (slug: "terminos" | "privacidad" | "reembolsos") => `${appUrl()}/legal/${slug}`;
