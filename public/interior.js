// Interiors dels bars: davant d'un bar, la tecla O hi entra. Cada bar té un local inventat
// (generat a partir del seu nom, sempre igual per a tothom) amb barra, prestatgeria d'ampolles,
// taules, cadires, cambrer i clients. Es surt per la porta. Els jugadors que són al mateix bar
// es veuen entre ells (el servidor reenvia en quina sala és cadascú).
"use strict";

const IN = { FLOOR: 0, WALL: 1, SIDE: 2, COUNTER: 3, TABLE: 4, CHAIR: 5, DOOR: 6, SHELF: 7, PLANT: 8, DARTS: 9, RUG: 10 };
const IN_BLOCK = new Set([IN.WALL, IN.SIDE, IN.COUNTER, IN.TABLE, IN.CHAIR, IN.SHELF, IN.PLANT, IN.DARTS]);
const ENTER_RADIUS = 4; // tiles (el punt del bar sol ser dins de l'edifici)
const PATRON_LINES = ["Salut!", "Una altra, si us plau!", "Quin gol ahir!", "Glup glup…", "Aquí s'hi està bé", "Paguem a mitges?"];
const WAITER_LINES = ["Què us poso?", "Una canya?", "Ara vinc!", "Marxant una de braves!"];

// Paleta de cada local segons la zona temàtica (themes.js)
const INTERIOR_STYLE = [
  { floor: "#4a4452", floor2: "#3e3946", wall: "#3a2f4e", trim: "#d4af37", wood: "#4a2e1e", cloth: "#6a2a3a" }, // Bruixots
  { floor: "#9a6e44", floor2: "#8a6038", wall: "#d8c49a", trim: "#6a4a2a", wood: "#6b4426", cloth: "#5f8a3a" }, // Comarca
  { floor: "#a8743c", floor2: "#9a6a36", wall: "#efe0bd", trim: "#8a5a32", wood: "#6b4226", cloth: "#c8483c" }, // Heroi
  { floor: "#5a5048", floor2: "#4e463f", wall: "#6a4a3a", trim: "#b08d57", wood: "#3a2a1e", cloth: "#4f9a8a" }, // Vapor
  { floor: "#ffd6e8", floor2: "#fff6fa", wall: "#fff0f6", trim: "#ff8fbf", wood: "#e8a0c0", cloth: "#8fd9c8" }, // Kawaii
  { floor: "#e0e0d8", floor2: "#d0d0c8", wall: "#f8f0d8", trim: "#3060c0", wood: "#8a6a48", cloth: "#e04040" }, // Ruta
];

const interiors = new Map();

function barIndex(bar) { return drink.bars.indexOf(bar); }

// Genera (i guarda) el local d'un bar
function interiorFor(bar) {
  const idx = barIndex(bar);
  if (interiors.has(idx)) return interiors.get(idx);
  const r = rng(hash2(idx * 7 + 3, (bar.n || "").length * 131 + 9));
  const W = 15 + ((r() * 8) | 0), H = 12 + ((r() * 4) | 0);
  const grid = new Uint8Array(W * H).fill(IN.FLOOR);
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) grid[y * W + x] = v; };
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? IN.WALL : grid[y * W + x]);
  for (let x = 0; x < W; x++) { set(x, 0, IN.WALL); set(x, 1, IN.WALL); set(x, H - 1, IN.SIDE); }
  for (let y = 0; y < H; y++) { set(0, y, IN.SIDE); set(W - 1, y, IN.SIDE); }
  const doorX = (W >> 1) - 1;
  set(doorX, H - 1, IN.DOOR); set(doorX + 1, H - 1, IN.DOOR);
  // barra al llarg de la paret de dalt, amb prestatgeria d'ampolles al darrere
  const cw = Math.max(6, Math.floor(W * (0.45 + r() * 0.2)));
  for (let x = 1; x <= cw; x++) { set(x, 1, IN.SHELF); set(x, 3, IN.COUNTER); }
  set(W - 4, 1, IN.DARTS);
  // catifa davant la barra
  for (let x = 2; x < cw; x++) if (r() < 0.9) set(x, 4, IN.RUG);
  // taules de 2x1 amb cadires a dalt i a baix
  const tables = [];
  for (let ty = 6; ty <= H - 4; ty += 3) for (let tx = 2; tx < W - 3; tx += 4) {
    const jx = tx + ((r() * 2) | 0);
    if (jx + 1 >= W - 1 || (Math.abs(jx - doorX) < 3 && ty >= H - 5)) continue; // passadís fins a la porta
    if (r() < 0.1) continue;
    tables.push([jx, ty]);
    set(jx, ty, IN.TABLE); set(jx + 1, ty, IN.TABLE);
    for (const dx of [0, 1]) { if (at(jx + dx, ty - 1) === IN.FLOOR) set(jx + dx, ty - 1, IN.CHAIR); if (at(jx + dx, ty + 1) === IN.FLOOR) set(jx + dx, ty + 1, IN.CHAIR); }
  }
  set(1, H - 2, IN.PLANT); set(W - 2, H - 2, IN.PLANT);
  if (at(W - 2, 4) === IN.FLOOR) set(W - 2, 4, IN.PLANT);

  const th = sectorAt(Math.floor(bar.x), Math.floor(bar.y));
  // clients asseguts en algunes cadires, mirant la taula
  const patrons = [];
  const mugs = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (grid[y * W + x] !== IN.CHAIR || r() > 0.55) continue;
    const look = randomLook(r);
    const faceDown = at(x, y + 1) === IN.TABLE;
    patrons.push({ x: x * TS + 8, y: y * TS + 14, dir: faceDown ? "down" : "up", sprites: makeHeroSet(look), say: null, cd: r() * 8 });
    mugs.push([x, faceDown ? y + 1 : y - 1, faceDown]);
  }
  const waiterLook = { ...randomLook(r), shirt: "#f4f1e8", pants: "#1b1b22", bottom: "pants", extra: "none", stripe: null };
  const waiter = { x: 2 * TS, y: 2 * TS + 14, minX: 1.5 * TS, maxX: (cw - 0.5) * TS, dir: "down", frame: 0, anim: 0,
    target: null, wait: 1, sprites: makeHeroSet(waiterLook), say: null, cd: 3 };
  const room = { id: `bar-${idx}`, name: bar.n || "Bar", bar, W, H, grid, doorX, th, patrons, waiter, canvas: null, mugs };
  room.canvas = renderInterior(room);
  interiors.set(idx, room);
  if (interiors.size > 12) interiors.delete(interiors.keys().next().value);
  return room;
}

function randomLook(r) {
  const pick = (a) => a[(r() * a.length) | 0];
  return {
    ...DEFAULT_LOOK, name: "",
    skin: pick(["#ffe0bd", "#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#5c3a1e"]),
    hair: pick(["#1c1414", "#4a2b1a", "#8b5a2b", "#d6a756", "#9a9a9a", "#b5401f"]),
    hairStyle: pick(["short", "long", "ponytail", "afro", "bald"]),
    shirt: pick(["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#f1c40f", "#2c3e50", "#e67e22", "#ecf0f1"]),
    pants: pick(["#2c3e70", "#1f2a44", "#5d6d7e", "#7f5539"]), bottom: pick(["pants", "pants", "shorts", "skirt"]),
    extra: pick(["none", "none", "glasses", "cap"]), extraColor: pick(["#2b6cb0", "#c0392b", "#111111"]),
  };
}

// Pinta el local (terra, parets, mobles) en un canvas fix
function renderInterior(room) {
  const { W, H, grid } = room, st = INTERIOR_STYLE[room.th];
  const cv = document.createElement("canvas");
  cv.width = W * TS; cv.height = H * TS;
  const c = cv.getContext("2d");
  const fill = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = grid[y * W + x], px = x * TS, py = y * TS, h = hash2(x + room.W * 7, y + room.H);
    // terra: taulons (o rajoles en algunes zones)
    fill(px, py, TS, TS, (x + (y >> 1)) % 2 ? st.floor : st.floor2);
    fill(px, py + 7, TS, 1, "rgba(0,0,0,.12)"); fill(px + ((y % 2) * 8), py, 1, 8, "rgba(0,0,0,.12)");
    if (v === IN.RUG) { fill(px, py + 2, TS, 12, st.cloth); fill(px, py + 3, TS, 1, "rgba(255,255,255,.35)"); fill(px, py + 12, TS, 1, "rgba(0,0,0,.25)"); }
    if (v === IN.WALL || v === IN.SHELF || v === IN.DARTS) {
      fill(px, py, TS, TS, st.wall);
      if (y === 1) { fill(px, py + 10, TS, 6, st.wood); fill(px, py + 10, TS, 1, st.trim); }   // arrimador
      if (y === 0) fill(px, py, TS, 2, "rgba(0,0,0,.25)");
    }
    if (v === IN.SHELF) { // prestatge amb ampolles
      fill(px, py - 8, TS, 2, st.wood); fill(px, py + 2, TS, 2, st.wood);
      for (let i = 0; i < 3; i++) {
        const col = ["#3f8a3a", "#8a3a2a", "#e8c040", "#3a5a9a", "#c8c8d0"][(h >> (i * 3)) % 5];
        fill(px + 2 + i * 5, py - 14 + ((h >> i) & 1), 3, 6, col); fill(px + 3 + i * 5, py - 16 + ((h >> i) & 1), 1, 2, col);
        fill(px + 2 + i * 5, py - 4, 3, 6, ["#c8c8d0", "#e8c040", "#8a3a2a"][(h >> (i + 5)) % 3]);
      }
    }
    if (v === IN.DARTS) { // diana
      c.fillStyle = "#1b1b22"; c.beginPath(); c.arc(px + 8, py - 2, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#e03030"; c.beginPath(); c.arc(px + 8, py - 2, 4, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#f4f1e8"; c.beginPath(); c.arc(px + 8, py - 2, 2, 0, Math.PI * 2); c.fill();
    }
    if (v === IN.SIDE) { fill(px, py, TS, TS, st.wood); fill(px, py, TS, 2, st.trim); }
    if (v === IN.DOOR) { fill(px, py, TS, TS, "#3a2a1e"); fill(px + 1, py + 2, 14, 14, "#7a5030"); fill(px, py, TS, 2, "#ffd76a"); }
    if (v === IN.COUNTER) { // barra amb tiradors de cervesa
      fill(px, py - 2, TS, 6, st.trim); fill(px, py + 4, TS, 12, st.wood);
      fill(px, py + 4, TS, 1, "rgba(255,255,255,.25)"); fill(px + 4, py + 8, 1, 6, "rgba(0,0,0,.25)"); fill(px + 11, py + 8, 1, 6, "rgba(0,0,0,.25)");
      if (h % 3 === 0) { fill(px + 6, py - 9, 2, 7, "#c8ccd4"); fill(px + 5, py - 10, 4, 2, "#e8c040"); }
    }
    if (v === IN.TABLE) {
      fill(px, py + 2, TS, 10, st.wood); fill(px, py + 2, TS, 2, "rgba(255,255,255,.25)"); fill(px, py + 12, TS, 4, "rgba(0,0,0,.35)");
      if (grid[y * W + x - 1] !== IN.TABLE) fill(px, py + 12, 2, 4, st.wood);
      if (grid[y * W + x + 1] !== IN.TABLE) fill(px + 14, py + 12, 2, 4, st.wood);
    }
    if (v === IN.CHAIR) { fill(px + 3, py + 4, 10, 8, st.cloth); fill(px + 3, py + 4, 10, 2, "rgba(255,255,255,.25)"); fill(px + 4, py + 12, 2, 4, st.wood); fill(px + 10, py + 12, 2, 4, st.wood); }
    if (v === IN.PLANT) {
      fill(px + 4, py + 9, 8, 7, "#8a5a32");
      c.fillStyle = "#3f8a3a"; c.beginPath(); c.arc(px + 8, py + 6, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#5fb35a"; c.beginPath(); c.arc(px + 6, py + 4, 3, 0, Math.PI * 2); c.fill();
    }
  }
  // gots de cervesa als llocs ocupats
  for (const [x, y] of room.mugs) {
    const px = x * TS + 6, py = y * TS + 3;
    fill(px, py, 4, 6, "#f0b030"); fill(px, py, 4, 2, "#fffbeb"); fill(px + 4, py + 2, 1, 3, "#fffbeb");
  }
  return cv;
}

// ---------------------------------------------------------------------------
// Entrar i sortir
function nearestBar() {
  const tx = state.player.x / TS, ty = state.player.y / TS;
  let best = null, bd = ENTER_RADIUS * ENTER_RADIUS;
  for (const b of drink.bars) {
    const d = (b.x - tx) ** 2 + (b.y + 0.5 - ty) ** 2;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

function enterBar() {
  if (state.interior || npcs.dead || state.editing || state.chatting) return;
  const bar = nearestBar();
  if (!bar) return showBanner("Per entrar has d'estar davant d'un bar", "warn");
  if (state.riding) return showBanner("Deixa la bici en una estació abans d'entrar", "warn");
  updateZone(); // la zona del bar queda al rètol mentre ets a dins
  state.outPos = { x: state.player.x, y: state.player.y };
  const room = interiorFor(bar);
  state.interior = room;
  state.player.x = (room.doorX + 1) * TS;
  state.player.y = (room.H - 2) * TS + 14;
  state.player.dir = "up";
  state.cam.x = state.player.x; state.cam.y = state.player.y;
  state.follow = true;
  document.body.classList.add("indoors");
  showBanner(`Has entrat a ${room.name}`, "beer");
  updateEnterHint();
}

function exitBar() {
  const room = state.interior;
  state.interior = null;
  state.player.x = state.outPos.x;
  state.player.y = state.outPos.y + 6;
  state.player.dir = "down";
  document.body.classList.remove("indoors");
  if (room) showBanner(`Has sortit de ${room.name}`, "bank");
  updateEnterHint();
}

function interiorBlocked(tx, ty) {
  const room = state.interior;
  if (tx < 0 || ty < 0 || tx >= room.W || ty >= room.H) return true;
  return IN_BLOCK.has(room.grid[ty * room.W + tx]);
}
function interiorCollides(x, y) {
  const x0 = Math.floor((x - HB.w / 2) / TS), x1 = Math.floor((x + HB.w / 2 - 1) / TS);
  const y0 = Math.floor((y - HB.h) / TS), y1 = Math.floor((y - 1) / TS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (interiorBlocked(tx, ty)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Actualització i dibuix de l'interior
function updateInterior(dt) {
  const room = state.interior;
  // sortir per la porta
  const ftx = Math.floor(state.player.x / TS), fty = Math.floor((state.player.y - 1) / TS);
  if (room.grid[fty * room.W + ftx] === IN.DOOR) return exitBar();
  // el cambrer va amunt i avall darrere la barra
  const w = room.waiter;
  if (w.target === null && (w.wait -= dt) <= 0) w.target = w.minX + Math.random() * (w.maxX - w.minX);
  if (w.target !== null) {
    const d = w.target - w.x, step = 40 * dt;
    if (Math.abs(d) <= step) { w.x = w.target; w.target = null; w.wait = 1 + Math.random() * 3; w.dir = "down"; }
    else { w.x += Math.sign(d) * step; w.dir = d > 0 ? "right" : "left"; }
    w.anim += dt * 6; w.frame = w.target === null ? 0 : Math.floor(w.anim) % 4;
  }
  for (const p of [...room.patrons, w]) {
    if (p.say && (p.say.ttl -= dt) <= 0) p.say = null;
    if ((p.cd -= dt) <= 0) {
      p.cd = 6 + Math.random() * 10;
      const lines = p === w ? WAITER_LINES : PATRON_LINES;
      if (Math.random() < 0.5) p.say = { text: lines[(Math.random() * lines.length) | 0], ttl: 2 };
    }
  }
}

function drawInterior() {
  const room = state.interior, z = ZOOMS[state.zoomIdx] * dpr, W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#0b0a12";
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  const ox = Math.round(state.cam.x * z), oy = Math.round(state.cam.y * z);
  ctx.setTransform(z, 0, 0, z, -ox, -oy);
  const camX = ox / z, camY = oy / z;
  ctx.drawImage(room.canvas, 0, 0);
  const k = HERO_SCREEN_SCALE / ZOOMS[state.zoomIdx], list = [], pl = state.player;
  list.push([pl.y, state.sprites.hero[pl.dir][pl.frame], Math.round(pl.x) - 8 * k, Math.round(pl.y) - 23 * k, false, k, { lift: jumpLift() * k }]);
  for (const o of net.others.values()) {
    if (o.room !== room.id) continue;
    list.push([o.y, o.sprites[o.dir][o.frame], Math.round(o.x) - 8, Math.round(o.y) - 23, false, 1]);
  }
  for (const p of room.patrons) list.push([p.y, p.sprites[p.dir][0], p.x - 8, p.y - 23, false, 1, { seat: true }]);
  const w = room.waiter;
  list.push([w.y, w.sprites[w.dir][w.frame], Math.round(w.x) - 8, Math.round(w.y) - 23, false, 1]);
  drawSprites(list);
  // llum càlida de local
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const cx = (room.W * TS / 2 - camX) * z, cy = (room.H * TS / 2 - camY) * z, R = Math.max(room.W, room.H) * TS * z * 0.75;
  const gr = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
  gr.addColorStop(0, "rgba(255,200,120,0.08)"); gr.addColorStop(1, "rgba(20,10,20,0.55)");
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  // noms i bombolles
  for (const o of net.others.values()) {
    if (o.room !== room.id) continue;
    drawNameTag(o.look.name, o.x, o.y, camX, camY, z, "#9fd3ff", 24 * z);
    drawBubble(o.bubble, o.x, o.y, camX, camY, z, 24 * z);
  }
  for (const p of [...room.patrons, w]) if (p.say) drawBubble(p.say, p.x, p.y, camX, camY, z, 12 * z);
  drawNameTag(state.look.name, pl.x, pl.y, camX, camY, z, "#ffffff");
  drawBubble(state.bubble, pl.x, pl.y, camX, camY, z);
  drawNpcOverlay(camX, camY, z);
}

// Indicació "O: entrar" quan ets davant d'un bar
let enterNear = null;
function updateEnterHint() {
  const el = document.getElementById("enter-hint");
  const bar = state.interior ? null : nearestBar();
  if (bar === enterNear && !state.interior === !el.dataset.in) return;
  enterNear = bar;
  el.dataset.in = state.interior ? "1" : "";
  el.classList.toggle("hidden", !bar && !state.interior);
  el.textContent = state.interior ? `Ets a ${state.interior.name} · surt per la porta` : bar ? `O: entrar a ${bar.n || "el bar"}` : "";
  document.getElementById("enter-btn").classList.toggle("dim", !bar);
}

function initInteriors() {
  document.getElementById("enter-btn").addEventListener("click", (e) => { e.stopPropagation(); enterBar(); });
}
