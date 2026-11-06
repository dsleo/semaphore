"""One-off: departements GeoJSON -> compact SVG paths in docs/data/france-map.json.
Usage: python3 scripts/build_map.py departements-version-simplifiee.geojson
Source: github.com/gregoiredavid/france-geojson (Etalab open licence)."""
import json, math, sys

g = json.load(open(sys.argv[1]))
K = math.cos(math.radians(46.5))
P = lambda lon, lat: ((lon + 5.2) * K * 62, (51.2 - lat) * 62)  # equirectangular, ~600 px wide
deps = []
for f in g["features"]:
    rings = f["geometry"]["coordinates"] if f["geometry"]["type"] == "MultiPolygon" else [f["geometry"]["coordinates"]]
    d = ""
    for poly in rings:
        for ring in poly:
            pts, last = [], None
            for lon, lat in ring:
                p = tuple(round(v, 1) for v in P(lon, lat))
                if p != last:
                    pts.append(p)
                    last = p
            if len(pts) > 2:
                d += "M" + "L".join(f"{x:g} {y:g}" for x, y in pts) + "Z"
    deps.append({"c": f["properties"]["code"], "n": f["properties"]["nom"], "d": d})
xs = [float(t) for dp in deps for t in dp["d"].replace("M", " ").replace("L", " ").replace("Z", " ").split()]
w, h = round(max(xs[0::2])) + 2, round(max(xs[1::2])) + 2
json.dump({"w": w, "h": h, "deps": deps}, open("docs/data/france-map.json", "w"), ensure_ascii=False, separators=(",", ":"))
print(w, h, len(deps))
