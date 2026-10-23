// Sis zones temàtiques del barri. Cada zona té el seu estil de tiles, teulades, façanes, arbres,
// rètols i música. Són estils *inspirats* en sagues conegudes (sense personatges, logotips ni
// melodies originals): noms i música són de creació pròpia.
"use strict";

const BASE_THEME = 2; // l'estil de poble "base" (game.js) és el del tema 2

// ---------------------------------------------------------------------------
// Utilitats de dibuix comunes
function speckle(p, r, base, alts, prob) { p.noise(r, base, alts, prob); }
function dots(p, r, n, col) { for (let i = 0; i < n; i++) p.set((r() * 16) | 0, (r() * 16) | 0, col); }
function stamp(p, x, y, rows, col) {
  rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === "#") p.set(x + i, y + j, col); }));
}
const HEART_S = [".#.#.", "#####", ".###.", "..#.."];
const HEART_L = [".##..##.", "########", "########", ".######.", "..####..", "...##..."];
const heart = (p, x, y, col) => stamp(p, x, y, HEART_S, col);
function rivets(p, col, hi) {
  for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]]) { p.set(x, y, col); p.set(x - 1 < 0 ? x : x - 1, y - 1 < 0 ? y : y - 1, hi); }
}
// ---------------------------------------------------------------------------
// 0 · Vila dels Bruixots (inspirat en Harry Potter): pedra fosca, pissarra lila, finestres ogivals
const MAGIC = {
  name: "Vila dels Bruixots", style: "estil Harry Potter", color: "#c9a7ff",
  outline: "#120c1e", curb: "#4a4452",
  tree: { cone: true, base: "#24493d", light: "#356b57", dark: "#16302a", trunk: "#3d2a1e",
    pineBase: "#24493d", pineLight: "#356b57", pineDark: "#16302a" },
  sign: { frame: "#d4af37", inner: "#3a2a12", corner: "#fff2a8" },
  ground(p, id, v, r) {
    if (id === T.GROUND || id === T.GRASS || id === T.PARK || id === T.PITCH) {
      speckle(p, r, hex("#3e6b4a"), [hex("#355d40"), hex("#4a7a55")], 0.35);
      if (v === 1) { p.rect(6, 9, 4, 2, hex("#c0392b")); p.set(7, 9, hex("#f4f1e8")); p.rect(7, 11, 2, 2, hex("#e8dcc0")); } // bolet
      if (v === 3) { p.set(3, 4, hex("#fff6a0")); p.set(12, 10, hex("#fff6a0")); }                                          // cuques de llum
      return true;
    }
    if (id === T.SIDEWALK || id === T.SCHOOLYARD) { slabs(p, r, hex("#7a6f62"), v); return true; }
    if (id === T.PLAZA || id === T.CONCRETE) { slabs(p, r, hex("#8a8792"), v); dots(p, r, 3, hex("#4f7a4a")); return true; }
    if (id === T.ROAD || id === T.ROAD_LINE || id === T.CROSSWALK || id === T.PARKING) { cobbles(p, r, hex("#6b6470")); return true; }
    if (id === T.FOREST) { speckle(p, r, hex("#2a4a36"), [hex("#203a2a"), hex("#365c44")], 0.4); return true; }
    if (id === T.WATER) { speckle(p, r, hex("#2a3f6e"), [hex("#33508a")], 0.2); dots(p, r, 2, hex("#a8c8ff")); return true; }
    return false;
  },
  facade(p, type, s, v, r) {
    const st = hex(["#6e6a74", "#77727c", "#66626c", "#7c7682"][s]);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const row = y >> 2, edge = y % 4 === 3 || (x + (row % 2) * 3) % 6 === 5;
      p.set(x, y, edge ? shade(st, -30) : (r() < 0.12 ? shade(st, 10) : st));
    }
    if (v === 0) { // porta amb claus de ferro
      p.rect(5, 4, 6, 12, hex("#2a1d14")); p.rect(6, 3, 4, 1, hex("#2a1d14"));
      p.rect(6, 5, 4, 11, hex("#5a3a22")); for (const y of [7, 10, 13]) { p.set(6, y, hex("#9a9aa0")); p.set(9, y, hex("#9a9aa0")); }
      return;
    }
    // finestra ogival il·luminada
    p.rect(5, 5, 6, 9, hex("#2a1d2e")); p.rect(6, 4, 4, 1, hex("#2a1d2e")); p.set(7, 3, hex("#2a1d2e")); p.set(8, 3, hex("#2a1d2e"));
    p.rect(6, 5, 4, 8, hex("#ffd76a")); p.rect(7, 4, 2, 1, hex("#ffd76a"));
    p.rect(7, 5, 2, 8, hex("#e8a83a")); p.rect(6, 9, 4, 1, hex("#2a1d2e"));
  },
};

// ---------------------------------------------------------------------------
// 1 · La Comarca dels Turons (inspirat en El Senyor dels Anells): turons verds, palla, portes rodones
const SHIRE = {
  name: "La Comarca dels Turons", style: "estil El Senyor dels Anells", color: "#a8e06a",
  outline: "#2a2414", curb: "#7a6a48",
  tree: { base: "#3f7d32", light: "#5fa046", dark: "#2a5a24", trunk: "#5a3a22",
    pineBase: "#4a7a2e", pineLight: "#6a9a42", pineDark: "#2e5420" },
  sign: { frame: "#7a4e2c", inner: "#a8743c", corner: "#5a3a22", wood: true },
  ground(p, id, v, r) {
    if (id === T.GROUND || id === T.GRASS || id === T.PARK || id === T.PITCH) {
      grassBase(p, r, hex("#7cb342"), v >= 2 ? 2 : 0);
      if (v === 1) { p.set(4, 6, hex("#f6e05e")); p.set(11, 12, hex("#f6e05e")); } // botons d'or
      return true;
    }
    if (id === T.SIDEWALK || id === T.SCHOOLYARD || id === T.DIRT) {
      speckle(p, r, hex("#b08a5a"), [hex("#9a7648"), hex("#c49e6a")], 0.35);
      return true;
    }
    if (id === T.ROAD || id === T.ROAD_LINE || id === T.CROSSWALK || id === T.PARKING) {
      speckle(p, r, hex("#a07a4c"), [hex("#8e6a40"), hex("#b48a58")], 0.35);
      p.rect(3, 0, 2, 16, hex("#86603a")); p.rect(11, 0, 2, 16, hex("#86603a")); // rodades de carro
      return true;
    }
    if (id === T.PLAZA || id === T.CONCRETE) {
      grassBase(p, r, hex("#7cb342"), 0);
      for (const [x, y] of [[2, 2], [9, 3], [4, 9], [11, 10]]) { p.rect(x, y, 5, 4, hex("#b8ad98")); p.rect(x, y, 5, 1, hex("#d6ccb6")); p.rect(x, y + 3, 5, 1, hex("#8a8070")); }
      return true;
    }
    return false;
  },
  facade(p, type, s, v, r) {
    if (s % 2 === 0) { // casa-turó amb porta rodona
      grassBase(p, r, hex("#5f9234"), 0);
      if (v === 0 || v === 2) {
        const door = hex(["#3f8a3a", "#e8c040", "#c0392b", "#3f6fb5"][v === 0 ? s : (s + 1) % 4]);
        for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
          const dx = (x - 5.5) / 6, dy = (y - 7) / 7, d = dx * dx + dy * dy;
          if (d < 1 && y < 12) p.set(2 + x, 4 + y, d > 0.72 ? hex("#6b4426") : door);
        }
        p.set(8, 10, hex("#f6d55c"));
      } else {
        for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
          const dx = (x - 2.5) / 3, dy = (y - 2.5) / 3, d = dx * dx + dy * dy;
          if (d < 1) p.set(5 + x, 6 + y, d > 0.55 ? hex("#6b4426") : hex("#ffe8a0"));
        }
      }
      return;
    }
    // entramat de fusta (paret blanca amb bigues fosques)
    p.noise(r, hex("#f0e8d4"), [hex("#e4dac2")], 0.15);
    const beam = hex("#4a3020");
    p.rect(0, 0, 16, 2, beam); p.rect(0, 14, 16, 2, beam); p.rect(0, 0, 2, 16, beam); p.rect(14, 0, 2, 16, beam);
    for (let i = 0; i < 12; i++) { p.set(2 + i, 2 + i, beam); p.set(3 + i, 2 + i, beam); }
    if (v === 1) { p.rect(5, 5, 6, 5, beam); p.rect(6, 6, 4, 3, hex("#ffe8a0")); }
  },
};

// ---------------------------------------------------------------------------
// 2 · Poble de l'Heroi (inspirat en Zelda): l'estil base de game.js
const HERO = {
  name: "Poble de l'Heroi", style: "estil Zelda", color: "#7ee08a",
  outline: "#2a1d2e", curb: "#8a7f6a",
  tree: {},
  sign: null,
};

// ---------------------------------------------------------------------------
// 3 · Districte del Vapor (steampunk): plaques de metall reblades, coure, engranatges
const STEAM = {
  name: "Districte del Vapor", style: "estil steampunk", color: "#e0a050",
  outline: "#1a120c", curb: "#5a4636",
  tree: { base: "#b5651d", light: "#d98a3a", dark: "#7a3e12", trunk: "#3a2a1e",
    pineBase: "#8a5a2a", pineLight: "#b07a3a", pineDark: "#5a3818" },
  sign: { frame: "#b08d57", inner: "#3a2a1e", corner: "#f0d58a", rivets: true },
  ground(p, id, v, r) {
    if (id === T.GROUND || id === T.CONCRETE || id === T.SCHOOLYARD) {
      const c = hex(v % 2 ? "#7a5a42" : "#6e5240");
      speckle(p, r, c, [shade(c, -10), shade(c, 8), hex("#8a4a2a")], 0.3);
      p.rect(0, 0, 16, 1, shade(c, -30)); p.rect(0, 0, 1, 16, shade(c, -30)); rivets(p, hex("#c8a060"), hex("#f0d58a"));
      if (v === 3) { // engranatge gravat
        for (let a = 0; a < 16; a++) { const t = a / 16 * Math.PI * 2, rr = a % 2 ? 4 : 5; p.set(8 + Math.round(Math.cos(t) * rr), 8 + Math.round(Math.sin(t) * rr), shade(c, -25)); }
      }
      return true;
    }
    if (id === T.GRASS || id === T.PARK || id === T.PITCH) { grassBase(p, r, hex("#8f8a4a"), 0); return true; }
    if (id === T.SIDEWALK) {
      const c = hex("#b08d57");
      speckle(p, r, c, [shade(c, -10), shade(c, 10)], 0.25);
      p.rect(0, 7, 16, 1, shade(c, -30)); p.rect(7, 0, 1, 7, shade(c, -30)); p.rect(15, 8, 1, 8, shade(c, -30));
      return true;
    }
    if (id === T.PLAZA) {
      const c = hex("#5a5048");
      p.fill(c);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x + (y >> 2) * 2) % 8 === 0 || y % 4 === 0) p.set(x, y, hex("#b87333"));
      return true;
    }
    if (id === T.ROAD || id === T.ROAD_LINE || id === T.CROSSWALK || id === T.PARKING) {
      p.fill(hex("#3a3430"));
      for (let i = 0; i < 16; i += 4) { p.rect(i, 0, 2, 16, hex("#54493f")); p.rect(0, i, 16, 1, hex("#2a2420")); }
      return true;
    }
    if (id === T.WATER) { speckle(p, r, hex("#4a5a3a"), [hex("#5a6a44"), hex("#3a4a30")], 0.3); return true; }
    return false;
  },
  facade(p, type, s, v, r) {
    const c = hex(["#5a4a3e", "#4e4038", "#62503f", "#544438"][s]);
    speckle(p, r, c, [shade(c, -8), shade(c, 8)], 0.2);
    p.rect(0, 0, 16, 2, hex("#b08d57")); p.rect(0, 14, 16, 2, hex("#b08d57"));
    for (const x of [0, 15]) for (let y = 3; y < 14; y += 3) p.set(x, y, hex("#f0d58a"));
    if (v === 0) { // porta de ferro amb volant
      p.rect(4, 4, 8, 10, hex("#2a2420")); p.rect(5, 5, 6, 9, hex("#4a4038"));
      for (let a = 0; a < 12; a++) { const t = a / 12 * Math.PI * 2; p.set(8 + Math.round(Math.cos(t) * 2), 9 + Math.round(Math.sin(t) * 2), hex("#c8a060")); }
      return;
    }
    // ull de bou amb vora de llautó
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const dx = (x - 3.5) / 4, dy = (y - 3.5) / 4, d = dx * dx + dy * dy;
      if (d < 1) p.set(4 + x, 4 + y, d > 0.55 ? hex("#c8a060") : d > 0.4 ? hex("#7a5a2a") : (x + y < 6 ? hex("#ffe08a") : hex("#f0a040")));
    }
    if (v === 2) { p.rect(12, 2, 2, 12, hex("#6a5a4a")); p.rect(12, 7, 3, 1, hex("#b87333")); } // canonada
  },
};

// ---------------------------------------------------------------------------
// 4 · Racó Kawaii (inspirat en Hello Kitty): pastels, cors, llaços i quadres rosa
const KAWAII = {
  name: "Racó Kawaii", style: "estil Hello Kitty", color: "#ff9ccf",
  outline: "#7a3a5e", curb: "#f7c6d9",
  tree: { base: "#f7a8c8", light: "#ffd0e4", dark: "#e07aa8", trunk: "#a0705a",
    pineBase: "#b8e8c8", pineLight: "#dcf6e4", pineDark: "#8ad0a8" },
  sign: { frame: "#ffffff", inner: null, corner: "#ff6fae", bow: true, round: true },
  ground(p, id, v, r) {
    if (id === T.GROUND || id === T.GRASS || id === T.PARK || id === T.PITCH) {
      speckle(p, r, hex("#b8ecc4"), [hex("#a6e2b6"), hex("#ccf4d6")], 0.3);
      if (v === 1) heart(p, 6, 6, hex("#ff8fbf"));
      if (v === 3) { p.set(3, 4, hex("#ffffff")); p.set(12, 11, hex("#ffffff")); p.set(9, 3, hex("#fff3a0")); }
      return true;
    }
    if (id === T.SIDEWALK || id === T.SCHOOLYARD || id === T.DIRT) {
      speckle(p, r, hex("#f7c6d9"), [hex("#f9d4e3")], 0.25);
      for (const [x, y] of [[3, 3], [11, 4], [6, 10], [13, 12]]) p.set(x, y, hex("#ffffff"));
      return true;
    }
    if (id === T.PLAZA || id === T.CONCRETE) {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, ((x >> 2) + (y >> 2)) % 2 ? hex("#ffd6e8") : hex("#fff6fa"));
      return true;
    }
    if (id === T.ROAD || id === T.ROAD_LINE || id === T.CROSSWALK || id === T.PARKING) { cobbles(p, r, hex("#c9b6e8")); return true; }
    if (id === T.WATER || id === T.POOL) { speckle(p, r, hex("#9ad8f0"), [hex("#b4e4f6")], 0.25); dots(p, r, 2, hex("#ffffff")); return true; }
    return false;
  },
  facade(p, type, s, v, r) {
    const wall = hex(["#fff6fa", "#fffaf0", "#f6f9ff", "#fdf6ff"][s]);
    p.noise(r, wall, [shade(wall, -6)], 0.1);
    for (let x = 0; x < 16; x++) p.set(x, 0, x % 4 < 2 ? hex("#ff8fbf") : hex("#ffffff")); // sanefa
    p.rect(0, 1, 16, 1, hex("#ffd6e8"));
    if (v === 0) { // porta rosa amb llaç
      p.rect(5, 6, 6, 10, hex("#ff8fbf")); p.rect(6, 7, 4, 9, hex("#ffb3d1"));
      p.rect(5, 3, 2, 2, hex("#ff4f9a")); p.rect(9, 3, 2, 2, hex("#ff4f9a")); p.rect(7, 4, 2, 1, hex("#ff4f9a"));
      return;
    }
    // finestra en forma de cor
    stamp(p, 4, 5, HEART_L, hex("#ff6fae"));
    stamp(p, 5, 6, ["#..#", "####", ".##."], hex("#bfe6ff"));
    heart(p, 1, 12, hex("#ffb3d1")); heart(p, 10, 12, hex("#ffb3d1"));
  },
};

// ---------------------------------------------------------------------------
// 5 · Ruta dels Monstres (inspirat en Pokémon): gespa alta, camins nets, teulades llises de colors vius
const ROUTE = {
  name: "Ruta dels Monstres", style: "estil Pokémon", color: "#ffe066",
  outline: "#202830", curb: "#f0f0e8",
  tree: { base: "#2f8a3a", light: "#58b858", dark: "#1e5a28", trunk: "#7a5030",
    pineBase: "#2f8a3a", pineLight: "#58b858", pineDark: "#1e5a28" },
  sign: { frame: "#3060c0", inner: null, corner: "#ffffff", thick: true },
  ground(p, id, v, r) {
    if (id === T.GROUND || id === T.PITCH) {
      p.fill(hex("#78c850"));
      for (let y = 1; y < 16; y += 4) for (let x = (y % 8 === 1 ? 1 : 3); x < 16; x += 4) p.set(x, y, hex("#90d868"));
      return true;
    }
    if (id === T.GRASS || id === T.PARK || id === T.FOREST) { // herba alta
      p.fill(hex("#58b050"));
      for (let y = 0; y < 16; y += 4) for (let x = (y % 8) / 2; x < 16; x += 4) {
        p.set(x, y + 3, hex("#2f7a30")); p.set(x + 1, y + 1, hex("#2f7a30")); p.set(x + 2, y + 3, hex("#2f7a30"));
        p.set(x + 1, y + 2, hex("#3f9a3f")); p.set(x + 1, y, hex("#88d070"));
      }
      return true;
    }
    if (id === T.SIDEWALK || id === T.DIRT || id === T.SCHOOLYARD) {
      p.fill(hex("#e8d8a8"));
      dots(p, r, 3, hex("#d0bc88"));
      return true;
    }
    if (id === T.PLAZA || id === T.CONCRETE) {
      p.fill(hex("#d8d8d0"));
      for (let i = 0; i < 16; i++) { p.set(i, 0, hex("#b8b8b0")); p.set(i, 8, hex("#b8b8b0")); p.set(0, i, hex("#b8b8b0")); p.set(8, i, hex("#b8b8b0")); }
      return true;
    }
    if (id === T.ROAD || id === T.ROAD_LINE || id === T.CROSSWALK || id === T.PARKING) {
      speckle(p, r, hex("#b8b8b8"), [hex("#b0b0b0"), hex("#c0c0c0")], 0.2);
      return true;
    }
    if (id === T.WATER) { p.fill(hex("#5898f8")); for (let x = 0; x < 16; x += 8) p.rect(x + (v * 3) % 8, 5 + v, 4, 1, hex("#a8d0ff")); return true; }
    return false;
  },
  facade(p, type, s, v) {
    p.fill(hex("#f8f0d8"));
    p.rect(0, 0, 16, 2, hex("#c8b890")); p.rect(0, 15, 16, 1, hex("#a89870"));
    if (v === 0) { p.rect(5, 6, 6, 10, hex("#604830")); p.rect(6, 7, 4, 9, hex("#8a6a48")); p.rect(4, 15, 8, 1, hex("#d04040")); return; }
    p.rect(3, 5, 10, 7, hex("#404850")); p.rect(4, 6, 8, 5, hex("#78c8f0")); p.rect(4, 6, 3, 2, hex("#c8ecff"));
  },
};

const THEMES = [MAGIC, SHIRE, HERO, STEAM, KAWAII, ROUTE];

// ---------------------------------------------------------------------------
// Sectors definits per carrers reals:
//  - el Carrer Gran de Sant Andreu separa els dos costats del barri
//  - el Carrer de Malats i el Carrer de Sòcrates el tallen en tres franges
// On un carrer s'acaba, se n'allarga el traçat en línia recta fins a la vora del mapa.
const DIVIDERS = { gran: "Carrer Gran de Sant Andreu", band1: "Carrer de Malats", band2: "Carrer de Sòcrates" };
// [franja][costat] -> tema. Franja 0 = abans de Malats, 1 = entre Malats i Sòcrates, 2 = després de Sòcrates.
// Costat 0 = oest del Carrer Gran, 1 = est.
const SECTOR_THEMES = [
  [1, 3],  // Comarca dels Turons · Districte del Vapor (vies i fàbriques)
  [5, 2],  // Ruta dels Monstres · Poble de l'Heroi (Plaça d'Orfila, on comences)
  [0, 4],  // Vila dels Bruixots · Racó Kawaii
];

// Funció lineal a trossos que dona la coordenada "out" d'un carrer per a cada valor de "key"
function streetCurve(name, key, out) {
  const st = state.meta.streets.find((x) => x.name === name);
  if (!st) return null;
  const pts = st.lines.flat().map((p) => [p[key], p[out]]).sort((a, b) => a[0] - b[0]);
  // mitjana dels punts propers (el carrer pot tenir dues calçades)
  const merged = [];
  for (const [k, v] of pts) {
    const last = merged[merged.length - 1];
    if (last && k - last[0] < 6) { last[2] += v; last[3]++; last[0] = (last[0] + k) / 2; }
    else merged.push([k, 0, v, 1]);
  }
  const P = merged.map(([k, , sum, n]) => [k, sum / n]);
  const first = P[0], last = P[P.length - 1];
  const slope = (last[1] - first[1]) / ((last[0] - first[0]) || 1); // direcció general del carrer
  return (k) => {
    if (k <= first[0]) return first[1] + slope * (k - first[0]);
    if (k >= last[0]) return last[1] + slope * (k - last[0]);
    let i = 1;
    while (P[i][0] < k) i++;
    const [k0, v0] = P[i - 1], [k1, v1] = P[i];
    return v0 + (v1 - v0) * (k - k0) / ((k1 - k0) || 1);
  };
}

function initThemes() {
  const { W, H } = state;
  const granX = streetCurve(DIVIDERS.gran, 1, 0);      // x del Carrer Gran per a cada y
  const malatsY = streetCurve(DIVIDERS.band1, 0, 1);   // y de Malats per a cada x
  const socratesY = streetCurve(DIVIDERS.band2, 0, 1); // y de Sòcrates per a cada x
  const sec = new Uint8Array(W * H);
  if (granX && malatsY && socratesY) {
    const gx = Float32Array.from({ length: H }, (_, y) => granX(y));
    const my = Float32Array.from({ length: W }, (_, x) => malatsY(x));
    const sy = Float32Array.from({ length: W }, (_, x) => socratesY(x));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const side = x < gx[y] ? 0 : 1;
      const band = y < my[x] ? 0 : y < sy[x] ? 1 : 2;
      sec[y * W + x] = SECTOR_THEMES[band][side];
    }
  } else {
    sec.fill(BASE_THEME);
  }
  state.sector = sec;
  state.chunks.clear();
}

const sectorAt = (tx, ty) => {
  if (!state.sector || tx < 0 || ty < 0 || tx >= state.W || ty >= state.H) return BASE_THEME;
  return state.sector[ty * state.W + tx];
};

// Zona actual del jugador: rètol al HUD, avís en entrar i canvi de música
let currentZone = -1;
function updateZone() {
  const th = sectorAt(Math.floor(state.player.x / TS), Math.floor(state.player.y / TS));
  if (th === currentZone) return;
  const first = currentZone < 0;
  currentZone = th;
  const t = THEMES[th];
  if (!first) showBanner(`Has entrat a: ${t.name}`, "zone");
  document.getElementById("banner").style.setProperty("--zone", t.color);
  setMusicTheme(th);
}
