import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-static";
export const revalidate = 3600;

const UPDATED = "6 de noviembre de 2026";
const UPDATED_EN = "6 November 2026";

function Owner({ en = false }: { en?: boolean }) {
  const name = process.env.LEGAL_OWNER_NAME;
  const nif = process.env.LEGAL_OWNER_NIF;
  const address = process.env.LEGAL_OWNER_ADDRESS;
  const email = process.env.LEGAL_CONTACT_EMAIL;
  return (
    <ul className="legal">
      <li>{en ? "Owner" : "Titular"}: {name ?? "—"}</li>
      <li>{en ? "Tax ID (NIF)" : "NIF"}: {nif ?? "—"}</li>
      <li>{en ? "Address" : "Domicilio"}: {address ?? "—"}</li>
      <li>{en ? "Contact" : "Contacto"}: {email ?? (en ? "/paysupport command in the bot" : "comando /paysupport del bot")}</li>
    </ul>
  );
}

const pages: Record<string, { title: string; en?: boolean; body: () => JSX.Element }> = {
  terminos: {
    title: "Términos de uso",
    body: () => (
      <>
        <h2>1. Quiénes somos</h2>
        <p>Luna Companions es un servicio de entretenimiento digital que se presta a través de un bot de Telegram.</p>
        <Owner />
        <h2>2. Solo para adultos</h2>
        <p>
          El servicio está reservado a personas mayores de 18 años. Antes de acceder debes indicar tu fecha de nacimiento, que no podrá
          modificarse. Si declaras ser menor de edad, o si detectamos indicios razonables de que lo eres, la cuenta se bloquea para el
          contenido y las compras y queda en revisión.
        </p>
        <h2>3. Personajes de inteligencia artificial</h2>
        <p>
          Todas las companions son personajes ficticios adultos (25 años o más) creados con inteligencia artificial. No son personas
          reales ni se basan en personas reales. Las conversaciones y las imágenes se generan con IA y pueden contener errores. Nada de lo
          que dicen constituye consejo profesional de ningún tipo.
        </p>
        <h2>4. Uso aceptable</h2>
        <ul className="legal">
          <li>No se permite ningún contenido o petición que implique a menores, rasgos o roles infantiles.</li>
          <li>No se permite contenido no consentido, violento, sobre personas reales, ni que fomente autolesiones o actividades ilegales.</li>
          <li>No se permite intentar eludir las medidas de seguridad, revender el acceso ni extraer contenido de forma automatizada.</li>
        </ul>
        <p>Podemos suspender o cerrar cuentas que incumplan estas normas.</p>
        <h2>5. Créditos y pagos</h2>
        <ul className="legal">
          <li>Los créditos se compran con Telegram Stars dentro del bot y sirven para enviar mensajes más allá de la cuota gratuita diaria y desbloquear contenido.</li>
          <li>Los créditos no tienen valor monetario, no son transferibles, no se pueden canjear por dinero ni por Stars y caducan a los 12 meses de su compra. Te avisaremos 7 y 2 días antes.</li>
          <li>Los créditos se consumen empezando por los que caducan antes.</li>
          <li>El contenido desbloqueado queda disponible para volver a verlo sin coste mientras el servicio esté activo.</li>
          <li>Los precios vigentes se muestran en la tienda antes de cada compra.</li>
        </ul>
        <h2>6. Entrega inmediata y desistimiento</h2>
        <p>
          Los créditos son contenido digital que se entrega de forma inmediata. Al completar el pago das tu consentimiento expreso a esa
          entrega inmediata y reconoces que, conforme al artículo 103.m) del Texto Refundido de la Ley General para la Defensa de los
          Consumidores y Usuarios, pierdes el derecho de desistimiento. Aun así, consulta nuestra <Link href="/legal/reembolsos">política de reembolsos</Link>.
        </p>
        <h2>7. Soporte</h2>
        <p>
          Para cualquier incidencia con pagos usa el comando /paysupport del bot. El soporte de Telegram no puede ayudarte con compras
          realizadas en este bot.
        </p>
        <h2>8. Responsabilidad y cambios</h2>
        <p>
          Prestamos el servicio con la máxima diligencia, pero no garantizamos que esté libre de interrupciones. Podemos actualizar estos
          términos; los cambios relevantes se comunicarán en el bot. La legislación aplicable es la española.
        </p>
      </>
    ),
  },
  privacidad: {
    title: "Política de privacidad",
    body: () => (
      <>
        <h2>Responsable del tratamiento</h2>
        <Owner />
        <h2>Qué datos tratamos y para qué</h2>
        <ul className="legal">
          <li>Identificador, nombre y alias de Telegram: para prestarte el servicio (ejecución del contrato).</li>
          <li>Fecha de nacimiento: para verificar que eres mayor de edad (obligación legal e interés legítimo en proteger a menores).</li>
          <li>Conversaciones con las companions: para generar las respuestas y mantener el contexto.</li>
          <li>Compras, créditos y reembolsos: para gestionar los pagos y cumplir obligaciones contables y fiscales.</li>
          <li>Señales de seguridad (por ejemplo, indicios de minoría de edad): para proteger a menores y a otros usuarios.</li>
        </ul>
        <h2>Encargados y transferencias</h2>
        <p>
          Utilizamos proveedores que tratan datos por cuenta nuestra: Telegram (mensajería y pagos con Stars), OpenAI (generación de
          respuestas; los mensajes se envían para generar la réplica), Vercel (alojamiento) y Neon (base de datos). Algunos están
          fuera del Espacio Económico Europeo; las transferencias se amparan en las cláusulas contractuales tipo de la Comisión Europea o
          en el Marco de Privacidad de Datos UE-EE. UU. No vendemos tus datos ni los usamos para entrenar modelos.
        </p>
        <h2>Cuánto tiempo los conservamos</h2>
        <ul className="legal">
          <li>Conversaciones: 90 días; después se eliminan automáticamente.</li>
          <li>Datos de perfil y fecha de nacimiento: mientras uses el servicio o hasta que pidas su eliminación.</li>
          <li>Registros de compras y créditos: el plazo exigido por la normativa contable y fiscal (hasta 6 años).</li>
          <li>Bloqueos por minoría de edad: se conservan para impedir nuevos accesos.</li>
        </ul>
        <h2>Tus derechos</h2>
        <p>
          Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad. El comando
          <b> /borrar_datos</b> elimina de forma inmediata tus conversaciones y tus datos de perfil, conservando solo los registros
          contables obligatorios. Para otros derechos escríbenos mediante /paysupport o al contacto indicado. También puedes reclamar ante la
          Agencia Española de Protección de Datos (aepd.es).
        </p>
      </>
    ),
  },
  reembolsos: {
    title: "Política de reembolsos",
    body: () => (
      <>
        <h2>Cuándo devolvemos tus Stars</h2>
        <ul className="legal">
          <li>Si un pago se ha cobrado pero los créditos no se han añadido a tu saldo.</li>
          <li>Si se ha producido un cobro duplicado.</li>
          <li>Si un error técnico nuestro ha impedido usar lo que compraste.</li>
          <li>Por cortesía, si lo solicitas en los 14 días siguientes a la compra y no has usado ninguno de los créditos de ese pack.</li>
        </ul>
        <h2>Cómo solicitarlo</h2>
        <p>
          Escribe /paysupport en el bot indicando la referencia que aparece en tu recibo. Respondemos en un plazo máximo de 72 horas. El
          soporte de Telegram no puede gestionar reembolsos de compras hechas en este bot.
        </p>
        <h2>Cómo se hace</h2>
        <p>
          Los reembolsos se realizan íntegramente en Telegram Stars, a la misma cuenta que pagó, a través del sistema oficial de Telegram.
          Al reembolsar, se retiran de tu saldo los créditos de ese pack; si ya habías usado parte, se descuentan de tu saldo disponible.
        </p>
        <h2>Créditos</h2>
        <p>
          Los créditos no tienen valor monetario, no son transferibles ni canjeables por dinero y caducan a los 12 meses de la compra. Los
          créditos caducados no son reembolsables. Te avisamos 7 y 2 días antes de cada caducidad.
        </p>
      </>
    ),
  },
  terms: {
    title: "Terms of Use",
    en: true,
    body: () => (
      <>
        <h2>1. Who we are</h2>
        <p>Luna Companions is a digital entertainment service provided through a Telegram bot.</p>
        <Owner en />
        <h2>2. Adults only</h2>
        <p>
          The service is reserved for people aged 18 or over. Before accessing it you must enter your date of birth, which cannot be
          changed afterwards. If you state that you are a minor, or if we detect reasonable signs that you are, the account is blocked from
          content and purchases and placed under review.
        </p>
        <h2>3. Artificial intelligence characters</h2>
        <p>
          All companions are fictional adult characters (aged 25 or over) created with artificial intelligence. They are not real people
          and are not based on real people. Conversations and images are AI-generated and may contain errors. Nothing they say constitutes
          professional advice of any kind.
        </p>
        <h2>4. Acceptable use</h2>
        <ul className="legal">
          <li>No content or request involving minors, childlike features or roles is allowed.</li>
          <li>No non-consensual or violent content, content about real people, or content that encourages self-harm or illegal activities is allowed.</li>
          <li>Attempting to bypass safety measures, reselling access or extracting content by automated means is not allowed.</li>
        </ul>
        <p>We may suspend or close accounts that breach these rules.</p>
        <h2>5. Credits and payments</h2>
        <ul className="legal">
          <li>Credits are purchased with Telegram Stars inside the bot and are used to send messages beyond the daily free allowance and to unlock content.</li>
          <li>Credits have no monetary value, are non-transferable, cannot be exchanged for money or Stars and expire 12 months after purchase. We will notify you 7 and 2 days in advance.</li>
          <li>Credits are spent starting with those that expire first.</li>
          <li>Unlocked content remains available to view again at no cost while the service is active.</li>
          <li>Current prices are shown in the shop before each purchase.</li>
        </ul>
        <h2>6. Immediate delivery and right of withdrawal</h2>
        <p>
          Credits are digital content delivered immediately. By completing payment you expressly consent to immediate delivery and
          acknowledge that, under article 103(m) of the Spanish consumer protection law (Texto Refundido de la Ley General para la Defensa
          de los Consumidores y Usuarios), you lose your right of withdrawal. Please also see our <Link href="/legal/refunds">refund policy</Link>.
        </p>
        <h2>7. Support</h2>
        <p>For any payment issue, use the /paysupport command in the bot. Telegram support cannot help with purchases made in this bot.</p>
        <h2>8. Liability and changes</h2>
        <p>
          We provide the service with the utmost diligence but cannot guarantee it will be uninterrupted. We may update these terms; relevant
          changes will be announced in the bot. These terms are governed by Spanish law. In case of discrepancy, the Spanish version prevails.
        </p>
      </>
    ),
  },
  privacy: {
    title: "Privacy Policy",
    en: true,
    body: () => (
      <>
        <h2>Data controller</h2>
        <Owner en />
        <h2>What data we process and why</h2>
        <ul className="legal">
          <li>Telegram ID, name and username: to provide the service (performance of the contract).</li>
          <li>Date of birth: to verify that you are of legal age (legal obligation and legitimate interest in protecting minors).</li>
          <li>Conversations with the companions: to generate replies and keep context.</li>
          <li>Purchases, credits and refunds: to manage payments and meet accounting and tax obligations.</li>
          <li>Safety signals (for example, signs that a user may be a minor): to protect minors and other users.</li>
        </ul>
        <h2>Processors and transfers</h2>
        <p>
          We use providers that process data on our behalf: Telegram (messaging and Stars payments), OpenAI (reply generation; messages are
          sent to generate the reply), Vercel (hosting) and Neon (database). Some are located outside the European Economic Area; transfers
          rely on the European Commission&apos;s standard contractual clauses or the EU-US Data Privacy Framework. We do not sell your data or
          use it to train models.
        </p>
        <h2>How long we keep it</h2>
        <ul className="legal">
          <li>Conversations: 90 days; they are then deleted automatically.</li>
          <li>Profile data and date of birth: while you use the service or until you ask us to delete them.</li>
          <li>Purchase and credit records: for the period required by accounting and tax law (up to 6 years).</li>
          <li>Blocks due to being a minor: kept to prevent new access.</li>
        </ul>
        <h2>Your rights</h2>
        <p>
          You can exercise your rights of access, rectification, erasure, objection, restriction and portability. The
          <b> /borrar_datos</b> command immediately deletes your conversations and profile data, keeping only the mandatory accounting records.
          For other rights, write to us via /paysupport or the contact above. You can also lodge a complaint with the Spanish Data Protection
          Agency (aepd.es).
        </p>
      </>
    ),
  },
  refunds: {
    title: "Refund Policy",
    en: true,
    body: () => (
      <>
        <h2>When we return your Stars</h2>
        <ul className="legal">
          <li>If a payment was charged but the credits were not added to your balance.</li>
          <li>If you were charged twice.</li>
          <li>If a technical error on our side prevented you from using what you bought.</li>
          <li>As a courtesy, if you ask within 14 days of purchase and have not used any credits from that pack.</li>
        </ul>
        <h2>How to request it</h2>
        <p>
          Type /paysupport in the bot, including the reference shown on your receipt. We reply within 72 hours at most. Telegram support
          cannot handle refunds for purchases made in this bot.
        </p>
        <h2>How it works</h2>
        <p>
          Refunds are made in full in Telegram Stars, to the same account that paid, through Telegram&apos;s official system. When refunding,
          the credits from that pack are removed from your balance; if you have already used part of them, they are deducted from your
          available balance.
        </p>
        <h2>Credits</h2>
        <p>
          Credits have no monetary value, are non-transferable, cannot be exchanged for money and expire 12 months after purchase. Expired
          credits are not refundable. We notify you 7 and 2 days before each expiry.
        </p>
      </>
    ),
  },
};

export function generateStaticParams() {
  return Object.keys(pages).map((slug) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  return { title: `${pages[params.slug]?.title ?? "Legal"} · Luna Companions` };
}

export default function LegalPage({ params }: { params: { slug: string } }) {
  const page = pages[params.slug];
  if (!page) notFound();
  return (
    <main className="wrap">
      <div className="brand">Luna Companions</div>
      <h1>{page.title}</h1>
      <p className="muted">{page.en ? `Last updated: ${UPDATED_EN}` : `Última actualización: ${UPDATED}`}</p>
      {page.body()}
      {page.en ? (
        <nav className="legal-nav">
          <Link href="/legal/terms">Terms</Link>
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/legal/refunds">Refunds</Link>
          <Link href="/legal/terminos">Español</Link>
        </nav>
      ) : (
        <nav className="legal-nav">
          <Link href="/legal/terminos">Términos</Link>
          <Link href="/legal/privacidad">Privacidad</Link>
          <Link href="/legal/reembolsos">Reembolsos</Link>
          <Link href="/legal/terms">English</Link>
        </nav>
      )}
    </main>
  );
}
