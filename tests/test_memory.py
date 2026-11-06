import unittest
from puite import memory


def ser(rs, lv=None):
    return [[f"d{i}", r, (lv[i] if lv else (None if r is None else int(r >= 25))), "live" if r is not None else None] for i, r in enumerate(rs)]


class Trend(unittest.TestCase):
    def test_rising(self):
        a = memory.analyse(ser([0] * 20 + [0, 0, 0, 0, 0, 0, 0, 30, 40, 50]))
        self.assertEqual(a["trend"], "rising"); self.assertEqual(a["calm"], 0)

    def test_easing_and_calm_streak(self):
        a = memory.analyse(ser([40] * 20 + [40, 40, 40, 40, 40, 40, 40, 0, 0, 0], [1] * 27 + [0, 0, 0]))
        self.assertEqual(a["trend"], "easing"); self.assertEqual(a["calm"], 3)

    def test_no_data_is_not_stable(self):
        self.assertEqual(memory.analyse(ser([None] * 29 + [0]))["trend"], "nodata")

    def test_unusual_needs_history(self):
        self.assertFalse(memory.analyse(ser([0] * 27 + [60, 60, 60]))["unusual"])  # 4 weeks is not a baseline
        self.assertTrue(memory.analyse(ser([0] * 67 + [60, 60, 60]))["unusual"])

    def test_live_replaces_recon_and_keeps_peak(self):
        m = {"days": {"2026-01-01": {"fuel": {"R": 5, "lvl": 0, "src": "recon"}}}}
        memory.record(m, "2026-01-01", {"fuel": {"level": 1, "R": 30}})
        memory.record(m, "2026-01-01", {"fuel": {"level": 0, "R": 10}})
        self.assertEqual(m["days"]["2026-01-01"]["fuel"], {"R": 30, "lvl": 1, "src": "live"})

    def test_day_boundary_follows_paris_time_across_dst(self):
        from datetime import datetime, timezone
        U = lambda *a: datetime(*a, tzinfo=timezone.utc)
        self.assertEqual(memory.day_of(U(2026, 7, 1, 22, 30)), "2026-07-02")    # summer: UTC+2
        self.assertEqual(memory.day_of(U(2026, 12, 1, 22, 30)), "2026-12-01")   # winter: UTC+1
        self.assertEqual(memory.day_of(U(2026, 3, 28, 23, 30)), "2026-03-29")   # night of the spring change
        self.assertEqual(memory.day_of(U(2026, 10, 24, 22, 30)), "2026-10-25")  # night of the autumn change


if __name__ == "__main__":
    unittest.main()
