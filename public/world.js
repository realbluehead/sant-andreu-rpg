// El món que canvia amb el temps: rellotge (1 minut real = 1 hora), dia i nit amb llums, temps
// meteorològic que canvia cada dos dies, camions de les escombraries nocturns, bosses que
// s'acumulen de dia, salt amb ESPAI, natació i la font animada de Can Fabra.
// Tot depèn del rellotge real (Date.now), així tots els jugadors veuen el mateix sense servidor.
"use strict";

const WEATHERS = [
  { id: "clear", name: "Assolellat", w: 35 },
  { id: "cloudy", name: "Ennuvolat", w: 20 },
  { id: "rain", name: "Pluja", w: 20 },
  { id: "fog", name: "Boira", w: 12 },
  { id: "snow", name: "Neu", w: 13 },
];
const NIGHT_START = 22, NIGHT_END = 6;   // hores en què passen els camions
const JUMP_TIME = 0.55;                    // s
const TRUCK_SCALE = 1.8;                   // els camions són molt grans

const world = { trucks: [], bagDays: new Map(), bags: [], bagTiles: new Map(), fountainJets: [], lightCv: null,
  hour: 12, day: 0, dark: 0, weather: WEATHERS[0], sprites: null, swimming: false, lastClock: "" };

// ---------------------------------------------------------------------------
// Rellotge i temps (world.offset només serveix per provar: avança o endarrereix el rellotge)
const msPerHour = () => CFG.world.secondsPerHour * 1000;
const worldNow = () => Date.now() + (world.offset || 0);
function worldClock(now = worldNow()) {
  const hours = now / msPerHour();
  return { day: Math.floor(hours / 24), hour: hours % 24 };
}
// foscor 0..1: nit plena de 22 a 5, capvespre de 19 a 22 i alba de 5 a 8
function darknessAt(h) {
  if (h >= 22 || h < 5) return 1;
  if (h >= 19) return (h - 19) / 3;
  if (h < 8) return 1 - (h - 5) / 3;
  return 0;
}
function weatherForDay(day) {
  const block = Math.floor(day / CFG.world.weatherDays);
  let roll = hash2(block * 31 + 7, 4242) % 100;
  for (const w of WEATHERS) { if (roll < w.w) return w; roll -= w.w; }
  return WEATHERS[0];
}
const isNight = (h) => h >= NIGHT_START || h < NIGHT_END;
// Nit de monstres (per defecte de 20 a 6 h): més lladres, zombies i fantasmes arreu i música de terror
function monstersOut(h = world.hour) {
  const s = CFG.night.startHour, e = CFG.night.endHour;
  return s > e ? h >= s || h < e : h >= s && h < e;
}

// ---------------------------------------------------------------------------
// Inicialització
function initWorld() {
  world.sprites = { truck: makeTruckSprites(), bags: [0, 1, 2].map(makeBag), jet: [0, 1, 2, 3].map(makeJet) };
  // camions: rutes deterministes sobre la xarxa de carrers (com les motos de policia)
  const G = prepGraph(state.meta.graph.car);
  for (let i = 0; i < CFG.trucks.count; i++) {
    const r = rng(31000 + i * 9173);
    const route = makeRoute(G, r, 45);
    if (route.len < 30) continue;
    world.trucks.push({ i, route, speed: CFG.trucks.speed, lane: 1.4, phase: r() * route.len,
      x: 0, y: 0, dir: "right", active: false });
  }
  // brolladors de la Font de Can Fabra: sobre les caselles d'aigua del voltant
  const f = (state.meta.places || []).find((p) => p.name === "Font de Can Fabra");
  if (f) {
    const cells = [];
    for (let y = Math.floor(f.y) - 14; y <= f.y + 14; y++) for (let x = Math.floor(f.x) - 18; x <= f.x + 18; x++) {
      if ((g(x, y) & 127) === T.WATER) cells.push([x, y]);
    }
    for (const [x, y] of cells) if (x % 3 === 0 && y % 3 === 0) world.fountainJets.push({ x: x * TS + 8, y: y * TS + 12, ph: hash2(x, y) % 4 });
  }
  world.lightCv = document.createElement("canvas");
  document.getElementById("jump-btn").addEventListener("click", (e) => { e.stopPropagation(); jump(); });
}

// ---------------------------------------------------------------------------
// Bosses d'escombraries: cada dia en surten al llarg de les rutes dels camions (de 7 a 21 h)
// i desapareixen quan el camió hi passa de nit. Es calcula a partir del rellotge.
function bagsForDay(day) {
  if (world.bagDays.has(day)) return world.bagDays.get(day);
  const list = [], per = Math.ceil(CFG.bags.perDay / Math.max(1, world.trucks.length));
  const hourS = msPerHour() / 1000;
  for (const tr of world.trucks) {
    const L = tr.route.len;
    for (let j = 0; j < per; j++) {
      const h = hash2(day * 977 + tr.i, j * 131 + 17);
      const d = (h % 100000) / 100000 * L;
      const p = npcPos({ route: tr.route, speed: 0, phase: d, lane: 2.6 }, 0); // vora de la vorera
      let tx = Math.floor(p.x), ty = Math.floor(p.y);
      if (!bagSpot(tx, ty)) {
        const alt = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]].map(([a, b]) => [tx + a, ty + b]).find(([a, b]) => bagSpot(a, b));
        if (!alt) continue;
        [tx, ty] = alt;
      }
      const spawnH = 7 + ((h >>> 8) % 1400) / 100;                 // entre les 7 i les 21 h
      const spawn = (day * 24 + spawnH) * hourS;
      // primera nit en què el camió passa per aquest punt
      let collect = Infinity;
      for (let k = 0; k < 7 && collect === Infinity; k++) {
        const start = (day * 24 + NIGHT_START + k * 24) * hourS;
        const d0 = ((start * tr.speed + tr.phase) % L + L) % L;
        const t = start + (((d - d0) % L + L) % L) / tr.speed;
        if (t - start <= (24 - NIGHT_START + NIGHT_END) * hourS) collect = t;
      }
      if (collect === Infinity) collect = (day * 24 + NIGHT_START + 7 * 24) * hourS;
      list.push({ x: tx * TS + 8, y: ty * TS + 12, tx, ty, spawn, collect, v: h % 3 });
    }
  }
  world.bagDays.set(day, list);
  if (world.bagDays.size > 10) world.bagDays.delete(world.bagDays.keys().next().value);
  return list;
}
function bagSpot(tx, ty) {
  const v = g(tx, ty) & 127;
  return (v === T.SIDEWALK || v === T.PLAZA || v === T.GROUND) && !(g(tx, ty) & OUTSIDE) && !dec(tx, ty);
}

// ---------------------------------------------------------------------------
// Actualització
function updateWorld(dt) {
  const now = worldNow(), t = now / 1000;
  const { day, hour } = worldClock(now);
  world.day = day; world.hour = hour;
  world.weather = weatherForDay(day);
  world.dark = darknessAt(hour);
  const monsters = monstersOut(hour);
  if (monsters !== world.monsters) {
    if (world.monsters !== undefined) showBanner(monsters ? "Ha caigut la nit... surten els monstres!" : "Es fa de dia: els monstres s'amaguen", monsters ? "rob" : "bank");
    world.monsters = monsters;
    applyMusic();
  }
  // camions (només de nit)
  const night = isNight(hour);
  for (const tr of world.trucks) {
    tr.active = night;
    if (!night) continue;
    const p = npcPos(tr, t);
    tr.x = p.x * TS; tr.y = p.y * TS + TS / 2;
    tr.dir = Math.abs(p.dx) > Math.abs(p.dy) ? (p.dx > 0 ? "right" : "left") : (p.dy > 0 ? "down" : "up");
  }
  // bosses visibles: les dels últims dies que encara no s'han recollit
  world.bags = [];
  world.bagTiles.clear();
  for (let d = day - 3; d <= day; d++) {
    for (const b of bagsForDay(d)) {
      if (t >= b.spawn && t < b.collect) { world.bags.push(b); world.bagTiles.set(b.ty * state.W + b.tx, b); }
    }
  }
  // salt i natació
  if (state.jumpT > 0) state.jumpT = Math.max(0, state.jumpT - dt);
  const pl = state.player, under = g(Math.floor(pl.x / TS), Math.floor((pl.y - 2) / TS)) & 127;
  world.swimming = (under === T.WATER || under === T.POOL) && !state.noclip;
  if (state.interior) world.swimming = false;
  // si un camió et passa per sobre, t'aparta
  else for (const tr of world.trucks) if (tr.active && hitsTruck(tr, pl.x, pl.y)) pushOutOfTruck(tr);
  updateClockHud();
}

function truckRect(tr) {
  const S = TRUCK_SCALE;
  return tr.dir === "left" || tr.dir === "right"
    ? { x0: tr.x - 24 * S, x1: tr.x + 24 * S, y0: tr.y - 14 * S, y1: tr.y + 2 }
    : { x0: tr.x - 13 * S, x1: tr.x + 13 * S, y0: tr.y - 34 * S, y1: tr.y + 2 };
}
function hitsTruck(tr, x, y) {
  const r = truckRect(tr);
  return x + HB.w / 2 > r.x0 && x - HB.w / 2 < r.x1 && y > r.y0 && y - HB.h < r.y1;
}
function pushOutOfTruck(tr) {
  const pl = state.player, r = truckRect(tr);
  const opts = [[r.x0 - HB.w / 2 - 1, pl.y], [r.x1 + HB.w / 2 + 1, pl.y], [pl.x, r.y0 - 1], [pl.x, r.y1 + HB.h + 1]]
    .sort((a, b) => Math.hypot(a[0] - pl.x, a[1] - pl.y) - Math.hypot(b[0] - pl.x, b[1] - pl.y));
  for (const [x, y] of opts) if (!collides(x, y)) { pl.x = x; pl.y = y; return; }
}

// Obstacles del món per a les col·lisions del jugador (camions i bosses)
function worldBlocks(x, y) {
  if (state.interior) return false;
  for (const tr of world.trucks) if (tr.active && hitsTruck(tr, x, y)) return true;
  if (state.jumpT > 0) return false; // les bosses es poden saltar
  const x0 = Math.floor((x - HB.w / 2) / TS), x1 = Math.floor((x + HB.w / 2 - 1) / TS);
  const y0 = Math.floor((y - HB.h) / TS), y1 = Math.floor((y - 1) / TS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (world.bagTiles.has(ty * state.W + tx)) return true;
  return false;
}

function jump() {
  if (state.jumpT > 0 || npcs.dead || state.editing || state.chatting || world.swimming) return;
  state.jumpT = JUMP_TIME;
}
const jumpLift = () => (state.jumpT > 0 ? Math.sin(Math.PI * (1 - state.jumpT / JUMP_TIME)) * 14 : 0);

let clockEl = null;
function updateClockHud() {
  clockEl ||= document.getElementById("clock");
  const h = Math.floor(world.hour), m = Math.floor((world.hour % 1) * 60);
  const text = `Dia ${world.day % 1000} · ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} · ${world.weather.name}${isNight(world.hour) ? " · nit" : ""}`;
  if (text !== world.lastClock) { clockEl.textContent = text; world.lastClock = text; }
}

// ---------------------------------------------------------------------------
// Dibuix: sprites del món
function pushWorldSprites(list, camX, camY, vw, vh, k) {
  const S = world.sprites, now = Date.now(), flash = Math.floor(now / 250) % 2;
  for (const tr of world.trucks) {
    if (!tr.active || tr.x < camX - 80 || tr.x > camX + vw + 80 || tr.y < camY - 80 || tr.y > camY + vh + 80) continue;
    const img = S.truck[tr.dir][flash], ks = k * TRUCK_SCALE;
    list.push([tr.y, img, Math.round(tr.x - (img.width / 2) * ks), Math.round(tr.y - (img.height - 1) * ks), true, ks]);
  }
  for (const b of world.bags) {
    if (b.x < camX - 20 || b.x > camX + vw + 20 || b.y < camY - 20 || b.y > camY + vh + 30) continue;
    const img = S.bags[b.v];
    list.push([b.y, img, Math.round(b.x - (img.width / 2) * k), Math.round(b.y - (img.height - 1) * k), false, k]);
  }
  for (const j of world.fountainJets) {
    if (j.x < camX - 30 || j.x > camX + vw + 30 || j.y < camY - 40 || j.y > camY + vh + 30) continue;
    const img = S.jet[(Math.floor(now / 140) + j.ph) % 4], kj = k * 1.6; // brolladors ben visibles
    list.push([j.y, img, Math.round(j.x - (img.width / 2) * kj), Math.round(j.y - (img.height - 1) * kj), false, kj]);
  }
}

// Reflexos que es mouen a l'aigua (també a la font)
function drawWaterShimmer(camX, camY, vw, vh) {
  const t = Date.now() / 1000;
  const tx0 = Math.max(0, Math.floor(camX / TS)), tx1 = Math.min(state.W - 1, Math.ceil((camX + vw) / TS));
  const ty0 = Math.max(0, Math.floor(camY / TS)), ty1 = Math.min(state.H - 1, Math.ceil((camY + vh) / TS));
  ctx.fillStyle = "rgba(255,255,255,.55)";
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const v = state.ground[ty * state.W + tx] & 127;
    if (v !== T.WATER && v !== T.POOL) continue;
    const h = hash2(tx, ty), ph = t * 2 + (h % 100) / 16;
    const x = tx * TS + (h % 11) + Math.sin(ph) * 2, y = ty * TS + ((h >> 4) % 12);
    if (Math.sin(ph * 1.3) > 0.2) ctx.fillRect(Math.round(x), Math.round(y), 3, 1);
  }
}

// ---------------------------------------------------------------------------
// Dibuix: llum (nit) i temps meteorològic, en espai de pantalla
function drawLighting(camX, camY, z, vw, vh) {
  const W = canvas.width, H = canvas.height, w = world.weather;
  const dim = w.id === "clear" ? 0 : w.id === "fog" ? 0.12 : 0.18;    // dies grisos
  const dark = Math.min(1, world.dark), alpha = dark * 0.68 + dim * (1 - dark);
  if (alpha < 0.01) return;
  const lc = world.lightCv;
  if (lc.width !== W || lc.height !== H) { lc.width = W; lc.height = H; }
  const c = lc.getContext("2d");
  c.globalCompositeOperation = "source-over";
  c.clearRect(0, 0, W, H);
  c.fillStyle = dark > 0 ? `rgba(8,10,38,${alpha})` : `rgba(60,66,84,${alpha})`;
  c.fillRect(0, 0, W, H);
  const lights = [], glows = [], windows = [];
  if (dark > 0.25) {
    const on = Math.min(1, (dark - 0.25) / 0.3);
    const tx0 = Math.max(0, Math.floor(camX / TS) - 2), tx1 = Math.min(state.W - 1, Math.ceil((camX + vw) / TS) + 2);
    const ty0 = Math.max(0, Math.floor(camY / TS) - 2), ty1 = Math.min(state.H - 1, Math.ceil((camY + vh) / TS) + 3);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const i = ty * state.W + tx;
      if (state.decor[i] === D.LAMP) { // fanal
        const x = tx * TS + 8, y = ty * TS - 8;
        lights.push([x, y + 14, 64 * on]); glows.push([x, y, 26, "255,214,140", 0.55 * on]);
      }
      const v = state.ground[i] & 127;
      if (v >= BUILDING_BASE && !isBuilding(g(tx, ty + 1)) && hash2(tx, ty) % 4 !== 0 && hash2(tx * 7, ty) % 5 < 3) {
        windows.push([tx * TS + 5, ty * TS + 5, on]); // finestra encesa
      }
    }
    for (const tr of world.trucks) { // fars i llum de gir
      if (!tr.active) continue;
      const S = TRUCK_SCALE, fx = tr.dir === "right" ? 34 * S : tr.dir === "left" ? -34 * S : 0, fy = tr.dir === "down" ? 10 : tr.dir === "up" ? -44 * S : -8 * S;
      lights.push([tr.x + fx, tr.y + fy, 90]);
      if (Math.floor(Date.now() / 250) % 2) glows.push([tr.x, tr.y - 32 * S, 26, "255,150,40", 0.8]);
    }
    for (const p of state.meta.pois || []) { // rètols il·luminats
      const x = p.x * TS, y = p.y * TS;
      if (x > camX - 20 && x < camX + vw + 20 && y > camY - 20 && y < camY + vh + 40) lights.push([x, y - 8, 22 * on]);
    }
  }
  // el jugador porta un fanalet
  lights.push([state.player.x, state.player.y - 10, dark > 0.25 ? 70 : 0]);
  c.globalCompositeOperation = "destination-out";
  for (const [x, y, r] of lights) {
    if (r <= 0) continue;
    const sx = (x - camX) * z, sy = (y - camY) * z, R = r * z;
    const gr = c.createRadialGradient(sx, sy, 0, sx, sy, R);
    gr.addColorStop(0, "rgba(0,0,0,0.95)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = gr; c.fillRect(sx - R, sy - R, R * 2, R * 2);
  }
  for (const [x, y, on] of windows) {
    c.fillStyle = `rgba(0,0,0,${0.8 * on})`;
    c.fillRect((x - camX) * z, (y - camY) * z, 6 * z, 7 * z);
  }
  ctx.drawImage(lc, 0, 0);
  // brillantor càlida additiva
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const [x, y, r, col, a] of glows) {
    const sx = (x - camX) * z, sy = (y - camY) * z, R = r * z;
    const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
    gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = gr; ctx.fillRect(sx - R, sy - R, R * 2, R * 2);
  }
  for (const [x, y, on] of windows) {
    ctx.fillStyle = `rgba(255,190,90,${0.35 * on})`;
    ctx.fillRect((x - camX) * z, (y - camY) * z, 6 * z, 7 * z);
  }
  ctx.restore();
}

function drawWeather() {
  const W = canvas.width, H = canvas.height, t = Date.now() / 1000, id = world.weather.id;
  if (id === "rain") {
    ctx.strokeStyle = "rgba(190,210,255,.55)"; ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    for (let i = 0; i < 260; i++) {
      const hx = hash2(i, 1) / 4294967296, hy = hash2(i, 2) / 4294967296;
      const x = ((hx * W + t * 160 * dpr) % W + W) % W, y = (hy * H + t * 900 * dpr) % H;
      ctx.moveTo(x, y); ctx.lineTo(x - 4 * dpr, y + 14 * dpr);
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(200,220,255,.5)";
    for (let i = 0; i < 40; i++) { // esquitxos
      const k = Math.floor(t * 6 + i * 0.37), x = (hash2(k, i) % W), y = (hash2(i, k) % H);
      ctx.fillRect(x - 2 * dpr, y, 5 * dpr, dpr);
    }
  } else if (id === "snow") {
    ctx.fillStyle = "rgba(255,255,255,.14)"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,.9)";
    for (let i = 0; i < 220; i++) {
      const hx = hash2(i, 3) / 4294967296, hy = hash2(i, 4) / 4294967296, sp = 30 + (i % 5) * 12;
      const x = ((hx * W + Math.sin(t + i) * 18 * dpr) % W + W) % W, y = (hy * H + t * sp * dpr) % H;
      const s = (1 + (i % 3)) * dpr;
      ctx.fillRect(x, y, s, s);
    }
  } else if (id === "fog") {
    ctx.fillStyle = "rgba(225,230,238,.28)"; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 7; i++) { // bancs de boira que es mouen
      const x = ((hash2(i, 5) % W) + t * (12 + i * 4) * dpr) % (W + 600) - 300, y = hash2(i, 6) % H, R = (260 + (i % 3) * 120) * dpr;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, R);
      gr.addColorStop(0, "rgba(235,238,245,.45)"); gr.addColorStop(1, "rgba(235,238,245,0)");
      ctx.fillStyle = gr; ctx.fillRect(x - R, y - R, R * 2, R * 2);
    }
  }
}

// ---------------------------------------------------------------------------
// Sprites
function makeTruckSprites() {
  const set = {};
  for (const d of DIRS) set[d] = [0, 1].map((f) => makeTruck(d, f));
  return set;
}
function makeTruck(dir, f) {
  const white = hex("#eef0ee"), green = hex("#2f8a4a"), grey = hex("#7a8088"), dark = hex("#2b2f3a"),
    tyre = hex("#16161c"), glass = hex("#6fb6e8"), beacon = f ? hex("#ffb020") : hex("#a05a10"), yellow = hex("#ffe14a");
  if (dir === "left" || dir === "right") {
    const p = new Pix(50, 32);
    p.rect(1, 3, 35, 23, white); p.rect(1, 14, 35, 3, green);                   // caixa compactadora
    for (let x = 5; x < 36; x += 6) p.rect(x, 4, 1, 21, hex("#d0d4d0"));
    p.rect(0, 6, 3, 19, grey); p.rect(0, 20, 3, 2, hex("#ff8a00"));             // tremuja
    p.rect(36, 9, 12, 17, white); p.rect(39, 11, 8, 5, glass); p.rect(36, 18, 12, 2, green); // cabina
    p.rect(47, 21, 2, 2, yellow); p.rect(40, 6, 4, 3, beacon);                  // far i llum de gir
    for (const x of [9, 24, 42]) { wheel(p, x, 27, 4, tyre); p.set(x, 27, hex("#9aa0a6")); }
    p.outline(OUTLINE);
    const q = p.toCanvas();
    if (dir === "right") return q;
    const cv = document.createElement("canvas"); cv.width = q.width; cv.height = q.height;
    const c = cv.getContext("2d"); c.translate(q.width, 0); c.scale(-1, 1); c.drawImage(q, 0, 0);
    return cv;
  }
  const p = new Pix(28, 42);
  p.rect(2, 2, 24, 30, white); p.rect(2, 16, 24, 3, green);
  for (let x = 6; x < 26; x += 5) p.rect(x, 3, 1, 28, hex("#d0d4d0"));
  if (dir === "down") {
    p.rect(2, 26, 24, 12, white); p.rect(5, 28, 18, 5, glass); p.rect(4, 35, 20, 2, dark);
    p.rect(3, 34, 3, 2, yellow); p.rect(22, 34, 3, 2, yellow); p.rect(12, 23, 4, 3, beacon);
  } else {
    p.rect(3, 30, 22, 8, grey);
    for (let x = 3; x < 25; x += 4) { p.rect(x, 36, 2, 2, hex("#ff8a00")); p.rect(x + 2, 36, 2, 2, white); }
    p.rect(3, 31, 3, 2, hex("#e03030")); p.rect(22, 31, 3, 2, hex("#e03030")); p.rect(12, 0, 4, 3, beacon);
  }
  p.rect(0, 34, 3, 7, tyre); p.rect(25, 34, 3, 7, tyre); p.rect(0, 8, 3, 7, tyre); p.rect(25, 8, 3, 7, tyre);
  p.outline(OUTLINE);
  return p.toCanvas();
}

function makeBag(v) {
  const p = new Pix(11, 12), base = hex(["#22242a", "#2f3d2a", "#4a4e56"][v]), hi = shade(base, 40);
  for (let y = 3; y < 12; y++) for (let x = 0; x < 11; x++) {
    const dx = (x - 5) / 5.2, dy = (y - 7.5) / 4.5;
    if (dx * dx + dy * dy < 1) p.set(x, y, dx < -0.3 && dy < 0 ? hi : base);
  }
  p.rect(4, 1, 3, 2, base); p.set(3, 0, base); p.set(7, 0, base); p.set(5, 2, hi); // nus
  p.outline(OUTLINE);
  return p.toCanvas();
}

// Brollador: raig d'aigua amb gotes que cauen (4 fotogrames)
function makeJet(f) {
  const p = new Pix(12, 26), w = [200, 235, 255, 230], w2 = [150, 205, 250, 210];
  const top = 4 + (f % 2);
  p.rect(5, top, 2, 22 - top, w);
  p.set(4, top + 2, w2); p.set(7, top + 3, w2);
  for (let i = 0; i < 4; i++) { // gotes que cauen en arc
    const s = (i + f) % 4, dx = 2 + s, dy = top + s * s;
    p.set(5 - dx, dy, w); p.set(6 + dx, dy + 1, w2);
  }
  p.rect(2, 23, 8, 2, w2); p.set(1, 22 + (f % 2), w); p.set(10, 23 - (f % 2), w); // esquitx a baix
  return p.toCanvas();
}
