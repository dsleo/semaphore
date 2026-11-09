import re
import unittest
from semaphore import sources as S


def hit(title):
    t = title.lower()
    if S.EXCLUDE.search(t):
        return None
    scope = "paris" if S.PARIS_RE.search(t) else "france" if S.FRANCE_RE.search(t) else None
    for th, (_, rx) in S.THEMES.items():
        if scope and (th not in S.LOCAL_ONLY or scope == "paris") and (re.search(rx, t) or (scope == "paris" and th in S.WEAK and re.search(S.WEAK[th], t))):
            return th
    return None


class News(unittest.TestCase):
    def test_hits(self):
        self.assertEqual(hit("Grève du 5 novembre : la SNCF prévoit un trafic perturbé"), "transport")
        self.assertEqual(hit("Cyberattaque en France : des chambres froides touchées"), "digital")
        self.assertEqual(hit("Manifestation à Paris jeudi"), "transport")

    def test_noise_is_ignored(self):
        self.assertIsNone(hit("Orages à Marseille ce week-end"))             # weather needs Paris
        self.assertIsNone(hit("Procès de l'attentat : l'accusé renvoyé"))    # court story
        self.assertIsNone(hit("Manifestation à Lyon"))                       # weak keyword needs Paris

    def test_syndicated_copies_are_one_event(self):
        r = lambda o, t: (o, o, t, "http://x", "", None)
        same = [r("a", "Cyberattaque au Crédit Mutuel Arkéa : pertes de 100 millions"), r("b", "Cyberattaque Crédit Mutuel Arkéa : la banque évalue ses pertes"), r("c", "Crédit Mutuel Arkéa cyberattaque : pertes")]
        self.assertEqual(len(S.events(same)), 1)
        self.assertEqual(len(S.events(same + [r("d", "Rançongiciel : un hôpital de Rennes paralysé")])), 2)


if __name__ == "__main__":
    unittest.main()
