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
| M | minimapa (clic sobre un punt blau per saber quin jugador és i a quina distància) |
| L | rètols de carrers i places |
| N | mode fantasma (travessa edificis) |
| P | personalitzar l'avatar |
| Enter / T | escriure un missatge (màx. 30 caràcters) que surt en una bombolla |
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

## Establiments

Els bars, cafeteries, forns, farmàcies, restaurants, supermercats i altres comerços d'OpenStreetMap (`data/pois.json`) surten al mapa amb una icona pixel art segons el tipus: una cervesa als bars, una tassa de cafè a les cafeteries, una creu verda a les farmàcies, coberts als restaurants, etc. Quan t'hi acostes, el nom de l'establiment apareix al panell de dalt.

## Monedes

Cada 5 segons el servidor fa aparèixer una moneda en un lloc accessible del barri (fins a 50 alhora). Les monedes són compartides: quan algú n'agafa una, desapareix per a tothom. El comptador de monedes surt al panell de dalt, i una fletxa a la vora de la pantalla indica a quants metres és el tresor més proper (al minimapa no surten).

Els punts on poden aparèixer els genera `build_map.py` a `server/src/spawns.json`.

Les monedes que recull van a la **cartera** ("A sobre"). Si passes per un **banc o caixer** queden **assegurades** ("Banc") i ja no te les poden robar.

## Bars, cafeteries i embriaguesa

Tens un nivell d'**embriaguesa** de 0 a 20. Cada vegada que entres a un **bar** i portes monedes, pagues 1 moneda i et prens una cervesa (+1). Com més embriagat vas, més **ziga-zaga** fas en caminar. Només baixa prenent **cafès** a les cafeteries (1 moneda, -3).

La posició, l'embriaguesa i les monedes es guarden al navegador: en recarregar tornes on eres.

## Lladres

Hi ha **90 lladres** amb antifaç que ronden pel barri. Si et veuen (a uns 18 m i sense cap edifici pel mig) et persegueixen, una mica més lents que tu. Si t'atrapen et roben totes les monedes que portes a sobre; les del banc no. Si t'allunyes prou o els perds de vista, es rendeixen. Els lladres són locals: cada jugador té els seus i només el persegueixen a ell.

## NPCs i vida

- **10 policies en moto** fan la ronda pels carrers del barri, amb les llums blaves i vermelles enceses.
- **24 ciclistes** circulen pels carrils bici i els carrers tranquils.
- **14 patinets elèctrics** van rapidíssim pels mateixos carrers: gairebé no els pots esquivar.
- **Gats i gossos** passegen per places, parcs, voreres i patis interiors; si t'hi acostes potser et diuen "Miau!" o "Guau!".
- **Estols de coloms** picotegen a les places i alcen el vol quan t'hi acostes.
- De tant en tant apareixen **bandes de 10 ultres de la UESA** (Unió Esportiva Sant Andreu) amb samarretes grogues i vermelles i una senyera, que recorren el barri cantant. Quan n'hi ha una a prop surt un avís i al minimapa parpelleja en groc i vermell.
- Comences amb **100 punts de vida**. Perds vida si t'atropella un ciclista (**-5**), una moto de policia (**-20**) o un patinet (**-30**), o si et trepitgen els ultres (**-25**), amb un segon i mig de gràcia entre cops. A 0, has mort i pots ressuscitar a la Plaça d'Orfila.
- Quan t'atropella una bici, una moto o un patinet, **les monedes que portes a sobre cauen escampades al voltant**: les pots tornar a recollir durant un minut.
- Si t'acostes a una **farmàcia**, recuperes tota la vida.

Les rutes dels NPCs es generen a partir del graf de carrers d'OpenStreetMap (`graph` a `map.json`) amb una llavor fixa, i la posició depèn del rellotge: tots els jugadors veuen els mateixos NPCs al mateix lloc sense carregar el servidor.

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
