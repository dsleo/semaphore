"""Daily memory + trend rules. Plain statistics, no LLM.
memory.json: {"days": {"YYYY-MM-DD": {hazard: {"R": peak score, "lvl": peak level, "src": "live"|"recon"}}}}"""
import json
from datetime import datetime, timedelta
from pathlib import Path
from statistics import mean, pstdev

try:
    from zoneinfo import ZoneInfo
    PARIS = ZoneInfo("Europe/Paris")
except Exception:  # no tz database: fall back to UTC days
    PARIS = None

KEEP_DAYS = 400
WINDOW = 30
BASE_DAYS = 60   # an "unusual" label needs a real baseline; 2 weeks says nothing about a season
LOOKBACK = 120


def day_of(t):
    return (t.astimezone(PARIS) if PARIS else t).strftime("%Y-%m-%d")


def load(path):
    try:
        m = json.loads(Path(path).read_text())
        if isinstance(m.get("days"), dict):
            return m
    except Exception:
        pass
    return {"days": {}}


def save(path, mem):
    keep = sorted(mem["days"])[-KEEP_DAYS:]
    mem["days"] = {d: mem["days"][d] for d in keep}
    Path(path).write_text(json.dumps(mem, separators=(",", ":"), sort_keys=True))


def record(mem, day, hazards):
    """Store today's peak per hazard. A live reading always replaces a reconstructed one."""
    e = mem["days"].setdefault(day, {})
    for hid, h in hazards.items():
        if h["level"] is None:
            continue
        old = e.get(hid)
        R, lvl = h["R"], h["level"]
        if old and old["src"] == "live":
            R, lvl = max(old["R"], R), max(old["lvl"], lvl)
        e[hid] = {"R": R, "lvl": lvl, "src": "live"}


def series(mem, hids, today, n=WINDOW):
    """Last n days (oldest first) as [date, R|None, level|None, src|None]; peak over `hids`."""
    out = []
    for k in range(n - 1, -1, -1):
        d = (datetime.strptime(today, "%Y-%m-%d") - timedelta(days=k)).strftime("%Y-%m-%d")
        rows = [mem["days"].get(d, {}).get(h) for h in hids]
        rows = [r for r in rows if r]
        if not rows:
            out.append([d, None, None, None])
        else:
            src = "live" if any(r["src"] == "live" for r in rows) else "recon"
            out.append([d, max(r["R"] for r in rows), max(r["lvl"] for r in rows), src])
    return out


def analyse(ser):
    """Trend, calm streak and anomaly for one series. Says 'nodata' rather than guessing."""
    R = [r[1] for r in ser]
    known = [x for x in R if x is not None]
    last, base = [x for x in R[-3:] if x is not None], [x for x in R[-10:-3] if x is not None]
    trend, diff = "nodata", None
    if last and len(base) >= 3:
        diff = round(mean(last) - mean(base), 1)
        trend = "rising" if diff >= 5 else "easing" if diff <= -5 else "stable"
    calm = 0
    for r in reversed(ser):
        if r[2] is None and calm == 0 and r is ser[-1]:
            continue  # today not recorded yet: count from the latest known day
        if r[2] != 0:
            break
        calm += 1
    hist = [x for x in R[:-3] if x is not None]
    z = None
    if last and len(hist) >= BASE_DAYS:
        z = round((mean(last) - mean(hist)) / max(pstdev(hist), 5.0), 1)
    return {"trend": trend, "diff": diff, "calm": calm, "z": z, "unusual": z is not None and z >= 2,
            "n": len(known), "base": len(hist), "recon": sum(1 for r in ser if r[3] == "recon"), "series": ser}


def trends(mem, cfgs, today):
    """One entry per cluster (= domain), plus 'all' for the whole city."""
    clusters = {}
    for hid, c in cfgs.items():
        clusters.setdefault(c["domain"], []).append(hid)
    def one(hs):
        a = analyse(series(mem, hs, today, LOOKBACK))
        a["series"] = a["series"][-WINDOW:]  # analysed over LOOKBACK days, 30 shipped to the page
        return dict(a, hazards=hs)
    out = {d: one(hs) for d, hs in clusters.items()}
    out["all"] = one(list(cfgs))
    return out
