// Sprites dels personatges (avatar, disfresses), arbres i mobiliari urbà, generats per codi.
"use strict";

// Sprites
const OUTLINE = hex("#1a1420");

// Aspecte de l'avatar (personalitzable des del panell "Avatar")
const LOOK_KEY = "santandreu-rpg-look";
const DEFAULT_LOOK = {
  name: "Jugador", skin: "#f1c27d", hair: "#4a2b1a", hairStyle: "short", shirt: "#c0392b",
  bottom: "pants", pants: "#2c3e70", shoes: "#3b2a20", extra: "none", extraColor: "#2b6cb0",
};

// Disfressa de drac de foc (original): caputxa amb banyes, panxa clara, ales i cua amb flama
const DRAGON = { body: hex("#f08030"), dark: hex("#c05a20"), belly: hex("#f8d8a0"), horn: hex("#f6ecd0"),
  wing: hex("#d86a2a"), flame: [hex("#ffe14a"), hex("#ff8a1e"), hex("#e83a1a")] };
function dragonCostume(p, dir, f) {
  const D = DRAGON, flick = f % 2;
  const flame = (x, y) => { p.rect(x, y, 2, 2, D.flame[1]); p.set(x, y - 1 - flick, D.flame[0]); p.set(x + 1, y + 2, D.flame[2]); };
  if (dir === "down" || dir === "up") {
    p.rect(1, 10, 2, 5, D.wing); p.rect(13, 10, 2, 5, D.wing); p.set(1, 9, D.dark); p.set(14, 9, D.dark); // ales
    p.rect(3, 1, 10, 3, D.body); p.rect(3, 4, 1, 6, D.body); p.rect(12, 4, 1, 6, D.body);             // caputxa
    p.set(4, 0, D.horn); p.set(11, 0, D.horn);                                                         // banyes
    if (dir === "down") {
      p.rect(6, 12, 4, 5, D.belly);                                                                    // panxa
      p.rect(4, 3, 8, 1, D.dark);                                                                       // vora de la caputxa
    } else {
      p.rect(4, 4, 8, 6, D.body); p.rect(5, 11, 6, 4, D.wing);                                         // esquena
      p.rect(7, 17, 2, 4, D.body); p.rect(8, 21, 2, 1, D.body); flame(9, 20);                         // cua
    }
  } else {
    p.rect(4, 1, 8, 3, D.body); p.rect(4, 4, 3, 6, D.body); p.set(5, 0, D.horn); p.set(8, 0, D.horn); // caputxa
    p.rect(10, 12, 2, 4, D.belly);
    p.rect(4, 10, 3, 4, D.wing); p.set(3, 9, D.dark);                                                  // ala
    p.rect(2, 16, 3, 2, D.body); p.rect(1, 15, 2, 1, D.body); flame(0, 13);                           // cua
  }
}

function makeHero(dir, f, look = DEFAULT_LOOK) {
  const p = new Pix(16, 24);
  const skin = hex(look.skin), hair = hex(look.hair), shirt = hex(look.shirt), shirtD = shade(shirt, -40);
  const pants = hex(look.pants), shoe = hex(look.shoes), eye = hex(look.eyes || "#1b1b2a"), extra = hex(look.extraColor);
  const gold = hex("#e8c040");
  const style = look.hairStyle;
  const lift = [0, 1, 0, 2][f];
  // samarreta a ratlles verticals (p. ex. la de la UESA)
  const stripes = () => {
    if (!look.stripe) return;
    const st = hex(look.stripe);
    for (let i = 0; i < p.data.length; i++) if (p.data[i] === shirt && (i % p.w) % 2 === 1) p.data[i] = st;
  };
  if (dir === "down" || dir === "up") {
    const ll = lift === 1 ? 1 : 0, rl = lift === 2 ? 1 : 0;
    // cames: amb pantalons, pantaló curt o faldilla es veu més o menys pell
    p.rect(5, 17, 3, 4 - ll, skin); p.rect(8, 17, 3, 4 - rl, skin);
    if (look.bottom === "pants") { p.rect(5, 17, 3, 4 - ll, pants); p.rect(8, 17, 3, 4 - rl, pants); }
    if (look.bottom === "shorts") { p.rect(5, 17, 3, 2, pants); p.rect(8, 17, 3, 2, pants); }
    p.rect(5, 21 - ll, 3, 2, shoe); p.rect(8, 21 - rl, 3, 2, shoe);
    p.rect(4, 11, 8, 6, shirt); p.rect(4, 16, 8, 1, shirtD);
    if (look.bottom === "skirt") { p.rect(4, 16, 8, 2, pants); p.rect(3, 18, 10, 1, pants); }
    if (look.bottom === "robe") { p.rect(4, 16, 8, 5, shirt); p.rect(3, 18, 10, 3, shirt); p.rect(3, 20, 10, 1, shirtD); } // túnica
    const la = lift === 1 ? 1 : 0, ra = lift === 2 ? 1 : 0;
    p.rect(3, 11 + la, 1, 5, shirt); p.set(3, 16 + la, skin);
    p.rect(12, 11 + ra, 1, 5, shirt); p.set(12, 16 + ra, skin);
    p.rect(4, 3, 8, 8, skin);
    if (dir === "down") {
      if (style === "long") { p.rect(4, 2, 8, 3, hair); p.rect(3, 4, 2, 9, hair); p.rect(11, 4, 2, 9, hair); }
      else if (style === "afro") { p.rect(3, 0, 10, 5, hair); p.rect(2, 2, 12, 3, hair); p.rect(3, 5, 1, 4, hair); p.rect(12, 5, 1, 4, hair); }
      else if (style !== "bald") { p.rect(4, 2, 8, 3, hair); p.rect(4, 5, 1, 2, hair); p.rect(11, 5, 1, 2, hair); }
      if (style === "ponytail") { p.rect(12, 3, 2, 2, hair); }
      p.set(6, 7, eye); p.set(9, 7, eye); p.rect(7, 9, 2, 1, shade(skin, -30));
      p.rect(6, 11, 4, 1, shade(shirt, 50)); // coll
      if (look.extra === "glasses") { p.rect(5, 6, 2, 2, eye); p.rect(9, 6, 2, 2, eye); p.rect(7, 6, 2, 1, eye); p.set(5, 6, hex("#9fd3ff")); p.set(9, 6, hex("#9fd3ff")); }
      if (look.extra === "cap") { p.rect(4, 1, 8, 3, extra); p.rect(3, 4, 10, 1, shade(extra, -45)); }
      if (look.mask) { p.rect(4, 6, 8, 2, hex("#111116")); p.set(6, 7, hex("#f4f1e8")); p.set(9, 7, hex("#f4f1e8")); } // antifaç
      if (look.zombie) { p.set(5, 12 + la, skin); p.set(10, 12 + ra, skin); p.set(6, 13, shirtD); p.set(9, 15, shirtD); p.rect(7, 9, 2, 1, hex("#5a1e1e")); }
    } else {
      if (style === "long") { p.rect(4, 2, 8, 8, hair); p.rect(3, 4, 10, 9, hair); }
      else if (style === "afro") { p.rect(3, 0, 10, 10, hair); p.rect(2, 2, 12, 6, hair); }
      else if (style !== "bald") p.rect(4, 2, 8, 8, hair);
      else p.rect(4, 3, 8, 8, shade(skin, -8));
      if (style === "ponytail") p.rect(7, 10, 2, 4, hair);
      p.rect(5, 10, 6, 1, shade(skin, -15));
      if (look.extra === "cap") p.rect(4, 1, 8, 4, extra);
    }
    if (look.extra === "wizard") { // barret de bruixot en punta, amb l'ala sobre el front
      const hat = shade(extra, 25);
      p.rect(9, 0, 2, 1, hat); p.rect(8, 1, 2, 1, hat);                 // punta doblegada
      p.rect(6, 2, 4, 1, hat); p.rect(5, 3, 6, 2, hat); p.set(7, 3, gold); // estrella
      p.rect(4, 5, 8, 1, gold);                                          // cinta
      p.rect(1, 6, 14, 1, shade(extra, -20));                            // ala
      if (dir === "down") { p.set(6, 7, eye); p.set(9, 7, eye); }
    }
  } else {
    const front = lift === 1 ? 2 : lift === 2 ? -1 : 0;
    const legA = look.bottom === "pants" ? pants : skin, legB = look.bottom === "pants" ? shade(pants, -15) : shade(skin, -15);
    p.rect(6, 17, 3, 4, legA); p.rect(6 + front, 20, 3, 3, shoe); p.rect(6 + front, 19, 3, 1, legA);
    p.rect(8 - front, 17, 2, 4, legB); p.rect(8 - front, 21, 2, 2, shoe);
    if (look.bottom === "shorts") p.rect(6, 17, 4, 2, pants);
    p.rect(5, 11, 6, 6, shirt); p.rect(5, 16, 6, 1, shirtD);
    if (look.bottom === "skirt") { p.rect(5, 16, 6, 2, pants); p.rect(4, 18, 8, 1, pants); }
    if (look.bottom === "robe") { p.rect(5, 16, 6, 5, shirt); p.rect(4, 19, 8, 2, shirt); p.rect(4, 20, 8, 1, shirtD); }
    const arm = 7 + (lift === 1 ? 1 : lift === 2 ? -1 : 0);
    if (look.zombie) { p.rect(8, 12, 6, 2, shirtD); p.rect(13, 12, 2, 2, skin); } // braços estirats endavant
    else { p.rect(arm, 12, 2, 4, shirtD); p.set(arm, 16, skin); }
    p.rect(4, 3, 8, 8, skin); p.set(12, 7, skin);
    if (style === "long") { p.rect(4, 2, 8, 3, hair); p.rect(3, 4, 4, 9, hair); }
    else if (style === "afro") { p.rect(3, 0, 10, 5, hair); p.rect(2, 2, 6, 7, hair); }
    else if (style !== "bald") { p.rect(4, 2, 8, 3, hair); p.rect(4, 5, 3, 4, hair); }
    if (style === "ponytail") p.rect(2, 4, 2, 5, hair);
    p.set(10, 7, eye);
    if (look.extra === "glasses") { p.rect(9, 6, 3, 2, eye); p.set(10, 6, hex("#9fd3ff")); p.rect(6, 6, 3, 1, eye); }
    if (look.extra === "cap") { p.rect(4, 1, 8, 3, extra); p.rect(11, 4, 3, 1, shade(extra, -45)); }
    if (look.mask) { p.rect(7, 6, 6, 2, hex("#111116")); p.set(10, 7, hex("#f4f1e8")); }
    if (look.extra === "wizard") {
      const hat = shade(extra, 25);
      p.rect(2, 0, 3, 1, hat); p.rect(4, 1, 3, 1, hat);                 // punta tirada enrere
      p.rect(5, 2, 5, 1, hat); p.rect(5, 3, 6, 2, hat); p.set(8, 3, gold);
      p.rect(5, 5, 7, 1, gold);
      p.rect(3, 6, 12, 1, shade(extra, -20));
    }
    if (look.costume === "dragon") dragonCostume(p, "right", f);
    stripes();
    if (dir === "left") { // mirall
      const q = new Pix(16, 24);
      for (let y = 0; y < 24; y++) for (let x = 0; x < 16; x++) q.set(15 - x, y, p.get(x, y));
      q.outline(OUTLINE);
      return q.toCanvas();
    }
  }
  if (look.costume === "dragon") dragonCostume(p, dir, f);
  stripes();
  p.outline(OUTLINE);
  return p.toCanvas();
}

const DIRS = ["down", "up", "left", "right"];
const makeHeroSet = (look) => Object.fromEntries(DIRS.map((d) => [d, [0, 1, 2, 3].map((f) => makeHero(d, f, look))]));

function makeTree(round, seed, pal = {}) {
  const p = new Pix(26, 30), r = rng(seed);
  const trunk = hex(pal.trunk || "#6b4426");
  if (pal.cone) { // conífera fosca
    p.rect(12, 22, 2, 7, trunk);
    const base = hex(pal.base), light = hex(pal.light), dark = hex(pal.dark);
    for (let y = 0; y < 24; y++) for (let x = 0; x < 26; x++) {
      const half = (y + 2) * 0.45 - (y % 6) * 0.35, dx = x - 12.5;
      if (Math.abs(dx) < half) p.set(x, y, dx < -half * 0.4 ? light : dx > half * 0.5 ? dark : base);
    }
  } else if (round) { // plàtan
    p.rect(12, 18, 3, 11, trunk); p.rect(12, 18, 1, 11, shade(trunk, 25));
    const base = hex(pal.base || "#4e9a45"), light = hex(pal.light || "#78c160"), dark = hex(pal.dark || "#2f6e35");
    for (let y = 0; y < 22; y++) for (let x = 0; x < 26; x++) {
      const dx = x - 13, dy = y - 10, d = Math.sqrt(dx * dx + dy * dy * 1.15) + r() * 1.6;
      if (d < 10.5) p.set(x, y, (dx + dy < -6 && r() < 0.8) ? light : (dx + dy > 5 && r() < 0.8) ? dark : (r() < 0.12 ? dark : base));
    }
  } else { // pi
    p.rect(12, 12, 2, 17, trunk); p.rect(12, 12, 1, 17, shade(trunk, 25));
    const base = hex(pal.pineBase || "#2f7040"), light = hex(pal.pineLight || "#4e955a"), dark = hex(pal.pineDark || "#1e4d2d");
    for (let y = 0; y < 16; y++) for (let x = 0; x < 26; x++) {
      const dx = (x - 13) / 12, dy = (y - 7) / 6.5, d = dx * dx + dy * dy + r() * 0.15;
      if (d < 1) p.set(x, y, dy < -0.3 && r() < 0.7 ? light : dy > 0.4 ? dark : base);
    }
  }
  p.outline(OUTLINE);
  return p.toCanvas();
}

function makeLamp() {
  const p = new Pix(8, 28);
  p.rect(3, 6, 2, 22, hex("#2b2f3a")); p.rect(2, 26, 4, 2, hex("#2b2f3a"));
  p.rect(1, 2, 6, 4, hex("#2b2f3a")); p.rect(2, 3, 4, 2, hex("#ffe9a0"));
  p.outline(OUTLINE);
  return p.toCanvas();
}
function makeBench() {
  const p = new Pix(16, 12), w = hex("#9a6532");
  p.rect(1, 2, 14, 2, w); p.rect(1, 5, 14, 2, shade(w, -20)); p.rect(1, 8, 14, 1, shade(w, 15));
  p.rect(2, 9, 1, 3, hex("#2b2f3a")); p.rect(13, 9, 1, 3, hex("#2b2f3a"));
  p.outline(OUTLINE);
  return p.toCanvas();
}
function makeFountain() {
  const p = new Pix(16, 18), st = hex("#9aa0a6");
  for (let y = 0; y < 18; y++) for (let x = 0; x < 16; x++) {
    const dx = (x - 7.5) / 7.5, dy = (y - 11) / 6;
    if (dx * dx + dy * dy < 1) p.set(x, y, st);
    if (dx * dx + dy * dy < 0.55) p.set(x, y, hex("#5ab0e0"));
  }
  p.rect(7, 2, 2, 9, hex("#7d8389")); p.rect(6, 1, 4, 2, hex("#bfe6ff"));
  p.outline(OUTLINE);
  return p.toCanvas();
}

