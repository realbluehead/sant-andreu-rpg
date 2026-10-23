// Panell OPCIONS: personalització de l'avatar (es desa al navegador), música i compte de Google.
"use strict";

function loadLook() {
  const saved = store.getJSON(LOOK_KEY);
  return { ...DEFAULT_LOOK, ...(saved && typeof saved === "object" ? saved : {}) };
}
function saveLook() { store.setJSON(LOOK_KEY, state.look); }

const LOOK_FIELDS = [
  { key: "skin", label: "Pell", colors: ["#ffe0bd", "#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#5c3a1e"] },
  { key: "hairStyle", label: "Pentinat", options: [["short", "Curt"], ["long", "Llarg"], ["ponytail", "Cua"], ["afro", "Arrissat"], ["bald", "Rapat"]] },
  { key: "hair", label: "Cabell", colors: ["#1c1414", "#4a2b1a", "#8b5a2b", "#d6a756", "#f2e3a0", "#b5401f", "#9a9a9a", "#e86fb4", "#3e7be0"] },
  { key: "shirt", label: "Samarreta", colors: ["#c0392b", "#e67e22", "#f1c40f", "#27ae60", "#16a085", "#2980b9", "#8e44ad", "#ecf0f1", "#2c3e50"] },
  { key: "bottom", label: "Part de baix", options: [["pants", "Pantalons"], ["shorts", "Curts"], ["skirt", "Faldilla"]] },
  { key: "pants", label: "Color", colors: ["#2c3e70", "#1f2a44", "#5d6d7e", "#7f5539", "#3d5a40", "#c0392b", "#d4c5a9", "#111111"] },
  { key: "shoes", label: "Sabates", colors: ["#3b2a20", "#111111", "#ecf0f1", "#c0392b", "#2980b9", "#7f5539"] },
  { key: "extra", label: "Complement", options: [["none", "Res"], ["cap", "Gorra"], ["glasses", "Ulleres"]] },
  { key: "extraColor", label: "Color gorra", colors: ["#2b6cb0", "#c0392b", "#27ae60", "#f1c40f", "#111111", "#ecf0f1"], when: (l) => l.extra === "cap" },
];

const avatarPanel = document.getElementById("avatar-panel");
const avatarPreview = document.getElementById("avatar-preview");
let previewSprites = null, previewTimer = null;

function applyLook() {
  state.sprites.hero = makeHeroSet(state.look);
  state.sprites.rider = makeRiderSet(state.look);
  previewSprites = state.sprites.hero;
  saveLook();
  net.sendLook();
  renderAvatarFields();
}

function renderAvatarFields() {
  const box = document.getElementById("avatar-fields");
  box.textContent = "";
  for (const f of LOOK_FIELDS) {
    if (f.when && !f.when(state.look)) continue;
    const row = document.createElement("div");
    row.className = "field";
    const lab = document.createElement("div");
    lab.className = "label";
    lab.textContent = f.label;
    row.appendChild(lab);
    const opts = document.createElement("div");
    opts.className = f.colors ? "swatches" : "choices";
    for (const o of f.colors || f.options) {
      const value = f.colors ? o : o[0];
      const b = document.createElement("button");
      b.type = "button";
      if (f.colors) { b.style.background = o; b.setAttribute("aria-label", f.label + " " + o); }
      else b.textContent = o[1];
      if (state.look[f.key] === value) b.classList.add("selected");
      b.addEventListener("click", () => { state.look[f.key] = value; applyLook(); });
      opts.appendChild(b);
    }
    row.appendChild(opts);
    box.appendChild(row);
  }
}

function drawPreview(t) {
  const c = avatarPreview.getContext("2d");
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, avatarPreview.width, avatarPreview.height);
  const dir = DIRS[[0, 3, 1, 2][Math.floor(t / 2400) % 4]];
  const img = previewSprites[dir][Math.floor(t / 150) % 4];
  const sc = 6;
  c.fillStyle = "rgba(0,0,0,.3)";
  c.beginPath();
  c.ellipse(avatarPreview.width / 2, avatarPreview.height - 14, 6 * sc, 2.5 * sc, 0, 0, Math.PI * 2);
  c.fill();
  c.drawImage(img, (avatarPreview.width - 16 * sc) / 2, avatarPreview.height - 14 - 23 * sc, 16 * sc, 24 * sc);
}

function toggleAvatarPanel(open = !state.editing) {
  state.editing = open;
  state.keys.clear();
  avatarPanel.classList.toggle("hidden", !open);
  if (open) {
    previewSprites = state.sprites.hero;
    document.getElementById("avatar-name").value = state.look.name;
    renderAvatarFields();
    const tick = (t) => { if (!state.editing) return; drawPreview(t); previewTimer = requestAnimationFrame(tick); };
    previewTimer = requestAnimationFrame(tick);
  } else {
    cancelAnimationFrame(previewTimer);
    document.activeElement?.blur();
  }
}

function bindAvatarPanel() {
  document.getElementById("avatar-btn").addEventListener("click", () => toggleAvatarPanel());
  document.getElementById("avatar-done").addEventListener("click", () => toggleAvatarPanel(false));
  avatarPanel.addEventListener("click", (e) => { if (e.target === avatarPanel) toggleAvatarPanel(false); });
  const nameInput = document.getElementById("avatar-name");
  nameInput.addEventListener("input", () => { state.look.name = nameInput.value.slice(0, 16); saveLook(); net.sendLook(); });
  nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === "Escape") toggleAvatarPanel(false); });
  document.getElementById("avatar-random").addEventListener("click", () => {
    const pick = (a) => a[(Math.random() * a.length) | 0];
    for (const f of LOOK_FIELDS) state.look[f.key] = f.colors ? pick(f.colors) : pick(f.options)[0];
    applyLook();
  });
  document.getElementById("avatar-reset").addEventListener("click", () => {
    state.look = { ...DEFAULT_LOOK, name: state.look.name };
    applyLook();
  });
}

