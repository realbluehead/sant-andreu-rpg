# Sant Andreu RPG

Un mapa explorable en estil pixel art RPG de **Sant Andreu de Palomar** (Barcelona), generat a partir de dades reals d'[OpenStreetMap](https://www.openstreetmap.org). Camina pels carrers, places i parcs del barri amb un personatge que pots personalitzar.

## Com jugar

Juga directament a **https://realbluehead.github.io/sant-andreu-rpg/**

O en local:

```bash
python3 -m http.server 8737 --directory public
```

Obre <http://localhost:8737>.

| Tecla | Acció |
|---|---|
| Fletxes / WASD | caminar |
| Shift | córrer |
| + / − o roda del ratolí | zoom (també amb els botons de dalt a la dreta) |
| Arrossegar | moure la càmera |
| C | centrar la càmera |
| M | minimapa (clic per teletransportar-te) |
| L | rètols de carrers i places |
| N | mode fantasma (travessa edificis) |
| P | personalitzar l'avatar |
| H | amagar l'ajuda |

Al mòbil apareixen controls tàctils: un joystick per caminar, el botó **Córrer**, **MAPA** per obrir el minimapa i **CENTRAR** per tornar la càmera al personatge. També pots arrossegar el mapa amb el dit.

## Com està fet

- `data/osm.json` — dades d'OpenStreetMap descarregades amb l'API d'Overpass (edificis, vies, usos del sòl, arbres, llocs).
- `build_map.py` — rasteritza les dades en una graella de tiles de 2 m (`public/map.bin`) i exporta carrers, llocs i el límit del barri (`public/map.json`). Només fa servir la biblioteca estàndard de Python.
- `public/game.js` — motor del joc en canvas: tiles i sprites pixel art generats per codi (panot barceloní, terrats, persianes verdes, plàtans…), càmera, col·lisions, rètols, minimapa i editor d'avatar.

Per regenerar el mapa després d'actualitzar `data/osm.json`:

```bash
python3 build_map.py
```

## Multijugador

Quan entres, el joc es connecta per WebSocket a un servidor de Cloudflare (Workers + Durable Objects, pla gratuït) i veus els altres avatars connectats, amb el seu nom i aspecte.

El codi del servidor és a `server/`:

```bash
cd server
npm install
npm run dev      # servidor local a ws://localhost:8787/ws (el joc en local s'hi connecta sol)
npm run deploy   # publica a Cloudflare (cal `npx wrangler login`)
```

## Llicència de les dades

Dades del mapa © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), disponibles sota la llicència ODbL.
