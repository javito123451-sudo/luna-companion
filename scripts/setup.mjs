#!/usr/bin/env node
/**
 * Luna Companions · puesta en marcha en un solo comando.
 *   node scripts/setup.mjs
 *
 * Requisitos en tu ordenador: Node 20+, git, GitHub CLI (gh) y Vercel CLI (npm i -g vercel),
 * con sesión iniciada en ambos (gh auth login · vercel login).
 *
 * Qué hace (es seguro repetirlo):
 *  1. Comprueba herramientas y sesiones.
 *  2. Enlaza esta carpeta con el proyecto de Vercel "luna-companion".
 *  3. Elimina variables obsoletas (TIKLIVEAPI_KEY, TELEGRAM_CHAT_ID, BLOB_READ_WRITE_TOKEN antiguo).
 *  4. Crea el Blob store PRIVADO "luna-private-content" (iad1) y lo conecta a Production y Preview.
 *  5. Crea el repo privado de GitHub "luna-companion", hace push y lo conecta a Vercel.
 *  6. Despliega a producción.
 */
import { execSync, spawnSync } from "node:child_process";

const TEAM = "team_LBcRPZe8wx4n5gEubum6hyOn";
const PROJECT = "luna-companion";
const STORE = "luna-private-content";
const REPO = "luna-companion";
const scope = ["--scope", TEAM];

const ok = (m) => console.log(`\x1b[32m✔\x1b[0m ${m}`);
const info = (m) => console.log(`\x1b[36m→\x1b[0m ${m}`);
const fail = (m) => {
  console.error(`\x1b[31m✘ ${m}\x1b[0m`);
  process.exit(1);
};

function run(cmd, args, { allowFail = false, quiet = false } = {}) {
  const r = spawnSync(cmd, args, { stdio: quiet ? "pipe" : "inherit", encoding: "utf8", shell: process.platform === "win32" });
  if (r.status !== 0 && !allowFail) fail(`Falló: ${cmd} ${args.join(" ")}`);
  return { code: r.status ?? 1, out: (r.stdout ?? "") + (r.stderr ?? "") };
}
const has = (cmd) => run(cmd, ["--version"], { allowFail: true, quiet: true }).code === 0;

// 1 ─ Herramientas
info("Comprobando herramientas…");
for (const t of ["git", "gh", "vercel"]) if (!has(t)) fail(`Falta "${t}". ${t === "vercel" ? "Instálalo con: npm i -g vercel" : t === "gh" ? "Instálalo desde https://cli.github.com" : ""}`);
if (run("gh", ["auth", "status"], { allowFail: true, quiet: true }).code !== 0) fail('No has iniciado sesión en GitHub. Ejecuta: gh auth login');
if (run("vercel", ["whoami"], { allowFail: true, quiet: true }).code !== 0) fail("No has iniciado sesión en Vercel. Ejecuta: vercel login");
ok("git, gh y vercel listos");

// 2 ─ Enlace con Vercel
info("Enlazando con el proyecto de Vercel…");
run("vercel", ["link", "--yes", "--project", PROJECT, ...scope]);
ok(`Carpeta enlazada a ${PROJECT}`);

// 3 ─ Variables obsoletas
info("Eliminando variables obsoletas…");
for (const v of ["TIKLIVEAPI_KEY", "TELEGRAM_CHAT_ID", "BLOB_READ_WRITE_TOKEN"]) {
  const r = run("vercel", ["env", "rm", v, "--yes", ...scope], { allowFail: true, quiet: true });
  console.log(`   ${v}: ${r.code === 0 ? "eliminada" : "no existía o no se puede borrar (ignorado)"}`);
}

// 4 ─ Blob store privado
info("Configurando almacén privado de contenido…");
const list = run("vercel", ["storage", "list", ...scope], { allowFail: true, quiet: true }).out;
if (!list.includes(STORE)) {
  run("vercel", ["storage", "create", STORE, "--type", "blob", "--access", "private", "--region", "iad1", ...scope]);
  ok(`Creado ${STORE} (privado, iad1)`);
} else ok(`${STORE} ya existía`);
const conn = run("vercel", ["storage", "connect", STORE, "--yes", "-e", "production", "-e", "preview", "--project", PROJECT, ...scope], { allowFail: true, quiet: true });
if (conn.code === 0) ok(`${STORE} conectado a Production y Preview`);
else if (/already/i.test(conn.out)) ok(`${STORE} ya estaba conectado`);
else fail(`No se pudo conectar el almacén:\n${conn.out}`);

// 5 ─ GitHub
info("Publicando el código en GitHub (repo privado)…");
const login = execSync("gh api user -q .login", { encoding: "utf8" }).trim();
const remoteUrl = `https://github.com/${login}/${REPO}.git`;
if (run("gh", ["repo", "view", `${login}/${REPO}`], { allowFail: true, quiet: true }).code !== 0) {
  run("gh", ["repo", "create", REPO, "--private", "--description", "Luna Companions · bot de Telegram +18 con pagos en Stars"]);
  ok(`Repo creado: ${login}/${REPO}`);
} else ok(`El repo ${login}/${REPO} ya existe`);
run("git", ["remote", "remove", "origin"], { allowFail: true, quiet: true });
run("git", ["remote", "add", "origin", remoteUrl]);
run("git", ["push", "-u", "origin", "main"]);
ok("Código subido a la rama main");

info("Conectando Vercel con el repo…");
const gc = run("vercel", ["git", "connect", remoteUrl, "--yes", ...scope], { allowFail: true, quiet: true });
if (gc.code === 0 || /already/i.test(gc.out)) ok("Vercel conectado a GitHub: cada push a main desplegará solo");
else console.log(`   Aviso: no se pudo conectar Git automáticamente. Hazlo en Vercel → Settings → Git.\n${gc.out}`);

// 6 ─ Producción
info("Desplegando a producción…");
run("vercel", ["deploy", "--prod", "--yes", ...scope]);
ok("¡Listo! Siguiente paso: abre /admin → Bot → «Configurar webhook y comandos».");
