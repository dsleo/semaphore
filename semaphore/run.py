"""Collect → score → write static JSON. Usage: python3 -m semaphore [--out docs/data] [--serve]"""
import argparse
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import depts, local, memory, places, score, sources

HERE = Path(__file__).parent


def load(path, default):
    try:
        return json.loads(Path(path).read_text())
    except Exception:
        return default


def collect():
    def one(s):
        sid, _, _, fn = s
        try:
            inds, ctx = fn()
            bad = [i["id"] for i in inds if i["source"] != sid]
            assert not bad, f"indicator source id mismatch: {bad}"
            return sid, {"ok": True, "inds": inds, "ctx": ctx}
        except Exception as e:  # a failing source must never stop the run
            return sid, {"ok": False, "err": f"{type(e).__name__}: {e}"[:240]}
    with ThreadPoolExecutor(6) as ex:
        return dict(ex.map(one, sources.SOURCES))


def main(out="docs/data"):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    cfg = json.loads((HERE / "config.json").read_text())
    prev = load(out / "state.json", {})
    hist = load(out / "history.json", [])
    t = sources.now()
    res = collect()

    srcs, ctx = {}, {}
    for sid, name, link, _ in sources.SOURCES:
        r = res[sid]
        old = prev.get("sources", {}).get(sid, {})
        last = sources.iso(t) if r["ok"] else old.get("last_ok")
        every = sources.META[sid]["every"]
        late = last and (t - sources.datetime.strptime(last, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=sources.UTC)).total_seconds() / 60 <= 3 * every
        srcs[sid] = {"name": name, "link": link, "ok": r["ok"], "err": r.get("err"), "n": len(r.get("inds", [])), "last_ok": last,
                     "status": "current" if r["ok"] else "late" if late else "down",  # late = failed, but within 3x its expected refresh
                     "every": every, "kind": sources.META[sid]["kind"], "area": sources.META[sid]["area"], "lic": sources.META[sid]["lic"]}
        if r["ok"]:
            ctx.update(r["ctx"])

    hazards = {}
    for hid, hc in cfg["hazards"].items():
        inds = [i for r in res.values() if r["ok"] for i in r["inds"] if i["hazard"] == hid]
        st = score.score_hazard(hc, inds, prev.get("hazards", {}).get(hid), t)
        st["domain"] = hc["domain"]
        st["missing"] = [s for s in hc["sources"] if s in res and not res[s]["ok"]]
        st["indicators"] = sorted(inds, key=lambda i: -i["s"] * i["w"])
        hazards[hid] = st
        old = prev.get("hazards", {}).get(hid, {}).get("level")
        if old is not None and st["level"] is not None and old != st["level"]:
            hist.append({"ts": sources.iso(t), "hazard": hid, "from": old, "to": st["level"], "R": st["R"],
                         "why": [{"label": i["label"], "value": i["value"]} for i in st["indicators"][:3] if i["s"] > 0]})

    today = memory.day_of(t)
    mem = memory.load(out / "memory.json")
    memory.record(mem, today, hazards)
    memory.save(out / "memory.json", mem)

    ok = sum(r["ok"] for r in res.values())
    cov = {"ok": ok, "late": sum(v["status"] == "late" for v in srcs.values()), "down": sum(v["status"] == "down" for v in srcs.values()), "total": len(res)}
    # official alerts stay official alerts: listed apart, with who/where/when, not just another weighted input
    alerts = sorted(({k: i[k] for k in ("id", "label", "value", "s", "floor", "source", "link", "area", "pub", "fetched")}
                     for r in res.values() if r["ok"] for i in r["inds"] if i["official"] and i["s"] > 0), key=lambda a: -a["s"])
    local.refresh(out)  # news-local / roads / transit: each collector fails alone
    try:
        depts.refresh(out)  # per-département scoring (heatmap + commune view), at most hourly
    except Exception as e:
        print("  depts not refreshed:", type(e).__name__, e)
    try:
        places.refresh(out)
    except Exception as e:
        print("  places not refreshed:", type(e).__name__)
    state = {"generated": sources.iso(t), "repo": cfg.get("repo", ""), "shadow": cfg.get("shadow", False),
             "coverage": cov, "alerts": alerts, "headline": score.headline(hazards, cfg["hazards"]),
             "hazards": hazards, "trends": memory.trends(mem, cfg["hazards"], today), "sources": srcs, "context": ctx}
    (out / "state.json").write_text(json.dumps(state, ensure_ascii=False, indent=1))
    (out / "history.json").write_text(json.dumps(hist[-500:], ensure_ascii=False, indent=1))
    h = state["headline"]
    print(f"{state['generated']} sources {ok}/{len(res)} headline level={h['level']} score={h['score']} top={h['top']}")
    for sid, s in srcs.items():
        if not s["ok"]:
            print(f"  FAIL {sid}: {s['err']}")


def cli():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="docs/data")
    ap.add_argument("--serve", action="store_true", help="then serve docs/ on http://localhost:8000")
    a = ap.parse_args()
    main(a.out)
    if a.serve:
        import functools
        import http.server
        print("http://localhost:8000  (Ctrl-C to stop)")
        http.server.ThreadingHTTPServer(("", 8000), functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(Path(a.out).parent))).serve_forever()
