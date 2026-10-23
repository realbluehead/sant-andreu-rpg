#!/usr/bin/env node
// Admin local de Sant Andreu RPG: una pàgina per editar public/config.json i publicar-lo a GitHub.
// Ús:  node admin/server.mjs   (i obre http://localhost:8790)
// Només escolta a 127.0.0.1. No té dependències: només Node.
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PORT = Number(process.env.ADMIN_PORT) || 8790;
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const CONFIG = join(ROOT, "public", "config.json");
const SCHEMA = join(HERE, "schema.json");
// Registre de connexions: es llegeix del servidor multijugador amb el token de admin/.admin-token
// (el mateix valor que el secret ADMIN_TOKEN del worker). ADMIN_SERVER_URL permet apuntar al servidor local.
const GAME_SERVER = process.env.ADMIN_SERVER_URL || "https://sant-andreu-rpg.realbluehead.workers.dev";
const TOKEN_FILE = join(HERE, ".admin-token");
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);

const run = (cmd, args) => new Promise((resolve) => {
  execFile(cmd, args, { cwd: ROOT }, (err, stdout, stderr) => resolve({ ok: !err, out: (stdout + stderr).trim() }));
});

// Neteja i valida la configuració segons l'esquema: només claus conegudes, tipus correctes i dins dels límits
function clean(schema, input) {
  const out = {}, errors = [];
  for (const sec of schema.sections) {
    out[sec.key] = {};
    for (const f of sec.fields) {
      let v = input?.[sec.key]?.[f.key];
      if (f.type === "bool") {
        out[sec.key][f.key] = typeof v === "boolean" ? v : f.default;
        continue;
      }
      v = Number(v);
      if (!Number.isFinite(v)) { errors.push(`${sec.title} · ${f.label}: no és un número`); v = f.default; }
      if (f.type === "int") v = Math.round(v);
      if (v < f.min || v > f.max) errors.push(`${sec.title} · ${f.label}: ha d'estar entre ${f.min} i ${f.max}`);
      out[sec.key][f.key] = Math.min(f.max, Math.max(f.min, v));
    }
  }
  if (out.ultras.activeSeconds >= out.ultras.cycleSeconds) errors.push("Ultres: el temps que hi són ha de ser més curt que el cicle");
  if (out.thieves.giveUp <= out.thieves.sight) errors.push("Lladres: la distància de rendició ha de ser més gran que la de visió");
  return { config: out, errors };
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

async function readBody(req) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 100_000) throw new Error("massa gran");
  }
  return JSON.parse(data || "{}");
}

const server = createServer(async (req, res) => {
  // Protecció bàsica: només des d'aquest ordinador i, per a l'API, amb la capçalera pròpia
  // (una web externa no la pot enviar sense un CORS que aquí no permetem).
  if (!ALLOWED_HOSTS.has(req.headers.host)) return send(res, 403, { error: "Host no permès" });
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === "/" && req.method === "GET") {
      return send(res, 200, await readFile(join(HERE, "index.html"), "utf8"), "text/html; charset=utf-8");
    }
    if (url.pathname.startsWith("/api/") && req.headers["x-admin"] !== "1") return send(res, 403, { error: "Falta la capçalera X-Admin" });
    const schema = JSON.parse(await readFile(SCHEMA, "utf8"));

    if (url.pathname === "/api/state" && req.method === "GET") {
      const config = JSON.parse(await readFile(CONFIG, "utf8"));
      const status = await run("git", ["status", "--porcelain", "--", "public/config.json"]);
      const ahead = await run("git", ["rev-list", "--count", "@{u}..HEAD"]);
      const last = await run("git", ["log", "-1", "--format=%cr · %s", "--", "public/config.json"]);
      return send(res, 200, {
        schema, config,
        git: { dirty: status.out.length > 0, unpushed: Number(ahead.out) || 0, last: last.out },
      });
    }

    if (url.pathname === "/api/config" && req.method === "PUT") {
      const { config, errors } = clean(schema, await readBody(req));
      if (errors.length) { console.log("Configuració rebutjada:", errors.join(" | ")); return send(res, 400, { errors }); }
      // es conserven les claus que l'admin no edita (p. ex. auth.googleClientId)
      const current = JSON.parse(await readFile(CONFIG, "utf8"));
      await writeFile(CONFIG, JSON.stringify({ ...current, ...config }, null, 2) + "\n");
      console.log(`[${new Date().toLocaleTimeString()}] Desat public/config.json`);
      return send(res, 200, { ok: true, config });
    }

    if (url.pathname === "/api/publish" && req.method === "POST") {
      const status = await run("git", ["status", "--porcelain", "--", "public/config.json"]);
      const log = [];
      if (status.out) {
        await run("git", ["add", "--", "public/config.json"]);
        const c = await run("git", ["commit", "-m", "Actualitza la configuració del joc", "-m", "Fet des de l'admin local.", "--", "public/config.json"]);
        log.push(c.out);
        if (!c.ok) return send(res, 500, { ok: false, log });
      }
      const p = await run("git", ["push"]);
      log.push(p.out || "Res a pujar");
      console.log(`[${new Date().toLocaleTimeString()}] Publicar: ${p.ok ? "OK" : "ERROR"}\n  ${log.join("\n  ")}`);
      return send(res, p.ok ? 200 : 500, { ok: p.ok, log });
    }

    if (url.pathname === "/api/log" && req.method === "GET") {
      let token = "";
      try { token = (await readFile(TOKEN_FILE, "utf8")).trim(); } catch { /* sense token */ }
      if (!token) return send(res, 500, { error: "Falta admin/.admin-token (el token d'admin del servidor)" });
      const r = await fetch(`${GAME_SERVER}/admin/log`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return send(res, 502, { error: `El servidor ha respost ${r.status}` });
      return send(res, 200, await r.text());
    }

    return send(res, 404, { error: "No trobat" });
  } catch (e) {
    return send(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Admin de Sant Andreu RPG a http://localhost:${PORT}`);
});
