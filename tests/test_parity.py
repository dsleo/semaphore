"""The same scoring fixtures drive score.py here and docs/local.js in tests/local.test.js, so the two implementations cannot drift."""
import json
import unittest
from datetime import datetime, timezone
from pathlib import Path

from semaphore import run, score, sources

FIX = json.loads((Path(__file__).parent / "fixtures" / "scoring.json").read_text())
NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)


class Parity(unittest.TestCase):
    def test_scoring_cases(self):
        for c in FIX["cases"]:
            with self.subTest(c["name"]):
                cfg = dict(c["cfg"], persist=1)
                st = score.score_hazard(cfg, [dict(i) for i in c["inds"]], None, NOW)
                self.assertEqual(st["level"], c["level"])
                self.assertEqual(st["R"], c["R"])
                self.assertEqual(st["H"], c["H"])
                self.assertEqual(bool(st.get("capped")), bool(c.get("capped")))

    def test_heat_thresholds(self):
        for dep, thr in FIX["heat_thr"].items():
            self.assertEqual(list(sources.heat_thr(dep)), thr, dep)

    def test_browser_config_is_current(self):
        """docs/data/config.json (what docs/local.js scores with) is generated from semaphore/config.json: no drift, no second copy of the rules."""
        root = Path(__file__).parent.parent
        cfg = json.loads((root / "semaphore" / "config.json").read_text())
        pub = json.loads((root / "docs" / "data" / "config.json").read_text())
        self.assertEqual(pub, run.browser_config(cfg), "run `python3 -m semaphore` to regenerate docs/data/config.json")
        self.assertEqual(list(score.LEVEL_AT), cfg["levels"])
        for hz in ("heat", "weather", "fuel", "flood", "drought"):  # the hazards local.js computes
            self.assertIn(hz, pub["hazards"])

    def test_local_js_has_no_hardcoded_rules(self):
        js = (Path(__file__).parent.parent / "docs" / "local.js").read_text()
        for lit in ("[25, 50, 75]", "[31, 21]", "[34, 20]"):
            self.assertNotIn(lit, js, lit)

if __name__ == "__main__":
    unittest.main()
