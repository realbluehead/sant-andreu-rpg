#!/usr/bin/env python3
"""Rasteritza les dades d'OpenStreetMap de Sant Andreu de Palomar en una graella de tiles.

Entrada:  data/osm.json (Overpass, `out geom`)
Sortida:  public/map.bin   (zlib: capçalera + capa terra + capa decoració)
          public/map.json  (carrers, llocs i límit del barri, en coordenades de tile)
"""
import json, math, zlib, struct, os, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "data", "osm.json")
OUT = os.path.join(HERE, "public")

# Bounding box (amb marge al voltant del barri)
S, W, N, E = 41.4255, 2.1805, 41.4490, 2.1990
M_PER_TILE = 2.0
LAT0 = (S + N) / 2
KX = 111320 * math.cos(math.radians(LAT0)) / M_PER_TILE
KY = 110574 / M_PER_TILE
WIDTH = int(math.ceil((E - W) * KX))
HEIGHT = int(math.ceil((N - S) * KY))

# --- Tiles ---------------------------------------------------------------
GROUND, GRASS, PARK, ROAD, ROAD_LINE, SIDEWALK, PLAZA, CYCLEWAY, STEPS, CROSSWALK = range(10)
WATER, RAIL, SAND, PITCH, PARKING, GRAVEL, PLAYGROUND, POOL, DIRT, FOREST = range(10, 20)
SCHOOLYARD, CONCRETE, RUINS, TRACK = range(20, 24)
BUILDING_BASE = 40  # 40 + tipus*4 + variant
B_APARTMENTS, B_HOUSE, B_CHURCH, B_INDUSTRIAL, B_PUBLIC, B_COMMERCIAL = range(6)
OUTSIDE = 128  # bit alt: fora del barri

# Decoració
D_NONE, D_TREE, D_TREE2, D_FOUNTAIN, D_BENCH, D_LAMP = range(6)


def proj(lat, lon):
    return ((lon - W) * KX, (N - lat) * KY)


def h(*a):
    return int(hashlib.md5(repr(a).encode()).hexdigest()[:8], 16)


ground = bytearray(WIDTH * HEIGHT)  # GROUND per defecte
decor = bytearray(WIDTH * HEIGHT)


def fill_polygon(rings, tile, grid=ground, pred=None):
    """Omple per scanline amb regla parell-senar (suporta forats i anells partits)."""
    edges = []
    miny, maxy = 1e9, -1e9
    for ring in rings:
        for i in range(len(ring) - 1):
            (x0, y0), (x1, y1) = ring[i], ring[i + 1]
            if y0 == y1:
                continue
            edges.append((x0, y0, x1, y1))
            miny = min(miny, y0, y1)
            maxy = max(maxy, y0, y1)
    if not edges:
        return
    for ty in range(max(0, int(miny)), min(HEIGHT, int(maxy) + 1)):
        cy = ty + 0.5
        xs = []
        for x0, y0, x1, y1 in edges:
            if (y0 <= cy < y1) or (y1 <= cy < y0):
                xs.append(x0 + (cy - y0) * (x1 - x0) / (y1 - y0))
        xs.sort()
        row = ty * WIDTH
        for i in range(0, len(xs) - 1, 2):
            a = max(0, int(math.ceil(xs[i] - 0.5)))
            b = min(WIDTH - 1, int(math.floor(xs[i + 1] - 0.5)))
            for tx in range(a, b + 1):
                if pred is None or pred(grid[row + tx]):
                    grid[row + tx] = tile


def stroke(line, width_m, tile, grid=ground, pred=None):
    r = width_m / M_PER_TILE / 2
    r2 = r * r
    for i in range(len(line) - 1):
        (x0, y0), (x1, y1) = line[i], line[i + 1]
        dx, dy = x1 - x0, y1 - y0
        L2 = dx * dx + dy * dy or 1e-9
        for ty in range(max(0, int(min(y0, y1) - r)), min(HEIGHT, int(max(y0, y1) + r) + 1)):
            for tx in range(max(0, int(min(x0, x1) - r)), min(WIDTH, int(max(x0, x1) + r) + 1)):
                px, py = tx + 0.5 - x0, ty + 0.5 - y0
                t = max(0.0, min(1.0, (px * dx + py * dy) / L2))
                ex, ey = px - t * dx, py - t * dy
                if ex * ex + ey * ey <= r2:
                    k = ty * WIDTH + tx
                    if pred is None or pred(grid[k]):
                        grid[k] = tile


def sample_line(line, step):
    """Punts equiespaiats (en tiles) al llarg d'una polilínia."""
    out, acc = [], 0.0
    for i in range(len(line) - 1):
        (x0, y0), (x1, y1) = line[i], line[i + 1]
        seg = math.hypot(x1 - x0, y1 - y0)
        d = step - acc
        while d <= seg:
            t = d / seg
            out.append((x0 + t * (x1 - x0), y0 + t * (y1 - y0)))
            d += step
        acc = (acc + seg) % step
    return out


def way_coords(el):
    return [proj(p["lat"], p["lon"]) for p in el.get("geometry", []) if p]


def rel_rings(el, roles=("outer", "inner", "")):
    rings = []
    for m in el.get("members", []):
        if m.get("type") == "way" and m.get("role", "") in roles and m.get("geometry"):
            rings.append([proj(p["lat"], p["lon"]) for p in m["geometry"] if p])
    # Tanca els anells partits per a la regla parell-senar: unim per extrems
    return close_rings(rings)


def close_rings(parts):
    parts = [p for p in parts if len(p) > 1]
    rings = []
    while parts:
        cur = parts.pop()
        changed = True
        while changed and cur[0] != cur[-1]:
            changed = False
            for i, p in enumerate(parts):
                if p[0] == cur[-1]:
                    cur = cur + p[1:]
                elif p[-1] == cur[-1]:
                    cur = cur + p[::-1][1:]
                elif p[-1] == cur[0]:
                    cur = p + cur[1:]
                elif p[0] == cur[0]:
                    cur = p[::-1] + cur[1:]
                else:
                    continue
                parts.pop(i)
                changed = True
                break
        if cur[0] != cur[-1]:
            cur = cur + [cur[0]]
        rings.append(cur)
    return rings


def area_rings(el):
    if el["type"] == "way":
        c = way_coords(el)
        if len(c) >= 3:
            if c[0] != c[-1]:
                c = c + [c[0]]
            return [c]
        return []
    if el["type"] == "relation":
        return rel_rings(el)
    return []


def is_underground(t):
    try:
        layer = int(t.get("layer", "0"))
    except ValueError:
        layer = 0
    return t.get("tunnel") in ("yes", "building_passage_no") or t.get("location") == "underground" or layer < 0


data = json.load(open(SRC))
els = data["elements"]
print(f"Graella {WIDTH}x{HEIGHT} tiles ({M_PER_TILE} m/tile), {len(els)} elements")

# --- 1. Usos del sòl i àrees ---------------------------------------------
LANDUSE = {
    "grass": GRASS, "flowerbed": PARK, "recreation_ground": GRASS, "village_green": GRASS,
    "greenfield": GRASS, "meadow": GRASS, "allotments": DIRT, "construction": GRAVEL,
    "brownfield": GRAVEL, "railway": GRAVEL, "industrial": CONCRETE, "depot": CONCRETE,
    "retail": PLAZA, "commercial": PLAZA, "religious": PLAZA, "cemetery": GRASS, "forest": FOREST,
}
LEISURE = {
    "park": PARK, "garden": PARK, "playground": PLAYGROUND, "pitch": PITCH, "dog_park": DIRT,
    "sports_centre": CONCRETE, "swimming_pool": POOL, "track": TRACK, "golf_course": GRASS,
    "sports_hall": CONCRETE, "fitness_station": PLAYGROUND,
}
NATURAL = {"wood": FOREST, "scrub": FOREST, "grassland": GRASS, "sand": SAND, "water": WATER,
           "heath": GRASS, "bare_rock": GRAVEL}
AMENITY = {"school": SCHOOLYARD, "kindergarten": SCHOOLYARD, "university": SCHOOLYARD, "college": SCHOOLYARD,
           "parking": PARKING, "marketplace": PLAZA, "fountain": WATER}
AREA_HW = {"footway": PLAZA, "pedestrian": PLAZA, "sidewalk": SIDEWALK, "steps": STEPS,
           "traffic_island": SIDEWALK, "residential": ROAD, "service": ROAD}

layers = []  # (prioritat, rings, tile)
for el in els:
    t = el.get("tags", {})
    if el["type"] == "node" or "building" in t or is_underground(t):
        continue
    tile, prio = None, 0
    if t.get("landuse") in LANDUSE:
        tile, prio = LANDUSE[t["landuse"]], 1
    if t.get("amenity") in AMENITY and (el["type"] == "relation" or (el.get("geometry") and el["geometry"][0] == el["geometry"][-1])):
        tile, prio = AMENITY[t["amenity"]], 2 if t["amenity"] != "fountain" else 6
    if t.get("natural") in NATURAL:
        tile, prio = NATURAL[t["natural"]], 3
    if t.get("leisure") in LEISURE:
        tile, prio = LEISURE[t["leisure"]], 3 if t["leisure"] in ("park", "garden", "dog_park", "sports_centre") else 4
    if t.get("place") == "square":
        tile, prio = PLAZA, 2
    if t.get("area:highway") in AREA_HW:
        tile, prio = AREA_HW[t["area:highway"]], 5
    if t.get("highway") in ("pedestrian", "footway") and t.get("area") == "yes":
        tile, prio = PLAZA, 2
    if t.get("waterway") == "riverbank":
        tile, prio = WATER, 3
    if tile is None:
        continue
    rings = area_rings(el)
    if rings:
        # Les àrees grans primer perquè les petites hi quedin a sobre
        xs = [p[0] for r in rings for p in r]
        ys = [p[1] for r in rings for p in r]
        size = (max(xs) - min(xs)) * (max(ys) - min(ys))
        layers.append((prio, -size, rings, tile))

layers.sort(key=lambda x: (x[0], x[1]))
for _, _, rings, tile in layers:
    fill_polygon(rings, tile)
print(f"  {len(layers)} àrees")

# --- 2. Vies ---------------------------------------------------------------
ROAD_W = {  # metres, tile, ordre
    "footway": (2.5, SIDEWALK, 0), "path": (2.0, DIRT, 0), "track": (3.0, DIRT, 0),
    "bridleway": (2.0, DIRT, 0), "corridor": (2.0, SIDEWALK, 0), "cycleway": (2.0, CYCLEWAY, 1),
    "steps": (3.0, STEPS, 1), "pedestrian": (6.0, PLAZA, 2), "living_street": (6.0, PLAZA, 2),
    "service": (4.0, ROAD, 3), "unclassified": (6.0, ROAD, 4), "residential": (6.5, ROAD, 4),
    "tertiary_link": (6.0, ROAD, 5), "secondary_link": (6.0, ROAD, 5), "primary_link": (6.0, ROAD, 5),
    "trunk_link": (6.0, ROAD, 5), "tertiary": (8.0, ROAD, 6), "secondary": (9.0, ROAD, 7),
    "primary": (10.0, ROAD, 8), "trunk": (10.0, ROAD, 8), "motorway": (12.0, ROAD, 9),
    "raceway": (4.0, TRACK, 1),
}
CAR = {"residential", "unclassified", "tertiary", "secondary", "primary", "trunk", "motorway",
       "living_street", "pedestrian", "service", "tertiary_link", "secondary_link", "primary_link", "trunk_link"}
not_building = lambda v: v < BUILDING_BASE

ways = []
streets = {}
for el in els:
    t = el.get("tags", {})
    hw = t.get("highway")
    if el["type"] != "way" or hw not in ROAD_W or is_underground(t) or t.get("area") == "yes":
        continue
    c = way_coords(el)
    if len(c) < 2:
        continue
    w, tile, order = ROAD_W[hw]
    if hw == "footway" and t.get("footway") == "crossing":
        tile, order = CROSSWALK, 10
    if hw == "service" and t.get("service") in ("parking_aisle", "driveway"):
        w = 3.5
    ways.append((order, c, w, tile, hw))
    name = t.get("name")
    if name and hw in CAR:
        streets.setdefault(name, {"name": name, "kind": hw, "lines": []})["lines"].append(
            [[round(x, 1), round(y, 1)] for x, y in c])

ways.sort(key=lambda x: x[0])
for order, c, w, tile, hw in ways:
    stroke(c, w, tile)
# Línia central a les vies principals (només a sobre d'asfalt)
for order, c, w, tile, hw in ways:
    if hw in ("primary", "secondary", "tertiary", "trunk"):
        stroke(c, 0.9, ROAD_LINE, pred=lambda v: v == ROAD)
# Passos de vianants per sobre de l'asfalt
for order, c, w, tile, hw in ways:
    if tile == CROSSWALK:
        stroke(c, 3.0, CROSSWALK, pred=lambda v: v in (ROAD, ROAD_LINE))
print(f"  {len(ways)} vies, {len(streets)} carrers amb nom")

# --- 3. Ferrocarril ------------------------------------------------------
n_rail = 0
for el in els:
    t = el.get("tags", {})
    if el["type"] == "way" and t.get("railway") in ("rail", "light_rail", "tram", "narrow_gauge") and not is_underground(t):
        stroke(way_coords(el), 3.0, RAIL)
        n_rail += 1
    if el["type"] == "way" and t.get("railway") == "platform" and not is_underground(t):
        for r in area_rings(el):
            fill_polygon([r], CONCRETE)
print(f"  {n_rail} vies de tren")

# --- 4. Edificis ---------------------------------------------------------
def building_type(t):
    b = t.get("building")
    am = t.get("amenity", "")
    if am == "place_of_worship" or b in ("church", "chapel", "cathedral", "religious"):
        return B_CHURCH
    if b in ("house", "detached", "semidetached_house", "terrace", "farm", "cabin"):
        return B_HOUSE
    if b in ("industrial", "warehouse", "garage", "garages", "hangar", "shed", "service", "manufacture", "storage_tank", "transportation", "train_station"):
        return B_INDUSTRIAL
    if b in ("public", "school", "civic", "government", "hospital", "university", "college", "kindergarten", "sports_hall", "fire_station") or am in ("school", "library", "community_centre", "townhall", "arts_centre"):
        return B_PUBLIC
    if b in ("retail", "commercial", "office", "supermarket", "hotel", "kiosk"):
        return B_COMMERCIAL
    return B_APARTMENTS


n_b = 0
for el in els:
    t = el.get("tags", {})
    b = t.get("building")
    if not b or b in ("roof", "no", "construction") or is_underground(t):
        continue
    rings = area_rings(el)
    if not rings:
        continue
    if b == "ruins":
        fill_polygon(rings, RUINS)
        continue
    bt = building_type(t)
    fill_polygon(rings, BUILDING_BASE + bt * 4 + h(el["id"]) % 4)
    n_b += 1
print(f"  {n_b} edificis")

# --- 5. Decoració --------------------------------------------------------
WALKABLE_DECOR = {GROUND, GRASS, PARK, SIDEWALK, PLAZA, FOREST, SCHOOLYARD, DIRT, SAND, PARKING, CONCRETE}


def put_decor(x, y, d):
    tx, ty = int(x), int(y)
    if 0 <= tx < WIDTH and 0 <= ty < HEIGHT:
        k = ty * WIDTH + tx
        if ground[k] in WALKABLE_DECOR and decor[k] == D_NONE:
            decor[k] = d
            return True
    return False


n_trees = 0
for el in els:
    t = el.get("tags", {})
    if el["type"] == "node" and t.get("natural") == "tree":
        n_trees += put_decor(*proj(el["lat"], el["lon"]), D_TREE if h(el["id"]) % 3 else D_TREE2)
    elif el["type"] == "node" and t.get("amenity") == "fountain":
        put_decor(*proj(el["lat"], el["lon"]), D_FOUNTAIN)
    elif el["type"] == "way" and t.get("natural") == "tree_row":
        for x, y in sample_line(way_coords(el), 3.5):
            n_trees += put_decor(x, y, D_TREE)

# Arbres i bancs dispersos a parcs i boscos, fanals a les voreres
for k in range(WIDTH * HEIGHT):
    g = ground[k]
    r = h(k) % 1000
    if g == FOREST and r < 180:
        decor[k] = decor[k] or (D_TREE if r % 2 else D_TREE2)
    elif g == PARK and r < 25:
        decor[k] = decor[k] or (D_TREE if r < 18 else D_BENCH)
    elif g == PLAZA and r < 4:
        decor[k] = decor[k] or D_BENCH
    elif g == SIDEWALK and r < 6:
        decor[k] = decor[k] or D_LAMP
print(f"  {n_trees} arbres OSM")

# --- 6. Límit del barri --------------------------------------------------
boundary = []
for el in els:
    if el["type"] == "relation" and el["id"] == 4149391:
        boundary = rel_rings(el, roles=("outer",))
inside = bytearray(WIDTH * HEIGHT)
fill_polygon(boundary, 1, grid=inside)
for k in range(WIDTH * HEIGHT):
    if not inside[k]:
        ground[k] |= OUTSIDE

# --- 7. Llocs amb nom ----------------------------------------------------
POI_AMENITY = {"marketplace", "place_of_worship", "library", "school", "arts_centre", "community_centre",
               "theatre", "townhall", "police", "fire_station", "cinema", "university", "social_centre",
               "kindergarten", "clinic", "hospital", "fountain"}
places = []
seen = set()
for el in els:
    t = el.get("tags", {})
    name = t.get("name")
    if not name:
        continue
    kind = None
    if t.get("place") == "square" or (t.get("highway") == "pedestrian" and name.startswith(("Plaça", "Placeta"))):
        kind = "plaza"
    elif t.get("leisure") in ("park", "garden"):
        kind = "park"
    elif t.get("amenity") in POI_AMENITY:
        kind = t["amenity"]
    elif t.get("railway") == "station" or t.get("public_transport") == "station":
        kind = "station"
    elif t.get("historic"):
        kind = "historic"
    elif t.get("leisure") in ("sports_centre", "pitch", "playground"):
        kind = "sport"
    if not kind:
        continue
    if el["type"] == "node":
        x, y = proj(el["lat"], el["lon"])
    else:
        pts = [p for r in (area_rings(el) or [way_coords(el)]) for p in r]
        if not pts:
            continue
        x = sum(p[0] for p in pts) / len(pts)
        y = sum(p[1] for p in pts) / len(pts)
    if not (0 <= x < WIDTH and 0 <= y < HEIGHT) or (name, kind) in seen:
        continue
    seen.add((name, kind))
    places.append({"name": name, "kind": kind, "x": round(x, 1), "y": round(y, 1)})
print(f"  {len(places)} llocs amb nom")

# --- 8. Xarxa viària per als NPCs ----------------------------------------
# Graf de cruïlles (dins del barri) on cada aresta porta la seva polilínia.
CAR_NET = {"residential", "unclassified", "tertiary", "secondary", "primary", "trunk", "living_street",
           "tertiary_link", "secondary_link", "primary_link", "trunk_link"}
BIKE_NET = {"cycleway", "residential", "living_street", "pedestrian", "unclassified", "tertiary"}


def build_graph(kinds):
    coords, adj = {}, {}
    for el in els:
        t = el.get("tags", {})
        if el["type"] != "way" or t.get("highway") not in kinds or is_underground(t) or t.get("area") == "yes":
            continue
        ids, geo = el.get("nodes", []), el.get("geometry", [])
        if len(ids) != len(geo) or len(ids) < 2:
            continue
        for nid, g in zip(ids, geo):
            coords[nid] = proj(g["lat"], g["lon"])
        for a_, b_ in zip(ids, ids[1:]):
            if a_ != b_:
                adj.setdefault(a_, set()).add(b_)
                adj.setdefault(b_, set()).add(a_)

    def ok(n):
        x, y = coords[n]
        return 0 <= x < WIDTH and 0 <= y < HEIGHT and inside[int(y) * WIDTH + int(x)]
    adj = {n: {m for m in nb if ok(m)} for n, nb in adj.items() if ok(n)}
    adj = {n: nb for n, nb in adj.items() if nb}
    # component connex més gran
    seen, best = set(), set()
    for n in sorted(adj):
        if n in seen:
            continue
        comp, stack = set(), [n]
        while stack:
            c = stack.pop()
            if c in comp:
                continue
            comp.add(c)
            stack.extend(adj[c] - comp)
        seen |= comp
        if len(comp) > len(best):
            best = comp
    adj = {n: adj[n] & best for n in best}
    # comprimeix les cadenes de grau 2 en arestes entre cruïlles
    junctions = sorted(n for n, nb in adj.items() if len(nb) != 2)
    if not junctions:
        return {"nodes": [], "edges": []}
    index = {n: i for i, n in enumerate(junctions)}
    edges, used = [], set()
    for j in junctions:
        for nb in sorted(adj[j]):
            if (j, nb) in used:
                continue
            path, prev, cur = [j], j, nb
            while cur not in index:
                path.append(cur)
                nxt = [m for m in adj[cur] if m != prev]
                if not nxt:
                    break
                prev, cur = cur, nxt[0]
            path.append(cur)
            if cur not in index:
                continue
            for u, v in zip(path, path[1:]):
                used.add((u, v)); used.add((v, u))
            line = [[round(coords[n][0], 1), round(coords[n][1], 1)] for n in path]
            if index[j] != index[cur] or len(line) > 2:
                edges.append([index[j], index[cur], line])
    nodes = [[round(coords[n][0], 1), round(coords[n][1], 1)] for n in junctions]
    return {"nodes": nodes, "edges": edges}


graph = {"car": build_graph(CAR_NET), "bike": build_graph(BIKE_NET)}
for k, gph in graph.items():
    print(f"  xarxa {k}: {len(gph['nodes'])} cruïlles, {len(gph['edges'])} trams")

# --- 9. Establiments (icones) -------------------------------------------
POI_CATS = {
    "beer": {"amenity": ["bar", "pub", "biergarten"]},
    "coffee": {"amenity": ["cafe"]},
    "bread": {"shop": ["bakery", "pastry", "confectionery"]},
    "pharmacy": {"amenity": ["pharmacy"]},
    "food": {"amenity": ["restaurant"]},
    "burger": {"amenity": ["fast_food"]},
    "icecream": {"amenity": ["ice_cream"], "shop": ["ice_cream"]},
    "cart": {"shop": ["supermarket", "convenience", "greengrocer", "butcher", "deli", "seafood", "frozen_food",
                      "alcohol", "beverages", "galician", "dairy", "cheese", "health_food"]},
    "health": {"amenity": ["clinic", "doctors", "dentist", "hospital"]},
    "bank": {"amenity": ["bank", "atm"]},
    "scissors": {"shop": ["hairdresser", "beauty", "barber", "cosmetics"]},
    "shirt": {"shop": ["clothes", "shoes", "fashion", "boutique", "jewelry", "bag"]},
    "book": {"shop": ["books", "stationery", "newsagent"], "amenity": ["library"]},
    "bike": {"amenity": ["bicycle_rental"], "shop": ["bicycle"]},
    "fuel": {"amenity": ["fuel"]},
    "film": {"amenity": ["cinema", "theatre"]},
    "bed": {"tourism": ["hotel", "hostel"]},
    "phone": {"shop": ["mobile_phone", "telecommunication", "electronics", "computer"]},
}


def poi_category(t):
    for cat, rules in POI_CATS.items():
        for key, vals in rules.items():
            if t.get(key) in vals:
                return cat
    return "shop" if t.get("shop") else None


pois = []
pois_path = os.path.join(HERE, "data", "pois.json")
if os.path.exists(pois_path):
    seen_poi = set()
    for el in json.load(open(pois_path))["elements"]:
        t = el.get("tags", {})
        cat = poi_category(t)
        c = el if el["type"] == "node" else el.get("center")
        if not cat or not c:
            continue
        x, y = proj(c["lat"], c["lon"])
        if not (0 <= x < WIDTH and 0 <= y < HEIGHT) or (el["type"], el["id"]) in seen_poi:
            continue
        seen_poi.add((el["type"], el["id"]))
        pois.append({"c": cat, "n": t.get("name", ""), "x": round(x, 1), "y": round(y, 1), "src": "osm"})
n_osm = len(pois)

# Fonts complementàries (vegeu fetch_businesses.py): cens de locals de l'Ajuntament (2024) i
# Overture Maps. S'afegeixen sense duplicar: un local de la mateixa categoria a pocs metres, o
# amb un nom semblant, es considera el mateix negoci.
import re, unicodedata

CENS_CATS = {
    "Restaurants": "food", "serveis de menjar i begudes": "food",
    "Serveis de menjar take away MENJAR RÀPID": "burger", "Plats preparats (no degustació)": "burger",
    "Bars especials amb actuació / Bars musicals / Discoteques /PUB": "beer",
    "Autoservei / Supermercat": "cart", "Grans magatzems i hipermercats": "cart", "Fruites i verdures": "cart",
    "Carn i Porc": "cart", "Peix i marisc": "cart", "Ous i aus": "cart", "Begudes": "cart",
    "Pa, pastisseria i làctics": "bread", "Farmàcies PARAFARMÀCIA": "pharmacy", "Sanitat i assistència": "health",
    "Perruqueries": "scissors", "Centres d'estètica": "scissors",
    "Vestir": "shirt", "Calçat i pell": "shirt", "Joieria, rellotgeria i bijuteria": "shirt", "Merceria": "shirt",
    "Llibres, diaris i revistes": "book", "Xocolateries / Geladeries / Degustació": "icecream",
    "Serveis de telecomunicacions": "phone", "Informàtica": "phone", "Locutoris": "phone",
    "Combustibles i carburants": "fuel", "serveis d'allotjament": "bed",
    "Drogueria i perfumeria": "shop", "Basars": "shop", "Material equipament llar": "shop", "Parament ferreteria": "shop",
    "Joguines i esports": "shop", "Tabac i articles fumadors": "shop", "Floristeries": "shop", "Òptiques": "shop",
    "Herbolaris, dietètica i NUTRICIÓ": "shop", "Mobles i articles fusta i metall": "shop", "Aparells domèstics": "shop",
    "Fotografia": "shop", "Música": "shop", "Veterinaris / Mascotes": "shop",
}
BANK_NAME = re.compile(r"\b(BANC|BANCO|BANK|CAIXA|CAJA|BBVA|SABADELL|SANTANDER|BANKINTER|ING|IBERCAJA|UNICAJA|ABANCA|KUTXA)\b", re.I)
CAFE_NAME = re.compile(r"\b(CAFE|CAFÈ|CAFETERIA|CAFETERÍA|COFFEE|GRANJA|XURRERIA|CHURRERIA|ORXATERIA)\b", re.I)


def census_category(activity, name):
    if activity.startswith("Bars"):
        return "coffee" if CAFE_NAME.search(name) else "beer"
    if activity == "Finances i assegurances":
        return "bank" if BANK_NAME.search(name) else None
    return CENS_CATS.get(activity)


def overture_category(basic, cat):
    k = f"{basic} {cat}"
    rules = [("pharmacy", "pharmacy"), ("bakery", "bread"), ("pastry", "bread"), ("ice_cream", "icecream"),
             ("coffee", "coffee"), ("cafe", "coffee"), ("tapas_bar", "food"), ("fast_food", "burger"),
             ("burger", "burger"), ("pizza", "burger"), ("kebab", "burger"), ("sandwich", "burger"),
             ("restaurant", "food"), ("eatery", "food"), ("pub", "beer"), ("bar", "beer"),
             ("grocery", "cart"), ("supermarket", "cart"), ("convenience", "cart"), ("butcher", "cart"),
             ("produce_store", "cart"), ("food_and_beverage_store", "cart"),
             ("bank_or_credit_union", "bank"), ("atm", "bank"),
             ("hair_salon", "scissors"), ("barber", "scissors"), ("beauty_salon", "scissors"), ("nail_salon", "scissors"),
             ("clothing", "shirt"), ("shoe_store", "shirt"), ("jewelry", "shirt"), ("fashion", "shirt"),
             ("bookstore", "book"), ("newsstand", "book"), ("stationery", "book"),
             ("bicycle", "bike"), ("gas_station", "fuel"), ("cinema", "film"), ("theat", "film"),
             ("hotel", "bed"), ("hostel", "bed"), ("mobile_phone", "phone"), ("electronics_store", "phone"),
             ("dental", "health"), ("doctors_office", "health"), ("hospital", "health"), ("outpatient", "health"),
             ("_store", "shop")]
    for key, c in rules:
        if key in k:
            return c
    return None


SMALL = {"de", "del", "la", "el", "les", "els", "i", "y", "d", "l", "en", "a", "al", "los", "las"}


def nice_name(n):
    """'BAR L'ORFILA 9' -> 'Bar l'Orfila 9' (el cens ho té tot en majúscules)."""
    if not n or n != n.upper():
        return n
    words = []
    for i, w in enumerate(re.split(r"(\s+)", n.lower())):
        parts = w.split("'")
        parts = [p if (j < len(parts) - 1 and p in SMALL and i) else p[:1].upper() + p[1:] for j, p in enumerate(parts)]
        w = "'".join(parts)
        words.append(w if (i == 0 or w.strip().lower() not in SMALL) else w.lower())
    return "".join(words)


STOP = {"bar", "cafe", "cafeteria", "restaurant", "restaurante", "la", "el", "de", "del", "els", "les", "sl", "s", "l", "d", "i", "y"}


def norm_tokens(n):
    n = unicodedata.normalize("NFKD", n.lower()).encode("ascii", "ignore").decode()
    return {t for t in re.split(r"[^a-z0-9]+", n) if t and t not in STOP}


def same_name(a, b):
    ta, tb = norm_tokens(a), norm_tokens(b)
    if not ta or not tb:
        return False
    return len(ta & tb) / min(len(ta), len(tb)) >= 0.6


M = 1 / M_PER_TILE  # tiles per metre


def find_match(cat, name, x, y):
    for p in pois:
        d = math.hypot(p["x"] - x, p["y"] - y)
        if p["c"] == cat and d < 12 * M:
            return p
        if name and p["n"] and d < 30 * M and same_name(p["n"], name):
            return p
        if name and p["n"] and d < 60 * M and norm_tokens(p["n"]) == norm_tokens(name):
            return p
    return None


def add_poi(cat, name, x, y, src):
    if not (0 <= x < WIDTH and 0 <= y < HEIGHT):
        return
    hit = find_match(cat, name, x, y)
    if hit:
        # Overture sol tenir el nom amb majúscules i minúscules ben posades i més recent
        if name and (not hit["n"] or (src == "overture" and hit["src"] == "cens" and same_name(hit["n"], name))):
            hit["n"] = name
        return
    pois.append({"c": cat, "n": name, "x": round(x, 1), "y": round(y, 1), "src": src})


cens_path = os.path.join(HERE, "data", "cens_locals.json")
if os.path.exists(cens_path):
    for l in json.load(open(cens_path))["locals"]:
        cat = census_category(l["activity"], l["name"])
        if cat:
            add_poi(cat, nice_name(l["name"]), *proj(l["lat"], l["lon"]), "cens")
n_cens = len(pois) - n_osm

closed = []
ov_path = os.path.join(HERE, "data", "overture_places.json")
if os.path.exists(ov_path):
    for o in json.load(open(ov_path))["places"]:
        x, y = proj(o["lat"], o["lon"])
        if o["status"] == "permanently_closed":
            if o["name"]:
                closed.append((o["name"], x, y))
            continue
        cat = overture_category(o["basic"], o["cat"])
        if cat and o["confidence"] >= 0.6:
            add_poi(cat, o["name"], x, y, "overture")
n_ov = len(pois) - n_osm - n_cens

# Negocis que Overture marca com a tancats definitivament
before = len(pois)
pois = [p for p in pois if not (p["n"] and any(math.hypot(p["x"] - cx, p["y"] - cy) < 30 * M and same_name(p["n"], cn)
                                                for cn, cx, cy in closed))]
for p in pois:
    del p["src"]
print(f"  {len(pois)} establiments (OSM {n_osm}, cens +{n_cens}, Overture +{n_ov}, tancats -{before - len(pois)})")

# --- 10. Punts on poden aparèixer monedes (per al servidor) -------------
# Tiles caminables dins del barri, sense arbres ni fonts, triats de manera repartida.
SPAWN_TILES = {GROUND, GRASS, PARK, SIDEWALK, PLAZA, SCHOOLYARD, DIRT, SAND, CONCRETE}
candidates = []
for ty in range(1, HEIGHT - 1):
    for tx in range(1, WIDTH - 1):
        k = ty * WIDTH + tx
        g = ground[k]
        if g & OUTSIDE or g not in SPAWN_TILES or decor[k] in (D_TREE, D_TREE2, D_FOUNTAIN):
            continue
        # que els veïns també siguin caminables (evita racons impossibles)
        if all((ground[k + d] & 127) < BUILDING_BASE and (ground[k + d] & 127) not in (WATER, POOL)
               for d in (-1, 1, -WIDTH, WIDTH)):
            candidates.append((tx, ty))
candidates.sort(key=lambda c: h("spawn", c[0], c[1]))
spawns = [[tx, ty] for tx, ty in candidates[:3000]]
os.makedirs(os.path.join(HERE, "server", "src"), exist_ok=True)
json.dump(spawns, open(os.path.join(HERE, "server", "src", "spawns.json"), "w"), separators=(",", ":"))
print(f"  {len(spawns)} punts per a monedes (de {len(candidates)} possibles)")

# --- Sortida -------------------------------------------------------------
os.makedirs(OUT, exist_ok=True)
header = struct.pack("<4sHH", b"SAPM", WIDTH, HEIGHT)
with open(os.path.join(OUT, "map.bin"), "wb") as f:
    f.write(zlib.compress(header + bytes(ground) + bytes(decor), 9))
start = proj(41.43555, 2.18970)
for p in places:  # Comencem a la Plaça d'Orfila, davant de l'església
    if p["name"] == "Plaça d'Orfila":
        start = (p["x"], p["y"] + 4)
json.dump({
    "width": WIDTH, "height": HEIGHT, "metersPerTile": M_PER_TILE,
    "bbox": [S, W, N, E], "start": [round(start[0], 1), round(start[1], 1)],
    "boundary": [[[round(x, 1), round(y, 1)] for x, y in r] for r in boundary],
    "streets": list(streets.values()), "places": places, "graph": graph, "pois": pois,
    "attribution": "© OpenStreetMap contributors (ODbL)",
}, open(os.path.join(OUT, "map.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print("Fet:", os.path.getsize(os.path.join(OUT, "map.bin")), "bytes map.bin,",
      os.path.getsize(os.path.join(OUT, "map.json")), "bytes map.json")
