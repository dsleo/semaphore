import unittest
from datetime import datetime, timedelta, timezone

from semaphore import score
from semaphore.sources import interp

NOW = datetime(2026, 11, 3, 12, 0, tzinfo=timezone.utc)


def I(s, w=0.8, official=False, floor=0):
    return {"s": s, "w": w, "official": official, "floor": floor}


CFG = {"impact": 4, "persist": 2}


class T(unittest.TestCase):
    def test_interp(self):
        pts = [(0.1, 0), (0.2, 1)]
        self.assertEqual(interp(0, pts), 0)
        self.assertAlmostEqual(interp(0.15, pts), 0.5)
        self.assertEqual(interp(9, pts), 1)

    def test_noisy_or_corroborates(self):
        one = score.hazard_H([I(0.5)])
        two = score.hazard_H([I(0.5), I(0.5)])
        self.assertAlmostEqual(one, 40)
        self.assertGreater(two, one)
        self.assertLess(two, 100)

    def test_levels(self):
        self.assertEqual([score.level_of(x) for x in (0, 24.9, 25, 50, 75, 100)], [0, 0, 1, 2, 3, 3])

    def test_cold_start_takes_candidate(self):
        st = score.score_hazard(CFG, [I(1.0, 1.0)], None, NOW)
        self.assertEqual(st["level"], 3)

    def test_persistence_holds_first_rise(self):
        prev = {"level": 0, "up": 0}
        st = score.score_hazard(CFG, [I(1.0, 0.8)], prev, NOW)
        self.assertEqual((st["level"], st["held"]["why"]), (0, "persistence"))
        st2 = score.score_hazard(CFG, [I(1.0, 0.8)], st, NOW)
        self.assertEqual(st2["level"], st2["cand"])

    def test_official_bypasses_persistence(self):
        st = score.score_hazard(CFG, [I(1.0, 1.0, official=True, floor=80)], {"level": 0, "up": 0}, NOW)
        self.assertEqual(st["level"], 3)

    def test_hysteresis_steps_down_one_level_after_6h(self):
        prev = {"level": 3, "up": 0, "down_since": None}
        st = score.score_hazard(CFG, [I(0.0)], prev, NOW)
        self.assertEqual((st["level"], st["held"]["why"]), (3, "hysteresis"))
        prev["down_since"] = (NOW - timedelta(hours=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
        st = score.score_hazard(CFG, [I(0.0)], prev, NOW)
        self.assertEqual(st["level"], 2)

    def test_demand_sensitive_capped_without_official(self):
        cfg = {"impact": 5, "persist": 1, "demand_sensitive": True}
        st = score.score_hazard(cfg, [I(1.0, 1.0), I(1.0, 1.0)], None, NOW)
        self.assertEqual((st["level"], st["capped"]), (2, True))

    def test_no_data_is_unknown_not_ok(self):
        self.assertIsNone(score.score_hazard(CFG, [], None, NOW)["level"])

    def test_headline_systemic(self):
        hz = {"a": {"level": 2, "R": 55}, "b": {"level": 2, "R": 60}, "c": {"level": 0, "R": 1}}
        cf = {"a": {"domain": "x"}, "b": {"domain": "y"}, "c": {"domain": "z"}}
        h = score.headline(hz, cf)
        self.assertTrue(h["systemic"])
        self.assertEqual((h["level"], h["score"], h["top"]), (2, 60, ["b", "a"]))

    def test_same_family_counts_once(self):  # a forecast + the warning built on it + the news repeating it
        fam = [dict(I(0.6), fam="x"), dict(I(0.6), fam="x"), dict(I(0.6), fam="x")]
        self.assertAlmostEqual(score.hazard_H(fam), score.hazard_H([I(0.6)]))
        self.assertGreater(score.hazard_H([dict(I(0.6), fam="x"), dict(I(0.6), fam="y")]), score.hazard_H(fam))

    def test_context_is_never_scored_and_alone_is_unknown(self):
        ctx = dict(I(1.0, 1.0), kind="context")
        self.assertEqual(score.hazard_H([ctx]), 0)
        self.assertIsNone(score.score_hazard(CFG, [ctx], None, NOW)["level"])
        self.assertEqual(score.hazard_H([ctx, I(0.5)]), score.hazard_H([I(0.5)]))

    def test_two_domains_is_a_fact_not_a_bonus(self):
        hz = {"a": {"level": 2, "R": 55}, "b": {"level": 2, "R": 60}}
        h = score.headline(hz, {"a": {"domain": "x"}, "b": {"domain": "y"}})
        self.assertEqual((h["systemic"], h["score"]), (True, 60))

    def test_held_rise_does_not_show_a_score_from_a_higher_band(self):
        s = {"level": 0, "R": 46.0}
        self.assertLess(score.shown_R(s), 25)
        self.assertEqual(score.shown_R({"level": 3, "R": 91.0}), 91.0)
        self.assertEqual(score.shown_R({"level": None, "R": None}), None)
        h = score.headline({"a": s}, {"a": {"domain": "x"}})
        self.assertEqual((h["level"], h["score"]), (0, 25))


if __name__ == "__main__":
    unittest.main()
