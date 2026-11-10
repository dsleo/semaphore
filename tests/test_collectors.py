"""Collectors and hardening, with the network mocked: no test here touches the internet."""
import unittest
from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from semaphore import depts, local, sources as S


def forecast(**over):
    D = {"time": [f"2026-07-0{i}" for i in range(1, 8)], "temperature_2m_max": [30] * 7, "temperature_2m_min": [18] * 7,
         "wind_gusts_10m_max": [40] * 7, "precipitation_sum": [0] * 7}
    D.update(over)
    return D


class Weather(unittest.TestCase):
    def test_missing_temperature_is_unavailable_not_zero(self):
        with mock.patch.object(S, "jget", return_value=({"daily": forecast(temperature_2m_max=[30, None] + [30] * 5)}, "h")):
            with self.assertRaises(RuntimeError):
                S.weather()

    def test_missing_gust_in_scored_window_fails_but_far_day_does_not(self):
        with self.assertRaises(RuntimeError):
            S.forecast_series(forecast(wind_gusts_10m_max=[None] + [40] * 6))
        tx, tn, g, r = S.forecast_series(forecast(wind_gusts_10m_max=[40] * 6 + [None]))
        self.assertEqual(g[-1], 0)

    def test_complete_forecast_scores(self):
        with mock.patch.object(S, "jget", return_value=({"daily": forecast()}, "h")):
            inds, _ = S.weather()
        self.assertEqual({i["id"] for i in inds}, {"heat.forecast", "weather.cold", "weather.wind", "weather.rain"})


class Xml(unittest.TestCase):
    def test_entity_declarations_are_refused(self):
        bomb = '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]><rss><channel>&b;</channel></rss>'
        with self.assertRaises(ValueError):
            S.parse_xml(bomb)

    def test_plain_feed_parses(self):
        self.assertEqual(S.parse_xml("<rss><channel><item><title>x</title></item></channel></rss>").findtext(".//title"), "x")

    def test_oversized_response_is_refused(self):
        class R:
            def __enter__(s): return s
            def __exit__(s, *a): pass
            def read(s, n): return b"x" * n
        with mock.patch("urllib.request.urlopen", return_value=R()):
            with self.assertRaises(ValueError):
                S.get("https://example.org/big")


class LocalNewsLinks(unittest.TestCase):
    def test_only_http_links_are_published(self):
        now = S.now()
        rows = [("f", "F", "Inondation à Lyon", "javascript:alert(1)", "", now), ("f", "F", "Inondation à Nîmes", "https://ok.fr/a", "", now),
                ("f", "F", "Crue à Metz", "data:text/html,x", "", now)]
        with TemporaryDirectory() as d, mock.patch.object(S, "_feed", return_value=(rows, "h")):
            local.news(Path(d))
            import json
            items = json.loads((Path(d) / "news-local.json").read_text())["items"]
        self.assertEqual([i["l"] for i in items], ["https://ok.fr/a"])


class Departments(unittest.TestCase):
    def test_paris_day_is_the_paris_calendar_day(self):
        # 23:30 UTC on 30 Jun is already 1 Jul in Paris (summer time)
        fake = S.datetime(2026, 6, 30, 23, 30, tzinfo=S.UTC)
        with mock.patch.object(depts, "now", return_value=fake):
            self.assertEqual(depts.paris_day(), "2026-07-01")

    def test_dept_with_missing_forecast_stays_unknown(self):
        ks = list(depts.DEPS)
        rows = [{"daily": forecast()} for _ in ks]
        rows[0]["daily"]["temperature_2m_max"][0] = None
        with mock.patch.object(depts, "jget", return_value=(rows, "h")):
            out = depts.weather()
        self.assertNotIn(ks[0], out)
        self.assertIn(ks[1], out)


class Sources(unittest.TestCase):
    def test_probes_are_gone(self):
        self.assertNotIn("probes", S.META)
        self.assertFalse(any(s[0] == "probes" for s in S.SOURCES))

    def test_every_source_has_metadata(self):
        for sid, *_ in S.SOURCES:
            self.assertIn(sid, S.META)


if __name__ == "__main__":
    unittest.main()
