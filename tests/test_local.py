import unittest

from semaphore import local


def tag(f, w):
    return bytes([(f << 3) | w])


def ld(f, b):
    return tag(f, 2) + bytes([len(b)]) + b


def tstr(text, lang=b"fr"):
    return ld(1, ld(1, text) + ld(2, lang))


class TestGtfsRt(unittest.TestCase):
    def test_alert_decoding_and_activity_window(self):
        def alert(start, end, header):
            period = tag(1, 0) + bytes([start]) + tag(2, 0) + bytes([end])  # tiny timestamps: fine for a decoder test
            return ld(2, ld(1, b"e") + ld(5, ld(1, period) + tag(7, 0) + bytes([3]) + ld(10, tstr(header))))
        feed = alert(1, 100, b"Retards ligne 1") + alert(1, 5, b"Trop ancien")
        out = local.alerts_pb(ld(1, b"hdr") + feed, now_ts=50)
        self.assertEqual(out, [{"t": "Retards ligne 1", "e": "delays"}])  # expired alert dropped, effect decoded

    def test_ici_url_gives_region_and_departement(self):
        m = local.ICI_RE.search("https://www.ici.fr/auvergne-rhone-alpes/ain-01/lent/x-1")
        self.assertEqual((local.SLUG2REG[m.group(1)], m.group(3)), ("84", "01"))

    def test_varint_multibyte(self):
        self.assertEqual(local._varint(bytes([0xAC, 0x02]), 0), (300, 2))

    def test_norm_collapses_punctuation_and_case(self):
        self.assertEqual(local._norm("  Crue : Rhône,  alerte! "), "crue rhône alerte")


if __name__ == "__main__":
    unittest.main()
