// Controls: teclat, ratolí (zoom i arrossegar la càmera), minimapa i controls tàctils.
"use strict";

function updateZoomUi() {
  document.querySelector("#zoom-level span").textContent = "×" + ZOOMS[state.zoomIdx];
  document.getElementById("zoom-out").disabled = state.zoomIdx === 0;
  document.getElementById("zoom-in").disabled = state.zoomIdx === ZOOMS.length - 1;
}

function setZoom(i) {
  i = Math.max(0, Math.min(ZOOMS.length - 1, i));
  if (i === state.zoomIdx) return;
  const oldZ = ZOOMS[state.zoomIdx], newZ = ZOOMS[i];
  const cxw = state.cam.x + canvas.width / dpr / oldZ / 2, cyw = state.cam.y + canvas.height / dpr / oldZ / 2;
  state.zoomIdx = i;
  state.cam.x = cxw - canvas.width / dpr / newZ / 2;
  state.cam.y = cyw - canvas.height / dpr / newZ / 2;
  updateZoomUi();
}

function toggleMinimap(show = !state.showMinimap) {
  state.showMinimap = show;
  document.getElementById("minimap-wrap").classList.toggle("hidden", !show);
  document.getElementById("map-btn").classList.toggle("active", show);
}

// Controls tàctils: joystick virtual + botó de córrer
function bindTouchControls() {
  const isTouch = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
  const enable = () => document.body.classList.add("touch");
  if (isTouch) {
    enable();
    toggleMinimap(false); // a mòbil el minimapa ocupa massa: s'obre amb el botó MAPA
  }
  addEventListener("touchstart", enable, { once: true, passive: true });

  const base = document.getElementById("joystick"), knob = base.querySelector(".knob");
  const joy = state.joy;
  let pid = null;
  const move = (e) => {
    const r = base.getBoundingClientRect(), R = r.width / 2;
    let x = (e.clientX - r.left - R) / (R * 0.75), y = (e.clientY - r.top - R) / (R * 0.75);
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    joy.x = x; joy.y = y;
    knob.style.transform = `translate(${x * R * 0.75}px, ${y * R * 0.75}px)`;
  };
  const release = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    joy.active = false; joy.x = joy.y = 0;
    knob.style.transform = "";
    base.classList.remove("active");
  };
  base.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    pid = e.pointerId;
    try { base.setPointerCapture(pid); } catch { /* alguns navegadors no ho permeten */ }
    joy.active = true;
    base.classList.add("active");
    move(e);
  });
  base.addEventListener("pointermove", (e) => { if (e.pointerId === pid) move(e); });
  base.addEventListener("pointerup", release);
  base.addEventListener("pointercancel", release);

  const run = document.getElementById("run-btn");
  run.addEventListener("click", () => {
    state.touchRun = !state.touchRun;
    run.classList.toggle("active", state.touchRun);
    run.setAttribute("aria-pressed", String(state.touchRun));
  });
  document.getElementById("map-btn").addEventListener("click", () => toggleMinimap());
  document.getElementById("center-btn").addEventListener("click", () => { state.follow = true; });
}

function bindInput() {
  addEventListener("keydown", (e) => {
    // Als camps de text (xat, nom) les tecles han de funcionar normalment, espai inclòs
    if (e.target instanceof HTMLInputElement) return;
    if (state.onTitle || e.titleStart) return; // a la portada només compta ENTER (title.js), que no ha d'obrir el xat
    if (npcs.dead) return; // a la pantalla de mort només compta el botó de ressuscitar
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    if (e.code === "Space" && !e.repeat && !state.editing) jump();
    if (e.code === "Escape" && state.editing) { toggleAvatarPanel(false); return; }
    if (e.code === "KeyP" && !e.repeat) { toggleAvatarPanel(); return; }
    if (e.code === "KeyR" && !e.repeat && !state.editing && !state.chatting) { if (!state.interior) toggleBike(); return; }
    if ((e.code === "KeyO" || e.code === "KeyE") && !e.repeat && !state.editing && !state.chatting) { interact(); return; }
    if (e.code === "KeyJ" && !e.repeat && !state.editing && !state.chatting) { toggleQuestLog(true); return; }
    if ((e.key === "Enter" || e.code === "KeyT") && !state.editing && !e.repeat) { e.preventDefault(); toggleChat(true); return; }
    if (state.editing) return;
    state.keys.add(e.code);
    if (e.repeat) return;
    if (e.key === "+" || e.key === "=") setZoom(state.zoomIdx + 1);
    if (e.key === "-" || e.key === "_") setZoom(state.zoomIdx - 1);
    if (e.code === "KeyC") state.follow = true;
    if (e.code === "KeyM") toggleMinimap();
    if (e.code === "KeyL") { state.showLabels = !state.showLabels; toast(state.showLabels ? "Rètols visibles" : "Rètols amagats"); }
    if (e.code === "KeyH") document.getElementById("help").classList.toggle("hidden");
    if (e.code === "KeyN") {
      state.noclip = !state.noclip;
      toast(state.noclip ? "Mode fantasma: travessa edificis" : "Mode normal");
      if (!state.noclip && collides(state.player.x, state.player.y)) placePlayer(state.player.x / TS, state.player.y / TS);
    }
  });
  addEventListener("keyup", (e) => state.keys.delete(e.code));
  addEventListener("blur", () => state.keys.clear());

  document.getElementById("zoom-in").addEventListener("click", () => setZoom(state.zoomIdx + 1));
  document.getElementById("zoom-out").addEventListener("click", () => setZoom(state.zoomIdx - 1));
  updateZoomUi();
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); setZoom(state.zoomIdx + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, cx: state.cam.x, cy: state.cam.y }; canvas.classList.add("dragging"); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const z = ZOOMS[state.zoomIdx];
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) state.follow = false;
    if (!state.follow) { state.cam.x = drag.cx - (e.clientX - drag.x) / z; state.cam.y = drag.cy - (e.clientY - drag.y) / z; }
  });
  const end = () => { drag = null; canvas.classList.remove("dragging"); };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  // El minimapa no teletransporta: un clic només diu qui hi ha en aquell punt
  mm.addEventListener("click", (e) => {
    const r = mm.getBoundingClientRect();
    const onMap = (x, y) => [r.left + (x / TS / state.W) * r.width, r.top + (y / TS / state.H) * r.height];
    const near = [];
    for (const [id, o] of net.others) {
      if (o.room || !fogExplored(o.x / TS, o.y / TS)) continue;
      const [cx, cy] = onMap(o.x, o.y);
      const d = Math.hypot(cx - e.clientX, cy - e.clientY);
      if (d < 12) near.push({ id, o, d });
    }
    near.sort((a, b) => a.d - b.d);
    const [mx, my] = onMap(state.player.x, state.player.y);
    if (!near.length) {
      state.mmFocus = null;
      toast(Math.hypot(mx - e.clientX, my - e.clientY) < 12 ? "Ets tu!" : "No hi ha cap jugador aquí");
      return;
    }
    const { id, o } = near[0];
    const meters = Math.round(Math.hypot(o.x - state.player.x, o.y - state.player.y) / TS * state.meta.metersPerTile);
    state.mmFocus = { id, until: performance.now() + 4000 };
    const more = near.length > 1 ? ` (+${near.length - 1} més)` : "";
    toast(`${o.look.name.trim() || "Jugador"} és a ${meters} m de tu${more}`);
  });
  addEventListener("resize", () => { resize(); buildMinimap(); });
}

