// Multijugador: WebSocket cap al servidor de Cloudflare (sala única).
"use strict";

const PROD_SERVER = "wss://sant-andreu-rpg.realbluehead.workers.dev/ws";
function serverUrl() {
  const q = new URLSearchParams(location.search).get("server");
  if (q) return q;
  if (["localhost", "127.0.0.1"].includes(location.hostname)) return `ws://${location.hostname}:8787/ws`;
  return PROD_SERVER;
}

const net = {
  ws: null, id: null, others: new Map(), connected: false, retry: 0,
  sendT: 0, last: "", lookTimer: null,

  connect() {
    let ws;
    try { ws = new WebSocket(serverUrl()); } catch { return this.reconnect(); }
    this.ws = ws;
    ws.onopen = () => { this.retry = 0; this.send({ t: "hello", look: state.look, ...this.pos() }); };
    ws.onmessage = (e) => { try { this.onMessage(JSON.parse(e.data)); } catch { /* missatge invàlid */ } };
    ws.onclose = () => {
      this.connected = false; this.others.clear(); this.ws = null;
      coinsOnDisconnect();
      updateOnline();
      this.reconnect();
    };
  },
  reconnect() {
    const wait = Math.min(30000, 1000 * 2 ** this.retry++);
    setTimeout(() => this.connect(), wait);
  },
  send(m) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); },
  pos() {
    const pl = state.player;
    return { x: Math.round(pl.x), y: Math.round(pl.y), dir: pl.dir, moving: pl.moving, bike: !!state.riding, room: state.interior?.id || "" };
  },
  sendLook() {
    clearTimeout(this.lookTimer);
    this.lookTimer = setTimeout(() => this.send({ t: "look", look: state.look }), 300);
  },
  addOther(p) {
    this.others.set(p.id, { ...p, tx: p.x, ty: p.y, anim: 0, frame: 0, sprites: makeHeroSet(p.look) });
  },
  onMessage(m) {
    coinsOnMessage(m);
    if (m.t === "welcome") {
      this.id = m.id; this.connected = true; this.others.clear();
      sendAuth(); // si s'ha entrat amb Google, el servidor ho torna a verificar
      for (const p of m.players) this.addOther(p);
    } else if (m.t === "join") {
      this.addOther(m.p);
    } else if (m.t === "leave") {
      this.others.delete(m.id);
    } else if (m.t === "move") {
      const o = this.others.get(m.id);
      if (o) {
        if ((m.room || "") !== (o.room || "")) { o.x = m.x; o.y = m.y; } // ha entrat o sortit d'un bar: sense interpolar
        Object.assign(o, { tx: m.x, ty: m.y, dir: m.dir, moving: m.moving, bike: !!m.bike, room: m.room || "" });
      }
    } else if (m.t === "auth") {
      onAuthReply(m);
    } else if (m.t === "say") {
      const o = this.others.get(m.id);
      const text = String(m.text).slice(0, CFG.chat.maxLength);
      if (o) { o.bubble = bubbleFor(text); logChat(o.look.name, text, false); }
    } else if (m.t === "look") {
      const o = this.others.get(m.id);
      if (o) { o.look = m.look; o.sprites = makeHeroSet(m.look); o.riderSprites = null; }
    }
    updateOnline();
  },
  update(dt) {
    // Enviem la posició ~6 cops per segon mentre ens movem, i un cop quan parem
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / 6;
      const p = this.pos(), key = `${p.x},${p.y},${p.dir},${p.moving}`;
      if (key !== this.last) { this.last = key; this.send({ t: "move", ...p }); }
    }
    // Interpolació suau dels altres avatars
    const a = 1 - Math.pow(0.0001, dt);
    for (const o of this.others.values()) {
      const dist = Math.hypot(o.tx - o.x, o.ty - o.y);
      if (dist > 400) { o.x = o.tx; o.y = o.ty; } // teletransport
      else { o.x += (o.tx - o.x) * a; o.y += (o.ty - o.y) * a; }
      if (o.moving || dist > 2) { o.anim += dt * 8; o.frame = Math.floor(o.anim) % 4; } else o.frame = 0;
    }
  },
};

function updateOnline() {
  const el = document.getElementById("online");
  el.classList.toggle("offline", !net.connected);
  el.querySelector("span").textContent = net.connected
    ? `${net.others.size + 1} connectat${net.others.size ? "s" : ""}`
    : "Sense connexió";
}

