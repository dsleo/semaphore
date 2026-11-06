"""Rebuild past days from public archives: python3 -m puite.backfill [days=30]
Reconstructed days are marked src="recon" and never overwrite a live reading. Honest limits:
 - fuel: the feed only holds stations *currently* in stockout, so past ratios are lower bounds;
 - weather: uses observed values (the live collector uses forecasts);
 - cyber is not backfilled: CISA KEV is context only, not a score input;
 - no archive exists for VigiEau, IODA, RansomLook or our probes: those days stay empty ("no data").
Weights come from the latest live state.json so thresholds and weights are never duplicated."""
import json
import sys
import urllib.parse
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

from . import memory, score, sources as S

HERE = Path(__file__).parent
OUT = Path("docs/data")


def days(n):
    t = S.now().date()
    return [(t - timedelta(days=k)).isoformat() for k in range(n, 0, -1)]  # yesterday and back, oldest first


def fuel_hist(ds):
    deps = "code_departement in (%s)" % ",".join('"%s"' % d for d in S.IDF)
    out = defaultdict(dict)
    for f in ("gazole", "e10"):
        n, _, _ = S._count(f'({deps}) and ({f}_prix is not null or {f}_rupture_type="temporaire")')
        q = S.FUEL_URL + "?" + urllib.parse.urlencode({
            "select": f"date_format({f}_rupture_debut,'yyyy-MM-dd') as d, count(*) as k",
            "where": f'({deps}) and {f}_rupture_type="temporaire" and {f}_rupture_debut >= date\'{(S.now() - timedelta(days=len(ds) + 15)).date()}\'',
            "group_by": f"date_format({f}_rupture_debut,'yyyy-MM-dd')", "limit": 200})
        rows = S.jget(q)[0]["results"]
        starts = {}
        for r in rows:
            vals = list(r.values())  # [date, count] whatever the alias is called
            starts[str(vals[0])] = vals[-1]
        for d in ds:
            day = datetime.fromisoformat(d)
            k = sum(starts.get((day - timedelta(days=j)).date().isoformat(), 0) for j in range(14))
            out[d][f"fuel.{f}"] = S.fuel_s(k / n)
    return out


def weather_hist(ds):
    a, b = (datetime.fromisoformat(ds[0]) - timedelta(days=2)).date(), ds[-1]
    D = S.jget("https://archive-api.open-meteo.com/v1/archive?latitude=48.85&longitude=2.35&timezone=Europe%2FParis"
               f"&start_date={a}&end_date={b}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max")[0]["daily"]
    ix = {d: i for i, d in enumerate(D["time"])}
    v = lambda k, i: D[k][i] if D[k][i] is not None else 0
    out = defaultdict(dict)
    for d in ds:
        i = ix.get(d)
        if i is None or i < 2:
            continue
        mx = sum(v("temperature_2m_max", j) for j in range(i - 2, i + 1)) / 3
        mn = sum(v("temperature_2m_min", j) for j in range(i - 2, i + 1)) / 3
        out[d]["heat.forecast"] = max(S.heat_s(mx, mn), S.heat_day_s(v("temperature_2m_max", i)))
        out[d]["weather.cold"] = S.cold_s(v("temperature_2m_min", i))
        out[d]["weather.wind"] = S.wind_s(v("wind_gusts_10m_max", i))
        out[d]["weather.rain"] = S.rain_s(v("precipitation_sum", i))
    return out


def seine_hist(ds):  # Hub'Eau real-time data only goes back about a month
    since = f"{max(ds[0], (S.now() - timedelta(days=29)).date().isoformat())}T00:00:00Z"
    rows = S.jget("https://hubeau.eaufrance.fr/api/v2/hydrometrie/observations_tr?code_entite=F700000103&grandeur_hydro=H"
                  f"&size=20000&sort=asc&date_debut_obs={since}&fields=date_obs,resultat_obs")[0]["data"]
    last = {}
    for r in rows:
        last[r["date_obs"][:10]] = r["resultat_obs"] / 1000  # last reading of each day, mm -> m
    out, prev = defaultdict(dict), None
    for d in sorted(last):
        if prev is not None and d in ds:
            out[d]["flood.seine"] = S.seine_s(last[d], last[d] - prev)
        prev = last[d]
    return out


def ecowatt_hist(ds):
    q = S.ODRE + "nouveau_signal_ecowatt/records?" + urllib.parse.urlencode(
        {"limit": 100, "order_by": "date asc", "where": f"date >= date'{ds[0]}'"})
    out = defaultdict(dict)
    for r in S.jget(q)[0]["results"]:
        if r["date"] in ds:
            c = int(r["couleur_du_jour"])
            out[r["date"]]["power.ecowatt"] = S.ECO_S.get(c, 0)
            out[r["date"]]["_floor"] = S.ECO_FLOOR.get(c, 0)
    return out


def kev_hist(ds):
    v = S.jget(S.KEV)[0]["vulnerabilities"]
    out = defaultdict(dict)
    for d in ds:
        day = datetime.fromisoformat(d)
        cut = lambda n: (day - timedelta(days=n)).date().isoformat()
        w7 = [x for x in v if cut(7) < x["dateAdded"] <= d]
        w3 = [x for x in v if cut(3) < x["dateAdded"] <= d]
        out[d]["cyber.kev7"] = S.kev7_s(len(w7))
        out[d]["cyber.kev_ransom"] = S.kev_ransom_s(sum(x.get("knownRansomwareCampaignUse") == "Known" for x in w7))
        out[d]["cyber.kev_edge"] = S.kev_edge_s(sum(any(k in x["vendorProject"].lower() for k in S.WATCH) for x in w3))
    return out


def main(n=30, out=OUT):
    cfg = json.loads((HERE / "config.json").read_text())["hazards"]
    state = json.loads((out / "state.json").read_text()) if (out / "state.json").exists() else {}
    w = {i["id"]: i["w"] for h in state.get("hazards", {}).values() for i in h.get("indicators", [])}
    mem = memory.load(out / "memory.json")
    ds = days(n)
    s = defaultdict(lambda: defaultdict(dict))
    for name, fn in (("fuel", fuel_hist), ("weather", weather_hist), ("seine", seine_hist), ("ecowatt", ecowatt_hist)):
        try:
            for d, m in fn(ds).items():
                s[d].update(m)
            print("ok  ", name)
        except Exception as e:
            print("FAIL", name, type(e).__name__, str(e)[:120])
    for dd in mem["days"].values():  # cyber is no longer scored from CISA KEV: drop the history built that way
        if dd.get("cyber", {}).get("src") == "recon":
            del dd["cyber"]
    added = 0
    for d in ds:
        for hid, hc in cfg.items():
            inds = [{"s": v, "w": w.get(i, 0.7), "fam": hid} for i, v in s[d].items() if i.split(".")[0] == hid]
            if not inds:
                continue
            R = max(score.hazard_H(inds) * score.impact_mult(hc["impact"]), s[d].get("_floor", 0) if hid == "power" else 0)
            if mem["days"].get(d, {}).get(hid, {}).get("src") == "live":
                continue  # never overwrite a live reading
            mem["days"].setdefault(d, {})[hid] = {"R": round(R, 1), "lvl": score.level_of(R), "src": "recon"}
            added += 1
    memory.save(out / "memory.json", mem)
    print(f"backfilled {added} hazard-days over {n} days -> {out / 'memory.json'}")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 30)
