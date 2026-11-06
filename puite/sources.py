"""Collectors. Stdlib only, no LLM. Each returns (indicators, context)."""
import gzip
import hashlib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

UA = "puite/1.0 (open civic risk monitor)"
UTC = timezone.utc


def now():
    return datetime.now(UTC)


def iso(d):
    return d.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def interp(x, pts):
    """Piecewise-linear map of x through ascending (x, y) points, clamped at the ends."""
    if x <= pts[0][0]:
        return pts[0][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return pts[-1][1]


def T(fr, en):
    return {"fr": fr, "en": en}


def get(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
    for attempt in (1, 2):  # one retry for transient network errors (DNS blip, timeout); HTTP errors are not retried
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read()
            break
        except urllib.error.HTTPError:
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt == 2:
                raise
            time.sleep(2)
    if b[:2] == b"\x1f\x8b":
        b = gzip.decompress(b)
    return b.decode("utf-8", "replace"), hashlib.sha256(b).hexdigest()[:16]


def jget(url):
    t, h = get(url)
    return json.loads(t), h


# Per source: what kind of information it is, which area it covers, how often it should refresh (minutes),
# its licence, and the evidence family. Indicators of one family are not independent (same underlying signal),
# so the score keeps only the strongest of each family. "@hazard" = one family per hazard.
# kind: observed | official | forecast | reported | context (shown, never scored)
META = {
    "fuel": dict(kind="observed", area="idf", every=30, lic="Licence Ouverte 2.0", fam="fuel"),
    "ecowatt": dict(kind="official", area="france", every=1440, lic="Licence Ouverte 2.0", fam="rte"),
    "eco2mix": dict(kind="observed", area="france", every=60, lic="Licence Ouverte 2.0", fam="rte"),
    "weather": dict(kind="forecast", area="paris", every=360, lic="CC BY 4.0 (Open-Meteo)", fam="@hazard"),
    "vigilance": dict(kind="official", area="paris", every=720, lic="Licence Ouverte 2.0", fam="@hazard"),
    "seine": dict(kind="observed", area="paris", every=60, lic="Licence Ouverte 2.0", fam="@hazard"),
    "vigicrues": dict(kind="official", area="paris", every=360, lic="voir la source", fam="@hazard"),
    "vigieau": dict(kind="official", area="paris", every=1440, lic="voir la source", fam="vigieau"),
    "kev": dict(kind="context", area="world", every=1440, lic="domaine public (CISA)", fam="kev"),
    "certfr": dict(kind="context", area="france", every=1440, lic="voir la source", fam="certfr"),
    "ransomlook": dict(kind="context", area="world", every=360, lic="voir la source", fam="ransomlook"),
    "ioda": dict(kind="observed", area="france", every=60, lic="voir la source", fam="ioda"),
    "probes": dict(kind="observed", area="single", every=30, lic="ce projet", fam="probes"),
    "news": dict(kind="reported", area="france", every=60, lic="titres et liens uniquement", fam="press"),
    "traffic": dict(kind="observed", area="paris", every=30, lic="ODbL (Ville de Paris)", fam="traffic"),
    "oni": dict(kind="context", area="world", every=43200, lic="domaine public (NOAA)", fam="oni"),
}


def ind(id, hazard, label, value, s, w, source, link, query, sha, rule, official=False, floor=0, pub=None, area=None):
    """One traceable measurement: what, how much, where from, when (published / fetched), under which rule."""
    m = META[source]
    return dict(id=id, hazard=hazard, label=label, value=value, s=round(clamp(s), 3), w=w,
                source=source, link=link, query=query, sha=sha, rule=rule,
                official=official, floor=floor, fetched=iso(now()), pub=pub,
                kind=m["kind"], area=area or m["area"], fam=hazard if m["fam"] == "@hazard" else m["fam"])


# ---------------------------------------------------------------- stress rules (shared with backfill.py)
def fuel_s(r): return interp(r, [(0.10, 0), (0.15, 0.5), (0.25, 1.0)])
def heat_s(mx, mn): return clamp(min((mx - 27) / 4, (mn - 17) / 4))   # 3-day mean Tmax / Tmin
def heat_day_s(t): return clamp((t - 33) / 7)
def cold_s(tmin): return interp(-tmin, [(0, 0), (3, 0.4), (8, 1.0)])
def wind_s(g): return interp(g, [(60, 0), (80, 0.4), (110, 1.0)])
def rain_s(r): return interp(r, [(20, 0), (40, 0.5), (60, 1.0)])
def seine_s(lvl, rise): return max(interp(lvl, [(3.0, 0), (4.0, 0.4), (5.0, 0.8), (6.0, 1.0)]), interp(rise, [(0.3, 0), (0.8, 0.4), (1.5, 0.8)]))
def kev7_s(n): return interp(n, [(10, 0), (25, 0.3), (50, 0.6)])
def kev_ransom_s(n): return interp(n, [(0, 0), (1, 0.3), (3, 0.6)])
def kev_edge_s(n): return interp(n, [(0, 0), (1, 0.2), (3, 0.5)])
ECO_S = {1: 0, 2: 0.6, 3: 1.0}
ECO_FLOOR = {2: 50, 3: 80}


# ---------------------------------------------------------------- fuel
FUEL_URL = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records"
FUEL_PAGE = "https://data.economie.gouv.fr/explore/dataset/prix-des-carburants-en-france-flux-instantane-v2/"
IDF = ("75", "77", "78", "91", "92", "93", "94", "95")


def _count(where):
    q = FUEL_URL + "?" + urllib.parse.urlencode({"limit": 0, "where": where})
    d, h = jget(q)
    return d["total_count"], q, h


def fuel():
    deps = "code_departement in (%s)" % ",".join('"%s"' % d for d in IDF)
    out = []
    for f, name in (("gazole", "Diesel"), ("e10", "SP95-E10")):
        since = (now() - timedelta(days=14)).strftime("%Y-%m-%d")  # older "temporary" flags are stale feed rows
        n, q1, h1 = _count(f'({deps}) and ({f}_prix is not null or {f}_rupture_type="temporaire")')
        k, q2, h2 = _count(f'({deps}) and {f}_rupture_type="temporaire" and {f}_rupture_debut >= date\'{since}\'')
        if n < 30:
            raise RuntimeError(f"only {n} stations carry {name}")
        r = k / n
        out.append(ind(
            f"fuel.{f}", "fuel", T(f"Stations {name} en rupture (Île-de-France)", f"{name} stations out of stock (Île-de-France)"),
            f"{k} / {n} stations déclarantes ({r:.1%})", fuel_s(r), 0.8,
            "fuel", FUEL_PAGE, q2, h1 + h2,
            T("Normal ≈ 8 %. 15 % = tension (0,5). 25 % = grave (1). Seules les ruptures temporaires déclarées depuis 14 jours comptent (les plus anciennes sont des lignes obsolètes). Mesure des ruptures déclarées par les stations, pas un recensement.",
              "Normal ≈ 8 %. 15 % = tension (0.5). 25 % = severe (1). Only temporary stockouts declared in the last 14 days count (older ones are stale feed rows). Counts stockouts declared by stations, not a census.")))
    return out, {}


# ---------------------------------------------------------------- power
ODRE = "https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets/"


def ecowatt():
    q = ODRE + "nouveau_signal_ecowatt/records?" + urllib.parse.urlencode({"limit": 3, "order_by": "date desc"})
    d, h = jget(q)
    r = d["results"][0]
    day = datetime.fromisoformat(r["date"]).replace(tzinfo=UTC)
    age = (now() - day).days
    if age > 3:
        raise RuntimeError(f"latest Ecowatt row is {age} days old")
    c = int(r["couleur_du_jour"])
    names = {1: T("vert", "green"), 2: T("orange", "orange"), 3: T("rouge", "red")}
    return [ind("power.ecowatt", "power", T("Signal Ecowatt (RTE)", "Ecowatt signal (RTE)"),
                {"fr": f"{names.get(c, names[1])['fr']} ({r['date']})", "en": f"{names.get(c, names[1])['en']} ({r['date']})"},
                ECO_S.get(c, 0), 1.0, "ecowatt", "https://www.monecowatt.fr", q, h,
                T("Vert = 0. Orange = tension (plancher « Préparez-vous »). Rouge = coupures possibles (plancher « Agissez »).",
                  "Green = 0. Orange = tension (floor “Prepare”). Red = outages possible (floor “Act”)."),
                official=True, floor=ECO_FLOOR.get(c, 0), pub=r["date"])], {}


def eco2mix():
    q = ODRE + "eco2mix-national-tr/records?" + urllib.parse.urlencode(
        {"limit": 1, "where": "consommation is not null", "order_by": "date_heure desc",
         "select": "date_heure,consommation,prevision_j"})
    d, h = jget(q)
    r = d["results"][0]
    age = (now() - datetime.fromisoformat(r["date_heure"])).total_seconds() / 60
    if age > 90:
        raise RuntimeError(f"latest eco2mix point is {age:.0f} min old")
    ratio = r["consommation"] / r["prevision_j"]
    return [ind("power.load", "power", T("Consommation nationale vs prévision", "National load vs forecast"),
                f"{r['consommation']} / {r['prevision_j']} MW ({ratio:.0%})",
                interp(abs(ratio - 1), [(0.06, 0), (0.12, 0.5), (0.20, 1.0)]), 0.8,
                "eco2mix", "https://www.rte-france.com/eco2mix", q, h,
                T("Écart > 6 % entre consommation réelle et prévue : anomalie ; > 20 % : effondrement ou pic extrême.",
                  "Gap > 6 % between actual and forecast load = anomaly; > 20 % = collapse or extreme peak."), pub=r["date_heure"])], {}


# ---------------------------------------------------------------- weather
METEO = ("https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&timezone=Europe%2FParis"
         "&forecast_days=7&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max")


def weather():
    d, h = jget(METEO)
    D = d["daily"]
    days = D["time"]
    tx = [x if x is not None else 0 for x in D["temperature_2m_max"]]
    tn = [x if x is not None else 0 for x in D["temperature_2m_min"]]
    gust = [x or 0 for x in D["wind_gusts_10m_max"]]
    rain = [x or 0 for x in D["precipitation_sum"]]
    link = "https://open-meteo.com/"
    # heat: Paris biometeorological criterion = 3-day mean Tmax >= 31 and Tmin >= 21 (we ramp from 27/17)
    best_s, best_i = 0.0, 0
    for i in range(len(tx) - 2):
        mx, mn = sum(tx[i:i + 3]) / 3, sum(tn[i:i + 3]) / 3
        s = heat_s(mx, mn)
        if s > best_s:
            best_s, best_i = s, i
    s1 = max(heat_day_s(t) for t in tx)
    mx, mn = sum(tx[best_i:best_i + 3]) / 3, sum(tn[best_i:best_i + 3]) / 3
    out = [ind("heat.forecast", "heat", T("Chaleur prévue (7 jours)", "Forecast heat (7 days)"),
               f"Tmax max {max(tx):.0f} °C · Tmin max {max(tn):.0f} °C · 3 j. depuis {days[best_i]}: {mx:.1f}/{mn:.1f} °C",
               max(best_s, s1), 0.7, "weather", link, METEO, h,
               T("Seuil canicule Paris : moyenne 3 j. Tmax ≥ 31 °C et Tmin ≥ 21 °C (= 1). Un jour ≥ 40 °C = 1.",
                 "Paris heatwave criterion: 3-day mean Tmax ≥ 31 °C and Tmin ≥ 21 °C (= 1). A day ≥ 40 °C = 1."))]
    cold = min(tn[:3])
    g, r = max(gust[:3]), max(rain[:3])
    out += [
        ind("weather.cold", "weather", T("Froid prévu (3 jours)", "Forecast cold (3 days)"), f"Tmin {cold:.0f} °C",
            cold_s(cold), 0.7, "weather", link, METEO, h,
            T("0 °C = 0 ; −3 °C = 0,4 ; −8 °C = 1.", "0 °C = 0; −3 °C = 0.4; −8 °C = 1.")),
        ind("weather.wind", "weather", T("Rafales prévues (3 jours)", "Forecast gusts (3 days)"), f"{g:.0f} km/h",
            wind_s(g), 0.7, "weather", link, METEO, h,
            T("60 km/h = 0 ; 80 = 0,4 ; 110 = 1.", "60 km/h = 0; 80 = 0.4; 110 = 1.")),
        ind("weather.rain", "weather", T("Pluie prévue en 24 h (3 jours)", "Forecast 24 h rain (3 days)"), f"{r:.0f} mm",
            rain_s(r), 0.7, "weather", link, METEO, h,
            T("20 mm = 0 ; 40 = 0,5 ; 60 = 1 (risque d'inondation rapide).", "20 mm = 0; 40 = 0.5; 60 = 1 (flash-flood risk)."))]
    return out, {}


# ---------------------------------------------------------------- Météo-France Vigilance (official)
VIG = ("https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/weatherref-france-vigilance-meteo-departement/records?"
       + urllib.parse.urlencode({"where": 'domain_id="75"', "limit": 40}))
COLORS = {1: ("vert", "green"), 2: ("jaune", "yellow"), 3: ("orange", "orange"), 4: ("rouge", "red")}


def vigilance():
    d, h = jget(VIG)
    rows = d["results"]
    if not rows:
        raise RuntimeError("no vigilance rows for Paris")
    age = (now() - max(datetime.fromisoformat(r["product_datetime"]) for r in rows)).total_seconds() / 3600
    if age > 18:
        raise RuntimeError(f"vigilance bulletin is {age:.0f} h old")
    groups = {"heat": [], "weather": [], "flood": []}
    for r in rows:
        ph = r["phenomenon"].lower()
        groups["heat" if "canicule" in ph else "flood" if re.search(r"crue|inond", ph) else "weather"].append(r)
    names = {"heat": T("Vigilance Météo-France : canicule (Paris)", "Météo-France vigilance: heatwave (Paris)"),
             "weather": T("Vigilance Météo-France : vent, pluie, orages, neige, froid (Paris)", "Météo-France vigilance: wind, rain, storms, snow, cold (Paris)"),
             "flood": T("Vigilance Météo-France : crues (Paris)", "Météo-France vigilance: floods (Paris)")}
    out = []
    for hz, rs in groups.items():
        if not rs and hz != "weather":
            continue  # canicule/crues rows only exist when the phenomenon is in play; absence = green
        top = max(rs, key=lambda r: r["color_id"], default=None)
        c = top["color_id"] if top else 1
        what = f"{COLORS[c][0]} · {top['phenomenon']} ({'aujourd’hui' if top['echeance'] == 'J' else 'demain'})" if top and c > 1 else "vert"
        whate = f"{COLORS[c][1]} · {top['phenomenon']} ({'today' if top['echeance'] == 'J' else 'tomorrow'})" if top and c > 1 else "green"
        out.append(ind(f"vigilance.{hz}", hz, names[hz], T(what, whate), {1: 0, 2: 0.25, 3: 0.6, 4: 1.0}[c], 1.0, "vigilance",
                       "https://vigilance.meteofrance.fr", VIG, h,
                       T("Vert 0 ; jaune 0,25 ; orange 0,6 (plancher « Préparez-vous ») ; rouge 1 (plancher « Agissez »). Aujourd'hui et demain.",
                         "Green 0; yellow 0.25; orange 0.6 (floor “Prepare”); red 1 (floor “Act”). Today and tomorrow."),
                       official=True, floor={3: 50, 4: 80}.get(c, 0), pub=max(r["product_datetime"] for r in rows)))
    return out, {}


# ---------------------------------------------------------------- Seine
SEINE = ("https://hubeau.eaufrance.fr/api/v2/hydrometrie/observations_tr?code_entite=F700000103"
         "&grandeur_hydro=H&size=100&sort=desc&fields=date_obs,resultat_obs")


def seine():
    d, h = jget(SEINE)
    rows = d["data"]
    t0 = datetime.fromisoformat(rows[0]["date_obs"].replace("Z", "+00:00"))
    if (now() - t0).total_seconds() > 3 * 3600:
        raise RuntimeError("latest Seine reading older than 3 h")
    lvl = rows[0]["resultat_obs"] / 1000  # mm -> m
    t1 = datetime.fromisoformat(rows[-1]["date_obs"].replace("Z", "+00:00"))
    hours = (t0 - t1).total_seconds() / 3600
    rise = (lvl - rows[-1]["resultat_obs"] / 1000) / hours * 24 if hours >= 6 else 0.0
    s = seine_s(lvl, rise)
    return [ind("flood.seine", "flood", T("Seine à Paris-Austerlitz", "Seine at Paris-Austerlitz"),
                f"{lvl:.2f} m · {rise:+.2f} m/jour", s, 0.6, "seine", "https://www.vigicrues.gouv.fr", SEINE, h,
                T("Niveau 3 m = 0 ; 4 m = 0,4 ; 5 m = 0,8 ; 6 m = 1 (repères de crues 2016/2018 : ≈ 6 m). Montée > 0,3 m/jour compte. Seuils à confirmer avec Vigicrues.",
                  "Level 3 m = 0; 4 m = 0.4; 5 m = 0.8; 6 m = 1 (2016/2018 floods ≈ 6 m). Rise > 0.3 m/day counts. Thresholds to confirm with Vigicrues."), pub=rows[0]["date_obs"])], {}


# ---------------------------------------------------------------- drought
def vigieau():
    q = "https://api.vigieau.beta.gouv.fr/api/zones?lon=2.35&lat=48.85"
    zones, h = jget(q)
    rank = {"vigilance": 1, "alerte": 2, "alerte_renforcee": 3, "crise": 4}
    top = max([rank.get(z.get("niveauGravite"), 0) for z in zones] + [0])
    name = {0: "aucune", 1: "vigilance", 2: "alerte", 3: "alerte renforcée", 4: "crise"}[top]
    namee = {0: "none", 1: "watch", 2: "alert", 3: "heightened alert", 4: "crisis"}[top]
    return [ind("drought.restrictions", "drought", T("Restrictions d'eau (VigiEau, Paris)", "Water restrictions (VigiEau, Paris)"),
                T(name, namee), [0, 0.15, 0.4, 0.7, 1.0][top], 1.0, "vigieau", "https://vigieau.gouv.fr", q, h,
                T("Vigilance 0,15 ; alerte 0,4 ; alerte renforcée 0,7 ; crise 1.", "Watch 0.15; alert 0.4; heightened 0.7; crisis 1."),
                official=True)], {}


# ---------------------------------------------------------------- cyber
KEV = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
WATCH = ("fortinet", "citrix", "ivanti", "palo alto", "cisco", "veeam", "sonicwall", "f5", "juniper",
         "vmware", "progress", "cleo", "sap", "oracle")


def kev():
    d, h = jget(KEV)
    v = d["vulnerabilities"]
    day = lambda n: (now() - timedelta(days=n)).strftime("%Y-%m-%d")
    w7 = [x for x in v if x["dateAdded"] >= day(7)]
    w3 = [x for x in v if x["dateAdded"] >= day(3)]
    ran = [x for x in w7 if x.get("knownRansomwareCampaignUse") == "Known"]
    wat = [x for x in w3 if any(k in x["vendorProject"].lower() for k in WATCH)]
    L = "https://www.cisa.gov/known-exploited-vulnerabilities-catalog"
    return [
        ind("cyber.kev7", "cyber", T("Failles exploitées ajoutées (7 j., CISA KEV)", "Exploited vulns added (7 d, CISA KEV)"),
            f"{len(w7)}", kev7_s(len(w7)), 0.4, "kev", L, KEV, h,
            T("Normal ≈ 8/semaine. 25 = 0,3 ; 50 = 0,6.", "Normal ≈ 8/week. 25 = 0.3; 50 = 0.6.")),
        ind("cyber.kev_ransom", "cyber", T("… dont liées à des rançongiciels", "… of which tied to ransomware"),
            f"{len(ran)}", kev_ransom_s(len(ran)), 0.4, "kev", L, KEV, h,
            T("1 = 0,3 ; 3 = 0,6.", "1 = 0.3; 3 = 0.6.")),
        ind("cyber.kev_edge", "cyber", T("Failles dans équipements réseau/serveurs courants (3 j.)", "Flaws in common edge/server products (3 d)"),
            f"{len(wat)}" + (": " + ", ".join(sorted({x['vendorProject'] for x in wat})[:5]) if wat else ""),
            kev_edge_s(len(wat)), 0.4, "kev", L, KEV, h,
            T("Fortinet, Citrix, Ivanti, Cisco, Veeam… 1 = 0,2 ; 3 = 0,5.", "Fortinet, Citrix, Ivanti, Cisco, Veeam… 1 = 0.2; 3 = 0.5."))], {}


CERT = "https://www.cert.ssi.gouv.fr/alerte/feed/"


def certfr():
    t, h = get(CERT)
    items = ET.fromstring(t).findall("./channel/item")
    cut = now() - timedelta(hours=72)
    new = []
    for it in items:
        try:
            if parsedate_to_datetime(it.findtext("pubDate")) >= cut:
                new.append(it.findtext("title"))
        except Exception:
            continue
    return [ind("cyber.certfr", "cyber", T("Alertes CERT-FR (72 h)", "CERT-FR alerts (72 h)"),
                f"{len(new)}" + (": " + "; ".join(new[:2]) if new else ""),
                interp(len(new), [(0, 0), (1, 0.3), (3, 0.6)]), 0.5, "certfr", "https://www.cert.ssi.gouv.fr/alerte/", CERT, h,
                T("Alerte = faille activement exploitée. 1 = 0,3 ; 3 = 0,6.", "Alert = actively exploited flaw. 1 = 0.3; 3 = 0.6."))], {}


SECTOR = re.compile(r"logisti|transport|fret|froid|frigo|cold|aliment|food|grocer|supermarch|distribut|"
                    r"carrefour|auchan|leclerc|intermarch|lidl|monoprix|casino|rungis|fresh|agro|laiti|viande|freight|warehouse")
RL = "https://www.ransomlook.io/api/recent"


def ransomlook():
    posts, h = jget(RL)
    cut = now() - timedelta(hours=72)
    recent = [p for p in posts if datetime.fromisoformat(p["discovered"]).replace(tzinfo=UTC) >= cut]
    fr = [p["post_title"] for p in recent if re.search(r"\.fr\b", p["post_title"].lower())]
    hits = [t for t in fr if SECTOR.search(t.lower())]
    return [ind("supply.ransom_fr", "supply", T("Victimes de rançongiciel .fr du secteur logistique/alimentaire (72 h)", "Ransomware victims (.fr) in logistics/food (72 h)"),
                f"{len(hits)} (sur {len(fr)} victimes .fr, {len(recent)} au total)" + (": " + ", ".join(hits[:3]) if hits else ""),
                interp(len(hits), [(0, 0), (1, 0.3), (3, 0.6)]), 0.3, "ransomlook", "https://www.ransomlook.io", RL, h,
                T("Heuristique : domaine en .fr + mot-clé secteur. Les effets en rayon arrivent en 2-5 jours. 1 = 0,3 ; 3 = 0,6.",
                  "Heuristic: .fr domain + sector keyword. Shelf effects follow in 2-5 days. 1 = 0.3; 3 = 0.6."))], {}


# ---------------------------------------------------------------- connectivity
def ioda():
    t = int(time.time())
    q = ("https://api.ioda.inetintel.cc.gatech.edu/v2/outages/summary?entityType=country&entityCode=FR"
         f"&from={t - 86400}&until={t}")
    d, h = jget(q)
    n = len(d.get("data") or [])
    return [ind("digital.ioda", "digital", T("Pannes Internet détectées en France (24 h)", "Internet outages detected in France (24 h)"),
                f"{n}", interp(n, [(0, 0), (1, 0.5), (3, 1.0)]), 0.8, "ioda", "https://ioda.inetintel.cc.gatech.edu/country/FR", q, h,
                T("Détection indépendante (Georgia Tech). 0 = 0 ; 1 = 0,5 ; 3 = 1.", "Independent detection (Georgia Tech). 0 = 0; 1 = 0.5; 3 = 1."))], {}


SITES = {
    "bank": ["https://www.credit-agricole.fr", "https://www.boursorama.com", "https://www.lcl.fr", "https://www.societegenerale.fr"],
    "retail": ["https://www.carrefour.fr", "https://www.auchan.fr", "https://www.monoprix.fr", "https://www.leclercdrive.fr"],
    "transit": ["https://www.iledefrance-mobilites.fr", "https://www.ratp.fr", "https://www.sncf-connect.com"],
    "telecom": ["https://www.orange.fr", "https://www.free.fr", "https://www.sfr.fr", "https://www.bouyguestelecom.fr"],
    "cloud": ["https://www.cloudflare.com", "https://aws.amazon.com", "https://azure.microsoft.com", "https://www.ovhcloud.com"],
    "gov": ["https://www.service-public.fr", "https://www.impots.gouv.fr", "https://www.ameli.fr"],
}
CAT = {"bank": T("Banques", "Banks"), "retail": T("Supermarchés en ligne", "Online supermarkets"),
       "transit": T("Transports", "Transit"), "telecom": T("Opérateurs télécom", "Telecom operators"),
       "cloud": T("Cloud", "Cloud"), "gov": T("Services publics", "Public services")}


def _up(url):
    for attempt in (0, 1):
        try:
            urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; puite/1.0)"}), timeout=10).read(512)
            return True
        except urllib.error.HTTPError as e:
            if e.code < 500:
                return True
        except Exception:
            pass
        if attempt == 0:
            time.sleep(2)
    return False


def probes():
    urls = [u for v in SITES.values() for u in v]
    with ThreadPoolExecutor(12) as ex:
        res = dict(zip(urls, ex.map(_up, urls)))
    out = []
    for cat, us in SITES.items():
        down = [u.split("//")[1] for u in us if not res[u]]
        frac = len(down) / len(us)
        out.append(ind(f"probe.{cat}", "supply" if cat == "retail" else "digital",
                       T(f"Accessibilité : {CAT[cat]['fr']}", f"Reachability: {CAT[cat]['en']}"),
                       f"{len(us) - len(down)}/{len(us)} joignables" if not down else f"{len(us) - len(down)}/{len(us)}: " + ", ".join(down),
                       interp(frac, [(0.25, 0), (0.5, 0.5), (0.75, 1.0)]), 0.6, "probes", "https://github.com/",
                       ", ".join(us), hashlib.sha256(json.dumps(res, sort_keys=True).encode()).hexdigest()[:16],
                       T("Un site est « en panne » s'il ne répond pas après 2 essais (une réponse HTTP < 500 = joignable). Un seul point de mesure : poids limité (0,6). ≥ 50 % en panne = 0,5.",
                         "A site is “down” if it fails twice (any HTTP < 500 = reachable). Single vantage point: weight capped (0.6). ≥ 50 % down = 0.5.")))
    return out, {}


# ---------------------------------------------------------------- local news (headlines only, unscored)
FEEDS = [("franceinfo", "franceinfo", "https://www.francetvinfo.fr/titres.rss"),
         ("ici", "ici (France Bleu)", "https://www.francebleu.fr/rss/a-la-une.xml"),
         ("20min", "20 Minutes", "https://www.20minutes.fr/feeds/rss-une.xml"),
         ("figaro", "Le Figaro", "https://www.lefigaro.fr/rss/figaro_actualites-a-la-une.xml"),
         ("rfi", "RFI France", "https://www.rfi.fr/fr/france/rss"),
         ("lemonde", "Le Monde Paris", "https://www.lemonde.fr/paris/rss_full.xml")]
# theme -> (label fr, label en, regex). Plain keyword rules; nothing is inferred or summarised.
THEMES = {
    "transport": (T("Transports et mobilisation", "Transport and strikes"),
                  r"gr[eè]ve|perturbations?|trafic (perturb|interromp)|ratp|sncf|m[ée]tro\b|\brer\b|transilien|a[ée]roport"),
    "power": (T("Électricité", "Power"), r"coupure[s]? (de courant|d.[ée]lectricit)|panne [ée]lectrique|blackout|d[ée]lestage|enedis|\brte\b|ecowatt|black-out"),
    "fuel": (T("Carburant", "Fuel"), r"p[ée]nurie (de )?(carburant|essence|diesel|gazole)|stations?[- ]service[s]? (à sec|ferm)|raffiner|rationnement"),
    "water": (T("Eau et crue", "Water and flood"), r"inondation|crue|vigilance (orange|rouge) (pluie|crue|inond)|s[ée]cheresse|restrictions? d.eau|eau potable|rupture de canalisation"),
    "weather": (T("Météo extrême", "Extreme weather"), r"canicule|temp[êe]te|vigilance (orange|rouge)|verglas|neige|vague de (froid|chaleur)|orages?"),
    "digital": (T("Numérique et cyber", "Digital and cyber"), r"cyberattaque|cyber-attaque|rançongiciel|ransomware|panne (g[ée]n[ée]ralis[ée]e|informatique|internet|r[ée]seau)|piratage"),
    "security": (T("Sécurité", "Security"), r"attentat|alerte (attentat|[àa] la bombe)|vigipirate|explosion|[ée]vacuation|fusillade|prise d.otage|colis suspect|fr-alert"),
    "supply": (T("Approvisionnement", "Supply"), r"p[ée]nurie|rupture d.approvisionnement|rappel (de )?produit|rayons? vides|rupture de stock"),
    "prepare": (T("Appel à se préparer", "Preparedness calls"), r"kit (de survie|d.urgence)|se pr[ée]parer|tous responsables|manuel de survie|pr[ée]paration (à|aux) (crise|catastrophe|guerre)|pr[ée]paration des fran[cç]ais"),
    "health": (T("Santé", "Health"), r"[ée]pid[ée]mie|pand[ée]mie|intoxication|alerte sanitaire|contamination"),
}
LOCAL_ONLY = {"weather", "water", "security", "health"}  # a storm in Marseille is not Paris news: these need Paris/IdF in the headline
CYBER_RE = re.compile(r"cyberattaque|cyber-attaque|rançongiciel|ransomware|piratage|pirat[ée]s?\b|attaque informatique|cyber attaque")
COLD_RE = re.compile(r"froid|frigo|r[ée]frig[ée]r|cong[ée]l|cha[iî]ne du froid|logisti|entrep[ôo]t|chambres? froides?|supermarch|grande distribution")
BANK_RE = re.compile(r"banque|bancaire|paiement|carte bancaire|virement|distributeur|cr[ée]dit agricole|\bbnp|soci[ée]t[ée] g[ée]n[ée]rale|\blcl\b|boursorama|banque postale|cr[ée]dit mutuel|\bsepa\b")
WEAK = {"transport": r"manifestation|mobilisation|blocages?"}  # too generic nationally: only counted when the headline names Paris/IdF
EXCLUDE = re.compile(r"proc[èe]s|assises|verdict|condamn|accus[ée]|renvoy|r[ée]trospective|anniversaire")
PARIS_RE = re.compile(r"\bparis\b|[îi]le-de-france|\bidf\b|r[ée]gion parisienne|paris-|hauts-de-seine|seine-saint-denis|val-de-marne|ratp|\bidfm\b|[îi]le-de-france mobilit")
FRANCE_RE = re.compile(r"\bfrance\b|fran[cç]ais|nationale?\b|gouvernement|pr[ée]fecture|\bsncf\b|enedis|\brte\b|premier ministre|[ée]lys[ée]e")
TAGS = re.compile(r"<[^>]+>")


def _feed(fid, name, url):
    t, h = get(url)
    out = []
    for it in ET.fromstring(t).findall(".//item"):
        try:
            when = parsedate_to_datetime(it.findtext("pubDate"))
            if when.tzinfo is None:
                when = when.replace(tzinfo=UTC)
        except Exception:
            continue
        out.append((fid, name, (it.findtext("title") or "").strip(), (it.findtext("link") or "").strip(),
                    TAGS.sub(" ", it.findtext("description") or "")[:400], when))
    return out, h


def events(rows):
    """Group near-duplicate headlines (shared words) into events: syndicated copies count once."""
    ev = []
    for r in rows:
        toks = set(re.findall(r"\w{4,}", r[2].lower()))
        for e in ev:
            if len(toks & e[0]) / max(1, len(toks | e[0])) >= 0.35:
                e[1].append(r)
                e[0].update(toks)
                break
        else:
            ev.append([set(toks), [r]])
    return [e[1] for e in ev]


def news():
    cut = now() - timedelta(hours=36)
    items, feeds, shas = [], [], []
    for fid, name, url in FEEDS:
        try:
            rows, h = _feed(fid, name, url)
            feeds.append({"id": fid, "name": name, "link": url, "ok": True, "n": len(rows)})
            shas.append(h)
            items += [r for r in rows if r[5] >= cut]
        except Exception as e:
            feeds.append({"id": fid, "name": name, "link": url, "ok": False, "err": f"{type(e).__name__}"})
    if not any(f["ok"] for f in feeds):
        raise RuntimeError("no news feed reachable")
    hits, seen = [], set()
    for fid, name, title, link, desc, when in sorted(items, key=lambda r: r[5], reverse=True):
        key = re.sub(r"\W+", "", title.lower())[:48]
        if not title or key in seen or not link.startswith("http"):
            continue
        text = (title + " " + desc).lower()
        if EXCLUDE.search(title.lower()):
            continue
        scope = "paris" if PARIS_RE.search(text) else "france" if FRANCE_RE.search(text) else None
        if not scope:
            continue
        for th, (lab, rx) in THEMES.items():
            if th in LOCAL_ONLY and scope != "paris":
                continue
            m = re.search(rx, text) or (scope == "paris" and th in WEAK and re.search(WEAK[th], text))
            if m:
                seen.add(key)
                hits.append({"title": title, "link": link, "source": name, "published": iso(when), "theme": th,
                             "scope": scope, "kw": m.group(0)})
                break
    inds = []
    for iid, hz, label, rx2, link_to in (
            ("news.cyber", "cyber", T("Cyberattaques en France relayées par la presse (36 h)", "Cyberattacks in France reported by the press (36 h)"), None, "https://www.cybermalveillance.gouv.fr"),
            ("news.cold", "supply", T("Cyberattaque contre des chaînes du froid / logistique (presse, 36 h)", "Cyberattack on cold chains / logistics (press, 36 h)"), COLD_RE, "https://www.cert.ssi.gouv.fr/alerte/"),
            ("news.bank", "digital", T("Cyberattaque contre banques / paiements (presse, 36 h)", "Cyberattack on banks / payments (press, 36 h)"), BANK_RE, "https://www.cybermalveillance.gouv.fr")):
        m = [r for r in items if r[2] and EXCLUDE.search(r[2].lower()) is None and CYBER_RE.search((r[2] + " " + r[4]).lower())
             and (PARIS_RE.search((r[2] + " " + r[4]).lower()) or FRANCE_RE.search((r[2] + " " + r[4]).lower()))
             and (rx2 is None or rx2.search((r[2] + " " + r[4]).lower()))]
        evs = events(m)  # outlets repeating one story are ONE event, not independent confirmation
        outlets = {r[0] for r in m}
        sample = m[0] if m else None
        inds.append(ind(iid, hz, label,
                        f"{len(evs)} événement(s), {len(outlets)} média(s)" + (" : " + sample[2][:90] if sample else ""),
                        interp(len(evs), [(0, 0), (1, 0.2), (2, 0.5), (3, 0.7)]), 0.5 if rx2 else 0.4, "news",
                        sample[3] if sample else link_to, ", ".join(u for _, _, u in FEEDS), hashlib.sha256("".join(shas).encode()).hexdigest()[:16],
                        T("Mots-clés cyber (cyberattaque, rançongiciel, piratage…) + secteur. On compte les événements distincts, pas les médias : plusieurs médias qui reprennent la même histoire valent un seul événement. 1 = 0,2 ; 2 = 0,5 ; 3+ = 0,7. Poids plafonné : la presse seule ne peut pas dépasser « À surveiller » ou « Préparez-vous ».",
                          "Cyber keywords (cyberattack, ransomware, hacking…) + sector. Counts distinct events, not outlets: several outlets repeating one story are one event. 1 = 0.2; 2 = 0.5; 3+ = 0.7. Weight capped: press alone cannot go beyond “Be aware” or “Prepare”.")))
    hits.sort(key=lambda x: (x["scope"] != "paris", x["published"]), reverse=False)
    hits.sort(key=lambda x: x["published"], reverse=True)
    hits.sort(key=lambda x: x["scope"] != "paris")
    return inds, {"news": {"items": hits[:12], "feeds": feeds, "fetched": iso(now()), "themes": {k: v[0] for k, v in THEMES.items()},
                         "sha": hashlib.sha256("".join(shas).encode()).hexdigest()[:16],
                         "rule": T("Titres de moins de 36 h contenant un mot-clé de crise ET une référence à Paris/Île-de-France (ou à la France). Aucune interprétation : le titre est affiché tel que publié, avec le mot déclencheur.",
                                   "Headlines under 36 h old containing a crisis keyword AND a reference to Paris/Île-de-France (or France). No interpretation: the headline is shown as published, with the trigger word.")}}


# ---------------------------------------------------------------- Vigicrues (official flood vigilance)
VIGICRUES = "https://www.vigicrues.gouv.fr/services/InfoVigiCru.geojson"


def vigicrues():
    d, h = jget(VIGICRUES)
    f = [x["properties"] for x in d["features"] if x["properties"].get("CdEntCru") == "IF5"]  # "Seine à Paris"
    if not f:
        raise RuntimeError("Vigicrues: section 'Seine à Paris' not found")
    c = int(f[0]["NivInfViCr"])
    return [ind("flood.vigicrues", "flood", T("Vigilance crues Vigicrues : Seine à Paris", "Vigicrues flood vigilance: Seine in Paris"),
                T(COLORS[c][0], COLORS[c][1]), {1: 0, 2: 0.25, 3: 0.6, 4: 1.0}[c], 1.0, "vigicrues",
                "https://www.vigicrues.gouv.fr/", VIGICRUES, h,
                T("Vert 0 ; jaune 0,25 ; orange 0,6 (plancher « Préparez-vous ») ; rouge 1 (plancher « Agissez »). Vigilance officielle du service de prévision des crues.",
                  "Green 0; yellow 0.25; orange 0.6 (floor “Prepare”); red 1 (floor “Act”). Official flood-forecasting service vigilance."),
                official=True, floor={3: 50, 4: 80}.get(c, 0))], {}


# ---------------------------------------------------------------- Paris traffic events (local disruptions, not scored)
TRAFFIC_BASE = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/circulation_evenement/records?"


def traffic():
    t, rows, h = now(), [], ""
    for off in (0, 100, 200):  # dates are text in this dataset, so filter here, not in the query
        q = TRAFFIC_BASE + urllib.parse.urlencode({"limit": 100, "offset": off, "select": "description,street,type,starttime,endtime"})
        d, h = jget(q)
        rows += d["results"]
        if len(rows) >= d["total_count"]:
            break
    act = []
    for r in rows:
        try:
            a, b = datetime.fromisoformat(r["starttime"]), datetime.fromisoformat(r["endtime"])
        except Exception:
            continue
        if a <= t <= b:
            act.append({"street": (r.get("street") or "").replace("_", " "), "what": (r.get("description") or "").replace("_", " "),
                        "closed": r.get("type") == "ROAD_CLOSED", "until": iso(b)})
    act = list({(x["street"], x["what"]): x for x in act}.values())  # same works listed once per direction
    act.sort(key=lambda x: (not x["closed"], x["until"]))
    return [], {"traffic": {"n": len(act), "closed": sum(x["closed"] for x in act), "items": act[:30], "fetched": iso(t),
                            "link": "https://opendata.paris.fr/explore/dataset/circulation_evenement/", "sha": h}}


# ---------------------------------------------------------------- background context (not scored)
def oni():
    t, h = get("https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt")
    season, year, _, anom = t.strip().splitlines()[-1].split()
    a = float(anom)
    phase = "El Niño" if a >= 0.5 else "La Niña" if a <= -0.5 else "neutral"
    strength = "very strong" if abs(a) >= 2 else "strong" if abs(a) >= 1.5 else "moderate" if abs(a) >= 1 else "weak"
    return [], {"enso": {"season": f"{season} {year}", "anom": a, "phase": phase, "strength": strength,
                         "link": "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/ONI_v5.php", "sha": h}}


SOURCES = [
    ("fuel", "Fuel stations feed (data.economie.gouv.fr)", FUEL_PAGE, fuel),
    ("ecowatt", "Ecowatt signal (RTE via ODRE)", "https://odre.opendatasoft.com/explore/dataset/nouveau_signal_ecowatt/", ecowatt),
    ("eco2mix", "eco2mix national load (RTE via ODRE)", "https://odre.opendatasoft.com/explore/dataset/eco2mix-national-tr/", eco2mix),
    ("weather", "Forecast (Open-Meteo)", "https://open-meteo.com/", weather),
    ("seine", "Seine level (Hub'Eau)", "https://hubeau.eaufrance.fr/", seine),
    ("vigieau", "Water restrictions (VigiEau)", "https://vigieau.gouv.fr", vigieau),
    ("kev", "Exploited vulnerabilities (CISA KEV)", "https://www.cisa.gov/known-exploited-vulnerabilities-catalog", kev),
    ("certfr", "CERT-FR alerts (ANSSI)", "https://www.cert.ssi.gouv.fr/alerte/", certfr),
    ("ransomlook", "Ransomware leak posts (RansomLook)", "https://www.ransomlook.io", ransomlook),
    ("ioda", "Internet outages (IODA, Georgia Tech)", "https://ioda.inetintel.cc.gatech.edu/", ioda),
    ("probes", "Reachability probes (this project)", "https://github.com/", probes),
    ("vigilance", "Météo-France vigilance (official, via Opendatasoft)", "https://vigilance.meteofrance.fr", vigilance),
    ("vigicrues", "Vigicrues flood vigilance (official)", "https://www.vigicrues.gouv.fr/", vigicrues),
    ("traffic", "Paris traffic events (Ville de Paris open data)", "https://opendata.paris.fr/explore/dataset/circulation_evenement/", traffic),
    ("news", "Press headlines (RSS: franceinfo, ici, 20 Minutes, Le Figaro, RFI, Le Monde)", "https://www.francetvinfo.fr/titres.rss", news),
    ("oni", "ENSO index (NOAA CPC)", "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/ONI_v5.php", oni),
]
