# PUITE v4: Paris Risk Today, a public early-warning and readiness service

**One line:** a free, always-on, open service that tells any Parisian *how risky today is, for what, and the one thing to do about it*, built on continuously collected open data.
**Companion:** [RISK_REGISTER.md](RISK_REGISTER.md) (58 hazards, 40 data sources, about 25 of them verified live 2026-11-03).
**Status:** design. Items marked ⚠ are unverified.

---

## 0. Product thesis

1. **Two products, one engine.**
   - **Today** (dynamic): live risk per domain, a single headline score, and one action.
   - **Be Ready** (static, ranked): what to prepare *regardless of today*, ordered by likelihood × harm ÷ cost, with checklists, quantities, and drills.
2. **Calm by default.** Most days: green, "nothing to do". Credibility is the asset. Target: ≤ 1 Orange per month and ≤ 1 Red per year citywide.
3. **Action-first.** Every state carries one sentence of what to do and how long it takes. Never a bare number.
4. **Evidence on display.** Every level shows its sources, timestamps and rule. No black-box scores.
5. **Complement, never compete with, official alerts** (FR-Alert, Préfecture, Météo-France, 112). We aggregate and translate, we do not issue orders.
6. **Resilient by construction:** static site on a CDN, no accounts, no personal data, works offline, hosted away from the Paris grid.

---

## 1. What a Parisian sees

```
PARIS RISK TODAY            Updated 14:35 · data coverage 94 %
┌──────────────────────────────────────────────────────────────┐
│ 🟡 YELLOW  Heatwave building (Thu-Sat, up to 37 °C)           │
│ Do today (10 min): freeze water bottles, check on a neighbour │
└──────────────────────────────────────────────────────────────┘
Power 🟢  Fuel 🟢  Food & supply 🟢  Water 🟢
Heat & weather 🟡  Digital & payments 🟢  Transit 🟡  Health 🟢  Safety 🟢
[Why? evidence]  [Playbook]  [My readiness: 6/10]  [Subscribe]
```
- Four colours everywhere (green, yellow, orange, red), the same as Météo-France and Ecowatt, so nobody learns a new code.
- **Why?** opens the exact signals, their values, ages, and the rule that fired.
- **Playbook** = printable one-page checklist per hazard, stage-by-stage (T-72 h, T-24 h, now, during, after).
- **Readiness** = client-side self-check (water days, food days, meds, cash, power bank, radio, plan); stored only in the browser.
- Languages: FR/EN at launch; plain-language (FALC) and community languages via partners.

---

## 2. Scoring model (continuous, explainable)

**2.1 Indicators → stress.** Each indicator maps a raw metric to stress `s ∈ [0,1]` using a transparent piecewise function (official colour, percentile versus its own history, or fixed threshold). Example: fuel stockout ratio 0.08 → 0.1, 0.15 → 0.5, 0.25 → 1.0.

**2.2 Hazard index.** Combine independent evidence with **noisy-OR**, so corroboration raises the score without double counting:

```
H_h = 100 × ( 1 − Π_i ( 1 − w_i × s_i × f_i ) )
w_i = reliability weight (official = 1.0; measured infrastructure = 0.8; inference = 0.4; attention/news = 0.2)
f_i = freshness factor (1 inside expected cadence, decays to 0 at 3× cadence → source goes UNKNOWN)
```
- Signals in the same *causal chain* share a cap (e.g., search interest cannot raise a hazard beyond what its measured signals support).
- **Official overrides:** an official red (Vigilance, Ecowatt, Vigicrues) sets a floor of 80.

**2.3 Risk score.** `R_h = H_h × m_I`, where `m_I = 0.6 + 0.1 × (I_h − 1)` and `I_h` is the 1-5 impact from the register (high-impact hazards escalate sooner).

**2.4 Levels and the action contract**

| Level | Condition | Meaning | Message contract |
|---|---|---|---|
| 🟢 Green | R < 25 | Normal | "Nothing to do. Quarterly kit check." |
| 🟡 Yellow | 25 ≤ R < 50 | Be aware | One ≤10-min task |
| 🟠 Orange | 50 ≤ R < 75 | Prepare today | Checklist ≤ 30 min; list what *not* to do |
| 🔴 Red | R ≥ 75, or official red | Act now | Checklist + "follow official instructions" first |

**2.5 City headline.** `Paris = max_h R_h`, plus +10 for each *additional* hazard from a different domain with R ≥ 50 (cap 100). Two Oranges from different domains → headline Orange with a "multiple pressures" banner. The compound-crisis case (H3) is built in.

**2.6 Discipline**
- **Persistence:** each stage must hold N polls (N set per signal; official changes are trusted immediately).
- **Hysteresis:** step down one level only after 6 h below the lower threshold; publish an explicit all-clear.
- **UNKNOWN ≠ green:** stale sources lower the *data coverage* figure and can cap the displayed level at "Unknown" for that domain.
- **Honest semantics:** R is an **ordinal severity**, not a probability. After ≥ 12 months of logged outcomes, calibrate it to "chance of notable disruption within 7 days" and publish the calibration curve.

---

## 3. Anti-panic and trust design (non-negotiable for a public tool)

- **Demand-sensitive hazards** (fuel, food, cash, bank): messaging never says "will run out". It says "supply is under strain. Buy what you normally buy; top up if you're under a quarter tank. Hoarding makes it worse." These hazards are **capped at Orange publicly** unless an official source confirms. (Public fuel alerts in 2022 became self-fulfilling.)
- **No attacker-useful detail:** cyber items describe *impact and actions*, not vulnerabilities or targets.
- **Adversarial inputs:** non-official signals need ≥ 2 independent sources or a probe quorum before they can reach Orange; crowd reports (S39) are rate-limited, region-bucketed, and cannot alone raise above Yellow.
- **Transparency log:** every level change is committed with evidence to a public repository (signed commits). Methodology, thresholds and backtests are public. Corrections are published, not silently edited.
- **Governance:** seek partnership with the Mairie de Paris, Préfecture de Police, Protection civile, Croix-Rouge, ANSSI/CERT-FR, Météo-France. Disclaimers on every page: informational, not an official warning.
- **Privacy:** no accounts, no analytics beyond aggregate counts, no location unless the user types an arrondissement locally.
- **Accessibility:** RGAA-compliant, low-bandwidth, screen-reader-friendly, printable, and an SMS/phone-tree channel through associations for people without smartphones.

---

## 4. Hazard coverage (per [RISK_REGISTER.md](RISK_REGISTER.md))

Domain indices shown to the public, with the hazards that feed them:

| Domain | Hazards (register IDs) | Core signals |
|---|---|---|
| Power | B1, B2, B7, B8 | Ecowatt (S04), eco2mix (S02/S03), ENTSO-E (S27), Kp (S12) |
| Fuel & gas | B4, B5 | Fuel stockouts (S01), gas storage (S28), ENTSOG (S37) |
| Food & supply | A1, D1-D5 | Ransomware victims in cold-chain/logistics (S18), recalls (S24), Rungis prices (S35), probes of retailers (S22), crowd (S39) |
| Water | C2, E4, G3 | VigiEau (S07), streamflow (S06); water incidents ✋ |
| Heat & weather | C1-C7 | Open-Meteo (S08), Vigilance (S09), Hub'Eau (S05), Airparif (S33) |
| Digital & payments | A2-A12, B2 | IODA (S19), RIPEstat (S20), status pages (S21), probes (S22), KEV/CERT-FR (S13/S16) |
| Transit | A6, D5, F3 | PRIM (S29), watchlist ✋ |
| Health | E1-E3 | Sentiweb (S25), SPF (S31), ANSM (S32) |
| Safety | F1-F5, G1-G5, H1-H2 | Vigipirate (S34), GDELT (S23), official alerts; mostly reflex plans |
| Background (prior only) | C8, D6-D8, H1 | ONI (S10/S11), Eurostat (S26), FAO (S40) |

**Cyber specifically** (full method in RISK_REGISTER §3): four stages: posture (KEV, CERT-FR, EPSS, C2 counts) → active campaign (ransomware victims in cold-chain/logistics/food/health/energy) → **impact detection** (IODA, RIPEstat, provider status, multi-vantage probes with quorum) → physical consequences (recalls, prices, crowd reports). Posture and campaign evidence cap at Yellow; confirmed impact drives Orange with a concrete action (cash, offline copies, food-safety rules).

---

## 5. Architecture (cheap, continuous, public-scale)

```
collectors (cron/loop, per-source cadence)  →  SQLite (observations, states, alerts, source_health)
        →  scorer (pure function: signals → H, R, levels)  →  publisher
        →  static artifacts: state.json, history/*.json, atom.xml, pages/*.html, playbooks/*.pdf
        →  CDN (two providers) + Telegram/Mastodon/Bluesky/email/RSS bots + webhooks for partners
```
- **Cadence classes:** probes 2 min · outage/status/IODA 5 min · fuel, grid, PRIM, GDELT 10-15 min · weather/Vigilance/Ecowatt/KEV/CERT-FR/recalls hourly · water, ENSO, health, inflation daily-monthly.
- **Scaling:** viewers read static files from a CDN, so millions of reads cost almost nothing. Only the collector + scorer need compute (one small VPS, ~€5-10/month, plus a second region for the heartbeat watcher).
- **Where to host:** collector outside the Paris grid and outside the same cloud as the CDN (so a single-provider outage doesn't blind *and* silence us). Static mirror on a second provider.
- **Dead-man's switch:** external service pages the maintainers if publishing stops; the site itself shows "STALE since HH:MM" instead of an old colour.
- **Stack:** Python 3.11, `asyncio` + `httpx`, stdlib `sqlite3`/`tomllib`, pytest + respx, plain templates for pages. No framework, no ORM, no DuckDB.
- **Probe fleet:** 2 small VPS in different clouds + volunteer devices (opt-in, rate-limited). Probes measure *only public endpoints*.
- **Open source** (AGPL or similar) with open data output (`state.json` under an open licence).

---

## 6. Data model and rules as config

```sql
observations(source, metric, ts, value, meta)         -- raw
states(hazard, ts, H, R, level, evidence_json)        -- scored
alerts(id, ts, hazard, level, message_fr, message_en) -- published changes
source_health(source, last_ok, failures, last_error)  -- UNKNOWN logic
```
Everything tunable lives in `config/`: `indicators.toml` (mappings), `hazards.toml` (weights, impact, persistence), `messages/` (FR/EN texts per hazard × level), `watchlist.yaml` (manual items: strikes, events), `probes.yaml`. `scorer.evaluate()` is a pure function, tested table-driven and replayable on history.

---

## 7. Validation

1. **Fixtures first** from the real endpoints (about 25 endpoints already confirmed in the register).
2. **Unit tests** for every indicator mapping, level boundary, hysteresis, UNKNOWN and corroboration case.
3. **Shadow mode** ≥ 4 weeks, ideally across a heat period or winter: publish nothing above Green, log what *would* have shown. Tune to the alert budget.
4. **Backtests** where archives exist: autumn 2022 fuel shortages, July 2019 and summer 2022 heat, winter 2022-23 Ecowatt, Jan 2018 and June 2016 floods, July 2024 CrowdStrike outage, Apr 2025 Iberian blackout, 2023 riots, ransomware waves against food/logistics (e.g., UK and EU 2025 cases ⚠). Report lead time versus first press coverage and per-hazard precision.
5. **Chaos tests:** kill each source, block a CDN, stop the collector. Each must produce the expected degraded display.
6. **Public methodology page** with the backtest results and an "if we were wrong" log.

---

## 8. Roadmap

| Phase | Scope | Done when |
|---|---|---|
| **P0 (this week)** | Repo, collectors for ✅ feeds: fuel, eco2mix, Ecowatt (ODRE), Hub'Eau, Open-Meteo, VigiEau, KEV, CERT-FR, RansomLook, IODA, RappelConso; SQLite; dead-man's switch; request keys (PRIM, Météo-France, ENTSO-E, GIE, Airparif) | 7 days of continuous data; health dashboard; staleness works |
| **P1** | Scorer for Heat, Power, Fuel, Digital; config and tests; shadow mode; first static page for the maintainers | Alert budget met in shadow; backtests for heat/fuel/Ecowatt |
| **P2** | Probe fleet and quorum; Food & supply (cold-chain ransomware watch, recalls); Transit via PRIM; playbooks (FR/EN, printable) | Chaos tests pass; playbooks reviewed by a civil-protection volunteer |
| **P3** | **Public beta**: site, Atom/JSON, Telegram/Mastodon, Be-Ready self-check; methodology and transparency log; partnerships outreach | 4 weeks stable; first external feedback incorporated |
| **P4** | Remaining domains (Water, Health, Safety posture), crowd reports, SMS/phone-tree via associations, community languages, arrondissement-level views | Partner endorsement; accessibility audit |

---

## 9. Decisions needed from you

1. **Mission scope:** family tool first (P0-P2, private) then public (P3+), or public from day one?
2. **Entity and liability:** who publishes (a person, an association, the city as partner)? This affects wording, insurance and outreach.
3. **Brand/name** and languages beyond FR/EN.
4. **Backup channels** you trust (ntfy, Pushover, SMS provider).
5. **Funding:** infrastructure is ~€10-30/month; volunteer time is the cost.
6. **Reality check on my risk ratings** (register L/I columns): adjust any you disagree with.

---

## 10. Prompt for the implementing agent

> Build **puite** per `SPEC.md` and `RISK_REGISTER.md`, phase by phase; stop after each phase with acceptance evidence.
> 1. For every adapter: call the real endpoint first, save the response to `tests/fixtures/`, derive the schema from it. Never guess fields. Anything marked ⚠ must be verified or reported as unverified.
> 2. `scorer.evaluate()` is pure, with table-driven tests for every indicator mapping, level boundary, noisy-OR combination, hysteresis, freshness decay and `UNKNOWN`.
> 3. Adapters raise `SourceError`, update `source_health`, and never crash the loop. A stale source is never green.
> 4. Stdlib first; add dependencies only from §5. Respect rate limits, send a descriptive User-Agent, cache.
> 5. Shadow mode **on** by default; nothing is published above Green until I turn it off.
> 6. Public output contains no personal data and no exploit details. Demand-sensitive hazards follow §3 wording rules.
> 7. Secrets only via environment; commit `.env.example`, never `.env`.
> 8. Every phase ends with test output, sample stored rows, and a list of deviations from the spec.

*This service supports personal judgment. It never replaces official instructions (FR-Alert, Préfecture de Police, Météo-France, emergency services 112/15/17/18).*
