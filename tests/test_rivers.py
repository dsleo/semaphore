import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from semaphore import local


def feed(levels):
    return json.dumps({"DtHrInfoVigiCru": "2026-11-10T14:55:19+00:00", "features": [
        {"properties": {"lbentcru": f"S{i}", "CdEntCru": f"X{i}", "NivInfViCr": l},
         "geometry": {"coordinates": [[[2 + j / 100, 48 + j / 100] for j in range(10)]]}} for i, l in enumerate(levels)]})


class Rivers(unittest.TestCase):
    def run_with(self, body):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(local.S, "get", return_value=(body, "h")):
            out = Path(d)
            msg = local.rivers(out)
            return msg, json.loads((out / "vigicrues.json").read_text())

    def test_keeps_only_sections_above_green_with_thinned_line(self):
        _, j = self.run_with(feed([1] * 150 + [3, 4]))
        self.assertEqual([i["l"] for i in j["items"]], [3, 4])
        self.assertEqual(j["total"], 152)
        self.assertLessEqual(len(j["items"][0]["p"]), 5)   # 10 points thinned to every 3rd + last

    def test_all_green_is_an_empty_list(self):
        self.assertEqual(self.run_with(feed([1] * 150))[1]["items"], [])

    def test_broken_feed_is_not_written_as_all_green(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(local.S, "get", return_value=(feed([1] * 5), "h")):
            with self.assertRaises(RuntimeError):
                local.rivers(Path(d))
            self.assertFalse((Path(d) / "vigicrues.json").exists())


if __name__ == "__main__":
    unittest.main()
