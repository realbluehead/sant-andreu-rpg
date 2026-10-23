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

