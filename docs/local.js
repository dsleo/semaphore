// Per-commune layer: landing page (autocomplete + France map) and live local sources.
// Paris keeps the full server-built state.json; any other commune gets local hazards computed here, in the
// browser, from CORS-open public APIs, combined with the national hazards already in state.json.
// ponytail: no persistence/hysteresis for local hazards (no per-visitor history); add a localStorage replay if flapping shows.
const LGEO = "https://geo.api.gouv.fr", LPARIS = "75056";
const LF = "fields=nom,code,codesPostaux,centre,population,departement";
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
const lNorm = r => ({ code: r.code, nom: r.nom, dep: r.departement.code, depNom: r.departement.nom, cp: (r.codesPostaux || [])[0], pop: r.population, lon: r.centre.coordinates[0], lat: r.centre.coordinates[1] });

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

// ---- landing: autocomplete + France map coloured by Météo-France vigilance
const LU = {
  fr: { h: "Quels risques près de chez vous ?", lede: "Choisissez votre commune : Vigie affiche la vigilance météo, l'eau, le carburant, l'électricité et le numérique, avec des sources vérifiables.", lab: "Votre commune ou code postal", ph: "Ex. Lyon ou 33000", here: "Ma position", resume: n => `Reprendre : ${n}`, none: "Aucune commune trouvée.", loc: "Position introuvable.", load: "Chargement de la commune…", fail: "Impossible de charger cette commune.",
    map: "Vigilance Météo-France aujourd'hui et demain, par département. Touchez un département pour voir ses villes.", cap: "France métropolitaine, vigilance par département", main: n => `Villes principales : ${n}`, lv: ["pas de donnée", "vert", "jaune", "orange", "rouge"], leg: "Vigilance", noMap: "Carte indisponible.", back: "Changer de ville", dom: "Les départements d'outre-mer sont disponibles via la recherche de commune." },
  en: { h: "What risks are near you?", lede: "Pick your commune: Vigie shows weather vigilance, water, fuel, power and digital risks, with verifiable sources.", lab: "Your commune or postcode", ph: "E.g. Lyon or 33000", here: "My location", resume: n => `Resume: ${n}`, none: "No commune found.", loc: "Location not found.", load: "Loading the commune…", fail: "Could not load this commune.",
    map: "Météo-France vigilance today and tomorrow, by département. Tap a département to see its towns.", cap: "Metropolitan France, vigilance by département", main: n => `Main towns: ${n}`, lv: ["no data", "green", "yellow", "orange", "red"], leg: "Vigilance", noMap: "Map unavailable.", back: "Change city", dom: "Overseas départements are available through the commune search." }
};
const lu = () => LU[lang];
let LMAP = null, LLV = {};
function lLanding() {
  const t = lu(), last = (() => { try { return JSON.parse(localStorage.getItem("commune")); } catch { return null; } })();
  return `<h1>${t.h}</h1><p>${t.lede}</p>
  <div class="pick"><label for="q"><b>${t.lab}</b></label>
  <div class="pickrow"><input id="q" type="search" list="qs" autocomplete="off" spellcheck="false" placeholder="${esc(t.ph)}"><datalist id="qs"></datalist><button class="btn sec" id="here" type="button">${t.here}</button></div>
  <p class="muted" id="pickmsg" role="status"></p>${last ? `<p><button class="chip" data-code="${esc(last.code)}">${esc(t.resume(last.nom))}</button></p>` : ""}</div>
  <section class="mapbox"><p class="muted">${t.map}</p><div id="fmap" role="group" aria-label="${esc(t.cap)}"><p class="muted">…</p></div>
  <ul class="legend" aria-label="${t.leg}">${[1, 2, 3, 4].map(k => `<li><i class="sw m${k}"></i>${t.lv[k]}</li>`).join("")}</ul><div id="deptcity" aria-live="polite"></div><p class="muted">${t.dom}</p></section>`;
}
async function lBindLanding(pick) {
  const t = lu(), q = $("#q"), msg = $("#pickmsg"); let hits = {}, timer;
  document.querySelectorAll("[data-code]").forEach(b => b.onclick = () => pick(b.dataset.code));
  const label = r => `${r.nom} (${r.departement ? r.departement.code : ""})`;
  const search = async () => {
    const v = q.value.trim(); if (v.length < 2) return;
    try {
      const rows = await lget(`${LGEO}/communes?${/^\d{5}$/.test(v) ? "codePostal=" + v : "nom=" + encodeURIComponent(v) + "&boost=population"}&limit=10&${LF}`);
      hits = Object.fromEntries(rows.map(r => [label(r), r]));
      $("#qs").innerHTML = Object.keys(hits).map(k => `<option value="${esc(k)}">`).join("");
      msg.textContent = rows.length ? "" : t.none;
      if (hits[v]) pick(hits[v].code);
    } catch { msg.textContent = t.fail; }
  };
  q.oninput = () => { if (hits[q.value]) return pick(hits[q.value].code); clearTimeout(timer); timer = setTimeout(search, 180); };
  q.onkeydown = e => { if (e.key === "Enter") { const f = Object.values(hits)[0]; if (f) pick(f.code); } };
  $("#here").onclick = () => navigator.geolocation ? navigator.geolocation.getCurrentPosition(
    async p => { try { const r = await lget(`${LGEO}/communes?lat=${p.coords.latitude}&lon=${p.coords.longitude}&${LF}`); r[0] ? pick(r[0].code) : msg.textContent = t.loc; } catch { msg.textContent = t.loc; } },
    () => { msg.textContent = t.loc; }) : (msg.textContent = t.loc);
  try {
    LMAP = LMAP || await lget("data/france-map.json", 20000);
    if (!Object.keys(LLV).length) lget("https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/weatherref-france-vigilance-meteo-departement/records?" + new URLSearchParams({ select: "domain_id,max(color_id) as c", group_by: "domain_id", limit: 150 }))
      .then(d => { LLV = Object.fromEntries(d.results.map(r => [r.domain_id, r.c])); drawMap(); }).catch(() => { });
    drawMap();
  } catch { $("#fmap").innerHTML = `<p class="muted">${t.noMap}</p>`; }
  function drawMap() {
    const host = $("#fmap"); if (!host || !LMAP) return;
    host.innerHTML = `<svg viewBox="0 0 ${LMAP.w} ${LMAP.h}" role="presentation">${LMAP.deps.map(d => `<path class="dep m${LLV[d.c] || 0}" d="${d.d}" data-c="${d.c}" tabindex="0" role="button" aria-label="${esc(d.n)}, ${t.leg} ${t.lv[LLV[d.c] || 0]}"><title>${esc(d.n)} · ${t.lv[LLV[d.c] || 0]}</title></path>`).join("")}</svg>`;
    const open = async el => {
      const d = LMAP.deps.find(x => x.c === el.dataset.c), box = $("#deptcity"); box.innerHTML = `<p class="muted">…</p>`;
      try {
        const rows = (await lget(`${LGEO}/departements/${d.c}/communes?fields=nom,code,population`)).sort((a, b) => (b.population || 0) - (a.population || 0)).slice(0, 12);
        box.innerHTML = `<h2>${esc(t.main(d.n))}</h2><p>${rows.map(r => `<button class="chip" data-code="${esc(r.code)}">${esc(r.nom)}</button>`).join(" ")}</p>`;
        box.querySelectorAll("[data-code]").forEach(b => b.onclick = () => pick(b.dataset.code));
      } catch { box.innerHTML = `<p class="muted">${t.fail}</p>`; }
    };
    host.querySelectorAll(".dep").forEach(p => { p.onclick = () => open(p); p.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(p); } }; });
  }
}
if (typeof module !== "undefined") module.exports = { lScore, lH, lHeadline, lLevel, linterp };
