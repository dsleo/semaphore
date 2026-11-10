"""Decide whether a data run is worth a commit. Every commit is permanent repository history (~140 KB of deltas), and at one run
per 15 minutes that is hundreds of MB a month. We commit when something that matters changed, and at least every MIN_MINUTES so
the site never looks stale. Prints "commit" or "skip"; the workflow acts on that.
Anything the scorer carries between runs (persistence counters, hysteresis timers) counts as a change, otherwise a rise could
never be confirmed over two runs."""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

MIN_MINUTES = int(os.environ.get("SHOULD_COMMIT_MIN_MINUTES", 30))  # raise (e.g. 60) in the workflow env to halve history growth
STATE = "docs/data/state.json"


def _t(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def decide(old, new, min_minutes=MIN_MINUTES):
    if not old:
        return True
    if (_t(new["generated"]) - _t(old["generated"])).total_seconds() >= min_minutes * 60:
        return True
    if old["headline"].get("level") != new["headline"].get("level") or old.get("coverage") != new.get("coverage"):
        return True
    if {a["id"] for a in old.get("alerts", [])} != {a["id"] for a in new.get("alerts", [])}:
        return True
    for hid, n in new["hazards"].items():
        o = old["hazards"].get(hid)
        if not o:
            return True
        if any(o.get(k) != n.get(k) for k in ("level", "cand", "up", "down_since", "capped")) or bool(o.get("held")) != bool(n.get("held")):
            return True
        if (n.get("R") or 0) - (o.get("R") or 0) >= 5:  # a rising peak would otherwise be lost from the daily memory
            return True
    return False


def main():
    new = json.load(open(STATE))
    try:
        old = json.loads(subprocess.run(["git", "show", f"HEAD:{STATE}"], capture_output=True, text=True, check=True).stdout)
    except Exception:
        old = None
    print("commit" if decide(old, new) else "skip")


if __name__ == "__main__":
    sys.exit(main())
