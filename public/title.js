// Portada del joc (pixel art animat amb el títol "Sant Andreu") i inici de sessió amb Google.
// Si config.json té auth.googleClientId, surt el botó "Inicia sessió amb Google"; el token es
// verifica al servidor, que avisa per correu quan algú es registra per primer cop.
// També es pot jugar com a convidat.
"use strict";

const AUTH_KEY = "santandreu-rpg-auth"; // només recorda si l'última vegada es va entrar amb Google
const title = { open: true, raf: 0, t0: performance.now(), user: null, token: null };

function initTitle() {
  state.onTitle = true;
  document.getElementById("auth-out").addEventListener("click", signOut);
  document.getElementById("title-guest").addEventListener("click", () => startGame());
  addEventListener("keydown", (e) => {
    if (state.onTitle && e.key === "Enter") { e.preventDefault(); e.titleStart = true; startGame(); }
  });
  drawTitleLoop();
  setupGoogle();
}

function startGame() {
  if (!state.onTitle) return;
  state.onTitle = false;
  cancelAnimationFrame(title.raf);
  document.getElementById("title").classList.add("hidden");
  if (typeof startMusic === "function" && music.on) startMusic(); // el clic compta com a interacció
  showIntroOnce(); // primera partida: com es juga (intro.js)
}

// ---------------------------------------------------------------------------
// Google Identity Services
function setupGoogle() {
  const clientId = CFG.auth?.googleClientId;
  const box = document.getElementById("title-google");
  if (!clientId) { box.classList.add("hidden"); return; }
  const s = document.createElement("script");
  s.src = "https://accounts.google.com/gsi/client?hl=ca";
  s.async = true;
  s.onload = () => {
    google.accounts.id.initialize({
      client_id: clientId, callback: onGoogleCredential, auto_select: store.get(AUTH_KEY) === "google",
      cancel_on_tap_outside: true, use_fedcm_for_prompt: true,
    });
    google.accounts.id.renderButton(box, { theme: "filled_black", size: "large", shape: "pill", text: "signin_with", locale: "ca" });
    if (store.get(AUTH_KEY) === "google") google.accounts.id.prompt(); // usuari que ja havia entrat
  };
  document.head.appendChild(s);
}

function onGoogleCredential(resp) {
  const token = resp.credential;
  let info = {};
  try { info = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch { /* token invàlid */ }
  title.token = token;
  title.user = { name: info.given_name || info.name || "", email: info.email || "" };
  store.set(AUTH_KEY, "google");
  // si encara es diu "Jugador", agafa el nom de Google
  if (!state.look.name || state.look.name === DEFAULT_LOOK.name) {
    state.look.name = (title.user.name || "Jugador").slice(0, 16);
    saveLook(); net.sendLook();
  }
  sendAuth();
  updateAuthUi();
  startGame();
}

// el servidor verifica el token; es torna a enviar en cada reconnexió
function sendAuth() { if (title.token) net.send({ t: "auth", token: title.token }); }

function onAuthReply(m) {
  if (!m.ok) { showBanner("No s'ha pogut verificar el compte de Google", "warn"); return; }
  showBanner(m.newUser ? `Benvingut/da, ${m.name}! Compte creat` : `Hola de nou, ${m.name}!`, "bank");
}

function signOut() {
  store.set(AUTH_KEY, "");
  title.user = null; title.token = null;
  if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
  net.send({ t: "auth", token: "" });
  updateAuthUi();
}

function updateAuthUi() {
  const el = document.getElementById("auth-status");
  if (!el) return;
  el.textContent = title.user ? `Connectat amb Google (${title.user.email})` : "Jugant com a convidat";
  document.getElementById("auth-out").classList.toggle("hidden", !title.user);
}


// ---------------------------------------------------------------------------
// Il·lustració de la portada: el barri al capvespre, amb l'església, la xemeneia de la
// Fabra i Coats, cases amb finestres enceses, fanals i el teu avatar
function drawTitleLoop() {
  const cv = document.getElementById("title-art"), c = cv.getContext("2d");
  const W = 320, H = 180;
  cv.width = W; cv.height = H;
  c.imageSmoothingEnabled = false;
  const hero = makeHero("down", 0, state.look);
  const stars = Array.from({ length: 50 }, (_, i) => [hash2(i, 1) % W, hash2(i, 2) % 70, hash2(i, 3) % 7]);
  const houses = [];
  for (let x = -4, i = 0; x < W; i++) {
    const w = 22 + (hash2(i, 9) % 18), h = 28 + (hash2(i, 8) % 26);
    houses.push({ x, w, h, roof: ["#c8483c", "#3f72c4", "#4f9e48", "#d1803a", "#8a5aa8"][hash2(i, 7) % 5], wall: ["#efe0bd", "#e8d0a8", "#f4ead2"][hash2(i, 6) % 3] });
    x += w + 2;
  }
  const frame = (now) => {
    const t = (now - title.t0) / 1000;
    // cel
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#1b1d4a"); sky.addColorStop(0.45, "#6a3a78"); sky.addColorStop(0.75, "#e0707a"); sky.addColorStop(1, "#ffb878");
    c.fillStyle = sky; c.fillRect(0, 0, W, H);
    for (const [x, y, k] of stars) if ((Math.floor(t * 2) + k) % 7) { c.fillStyle = k % 2 ? "#ffffff" : "#ffe9a0"; c.fillRect(x, y, 1, 1); }
    // sol i núvols
    c.fillStyle = "#ffd27a"; c.beginPath(); c.arc(250, 118, 18, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#ffe8a8"; c.beginPath(); c.arc(250, 118, 13, 0, Math.PI * 2); c.fill();
    for (let i = 0; i < 4; i++) {
      const x = ((i * 97 + t * (4 + i)) % (W + 60)) - 60, y = 30 + i * 14;
      c.fillStyle = "rgba(255,190,200,.55)";
      c.fillRect(x, y, 40, 5); c.fillRect(x + 8, y - 4, 22, 4); c.fillRect(x + 30, y + 2, 16, 4);
    }
    // silueta llunyana
    c.fillStyle = "#4a2f5e";
    for (let x = 0; x < W; x += 12) c.fillRect(x, 108 - (hash2(x, 4) % 22), 12, 80);
    // xemeneia de la Fabra i Coats
    c.fillStyle = "#8a3a2a"; c.fillRect(42, 40, 9, 90); c.fillStyle = "#a84a34"; c.fillRect(42, 40, 3, 90);
    c.fillStyle = "#5a2418"; for (const y of [48, 70, 92]) c.fillRect(41, y, 11, 2);
    c.fillStyle = "#3a1810"; c.fillRect(40, 38, 13, 3);
    for (let i = 0; i < 5; i++) { // fum
      const k = (t * 0.6 + i * 0.2) % 1;
      c.fillStyle = `rgba(220,210,220,${0.5 * (1 - k)})`;
      c.fillRect(44 + k * 20 + Math.sin(k * 6) * 3, 34 - k * 30, 4 + k * 6, 3 + k * 3);
    }
    // església amb campanar
    c.fillStyle = "#d8c49a"; c.fillRect(150, 82, 46, 48);
    c.fillStyle = "#c4ae84"; c.fillRect(150, 82, 4, 48);
    c.fillStyle = "#e6d4aa"; c.fillRect(162, 40, 22, 50);
    c.fillStyle = "#6a4a7a"; c.beginPath(); c.moveTo(160, 41); c.lineTo(173, 14); c.lineTo(186, 41); c.fill();
    c.fillStyle = "#3a2a4a"; c.fillRect(169, 50, 8, 12); c.fillStyle = "#ffd76a"; c.fillRect(171, 54, 4, 6);
    c.fillStyle = "#b07ad8"; c.beginPath(); c.arc(173, 98, 7, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#ffd76a"; c.beginPath(); c.arc(173, 98, 3, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#5a3a22"; c.fillRect(167, 112, 12, 18);
    c.fillStyle = "#e8c040"; c.fillRect(172, 8, 2, 7); c.fillRect(170, 10, 6, 2); // creu
    // cases
    for (const h of houses) {
      if (h.x + h.w > 145 && h.x < 200) continue; // deixa veure l'església
      const y0 = 130 - h.h;
      c.fillStyle = h.wall; c.fillRect(h.x, y0, h.w, h.h);
      c.fillStyle = h.roof; c.fillRect(h.x - 2, y0 - 6, h.w + 4, 7);
      c.fillStyle = "rgba(0,0,0,.25)"; c.fillRect(h.x - 2, y0, h.w + 4, 2);
      for (let wy = y0 + 6; wy < 122; wy += 10) for (let wx = h.x + 4; wx < h.x + h.w - 6; wx += 8) {
        const lit = (hash2(wx, wy) + Math.floor(t / 3)) % 5 < 3;
        c.fillStyle = lit ? "#ffd76a" : "#3a4a6a"; c.fillRect(wx, wy, 4, 5);
        c.fillStyle = "#3f6f45"; c.fillRect(wx - 1, wy, 1, 5); c.fillRect(wx + 4, wy, 1, 5);
      }
    }
    // carrer, fanals i arbres
    c.fillStyle = "#a89c84"; c.fillRect(0, 130, W, 50);
    for (let x = 0; x < W; x += 6) for (let y = 132; y < H; y += 5) { c.fillStyle = (x + y) % 4 ? "#988c76" : "#b8ac94"; c.fillRect(x + ((y / 5) % 2) * 3, y, 4, 3); }
    c.fillStyle = "#8a7f6a"; c.fillRect(0, 130, W, 2);
    for (const x of [24, 118, 214, 300]) {
      c.fillStyle = "#2b2f3a"; c.fillRect(x, 104, 2, 30); c.fillRect(x - 2, 102, 6, 3);
      const g = c.createRadialGradient(x + 1, 104, 0, x + 1, 104, 16);
      g.addColorStop(0, "rgba(255,220,140,.7)"); g.addColorStop(1, "rgba(255,220,140,0)");
      c.fillStyle = g; c.fillRect(x - 15, 89, 32, 32);
    }
    for (const x of [70, 262]) {
      c.fillStyle = "#6b4426"; c.fillRect(x, 112, 3, 20);
      c.fillStyle = "#2f6e35"; c.beginPath(); c.arc(x + 1, 106, 11, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#4e9a45"; c.beginPath(); c.arc(x - 2, 103, 6, 0, Math.PI * 2); c.fill();
    }
    // l'avatar del jugador, que fa un saltiró
    const bob = Math.abs(Math.sin(t * 3)) * 3;
    c.fillStyle = "rgba(20,15,40,.35)"; c.beginPath(); c.ellipse(160, 160, 10, 3, 0, 0, Math.PI * 2); c.fill();
    c.drawImage(hero, 144, 112 - bob, 32, 48);
    title.raf = requestAnimationFrame(frame);
  };
  title.raf = requestAnimationFrame(frame);
}
