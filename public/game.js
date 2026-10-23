// Sant Andreu RPG — game.js: mapa en chunks, rètols, minimapa, moviment del jugador, dibuix de
// cada fotograma i arrencada del joc (main). Els mòduls s'hi enganxen via addSystem (core.js).
"use strict";

// ---------------------------------------------------------------------------
// Chunks
function renderChunk(cx, cy) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = CHUNK * TS;
  const c = cv.getContext("2d");
  const x0 = cx * CHUNK, y0 = cy * CHUNK;
  // 1a passada: teulades texturitzades píxel a píxel (roofs.js)
  const img = c.createImageData(CHUNK * TS, CHUNK * TS);
  for (let ty = y0; ty < y0 + CHUNK; ty++) for (let tx = x0; tx < x0 + CHUNK; tx++) {
    if (tx >= state.W || ty >= state.H) continue;
    const v = g(tx, ty) & 127;
    if (v >= BUILDING_BASE && isBuilding(g(tx, ty + 1))) paintRoofTile(img.data, CHUNK * TS, (tx - x0) * TS, (ty - y0) * TS, tx, ty, v, sectorAt(tx, ty));
  }
  c.putImageData(img, 0, 0);
  // 2a passada: terra, façanes, vores i ombres
  for (let ty = y0; ty < y0 + CHUNK; ty++) for (let tx = x0; tx < x0 + CHUNK; tx++) {
    if (tx >= state.W || ty >= state.H) continue;
    const raw = g(tx, ty), v = raw & 127, outside = raw & OUTSIDE;
    const px = (tx - x0) * TS, py = (ty - y0) * TS;
    const hv = hash2(tx, ty), th = sectorAt(tx, ty), theme = THEMES[th];
    if (v >= BUILDING_BASE) {
      const below = g(tx, ty + 1);
      if (!isBuilding(below)) {
        c.drawImage(getTile("f", v, hv % 4, th), px, py);
        c.fillStyle = theme.outline;
        if ((g(tx - 1, ty) & 127) !== v) c.fillRect(px, py, 1, TS);
        if ((g(tx + 1, ty) & 127) !== v) c.fillRect(px + TS - 1, py, 1, TS);
        c.fillRect(px, py + TS - 1, TS, 1);
      } else {
        const up = g(tx, ty - 1), lf = g(tx - 1, ty), rt = g(tx + 1, ty);
        // Contorn fosc de cada teulada (com els RPG de 16 bits) i carener il·luminat a dalt
        c.fillStyle = theme.outline;
        if ((up & 127) !== v) { c.fillRect(px, py, TS, 1); c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(px, py + 1, TS, 1); c.fillStyle = theme.outline; }
        if ((lf & 127) !== v) c.fillRect(px, py, 1, TS);
        if ((rt & 127) !== v) c.fillRect(px + TS - 1, py, 1, TS);
        // ràfec: ombra a la part de baix de la teulada, just damunt de la façana
        if (!isBuilding(g(tx, ty + 2)) && (below & 127) === v) { c.fillStyle = "rgba(20,10,30,.35)"; c.fillRect(px, py + TS - 3, TS, 3); }
      }
    } else {
      let variant = hv % 4;
      if (v === T.PITCH) variant = (tx >> 1) & 1;
      if (v === T.ROAD_LINE) variant = 0;
      c.drawImage(getTile("g", v, variant, th), px, py);
      // vorada entre calçada i vorera
      if (ROADISH.has(v)) {
        c.fillStyle = theme.curb; // vorada
        if (!ROADISH.has(g(tx, ty - 1) & 127)) c.fillRect(px, py, TS, 2);
        if (!ROADISH.has(g(tx, ty + 1) & 127)) c.fillRect(px, py + TS - 2, TS, 2);
        if (!ROADISH.has(g(tx - 1, ty) & 127)) c.fillRect(px, py, 2, TS);
        if (!ROADISH.has(g(tx + 1, ty) & 127)) c.fillRect(px + TS - 2, py, 2, TS);
      }
      // ombres dels edificis (llum des de dalt a l'esquerra)
      c.fillStyle = "rgba(20,15,40,.28)";
      if (isBuilding(g(tx, ty - 1))) c.fillRect(px, py, TS, 5);
      if (isBuilding(g(tx - 1, ty))) c.fillRect(px, py, 4, TS);
    }
    if (outside) { c.fillStyle = "rgba(24,20,48,.42)"; c.fillRect(px, py, TS, TS); }
  }
  return cv;
}

function getChunk(cx, cy) {
  const key = cx + "," + cy;
  let cv = state.chunks.get(key);
  if (cv) { state.chunks.delete(key); state.chunks.set(key, cv); return cv; }
  cv = renderChunk(cx, cy);
  state.chunks.set(key, cv);
  if (state.chunks.size > CHUNK_CACHE) state.chunks.delete(state.chunks.keys().next().value);
  return cv;
}

// ---------------------------------------------------------------------------
// Carrers i rètols
function buildLabels() {
  const { streets, places } = state.meta;
  for (const s of streets) {
    for (const line of s.lines) {
      for (let i = 0; i < line.length - 1; i++) state.segs.push([line[i][0], line[i][1], line[i + 1][0], line[i + 1][1], s.name]);
      // un rètol cada ~60 tiles de carrer
      let acc = 30;
      for (let i = 0; i < line.length - 1; i++) {
        const [x0, y0] = line[i], [x1, y1] = line[i + 1];
        const L = Math.hypot(x1 - x0, y1 - y0);
        while (acc <= L) {
          const t = acc / L;
          state.labels.push({ text: s.name, x: x0 + t * (x1 - x0), y: y0 + t * (y1 - y0), kind: "street" });
          acc += 60;
        }
        acc -= L;
      }
    }
  }
  const important = new Set(["plaza", "park", "marketplace", "place_of_worship", "library", "arts_centre", "community_centre", "station", "historic", "townhall", "theatre"]);
  for (const p of places) if (important.has(p.kind)) state.labels.push({ text: p.name, x: p.x, y: p.y, kind: "place" });
}

function nearestStreet(x, y) {
  let best = null, bd = 9 * 9;
  for (const [x0, y0, x1, y1, name] of state.segs) {
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L2));
    const ex = x - x0 - t * dx, ey = y - y0 - t * dy, d = ex * ex + ey * ey;
    if (d < bd) { bd = d; best = name; }
  }
  return best;
}
function nearestPlace(x, y) {
  let best = null, bd = 25 * 25;
  for (const p of state.meta.places) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Minimapa
const mm = document.getElementById("minimap");
const mmCtx = mm.getContext("2d");
let mmBase = null, mmScale = 1;
const MM_COLORS = {
  [T.GROUND]: "#6cc04a", [T.GRASS]: "#6cc04a", [T.PARK]: "#62b444", [T.ROAD]: "#a89c84", [T.ROAD_LINE]: "#a89c84",
  [T.SIDEWALK]: "#e2c487", [T.PLAZA]: "#d8d0b8", [T.CYCLEWAY]: "#d39a68", [T.STEPS]: "#d8d0b8", [T.CROSSWALK]: "#a89c84",
  [T.WATER]: "#3f8ae0", [T.RAIL]: "#8a6a4a", [T.SAND]: "#f0dca0", [T.PITCH]: "#5fb546", [T.PARKING]: "#988c76",
  [T.GRAVEL]: "#c4b89c", [T.PLAYGROUND]: "#efd28e", [T.POOL]: "#6fd0f0", [T.DIRT]: "#b98a55", [T.FOREST]: "#3c8a3a",
  [T.SCHOOLYARD]: "#e2c487", [T.CONCRETE]: "#c9c6bb", [T.RUINS]: "#a39684", [T.TRACK]: "#c8683f",
};
function buildMinimap() {
  const { W, H } = state;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d"), img = c.createImageData(W, H);
  const lut = [];
  for (let v = 0; v < 256; v++) {
    const id = v & 127;
    const b = id - BUILDING_BASE;
    let col = id >= BUILDING_BASE ? (ROOF[(b / 4) | 0] ? roofColor((b / 4) | 0, b % 4) : [128, 128, 128]) : hex(MM_COLORS[id] || "#ff00ff");
    if (id >= BUILDING_BASE) col = shade(col, -10);
    if (v & OUTSIDE) col = col.map((k) => k * 0.55 + 10);
    lut[v] = col;
  }
  for (let i = 0; i < W * H; i++) {
    const col = lut[state.ground[i]];
    img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
  }
  // fronteres entre zones temàtiques
  if (state.sector) {
    const sec = state.sector;
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
      const i = y * W + x;
      if (sec[i] !== sec[i + 1] || sec[i] !== sec[i + W]) {
        img.data[i * 4] = 255; img.data[i * 4 + 1] = 240; img.data[i * 4 + 2] = 200;
      }
    }
  }
  c.putImageData(img, 0, 0);
  mmBase = cv;
  const maxH = Math.min(300, innerHeight * 0.42);
  mmScale = maxH / H;
  mm.width = Math.round(W * mmScale); mm.height = Math.round(H * mmScale);
}
function drawMinimap() {
  if (!state.showMinimap) return;
  mmCtx.imageSmoothingEnabled = true;
  mmCtx.drawImage(mmBase, 0, 0, mm.width, mm.height);
  runSystems("minimap", mmCtx, mmScale);
  const z = ZOOMS[state.zoomIdx];
  const vw = canvas.width / dpr / z / TS, vh = canvas.height / dpr / z / TS;
  mmCtx.strokeStyle = "#ffd35a"; mmCtx.lineWidth = 1;
  mmCtx.strokeRect(state.cam.x / TS * mmScale + .5, state.cam.y / TS * mmScale + .5, vw * mmScale, vh * mmScale);
  const px = state.player.x / TS * mmScale, py = state.player.y / TS * mmScale;
  for (const o of net.others.values()) {
    if (o.room || !fogExplored(o.x / TS, o.y / TS)) continue; // és dins d'un bar o en zona per descobrir
    const ox = o.x / TS * mmScale, oy = o.y / TS * mmScale;
    mmCtx.fillStyle = "#1a1420"; mmCtx.fillRect(ox - 2.5, oy - 2.5, 5, 5);
    mmCtx.fillStyle = "#5fb3ff"; mmCtx.fillRect(ox - 1.5, oy - 1.5, 3, 3);
  }
  // jugador seleccionat amb un clic: anella que parpelleja uns segons
  const f = state.mmFocus, fo = f && net.others.get(f.id);
  if (fo && performance.now() < f.until && Math.floor(performance.now() / 250) % 2) {
    mmCtx.strokeStyle = "#ffffff"; mmCtx.lineWidth = 1.5;
    mmCtx.beginPath(); mmCtx.arc(fo.x / TS * mmScale, fo.y / TS * mmScale, 6, 0, Math.PI * 2); mmCtx.stroke();
  }
  mmCtx.fillStyle = "#1a1420"; mmCtx.fillRect(px - 3, py - 3, 6, 6);
  mmCtx.fillStyle = "#ff4d4d"; mmCtx.fillRect(px - 2, py - 2, 4, 4);
}

// ---------------------------------------------------------------------------
// Joc
function findWalkable(tx, ty) {
  for (let r = 0; r < 60; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = tx + dx, y = ty + dy;
    if (!blocked(x, y) && !blocked(x - 1, y) && !blocked(x + 1, y)) return [x, y];
  }
  return [tx, ty];
}
// Posició guardada al navegador per tornar al mateix lloc en recarregar
const POS_KEY = "santandreu-rpg-pos";
function loadPosition() {
  const p = store.getJSON(POS_KEY);
  if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0 && p.x < state.W && p.y < state.H) return [p.x, p.y];
  return null;
}
function savePosition() {
  const p = state.interior ? state.outPos : state.player; // dins d'un bar, es desa la porta del bar
  store.setJSON(POS_KEY, { x: +((p.x - TS / 2) / TS).toFixed(2), y: +((p.y - TS + 2) / TS).toFixed(2) });
}

function placePlayer(tx, ty) {
  const [x, y] = findWalkable(Math.round(tx), Math.round(ty));
  state.player.x = x * TS + TS / 2;
  state.player.y = y * TS + TS - 2;
  state.follow = true;
}

const HB = { w: 10, h: 6 }; // caixa de col·lisió als peus
function collides(x, y) {
  if (state.interior) return interiorCollides(x, y);
  const x0 = Math.floor((x - HB.w / 2) / TS), x1 = Math.floor((x + HB.w / 2 - 1) / TS);
  const y0 = Math.floor((y - HB.h) / TS), y1 = Math.floor((y - 1) / TS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (blocked(tx, ty)) return true;
  return !state.noclip && worldBlocks(x, y); // camions i bosses d'escombraries (world.js)
}

function update(dt) {
  const frozen = state.editing || state.chatting || npcs.dead || state.onTitle || state.dialog;
  const k = frozen ? new Set() : state.keys, pl = state.player;
  let dx = 0, dy = 0;
  if (k.has("ArrowLeft") || k.has("KeyA")) dx -= 1;
  if (k.has("ArrowRight") || k.has("KeyD")) dx += 1;
  if (k.has("ArrowUp") || k.has("KeyW")) dy -= 1;
  if (k.has("ArrowDown") || k.has("KeyS")) dy += 1;
  if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
  // joystick tàctil (analògic)
  const joy = state.joy;
  if (!frozen && joy.active && Math.hypot(joy.x, joy.y) > 0.2) { dx = joy.x; dy = joy.y; }
  pl.moving = dx !== 0 || dy !== 0;
  if (pl.moving) [dx, dy] = drunkWobble(dx, dy); // com més embriagat, més ziga-zaga
  if (pl.moving) {
    state.follow = true;
    const running = k.has("ShiftLeft") || k.has("ShiftRight") || state.touchRun;
    const speed = (state.riding ? CFG.player.walkSpeed * CFG.bicing.speedMultiplier // en bici
      : running ? CFG.player.runSpeed : CFG.player.walkSpeed) * (state.noclip ? 2 : 1) * (world.swimming ? 0.55 : 1);
    const mx = dx * speed * dt, my = dy * speed * dt;
    if (!collides(pl.x + mx, pl.y)) pl.x += mx;
    if (!collides(pl.x, pl.y + my)) pl.y += my;
    pl.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    pl.anim += dt * (speed > 100 ? 14 : 8);
    pl.frame = Math.floor(pl.anim) % 4;
  } else {
    pl.frame = 0;
  }
  // càmera
  const z = ZOOMS[state.zoomIdx];
  const vw = canvas.width / dpr / z, vh = canvas.height / dpr / z;
  if (state.follow) {
    const tx = pl.x - vw / 2, ty = pl.y - vh / 2;
    const a = 1 - Math.pow(0.0005, dt);
    state.cam.x += (tx - state.cam.x) * a;
    state.cam.y += (ty - state.cam.y) * a;
  }
  const mw = (state.interior ? state.interior.W : state.W) * TS, mh = (state.interior ? state.interior.H : state.H) * TS;
  state.cam.x = vw > mw ? (mw - vw) / 2 : Math.max(0, Math.min(mw - vw, state.cam.x));
  state.cam.y = vh > mh ? (mh - vh) / 2 : Math.max(0, Math.min(mh - vh, state.cam.y));
}

function draw() {
  const z = ZOOMS[state.zoomIdx] * dpr;
  const W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#10121f";
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  const ox = Math.round(state.cam.x * z), oy = Math.round(state.cam.y * z);
  ctx.setTransform(z, 0, 0, z, -ox, -oy);
  const camX = ox / z, camY = oy / z, vw = W / z, vh = H / z;

  // terra
  const csz = CHUNK * TS;
  for (let cy = Math.floor(camY / csz); cy <= Math.floor((camY + vh) / csz); cy++)
    for (let cx = Math.floor(camX / csz); cx <= Math.floor((camX + vw) / csz); cx++) {
      if (cx < 0 || cy < 0 || cx * CHUNK >= state.W || cy * CHUNK >= state.H) continue;
      ctx.drawImage(getChunk(cx, cy), cx * csz, cy * csz);
    }
  runSystems("ground", camX, camY, vw, vh);

  // límit del barri
  ctx.save();
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,211,90,.85)"; ctx.setLineDash([8, 6]);
  ctx.beginPath();
  for (const ring of state.meta.boundary) ring.forEach(([x, y], i) => i ? ctx.lineTo(x * TS, y * TS) : ctx.moveTo(x * TS, y * TS));
  ctx.stroke();
  ctx.restore();

  // objectes ordenats per profunditat
  const S = state.sprites, list = [];
  const tx0 = Math.max(0, Math.floor(camX / TS) - 1), tx1 = Math.min(state.W - 1, Math.ceil((camX + vw) / TS) + 1);
  const ty0 = Math.max(0, Math.floor(camY / TS) - 1), ty1 = Math.min(state.H - 1, Math.ceil((camY + vh) / TS) + 2);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const d = state.decor[ty * state.W + tx];
    if (!d) continue;
    const bx = tx * TS + TS / 2, by = ty * TS + TS;
    let img;
    const th = sectorAt(tx, ty);
    if (d === D.TREE) img = S.trees[th][hash2(tx, ty) % S.trees[th].length];
    else if (d === D.TREE2) img = S.pines[th][hash2(tx, ty) % S.pines[th].length];
    else if (d === D.LAMP) img = S.lamp;
    else if (d === D.BENCH) img = S.bench;
    else if (d === D.FOUNTAIN) img = S.fountain;
    list.push([by, img, bx - img.width / 2, by - img.height + (d === D.BENCH ? -2 : 0), d === D.TREE || d === D.TREE2]);
  }
  const pl = state.player;
  // L'avatar manté sempre la mateixa mida en pantalla, independentment del zoom
  const k = HERO_SCREEN_SCALE / ZOOMS[state.zoomIdx];
  // fx: alçada del salt i si neda (només es veu de cintura en amunt)
  const fx = { lift: jumpLift() * k, swim: world.swimming };
  if (state.riding) list.push([pl.y, S.rider[pl.dir][pl.moving ? pl.frame % 2 : 0], Math.round(pl.x) - 11 * k, Math.round(pl.y) - 27 * k, false, k, fx]);
  else list.push([pl.y, S.hero[pl.dir][pl.frame], Math.round(pl.x) - 8 * k, Math.round(pl.y) - 23 * k, false, k, fx]);
  // Els altres jugadors i els NPCs s'escalen amb el mapa; rètols i monedes no
  const kw = 1;
  for (const o of net.others.values()) {
    if (o.room || !inView(o.x, o.y, camX, camY, vw, vh)) continue;
    if (o.bike) {
      o.riderSprites ||= makeRiderSet(o.look);
      list.push([o.y, o.riderSprites[o.dir][o.frame % 2], Math.round(o.x) - 11 * kw, Math.round(o.y) - 27 * kw, false, kw]);
    } else {
      const under = g(Math.floor(o.x / TS), Math.floor((o.y - 2) / TS)) & 127;
      list.push([o.y, o.sprites[o.dir][o.frame], Math.round(o.x) - 8 * kw, Math.round(o.y) - 23 * kw, false, kw, { swim: under === T.WATER || under === T.POOL }]);
    }
  }
  for (const s of systems) s.sprites?.(list, camX, camY, vw, vh, s.heroScale ? k : kw);
  drawSprites(list);

  // rètols (en espai de pantalla, nítids)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  runSystems("light", camX, camY, z, vw, vh); // nit i llums, clima
  if (state.showLabels) drawLabels(camX, camY, z);
  runSystems("overlay", camX, camY, z);       // rètols dels locals, bombolles dels NPCs…
  ctx.setTransform(z, 0, 0, z, -ox, -oy);
  runSystems("veil");                          // el que encara no has descobert
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawPlayerName(camX, camY, z);               // els noms queden per sobre de tot
  runSystems("top", camX, camY, z);
}

// Dibuixa una llista de sprites ordenada per profunditat:
// [y, imatge, x, y, ombra, escala, fx] amb fx = { lift (salt), swim (nedant), seat (assegut) }
function drawSprites(list) {
  list.sort((a, b) => a[0] - b[0]);
  for (const [, img, x, y, shadow, hero, fx] of list) {
    const s = hero || 1;
    if (fx?.seat) { // assegut: es veu de cintura en amunt (les cames queden sota la taula)
      const sh = img.height * 0.66;
      ctx.drawImage(img, 0, 0, img.width, sh, x, y + (img.height - sh) * s * 0.55, img.width * s, sh * s);
      continue;
    }
    if (fx?.swim) { // nedant: mig cos fora de l'aigua i ones al voltant
      const keep = 0.58, sh = img.height * keep, t = Date.now() / 300;
      ctx.drawImage(img, 0, 0, img.width, sh, x, y + (img.height - sh) * s, img.width * s, sh * s);
      ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = Math.max(1, s * 0.6);
      ctx.beginPath();
      ctx.ellipse(x + img.width * s / 2, y + (img.height - 1) * s, (7 + Math.sin(t)) * s, 2.5 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }
    if (shadow || hero) {
      ctx.fillStyle = "rgba(20,15,40,.3)";
      ctx.beginPath();
      ctx.ellipse(x + img.width * s / 2, y + (img.height - 1) * s, (hero ? 6 : 8) * s, (hero ? 2.5 : 3.5) * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.drawImage(img, x, y - (fx?.lift || 0), img.width * s, img.height * s);
  }
}

function drawPlayerName(camX, camY, z) {
  for (const o of net.others.values()) {
    if (o.room || !fogExplored(o.x / TS, o.y / TS)) continue;
    drawNameTag(o.look.name, o.x, o.y, camX, camY, z, "#9fd3ff", 24 * z, o.look.level); // els altres s'escalen amb el mapa
    drawBubble(o.bubble, o.x, o.y, camX, camY, z, 24 * z);
  }
  drawNameTag(state.look.name, state.player.x, state.player.y, camX, camY, z, "#ffffff", undefined, quests.level);
  drawBubble(state.bubble, state.player.x, state.player.y, camX, camY, z);
}

// Bombolla de diàleg sobre l'avatar (per sobre de l'etiqueta del nom)
const bubbleFor = (text) => ({ text, ttl: 5 + text.length * 0.15 });
function tickBubbles(dt) {
  if (state.bubble && (state.bubble.ttl -= dt) <= 0) state.bubble = null;
  for (const o of net.others.values()) if (o.bubble && (o.bubble.ttl -= dt) <= 0) o.bubble = null;
}
// spriteH = alçada en pantalla del personatge que parla (per defecte, la de l'avatar)
function drawBubble(b, x, y, camX, camY, z, spriteH = HERO_SCREEN_SCALE * 24 * dpr) {
  if (!b) return;
  const fs = Math.round(8 * dpr);
  ctx.font = `${fs}px "Press Start 2P", monospace`;
  ctx.textBaseline = "middle";
  const pad = 6 * dpr, tail = 5 * dpr, bw = 2 * dpr;
  const w = Math.ceil(ctx.measureText(b.text).width) + pad * 2, h = fs + pad * 2;
  const sx = Math.round((x - camX) * z);
  const bottom = Math.round((y - camY) * z - spriteH - 10 * dpr - fs / 2 - 4 * dpr - 6 * dpr);
  const left = Math.round(sx - w / 2), top = bottom - tail - h;
  ctx.save();
  ctx.globalAlpha = Math.min(1, b.ttl / 0.4);
  ctx.fillStyle = "#1a1420";
  ctx.fillRect(left - bw, top - bw, w + bw * 2, h + bw * 2);
  ctx.beginPath();
  ctx.moveTo(sx - tail - bw, top + h); ctx.lineTo(sx, bottom + bw); ctx.lineTo(sx + tail + bw, top + h);
  ctx.fill();
  ctx.fillStyle = "#fbf7ea";
  ctx.fillRect(left, top, w, h);
  ctx.beginPath();
  ctx.moveTo(sx - tail, top + h - 1); ctx.lineTo(sx, bottom - bw / 2); ctx.lineTo(sx + tail, top + h - 1);
  ctx.fill();
  ctx.fillStyle = "#1d2142";
  ctx.fillText(b.text, left + pad, top + h / 2 + dpr);
  ctx.restore();
}

function drawNameTag(rawName, x, y, camX, camY, z, color, spriteH = HERO_SCREEN_SCALE * 24 * dpr, level = 0) {
  const name = rawName.trim() + (level ? ` [${level}]` : "");
  if (!name) return;
  const pl = { x, y };
  const fs = Math.round(8 * dpr);
  ctx.font = `${fs}px "Press Start 2P", monospace`;
  ctx.textBaseline = "middle";
  const sx = Math.round((pl.x - camX) * z), sy = Math.round((pl.y - camY) * z - spriteH - 10 * dpr);
  const pad = 4 * dpr, w = ctx.measureText(name).width + pad * 2, h = fs + pad * 2;
  ctx.fillStyle = "rgba(11,13,31,.75)";
  ctx.fillRect(sx - w / 2, sy - h / 2, w, h);
  ctx.fillStyle = color;
  ctx.fillText(name, sx - w / 2 + pad, sy + dpr);
}

function drawLabels(camX, camY, z) {
  const fs = Math.round(8 * dpr * (ZOOMS[state.zoomIdx] >= 2 ? 1.25 : 1));
  ctx.font = `${fs}px "Press Start 2P", monospace`;
  ctx.textBaseline = "middle";
  if ("fontVariantLigatures" in ctx) ctx.fontVariantLigatures = "none";
  const placed = [];
  const zoom = ZOOMS[state.zoomIdx];
  const sorted = state.labels.filter((l) => l.kind === "place").concat(zoom >= 1 ? state.labels.filter((l) => l.kind === "street") : []);
  const W = canvas.width, H = canvas.height, pad = 4 * dpr;
  for (const l of sorted) {
    const sx = l.x * TS * z - camX * z, sy = l.y * TS * z - camY * z;
    if (sx < -300 || sy < -40 || sx > W + 300 || sy > H + 40) continue;
    const w = ctx.measureText(l.text).width + pad * 2, h = fs + pad * 2;
    const r = [sx - w / 2, sy - h / 2, w, h];
    if (placed.some((q) => r[0] < q[0] + q[2] + 6 && r[0] + r[2] + 6 > q[0] && r[1] < q[1] + q[3] + 6 && r[1] + r[3] + 6 > q[1])) continue;
    placed.push(r);
    const isPlace = l.kind === "place";
    ctx.fillStyle = "rgba(11,13,31,.55)";
    ctx.fillRect(r[0] + 2 * dpr, r[1] + 2 * dpr, w, h);
    ctx.fillStyle = isPlace ? "#3a2a12" : "#1d2142";
    ctx.fillRect(r[0], r[1], w, h);
    ctx.strokeStyle = isPlace ? "#ffd35a" : "#f4f1e8";
    ctx.lineWidth = dpr;
    ctx.strokeRect(r[0] + .5 * dpr, r[1] + .5 * dpr, w - dpr, h - dpr);
    ctx.fillStyle = isPlace ? "#ffd35a" : "#f4f1e8";
    ctx.fillText(l.text, r[0] + pad, sy + dpr);
  }
}

async function loadMap() {
  const [bin, meta] = await Promise.all([
    fetch("map.bin?v=" + DATA_VERSION).then((r) => r.body.pipeThrough(new DecompressionStream("deflate"))).then((s) => new Response(s).arrayBuffer()),
    fetch("map.json?v=" + DATA_VERSION).then((r) => r.json()),
  ]);
  const dv = new DataView(bin);
  const W = dv.getUint16(4, true), H = dv.getUint16(6, true);
  state.W = W; state.H = H;
  state.ground = new Uint8Array(bin, 8, W * H);
  state.decor = new Uint8Array(bin, 8 + W * H, W * H);
  state.meta = meta;
}

async function main() {
  resize();
  await Promise.all([loadMap(), loadConfig()]);
  state.look = loadLook();
  initTitle();
  initThemes();
  try { await document.fonts.load('8px "Press Start 2P"'); } catch { /* font opcional */ }
  state.sprites = {
    hero: makeHeroSet(state.look),
    trees: THEMES.map((th) => [1, 2, 3].map((s) => makeTree(true, s * 977, th.tree))),
    pines: THEMES.map((th) => [1, 2].map((s) => makeTree(false, s * 541, th.tree))),
    lamp: makeLamp(), bench: makeBench(), fountain: makeFountain(),
  };
  buildLabels();
  buildMinimap();
  const saved = loadPosition();
  placePlayer(...(saved || state.meta.start));
  const z = ZOOMS[state.zoomIdx];
  state.cam.x = state.player.x - canvas.width / dpr / z / 2;
  state.cam.y = state.player.y - canvas.height / dpr / z / 2;
  bindInput();
  setInterval(savePosition, 2000);
  addEventListener("pagehide", savePosition);
  bindAvatarPanel();
  bindTouchControls();
  bindChat();
  runSystems("init");
  net.connect();
  document.getElementById("loading").classList.add("hidden");
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (canvas.width !== Math.floor(innerWidth * (window.devicePixelRatio || 1))) resize();
    if (state.interior) { // dins d'un local: el barri queda en pausa per a tu
      update(dt);
      runSystems("updateIndoors", dt);
      tickBubbles(dt);
      if (state.interior) drawInterior(); else draw();
      updateHud(dt);
      net.update(dt);
      requestAnimationFrame(loop);
      return;
    }
    update(dt);
    runSystems("update", dt);
    tickBubbles(dt);
    draw();
    drawMinimap();
    updateHud(dt);
    net.update(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.__sa = state; // per depurar
}

// Esperem que s'hagin executat tots els scripts (npcs.js, coins.js…) abans d'arrencar
const start = () => main().catch((e) => {
  document.getElementById("loading").textContent = "Error carregant el mapa: " + e.message;
  console.error(e);
});
if (document.readyState === "loading") addEventListener("DOMContentLoaded", start);
else start();
