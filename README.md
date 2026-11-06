# Vigie

A free, zero-account early-warning page for Paris citizens. It answers one question, "Is anything going wrong in Paris right now, and what should I do?", using only public open data and fixed, readable rules.

- **No LLM** anywhere (backend or frontend), no tracking, no cookies, no account.
- **Independent and non-official**: it uses a sober public-service look but carries no state emblem and never claims to be an official service. It points to the official sources.
- **Static**: a Python script writes JSON, a static page displays it. No server to run in production.

Further design docs: [SPEC.md](SPEC.md) (product and safety design) · [RISK_REGISTER.md](RISK_REGISTER.md) (hazards and data map).

## Any commune in France

The first screen is a commune picker (autocomplete on `geo.api.gouv.fr`, postcode, or geolocation) and a map of France coloured by Météo-France vigilance per département. The choice lives in the URL (`?c=<INSEE code>`), so it can be shared.

- **Paris** (75056) is served exactly as before from the Action-built `state.json`: all 16 sources, trends, traffic, cooling places.
- **Any other commune**: `docs/local.js` fetches the local sources live in the browser (Open-Meteo forecast at the commune's coordinates, Météo-France vigilance for its département, VigiEau at its coordinates, fuel stockouts in its département) and scores them with a port of `puite/score.py` (same noisy-OR, impact, official floors, fuel cap). National hazards (power, cyber, digital, supply) come from `state.json`. Not available outside Paris: traffic events, cooling places, trends for local hazards, level-change history, Seine gauge. Unavailable sources show as "indisponible", never as "all clear".
- Local levels have no persistence/hysteresis (no per-visitor history). The heat threshold outside Île-de-France is an approximate national one (34/20 °C); the official canicule vigilance has the exact values.
- `scripts/build_map.py` regenerates `docs/data/france-map.json` from a départements GeoJSON. `node tests/local.test.js` checks the scoring port.

## What the user sees

Four tabs, French and English, light and dark mode:

| Tab | Content |
|---|---|
| **Aujourd'hui** | In this order: (1) a status banner, with the source coverage ("16 of 16 sources current"). The calm state reads *"No priority alert detected in the monitored sources, as of HH:MM. This is not an all-clear"*; (2) **official alerts now** (Météo-France, Vigicrues, Ecowatt, VigiEau), kept apart from scores; (3) **local disruptions** (Paris traffic events); (4) six **PUITE risk indices** (icon, score /100, level badge), explicitly not a probability or an official warning; tap one for what to do and the evidence; (5) links to preparedness and method. |
| **Se préparer** | The 72-hour emergency kit from the official government guide: persons counter, checklist saved in the browser only, "know" list (FR-Alert, sirens, 112/15/17/18, how to judge information), and **where to cool down and drink** by arrondissement (Paris open data, with the last-checked date; no geolocation). |
| **Tendances** | Last 14 days per risk group: rising / stable / easing, calm streak, "unusual" flag. Hover or tap a bar for the day's date, level and score. Pale bars are reconstructed, solid bars are live. Each chart has a keyboard-reachable table version. |
| **Détails** | Collapsible sections: how the level is decided, current measurements, monitored press, data sources, change history, traceability and limits. |

## How a level is decided

All of it is deterministic and in `puite/score.py` (about 80 lines) plus the stress rules in `puite/sources.py`.

1. **Indicator stress** `s` in [0, 1]. Each collector turns a raw measurement into a stress with a piecewise-linear rule (e.g. share of stations out of fuel, 3-day mean temperature, Seine height and rise rate, Ecowatt colour).
2. **Hazard score.** Indicators are grouped into *evidence families* (a forecast and the warning built on it, readings of one feed, press repeating one story). Only the strongest `w·s` of each family counts, then families combine with a *noisy-OR*: `H = 100 × (1 − Π(1 − fᵢ))`. Independent evidence corroborates, repeated evidence does not inflate. Items of kind `context` (CISA KEV, CERT-FR, RansomLook, ENSO) are displayed but never scored. `w` is the trust weight of the indicator.
3. **Impact.** `R = H × (0.6 + 0.1 × (impact − 1))`, with impact 1 to 5 per hazard (`puite/config.json`).
4. **Levels.** R below 25: Tout va bien. 25 to 49: À surveiller. 50 to 74: Préparez-vous. 75 and above: Agissez maintenant.
5. **Official floors.** Météo-France Vigilance, Vigicrues (orange or red) and Ecowatt set a minimum score (50 or 80) and bypass persistence. Official alerts are also listed on their own on the home screen.
6. **Damping.** A rise needs confirmation over 2 runs (official signals excepted). A fall drops one level per 6 h. This avoids flapping.
7. **Safety caps.** Fuel and supply are capped at "Préparez-vous" unless an official source confirms, and their wording says *don't hoard*. Press feeds only a few capped indicators, counted per distinct *event* (near-duplicate headlines group together), so press alone never exceeds "À surveiller" or "Préparez-vous".
8. **Unknown is never OK.** A hazard with no scored indicator is "unknown". Each source has its own expected refresh (15 min to a month, `META` in `sources.py`); a source that failed but is within 3× its interval is shown as *late*, otherwise *unavailable*, and tiles say "données partielles". If the whole file is older than 3 h, the page says "Statut inconnu".
9. **City level** is the worst hazard, and the city score is the highest hazard score. "Several domains affected" (two domains at Orange or above) is shown as a fact; it adds nothing to the number. Flood, heat, drought and wind/rain/cold share the *weather* domain.

The deployed page shows the same explanation (Détails → "Comment le niveau est décidé").

## Architecture

```
puite/                     Python 3, standard library only
  sources.py   16 collectors, per-source metadata (kind, area, refresh, licence, family), stress rules
  places.py    cooling places and drinking fountains (Paris open data, refreshed daily)
  score.py     noisy-OR, impact, levels, persistence, hysteresis, headline
  memory.py    daily memory (memory.json) + trend rules (no ML)
  backfill.py  rebuilds past days from public archives
  run.py       collect (thread pool) -> score -> write JSON
  config.json  hazards: domain, impact, persistence, sources
docs/                      the static site (GitHub Pages serves this folder)
  index.html, app.js, style.css    vanilla JS/CSS, no framework, no build step
  data/state.json          current scores, evidence, trends, sources (generated)
  data/history.json        level-change log (generated)
  data/memory.json         one peak score per hazard per day, 400-day cap (generated)
  data/places.json         cooling places and fountains, with last-checked date (generated daily)
  data/messages.json       FR/EN texts per hazard: what / do / don't / references (hand-written)
  data/prepare.json        emergency kit and "know" list (hand-written)
tests/                     32 unittest tests: scoring, memory, news filter, and replayed scenarios
                           (2003 heatwave, red vigilance, 2016 Seine flood, calm day, double counting,
                           stale or missing feeds, DST day boundaries)
.github/workflows/update.yml   cron every 15 min: test, collect, commit docs/data
```

Flow: `python3 -m puite` runs every collector in parallel. A collector that fails never stops the run; it is reported as failed in `state.json`. Each indicator carries its value, source, timestamp, a SHA-256 fingerprint of the raw response and the API query so a reader can reproduce it. The scorer produces hazard states, the run records the day in memory, and the page renders everything client-side from `state.json`.

### Sources (16)

| Source | Use |
|---|---|
| Fuel stations feed (data.economie.gouv.fr) | share of Île-de-France stations in stockout |
| Ecowatt, eco2mix (RTE via ODRE) | electricity tension signal, national load |
| Open-Meteo | heat, cold, wind, rain forecast |
| **Météo-France Vigilance** (Opendatasoft mirror, department 75) | official orange/red for heat, weather, flood |
| **Vigicrues** (official flood vigilance, section "Seine à Paris") | official flood level, scored as an official alert |
| **Paris traffic events** (Ville de Paris open data) | local disruptions list, not scored |
| Hub'Eau | Seine level and rate of rise |
| VigiEau | water restrictions |
| CISA KEV, CERT-FR, RansomLook | cyber **context**: displayed, never scored (they do not show a threat to Paris residents) |
| IODA, reachability probes | internet outages (probes: single vantage point, low weight) |
| Press RSS (franceinfo, ici, 20 Minutes, Le Figaro, RFI, Le Monde) | keyword themes over the last 36 h; shown in Détails, plus capped cyber, cold-chain and bank signals when several distinct outlets agree |
| NOAA ONI | ENSO context only (no score) |

Préfecture, gouvernement.fr and interieur.gouv.fr block automated reads and publish no open alert feed. They appear as links, and through press coverage. No open FR-Alert feed exists.

### Memory and trends

Each indicator records its kind (observed, official, forecast, reported, context), area (Paris, Île-de-France, France, world, single point), publication time when the source gives one, and fetch time. The Détails tab lists each source's expected refresh and licence.

Every run stores the day's peak per hazard in `memory.json` (Paris-time day), calm days included. Live readings always overwrite reconstructed ones. `memory.trends` builds one series per domain plus "all" (30 days stored, 14 shown): last 3 days vs the previous 7 (±5 points = rising / easing), calm streak, and "unusual" when the z-score against the older history is at least 2. That label needs **60 days** of history (analysis looks back 120 days); before that the page says so. With too little data it says "no data" rather than guessing.

`python3 -m puite.backfill 30` rebuilds the past from archives (fuel, observed weather, Seine about 1 month, Ecowatt, CISA KEV). Cyber is not backfilled. Limits: fuel history is a lower bound (the feed lists only stations still in stockout), weather uses observed values rather than forecasts, and VigiEau, IODA, RansomLook, press and probes have no archive, so those days stay empty. The backfill reuses the same stress functions as the live collectors, so thresholds cannot drift.

## Run it

Python 3.9+, nothing to install.

```bash
python3 -m puite --serve        # refresh data, then serve http://localhost:8000
python3 -m puite.backfill 30    # optional, once: rebuild 30 days of history
python3 -m unittest -q          # tests
```

To only view the existing data: `python3 -m http.server 8000 --directory docs`.

**Unattended and free, on GitHub:** push the repo, then Settings → Pages → Deploy from branch → `main` / `docs`. The workflow runs every 15 min, tests, collects and commits `docs/data/{state,history,memory}.json`. Each commit is a timestamped snapshot. GitHub may delay scheduled runs, and pauses them after 60 days without repository activity. Set `"repo"` in `puite/config.json` to show the repo link in the app.

## Review guide

Where to look first:
- `puite/score.py`: the whole decision logic. `tests/test_score.py` pins its behaviour.
- `puite/sources.py`: the stress thresholds (top of file and each collector) and the press filter (`news()`: keyword themes, EXCLUDE list, local-only themes, outlet counting).
- `puite/config.json`: weights per hazard, impact, persistence.
- `docs/data/messages.json` and `prepare.json`: all advice text. Worth a content review by someone competent in civil protection.
- `docs/app.js`: rendering only; it contains no scoring.
- `tests/test_scenarios.py`: the replayed known events and failure modes. Add a case whenever a real miss or false alarm is found.

## Known limits

- **Thresholds are starting defaults**, not calibrated. Run for several weeks and tune `sources.py` and `config.json`. Seine thresholds (3/4/5/6 m at Austerlitz) are placeholders to confirm with Vigicrues.
- Probes run from one vantage point (the GitHub runner or your laptop), so they cannot tell a Paris outage from a local one.
- Ecowatt via ODRE is the day's colour and lags about a day. The RTE API (free key) would give the 3-day forecast.
- No open feed exists for strikes, local power cuts (Enedis), tap-water incidents or physical attacks. Press coverage and official alerts (FR-Alert, 112) remain the answer.
- The supply cluster has no history yet. Backfilled trends are partial and conservative.
- **Shadow mode is off** (`"shadow": false` in `config.json`; set it to `true` to show a trial banner). The thresholds are still uncalibrated, so keep comparing against official warnings after several weeks of comparing against official warnings (missed warnings and false alarms).
- Not yet run on GitHub Actions with the current data files. Checked in a browser (mobile and desktop, light and dark; badge and text contrast at least 4.5:1; keyboard-reachable chart bars, skip link, no live-region re-announcements), but **not** with a real screen-reader or a DSFR conformance audit.
- Not integrated, on purpose: Île-de-France Mobilités disruptions, Airparif, the RTE Ecowatt API (accounts or keys; they would go in GitHub Actions secrets, never in the repo or JSON), GDELT, RIPE Atlas, Eau de Paris works, Enedis (no live feed). No map yet for local disruptions. Raw API responses are not archived (fingerprints and queries are, which do not allow an exact replay if upstream changes).
- Official FR-Alert and préfecture alerts cannot be read automatically; the page says so.
- This is not a substitute for official alerts. When FR-Alert, the préfecture or the authorities say something different, follow them.
