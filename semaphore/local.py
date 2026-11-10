"""Nationwide local layers, written as static JSON that the browser filters per commune:
news-local.json (regional + local headlines), roads.json (Bison Futé road events), transit.json (GTFS-RT service alerts),
vigicrues.json (official flood vigilance, river sections above green).
Stdlib only, no LLM. Each collector fails alone: a broken feed never stops the run."""
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path

from . import sources as S

# INSEE region code -> France 3 régions slug. One feed per region (the backbone), plus regional dailies with a working RSS.
REGIONS = {"84": "auvergne-rhone-alpes", "27": "bourgogne-franche-comte", "53": "bretagne", "24": "centre-val-de-loire", "94": "corse",
           "44": "grand-est", "32": "hauts-de-france", "11": "ile-de-france", "28": "normandie", "75": "nouvelle-aquitaine",
           "76": "occitanie", "52": "pays-de-la-loire", "93": "provence-alpes-cote-d-azur"}
SLUG2REG = {v: k for k, v in REGIONS.items()}
FEEDS = [(f"f3-{r}", f"France 3 {slug.replace('-', ' ').title()}", f"https://france3-regions.francetvinfo.fr/{slug}/rss", r) for r, slug in REGIONS.items()]
FEEDS += [("depeche", "La Dépêche", "https://www.ladepeche.fr/rss.xml", "76"), ("midilibre", "Midi Libre", "https://www.midilibre.fr/rss.xml", "76"),
          ("lindep", "L'Indépendant", "https://www.lindependant.fr/rss.xml", "76"), ("nicematin", "Nice-Matin", "https://www.nicematin.com/rss", "93"),
          ("progres", "Le Progrès", "https://www.leprogres.fr/rss", "84"), ("dna", "DNA", "https://www.dna.fr/rss", "44"),
          ("estrep", "L'Est Républicain", "https://www.estrepublicain.fr/rss", "44"), ("ici", "ici (France Bleu)", "https://www.ici.fr/rss/a-la-une.xml", None)]
ICI_RE = re.compile(r"ici\.fr/([a-z-]+)/([a-z-]+)-(\d{2}|2[ab]|9\d\d)/", re.I)


def _norm(t):
    return re.sub(r"\W+", " ", t.lower()).strip()


def news(out):
    cut = S.now() - timedelta(hours=36)

    def one(f):
        try:
            return f, S._feed(f[0], f[1], f[2])[0], None
        except Exception as e:
            return f, [], f"{type(e).__name__}: {e}"[:120]
    with ThreadPoolExecutor(8) as ex:
        res = list(ex.map(one, FEEDS))
    items, seen, feeds = [], set(), []
    for f, rows, err in res:
        feeds.append({"id": f[0], "name": f[1], "link": f[2], "ok": err is None, "n": len(rows), **({"err": err} if err else {})})
        for fid, name, title, link, desc, when in rows:
            text = title.lower()  # title only: descriptions drag in unrelated words (aéroport, perturbation…)
            if when < cut or S.EXCLUDE.search(text) or not link.startswith(("http://", "https://")):
                continue  # only web links reach an href (never javascript:/data:)
            hit = next(((k, m.group(0)) for k, (_, rx) in S.THEMES.items() if (m := re.search(rx, text)) and k != "prepare"), None)
            key = _norm(title)
            if not hit or key in seen:
                continue
            seen.add(key)
            reg, dep = f[3], None
            m = ICI_RE.search(link)
            if m:
                reg, dep = SLUG2REG.get(m.group(1).lower(), reg), m.group(3).upper()
            items.append({"t": title, "l": link, "s": name, "p": S.iso(when), "th": hit[0], "kw": hit[1], "r": reg, "d": dep})
    items.sort(key=lambda x: x["p"], reverse=True)
    (out / "news-local.json").write_text(json.dumps({"generated": S.iso(S.now()), "themes": {k: v[0] for k, v in S.THEMES.items()}, "feeds": feeds, "items": items[:300]},
                                                    ensure_ascii=False, separators=(",", ":")))
    return f"news-local {len(items)} items, {sum(f['ok'] for f in feeds)}/{len(feeds)} feeds"


# ---------------------------------------------------------------- roads: Bison Futé DATEX II (national non-conceded network)
ROADS = "https://tipi.bison-fute.gouv.fr/bison-fute-ouvert/publicationsDIR/Evenementiel-DIR/grt/RRN/content.xml"
KIND_TAGS = {"roadOrCarriagewayOrLaneManagementType", "accidentType", "abnormalTrafficType", "roadMaintenanceType", "constructionWorkType",
             "weatherRelatedRoadConditionType", "environmentalObstructionType", "vehicleObstructionType", "obstructionType",
             "nonWeatherRelatedRoadConditionType", "roadsideServiceDisruptionType", "generalObstructionType", "animalPresenceType"}
SKIP = {"SpeedManagement", "GeneralInstructionOrMessageToRoadUsers", "ReroutingManagement"}


def _l(tag):
    return tag.rsplit("}", 1)[-1]


def roads(out):
    root = S.parse_xml(S.get(ROADS, 60)[0])
    now = S.now()
    items = []
    for rec in root.iter():
        if _l(rec.tag) != "situationRecord":
            continue
        typ = next((v for k, v in rec.attrib.items() if k.endswith("type")), "")
        typ = typ.split(":")[-1]
        if typ in SKIP:
            continue
        vals = {_l(e.tag): (e.text or "").strip() for e in rec.iter() if e.text and e.text.strip()}
        lat = next((e.text for e in rec.iter() if _l(e.tag) == "latitude"), None)
        lon = next((e.text for e in rec.iter() if _l(e.tag) == "longitude"), None)
        if not lat or not lon:
            continue
        start, end = vals.get("overallStartTime"), vals.get("overallEndTime")
        if (end and end < S.iso(now - timedelta(hours=1))) or (start and start > S.iso(now + timedelta(hours=12))):
            continue  # ISO strings compare chronologically; ended or not yet started
        kinds = [e.text for e in rec.iter() if _l(e.tag) in KIND_TAGS and e.text]
        closed = any(re.search(r"closed|closure", k, re.I) for k in kinds)
        if (typ in ("MaintenanceWorks", "ConstructionWorks") and not closed) or "weightRestrictionInOperation" in kinds:
            continue  # routine works and permanent weight limits are noise for a risk page; closures stay
        comments = [e.text.strip() for e in rec.iter() if _l(e.tag) == "value" and e.text and e.text.strip()]
        names = {}
        for n in rec.iter():
            if _l(n.tag) == "name":
                v = next((x.text for x in n.iter() if _l(x.tag) == "value"), None)
                t = next((x.text for x in n.iter() if _l(x.tag) == "tpegOtherPointDescriptorType"), None)
                if v and t:
                    names.setdefault(t, v)
        items.append({"k": typ, "w": kinds[:2], "la": round(float(lat), 4), "lo": round(float(lon), 4), "road": names.get("linkName", ""), "town": names.get("townName", ""),
                      "x": closed, "t": " · ".join(dict.fromkeys(c.replace("\n", " ") for c in comments if not c.startswith("DIR ")))[:160], "s": start, "e": end})
    (out / "roads.json").write_text(json.dumps({"generated": S.iso(now), "link": "https://www.bison-fute.gouv.fr", "items": items}, ensure_ascii=False, separators=(",", ":")))
    return f"roads {len(items)} events"


# ---------------------------------------------------------------- transit: GTFS-RT service alerts (minimal protobuf reader, stdlib)
TDG = "https://transport.data.gouv.fr/api/datasets"


def _varint(b, i):
    r = s = 0
    while True:
        c = b[i]
        i += 1
        r |= (c & 0x7F) << s
        if c < 0x80:
            return r, i
        s += 7


def _fields(b):
    i, out = 0, []
    while i < len(b):
        k, i = _varint(b, i)
        w = k & 7
        if w == 0:
            v, i = _varint(b, i)
        elif w == 2:
            n, i = _varint(b, i)
            v, i = b[i:i + n], i + n
        elif w == 1:
            v, i = b[i:i + 8], i + 8
        elif w == 5:
            v, i = b[i:i + 4], i + 4
        else:
            raise ValueError("bad wire type")
        out.append((k >> 3, v))
    return out


def _tr(b):  # TranslatedString -> text, French preferred
    best = ""
    for f, v in _fields(b):
        if f == 1:
            d = dict(_fields(v))
            if not best or bytes(d.get(2, b"")).lower().startswith(b"fr"):
                best = bytes(d.get(1, b"")).decode("utf-8", "replace")
    return best


EFFECT = {1: "no_service", 2: "reduced", 3: "delays", 4: "detour", 6: "modified", 9: "stop_moved"}


def alerts_pb(b, now_ts):
    out = []
    for f, ent in _fields(b):
        if f != 2:
            continue
        for f2, al in _fields(ent):
            if f2 != 5:
                continue
            a = {"h": "", "d": "", "e": ""}
            periods = []
            for f3, v in _fields(al):
                if f3 == 1:
                    p = dict(_fields(v))
                    periods.append((p.get(1, 0), p.get(2, 0)))
                elif f3 == 7:
                    a["e"] = EFFECT.get(v, "")
                elif f3 == 10:
                    a["h"] = _tr(v)
                elif f3 == 11:
                    a["d"] = _tr(v)
            if periods and not any((s or 0) <= now_ts and (not e or e >= now_ts) for s, e in periods):
                continue
            t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", a["h"] + (" — " + a["d"] if a["d"] and a["d"] != a["h"] else ""))).strip()
            if t:
                out.append({"t": t[:200], "e": a["e"]})
    return out


def transit(out):
    data = json.loads(S.get(TDG, 90)[0])
    feeds = []
    for ds in data:
        for r in ds.get("resources", []):
            if r.get("format") == "gtfs-rt" and "service_alerts" in (r.get("features") or []) and r.get("is_available", True):
                feeds.append((ds["title"], ds.get("covered_area") or [], r["url"], ds.get("page_url", "")))
    now_ts = int(S.now().timestamp())

    def one(f):
        for attempt in (1, 2):  # big feeds (Tisséo is 1 MB behind a data.gouv.fr redirect) time out now and then on the runner: one retry
            try:
                req = S.urllib.request.Request(f[2], headers={"User-Agent": S.UA})
                with S.urllib.request.urlopen(req, timeout=30) as resp:
                    return f, alerts_pb(resp.read(S.MAX_BYTES), now_ts), None
            except Exception as e:
                err = f"{type(e).__name__}: {e}"[:100]
                time.sleep(3)  # 429 from the data.gouv.fr proxy: back off before the retry
        return f, [], err
    with ThreadPoolExecutor(16) as ex:
        res = list(ex.map(one, feeds))
    nets = [{"name": f[0], "area": [{"type": a["type"], "insee": a["insee"], "nom": a.get("nom", "")} for a in f[1]], "link": f[3], "ok": err is None, "err": err, "alerts": al}
            for f, al, err in res]
    (out / "transit.json").write_text(json.dumps({"generated": S.iso(S.now()), "feeds": len(nets), "ok": sum(n["ok"] for n in nets), "networks": [n for n in nets if n["alerts"] or not n["ok"]][:400],
                                                  "all": [{"name": n["name"], "area": n["area"], "ok": n["ok"], **({"err": n["err"]} if not n["ok"] else {})} for n in nets]}, ensure_ascii=False, separators=(",", ":")))
    return f"transit {sum(n['ok'] for n in nets)}/{len(nets)} feeds, {sum(len(n['alerts']) for n in nets)} alerts"


# ---------------------------------------------------------------- Vigicrues: official flood vigilance for every river section
VIGICRUES = "https://www.vigicrues.gouv.fr/services/InfoVigiCru.geojson"


def rivers(out):
    """Sections above green (yellow/orange/red) with a thinned polyline; the browser matches communes within 5 km of one.
    All green = empty list. The feed is 2 MB and sends no CORS headers, so a browser cannot read it: it is read here."""
    d = json.loads(S.get(VIGICRUES, 60)[0])
    feats = d["features"]
    if len(feats) < 100:
        raise RuntimeError(f"Vigicrues: only {len(feats)} sections, feed looks broken")  # never write an empty "all green" from a broken feed
    items = []
    for f in feats:
        p = f["properties"]
        lvl = int(p["NivInfViCr"])
        if lvl >= 2:
            pts = [[round(c[0], 3), round(c[1], 3)] for line in f["geometry"]["coordinates"] for c in line[::3] + line[-1:]]
            items.append({"n": p["lbentcru"], "id": p["CdEntCru"], "l": lvl, "p": pts})
    (out / "vigicrues.json").write_text(json.dumps({"generated": S.iso(S.now()), "pub": d.get("DtHrInfoVigiCru"), "total": len(feats), "link": "https://www.vigicrues.gouv.fr/", "items": items},
                                                   ensure_ascii=False, separators=(",", ":")))
    return f"vigicrues {len(items)} of {len(feats)} sections above green"


def refresh(out):
    out = Path(out)
    for fn in (news, roads, transit, rivers):
        try:
            print(" ", fn(out))
        except Exception as e:
            print(f"  {fn.__name__} not refreshed: {type(e).__name__}: {str(e)[:100]}")
