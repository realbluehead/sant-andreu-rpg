// Sant Andreu RPG — mapa pixel art de Sant Andreu de Palomar fet amb dades d'OpenStreetMap.
// core.js: el que comparteixen tots els mòduls (configuració, constants, utilitats, estat del joc,
// col·lisions amb el mapa i el registre de sistemes). Els scripts es carreguen en l'ordre
// d'index.html i comparteixen l'àmbit global; el joc arrenca a game.js (main).
"use strict";

const DATA_VERSION = 6; // augmenta-ho quan es regenerin map.bin / map.json

// Paràmetres del joc (velocitats, quantitats de NPCs, danys…): es llegeixen de config.json, que
// s'edita amb l'app d'admin (admin/). Els valors per defecte de cada camp són a admin/schema.json.
const CFG = {};
async function loadConfig() {
  const r = await fetch("config.json?t=" + Date.now(), { cache: "no-store" });
  if (!r.ok) throw new Error("no s'ha pogut llegir config.json");
  Object.assign(CFG, await r.json());
}

const TS = 16;          // píxels per tile
const CHUNK = 32;       // tiles per chunk
const CHUNK_CACHE = 70;
const ZOOMS = [0.5, 1, 2];
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

// Preferències desades al navegador (pot no haver-hi emmagatzematge: mode privat, bloquejat…)
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* sense emmagatzematge */ } },
  getJSON(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } },
  setJSON(key, value) { store.set(key, JSON.stringify(value)); },
};

// És a prop de la part visible del mapa? (marges per als sprites que sobresurten)
const inView = (x, y, camX, camY, vw, vh, margin = 64, below = 96) =>
  x >= camX - margin && x <= camX + vw + margin && y >= camY - margin && y <= camY + vh + below;

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
// Estat
const state = {
  W: 0, H: 0, ground: null, decor: null, meta: null,
  zoomIdx: 2, cam: { x: 0, y: 0 }, follow: true,
  player: { x: 0, y: 0, dir: "down", frame: 0, anim: 0, moving: false },
  keys: new Set(), noclip: false, showLabels: true, showMinimap: true, look: null, editing: false, chatting: false, bubble: null, riding: false,
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
  if (v >= BUILDING_BASE) return true;
  if ((v === T.WATER || v === T.POOL) && state.riding) return true; // amb bici no es pot entrar a l'aigua
  const d = dec(tx, ty);
  return d === D.TREE || d === D.TREE2 || d === D.FOUNTAIN;
}

// ---------------------------------------------------------------------------
// Registre de sistemes: cada mòdul (NPCs, lladres, monedes, boira…) s'hi apunta amb addSystem i
// el bucle de game.js en crida els ganxos. Així, afegir un mòdul nou no obliga a tocar game.js.
// Tots els ganxos són opcionals i es criden en l'ordre en què es carreguen els scripts:
//   init()                                en arrencar, un cop carregats el mapa i la configuració
//   update(dt)                            cada fotograma mentre ets al carrer
//   updateIndoors(dt)                     cada fotograma mentre ets dins d'un local
//   ground(camX, camY, vw, vh)            sobre el terra, abans dels sprites (coordenades del món)
//   sprites(list, camX, camY, vw, vh, k)  afegeix [y, imatge, x, y, ombra, escala, fx] a la llista
//                                         ordenada per profunditat (k: escala; heroScale → mida fixa)
//   light(camX, camY, z, vw, vh)          capes de pantalla per sota dels rètols (llum, clima)
//   overlay(camX, camY, z)                per sobre dels rètols i sota la boira
//   veil()                                cobreix el mapa (coordenades del món): la boira
//   top(camX, camY, z)                    per sobre de tot, fins i tot dels noms
//   minimap(c, scale)                     dibuixa al minimapa (abans dels jugadors)
//   indoorOverlay(room, camX, camY, z)    per sobre de tot dins d'un local
//   on: { nom(dades) }                    escolta esdeveniments del joc llançats amb emit():
//                                         "coin" (n'has recollit una), "deposit" (n), "drink" ({ kind, room })
const systems = [];
function addSystem(sys) { systems.push(sys); }
const runSystems = (hook, ...args) => { for (const s of systems) s[hook]?.(...args); };
const emit = (event, data) => { for (const s of systems) s.on?.[event]?.(data); };
