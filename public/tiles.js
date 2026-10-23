// Tileset procedural, estil poble RPG de 16 bits (gespa viva, camins de terra, empedrat,
// teulades de colors i cases de guix amb bigues de fusta)
"use strict";
const C = {
  grass: hex("#6cc04a"), grassDark: hex("#3f9136"), path: hex("#e2c487"), stone: hex("#d8d0b8"),
  cobble: hex("#a89c84"), forest: hex("#3c8a3a"), water: hex("#3f8ae0"), white: hex("#fbf7ea"),
};

// Gespa amb mates en forma de "v" i alguna flor
function grassBase(p, r, c, flowers) {
  p.noise(r, c, [shade(c, 8), shade(c, -6)], 0.25);
  const tuft = shade(c, -34), lite = shade(c, 26);
  for (let i = 0; i < 5; i++) {
    const x = 1 + ((r() * 13) | 0), y = 2 + ((r() * 12) | 0);
    p.set(x, y, tuft); p.set(x + 2, y, tuft); p.set(x + 1, y + 1, tuft); p.set(x + 1, y - 1, lite);
  }
  if (flowers) {
    const fl = [[hex("#ffffff"), hex("#f6e05e")], [hex("#ff6b6b"), hex("#ffe08a")], [hex("#b794f4"), hex("#ffffff")]];
    for (let i = 0; i < flowers; i++) {
      const [pet, mid] = fl[(r() * fl.length) | 0], x = 2 + ((r() * 12) | 0), y = 2 + ((r() * 12) | 0);
      p.set(x - 1, y, pet); p.set(x + 1, y, pet); p.set(x, y - 1, pet); p.set(x, y + 1, pet); p.set(x, y, mid);
    }
  }
}

// Lloses de pedra irregulars (sense aspecte de totxana)
function slabs(p, r, c, v) {
  p.fill(c);
  const gap = shade(c, -22), hi = shade(c, 14), lo = shade(c, -10);
  const cuts = [[0, 0, 9, 7], [9, 0, 7, 6], [0, 7, 6, 9], [6, 7, 10, 3], [9, 6, 7, 1], [6, 10, 10, 6]];
  const off = (v % 2) * 3;
  for (const [x, y, w, h] of cuts) {
    const tone = shade(c, ((hash2(x + v * 7, y + off) % 5) - 2) * 4);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const X = (x + i + off) % 16, Y = y + j;
      const edgeT = j === 0, edgeL = i === 0, edgeB = j === h - 1, edgeR = i === w - 1;
      p.set(X, Y, edgeT || edgeL ? (edgeT && edgeL ? gap : hi) : edgeB || edgeR ? lo : (r() < 0.08 ? shade(tone, -6) : tone));
    }
  }
  for (let i = 0; i < 16; i++) { if (r() < 0.05) p.set(i, (r() * 16) | 0, gap); }
}

// Empedrat de pedres arrodonides
function cobbles(p, r, c) {
  p.fill(shade(c, -30));
  for (let row = 0; row < 4; row++) for (let col = -1; col < 4; col++) {
    const cx = col * 4 + (row % 2) * 2 + 1, cy = row * 4;
    const t = shade(c, ((r() * 3) | 0) * 6 - 6);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      if ((i === 0 || i === 2) && (j === 0 || j === 2) && r() < 0.6) continue;
      p.set(cx + i, cy + j, j === 0 ? shade(t, 16) : j === 2 ? shade(t, -10) : t);
    }
  }
}

function paintGround(p, id, v, r) {
  switch (id) {
    case T.GROUND: // patis i espais sense mapejar: gespa de poble
      grassBase(p, r, C.grass, v === 3 ? 2 : 0);
      break;
    case T.SIDEWALK: { // camí de terra piconada
      p.noise(r, C.path, [shade(C.path, -10), shade(C.path, 8)], 0.3);
      for (let i = 0; i < 4; i++) { const x = (r() * 15) | 0, y = (r() * 15) | 0; p.set(x, y, shade(C.path, -28)); p.set(x + 1, y, shade(C.path, 18)); }
      break;
    }
    case T.PLAZA:
      slabs(p, r, C.stone, v);
      break;
    case T.ROAD: case T.ROAD_LINE: case T.CROSSWALK:
      cobbles(p, r, C.cobble);
      break;
    case T.PARKING:
      cobbles(p, r, shade(C.cobble, -10));
      break;
    case T.CYCLEWAY: { const c = hex("#d39a68"); p.noise(r, c, [shade(c, -12), shade(c, 8)], 0.3); break; }
    case T.STEPS: {
      const c = C.stone;
      for (let y = 0; y < 16; y++) p.rect(0, y, 16, 1, y % 4 === 0 ? shade(c, 22) : y % 4 === 3 ? shade(c, -34) : c);
      break;
    }
    case T.GRASS:
      grassBase(p, r, C.grass, v === 3 ? 1 : 0);
      break;
    case T.PARK:
      grassBase(p, r, shade(C.grass, -4), v >= 2 ? 3 : 0);
      break;
    case T.FOREST: {
      grassBase(p, r, C.forest, 0);
      if (v % 2 === 0) { // matoll
        const b = hex("#2f7a2e");
        for (let y = 0; y < 7; y++) for (let x = 0; x < 9; x++) {
          const dx = (x - 4) / 4.5, dy = (y - 3.5) / 3.5;
          if (dx * dx + dy * dy < 1) p.set(4 + x, 5 + y, dy < -0.2 ? shade(b, 25) : b);
        }
      }
      break;
    }
    case T.WATER: case T.POOL: {
      const c = id === T.POOL ? hex("#6fd0f0") : C.water;
      p.noise(r, c, [shade(c, -6)], 0.15);
      for (let i = 0; i < 2; i++) {
        const x = (r() * 10) | 0, y = 3 + ((r() * 10) | 0);
        p.rect(x, y, 3, 1, shade(c, 50)); p.rect(x + 3, y - 1, 2, 1, shade(c, 50));
      }
      if (v === 1) p.set((r() * 16) | 0, (r() * 16) | 0, C.white);
      break;
    }
    case T.RAIL: {
      const g = hex("#9c8f78");
      p.noise(r, g, [shade(g, -15), shade(g, 15)], 0.5);
      for (let y = 1; y < 16; y += 4) p.rect(1, y, 14, 2, hex("#7a4e2c"));
      p.rect(4, 0, 1, 16, hex("#c8ccd4")); p.rect(11, 0, 1, 16, hex("#c8ccd4"));
      break;
    }
    case T.SAND: { const c = hex("#f0dca0"); p.noise(r, c, [shade(c, -12), shade(c, 10)], 0.3); break; }
    case T.PITCH: grassBase(p, r, v % 2 ? hex("#5fb546") : hex("#69c24f"), 0); break;
    case T.GRAVEL: { const c = hex("#c4b89c"); p.noise(r, c, [shade(c, -20), shade(c, 14)], 0.45); break; }
    case T.PLAYGROUND: { const c = hex("#efd28e"); p.noise(r, c, [shade(c, -14), shade(c, 10)], 0.35); break; }
    case T.DIRT: { const c = hex("#b98a55"); p.noise(r, c, [shade(c, -14), shade(c, 12)], 0.35); break; }
    case T.SCHOOLYARD: { const c = hex("#e2c487"); p.noise(r, c, [shade(c, -8), shade(c, 8)], 0.25); break; }
    case T.CONCRETE: slabs(p, r, hex("#c9c6bb"), v); break;
    case T.RUINS: { const c = hex("#a39684"); p.noise(r, c, [hex("#7d7062"), hex("#c2b5a2"), hex("#8a6a4a")], 0.5); break; }
    case T.TRACK: {
      const c = hex("#c8683f");
      p.noise(r, c, [shade(c, -10), shade(c, 8)], 0.3);
      p.rect(0, 7, 16, 1, C.white);
      break;
    }
    default:
      p.fill(hex("#ff00ff"));
  }
}

// Colors de teulada i paret: cada tipus d'edifici té una paleta i cada edifici en tria un color
const ROOF = [
  { colors: ["#c8483c", "#3f72c4", "#4f9e48", "#d1803a"], wall: ["#f3e6c4", "#eedcb2", "#f6edd6", "#e9d5a8"] }, // pisos
  { colors: ["#c8483c", "#b9542e", "#a8403a", "#d06a3a"], wall: ["#f3e6c4", "#efdcb4", "#f6edd6", "#ead6ac"] }, // cases
  { colors: ["#6a5c9e", "#58648a", "#7a5aa0", "#5e6e96"], wall: ["#d9d3c4", "#cfc8b6", "#e0dacb", "#c9c1ad"] }, // esglésies
  { colors: ["#7f8a96", "#8c6a4c", "#6e7b70", "#94826c"], wall: ["#b98a55", "#a97c4a", "#c09260", "#9e7244"] }, // naus (fusta)
  { colors: ["#2f8f8a", "#3f72c4", "#3a8f6a", "#4a7fb0"], wall: ["#ece6d6", "#e4dcc8", "#f2ecde", "#ddd4bf"] }, // equipaments
  { colors: ["#d1a23a", "#5aa05a", "#c0603a", "#4f8fc0"], wall: ["#f0e6cf", "#e8ddc2", "#f5eedc", "#e2d6b8"] }, // comerços
];
const roofColor = (type, s) => hex(ROOF[type].colors[s]);

// Façana: guix amb biga de fusta, finestra amb travessers i test de flors, o porta de fusta
function paintFacade(p, type, s, v, r) {
  const wall = hex(ROOF[type].wall[s]);
  const beam = hex("#8a5a32"), beamD = hex("#5e3b20");
  if (type === 3) { // nau de fusta: taulons
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, x % 4 === 0 ? shade(wall, -26) : (r() < 0.1 ? shade(wall, -8) : wall));
  } else {
    p.noise(r, wall, [shade(wall, -6), shade(wall, 5)], 0.15);
  }
  p.rect(0, 0, 16, 2, beam); p.rect(0, 2, 16, 1, beamD);             // biga sota la teulada
  p.rect(0, 15, 16, 1, shade(wall, -30));                              // sòcol
  if (type === 2) { // església: vitrall en arc
    p.rect(5, 5, 6, 9, hex("#6a5a48")); p.rect(6, 4, 4, 1, hex("#6a5a48"));
    p.rect(6, 5, 4, 8, hex("#7f5fb0")); p.set(7, 6, hex("#f6e05e")); p.set(8, 8, hex("#e85d5d")); p.set(7, 10, hex("#5fb3ff"));
    return;
  }
  if (v === 0) { // porta de fusta amb arc
    p.rect(5, 5, 6, 10, beamD); p.rect(6, 4, 4, 1, beamD);
    p.rect(6, 5, 4, 10, hex("#a8703c")); p.rect(7, 5, 1, 10, hex("#8a5a32"));
    p.set(9, 10, hex("#f6d55c")); p.rect(5, 14, 6, 1, hex("#7d7262"));
    return;
  }
  // finestra amb marc de fusta i travessers
  const glass = hex("#5b9ee0"), glassHi = hex("#bfe3ff");
  p.rect(4, 5, 8, 7, beamD); p.rect(5, 6, 6, 5, glass);
  p.rect(7, 6, 2, 5, beamD); p.rect(5, 8, 6, 1, beamD);
  p.set(5, 6, glassHi); p.set(9, 6, glassHi);
  if (type !== 4 && type !== 5 && v !== 3) { // test amb flors
    p.rect(4, 12, 8, 2, hex("#8a5a32"));
    for (let x = 4; x < 12; x += 2) p.set(x + (r() < 0.5 ? 0 : 1), 11, [hex("#ff6b6b"), hex("#f6e05e"), hex("#ffffff")][(r() * 3) | 0]);
    p.rect(4, 11, 8, 1, hex("#3f9136"));
    for (let x = 4; x < 12; x += 2) p.set(x + 1, 11, [hex("#ff6b6b"), hex("#f6e05e"), hex("#ffffff")][(r() * 3) | 0]);
  } else if (type === 5) { // comerç: tendal de ratlles
    for (let x = 3; x < 13; x++) p.set(x, 4, x % 2 ? hex("#e85d5d") : C.white);
  }
}

const tileCache = new Map();
// th = tema del sector (themes.js); si el tema no defineix una tile, es fa servir l'estil base
function getTile(kind, id, v, th = BASE_THEME) {
  const key = kind + ":" + id + ":" + v + ":" + th;
  let cv = tileCache.get(key);
  if (cv) return cv;
  const p = new Pix(TS, TS), theme = THEMES[th];
  const r = rng(hash2(id * 31 + 7 + th * 7919, v * 131 + (kind === "f" ? 999 : kind === "r" ? 555 : 1)));
  if (kind === "g") { if (!theme.ground?.(p, id, v, r)) paintGround(p, id, v, r); }
  else {
    const b = id - BUILDING_BASE, type = (b / 4) | 0, s = b % 4;
    (theme.facade || paintFacade)(p, type, s, v, r); // les teulades es pinten a roofs.js
  }
  cv = p.toCanvas();
  tileCache.set(key, cv);
  return cv;
}

