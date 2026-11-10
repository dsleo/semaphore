# Security policy

Semaphore is a static site (`docs/`) plus a Python script that builds JSON. It has no accounts, no server and no secrets.

**Report a vulnerability** privately through GitHub: *Security → Report a vulnerability* on this repository. Please do not open a
public issue for it. This is a volunteer project: expect an answer within a few days, not hours.

In scope: script injection through feed content, a way to make the site display a false "all clear" or false alarm, anything that
sends visitor data somewhere it should not go. Out of scope: the accuracy of third-party data, and missing alerts (see README, *Known limits*).

**A wrong or missing alert is a safety matter too.** If you find a real event the site missed, or a false alarm, please open an issue
with the date, place and official source so it can become a test in `tests/test_scenarios.py`.
