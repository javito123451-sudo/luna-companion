/**
 * Todos los textos visibles para el usuario, en español de España (es) e inglés (en).
 * El idioma sale del idioma de Telegram del usuario: español si empieza por "es"; inglés en cualquier otro caso.
 */
import { legalUrl } from "./settings";

export const BRAND = "Luna Companions";
export type Lang = "es" | "en";

export const detectLang = (code: string | null | undefined): Lang => (code && code.toLowerCase().startsWith("es") ? "es" : "en");

export const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const LOCALE: Record<Lang, string> = { es: "es-ES", en: "en-GB" };
const dateFmt = (lang: Lang) => (d: string | Date) =>
  new Date(d).toLocaleDateString(LOCALE[lang], { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Madrid" });
const numFmt = (lang: Lang) => (n: number) => n.toLocaleString(LOCALE[lang]);

export const fmtDate = dateFmt("es");
export const fmtNum = numFmt("es");

export type MenuKey = "chat" | "gallery" | "shop" | "balance" | "switch" | "help";

export const MENUS: Record<Lang, Record<MenuKey, string>> = {
  es: { chat: "Chatear", gallery: "Galería", shop: "Tienda", balance: "Saldo", switch: "Cambiar companion", help: "Ayuda" },
  en: { chat: "Chat", gallery: "Gallery", shop: "Shop", balance: "Balance", switch: "Change companion", help: "Help" },
};
/** Compatibilidad: menú en español. */
export const MENU = MENUS.es;

/** Devuelve la acción del menú para un texto pulsado en cualquiera de los dos idiomas. */
export function menuAction(text: string): MenuKey | null {
  for (const lang of ["es", "en"] as Lang[]) {
    for (const [k, v] of Object.entries(MENUS[lang])) if (v === text) return k as MenuKey;
  }
  return null;
}

type Balance = {
  total: number;
  batches: { credits_remaining: number; expires_at: string }[];
  txs: { amount: number; type: string; created_at: string }[];
  freeLeft: number;
  freePerDay: number;
};
type Receipt = { pack: string; credits: number; balance: number; expires: string; reference: string };
type CaptionAsset = { caption: string | null; caption_en?: string | null; tier: string; credit_cost: number };

function build(lang: Lang) {
  const d = dateFmt(lang);
  const n = numFmt(lang);
  const L = (slug: "terminos" | "privacidad" | "reembolsos") => legalUrl(slug, lang);

  if (lang === "es") {
    const ES = {
      welcome: () =>
        `<b>Bienvenido a ${BRAND}</b>\n\n` +
        `Conversaciones privadas con compañeras creadas con inteligencia artificial: atentas, con personalidad propia y siempre disponibles.\n\n` +
        `Todo ocurre aquí, con total discreción.`,

      ageGate: () =>
        `<b>Solo para mayores de 18 años</b>\n\n` +
        `Para continuar, escribe tu fecha de nacimiento con el formato <b>DD/MM/AAAA</b>.\n\n` +
        `Una vez indicada no podrá modificarse. Al enviarla confirmas que eres mayor de edad y que aceptas los ` +
        `<a href="${L("terminos")}">Términos de uso</a> y la <a href="${L("privacidad")}">Política de privacidad</a>.`,

      ageInvalid: () => `No he podido leer esa fecha. Escríbela así, por ejemplo: <b>23/04/1994</b>.`,

      ageRejected: () =>
        `${BRAND} es un servicio exclusivo para personas mayores de 18 años, así que no podemos ofrecerte acceso.\n\n` +
        `Gracias por tu sinceridad.`,

      aiDisclosure: () =>
        `<b>Antes de empezar</b>\n\n` +
        `Las companions de ${BRAND} son <b>personajes ficticios creados con inteligencia artificial</b>. No son personas reales, ` +
        `y todas las conversaciones e imágenes están generadas por IA. Puedes consultarlo cuando quieras con /info.`,

      catalogIntro: () => `<b>Elige con quién quieres conversar</b>\n\nPodrás cambiar de companion en cualquier momento.`,

      companionCard: (c: { name: string; tagline: string | null; personality_summary: string | null }) =>
        `<b>${esc(c.name)}</b>` +
        (c.tagline ? `\n<i>${esc(c.tagline)}</i>` : "") +
        (c.personality_summary ? `\n\n${esc(c.personality_summary)}` : ""),

      companionChosen: (name: string) => `Has elegido a <b>${esc(name)}</b>. Escríbele cuando quieras.`,
      needCompanion: () => `Primero elige una companion para empezar a conversar.`,
      chatHint: (name: string) => `Estás conversando con <b>${esc(name)}</b>. Escríbele lo que quieras.`,

      blocked: () => `Tu cuenta no tiene acceso a ${BRAND}. Si crees que se trata de un error, escribe /paysupport.`,

      underReview: () =>
        `Hemos pausado esta conversación. Por seguridad, tu cuenta queda en revisión y sin acceso a contenido ni compras.\n\n` +
        `Si crees que se trata de un error, escribe /paysupport.`,

      minorCut: (name: string) =>
        `${esc(name)} ha terminado la conversación.\n\n` +
        `${BRAND} es un servicio exclusivo para adultos. Por seguridad, tu cuenta queda en revisión.`,

      prohibited: () => `Eso no es algo que vaya a hacer. Prefiero que sigamos hablando de otra cosa.`,

      crisis: () =>
        `Voy a salir un momento del personaje, porque lo que cuentas me importa de verdad.\n\n` +
        `Si estás pasando por un momento muy difícil, no tienes por qué afrontarlo a solas. En España puedes llamar ` +
        `al <b>024</b>, gratuito, confidencial y disponible las 24 horas. Si estás en peligro inmediato, llama al <b>112</b>.\n\n` +
        `Hablar con alguien de confianza también ayuda. Aquí sigo si quieres seguir hablando.`,

      llmError: () => `Ahora mismo no puedo responderte. Inténtalo de nuevo en unos segundos; no se te ha cobrado nada.`,

      freeLeft3: () => `<i>Te quedan 3 mensajes gratuitos hoy. Cuando se agoten, podrás seguir conversando con créditos.</i>`,

      freeExhausted: (cost: number) =>
        `<i>Has usado tus mensajes gratuitos de hoy. A partir de ahora cada mensaje cuesta ${cost} créditos. ` +
        `Mañana tendrás de nuevo tus mensajes gratuitos.</i>`,

      noCredits: (cost: number, balance: number) =>
        `Para seguir conversando hoy necesitas ${cost} créditos por mensaje y tu saldo es de ${n(balance)}.\n\n` +
        `Recarga en la tienda o vuelve mañana: tus mensajes gratuitos se renuevan cada día.`,

      shopIntro: () =>
        `<b>Tienda</b>\n\n` +
        `Los créditos sirven para conversar sin límite y desbloquear contenido exclusivo. Se pagan con Telegram Stars.\n\n` +
        `<i>Los créditos no tienen valor monetario, no son transferibles ni canjeables por dinero y caducan a los 12 meses de la compra. ` +
        `Se entregan al instante: al pagar aceptas su entrega inmediata y la pérdida del derecho de desistimiento. ` +
        `<a href="${L("terminos")}">Términos</a> · <a href="${L("reembolsos")}">Reembolsos</a>.</i>`,

      packButton: (p: { name: string; total: number; stars: number; featured: boolean }) =>
        `${p.featured ? "✦ " : ""}${p.name} · ${n(p.total)} créditos · ${n(p.stars)} ⭐`,

      invoiceTitle: (name: string) => `${BRAND} · Pack ${name}`,
      invoiceDescription: (credits: number, bonus: number) =>
        `${n(credits)} créditos${bonus ? ` (incluye ${n(bonus)} de regalo)` : ""}. ` +
        `Sin valor monetario, no transferibles, caducan a los 12 meses. Entrega inmediata: al pagar renuncias al desistimiento.`,
      invoiceLabel: (credits: number) => `${credits} créditos`,

      preCheckoutErrors: {
        generic: "No hemos podido validar el pedido. Vuelve a abrir la tienda e inténtalo de nuevo.",
        age: "Debes verificar tu mayoría de edad antes de comprar. Escribe /start.",
        blocked: "Tu cuenta no puede realizar compras. Escribe /paysupport si crees que es un error.",
        pack: "Este pack ya no está disponible. Abre la tienda para ver los actuales.",
      },

      receipt: (r: Receipt) =>
        `<b>Pago confirmado</b>\n\n` +
        `Pack: <b>${esc(r.pack)}</b>\n` +
        `Créditos añadidos: <b>${n(r.credits)}</b>\n` +
        `Saldo actual: <b>${n(r.balance)}</b>\n` +
        `Caducidad de este lote: ${d(r.expires)}\n\n` +
        `Referencia: <code>${esc(r.reference)}</code>\n\n` +
        `<i>Gracias por tu compra. Si necesitas ayuda con un pago, escribe /paysupport.</i>`,
      paymentUnknown: (ref: string) =>
        `Hemos recibido tu pago (ref. <code>${esc(ref)}</code>) y lo estamos revisando. Escribe /paysupport si necesitas ayuda.`,

      refundNotice: (credits: number, stars: number) =>
        `<b>Reembolso procesado</b>\n\nTe hemos devuelto ${n(stars)} ⭐ y se han retirado ${n(credits)} créditos de tu saldo.`,

      balance: (p: Balance) => {
        const label: Record<string, string> = {
          purchase: "Compra",
          spend_message: "Mensaje",
          spend_unlock: "Contenido desbloqueado",
          refund: "Reembolso",
          expire: "Caducidad",
          restore: "Devolución automática",
          spend_photo: "Foto personalizada",
          bonus: "Regalo",
        };
        const lines = [`<b>Tu saldo</b>\n`, `Créditos disponibles: <b>${n(p.total)}</b>`, `Mensajes gratuitos hoy: ${p.freeLeft} de ${p.freePerDay}`];
        if (p.batches.length) {
          lines.push(`\n<b>Lotes activos</b>`);
          for (const b of p.batches) lines.push(`· ${n(b.credits_remaining)} créditos · caducan el ${d(b.expires_at)}`);
        }
        if (p.txs.length) {
          lines.push(`\n<b>Últimos movimientos</b>`);
          for (const t of p.txs) {
            const sign = t.amount > 0 ? "+" : "−";
            lines.push(`· ${d(t.created_at)} · ${label[t.type] ?? t.type} · ${sign}${n(Math.abs(t.amount))}`);
          }
        }
        return lines.join("\n");
      },

      galleryEmpty: (name: string) => `${esc(name)} todavía no tiene contenido exclusivo disponible. Vuelve pronto.`,
      galleryIntro: (name: string, balance: number) =>
        `<b>Galería de ${esc(name)}</b>\n\nContenido exclusivo generado con IA. Tu saldo: <b>${n(balance)}</b> créditos.`,
      tierLabel: (t: string) => ({ basico: "Básico", medio: "Especial", premium: "Premium" } as Record<string, string>)[t] ?? t,
      previewCaption: (a: CaptionAsset, unlocked: boolean) =>
        `${a.caption ? `${esc(a.caption)}\n` : ""}<i>${ES.tierLabel(a.tier)} · ${unlocked ? "desbloqueado" : `${a.credit_cost} créditos`}</i>`,
      unlockConfirm: (cost: number, balance: number) =>
        `¿Desbloquear este contenido por <b>${cost} créditos</b>?\nTu saldo: ${n(balance)} créditos.\n\n<i>Una vez desbloqueado podrás verlo de nuevo sin coste.</i>`,
      unlockInsufficient: (cost: number, balance: number) =>
        `Este contenido cuesta ${cost} créditos y tu saldo es de ${n(balance)}. Puedes recargar en la tienda.`,
      unlockDone: (balance: number) => `<i>Desbloqueado. Saldo restante: ${n(balance)} créditos.</i>`,
      contentRestricted: () => `El contenido no está disponible para tu cuenta.`,
      photoOffer: (name: string, caption: string, cost: number) =>
        `<b>${esc(name)} puede hacerte una foto</b>\n\n<i>${esc(caption)}</i>\n\nCuesta <b>${cost} créditos</b> y será solo para ti. Se crea en unos segundos.`,
      photoGenerating: (name: string) => `${esc(name)} está preparando tu foto…`,
      photoDone: (balance: number) => `<i>Tu foto ya está guardada: puedes volver a verla gratis en la galería. Saldo: ${n(balance)} créditos.</i>`,
      photoRefused: (name: string) =>
        `${esc(name)} no puede hacer esa foto. Las fotos son siempre elegantes y sin desnudos, y nunca de personas reales. Prueba con otra idea, por ejemplo: «una foto en la playa al atardecer».`,
      photoUnavailable: () => `Ahora mismo no puedo crear fotos nuevas, pero tengo algunas en mi galería que te pueden gustar.`,
      photoFailed: () => `No ha salido bien la foto y no se te ha cobrado nada. Mientras tanto, mira esta de la galería.`,
      photoLimit: (limit: number) => `Has llegado al límite de ${limit} fotos personalizadas por hoy. Mañana podrás pedir más; mientras tanto, echa un vistazo a la galería.`,
      photoExpired: () => `Esta petición ya no está disponible. Pídeme la foto de nuevo.`,
      photoFromGallery: (name: string) => `Mira esta de la galería de ${esc(name)}:`,
      contentGone: () => `Este contenido ya no está disponible.`,
      companionUnavailable: () => `Esta companion no está disponible.`,
      textOnly: () => `Por ahora solo puedo leer mensajes de texto.`,
      moreQuestion: () => `¿Quieres ver más?`,

      info: (disclosure: string | null) =>
        `<b>Sobre ${BRAND}</b>\n\n` +
        `Todas las companions son personajes ficticios adultos creados con inteligencia artificial. No son personas reales ` +
        `y no se basan en personas reales. Las conversaciones y las imágenes están generadas por IA.\n\n` +
        (disclosure ? `<i>${esc(disclosure)}</i>\n\n` : "") +
        `Servicio exclusivo para mayores de 18 años.`,

      help: () =>
        `<b>Ayuda</b>\n\n` +
        `/start · Inicio\n/tienda · Comprar créditos\n/saldo · Saldo, caducidad y movimientos\n/galeria · Contenido exclusivo\n` +
        `/foto · Pedir una foto personalizada\n/companions · Cambiar de companion\n/info · Aviso sobre la IA\n/paysupport · Ayuda con pagos\n` +
        `/terminos · Términos de uso\n/privacidad · Privacidad y tus datos\n/borrar_datos · Eliminar tus datos`,

      terms: () =>
        `<b>Términos de uso</b>\n\n` +
        `· Servicio exclusivo para mayores de 18 años.\n· Las companions son personajes ficticios creados con IA.\n` +
        `· Los créditos no tienen valor monetario, no son transferibles y caducan a los 12 meses.\n` +
        `· Los pagos se realizan con Telegram Stars.\n\nTexto completo: ${L("terminos")}\nReembolsos: ${L("reembolsos")}`,

      privacy: (retentionDays: number) =>
        `<b>Privacidad</b>\n\n` +
        `Guardamos lo imprescindible para prestar el servicio: tu ID de Telegram, tu fecha de nacimiento (verificación de edad), ` +
        `tus conversaciones durante ${retentionDays} días y el registro contable de tus compras.\n\n` +
        `Puedes eliminar tus datos en cualquier momento con /borrar_datos.\n\nPolítica completa: ${L("privacidad")}`,

      paySupport: (contact: string | null) =>
        `<b>Ayuda con pagos</b>\n\n` +
        `Cuéntanos en tu próximo mensaje qué ha ocurrido e incluye, si la tienes, la referencia del recibo. Te responderemos lo antes posible.` +
        (contact ? `\n\nTambién puedes escribirnos a ${esc(contact)}.` : "") +
        `\n\n<i>Importante: el soporte de Telegram no puede ayudarte con compras realizadas en este bot. Todas las gestiones de pagos y reembolsos las atiende ${BRAND}.</i>`,
      paySupportReceived: () => `Hemos recibido tu consulta. Te responderemos por aquí lo antes posible.`,

      eraseConfirm: () =>
        `<b>Eliminar tus datos</b>\n\nSe borrarán de forma definitiva tus conversaciones, tu fecha de nacimiento y tus datos de perfil.\n\n` +
        `Conservaremos únicamente los registros contables de compras que la ley nos obliga a guardar. Tu saldo de créditos se mantiene.\n\n¿Quieres continuar?`,
      eraseDone: () => `Tus datos se han eliminado. Si vuelves, tendrás que verificar de nuevo tu edad con /start.`,
      eraseCancelled: () => `No se ha eliminado nada.`,

      expiryWarning: (credits: number, date: string, days: number) =>
        `Recordatorio de ${BRAND}: ${n(credits)} créditos de tu saldo caducan el ${d(date)} (en ${days} días).`,

      cancelled: () => `Cancelado.`,

      btn: {
        continue: "Continuar",
        talkTo: (name: string) => `Conversar con ${name}`,
        topUp: "Recargar",
        goShop: "Ir a la tienda",
        seeShop: "Ver la tienda",
        unlock: (cost: number) => `Desbloquear · ${cost} créditos`,
        seeAgain: "Ver de nuevo",
        seeMore: "Ver más",
        confirm: "Confirmar",
        cancel: "Cancelar",
        eraseYes: "Sí, eliminar mis datos",
        createPhoto: (cost: number) => `Crear foto · ${cost} créditos`,
        viewGallery: "Ver galería",
        terms: "Términos",
        privacy: "Privacidad",
        refunds: "Reembolsos",
      },
    };
    return ES;
  }

  const EN = {
    welcome: () =>
      `<b>Welcome to ${BRAND}</b>\n\n` +
      `Private conversations with companions created with artificial intelligence: attentive, with a personality of their own and always available.\n\n` +
      `Everything happens here, with complete discretion.`,

    ageGate: () =>
      `<b>Adults only (18+)</b>\n\n` +
      `To continue, type your date of birth in the format <b>DD/MM/YYYY</b>.\n\n` +
      `Once entered, it cannot be changed. By sending it you confirm that you are of legal age and that you accept the ` +
      `<a href="${L("terminos")}">Terms of Use</a> and the <a href="${L("privacidad")}">Privacy Policy</a>.`,

    ageInvalid: () => `I couldn't read that date. Please type it like this, for example: <b>23/04/1994</b>.`,

    ageRejected: () =>
      `${BRAND} is exclusively for people aged 18 or over, so we can't offer you access.\n\n` +
      `Thank you for your honesty.`,

    aiDisclosure: () =>
      `<b>Before you start</b>\n\n` +
      `The companions at ${BRAND} are <b>fictional characters created with artificial intelligence</b>. They are not real people, ` +
      `and all conversations and images are AI-generated. You can check this at any time with /info.`,

    catalogIntro: () => `<b>Choose who you'd like to talk to</b>\n\nYou can change companion at any time.`,

    companionCard: (c: { name: string; tagline: string | null; personality_summary: string | null }) =>
      `<b>${esc(c.name)}</b>` +
      (c.tagline ? `\n<i>${esc(c.tagline)}</i>` : "") +
      (c.personality_summary ? `\n\n${esc(c.personality_summary)}` : ""),

    companionChosen: (name: string) => `You've chosen <b>${esc(name)}</b>. Write to her whenever you like.`,
    needCompanion: () => `First, choose a companion to start talking.`,
    chatHint: (name: string) => `You're talking to <b>${esc(name)}</b>. Write whatever you like.`,

    blocked: () => `Your account doesn't have access to ${BRAND}. If you think this is a mistake, type /paysupport.`,

    underReview: () =>
      `We've paused this conversation. For safety reasons, your account is under review, without access to content or purchases.\n\n` +
      `If you think this is a mistake, type /paysupport.`,

    minorCut: (name: string) =>
      `${esc(name)} has ended the conversation.\n\n` +
      `${BRAND} is an adults-only service. For safety reasons, your account is under review.`,

    prohibited: () => `That's not something I'll do. I'd rather we talked about something else.`,

    crisis: () =>
      `I'm going to step out of character for a moment, because what you're telling me really matters.\n\n` +
      `If you're going through a very hard time, you don't have to face it alone. Please contact your local emergency number or a crisis line ` +
      `in your country (in Spain: <b>024</b>, free, confidential and available 24/7; emergencies: <b>112</b>).\n\n` +
      `Talking to someone you trust also helps. I'm still here if you want to keep talking.`,

    llmError: () => `I can't reply right now. Please try again in a few seconds; you haven't been charged.`,

    freeLeft3: () => `<i>You have 3 free messages left today. When they run out, you can keep talking using credits.</i>`,

    freeExhausted: (cost: number) =>
      `<i>You've used today's free messages. From now on, each message costs ${cost} credits. ` +
      `Your free messages will be back tomorrow.</i>`,

    noCredits: (cost: number, balance: number) =>
      `To keep talking today you need ${cost} credits per message, and your balance is ${n(balance)}.\n\n` +
      `Top up in the shop or come back tomorrow: your free messages renew every day.`,

    shopIntro: () =>
      `<b>Shop</b>\n\n` +
      `Credits let you keep talking without limits and unlock exclusive content. They are paid for with Telegram Stars.\n\n` +
      `<i>Credits have no monetary value, are non-transferable, cannot be exchanged for money and expire 12 months after purchase. ` +
      `They are delivered instantly: by paying you accept immediate delivery and waive your right of withdrawal. ` +
      `<a href="${L("terminos")}">Terms</a> · <a href="${L("reembolsos")}">Refunds</a>.</i>`,

    packButton: (p: { name: string; total: number; stars: number; featured: boolean }) =>
      `${p.featured ? "✦ " : ""}${p.name} · ${n(p.total)} credits · ${n(p.stars)} ⭐`,

    invoiceTitle: (name: string) => `${BRAND} · ${name} pack`,
    invoiceDescription: (credits: number, bonus: number) =>
      `${n(credits)} credits${bonus ? ` (includes ${n(bonus)} bonus)` : ""}. ` +
      `No monetary value, non-transferable, expire after 12 months. Instant delivery: by paying you waive the right of withdrawal.`,
    invoiceLabel: (credits: number) => `${credits} credits`,

    preCheckoutErrors: {
      generic: "We couldn't validate your order. Please open the shop again and retry.",
      age: "You must verify that you are 18 or over before buying. Type /start.",
      blocked: "Your account can't make purchases. Type /paysupport if you think this is a mistake.",
      pack: "This pack is no longer available. Open the shop to see the current ones.",
    },

    receipt: (r: Receipt) =>
      `<b>Payment confirmed</b>\n\n` +
      `Pack: <b>${esc(r.pack)}</b>\n` +
      `Credits added: <b>${n(r.credits)}</b>\n` +
      `Current balance: <b>${n(r.balance)}</b>\n` +
      `These credits expire on: ${d(r.expires)}\n\n` +
      `Reference: <code>${esc(r.reference)}</code>\n\n` +
      `<i>Thank you for your purchase. If you need help with a payment, type /paysupport.</i>`,
    paymentUnknown: (ref: string) =>
      `We've received your payment (ref. <code>${esc(ref)}</code>) and we're reviewing it. Type /paysupport if you need help.`,

    refundNotice: (credits: number, stars: number) =>
      `<b>Refund processed</b>\n\nWe've returned ${n(stars)} ⭐ to you and removed ${n(credits)} credits from your balance.`,

    balance: (p: Balance) => {
      const label: Record<string, string> = {
        purchase: "Purchase",
        spend_message: "Message",
        spend_unlock: "Unlocked content",
        refund: "Refund",
        expire: "Expiry",
        restore: "Automatic return",
        spend_photo: "Custom photo",
        bonus: "Gift",
      };
      const lines = [`<b>Your balance</b>\n`, `Available credits: <b>${n(p.total)}</b>`, `Free messages today: ${p.freeLeft} of ${p.freePerDay}`];
      if (p.batches.length) {
        lines.push(`\n<b>Active credit batches</b>`);
        for (const b of p.batches) lines.push(`· ${n(b.credits_remaining)} credits · expire on ${d(b.expires_at)}`);
      }
      if (p.txs.length) {
        lines.push(`\n<b>Recent activity</b>`);
        for (const t of p.txs) {
          const sign = t.amount > 0 ? "+" : "−";
          lines.push(`· ${d(t.created_at)} · ${label[t.type] ?? t.type} · ${sign}${n(Math.abs(t.amount))}`);
        }
      }
      return lines.join("\n");
    },

    galleryEmpty: (name: string) => `${esc(name)} doesn't have any exclusive content yet. Come back soon.`,
    galleryIntro: (name: string, balance: number) =>
      `<b>${esc(name)}'s gallery</b>\n\nExclusive AI-generated content. Your balance: <b>${n(balance)}</b> credits.`,
    tierLabel: (t: string) => ({ basico: "Basic", medio: "Special", premium: "Premium" } as Record<string, string>)[t] ?? t,
    previewCaption: (a: CaptionAsset, unlocked: boolean) => {
      const cap = a.caption_en || a.caption;
      return `${cap ? `${esc(cap)}\n` : ""}<i>${EN.tierLabel(a.tier)} · ${unlocked ? "unlocked" : `${a.credit_cost} credits`}</i>`;
    },
    unlockConfirm: (cost: number, balance: number) =>
      `Unlock this content for <b>${cost} credits</b>?\nYour balance: ${n(balance)} credits.\n\n<i>Once unlocked, you can view it again at no cost.</i>`,
    unlockInsufficient: (cost: number, balance: number) =>
      `This content costs ${cost} credits and your balance is ${n(balance)}. You can top up in the shop.`,
    unlockDone: (balance: number) => `<i>Unlocked. Remaining balance: ${n(balance)} credits.</i>`,
    contentRestricted: () => `Content isn't available for your account.`,
    photoOffer: (name: string, caption: string, cost: number) =>
      `<b>${esc(name)} can take a photo for you</b>\n\n<i>${esc(caption)}</i>\n\nIt costs <b>${cost} credits</b> and it will be just for you. It's ready in a few seconds.`,
    photoGenerating: (name: string) => `${esc(name)} is getting your photo ready…`,
    photoDone: (balance: number) => `<i>Your photo is saved: you can view it again for free in the gallery. Balance: ${n(balance)} credits.</i>`,
    photoRefused: (name: string) =>
      `${esc(name)} can't take that photo. Photos are always tasteful, without nudity, and never of real people. Try another idea, for example: "a photo on the beach at sunset".`,
    photoUnavailable: () => `I can't create new photos right now, but there are some in my gallery you might like.`,
    photoFailed: () => `The photo didn't come out right and you haven't been charged. In the meantime, have a look at this one from the gallery.`,
    photoLimit: (limit: number) => `You've reached the limit of ${limit} custom photos for today. You can ask for more tomorrow; meanwhile, take a look at the gallery.`,
    photoExpired: () => `This request is no longer available. Ask me for the photo again.`,
    photoFromGallery: (name: string) => `Take a look at this one from ${esc(name)}'s gallery:`,
    contentGone: () => `This content is no longer available.`,
    companionUnavailable: () => `This companion isn't available.`,
    textOnly: () => `For now I can only read text messages.`,
    moreQuestion: () => `Would you like to see more?`,

    info: (disclosure: string | null) =>
      `<b>About ${BRAND}</b>\n\n` +
      `All companions are fictional adult characters created with artificial intelligence. They are not real people ` +
      `and are not based on real people. Conversations and images are AI-generated.\n\n` +
      (disclosure ? `<i>${esc(disclosure)}</i>\n\n` : "") +
      `Adults-only service (18+).`,

    help: () =>
      `<b>Help</b>\n\n` +
      `/start · Home\n/tienda · Buy credits\n/saldo · Balance, expiry and activity\n/galeria · Exclusive content\n` +
      `/foto · Ask for a custom photo\n/companions · Change companion\n/info · AI notice\n/paysupport · Payment help\n` +
      `/terminos · Terms of use\n/privacidad · Privacy and your data\n/borrar_datos · Delete your data`,

    terms: () =>
      `<b>Terms of use</b>\n\n` +
      `· Adults-only service (18+).\n· Companions are fictional characters created with AI.\n` +
      `· Credits have no monetary value, are non-transferable and expire after 12 months.\n` +
      `· Payments are made with Telegram Stars.\n\nFull text: ${L("terminos")}\nRefunds: ${L("reembolsos")}`,

    privacy: (retentionDays: number) =>
      `<b>Privacy</b>\n\n` +
      `We only keep what we need to provide the service: your Telegram ID, your date of birth (age verification), ` +
      `your conversations for ${retentionDays} days and the accounting record of your purchases.\n\n` +
      `You can delete your data at any time with /borrar_datos.\n\nFull policy: ${L("privacidad")}`,

    paySupport: (contact: string | null) =>
      `<b>Payment help</b>\n\n` +
      `Tell us in your next message what happened and, if you have it, include the reference from your receipt. We'll reply as soon as possible.` +
      (contact ? `\n\nYou can also write to us at ${esc(contact)}.` : "") +
      `\n\n<i>Important: Telegram support can't help with purchases made in this bot. All payment and refund requests are handled by ${BRAND}.</i>`,
    paySupportReceived: () => `We've received your request. We'll reply here as soon as possible.`,

    eraseConfirm: () =>
      `<b>Delete your data</b>\n\nYour conversations, date of birth and profile data will be permanently deleted.\n\n` +
      `We will only keep the purchase accounting records that the law requires us to retain. Your credit balance is kept.\n\nDo you want to continue?`,
    eraseDone: () => `Your data has been deleted. If you come back, you'll need to verify your age again with /start.`,
    eraseCancelled: () => `Nothing has been deleted.`,

    expiryWarning: (credits: number, date: string, days: number) =>
      `${BRAND} reminder: ${n(credits)} credits in your balance expire on ${d(date)} (in ${days} days).`,

    cancelled: () => `Cancelled.`,

    btn: {
      continue: "Continue",
      talkTo: (name: string) => `Talk to ${name}`,
      topUp: "Top up",
      goShop: "Go to the shop",
      seeShop: "See the shop",
      unlock: (cost: number) => `Unlock · ${cost} credits`,
      seeAgain: "View again",
      seeMore: "See more",
      confirm: "Confirm",
      cancel: "Cancel",
      eraseYes: "Yes, delete my data",
      createPhoto: (cost: number) => `Create photo · ${cost} credits`,
      viewGallery: "View gallery",
      terms: "Terms",
      privacy: "Privacy",
      refunds: "Refunds",
    },
  };
  return EN;
}

export type Texts = ReturnType<typeof build>;
const CACHE: Partial<Record<Lang, Texts>> = {};

/** Paquete de textos para un idioma. */
export function tr(lang: Lang | string | null | undefined): Texts {
  const l: Lang = lang === "en" ? "en" : "es";
  return (CACHE[l] ??= build(l));
}

/** Compatibilidad: textos en español. */
export const T = new Proxy({} as Texts, { get: (_t, k) => (tr("es") as any)[k] });
