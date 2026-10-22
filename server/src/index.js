// Servidor multijugador de Sant Andreu RPG: una sala única (Durable Object) que
// reenvia posicions i aspecte dels avatars a tots els connectats via WebSocket.
import { DurableObject } from "cloudflare:workers";

const ROOM_NAME = "sant-andreu";
const MAX_PLAYERS = 150;
const MAX_MSG = 1024;
const MAX_SAY = 30;
const SAY_COOLDOWN_MS = 1000;
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
  async fetch(request) {
    if (this.ctx.getWebSockets().length >= MAX_PLAYERS) return new Response("Sala plena", { status: 503 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: crypto.randomUUID().slice(0, 8), p: null });
    return new Response(null, { status: 101, webSocket: client });
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

  webSocketMessage(ws, raw) {
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
      ws.send(JSON.stringify({ t: "welcome", id: a.id, players }));
      this.broadcast(isNew ? { t: "join", p: a.p } : { t: "look", id: a.id, look }, ws);
    } else if (!a.p) {
      return;
    } else if (m.t === "move") {
      Object.assign(a.p, cleanPos(m));
      ws.serializeAttachment(a);
      this.broadcast({ t: "move", id: a.id, x: a.p.x, y: a.p.y, dir: a.p.dir, moving: a.p.moving }, ws);
    } else if (m.t === "say") {
      const text = String(m.text ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_SAY);
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
