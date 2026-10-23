// Missions i nivells, a l'estil del WoW. A cada bar, cafeteria, farmàcia i banc hi ha un veí o
// veïna que dona missions: un "!" groc a sobre vol dir que en té una per a tu, un "?" groc que hi
// has d'anar a entregar-ne una, i un "?" gris que en tens una d'aquí a mitges. Les missions donen
// XP i monedes; cada nivell demana més XP que l'anterior i les missions es fan més llargues.
//
// Una missió és una llista d'objectius genèrics que avancen amb els esdeveniments del joc
// (emit a core.js): "coin" (recollir una moneda), "deposit" (ingressar al banc), "drink" (beure en
// un local), "talk" (parlar amb el donant d'un local), "visit" (arribar a un lloc) i "bike"
// (metres en Bicing). Afegir un tipus de missió nou és afegir una plantilla a QUEST_TEMPLATES.
// Tot és local de cada jugador (es desa al navegador); el nivell es mostra als altres jugadors.
"use strict";

const QUEST_KEY = "santandreu-rpg-quests";
const TALK_RADIUS = 30; // px: distància per parlar amb el donant
const GIVER_NAMES = ["la Montse", "en Jordi", "la iaia Pepeta", "en Quim", "la Núria", "el senyor Ramon", "la Laia", "en Pau",
  "l'Anna", "en Xavi", "la Rosa", "en Txema", "la Mercè", "l'avi Joan", "la Carme", "en Biel", "la Marta", "en Pep"];

// Objectes que es porten d'un lloc a un altre, segons d'on surten
const ITEMS = {
  bar: ["una caixa de cerveses", "un barril buit", "les claus del magatzem", "unes braves per emportar", "la samarreta de la UESA"],
  cafe: ["un sac de cafè", "una safata de croissants", "un termo de xocolata", "una coca de llardons"],
  pharmacy: ["un paquet de medicaments", "una recepta", "unes tiretes", "un xarop per a la tos"],
  bank: ["un sobre segellat", "uns documents per signar", "una llibreta d'estalvis", "una bossa de monedes"],
};
const VENUE_LABEL = { bar: "el bar", cafe: "la cafeteria", pharmacy: "la farmàcia", bank: "el banc" };

const quests = { level: 1, xp: 0, active: [], done: {}, tracked: null, offers: new Map(), ding: 0, dialog: null, lastPos: null };

// XP per passar del nivell L al següent: creix més de pressa que el nivell
const xpToNext = (L) => Math.round(CFG.quests.xpBase * L ** CFG.quests.xpExponent);
// XP d'una missió: fracció del nivell, que baixa a poc a poc (cada nivell demana més missions)
const questXp = (L, factor) => Math.max(10, Math.round(xpToNext(L) * factor * CFG.quests.rewardScale / (1 + 0.04 * (L - 1))));
const metersBetween = (a, b) => Math.round(Math.hypot(a.x - b.x, a.y - b.y) * state.meta.metersPerTile);
const venueById = (id) => venues.find((v) => v.id === id);
const venueName = (v) => v.p.n || VENUE_LABEL[v.kind];
const giverName = (v) => GIVER_NAMES[hash2(venues.indexOf(v), 77) % GIVER_NAMES.length];
// "a" / "de" + nom amb article, amb les contraccions del català (al senyor Ramon, del senyor Ramon)
const toName = (who) => (who.startsWith("el ") ? "al " + who.slice(3) : "a " + who);
const ofName = (who) => (who.startsWith("el ") ? "del " + who.slice(3) : "de " + who);

// Tria un local d'un tipus a una distància raonable (més lluny com més nivell)
function pickVenue(r, from, kinds, L, exclude = []) {
  const mpt = state.meta.metersPerTile, min = (120 + 30 * L) / mpt, max = (350 + 110 * L) / mpt;
  const ok = venues.filter((v) => kinds.includes(v.kind) && v !== from && !exclude.includes(v));
  const inRange = ok.filter((v) => { const d = Math.hypot(v.p.x - from.p.x, v.p.y - from.p.y); return d >= min && d <= max; });
  const list = inRange.length ? inRange : ok;
  return list.length ? list[(r() * list.length) | 0] : null;
}
function pickPlace(r, from, L) {
  const mpt = state.meta.metersPerTile, min = (150 + 30 * L) / mpt, max = (450 + 120 * L) / mpt;
  const places = (state.meta.places || []).filter((p) => p.name && !(g(Math.floor(p.x), Math.floor(p.y)) & OUTSIDE)); // dins del barri
  const inRange = places.filter((p) => { const d = Math.hypot(p.x - from.p.x, p.y - from.p.y); return d >= min && d <= max; });
  const list = inRange.length ? inRange : places;
  return list.length ? list[(r() * list.length) | 0] : null;
}

// ---------------------------------------------------------------------------
// Plantilles de missions. Cada una rep (r, venue del donant, nivell) i torna la missió o null.
// Objectius: { kind, need, label, room?, place?, venueKind? }; turnIn: on s'entrega.
const QUEST_TEMPLATES = [
  { kinds: ["bar", "cafe", "bank", "pharmacy"], weight: 3, make(r, v, L) {
    const n = 3 + Math.floor(L * 0.8) + ((r() * 3) | 0);
    return { title: "Monedes perdudes", factor: 0.3,
      text: `Quin disgust! Avui he perdut el moneder pel barri i ja no sé on para. Si en trobes ${n} pel carrer, me les portes? Te'n donaré una propina.`,
      done: "Mira que ets bona gent! Aquí tens la teva part.",
      objectives: [{ kind: "coin", need: n, label: "Monedes recollides" }] };
  } },
  { kinds: ["bank"], weight: 3, make(r, v, L) {
    const n = 3 + L + ((r() * 3) | 0);
    return { title: "Un compte d'estalvis", factor: 0.25,
      text: `Al barri hi ha massa lladres, criatura. Obre't un compte com cal: ingressa ${n} monedes aquí al banc i dorm tranquil.`,
      done: "Ben fet! Els diners, al banc, que al carrer volen.",
      objectives: [{ kind: "deposit", need: n, label: "Monedes ingressades" }] };
  } },
  { kinds: ["bar"], weight: 3, make(r, v, L) {
    const n = Math.min(6, 2 + Math.floor(L / 3));
    return { title: "La ruta de bars", factor: 0.4,
      text: `Aquest bar està bé, però el barri té molta vida! Fes-te una cervesa a ${n} bars diferents i després em dius quin t'ha agradat més.`,
      done: "Ja ets tot un andreuenc de pro! Té, et convido a la propera.",
      objectives: [{ kind: "drink", venueKind: "bar", need: n, label: "Bars diferents" }] };
  } },
  { kinds: ["bar", "cafe", "pharmacy", "bank"], weight: 4, make(r, v, L) {
    const to = pickVenue(r, v, ["bar", "cafe", "pharmacy", "bank"], L);
    if (!to) return null;
    const item = ITEMS[v.kind][(r() * ITEMS[v.kind].length) | 0], who = giverName(to);
    return { title: "Un encàrrec", factor: 0.35, item, turnIn: to.id,
      text: `Em faries un favor? Porta ${item} ${toName(who)}, que és a ${venueName(to)} (${metersBetween(v.p, to.p)} m). Ja m'ho pagarà quan pugui!`,
      done: `Ah, ${item}! Ja era hora. Gràcies per portar-ho fins aquí.`,
      objectives: [{ kind: "talk", room: to.id, need: 1, label: `Porta ${item} ${toName(who)}` }] };
  } },
  { kinds: ["bar", "pharmacy", "bank", "cafe"], weight: 3, make(r, v, L) {
    const fromKind = v.kind === "cafe" ? "pharmacy" : "cafe";
    const at = pickVenue(r, v, [fromKind], L);
    if (!at) return null;
    const item = ITEMS[fromKind][(r() * ITEMS[fromKind].length) | 0];
    return { title: "Ves-m'ho a buscar", factor: 0.45, item,
      text: `No em puc moure d'aquí. Passa per ${venueName(at)} (${metersBetween(v.p, at.p)} m): ${giverName(at)} em té guardat ${item}. Me'l portes?`,
      pickup: `Ah, vens per allò! Té, ${item}. Porta-li de pressa, eh?`,
      done: `Perfecte, ${item}! No sé què faria sense tu.`,
      objectives: [{ kind: "talk", room: at.id, need: 1, label: `Recull ${item} a ${venueName(at)}` }] };
  } },
  { kinds: ["bar", "cafe", "pharmacy", "bank"], weight: 2, make(r, v, L) {
    const p = pickPlace(r, v, L);
    if (!p) return null;
    return { title: "Records del barri", factor: 0.3,
      text: `Fa anys que no passo per ${p.name}. Hi aniries i em tornes a explicar com està? Diuen que ho han deixat molt canviat.`,
      done: "Ai, quins records! Gràcies per explicar-m'ho.",
      objectives: [{ kind: "visit", place: { x: p.x, y: p.y, name: p.name }, need: 1, label: `Visita ${p.name}` }] };
  } },
  { kinds: ["cafe", "pharmacy"], weight: 2, make(r, v, L) {
    const m = 200 + 100 * Math.min(L, 15);
    return { title: "Fes salut, pedala!", factor: 0.35,
      text: `Has de moure't més! Agafa una bici del Bicing (tecla R a una estació) i fes-te ${m} metres. Després em passes a veure.`,
      done: "Quines galtes més vermelles! Així m'agrada.",
      objectives: [{ kind: "bike", need: m, label: "Metres en Bicing" }] };
  } },
];

// Missió que ofereix ara el donant d'un local (sempre la mateixa per a la n-èssima vegada)
function offerFor(v) {
  const n = quests.done[v.id] || 0, key = `${v.id}#${n}#${quests.level}`;
  if (quests.offers.has(key)) return quests.offers.get(key);
  const r = rng(hash2(venues.indexOf(v) * 31 + 7, n * 977 + 13));
  const pool = QUEST_TEMPLATES.filter((t) => t.kinds.includes(v.kind));
  let q = null;
  for (let tries = 0; tries < 6 && !q; tries++) {
    let w = r() * pool.reduce((a, t) => a + t.weight, 0), t = pool[0];
    for (const p of pool) { if ((w -= p.weight) <= 0) { t = p; break; } }
    q = t.make(r, v, quests.level);
  }
  if (q) {
    const L = quests.level;
    Object.assign(q, { id: key, giver: v.id, giverName: giverName(v), venueName: venueName(v), level: L, turnIn: q.turnIn || v.id,
      xp: questXp(L, q.factor), coins: 1 + Math.floor(L / 3) + ((r() * 2) | 0) });
    for (const o of q.objectives) o.have = 0;
    if (q.objectives.some((o) => o.kind === "drink")) q.seen = [];
  }
  quests.offers.set(key, q);
  return q;
}

const isReady = (q) => q.objectives.every((o) => o.have >= o.need);
const activeFrom = (v) => quests.active.find((q) => q.giver === v.id);

// Què s'ha de veure a sobre d'un local: "turnin" (? groc), "offer" (! groc), "busy" (? gris)
function venueMark(v) {
  if (!CFG.quests.enabled) return null;
  for (const q of quests.active) {
    if (q.objectives.some((o) => o.kind === "talk" && o.room === v.id && o.have < o.need)) return "turnin";
    if (q.turnIn === v.id && isReady(q)) return "turnin";
  }
  if (activeFrom(v)) return "busy";
  return quests.active.length < CFG.quests.maxActive && offerFor(v) ? "offer" : null;
}

// ---------------------------------------------------------------------------
// Progrés i recompenses
function progress(q, o, amount) {
  if (o.have >= o.need) return;
  o.have = Math.min(o.need, o.have + amount);
  if (o.have >= o.need) showBanner(isReady(q) ? `${q.title}: tot fet! Torna ${q.turnIn === q.giver ? "amb " + q.giverName : "a entregar-la"}` : `${o.label}: fet!`, "quest");
  saveQuests(); updateQuestUi();
}
function onQuestEvent(kind, fn) {
  for (const q of quests.active) for (const o of q.objectives) if (o.kind === kind && o.have < o.need) fn(q, o);
}

function gainXp(n) {
  quests.xp += n;
  npcs.floaters.push({ text: `+${n} XP`, t: 0, color: "#c084fc" });
  while (quests.level < CFG.quests.maxLevel && quests.xp >= xpToNext(quests.level)) {
    quests.xp -= xpToNext(quests.level);
    quests.level++;
    quests.ding = 2.2;
    npcs.hp = CFG.player.maxHp; updateHpUi(); // com al WoW: en pujar de nivell et cures del tot
    showBanner(`NIVELL ${quests.level}!`, "level");
    playDing();
    net.sendLook();
  }
  if (quests.level >= CFG.quests.maxLevel) quests.xp = 0;
}

function accept(q) {
  quests.active.push(q);
  quests.tracked = q.id;
  quests.offers.clear();
  showBanner(`Missió acceptada: ${q.title}`, "quest");
  saveQuests(); updateQuestUi();
}
function complete(q) {
  quests.active = quests.active.filter((a) => a !== q);
  quests.done[q.giver] = (quests.done[q.giver] || 0) + 1;
  if (quests.tracked === q.id) quests.tracked = quests.active[0]?.id || null;
  quests.offers.clear();
  coins.wallet += q.coins; saveMoney(); updateCoinUi("wallet");
  showBanner(`Missió completada: ${q.title}`, "quest");
  gainXp(q.xp);
  saveQuests(); updateQuestUi();
}
function abandon(id) {
  quests.active = quests.active.filter((q) => q.id !== id);
  if (quests.tracked === id) quests.tracked = quests.active[0]?.id || null;
  quests.offers.clear();
  saveQuests(); updateQuestUi(); renderQuestLog();
}

function saveQuests() {
  store.setJSON(QUEST_KEY, { level: quests.level, xp: quests.xp, active: quests.active, done: quests.done, tracked: quests.tracked });
}
function loadQuests() {
  const s = store.getJSON(QUEST_KEY);
  if (!s) return;
  quests.level = Math.max(1, Math.min(CFG.quests.maxLevel, s.level | 0 || 1));
  quests.xp = Math.max(0, +s.xp || 0);
  quests.done = s.done && typeof s.done === "object" ? s.done : {};
  // només les missions que encara tenen sentit (el local pot haver desaparegut del mapa)
  quests.active = (Array.isArray(s.active) ? s.active : []).filter((q) => venueById(q.giver) && venueById(q.turnIn) && Array.isArray(q.objectives));
  quests.tracked = quests.active.some((q) => q.id === s.tracked) ? s.tracked : quests.active[0]?.id || null;
}

// ---------------------------------------------------------------------------
// Parlar amb el donant (tecla O / E o el botó PARLA a dins d'un local)
function nearGiver() {
  const room = state.interior, g = room?.giver;
  if (!g || !CFG.quests.enabled) return null;
  return Math.hypot(g.x - state.player.x, g.y - state.player.y) < TALK_RADIUS ? g : null;
}

function tryTalk() {
  if (!nearGiver() || quests.dialog || npcs.dead) return false;
  const room = state.interior, v = venueById(room.id), g = room.giver;
  g.dir = state.player.y < g.y ? "up" : "down";
  // 1. objectius de "parla amb algú d'aquí" (entregar o recollir un objecte)
  let pickup = null;
  for (const q of quests.active) for (const o of q.objectives) {
    if (o.kind === "talk" && o.room === room.id && o.have < o.need) {
      o.have = o.need;
      if (q.turnIn !== room.id) pickup = q;
    }
  }
  saveQuests(); updateQuestUi();
  // 2. missions per entregar aquí
  const ready = quests.active.find((q) => q.turnIn === room.id && isReady(q));
  if (ready) return openDialog({ mode: "complete", q: ready, who: g.name });
  if (pickup) return openDialog({ mode: "pickup", q: pickup, who: g.name });
  // 3. una missió d'aquest donant a mitges
  const mine = activeFrom(v);
  if (mine) return openDialog({ mode: "progress", q: mine, who: g.name });
  // 4. una missió nova
  if (quests.active.length >= CFG.quests.maxActive) return openDialog({ mode: "full", who: g.name });
  const q = offerFor(v);
  return openDialog(q ? { mode: "offer", q, who: g.name } : { mode: "full", who: g.name });
}

const dlg = () => document.getElementById("quest-dialog");
function openDialog(d) {
  quests.dialog = d;
  const q = d.q, el = dlg();
  const obj = q ? q.objectives.map((o) => `<li class="${o.have >= o.need ? "ok" : ""}">${escapeHtml(o.label)}${o.need > 1 ? `: ${o.have}/${o.need}` : ""}</li>`).join("") : "";
  const rewards = q ? `<div class="rewards"><b>Recompenses</b><span class="xp">✦ ${q.xp} XP</span><span class="cn">● ${q.coins} moned${q.coins === 1 ? "a" : "es"}</span></div>` : "";
  let body, buttons;
  if (d.mode === "offer") {
    body = `<p>${escapeHtml(q.text)}</p><h4>Objectius</h4><ul>${obj}</ul>${rewards}`;
    buttons = `<button class="primary" data-act="accept">Acceptar</button><button data-act="close">Rebutjar</button>`;
  } else if (d.mode === "complete") {
    body = `<p>${escapeHtml(q.done)}</p>${rewards}`;
    buttons = `<button class="primary" data-act="complete">Completar missió</button>`;
  } else if (d.mode === "pickup") {
    body = `<p>${escapeHtml(q.pickup || "Té, aquí ho tens.")}</p><h4>Objectius</h4><ul>${obj}</ul>`;
    buttons = `<button class="primary" data-act="close">D'acord</button>`;
  } else if (d.mode === "progress") {
    body = `<p>Com va? ${q.objectives.length > 1 || q.objectives[0].need > 1 ? "Encara no ho tens tot." : "Encara t'espero."}</p><ul>${obj}</ul>`;
    buttons = `<button class="primary" data-act="close">Hi vaig</button>`;
  } else {
    body = `<p>Ja tens moltes coses entre mans (com a molt ${CFG.quests.maxActive} missions). Torna quan n'hagis acabat alguna!</p>`;
    buttons = `<button class="primary" data-act="close">D'acord</button>`;
  }
  el.querySelector(".who").textContent = d.who;
  el.querySelector("h3").textContent = q ? q.title : "Ara no";
  el.querySelector(".body").innerHTML = body;
  el.querySelector(".buttons").innerHTML = buttons;
  el.classList.remove("hidden");
  state.dialog = true;
  return true;
}
function closeDialog() {
  quests.dialog = null;
  dlg().classList.add("hidden");
  state.dialog = false;
}
function dialogAction(act) {
  const d = quests.dialog;
  if (!d) return;
  closeDialog();
  if (act === "accept") accept(d.q);
  if (act === "complete") complete(d.q);
}

// ---------------------------------------------------------------------------
// Diari de missions (tecla J o botó MISSIONS)
const logEl = () => document.getElementById("quest-log");
function toggleQuestLog(open = logEl().classList.contains("hidden")) {
  logEl().classList.toggle("hidden", !open);
  state.dialog = open || !!quests.dialog;
  if (open) renderQuestLog();
}
function renderQuestLog() {
  const list = logEl().querySelector(".list");
  logEl().querySelector(".lvl").textContent = `Nivell ${quests.level} · ${quests.xp}/${xpToNext(quests.level)} XP`;
  if (!quests.active.length) { list.innerHTML = `<p class="empty">No tens cap missió. Busca el <b>!</b> groc sobre els bars, cafeteries, farmàcies i bancs del barri.</p>`; return; }
  list.innerHTML = quests.active.map((q) => `
    <div class="q${q.id === quests.tracked ? " tracked" : ""}">
      <h4>${escapeHtml(q.title)} <small>${escapeHtml(ofName(q.giverName))} · ${escapeHtml(q.venueName)}</small></h4>
      <p>${escapeHtml(q.text)}</p>
      <ul>${q.objectives.map((o) => `<li class="${o.have >= o.need ? "ok" : ""}">${escapeHtml(o.label)}${o.need > 1 ? `: ${o.have}/${o.need}` : ""}</li>`).join("")}</ul>
      <div class="row"><span>✦ ${q.xp} XP · ● ${q.coins}</span>
        <button data-track="${escapeHtml(q.id)}">${q.id === quests.tracked ? "Seguint" : "Segueix"}</button>
        <button data-abandon="${escapeHtml(q.id)}">Abandona</button></div>
    </div>`).join("");
}

// ---------------------------------------------------------------------------
// HUD: nivell, barra d'XP i seguiment de missions
function updateQuestUi() {
  const lv = document.getElementById("level");
  lv.querySelector("b").textContent = quests.level;
  const need = xpToNext(quests.level);
  lv.querySelector("i").style.width = quests.level >= CFG.quests.maxLevel ? "100%" : `${(quests.xp / need) * 100}%`;
  lv.querySelector(".val").textContent = quests.level >= CFG.quests.maxLevel ? "MÀXIM" : `${quests.xp}/${need}`;
  const tr = document.getElementById("quest-tracker");
  tr.classList.toggle("hidden", !quests.active.length || !CFG.quests.enabled);
  tr.querySelector(".list").innerHTML = quests.active.map((q) => `
    <div class="${q.id === quests.tracked ? "tracked" : ""}${isReady(q) ? " ready" : ""}"><b>${escapeHtml(q.title)}</b>
    ${isReady(q) ? `<span class="ok">Torna a ${escapeHtml(venueById(q.turnIn) ? venueName(venueById(q.turnIn)) : "")}</span>`
      : q.objectives.map((o) => `<span class="${o.have >= o.need ? "ok" : ""}">- ${escapeHtml(o.label)}${o.need > 1 ? ` ${o.have}/${o.need}` : ""}</span>`).join("")}</div>`).join("");
}

// On ha d'anar el jugador per a una missió (per a la fletxa i el minimapa)
function questTarget(q) {
  for (const o of q.objectives) {
    if (o.have >= o.need) continue;
    if (o.kind === "talk") { const v = venueById(o.room); if (v) return { x: v.p.x, y: v.p.y, label: venueName(v) }; }
    if (o.kind === "visit") return { x: o.place.x, y: o.place.y, label: o.place.name };
    return null; // monedes, banc, bici…: es fan per tot arreu
  }
  const v = venueById(q.turnIn);
  return v ? { x: v.p.x, y: v.p.y, label: venueName(v) } : null;
}

// ---------------------------------------------------------------------------
// Bucle
function initQuests() {
  loadQuests();
  updateQuestUi();
  dlg().addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (b) dialogAction(b.dataset.act); });
  logEl().addEventListener("click", (e) => {
    const t = e.target.closest("[data-track]"), a = e.target.closest("[data-abandon]");
    if (t) { quests.tracked = t.dataset.track; saveQuests(); updateQuestUi(); renderQuestLog(); }
    if (a) abandon(a.dataset.abandon);
    if (e.target.closest("[data-close]") || e.target === logEl()) toggleQuestLog(false);
  });
  document.getElementById("quest-tracker").addEventListener("click", () => toggleQuestLog(true));
  document.getElementById("quests-btn").addEventListener("click", () => toggleQuestLog());
  // mentre hi ha un diàleg obert, el teclat és seu
  addEventListener("keydown", (e) => {
    if (!state.dialog || e.target instanceof HTMLInputElement) return;
    e.stopImmediatePropagation();
    if (e.repeat) return;
    if (e.key === "Escape" || e.code === "KeyJ") { if (quests.dialog) closeDialog(); toggleQuestLog(false); }
    if (e.key === "Enter" && quests.dialog) { e.preventDefault(); dlg().querySelector(".buttons .primary")?.click(); }
  }, true);
}

function updateQuests(dt) {
  if (quests.ding > 0) quests.ding -= dt;
  const pl = state.player, tx = pl.x / TS, ty = pl.y / TS;
  onQuestEvent("visit", (q, o) => { if (Math.hypot(o.place.x - tx, o.place.y - ty) < 6) progress(q, o, 1); });
  // metres en bici
  if (state.riding && quests.lastPos) {
    const d = Math.hypot(pl.x - quests.lastPos.x, pl.y - quests.lastPos.y) / TS * state.meta.metersPerTile;
    if (d > 0 && d < 20) onQuestEvent("bike", (q, o) => { o.have = Math.min(o.need, o.have + d); if (o.have >= o.need) progress(q, o, 0); else if (Math.random() < 0.05) updateQuestUi(); });
  }
  quests.lastPos = { x: pl.x, y: pl.y };
}

function updateQuestsIndoors(dt) {
  if (quests.ding > 0) quests.ding -= dt;
}

// Signes sobre els locals: "!" (missió per a tu), "?" groc (per entregar), "?" gris (a mitges)
function drawMark(mark, sx, sy, z) {
  const fs = Math.round(28 * dpr), bob = Math.sin(performance.now() / 300) * 2 * dpr;
  ctx.font = `${fs}px "Press Start 2P", monospace`;
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  const ch = mark === "offer" ? "!" : "?";
  ctx.lineWidth = 5 * dpr; ctx.strokeStyle = "#1a1420"; ctx.lineJoin = "round";
  ctx.strokeText(ch, sx, sy + bob);
  ctx.fillStyle = mark === "busy" ? "#a8a8b0" : "#ffd23f";
  ctx.fillText(ch, sx, sy + bob);
  ctx.textAlign = "left";
}
function drawQuestOverlay(camX, camY, z) {
  if (!CFG.quests.enabled) return;
  const vw = canvas.width / z, vh = canvas.height / z;
  for (const v of venues) {
    const x = v.p.x * TS, y = v.p.y * TS;
    if (!inView(x, y, camX, camY, vw, vh, 40, 60) || !fogExplored(v.p.x, v.p.y)) continue;
    const mark = venueMark(v);
    if (mark && mark !== "busy") drawMark(mark, (x - camX) * z, (y - camY) * z - 62 * dpr, z); // per sobre del rètol
  }
}
function drawQuestTop(camX, camY, z) {
  if (quests.ding > 0) drawDing(state.player.x, state.player.y, camX, camY, z);
  const q = quests.active.find((a) => a.id === quests.tracked);
  const t = q && questTarget(q);
  if (t && !npcs.dead) drawEdgePointer(t.x * TS, t.y * TS, `${t.label} · ${metersBetween(t, { x: state.player.x / TS, y: state.player.y / TS })} m`, "#c084fc", camX, camY, z);
}
// A dins: el signe sobre el cap del donant
function drawQuestIndoors(room, camX, camY, z) {
  const g = room.giver, v = venueById(room.id);
  if (!g || !v) return;
  const mark = venueMark(v);
  if (mark) drawMark(mark, (g.x - camX) * z, (g.y - camY) * z - 30 * z, z);
  if (nearGiver()) drawNameTag(g.name, g.x, g.y, camX, camY, z, "#ffd23f", 14 * z);
}
function drawQuestMinimap(c, scale) {
  if (!CFG.quests.enabled) return;
  const pl = state.player, R = 140; // ! només dels locals propers, com al WoW
  c.font = "bold 9px monospace"; c.textAlign = "center"; c.textBaseline = "middle";
  for (const v of venues) {
    const mark = venueMark(v);
    if (!mark || mark === "busy") continue;
    if (mark === "offer" && Math.hypot(v.p.x - pl.x / TS, v.p.y - pl.y / TS) > R) continue;
    if (!fogExplored(v.p.x, v.p.y) && mark === "offer") continue;
    const x = v.p.x * scale, y = v.p.y * scale;
    c.fillStyle = "#1a1420"; c.fillText(mark === "offer" ? "!" : "?", x + 1, y + 1);
    c.fillStyle = "#ffd23f"; c.fillText(mark === "offer" ? "!" : "?", x, y);
  }
  for (const q of quests.active) {
    const t = questTarget(q);
    if (!t) continue;
    c.strokeStyle = q.id === quests.tracked ? "#c084fc" : "rgba(192,132,252,.6)"; c.lineWidth = 1.5;
    c.beginPath(); c.arc(t.x * scale, t.y * scale, 5, 0, Math.PI * 2); c.stroke();
  }
  c.textAlign = "left";
}

// "Ding!": columna de llum daurada en pujar de nivell
function drawDing(x, y, camX, camY, z) {
  const k = quests.ding / 2.2, sx = (x - camX) * z, sy = (y - camY) * z;
  const w = 46 * dpr * (0.6 + 0.4 * Math.sin(k * Math.PI)), h = 220 * dpr;
  const g = ctx.createLinearGradient(0, sy - h, 0, sy);
  g.addColorStop(0, "rgba(255,230,120,0)"); g.addColorStop(1, `rgba(255,220,90,${0.55 * k})`);
  ctx.fillStyle = g; ctx.fillRect(sx - w / 2, sy - h, w, h);
  for (let i = 0; i < 10; i++) {
    const a = i * 0.63 + performance.now() / 400, r = (1 - k) * 60 * dpr + 10 * dpr;
    ctx.fillStyle = `rgba(255,240,160,${k})`;
    ctx.fillRect(sx + Math.cos(a) * r, sy - 30 * dpr - ((i * 17 + (1 - k) * 160) % 160) * dpr, 3 * dpr, 3 * dpr);
  }
}
let dingAudio = null;
function playDing() {
  if (!music.on) return;
  try {
    dingAudio ||= new AudioContext();
    const t = dingAudio.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => {
      const o = dingAudio.createOscillator(), gn = dingAudio.createGain();
      o.type = "square"; o.frequency.value = f;
      gn.gain.setValueAtTime(0.0001, t + i * 0.09); gn.gain.exponentialRampToValueAtTime(0.08, t + i * 0.09 + 0.02);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.35);
      o.connect(gn).connect(dingAudio.destination); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.4);
    });
  } catch { /* sense àudio */ }
}

addSystem({
  init: initQuests, update: updateQuests, updateIndoors: updateQuestsIndoors,
  overlay: drawQuestOverlay, top: drawQuestTop, indoorOverlay: drawQuestIndoors, minimap: drawQuestMinimap,
  on: {
    coin() { onQuestEvent("coin", (q, o) => progress(q, o, 1)); },
    deposit(n) { onQuestEvent("deposit", (q, o) => progress(q, o, n)); },
    drink({ kind, room }) {
      onQuestEvent("drink", (q, o) => {
        if (o.venueKind !== kind || !room || q.seen.includes(room)) return;
        q.seen.push(room); progress(q, o, 1);
      });
    },
  },
});
