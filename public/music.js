// Música de fons chiptune (composició original) sintetitzada amb Web Audio, imitant els canals
// d'una consola de 8 bits: dues ones quadrades (melodia i arpegis), una triangular (baix) i
// soroll (bateria). Comença amb la primera interacció (els navegadors no deixen sonar abans)
// i es pot activar/desactivar amb el botó o la tecla B.
"use strict";

const MUSIC_KEY = "santandreu-rpg-music";
const BPM = 116, STEP = 60 / BPM / 2;           // una corxera
const LOOKAHEAD = 0.15;

// Melodia en corxeres: nota, "." allarga la nota anterior, "-" silenci
const SONG = {
  lead: [
    // A: tema del poble
    "A4 . C5 . F5 . E5 D5", "C5 . . G4 . . A4 Bb4", "A4 . F4 . D5 . C5 Bb4", "A4 . G4 . F4 . G4 .",
    "A4 . C5 . F5 . G5 A5", "G5 . E5 . C5 . D5 E5", "F5 . D5 . Bb4 . C5 D5", "C5 . . . - . - -",
    // B: pont
    "D5 . E5 F5 E5 . D5 .", "F5 . . D5 Bb4 . . .", "C5 . D5 E5 F5 . A4 .", "G4 . . . E4 . G4 .",
    "D5 . E5 F5 G5 . A5 .", "Bb5 . A5 G5 F5 . D5 .", "E5 . F5 G5 E5 . C5 .", "F5 . . . - . - -",
  ],
  chords: ["F", "C", "Dm", "Bb", "F", "C", "Bb", "C", "Dm", "Bb", "F", "C", "Dm", "Bb", "C", "F"],
};
const CHORDS = {
  F: ["F3", "A3", "C4"], C: ["C3", "E3", "G3"], Dm: ["D3", "F3", "A3"], Bb: ["Bb2", "D3", "F3"],
};
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function freq(n) {
  const m = /^([A-G])(b|#)?(\d)$/.exec(n);
  const midi = 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === "b" ? -1 : m[2] === "#" ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

const music = { ctx: null, master: null, on: loadMusicPref(), started: false, step: 0, next: 0, timer: null, waves: {}, noise: null };

function loadMusicPref() {
  try { return localStorage.getItem(MUSIC_KEY) !== "off"; } catch { return true; }
}
function saveMusicPref() {
  try { localStorage.setItem(MUSIC_KEY, music.on ? "on" : "off"); } catch { /* sense emmagatzematge */ }
}

// Ona quadrada amb cicle de treball variable (12,5 %, 25 %…), com els canals de pols de la NES
function pulseWave(ctx, duty) {
  const n = 64, re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty) * 2;
  return ctx.createPeriodicWave(re, im);
}

function initAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  music.ctx = ctx;
  music.master = ctx.createGain();
  music.master.gain.value = 0.15;
  music.master.connect(ctx.destination);
  music.waves.lead = pulseWave(ctx, 0.25);
  music.waves.arp = pulseWave(ctx, 0.125);
  const len = ctx.sampleRate * 0.5, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  music.noise = buf;
}

function tone(type, f, t, dur, vol) {
  const { ctx } = music;
  const o = ctx.createOscillator(), g = ctx.createGain();
  if (type === "triangle") o.type = "triangle";
  else o.setPeriodicWave(music.waves[type]);
  o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.setValueAtTime(vol, t + dur * 0.7);
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g); g.connect(music.master);
  o.start(t); o.stop(t + dur + 0.02);
}

function drum(kind, t) {
  const { ctx } = music;
  if (kind === "kick") { // triangular que cau de to
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g); g.connect(music.master); o.start(t); o.stop(t + 0.16);
    return;
  }
  const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  s.buffer = music.noise;
  f.type = kind === "hat" ? "highpass" : "bandpass";
  f.frequency.value = kind === "hat" ? 7000 : 1800;
  const dur = kind === "hat" ? 0.04 : 0.12, vol = kind === "hat" ? 0.18 : 0.35;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(music.master);
  s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.01);
}

// Programa les notes d'una corxera (step = índex global de corxera)
function scheduleStep(step, t) {
  const bars = SONG.lead.length, bar = Math.floor(step / 8) % bars, pos = step % 8;
  const tokens = SONG.lead[bar].split(" ");
  const tok = tokens[pos];
  if (tok !== "." && tok !== "-") {
    let len = 1;
    while (pos + len < 8 && tokens[pos + len] === ".") len++;
    tone("lead", freq(tok), t, STEP * len * 0.95, 0.5);
  }
  // arpegi en semicorxeres i baix "oom-pah"
  const chord = CHORDS[SONG.chords[bar]];
  for (let h = 0; h < 2; h++) {
    const n = chord[(pos * 2 + h) % 3];
    tone("arp", freq(n.replace(/\d/, (o) => String(Number(o) + 1))), t + h * STEP / 2, STEP / 2 * 0.8, 0.12);
  }
  const root = chord[0], fifth = chord[2];
  if (pos % 2 === 0) tone("triangle", freq((pos % 4 === 0 ? root : fifth).replace(/\d/, (o) => String(Number(o) - 1))), t, STEP * 0.9, 0.55);
  // bateria
  if (pos === 0 || pos === 4) drum("kick", t);
  if (pos === 2 || pos === 6) drum("snare", t);
  drum("hat", t + STEP / 2);
}

function tick() {
  const { ctx } = music;
  while (music.next < ctx.currentTime + LOOKAHEAD) {
    scheduleStep(music.step, music.next);
    music.step++;
    music.next += STEP;
  }
}

function startMusic() {
  if (!music.on) return;
  if (!music.ctx) initAudio();
  music.ctx.resume();
  if (!music.timer) {
    music.next = music.ctx.currentTime + 0.05;
    music.timer = setInterval(tick, 25);
  }
  music.started = true;
}
function stopMusic() {
  clearInterval(music.timer);
  music.timer = null;
  music.ctx?.suspend();
}

function toggleMusic(on = !music.on) {
  music.on = on;
  saveMusicPref();
  updateMusicUi();
  if (on) startMusic(); else stopMusic();
}

function updateMusicUi() {
  const b = document.getElementById("music-btn");
  b.classList.toggle("off", !music.on);
  b.setAttribute("aria-pressed", String(music.on));
  b.querySelector("span").textContent = music.on ? "Música: sí" : "Música: no";
}

function initMusic() {
  updateMusicUi();
  document.getElementById("music-btn").addEventListener("click", (e) => { e.stopPropagation(); toggleMusic(); });
  // els navegadors només deixen sonar àudio després d'una interacció
  const first = () => { if (music.on && !music.started) startMusic(); };
  addEventListener("keydown", first);
  addEventListener("pointerdown", first);
  addEventListener("keydown", (e) => {
    if (e.code === "KeyB" && !e.repeat && !(e.target instanceof HTMLInputElement)) toggleMusic();
  });
  // en amagar la pestanya, silenci
  document.addEventListener("visibilitychange", () => {
    if (!music.ctx) return;
    if (document.hidden) music.ctx.suspend();
    else if (music.on && music.started) music.ctx.resume();
  });
}
