// Embriaguesa (0-20): quan passes per un bar i portes monedes, pagues 1 moneda i et prens una
// cervesa (+1). L'única manera de baixar-la és prendre cafès a les cafeteries (1 moneda, -3).
// Com més embriagat vas, més ziga-zaga fas en caminar.
"use strict";

const DRUNK_KEY = "santandreu-rpg-drunk";
// Màxim, pujada per cervesa, baixada per cafè i preu: CFG.drinks (config.json)
const DRINK_RADIUS = 3.5; // tiles al voltant del bar o la cafeteria (el punt sol ser dins de l'edifici)

const drink = { level: loadDrunk(), bars: [], cafes: [], inside: null, cooldown: 0 };

function loadDrunk() {
  try { return Math.max(0, Math.min(CFG.drinks.maxLevel, parseInt(localStorage.getItem(DRUNK_KEY) || "0", 10) || 0)); } catch { return 0; }
}
function saveDrunk() {
  try { localStorage.setItem(DRUNK_KEY, String(drink.level)); } catch { /* sense emmagatzematge */ }
}

function initDrinks() {
  const pois = state.meta.pois || [];
  drink.bars = pois.filter((p) => p.c === "beer");
  drink.cafes = pois.filter((p) => p.c === "coffee");
  drink.level = Math.min(drink.level, CFG.drinks.maxLevel);
  updateDrunkUi();
}

function placeAt(list, tx, ty) {
  return list.find((p) => (p.x - tx) ** 2 + (p.y - ty) ** 2 < DRINK_RADIUS * DRINK_RADIUS);
}

// Es beu un cop per cada vegada que entres a la zona d'un establiment
function updateDrinks(dt) {
  drink.cooldown = Math.max(0, drink.cooldown - dt);
  if (npcs.dead) return;
  const tx = state.player.x / TS, ty = state.player.y / TS;
  const bar = placeAt(drink.bars, tx, ty), cafe = !bar && placeAt(drink.cafes, tx, ty);
  const here = bar || cafe || null;
  if (here === drink.inside) return;
  drink.inside = here;
  if (!here || drink.cooldown > 0) return;
  drink.cooldown = 2;
  const name = here.n || (bar ? "el bar" : "la cafeteria");
  if (bar) {
    if (drink.level >= CFG.drinks.maxLevel) return showBanner("Ja n'has begut prou!", "warn");
    if (!pay()) return showBanner(`No portes monedes per a una cervesa`, "warn");
    drink.level = Math.min(CFG.drinks.maxLevel, drink.level + CFG.drinks.beerUp);
    showBanner(`Glup! Una cervesa a ${name}`, "beer");
  } else {
    if (drink.level <= 0) return; // sobri: no cal cafè
    if (!pay()) return showBanner(`No portes monedes per a un cafè`, "warn");
    drink.level = Math.max(0, drink.level - CFG.drinks.coffeeDown);
    showBanner(`Un cafè a ${name}. Et despertes una mica!`, "coffee");
  }
  saveDrunk();
  updateDrunkUi(true);
}

function pay() {
  if (coins.wallet < CFG.drinks.price) return false;
  coins.wallet -= CFG.drinks.price;
  saveMoney();
  updateCoinUi("wallet");
  npcs.floaters.push({ text: `-${CFG.drinks.price}`, t: 0, color: "#facc15" });
  return true;
}

// Desvia la direcció de la marxa: oscil·lació lenta + tremolor, proporcionals a l'embriaguesa
function drunkWobble(dx, dy) {
  const lvl = drink.level / CFG.drinks.maxLevel;
  if (!lvl) return [dx, dy];
  const t = performance.now() / 1000;
  const ang = lvl * (1.05 * Math.sin(t * 2.3) + 0.45 * Math.sin(t * 6.7 + 1.3));
  const c = Math.cos(ang), s = Math.sin(ang);
  return [dx * c - dy * s, dx * s + dy * c];
}

function updateDrunkUi(bump) {
  const el = document.getElementById("drunk");
  el.querySelector("i").style.width = `${(drink.level / CFG.drinks.maxLevel) * 100}%`;
  el.querySelector(".val").textContent = `${drink.level}/${CFG.drinks.maxLevel}`;
  el.classList.toggle("high", drink.level >= CFG.drinks.maxLevel * 0.6);
  if (bump) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
}
