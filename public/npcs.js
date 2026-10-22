// NPCs de Sant Andreu RPG: policies en moto fent la ronda i ciclistes pels carrils bici.
// Les rutes són deterministes (mateixa llavor a tots els navegadors) i la posició depèn
// del rellotge, així tots els jugadors veuen els NPCs al mateix lloc sense servidor.
// Si un ciclista atropella el teu avatar, perds vida.
"use strict";

const NPC_CONFIG = {
  police: { count: 10, speed: 4.2, lane: 1.3, walkSteps: 40, seed: 1000 },  // tiles/s (~30 km/h)
  bike: { count: 24, speed: 2.6, lane: 0.6, walkSteps: 30, seed: 5000 },    // ~19 km/h
};
const MAX_HP = 100, HIT_COOLDOWN = 1.2;
const DAMAGE = { bike: 5, police: 20, ultras: 25 };
const HEAL_RADIUS = 2.5; // tiles al voltant d'una farmàcia
const DEATH_TEXT = {
  bike: "Un ciclista t'ha atropellat.<br>Compte amb els carrils bici!",
  police: "Una moto de la policia t'ha atropellat.<br>Aparta't quan sentis les sirenes!",
  ultras: "Els ultres de la UESA t'han passat per sobre.<br>Quan els vegis venir, fuig!",
};

const npcs = { list: [], sprites: null, hp: MAX_HP, invuln: 0, dead: false, floaters: [], flash: 0, lastCause: "bike",
  pharmacies: [], gangs: [] };

// ---------------------------------------------------------------------------
// Rutes sobre el graf de carrers
function prepGraph(g) {
  const adj = g.nodes.map(() => []);
  g.edges.forEach(([a, b, line], i) => {
    let len = 0;
    for (let j = 1; j < line.length; j++) len += Math.hypot(line[j][0] - line[j - 1][0], line[j][1] - line[j - 1][1]);
    adj[a].push({ to: b, edge: i, fwd: true, len });
    adj[b].push({ to: a, edge: i, fwd: false, len });
  });
  return { nodes: g.nodes, edges: g.edges, adj };
}

function shortestPath(G, from, to) {
  const n = G.nodes.length, dist = new Array(n).fill(Infinity), prev = new Array(n).fill(null), done = new Uint8Array(n);
  dist[from] = 0;
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0 || u === to) break;
    done[u] = 1;
    for (const e of G.adj[u]) {
      const d = dist[u] + e.len;
      if (d < dist[e.to]) { dist[e.to] = d; prev[e.to] = { from: u, e }; }
    }
  }
  const steps = [];
  for (let c = to; c !== from && prev[c]; c = prev[c].from) steps.unshift(prev[c].e);
  return steps;
}

function makeRoute(G, r, walkSteps) {
  const start = (r() * G.nodes.length) | 0;
  const steps = [];
  let node = start, lastEdge = -1;
  for (let i = 0; i < walkSteps; i++) {
    const opts = G.adj[node].filter((e) => e.edge !== lastEdge);
    const choice = (opts.length ? opts : G.adj[node])[(r() * (opts.length || G.adj[node].length)) | 0];
    if (!choice) break;
    steps.push(choice);
    node = choice.to; lastEdge = choice.edge;
  }
  steps.push(...shortestPath(G, node, start)); // tanquem el circuit
  const pts = [];
  for (const s of steps) {
    const line = G.edges[s.edge][2];
    const seq = s.fwd ? line : [...line].reverse();
    for (const p of (pts.length ? seq.slice(1) : seq)) pts.push(p);
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}

function initNPCs(graph) {
  npcs.pharmacies = (state.meta.pois || []).filter((p) => p.c === "pharmacy");
  if (!graph) return;
  npcs.sprites = makeNpcSprites();
  initGangs(graph);
  for (const [kind, cfg] of Object.entries(NPC_CONFIG)) {
    const G = prepGraph(kind === "police" ? graph.car : graph.bike);
    if (!G.nodes.length) continue;
    for (let i = 0; i < cfg.count; i++) {
      const r = rng(cfg.seed + i * 7919);
      const route = makeRoute(G, r, cfg.walkSteps);
      if (route.len < 20) continue;
      npcs.list.push({
        kind, route, speed: cfg.speed * (0.85 + r() * 0.3), lane: cfg.lane, phase: r() * route.len,
        variant: i % (kind === "police" ? 1 : npcs.sprites.bike.length), x: 0, y: 0, dir: "right", hidden: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Simulació
function npcPos(n, t) {
  const { pts, cum, len } = n.route;
  const d = ((t * n.speed + n.phase) % len + len) % len;
  let lo = 0, hi = cum.length - 1;
  while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid; }
  const [x0, y0] = pts[lo], [x1, y1] = pts[hi];
  const seg = cum[hi] - cum[lo] || 1e-6, f = (d - cum[lo]) / seg;
  const dx = (x1 - x0) / seg, dy = (y1 - y0) / seg;
  // circulem per la dreta
  return { x: x0 + (x1 - x0) * f - dy * n.lane, y: y0 + (y1 - y0) * f + dx * n.lane, dx, dy };
}

function updateNPCs(dt) {
  const t = Date.now() / 1000;
  for (const n of npcs.list) {
    const p = npcPos(n, t);
    n.x = p.x * TS; n.y = p.y * TS + TS / 2;
    n.dir = Math.abs(p.dx) > Math.abs(p.dy) ? (p.dx > 0 ? "right" : "left") : (p.dy > 0 ? "down" : "up");
  }
  npcs.invuln = Math.max(0, npcs.invuln - dt);
  npcs.flash = Math.max(0, npcs.flash - dt);
  for (const f of npcs.floaters) f.t += dt;
  npcs.floaters = npcs.floaters.filter((f) => f.t < 1.2);
  updateGangs(t, dt);
  if (!npcs.dead) { checkHits(); checkPharmacy(); }
}

function checkHits() {
  if (npcs.invuln > 0) return;
  const pl = state.player;
  for (const n of npcs.list) {
    const hw = n.kind === "police" ? 13 : 10; // la moto és més ampla
    if (Math.abs(n.x - pl.x) < hw && Math.abs(n.y - pl.y) < 9) {
      hurtPlayer(DAMAGE[n.kind], n, n.kind);
      return;
    }
  }
  for (const g of npcs.gangs) {
    if (!g.active) continue;
    for (const m of g.members) {
      if (Math.abs(m.x - pl.x) < 9 && Math.abs(m.y - pl.y) < 8) {
        hurtPlayer(DAMAGE.ultras, m, "ultras");
        return;
      }
    }
  }
}

// A prop d'una farmàcia recuperes tota la vida
function checkPharmacy() {
  if (npcs.hp >= MAX_HP) return;
  const tx = state.player.x / TS, ty = state.player.y / TS;
  if (!npcs.pharmacies.some((p) => (p.x - tx) ** 2 + (p.y - ty) ** 2 < HEAL_RADIUS * HEAL_RADIUS)) return;
  const gained = MAX_HP - npcs.hp;
  npcs.hp = MAX_HP;
  npcs.floaters.push({ text: `+${gained}`, t: 0, color: "#4ade80" });
  updateHpUi();
  showBanner("T'has recuperat!", "heal");
}

function showBanner(text, kind) {
  const el = document.getElementById("banner");
  el.textContent = text;
  el.className = "show " + kind;
  clearTimeout(showBanner.t);
  showBanner.t = setTimeout(() => { el.className = ""; }, 2200);
}

function hurtPlayer(dmg, by, cause) {
  npcs.hp = Math.max(0, npcs.hp - dmg);
  npcs.invuln = HIT_COOLDOWN;
  npcs.flash = 0.35;
  npcs.lastCause = cause;
  npcs.floaters.push({ text: `-${dmg}`, t: 0 });
  // empenta: ens aparta de la trajectòria del ciclista
  const pl = state.player;
  const ax = pl.x - by.x || 1, ay = pl.y - by.y, m = Math.hypot(ax, ay) || 1;
  for (let i = 0; i < 6; i++) {
    const nx = pl.x + (ax / m) * 3, ny = pl.y + (ay / m) * 3;
    if (!collides(nx, ny)) { pl.x = nx; pl.y = ny; }
  }
  document.body.classList.remove("hurt");
  void document.body.offsetWidth; // reinicia l'animació
  document.body.classList.add("hurt");
  updateHpUi();
  if (npcs.hp <= 0) die();
}

function die() {
  npcs.dead = true;
  state.keys.clear();
  if (state.chatting) toggleChat(false);
  document.getElementById("death-text").innerHTML = DEATH_TEXT[npcs.lastCause] || DEATH_TEXT.bike;
  document.getElementById("death").classList.remove("hidden");
  document.getElementById("revive-btn").focus();
}

function revive() {
  npcs.dead = false;
  npcs.hp = MAX_HP;
  npcs.invuln = 2.5; // uns segons de gràcia
  document.getElementById("death").classList.add("hidden");
  document.activeElement?.blur();
  placePlayer(...state.meta.start);
  updateHpUi();
}

function updateHpUi() {
  const el = document.getElementById("hp");
  el.querySelector("i").style.width = `${(npcs.hp / MAX_HP) * 100}%`;
  el.querySelector(".val").textContent = `${npcs.hp}/${MAX_HP}`;
  el.classList.toggle("low", npcs.hp <= 30);
}

// ---------------------------------------------------------------------------
// Dibuix
function pushNpcSprites(list, camX, camY, vw, vh, k) {
  pushGangSprites(list, camX, camY, vw, vh, k);
  const flashOn = Math.floor(Date.now() / 250) % 2;
  for (const n of npcs.list) {
    if (n.x < camX - 64 || n.x > camX + vw + 64 || n.y < camY - 64 || n.y > camY + vh + 96) continue;
    const img = n.kind === "police"
      ? npcs.sprites.police[n.dir][flashOn]
      : npcs.sprites.bike[n.variant][n.dir][Math.floor(Date.now() / 160 + n.phase) % 2];
    list.push([n.y, img, Math.round(n.x - (img.width / 2) * k), Math.round(n.y - (img.height - 1) * k), false, k]);
  }
}

function drawNpcOverlay(camX, camY, z) {
  drawGangOverlay(camX, camY, z);
  // "-5" que puja sobre l'avatar
  if (!npcs.floaters.length) return;
  const pl = state.player, fs = Math.round(10 * dpr);
  ctx.font = `${fs}px "Press Start 2P", monospace`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  for (const f of npcs.floaters) {
    const sx = (pl.x - camX) * z + 26 * dpr, sy = (pl.y - camY) * z - (HERO_SCREEN_SCALE * 16) * dpr - f.t * 30 * dpr;
    ctx.globalAlpha = Math.max(0, 1 - f.t / 1.2);
    ctx.fillStyle = "#1a1420"; ctx.fillText(f.text, sx + 2 * dpr, sy + 2 * dpr);
    ctx.fillStyle = f.color || "#ff4d4d"; ctx.fillText(f.text, sx, sy);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

function drawNpcMinimap(c, scale) {
  for (const g of npcs.gangs) {
    if (!g.active) continue;
    const blink = Math.floor(Date.now() / 200) % 2;
    c.fillStyle = "#1a1420"; c.fillRect(g.cx / TS * scale - 3, g.cy / TS * scale - 3, 6, 6);
    c.fillStyle = blink ? "#facc15" : "#dc2626"; c.fillRect(g.cx / TS * scale - 2, g.cy / TS * scale - 2, 4, 4);
  }
  for (const n of npcs.list) {
    if (n.kind !== "police") continue;
    c.fillStyle = Math.floor(Date.now() / 300) % 2 ? "#3b82f6" : "#ef4444";
    c.fillRect(n.x / TS * scale - 1, n.y / TS * scale - 1, 2, 2);
  }
}

// ---------------------------------------------------------------------------
// Sprites procedurals
function mirror(p) {
  const q = new Pix(p.w, p.h);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) q.set(p.w - 1 - x, y, p.get(x, y));
  return q;
}
function finish(p) { p.outline(OUTLINE); return p.toCanvas(); }
function wheel(p, cx, cy, r, c) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = Math.hypot(x, y);
    if (d <= r + 0.3 && d >= r - 1.2) p.set(cx + x, cy + y, c);
  }
}

function makePolice(dir, light) {
  const navy = hex("#1f2f5c"), navyD = hex("#16213f"), white = hex("#f2f2f2"), blue = hex("#2a5bd7"),
    tyre = hex("#222228"), hub = hex("#9aa0a6"), visor = hex("#1b1b2a"), skin = hex("#e0ac69"),
    vest = hex("#d7f04a"), lightC = light ? hex("#3b82f6") : hex("#ef4444"), lightC2 = light ? hex("#ef4444") : hex("#3b82f6");
  if (dir === "right" || dir === "left") {
    const p = new Pix(26, 22);
    for (const cx of [5, 20]) { wheel(p, cx, 17, 3, tyre); p.set(cx, 17, hub); }
    p.rect(6, 12, 13, 4, white); p.rect(6, 14, 13, 1, blue); p.rect(17, 10, 4, 4, white); p.rect(19, 12, 2, 2, blue);
    p.rect(18, 9, 1, 3, hub); p.rect(17, 8, 3, 1, tyre);       // manillar
    p.rect(21, 12, 2, 2, hex("#ffe9a0"));                      // far
    p.rect(3, 9, 4, 4, white); p.rect(3, 11, 4, 1, blue);      // maleta
    p.rect(4, 6, 1, 3, hub); p.rect(3, 4, 3, 2, lightC);      // llum
    p.rect(10, 9, 5, 4, navyD); p.rect(13, 13, 2, 3, navyD); p.rect(13, 16, 3, 1, tyre); // cama
    p.rect(9, 3, 6, 7, navy); p.rect(9, 6, 6, 2, vest);        // tors amb armilla
    p.rect(14, 5, 4, 2, navy); p.set(18, 6, skin);             // braç
    p.rect(9, 0, 7, 5, white); p.rect(14, 2, 2, 2, visor); p.rect(9, 3, 1, 2, blue); // casc
    return finish(dir === "left" ? mirror(p) : p);
  }
  const p = new Pix(16, 24);
  p.rect(7, 16, 3, 8, tyre);
  p.rect(4, 11, 9, 6, white); p.rect(4, 14, 9, 1, blue);
  p.rect(1, 11, 15, 1, tyre);                                  // manillar
  p.rect(4, 4, 9, 7, navy); p.rect(4, 7, 9, 2, vest);
  p.rect(2, 6, 2, 5, navy); p.rect(13, 6, 2, 5, navy);
  p.rect(5, 0, 7, 5, white);
  if (dir === "down") {
    p.rect(6, 2, 5, 2, visor);
    p.rect(7, 14, 3, 2, hex("#ffe9a0"));                       // far
  } else {
    p.rect(5, 2, 7, 1, blue);
    p.rect(2, 9, 2, 2, lightC); p.rect(13, 9, 2, 2, lightC2);  // llums
    p.rect(6, 15, 5, 1, hex("#ef4444"));                       // pilot
  }
  return finish(p);
}

const BIKE_KITS = [
  { jersey: "#e11d48", helmet: "#f2f2f2", frame: "#111827" },
  { jersey: "#f59e0b", helmet: "#1f2937", frame: "#2563eb" },
  { jersey: "#10b981", helmet: "#f2f2f2", frame: "#374151" },
  { jersey: "#7c3aed", helmet: "#fde047", frame: "#111827" },
  { jersey: "#0ea5e9", helmet: "#ef4444", frame: "#9ca3af" },
  { jersey: "#f97316", helmet: "#111827", frame: "#16a34a" },
];

function makeCyclist(kit, dir, f) {
  const jersey = hex(kit.jersey), helmet = hex(kit.helmet), frame = hex(kit.frame), tyre = hex("#222228"),
    skin = hex(["#f1c27d", "#c68642", "#8d5524"][kit.jersey.charCodeAt(2) % 3]), shorts = hex("#1f2937");
  if (dir === "right" || dir === "left") {
    const p = new Pix(24, 20);
    wheel(p, 5, 15, 4, tyre); wheel(p, 18, 15, 4, tyre);
    // quadre
    for (let i = 0; i <= 6; i++) { p.set(6 + i, 15 - (i >> 1), frame); p.set(11 + Math.floor(i * 0.9), 12, frame); }
    p.rect(17, 9, 1, 6, frame); p.rect(16, 8, 3, 1, tyre); p.rect(9, 10, 3, 1, tyre); // manillar i selló
    // ciclista inclinat
    const knee = f ? [12, 11] : [11, 13];
    p.rect(9, 8, 3, 3, shorts); p.rect(knee[0], knee[1], 2, 2, skin); p.rect(knee[0], knee[1] + 2, 1, 2, skin);
    p.rect(10, 3, 6, 5, jersey); p.rect(15, 5, 2, 1, jersey); p.rect(16, 6, 1, 2, skin);
    p.rect(14, 0, 5, 3, helmet); p.rect(16, 3, 2, 2, skin);
    return finish(dir === "left" ? mirror(p) : p);
  }
  const p = new Pix(12, 22);
  p.rect(5, 14, 2, 8, tyre);
  p.rect(0, 9, 12, 1, tyre);
  p.rect(3, 3, 6, 6, jersey); p.rect(1, 5, 2, 4, jersey); p.rect(9, 5, 2, 4, jersey);
  p.rect(3, 9, 6, 3, shorts);
  p.rect(f ? 3 : 7, 12, 2, 4, skin);                            // pedalada
  p.rect(4, 0, 4, 3, helmet);
  if (dir === "down") p.rect(5, 3, 2, 1, skin);
  return finish(p);
}

function makeNpcSprites() {
  const police = {}, bike = [];
  for (const d of DIRS) police[d] = [makePolice(d, 0), makePolice(d, 1)];
  for (const kit of BIKE_KITS) {
    const set = {};
    for (const d of DIRS) set[d] = [makeCyclist(kit, d, 0), makeCyclist(kit, d, 1)];
    bike.push(set);
  }
  return { police, bike, flag: [makeFlag(0), makeFlag(1)] };
}

function bindNpcUi() {
  document.getElementById("revive-btn").addEventListener("click", revive);
  updateHpUi();
}

// ---------------------------------------------------------------------------
// Bandes d'ultres de la UESA (Unió Esportiva Sant Andreu): grups de 10 que apareixen
// de tant en tant i recorren el barri cantant. Si et trepitgen perds 25 punts.
// L'horari i la ruta depenen del rellotge, així tots els jugadors les veuen igual.
const GANG = { slots: 2, cycle: 300, active: 150, size: 10, speed: 1.7, seed: 77000 };
const GANG_CHANTS = ["UESA! UESA!", "Sant Andreu!!", "Groc i vermell!", "Oé, oé, oé!", "Som del Narcís Sala!", "Aquí manem nosaltres!"];

function initGangs(graph) {
  const G = prepGraph(graph.car);
  if (!G.nodes.length) return;
  for (let s = 0; s < GANG.slots; s++) {
    const r = rng(GANG.seed + s * 131);
    const members = [];
    for (let i = 0; i < GANG.size; i++) {
      const look = {
        ...DEFAULT_LOOK, name: "",
        skin: ["#ffe0bd", "#f1c27d", "#e0ac69", "#c68642", "#8d5524"][(r() * 5) | 0],
        hair: ["#1c1414", "#4a2b1a", "#8b5a2b", "#d6a756"][(r() * 4) | 0],
        hairStyle: ["short", "short", "bald", "long", "ponytail"][(r() * 5) | 0],
        shirt: r() < 0.7 ? "#facc15" : "#dc2626", pants: ["#1f2a44", "#111111", "#5d6d7e"][(r() * 3) | 0],
        shoes: "#111111", bottom: r() < 0.8 ? "pants" : "shorts",
        extra: r() < 0.35 ? "cap" : "none", extraColor: "#dc2626",
      };
      if (look.shirt === "#facc15") look.stripe = "#dc2626"; // ratlles de la senyera
      members.push({
        sprites: makeHeroSet(look),
        along: (r() - 0.5) * 5, across: (r() - 0.5) * 3, bob: r() * 10,
        x: 0, y: 0, dir: "down", say: null,
      });
    }
    npcs.gangs.push({ slot: s, G, members, active: false, window: -1, route: null, cx: 0, cy: 0, warned: -1 });
  }
}

function updateGangs(t, dt) {
  const pl = state.player;
  for (const g of npcs.gangs) {
    const off = g.slot * (GANG.cycle / GANG.slots);
    const w = Math.floor((t + off) / GANG.cycle), lt = (t + off) - w * GANG.cycle;
    g.active = lt < GANG.active;
    if (!g.active) continue;
    if (w !== g.window) { // nova aparició: nova ruta
      g.window = w;
      g.route = makeRoute(g.G, rng(GANG.seed + w * 7 + g.slot * 100003), 30);
    }
    const n = { route: g.route, speed: GANG.speed, phase: 0, lane: 0 };
    const c = npcPos(n, lt);
    g.cx = c.x * TS; g.cy = c.y * TS + TS / 2;
    const dir = Math.abs(c.dx) > Math.abs(c.dy) ? (c.dx > 0 ? "right" : "left") : (c.dy > 0 ? "down" : "up");
    for (const m of g.members) {
      // posició dins del grup, orientada segons la direcció de la marxa
      m.x = g.cx + (c.dx * m.along - c.dy * m.across) * TS;
      m.y = g.cy + (c.dy * m.along + c.dx * m.across) * TS + Math.sin(t * 3 + m.bob) * 1.5;
      m.dir = dir;
      m.frame = Math.floor(t * 8 + m.bob) % 4;
      if (m.say && (m.say.ttl -= dt) <= 0) m.say = null;
      if (!m.say && Math.random() < dt * 0.05) m.say = { text: GANG_CHANTS[(Math.random() * GANG_CHANTS.length) | 0], ttl: 2.2 };
    }
    // avís quan una banda és a prop
    if (g.warned !== w && Math.hypot(g.cx - pl.x, g.cy - pl.y) < 22 * TS) {
      g.warned = w;
      showBanner("Compte! Ultres de la UESA a prop!", "warn");
    }
  }
}

function pushGangSprites(list, camX, camY, vw, vh, k) {
  for (const g of npcs.gangs) {
    if (!g.active || g.cx < camX - 200 || g.cx > camX + vw + 200 || g.cy < camY - 200 || g.cy > camY + vh + 200) continue;
    g.members.forEach((m, i) => {
      list.push([m.y, m.sprites[m.dir][m.frame], Math.round(m.x) - 8 * k, Math.round(m.y) - 23 * k, false, k]);
      if (i === 0) { // el primer porta la bandera
        const fl = npcs.sprites.flag[Math.floor(Date.now() / 300) % 2];
        list.push([m.y + 0.1, fl, Math.round(m.x) + 3 * k, Math.round(m.y) - 34 * k, false, k]);
      }
    });
  }
}

function drawGangOverlay(camX, camY, z) {
  for (const g of npcs.gangs) {
    if (!g.active) continue;
    for (const m of g.members) if (m.say) drawBubble(m.say, m.x, m.y, camX, camY, z);
  }
}

// Bandera groga i vermella (senyera) que oneja
function makeFlag(f) {
  const p = new Pix(14, 26), Y = hex("#facc15"), R = hex("#dc2626"), pole = hex("#6b4426");
  p.rect(0, 0, 1, 26, pole);
  for (let y = 0; y < 9; y++) for (let x = 1; x < 14; x++) {
    const wave = f ? (x % 4 < 2 ? 0 : 1) : (x % 4 < 2 ? 1 : 0);
    p.set(x, y + wave, y % 2 ? R : Y);
  }
  p.outline(OUTLINE);
  return p.toCanvas();
}
