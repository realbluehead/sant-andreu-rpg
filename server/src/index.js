// Servidor multijugador de Sant Andreu RPG: una sala única (Durable Object) que
// reenvia posicions i aspecte dels avatars a tots els connectats via WebSocket.
// També gestiona les monedes compartides: n'apareix una cada 5 s en un lloc accessible
// (fins a 50 alhora) i quan algú l'agafa desapareix per a tothom.
import { DurableObject } from "cloudflare:workers";
import SPAWNS from "./spawns.json"; // tiles caminables dins del barri (generats per build_map.py)

const ROOM_NAME = "sant-andreu";
const MAX_PLAYERS = 150;
const MAX_MSG = 1024;
const SAY_COOLDOWN_MS = 1000;
// Valors per defecte; els de veritat es llegeixen del config.json publicat (vegeu getConfig)
const DEFAULT_CFG = { maxSay: 30, maxCoins: 50, coinEveryMs: 5000 };
const CONFIG_TTL_MS = 60_000;
const TS = 16;              // píxels per tile al client
const PICK_RADIUS = 3;      // tiles de marge (latència) per validar que el jugador és a prop
const ALLOWED_ORIGINS = [/^https:\/\/realbluehead\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];

const COLOR = /^#[0-9a-f]{6}$/i;
const LOOK_ENUMS = {
  hairStyle: ["short", "long", "ponytail", "afro", "bald"],
  bottom: ["pants", "shorts", "skirt"],
  extra: ["none", "cap", "glasses"],
};
const LOOK_COLORS = ["skin", "hair", "shirt", "pants", "shoes", "extraColor"];
const DIRS = ["down", "up", "left", "right"];

function cleanLook(l) {
  if (!l || typeof l !== "object") return null;
  const out = { name: String(l.name ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 16) || "Jugador" };
  for (const k of LOOK_COLORS) out[k] = COLOR.test(l[k]) ? l[k] : "#888888";
  for (const [k, vals] of Object.entries(LOOK_ENUMS)) out[k] = vals.includes(l[k]) ? l[k] : vals[0];
  return out;
}
const num = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : 0);
function cleanPos(m) {
  return { x: num(m.x), y: num(m.y), dir: DIRS.includes(m.dir) ? m.dir : "down", moving: !!m.moving };
}

export class Room extends DurableObject {
  // Llegeix config.json de GitHub Pages (com a molt un cop per minut). Així, publicar un canvi
  // de configuració al repositori també s'aplica al servidor sense tornar-lo a desplegar.
  async getConfig() {
    const now = Date.now();
    if (this.cfg && now - this.cfgAt < CONFIG_TTL_MS) return this.cfg;
    this.cfgAt = now;
    this.cfg = this.cfg || { ...DEFAULT_CFG };
    try {
      const url = this.env.CONFIG_URL;
      if (url) {
        const r = await fetch(`${url}?t=${Math.floor(now / CONFIG_TTL_MS)}`);
        if (r.ok) {
          const c = await r.json();
          const n = (v, lo, hi, d) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
          this.cfg = {
            maxSay: n(c.chat?.maxLength, 1, 200, DEFAULT_CFG.maxSay),
            maxCoins: n(c.coins?.max, 0, 500, DEFAULT_CFG.maxCoins),
            coinEveryMs: n(c.coins?.spawnEverySeconds, 1, 3600, 5) * 1000,
          };
        }
      }
    } catch { /* mantenim l'última configuració bona */ }
    return this.cfg;
  }

  async fetch(request) {
    if (this.ctx.getWebSockets().length >= MAX_PLAYERS) return new Response("Sala plena", { status: 503 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: crypto.randomUUID().slice(0, 8), p: null });
    return new Response(null, { status: 101, webSocket: client });
  }

  // --- Monedes -----------------------------------------------------------
  async loadCoins() {
    if (this.coins) return;
    const stored = await this.ctx.storage.get(["coins", "nextCoinId"]);
    this.coins = stored.get("coins") || [];
    this.nextCoinId = stored.get("nextCoinId") || 1;
  }
  async saveCoins() {
    await this.ctx.storage.put({ coins: this.coins, nextCoinId: this.nextCoinId });
  }
  async ensureAlarm() {
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now() + (await this.getConfig()).coinEveryMs);
  }
  // Cada 5 s, mentre hi hagi algú connectat, apareix una moneda nova
  async alarm() {
    const players = this.ctx.getWebSockets().filter((ws) => ws.deserializeAttachment()?.p).length;
    if (!players) return; // ningú connectat: no tornem a programar l'alarma
    const cfg = await this.getConfig();
    await this.loadCoins();
    if (this.coins.length < cfg.maxCoins) {
      const taken = new Set(this.coins.map((c) => c.x + "," + c.y));
      for (let i = 0; i < 20; i++) {
        const [tx, ty] = SPAWNS[(Math.random() * SPAWNS.length) | 0];
        const x = tx + 0.5, y = ty + 0.5;
        if (taken.has(x + "," + y)) continue;
        const coin = { id: this.nextCoinId++, x, y };
        this.coins.push(coin);
        await this.saveCoins();
        this.broadcast({ t: "coin", c: coin });
        break;
      }
    }
    await this.ctx.storage.setAlarm(Date.now() + cfg.coinEveryMs);
  }

  broadcast(msg, except) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const a = ws.deserializeAttachment();
      if (!a?.p) continue; // encara no ha dit hola
      try { ws.send(data); } catch { /* connexió tancant-se */ }
    }
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > MAX_MSG) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const a = ws.deserializeAttachment();
    if (m.t === "hello") {
      const look = cleanLook(m.look);
      if (!look) return;
      const isNew = !a.p;
      a.p = { id: a.id, look, ...cleanPos(m) };
      ws.serializeAttachment(a);
      const players = this.ctx.getWebSockets()
        .filter((o) => o !== ws)
        .map((o) => o.deserializeAttachment()?.p)
        .filter(Boolean);
      await this.loadCoins();
      ws.send(JSON.stringify({ t: "welcome", id: a.id, players, coins: this.coins, maxCoins: (await this.getConfig()).maxCoins }));
      await this.ensureAlarm();
      this.broadcast(isNew ? { t: "join", p: a.p } : { t: "look", id: a.id, look }, ws);
    } else if (!a.p) {
      return;
    } else if (m.t === "move") {
      Object.assign(a.p, cleanPos(m));
      ws.serializeAttachment(a);
      this.broadcast({ t: "move", id: a.id, x: a.p.x, y: a.p.y, dir: a.p.dir, moving: a.p.moving }, ws);
    } else if (m.t === "take") {
      await this.loadCoins();
      const i = this.coins.findIndex((c) => c.id === m.id);
      if (i < 0) return; // algú se l'ha endut abans
      const c = this.coins[i];
      if (Number.isFinite(m.x) && Number.isFinite(m.y)) Object.assign(a.p, cleanPos({ ...a.p, x: m.x, y: m.y }));
      if (Math.hypot(a.p.x / TS - c.x, a.p.y / TS - c.y) > PICK_RADIUS) return;
      this.coins.splice(i, 1);
      await this.saveCoins();
      a.coins = (a.coins || 0) + 1;
      ws.serializeAttachment(a);
      const msg = { t: "taken", id: c.id, by: a.id };
      ws.send(JSON.stringify(msg));
      this.broadcast(msg, ws);
    } else if (m.t === "say") {
      const text = String(m.text ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, (await this.getConfig()).maxSay);
      const now = Date.now();
      if (!text || now - (a.lastSay || 0) < SAY_COOLDOWN_MS) return;
      a.lastSay = now;
      ws.serializeAttachment(a);
      this.broadcast({ t: "say", id: a.id, text }, ws);
    } else if (m.t === "look") {
      const look = cleanLook(m.look);
      if (!look) return;
      a.p.look = look;
      ws.serializeAttachment(a);
      this.broadcast({ t: "look", id: a.id, look }, ws);
    }
  }

  leave(ws) {
    const a = ws.deserializeAttachment();
    if (a?.p) this.broadcast({ t: "leave", id: a.id }, ws);
  }
  webSocketClose(ws, code) {
    this.leave(ws);
    try { ws.close(code, "adeu"); } catch { /* ja tancat */ }
  }
  webSocketError(ws) {
    this.leave(ws);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Cal WebSocket", { status: 426 });
      const origin = request.headers.get("Origin") || "";
      if (!ALLOWED_ORIGINS.some((re) => re.test(origin))) return new Response("Origen no permès", { status: 403 });
      return env.ROOM.get(env.ROOM.idFromName(ROOM_NAME)).fetch(request);
    }
    return new Response("Sant Andreu RPG — servidor multijugador", { headers: { "content-type": "text/plain; charset=utf-8" } });
  },
};
