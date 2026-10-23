// Lladres: 90 personatges amb antifaç que ronden pel barri. Si et veuen (a prop i sense
// edificis pel mig) et persegueixen una mica més lents que tu, i si t'atrapen et roben les
// monedes que portes a sobre. Les del banc estan assegurades.
// A diferència dels altres NPCs, els lladres són locals de cada jugador: cadascú té els
// seus i només el persegueixen a ell.
"use strict";

const THIEF = {
  // quantitat, vista, velocitat… són a config.json (CFG.thieves)
  seed: 4400,
  forget: 3,           // s sense veure't abans de rendir-se
  wanderSpeed: 28,     // px/s
  tiles: [T.SIDEWALK, T.PLAZA, T.GROUND, T.PARK, T.DIRT],
};
const THIEF_LINES = ["Dona'm les monedes!", "Eh, tu! Vine aquí!", "No corris tant!", "Aquesta cartera és meva!"];
const WIZARD_LINES = ["Abracadabra... les teves monedes!", "Un encanteri per a la teva cartera!", "No t'escaparàs del meu conjur!", "Pota de gripau, monedes a la mà!"];
const DRAGON_LINES = ["Graaaa! Les teves monedes!", "Llançaflames a la teva cartera!", "Groooar!", "Ets el meu tresor!"];
const MAGIC_THEME = 0, ROUTE_THEME = 5; // Vila dels Bruixots i Ruta dels Monstres (themes.js)

const thieves = { list: [] };

function initThieves() {
  const allowed = new Set(THIEF.tiles);
  const hoodies = ["#2b2b33", "#3f3f46", "#1f2a44", "#4a3728", "#3d4a3d"];
  // els primers ronden sempre; la resta només surten de nit (CFG.night.thieves), per tot el barri
  const total = CFG.thieves.count + CFG.night.thieves;
  for (let i = 0; i < total; i++) {
    const night = i >= CFG.thieves.count;
    const r = rng(THIEF.seed + i * 6151 + (night ? 777 : 0));
    const home = pickHome(r, allowed);
    if (!home) continue;
    const look = {
      ...DEFAULT_LOOK, name: "", mask: true,
      skin: ["#ffe0bd", "#f1c27d", "#e0ac69", "#c68642", "#8d5524"][(r() * 5) | 0],
      hair: ["#1c1414", "#4a2b1a", "#8b5a2b"][(r() * 3) | 0],
      hairStyle: ["short", "bald", "long"][(r() * 3) | 0],
      shirt: hoodies[(r() * hoodies.length) | 0], pants: "#111116", shoes: "#2b2b33",
      extra: r() < 0.5 ? "cap" : "none", extraColor: "#111116",
    };
    // a la Vila dels Bruixots, els lladres van de bruixot: túnica, barret en punta i sense antifaç
    const zone = sectorAt(Math.floor(home[0]), Math.floor(home[1]));
    const wizard = zone === MAGIC_THEME, dragon = zone === ROUTE_THEME;
    if (wizard) {
      const robe = ["#3b2a5e", "#2a2a3a", "#4a1f3a", "#1f3a4a"][(r() * 4) | 0];
      Object.assign(look, { mask: false, shirt: robe, pants: robe, bottom: "robe", extra: "wizard", extraColor: robe,
        hairStyle: ["long", "short", "bald"][(r() * 3) | 0], hair: ["#9a9aa0", "#d8d8d8", "#4a2b1a"][(r() * 3) | 0] });
    }
    // a la Ruta dels Monstres, disfressats de drac de foc
    if (dragon) Object.assign(look, { mask: false, costume: "dragon", extra: "none", shirt: "#f08030", pants: "#f08030", shoes: "#c05a20", bottom: "pants" });
    thieves.list.push({
      home, allowed, sprites: makeHeroSet(look), r, night, active: !night, lines: wizard ? WIZARD_LINES : dragon ? DRAGON_LINES : THIEF_LINES,
      x: home[0] * TS, y: home[1] * TS, dir: "down", frame: 0, anim: 0, moving: false,
      mode: "wander", target: null, wait: r() * 3, unseen: 0, cooldown: 0, fleeT: 0,
      stuck: 0, detour: null, say: null,
    });
  }
}

// Bloquejos per als lladres (independent del mode fantasma del jugador)
function thiefBlocked(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= state.W || ty >= state.H) return true;
  const v = state.ground[ty * state.W + tx] & 127;
  if (v >= BUILDING_BASE || v === T.WATER || v === T.POOL) return true;
  const d = state.decor[ty * state.W + tx];
  return d === D.TREE || d === D.TREE2 || d === D.FOUNTAIN;
}
function thiefCollides(x, y) {
  const x0 = Math.floor((x - 5) / TS), x1 = Math.floor((x + 4) / TS);
  const y0 = Math.floor((y - 6) / TS), y1 = Math.floor((y - 1) / TS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (thiefBlocked(tx, ty)) return true;
  return false;
}

// Hi ha visió directa? (els edificis tapen; els arbres no)
function lineOfSight(x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (TS / 2));
  for (let i = 1; i < n; i++) {
    const f = i / n, tx = Math.floor((x0 + (x1 - x0) * f) / TS), ty = Math.floor((y0 + (y1 - y0) * f) / TS);
    const v = state.ground[ty * state.W + tx] & 127;
    if (v >= BUILDING_BASE) return false;
  }
  return true;
}

// Avança cap a (dx, dy) lliscant per les parets; retorna quant s'ha mogut
function thiefStep(t, dx, dy, dist) {
  const n = Math.hypot(dx, dy) || 1, mx = (dx / n) * dist, my = (dy / n) * dist;
  const x0 = t.x, y0 = t.y;
  if (!thiefCollides(t.x + mx, t.y)) t.x += mx;
  if (!thiefCollides(t.x, t.y + my)) t.y += my;
  const moved = Math.hypot(t.x - x0, t.y - y0);
  if (moved > 0.01) {
    t.dir = Math.abs(t.x - x0) > Math.abs(t.y - y0) ? (t.x > x0 ? "right" : "left") : (t.y > y0 ? "down" : "up");
  }
  return moved;
}

function thiefSay(t, text, ttl = 1.8) { t.say = { text, ttl }; }

function updateThieves(dt) {
  const pl = state.player;
  const canChase = !npcs.dead && !state.editing, monsters = world.monsters;
  for (const t of thieves.list) {
    if (t.night) { // lladres de nit: apareixen al seu racó en fer-se fosc i desapareixen de dia
      if (!monsters) { t.active = false; continue; }
      if (!t.active) { t.active = true; t.x = t.home[0] * TS; t.y = t.home[1] * TS; t.mode = "wander"; t.say = null; }
    }
    if (t.say && (t.say.ttl -= dt) <= 0) t.say = null;
    t.cooldown = Math.max(0, t.cooldown - dt);
    const dx = pl.x - t.x, dy = pl.y - t.y, dist = Math.hypot(dx, dy);
    let moved = 0;

    if (t.mode === "chase") {
      const sees = dist < CFG.thieves.giveUp * TS && lineOfSight(t.x, t.y - 8, pl.x, pl.y - 8);
      t.unseen = sees ? 0 : t.unseen + dt;
      if (!canChase || dist > CFG.thieves.giveUp * TS || t.unseen > THIEF.forget) {
        t.mode = "return"; thiefSay(t, "Ja t'enxamparé…");
      } else if (Math.abs(dx) < 10 && Math.abs(dy) < 9) {
        rob(t);
      } else {
        // si s'encalla contra un edifici, prova de voltar-lo una estona
        if (t.detour && (t.detour.t -= dt) > 0) moved = thiefStep(t, t.detour.dx, t.detour.dy, CFG.thieves.chaseSpeed * dt);
        else {
          t.detour = null;
          moved = thiefStep(t, dx, dy, CFG.thieves.chaseSpeed * dt);
          t.stuck = moved < CFG.thieves.chaseSpeed * dt * 0.3 ? t.stuck + dt : 0;
          if (t.stuck > 0.4) {
            const side = t.r() < 0.5 ? 1 : -1;
            t.detour = { dx: -dy * side, dy: dx * side, t: 0.8 };
            t.stuck = 0;
          }
        }
        if (!t.say && Math.random() < dt * 0.15) thiefSay(t, t.lines[(Math.random() * t.lines.length) | 0]);
      }
    } else if (t.mode === "flee") {
      t.fleeT -= dt;
      moved = thiefStep(t, -dx, -dy, 110 * dt);
      if (t.fleeT <= 0) t.mode = "return";
    } else {
      // ronda tranquil·la pel voltant del seu racó (o tornada cap allà)
      if (t.mode === "return") {
        const hx = t.home[0] * TS - t.x, hy = t.home[1] * TS - t.y;
        if (Math.hypot(hx, hy) < 6) t.mode = "wander";
        else {
          moved = thiefStep(t, hx, hy, THIEF.wanderSpeed * 1.5 * dt);
          if (moved < 0.01) { t.x = t.home[0] * TS; t.y = t.home[1] * TS; t.mode = "wander"; }
        }
      } else if (t.target) {
        const tx = t.target[0] * TS - t.x, ty = t.target[1] * TS - t.y;
        if (Math.hypot(tx, ty) < 3) { t.target = null; t.wait = 1 + t.r() * 4; }
        else {
          moved = thiefStep(t, tx, ty, THIEF.wanderSpeed * dt);
          if (moved < 0.01) t.target = null;
        }
      } else if ((t.wait -= dt) <= 0) {
        const ang = t.r() * Math.PI * 2, d = 1 + t.r() * 4;
        const gx = t.home[0] + Math.cos(ang) * d, gy = t.home[1] + Math.sin(ang) * d;
        t.target = clearLine(t.home[0], t.home[1], gx, gy, t.allowed) ? [gx, gy] : t.home;
      }
      // et veu?
      if (canChase && t.cooldown <= 0 && dist < CFG.thieves.sight * TS && lineOfSight(t.x, t.y - 8, pl.x, pl.y - 8)) {
        t.mode = "chase"; t.unseen = 0; t.target = null;
        thiefSay(t, "!", 1);
      }
    }

    t.moving = moved > 0.01;
    if (t.moving) { t.anim += dt * (t.mode === "wander" ? 5 : 10); t.frame = Math.floor(t.anim) % 4; } else t.frame = 0;
  }
}

function rob(t) {
  const n = robWallet();
  t.cooldown = CFG.thieves.robCooldown;
  t.mode = "flee"; t.fleeT = 3;
  if (n > 0) {
    thiefSay(t, "Ha ha! Gràcies!");
    showBanner(`Un lladre t'ha robat ${n} moned${n === 1 ? "a" : "es"}!`, "rob");
    npcs.floaters.push({ text: `-${n}`, t: 0, color: "#facc15" });
  } else {
    thiefSay(t, "Bah, no portes res!");
  }
}

function pushThiefSprites(list, camX, camY, vw, vh, k) {
  for (const t of thieves.list) {
    if (!t.active || !inView(t.x, t.y, camX, camY, vw, vh, 60, 100)) continue;
    list.push([t.y, t.sprites[t.dir][t.frame], Math.round(t.x) - 8 * k, Math.round(t.y) - 23 * k, false, k]);
  }
}

function drawThiefOverlay(camX, camY, z) {
  for (const t of thieves.list) if (t.active && t.say) drawBubble(t.say, t.x, t.y, camX, camY, z, 14 * z);
}

addSystem({ init: initThieves, update: updateThieves, sprites: pushThiefSprites, overlay: drawThiefOverlay });
