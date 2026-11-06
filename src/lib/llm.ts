import { SAFETY_BLOCK, outputViolates } from "./safety";

export type Companion = {
  id: string;
  slug: string;
  name: string;
  system_prompt: string;
  ai_disclosure_text: string;
};

export type HistoryMessage = { role: "user" | "bot"; content: string };

export class LLMError extends Error {}

/** System prompt definitivo: personalidad de la BD + bloque de seguridad común. */
const LANGUAGE_RULE = {
  es: "IDIOMA: responde siempre en español de España.",
  en: "LANGUAGE: always reply in natural, fluent English (the user's language), keeping your personality. Never switch to Spanish unless the user writes in Spanish.",
} as const;

export function buildSystemPrompt(c: Companion, lang: "es" | "en" = "es"): string {
  if (!c.system_prompt?.trim()) throw new LLMError(`companion ${c.slug} sin system_prompt`);
  return `${c.system_prompt.trim()}\n\n${SAFETY_BLOCK}\n\n${LANGUAGE_RULE[lang]}`;
}

/** Solo para pruebas: última petición construida. */
export let lastLLMRequest: { model: string; messages: { role: string; content: string }[] } | null = null;

export async function generateReply(c: Companion, history: HistoryMessage[], userMessage: string, lang: "es" | "en" = "es"): Promise<string> {
  const messages = [
    { role: "system", content: buildSystemPrompt(c, lang) },
    ...history.map((m) => ({ role: m.role === "bot" ? "assistant" : "user", content: m.content })),
    { role: "user", content: userMessage },
  ];
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  lastLLMRequest = { model, messages };

  if (process.env.LLM_MOCK === "1") {
    return `(${c.name}) Me encanta que me escribas: «${userMessage.slice(0, 60)}».`;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new LLMError("Falta OPENAI_API_KEY");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 40_000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0.85, max_tokens: 400 }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new LLMError(`OpenAI ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
    const data: any = await res.json();
    const text: unknown = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new LLMError("respuesta vacía");
    if (outputViolates(text)) return lang === "en" ? "I'd rather we talked about something else. Tell me, how has your day been?" : "Prefiero que hablemos de otra cosa. Cuéntame, ¿qué tal te ha ido el día?";
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}
