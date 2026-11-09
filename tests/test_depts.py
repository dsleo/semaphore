import unittest
from semaphore import depts


class Depts(unittest.TestCase):
    def test_dep_of_keeps_corsica(self):
        self.assertEqual([depts.dep_of(c) for c in ("75056", "2A004", "2B033", "69123")], ["75", "2A", "2B", "69"])

    def test_q75_is_robust_to_outliers(self):
        self.assertEqual(depts.q75([1, 1, 1, 1, 1, 1, 1, 6]), 1)  # one bad commune does not paint the département
        self.assertIsNone(depts.q75([]))

    def test_all_hazards_have_config_and_sources(self):
        for h in depts.DETAIL:
            self.assertIn(h, depts.CFG)
        for ids in depts.SRC_OF.values():
            for sid in ids:
                self.assertIn(sid, depts.SRC_NAME)

    def test_per_dep_groups_communes_and_ignores_unknown_deps(self):
        best = {"75056": {"code_qual": "2"}, "75101": {"code_qual": "4", "alerte": "True"}, "99999": {"code_qual": "6"}}
        g = depts._per_dep(best, None)
        self.assertEqual(set(g), {"75"})
        self.assertEqual(g["75"], (4, True, 2))  # q75 of [2, 4], alert flag any(), 2 communes

    def test_norm_strips_accents(self):
        self.assertEqual(depts._norm("Cattenom Île-de-France É"), "cattenom ile-de-france e")


if __name__ == "__main__":
    unittest.main()
