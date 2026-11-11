"use client";

import { useCallback, useEffect, useState } from "react";

type Tab = "metricas" | "contenido" | "pagos" | "bot";

function useSecret() {
  const [secret, setSecret] = useState("");
  useEffect(() => {
    try {
      setSecret(sessionStorage.getItem("lc_admin") ?? "");
    } catch {}
  }, []);
  const save = (s: string) => {
    setSecret(s);
    try {
      sessionStorage.setItem("lc_admin", s);
    } catch {}
  };
  return [secret, save] as const;
}

export default function Admin() {
  const [secret, setSecret] = useSecret();
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<Tab>("metricas");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState("");

  const api = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const res = await fetch(path, { ...init, headers: { ...(init.headers ?? {}), "x-admin-secret": secret } });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setAuthed(false);
        throw new Error("Clave incorrecta");
      }
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      return data;
    },
    [secret],
  );

  useEffect(() => {
    if (!secret) return;
    api("/api/admin/metrics")
      .then(() => {
        setAuthed(true);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, [secret, api]);

  if (!authed) {
    return (
      <main className="wrap admin">
        <div className="brand">Dreamora · Admin</div>
        <h1>Acceso</h1>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            setSecret(draft);
          }}
        >
          <input type="password" placeholder="Clave de administración" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
          <button type="submit">Entrar</button>
        </form>
        {error && <p className="err">{error}</p>}
      </main>
    );
  }

  return (
    <main className="wrap admin">
      <div className="brand">Dreamora · Admin</div>
      <div className="tabs">
        {(["metricas", "contenido", "pagos", "bot"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "" : "ghost"} onClick={() => setTab(t)}>
            {{ metricas: "Métricas", contenido: "Contenido", pagos: "Pagos", bot: "Bot" }[t]}
          </button>
        ))}
        <button className="ghost" onClick={() => setSecret("")}>
          Salir
        </button>
      </div>
      {tab === "metricas" && <Metrics api={api} />}
      {tab === "contenido" && <Content api={api} secret={secret} />}
      {tab === "pagos" && <Payments api={api} />}
      {tab === "bot" && <BotPanel api={api} />}
    </main>
  );
}

type ApiFn = (path: string, init?: RequestInit) => Promise<any>;

function Metrics({ api }: { api: ApiFn }) {
  const [m, setM] = useState<any>(null);
  useEffect(() => {
    api("/api/admin/metrics").then(setM).catch(() => undefined);
  }, [api]);
  if (!m) return <p className="muted">Cargando…</p>;
  const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
  return (
    <>
      <div className="cards">
        <div className="card">Usuarios<b>{m.users.total}</b></div>
        <div className="card">Verificados +18<b>{m.users.verified}</b></div>
        <div className="card">Activos 7 días<b>{m.users.active_7d}</b></div>
        <div className="card">Conversión 1.ª compra<b>{pct(m.conversionFirstPurchase)}</b></div>
        <div className="card">Ingresos netos<b>{m.revenue.stars_net} ⭐</b></div>
        <div className="card">ARPU<b>{m.arpuStars} ⭐</b></div>
        <div className="card">ARPPU<b>{m.arppuStars} ⭐</b></div>
        <div className="card">Reembolsos<b>{m.revenue.refunds}</b></div>
        <div className="card">En revisión<b>{m.users.in_review}</b></div>
        <div className="card">Alertas de seguridad<b>{m.openSafetyFlags}</b></div>
      </div>
      <h2>Ingresos por día (30 días)</h2>
      <table>
        <thead><tr><th>Día</th><th>Pedidos</th><th>Stars</th></tr></thead>
        <tbody>{m.revenueByDay.map((d: any) => <tr key={d.day}><td>{d.day}</td><td>{d.orders}</td><td>{d.stars}</td></tr>)}</tbody>
      </table>
      <h2>Ingresos por pack</h2>
      <table>
        <thead><tr><th>Pack</th><th>Pedidos</th><th>Stars</th></tr></thead>
        <tbody>{m.revenueByPack.map((p: any) => <tr key={p.id}><td>{p.name}</td><td>{p.orders}</td><td>{p.stars}</td></tr>)}</tbody>
      </table>
      <h2>Contenido más vendido</h2>
      <table>
        <thead><tr><th>Companion</th><th>Tier</th><th>Descripción</th><th>Desbloqueos</th><th>Créditos</th></tr></thead>
        <tbody>{m.topContent.map((a: any) => <tr key={a.id}><td>{a.companion}</td><td>{a.tier}</td><td>{a.caption}</td><td>{a.unlocks}</td><td>{a.credits}</td></tr>)}</tbody>
      </table>
    </>
  );
}

function Content({ api, secret }: { api: ApiFn; secret: string }) {
  const [assets, setAssets] = useState<any[]>([]);
  const [companions, setCompanions] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api("/api/admin/assets").then((d) => setAssets(d.assets)).catch((e) => setMsg(e.message));
    api("/api/admin/companions").then((d) => setCompanions(d.companions)).catch(() => undefined);
  }, [api]);
  useEffect(load, [load]);

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/admin/assets", { method: "POST", body: form, headers: { "x-admin-secret": secret } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg("Subido correctamente. La vista previa difuminada se ha generado automáticamente.");
      (e.target as HTMLFormElement).reset();
      load();
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string, active: boolean) {
    await api("/api/admin/assets", { method: "PATCH", body: JSON.stringify({ id, active }), headers: { "content-type": "application/json" } });
    load();
  }

  async function uploadReference(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/admin/companions", { method: "POST", body: form, headers: { "x-admin-secret": secret } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg("Foto de referencia guardada. Se usará como avatar en el catálogo y para mantener su cara en las fotos generadas.");
      (e.target as HTMLFormElement).reset();
      load();
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Foto de referencia de cada companion</h2>
      <p className="muted">
        Retrato claro de la cara, vestida y con aspecto adulto. Se usa como avatar en el catálogo y para que las fotos generadas mantengan su cara.
        Estado: {companions.map((c) => `${c.name} ${c.has_reference ? "✓" : "—"}`).join(" · ")}
      </p>
      <form onSubmit={uploadReference}>
        <div className="row">
          <select name="companion" required>
            {companions.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
          <input name="file" type="file" accept="image/jpeg,image/png,image/webp" required />
        </div>
        <label className="row">
          <input name="ai_confirm" type="checkbox" value="yes" required />
          Confirmo que la imagen es 100 % generada por IA, representa a un personaje ficticio adulto y no se parece a ninguna persona real.
        </label>
        <button disabled={busy}>{busy ? "Subiendo…" : "Guardar referencia"}</button>
      </form>

      <h2>Subir contenido</h2>
      <form onSubmit={upload}>
        <div className="row">
          <select name="companion" required>
            {companions.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
          <select name="tier" required defaultValue="basico">
            <option value="basico">Básico</option>
            <option value="medio">Especial (medio)</option>
            <option value="premium">Premium</option>
          </select>
          <input name="credit_cost" type="number" min={1} max={10000} placeholder="Coste en créditos" required />
        </div>
        <div className="row">
          <input name="caption" placeholder="Descripción breve y discreta (español)" maxLength={500} style={{ flex: 1 }} />
        </div>
        <div className="row">
          <input name="caption_en" placeholder="Short description (English, optional)" maxLength={500} style={{ flex: 1 }} />
        </div>
        <div className="row">
          <input name="file" type="file" accept="image/jpeg,image/png,image/webp" required />
          <span className="muted">JPG, PNG o WebP · máximo 4 MB</span>
        </div>
        <label className="row">
          <input name="ai_confirm" type="checkbox" value="yes" required />
          Confirmo que la imagen es 100 % generada por IA, representa a un personaje ficticio adulto y no se parece a ninguna persona real.
        </label>
        <button disabled={busy}>{busy ? "Subiendo…" : "Subir"}</button>
      </form>
      {msg && <p className="muted">{msg}</p>}
      <h2>Contenido</h2>
      <div className="row">
        <button
          className="ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await api("/api/admin/assets", { method: "PUT" });
              setMsg(`Vistas previas regeneradas: ${r.regenerated}`);
            } catch (e: any) {
              setMsg(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Regenerar vistas previas
        </button>
      </div>
      <table>
        <thead><tr><th>Companion</th><th>Origen</th><th>Tier</th><th>Coste</th><th>Descripción</th><th>Ventas</th><th>Créditos</th><th>Estado</th></tr></thead>
        <tbody>
          {assets.map((a) => (
            <tr key={a.id}>
              <td>{a.companion}</td><td>{a.source === "generated" ? "Generada en chat" : "Galería"}</td><td>{a.tier}</td><td>{a.credit_cost}</td><td>{a.caption}</td><td>{a.sales}</td><td>{a.credits}</td>
              <td><button className="ghost" onClick={() => toggle(a.id, !a.active)}>{a.active ? "En galería · retirar" : a.source === "generated" ? "Privada · publicar en galería" : "Inactivo · activar"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Payments({ api }: { api: ApiFn }) {
  const [rows, setRows] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => {
    api("/api/admin/payments").then((d) => setRows(d.payments)).catch((e) => setMsg(e.message));
  }, [api]);
  useEffect(load, [load]);
  async function refund(chargeId: string) {
    const reason = prompt("Motivo del reembolso");
    if (reason === null) return;
    try {
      const r = await api("/api/admin/refund", { method: "POST", body: JSON.stringify({ charge_id: chargeId, reason }), headers: { "content-type": "application/json" } });
      setMsg(`Reembolsado. Créditos retirados: ${r.creditsReverted}`);
      load();
    } catch (e: any) {
      setMsg(e.message);
    }
  }
  return (
    <>
      {msg && <p className="muted">{msg}</p>}
      <table>
        <thead><tr><th>Fecha</th><th>Usuario</th><th>Pack</th><th>Stars</th><th>Créditos</th><th>Estado</th><th>Referencia</th><th></th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{new Date(p.paid_at ?? p.created_at).toLocaleString("es-ES")}</td>
              <td>{p.telegram_id}</td><td>{p.pack_id}</td><td>{p.stars}</td><td>{p.credits}</td><td>{p.status}</td>
              <td style={{ wordBreak: "break-all" }}>{p.charge_id}</td>
              <td>{p.status === "paid" && <button className="ghost" onClick={() => refund(p.charge_id)}>Reembolsar</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function BotPanel({ api }: { api: ApiFn }) {
  const [info, setInfo] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [tests, setTests] = useState<any[]>([]);
  async function testCompanions() {
    setTests([]);
    const { companions } = await api("/api/admin/companions");
    for (const c of companions) {
      try {
        const r = await api("/api/admin/llm-test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slug: c.slug, message: "Hola, preséntate en dos frases: ¿quién eres y cómo eres?" }),
        });
        setTests((t) => [...t, r]);
      } catch (e: any) {
        setTests((t) => [...t, { slug: c.slug, reply: `Error: ${e.message}` }]);
      }
    }
  }
  const load = useCallback(() => {
    api("/api/admin/setup").then(setInfo).catch((e) => setMsg(e.message));
  }, [api]);
  useEffect(load, [load]);
  async function configure() {
    try {
      setInfo(await api("/api/admin/setup", { method: "POST" }));
      setMsg("Webhook, comandos y descripción configurados.");
    } catch (e: any) {
      setMsg(e.message);
    }
  }
  return (
    <>
      <div className="row">
        <button onClick={configure}>Configurar webhook y comandos</button>
        <button className="ghost" onClick={testCompanions}>Probar personalidad de las companions</button>
      </div>
      {msg && <p className="muted">{msg}</p>}
      {tests.length > 0 && (
        <table>
          <thead><tr><th>Companion</th><th>Prompt de BD</th><th>Bloque seguridad</th><th>Respuesta</th></tr></thead>
          <tbody>{tests.map((t) => <tr key={t.slug}><td>{t.slug}</td><td>{String(t.promptFromDb ?? "—")}</td><td>{String(t.safetyBlockIncluded ?? "—")}</td><td>{t.reply}</td></tr>)}</tbody>
        </table>
      )}
      {info && <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(info, null, 2)}</pre>}
    </>
  );
}
