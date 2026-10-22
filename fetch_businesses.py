#!/usr/bin/env python3
"""Descarrega dades obertes de negocis per complementar OpenStreetMap.

1. Cens de locals en planta baixa de l'Ajuntament de Barcelona (Open Data BCN, CC-BY 4.0)
   -> data/cens_locals.json
2. Llocs d'Overture Maps (CDLA-Permissive-2.0), amb l'estat obert/tancat
   -> data/overture_places.json   (necessita `pip install duckdb`)

Només es guarda la zona del mapa (la mateixa bbox que build_map.py). Després cal tornar a
executar build_map.py, que fusiona aquestes fonts amb OSM.
"""
import csv, io, json, os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
S, W, N, E = 41.4255, 2.1805, 41.4490, 2.1990
CKAN = "https://opendata-ajuntament.barcelona.cat/data/api/3/action/package_show?id=cens-locals-planta-baixa-act-economica"
OVERTURE_BUCKET = "https://overturemaps-us-west-2.s3.amazonaws.com/?list-type=2&prefix=release/&delimiter=/"
UA = {"User-Agent": "SantAndreuRPG/0.1 (personal project)"}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300).read()


def fetch_census():
    pkg = json.loads(get(CKAN))["result"]
    # el recurs CSV més recent (els noms comencen per l'any)
    res = max((r for r in pkg["resources"] if r.get("format", "").upper() == "CSV"), key=lambda r: r["name"])
    print("Cens:", res["name"])
    rows = csv.DictReader(io.StringIO(get(res["url"]).decode("utf-8-sig")))
    out = []
    for r in rows:
        try:
            lat, lon = float(r["Latitud"]), float(r["Longitud"])
        except ValueError:
            continue
        if not (S <= lat <= N and W <= lon <= E) or r["Codi_Principal_Activitat"] == "0":
            continue
        out.append({"name": "" if r["Nom_Local"] in ("", "SN") else r["Nom_Local"].strip(),
                    "activity": r["Nom_Activitat"].strip(), "lat": lat, "lon": lon,
                    "reviewed": r["Data_Revisio"]})
    json.dump({"source": res["name"], "locals": out}, open(os.path.join(HERE, "data", "cens_locals.json"), "w"),
              ensure_ascii=False, indent=0)
    print(f"  {len(out)} locals amb activitat a la zona")


def fetch_overture():
    try:
        import duckdb
    except ImportError:
        print("Overture: cal `pip install duckdb` (s'omet)")
        return
    xml = get(OVERTURE_BUCKET).decode()
    releases = sorted(p.split("/")[1] for p in xml.split("<Prefix>")[1:] if p.startswith("release/2"))
    release = releases[-1]
    print("Overture:", release)
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
    rows = con.execute(f"""
        SELECT names."primary", basic_category, taxonomy."primary", confidence, operating_status,
               ST_X(geometry), ST_Y(geometry)
        FROM read_parquet('s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*', hive_partitioning=1)
        WHERE bbox.xmin BETWEEN {W} AND {E} AND bbox.ymin BETWEEN {S} AND {N}
    """).fetchall()
    places = [{"name": n or "", "basic": b or "", "cat": c or "", "confidence": round(conf or 0, 2),
               "status": st or "", "lon": lon, "lat": lat} for n, b, c, conf, st, lon, lat in rows]
    json.dump({"release": release, "places": places}, open(os.path.join(HERE, "data", "overture_places.json"), "w"),
              ensure_ascii=False, indent=0)
    print(f"  {len(places)} llocs a la zona")


if __name__ == "__main__":
    which = set(sys.argv[1:]) or {"cens", "overture"}
    if "cens" in which:
        fetch_census()
    if "overture" in which:
        fetch_overture()
