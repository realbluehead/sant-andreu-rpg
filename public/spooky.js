// Criatures de la Vila dels Bruixots: fantasmes que suren travessant parets (inofensius, però
// espanten) i zombies que t'empaiten a poc a poc i et mosseguen. Només viuen dins d'aquesta zona
// i, com els lladres, són locals de cada jugador. Quantitats i dany: CFG.magic (config.json).
"use strict";

const SPOOKY_THEME = 0; // Vila dels Bruixots
const ZOMBIE_LINES = ["Grrrr…", "Cerveeells…", "Uuuuuh…", "Mmmmm… monedes…"];
const GHOST_LINES = ["Buuu!", "Uuuuu…", "Bu!"];
const SPOOKY_TILES = [T.SIDEWALK, T.PLAZA, T.GROUND, T.PARK, T.GRASS, T.DIRT];

const spooky = { ghosts: [], zombies: [], sprites: null };

function pickMagicHome(r, allowed) {
  for (let i = 0; i < 4000; i++) {
    const tx = (r() * state.W) | 0, ty = (r() * state.H) | 0;
    if (sectorAt(tx, ty) === SPOOKY_THEME && inBarriTile(tx, ty, allowed)) return [tx + 0.5, ty + 0.5];
  }
  return null;
}

function initSpooky() {
  spooky.sprites = { ghost: [makeGhost(0), makeGhost(1)] };
  const allowed = new Set(SPOOKY_TILES);
  for (let i = 0; i < CFG.magic.ghosts; i++) {
    const r = rng(13000 + i * 7333), home = pickMagicHome(r, allowed);
    if (!home) continue;
    spooky.ghosts.push({ hx: home[0] * TS, hy: home[1] * TS, ph: r() * 10, sp: 0.25 + r() * 0.25,
      rad: (3 + r() * 5) * TS, x: 0, y: 0, say: null, cd: 0 });
  }
  for (let i = 0; i < CFG.magic.zombies; i++) {
    const r = rng(14000 + i * 5113), home = pickMagicHome(r, allowed);
    if (!home) continue;
    const look = {
      ...DEFAULT_LOOK, name: "", zombie: true, eyes: "#e03030",
      skin: ["#8fbf6a", "#7aa85a", "#9cc47a"][(r() * 3) | 0],
      hair: ["#2a2a1e", "#4a3a2a", "#5a5a4a"][(r() * 3) | 0], hairStyle: ["short", "long", "bald"][(r() * 3) | 0],
      shirt: ["#5a5048", "#4a5a4a", "#6a5040"][(r() * 3) | 0], pants: "#3a3430", shoes: "#2a2420",
      bottom: r() < 0.7 ? "pants" : "shorts", extra: "none",
    };
    spooky.zombies.push({ home, allowed, sprites: makeHeroSet(look), r, x: home[0] * TS, y: home[1] * TS,
      dir: "down", frame: 0, anim: 0, mode: "wander", target: null, wait: r() * 3, say: null, cd: 0, detour: null, stuck: 0 });
  }
}

// Els zombies no surten de la Vila dels Bruixots
function zombieStep(z, dx, dy, dist) {
  const x0 = z.x, y0 = z.y;
  const moved = thiefStep(z, dx, dy, dist);
  if (sectorAt(Math.floor(z.x / TS), Math.floor(z.y / TS)) !== SPOOKY_THEME) { z.x = x0; z.y = y0; return 0; }
  return moved;
}

function updateSpooky(dt) {
  const pl = state.player, t = performance.now() / 1000;
  const canHunt = !npcs.dead && !state.editing;
  for (const g of spooky.ghosts) {
    // vol en forma de vuit, travessant parets
    g.x = g.hx + Math.cos(t * g.sp + g.ph) * g.rad;
    g.y = g.hy + Math.sin(t * g.sp * 2 + g.ph) * g.rad * 0.5;
    g.cd = Math.max(0, g.cd - dt);
    if (g.say && (g.say.ttl -= dt) <= 0) g.say = null;
    if (!g.say && g.cd <= 0 && Math.hypot(g.x - pl.x, g.y - pl.y) < 3 * TS) {
      g.say = { text: GHOST_LINES[(Math.random() * GHOST_LINES.length) | 0], ttl: 1.5 };
      g.cd = 6;
    }
  }
  for (const z of spooky.zombies) {
    if (z.say && (z.say.ttl -= dt) <= 0) z.say = null;
    z.cd = Math.max(0, z.cd - dt);
    const dx = pl.x - z.x, dy = pl.y - z.y, dist = Math.hypot(dx, dy);
    const speed = CFG.magic.zombieSpeed;
    let moved = 0;
    if (z.mode === "chase") {
      const sees = canHunt && dist < CFG.magic.zombieSight * 2 * TS && lineOfSight(z.x, z.y - 8, pl.x, pl.y - 8);
      if (!sees) { z.mode = "wander"; z.target = null; }
      else if (Math.abs(dx) < 9 && Math.abs(dy) < 8) {
        if (npcs.invuln <= 0) { hurtPlayer(CFG.magic.zombieDamage, z, "zombie"); z.say = { text: "Ñam!", ttl: 1.2 }; }
      } else if (z.detour && (z.detour.t -= dt) > 0) {
        moved = zombieStep(z, z.detour.dx, z.detour.dy, speed * dt);
      } else {
        z.detour = null;
        moved = zombieStep(z, dx, dy, speed * dt);
        z.stuck = moved < speed * dt * 0.3 ? z.stuck + dt : 0;
        if (z.stuck > 0.5) { const side = z.r() < 0.5 ? 1 : -1; z.detour = { dx: -dy * side, dy: dx * side, t: 1 }; z.stuck = 0; }
      }
      if (!z.say && z.cd <= 0 && Math.random() < dt * 0.3) { z.say = { text: ZOMBIE_LINES[(Math.random() * ZOMBIE_LINES.length) | 0], ttl: 1.6 }; z.cd = 4; }
    } else {
      if (z.target) {
        const tx = z.target[0] * TS - z.x, ty = z.target[1] * TS - z.y;
        if (Math.hypot(tx, ty) < 3) { z.target = null; z.wait = 1 + z.r() * 4; }
        else if (zombieStep(z, tx, ty, speed * 0.5 * dt) < 0.01) z.target = null;
        else moved = 1;
      } else if ((z.wait -= dt) <= 0) {
        const ang = z.r() * Math.PI * 2, d = 1 + z.r() * 4;
        const gx = z.home[0] + Math.cos(ang) * d, gy = z.home[1] + Math.sin(ang) * d;
        z.target = clearLine(z.home[0], z.home[1], gx, gy, z.allowed) ? [gx, gy] : z.home;
      }
      if (canHunt && dist < CFG.magic.zombieSight * TS && lineOfSight(z.x, z.y - 8, pl.x, pl.y - 8)) {
        z.mode = "chase"; z.say = { text: "Grrrr!", ttl: 1.2 };
      }
    }
    if (moved > 0.01) { z.anim += dt * 4; z.frame = Math.floor(z.anim) % 4; } else z.frame = 0;
  }
}

function pushSpookySprites(list, camX, camY, vw, vh, k) {
  const now = Date.now();
  for (const z of spooky.zombies) {
    if (z.x < camX - 60 || z.x > camX + vw + 60 || z.y < camY - 60 || z.y > camY + vh + 100) continue;
    list.push([z.y, z.sprites[z.dir][z.frame], Math.round(z.x) - 8 * k, Math.round(z.y) - 23 * k, false, k]);
  }
  for (const g of spooky.ghosts) {
    if (g.x < camX - 60 || g.x > camX + vw + 60 || g.y < camY - 60 || g.y > camY + vh + 100) continue;
    const img = spooky.sprites.ghost[Math.floor(now / 300 + g.ph) % 2];
    const bob = Math.sin(now / 400 + g.ph) * 3;
    // els fantasmes suren: es dibuixen per sobre de tot el que tenen a prop
    list.push([g.y + 40, img, Math.round(g.x - (img.width / 2) * k), Math.round(g.y - (img.height + 6) * k + bob), false, 0]);
  }
}

function drawSpookyOverlay(camX, camY, z) {
  for (const s of spooky.zombies) if (s.say) drawBubble(s.say, s.x, s.y, camX, camY, z, 14 * z);
  for (const g of spooky.ghosts) if (g.say) drawBubble(g.say, g.x, g.y, camX, camY, z, 14 * z);
}

// Fantasma semitransparent amb la vora inferior ondulada (2 fotogrames)
function makeGhost(f) {
  const p = new Pix(16, 18), body = [236, 242, 255, 190], shadowC = [176, 190, 230, 190];
  for (let y = 0; y < 18; y++) for (let x = 0; x < 16; x++) {
    const dx = (x - 7.5) / 7, dy = (y - 7) / 7;
    const top = y < 8 ? dx * dx + dy * dy < 1 : Math.abs(x - 7.5) < 7;
    const wave = y >= 15 && ((x + f * 2) % 4 < 2 ? y > 15 : false);
    if (top && !wave && y < 18 - ((x + f * 2) % 4 === 3 ? 2 : 0)) p.set(x, y, x > 10 ? shadowC : body);
  }
  p.rect(4, 6, 2, 3, [30, 30, 50, 255]); p.rect(9, 6, 2, 3, [30, 30, 50, 255]); // ulls
  p.rect(6, 10, 3, 2, [30, 30, 50, 230]);                                      // boca "o"
  p.outline([60, 70, 120, 160]);
  return p.toCanvas();
}
