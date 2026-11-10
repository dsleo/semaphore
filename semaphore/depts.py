"""Per-département scoring for metropolitan France -> docs/data/depts.json.
Feeds the heatmap (every hazard we monitor, one layer each) and the commune view (air, pollen, wildfire, health, nuclear
are read from the commune's département). Same rules as score.py, no damping (no per-département history).
Each source fails alone: its hazard is then unknown (None) for every département, never "all clear"."""
import csv
import gzip
import io
import json
import re
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path

from . import score, sources as S
from .sources import T, clamp, get, ind, interp, iso, jget, now

HERE = Path(__file__).parent
DEPS = json.loads((HERE / "depts.json").read_text())
CFG = json.loads((HERE / "config.json").read_text())["hazards"]
DETAIL = ("air", "pollen", "wildfire", "health", "nuclear")  # indicators kept in depts.json (the others: level only)
MIN_GAP = timedelta(minutes=50)  # Open-Meteo is rate limited (96 points per run): recompute at most hourly


def paris_day():
    """Atmo publishes one index per Paris-time day; the runner's clock is UTC, which is still "yesterday" until 01-02 h."""
    from .memory import day_of
    return day_of(now())


def dep_of(code):
    """INSEE commune code -> département code."""
    return code[:3] if code[:2] == "97" else code[:2]  # Corsica keeps '2A'/'2B'; DOM not mapped


def q75(xs):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(0.75 * len(xs)))] if xs else None  # robust: a few bad communes do not paint the département


# ---------------------------------------------------------------- weather (Open-Meteo, all prefecture points in one request)
def weather():
    ks = list(DEPS)
    q = ("https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode({
        "latitude": ",".join(str(DEPS[k]["lat"]) for k in ks), "longitude": ",".join(str(DEPS[k]["lon"]) for k in ks),
        "timezone": "Europe/Paris", "forecast_days": 7, "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max"}, safe=","))
    rows, h = jget(q)
    link, out = "https://open-meteo.com/", {}
    for k, d in zip(ks, rows):
        D = d["daily"]
        try:
            tx, tn, gust, rain = S.forecast_series(D)
        except RuntimeError:
            continue  # missing values for this point: that département stays unknown for weather
        X, N = S.heat_thr(k)
        bs = max(clamp(min((sum(tx[i:i + 3]) / 3 - (X - 4)) / 4, (sum(tn[i:i + 3]) / 3 - (N - 4)) / 4)) for i in range(len(tx) - 2))
        mk = lambda id, hz, fr, en, v, s, rf, re_: ind(id, hz, T(fr, en), v, s, 0.7, "weather", link, q, h, T(rf, re_), area="dept")
        out[k] = [
            mk("heat.forecast", "heat", "Chaleur prévue (7 jours)", "Forecast heat (7 days)", f"Tmax max {max(tx):.0f} °C · Tmin max {max(tn):.0f} °C", max(bs, max(clamp((t - 33) / 7) for t in tx)),
               "Seuil indicatif : moyenne 3 j. Tmax et Tmin proches du critère canicule local (= 1). Un jour ≥ 40 °C = 1.", "Indicative: 3-day mean Tmax/Tmin near the local heatwave criterion (= 1). A day ≥ 40 °C = 1."),
            mk("weather.cold", "weather", "Froid prévu (3 jours)", "Forecast cold (3 days)", f"Tmin {min(tn[:3]):.0f} °C", S.cold_s(min(tn[:3])), "0 °C = 0 ; −3 °C = 0,4 ; −8 °C = 1.", "0 °C = 0; −3 °C = 0.4; −8 °C = 1."),
            mk("weather.wind", "weather", "Rafales prévues (3 jours)", "Forecast gusts (3 days)", f"{max(gust[:3]):.0f} km/h", S.wind_s(max(gust[:3])), "60 km/h = 0 ; 80 = 0,4 ; 110 = 1.", "60 km/h = 0; 80 = 0.4; 110 = 1."),
            mk("weather.rain", "weather", "Pluie prévue en 24 h (3 jours)", "Forecast 24 h rain (3 days)", f"{max(rain[:3]):.0f} mm", S.rain_s(max(rain[:3])), "20 mm = 0 ; 40 = 0,5 ; 60 = 1.", "20 mm = 0; 40 = 0.5; 60 = 1.")]
    return out


# ---------------------------------------------------------------- vigilance (official), all départements, paged
def vigilance():
    base = "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/weatherref-france-vigilance-meteo-departement/records?"
    rows, off = [], 0
    while True:
        d, h = jget(base + urllib.parse.urlencode({"limit": 100, "offset": off}))
        rows += d["results"]
        off += 100
        if off >= d["total_count"]:
            break
    pub = max(r["product_datetime"] for r in rows)
    if (now() - datetime.fromisoformat(pub)).total_seconds() > 18 * 3600:
        raise RuntimeError("vigilance bulletin older than 18 h")
    by = {k: {"heat": [], "weather": [], "flood": []} for k in DEPS}
    for r in rows:
        dom = r["domain_id"]
        k = dom if dom in DEPS else dom[:-2] if dom.endswith("10") and dom[:-2] in DEPS else None
        if k:
            p = r["phenomenon"].lower()
            by[k]["heat" if "canicule" in p else "flood" if re.search(r"crue|inond", p) else "weather"].append(r)
    names = {"heat": T("Vigilance Météo-France : canicule", "Météo-France vigilance: heatwave"),
             "weather": T("Vigilance Météo-France : vent, pluie, orages, neige, froid", "Météo-France vigilance: wind, rain, storms, snow, cold"),
             "flood": T("Vigilance Météo-France : crues", "Météo-France vigilance: floods")}
    out = {}
    for k, g in by.items():
        out[k] = []
        for hz, rs in g.items():
            c = max([r["color_id"] for r in rs] + [1])  # no row for a phenomenon = green (rows exist only when in play)
            out[k].append(ind(f"vigilance.{hz}", hz, names[hz], T(S.COLORS[c][0], S.COLORS[c][1]), {1: 0, 2: 0.25, 3: 0.6, 4: 1.0}[c], 1.0, "vigilance",
                              "https://vigilance.meteofrance.fr", base, h, T("Vert 0 ; jaune 0,25 ; orange 0,6 ; rouge 1.", "Green 0; yellow 0.25; orange 0.6; red 1."),
                              official=True, floor={3: 50, 4: 80}.get(c, 0), pub=pub, area="dept"))
    return out


# ---------------------------------------------------------------- water restrictions (VigiEau at the main city of each département)
def vigieau():
    rank = {"vigilance": 1, "alerte": 2, "alerte_renforcee": 3, "crise": 4}

    def one(k):
        z, h = jget(f"https://api.vigieau.beta.gouv.fr/api/zones?lon={DEPS[k]['lon']}&lat={DEPS[k]['lat']}")
        top = max([rank.get(x.get("niveauGravite"), 0) for x in z] + [0])
        return k, ind("drought.restrictions", "drought", T("Restrictions d'eau (VigiEau, ville principale)", "Water restrictions (VigiEau, main city)"),
                      T(["aucune", "vigilance", "alerte", "alerte renforcée", "crise"][top], ["none", "watch", "alert", "heightened alert", "crisis"][top]),
                      [0, 0.15, 0.4, 0.7, 1.0][top], 1.0, "vigieau", "https://vigieau.gouv.fr", "https://api.vigieau.beta.gouv.fr/api/zones", h,
                      T("Vigilance 0,15 ; alerte 0,4 ; alerte renforcée 0,7 ; crise 1.", "Watch 0.15; alert 0.4; heightened 0.7; crisis 1."), official=True, area="dept")
    with ThreadPoolExecutor(8) as ex:
        return {k: [i] for k, i in ex.map(one, DEPS)}


# ---------------------------------------------------------------- fuel (stockout share among declaring stations, one group-by per measure)
def fuel():
    base = S.FUEL_URL + "?"
    since = (now() - timedelta(days=14)).strftime("%Y-%m-%d")
    out = {k: [] for k in DEPS}
    for f, name in (("gazole", "Diesel"), ("e10", "SP95-E10")):
        def cnt(w):
            q = base + urllib.parse.urlencode({"select": "code_departement, count(*) as n", "group_by": "code_departement", "where": w, "limit": 120})
            d, h = jget(q)
            return {r["code_departement"]: r["n"] for r in d["results"]}, h
        n, h1 = cnt(f'{f}_prix is not null or {f}_rupture_type="temporaire"')
        k_, h2 = cnt(f'{f}_rupture_type="temporaire" and {f}_rupture_debut >= date\'{since}\'')
        for k in DEPS:
            tot, bad = n.get(k, 0), k_.get(k, 0)
            if tot < 15:
                continue  # too few stations to say anything: that département stays unknown for fuel
            r = bad / tot
            out[k].append(ind(f"fuel.{f}", "fuel", T(f"Stations {name} en rupture", f"{name} stations out of stock"), T(f"{bad} / {tot} stations ({r:.1%})", f"{bad} / {tot} stations ({r:.1%})"),
                              S.fuel_s(r), 0.8, "fuel", S.FUEL_PAGE, base, h1 + h2,
                              T("Normal ≈ 8 %. 15 % = tension (0,5). 25 % = grave (1). Ruptures temporaires déclarées depuis 14 jours.", "Normal ≈ 8 %. 15 % = tension (0.5). 25 % = severe (1). Temporary stockouts declared in the last 14 days."), area="dept"))
    return out


# ---------------------------------------------------------------- Atmo France WFS: air quality index and pollen index (per commune -> p75 per département)
ATMO = "https://data.atmo-france.org/geoserver/%s/ows?"


def _atmo(ws, layer, day):
    q = ATMO % ws + urllib.parse.urlencode({
        "service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": f"{ws}:{layer}", "outputFormat": "csv",
        "cql_filter": f"date_ech='{day}' AND type_zone='commune'", "propertyName": "code_zone,code_qual,date_dif" + (",alerte" if ws == "ind_pol" else "")})
    t, h = get(q, timeout=90)
    best = {}
    for r in csv.DictReader(io.StringIO(t)):
        if r["code_qual"].strip() not in ("1", "2", "3", "4", "5", "6"):
            continue  # 0 / 7 = no data / event: never counted as a level
        c = r["code_zone"]
        if c not in best or r["date_dif"] > best[c]["date_dif"]:
            best[c] = r
    return best, q, h


def _per_dep(best, level):
    g = {}
    for c, r in best.items():
        k = dep_of(c)
        if k in DEPS:
            g.setdefault(k, []).append((int(r["code_qual"]), str(r.get("alerte", "")).lower() == "true"))
    return {k: (q75([v[0] for v in vs]), any(v[1] for v in vs), len(vs)) for k, vs in g.items()}


def air():
    day = paris_day()
    best, q, h = _atmo("ind", "ind_atmo", day)
    if len(best) < 5000:
        raise RuntimeError(f"only {len(best)} communes in the Atmo air index for {day}")
    lab = ["", "bon", "moyen", "dégradé", "mauvais", "très mauvais", "extrêmement mauvais"]
    lae = ["", "good", "moderate", "degraded", "poor", "very poor", "extremely poor"]
    res = _air_atmo(best, q, h, lab, lae)
    gap = [k for k in DEPS if k not in res]  # some regional agencies (Occitanie, Bretagne, Centre...) do not feed the national index: fall back to the CAMS model
    if gap:
        try:
            res.update(_air_model(gap))
        except Exception:
            pass
    return res


def _air_model(ks):
    aq = "https://air-quality-api.open-meteo.com/v1/air-quality?" + urllib.parse.urlencode({
        "latitude": ",".join(str(DEPS[k]["lat"]) for k in ks), "longitude": ",".join(str(DEPS[k]["lon"]) for k in ks),
        "hourly": "european_aqi", "forecast_days": 1, "timezone": "Europe/Paris"}, safe=",")
    rows, h = jget(aq)
    rows = rows if isinstance(rows, list) else [rows]
    out = {}
    for k, d in zip(ks, rows):
        v = [x for x in d["hourly"]["european_aqi"] if x is not None]
        if v:
            m = max(v)
            out[k] = [ind("air.eaqi", "air", T("Indice européen de qualité de l'air (modèle CAMS)", "European air-quality index (CAMS model)"), T(f"{m:.0f} / 100 (max du jour)", f"{m:.0f} / 100 (daily max)"),
                          interp(m, [(40, 0), (60, 0.3), (80, 0.6), (100, 1.0)]), 0.8, "aqom", "https://open-meteo.com/en/docs/air-quality-api", aq, h,
                          T("Indice européen : 40 = 0 ; 60 = 0,3 ; 80 = 0,6 ; 100 = 1. Modèle, pas une mesure : utilisé seulement là où l'indice ATMO n'est pas publié.", "European index: 40 = 0; 60 = 0.3; 80 = 0.6; 100 = 1. A model, not a measurement: used only where the ATMO index is not published."), area="dept")]
    return out


def _air_atmo(best, q, h, lab, lae):
    return {k: [ind("air.atmo", "air", T("Indice ATMO de qualité de l'air", "ATMO air-quality index"), T(f"{lab[lv]} ({lv}/6) · {n} communes", f"{lae[lv]} ({lv}/6) · {n} communes"),
                    (lv - 1) / 5, 0.8, "atmo", "https://www.atmo-france.org/", q, h,
                    T("Niveau 1 (bon) = 0 ; 2 = 0,2 ; 3 = 0,4 ; 4 = 0,6 ; 5 = 0,8 ; 6 = 1. 3ᵉ quartile des communes du département.", "Level 1 (good) = 0; 2 = 0.2; 3 = 0.4; 4 = 0.6; 5 = 0.8; 6 = 1. Third quartile of the département's communes."), area="dept")]
            for k, (lv, _, n) in _per_dep(best, "code_qual").items()}


def pollen():
    day = paris_day()
    best, q, h = _atmo("ind_pol", "ind_pol", day)
    if len(best) < 5000:
        raise RuntimeError(f"only {len(best)} communes in the Atmo pollen index for {day}")
    lab = ["", "très faible", "faible", "moyen", "élevé", "très élevé", "extrêmement élevé"]
    lae = ["", "very low", "low", "moderate", "high", "very high", "extremely high"]
    return {k: [ind("pollen.atmo", "pollen", T("Risque pollinique (indice ATMO)", "Pollen risk (ATMO index)"), T(f"{lab[lv]} ({lv}/6){' · alerte' if al else ''}", f"{lae[lv]} ({lv}/6){' · alert' if al else ''}"),
                    max((lv - 1) / 5, 0.6 if al else 0), 0.6, "pollen", "https://www.atmo-france.org/", q, h,
                    T("Niveau 1 = 0 ; 2 = 0,2 ; 3 = 0,4 ; 4 = 0,6 ; 5 = 0,8 ; 6 = 1. Une alerte pollen impose au moins 0,6.", "Level 1 = 0; 2 = 0.2; 3 = 0.4; 4 = 0.6; 5 = 0.8; 6 = 1. A pollen alert sets at least 0.6."), area="dept")]
            for k, (lv, al, n) in _per_dep(best, "code_qual").items()}


# ---------------------------------------------------------------- wildfire: Météo des forêts (Météo-France), seasonal bulletin
MDF = "https://meteofrance.s3.sbg.io.cloud.ovh.net/data/BULLETIN/MDF/mdf_%d.csv.gz"


def wildfire():
    y = now().year
    for yr in (y, y - 1):
        try:
            raw = urllib_get_bytes(MDF % yr)
            break
        except Exception:
            raw = None
    if raw is None:
        raise RuntimeError("Météo des forêts file not reachable")
    rows = list(csv.DictReader(io.StringIO(gzip.decompress(raw).decode("utf-8")), delimiter=";"))
    last = max(r["date"] for r in rows)
    cur = {r["num_dep"]: r for r in rows if r["date"] == last}
    age = (now() - datetime.strptime(last, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=S.UTC)).total_seconds() / 86400
    link, q = "https://meteofrance.com/meteo-des-forets", MDF % y
    out = {}
    for k in DEPS:
        if age > 4:  # the bulletin only runs in fire season: out of season = no risk published, said plainly
            out[k] = [ind("wildfire.mdf", "wildfire", T("Météo des forêts (risque feu de forêt)", "Météo des forêts (wildfire risk)"), T(f"hors saison (dernier bulletin le {last[:10]})", f"off season (last bulletin {last[:10]})"),
                          0.0, 1.0, "mdf", link, q, "", T("Le bulletin n'est publié qu'en saison des feux.", "The bulletin is only published during fire season."), official=True, pub=last, area="dept")]
            continue
        r = cur.get(k)
        if not r:
            continue
        lv = max(int(r["niveau_j1"]), int(r["niveau_j2"]))
        out[k] = [ind("wildfire.mdf", "wildfire", T("Météo des forêts (risque feu de forêt)", "Météo des forêts (wildfire risk)"), T(f"niveau {lv}/4 (aujourd'hui / demain)", f"level {lv}/4 (today / tomorrow)"),
                      {1: 0, 2: 0.25, 3: 0.6, 4: 1.0}[lv], 1.0, "mdf", link, q, "", T("Niveau 1 = 0 ; 2 = 0,25 ; 3 = 0,6 (plancher « Préparez-vous ») ; 4 = 1 (plancher « Agissez »).", "Level 1 = 0; 2 = 0.25; 3 = 0.6 (floor “Prepare”); 4 = 1 (floor “Act”)."),
                      official=True, floor={3: 50, 4: 80}.get(lv, 0), pub=last, area="dept")]
    return out


def urllib_get_bytes(url):
    import urllib.request
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": S.UA}), timeout=40) as r:
        return r.read(S.MAX_BYTES)


# ---------------------------------------------------------------- health: Santé publique France epidemic alert level per région (flu, bronchiolitis)
SPF = "https://odisse.santepubliquefrance.fr/api/explore/v2.1/catalog/datasets/ma_region_epidemies_hivernales_alertes/records?"


def health():
    d, h = jget(SPF + urllib.parse.urlencode({"select": "theme,date,reg,valeur", "order_by": "date desc", "limit": 100}))
    last = d["results"][0]["date"]
    rs = [r for r in d["results"] if r["date"] == last]
    if (now() - datetime.fromisoformat(last).replace(tzinfo=S.UTC)).days > 21:
        raise RuntimeError(f"epidemic alerts last published for week of {last}")
    lv = {}
    for r in rs:
        lv.setdefault(r["reg"], {})[r["theme"]] = int(r["valeur"])
    sc = {1: 0.0, 2: 0.5, 3: 0.7, 4: 0.3}  # 2 = pre-epidemic, 3 = epidemic, 4 = post-epidemic (inferred from history)
    nm = {"Grippe": ("grippe", "flu"), "Bronchiolite": ("bronchiolite", "bronchiolitis")}
    out = {}
    for k, v in DEPS.items():
        t = lv.get(v["reg"])
        if not t:
            continue
        out[k] = [ind(f"health.{th.lower()}", "health", T(f"Épidémie de {nm[th][0]} (alerte régionale SpF)", f"{nm[th][1].capitalize()} epidemic (regional SpF alert)"),
                      T(["", "pas d'alerte", "pré-épidémie", "épidémie", "post-épidémie"][x], ["", "no alert", "pre-epidemic", "epidemic", "post-epidemic"][x]), sc[x], 0.7, "spf",
                      "https://odisse.santepubliquefrance.fr/", SPF, h, T("Pas d'alerte 0 ; pré-épidémie 0,5 ; épidémie 0,7 ; post-épidémie 0,3 (pondéré 0,7). Une épidémie saisonnière ne dépasse pas « À surveiller ».", "No alert 0; pre-epidemic 0.5; epidemic 0.7; post-epidemic 0.3 (weighted 0.7). A seasonal epidemic never goes above “Be aware”."),
                      official=True, pub=last, area="region") for th, x in t.items()]
    return out


# ---------------------------------------------------------------- nuclear: ASNR incident notices (INES level read from each notice page)
ASNR_RSS = "https://reglementation-controle.asnr.fr/rss/avis-incidents-INB"
SITES = json.loads((HERE / "nuclear_sites.json").read_text())


def _norm(t):
    import unicodedata
    return unicodedata.normalize("NFD", t.lower()).encode("ascii", "ignore").decode()


def nuclear():
    from email.utils import parsedate_to_datetime
    txt, h = get(ASNR_RSS)
    items = []
    for it in S.parse_xml(txt).iter("item"):
        d = parsedate_to_datetime(it.findtext("pubDate"))
        if now() - d <= timedelta(days=30):
            items.append({"t": it.findtext("title") or "", "l": it.findtext("link") or "", "d": d, "x": _norm((it.findtext("title") or "") + " " + (it.findtext("description") or ""))})

    def ines(i):
        try:
            m = re.search(r"INES[^0-9]{0,120}?niveau\s*([0-7])|niveau\s*([0-7])[^.]{0,80}INES", get(i["l"])[0], re.S | re.I)
            return int(m.group(1) or m.group(2)) if m else 0
        except Exception:
            return 0  # level unreadable: counted as a notice, not as an escalation
    mine = {}
    for s in SITES:
        hit = [i for i in items if _norm(s["n"]) in i["x"]]
        if hit:
            mine.setdefault(s["dep"], []).extend((s["n"], i) for i in hit)
    with ThreadPoolExecutor(6) as ex:
        lv = dict(zip([id(i) for v in mine.values() for _, i in v], ex.map(ines, [i for v in mine.values() for _, i in v][:30])))
    out = {}
    for k in DEPS:
        hosts = sorted({s["n"] for s in SITES if s["dep"] == k})
        ev = mine.get(k, [])
        top = max([lv.get(id(i), 0) for _, i in ev] + [0])
        s_ = 0.0 if not ev else max(interp(top, [(0, 0.1), (1, 0.3), (2, 0.6), (3, 1.0)]), min(0.25, 0.05 * len(ev)))
        val = (f"{len(ev)} avis d'incident en 30 jours (INES max {top}) · " + ", ".join(hosts)) if ev else ("aucun avis d'incident en 30 jours · " + ", ".join(hosts) if hosts else "aucune installation nucléaire dans le département")
        vale = (f"{len(ev)} incident notices in 30 days (max INES {top}) · " + ", ".join(hosts)) if ev else ("no incident notice in 30 days · " + ", ".join(hosts) if hosts else "no nuclear site in the département")
        out[k] = [ind("nuclear.asnr", "nuclear", T("Installations nucléaires : avis d'incident ASNR", "Nuclear sites: ASNR incident notices"), T(val, vale), s_, 1.0, "asnr",
                      "https://reglementation-controle.asnr.fr/controle/actualites-du-controle/installations-nucleaires/avis-d-incident-des-installations-nucleaires", ASNR_RSS, h,
                      T("Avis des 30 derniers jours : INES 0 = 0,1 ; 1 = 0,3 ; 2 = 0,6 ; 3 et + = 1. Presque tous les avis sont de niveau 0 (sans conséquence).", "Notices of the last 30 days: INES 0 = 0.1; 1 = 0.3; 2 = 0.6; 3+ = 1. Almost all notices are level 0 (no consequence)."),
                      official=True, floor={2: 50, 3: 80}.get(top, 0) if ev else 0, pub=iso(max(i["d"] for _, i in ev)) if ev else None, area="dept")]
    return out


COLLECT = {"nuclear": nuclear, "weather": weather, "vigilance": vigilance, "vigieau": vigieau, "fuel": fuel, "air": air, "pollen": pollen, "wildfire": wildfire, "health": health}


def compute(national=None):
    """-> depts.json payload. `national`: state.json hazards (same level everywhere; shown as uniform layers)."""
    t = now()

    def one(item):
        try:
            return item[0], item[1](), None
        except Exception as e:  # one source down = its hazards unknown, never a crash
            return item[0], {}, f"{type(e).__name__}: {e}"[:200]
    with ThreadPoolExecutor(4) as ex:
        res = {n: (r, e) for n, r, e in ex.map(one, COLLECT.items())}
    deps, defs = {}, {}
    for k in DEPS:
        inds = [i for r, _ in res.values() for i in r.get(k, [])]
        row = {}
        for hz, cfg in CFG.items():
            hi = [i for i in inds if i["hazard"] == hz]
            if not hi:
                continue
            st = score.score_hazard(cfg, hi, None, t)
            top = max(hi, key=lambda i: i["s"] * i["w"])
            row[hz] = {"l": st["level"], "R": st["R"], "v": top["value"]}  # v = the value of the strongest measure (map tooltip)
            if hz in DETAIL:
                row[hz]["i"] = [[i["id"], i["value"], i["s"], i["pub"]] for i in hi]
            for i in hi:
                defs.setdefault(i["id"], {x: i[x] for x in ("hazard", "label", "w", "source", "link", "rule", "official", "floor", "kind", "area", "fam")})
        deps[k] = row
    errs = {n: e for n, (_, e) in res.items() if e}
    src = {}
    for col, ids in SRC_OF.items():
        for sid in ids:
            m = S.META[sid]
            src[sid] = {"name": SRC_NAME[sid][0], "link": SRC_NAME[sid][1], "ok": col not in errs, "err": errs.get(col), "n": 0, "last_ok": iso(t) if col not in errs else None,
                        "status": "current" if col not in errs else "down", "every": m["every"], "kind": m["kind"], "area": m["area"], "lic": m["lic"]}
    cfg = {h: {"domain": c["domain"], "impact": c["impact"], "src": c["sources"]} for h, c in CFG.items()}
    return {"generated": iso(t), "hazards": list(CFG), "cfg": cfg, "defs": defs, "deps": deps, "sources": src, "errors": errs}


SRC_OF = {"air": ["atmo", "aqom"], "pollen": ["pollen"], "wildfire": ["mdf"], "health": ["spf"], "nuclear": ["asnr"]}
SRC_NAME = {"atmo": ("Air quality index (ATMO France)", "https://www.atmo-france.org/"), "aqom": ("European air-quality index (Open-Meteo / CAMS)", "https://open-meteo.com/en/docs/air-quality-api"),
            "pollen": ("Pollen index (ATMO France)", "https://www.atmo-france.org/"), "mdf": ("Météo des forêts (Météo-France)", "https://meteofrance.com/meteo-des-forets"),
            "spf": ("Epidemic alerts (Santé publique France)", "https://odisse.santepubliquefrance.fr/"), "asnr": ("Nuclear incident notices (ASNR)", "https://reglementation-controle.asnr.fr/")}


def refresh(out, national=None):
    p = Path(out) / "depts.json"
    try:
        prev = json.loads(p.read_text())
        if now() - datetime.strptime(prev["generated"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=S.UTC) < MIN_GAP:
            return
    except Exception:
        pass
    p.write_text(json.dumps(compute(national), ensure_ascii=False, separators=(",", ":")))
