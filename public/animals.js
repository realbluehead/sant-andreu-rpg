// Animals de Sant Andreu RPG: gats, gossos i estols de coloms.
// Com els altres NPCs, el moviment és determinista (llavor fixa + rellotge), així tots els
// jugadors els veuen al mateix lloc. Cada animal té un "cau" i va i torna a punts propers
// als quals s'arriba en línia recta sense travessar edificis.
// Els coloms s'espanten i alcen el vol quan t'hi acostes (efecte només local).
"use strict";

const ANIMAL_CONFIG = {
  cat: { radius: 4, period: 10, moveFrac: 0.35, speedTiles: 1.2, seed: 9100,
    tiles: [T.GROUND, T.PLAZA, T.PARK, T.GRASS, T.SCHOOLYARD, T.SIDEWALK] },
  dog: { radius: 6, period: 6, moveFrac: 0.6, speedTiles: 2.2, seed: 9300,
    tiles: [T.PARK, T.GRASS, T.SIDEWALK, T.PLAZA, T.DIRT] },
};
const SOUNDS = { cat: ["Miau!", "Mrrr…", "Miaaau"], dog: ["Guau!", "Bup bup!", "Grrr…"] };

const animals = { list: [], sprites: null };

// ---------------------------------------------------------------------------
// Llocs on poden viure
function inBarriTile(tx, ty, allowed) {
  if (tx < 0 || ty < 0 || tx >= state.W || ty >= state.H) return false;
  const v = state.ground[ty * state.W + tx];
  return !(v & OUTSIDE) && allowed.has(v & 127) && !blocked(tx, ty);
}

function clearLine(x0, y0, x1, y1, allowed) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    if (!inBarriTile(Math.floor(x0 + (x1 - x0) * f), Math.floor(y0 + (y1 - y0) * f), allowed)) return false;
  }
  return true;
}

function pickHome(r, allowed, tries = 400) {
  for (let i = 0; i < tries; i++) {
    const tx = (r() * state.W) | 0, ty = (r() * state.H) | 0;
    if (inBarriTile(tx, ty, allowed)) return [tx + 0.5, ty + 0.5];
  }
  return null;
}

// Punt de passeig número i (determinista): proper al cau i accessible en línia recta
function waypoint(a, i) {
  const h = hash2(a.seed, i);
  const ang = (h % 3600) / 3600 * Math.PI * 2, dist = 1 + ((h >>> 12) % 1000) / 1000 * (a.radius - 1);
  const x = a.home[0] + Math.cos(ang) * dist, y = a.home[1] + Math.sin(ang) * dist;
  return clearLine(a.home[0], a.home[1], x, y, a.allowed) ? [x, y] : a.home;
}

function initAnimals() {
  animals.sprites = makeAnimalSprites();
  for (const [kind, cfg] of Object.entries(ANIMAL_CONFIG)) {
    const allowed = new Set(cfg.tiles);
    for (let i = 0; i < (kind === "cat" ? CFG.animals.cats : CFG.animals.dogs); i++) {
      const r = rng(cfg.seed + i * 104729);
      const home = pickHome(r, allowed);
      if (!home) continue;
      animals.list.push({
        kind, home, allowed, seed: cfg.seed + i, radius: cfg.radius, period: cfg.period * (0.8 + r() * 0.4),
        moveFrac: cfg.moveFrac, phase: r() * 100, variant: i % animals.sprites[kind].length,
        x: 0, y: 0, face: "right", moving: false, say: null, sayCd: 0, wp: new Map(),
      });
    }
  }
  // Estols de coloms a places i parcs
  const flockTiles = new Set([T.PLAZA, T.PARK, T.GROUND]);
  for (let f = 0; f < CFG.animals.pigeonFlocks; f++) {
    const r = rng(9700 + f * 7907);
    const center = pickHome(r, new Set([T.PLAZA])) || pickHome(r, flockTiles);
    if (!center) continue;
    for (let j = 0; j < CFG.animals.pigeonsPerFlock; j++) {
      const home = [center[0] + (r() - 0.5) * 3, center[1] + (r() - 0.5) * 2];
      if (!inBarriTile(Math.floor(home[0]), Math.floor(home[1]), flockTiles)) continue;
      animals.list.push({
        kind: "pigeon", home, allowed: flockTiles, seed: 9700 + f * 100 + j, radius: 1.6, period: 2.5 + r() * 2,
        moveFrac: 0.4, phase: r() * 100, variant: j % animals.sprites.pigeon.length,
        x: 0, y: 0, face: r() < 0.5 ? "left" : "right", moving: false, fly: 0, flyDir: [0, 0], wp: new Map(),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Simulació
function cachedWaypoint(a, i) {
  let w = a.wp.get(i);
  if (!w) {
    w = waypoint(a, i);
    a.wp.set(i, w);
    if (a.wp.size > 8) a.wp.delete(a.wp.keys().next().value);
  }
  return w;
}

function updateAnimals(dt) {
  const t = Date.now() / 1000, pl = state.player;
  for (const a of animals.list) {
    // Recorregut en estrella: cau -> punt i -> cau -> punt i+1 ...
    const u = (t + a.phase) / a.period, seg = Math.floor(u), f = u - seg;
    const k = Math.floor(seg / 2), out = seg % 2 === 0;
    const w = cachedWaypoint(a, k);
    const [ax, ay] = out ? a.home : w, [bx, by] = out ? w : a.home;
    const m = Math.min(1, f / a.moveFrac), e = m * m * (3 - 2 * m);
    const px = ax + (bx - ax) * e, py = ay + (by - ay) * e;
    a.moving = m < 1 && Math.hypot(bx - ax, by - ay) > 0.2;
    if (Math.abs(bx - ax) > 0.05 && a.moving) a.face = bx > ax ? "right" : "left";
    a.x = px * TS; a.y = py * TS;

    const dist = Math.hypot(a.x - pl.x, a.y - pl.y);
    if (a.kind === "pigeon") {
      // s'espanten quan t'hi acostes
      if (a.fly > 0) a.fly = Math.max(0, a.fly - dt);
      else if (dist < 2.5 * TS && !npcs.dead) {
        a.fly = 3.2;
        const dx = a.x - pl.x, dy = a.y - pl.y, n = Math.hypot(dx, dy) || 1;
        a.flyDir = [dx / n, dy / n];
        a.face = dx > 0 ? "right" : "left";
      }
    } else {
      // de tant en tant diuen alguna cosa si ets a prop
      a.sayCd = Math.max(0, a.sayCd - dt);
      if (a.say && (a.say.ttl -= dt) <= 0) a.say = null;
      if (!a.say && a.sayCd <= 0 && dist < 3 * TS && Math.random() < dt * 0.6) {
        const opts = SOUNDS[a.kind];
        a.say = { text: opts[(Math.random() * opts.length) | 0], ttl: 1.6 };
        a.sayCd = 5;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Dibuix
function pushAnimalSprites(list, camX, camY, vw, vh, k) {
  const S = animals.sprites, now = Date.now();
  for (const a of animals.list) {
    if (!inView(a.x, a.y, camX, camY, vw, vh, 80, 80)) continue;
    let img, dx = 0, dy = 0;
    if (a.kind === "pigeon") {
      if (a.fly > 0) {
        const p = 1 - a.fly / 3.2, arc = Math.sin(p * Math.PI);          // se'n van i tornen
        dx = a.flyDir[0] * 70 * arc; dy = a.flyDir[1] * 40 * arc - 55 * arc;
        img = S.pigeon[a.variant].fly[Math.floor(now / 90) % 2];
      } else {
        img = S.pigeon[a.variant][a.moving ? "walk" : "peck"][Math.floor(now / 260 + a.phase) % 2];
      }
    } else {
      const set = S[a.kind][a.variant];
      img = a.moving ? set.walk[Math.floor(now / (a.kind === "dog" ? 120 : 180)) % 2] : set.sit;
    }
    const flip = a.face === "left";
    list.push([a.y, flip ? img.flipped : img.img, Math.round(a.x + dx - (img.img.width / 2) * k), Math.round(a.y + dy - (img.img.height - 1) * k), false, k]);
  }
}

function drawAnimalBubbles(camX, camY, z) {
  for (const a of animals.list) {
    if (a.say) drawBubble(a.say, a.x, a.y, camX, camY, z, (a.kind === "dog" ? 6 : 2) * z); // els animals s'escalen amb el mapa
  }
}

// ---------------------------------------------------------------------------
// Sprites procedurals (mirant a la dreta; la versió a l'esquerra és un mirall)
function spr(p) {
  p.outline(OUTLINE);
  const q = new Pix(p.w, p.h);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) q.set(p.w - 1 - x, y, p.get(x, y));
  return { img: p.toCanvas(), flipped: q.toCanvas() };
}

const CAT_COATS = [
  { base: "#e08a3c", dark: "#b8642a", light: "#f5c58e" },  // atigrat taronja
  { base: "#2b2b33", dark: "#16161c", light: "#4a4a55" },  // negre
  { base: "#8e9099", dark: "#6b6d75", light: "#c3c5cc" },  // gris
  { base: "#f2efe8", dark: "#2b2b33", light: "#ffffff" },  // blanc i negre
];
function makeCat(coat, mode, f) {
  const p = new Pix(14, 11), b = hex(coat.base), d = hex(coat.dark), l = hex(coat.light), eye = hex("#9ae66e"), pink = hex("#f2a0b0");
  if (mode === "sit") {
    p.rect(4, 4, 6, 6, b); p.rect(5, 9, 5, 1, l);            // cos assegut
    p.rect(8, 1, 5, 4, b); p.set(8, 0, b); p.set(12, 0, b);  // cap i orelles
    p.set(10, 2, eye); p.set(12, 2, eye); p.set(11, 3, pink);
    p.rect(1, 8, 3, 1, b); p.set(1, 7, b);                    // cua enroscada
    p.rect(5, 5, 1, 3, d); p.rect(7, 5, 1, 3, d);
  } else {
    p.rect(2, 4, 9, 4, b); p.rect(3, 4, 7, 1, l);             // cos
    p.rect(9, 1, 5, 4, b); p.set(9, 0, b); p.set(13, 0, b);   // cap
    p.set(11, 2, eye); p.set(13, 2, eye); p.set(12, 3, pink);
    p.rect(0, 1, 1, 3, b); p.set(1, 4, b);                    // cua alçada
    p.rect(4, 5, 1, 2, d); p.rect(6, 5, 1, 2, d);
    const legs = f ? [[3, 8], [5, 9], [8, 8], [10, 9]] : [[3, 9], [5, 8], [8, 9], [10, 8]];
    for (const [x, y] of legs) p.rect(x, 8, 1, y - 7, b);
  }
  return spr(p);
}

const DOG_COATS = [
  { base: "#9a6532", dark: "#6b4426", light: "#c49060", ear: "#5a3820" },  // marró
  { base: "#e8c27a", dark: "#c79a4f", light: "#f6deaa", ear: "#c79a4f" },  // daurat
  { base: "#2b2b33", dark: "#16161c", light: "#55555f", ear: "#16161c" },  // negre
  { base: "#f2efe8", dark: "#5a3820", light: "#ffffff", ear: "#5a3820" },  // blanc amb taques
];
function makeDog(coat, mode, f) {
  const p = new Pix(17, 13), b = hex(coat.base), d = hex(coat.dark), l = hex(coat.light), ear = hex(coat.ear),
    nose = hex("#1b1b2a"), collar = hex("#d14b4b");
  if (mode === "sit") {
    p.rect(4, 5, 7, 6, b); p.rect(5, 6, 3, 4, l);               // cos assegut
    p.rect(9, 1, 6, 5, b); p.rect(14, 3, 2, 2, b); p.set(15, 3, nose);
    p.rect(9, 1, 2, 4, ear); p.set(12, 2, nose);
    p.rect(9, 6, 3, 1, collar);
    p.rect(5, 11, 2, 1, b); p.rect(9, 11, 2, 1, b);
    p.rect(2, 9, 2, 1, b); p.set(1, 8, b);                       // cua
  } else {
    p.rect(2, 4, 11, 5, b); p.rect(3, 4, 9, 1, l);               // cos
    if (coat.base === "#f2efe8") { p.rect(5, 5, 3, 2, d); p.rect(9, 6, 2, 2, d); }
    p.rect(11, 1, 5, 5, b); p.rect(15, 3, 2, 2, b); p.set(16, 3, nose);
    p.rect(11, 1, 2, 4, ear); p.set(14, 2, nose);
    p.rect(11, 6, 2, 1, collar);
    p.rect(0, 2, 1, 2, b); p.set(1, 4, b);                       // cua
    const legs = f ? [[3, 11], [5, 12], [9, 11], [11, 12]] : [[3, 12], [5, 11], [9, 12], [11, 11]];
    for (const [x, y] of legs) p.rect(x, 9, 2, y - 8, d);
  }
  return spr(p);
}

const PIGEON_COLORS = [
  { base: "#8b93a6", dark: "#5f667a", neck: "#5fb38f" },
  { base: "#a3aab8", dark: "#6e7586", neck: "#8a6fb3" },
  { base: "#6f7686", dark: "#4a5060", neck: "#5fb38f" },
];
function makePigeon(c, mode, f) {
  const p = new Pix(10, 8), b = hex(c.base), d = hex(c.dark), n = hex(c.neck), beak = hex("#e8c27a"), eye = hex("#d14b4b"), leg = hex("#e07a7a");
  if (mode === "fly") {
    p.rect(2, 4, 6, 2, b); p.rect(7, 3, 2, 2, b); p.set(8, 3, eye); p.set(9, 4, beak); p.rect(0, 4, 2, 1, d);
    if (f) { p.rect(3, 0, 2, 4, d); p.rect(5, 1, 2, 3, b); } else { p.rect(3, 6, 2, 2, d); p.rect(5, 6, 2, 1, b); }
  } else {
    const head = mode === "peck" && f ? 2 : 0;                     // picoteja
    p.rect(2, 3, 5, 3, b); p.rect(3, 4, 3, 1, d); p.rect(0, 4, 2, 1, d);
    p.rect(6, 1 + head, 2, 3, n); p.rect(6, 0 + head, 3, 2, b); p.set(8, 0 + head, eye); p.set(9, 1 + head, beak);
    const st = mode === "walk" && f ? 1 : 0;
    p.set(4 - st, 6, leg); p.set(5 + st, 6, leg); p.set(4 - st, 7, leg); p.set(5 + st, 7, leg);
  }
  return spr(p);
}

function makeAnimalSprites() {
  return {
    cat: CAT_COATS.map((c) => ({ walk: [makeCat(c, "walk", 0), makeCat(c, "walk", 1)], sit: makeCat(c, "sit", 0) })),
    dog: DOG_COATS.map((c) => ({ walk: [makeDog(c, "walk", 0), makeDog(c, "walk", 1)], sit: makeDog(c, "sit", 0) })),
    pigeon: PIGEON_COLORS.map((c) => ({
      walk: [makePigeon(c, "walk", 0), makePigeon(c, "walk", 1)],
      peck: [makePigeon(c, "peck", 0), makePigeon(c, "peck", 1)],
      fly: [makePigeon(c, "fly", 0), makePigeon(c, "fly", 1)],
    })),
  };
}

addSystem({ init: initAnimals, update: updateAnimals, sprites: pushAnimalSprites, overlay: drawAnimalBubbles });
