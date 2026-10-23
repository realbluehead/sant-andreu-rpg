// Test de fum del joc: serveix public/ en un port local, obre el joc en un Chromium sense finestra
// (escriptori i mòbil) i comprova que arrenca i que es poden jugar uns quants fotogrames sense
// errors: caminar, fer-se de nit, entrar i sortir d'un bar, fer una missió, obrir OPCIONS i el xat, fer zoom.
// No es connecta al servidor multijugador (el joc ha de funcionar igualment sense connexió).
// Ús:  cd tests && npm install && npm run smoke
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".bin": "application/octet-stream", ".css": "text/css", ".png": "image/png" };

const failures = [];
const fail = (msg) => { failures.push(msg); console.log(`  ✗ ${msg}`); };
const ok = (msg) => console.log(`  ✓ ${msg}`);

// 1. Tots els .js de public/ s'han de carregar des d'index.html (i al revés)
const html = await readFile(join(PUBLIC, "index.html"), "utf8");
const loaded = [...html.matchAll(/<script src="([\w-]+\.js)\?v=\d+"/g)].map((m) => m[1]);
const files = (await readdir(PUBLIC)).filter((f) => f.endsWith(".js"));
console.log("Scripts");
for (const f of files) if (!loaded.includes(f)) fail(`${f} no es carrega a index.html`);
for (const f of loaded) if (!files.includes(f)) fail(`index.html carrega ${f}, que no existeix`);
if (loaded[0] !== "core.js") fail("core.js ha de ser el primer script");
if (!failures.length) ok(`${loaded.length} scripts, tots a index.html`);

// 2. Servidor estàtic de public/
const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  if (path === "/") path = "/index.html";
  try {
    const body = await readFile(join(PUBLIC, path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/?server=ws://127.0.0.1:9/ws`; // servidor inexistent

// El navegador descarregat per Playwright o, si no hi és, el Chrome instal·lat
const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));

async function run(label, contextOpts) {
  console.log(label);
  const page = await (await browser.newContext(contextOpts)).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/WebSocket|ERR_CONNECTION|Failed to load resource|GSI_LOGGER/.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  try {
    await page.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 30000 });
    ok("el mapa es carrega");
  } catch {
    fail(`no arrenca: ${await page.locator("#loading").textContent()}`);
    errors.forEach((e) => fail(e));
    return;
  }
  await page.click("#title-guest");
  await page.evaluate(() => { if (intro.open) closeIntro(); });

  // el bucle real (requestAnimationFrame) ha de moure el jugador
  const x0 = await page.evaluate(() => state.player.x);
  await page.evaluate(() => state.keys.add("ArrowRight"));
  await page.waitForTimeout(800);
  await page.evaluate(() => state.keys.clear());
  const x1 = await page.evaluate(() => state.player.x);
  if (x1 !== x0) ok("el jugador camina"); else fail("el jugador no s'ha mogut");

  // fotogrames controlats: de dia, de nit i dins d'un bar
  const result = await page.evaluate(() => {
    const steps = [];
    const frames = (n, label) => {
      for (let i = 0; i < n; i++) {
        update(0.03);
        runSystems(state.interior ? "updateIndoors" : "update", 0.03);
        tickBubbles(0.03);
        if (state.interior) drawInterior(); else { draw(); drawMinimap(); }
        updateHud(0.03);
      }
      steps.push(label);
    };
    frames(60, "60 fotogrames de dia");
    world.offset = (((23 - worldClock().hour) % 24) + 24) % 24 * msPerHour(); // les 23 h
    frames(60, "60 fotogrames de nit");
    const night = world.monsters;
    world.offset = 0;
    const bar = venues.find((v) => v.kind === "bar");
    state.player.x = bar.p.x * TS; state.player.y = (bar.p.y + 0.5) * TS;
    frames(2, "davant del bar");
    enterBar();
    const inside = !!state.interior;
    frames(40, "dins del bar");
    exitBar();
    frames(5, "fora del bar");
    // missions: parlar amb el donant del bar, acceptar, fer l'objectiu i entregar-la
    const room = interiorFor(bar);
    enterBar();
    state.player.x = room.giver.x; state.player.y = room.giver.y + 12;
    frames(2, "al costat del donant");
    const talked = tryTalk();
    const offered = quests.dialog?.mode === "offer";
    dialogAction("accept");
    const q = quests.active[quests.active.length - 1];
    for (const o of q.objectives) o.have = o.need; // fem trampa: objectius complerts
    q.turnIn = room.id;
    const xp0 = quests.level * 1e6 + quests.xp;
    tryTalk();
    const completing = quests.dialog?.mode === "complete";
    dialogAction("complete");
    const xpUp = quests.level * 1e6 + quests.xp > xp0;
    gainXp(xpToNext(quests.level)); // ha de pujar de nivell
    frames(5, "missió completada");
    exitBar();
    frames(3, "fora amb marques de missió");
    toggleQuestLog(true); toggleQuestLog(false);
    var questOk = talked && offered && completing && xpUp && quests.level >= 2 && !quests.active.includes(q);
    toggleAvatarPanel(true); document.getElementById("avatar-random").click(); toggleAvatarPanel(false);
    toggleChat(true); toggleChat(false);
    setZoom(0); frames(3, "zoom ×0,5"); setZoom(2);
    // el canvas no pot quedar buit (càmera sobre el jugador, en zona ja descoberta)
    state.cam.x = state.player.x - canvas.width / dpr / ZOOMS[state.zoomIdx] / 2;
    state.cam.y = state.player.y - canvas.height / dpr / ZOOMS[state.zoomIdx] / 2;
    draw();
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    for (let i = 0; i < d.length; i += 4 * 997) colors.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return { steps, night, inside, out: !state.interior, colors: colors.size, systems: systems.length, questOk, level: quests.level };
  }).catch((e) => ({ error: e.message }));

  if (result.error) fail(`error jugant: ${result.error}`);
  else {
    ok(result.steps.join(", "));
    if (result.night) ok("de nit surten els monstres"); else fail("de nit no surten els monstres");
    if (result.inside && result.out) ok("s'entra i se surt del bar"); else fail("no s'ha pogut entrar i sortir del bar");
    if (result.colors > 20) ok(`el mapa es dibuixa (${result.colors} colors)`); else fail(`el mapa sembla buit (${result.colors} colors)`);
    if (result.questOk) ok(`missió acceptada i entregada, nivell ${result.level}`); else fail("el sistema de missions no ha funcionat");
    ok(`${result.systems} sistemes registrats`);
  }
  if (errors.length) errors.forEach((e) => fail(`error a la consola: ${e}`)); else ok("cap error a la consola");
  await page.context().close();
}

await run("Escriptori", { viewport: { width: 1280, height: 800 } });
await run("Mòbil", { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

await browser.close();
server.close();
console.log(failures.length ? `\n${failures.length} error(s)` : "\nTot correcte");
process.exit(failures.length ? 1 : 0);
