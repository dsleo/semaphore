# Contributing

Thanks for helping. The project stays small on purpose: Python 3.9+ standard library only, vanilla JS/CSS, no build step, no LLM deciding anything.

```bash
python3 -m unittest discover -s tests -t . -q   # Python tests
node tests/local.test.js                          # browser-side scoring port
python3 -m semaphore --serve                      # refresh data, serve http://localhost:8000
```

Rules of the road
- **Scoring changes need a test.** `tests/test_scenarios.py` replays real events; add a case when you find a miss or a false alarm. If you touch scoring, change `semaphore/score.py` and `docs/local.js` together: `tests/fixtures/scoring.json` is shared by both test suites.
- **Unknown is never "all clear".** A source that fails must show as unavailable, not as calm.
- **Advice text** (`docs/data/messages.json`, `prepare.json`) should cite an official source. Changes to it are reviewed more carefully than code.
- **New data source:** note its licence in [DATA.md](DATA.md), give it an entry in `META` in `semaphore/sources.py`, and make sure it cannot stop the run when it fails.
- Do not commit changes to `docs/data/*.json` by hand: the bot owns them.
- Be kind. See the [code of conduct](CODE_OF_CONDUCT.md).
