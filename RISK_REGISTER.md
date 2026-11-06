# Paris Risk Register & Data Map

Companion to [SPEC.md](SPEC.md). Scope: everything that could plausibly disrupt daily life in Paris/IdF, **ordered by how likely and how harmful, not by how easy it is to measure**.

- Likelihood (L) and Impact (I) are **my estimates** over ~5 years for a typical Paris resident (1-5). Challenge them; they are config, not facts.
- Status: ✅ responded to a live request on 2026-11-03 · 🔑 free key needed · ⚠ exists but unverified here · ❌ no usable open feed (gap) · ✋ manual watch.
- "Class": **A** = score automatically · **B** = slow or partial indicator, adjusts the background prior · **C** = no warning possible: reflex plan + official pass-through.

---

## 1. Risk register

### A. Cyber and digital (highest-growth category, mostly *coincident*, rarely forecastable)

| ID | Hazard | How it hurts a Paris household | L | I | Lead | Class | Main data (see §2) |
|---|---|---|---|---|---|---|---|
| A1 | **Ransomware on logistics / cold-chain / food distribution / retail IT** (the "frozen-food and fridge" scenario: depot systems down → trucks don't ship → gaps on shelves in 2-5 days, spoilage) | Empty shelves, price spikes, wasted food | 5 | 3 | 1-5 days | A | S18, S16, S13, S22, S24 |
| A2 | **Ransomware on hospitals / health IT** (AP-HP, clinics, labs, pharmacies) | Diverted ambulances, cancelled care, no prescriptions | 4 | 4 | 0-2 days | A | S18, S16, S25 |
| A3 | **Telecom / ISP / cloud / CDN outage** (cyber or faulty update; CrowdStrike 2024-type) | No internet, apps, smart locks, online banking, ticketing | 4 | 3 | 0 | A | S19, S20, S21, S22 |
| A4 | **Payment / banking outage** (card network, bank IT, POS vendor) | Can't pay, can't withdraw; shops close | 4 | 3 | 0 | A | S22, S21, S19 |
| A5 | **Intrusion on energy / water / district-heating OT** | Local blackouts, water disruption, heating off | 2 | 5 | 0-1 day (rare precursors) | A/C | S13, S16, S02, S03 |
| A6 | **Transit / ticketing / signalling IT attack** (RATP, SNCF, IDFM, Navigo) | Network paralysed, no ticket validation | 3 | 3 | 0 | A | S29, S22 |
| A7 | **DDoS wave** (hacktivists, state-linked; peaks around political events) | Gov/bank/transit sites unreachable | 5 | 2 | 0-2 days | A | S22, S19, S21 |
| A8 | **Mass compromise of consumer IoT / routers / box ISP** (botnet, firmware poisoning; includes connected appliances) | Home network down, device bricking, DDoS source; smart fridge/heating out of your control | 4 | 2 | days | B | S13, S14, S16, S17 |
| A9 | **GNSS jamming / spoofing** | Navigation, phone timing, ride-hailing, aviation errors | 3 | 2 | 0 | B | S12, ✋ gpsjam.org |
| A10 | **Subsea cable cuts / sabotage** (Atlantic, Mediterranean, Marseille hub) | Slower internet, regional outages | 3 | 3 | 0 | A | S19, S20 |
| A11 | **Software supply-chain compromise** (poisoned update/library, MSP breach) | Sudden simultaneous failures at many companies | 3 | 3 | 0-3 days | B | S13, S16, S15 |
| A12 | **BGP / DNS hijack** | Sites misrouted, phishing | 3 | 2 | 0 | B | S20, S22 |
| A13 | **Data breach / identity fraud** (very frequent, rarely life-safety) | Fraud, account lockouts | 5 | 1 | 0 | B | S16 (advisories) |
| A14 | **Disinformation / fake emergency alerts / rumor-driven panic buying** | Run on fuel/food/banks; fake FR-Alert-style SMS | 4 | 3 | hours | B | S23, ✋ |

### B. Energy

| ID | Hazard | Mechanism | L | I | Lead | Class | Main data |
|---|---|---|---|---|---|---|---|
| B1 | **Load-shedding (délestage)** in cold snaps | Rolling 2h outages; lifts, boilers, pumps | 2 | 4 | 1-3 days | A | S04, S02, S03 |
| B2 | **National / large-area blackout** (Iberia Apr 2025, ~10 h) | No power, payments, comms, water pressure | 2 | 5 | 0 | A/C | S02 (frequency/load collapse), S22 |
| B3 | **Local outage** (substation, cable fire, flood, theft) | Neighbourhood without power | 4 | 3 | 0 | C | ❌ (Enedis feed not found); S22 |
| B4 | **Gas supply shock** (LNG, pipeline, geopolitics) | Cooking and heating gas cut or rationed; CPCU district heating | 2 | 4 | days-weeks | A/B | S28, S37 |
| B5 | **Fuel shortage** (refinery/depot strike, import disruption) | Car, delivery trucks, ambulances | 3 | 3 | hours-days | A | S01, ✋ strike watch |
| B6 | **Energy price spike / inflation** | Bills, cost of living | 4 | 2 | weeks | B | S26 |
| B7 | **Heat-limited nuclear output** (river temperature curtailments) | Tight summer grid, price spikes | 3 | 2 | days | B | S02, S05, S08 |
| B8 | **Geomagnetic storm** (G4-G5) | Grid stress, GNSS and radio disruption | 2 | 3 | 1-3 days | A | S12 |

### C. Climate and weather (incl. ENSO)

| ID | Hazard | Mechanism | L | I | Lead | Class | Main data |
|---|---|---|---|---|---|---|---|
| C1 | **Heatwave** | The deadliest likely event; top-floor flats, elderly, infants | 5 | 5 | 3-7 days | A | S08, S09 |
| C2 | **Drought / water restrictions** | Bans, strained supply, agriculture, river navigation | 4 | 2 | weeks | A | S07, S06, S05 |
| C3 | **Flash flood** (violent storms, metro/underpass flooding) | Transit stops, basements, car parks | 4 | 3 | 0-24 h | A | S08, S09 |
| C4 | **Seine/Marne river flood** | Quays, RER C, substations; slow, forecastable | 2 | 4 | 2-5 days | A | S05, S09 |
| C5 | **Storm / wind** | Falling trees, scaffolding, transport | 4 | 2 | 1-3 days | A | S08, S09 |
| C6 | **Cold, snow, ice** | Transport, heating, energy demand | 3 | 3 | 2-5 days | A | S08, S09, S04 |
| C7 | **Air pollution / ozone / smoke** | Respiratory harm | 4 | 2 | 1-3 days | B | S33 |
| C8 | **ENSO (El Niño / La Niña) and global climate anomalies** | Not a direct Paris hazard: shifts global harvests and prices (cocoa, coffee, rice, olive oil, wheat), global temperature records | 4 | 2 | months | B (prior only) | S10, S11 |
| C9 | **Clay shrink-swell / subsidence, sinkholes** | Cracked buildings, insurance | 3 | 2 | seasonal | B | S07 (drought proxy) |

### D. Supply chain and economy

| ID | Hazard | Mechanism | L | I | Lead | Class | Main data |
|---|---|---|---|---|---|---|---|
| D1 | **Food distribution disruption** (Rungis, ports, strikes, truckers, A1) | Shelf gaps, price spikes | 3 | 3 | 1-5 days | A | S24, S18, S35, ✋ strikes |
| D2 | **Maritime chokepoints** (Red Sea/Suez, Hormuz, Black Sea) | Delayed goods, energy and cereal prices | 4 | 2 | weeks | B | S38 |
| D3 | **Food safety recalls and contamination** | Specific products unsafe | 5 | 2 | 0 | A | S24 |
| D4 | **Medicine shortages** | Missed treatments | 4 | 3 | weeks | B | S32 |
| D5 | **Labour strikes** (waste collection, ports, air traffic, refinery, transit) | Daily friction | 5 | 2 | days (announced) | A | S29, ✋ strike watch |
| D6 | **Banking / financial stress**, bank holiday or capital controls | Access to money | 1 | 5 | days | B | S26, ✋ ECB/BdF |
| D7 | **Staples inflation** | Purchasing power | 5 | 2 | months | B | S26, S40 |
| D8 | **Trade war / export bans** (fertiliser, grains, chips) | Prices, availability | 3 | 2 | weeks | B | ✋, S40 |

### E. Health

| ID | Hazard | Mechanism | L | I | Lead | Class | Main data |
|---|---|---|---|---|---|---|---|
| E1 | **Epidemic / novel pandemic** | Absenteeism, hospital load, supply | 3 | 4 | days-weeks | B | S25, S31, ✋ WHO/ECDC |
| E2 | **Hospital saturation** (winter flu + covid + heat) | Care delays | 4 | 3 | days | B | S31, S25 |
| E3 | **Autochthonous dengue / chikungunya** (Aedes tigre now established in IdF) | Local clusters in summer-autumn | 4 | 2 | weeks | B | S31 |
| E4 | **Tap-water contamination** | Boil-water orders | 2 | 3 | hours | C | ❌ (ARS/Eau de Paris notices, ✋) |
| E5 | **Zoonosis / avian flu / animal disease** | Food supply, rare human risk | 3 | 2 | weeks | B | ✋ |

### F. Public safety and security

| ID | Hazard | Mechanism | L | I | Lead | Class | Main data |
|---|---|---|---|---|---|---|---|
| F1 | **Terror attack** | Mass-casualty, lockdown, transit shut | 3 | 5 | none | C | S34 (posture only), FR-Alert |
| F2 | **Civil unrest / riots** (2005, 2023) | Looting, transit stops, curfews | 3 | 4 | hours-days | B | S23 (protest event counts), S29 |
| F3 | **Rail / infrastructure sabotage** (cf. July 2024 TGV arson) | Hours-days of transport chaos | 3 | 3 | none | C | S29, S19 |
| F4 | **Mass-gathering incident** | Crush, panic | 2 | 4 | hours | C | ✋ event calendar |
| F5 | **Drones / airspace incident** | Airport and airspace closure | 3 | 2 | 0 | C | ❌ |

### G. Industrial, urban, nuclear

| ID | Hazard | Mechanism | L | I | Lead | Class | Main data |
|---|---|---|---|---|---|---|---|
| G1 | **Industrial fire / chemical release** (Seveso sites, Lubrizol-type) | Shelter-in-place, smoke | 2 | 4 | none-hours | C | S36, FR-Alert |
| G2 | **Gas explosion / building collapse** (old network, Paris 2019) | Local, severe | 3 | 3 | none | C | ❌ |
| G3 | **Water-main burst / network failure** | Cut water, flooding of streets and metro | 4 | 2 | 0 | C | ❌ |
| G4 | **Nuclear/radiological incident** (nearest plants ~100 km, Nogent-sur-Seine) | Iodine, sheltering | 1 | 5 | none | C | S30 (IRSN radiation network, find open endpoint) |
| G5 | **Large fire (building, cathedral-scale), catacomb / quarry collapse** | Local | 3 | 2 | none | C | ❌ |

### H. Geopolitical and systemic

| ID | Hazard | Mechanism | L | I | Lead | Class | Main data |
|---|---|---|---|---|---|---|---|
| H1 | **Escalation of the Russia-NATO conflict** (hybrid attacks, sabotage, energy blackmail) | Compounds A, B, D | 2 | 5 | variable | B | S23, ✋ |
| H2 | **Nuclear threat** | Extreme, unautomatable | 1 | 5 | variable | C | ✋ only |
| H3 | **Compound crisis** (e.g., heatwave + grid + cyber outage at once) | Resource and response overload | 3 | 5 | variable | A (composite) | all |
| H4 | **Space systems failure / Kessler event** | GNSS, comms | 1 | 3 | 0 | C | S12 |

**Reading this table.** The user is right: in terms of *frequency*, cyber events (A1-A7), heat (C1), strikes (D5) and recalls (D3) beat Seine flooding (C4). Flood stays on the list because it is the most forecastable high-impact event. Rare high-impact items (F1, G4, H2) get no sensors: they get a rehearsed reflex plan.

---

## 2. Source catalogue

| ID | Source | Endpoint / note | Auth | Cadence | Status |
|---|---|---|---|---|---|
| S01 | Fuel stations, instant feed | `data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records`. `*_rupture_type` per fuel (count only `temporaire`; 2022 `definitive` rows persist). 47 stations in Paris, so aggregate IdF | none | 10 min | ✅ |
| S02 | RTE eco2mix national, real time | `odre.opendatasoft.com/.../eco2mix-national-tr/records` (`consommation`, `prevision_j`, `nucleaire`, `taux_co2`); filter out null future rows | none | 15 min | ✅ |
| S03 | RTE eco2mix regional (IdF) | `.../eco2mix-regional-tr/records` `where libelle_region="Île-de-France"` | none | 15 min | ✅ |
| S04 | **Ecowatt signal** | ODRE `nouveau_signal_ecowatt` (`date`, `couleur_du_jour`, `h0..h23`); also `signal-ecowatt`. ⚠ check that it is updated daily. RTE OAuth API is the fallback | none / 🔑 | hourly | ✅ exists |
| S05 | Hub'Eau hydrometry **v2** | `hubeau.eaufrance.fr/api/v2/hydrometrie/observations_tr?code_entite=...` (v1 → 403). `F700000103` returned data; ⚠ confirm it is Paris-Austerlitz and add upstream stations | none | 15 min | ✅ |
| S06 | Hub'Eau streamflow / drought (ONDE) | `hubeau.eaufrance.fr/api/v1/ecoulement/observations?code_departement=77` | none | daily | ✅ |
| S07 | **VigiEau** water restrictions | `api.vigieau.beta.gouv.fr/api/zones?lon=2.35&lat=48.85` (returns restriction zones for Paris) | none | daily | ✅ |
| S08 | **Open-Meteo** forecast | `api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max` | none | hourly | ✅ |
| S09 | Météo-France Vigilance | data.gouv dataset "Météo Vigilance niveau départemental (Île-de-France)" exists ✅; official API 🔑 | none / 🔑 | 30 min | ✅/🔑 |
| S10 | NOAA ONI (ENSO) | `cpc.ncep.noaa.gov/data/indices/oni.ascii.txt` | none | monthly | ✅ |
| S11 | NOAA weekly Niño SST | `.../wksst9120.for` (Niño 3.4 anomaly) | none | weekly | ✅ |
| S12 | NOAA SWPC space weather | `services.swpc.noaa.gov/products/noaa-planetary-k-index.json` (Kp) | none | 3 h | ✅ |
| S13 | **CISA KEV** (exploited vulns) | `cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json`: has `dateAdded`, `vendorProject`, `knownRansomwareCampaignUse`. 1 767 entries today | none | hourly | ✅ |
| S14 | **EPSS** (exploit probability) | `api.first.org/data/v1/epss?cve=...` | none | daily | ✅ |
| S15 | NVD CVE | `services.nvd.nist.gov/rest/json/cves/2.0` (rate-limited) | none | hourly | ✅ |
| S16 | **CERT-FR** alerts & advisories | `cert.ssi.gouv.fr/alerte/feed/` and `/avis/feed/` (RSS, now under `cert.cyber.gouv.fr`). "Alerte" = serious/actively exploited | none | 15 min | ✅ |
| S17 | abuse.ch Feodo C2 list | `feodotracker.abuse.ch/downloads/ipblocklist.json` (`country`, `status`, `as_name`). URLhaus bulk download returns **410** (now needs an auth key) | none | hourly | ✅ |
| S18 | **Ransomware victim posts** | RansomLook `www.ransomlook.io/api/recent` works (global; no country/sector field: infer from TLD `.fr`, name, and a sector keyword list). `api.ransomware.live` v1/v2 paths returned 404: re-check its docs | none | 15 min | ✅ partial |
| S19 | **IODA** (internet outage detection) | `api.ioda.inetintel.cc.gatech.edu/v2/outages/summary?entityType=country&entityCode=FR&from=<epoch>&until=<epoch>` and `/v2/signals/raw/country/FR` | none | 5 min | ✅ |
| S20 | RIPEstat | `stat.ripe.net/data/...` routing visibility, announced prefixes for French ASNs (Orange AS3215, Free AS12322, SFR AS15557, Bouygues AS5410, OVH AS16276) | none | 10 min | ✅ exists; calls to design |
| S21 | Provider status pages | Cloudflare `cloudflarestatus.com/api/v2/summary.json` ✅; AWS, Azure, GCP, OVH, Orange, Free: ⚠ RSS/JSON each | none | 5 min | ✅/⚠ |
| S22 | **Own synthetic probes** (build) | From ≥3 vantage points (2 VPS in different clouds + 1 volunteer at home): DNS resolution, HTTPS 200 + latency for bank, payment, retail, transit, gov, cloud, news sites; compare against baseline; **quorum** of vantage points to avoid false alarms | n/a | 2 min | to build |
| S23 | **GDELT** events (15-min batches) | `data.gdeltproject.org/gdeltv2/lastupdate.txt` → export CSV; count protest/violence events with geo = Paris / France. DOC API is rate-limited (1 req/5 s) | none | 15 min | ✅ |
| S24 | **RappelConso** product recalls | `data.economie.gouv.fr/.../rappelconso-v2-gtin-espaces/records` (`date_publication`, `categorie_produit`, `motif_rappel`; 19 173 records) | none | hourly | ✅ |
| S25 | Sentinelles / Sentiweb flu-like illness | `www.sentiweb.fr/datasets/all/inc-3-RDD.csv` (weekly; the REST path returned 501) | none | weekly | ✅ |
| S26 | Eurostat HICP (food/energy inflation) | `ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_manr?geo=FR&coicop=CP011` | none | monthly | ✅ |
| S27 | ENTSO-E Transparency (power flows, outages) | `web-api.tp.entsoe.eu/api`: 401 without token (free token) | 🔑 | 15 min | 🔑 |
| S28 | GIE AGSI/ALSI gas & LNG storage | `agsi.gie.eu/api`, `alsi.gie.eu/api`: "Invalid or missing API key" (free key) | 🔑 | daily | 🔑 |
| S29 | IDFM **PRIM** (line reports, SIRI) | prim.iledefrance-mobilites.fr | 🔑 | 5-10 min | 🔑 |
| S30 | IRSN/ASNR radiation network, SUM'EAU (wastewater virology) | My data.gouv search found neither; ask the agencies for the open endpoint | ❓ | – | ❓ |
| S31 | Santé publique France (canicule, SurSaUD emergency visits, arboviruses), ECDC | Weekly bulletins; some on data.gouv | none | weekly | ⚠ |
| S32 | ANSM drug supply tensions | ansm.sante.fr lists; scrape or open data | none | weekly | ⚠ |
| S33 | Airparif / Atmo / Copernicus CAMS | Airparif API 🔑; CAMS 🔑 | 🔑 | hourly | 🔑 |
| S34 | Vigipirate posture | SGDSN / gouvernement.fr page | none | event | ✋ |
| S35 | Rungis wholesale prices (RNM FranceAgriMer) | ⚠ open data | none | daily | ⚠ |
| S36 | Géorisques / ARIA (Seveso sites, industrial accidents) | georisques.gouv.fr API | none | daily | ⚠ |
| S37 | ENTSOG transparency (gas flows) | transparency.entsog.eu API | none | daily | ⚠ |
| S38 | IMF PortWatch (chokepoint & port transits) | ArcGIS open data | none | daily | ⚠ |
| S39 | Crowd reports (build) | "Is it down for you too?" anonymous micro-reports by arrondissement, with abuse controls | n/a | live | to build |
| S40 | FAO Food Price Index | monthly CSV | none | monthly | ⚠ |

**Gaps (honest list):** strike calendars (no open dataset found: SNCF `grève` search returned 0), Enedis local outages, tap-water incidents, real-time crime/unrest, drone incidents. For those the system uses ✋ manual watch (a shared `watchlist.yaml`) and crowd reports (S39).

---

## 3. How to monitor cyber risk that could hit Paris

Cyber events are the least predictable hazard. So the design has **four stages**, each producing a different kind of evidence, and the *speed of detecting impact* matters more than prediction.

**Stage 1: Threat posture (slow, leading, low precision)** → raises background level only.
- **CISA KEV additions** (S13): count of new entries/24 h, weighted ×3 if `knownRansomwareCampaignUse = Known`, ×2 if vendor ∈ watchlist (edge devices: Fortinet, Citrix, Ivanti, Palo Alto, Cisco; backup: Veeam; file transfer; ERP/WMS/supply-chain software; OT vendors; consumer routers). Add **EPSS ≥ 0.5** CVEs (S14).
- **CERT-FR "Alerte"** (S16): any new alert = stress 0.5; alert mentioning "exploitation active" or a vendor on the watchlist = 0.8. "Avis" feed is background only.
- **Botnet C2 in FR/EU** (S17): count of online C2 where `country` ∈ {FR, DE, NL, BE, ...} versus 30-day baseline.

**Stage 2: Active campaign (coincident-leading; hours to days before consumer impact)**
- **Ransomware victim posts** (S18): victims whose domain is `.fr` or whose name matches a French company list, tagged by sector keyword (logistique, transport, froid, alimentaire, distribution, pharma, hôpital, énergie, eau, collectivité). Metric: count in sector in last 72 h vs trailing-90-day baseline. **A cold-chain/food-logistics victim in FR/EU = WATCH on D1 immediately**, because the empty-shelf effect lags the attack by days.
- Retail/logistics vendors named in CERT-FR or news RSS (S16, S23 mentions).

**Stage 3: Impact detection (fast, high precision)**
- **Country-level connectivity** (S19 IODA, S20 RIPEstat): detect drops in BGP/active-probing/darknet signals for FR and main ISPs.
- **Provider status** (S21) and **own probes** (S22): availability and latency of a fixed panel of ~60 services (banks, payments, retailers, transit, gov, cloud) from ≥3 vantage points. Rule: ≥3 services in the same category failing in ≥2 vantage points for ≥2 consecutive rounds → category outage. **Quorum is mandatory** to filter false positives.
- **Crowd reports** (S39) as a tie-breaker.

**Stage 4: Physical consequences**
- Recalls and contamination (S24), wholesale prices (S35), food CPI (S26), supermarket/retail outage probes (S22), crowd reports of empty shelves (S39).

**What the score does with it**
- Stage 1-2 only → at most **Yellow** (awareness: "digital threat level elevated; do your 10-min cyber hygiene").
- Stage 3 confirmed outage in payments/telecom/transit → **Orange** for the affected domain with a specific action (cash, offline, alternatives).
- Stage 2 + Stage 4 evidence for food/cold-chain → Orange for D1 with food-safety guidance (fridge ≤ 4 h unopened-door rule, freezer ≈ 48 h if full and closed ⚠ verify against ANSES guidance).
- Whether it is cyber or a bug is **irrelevant to the action**: the response is the same, so don't spend effort on attribution.

**Cannot be done:** knowing in advance that "a specific company will be hit". The system offers *posture + fast confirmation*, never prediction of a given attack.

---

## 4. Climate / ENSO treatment

ENSO is slow, global and indirect for Paris. Use it as a **background prior**, not an alert:
- S10 (ONI) and S11 (weekly Niño 3.4 anomaly): phase (El Niño ≥ +0.5, La Niña ≤ −0.5), with 3-month trend.
- Effects to expose in the "Be Ready" view: higher chance of record global temperature the year after a strong El Niño, shocks to cocoa/coffee/rice/olive oil/wheat prices (feeds D7/D8 via S26, S40).
- For Paris itself use the 7-day forecast (S08) and official vigilance (S09); seasonal outlooks (ECMWF/Copernicus ⚠ 🔑) as an experimental layer only.

---

## 5. Priorities for building sensors

1. Coverage today with keyless ✅ feeds: **A1/A3/A4/A7 (probes, IODA, KEV, CERT-FR, RansomLook), B1/B2 (Ecowatt, eco2mix), B5 (fuel), C1-C6 (Open-Meteo, Hub'Eau, VigiEau, Vigilance), D3 (RappelConso), E1/E2 (Sentiweb), F2 (GDELT), C8 (ONI)**.
2. Free keys to request on day 1: PRIM, ENTSO-E, GIE, Météo-France, Airparif.
3. Data to ask agencies for: Enedis outage map, ARS water incidents, IRSN radiation network, SNCF/RATP strike notices.
