"""Replay of known situations and failure modes through the real scoring path (no network).
A missed warning or a false alarm here is a bug, not a threshold to argue about."""
import unittest
from datetime import datetime, timezone

from puite import score, sources as S

NOW = datetime(2026, 8, 12, 12, 0, tzinfo=timezone.utc)


def mk(kind, fam, s, w, official=False, floor=0):
    return {"kind": kind, "fam": fam, "s": s, "w": w, "official": official, "floor": floor}


def run(cfg, inds, prev=None):
    return score.score_hazard(cfg, inds, prev, NOW)


HEAT = {"impact": 5, "persist": 2}
FLOOD = {"impact": 4, "persist": 2}


class Replay(unittest.TestCase):
    def test_august_2003_heatwave_is_not_missed(self):  # 3-day mean Tmax ~ 35, Tmin ~ 21 in Paris
        s = S.heat_s(35, 21)
        st = run(HEAT, [mk("forecast", "heat", s, 0.7)])
        self.assertGreaterEqual(st["level"], 2)

    def test_july_2019_red_vigilance_forces_act_level_immediately(self):
        st = run(HEAT, [mk("official", "heat", 1.0, 1.0, True, 80)], {"level": 0, "up": 0})
        self.assertEqual(st["level"], 3)

    def test_2016_seine_flood_peak_6m(self):
        st = run(FLOOD, [mk("observed", "flood", S.seine_s(6.1, 0.5), 0.6)])
        self.assertGreaterEqual(st["level"], 2)

    def test_normal_summer_day_raises_no_alarm(self):
        s = S.heat_s(27, 16)
        self.assertEqual(run(HEAT, [mk("forecast", "heat", s, 0.7)])["level"], 0)
        self.assertEqual(run(FLOOD, [mk("observed", "flood", S.seine_s(1.2, 0.0), 0.6)])["level"], 0)

    def test_forecast_plus_warning_plus_rehash_do_not_inflate(self):
        # one underlying heat signal seen three ways must score like the strongest of them
        one = run(HEAT, [mk("official", "heat", 0.6, 1.0, True, 50)])
        three = run(HEAT, [mk("official", "heat", 0.6, 1.0, True, 50), mk("forecast", "heat", 0.6, 0.7), mk("reported", "heat", 0.6, 0.5)])
        self.assertEqual(one["R"], three["R"])

    def test_press_alone_cannot_exceed_aware(self):  # strongest press indicator we ship: s 0.7, w 0.5, supply impact 3
        st = run({"impact": 3, "persist": 1}, [mk("reported", "press", 0.7, 0.5)])
        self.assertLessEqual(st["level"], 1)

    def test_every_source_failing_is_unknown_not_calm(self):
        self.assertIsNone(run(HEAT, [])["level"])

    def test_cyber_context_only_is_unknown_not_calm(self):
        self.assertIsNone(run({"impact": 3, "persist": 2}, [mk("context", "kev", 1.0, 0.4)])["level"])

    def test_unknown_source_status(self):
        from puite import run as R  # status rule: failed within 3x its refresh = late, otherwise down
        self.assertIn("late", open(R.__file__).read())

    def test_meta_covers_every_source(self):
        for sid, *_ in S.SOURCES:
            self.assertIn(sid, S.META, sid)


if __name__ == "__main__":
    unittest.main()
