// Capa de descoberta (boira de guerra): al principi només veus el que tens molt a prop, i el
// mapa i el minimapa es van descobrint a mesura que hi passes. El que has descobert es desa al
// navegador. Es treballa en cel·les de 4x4 caselles; la vora es difumina en dibuixar-la escalada.
"use strict";

const FOG_CELL = 4;                       // caselles per cel·la
const FOG_KEY = "santandreu-rpg-fog";
const FOG_COLOR = [11, 10, 18];

const fog = { w: 0, h: 0, bits: null, cv: null, ctx: null, img: null, dirty: false, saveT: 0, lastCell: -1 };

const fogOn = () => CFG.fog.enabled && fog.bits;

function initFog() {
  fog.w = Math.ceil(state.W / FOG_CELL); fog.h = Math.ceil(state.H / FOG_CELL);
  fog.bits = new Uint8Array(Math.ceil((fog.w * fog.h) / 8));
  try { // explorat anteriorment
    const saved = store.get(FOG_KEY);
    if (saved) {
      const raw = atob(saved);
      if (raw.length === fog.bits.length) for (let i = 0; i < raw.length; i++) fog.bits[i] = raw.charCodeAt(i);
    }
  } catch { /* dades antigues o malmeses */ }
  fog.cv = document.createElement("canvas");
  fog.cv.width = fog.w; fog.cv.height = fog.h;
  fog.ctx = fog.cv.getContext("2d");
  fog.img = fog.ctx.createImageData(fog.w, fog.h);
  for (let i = 0; i < fog.w * fog.h; i++) {
    fog.img.data[i * 4] = FOG_COLOR[0]; fog.img.data[i * 4 + 1] = FOG_COLOR[1]; fog.img.data[i * 4 + 2] = FOG_COLOR[2];
    fog.img.data[i * 4 + 3] = cellSeen(i) ? 0 : 255;
  }
  fog.ctx.putImageData(fog.img, 0, 0);
  addEventListener("pagehide", saveFog);
}

const cellSeen = (i) => (fog.bits[i >> 3] >> (i & 7)) & 1;

// L'has descobert? (coordenades en caselles)
function fogExplored(tx, ty) {
  if (!fogOn()) return true;
  const cx = Math.floor(tx / FOG_CELL), cy = Math.floor(ty / FOG_CELL);
  if (cx < 0 || cy < 0 || cx >= fog.w || cy >= fog.h) return false;
  return cellSeen(cy * fog.w + cx) === 1;
}

// Descobreix un cercle al voltant del jugador quan canvia de cel·la
function updateFog(dt) {
  if (!fogOn() || state.interior) return;
  const tx = state.player.x / TS, ty = state.player.y / TS;
  const cx = Math.floor(tx / FOG_CELL), cy = Math.floor(ty / FOG_CELL), cell = cy * fog.w + cx;
  if (cell !== fog.lastCell) {
    fog.lastCell = cell;
    const R = CFG.fog.radius / FOG_CELL, r = Math.ceil(R);
    let changed = false;
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= fog.w || y >= fog.h || (x - cx) ** 2 + (y - cy) ** 2 > R * R) continue;
      const i = y * fog.w + x;
      if (cellSeen(i)) continue;
      fog.bits[i >> 3] |= 1 << (i & 7);
      fog.img.data[i * 4 + 3] = 0;
      changed = true;
    }
    if (changed) { fog.ctx.putImageData(fog.img, 0, 0); fog.dirty = true; }
  }
  if (fog.dirty && (fog.saveT -= dt) <= 0) { fog.saveT = 3; saveFog(); }
}

function saveFog() {
  if (!fog.bits || !fog.dirty) return;
  fog.dirty = false;
  let s = "";
  for (let i = 0; i < fog.bits.length; i++) s += String.fromCharCode(fog.bits[i]);
  store.set(FOG_KEY, btoa(s));
}

// Boira sobre el mapa (es crida amb la transformació del món activa); la vora queda suau
function drawFog() {
  if (!fogOn()) return;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(fog.cv, 0, 0, fog.w * FOG_CELL * TS, fog.h * FOG_CELL * TS);
  ctx.restore();
}

// Boira sobre el minimapa
function drawFogMinimap(c, scale) {
  if (!fogOn()) return;
  c.save();
  c.imageSmoothingEnabled = true;
  c.drawImage(fog.cv, 0, 0, fog.w * FOG_CELL * scale, fog.h * FOG_CELL * scale);
  c.restore();
}

// Torna a tapar tot el mapa (excepte el voltant del jugador)
function resetFog() {
  fog.bits.fill(0);
  for (let i = 0; i < fog.w * fog.h; i++) fog.img.data[i * 4 + 3] = 255;
  fog.ctx.putImageData(fog.img, 0, 0);
  fog.lastCell = -1; fog.dirty = true;
  updateFog(0);
  saveFog();
}

addSystem({ init: initFog, update: updateFog, veil: drawFog, minimap: drawFogMinimap });
