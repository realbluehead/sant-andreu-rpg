// HUD: panell d'informació (carrer i lloc on ets) i avisos breus.
"use strict";

const escapeHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// HUD
const hud = document.getElementById("location-text");
let hudTimer = 0, lastHud = "";
function updateHud(dt) {
  hudTimer -= dt;
  if (hudTimer > 0) return;
  hudTimer = 0.15;
  if (state.interior) {
    const html = `<div class="street">${escapeHtml(state.interior.name)}</div>`;
    if (html !== lastHud) { hud.innerHTML = html; lastHud = html; }
    return;
  }
  const tx = state.player.x / TS, ty = state.player.y / TS;
  const street = nearestStreet(tx, ty);
  const place = nearestPlace(tx, ty);
  const poi = nearestPoi(tx, ty);
  const placeText = poi ? (poi.name !== poi.label ? `${poi.name} (${poi.label})` : poi.name) : place?.name;
  // al panell: només el carrer i el lloc més proper
  const html = (street ? `<div class="street">${escapeHtml(street)}</div>` : "") +
    (placeText ? `<div class="place">> ${escapeHtml(placeText)}</div>` : "");
  if (html !== lastHud) { hud.innerHTML = html; lastHud = html; }
}

const toastEl = document.getElementById("toast");
let toastT;
function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.remove("hidden");
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.add("hidden"), 1600);
}


// Fletxa a la vora de la pantalla cap a un punt del món (wx, wy en píxels del món); si el punt es
// veu, només hi posa l'etiqueta a sobre. La fan servir el tresor més proper i la missió seguida.
function drawEdgePointer(wx, wy, label, color, camX, camY, z) {
  const pl = state.player, W = canvas.width, H = canvas.height;
  const px = (pl.x - camX) * z, py = (pl.y - camY) * z;
  const cx = (wx - camX) * z, cy = (wy - camY) * z;
  const margin = 46 * dpr;
  const onScreen = cx > margin && cx < W - margin && cy > margin && cy < H - margin;
  ctx.font = `${Math.round(8 * dpr)}px "Press Start 2P", monospace`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  let ax, ay, ang;
  if (onScreen) {
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
    ctx.fillStyle = color; ctx.strokeStyle = "#1a1420"; ctx.lineWidth = 3 * dpr;
    ctx.stroke(); ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // etiqueta cap a l'interior de la pantalla
    ax -= Math.cos(ang) * 30 * dpr; ay -= Math.sin(ang) * 22 * dpr;
  }
  const w = ctx.measureText(label).width + 10 * dpr, h = 16 * dpr;
  ax = Math.max(w / 2 + 4 * dpr, Math.min(W - w / 2 - 4 * dpr, ax));
  ctx.fillStyle = "rgba(11,13,31,.8)";
  ctx.fillRect(ax - w / 2, ay - h / 2, w, h);
  ctx.fillStyle = color;
  ctx.fillText(label, ax, ay + dpr);
  ctx.restore();
  ctx.textAlign = "left";
}
