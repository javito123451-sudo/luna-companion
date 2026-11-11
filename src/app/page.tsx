import Link from "next/link";

export default function Home() {
  const bot = process.env.NEXT_PUBLIC_BOT_USERNAME;
  return (
    <main className="wrap">
      <div className="brand">Dreamora</div>
      <h1>Conversaciones privadas con compañeras creadas con inteligencia artificial.</h1>
      <p className="muted">Servicio exclusivo para mayores de 18 años. Todas las companions son personajes ficticios generados por IA.</p>
      {bot ? (
        <p>
          <a href={`https://t.me/${bot}`}>Abrir en Telegram</a>
        </p>
      ) : null}
      <nav className="legal-nav">
        <Link href="/legal/terminos">Términos de uso</Link>
        <Link href="/legal/privacidad">Privacidad</Link>
        <Link href="/legal/reembolsos">Reembolsos</Link>
      </nav>
    </main>
  );
}
