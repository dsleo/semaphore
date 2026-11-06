// Per-commune layer: landing page (autocomplete + France map) and live local sources.
// Paris keeps the full server-built state.json; any other commune gets local hazards computed here, in the
// browser, from CORS-open public APIs, combined with the national hazards already in state.json.
// ponytail: no persistence/hysteresis for local hazards (no per-visitor history); add a localStorage replay if flapping shows.
const LGEO = "https://geo.api.gouv.fr", LPARIS = "75056";
const LF = "fields=nom,code,codesPostaux,centre,population,departement,region,codeEpci";
const lget = (u, ms = 15000) => fetch(u, { signal: AbortSignal.timeout(ms) }).then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
const lclamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const linterp = (x, p) => { if (x <= p[0][0]) return p[0][1]; for (let i = 1; i < p.length; i++) if (x <= p[i][0]) return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * (x - p[i - 1][0]) / (p[i][0] - p[i - 1][0]); return p[p.length - 1][1]; };
const lT = (fr, en) => ({ fr, en });

// ---- scoring (port of puite/score.py, same rules, no damping)
const LCFG = {
  heat: { impact: 5, domain: "weather", src: ["weather", "vigilance"] },
  weather: { impact: 2, domain: "weather", src: ["weather", "vigilance"] },
  fuel: { impact: 3, domain: "fuel", src: ["fuel"], cap: true },
  flood: { impact: 4, domain: "weather", src: ["vigilance"] },
  drought: { impact: 2, domain: "weather", src: ["vigieau"] }
};
const lLevel = r => [25, 50, 75].filter(t => r >= t).length;
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
function lHeadline(hz) {
  const known = Object.entries(hz).filter(([, s]) => s.level != null);
  if (!known.length) return { level: null, score: null, systemic: false, top: [] };
  const top = known.filter(([, s]) => s.level >= 1).sort((a, b) => b[1].level - a[1].level || b[1].R - a[1].R).map(([h]) => h);
  const doms = new Set(known.filter(([, s]) => s.level >= 2).map(([, s]) => s.domain));
  return { level: Math.max(...known.map(([, s]) => s.level)), score: Math.round(Math.max(...known.map(([, s]) => s.R))), systemic: doms.size >= 2, top };
}

// ---- local sources (kind/area/refresh mirror puite/sources.py META)
const LMETA = { weather: ["forecast", "commune", 360, "@hazard"], vigilance: ["official", "dept", 720, "@hazard"], vigieau: ["official", "commune", 1440, "vigieau"], fuel: ["observed", "dept", 30, "fuel"] };
function lind(id, hazard, label, value, s, w, source, link, query, rule, o = {}) {
  const [kind, area, , fam] = LMETA[source];
  return { id, hazard, label, value, s: Math.round(lclamp(s) * 1000) / 1000, w, source, link, query, sha: "", rule, official: !!o.official, floor: o.floor || 0, fetched: new Date().toISOString(), pub: o.pub || null, kind, area, fam: fam === "@hazard" ? hazard : fam };
}
const lHeatThr = c => ["75", "92", "93", "94"].includes(c.dep) ? [31, 21] : [34, 20];  // Paris biometeo criterion; elsewhere an approximate national one (official canicule vigilance has the exact per-département values)

async function lWeather(c) {
  const q = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&timezone=Europe%2FParis&forecast_days=7&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max`;
  const D = (await lget(q)).daily, days = D.time, z = a => a.map(x => x ?? 0);
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

async function lFuel(c) {
  const base = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?";
  const count = w => lget(base + new URLSearchParams({ limit: 0, where: w })).then(d => d.total_count);
  const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10), dep = `code_departement="${c.dep}"`;
  return Promise.all([["gazole", "Diesel"], ["e10", "SP95-E10"]].map(async ([f, name]) => {
    const wk = `${dep} and ${f}_rupture_type="temporaire" and ${f}_rupture_debut >= date'${since}'`;
    const [n, k] = await Promise.all([count(`${dep} and (${f}_prix is not null or ${f}_rupture_type="temporaire")`), count(wk)]);
    if (n < 15) throw new Error(`only ${n} stations carry ${name} in ${c.dep}`);
    const r = k / n, d = c.depNom || c.dep;
    return lind(`fuel.${f}`, "fuel", lT(`Stations ${name} en rupture (${d})`, `${name} stations out of stock (${d})`), `${k} / ${n} stations déclarantes (${(r * 100).toFixed(1)} %)`, linterp(r, [[0.10, 0], [0.15, 0.5], [0.25, 1]]), 0.8, "fuel",
      "https://data.economie.gouv.fr/explore/dataset/prix-des-carburants-en-france-flux-instantane-v2/", base + wk,
      lT("Normal ≈ 8 %. 15 % = tension (0,5). 25 % = grave (1). Seules les ruptures temporaires déclarées depuis 14 jours comptent. Mesure des ruptures déclarées par les stations du département, pas un recensement.", "Normal ≈ 8 %. 15 % = tension (0.5). 25 % = severe (1). Only temporary stockouts declared in the last 14 days count. Counts stockouts declared by the département's stations, not a census."));
  }));
}

// ---- build a state.json-shaped object for a commune: local hazards live, national ones from state.json
async function lBuild(c, N) {
  const run = [["weather", lWeather], ["vigilance", lVigilance], ["vigieau", lVigieau], ["fuel", lFuel]];
  const res = await Promise.allSettled(run.map(([, f]) => f(c))), now = new Date().toISOString(), ok = {}, inds = [], sources = {};
  run.forEach(([id], k) => {
    const r = res[k]; ok[id] = r.status === "fulfilled"; if (ok[id]) inds.push(...r.value);
    sources[id] = { ...N.sources[id], ok: ok[id], err: ok[id] ? null : String(r.reason).slice(0, 160), n: ok[id] ? r.value.length : 0, last_ok: ok[id] ? now : null, status: ok[id] ? "current" : "down", area: LMETA[id][1], kind: LMETA[id][0], every: LMETA[id][2] };
  });
  const NAT = ["weather", "vigilance", "vigieau", "fuel", "seine", "vigicrues", "traffic"];
  for (const [id, s] of Object.entries(N.sources)) if (!NAT.includes(id)) sources[id] = s;
  const hazards = {};
  for (const hid of Object.keys(N.hazards)) {
    const cfg = LCFG[hid];
    if (!cfg) { hazards[hid] = N.hazards[hid]; continue; }
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
  fr: { h: "Quels risques près de chez vous ?", lede: "Choisissez votre commune : Vigie affiche la vigilance météo, l'eau, le carburant, l'électricité, les routes, les transports et le numérique, avec des sources vérifiables.", lab: "Votre commune ou code postal", ph: "Ex. Lyon ou 33000", here: "Ma position", resume: n => `Reprendre : ${n}`, none: "Aucune commune trouvée.", loc: "Position introuvable.", load: "Chargement de la commune…", fail: "Impossible de charger cette commune.",
    cap: "Carte de la France métropolitaine par département", main: n => `Villes principales : ${n}`, close: "Fermer", noMap: "Carte indisponible.", dom: "Les départements d'outre-mer sont disponibles via la recherche de commune.",
    sNews: "Actualité locale surveillée", newsNote: "Titres de la presse régionale et locale (France 3 régions, ici, quotidiens régionaux), repérés par mot-clé de crise dans les 36 dernières heures, tels que publiés. Non vérifiés par nous, sans effet sur les niveaux.", newsNone: "Aucun titre de crise concernant votre commune ou votre région ces dernières 36 h.", scope: { commune: "Votre commune", dept: "Votre département", region: "Votre région" }, trigger: "mot repéré",
    sLocal: "Perturbations autour de vous", roadsT: "Routes", roadsNone: "Aucun événement sur le réseau routier national à moins de 25 km.", roadsNote: "Bison Futé : réseau routier national non concédé (nationales). Les autoroutes concédées et les routes départementales ne sont pas toutes couvertes.", km: "à", closed: "route coupée",
    transitT: "Transports en commun", transitNone: n => `Aucune alerte en cours sur : ${n}.`, transitNo: "Aucun réseau de votre commune n'est suivi automatiquement : consultez le site de votre opérateur.", transitNote: "Alertes temps réel publiées par les réseaux sur transport.data.gouv.fr. Un réseau absent n'est pas « sans perturbation » : il n'est simplement pas lu.", transitNat: "Alertes SNCF citant votre commune",
    eff: { no_service: "service interrompu", reduced: "service réduit", delays: "retards importants", detour: "déviation", modified: "service modifié", stop_moved: "arrêt déplacé" },
    kind: { Accident: "Accident", AbnormalTraffic: "Circulation dense", VehicleObstruction: "Véhicule ou obstacle", RoadOrCarriagewayOrLaneManagement: "Restriction de circulation", GeneralObstruction: "Obstacle sur la route", WeatherRelatedRoadConditions: "Conditions météo", EnvironmentalObstruction: "Obstacle naturel", InfrastructureDamageObstruction: "Chaussée endommagée", AnimalPresenceObstruction: "Animaux sur la route", GeneralNetworkManagement: "Gestion du réseau" },
    powerT: "Électricité", powerNote: "Enedis ne publie pas ses coupures en cours en données ouvertes : Vigie ne peut pas les lire. Le signal national (Écowatt, RTE) est suivi dans « Électricité ».", powerTel: n => `Dépannage Enedis de votre département : 09 72 67 50 ${n} (24 h/24, appel non surtaxé)`, powerLink: "Site d'Enedis",
    geoT: "Risques naturels et technologiques de votre commune", geoNote: "Profil permanent publié par l'État (Géorisques / GASPAR), pas une alerte : il dit à quoi votre commune est exposée, pas ce qui se passe maintenant.", geoNone: "Aucun risque recensé.", seismic: "Zone sismique", catnat: n => `${n} arrêté${n > 1 ? "s" : ""} de catastrophe naturelle depuis 1982`, geoLink: "Fiche complète sur Géorisques", geoFail: "Géorisques est indisponible pour le moment." },
  en: { h: "What risks are near you?", lede: "Pick your commune: Vigie shows weather vigilance, water, fuel, power, roads, transit and digital risks, with verifiable sources.", lab: "Your commune or postcode", ph: "E.g. Lyon or 33000", here: "My location", resume: n => `Resume: ${n}`, none: "No commune found.", loc: "Location not found.", load: "Loading the commune…", fail: "Could not load this commune.",
    cap: "Map of metropolitan France by département", main: n => `Main towns: ${n}`, close: "Close", noMap: "Map unavailable.", dom: "Overseas départements are available through the commune search.",
    sNews: "Local news monitored", newsNote: "Headlines from regional and local press (France 3 regions, ici, regional dailies), picked up by crisis keyword in the last 36 hours, as published. Not verified by us, no effect on levels.", newsNone: "No crisis headline about your commune or region in the last 36 h.", scope: { commune: "Your commune", dept: "Your département", region: "Your region" }, trigger: "trigger word",
    sLocal: "Disruptions around you", roadsT: "Roads", roadsNone: "No event on the national road network within 25 km.", roadsNote: "Bison Futé: the non-conceded national road network. Conceded motorways and departmental roads are not all covered.", km: "at", closed: "road closed",
    transitT: "Public transport", transitNone: n => `No current alert on: ${n}.`, transitNo: "No network serving your commune is read automatically: check your operator's site.", transitNote: "Real-time alerts published by networks on transport.data.gouv.fr. A missing network is not “no disruption”: it is simply not read.", transitNat: "SNCF alerts naming your commune",
    eff: { no_service: "no service", reduced: "reduced service", delays: "major delays", detour: "detour", modified: "modified service", stop_moved: "stop moved" },
    kind: { Accident: "Accident", AbnormalTraffic: "Heavy traffic", VehicleObstruction: "Vehicle or obstacle", RoadOrCarriagewayOrLaneManagement: "Traffic restriction", GeneralObstruction: "Obstacle on the road", WeatherRelatedRoadConditions: "Weather conditions", EnvironmentalObstruction: "Natural obstacle", InfrastructureDamageObstruction: "Damaged road", AnimalPresenceObstruction: "Animals on the road", GeneralNetworkManagement: "Network management" },
    powerT: "Power", powerNote: "Enedis does not publish its current outages as open data, so Vigie cannot read them. The national signal (Ecowatt, RTE) is tracked under “Power”.", powerTel: n => `Enedis breakdown line for your département: 09 72 67 50 ${n} (24/7, standard rate)`, powerLink: "Enedis website",
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
  <section class="mapbox"><div id="fmap" role="group" aria-label="${esc(t.cap)}"><p class="muted">…</p></div><p class="muted">${t.dom}</p></section>
  <dialog id="deptcity" aria-labelledby="dtitle"></dialog>`;
}
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
  try {
    LMAP = LMAP || await lget("data/france-map.json", 20000);
    drawMap();
  } catch { $("#fmap").innerHTML = `<p class="muted">${t.noMap}</p>`; }
  function drawMap() {
    const host = $("#fmap"); if (!host || !LMAP) return;
    host.innerHTML = `<svg viewBox="0 0 ${LMAP.w} ${LMAP.h}" role="presentation">${LMAP.deps.map(d => `<path class="dep" d="${d.d}" data-c="${d.c}" tabindex="0" role="button" aria-label="${esc(d.n)}"><title>${esc(d.n)}</title></path>`).join("")}</svg>`;
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
async function lLocal(c) {
  const g = p => lget(`https://georisques.gouv.fr/api/v1/${p}`), j = f => lget(`data/${f}?t=${Math.floor(Date.now() / 3e5)}`, 20000);
  const [nw, rd, tr, gr, sz, cn] = await Promise.allSettled([j("news-local.json"), j("roads.json"), j("transit.json"), g(`gaspar/risques?code_insee=${c.code}`), g(`zonage_sismique?code_insee=${c.code}`), g(`gaspar/catnat?code_insee=${c.code}&page_size=1`)]);
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
  L.sources.georisques = lsrc("Natural and technological risks (Géorisques)", "https://georisques.gouv.fr", "official", "commune", 43200, "Licence Ouverte 2.0", !!G, gr.reason, now);
  return L;
}
function lNewsBlock() {
  const t = lu(), n = S.loc && S.loc.news;
  if (!n) return "";
  const items = n.length ? `<ul class="links">${n.map(i => `<li><span class="muted">${esc(tx(S.loc.newsMeta.themes[i.th]))} · ${esc(t.scope[i.scope])}</span><br><a href="${esc(i.l)}" target="_blank" rel="noopener">${esc(i.t)}</a><br><span class="muted">${esc(i.s)} · ${fmt(i.p)} · ${t.trigger} : « ${esc(i.kw)} »</span></li>`).join("")}</ul>` : `<p>${t.newsNone}</p>`;
  return col(`${t.sNews} (${n.length})`, `<p class="muted">${t.newsNote}</p>${items}`);
}
function lLocalBlock() {
  const t = lu(), L = S.loc; if (!L) return "";
  const parts = [];
  if (L.roads) parts.push(`<h3>${t.roadsT}</h3>${L.roads.length ? `<ul class="meas">${L.roads.map(i => `<li><b>${esc(i.road || i.town || "")}</b>${i.x ? ` <span class="badge b1">${t.closed}</span>` : ""} <span class="muted">· ${esc(t.kind[i.k] || i.k)} · ${t.km} ${Math.round(i.km)} km${i.town ? " · " + esc(i.town) : ""}</span><br><span class="muted">${esc(i.t)}</span></li>`).join("")}</ul>` : `<p>${t.roadsNone}</p>`}<p class="muted">${t.roadsNote}</p>`);
  if (S.paris) parts.push(trafficBody());
  if (L.transit) {
    const tn = L.transit, body = tn.nets.map(n => `<li><b>${link(n.name, n.link)}</b> <span class="muted">(${n.n})</span><ul class="plainl">${n.alerts.map(a => `<li>${a.e ? `<span class="badge b1">${esc(t.eff[a.e])}</span> ` : ""}${esc(a.t)}</li>`).join("")}</ul></li>`).join("");
    parts.push(`<h3>${t.transitT}</h3>${tn.nets.length ? `<ul class="meas">${body}</ul>` : tn.followed.length ? `<p>${t.transitNone(esc(tn.followed.join(", ")))}</p>` : `<p>${t.transitNo}</p>`}
      ${tn.nat.length ? `<h3>${t.transitNat}</h3><ul class="plainl">${tn.nat.map(a => `<li>${esc(a.t)} <span class="muted">· ${esc(a.net)}</span></li>`).join("")}</ul>` : ""}<p class="muted">${t.transitNote}</p>`);
  }
  const tel = /^\d\d$/.test(C.dep) && C.dep !== "20" ? `<p>${t.powerTel(C.dep)}</p>` : "";
  parts.push(`<h3>${t.powerT}</h3><p class="muted">${t.powerNote}</p>${tel}<p>${link(t.powerLink, "https://www.enedis.fr")}</p>`);
  return col(t.sLocal, parts.join(""));
}
function lGeoBlock() {
  const t = lu(), G = S.loc && S.loc.geo;
  const body = !G ? `<p>${t.geoFail}</p>` : `${G.risks.length ? `<ul class="plainl">${G.risks.map(r => `<li><b>${esc(r.label)}</b>${r.sub.length ? `<br><span class="muted">${esc(r.sub.join(" · "))}</span>` : ""}</li>`).join("")}</ul>` : `<p>${t.geoNone}</p>`}
    <p>${G.seismic ? `${t.seismic} : <b>${esc(G.seismic)}</b>` : ""}${G.catnat ? `${G.seismic ? "<br>" : ""}${t.catnat(G.catnat)}` : ""}</p>
    <p class="muted">${t.geoNote}</p><p>${link(t.geoLink, "https://www.georisques.gouv.fr/")}</p>`;
  return col(t.geoT, body);
}
if (typeof module !== "undefined") module.exports = { lScore, lH, lHeadline, lLevel, linterp };
