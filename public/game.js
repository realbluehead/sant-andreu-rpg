// Sant Andreu RPG — mapa pixel art de Sant Andreu de Palomar fet amb dades d'OpenStreetMap.
"use strict";

const DATA_VERSION = 3;  // augmenta-ho quan es regenerin map.bin / map.json
const TS = 16;          // píxels per tile
const CHUNK = 32;       // tiles per chunk
const CHUNK_CACHE = 70;
const ZOOMS = [0.5, 1, 2, 3, 4, 6];
const HERO_SCREEN_SCALE = 3; // mida fixa de l'avatar (equival al zoom ×3)

// Ids de tiles (han de coincidir amb build_map.py)
const T = {
  GROUND: 0, GRASS: 1, PARK: 2, ROAD: 3, ROAD_LINE: 4, SIDEWALK: 5, PLAZA: 6, CYCLEWAY: 7, STEPS: 8, CROSSWALK: 9,
  WATER: 10, RAIL: 11, SAND: 12, PITCH: 13, PARKING: 14, GRAVEL: 15, PLAYGROUND: 16, POOL: 17, DIRT: 18, FOREST: 19,
  SCHOOLYARD: 20, CONCRETE: 21, RUINS: 22, TRACK: 23,
};
const BUILDING_BASE = 40;
const OUTSIDE = 128;
const D = { NONE: 0, TREE: 1, TREE2: 2, FOUNTAIN: 3, BENCH: 4, LAMP: 5 };
const ROADISH = new Set([T.ROAD, T.ROAD_LINE, T.CROSSWALK, T.PARKING]);

// ---------------------------------------------------------------------------
// Utilitats
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const shade = (c, d) => c.map((v) => Math.max(0, Math.min(255, v + d)));
function hash2(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

// Pintor de píxels sobre un canvas petit
class Pix {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.data = new Array(w * h).fill(null);
  }
  set(x, y, c) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[y * this.w + x] = c; }
  get(x, y) { return (x >= 0 && y >= 0 && x < this.w && y < this.h) ? this.data[y * this.w + x] : null; }
  rect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c); }
  fill(c) { this.rect(0, 0, this.w, this.h, c); }
  noise(r, base, alts, p) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      this.set(x, y, r() < p ? alts[(r() * alts.length) | 0] : base);
    }
  }
  outline(c) {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y)) continue;
      if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push([x, y]);
    }
    for (const [x, y] of add) this.set(x, y, c);
  }
  toCanvas() {
    const cv = document.createElement("canvas");
    cv.width = this.w; cv.height = this.h;
    const cx = cv.getContext("2d");
    const img = cx.createImageData(this.w, this.h);
    this.data.forEach((c, i) => {
      if (!c) return;
      img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = c[3] ?? 255;
    });
    cx.putImageData(img, 0, 0);
    return cv;
  }
}

// ---------------------------------------------------------------------------
// Tileset procedural
const C = {
  ground: hex("#cdbd98"), sidewalk: hex("#b8b4aa"), plaza: hex("#d9c7a2"), asphalt: hex("#4b4d57"),
  grass: hex("#6aa84f"), forest: hex("#3d7a3c"), water: hex("#3b7dd8"), white: hex("#ece8d8"),
};

function paintGround(p, id, v, r) {
  switch (id) {
    case T.GROUND: // sauló / terra urbana
      p.noise(r, C.ground, [shade(C.ground, -14), shade(C.ground, 10), shade(C.ground, -6)], 0.35);
      break;
    case T.SIDEWALK: { // panot barceloní
      p.noise(r, C.sidewalk, [shade(C.sidewalk, -6), shade(C.sidewalk, 5)], 0.25);
      const grout = shade(C.sidewalk, -28), hi = shade(C.sidewalk, 18), lo = shade(C.sidewalk, -16);
      for (let i = 0; i < 16; i++) { p.set(i, 0, grout); p.set(i, 8, grout); p.set(0, i, grout); p.set(8, i, grout); }
      for (const ox of [0, 8]) for (const oy of [0, 8]) for (const a of [2, 5]) for (const b of [2, 5]) {
        p.rect(ox + a, oy + b, 2, 2, hi); p.set(ox + a + 1, oy + b + 1, lo);
      }
      break;
    }
    case T.PLAZA: { // llambordes
      const grout = shade(C.plaza, -30);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const row = y >> 2, off = (row & 1) * 4;
        const edge = y % 4 === 3 || (x + off) % 8 === 7;
        p.set(x, y, edge ? grout : shade(C.plaza, ((hash2(((x + off) >> 3) + v * 7, row) % 3) - 1) * 8 + (r() < 0.2 ? -6 : 0)));
      }
      break;
    }
    case T.ROAD: case T.ROAD_LINE: case T.CROSSWALK: case T.PARKING: {
      const base = id === T.PARKING ? shade(C.asphalt, 12) : C.asphalt;
      p.noise(r, base, [shade(base, -6), shade(base, 6), shade(base, -12)], 0.4);
      if (id === T.ROAD_LINE && v % 2 === 0) p.rect(6, 6, 4, 4, C.white);
      if (id === T.CROSSWALK) for (let x = 1; x < 16; x += 5) p.rect(x, 0, 3, 16, C.white);
      if (id === T.PARKING && v === 0) p.rect(0, 0, 1, 16, C.white);
      break;
    }
    case T.CYCLEWAY: { const c = hex("#8c4f44"); p.noise(r, c, [shade(c, -10), shade(c, 8)], 0.35); break; }
    case T.STEPS: {
      const c = hex("#a9a49a");
      for (let y = 0; y < 16; y++) p.rect(0, y, 16, 1, y % 4 === 0 ? shade(c, 25) : y % 4 === 3 ? shade(c, -30) : c);
      break;
    }
    case T.GRASS: case T.PARK: {
      const c = id === T.PARK ? shade(C.grass, -6) : C.grass;
      p.noise(r, c, [shade(c, -14), shade(c, 12), shade(c, -22)], 0.35);
      for (let i = 0; i < 4; i++) { const x = (r() * 15) | 0, y = (r() * 14 + 1) | 0; p.set(x, y, shade(c, 28)); p.set(x, y - 1, shade(c, 18)); }
      if (id === T.PARK && v === 3) {
        const fl = [hex("#f6e05e"), hex("#f56565"), hex("#ffffff"), hex("#b794f4")];
        for (let i = 0; i < 3; i++) p.set((r() * 16) | 0, (r() * 16) | 0, fl[(r() * 4) | 0]);
      }
      break;
    }
    case T.FOREST: {
      p.noise(r, C.forest, [shade(C.forest, -12), shade(C.forest, 10), hex("#6b5a33")], 0.4);
      break;
    }
    case T.WATER: case T.POOL: {
      const c = id === T.POOL ? hex("#5cc3e6") : C.water;
      p.noise(r, c, [shade(c, -8), shade(c, 6)], 0.2);
      if (id === T.POOL) { const l = shade(c, 25); for (let i = 0; i < 16; i++) { p.set(i, 0, l); p.set(0, i, l); } }
      for (let i = 0; i < 2; i++) { const x = (r() * 11) | 0, y = (r() * 14 + 1) | 0; p.rect(x, y, 4, 1, shade(c, 45)); p.rect(x + 1, y - 1, 2, 1, shade(c, 30)); }
      break;
    }
    case T.RAIL: {
      const g = hex("#7c6d5c");
      p.noise(r, g, [shade(g, -15), shade(g, 15)], 0.5);
      for (let y = 1; y < 16; y += 4) p.rect(1, y, 14, 2, hex("#5a3a26"));
      p.rect(4, 0, 1, 16, hex("#b8bcc4")); p.rect(11, 0, 1, 16, hex("#b8bcc4"));
      break;
    }
    case T.SAND: { const c = hex("#e3cf98"); p.noise(r, c, [shade(c, -12), shade(c, 10)], 0.3); break; }
    case T.PITCH: {
      const c = v % 2 ? hex("#4f9c45") : hex("#58a84d");
      p.noise(r, c, [shade(c, -6), shade(c, 6)], 0.25);
      break;
    }
    case T.GRAVEL: {
      const c = hex("#a89d88");
      p.noise(r, c, [shade(c, -18), shade(c, 14), hex("#8e8270")], 0.45);
      break;
    }
    case T.PLAYGROUND: { const c = hex("#c4573e"); p.noise(r, c, [hex("#3f7fbf"), hex("#e3b341"), shade(c, -10)], 0.12); break; }
    case T.DIRT: { const c = hex("#a7845d"); p.noise(r, c, [shade(c, -14), shade(c, 12)], 0.35); break; }
    case T.SCHOOLYARD: { const c = hex("#d2a679"); p.noise(r, c, [shade(c, -8), shade(c, 8)], 0.25); break; }
    case T.CONCRETE: {
      const c = hex("#b3b1ab");
      p.noise(r, c, [shade(c, -8), shade(c, 6)], 0.25);
      const s = shade(c, -22); for (let i = 0; i < 16; i++) { p.set(i, 15, s); p.set(15, i, s); }
      break;
    }
    case T.RUINS: {
      const c = hex("#8f8478");
      p.noise(r, c, [hex("#6e6258"), hex("#a9998a"), hex("#a85d45")], 0.5);
      break;
    }
    case T.TRACK: {
      const c = hex("#b44d3a");
      p.noise(r, c, [shade(c, -10), shade(c, 8)], 0.3);
      p.rect(0, 7, 16, 1, C.white);
      break;
    }
    default:
      p.fill(hex("#ff00ff"));
  }
}

const ROOF = [
  { base: hex("#c79f86"), wall: ["#ead8b8", "#d9b99b", "#f1e6d2", "#d4ad8e"] },   // pisos: terrat de rajola
  { base: hex("#b8532f"), wall: ["#ebcfa6", "#e6c191", "#f0dcc0", "#dcb487"] },   // casa: teula
  { base: hex("#767b8c"), wall: ["#cdbb9b", "#c4b08e", "#d3c3a6", "#bfa985"] },   // església
  { base: hex("#98a2ab"), wall: ["#a85d45", "#9e5640", "#b0664c", "#94503c"] },   // industrial (maó)
  { base: hex("#8ea2b9"), wall: ["#dcd6c8", "#d2cbbb", "#e4dfd3", "#cac2b0"] },   // equipament públic
  { base: hex("#c3c1bb"), wall: ["#bcc6cf", "#b0bcc6", "#c7d0d7", "#a9b5c0"] },   // comercial
];
const SHADES = [-12, 0, 10, -5];

function paintRoof(p, type, s, v, r) {
  const c = shade(ROOF[type].base, SHADES[s]);
  switch (type) {
    case 0: { // rajola de terrat
      const g = shade(c, -18);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, (x % 4 === 3 || y % 4 === 3) ? g : (r() < 0.15 ? shade(c, 7) : c));
      if (v === 1) { p.rect(3, 3, 6, 5, hex("#e8e8e8")); p.rect(3, 8, 6, 1, hex("#9a9a9a")); } // dipòsit / caseta
      if (v === 2) { p.rect(10, 9, 3, 3, hex("#5a5e66")); }                                     // xemeneia
      break;
    }
    case 1: { // teula àrab
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const k = (x + ((y >> 2) & 1) * 2) % 4;
        p.set(x, y, y % 4 === 3 ? shade(c, -35) : k === 0 ? shade(c, -15) : k === 2 ? shade(c, 15) : c);
      }
      break;
    }
    case 2: // pissarra
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, y % 3 === 2 ? shade(c, -25) : ((x + (y / 3 | 0) * 2) % 5 === 0 ? shade(c, -12) : c));
      break;
    case 3: // xapa ondulada
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, x % 3 === 0 ? shade(c, -20) : x % 3 === 1 ? shade(c, 12) : c);
      break;
    case 4:
      p.noise(r, c, [shade(c, -6), shade(c, 6)], 0.2);
      for (let i = 0; i < 16; i++) { p.set(i, 7, shade(c, -18)); p.set(7, i, shade(c, -18)); }
      break;
    case 5:
      p.noise(r, c, [shade(c, -6), shade(c, 6)], 0.2);
      if (v === 0) { p.rect(4, 4, 7, 6, hex("#e4e4e4")); p.rect(5, 5, 5, 4, hex("#8a8f97")); p.rect(7, 6, 1, 2, hex("#e4e4e4")); }
      break;
  }
}

function paintFacade(p, type, s, v, r) {
  const wall = shade(hex(ROOF[type].wall[s]), 0);
  p.noise(r, wall, [shade(wall, -8), shade(wall, 6)], 0.18);
  p.rect(0, 0, 16, 2, shade(wall, -40)); // cornisa
  p.rect(0, 2, 16, 1, shade(wall, -18));
  const glass = hex("#2d3a50"), glassHi = hex("#5b7192"), frame = shade(wall, 30);
  if (type === 3) { // finestral industrial
    p.rect(2, 4, 12, 8, frame); p.rect(3, 5, 10, 6, glass);
    p.rect(7, 5, 1, 6, frame); p.rect(3, 8, 10, 1, frame); p.set(4, 6, glassHi);
    p.rect(0, 13, 16, 1, shade(wall, -20));
    return;
  }
  if (v === 0) { // porta
    p.rect(4, 5, 8, 11, shade(wall, -30)); p.rect(5, 6, 6, 10, hex("#6b4226"));
    p.rect(5, 6, 6, 1, hex("#8a5a35")); p.set(9, 11, hex("#e7c35a"));
    return;
  }
  if (type === 2) { // vitrall
    p.rect(6, 4, 4, 9, shade(wall, -30)); p.rect(7, 5, 2, 7, hex("#7f5fb0")); p.set(7, 6, hex("#e3b341")); p.set(8, 9, hex("#d14b4b"));
    return;
  }
  // balcó amb persianes verdes, molt de Barcelona
  p.rect(5, 4, 6, 9, frame); p.rect(6, 5, 4, 7, glass); p.set(6, 5, glassHi); p.set(7, 6, glassHi);
  if (type !== 5) {
    const persiana = v === 1 ? hex("#3f6f45") : v === 2 ? hex("#3f6f45") : hex("#6f8f5a");
    p.rect(3, 4, 2, 9, persiana); p.rect(11, 4, 2, 9, persiana);
    for (let y = 5; y < 13; y += 2) { p.set(3, y, shade(persiana, -25)); p.set(4, y, shade(persiana, -25)); p.set(11, y, shade(persiana, -25)); p.set(12, y, shade(persiana, -25)); }
  }
  p.rect(3, 12, 10, 1, hex("#2c2c34")); // barana
  for (let x = 3; x < 13; x += 2) p.set(x, 13, hex("#2c2c34"));
  p.rect(3, 14, 10, 1, shade(wall, -25));
}

const tileCache = new Map();
function getTile(kind, id, v) {
  const key = kind + ":" + id + ":" + v;
  let cv = tileCache.get(key);
  if (cv) return cv;
  const p = new Pix(TS, TS);
  const r = rng(hash2(id * 31 + 7, v * 131 + (kind === "f" ? 999 : kind === "r" ? 555 : 1)));
  if (kind === "g") paintGround(p, id, v, r);
  else {
    const b = id - BUILDING_BASE, type = (b / 4) | 0, s = b % 4;
    if (kind === "r") paintRoof(p, type, s, v, r);
    else paintFacade(p, type, s, v, r);
  }
  cv = p.toCanvas();
  tileCache.set(key, cv);
  return cv;
}

// ---------------------------------------------------------------------------
// Sprites
const OUTLINE = hex("#1a1420");

// Aspecte de l'avatar (personalitzable des del panell "Avatar")
const LOOK_KEY = "santandreu-rpg-look";
const DEFAULT_LOOK = {
  name: "Jugador", skin: "#f1c27d", hair: "#4a2b1a", hairStyle: "short", shirt: "#c0392b",
  bottom: "pants", pants: "#2c3e70", shoes: "#3b2a20", extra: "none", extraColor: "#2b6cb0",
};

function makeHero(dir, f, look = DEFAULT_LOOK) {
  const p = new Pix(16, 24);
  const skin = hex(look.skin), hair = hex(look.hair), shirt = hex(look.shirt), shirtD = shade(shirt, -40);
  const pants = hex(look.pants), shoe = hex(look.shoes), eye = hex("#1b1b2a"), extra = hex(look.extraColor);
  const style = look.hairStyle;
  const lift = [0, 1, 0, 2][f];
  if (dir === "down" || dir === "up") {
    const ll = lift === 1 ? 1 : 0, rl = lift === 2 ? 1 : 0;
    // cames: amb pantalons, pantaló curt o faldilla es veu més o menys pell
    p.rect(5, 17, 3, 4 - ll, skin); p.rect(8, 17, 3, 4 - rl, skin);
    if (look.bottom === "pants") { p.rect(5, 17, 3, 4 - ll, pants); p.rect(8, 17, 3, 4 - rl, pants); }
    if (look.bottom === "shorts") { p.rect(5, 17, 3, 2, pants); p.rect(8, 17, 3, 2, pants); }
    p.rect(5, 21 - ll, 3, 2, shoe); p.rect(8, 21 - rl, 3, 2, shoe);
    p.rect(4, 11, 8, 6, shirt); p.rect(4, 16, 8, 1, shirtD);
    if (look.bottom === "skirt") { p.rect(4, 16, 8, 2, pants); p.rect(3, 18, 10, 1, pants); }
    const la = lift === 1 ? 1 : 0, ra = lift === 2 ? 1 : 0;
    p.rect(3, 11 + la, 1, 5, shirt); p.set(3, 16 + la, skin);
    p.rect(12, 11 + ra, 1, 5, shirt); p.set(12, 16 + ra, skin);
    p.rect(4, 3, 8, 8, skin);
    if (dir === "down") {
      if (style === "long") { p.rect(4, 2, 8, 3, hair); p.rect(3, 4, 2, 9, hair); p.rect(11, 4, 2, 9, hair); }
      else if (style === "afro") { p.rect(3, 0, 10, 5, hair); p.rect(2, 2, 12, 3, hair); p.rect(3, 5, 1, 4, hair); p.rect(12, 5, 1, 4, hair); }
      else if (style !== "bald") { p.rect(4, 2, 8, 3, hair); p.rect(4, 5, 1, 2, hair); p.rect(11, 5, 1, 2, hair); }
      if (style === "ponytail") { p.rect(12, 3, 2, 2, hair); }
      p.set(6, 7, eye); p.set(9, 7, eye); p.rect(7, 9, 2, 1, shade(skin, -30));
      p.rect(6, 11, 4, 1, shade(shirt, 50)); // coll
      if (look.extra === "glasses") { p.rect(5, 6, 2, 2, eye); p.rect(9, 6, 2, 2, eye); p.rect(7, 6, 2, 1, eye); p.set(5, 6, hex("#9fd3ff")); p.set(9, 6, hex("#9fd3ff")); }
      if (look.extra === "cap") { p.rect(4, 1, 8, 3, extra); p.rect(3, 4, 10, 1, shade(extra, -45)); }
    } else {
      if (style === "long") { p.rect(4, 2, 8, 8, hair); p.rect(3, 4, 10, 9, hair); }
      else if (style === "afro") { p.rect(3, 0, 10, 10, hair); p.rect(2, 2, 12, 6, hair); }
      else if (style !== "bald") p.rect(4, 2, 8, 8, hair);
      else p.rect(4, 3, 8, 8, shade(skin, -8));
      if (style === "ponytail") p.rect(7, 10, 2, 4, hair);
      p.rect(5, 10, 6, 1, shade(skin, -15));
      if (look.extra === "cap") p.rect(4, 1, 8, 4, extra);
    }
  } else {
    const front = lift === 1 ? 2 : lift === 2 ? -1 : 0;
    const legA = look.bottom === "pants" ? pants : skin, legB = look.bottom === "pants" ? shade(pants, -15) : shade(skin, -15);
    p.rect(6, 17, 3, 4, legA); p.rect(6 + front, 20, 3, 3, shoe); p.rect(6 + front, 19, 3, 1, legA);
    p.rect(8 - front, 17, 2, 4, legB); p.rect(8 - front, 21, 2, 2, shoe);
    if (look.bottom === "shorts") p.rect(6, 17, 4, 2, pants);
    p.rect(5, 11, 6, 6, shirt); p.rect(5, 16, 6, 1, shirtD);
    if (look.bottom === "skirt") { p.rect(5, 16, 6, 2, pants); p.rect(4, 18, 8, 1, pants); }
    const arm = 7 + (lift === 1 ? 1 : lift === 2 ? -1 : 0);
    p.rect(arm, 12, 2, 4, shirtD); p.set(arm, 16, skin);
    p.rect(4, 3, 8, 8, skin); p.set(12, 7, skin);
    if (style === "long") { p.rect(4, 2, 8, 3, hair); p.rect(3, 4, 4, 9, hair); }
    else if (style === "afro") { p.rect(3, 0, 10, 5, hair); p.rect(2, 2, 6, 7, hair); }
    else if (style !== "bald") { p.rect(4, 2, 8, 3, hair); p.rect(4, 5, 3, 4, hair); }
    if (style === "ponytail") p.rect(2, 4, 2, 5, hair);
    p.set(10, 7, eye);
    if (look.extra === "glasses") { p.rect(9, 6, 3, 2, eye); p.set(10, 6, hex("#9fd3ff")); p.rect(6, 6, 3, 1, eye); }
    if (look.extra === "cap") { p.rect(4, 1, 8, 3, extra); p.rect(11, 4, 3, 1, shade(extra, -45)); }
    if (dir === "left") { // mirall
      const q = new Pix(16, 24);
      for (let y = 0; y < 24; y++) for (let x = 0; x < 16; x++) q.set(15 - x, y, p.get(x, y));
      q.outline(OUTLINE);
      return q.toCanvas();
    }
  }
  p.outline(OUTLINE);
  return p.toCanvas();
}

const DIRS = ["down", "up", "left", "right"];
const makeHeroSet = (look) => Object.fromEntries(DIRS.map((d) => [d, [0, 1, 2, 3].map((f) => makeHero(d, f, look))]));

function makeTree(round, seed) {
  const p = new Pix(26, 30), r = rng(seed);
  const trunk = hex("#6b4426");
  if (round) { // plàtan
    p.rect(12, 18, 3, 11, trunk); p.rect(12, 18, 1, 11, shade(trunk, 25));
    const base = hex("#4e9a45"), light = hex("#78c160"), dark = hex("#2f6e35");
    for (let y = 0; y < 22; y++) for (let x = 0; x < 26; x++) {
      const dx = x - 13, dy = y - 10, d = Math.sqrt(dx * dx + dy * dy * 1.15) + r() * 1.6;
      if (d < 10.5) p.set(x, y, (dx + dy < -6 && r() < 0.8) ? light : (dx + dy > 5 && r() < 0.8) ? dark : (r() < 0.12 ? dark : base));
    }
  } else { // pi
    p.rect(12, 12, 2, 17, trunk); p.rect(12, 12, 1, 17, shade(trunk, 25));
    const base = hex("#2f7040"), light = hex("#4e955a"), dark = hex("#1e4d2d");
    for (let y = 0; y < 16; y++) for (let x = 0; x < 26; x++) {
      const dx = (x - 13) / 12, dy = (y - 7) / 6.5, d = dx * dx + dy * dy + r() * 0.15;
      if (d < 1) p.set(x, y, dy < -0.3 && r() < 0.7 ? light : dy > 0.4 ? dark : base);
    }
  }
  p.outline(OUTLINE);
  return p.toCanvas();
}

function makeLamp() {
  const p = new Pix(8, 28);
  p.rect(3, 6, 2, 22, hex("#2b2f3a")); p.rect(2, 26, 4, 2, hex("#2b2f3a"));
  p.rect(1, 2, 6, 4, hex("#2b2f3a")); p.rect(2, 3, 4, 2, hex("#ffe9a0"));
  p.outline(OUTLINE);
  return p.toCanvas();
}
function makeBench() {
  const p = new Pix(16, 12), w = hex("#9a6532");
  p.rect(1, 2, 14, 2, w); p.rect(1, 5, 14, 2, shade(w, -20)); p.rect(1, 8, 14, 1, shade(w, 15));
  p.rect(2, 9, 1, 3, hex("#2b2f3a")); p.rect(13, 9, 1, 3, hex("#2b2f3a"));
  p.outline(OUTLINE);
  return p.toCanvas();
}
function makeFountain() {
  const p = new Pix(16, 18), st = hex("#9aa0a6");
  for (let y = 0; y < 18; y++) for (let x = 0; x < 16; x++) {
    const dx = (x - 7.5) / 7.5, dy = (y - 11) / 6;
    if (dx * dx + dy * dy < 1) p.set(x, y, st);
    if (dx * dx + dy * dy < 0.55) p.set(x, y, hex("#5ab0e0"));
  }
  p.rect(7, 2, 2, 9, hex("#7d8389")); p.rect(6, 1, 4, 2, hex("#bfe6ff"));
  p.outline(OUTLINE);
  return p.toCanvas();
}

// ---------------------------------------------------------------------------
// Estat
const state = {
  W: 0, H: 0, ground: null, decor: null, meta: null,
  zoomIdx: 3, cam: { x: 0, y: 0 }, follow: true,
  player: { x: 0, y: 0, dir: "down", frame: 0, anim: 0, moving: false },
  keys: new Set(), noclip: false, showLabels: true, showMinimap: true, look: loadLook(), editing: false, chatting: false, bubble: null,
  joy: { active: false, x: 0, y: 0 }, touchRun: false,
  labels: [], segs: [], chunks: new Map(), sprites: {},
};

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let dpr = 1;

function resize() {
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
}

const g = (x, y) => (x < 0 || y < 0 || x >= state.W || y >= state.H) ? 255 : state.ground[y * state.W + x];
const dec = (x, y) => (x < 0 || y < 0 || x >= state.W || y >= state.H) ? 0 : state.decor[y * state.W + x];
const isBuilding = (v) => (v & 127) >= BUILDING_BASE && v !== 255;

function blocked(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= state.W || ty >= state.H) return true;
  if (state.noclip) return false;
  const v = g(tx, ty) & 127;
  if (v >= BUILDING_BASE || v === T.WATER || v === T.POOL) return true;
  const d = dec(tx, ty);
  return d === D.TREE || d === D.TREE2 || d === D.FOUNTAIN;
}

// ---------------------------------------------------------------------------
// Chunks
function renderChunk(cx, cy) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = CHUNK * TS;
  const c = cv.getContext("2d");
  const x0 = cx * CHUNK, y0 = cy * CHUNK;
  for (let ty = y0; ty < y0 + CHUNK; ty++) for (let tx = x0; tx < x0 + CHUNK; tx++) {
    if (tx >= state.W || ty >= state.H) continue;
    const raw = g(tx, ty), v = raw & 127, outside = raw & OUTSIDE;
    const px = (tx - x0) * TS, py = (ty - y0) * TS;
    const hv = hash2(tx, ty);
    if (v >= BUILDING_BASE) {
      const below = g(tx, ty + 1);
      if (!isBuilding(below)) {
        c.drawImage(getTile("f", v, hv % 4), px, py);
      } else {
        c.drawImage(getTile("r", v, (hv % 17) < 3 ? (hv % 3) : 3), px, py);
        const up = g(tx, ty - 1), lf = g(tx - 1, ty), rt = g(tx + 1, ty);
        // Parapets: separen edificis i donen relleu
        if ((up & 127) !== v) { c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(px, py, TS, 2); }
        if ((lf & 127) !== v) { c.fillStyle = "rgba(255,255,255,.22)"; c.fillRect(px, py, 2, TS); }
        if ((rt & 127) !== v) { c.fillStyle = "rgba(0,0,0,.28)"; c.fillRect(px + TS - 2, py, 2, TS); }
        if (!isBuilding(g(tx, ty + 2)) && (below & 127) === v) { c.fillStyle = "rgba(0,0,0,.18)"; c.fillRect(px, py + TS - 2, TS, 2); }
      }
    } else {
      let variant = hv % 4;
      if (v === T.PITCH) variant = (tx >> 1) & 1;
      if (v === T.ROAD_LINE) variant = 0;
      c.drawImage(getTile("g", v, variant), px, py);
      // vorada entre calçada i vorera
      if (ROADISH.has(v)) {
        c.fillStyle = "#c9c5b8";
        if (!ROADISH.has(g(tx, ty - 1) & 127)) c.fillRect(px, py, TS, 2);
        if (!ROADISH.has(g(tx, ty + 1) & 127)) c.fillRect(px, py + TS - 2, TS, 2);
        if (!ROADISH.has(g(tx - 1, ty) & 127)) c.fillRect(px, py, 2, TS);
        if (!ROADISH.has(g(tx + 1, ty) & 127)) c.fillRect(px + TS - 2, py, 2, TS);
      }
      // ombres dels edificis (llum des de dalt a l'esquerra)
      c.fillStyle = "rgba(20,15,40,.28)";
      if (isBuilding(g(tx, ty - 1))) c.fillRect(px, py, TS, 5);
      if (isBuilding(g(tx - 1, ty))) c.fillRect(px, py, 4, TS);
    }
    if (outside) { c.fillStyle = "rgba(24,20,48,.42)"; c.fillRect(px, py, TS, TS); }
  }
  return cv;
}

function getChunk(cx, cy) {
  const key = cx + "," + cy;
  let cv = state.chunks.get(key);
  if (cv) { state.chunks.delete(key); state.chunks.set(key, cv); return cv; }
  cv = renderChunk(cx, cy);
  state.chunks.set(key, cv);
  if (state.chunks.size > CHUNK_CACHE) state.chunks.delete(state.chunks.keys().next().value);
  return cv;
}

// ---------------------------------------------------------------------------
// Carrers i rètols
function buildLabels() {
  const { streets, places } = state.meta;
  for (const s of streets) {
    for (const line of s.lines) {
      for (let i = 0; i < line.length - 1; i++) state.segs.push([line[i][0], line[i][1], line[i + 1][0], line[i + 1][1], s.name]);
      // un rètol cada ~60 tiles de carrer
      let acc = 30;
      for (let i = 0; i < line.length - 1; i++) {
        const [x0, y0] = line[i], [x1, y1] = line[i + 1];
        const L = Math.hypot(x1 - x0, y1 - y0);
        while (acc <= L) {
          const t = acc / L;
          state.labels.push({ text: s.name, x: x0 + t * (x1 - x0), y: y0 + t * (y1 - y0), kind: "street" });
          acc += 60;
        }
        acc -= L;
      }
    }
  }
  const important = new Set(["plaza", "park", "marketplace", "place_of_worship", "library", "arts_centre", "community_centre", "station", "historic", "townhall", "theatre"]);
  for (const p of places) if (important.has(p.kind)) state.labels.push({ text: p.name, x: p.x, y: p.y, kind: "place" });
}

function nearestStreet(x, y) {
  let best = null, bd = 9 * 9;
  for (const [x0, y0, x1, y1, name] of state.segs) {
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L2));
    const ex = x - x0 - t * dx, ey = y - y0 - t * dy, d = ex * ex + ey * ey;
    if (d < bd) { bd = d; best = name; }
  }
  return best;
}
function nearestPlace(x, y) {
  let best = null, bd = 25 * 25;
  for (const p of state.meta.places) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Minimapa
const mm = document.getElementById("minimap");
const mmCtx = mm.getContext("2d");
let mmBase = null, mmScale = 1;
const MM_COLORS = {
  [T.GROUND]: "#cdbd98", [T.GRASS]: "#6aa84f", [T.PARK]: "#5f9d47", [T.ROAD]: "#4b4d57", [T.ROAD_LINE]: "#4b4d57",
  [T.SIDEWALK]: "#b8b4aa", [T.PLAZA]: "#d9c7a2", [T.CYCLEWAY]: "#8c4f44", [T.STEPS]: "#a9a49a", [T.CROSSWALK]: "#8a8a8a",
  [T.WATER]: "#3b7dd8", [T.RAIL]: "#6e5a48", [T.SAND]: "#e3cf98", [T.PITCH]: "#4f9c45", [T.PARKING]: "#5a5c66",
  [T.GRAVEL]: "#a89d88", [T.PLAYGROUND]: "#c4573e", [T.POOL]: "#5cc3e6", [T.DIRT]: "#a7845d", [T.FOREST]: "#3d7a3c",
  [T.SCHOOLYARD]: "#d2a679", [T.CONCRETE]: "#b3b1ab", [T.RUINS]: "#8f8478", [T.TRACK]: "#b44d3a",
};
function buildMinimap() {
  const { W, H } = state;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d"), img = c.createImageData(W, H);
  const lut = [];
  for (let v = 0; v < 256; v++) {
    const id = v & 127;
    let col = id >= BUILDING_BASE ? ROOF[((id - BUILDING_BASE) / 4) | 0]?.base ?? [128, 128, 128] : hex(MM_COLORS[id] || "#ff00ff");
    if (id >= BUILDING_BASE) col = shade(col, -10);
    if (v & OUTSIDE) col = col.map((k) => k * 0.55 + 10);
    lut[v] = col;
  }
  for (let i = 0; i < W * H; i++) {
    const col = lut[state.ground[i]];
    img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  mmBase = cv;
  const maxH = Math.min(300, innerHeight * 0.42);
  mmScale = maxH / H;
  mm.width = Math.round(W * mmScale); mm.height = Math.round(H * mmScale);
}
function drawMinimap() {
  if (!state.showMinimap) return;
  mmCtx.imageSmoothingEnabled = true;
  mmCtx.drawImage(mmBase, 0, 0, mm.width, mm.height);
  const z = ZOOMS[state.zoomIdx];
  const vw = canvas.width / dpr / z / TS, vh = canvas.height / dpr / z / TS;
  mmCtx.strokeStyle = "#ffd35a"; mmCtx.lineWidth = 1;
  mmCtx.strokeRect(state.cam.x / TS * mmScale + .5, state.cam.y / TS * mmScale + .5, vw * mmScale, vh * mmScale);
  const px = state.player.x / TS * mmScale, py = state.player.y / TS * mmScale;
  for (const o of net.others.values()) {
    const ox = o.x / TS * mmScale, oy = o.y / TS * mmScale;
    mmCtx.fillStyle = "#1a1420"; mmCtx.fillRect(ox - 2.5, oy - 2.5, 5, 5);
    mmCtx.fillStyle = "#5fb3ff"; mmCtx.fillRect(ox - 1.5, oy - 1.5, 3, 3);
  }
  drawNpcMinimap(mmCtx, mmScale);
  mmCtx.fillStyle = "#1a1420"; mmCtx.fillRect(px - 3, py - 3, 6, 6);
  mmCtx.fillStyle = "#ff4d4d"; mmCtx.fillRect(px - 2, py - 2, 4, 4);
}

// ---------------------------------------------------------------------------
// Joc
function findWalkable(tx, ty) {
  for (let r = 0; r < 60; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = tx + dx, y = ty + dy;
    if (!blocked(x, y) && !blocked(x - 1, y) && !blocked(x + 1, y)) return [x, y];
  }
  return [tx, ty];
}
function placePlayer(tx, ty) {
  const [x, y] = findWalkable(Math.round(tx), Math.round(ty));
  state.player.x = x * TS + TS / 2;
  state.player.y = y * TS + TS - 2;
  state.follow = true;
}

const HB = { w: 10, h: 6 }; // caixa de col·lisió als peus
function collides(x, y) {
  const x0 = Math.floor((x - HB.w / 2) / TS), x1 = Math.floor((x + HB.w / 2 - 1) / TS);
  const y0 = Math.floor((y - HB.h) / TS), y1 = Math.floor((y - 1) / TS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (blocked(tx, ty)) return true;
  return false;
}

function update(dt) {
  const frozen = state.editing || state.chatting || npcs.dead;
  const k = frozen ? new Set() : state.keys, pl = state.player;
  let dx = 0, dy = 0;
  if (k.has("ArrowLeft") || k.has("KeyA")) dx -= 1;
  if (k.has("ArrowRight") || k.has("KeyD")) dx += 1;
  if (k.has("ArrowUp") || k.has("KeyW")) dy -= 1;
  if (k.has("ArrowDown") || k.has("KeyS")) dy += 1;
  if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
  // joystick tàctil (analògic)
  const joy = state.joy;
  if (!frozen && joy.active && Math.hypot(joy.x, joy.y) > 0.2) { dx = joy.x; dy = joy.y; }
  pl.moving = dx !== 0 || dy !== 0;
  if (pl.moving) {
    state.follow = true;
    const running = k.has("ShiftLeft") || k.has("ShiftRight") || state.touchRun;
    const speed = (running ? 210 : 90) * (state.noclip ? 2 : 1);
    const mx = dx * speed * dt, my = dy * speed * dt;
    if (!collides(pl.x + mx, pl.y)) pl.x += mx;
    if (!collides(pl.x, pl.y + my)) pl.y += my;
    pl.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    pl.anim += dt * (speed > 100 ? 14 : 8);
    pl.frame = Math.floor(pl.anim) % 4;
  } else {
    pl.frame = 0;
  }
  // càmera
  const z = ZOOMS[state.zoomIdx];
  const vw = canvas.width / dpr / z, vh = canvas.height / dpr / z;
  if (state.follow) {
    const tx = pl.x - vw / 2, ty = pl.y - vh / 2;
    const a = 1 - Math.pow(0.0005, dt);
    state.cam.x += (tx - state.cam.x) * a;
    state.cam.y += (ty - state.cam.y) * a;
  }
  const mw = state.W * TS, mh = state.H * TS;
  state.cam.x = vw > mw ? (mw - vw) / 2 : Math.max(0, Math.min(mw - vw, state.cam.x));
  state.cam.y = vh > mh ? (mh - vh) / 2 : Math.max(0, Math.min(mh - vh, state.cam.y));
}

function draw() {
  const z = ZOOMS[state.zoomIdx] * dpr;
  const W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#10121f";
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  const ox = Math.round(state.cam.x * z), oy = Math.round(state.cam.y * z);
  ctx.setTransform(z, 0, 0, z, -ox, -oy);
  const camX = ox / z, camY = oy / z, vw = W / z, vh = H / z;

  // terra
  const csz = CHUNK * TS;
  for (let cy = Math.floor(camY / csz); cy <= Math.floor((camY + vh) / csz); cy++)
    for (let cx = Math.floor(camX / csz); cx <= Math.floor((camX + vw) / csz); cx++) {
      if (cx < 0 || cy < 0 || cx * CHUNK >= state.W || cy * CHUNK >= state.H) continue;
      ctx.drawImage(getChunk(cx, cy), cx * csz, cy * csz);
    }

  // límit del barri
  ctx.save();
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,211,90,.85)"; ctx.setLineDash([8, 6]);
  ctx.beginPath();
  for (const ring of state.meta.boundary) ring.forEach(([x, y], i) => i ? ctx.lineTo(x * TS, y * TS) : ctx.moveTo(x * TS, y * TS));
  ctx.stroke();
  ctx.restore();

  // objectes ordenats per profunditat
  const S = state.sprites, list = [];
  const tx0 = Math.max(0, Math.floor(camX / TS) - 1), tx1 = Math.min(state.W - 1, Math.ceil((camX + vw) / TS) + 1);
  const ty0 = Math.max(0, Math.floor(camY / TS) - 1), ty1 = Math.min(state.H - 1, Math.ceil((camY + vh) / TS) + 2);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const d = state.decor[ty * state.W + tx];
    if (!d) continue;
    const bx = tx * TS + TS / 2, by = ty * TS + TS;
    let img;
    if (d === D.TREE) img = S.trees[hash2(tx, ty) % S.trees.length];
    else if (d === D.TREE2) img = S.pines[hash2(tx, ty) % S.pines.length];
    else if (d === D.LAMP) img = S.lamp;
    else if (d === D.BENCH) img = S.bench;
    else if (d === D.FOUNTAIN) img = S.fountain;
    list.push([by, img, bx - img.width / 2, by - img.height + (d === D.BENCH ? -2 : 0), d === D.TREE || d === D.TREE2]);
  }
  const pl = state.player;
  // L'avatar manté sempre la mateixa mida en pantalla, independentment del zoom
  const k = HERO_SCREEN_SCALE / ZOOMS[state.zoomIdx];
  list.push([pl.y, S.hero[pl.dir][pl.frame], Math.round(pl.x) - 8 * k, Math.round(pl.y) - 23 * k, false, k]);
  for (const o of net.others.values()) {
    if (o.x < camX - 64 || o.x > camX + vw + 64 || o.y < camY - 64 || o.y > camY + vh + 96) continue;
    list.push([o.y, o.sprites[o.dir][o.frame], Math.round(o.x) - 8 * k, Math.round(o.y) - 23 * k, false, k]);
  }
  pushNpcSprites(list, camX, camY, vw, vh, k);
  pushPoiSprites(list, camX, camY, vw, vh, k);
  list.sort((a, b) => a[0] - b[0]);
  for (const [, img, x, y, shadow, hero] of list) {
    const s = hero || 1;
    if (shadow || hero) {
      ctx.fillStyle = "rgba(20,15,40,.3)";
      ctx.beginPath();
      ctx.ellipse(x + img.width * s / 2, y + (img.height - 1) * s, (hero ? 6 : 8) * s, (hero ? 2.5 : 3.5) * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.drawImage(img, x, y, img.width * s, img.height * s);
  }

  // rètols (en espai de pantalla, nítids)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (state.showLabels) drawLabels(camX, camY, z);
  drawPoiNames(camX, camY, z); // abans dels noms dels avatars, que han de quedar per sobre
  drawPlayerName(camX, camY, z);
  drawNpcOverlay(camX, camY, z);
}

function drawPlayerName(camX, camY, z) {
  for (const o of net.others.values()) {
    drawNameTag(o.look.name, o.x, o.y, camX, camY, z, "#9fd3ff");
    drawBubble(o.bubble, o.x, o.y, camX, camY, z);
  }
  drawNameTag(state.look.name, state.player.x, state.player.y, camX, camY, z, "#ffffff");
  drawBubble(state.bubble, state.player.x, state.player.y, camX, camY, z);
}

// Bombolla de diàleg sobre l'avatar (per sobre de l'etiqueta del nom)
const bubbleFor = (text) => ({ text, ttl: 5 + text.length * 0.15 });
function tickBubbles(dt) {
  if (state.bubble && (state.bubble.ttl -= dt) <= 0) state.bubble = null;
  for (const o of net.others.values()) if (o.bubble && (o.bubble.ttl -= dt) <= 0) o.bubble = null;
}
function drawBubble(b, x, y, camX, camY, z) {
  if (!b) return;
  const fs = Math.round(8 * dpr);
  ctx.font = `${fs}px "Press Start 2P", monospace`;
  ctx.textBaseline = "middle";
  const pad = 6 * dpr, tail = 5 * dpr, bw = 2 * dpr;
  const w = Math.ceil(ctx.measureText(b.text).width) + pad * 2, h = fs + pad * 2;
  const sx = Math.round((x - camX) * z);
  const bottom = Math.round((y - camY) * z - (HERO_SCREEN_SCALE * 24 + 10) * dpr - fs / 2 - 4 * dpr - 6 * dpr);
  const left = Math.round(sx - w / 2), top = bottom - tail - h;
  ctx.save();
  ctx.globalAlpha = Math.min(1, b.ttl / 0.4);
  ctx.fillStyle = "#1a1420";
  ctx.fillRect(left - bw, top - bw, w + bw * 2, h + bw * 2);
  ctx.beginPath();
  ctx.moveTo(sx - tail - bw, top + h); ctx.lineTo(sx, bottom + bw); ctx.lineTo(sx + tail + bw, top + h);
  ctx.fill();
  ctx.fillStyle = "#fbf7ea";
  ctx.fillRect(left, top, w, h);
  ctx.beginPath();
  ctx.moveTo(sx - tail, top + h - 1); ctx.lineTo(sx, bottom - bw / 2); ctx.lineTo(sx + tail, top + h - 1);
  ctx.fill();
  ctx.fillStyle = "#1d2142";
  ctx.fillText(b.text, left + pad, top + h / 2 + dpr);
  ctx.restore();
}

// Xat: Enter obre la caixa, Enter envia, Esc tanca
const CHAT_MAX = 30;
const chatBox = document.getElementById("chat"), chatInput = document.getElementById("chat-input");
function toggleChat(open = !state.chatting) {
  state.chatting = open;
  state.keys.clear();
  chatBox.classList.toggle("hidden", !open);
  if (open) { chatInput.value = ""; updateChatCount(); chatInput.focus(); }
  else chatInput.blur();
}
function updateChatCount() {
  document.getElementById("chat-count").textContent = `${chatInput.value.length}/${CHAT_MAX}`;
}
function sendChat() {
  const text = chatInput.value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, CHAT_MAX);
  if (text) {
    state.bubble = bubbleFor(text);
    net.send({ t: "say", text });
    logChat(state.look.name, text, true);
  }
  toggleChat(false);
}
// Historial curt dels últims missatges (per veure qui parla encara que sigui lluny)
const chatLog = document.getElementById("chat-log");
function logChat(name, text, mine) {
  const row = document.createElement("div");
  row.className = "msg" + (mine ? " mine" : "");
  const who = document.createElement("b");
  who.textContent = (name.trim() || "Jugador") + ": ";
  row.append(who, document.createTextNode(text));
  chatLog.appendChild(row);
  while (chatLog.children.length > 5) chatLog.firstChild.remove();
  setTimeout(() => row.classList.add("old"), 20000);
  setTimeout(() => row.remove(), 21000);
}

function bindChat() {
  chatBox.addEventListener("submit", (e) => { e.preventDefault(); sendChat(); });
  chatInput.addEventListener("input", updateChatCount);
  chatInput.addEventListener("keydown", (e) => { if (e.key === "Escape") toggleChat(false); });
  chatInput.addEventListener("blur", () => { if (state.chatting) setTimeout(() => state.chatting && toggleChat(false), 150); });
  document.getElementById("chat-btn").addEventListener("click", () => toggleChat(true));
}

function drawNameTag(rawName, x, y, camX, camY, z, color) {
  const name = rawName.trim();
  if (!name) return;
  const pl = { x, y };
  const fs = Math.round(8 * dpr);
  ctx.font = `${fs}px "Press Start 2P", monospace`;
  ctx.textBaseline = "middle";
  const sx = Math.round((pl.x - camX) * z), sy = Math.round((pl.y - camY) * z - (HERO_SCREEN_SCALE * 24 + 10) * dpr);
  const pad = 4 * dpr, w = ctx.measureText(name).width + pad * 2, h = fs + pad * 2;
  ctx.fillStyle = "rgba(11,13,31,.75)";
  ctx.fillRect(sx - w / 2, sy - h / 2, w, h);
  ctx.fillStyle = color;
  ctx.fillText(name, sx - w / 2 + pad, sy + dpr);
}

function drawLabels(camX, camY, z) {
  const fs = Math.round(8 * dpr * (ZOOMS[state.zoomIdx] >= 3 ? 1.25 : 1));
  ctx.font = `${fs}px "Press Start 2P", monospace`;
  ctx.textBaseline = "middle";
  if ("fontVariantLigatures" in ctx) ctx.fontVariantLigatures = "none";
  const placed = [];
  const zoom = ZOOMS[state.zoomIdx];
  const sorted = state.labels.filter((l) => l.kind === "place").concat(zoom >= 1 ? state.labels.filter((l) => l.kind === "street") : []);
  const W = canvas.width, H = canvas.height, pad = 4 * dpr;
  for (const l of sorted) {
    const sx = l.x * TS * z - camX * z, sy = l.y * TS * z - camY * z;
    if (sx < -300 || sy < -40 || sx > W + 300 || sy > H + 40) continue;
    const w = ctx.measureText(l.text).width + pad * 2, h = fs + pad * 2;
    const r = [sx - w / 2, sy - h / 2, w, h];
    if (placed.some((q) => r[0] < q[0] + q[2] + 6 && r[0] + r[2] + 6 > q[0] && r[1] < q[1] + q[3] + 6 && r[1] + r[3] + 6 > q[1])) continue;
    placed.push(r);
    const isPlace = l.kind === "place";
    ctx.fillStyle = "rgba(11,13,31,.55)";
    ctx.fillRect(r[0] + 2 * dpr, r[1] + 2 * dpr, w, h);
    ctx.fillStyle = isPlace ? "#3a2a12" : "#1d2142";
    ctx.fillRect(r[0], r[1], w, h);
    ctx.strokeStyle = isPlace ? "#ffd35a" : "#f4f1e8";
    ctx.lineWidth = dpr;
    ctx.strokeRect(r[0] + .5 * dpr, r[1] + .5 * dpr, w - dpr, h - dpr);
    ctx.fillStyle = isPlace ? "#ffd35a" : "#f4f1e8";
    ctx.fillText(l.text, r[0] + pad, sy + dpr);
  }
}

// ---------------------------------------------------------------------------
// Personalització de l'avatar
function loadLook() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOOK_KEY) || "null");
    if (saved && typeof saved === "object") return { ...DEFAULT_LOOK, ...saved };
  } catch { /* sense emmagatzematge */ }
  return { ...DEFAULT_LOOK };
}
function saveLook() {
  try { localStorage.setItem(LOOK_KEY, JSON.stringify(state.look)); } catch { /* sense emmagatzematge */ }
}

const LOOK_FIELDS = [
  { key: "skin", label: "Pell", colors: ["#ffe0bd", "#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#5c3a1e"] },
  { key: "hairStyle", label: "Pentinat", options: [["short", "Curt"], ["long", "Llarg"], ["ponytail", "Cua"], ["afro", "Arrissat"], ["bald", "Rapat"]] },
  { key: "hair", label: "Cabell", colors: ["#1c1414", "#4a2b1a", "#8b5a2b", "#d6a756", "#f2e3a0", "#b5401f", "#9a9a9a", "#e86fb4", "#3e7be0"] },
  { key: "shirt", label: "Samarreta", colors: ["#c0392b", "#e67e22", "#f1c40f", "#27ae60", "#16a085", "#2980b9", "#8e44ad", "#ecf0f1", "#2c3e50"] },
  { key: "bottom", label: "Part de baix", options: [["pants", "Pantalons"], ["shorts", "Curts"], ["skirt", "Faldilla"]] },
  { key: "pants", label: "Color", colors: ["#2c3e70", "#1f2a44", "#5d6d7e", "#7f5539", "#3d5a40", "#c0392b", "#d4c5a9", "#111111"] },
  { key: "shoes", label: "Sabates", colors: ["#3b2a20", "#111111", "#ecf0f1", "#c0392b", "#2980b9", "#7f5539"] },
  { key: "extra", label: "Complement", options: [["none", "Res"], ["cap", "Gorra"], ["glasses", "Ulleres"]] },
  { key: "extraColor", label: "Color gorra", colors: ["#2b6cb0", "#c0392b", "#27ae60", "#f1c40f", "#111111", "#ecf0f1"], when: (l) => l.extra === "cap" },
];

const avatarPanel = document.getElementById("avatar-panel");
const avatarPreview = document.getElementById("avatar-preview");
let previewSprites = null, previewTimer = null;

function applyLook() {
  state.sprites.hero = makeHeroSet(state.look);
  previewSprites = state.sprites.hero;
  saveLook();
  net.sendLook();
  renderAvatarFields();
}

function renderAvatarFields() {
  const box = document.getElementById("avatar-fields");
  box.textContent = "";
  for (const f of LOOK_FIELDS) {
    if (f.when && !f.when(state.look)) continue;
    const row = document.createElement("div");
    row.className = "field";
    const lab = document.createElement("div");
    lab.className = "label";
    lab.textContent = f.label;
    row.appendChild(lab);
    const opts = document.createElement("div");
    opts.className = f.colors ? "swatches" : "choices";
    for (const o of f.colors || f.options) {
      const value = f.colors ? o : o[0];
      const b = document.createElement("button");
      b.type = "button";
      if (f.colors) { b.style.background = o; b.setAttribute("aria-label", f.label + " " + o); }
      else b.textContent = o[1];
      if (state.look[f.key] === value) b.classList.add("selected");
      b.addEventListener("click", () => { state.look[f.key] = value; applyLook(); });
      opts.appendChild(b);
    }
    row.appendChild(opts);
    box.appendChild(row);
  }
}

function drawPreview(t) {
  const c = avatarPreview.getContext("2d");
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, avatarPreview.width, avatarPreview.height);
  const dir = DIRS[[0, 3, 1, 2][Math.floor(t / 2400) % 4]];
  const img = previewSprites[dir][Math.floor(t / 150) % 4];
  const sc = 6;
  c.fillStyle = "rgba(0,0,0,.3)";
  c.beginPath();
  c.ellipse(avatarPreview.width / 2, avatarPreview.height - 14, 6 * sc, 2.5 * sc, 0, 0, Math.PI * 2);
  c.fill();
  c.drawImage(img, (avatarPreview.width - 16 * sc) / 2, avatarPreview.height - 14 - 23 * sc, 16 * sc, 24 * sc);
}

function toggleAvatarPanel(open = !state.editing) {
  state.editing = open;
  state.keys.clear();
  avatarPanel.classList.toggle("hidden", !open);
  if (open) {
    previewSprites = state.sprites.hero;
    document.getElementById("avatar-name").value = state.look.name;
    renderAvatarFields();
    const tick = (t) => { if (!state.editing) return; drawPreview(t); previewTimer = requestAnimationFrame(tick); };
    previewTimer = requestAnimationFrame(tick);
  } else {
    cancelAnimationFrame(previewTimer);
    document.activeElement?.blur();
  }
}

function bindAvatarPanel() {
  document.getElementById("avatar-btn").addEventListener("click", () => toggleAvatarPanel());
  document.getElementById("avatar-done").addEventListener("click", () => toggleAvatarPanel(false));
  avatarPanel.addEventListener("click", (e) => { if (e.target === avatarPanel) toggleAvatarPanel(false); });
  const nameInput = document.getElementById("avatar-name");
  nameInput.addEventListener("input", () => { state.look.name = nameInput.value.slice(0, 16); saveLook(); net.sendLook(); });
  nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === "Escape") toggleAvatarPanel(false); });
  document.getElementById("avatar-random").addEventListener("click", () => {
    const pick = (a) => a[(Math.random() * a.length) | 0];
    for (const f of LOOK_FIELDS) state.look[f.key] = f.colors ? pick(f.colors) : pick(f.options)[0];
    applyLook();
  });
  document.getElementById("avatar-reset").addEventListener("click", () => {
    state.look = { ...DEFAULT_LOOK, name: state.look.name };
    applyLook();
  });
}

// ---------------------------------------------------------------------------
// Multijugador: WebSocket cap al servidor de Cloudflare (sala única)
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
    return { x: Math.round(pl.x), y: Math.round(pl.y), dir: pl.dir, moving: pl.moving };
  },
  sendLook() {
    clearTimeout(this.lookTimer);
    this.lookTimer = setTimeout(() => this.send({ t: "look", look: state.look }), 300);
  },
  addOther(p) {
    this.others.set(p.id, { ...p, tx: p.x, ty: p.y, anim: 0, frame: 0, sprites: makeHeroSet(p.look) });
  },
  onMessage(m) {
    if (m.t === "welcome") {
      this.id = m.id; this.connected = true; this.others.clear();
      for (const p of m.players) this.addOther(p);
    } else if (m.t === "join") {
      this.addOther(m.p);
    } else if (m.t === "leave") {
      this.others.delete(m.id);
    } else if (m.t === "move") {
      const o = this.others.get(m.id);
      if (o) Object.assign(o, { tx: m.x, ty: m.y, dir: m.dir, moving: m.moving });
    } else if (m.t === "say") {
      const o = this.others.get(m.id);
      const text = String(m.text).slice(0, CHAT_MAX);
      if (o) { o.bubble = bubbleFor(text); logChat(o.look.name, text, false); }
    } else if (m.t === "look") {
      const o = this.others.get(m.id);
      if (o) { o.look = m.look; o.sprites = makeHeroSet(m.look); }
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

const escapeHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// HUD
const hud = document.getElementById("location-text");
let hudTimer = 0, lastHud = "";
function updateHud(dt) {
  hudTimer -= dt;
  if (hudTimer > 0) return;
  hudTimer = 0.15;
  const tx = state.player.x / TS, ty = state.player.y / TS;
  const street = nearestStreet(tx, ty);
  const place = nearestPlace(tx, ty);
  const poi = nearestPoi(tx, ty);
  const placeText = poi ? (poi.name !== poi.label ? `${poi.name} (${poi.label})` : poi.name) : place?.name;
  const inside = !(g(Math.floor(tx), Math.floor(ty)) & OUTSIDE);
  const m = state.meta.metersPerTile;
  const [S, Wl, N, E] = state.meta.bbox;
  const lat = N - (ty / state.H) * (N - S), lon = Wl + (tx / state.W) * (E - Wl);
  const html = `<div class="street">${street ?? (inside ? "Sant Andreu de Palomar" : "Fora del barri")}</div>` +
    `<div class="place">${placeText ? "> " + escapeHtml(placeText) : ""}</div>` +
    `<div class="meta">${inside ? "Sant Andreu de Palomar" : "Fora del barri"} · ${lat.toFixed(5)}, ${lon.toFixed(5)}${state.noclip ? " · FANTASMA" : ""}</div>`;
  if (html !== lastHud) { hud.innerHTML = html; lastHud = html; }
}

const toastEl = document.getElementById("toast");
let toastT;
function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.remove("hidden");
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.add("hidden"), 1600);
}

function updateZoomUi() {
  document.querySelector("#zoom-level span").textContent = "×" + ZOOMS[state.zoomIdx];
  document.getElementById("zoom-out").disabled = state.zoomIdx === 0;
  document.getElementById("zoom-in").disabled = state.zoomIdx === ZOOMS.length - 1;
}

function setZoom(i) {
  i = Math.max(0, Math.min(ZOOMS.length - 1, i));
  if (i === state.zoomIdx) return;
  const oldZ = ZOOMS[state.zoomIdx], newZ = ZOOMS[i];
  const cxw = state.cam.x + canvas.width / dpr / oldZ / 2, cyw = state.cam.y + canvas.height / dpr / oldZ / 2;
  state.zoomIdx = i;
  state.cam.x = cxw - canvas.width / dpr / newZ / 2;
  state.cam.y = cyw - canvas.height / dpr / newZ / 2;
  updateZoomUi();
}

function toggleMinimap(show = !state.showMinimap) {
  state.showMinimap = show;
  document.getElementById("minimap-wrap").classList.toggle("hidden", !show);
  document.getElementById("map-btn").classList.toggle("active", show);
}

// Controls tàctils: joystick virtual + botó de córrer
function bindTouchControls() {
  const isTouch = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
  const enable = () => document.body.classList.add("touch");
  if (isTouch) {
    enable();
    toggleMinimap(false); // a mòbil el minimapa ocupa massa: s'obre amb el botó MAPA
  }
  addEventListener("touchstart", enable, { once: true, passive: true });

  const base = document.getElementById("joystick"), knob = base.querySelector(".knob");
  const joy = state.joy;
  let pid = null;
  const move = (e) => {
    const r = base.getBoundingClientRect(), R = r.width / 2;
    let x = (e.clientX - r.left - R) / (R * 0.75), y = (e.clientY - r.top - R) / (R * 0.75);
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    joy.x = x; joy.y = y;
    knob.style.transform = `translate(${x * R * 0.75}px, ${y * R * 0.75}px)`;
  };
  const release = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    joy.active = false; joy.x = joy.y = 0;
    knob.style.transform = "";
    base.classList.remove("active");
  };
  base.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    pid = e.pointerId;
    try { base.setPointerCapture(pid); } catch { /* alguns navegadors no ho permeten */ }
    joy.active = true;
    base.classList.add("active");
    move(e);
  });
  base.addEventListener("pointermove", (e) => { if (e.pointerId === pid) move(e); });
  base.addEventListener("pointerup", release);
  base.addEventListener("pointercancel", release);

  const run = document.getElementById("run-btn");
  run.addEventListener("click", () => {
    state.touchRun = !state.touchRun;
    run.classList.toggle("active", state.touchRun);
    run.setAttribute("aria-pressed", String(state.touchRun));
  });
  document.getElementById("map-btn").addEventListener("click", () => toggleMinimap());
  document.getElementById("center-btn").addEventListener("click", () => { state.follow = true; });
}

function bindInput() {
  addEventListener("keydown", (e) => {
    // Als camps de text (xat, nom) les tecles han de funcionar normalment, espai inclòs
    if (e.target instanceof HTMLInputElement) return;
    if (npcs.dead) return; // a la pantalla de mort només compta el botó de ressuscitar
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    if (e.code === "Escape" && state.editing) { toggleAvatarPanel(false); return; }
    if (e.code === "KeyP" && !e.repeat) { toggleAvatarPanel(); return; }
    if ((e.key === "Enter" || e.code === "KeyT") && !state.editing && !e.repeat) { e.preventDefault(); toggleChat(true); return; }
    if (state.editing) return;
    state.keys.add(e.code);
    if (e.repeat) return;
    if (e.key === "+" || e.key === "=") setZoom(state.zoomIdx + 1);
    if (e.key === "-" || e.key === "_") setZoom(state.zoomIdx - 1);
    if (e.code === "KeyC") state.follow = true;
    if (e.code === "KeyM") toggleMinimap();
    if (e.code === "KeyL") { state.showLabels = !state.showLabels; toast(state.showLabels ? "Rètols visibles" : "Rètols amagats"); }
    if (e.code === "KeyH") document.getElementById("help").classList.toggle("hidden");
    if (e.code === "KeyN") {
      state.noclip = !state.noclip;
      toast(state.noclip ? "Mode fantasma: travessa edificis" : "Mode normal");
      if (!state.noclip && collides(state.player.x, state.player.y)) placePlayer(state.player.x / TS, state.player.y / TS);
    }
  });
  addEventListener("keyup", (e) => state.keys.delete(e.code));
  addEventListener("blur", () => state.keys.clear());

  document.getElementById("zoom-in").addEventListener("click", () => setZoom(state.zoomIdx + 1));
  document.getElementById("zoom-out").addEventListener("click", () => setZoom(state.zoomIdx - 1));
  updateZoomUi();
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); setZoom(state.zoomIdx + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, cx: state.cam.x, cy: state.cam.y }; canvas.classList.add("dragging"); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const z = ZOOMS[state.zoomIdx];
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) state.follow = false;
    if (!state.follow) { state.cam.x = drag.cx - (e.clientX - drag.x) / z; state.cam.y = drag.cy - (e.clientY - drag.y) / z; }
  });
  const end = () => { drag = null; canvas.classList.remove("dragging"); };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  mm.addEventListener("click", (e) => {
    const r = mm.getBoundingClientRect();
    const tx = (e.clientX - r.left) / r.width * state.W, ty = (e.clientY - r.top) / r.height * state.H;
    placePlayer(tx, ty);
    const z = ZOOMS[state.zoomIdx];
    state.cam.x = state.player.x - canvas.width / dpr / z / 2;
    state.cam.y = state.player.y - canvas.height / dpr / z / 2;
  });
  addEventListener("resize", () => { resize(); buildMinimap(); });
}

async function loadMap() {
  const [bin, meta] = await Promise.all([
    fetch("map.bin?v=" + DATA_VERSION).then((r) => r.body.pipeThrough(new DecompressionStream("deflate"))).then((s) => new Response(s).arrayBuffer()),
    fetch("map.json?v=" + DATA_VERSION).then((r) => r.json()),
  ]);
  const dv = new DataView(bin);
  const W = dv.getUint16(4, true), H = dv.getUint16(6, true);
  state.W = W; state.H = H;
  state.ground = new Uint8Array(bin, 8, W * H);
  state.decor = new Uint8Array(bin, 8 + W * H, W * H);
  state.meta = meta;
}

async function main() {
  resize();
  await loadMap();
  try { await document.fonts.load('8px "Press Start 2P"'); } catch { /* font opcional */ }
  state.sprites = {
    hero: makeHeroSet(state.look),
    trees: [1, 2, 3].map((s) => makeTree(true, s * 977)),
    pines: [1, 2].map((s) => makeTree(false, s * 541)),
    lamp: makeLamp(), bench: makeBench(), fountain: makeFountain(),
  };
  buildLabels();
  buildMinimap();
  placePlayer(...state.meta.start);
  const z = ZOOMS[state.zoomIdx];
  state.cam.x = state.player.x - canvas.width / dpr / z / 2;
  state.cam.y = state.player.y - canvas.height / dpr / z / 2;
  bindInput();
  bindAvatarPanel();
  bindTouchControls();
  bindChat();
  initNPCs(state.meta.graph);
  initPois();
  bindNpcUi();
  net.connect();
  document.getElementById("loading").classList.add("hidden");
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (canvas.width !== Math.floor(innerWidth * (window.devicePixelRatio || 1))) resize();
    update(dt);
    updateNPCs(dt);
    tickBubbles(dt);
    draw();
    drawMinimap();
    updateHud(dt);
    net.update(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.__sa = state; // per depurar
}

main().catch((e) => {
  document.getElementById("loading").textContent = "Error carregant el mapa: " + e.message;
  console.error(e);
});
