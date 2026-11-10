"""Scoring: deterministic rules, no LLM. Pure functions, easy to test."""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

UTC = timezone.utc
LEVEL_AT = tuple(json.loads((Path(__file__).parent / "config.json").read_text())["levels"])  # R thresholds for yellow / orange / red (config.json; the browser reads the same numbers)
DOWN_HOURS = 6


def level_of(r):
    return sum(r >= t for t in LEVEL_AT)


def hazard_H(inds):
    """Noisy-OR across evidence *families*. Indicators of one family restate the same signal (a forecast and the
    warning built on it, two readings of one feed): only the strongest counts. "context" items are shown, never scored. 0..100."""
    best = {}
    for i in inds:
        if i.get("kind") == "context":
            continue
        k = i.get("fam") or id(i)
        best[k] = max(best.get(k, 0.0), max(0.0, min(1.0, i["w"] * i["s"])))
    p = 1.0
    for v in best.values():
        p *= 1 - v
    return 100 * (1 - p)


def shown_R(s):
    """Score as displayed: never above the band of the displayed level (a rise still held back by persistence keeps its old level)."""
    r = s["R"]
    return r if r is None or s["level"] is None or s["level"] >= 3 else min(r, LEVEL_AT[s["level"]] - 0.1)


def impact_mult(impact):
    return 0.6 + 0.1 * (impact - 1)


def _parse(t):
    return datetime.strptime(t, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC) if t else None


def _iso(d):
    return d.strftime("%Y-%m-%dT%H:%M:%SZ")


def score_hazard(cfg, inds, prev, now):
    """Return hazard state. `prev` is the previous state of this hazard (or None)."""
    if not [i for i in inds if i.get("kind") != "context"]:  # nothing scored = unknown, never "all clear"
        return {"level": None, "R": None, "H": None, "cand": None, "held": None, "up": 0, "down_since": None}
    H = hazard_H(inds)
    floor = max([i.get("floor", 0) for i in inds] + [0])
    R = max(H * impact_mult(cfg["impact"]), floor)
    cand = level_of(R)
    official = any(i.get("official") and i["s"] > 0 for i in inds)
    capped = False
    if cfg.get("demand_sensitive") and cand == 3 and not official:
        cand, capped = 2, True  # never trigger a public run on fuel/food without an official source
    pl = prev.get("level") if prev else None
    up = prev.get("up", 0) if prev else 0
    ds = _parse(prev.get("down_since")) if prev else None
    held = None
    if pl not in (0, 1, 2, 3):
        level, up, ds = cand, 0, None
    elif cand > pl:
        ds, up = None, up + 1
        if official or up >= cfg.get("persist", 2):
            level, up = cand, 0
        else:
            level, held = pl, {"why": "persistence", "need": cfg.get("persist", 2), "have": up}
    elif cand < pl:
        up = 0
        ds = ds or now
        if now - ds >= timedelta(hours=DOWN_HOURS):
            level = pl - 1
            ds = now if level > cand else None
        else:
            level, held = pl, {"why": "hysteresis", "since": _iso(ds), "hours": DOWN_HOURS}
    else:
        level, up, ds = pl, 0, None
    return {"level": level, "R": round(R, 1), "H": round(H, 1), "cand": cand, "held": held,
            "capped": capped, "up": up, "down_since": _iso(ds) if ds else None}


def headline(hazards, cfgs):
    """City level = worst hazard. `systemic` is a plain fact (two domains >= orange); it adds nothing to the score."""
    known = {h: s for h, s in hazards.items() if s["level"] is not None}
    if not known:
        return {"level": None, "score": None, "systemic": False, "top": []}
    top = sorted((h for h, s in known.items() if s["level"] >= 1), key=lambda h: (-known[h]["level"], -known[h]["R"]))
    worst = max(s["level"] for s in known.values())
    doms = {cfgs[h]["domain"] for h, s in known.items() if s["level"] >= 2}
    best = max(shown_R(s) for s in known.values())
    score = round(best)
    return {"level": worst, "score": score, "systemic": len(doms) >= 2, "top": top}
