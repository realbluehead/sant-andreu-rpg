// Teulades texturitzades. Es pinten píxel a píxel en coordenades del món (no amb rajoles
// repetides), així les teules continuen d'una casella a l'altra i cadascuna té el seu to.
// Cada teulada es dibuixa a dues aigües: el vessant de dalt més fosc, el de baix més clar i un
// carener al mig. Cada tema té el seu "shader" de teulada.
"use strict";

// soroll determinista 0..1 a partir de dos enters
const n2 = (a, b) => (hash2(a, b) & 1023) / 1023;
const mix = (c, d, t) => [c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t, c[2] + (d[2] - c[2]) * t];
const add = (c, k) => [c[0] + k, c[1] + k, c[2] + k];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// Teules en fileres decalades: retorna la teula (col, row) i la posició local
function shingleAt(x, y, w, h) {
  const row = Math.floor(y / h), xo = x + (row & 1) * (w >> 1);
  const col = Math.floor(xo / w);
  return { col, row, lx: xo - col * w, ly: y - row * h };
}

// Teula arrodonida amb volum: llum a dalt, ombra a sota i vora fosca en arc
function scallop(base, sh, w, h, tone) {
  const { lx, ly } = sh;
  const cx = (lx + 0.5 - w / 2) / (w / 2);                 // -1..1
  const arc = h - 1 - Math.round(3 * cx * cx);             // vora inferior en "U" (escata)
  if (ly > arc) return add(base, -62);                     // ombra entre escates
  if (ly === arc) return add(base, -40);
  let c = add(base, tone);
  c = add(c, (h * 0.3 - ly) * 6 - cx * 12);                // volum: llum des de l'esquerra
  if (Math.abs(cx) > 0.8) c = add(c, -14);                 // costats arrodonits
  if (ly === 1 && cx > -0.6 && cx < 0.1) c = add(c, 26);   // reflex
  return c;
}

const ROOF_SHADERS = [
  // 0 · Bruixots: pissarres rectangulars amb reflex blavós, esquerdes i molsa
  {
    base: (type, s) => hex(["#4a3a6e", "#34406a", "#2f4f5a", "#5e2a3a"][s]),
    pixel(x, y, base) {
      const sh = shingleAt(x, y, 7, 5), k = n2(sh.col * 7 + 1, sh.row);
      let c = mix(base, [70, 90, 130], 0.15 * k);
      c = add(c, (k - 0.5) * 26);
      if (sh.ly === 4) return add(c, -46);                                  // junta inferior
      if (sh.lx === 0) return add(c, -30);                                  // junta lateral
      if (sh.ly === 0) c = add(c, 14);
      if (k > 0.82 && sh.lx + sh.ly === 4) c = add(c, 34);                  // reflex
      if (k < 0.06 && sh.lx === sh.ly + 1) c = add(c, -40);                 // esquerda
      if (n2(x >> 1, y >> 1) > 0.965) c = mix(c, [70, 110, 60], 0.7);      // molsa
      return add(c, (n2(x, y) - 0.5) * 8);
    },
    chimney: { body: "#5d5866", cap: "#8a8492", dark: "#3a3640" },
  },
  // 1 · Comarca: palla en capes (s senar) o gespa amb flors (s parell)
  {
    base: (type, s) => hex(s % 2 === 0 ? "#6a9e3a" : s === 1 ? "#c9a14a" : "#b88a3a"),
    pixel(x, y, base, info) {
      if (info.s % 2 === 0) { // gespa
        const k = n2(x >> 1, y >> 1), k2 = n2(x, y);
        let c = add(base, (k - 0.5) * 30);
        if (k2 > 0.93) c = add(c, -35);                                     // brins foscos
        if (k2 < 0.04) c = add(c, 30);
        const f = n2(x >> 2, (y >> 2) + 99);
        if (f > 0.985 && (x & 3) === 1 && (y & 3) === 1) return hex(["#f6e05e", "#ffffff", "#ff7f7f"][Math.floor(f * 1000) % 3]);
        return c;
      }
      const band = 6, row = Math.floor(y / band), ly = y - row * band;
      const strand = n2(x, row);                                            // cada palla
      let c = add(base, (strand - 0.5) * 34);
      const fringe = Math.floor(n2(x * 3, row) * 3);                        // serrell desigual
      if (ly >= band - 1 - fringe + 2) c = add(c, -45);
      else if (ly >= band - 2) c = add(c, -22);
      if (ly === 0) c = add(c, 18);
      if ((x + row) % 3 === 0) c = add(c, -10);
      if (n2(x >> 2, y >> 2) > 0.97) c = mix(c, [90, 110, 50], 0.4);        // taques de molsa
      return c;
    },
    chimney: { body: "#9a8a72", cap: "#c8b896", dark: "#6a5a48" },
  },
  // 2 · Poble de l'Heroi: teules de terrissa arrodonides, cada una amb el seu to
  {
    base: (type, s) => roofColor(type, s),
    pixel(x, y, base) {
      const sh = shingleAt(x, y, 8, 6), k = n2(sh.col, sh.row);
      let c = scallop(base, sh, 8, 6, (k - 0.5) * 22);
      if (k > 0.96) c = mix(c, [96, 128, 70], 0.45);                        // molsa
      else if (k < 0.03) c = add(c, -28);                                   // teula vella
      return add(c, (n2(x, y) - 0.5) * 7);
    },
    chimney: { body: "#b8ad98", cap: "#e2d8c2", dark: "#7d7262" },
  },
  // 3 · Vapor: coure amb juntes i verdet que regalima (s parell) o xapa ondulada rovellada (s senar)
  {
    base: (type, s) => hex(s % 2 === 0 ? (s === 0 ? "#5aa494" : "#4c9484") : "#9a5a3a"),
    pixel(x, y, base, info) {
      if (info.s % 2 === 0) {
        const px = x & 7, panel = x >> 3;
        let c = add(base, (n2(panel, y >> 4) - 0.5) * 18);
        if (px === 0) c = add(c, 34); else if (px === 1) c = add(c, -40);    // junta alçada
        if (px === 1 && (y & 7) === 3) return hex("#e8c070");                // reblons
        const drip = n2(x, 7) > 0.8 && n2(x, y >> 3) > 0.4;
        if (drip) c = mix(c, [150, 220, 190], 0.35);                         // verdet
        if (n2(x >> 2, y >> 2) > 0.95) c = mix(c, [184, 115, 51], 0.6);      // coure net
        return add(c, (n2(x, y) - 0.5) * 8);
      }
      const prof = [-26, 6, 22, 4][x & 3];                                  // ondulació
      let c = add(base, prof);
      const rust = n2(x >> 3, y >> 3) * 0.6 + n2(x >> 1, y >> 1) * 0.4;
      if (rust > 0.62) c = mix(c, [120, 52, 24], (rust - 0.62) * 2.2);
      if ((y & 15) === 0) c = add(c, -30);                                  // encavalcament de xapes
      if ((y & 15) === 1 && (x & 7) === 2) return hex("#c8a060");            // cargols
      return add(c, (n2(x, y) - 0.5) * 10);
    },
    chimney: { body: "#3a3430", cap: "#b87333", dark: "#201a16", smoke: true },
  },
  // 4 · Kawaii: teules rodones pastel amb lluentor i algun cor
  {
    base: (type, s) => hex(["#f48fb1", "#8fd9c8", "#c39bd3", "#8ec5f0"][s]),
    pixel(x, y, base) {
      const sh = shingleAt(x, y, 8, 7), k = n2(sh.col + 31, sh.row);
      let c = scallop(base, sh, 8, 7, (k - 0.5) * 12);
      if (sh.ly >= 1 && sh.ly <= 2 && sh.lx >= 2 && sh.lx <= 3) c = mix(c, [255, 255, 255], 0.55); // lluentor
      if (k > 0.94) { // teula amb cor
        const hx = sh.lx - 2, hy = sh.ly - 1;
        if (["#.#.", "####", ".##."][hy]?.[hx] === "#") return hex("#ff5fa2");
      }
      if (n2(x, y) > 0.995) return [255, 255, 255];                          // purpurina
      return c;
    },
    chimney: { body: "#ffffff", cap: "#ffb3d1", dark: "#e0b8cc" },
  },
  // 5 · Ruta: teulades llises de colors vius amb franges, juntes i algun extractor
  {
    flat: true,
    base: (type, s) => hex(["#e04040", "#4070d0", "#40a060", "#f08030"][s]),
    pixel(x, y, base, info) {
      const tx = x >> 4, ty = y >> 4, lx = x & 15, ly = y & 15, h = hash2(tx * 3 + 1, ty * 5 + 2);
      // aparell d'aire condicionat
      if (h % 19 === 0 && lx >= 3 && lx <= 12 && ly >= 3 && ly <= 11) {
        if (ly === 11 || lx === 12) return [96, 98, 108];
        if (ly === 3 || lx === 3) return [236, 238, 242];
        const fx = lx - 7.5, fy = ly - 7, r = Math.hypot(fx, fy);
        if (r < 3.2) return r < 1 ? [80, 82, 90] : ((Math.atan2(fy, fx) * 3 / Math.PI + 6) | 0) % 2 ? [120, 124, 134] : [70, 72, 80];
        return [206, 210, 218];
      }
      // respirador
      if (h % 23 === 5 && (lx - 8) ** 2 + (ly - 8) ** 2 < 7) return (lx - 8) ** 2 + (ly - 8) ** 2 < 3 ? [40, 40, 48] : [150, 150, 160];
      const row = y >> 2, ry = y & 3, panel = n2(x >> 3, row);
      let c = add(base, (panel - 0.5) * 14);                                // plaques amb to propi
      if (ry === 3) c = add(c, -42); else if (ry === 0) c = add(c, 24);     // franges
      if ((x & 7) === 0 && ry !== 3) c = add(c, -12);                       // junta
      if (n2(x, y) > 0.97) c = add(c, -24);                                 // brutícia
      return mul(c, 1.06 - 0.12 * info.t);                                 // degradat suau
    },
    chimney: { body: "#b0b0b8", cap: "#e8e8f0", dark: "#70707a" },
  },
];

const roofCache = new Map(); // colors base en rgb, per tema/tipus/variant
function roofBase(th, type, s) {
  const k = th * 100 + type * 10 + s;
  let c = roofCache.get(k);
  if (!c) { c = ROOF_SHADERS[th].base(type, s); roofCache.set(k, c); }
  return c;
}

// Quantes caselles de la mateixa teulada hi ha cap amunt / cap avall (fins a un màxim)
function roofRun(tx, ty, v, dy) {
  let n = 0;
  while (n < 30 && (g(tx, ty + dy * (n + 1)) & 127) === v) n++;
  return n;
}

// Pinta una casella de teulada directament a l'ImageData del chunk
function paintRoofTile(data, stride, ox, oy, tx, ty, v, th) {
  const shader = ROOF_SHADERS[th], b = v - BUILDING_BASE, type = (b / 4) | 0, s = b % 4;
  const base = roofBase(th, type, s), info = { s, type };
  const upT = roofRun(tx, ty, v, -1);
  // la darrera casella de l'edifici és la façana: no forma part de la teulada
  const belowSame = roofRun(tx, ty, v, 1), downT = Math.max(0, belowSame - 1);
  const hv = hash2(tx, ty);
  const chim = shader.chimney && hv % 29 === 0 && upT >= 1 && downT >= 2 && Math.abs(upT - downT) > 1;
  const ch = chim ? { body: hex(shader.chimney.body), cap: hex(shader.chimney.cap), dark: hex(shader.chimney.dark) } : null;
  for (let ly = 0; ly < TS; ly++) {
    const wy = ty * TS + ly, up = upT * TS + ly, down = downT * TS + (TS - 1 - ly), t = up / (up + down + 1);
    for (let lx = 0; lx < TS; lx++) {
      const wx = tx * TS + lx;
      info.t = t;
      let c = shader.pixel(wx, wy, base, info);
      if (!shader.flat) {
        const d = up - down;
        if (up + down > 18 && Math.abs(d) <= 2) {         // carener
          const cap = add(base, -10 + ((wx % 6) === 0 ? -16 : 0));
          c = d === -2 ? add(base, 40) : d === 2 ? add(base, -52) : cap;
        } else {
          // vessant de dalt a l'ombra, vessant de baix il·luminat, ràfec una mica més fosc
          c = mul(c, t < 0.5 ? 0.8 + 0.12 * (t / 0.5) : 1.06 - 0.1 * ((t - 0.5) / 0.5));
        }
      }
      if (ch) { // xemeneia amb ombra
        if (lx >= 9 && lx <= 13 && ly >= 2 && ly <= 11) {
          c = ly <= 3 ? ch.cap : lx === 13 ? ch.dark : add(ch.body, (n2(wx, wy) - 0.5) * 14);
          if (ly === 2 && lx >= 10 && lx <= 12) c = [30, 24, 28];
        } else if ((lx === 14 && ly >= 3 && ly <= 12) || (ly === 12 && lx >= 10 && lx <= 14)) {
          c = mul(c, 0.7);
        } else if (shader.chimney.smoke && lx >= 10 && lx <= 13 && ly <= 1 && n2(wx, wy) > 0.4) {
          c = [200, 200, 205];
        }
      }
      const i = ((oy + ly) * stride + ox + lx) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
  }
}
