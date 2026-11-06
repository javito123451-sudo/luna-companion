/** Todos los textos visibles para el usuario. Español de España, tono elegante y discreto. */
import { legalUrl } from "./settings";

export const BRAND = "Luna Companions";

export const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Madrid" });

export const fmtNum = (n: number) => n.toLocaleString("es-ES");

export const MENU = {
  chat: "Chatear",
  gallery: "Galería",
  shop: "Tienda",
  balance: "Saldo",
  switch: "Cambiar companion",
  help: "Ayuda",
} as const;

export const T = {
  welcome: () =>
    `<b>Bienvenido a ${BRAND}</b>\n\n` +
    `Conversaciones privadas con compañeras creadas con inteligencia artificial: atentas, con personalidad propia y siempre disponibles.\n\n` +
    `Todo ocurre aquí, con total discreción.`,

  ageGate: () =>
    `<b>Solo para mayores de 18 años</b>\n\n` +
    `Para continuar, escribe tu fecha de nacimiento con el formato <b>DD/MM/AAAA</b>.\n\n` +
    `Una vez indicada no podrá modificarse. Al enviarla confirmas que eres mayor de edad y que aceptas los ` +
    `<a href="${legalUrl("terminos")}">Términos de uso</a> y la <a href="${legalUrl("privacidad")}">Política de privacidad</a>.`,

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

  blocked: () =>
    `Tu cuenta no tiene acceso a ${BRAND}. Si crees que se trata de un error, escribe /paysupport.`,

  underReview: () =>
    `Hemos pausado esta conversación. Por seguridad, tu cuenta queda en revisión y sin acceso a contenido ni compras.\n\n` +
    `Si crees que se trata de un error, escribe /paysupport.`,

  minorCut: (name: string) =>
    `${esc(name)} ha terminado la conversación.\n\n` +
    `${BRAND} es un servicio exclusivo para adultos. Por seguridad, tu cuenta queda en revisión.`,

  prohibited: () =>
    `Eso no es algo que vaya a hacer. Prefiero que sigamos hablando de otra cosa.`,

  crisis: () =>
    `Voy a salir un momento del personaje, porque lo que cuentas me importa de verdad.\n\n` +
    `Si estás pasando por un momento muy difícil, no tienes por qué afrontarlo a solas. En España puedes llamar ` +
    `al <b>024</b>, gratuito, confidencial y disponible las 24 horas. Si estás en peligro inmediato, llama al <b>112</b>.\n\n` +
    `Hablar con alguien de confianza también ayuda. Aquí sigo si quieres seguir hablando.`,

  llmError: () => `Ahora mismo no puedo responderte. Inténtalo de nuevo en unos segundos; no se te ha cobrado nada.`,

  freeLeft3: () =>
    `<i>Te quedan 3 mensajes gratuitos hoy. Cuando se agoten, podrás seguir conversando con créditos.</i>`,

  freeExhausted: (cost: number) =>
    `<i>Has usado tus mensajes gratuitos de hoy. A partir de ahora cada mensaje cuesta ${cost} créditos. ` +
    `Mañana tendrás de nuevo tus mensajes gratuitos.</i>`,

  noCredits: (cost: number, balance: number) =>
    `Para seguir conversando hoy necesitas ${cost} créditos por mensaje y tu saldo es de ${fmtNum(balance)}.\n\n` +
    `Recarga en la tienda o vuelve mañana: tus mensajes gratuitos se renuevan cada día.`,

  shopIntro: () =>
    `<b>Tienda</b>\n\n` +
    `Los créditos sirven para conversar sin límite y desbloquear contenido exclusivo. Se pagan con Telegram Stars.\n\n` +
    `<i>Los créditos no tienen valor monetario, no son transferibles ni canjeables por dinero y caducan a los 12 meses de la compra. ` +
    `Se entregan al instante: al pagar aceptas su entrega inmediata y la pérdida del derecho de desistimiento. ` +
    `<a href="${legalUrl("terminos")}">Términos</a> · <a href="${legalUrl("reembolsos")}">Reembolsos</a>.</i>`,

  packButton: (p: { name: string; total: number; stars: number; featured: boolean }) =>
    `${p.featured ? "✦ " : ""}${p.name} · ${fmtNum(p.total)} créditos · ${fmtNum(p.stars)} ⭐`,

  invoiceTitle: (name: string) => `${BRAND} · Pack ${name}`,
  invoiceDescription: (credits: number, bonus: number) =>
    `${fmtNum(credits)} créditos${bonus ? ` (incluye ${fmtNum(bonus)} de regalo)` : ""}. ` +
    `Sin valor monetario, no transferibles, caducan a los 12 meses. Entrega inmediata: al pagar renuncias al desistimiento.`,

  preCheckoutErrors: {
    generic: "No hemos podido validar el pedido. Vuelve a abrir la tienda e inténtalo de nuevo.",
    age: "Debes verificar tu mayoría de edad antes de comprar. Escribe /start.",
    blocked: "Tu cuenta no puede realizar compras. Escribe /paysupport si crees que es un error.",
    pack: "Este pack ya no está disponible. Abre la tienda para ver los actuales.",
  },

  receipt: (r: { pack: string; credits: number; balance: number; expires: string; reference: string }) =>
    `<b>Pago confirmado</b>\n\n` +
    `Pack: <b>${esc(r.pack)}</b>\n` +
    `Créditos añadidos: <b>${fmtNum(r.credits)}</b>\n` +
    `Saldo actual: <b>${fmtNum(r.balance)}</b>\n` +
    `Caducidad de este lote: ${fmtDate(r.expires)}\n\n` +
    `Referencia: <code>${esc(r.reference)}</code>\n\n` +
    `<i>Gracias por tu compra. Si necesitas ayuda con un pago, escribe /paysupport.</i>`,

  refundNotice: (credits: number, stars: number) =>
    `<b>Reembolso procesado</b>\n\nTe hemos devuelto ${fmtNum(stars)} ⭐ y se han retirado ${fmtNum(credits)} créditos de tu saldo.`,

  balance: (p: {
    total: number;
    batches: { credits_remaining: number; expires_at: string }[];
    txs: { amount: number; type: string; created_at: string }[];
    freeLeft: number;
    freePerDay: number;
  }) => {
    const label: Record<string, string> = {
      purchase: "Compra",
      spend_message: "Mensaje",
      spend_unlock: "Contenido desbloqueado",
      refund: "Reembolso",
      expire: "Caducidad",
      restore: "Devolución automática",
      bonus: "Regalo",
    };
    const lines = [`<b>Tu saldo</b>\n`, `Créditos disponibles: <b>${fmtNum(p.total)}</b>`, `Mensajes gratuitos hoy: ${p.freeLeft} de ${p.freePerDay}`];
    if (p.batches.length) {
      lines.push(`\n<b>Lotes activos</b>`);
      for (const b of p.batches) lines.push(`· ${fmtNum(b.credits_remaining)} créditos · caducan el ${fmtDate(b.expires_at)}`);
    }
    if (p.txs.length) {
      lines.push(`\n<b>Últimos movimientos</b>`);
      for (const t of p.txs) {
        const sign = t.amount > 0 ? "+" : "−";
        lines.push(`· ${fmtDate(t.created_at)} · ${label[t.type] ?? t.type} · ${sign}${fmtNum(Math.abs(t.amount))}`);
      }
    }
    return lines.join("\n");
  },

  galleryEmpty: (name: string) => `${esc(name)} todavía no tiene contenido exclusivo disponible. Vuelve pronto.`,
  galleryIntro: (name: string, balance: number) =>
    `<b>Galería de ${esc(name)}</b>\n\nContenido exclusivo generado con IA. Tu saldo: <b>${fmtNum(balance)}</b> créditos.`,
  tierLabel: (t: string) => ({ basico: "Básico", medio: "Especial", premium: "Premium" }[t] ?? t),
  previewCaption: (a: { caption: string | null; tier: string; credit_cost: number }, unlocked: boolean) =>
    `${a.caption ? `${esc(a.caption)}\n` : ""}<i>${T.tierLabel(a.tier)} · ${unlocked ? "desbloqueado" : `${a.credit_cost} créditos`}</i>`,
  unlockConfirm: (cost: number, balance: number) =>
    `¿Desbloquear este contenido por <b>${cost} créditos</b>?\nTu saldo: ${fmtNum(balance)} créditos.\n\n<i>Una vez desbloqueado podrás verlo de nuevo sin coste.</i>`,
  unlockInsufficient: (cost: number, balance: number) =>
    `Este contenido cuesta ${cost} créditos y tu saldo es de ${fmtNum(balance)}. Puedes recargar en la tienda.`,
  unlockDone: (balance: number) => `<i>Desbloqueado. Saldo restante: ${fmtNum(balance)} créditos.</i>`,
  contentRestricted: () => `El contenido no está disponible para tu cuenta.`,

  info: (disclosure: string | null) =>
    `<b>Sobre ${BRAND}</b>\n\n` +
    `Todas las companions son personajes ficticios adultos creados con inteligencia artificial. No son personas reales ` +
    `y no se basan en personas reales. Las conversaciones y las imágenes están generadas por IA.\n\n` +
    (disclosure ? `<i>${esc(disclosure)}</i>\n\n` : "") +
    `Servicio exclusivo para mayores de 18 años.`,

  help: () =>
    `<b>Ayuda</b>\n\n` +
    `/start · Inicio\n/tienda · Comprar créditos\n/saldo · Saldo, caducidad y movimientos\n/galeria · Contenido exclusivo\n` +
    `/companions · Cambiar de companion\n/info · Aviso sobre la IA\n/paysupport · Ayuda con pagos\n` +
    `/terminos · Términos de uso\n/privacidad · Privacidad y tus datos\n/borrar_datos · Eliminar tus datos`,

  terms: () =>
    `<b>Términos de uso</b>\n\n` +
    `· Servicio exclusivo para mayores de 18 años.\n· Las companions son personajes ficticios creados con IA.\n` +
    `· Los créditos no tienen valor monetario, no son transferibles y caducan a los 12 meses.\n` +
    `· Los pagos se realizan con Telegram Stars.\n\nTexto completo: ${legalUrl("terminos")}\nReembolsos: ${legalUrl("reembolsos")}`,

  privacy: (retentionDays: number) =>
    `<b>Privacidad</b>\n\n` +
    `Guardamos lo imprescindible para prestar el servicio: tu ID de Telegram, tu fecha de nacimiento (verificación de edad), ` +
    `tus conversaciones durante ${retentionDays} días y el registro contable de tus compras.\n\n` +
    `Puedes eliminar tus datos en cualquier momento con /borrar_datos.\n\nPolítica completa: ${legalUrl("privacidad")}`,

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
    `Recordatorio de ${BRAND}: ${fmtNum(credits)} créditos de tu saldo caducan el ${fmtDate(date)} (en ${days} días).`,

  cancelled: () => `Cancelado.`,
};
