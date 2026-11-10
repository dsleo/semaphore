import copy
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("should_commit", Path(__file__).parent.parent / "scripts" / "should_commit.py")
sc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sc)

OLD = {"generated": "2026-01-01T10:00:00Z", "headline": {"level": 0}, "coverage": {"ok": 15, "late": 0, "down": 0}, "alerts": [],
       "hazards": {"heat": {"level": 0, "cand": 0, "up": 0, "down_since": None, "capped": False, "held": None, "R": 10}}}


def new(**kw):
    n = copy.deepcopy(OLD)
    for k, v in kw.items():
        if k == "heat":
            n["hazards"]["heat"].update(v)
        else:
            n[k] = v
    return n


class Policy(unittest.TestCase):
    def test_first_run_commits(self):
        self.assertTrue(sc.decide(None, OLD))

    def test_quiet_run_within_window_is_skipped(self):
        self.assertFalse(sc.decide(OLD, new(generated="2026-01-01T10:15:00Z", heat={"R": 12})))

    def test_commits_after_the_window(self):
        self.assertTrue(sc.decide(OLD, new(generated="2026-01-01T10:31:00Z")))

    def test_level_change_commits(self):
        self.assertTrue(sc.decide(OLD, new(generated="2026-01-01T10:15:00Z", heat={"level": 1})))

    def test_persistence_counter_commits(self):
        """A pending rise (up=1) must be saved, or it could never be confirmed on the next run."""
        self.assertTrue(sc.decide(OLD, new(generated="2026-01-01T10:15:00Z", heat={"up": 1, "cand": 1})))

    def test_new_official_alert_commits(self):
        self.assertTrue(sc.decide(OLD, new(generated="2026-01-01T10:15:00Z", alerts=[{"id": "vigilance.heat"}])))

    def test_source_going_down_commits(self):
        self.assertTrue(sc.decide(OLD, new(generated="2026-01-01T10:15:00Z", coverage={"ok": 14, "late": 0, "down": 1})))

    def test_score_jump_commits(self):
        self.assertTrue(sc.decide(OLD, new(generated="2026-01-01T10:15:00Z", heat={"R": 16})))

    def test_min_minutes_is_an_argument_and_the_default_is_30(self):
        later = new(generated="2026-01-01T10:45:00Z", heat={"R": 12})
        self.assertTrue(sc.decide(OLD, later))                       # 45 min >= default 30
        self.assertFalse(sc.decide(OLD, later, min_minutes=60))      # a longer floor skips it


if __name__ == "__main__":
    unittest.main()
