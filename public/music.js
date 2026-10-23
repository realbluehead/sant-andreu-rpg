// Música de fons chiptune (composicions originals) sintetitzada amb Web Audio, imitant els canals
// d'una consola de 8 bits: ones quadrades (melodia i arpegis), triangular (baix) i soroll
// (bateria). Cada zona del barri (themes.js) té la seva cançó i en canviar de zona es fa un
// fos. Comença amb la primera interacció i es pot activar/desactivar amb el botó o la tecla B.
"use strict";

const MUSIC_KEY = "santandreu-rpg-music";
const LOOKAHEAD = 0.15, MUSIC_VOL = 0.15;

// Melodies en corxeres: nota, "." allarga la nota anterior, "-" silenci.
// steps = corxeres per compàs; drums = patró de bateria; arp = semicorxeres d'arpegi per corxera.
const SONGS = [
  { // 0 · Vila dels Bruixots: vals misteriós en mi menor (3/4)
    bpm: 138, steps: 6, lead: "arp", leadVol: 0.45, arpWave: "triangle", arp: 1, arpUp: 2, drums: "waltz",
    bars: [
      "B4 . E5 . G5 F#5", "E5 . . . B5 .", "A5 . G5 . F#5 .", "D#5 . . . B4 .",
      "B4 . E5 . G5 F#5", "E5 . . . B5 .", "D6 . C6 . B5 A#5", "B5 . . . - -",
      "C6 . B5 . A5 .", "G5 . A5 . B5 .", "A5 . G5 . F#5 .", "E5 . . . F#5 .",
      "G5 . A5 B5 C6 .", "B5 . A5 . G5 .", "F#5 . G5 . D#5 .", "E5 . . . - -",
    ],
    chords: ["Em", "Em", "Am", "B", "Em", "Em", "G", "B", "Am", "Em", "Am", "Em", "C", "Em", "B", "Em"],
  },
  { // 1 · La Comarca dels Turons: pastoral en re major, flauta
    bpm: 96, steps: 8, lead: "triangle", leadVol: 0.42, arpWave: "arp", arp: 2, arpUp: 1, drums: "soft",
    bars: [
      "D5 . E5 F#5 A5 . F#5 E5", "D5 . . . B4 . A4 .", "D5 . E5 F#5 A5 . B5 A5", "F#5 . . . E5 . . .",
      "G5 . F#5 E5 D5 . E5 F#5", "A5 . F#5 . D5 . B4 .", "A4 . D5 . E5 . F#5 E5", "D5 . . . - . - -",
    ],
    chords: ["D", "G", "D", "A", "G", "D", "A", "D"],
  },
  { // 2 · Poble de l'Heroi: tema del poble en fa major
    bpm: 116, steps: 8, lead: "lead", leadVol: 0.5, arpWave: "arp", arp: 2, arpUp: 1, drums: "village",
    bars: [
      "A4 . C5 . F5 . E5 D5", "C5 . . G4 . . A4 Bb4", "A4 . F4 . D5 . C5 Bb4", "A4 . G4 . F4 . G4 .",
      "A4 . C5 . F5 . G5 A5", "G5 . E5 . C5 . D5 E5", "F5 . D5 . Bb4 . C5 D5", "C5 . . . - . - -",
      "D5 . E5 F5 E5 . D5 .", "F5 . . D5 Bb4 . . .", "C5 . D5 E5 F5 . A4 .", "G4 . . . E4 . G4 .",
      "D5 . E5 F5 G5 . A5 .", "Bb5 . A5 G5 F5 . D5 .", "E5 . F5 G5 E5 . C5 .", "F5 . . . - . - -",
    ],
    chords: ["F", "C", "Dm", "Bb", "F", "C", "Bb", "C", "Dm", "Bb", "F", "C", "Dm", "Bb", "C", "F"],
  },
  { // 3 · Districte del Vapor: marxa mecànica en do menor
    bpm: 124, steps: 8, lead: "lead", leadVol: 0.45, staccato: true, arpWave: "arp", arp: 2, arpUp: 0, drums: "march",
    bars: [
      "C5 . C5 Eb5 G5 . F5 Eb5", "D5 . G4 . B4 . D5 .", "C5 . C5 Eb5 G5 . Ab5 G5", "F5 . D5 . B4 . G4 .",
      "Ab4 . C5 . Eb5 . Ab5 .", "G5 . Eb5 . C5 . G4 .", "F4 . Ab4 . D5 . F5 Eb5", "D5 . B4 . C5 . - .",
    ],
    chords: ["Cm", "G", "Cm", "G", "Ab", "Cm", "Fm", "G"],
  },
  { // 4 · Racó Kawaii: melodia saltironant en do major
    bpm: 136, steps: 8, lead: "arp", leadVol: 0.5, arpWave: "half", arp: 2, arpUp: 1, drums: "pop",
    bars: [
      "E5 G5 C6 . G5 . E5 .", "F5 A5 C6 . A5 . F5 .", "G5 . A5 . G5 E5 C5 .", "D5 . E5 . D5 . - .",
      "E5 G5 C6 . G5 . E5 .", "F5 A5 D6 . C6 . A5 .", "G5 . E5 . D5 . G4 .", "C5 . . . - . - -",
    ],
    chords: ["C", "F", "C", "G", "C", "F", "G", "C"],
  },
  { // 5 · Ruta dels Monstres: tema d'aventura en sol major
    bpm: 150, steps: 8, lead: "lead", leadVol: 0.5, arpWave: "arp", arp: 2, arpUp: 1, drums: "adventure",
    bars: [
      "D5 . G5 . B5 . A5 G5", "F#5 . A5 . D6 . C6 B5", "C6 . B5 A5 G5 . E5 .", "F#5 . . . D5 . . .",
      "D5 . G5 . B5 . A5 G5", "A5 . B5 . C6 . E6 D6", "C6 . B5 . A5 . F#5 .", "G5 . . . - . D5 .",
    ],
    chords: ["G", "D", "C", "D", "G", "Am", "D", "G"],
  },
  { // 6 · Nit de monstres: tema de terror en re menor, lent, amb tritons i un batec de cor
    bpm: 80, steps: 8, lead: "arp", leadVol: 0.4, arpWave: "triangle", arp: 2, arpUp: 0, drums: "heart",
    bars: [
      "D5 . . . F5 . E5 .", "D5 . . . A4 . . .", "G4 . Bb4 . D5 . C#5 .", "D5 . . . - . - -",
      "A5 . . . G#5 . . .", "G5 . F5 . E5 . Bb4 .", "A4 . G4 . F4 . E4 .", "D4 . . . - . - -",
    ],
    chords: ["Dm", "Bb", "Gm", "A", "Dm", "Edim", "Gm", "A"],
  },
];
const NIGHT_SONG = 6;
const CHORDS = {
  F: ["F3", "A3", "C4"], C: ["C3", "E3", "G3"], Dm: ["D3", "F3", "A3"], Bb: ["Bb2", "D3", "F3"],
  Em: ["E3", "G3", "B3"], Am: ["A2", "C3", "E3"], B: ["B2", "D#3", "F#3"], G: ["G2", "B2", "D3"],
  D: ["D3", "F#3", "A3"], A: ["A2", "C#3", "E3"], Cm: ["C3", "Eb3", "G3"], Ab: ["Ab2", "C3", "Eb3"], Fm: ["F2", "Ab2", "C3"],
  Gm: ["G2", "Bb2", "D3"], Edim: ["E3", "G3", "Bb3"],
};
// Patrons de bateria per corxera: k = bombo, s = caixa, h = xarles (a la meitat de la corxera)
const DRUMS = {
  village: { k: [0, 4], s: [2, 6], h: "off" },
  waltz: { k: [0], s: [], h: [2, 4] },
  soft: { k: [0], s: [], h: [4] },
  march: { k: [0, 2, 4, 6], s: [2, 6], h: "all" },
  pop: { k: [0, 4], s: [2, 6], h: "off" },
  adventure: { k: [0, 3, 4], s: [2, 6], h: "all" },
  heart: { k: [0, 1], s: [], h: [] },                  // batec de cor
};

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function freq(n) {
  const m = /^([A-G])(b|#)?(\d)$/.exec(n);
  const midi = 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === "b" ? -1 : m[2] === "#" ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}
const octave = (n, d) => n.replace(/\d/, (o) => String(Number(o) + d));

const music = { ctx: null, master: null, on: loadMusicPref(), started: false, step: 0, next: 0, timer: null,
  waves: {}, noise: null, song: SONGS[2], theme: 2 };

function loadMusicPref() { return store.get(MUSIC_KEY) !== "off"; }
function saveMusicPref() { store.set(MUSIC_KEY, music.on ? "on" : "off"); }

// Ona quadrada amb cicle de treball variable (12,5 %, 25 %, 50 %), com els canals de pols de la NES
function pulseWave(ctx, duty) {
  const n = 64, re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty) * 2;
  return ctx.createPeriodicWave(re, im);
}

function initAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  music.ctx = ctx;
  music.master = ctx.createGain();
  music.master.gain.value = MUSIC_VOL;
  music.master.connect(ctx.destination);
  music.waves = { lead: pulseWave(ctx, 0.25), arp: pulseWave(ctx, 0.125), half: pulseWave(ctx, 0.5) };
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

function drum(kind, t, vol = 1) {
  const { ctx } = music;
  if (kind === "kick") { // triangular que cau de to
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.9 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g); g.connect(music.master); o.start(t); o.stop(t + 0.16);
    return;
  }
  const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  s.buffer = music.noise;
  f.type = kind === "hat" ? "highpass" : "bandpass";
  f.frequency.value = kind === "hat" ? 7000 : 1800;
  const dur = kind === "hat" ? 0.04 : 0.12, v = (kind === "hat" ? 0.18 : 0.35) * vol;
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(music.master);
  s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.01);
}

const stepDur = (song) => 60 / song.bpm / 2; // una corxera

// Programa les notes d'una corxera de la cançó actual
function scheduleStep(step, t) {
  const song = music.song, STEP = stepDur(song);
  const bar = Math.floor(step / song.steps) % song.bars.length, pos = step % song.steps;
  const tokens = song.bars[bar].split(" ");
  const tok = tokens[pos];
  if (tok !== "." && tok !== "-") {
    let len = 1;
    while (pos + len < song.steps && tokens[pos + len] === ".") len++;
    tone(song.lead, freq(tok), t, STEP * len * (song.staccato ? 0.55 : 0.95), song.leadVol);
  }
  // arpegi i baix "oom-pah"
  const chord = CHORDS[song.chords[bar]];
  for (let h = 0; h < song.arp; h++) {
    const n = octave(chord[(pos * song.arp + h) % 3], song.arpUp);
    tone(song.arpWave, freq(n), t + h * STEP / song.arp, STEP / song.arp * 0.8, song.arpWave === "triangle" ? 0.22 : 0.12);
  }
  if (pos % 2 === 0) tone("triangle", freq(octave(pos % 4 === 0 ? chord[0] : chord[2], -1)), t, STEP * 0.9, 0.55);
  // bateria
  const d = DRUMS[song.drums], soft = song.drums === "soft" || song.drums === "waltz" ? 0.6 : 1;
  if (d.k.includes(pos)) drum("kick", t, soft);
  if (d.s.includes(pos)) drum("snare", t);
  if (d.h === "all") { drum("hat", t, 0.7); drum("hat", t + STEP / 2); }
  else if (d.h === "off") drum("hat", t + STEP / 2);
  else if (d.h.includes(pos)) drum("hat", t, soft);
}

function tick() {
  const { ctx } = music;
  while (music.next < ctx.currentTime + LOOKAHEAD) {
    scheduleStep(music.step, music.next);
    music.step++;
    music.next += stepDur(music.song);
  }
}

// Música segons el moment: de nit (monstres) la de terror, si no la de la zona
function applyMusic() {
  setMusicTheme(world.monsters ? NIGHT_SONG : currentZone < 0 ? 2 : currentZone);
}

// Canvia la cançó segons la zona, amb un fos curt
function setMusicTheme(th) {
  if (th === music.theme) return;
  music.theme = th;
  if (!music.ctx || !music.timer) { music.song = SONGS[th]; music.step = 0; return; }
  const { ctx, master } = music, now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(0, now + 0.35);
  setTimeout(() => {
    music.song = SONGS[th];
    music.step = 0;
    music.next = ctx.currentTime + 0.05;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(MUSIC_VOL, ctx.currentTime + 0.5);
  }, 380);
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

addSystem({ init: initMusic });
