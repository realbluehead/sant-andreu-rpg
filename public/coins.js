// Monedes compartides: el servidor les crea (una cada 5 s, màxim 50) i quan algú n'agafa
// una desapareix per a tothom. Aquí les dibuixem, les recollim i indiquem a quants metres
// és el tresor més proper. Al minimapa no surten a propòsit.
"use strict";

const COIN_KEY = "santandreu-rpg-coins";
const PICK_DIST = 0.9;   // tiles
const PENDING_MS = 2000; // temps d'espera de la confirmació del servidor

const coins = { list: new Map(), pending: new Map(), count: loadCoinCount(), sprites: null, nearest: null };

function loadCoinCount() {
  try { return Math.max(0, parseInt(localStorage.getItem(COIN_KEY) || "0", 10) || 0); } catch { return 0; }
}
function saveCoinCount() {
  try { localStorage.setItem(COIN_KEY, String(coins.count)); } catch { /* sense emmagatzematge */ }
}

function initCoins() {
  coins.sprites = [0, 1, 2, 3].map(makeCoinFrame);
  updateCoinUi();
}

// Missatges del servidor relacionats amb monedes (cridat des de net.onMessage)
function coinsOnMessage(m) {
  if (m.t === "welcome") {
    coins.list = new Map((m.coins || []).map((c) => [c.id, c]));
    coins.pending.clear();
  } else if (m.t === "coin") {
    coins.list.set(m.c.id, m.c);
  } else if (m.t === "taken") {
    coins.list.delete(m.id);
    coins.pending.delete(m.id);
    if (m.by === net.id) {
      coins.count++;
      saveCoinCount();
      updateCoinUi(true);
      npcs.floaters.push({ text: "+1", t: 0, color: "#facc15" });
    }
  }
}
function coinsOnDisconnect() {
  coins.list.clear();
  coins.pending.clear();
}

function updateCoins() {
  const pl = state.player, tx = pl.x / TS, ty = pl.y / TS, now = Date.now();
  for (const [id, t] of coins.pending) if (now - t > PENDING_MS) coins.pending.delete(id);
  let best = null, bd = Infinity;
  for (const c of coins.list.values()) {
    const d = Math.hypot(c.x - tx, c.y - ty);
    if (d < PICK_DIST && !npcs.dead && net.connected && !coins.pending.has(c.id)) {
      coins.pending.set(c.id, now);
      net.send({ t: "take", id: c.id, x: Math.round(pl.x), y: Math.round(pl.y) });
    }
    if (d < bd) { bd = d; best = c; }
  }
  coins.nearest = best ? { c: best, meters: Math.round(bd * state.meta.metersPerTile) } : null;
}

function updateCoinUi(bump) {
  const el = document.getElementById("coins");
  el.querySelector("span").textContent = coins.count;
  if (bump) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
}

let lastTreasure = "";
function updateTreasureHud() {
  const el = document.getElementById("treasure");
  const text = !net.connected ? "" : coins.nearest ? `Tresor més proper: ${coins.nearest.meters} m` : "Cap tresor al barri ara mateix";
  if (text !== lastTreasure) { el.textContent = text; el.classList.toggle("hidden", !text); lastTreasure = text; }
}

// ---------------------------------------------------------------------------
// Dibuix
function pushCoinSprites(list, camX, camY, vw, vh, k) {
  const now = Date.now(), s = k * 0.8;
  for (const c of coins.list.values()) {
    const x = c.x * TS, y = c.y * TS;
    if (x < camX - 40 || x > camX + vw + 40 || y < camY - 40 || y > camY + vh + 40) continue;
    const img = coins.sprites[Math.floor(now / 140 + c.id) % 4];
    const bob = Math.sin(now / 300 + c.id) * 2;
    list.push([y, img, Math.round(x - (img.width / 2) * s), Math.round(y - (img.height + 2) * s + bob), false, s]);
  }
}

// Fletxa a la vora de la pantalla que apunta al tresor més proper quan no es veu
function drawTreasurePointer(camX, camY, z) {
  if (!coins.nearest || npcs.dead) return;
  const { c, meters } = coins.nearest, pl = state.player;
  const W = canvas.width, H = canvas.height;
  const px = (pl.x - camX) * z, py = (pl.y - camY) * z;
  const cx = (c.x * TS - camX) * z, cy = (c.y * TS - camY) * z;
  const margin = 46 * dpr;
  const onScreen = cx > margin && cx < W - margin && cy > margin && cy < H - margin;
  ctx.font = `${Math.round(8 * dpr)}px "Press Start 2P", monospace`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  let ax, ay, ang;
  if (onScreen) {
    // a la vista: només una etiqueta petita sobre la moneda
    ax = cx; ay = cy - 26 * dpr; ang = null;
  } else {
    const dx = cx - px, dy = cy - py;
    let t = Infinity;
    if (dx > 0) t = Math.min(t, (W - margin - px) / dx);
    if (dx < 0) t = Math.min(t, (margin - px) / dx);
    if (dy > 0) t = Math.min(t, (H - margin - py) / dy);
    if (dy < 0) t = Math.min(t, (margin - py) / dy);
    ax = px + dx * t; ay = py + dy * t; ang = Math.atan2(dy, dx);
  }
  ctx.save();
  if (ang !== null) {
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    const r = 12 * dpr;
    ctx.beginPath();
    ctx.moveTo(r, 0); ctx.lineTo(-r * 0.7, -r * 0.75); ctx.lineTo(-r * 0.35, 0); ctx.lineTo(-r * 0.7, r * 0.75); ctx.closePath();
    ctx.fillStyle = "#facc15"; ctx.strokeStyle = "#1a1420"; ctx.lineWidth = 3 * dpr;
    ctx.stroke(); ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // etiqueta cap a l'interior de la pantalla
    ax -= Math.cos(ang) * 30 * dpr; ay -= Math.sin(ang) * 22 * dpr;
  }
  const label = `${meters} m`, w = ctx.measureText(label).width + 10 * dpr, h = 16 * dpr;
  ctx.fillStyle = "rgba(11,13,31,.8)";
  ctx.fillRect(ax - w / 2, ay - h / 2, w, h);
  ctx.fillStyle = "#facc15";
  ctx.fillText(label, ax, ay + dpr);
  ctx.restore();
  ctx.textAlign = "left";
}

// Moneda de 10x10 que gira (4 fotogrames)
function makeCoinFrame(f) {
  const p = new Pix(10, 10);
  const gold = hex("#facc15"), rim = hex("#b45309"), hi = hex("#fef9c3"), mid = hex("#eab308");
  const half = [4.6, 3.2, 1.1, 3.2][f];
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    const dx = (x - 4.5) / half, dy = (y - 4.5) / 4.6, d = dx * dx + dy * dy;
    if (d <= 1) p.set(x, y, d > 0.6 ? rim : gold);
  }
  if (f !== 2) {
    p.rect(4, 3, 2, 4, mid);
    if (f === 0) { p.set(3, 2, hi); p.set(2, 3, hi); }
  } else {
    p.rect(4, 1, 2, 8, mid);
  }
  p.outline(OUTLINE);
  return p.toCanvas();
}
