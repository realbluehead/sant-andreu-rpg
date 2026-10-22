// Establiments del barri (bars, cafeteries, farmàcies…) amb una icona pixel art per categoria.
"use strict";

// Cada icona: color del rètol, nom en català i glif de 9x9 (lletres = colors de la paleta)
const POI_ICONS = {
  beer: { bg: "#7c2d12", label: "Bar", pal: { W: "#fffbeb", Y: "#fbbf24", H: "#fde68a" }, g: [
    ".WWWWW...",
    "WWWWWWW..",
    ".YYYYY...",
    ".YYYYYHH.",
    ".YYYYY.H.",
    ".YYYYY.H.",
    ".YYYYYHH.",
    ".YYYYY...",
    ".YYYYY..."] },
  coffee: { bg: "#5b3a24", label: "Cafeteria", pal: { W: "#ffffff", S: "#d6d3d1", C: "#7c4a2a" }, g: [
    "..S..S...",
    ".S..S....",
    "..S..S...",
    ".........",
    "WWWWWWW..",
    "WCCCCCWWW",
    "WWWWWWW.W",
    ".WWWWWWW.",
    "..WWWW..."] },
  bread: { bg: "#92400e", label: "Forn", pal: { B: "#fbbf24", D: "#b45309" }, g: [
    ".........",
    "..BBBBB..",
    ".BBBBBBB.",
    "BBDBBDBBB",
    "BBBDBBDBB",
    "BBBBBBBBB",
    ".BBBBBBB.",
    ".........",
    "........."] },
  pharmacy: { bg: "#15803d", label: "Farmàcia", pal: { W: "#ffffff" }, g: [
    "...WWW...",
    "...WWW...",
    "...WWW...",
    "WWWWWWWWW",
    "WWWWWWWWW",
    "WWWWWWWWW",
    "...WWW...",
    "...WWW...",
    "...WWW..."] },
  health: { bg: "#f4f1e8", label: "Centre de salut", pal: { R: "#dc2626" }, g: [
    "...RRR...",
    "...RRR...",
    "...RRR...",
    "RRRRRRRRR",
    "RRRRRRRRR",
    "RRRRRRRRR",
    "...RRR...",
    "...RRR...",
    "...RRR..."] },
  food: { bg: "#b91c1c", label: "Restaurant", pal: { W: "#ffffff" }, g: [
    "W.W.W..W.",
    "W.W.W.WW.",
    "W.W.W.WW.",
    "WWWWW.WW.",
    ".WWW..WW.",
    "..W...WW.",
    "..W....W.",
    "..W....W.",
    "..W....W."] },
  burger: { bg: "#c2410c", label: "Menjar ràpid", pal: { B: "#fbbf24", L: "#4ade80", M: "#5b2a12", S: "#fef3c7" }, g: [
    ".........",
    "..BBBBB..",
    ".BBSBSBB.",
    "BBBBBBBBB",
    "LLLLLLLLL",
    "MMMMMMMMM",
    "BBBBBBBBB",
    ".BBBBBBB.",
    "........."] },
  icecream: { bg: "#db2777", label: "Gelateria", pal: { W: "#fdf2f8", P: "#f9a8d4", C: "#f59e0b" }, g: [
    "..WWWWW..",
    ".WPPWWWW.",
    ".WWWWPWW.",
    "..WWWWW..",
    ".CCCCCCC.",
    "..CCCCC..",
    "..CCCCC..",
    "...CCC...",
    "....C...."] },
  cart: { bg: "#1d4ed8", label: "Supermercat", pal: { W: "#ffffff" }, g: [
    "WW.......",
    ".W.......",
    ".WWWWWWWW",
    ".W.W.W.W.",
    ".WWWWWWW.",
    "..WWWWW..",
    "..W......",
    "..WWWWWW.",
    "...W...W."] },
  bank: { bg: "#0f766e", label: "Banc", pal: { W: "#ffffff" }, g: [
    "...WWWW..",
    "..W....W.",
    ".W.......",
    "WWWWW....",
    ".W.......",
    "WWWWW....",
    ".W.......",
    "..W....W.",
    "...WWWW.."] },
  scissors: { bg: "#7e22ce", label: "Perruqueria", pal: { W: "#ffffff" }, g: [
    "W.......W",
    ".W.....W.",
    "..W...W..",
    "...W.W...",
    "....W....",
    "..WW.WW..",
    ".W..W..W.",
    ".W..W..W.",
    "..WW.WW.."] },
  shirt: { bg: "#be185d", label: "Botiga de roba", pal: { W: "#ffffff" }, g: [
    ".WW...WW.",
    "WWWW.WWWW",
    "WWWWWWWWW",
    ".WWWWWWW.",
    "..WWWWW..",
    "..WWWWW..",
    "..WWWWW..",
    "..WWWWW..",
    "..WWWWW.."] },
  book: { bg: "#4338ca", label: "Llibreria", pal: { W: "#ffffff" }, g: [
    ".........",
    "WWWW.WWWW",
    "W..W.W..W",
    "WWWW.WWWW",
    "W..W.W..W",
    "WWWW.WWWW",
    "WWWWWWWWW",
    "....W....",
    "........."] },
  bike: { bg: "#dc2626", label: "Bicicletes", pal: { W: "#ffffff" }, g: [
    ".........",
    "......WW.",
    "..WW.W...",
    "..W.WW...",
    ".WWWWWWW.",
    "W..WW..WW",
    "W.W..WW.W",
    "W..W.W..W",
    ".WW...WW."] },
  fuel: { bg: "#374151", label: "Benzinera", pal: { W: "#ffffff", Y: "#facc15" }, g: [
    "WWWWW....",
    "WYYYW.W..",
    "WYYYW..W.",
    "WWWWW..W.",
    "WWWWWW.W.",
    "WWWWW.WW.",
    "WWWWW.W..",
    "WWWWW....",
    "WWWWWW..."] },
  film: { bg: "#111827", label: "Cinema / teatre", pal: { W: "#ffffff", Y: "#facc15" }, g: [
    "WWWWWWWWW",
    "W.W.W.W.W",
    "WWWWWWWWW",
    ".........",
    "WWWWWWWWW",
    "W.......W",
    "W.YYYYY.W",
    "W.......W",
    "WWWWWWWWW"] },
  bed: { bg: "#0369a1", label: "Hotel", pal: { W: "#ffffff", P: "#bae6fd" }, g: [
    ".........",
    "W........",
    "WPP......",
    "WWWWWWWWW",
    "WWWWWWWWW",
    "W.......W",
    "W.......W",
    ".........",
    "........."] },
  phone: { bg: "#475569", label: "Telefonia", pal: { W: "#ffffff", S: "#7dd3fc" }, g: [
    "..WWWWW..",
    "..WSSSW..",
    "..WSSSW..",
    "..WSSSW..",
    "..WSSSW..",
    "..WSSSW..",
    "..WWWWW..",
    "..WW.WW..",
    "..WWWWW.."] },
  shop: { bg: "#64748b", label: "Botiga", pal: { W: "#ffffff" }, g: [
    "...WWW...",
    "..W...W..",
    "..W...W..",
    "WWWWWWWWW",
    "WWWWWWWWW",
    "WWWWWWWWW",
    "WWWWWWWWW",
    "WWWWWWWWW",
    "WWWWWWWWW"] },
};

const poiIcons = {};

// Rètol 15x18: placa amb vora clara, glif al mig i una punta que assenyala el lloc
function makePoiIcon(def) {
  const p = new Pix(15, 18);
  const bg = hex(def.bg), edge = shade(bg, 55), dark = shade(bg, -35);
  p.rect(0, 0, 15, 15, edge);
  p.rect(1, 1, 13, 13, bg);
  p.rect(1, 13, 13, 1, dark);
  p.rect(6, 15, 3, 1, edge); p.set(7, 16, edge);
  def.g.forEach((row, y) => [...row].forEach((ch, x) => { if (def.pal[ch]) p.set(3 + x, 3 + y, hex(def.pal[ch])); }));
  p.outline(OUTLINE);
  return p.toCanvas();
}

function initPois() {
  for (const [cat, def] of Object.entries(POI_ICONS)) poiIcons[cat] = makePoiIcon(def);
}

// Afegeix les icones visibles a la llista de sprites (es dibuixen ordenades per profunditat)
function pushPoiSprites(list, camX, camY, vw, vh, k) {
  if (ZOOMS[state.zoomIdx] < 1 || !state.meta.pois) return;
  const s = k * 0.85;
  for (const p of state.meta.pois) {
    const x = p.x * TS, y = p.y * TS;
    if (x < camX - 40 || x > camX + vw + 40 || y < camY - 10 || y > camY + vh + 60) continue;
    const img = poiIcons[p.c] || poiIcons.shop;
    list.push([y, img, Math.round(x - (img.width / 2) * s), Math.round(y - (img.height - 1) * s), false, s]);
  }
}

// Establiment més proper al jugador (per mostrar-lo al HUD)
function nearestPoi(tx, ty, maxDist = 4) {
  let best = null, bd = maxDist * maxDist;
  for (const p of state.meta.pois || []) {
    const d = (p.x - tx) ** 2 + (p.y - ty) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best && { name: best.n || POI_ICONS[best.c]?.label || "Botiga", label: POI_ICONS[best.c]?.label || "Botiga" };
}

// Nom de cada establiment sota la seva icona (en espai de pantalla, perquè es llegeixi nítid).
// Els més propers al jugador tenen prioritat i s'eviten els solapaments.
function drawPoiNames(camX, camY, z) {
  const zoom = ZOOMS[state.zoomIdx];
  if (zoom < 2 || !state.showLabels || !state.meta.pois) return;
  const W = canvas.width, H = canvas.height, pl = state.player;
  const vis = state.meta.pois.filter((p) => {
    const sx = (p.x * TS - camX) * z, sy = (p.y * TS - camY) * z;
    return sx > -150 && sx < W + 150 && sy > -20 && sy < H + 40;
  }).sort((a, b) => ((a.x * TS - pl.x) ** 2 + (a.y * TS - pl.y) ** 2) - ((b.x * TS - pl.x) ** 2 + (b.y * TS - pl.y) ** 2));
  const fs = Math.round(7 * dpr), pad = 3 * dpr;
  ctx.font = `${fs}px "Press Start 2P", monospace`;
  ctx.textBaseline = "middle";
  const placed = [];
  for (const p of vis) {
    const name = p.n || POI_ICONS[p.c]?.label || "Botiga";
    const sx = Math.round((p.x * TS - camX) * z), sy = Math.round((p.y * TS - camY) * z + 8 * dpr);
    const w = Math.ceil(ctx.measureText(name).width) + pad * 2, h = fs + pad * 2;
    const r = [sx - w / 2, sy - h / 2, w, h];
    if (placed.some((q) => r[0] < q[0] + q[2] + 2 && r[0] + r[2] + 2 > q[0] && r[1] < q[1] + q[3] + 2 && r[1] + r[3] + 2 > q[1])) continue;
    placed.push(r);
    ctx.fillStyle = "rgba(11,13,31,.78)";
    ctx.fillRect(r[0], r[1], w, h);
    ctx.fillStyle = POI_ICONS[p.c] ? shadeCss(POI_ICONS[p.c].bg) : "#ffffff";
    ctx.fillRect(r[0], r[1], 2 * dpr, h);
    ctx.fillStyle = p.n ? "#ffffff" : "#c9cbe0";
    ctx.fillText(name, r[0] + pad + dpr, sy + dpr);
  }
}

// Color de la icona aclarit perquè es vegi sobre el fons fosc de l'etiqueta
function shadeCss(h) {
  const c = shade(hex(h), 60);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
