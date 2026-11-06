"""Practical heat advice: where to cool down and drink in Paris. Static lists from Paris open data, refreshed daily.
Opening hours and seasonal availability change: the page shows the last-checked date and links back to the source."""
import json
import re
import urllib.parse
from datetime import timedelta
from pathlib import Path

from . import sources as S

B = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/"
EQ, FO = "ilots-de-fraicheur-equipements-activites", "fontaines-a-boire"


def _all(ds, select):
    out, off = [], 0
    while True:
        d, _ = S.jget(B + ds + "/records?" + urllib.parse.urlencode({"limit": 100, "offset": off, "select": select}))
        out += d["results"]
        off += 100
        if off >= d["total_count"] or off >= 3000:
            return out


def _arr(txt):
    m = re.search(r"750?(\d\d)|PARIS (\d+)", str(txt or ""))
    return int(m.group(1) or m.group(2)) if m else None


def refresh(out_dir, max_age_h=24):
    path = Path(out_dir) / "places.json"
    try:
        if S.now() - S.datetime.fromisoformat(json.loads(path.read_text())["checked"].replace("Z", "+00:00")) < timedelta(hours=max_age_h):
            return
    except Exception:
        pass
    eq = [{"n": r["nom"], "t": r.get("type"), "a": _arr(r.get("arrondissement")), "ad": r.get("adresse"), "p": r.get("payant")}
          for r in _all(EQ, "nom,type,arrondissement,adresse,payant") if r.get("nom")]
    fo = [{"ad": f"{r.get('no_voirie_impair') or r.get('no_voirie_pair') or ''} {r.get('voie') or ''}".strip(), "a": _arr(r.get("commune"))}
          for r in _all(FO, "voie,commune,no_voirie_pair,no_voirie_impair,dispo") if r.get("dispo") != "NON"]
    path.write_text(json.dumps({"checked": S.iso(S.now()), "equipments": eq, "fountains": fo,
                                "links": {"equipments": "https://opendata.paris.fr/explore/dataset/" + EQ + "/",
                                          "fountains": "https://opendata.paris.fr/explore/dataset/" + FO + "/"}},
                               ensure_ascii=False, separators=(",", ":")))
