import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-static";
export const revalidate = 3600;

const UPDATED = "6 de noviembre de 2026";

function Owner() {
  const name = process.env.LEGAL_OWNER_NAME;
  const nif = process.env.LEGAL_OWNER_NIF;
  const address = process.env.LEGAL_OWNER_ADDRESS;
  const email = process.env.LEGAL_CONTACT_EMAIL;
  return (
    <ul className="legal">
      <li>Titular: {name ?? "—"}</li>
      <li>NIF: {nif ?? "—"}</li>
      <li>Domicilio: {address ?? "—"}</li>
      <li>Contacto: {email ?? "comando /paysupport del bot"}</li>
    </ul>
  );
}

const pages: Record<string, { title: string; body: () => JSX.Element }> = {
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
      <p className="muted">Última actualización: {UPDATED}</p>
      {page.body()}
      <nav className="legal-nav">
        <Link href="/legal/terminos">Términos</Link>
        <Link href="/legal/privacidad">Privacidad</Link>
        <Link href="/legal/reembolsos">Reembolsos</Link>
      </nav>
    </main>
  );
}
