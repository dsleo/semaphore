// Per-commune layer: landing page (autocomplete + France map) and live local sources.
// Paris keeps the full server-built state.json; any other commune gets local hazards computed here, in the
// browser, from CORS-open public APIs, combined with the national hazards already in state.json.
// ponytail: no persistence/hysteresis for local hazards (no per-visitor history); add a localStorage replay if flapping shows.
const LGEO = "https://geo.api.gouv.fr", LPARIS = "75056";
const LF = "fields=nom,code,codesPostaux,centre,population,departement,region,codeEpci";
const lget1 = (u, ms) => fetch(u, { signal: AbortSignal.timeout(ms) }).then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
// retry transient failures (network, timeout, 429/5xx) twice with backoff; 4xx other than 429 is final
async function lget(u, ms = 15000) {
  for (let i = 0; ; i++) {
    try { return await lget1(u, ms); }
    catch (e) { if (i >= 2 || /HTTP 4(?!29)/.test(e.message)) throw e; await new Promise(r => setTimeout(r, 800 * 2 ** i)); }
  }
}
const safeUrl = h => /^https?:\/\//.test(h) ? h : "#";  // only web links reach an href
const lclamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const linterp = (x, p) => { if (x <= p[0][0]) return p[0][1]; for (let i = 1; i < p.length; i++) if (x <= p[i][0]) return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * (x - p[i - 1][0]) / (p[i][0] - p[i - 1][0]); return p[p.length - 1][1]; };
const lT = (fr, en) => ({ fr, en });

// ---- scoring (port of semaphore/score.py, same rules, no damping)
// Every tunable rule (level thresholds, impact, sources, heat thresholds, source kind/refresh) comes from data/config.json, i.e.
// semaphore/config.json: change it there, once. Not loaded -> LV is null and everything local is "unknown", never a calm default.
let LV = null, LCFG = {}, LHEAT = null, LCM = {}, LPCFG = {};
const LOCAL_HAZARDS = ["heat", "weather", "fuel", "flood", "drought"];  // the hazards this file can compute (which collectors exist here)
function lConfigure(conf) {
  LPCFG = Object.fromEntries(["heat", "weather", "power", "fuel", "flood", "drought"].map(h => [h, { impact: conf.hazards[h].impact, domain: conf.hazards[h].domain, cap: !!conf.hazards[h].demand_sensitive }]));  // hazards the Paris live overlay re-scores
  LV = conf.levels; LHEAT = conf.heat_thr; LCM = conf.meta;
  LCFG = Object.fromEntries(LOCAL_HAZARDS.map(h => [h, { impact: conf.hazards[h].impact, domain: conf.hazards[h].domain, src: conf.hazards[h].sources.filter(x => x !== "seine"), cap: !!conf.hazards[h].demand_sensitive }]));  // seine: Paris-only sensor
}
const lLevel = r => LV ? LV.filter(t => r >= t).length : null;
function lH(inds) {  // noisy-OR across evidence families, strongest of each family
  const best = {};
  for (const i of inds) if (i.kind !== "context") best[i.fam] = Math.max(best[i.fam] ?? 0, lclamp(i.w * i.s));
  return 100 * (1 - Object.values(best).reduce((p, v) => p * (1 - v), 1));
}
function lScore(cfg, inds) {
  if (!inds.some(i => i.kind !== "context")) return { level: null, R: null, H: null, cand: null, held: null, up: 0, down_since: null };
  const H = lH(inds), floor = Math.max(0, ...inds.map(i => i.floor || 0));
  const R = Math.max(H * (0.6 + 0.1 * (cfg.impact - 1)), floor);
  let cand = lLevel(R), capped = false;
  if (cfg.cap && cand === 3 && !inds.some(i => i.official && i.s > 0)) { cand = 2; capped = true; }
  return { level: cand, R: Math.round(R * 10) / 10, H: Math.round(H * 10) / 10, cand, held: null, capped, up: 0, down_since: null };
}
const lShown = s => s.level >= 3 || s.R == null || !LV ? s.R : Math.min(s.R, LV[s.level] - 0.1);  // port of score.shown_R
function lHeadline(hz) {
  const known = Object.entries(hz).filter(([, s]) => s.level != null);
  if (!known.length) return { level: null, score: null, systemic: false, top: [] };
  const top = known.filter(([, s]) => s.level >= 1).sort((a, b) => b[1].level - a[1].level || b[1].R - a[1].R).map(([h]) => h);
  const doms = new Set(known.filter(([, s]) => s.level >= 2).map(([, s]) => s.domain));
  return { level: Math.max(...known.map(([, s]) => s.level)), score: Math.round(Math.max(...known.map(([, s]) => lShown(s)))), systemic: doms.size >= 2, top };
}

// ---- local sources (kind/area/refresh mirror semaphore/sources.py META)
const LAREA = { weather: "commune", vigilance: "dept", vigicrues: "commune", vigieau: "commune", fuel: "dept", seine: "paris", ecowatt: "france", eco2mix: "france" };  // what each source covers when read for a commune
function lind(id, hazard, label, value, s, w, source, link, query, rule, o = {}) {
  const { kind, fam } = LCM[source], area = o.area || LAREA[source];
  return { id, hazard, label, value, s: Math.round(lclamp(s) * 1000) / 1000, w, source, link, query, sha: "", rule, official: !!o.official, floor: o.floor || 0, fetched: new Date().toISOString(), pub: o.pub || null, kind, area, fam: fam === "@hazard" ? hazard : fam };
}
const lHeatThr = c => LHEAT.urban_deps.includes(c.dep) ? LHEAT.urban : LHEAT.default;  // Paris biometeo criterion; elsewhere an approximate national one (official canicule vigilance has the exact per-département values)

async function lWeather(c) {
  const q = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&timezone=Europe%2FParis&forecast_days=7&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max`;
  const D = (await lget(q)).daily, days = D.time, z = a => a.map(x => x ?? 0);
  // same rule as sources.forecast_series: a missing value is "unavailable", never a calm 0
  if (D.temperature_2m_max.includes(null) || D.temperature_2m_min.includes(null) || D.wind_gusts_10m_max.slice(0, 3).includes(null) || D.precipitation_sum.slice(0, 3).includes(null)) throw new Error("forecast has missing values");
  const tx = z(D.temperature_2m_max), tn = z(D.temperature_2m_min), gust = z(D.wind_gusts_10m_max), rain = z(D.precipitation_sum);
  const [X, N] = lHeatThr(c), avg = (a, i) => (a[i] + a[i + 1] + a[i + 2]) / 3;
  let bs = 0, bi = 0;
  for (let i = 0; i < tx.length - 2; i++) { const s = lclamp(Math.min((avg(tx, i) - (X - 4)) / 4, (avg(tn, i) - (N - 4)) / 4)); if (s > bs) { bs = s; bi = i; } }
  const s1 = Math.max(...tx.map(t => lclamp((t - 33) / 7))), link = "https://open-meteo.com/", cold = Math.min(...tn.slice(0, 3)), g = Math.max(...gust.slice(0, 3)), r = Math.max(...rain.slice(0, 3));
  const w = (id, hz, fr, en, v, s, rf, re) => lind(id, hz, lT(fr, en), v, s, 0.7, "weather", link, q, lT(rf, re));
  return [
    w("heat.forecast", "heat", "Chaleur prévue (7 jours)", "Forecast heat (7 days)", `Tmax max ${Math.max(...tx).toFixed(0)} °C · Tmin max ${Math.max(...tn).toFixed(0)} °C · 3 j. depuis ${days[bi]}: ${avg(tx, bi).toFixed(1)}/${avg(tn, bi).toFixed(1)} °C`, Math.max(bs, s1),
      `Seuil indicatif : moyenne 3 j. Tmax ≥ ${X} °C et Tmin ≥ ${N} °C (= 1). Un jour ≥ 40 °C = 1. La vigilance canicule officielle fait foi.`, `Indicative threshold: 3-day mean Tmax ≥ ${X} °C and Tmin ≥ ${N} °C (= 1). A day ≥ 40 °C = 1. The official heatwave vigilance prevails.`),
    w("weather.cold", "weather", "Froid prévu (3 jours)", "Forecast cold (3 days)", `Tmin ${cold.toFixed(0)} °C`, linterp(-cold, [[0, 0], [3, 0.4], [8, 1]]), "0 °C = 0 ; −3 °C = 0,4 ; −8 °C = 1.", "0 °C = 0; −3 °C = 0.4; −8 °C = 1."),
    w("weather.wind", "weather", "Rafales prévues (3 jours)", "Forecast gusts (3 days)", `${g.toFixed(0)} km/h`, linterp(g, [[60, 0], [80, 0.4], [110, 1]]), "60 km/h = 0 ; 80 = 0,4 ; 110 = 1.", "60 km/h = 0; 80 = 0.4; 110 = 1."),
    w("weather.rain", "weather", "Pluie prévue en 24 h (3 jours)", "Forecast 24 h rain (3 days)", `${r.toFixed(0)} mm`, linterp(r, [[20, 0], [40, 0.5], [60, 1]]), "20 mm = 0 ; 40 = 0,5 ; 60 = 1 (risque d'inondation rapide).", "20 mm = 0; 40 = 0.5; 60 = 1 (flash-flood risk).")];
}

const LCOL = { 1: ["vert", "green"], 2: ["jaune", "yellow"], 3: ["orange", "orange"], 4: ["rouge", "red"] };
async function lVigilance(c) {
  const q = "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/weatherref-france-vigilance-meteo-departement/records?"
    + new URLSearchParams({ where: `domain_id in ("${c.dep}","${c.dep}10")`, limit: 100 });
  const rows = (await lget(q)).results;
  if (!rows.length) throw new Error("no vigilance rows for " + c.dep);
  const pub = rows.map(r => r.product_datetime).sort().pop();
  if ((Date.now() - new Date(pub)) / 36e5 > 18) throw new Error("vigilance bulletin older than 18 h");
  const groups = { heat: [], weather: [], flood: [] };
  for (const r of rows) { const p = r.phenomenon.toLowerCase(); groups[p.includes("canicule") ? "heat" : /crue|inond/.test(p) ? "flood" : "weather"].push(r); }
  const where = c.depNom || c.dep, names = {
    heat: lT(`Vigilance Météo-France : canicule (${where})`, `Météo-France vigilance: heatwave (${where})`),
    weather: lT(`Vigilance Météo-France : vent, pluie, orages, neige, froid (${where})`, `Météo-France vigilance: wind, rain, storms, snow, cold (${where})`),
    flood: lT(`Vigilance Météo-France : crues (${where})`, `Météo-France vigilance: floods (${where})`)
  };
  const out = [];
  for (const [hz, rs] of Object.entries(groups)) {
    if (!rs.length && hz === "heat") continue;  // heat rows exist only when in play; the forecast carries heat. A fresh bulletin without crues rows = green flood vigilance.
    const top = rs.reduce((a, r) => !a || r.color_id > a.color_id ? r : a, null), k = top ? top.color_id : 1, hot = top && k > 1;
    const day = top && top.echeance === "J";
    out.push(lind(`vigilance.${hz}`, hz, names[hz], lT(hot ? `${LCOL[k][0]} · ${top.phenomenon} (${day ? "aujourd’hui" : "demain"})` : "vert", hot ? `${LCOL[k][1]} · ${top.phenomenon} (${day ? "today" : "tomorrow"})` : "green"),
      { 1: 0, 2: 0.25, 3: 0.6, 4: 1 }[k], 1.0, "vigilance", "https://vigilance.meteofrance.fr", q,
      lT("Vert 0 ; jaune 0,25 ; orange 0,6 (plancher « Préparez-vous ») ; rouge 1 (plancher « Agissez »). Aujourd'hui et demain. Les petits cours d'eau sont suivis par Vigicrues.", "Green 0; yellow 0.25; orange 0.6 (floor “Prepare”); red 1 (floor “Act”). Today and tomorrow. Smaller rivers are tracked by Vigicrues."),
      { official: true, floor: { 3: 50, 4: 80 }[k] || 0, pub }));
  }
  return out;
}

async function lVigieau(c) {
  const q = `https://api.vigieau.beta.gouv.fr/api/zones?lon=${c.lon}&lat=${c.lat}`;
  const zones = await lget(q), rank = { vigilance: 1, alerte: 2, alerte_renforcee: 3, crise: 4 };
  const top = Math.max(0, ...zones.map(z => rank[z.niveauGravite] || 0));
  const fr = ["aucune", "vigilance", "alerte", "alerte renforcée", "crise"][top], en = ["none", "watch", "alert", "heightened alert", "crisis"][top];
  return [lind("drought.restrictions", "drought", lT(`Restrictions d'eau (VigiEau, ${c.nom})`, `Water restrictions (VigiEau, ${c.nom})`), lT(fr, en), [0, 0.15, 0.4, 0.7, 1][top], 1.0, "vigieau", "https://vigieau.gouv.fr", q,
    lT("Vigilance 0,15 ; alerte 0,4 ; alerte renforcée 0,7 ; crise 1.", "Watch 0.15; alert 0.4; heightened 0.7; crisis 1."), { official: true })];
}

const LIDF = ["75", "77", "78", "91", "92", "93", "94", "95"];
async function lFuel(c) {
  const base = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?";
  const count = w => lget(base + new URLSearchParams({ limit: 0, where: w })).then(d => d.total_count);
  const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10), idf = c.code === LPARIS, dep = idf ? `(code_departement in (${LIDF.map(d => `"${d}"`).join(",")}))` : `code_departement="${c.dep}"`;
  return Promise.all([["gazole", "Diesel"], ["e10", "SP95-E10"]].map(async ([f, name]) => {
    const wk = `${dep} and ${f}_rupture_type="temporaire" and ${f}_rupture_debut >= date'${since}'`;
    const [n, k] = await Promise.all([count(`${dep} and (${f}_prix is not null or ${f}_rupture_type="temporaire")`), count(wk)]);
    if (n < (idf ? 30 : 15)) throw new Error(`only ${n} stations carry ${name} in ${idf ? "IdF" : c.dep}`);
    const r = k / n, d = idf ? "Île-de-France" : c.depNom || c.dep;
    return lind(`fuel.${f}`, "fuel", lT(`Stations ${name} en rupture (${d})`, `${name} stations out of stock (${d})`), `${k} / ${n} stations déclarantes (${(r * 100).toFixed(1)} %)`, linterp(r, [[0.10, 0], [0.15, 0.5], [0.25, 1]]), 0.8, "fuel",
      "https://data.economie.gouv.fr/explore/dataset/prix-des-carburants-en-france-flux-instantane-v2/", base + wk,
      lT("Normal ≈ 8 %. 15 % = tension (0,5). 25 % = grave (1). Seules les ruptures temporaires déclarées depuis 14 jours comptent. Mesure des ruptures déclarées par les stations du département, pas un recensement.", "Normal ≈ 8 %. 15 % = tension (0.5). 25 % = severe (1). Only temporary stockouts declared in the last 14 days count. Counts stockouts declared by the département's stations, not a census."), idf ? { area: "idf" } : {});
  }));
}

// ---- build a state.json-shaped object for a commune: local hazards live, national ones from state.json
async function lBuild(c, N) {
  if (!LV) throw new Error("rules not loaded");  // no config: the page shows its error state, never made-up levels
  const run = [["weather", lWeather], ["vigilance", lVigilance], ["vigieau", lVigieau], ["fuel", lFuel], ["vigicrues", lVigicrues]];
  const res = await Promise.allSettled(run.map(([, f]) => f(c))), now = new Date().toISOString(), ok = {}, inds = [], sources = {};
  run.forEach(([id], k) => {
    const r = res[k]; ok[id] = r.status === "fulfilled"; if (ok[id]) inds.push(...r.value);
    sources[id] = { ...N.sources[id], ok: ok[id], err: ok[id] ? null : String(r.reason).slice(0, 160), n: ok[id] ? r.value.length : 0, last_ok: ok[id] ? now : null, status: ok[id] ? "current" : "down", area: LAREA[id], kind: LCM[id].kind, every: LCM[id].every };
  });
  const NAT = ["weather", "vigilance", "vigieau", "fuel", "seine", "vigicrues", "traffic"];
  for (const [id, s] of Object.entries(N.sources)) if (!NAT.includes(id)) sources[id] = s;
  const hazards = {};
  for (const hid of Object.keys(N.hazards)) {
    const cfg = LCFG[hid];
    if (!LOCAL_HAZARDS.includes(hid)) { hazards[hid] = N.hazards[hid]; continue; }
    if (!cfg) { hazards[hid] = { level: null, R: null, H: null, cand: null, held: null, up: 0, down_since: null, domain: N.hazards[hid].domain, missing: ["config"], indicators: [] }; continue; }
    const hi = inds.filter(i => i.hazard === hid), st = lScore(cfg, hi);
    hazards[hid] = { ...st, domain: cfg.domain, missing: cfg.src.filter(s => !ok[s]), indicators: hi.sort((a, b) => b.s * b.w - a.s * a.w) };
  }
  const alerts = [...inds.filter(i => i.official && i.s > 0), ...(N.alerts || []).filter(a => a.source === "ecowatt")]
    .map(i => ({ id: i.id, label: i.label, value: i.value, s: i.s, floor: i.floor, source: i.source, link: i.link, area: i.area, pub: i.pub, fetched: i.fetched })).sort((a, b) => b.s - a.s);
  const st = Object.values(sources), news = N.context && N.context.news;
  const trends = Object.fromEntries(Object.entries(N.trends || {}).filter(([k]) => ["power", "digital", "supply"].includes(k)));
  return {
    generated: N.generated, repo: N.repo, shadow: N.shadow, paris: false, commune: c,
    coverage: { ok: st.filter(s => s.status === "current").length, late: st.filter(s => s.status === "late").length, down: st.filter(s => s.status === "down").length, total: st.length },
    alerts, headline: lHeadline(hazards), hazards, trends, sources,
    context: { ...(N.context || {}), traffic: undefined, news: news && { ...news, items: news.items.filter(i => i.scope !== "paris") } }
  };
}
// Vigicrues (official flood vigilance): the 2 MB feed has no CORS headers, so the Action thins it into data/vigicrues.json (river sections
// above green, with a polyline). A commune counts as concerned when a vertex of such a section is within 5 km. Green = nothing within 5 km
// (this cannot tell "no river" from "river at green"); a file older than 12 h is "unavailable", never green.
async function lVigicrues(c) {
  const V = await lget(`data/vigicrues.json?t=${Math.floor(Date.now() / 3e5)}`, 20000);
  if ((Date.now() - new Date(V.generated)) / 36e5 > 12) throw new Error("Vigicrues file older than 12 h");
  const near = V.items.map(i => ({ ...i, km: Math.min(...i.p.map(([lo, la]) => lkm(c.lat, c.lon, la, lo))) })).filter(i => i.km <= 5).sort((a, b) => b.l - a.l || a.km - b.km);
  const k = near.length ? near[0].l : 1, hot = k > 1;
  const names = near.filter(i => i.l > 1).map(i => i.n).slice(0, 3).join(", ");
  return [lind("flood.vigicrues", "flood", lT("Vigilance crues Vigicrues (cours d'eau à moins de 5 km)", "Vigicrues flood vigilance (rivers within 5 km)"),
    hot ? lT(`${LCOL[k][0]} · ${names}`, `${LCOL[k][1]} · ${names}`) : lT("vert (aucun tronçon en vigilance à moins de 5 km)", "green (no section under watch within 5 km)"),
    { 1: 0, 2: 0.25, 3: 0.6, 4: 1 }[k], 1.0, "vigicrues", V.link || "https://www.vigicrues.gouv.fr/", "data/vigicrues.json",
    lT("Vert 0 ; jaune 0,25 ; orange 0,6 (plancher « Préparez-vous ») ; rouge 1 (plancher « Agissez »). Vigilance officielle du service de prévision des crues, tronçons à moins de 5 km ; mise à jour avec les données du site.", "Green 0; yellow 0.25; orange 0.6 (floor “Prepare”); red 1 (floor “Act”). Official flood-forecasting service vigilance, sections within 5 km; refreshed with the site's data run."),
    { official: true, floor: { 3: 50, 4: 80 }[k] || 0, pub: V.pub })];
}
// ---- Paris: the server-built state.json is the base (damping, trends, history, press, cyber...). Every source a browser can read (all
// CORS-open: Open-Meteo, Météo-France vigilance, VigiEau, Hub'Eau, Ecowatt and eco2mix on ODRE, fuel) is re-read live, and the hazards it
// feeds are re-scored with the same rules, without damping (like every other commune). A live source that fails keeps its server value.
// Not readable from a browser (no CORS headers): press RSS, CERT-FR, CISA KEV, RansomLook, NOAA ONI (Vigicrues goes through data/vigicrues.json). They stay server-side.
const LODRE = "https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets/";
async function lSeine() {
  const q = "https://hubeau.eaufrance.fr/api/v2/hydrometrie/observations_tr?code_entite=F700000103&grandeur_hydro=H&size=100&sort=desc&fields=date_obs,resultat_obs";
  const rows = (await lget(q)).data;
  if (!rows.length) throw new Error("no Seine reading");
  const t0 = new Date(rows[0].date_obs), last = rows[rows.length - 1];
  if ((Date.now() - t0) / 36e5 > 3) throw new Error("latest Seine reading older than 3 h");
  const lvl = rows[0].resultat_obs / 1000, hours = (t0 - new Date(last.date_obs)) / 36e5, rise = hours >= 6 ? (lvl - last.resultat_obs / 1000) / hours * 24 : 0;
  const s = Math.max(linterp(lvl, [[3, 0], [4, 0.4], [5, 0.8], [6, 1]]), linterp(rise, [[0.3, 0], [0.8, 0.4], [1.5, 0.8]]));
  return [lind("flood.seine", "flood", lT("Seine à Paris-Austerlitz", "Seine at Paris-Austerlitz"), `${lvl.toFixed(2)} m · ${rise >= 0 ? "+" : ""}${rise.toFixed(2)} m/jour`, s, 0.6, "seine", "https://www.vigicrues.gouv.fr", q,
    lT("Niveau 3 m = 0 ; 4 m = 0,4 ; 5 m = 0,8 ; 6 m = 1 (repères de crues 2016/2018 : ≈ 6 m). Montée > 0,3 m/jour compte. Seuils à confirmer avec Vigicrues.", "Level 3 m = 0; 4 m = 0.4; 5 m = 0.8; 6 m = 1 (2016/2018 floods ≈ 6 m). Rise > 0.3 m/day counts. Thresholds to confirm with Vigicrues."), { pub: rows[0].date_obs })];
}
async function lEcowatt() {
  const q = LODRE + "nouveau_signal_ecowatt/records?" + new URLSearchParams({ limit: 3, order_by: "date desc" });
  const r = (await lget(q)).results[0], age = Math.floor((Date.now() - new Date(r.date + "T00:00:00Z")) / 864e5);
  if (age > 3) throw new Error(`latest Ecowatt row is ${age} days old`);
  const c = +r.couleur_du_jour, nm = { 1: ["vert", "green"], 2: ["orange", "orange"], 3: ["rouge", "red"] }[c] || ["vert", "green"];
  return [lind("power.ecowatt", "power", lT("Signal Ecowatt (RTE)", "Ecowatt signal (RTE)"), lT(`${nm[0]} (${r.date})`, `${nm[1]} (${r.date})`), { 1: 0, 2: 0.6, 3: 1 }[c] || 0, 1.0, "ecowatt", "https://www.monecowatt.fr", q,
    lT("Vert = 0. Orange = tension (plancher « Préparez-vous »). Rouge = coupures possibles (plancher « Agissez »).", "Green = 0. Orange = tension (floor “Prepare”). Red = outages possible (floor “Act”)."), { official: true, floor: { 2: 50, 3: 80 }[c] || 0, pub: r.date })];
}
async function lEco2mix() {
  const q = LODRE + "eco2mix-national-tr/records?" + new URLSearchParams({ limit: 1, where: "consommation is not null", order_by: "date_heure desc", select: "date_heure,consommation,prevision_j" });
  const r = (await lget(q)).results[0], age = (Date.now() - new Date(r.date_heure)) / 6e4;
  if (age > 90) throw new Error(`latest eco2mix point is ${Math.round(age)} min old`);
  const ratio = r.consommation / r.prevision_j;
  return [lind("power.load", "power", lT("Consommation nationale vs prévision", "National load vs forecast"), `${r.consommation} / ${r.prevision_j} MW (${Math.round(ratio * 100)} %)`, linterp(Math.abs(ratio - 1), [[0.06, 0], [0.12, 0.5], [0.20, 1]]), 0.8, "eco2mix", "https://www.rte-france.com/eco2mix", q,
    lT("Écart > 6 % entre consommation réelle et prévue : anomalie ; > 20 % : effondrement ou pic extrême.", "Gap > 6 % between actual and forecast load = anomaly; > 20 % = collapse or extreme peak."), { pub: r.date_heure })];
}
// Paris works and events (Ville de Paris open data, CORS-open): same filtering as sources.traffic() on the server. Listed, never scored.
async function lTraffic() {
  const base = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/circulation_evenement/records?", t = new Date(), rows = [];
  for (const offset of [0, 100, 200]) {  // dates are text in this dataset, so filter here, not in the query
    const d = await lget(base + new URLSearchParams({ limit: 100, offset, select: "description,street,type,starttime,endtime" }));
    rows.push(...d.results); if (rows.length >= d.total_count) break;
  }
  const act = new Map();
  for (const r of rows) {
    const a = new Date(r.starttime), b = new Date(r.endtime);
    if (isNaN(a) || isNaN(b) || !(a <= t && t <= b)) continue;
    const x = { street: (r.street || "").replace(/_/g, " "), what: (r.description || "").replace(/_/g, " "), closed: r.type === "ROAD_CLOSED", until: b.toISOString().slice(0, 19) + "Z" };
    act.set(x.street + "\u0000" + x.what, x);  // same works listed once per direction
  }
  const items = [...act.values()].sort((x, y) => (y.closed - x.closed) || x.until.localeCompare(y.until));
  return { n: items.length, closed: items.filter(x => x.closed).length, items: items.slice(0, 30), fetched: t.toISOString(), link: "https://opendata.paris.fr/explore/dataset/circulation_evenement/", sha: "" };
}
async function lBuildParis(c, N) {
  const run = [["weather", lWeather], ["vigilance", lVigilance], ["vigieau", lVigieau], ["fuel", lFuel], ["vigicrues", lVigicrues], ["seine", lSeine], ["ecowatt", lEcowatt], ["eco2mix", lEco2mix]];
  const [res, traffic] = await Promise.all([Promise.allSettled(run.map(([, f]) => f(c))), lTraffic().catch(() => null)]), now = new Date().toISOString(), ok = {}, inds = [], sources = { ...N.sources };
  if (traffic) sources.traffic = { ...N.sources.traffic, ok: true, err: null, n: traffic.n, last_ok: now, status: "current" };
  run.forEach(([id], k) => {
    const r = res[k]; ok[id] = r.status === "fulfilled"; if (!ok[id]) return;
    inds.push(...r.value);
    sources[id] = { ...N.sources[id], ok: true, err: null, n: r.value.length, last_ok: now, status: "current" };
  });
  const hazards = { ...N.hazards };
  for (const [hid, cfg] of Object.entries(LPCFG)) {
    const live = inds.filter(i => i.hazard === hid);
    if (!live.length) continue;  // nothing live for this hazard: keep the server state (with its damping)
    const hi = [...((N.hazards[hid] && N.hazards[hid].indicators) || []).filter(i => !ok[i.source]), ...live];
    hazards[hid] = { ...lScore(cfg, hi), domain: cfg.domain, missing: ((N.hazards[hid] && N.hazards[hid].missing) || []).filter(s => !ok[s]), indicators: hi.sort((a, b) => b.s * b.w - a.s * a.w) };
  }
  const alerts = [...inds.filter(i => i.official && i.s > 0), ...(N.alerts || []).filter(a => !ok[a.source])]
    .map(i => ({ id: i.id, label: i.label, value: i.value, s: i.s, floor: i.floor, source: i.source, link: i.link, area: i.area, pub: i.pub, fetched: i.fetched })).sort((a, b) => b.s - a.s);
  const st = Object.values(sources);
  return {
    ...N, paris: true, commune: c, live: now, context: traffic ? { ...N.context, traffic } : N.context, alerts, headline: lHeadline(hazards), hazards, sources,
    coverage: { ok: st.filter(s => s.status === "current").length, late: st.filter(s => s.status === "late").length, down: st.filter(s => s.status === "down").length, total: st.length }
  };
}
const lResolve = code => lget(`${LGEO}/communes/${encodeURIComponent(code)}?${LF}`).then(lNorm);
const lNorm = r => ({ code: r.code, nom: r.nom, dep: r.departement.code, depNom: r.departement.nom, reg: r.region && r.region.code, epci: r.codeEpci, cp: (r.codesPostaux || [])[0], pop: r.population, lon: r.centre.coordinates[0], lat: r.centre.coordinates[1] });

// ---- wording that names Paris/Seine/IdF in messages.json, made generic for other communes
const LMSG = {
  fr: { flood: { title: "Crue ou inondation", what: "Une vigilance crues ou inondation est en cours dans votre département. Routes, berges, caves et parkings souterrains peuvent être touchés." } },
  en: { flood: { title: "River flood or flooding", what: "A flood vigilance is in force in your département. Roads, riverbanks, cellars and underground car parks may be affected." } }
};
const LSUB = { fr: [[/à Paris/g, "dans votre commune"], [/la zone de Paris/g, "votre zone"], [/d'Île-de-France/g, "de votre département"]], en: [[/for Paris/g, "for your area"], [/the Paris area/g, "your area"], [/Île-de-France stations/g, "stations in your département"]] };
function lMsg(m, id) {
  if (!S || S.paris) return m;
  const o = LMSG[lang][id] || {};
  return { ...m, ...o, what: LSUB[lang].reduce((s, [a, b]) => s.replace(a, b), o.what || m.what) };
}
const lHn = id => id === "flood" && S && !S.paris ? ({ fr: "Crues et inondations", en: "Floods" })[lang] : u().hnames[id];

// ---- landing: autocomplete + France map
const LU = {
  fr: { h: "Quels risques près de chez vous ?", lede: "Choisissez votre commune : Semaphore affiche la vigilance météo, l'eau, le carburant, l'électricité, les routes, les transports et le numérique, avec des sources vérifiables.", lab: "Votre commune ou code postal", ph: "Ex. Lyon ou 33000", here: "Ma position", resume: n => `Reprendre : ${n}`, none: "Aucune commune trouvée.", loc: "Position introuvable.", load: "Chargement de la commune…", fail: "Impossible de charger cette commune.",
    cap: "Carte de la France métropolitaine par département", lay: "Risque affiché", layAll: "Tous", layMore: n => `Afficher ${n} autres risques`, layLess: "Moins de risques", riskOn: "Voir la carte des risques", riskTitle: "Carte des risques", back: "← Retour", sumNone: "aucun département concerné pour le moment (tous au niveau le plus bas)", unk: "Données indisponibles", noRisk: "Aucun risque notable", lvlBar: "Échelle de niveau", main: n => `Villes principales : ${n}`, close: "Fermer", noMap: "Carte indisponible.", dom: "Les départements d'outre-mer sont disponibles via la recherche de commune.",
    sNews: "Actualité locale surveillée", newsNote: "Titres de la presse régionale et locale (France 3 régions, ici, quotidiens régionaux), repérés par mot-clé de crise dans les 36 dernières heures, tels que publiés. Non vérifiés par nous, sans effet sur les niveaux.", newsNone: "Aucun titre de crise concernant votre commune ou votre région ces dernières 36 h.", scope: { commune: "Votre commune", dept: "Votre département", region: "Votre région" }, trigger: "mot repéré",
    sLocal: "Perturbations autour de vous", riversT: "Cours d'eau", cote: "cote", in24h: "en 24 h", riversNone: "Aucune station de mesure de cours d'eau en service à moins de 10 km.", riversNote: "Relevés bruts des stations Hub'Eau, sans seuil officiel : ils ne disent pas si un niveau est dangereux. Chaque station a sa propre référence : seule la variation est comparable. La vigilance Vigicrues, évaluée à part, fait foi.", roadsT: "Routes", roadsNone: "Aucun événement sur le réseau routier national à moins de 25 km.", roadsNote: "Bison Futé : réseau routier national non concédé (nationales). Les autoroutes concédées et les routes départementales ne sont pas toutes couvertes.", km: "à", closed: "route coupée",
    transitT: "Transports en commun", transitNone: n => `Aucune alerte en cours sur : ${n}.`, transitNo: "Aucun réseau de votre commune n'est suivi automatiquement : consultez le site de votre opérateur.", transitNote: "Alertes temps réel publiées par les réseaux sur transport.data.gouv.fr. Un réseau absent n'est pas « sans perturbation » : il n'est simplement pas lu.", transitNat: "Alertes SNCF citant votre commune",
    eff: { no_service: "service interrompu", reduced: "service réduit", delays: "retards importants", detour: "déviation", modified: "service modifié", stop_moved: "arrêt déplacé" },
    kind: { Accident: "Accident", AbnormalTraffic: "Circulation dense", VehicleObstruction: "Véhicule ou obstacle", RoadOrCarriagewayOrLaneManagement: "Restriction de circulation", GeneralObstruction: "Obstacle sur la route", WeatherRelatedRoadConditions: "Conditions météo", EnvironmentalObstruction: "Obstacle naturel", InfrastructureDamageObstruction: "Chaussée endommagée", AnimalPresenceObstruction: "Animaux sur la route", GeneralNetworkManagement: "Gestion du réseau" },
    geoT: "Risques naturels et technologiques de votre commune", geoNote: "Profil permanent publié par l'État (Géorisques / GASPAR), pas une alerte : il dit à quoi votre commune est exposée, pas ce qui se passe maintenant.", geoNone: "Aucun risque recensé.", seismic: "Zone sismique", catnat: n => `${n} arrêté${n > 1 ? "s" : ""} de catastrophe naturelle depuis 1982`, geoLink: "Fiche complète sur Géorisques", geoFail: "Géorisques est indisponible pour le moment." },
  en: { h: "What risks are near you?", lede: "Pick your commune: Semaphore shows weather vigilance, water, fuel, power, roads, transit and digital risks, with verifiable sources.", lab: "Your commune or postcode", ph: "E.g. Lyon or 33000", here: "My location", resume: n => `Resume: ${n}`, none: "No commune found.", loc: "Location not found.", load: "Loading the commune…", fail: "Could not load this commune.",
    cap: "Map of metropolitan France by département", lay: "Risk shown", layAll: "All", layMore: n => `Show ${n} more risks`, layLess: "Fewer risks", riskOn: "See the risk map", riskTitle: "Risk map", back: "← Back", sumNone: "no département affected right now (all at the lowest level)", unk: "Data unavailable", noRisk: "No notable risk", lvlBar: "Level scale", main: n => `Main towns: ${n}`, close: "Close", noMap: "Map unavailable.", dom: "Overseas départements are available through the commune search.",
    sNews: "Local news monitored", newsNote: "Headlines from regional and local press (France 3 regions, ici, regional dailies), picked up by crisis keyword in the last 36 hours, as published. Not verified by us, no effect on levels.", newsNone: "No crisis headline about your commune or region in the last 36 h.", scope: { commune: "Your commune", dept: "Your département", region: "Your region" }, trigger: "trigger word",
    sLocal: "Disruptions around you", riversT: "Rivers", cote: "reading", in24h: "in 24 h", riversNone: "No river gauge in service within 10 km.", riversNote: "Raw Hub'Eau gauge readings, with no official threshold: they do not tell whether a level is dangerous. Each station has its own reference: only the change is comparable. The Vigicrues vigilance, scored separately, prevails.", roadsT: "Roads", roadsNone: "No event on the national road network within 25 km.", roadsNote: "Bison Futé: the non-conceded national road network. Conceded motorways and departmental roads are not all covered.", km: "at", closed: "road closed",
    transitT: "Public transport", transitNone: n => `No current alert on: ${n}.`, transitNo: "No network serving your commune is read automatically: check your operator's site.", transitNote: "Real-time alerts published by networks on transport.data.gouv.fr. A missing network is not “no disruption”: it is simply not read.", transitNat: "SNCF alerts naming your commune",
    eff: { no_service: "no service", reduced: "reduced service", delays: "major delays", detour: "detour", modified: "modified service", stop_moved: "stop moved" },
    kind: { Accident: "Accident", AbnormalTraffic: "Heavy traffic", VehicleObstruction: "Vehicle or obstacle", RoadOrCarriagewayOrLaneManagement: "Traffic restriction", GeneralObstruction: "Obstacle on the road", WeatherRelatedRoadConditions: "Weather conditions", EnvironmentalObstruction: "Natural obstacle", InfrastructureDamageObstruction: "Damaged road", AnimalPresenceObstruction: "Animals on the road", GeneralNetworkManagement: "Network management" },
    geoT: "Natural and technological risks in your commune", geoNote: "A permanent profile published by the State (Géorisques / GASPAR), not an alert: it says what your commune is exposed to, not what is happening now.", geoNone: "No risk listed.", seismic: "Seismic zone", catnat: n => `${n} natural-disaster decree${n > 1 ? "s" : ""} since 1982`, geoLink: "Full report on Géorisques", geoFail: "Géorisques is unavailable right now." }
};
const lu = () => LU[lang];
let LMAP = null;
function lLanding() {
  const t = lu(), last = (() => { try { return JSON.parse(localStorage.getItem("commune")); } catch { return null; } })();
  return `<h1>${t.h}</h1><p>${t.lede}</p>
  <div class="pick"><label for="q"><b>${t.lab}</b></label>
  <div class="pickrow"><div class="combo"><input id="q" type="search" role="combobox" aria-expanded="false" aria-controls="qs" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="${esc(t.ph)}"><ul id="qs" role="listbox" hidden></ul></div><button class="btn sec" id="here" type="button">${t.here}</button></div>
  <p class="muted" id="pickmsg" role="status"></p>${last ? `<p><button class="chip" data-code="${esc(last.code)}">${esc(t.resume(last.nom))}</button></p>` : ""}</div>
  ${lMapHtml(false)}`;
}
// map block shared by the landing (plain, with a link to the risk map) and the dedicated risk-map page
const lMapHtml = risk => {
  const t = lu();
  return `<section class="mapbox">${risk ? `<div class="maptools"><div class="chips" id="lay" role="radiogroup" aria-label="${esc(t.lay)}"></div><p class="muted sum" id="sum" role="status"></p></div>` : ""}
    <div class="mapwrap"><div id="fmap" role="group" aria-label="${esc(t.cap)}"><p class="muted">…</p></div>${risk ? `<div class="lgd"><span class="lbar" id="lbar" tabindex="0" role="img" aria-label="${esc(t.lvlBar)}"></span><span class="sw lu" title="${esc(t.unk)}"></span></div>` : ""}</div>
    ${risk ? "" : `<p class="cta"><a class="btn" id="tomap" href="?map=risks">${t.riskOn} →</a></p>`}<p class="muted">${t.dom}</p><div id="maptip" role="tooltip" hidden></div></section>
  <dialog id="deptcity" aria-labelledby="dtitle"></dialog>`;
};
function lRiskPage() {
  const t = lu();
  return `<p><a href="./" id="back">${t.back}</a></p><h1>${t.riskTitle}</h1>${lMapHtml(true)}
  <h2>${esc(u().dMap)}</h2><ul class="plainl">${u().mapRules.map(r => `<li>${esc(r)}</li>`).join("")}</ul>`;
}
const lBindRisk = pick => lBindMap(pick, true);
async function lBindLanding(pick) {
  const t = lu(), q = $("#q"), list = $("#qs"), msg = $("#pickmsg"); let hits = [], act = -1, timer;
  document.querySelectorAll("[data-code]").forEach(b => b.onclick = () => pick(b.dataset.code));
  const close = () => { list.hidden = true; q.setAttribute("aria-expanded", "false"); act = -1; q.removeAttribute("aria-activedescendant"); };
  const mark = () => { [...list.children].forEach((li, i) => li.setAttribute("aria-selected", i === act)); act >= 0 ? q.setAttribute("aria-activedescendant", "o" + act) : q.removeAttribute("aria-activedescendant"); list.children[act]?.scrollIntoView({ block: "nearest" }); };
  const show = () => {
    list.innerHTML = hits.map((r, i) => `<li role="option" id="o${i}" data-i="${i}" aria-selected="false">${esc(r.nom)} <span class="muted">${esc(r.departement ? r.departement.code + " · " + r.departement.nom : "")}${/^\d{5}$/.test(q.value.trim()) && r.codesPostaux ? " · " + esc(r.codesPostaux.includes(q.value.trim()) ? q.value.trim() : r.codesPostaux[0]) : ""}</span></li>`).join("");
    list.hidden = !hits.length; q.setAttribute("aria-expanded", String(!!hits.length)); act = -1;
  };
  const search = async () => {
    const v = q.value.trim(); if (v.length < 2) { close(); return; }
    try {
      hits = await lget(`${LGEO}/communes?${/^\d{5}$/.test(v) ? "codePostal=" + v : "nom=" + encodeURIComponent(v) + "&boost=population"}&limit=8&${LF}`);
      if (q.value.trim() !== v) return;  // a newer keystroke is already in flight
      show(); msg.textContent = hits.length ? "" : t.none;
    } catch { msg.textContent = t.fail; }
  };
  q.oninput = () => { clearTimeout(timer); timer = setTimeout(search, 180); };
  q.onfocus = () => { if (hits.length) { list.hidden = false; q.setAttribute("aria-expanded", "true"); } };
  q.onkeydown = e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { if (!hits.length) return; e.preventDefault(); if (list.hidden) { list.hidden = false; q.setAttribute("aria-expanded", "true"); } act = (act + (e.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length; mark(); }
    else if (e.key === "Enter") { const r = hits[act >= 0 ? act : 0]; if (r) { e.preventDefault(); close(); pick(r.code); } }
    else if (e.key === "Escape") close();
  };
  list.onpointerdown = e => { const li = e.target.closest("[data-i]"); if (li) { e.preventDefault(); close(); pick(hits[+li.dataset.i].code); } };
  document.addEventListener("pointerdown", e => { if (!e.target.closest(".combo")) close(); });
  $("#here").onclick = () => navigator.geolocation ? navigator.geolocation.getCurrentPosition(
    async p => { try { const r = await lget(`${LGEO}/communes?lat=${p.coords.latitude}&lon=${p.coords.longitude}&${LF}`); r[0] ? pick(r[0].code) : msg.textContent = t.loc; } catch { msg.textContent = t.loc; } },
    () => { msg.textContent = t.loc; }) : (msg.textContent = t.loc);
  await lBindMap(pick, false);
}
async function lBindMap(pick, risk) {
  const t = lu();
  try {
    LMAP = LMAP || await lget("data/france-map.json", 20000);
    drawMap();
  } catch { $("#fmap").innerHTML = `<p class="muted">${t.noMap}</p>`; }
  function drawMap() {
    const host = $("#fmap"); if (!host || !LMAP) return;
    host.innerHTML = `<svg viewBox="0 0 ${LMAP.w} ${LMAP.h}" role="presentation">${LMAP.deps.map(d => `<path class="dep" d="${d.d}" data-c="${d.c}" tabindex="0" role="button" aria-label="${esc(d.n)}"></path>`).join("")}</svg>`;
    // risk map: one layer per département-level hazard ("all" = the highest of them). National hazards are the same everywhere, so they are not mapped.
    const DD = typeof D !== "undefined" && D, NATL = ["power", "cyber", "digital", "supply"], lv = M.levels[lang], tip = $("#maptip"), lay = $("#lay"), on = risk && !!DD; let cur = "all", more = false;
    const hname = h => h === "flood" ? ({ fr: "Crues et inondations", en: "Floods" })[lang] : u().hnames[h];
    const level = (c, L) => { const r = (DD && DD.deps[c]) || {}, v = L === "all" ? Object.values(r).map(x => x.l).filter(l => l != null) : r[L] && r[L].l != null ? [r[L].l] : []; return v.length ? Math.max(...v) : null; };
    const val = (c, h) => { const r = DD.deps[c] && DD.deps[c][h]; return r ? (r.v ? tx(r.v) : r.i && r.i.length ? tx([...r.i].sort((a, b) => b[2] - a[2])[0][1]) : "") : ""; };
    // hover text: département name; on the risk map also the risk, its value and level
    const label = p => {
      const d = LMAP.deps.find(x => x.c === p.dataset.c); if (!on) return d.n;
      const L = cur, l = level(p.dataset.c, L); if (l == null) return `${d.n} · ${t.unk}`;
      const hs = L === "all" ? Object.entries(DD.deps[p.dataset.c] || {}).filter(([, x]) => x.l === l).map(([h]) => h) : [L];
      return `${d.n} · ${lv[l]} — ${l === 0 && L === "all" ? t.noRisk : hs.map(h => `${hname(h)}${val(p.dataset.c, h) ? " : " + val(p.dataset.c, h) : ""}`).join(" · ")}`;
    };
    // one line saying what the layer shows (a layer where every département is calm looks the same as "nothing happened")
    const summary = () => {
      const c = {}; let none = 0;
      for (const k of Object.keys(DD.deps)) { const l = level(k, cur); l == null ? none++ : c[l] = (c[l] || 0) + 1; }
      const name = cur === "all" ? t.layAll : hname(cur), hot = [3, 2, 1].filter(l => c[l]).map(l => `${c[l]} ${lv[l]}`);
      $("#sum").textContent = hot.length ? `${name} : ${hot.join(" · ")}${none ? ` · ${none} ${t.unk.toLowerCase()}` : ""}` : `${name} : ${t.sumNone}${none ? ` (${none} ${t.unk.toLowerCase()})` : ""}`;
    };
    const paint = () => { if (on) summary(); host.querySelectorAll(".dep").forEach(p => { const l = on ? level(p.dataset.c, cur) : undefined; p.setAttribute("class", "dep" + (on ? " " + (l == null ? "lu" : "l" + l) : "")); p.setAttribute("aria-label", label(p)); }); };
    function tipAt(text, x, y) { const b = host.closest(".mapbox").getBoundingClientRect(); tip.textContent = text; tip.hidden = false; tip.style.left = Math.max(0, Math.min(x - b.left + 12, b.width - tip.offsetWidth - 4)) + "px"; tip.style.top = (y - b.top + 16) + "px"; }
    host.onpointermove = e => { const p = e.target.closest(".dep"); if (p) tipAt(label(p), e.clientX, e.clientY); else tip.hidden = true; };
    host.onpointerleave = () => { tip.hidden = true; };
    if (risk && !DD) { host.insertAdjacentHTML("beforebegin", `<p class="muted">${t.noMap}</p>`); }
    if (on) {
      // risk chips: "All" + the few most common ones; the rest behind a "+N" button (a hidden risk that is selected stays visible)
      const ids = ["all", ...DD.hazards.filter(h => !NATL.includes(h))], FIRST = ["all", "heat", "weather", "flood", "air"];
      const short = h => ({ weather: { fr: "Vent, pluie, froid", en: "Wind, rain, cold" }, flood: { fr: "Crues", en: "Floods" } })[h]?.[lang] || hname(h);  // shorter labels for the chips only
      const chips = () => {
        const shown = more || !FIRST.includes(cur) ? ids : ids.filter(h => FIRST.includes(h)), hid = ids.length - shown.length;
        lay.innerHTML = shown.map(h => `<button type="button" role="radio" class="chip${h === cur ? " on" : ""}" aria-checked="${h === cur}" data-h="${h}">${esc(h === "all" ? t.layAll : short(h))}</button>`).join("")
          + (hid ? `<button type="button" class="chip more" data-more aria-label="${esc(t.layMore(hid))}">+${hid}</button>` : more ? `<button type="button" class="chip more" data-more aria-label="${esc(t.layLess)}">−</button>` : "");
      };
      lay.onclick = e => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.more !== undefined) more = !more; else cur = b.dataset.h; chips(); paint(); lay.querySelector(`[data-h="${cur}"]`)?.focus(); };
      chips();
      // compact colour bar: hover (or focus + arrow keys) names the level under the pointer
      const bar = $("#lbar"), at = y => 3 - Math.min(3, Math.max(0, Math.floor(y * 4)));  // vertical bar: top = highest level
      bar.onpointermove = e => { const r = bar.getBoundingClientRect(); tipAt(lv[at((e.clientY - r.top) / r.height)], e.clientX, e.clientY); };
      bar.onpointerleave = () => { tip.hidden = true; };
      bar.onkeydown = e => { if (e.key.startsWith("Arrow")) { e.preventDefault(); const r = bar.getBoundingClientRect(), n = (bar._n = ((bar._n ?? -1) + (e.key === "ArrowUp" || e.key === "ArrowRight" ? 1 : -1) + 4) % 4); tipAt(lv[n], r.left - 8, r.top + r.height * (3.5 - n) / 4); } };
      bar.onblur = () => { tip.hidden = true; };
    }
    paint();
    const dlg = $("#deptcity");
    dlg.onclick = e => { if (e.target === dlg || e.target.closest("[data-close]")) dlg.close(); };
    const open = async el => {
      const d = LMAP.deps.find(x => x.c === el.dataset.c);
      dlg.innerHTML = `<div class="dlg"><button class="x" data-close type="button" aria-label="${esc(t.close)}">×</button><h2 id="dtitle">${esc(t.main(d.n))}</h2><div id="dbody"><p class="muted">…</p></div></div>`;
      dlg.showModal();
      try {
        const rows = (await lget(`${LGEO}/departements/${d.c}/communes?fields=nom,code,population`)).sort((a, b) => (b.population || 0) - (a.population || 0)).slice(0, 12);
        $("#dbody").innerHTML = rows.map(r => `<button class="chip" data-code="${esc(r.code)}">${esc(r.nom)}</button>`).join(" ");
        $("#dbody").querySelectorAll("[data-code]").forEach(b => b.onclick = () => { dlg.close(); pick(b.dataset.code); });
      } catch { $("#dbody").innerHTML = `<p class="muted">${t.fail}</p>`; }
    };
    host.querySelectorAll(".dep").forEach(p => { p.onclick = () => open(p); p.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(p); } }; });
  }
}

// ---- nationwide local layers, filtered for one commune: news, roads, transit, Géorisques
const lnorm = t => " " + String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
const lkm = (a, b, c, d) => { const r = x => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
const lsrc = (name, link, kind, area, every, lic, ok, err, at) => ({ name, link, ok, err: err || null, n: 0, last_ok: ok ? at : null, status: ok ? "current" : "down", every, kind, area, lic });
// "Rhône" must not match "Bouches-du-Rhône", "Loire" not "Haute-Loire" / "Loire-Atlantique"
const ldep = (t, dn) => { const i = t.indexOf(dn); if (i < 0) return false; const b = t.slice(0, i).trim().split(" ").pop(), a = t.slice(i + dn.length).trim().split(" ")[0]; return !["du", "de", "et", "haute", "hautes", "haut", "bas", "basse", "la"].includes(b) && !["atlantique", "maritime", "maritimes", "orientales", "et"].includes(a); };
// River gauges near the commune (Hub'Eau, CORS-open): raw level and 24 h change of up to 4 stations within 10 km. Shown, never scored:
// there is no generic flood threshold for an arbitrary river (the official one is Vigicrues, scored apart).
async function lRivers(c) {
  const h = p => lget(`https://hubeau.eaufrance.fr/api/v2/hydrometrie/${p}`, 20000), geo = `latitude=${c.lat}&longitude=${c.lon}&distance=10`;
  const since = new Date(Date.now() - 24 * 36e5).toISOString().slice(0, 19) + "Z";
  const [st, ob] = await Promise.all([h(`referentiel/stations?${geo}&en_service=1&size=50`), h(`observations_tr?${geo}&grandeur_hydro=H&date_debut_obs=${since}&size=1000&sort=desc&fields=code_station,date_obs,resultat_obs`)]);
  const by = {};
  for (const r of ob.data) (by[r.code_station] = by[r.code_station] || []).push(r);  // newest first
  return st.data.filter(s => by[s.code_station] && s.latitude_station != null).map(s => {
    const rows = by[s.code_station], last = rows[0], first = rows[rows.length - 1], span = (new Date(last.date_obs) - new Date(first.date_obs)) / 36e5;
    return { name: s.libelle_station, river: s.libelle_cours_eau || "", km: lkm(c.lat, c.lon, s.latitude_station, s.longitude_station), at: last.date_obs, lvl: last.resultat_obs / 1000,
      d24: span >= 12 ? (last.resultat_obs - first.resultat_obs) / 1000 : null, fresh: (Date.now() - new Date(last.date_obs)) / 36e5 <= 3 };
  }).filter(x => x.fresh).sort((a, b) => a.km - b.km).filter((x, i, all) => !all.slice(0, i).some(y => y.river === x.river && Math.abs(y.km - x.km) < 0.3)).slice(0, 4);  // one line per site (several gauges share a spot)
}
async function lLocal(c) {
  const g = p => lget(`https://georisques.gouv.fr/api/v1/${p}`), j = f => lget(`data/${f}?t=${Math.floor(Date.now() / 3e5)}`, 20000);
  const [nw, rd, tr, gr, sz, cn, rv] = await Promise.allSettled([j("news-local.json"), j("roads.json"), j("transit.json"), g(`gaspar/risques?code_insee=${c.code}`), g(`zonage_sismique?code_insee=${c.code}`), g(`gaspar/catnat?code_insee=${c.code}&page_size=1`), lRivers(c)]);
  const L = { sources: {} }, now = new Date().toISOString(), val = r => r.status === "fulfilled" ? r.value : null;
  const nm = lnorm(c.nom), dn = lnorm(c.depNom);
  const N = val(nw);
  L.news = N && N.items.map(i => { const t = lnorm(i.t), s = t.includes(nm) ? "commune" : (i.d === c.dep || ldep(t, dn)) ? "dept" : i.r === c.reg ? "region" : null; return s && { ...i, scope: s }; })
    .filter(Boolean).sort((a, b) => ["commune", "dept", "region"].indexOf(a.scope) - ["commune", "dept", "region"].indexOf(b.scope) || b.p.localeCompare(a.p)).slice(0, 10);
  L.newsMeta = N && { themes: N.themes, feeds: N.feeds };
  L.sources.localnews = lsrc("Regional and local press feeds", "https://france3-regions.francetvinfo.fr/", "reported", "france", 15, "titres et liens uniquement", !!N, nw.reason, N && N.generated);
  const R = val(rd);
  L.roads = R && R.items.map(i => ({ ...i, km: lkm(c.lat, c.lon, i.la, i.lo) })).filter(i => i.km <= 25).sort((a, b) => b.x - a.x || a.km - b.km).slice(0, 8);
  L.sources.roads = lsrc("Road events (Bison Futé, DATEX II)", "https://www.bison-fute.gouv.fr", "observed", "dept", 15, "Licence Ouverte 2.0", !!R, rd.reason, R && R.generated);
  const T = val(tr);
  if (T) {
    const m = a => a.some(x => (x.type === "commune" && x.insee === c.code) || (x.type === "epci" && x.insee === c.epci) || (x.type === "departement" && x.insee === c.dep) || (x.type === "region" && x.insee === c.reg));
    const nat = a => a.some(x => x.type === "pays");
    L.transit = { nets: T.networks.filter(n => n.ok && !nat(n.area) && m(n.area) && n.alerts.length).map(n => ({ name: n.name, link: n.link, alerts: n.alerts.slice(0, 6), n: n.alerts.length })),
      followed: T.all.filter(n => n.ok && !nat(n.area) && m(n.area)).map(n => n.name),
      nat: T.networks.filter(n => nat(n.area)).flatMap(n => n.alerts.filter(a => lnorm(a.t).includes(nm)).map(a => ({ ...a, net: n.name }))).slice(0, 4) };
  }
  L.sources.transit = lsrc("Public transport alerts (GTFS-RT, transport.data.gouv.fr)", "https://transport.data.gouv.fr", "official", "commune", 15, "voir les sources", !!T, tr.reason, T && T.generated);
  const G = val(gr);
  if (G && G.data && G.data[0]) {
    const by = {}; for (const r of G.data[0].risques_detail) { const k = r.num_risque.slice(0, 2); (by[k] = by[k] || { label: null, sub: [] }); r.num_risque.length === 2 ? by[k].label = r.libelle_risque_long : by[k].sub.push(r.libelle_risque_long.replace(/^Par /, "par ")); }
    L.geo = { risks: Object.values(by).filter(x => x.label), seismic: val(sz)?.data?.[0]?.zone_sismicite || null, catnat: val(cn)?.results ?? null };
  } else if (G) L.geo = { risks: [], seismic: val(sz)?.data?.[0]?.zone_sismicite || null, catnat: val(cn)?.results ?? null };
  L.rivers = val(rv);
  L.sources.rivers = lsrc("River gauges (Hub'Eau)", "https://hubeau.eaufrance.fr/", "observed", "commune", 60, "Licence Ouverte 2.0", !!L.rivers, rv.reason, now);
  L.sources.georisques = lsrc("Natural and technological risks (Géorisques)", "https://georisques.gouv.fr", "official", "commune", 43200, "Licence Ouverte 2.0", !!G, gr.reason, now);
  return L;
}
function lNewsBlock() {
  const t = lu(), n = S.loc && S.loc.news;
  if (!n) return "";
  const items = n.length ? `<ul class="links">${n.map(i => `<li><span class="muted">${esc(tx(S.loc.newsMeta.themes[i.th]))} · ${esc(t.scope[i.scope])}</span><br><a href="${esc(safeUrl(i.l))}" target="_blank" rel="noopener">${esc(i.t)}</a><br><span class="muted">${esc(i.s)} · ${fmt(i.p)} · ${t.trigger} : « ${esc(i.kw)} »</span></li>`).join("")}</ul>` : `<p>${t.newsNone}</p>`;
  return col(`${t.sNews} (${n.length})`, `<p class="muted">${t.newsNote}</p>${items}`);
}
const lsub = (k, title, body) => `<details class="sub" data-k="sub-${k}" ${OP.has("sub-" + k) ? "open" : ""}><summary>${title}</summary><div class="in">${body}</div></details>`;
function lLocalBlock() {
  const t = lu(), L = S.loc; if (!L) return "";
  const parts = [];
  if (L.roads) parts.push(lsub("roads", t.roadsT, `${L.roads.length ? `<ul class="meas">${L.roads.map(i => `<li><b>${esc(i.road || i.town || "")}</b>${i.x ? ` <span class="badge b1">${t.closed}</span>` : ""} <span class="muted">· ${esc(t.kind[i.k] || i.k)} · ${t.km} ${Math.round(i.km)} km${i.town ? " · " + esc(i.town) : ""}</span><br><span class="muted">${esc(i.t)}</span></li>`).join("")}</ul>` : `<p>${t.roadsNone}</p>`}<p class="muted">${t.roadsNote}</p>`));
  if (L.rivers) parts.push(lsub("rivers", t.riversT, `${L.rivers.length ? `<ul class="meas">${L.rivers.map(r => `<li><b>${esc(r.river || r.name)}</b> <span class="muted">· ${esc(r.name)} · ${t.km} ${Math.round(r.km)} km</span><br>${t.cote} ${r.lvl.toFixed(2)} m${r.d24 == null ? "" : ` <span class="muted">· ${r.d24 >= 0 ? "+" : "−"}${Math.abs(r.d24).toFixed(2)} m ${t.in24h}</span>`} <span class="muted">· ${fmt(r.at)}</span></li>`).join("")}</ul>` : `<p>${t.riversNone}</p>`}<p class="muted">${t.riversNote}</p>`));
  if (S.paris) parts.push(lsub("works", u().trafficT, trafficBody()));
  if (L.transit) {
    const tn = L.transit, body = tn.nets.map(n => `<li><b>${link(n.name, n.link)}</b> <span class="muted">(${n.n})</span><ul class="plainl">${n.alerts.map(a => `<li>${a.e ? `<span class="badge b1">${esc(t.eff[a.e])}</span> ` : ""}${esc(a.t)}</li>`).join("")}</ul></li>`).join("");
    parts.push(lsub("transit", t.transitT, `${tn.nets.length ? `<ul class="meas">${body}</ul>` : tn.followed.length ? `<p>${t.transitNone(esc(tn.followed.join(", ")))}</p>` : `<p>${t.transitNo}</p>`}
      ${tn.nat.length ? `<h4>${t.transitNat}</h4><ul class="plainl">${tn.nat.map(a => `<li>${esc(a.t)} <span class="muted">· ${esc(a.net)}</span></li>`).join("")}</ul>` : ""}<p class="muted">${t.transitNote}</p>`));
  }
  return col(t.sLocal, parts.join(""));
}
function lGeoBlock() {
  const t = lu(), G = S.loc && S.loc.geo;
  const body = !G ? `<p>${t.geoFail}</p>` : `${G.risks.length ? `<ul class="plainl">${G.risks.map(r => `<li><b>${esc(r.label)}</b>${r.sub.length ? `<br><span class="muted">${esc(r.sub.join(" · "))}</span>` : ""}</li>`).join("")}</ul>` : `<p>${t.geoNone}</p>`}
    <p>${G.seismic ? `${t.seismic} : <b>${esc(G.seismic)}</b>` : ""}${G.catnat ? `${G.seismic ? "<br>" : ""}${t.catnat(G.catnat)}` : ""}</p>
    <p class="muted">${t.geoNote}</p><p>${link(t.geoLink, "https://www.georisques.gouv.fr/")}</p>`;
  return col(t.geoT, body);
}
if (typeof module !== "undefined") module.exports = { lRivers, lConfigure, lVigicrues, lBuildParis, lHeatThr, safeUrl, lShown, lScore, lH, lHeadline, lLevel, linterp };
