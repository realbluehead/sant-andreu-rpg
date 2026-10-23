// Explicació breu de com es juga, només la primera vegada que algú entra al joc (després de la
// portada). Els controls que s'expliquen depenen de si es juga amb teclat o amb pantalla tàctil.
"use strict";

const INTRO_KEY = "santandreu-rpg-intro";

const INTRO_ITEMS = (touch) => [
  ["🚶", touch ? "Mou-te amb el <b>joystick</b>. Prem <b>CÓRRER</b> per anar més de pressa."
               : "Mou-te amb les <b>fletxes</b> o <b>WASD</b>. Amb <b>SHIFT</b> corres."],
  ["🗺️", "El mapa és el barri real. Al principi està cobert de boira: <b>es destapa allà on camines</b>."],
  ["🪙", "Recull les <b>monedes</b> del carrer i guarda-les a un <b>banc</b>, que els <b>lladres</b> te les roben si et veuen."],
  ["🍺", touch ? "Davant d'un bar, cafeteria, farmàcia o banc, prem <b>ENTRA</b>. A la barra pots fer-hi una consumició."
               : "Davant d'un bar, cafeteria, farmàcia o banc, prem <b>O</b> per entrar. A la barra pots fer-hi una consumició."],
  ["❤️", "Compte amb les <b>bicis, patinets i motos</b>: et treuen vida. A les <b>farmàcies</b> et cures."],
  ["🚲", touch ? "A les estacions de Bicing, prem <b>BICI</b> per agafar-ne una. <b>SALTA</b> per saltar les bosses d'escombraries."
               : "A les estacions de Bicing, prem <b>R</b> per agafar una bici. Amb <b>ESPAI</b> saltes les bosses d'escombraries."],
  ["🌙", "Cada minut és una hora. <b>De 20 a 6 h surten els monstres</b>…"],
  ["💬", touch ? "Prem <b>XAT</b> per parlar amb els altres jugadors. A <b>OPCIONS</b> canvies el teu personatge i la música."
               : "Prem <b>ENTER</b> per parlar amb els altres jugadors. Amb <b>P</b> obres les opcions (personatge i música) i amb <b>H</b> l'ajuda."],
];

const intro = { open: false, t0: 0 };

function showIntroOnce() {
  if (store.get(INTRO_KEY)) return;
  const touch = document.body.classList.contains("touch");
  document.getElementById("intro-list").innerHTML =
    INTRO_ITEMS(touch).map(([icon, text]) => `<li><span>${icon}</span><span>${text}</span></li>`).join("");
  document.getElementById("intro").classList.remove("hidden");
  intro.open = true; intro.t0 = performance.now();
  state.onTitle = true; // el personatge no es mou mentre es llegeix
}

function closeIntro() {
  if (!intro.open) return;
  intro.open = false;
  state.onTitle = false;
  document.getElementById("intro").classList.add("hidden");
  store.set(INTRO_KEY, "1");
}

document.getElementById("intro-ok").addEventListener("click", closeIntro);
// mentre és obert, les tecles no arriben al joc; ENTER o ESC el tanquen (però no l'ENTER de la portada)
addEventListener("keydown", (e) => {
  if (!intro.open) return;
  e.stopImmediatePropagation();
  if ((e.key === "Enter" || e.key === "Escape") && performance.now() - intro.t0 > 400) { e.preventDefault(); closeIntro(); }
}, true);
