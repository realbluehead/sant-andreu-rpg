// Embriaguesa (0-20): a la barra d'un bar pagues 1 moneda i et prens una cervesa (+1).
// L'única manera de baixar-la és prendre cafès a la barra d'una cafeteria (1 moneda, -3).
// Com més embriagat vas, més ziga-zaga fas en caminar.
"use strict";

const DRUNK_KEY = "santandreu-rpg-drunk";
// Màxim, pujada per cervesa, baixada per cafè i preu: CFG.drinks (config.json)

const drink = { level: loadDrunk(), bars: [], cafes: [] };

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

// Es demana a la barra (interior.js): cervesa al bar, cafè a la cafeteria.
// Retorna el que diu el cambrer.
function serveDrink(kind, name) {
  if (kind === "bar") {
    if (drink.level >= CFG.drinks.maxLevel) { showBanner("Ja n'has begut prou!", "warn"); return "Per avui ja n'hi ha prou!"; }
    if (!pay()) { showBanner("No portes monedes per a una cervesa", "warn"); return "Sense monedes no hi ha cervesa!"; }
    drink.level = Math.min(CFG.drinks.maxLevel, drink.level + CFG.drinks.beerUp);
    showBanner(`Glup! Una cervesa a ${name}`, "beer");
    saveDrunk();
    updateDrunkUi(true);
    return "Aquí té la seva canya!";
  }
  if (drink.level <= 0) { showBanner("Ja estàs ben despert", "coffee"); return "Avui ja vas ben despert!"; }
  if (!pay()) { showBanner("No portes monedes per a un cafè", "warn"); return "Sense monedes no hi ha cafè!"; }
  drink.level = Math.max(0, drink.level - CFG.drinks.coffeeDown);
  showBanner(`Un cafè a ${name}. Et despertes una mica!`, "coffee");
  saveDrunk();
  updateDrunkUi(true);
  return "Un cafè ben carregat!";
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
