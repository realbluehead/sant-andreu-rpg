// Interiors de bars, cafeteries, farmàcies i bancs. Davant d'un d'aquests llocs, la tecla O hi
// entra. Cada local és inventat (generat a partir del seu nom, sempre igual per a tothom) i
// l'acció es fa al taulell: cervesa a la barra del bar, cafè a la cafeteria, curar-se a la
// farmàcia i ingressar les monedes al banc. Es surt per la porta. Els jugadors que són al mateix
// local es veuen entre ells (el servidor reenvia en quina sala és cadascú).
"use strict";

const IN = { FLOOR: 0, WALL: 1, SIDE: 2, COUNTER: 3, TABLE: 4, CHAIR: 5, DOOR: 6, SHELF: 7, PLANT: 8, DARTS: 9, RUG: 10,
  RACK: 11, ATM: 12, ROPE: 13, CROSS: 14 };
const IN_BLOCK = new Set([IN.WALL, IN.SIDE, IN.COUNTER, IN.TABLE, IN.CHAIR, IN.SHELF, IN.PLANT, IN.DARTS, IN.RACK, IN.ATM, IN.ROPE, IN.CROSS]);
const ENTER_RADIUS = 4; // tiles (el punt del local sol ser dins de l'edifici)

// Tipus de local: d'on surten, què s'hi fa i com és el personal i la clientela
const VENUES = {
  bar: { poi: "beer", label: "el bar", tables: true,
    staff: { shirt: "#f4f1e8", pants: "#1b1b22" },
    staffLines: ["Què us poso?", "Una canya?", "Ara vinc!", "Marxant una de braves!"],
    guestLines: ["Salut!", "Una altra, si us plau!", "Quin gol ahir!", "Glup glup…", "Paguem a mitges?"],
    act: (room) => serveDrink("bar", room.name), hint: "Acosta't a la barra per demanar una cervesa" },
  cafe: { poi: "coffee", label: "la cafeteria", tables: true,
    staff: { shirt: "#7a4a2a", pants: "#2b2f3a" },
    staffLines: ["Un tallat?", "Amb llet de civada?", "Croissant recent fet!", "Bon dia!"],
    guestLines: ["Quin cafè més bo", "Necessitava això", "Treballo des d'aquí", "Un altre tallat?"],
    act: (room) => serveDrink("cafe", room.name), hint: "Acosta't a la barra per demanar un cafè" },
  pharmacy: { poi: "pharmacy", label: "la farmàcia", tables: false,
    staff: { shirt: "#ffffff", pants: "#5d6d7e" },
    staffLines: ["En què el puc ajudar?", "Té recepta?", "Una cada vuit hores"],
    guestLines: ["Tinc mal de cap…", "Necessito tiretes", "Quina cua!", "Atxim!"],
    act: () => healAtPharmacy(), hint: "Acosta't al taulell per curar-te" },
  bank: { poi: "bank", label: "el banc", tables: false,
    staff: { shirt: "#2c3e50", pants: "#1b1b22" },
    staffLines: ["Següent, si us plau", "Signi aquí", "Bon dia"],
    guestLines: ["Vull obrir un compte", "Quina cua…", "Em cobren comissió?", "Vinc a ingressar"],
    act: () => depositAtBank(), hint: "Acosta't al taulell per ingressar les monedes" },
};

// Paleta: bars i cafeteries amb els colors de la zona; farmàcies i bancs amb la seva pròpia
const INTERIOR_STYLE = [
  { floor: "#4a4452", floor2: "#3e3946", wall: "#3a2f4e", trim: "#d4af37", wood: "#4a2e1e", cloth: "#6a2a3a" }, // Bruixots
  { floor: "#9a6e44", floor2: "#8a6038", wall: "#d8c49a", trim: "#6a4a2a", wood: "#6b4426", cloth: "#5f8a3a" }, // Comarca
  { floor: "#a8743c", floor2: "#9a6a36", wall: "#efe0bd", trim: "#8a5a32", wood: "#6b4226", cloth: "#c8483c" }, // Heroi
  { floor: "#5a5048", floor2: "#4e463f", wall: "#6a4a3a", trim: "#b08d57", wood: "#3a2a1e", cloth: "#4f9a8a" }, // Vapor
  { floor: "#ffd6e8", floor2: "#fff6fa", wall: "#fff0f6", trim: "#ff8fbf", wood: "#e8a0c0", cloth: "#8fd9c8" }, // Kawaii
  { floor: "#e0e0d8", floor2: "#d0d0c8", wall: "#f8f0d8", trim: "#3060c0", wood: "#8a6a48", cloth: "#e04040" }, // Ruta
];
const KIND_STYLE = {
  pharmacy: { floor: "#eef3f0", floor2: "#e2ebe6", wall: "#f7fbf8", trim: "#2f9a5a", wood: "#d8e4dc", cloth: "#2f9a5a" },
  bank: { floor: "#d9d4c8", floor2: "#cbc5b6", wall: "#e8e2d4", trim: "#1f3a5a", wood: "#5a4636", cloth: "#7a1f2a" },
};

const interiors = new Map();
const venues = []; // { p (POI), kind }

function initInteriors() {
  for (const [kind, v] of Object.entries(VENUES)) {
    for (const p of state.meta.pois || []) if (p.c === v.poi) venues.push({ p, kind, id: `${kind}-${venues.length}` });
  }
  document.getElementById("enter-btn").addEventListener("click", (e) => { e.stopPropagation(); interact(); });
}

// Genera (i guarda) el local d'un establiment
function interiorFor(venue) {
  const idx = venues.indexOf(venue), key = venue.id;
  if (interiors.has(key)) return interiors.get(key);
  const V = VENUES[venue.kind], poi = venue.p;
  const r = rng(hash2(idx * 7 + 3, (poi.n || "").length * 131 + venue.kind.length));
  const shop = !V.tables;
  const W = (shop ? 12 : 15) + ((r() * (shop ? 5 : 8)) | 0), H = (shop ? 10 : 12) + ((r() * 4) | 0);
  const grid = new Uint8Array(W * H).fill(IN.FLOOR);
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) grid[y * W + x] = v; };
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? IN.WALL : grid[y * W + x]);
  for (let x = 0; x < W; x++) { set(x, 0, IN.WALL); set(x, 1, IN.WALL); set(x, H - 1, IN.SIDE); }
  for (let y = 0; y < H; y++) { set(0, y, IN.SIDE); set(W - 1, y, IN.SIDE); }
  const doorX = (W >> 1) - 1;
  set(doorX, H - 1, IN.DOOR); set(doorX + 1, H - 1, IN.DOOR);
  // taulell al llarg de la paret de dalt, amb prestatgeria al darrere
  const cw = shop ? Math.max(6, W - 4) : Math.max(6, Math.floor(W * (0.45 + r() * 0.2)));
  for (let x = 1; x <= cw; x++) { set(x, 1, IN.SHELF); set(x, 3, IN.COUNTER); }
  for (let x = 2; x < cw; x++) set(x, 4, IN.RUG); // zona d'atenció davant del taulell

  const patrons = [], standers = [], cups = [];
  if (V.tables) {
    if (venue.kind === "bar") set(W - 4, 1, IN.DARTS);
    for (let ty = 6; ty <= H - 4; ty += 3) for (let tx = 2; tx < W - 3; tx += 4) {
      const jx = tx + ((r() * 2) | 0);
      if (jx + 1 >= W - 1 || (Math.abs(jx - doorX) < 3 && ty >= H - 5) || r() < 0.1) continue;
      set(jx, ty, IN.TABLE); set(jx + 1, ty, IN.TABLE);
      for (const dx of [0, 1]) { if (at(jx + dx, ty - 1) === IN.FLOOR) set(jx + dx, ty - 1, IN.CHAIR); if (at(jx + dx, ty + 1) === IN.FLOOR) set(jx + dx, ty + 1, IN.CHAIR); }
    }
    set(1, H - 2, IN.PLANT); set(W - 2, H - 2, IN.PLANT);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (grid[y * W + x] !== IN.CHAIR || r() > 0.55) continue;
      const faceDown = at(x, y + 1) === IN.TABLE;
      patrons.push({ x: x * TS + 8, y: y * TS + 14, dir: faceDown ? "down" : "up", sprites: makeHeroSet(randomLook(r)), say: null, cd: r() * 8 });
      cups.push([x, faceDown ? y + 1 : y - 1]);
    }
  } else {
    // botiga: prestatges als costats i cua de clients dempeus
    for (let y = 5; y < H - 2; y++) { if (r() < 0.85) set(1, y, IN.RACK); if (r() < 0.85) set(W - 2, y, IN.RACK); }
    if (venue.kind === "pharmacy") set(Math.min(cw + 1, W - 2), 1, IN.CROSS);
    if (venue.kind === "bank") {
      for (let y = 5; y < H - 3; y += 2) set(W - 2, y, IN.ATM);
      for (let y = 6; y < H - 3; y++) set(doorX + 3, y, IN.ROPE); // cordó de la cua
    }
    set(1, H - 2, IN.PLANT);
    const q = 1 + ((r() * 3) | 0);
    for (let i = 0; i < q; i++) standers.push({ x: (doorX + 1 + (i % 2)) * TS, y: (5 + i) * TS + 14, dir: "up",
      sprites: makeHeroSet(randomLook(r)), say: null, cd: r() * 8 });
  }

  const th = sectorAt(Math.floor(poi.x), Math.floor(poi.y));
  const staffLook = { ...randomLook(r), ...V.staff, bottom: "pants", extra: venue.kind === "bank" ? "glasses" : "none", stripe: null };
  const staff = { x: 2 * TS, y: 2 * TS + 14, minX: 1.5 * TS, maxX: (cw - 0.5) * TS, dir: "down", frame: 0, anim: 0,
    target: null, wait: 1, sprites: makeHeroSet(staffLook), say: null, cd: 3 };
  const style = KIND_STYLE[venue.kind] || INTERIOR_STYLE[th];
  // un client fa de donant de missions (quests.js): si no n'hi ha cap, n'apareix un dempeus
  const giver = patrons[0] || standers[0] || (standers.push({ x: (doorX + 3) * TS, y: (H - 3) * TS + 14, dir: "up",
    sprites: makeHeroSet(randomLook(r)), say: null, cd: r() * 8 }), standers[0]);
  giver.name = giverName(venue);
  const room = { id: key, kind: venue.kind, name: poi.n || V.label, W, H, grid, doorX, cw, style, patrons, standers, staff, giver, cups, atCounter: false };
  room.canvas = renderInterior(room);
  interiors.set(key, room);
  if (interiors.size > 12) interiors.delete(interiors.keys().next().value);
  return room;
}

function randomLook(r) {
  const pick = (a) => a[(r() * a.length) | 0];
  return {
    ...DEFAULT_LOOK, name: "",
    skin: pick(["#ffe0bd", "#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#5c3a1e"]),
    hair: pick(["#1c1414", "#4a2b1a", "#8b5a2b", "#d6a756", "#9a9a9a", "#b5401f"]),
    hairStyle: pick(["short", "long", "ponytail", "afro", "bald"]),
    shirt: pick(["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#f1c40f", "#2c3e50", "#e67e22", "#ecf0f1"]),
    pants: pick(["#2c3e70", "#1f2a44", "#5d6d7e", "#7f5539"]), bottom: pick(["pants", "pants", "shorts", "skirt"]),
    extra: pick(["none", "none", "glasses", "cap"]), extraColor: pick(["#2b6cb0", "#c0392b", "#111111"]),
  };
}

// Pinta el local (terra, parets, mobles) en un canvas fix
function renderInterior(room) {
  const { W, H, grid, style: st, kind } = room;
  const cv = document.createElement("canvas");
  cv.width = W * TS; cv.height = H * TS;
  const c = cv.getContext("2d");
  const fill = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = grid[y * W + x], px = x * TS, py = y * TS, h = hash2(x + W * 7, y + H + kind.length);
    if (kind === "bank") { // marbre
      fill(px, py, TS, TS, (x + y) % 2 ? st.floor : st.floor2);
      if (h % 5 === 0) fill(px + (h % 9), py + 3, 6, 1, "rgba(120,110,100,.25)");
    } else if (kind === "pharmacy") {
      fill(px, py, TS, TS, (x + y) % 2 ? st.floor : st.floor2); fill(px, py, TS, 1, "rgba(0,0,0,.05)");
    } else { // taulons
      fill(px, py, TS, TS, (x + (y >> 1)) % 2 ? st.floor : st.floor2);
      fill(px, py + 7, TS, 1, "rgba(0,0,0,.12)"); fill(px + ((y % 2) * 8), py, 1, 8, "rgba(0,0,0,.12)");
    }
    if (v === IN.RUG) { fill(px, py + 2, TS, 12, st.cloth); fill(px, py + 3, TS, 1, "rgba(255,255,255,.35)"); fill(px, py + 12, TS, 1, "rgba(0,0,0,.25)"); }
    if (v === IN.WALL || v === IN.SHELF || v === IN.DARTS || v === IN.CROSS) {
      fill(px, py, TS, TS, st.wall);
      if (y === 1) { fill(px, py + 10, TS, 6, st.wood); fill(px, py + 10, TS, 1, st.trim); }
      if (y === 0) fill(px, py, TS, 2, "rgba(0,0,0,.25)");
    }
    if (v === IN.SHELF) {
      fill(px, py - 8, TS, 2, st.wood); fill(px, py + 2, TS, 2, st.wood);
      for (let i = 0; i < 3; i++) {
        const k = (h >> (i * 3)) % 5;
        if (kind === "bar") { // ampolles
          const col = ["#3f8a3a", "#8a3a2a", "#e8c040", "#3a5a9a", "#c8c8d0"][k];
          fill(px + 2 + i * 5, py - 14 + ((h >> i) & 1), 3, 6, col); fill(px + 3 + i * 5, py - 16 + ((h >> i) & 1), 1, 2, col);
        } else if (kind === "cafe") { // tasses i pots de cafè
          fill(px + 2 + i * 5, py - 13, 4, 4, ["#ffffff", "#f4e4c8", "#c8483c"][k % 3]); fill(px + 2 + i * 5, py - 3, 3, 5, "#6b4426");
        } else if (kind === "pharmacy") { // capses de medicaments
          fill(px + 1 + i * 5, py - 14, 4, 5, ["#ffffff", "#7fd0ff", "#ff8fbf", "#b8f0c8", "#ffe08a"][k]); fill(px + 1 + i * 5, py - 4, 4, 5, "#ffffff");
        } else { // arxivadors
          fill(px + 1 + i * 5, py - 14, 4, 6, ["#1f3a5a", "#5a4636", "#7a1f2a"][k % 3]); fill(px + 1 + i * 5, py - 4, 4, 5, "#c8c0a8");
        }
      }
    }
    if (v === IN.CROSS) { // creu verda de farmàcia
      fill(px + 5, py - 14, 6, 16, "#2fbf5a"); fill(px, py - 9, 16, 6, "#2fbf5a"); fill(px + 6, py - 13, 4, 14, "#5fe08a");
    }
    if (v === IN.DARTS) {
      c.fillStyle = "#1b1b22"; c.beginPath(); c.arc(px + 8, py - 2, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#e03030"; c.beginPath(); c.arc(px + 8, py - 2, 4, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#f4f1e8"; c.beginPath(); c.arc(px + 8, py - 2, 2, 0, Math.PI * 2); c.fill();
    }
    if (v === IN.SIDE) { fill(px, py, TS, TS, st.wood); fill(px, py, TS, 2, st.trim); }
    if (v === IN.DOOR) { fill(px, py, TS, TS, "#3a2a1e"); fill(px + 1, py + 2, 14, 14, kind === "bank" ? "#9ab8d0" : "#7a5030"); fill(px, py, TS, 2, "#ffd76a"); }
    if (v === IN.COUNTER) {
      fill(px, py - 2, TS, 6, st.trim); fill(px, py + 4, TS, 12, st.wood); fill(px, py + 4, TS, 1, "rgba(255,255,255,.25)");
      if (kind === "bar" && h % 3 === 0) { fill(px + 6, py - 9, 2, 7, "#c8ccd4"); fill(px + 5, py - 10, 4, 2, "#e8c040"); } // tirador
      if (kind === "cafe") {
        if (h % 4 === 0) { fill(px + 3, py - 10, 10, 8, "#c8ccd4"); fill(px + 4, py - 9, 8, 3, "#3a3a44"); fill(px + 7, py - 5, 2, 3, "#2b2f3a"); } // cafetera
        else if (h % 4 === 1) { fill(px + 2, py - 7, 12, 6, "rgba(200,230,255,.6)"); fill(px + 4, py - 4, 3, 2, "#e8b060"); fill(px + 9, py - 4, 3, 2, "#c88040"); } // vitrina
      }
      if (kind === "bank") { fill(px, py - 12, 1, 10, "#8a9aa8"); fill(px + 1, py - 12, 15, 10, "rgba(200,225,240,.45)"); } // vidre del caixer
      if (kind === "pharmacy" && h % 3 === 0) fill(px + 5, py - 6, 6, 4, "#ffffff");
    }
    if (v === IN.TABLE) {
      fill(px, py + 2, TS, 10, st.wood); fill(px, py + 2, TS, 2, "rgba(255,255,255,.25)"); fill(px, py + 12, TS, 4, "rgba(0,0,0,.35)");
      if (grid[y * W + x - 1] !== IN.TABLE) fill(px, py + 12, 2, 4, st.wood);
      if (grid[y * W + x + 1] !== IN.TABLE) fill(px + 14, py + 12, 2, 4, st.wood);
    }
    if (v === IN.CHAIR) { fill(px + 3, py + 4, 10, 8, st.cloth); fill(px + 3, py + 4, 10, 2, "rgba(255,255,255,.25)"); fill(px + 4, py + 12, 2, 4, st.wood); fill(px + 10, py + 12, 2, 4, st.wood); }
    if (v === IN.RACK) { // prestatge dempeus amb productes
      fill(px + 1, py - 6, 14, 22, st.wood); fill(px + 1, py - 6, 14, 1, st.trim);
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) fill(px + 2 + i * 4, py - 4 + j * 7, 3, 4, ["#ffffff", "#7fd0ff", "#ff8fbf", "#ffe08a", "#b8f0c8"][(h >> (i + j * 3)) % 5]);
    }
    if (v === IN.ATM) { // caixer automàtic
      fill(px + 2, py - 8, 12, 24, "#4a5560"); fill(px + 4, py - 5, 8, 6, "#7fd0ff"); fill(px + 5, py + 4, 6, 1, "#1b1b22"); fill(px + 3, py - 8, 10, 2, "#c0392b");
    }
    if (v === IN.ROPE) { fill(px + 7, py + 4, 2, 12, "#c8a050"); fill(px + 6, py + 2, 4, 3, "#e8c070"); fill(px + 8, py + 6, 1, 10, "#7a1f2a"); }
    if (v === IN.PLANT) {
      fill(px + 4, py + 9, 8, 7, "#8a5a32");
      c.fillStyle = "#3f8a3a"; c.beginPath(); c.arc(px + 8, py + 6, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#5fb35a"; c.beginPath(); c.arc(px + 6, py + 4, 3, 0, Math.PI * 2); c.fill();
    }
  }
  // gots i tasses als llocs ocupats
  for (const [x, y] of room.cups) {
    const px = x * TS + 6, py = y * TS + 3;
    if (kind === "cafe") { fill(px, py + 2, 4, 4, "#ffffff"); fill(px + 1, py + 2, 2, 1, "#6b4426"); fill(px + 4, py + 3, 1, 2, "#ffffff"); }
    else { fill(px, py, 4, 6, "#f0b030"); fill(px, py, 4, 2, "#fffbeb"); fill(px + 4, py + 2, 1, 3, "#fffbeb"); }
  }
  return cv;
}

// ---------------------------------------------------------------------------
// Entrar i sortir
function nearestVenue() {
  const tx = state.player.x / TS, ty = state.player.y / TS;
  let best = null, bd = ENTER_RADIUS * ENTER_RADIUS;
  for (const v of venues) {
    const d = (v.p.x - tx) ** 2 + (v.p.y + 0.5 - ty) ** 2;
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

function enterBar() {
  if (state.interior || npcs.dead || state.editing || state.chatting) return;
  const venue = nearestVenue();
  if (!venue) return showBanner("Per entrar has d'estar davant d'un bar, cafeteria, farmàcia o banc", "warn");
  if (state.riding) return showBanner("Deixa la bici en una estació abans d'entrar", "warn");
  updateZone(); // la zona del local queda al rètol mentre ets a dins
  state.outPos = { x: state.player.x, y: state.player.y };
  const room = interiorFor(venue);
  room.atCounter = false;
  state.interior = room;
  state.player.x = (room.doorX + 1) * TS;
  state.player.y = (room.H - 2) * TS + 14;
  state.player.dir = "up";
  state.cam.x = state.player.x; state.cam.y = state.player.y;
  state.follow = true;
  document.body.classList.add("indoors");
  showBanner(`Has entrat a ${room.name}`, "beer");
  updateEnterHint();
}

function exitBar() {
  const room = state.interior;
  state.interior = null;
  state.player.x = state.outPos.x;
  state.player.y = state.outPos.y + 6;
  state.player.dir = "down";
  document.body.classList.remove("indoors");
  if (room) showBanner(`Has sortit de ${room.name}`, "bank");
  updateEnterHint();
}

function interiorBlocked(tx, ty) {
  const room = state.interior;
  if (tx < 0 || ty < 0 || tx >= room.W || ty >= room.H) return true;
  return IN_BLOCK.has(room.grid[ty * room.W + tx]);
}
function interiorCollides(x, y) {
  const x0 = Math.floor((x - HB.w / 2) / TS), x1 = Math.floor((x + HB.w / 2 - 1) / TS);
  const y0 = Math.floor((y - HB.h) / TS), y1 = Math.floor((y - 1) / TS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (interiorBlocked(tx, ty)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Actualització i dibuix de l'interior
function updateInterior(dt) {
  const room = state.interior, V = VENUES[room.kind];
  const ftx = Math.floor(state.player.x / TS), fty = Math.floor((state.player.y - 1) / TS);
  if (room.grid[fty * room.W + ftx] === IN.DOOR) return exitBar();
  // al taulell: el personal t'atén un cop cada vegada que t'hi acostes
  const atCounter = fty === 4 && ftx >= 1 && ftx <= room.cw;
  if (atCounter && !room.atCounter && !npcs.dead) {
    const reply = V.act(room);
    room.staff.target = Math.min(room.staff.maxX, Math.max(room.staff.minX, state.player.x));
    room.staff.say = { text: reply, ttl: 2.5 };
    room.staff.cd = 6;
  }
  room.atCounter = atCounter;
  // el personal va amunt i avall darrere el taulell
  const w = room.staff;
  if (w.target === null && (w.wait -= dt) <= 0) w.target = w.minX + Math.random() * (w.maxX - w.minX);
  if (w.target !== null) {
    const d = w.target - w.x, step = 50 * dt;
    if (Math.abs(d) <= step) { w.x = w.target; w.target = null; w.wait = 1 + Math.random() * 3; w.dir = "down"; }
    else { w.x += Math.sign(d) * step; w.dir = d > 0 ? "right" : "left"; }
    w.anim += dt * 6; w.frame = w.target === null ? 0 : Math.floor(w.anim) % 4;
  }
  for (const p of [...room.patrons, ...room.standers, w]) {
    if (p.say && (p.say.ttl -= dt) <= 0) p.say = null;
    if ((p.cd -= dt) <= 0) {
      p.cd = 6 + Math.random() * 10;
      const lines = p === w ? V.staffLines : V.guestLines;
      if (Math.random() < 0.5) p.say = { text: lines[(Math.random() * lines.length) | 0], ttl: 2 };
    }
  }
  updateEnterHint();
}

function drawInterior() {
  const room = state.interior, z = ZOOMS[state.zoomIdx] * dpr, W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#0b0a12";
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  const ox = Math.round(state.cam.x * z), oy = Math.round(state.cam.y * z);
  ctx.setTransform(z, 0, 0, z, -ox, -oy);
  const camX = ox / z, camY = oy / z;
  ctx.drawImage(room.canvas, 0, 0);
  const k = HERO_SCREEN_SCALE / ZOOMS[state.zoomIdx], list = [], pl = state.player;
  list.push([pl.y, state.sprites.hero[pl.dir][pl.frame], Math.round(pl.x) - 8 * k, Math.round(pl.y) - 23 * k, false, k, { lift: jumpLift() * k }]);
  for (const o of net.others.values()) {
    if (o.room !== room.id) continue;
    list.push([o.y, o.sprites[o.dir][o.frame], Math.round(o.x) - 8, Math.round(o.y) - 23, false, 1]);
  }
  for (const p of room.patrons) list.push([p.y, p.sprites[p.dir][0], p.x - 8, p.y - 23, false, 1, { seat: true }]);
  for (const p of room.standers) list.push([p.y, p.sprites[p.dir][0], p.x - 8, p.y - 23, false, 1]);
  const w = room.staff;
  list.push([w.y, w.sprites[w.dir][w.frame], Math.round(w.x) - 8, Math.round(w.y) - 23, false, 1]);
  drawSprites(list);
  // llum del local: càlida als bars i cafeteries, neta a farmàcies i bancs
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const cx = (room.W * TS / 2 - camX) * z, cy = (room.H * TS / 2 - camY) * z, R = Math.max(room.W, room.H) * TS * z * 0.75;
  const warm = room.kind === "bar" || room.kind === "cafe";
  const gr = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
  gr.addColorStop(0, warm ? "rgba(255,200,120,0.08)" : "rgba(255,255,255,0.04)");
  gr.addColorStop(1, warm ? "rgba(20,10,20,0.55)" : "rgba(20,30,40,0.3)");
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  for (const o of net.others.values()) {
    if (o.room !== room.id) continue;
    drawNameTag(o.look.name, o.x, o.y, camX, camY, z, "#9fd3ff", 24 * z, o.look.level);
    drawBubble(o.bubble, o.x, o.y, camX, camY, z, 24 * z);
  }
  for (const p of room.patrons) if (p.say) drawBubble(p.say, p.x, p.y, camX, camY, z, 12 * z);
  for (const p of [...room.standers, w]) if (p.say) drawBubble(p.say, p.x, p.y, camX, camY, z, 14 * z);
  drawNameTag(state.look.name, pl.x, pl.y, camX, camY, z, "#ffffff", undefined, quests.level);
  drawBubble(state.bubble, pl.x, pl.y, camX, camY, z);
  drawNpcOverlay(camX, camY, z);
  runSystems("indoorOverlay", room, camX, camY, z);
}

// Tecla O / E i botó ENTRA: a dins, parla amb el donant de missions si el tens al costat; a fora, entra
function interact() {
  if (state.interior) tryTalk();
  else enterBar();
}

// Indicació "O: entrar" a fora, o què fer a dins
let enterNear = null;
function updateEnterHint() {
  const el = document.getElementById("enter-hint"), btn = document.getElementById("enter-btn");
  const venue = state.interior ? null : nearestVenue();
  const giver = state.interior ? nearGiver() : null;
  const key = state.interior ? state.interior.id + (giver ? ":talk" : "") : venue;
  if (key === enterNear) return;
  enterNear = key;
  el.classList.toggle("hidden", !venue && !state.interior);
  el.textContent = giver ? `O: parlar amb ${giver.name}`
    : state.interior ? `${VENUES[state.interior.kind].hint} · surt per la porta`
    : venue ? `O: entrar a ${venue.p.n || VENUES[venue.kind].label}` : "";
  btn.textContent = state.interior ? "PARLA" : "ENTRA";
  btn.classList.toggle("dim", !venue && !giver);
}

addSystem({ init: initInteriors, update: updateEnterHint, updateIndoors: updateInterior });
