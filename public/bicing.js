// Bicing: estacions reals (OpenStreetMap) on pots agafar una bici amb la tecla R i tornar-la
// en qualsevol altra estació. En bici vas CFG.bicing.speedMultiplier vegades més ràpid.
"use strict";

const bicing = { stations: [], dock: null, near: null };

function initBicing() {
  bicing.stations = (state.meta.pois || []).filter((p) => p.c === "bicing");
  bicing.dock = makeDock();
  state.sprites.rider = makeRiderSet(state.look);
  document.getElementById("bike-btn").addEventListener("click", (e) => { e.stopPropagation(); toggleBike(); });
}

function nearestStation() {
  const tx = state.player.x / TS, ty = state.player.y / TS, r = CFG.bicing.radius;
  let best = null, bd = r * r;
  for (const s of bicing.stations) {
    const d = (s.x - tx) ** 2 + (s.y + 0.6 - ty) ** 2;
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// R: agafar la bici en una estació o deixar-la en una estació
function toggleBike() {
  if (npcs.dead || state.editing || state.chatting) return;
  const st = nearestStation();
  if (!state.riding) {
    if (!st) return showBanner("Per agafar una bici has d'anar a una estació de Bicing", "warn");
    state.riding = true;
    showBanner(`Has agafat una bici a ${stationName(st)}`, "bank");
  } else {
    if (!st) return showBanner("Per deixar la bici has d'anar a una estació de Bicing", "warn");
    state.riding = false;
    showBanner(`Has deixat la bici a ${stationName(st)}`, "bank");
  }
  updateBikeUi();
}
const stationName = (s) => s.n ? `l'estació ${s.n}` : "l'estació";

function updateBicing() {
  const st = nearestStation();
  if (st !== bicing.near) { bicing.near = st; updateBikeUi(); }
}

function updateBikeUi() {
  const b = document.getElementById("bike-btn");
  b.classList.toggle("active", !!state.riding);
  b.classList.toggle("dim", !state.riding && !bicing.near);
  const hint = document.getElementById("bike-hint");
  hint.classList.toggle("hidden", !bicing.near);
  hint.textContent = state.riding ? "R: deixar la bici" : "R: agafar una bici";
}

function pushBicingSprites(list, camX, camY, vw, vh, k) {
  const img = bicing.dock;
  for (const s of bicing.stations) {
    const x = s.x * TS, y = s.y * TS + 12;
    if (x < camX - 60 || x > camX + vw + 60 || y < camY - 40 || y > camY + vh + 60) continue;
    list.push([y, img, Math.round(x - (img.width / 2) * k), Math.round(y - (img.height - 1) * k), false, 0]);
  }
}

// Estació: tòtem i quatre bicis vermelles aparcades
function makeDock() {
  const p = new Pix(34, 18), red = hex("#d8312b"), grey = hex("#9aa0a6"), dark = hex("#2b2f3a"), tyre = hex("#1b1b22");
  p.rect(0, 2, 4, 15, grey); p.rect(1, 3, 2, 4, hex("#7fd0ff")); p.rect(0, 0, 4, 2, red);   // tòtem amb pantalla
  p.rect(4, 15, 30, 2, dark);                                                                // base
  for (let i = 0; i < 4; i++) {
    const x = 6 + i * 7;
    p.rect(x, 7, 1, 8, dark);                                                               // ancoratge
    wheel(p, x + 2, 13, 2, tyre); wheel(p, x + 2, 8, 2, tyre);                              // rodes (vista de dalt)
    p.rect(x + 2, 8, 1, 6, red); p.rect(x, 7, 5, 1, dark);                                  // quadre i manillar
  }
  p.outline(OUTLINE);
  return p.toCanvas();
}

// Avatar damunt d'una bici vermella (2 fotogrames de pedalada per direcció)
function makeRiderSet(look) {
  const set = {};
  for (const d of DIRS) set[d] = [0, 1].map((f) => makeRider(look, d, f));
  return set;
}
function makeRider(look, dir, f) {
  const cv = document.createElement("canvas");
  cv.width = 22; cv.height = 28;
  const c = cv.getContext("2d");
  const p = new Pix(22, 28), red = hex("#d8312b"), tyre = hex("#1b1b22"), hub = hex("#c8ccd4"), dark = hex("#2b2f3a");
  const side = dir === "left" || dir === "right";
  if (side) {
    wheel(p, 4, 23, 4, tyre); wheel(p, 17, 23, 4, tyre); p.set(4, 23, hub); p.set(17, 23, hub);
    for (let i = 0; i <= 8; i++) p.set(5 + i, 22 - (i >> 2), red);                            // tub inferior
    p.rect(8, 16, 1, 7, red); p.rect(8, 16, 8, 1, red); p.rect(16, 15, 1, 8, red);             // quadre
    p.rect(6, 15, 4, 1, dark); p.rect(15, 13, 3, 1, dark);                                    // selló i manillar
    p.rect(f ? 7 : 10, 22 + (f ? 1 : -1), 2, 1, dark);                                         // pedal
  } else {
    p.rect(10, 18, 2, 10, tyre); p.rect(10, 22, 2, 2, hub);
    p.rect(4, 15, 14, 1, dark); p.rect(10, 15, 2, 4, red);
    p.rect(f ? 7 : 13, 21, 2, 1, dark);
  }
  p.outline(OUTLINE);
  const parts = p.toCanvas(), body = makeHero(dir, f ? 1 : 2, look);
  const drawParts = () => {
    if (dir === "left") { c.save(); c.translate(22, 0); c.scale(-1, 1); c.drawImage(parts, 0, 0); c.restore(); }
    else c.drawImage(parts, 0, 0);
  };
  // d'esquena el cos tapa el manillar; de cara i de costat, la bici queda per davant de les cames
  if (dir === "up") { drawParts(); c.drawImage(body, 3, 0); }
  else { c.drawImage(body, 3, 0); drawParts(); }
  return cv;
}
