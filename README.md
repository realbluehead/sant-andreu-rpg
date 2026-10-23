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
| + / − o roda del ratolí | zoom de ×0,5 a ×2 (també amb els botons de dalt a la dreta); el teu avatar sempre té la mateixa mida i la resta (altres jugadors i NPCs) s'escalen amb el mapa |
| Arrossegar | moure la càmera |
| C | centrar la càmera |
| M | minimapa (clic sobre un punt blau per saber quin jugador és i a quina distància) |
| L | rètols de carrers i places |
| O | entrar al bar que tens davant |
| ESPAI | saltar (per passar per sobre de les bosses d'escombraries) |
| R | agafar o deixar una bici a una estació de Bicing |
| N | mode fantasma (travessa edificis) |
| P | personalitzar l'avatar |
| Enter / T | escriure un missatge (màx. 30 caràcters) que surt en una bombolla |
| B | activar o aturar la música |
| H | amagar l'ajuda |

Al mòbil apareixen controls tàctils: un joystick per caminar, el botó **Córrer**, **MAPA** per obrir el minimapa i **CENTRAR** per tornar la càmera al personatge. També pots arrossegar el mapa amb el dit.

## Zones temàtiques

El barri està dividit en 6 zones per carrers reals: el **Carrer Gran de Sant Andreu** separa el costat de muntanya del de mar, i el **Carrer de Malats** i el **Carrer de Sòcrates** el tallen en tres franges (cap al Besòs, al mig i cap al Llobregat). Cadascuna té el seu estil de tiles, teulades, façanes, arbres, rètols de botigues i música (`public/themes.js`). Són estils inspirats en sagues conegudes, amb noms i música de creació pròpia:

| Zona | Estil | Música |
|---|---|---|
| Vila dels Bruixots | Harry Potter: pedra fosca, pissarra, finestres ogivals, bolets | vals misteriós en mi menor |
| La Comarca dels Turons | El Senyor dels Anells: turons, palla, cases-turó amb portes rodones | pastoral amb flauta en re major |
| Poble de l'Heroi | Zelda: gespa, empedrat, teulades de colors | tema del poble en fa major |
| Districte del Vapor | steampunk: metall reblat, coure, ulls de bou, fum | marxa mecànica en do menor |
| Racó Kawaii | Hello Kitty: pastels, cors, llaços, quadres rosa | melodia saltironant en do major |
| Ruta dels Monstres | Pokémon: herba alta, camins nets, teulades llises | tema d'aventura en sol major |

Quan canvies de zona surt un avís, el panell mostra la zona actual i la música canvia amb un fos. Al minimapa es veuen les fronteres.

A la **Vila dels Bruixots**, els lladres van vestits de bruixot (túnica i barret en punta) i hi viuen **fantasmes** que suren travessant parets i espanten (però no fan mal) i **zombies** lents que, si et veuen, t'empaiten i et mosseguen (-10). Els zombies no surten de la Vila. Les quantitats i el dany es configuren a l'admin. A la **Ruta dels Monstres**, els lladres van amb una disfressa de drac de foc (caputxa amb banyes, ales i cua amb flama).

## Música

Cada zona té la seva música de fons, una composició original en estil chiptune de 8 bits, sintetitzada en directe amb Web Audio (`public/music.js`): dues ones quadrades (melodia i arpegis), una triangular (baix) i soroll (bateria). Comença amb la primera tecla o toc i es pot aturar amb el botó **Música** o la tecla **B**.

## Com està fet

- `data/osm.json` — dades d'OpenStreetMap descarregades amb l'API d'Overpass (edificis, vies, usos del sòl, arbres, llocs).
- `build_map.py` — rasteritza les dades en una graella de tiles de 2 m (`public/map.bin`) i exporta carrers, llocs i el límit del barri (`public/map.json`). Només fa servir la biblioteca estàndard de Python.
- `public/game.js` — motor del joc en canvas: tiles i sprites pixel art generats per codi en estil de poble RPG (gespa, camins de terra, empedrat, teulades de colors, cases amb bigues de fusta…), càmera, col·lisions, rètols, minimapa i editor d'avatar.

Per regenerar el mapa després d'actualitzar `data/osm.json`:

```bash
python3 build_map.py
```

## Establiments

Els comerços combinen tres fonts obertes, sense duplicats:

- **OpenStreetMap** (`data/pois.json`)
- **Cens de locals en planta baixa de l'Ajuntament de Barcelona** (2024, [Open Data BCN](https://opendata-ajuntament.barcelona.cat/data/ca/dataset/cens-locals-planta-baixa-act-economica), CC-BY 4.0) (`data/cens_locals.json`)
- **Overture Maps** ([overturemaps.org](https://overturemaps.org), CDLA-Permissive-2.0), que també indica quins negocis han tancat (`data/overture_places.json`)

Per actualitzar-les: `pip install duckdb` (per a Overture), `python3 fetch_businesses.py` i després `python3 build_map.py`.

Els bars, cafeteries, forns, farmàcies, restaurants, supermercats i altres comerços surten al mapa amb una icona pixel art segons el tipus: una cervesa als bars, una tassa de cafè a les cafeteries, una creu verda a les farmàcies, coberts als restaurants, etc. Quan t'hi acostes, el nom de l'establiment apareix al panell de dalt.

## Monedes

Cada 5 segons el servidor fa aparèixer una moneda en un lloc accessible del barri (fins a 50 alhora). Les monedes són compartides: quan algú n'agafa una, desapareix per a tothom. El comptador de monedes surt al panell de dalt, i una fletxa a la vora de la pantalla indica a quants metres és el tresor més proper (al minimapa no surten).

Els punts on poden aparèixer els genera `build_map.py` a `server/src/spawns.json`.

Les monedes que recull van a la **cartera** ("A sobre"). Si les ingresses al taulell d'un **banc** queden **assegurades** ("Banc") i ja no te les poden robar.

## Dia, nit i temps

El temps passa: **cada minut real és una hora** del joc (un dia dura 24 minuts) i tots els jugadors comparteixen el mateix rellotge. Al panell surt el dia, l'hora i el temps.

- **Nit**: de 19 a 22 h es fa fosc; de nit s'encenen els fanals, les finestres i els rètols, i portes un fanalet. A les 5 comença a clarejar.
- **Camions de les escombraries**: de 22 a 6 h circulen camions molt grans que bloquegen el pas.
- **Bosses d'escombraries**: de 7 a 21 h es van acumulant a les voreres i no desapareixen fins que hi passa un camió. Són obstacles que es poden saltar amb **ESPAI**.
- **Aigua**: si entres a l'aigua, nedes (més a poc a poc i sense bici).
- **Font de Can Fabra**: té brolladors animats.
- **Temps**: cada dos dies del joc canvia entre sol, núvols, pluja, boira o neu.

## Dins dels bars

Davant d'un bar, cafeteria, farmàcia o banc, prem **O** (o el botó **ENTRA** al mòbil) per entrar-hi. Cada local és inventat, generat a partir del seu nom (sempre igual per a tothom). Els bars i les cafeteries tenen barra, taules, cadires, cambrer i clients prenent alguna cosa, amb els colors de la zona; les farmàcies tenen prestatges, creu verda i cua; els bancs, finestretes, caixers automàtics i cordons. **L'acció es fa al taulell**: a la barra del bar et serveixen una cervesa, a la de la cafeteria un cafè, a la farmàcia et cures i al banc ingresses les monedes. Si hi ha altres jugadors al mateix bar, us veieu. Per tornar al barri, surt per la porta.

## Bicing

Hi ha **52 estacions de Bicing**: les 31 reals d'OpenStreetMap més 21 del joc, que `build_map.py` afegeix on les reals queden lluny perquè cap punt del barri quedi a més de 200 m d'una estació. Si ets a prop d'una estació i prems **R** (o el botó **BICI** al mòbil), agafes una bici i vas 3 vegades més ràpid. Per deixar-la has de tornar a una estació i prémer **R**. Els altres jugadors et veuen en bici.

## Bars, cafeteries i embriaguesa

Tens un nivell d'**embriaguesa** de 0 a 20. A la **barra d'un bar**, si portes monedes, pagues 1 moneda i et prens una cervesa (+1). Com més embriagat vas, més **ziga-zaga** fas en caminar. Només baixa prenent **cafès** a la barra d'una cafeteria (1 moneda, -3).

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
- Al taulell d'una **farmàcia**, recuperes tota la vida.

Les rutes dels NPCs es generen a partir del graf de carrers d'OpenStreetMap (`graph` a `map.json`) amb una llavor fixa, i la posició depèn del rellotge: tots els jugadors veuen els mateixos NPCs al mateix lloc sense carregar el servidor.

## Portada i comptes

En obrir el joc surt una portada en pixel art amb el títol **Sant Andreu**. Es pot jugar com a convidat o **iniciar sessió amb Google**. El servidor verifica el compte i guarda els jugadors registrats. L'avís per correu de nous registres (via [Resend](https://resend.com)) està programat però **desactivat de moment** (comentat a `server/src/index.js`).

Per activar-ho:

1. A [Google Cloud Console](https://console.cloud.google.com/apis/credentials) crea un *ID de client OAuth* de tipus **Aplicació web** amb orígens JavaScript autoritzats `https://realbluehead.github.io` i `http://localhost:8737`.
2. Posa aquest Client ID a `public/config.json` (`auth.googleClientId`) i a `server/wrangler.toml` (`GOOGLE_CLIENT_ID`).
3. (Opcional, per als avisos per correu) Descomenta `notifyNewUser` a `server/src/index.js` i `NOTIFY_EMAIL` a `server/wrangler.toml`, crea una clau d'API a Resend amb el compte del correu que ha de rebre els avisos i guarda-la com a secret: `cd server && npx wrangler secret put RESEND_API_KEY`.
4. `cd server && npx wrangler deploy`.

## Multijugador

Quan entres, el joc es connecta per WebSocket a un servidor de Cloudflare (Workers + Durable Objects, pla gratuït) i veus els altres avatars connectats, amb el seu nom i aspecte.

El codi del servidor és a `server/`:

```bash
cd server
npm install
npm run dev      # servidor local a ws://localhost:8787/ws (el joc en local s'hi connecta sol)
npm run deploy   # publica a Cloudflare (cal `npx wrangler login`)
```

## Admin (configuració del joc)

Tots els paràmetres del joc (quantitat i velocitat de NPCs, danys, lladres, animals, monedes, bars, xat…) són a `public/config.json`. Per editar-los hi ha una app d'admin local:

```bash
node admin/server.mjs
```

Obre <http://localhost:8790>. **Desar** escriu `public/config.json` (el joc en local l'agafa en recarregar) i **Publicar a GitHub** fa un commit només d'aquest fitxer i el puja. La web s'actualitza en un minut, i el servidor de Cloudflare llegeix el `config.json` publicat (com a molt un cop per minut) per a les monedes i el xat, sense haver-lo de tornar a desplegar.

L'admin només escolta a `127.0.0.1` i no té dependències. Els límits i textos de cada camp són a `admin/schema.json`.

Per provar el servidor en local amb la configuració local, copia `server/.dev.vars.example` a `server/.dev.vars`.

## Llicència de les dades

Dades del mapa © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), disponibles sota la llicència ODbL.
