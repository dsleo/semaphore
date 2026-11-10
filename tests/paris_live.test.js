// Paris live overlay with mocked network: node tests/paris_live.test.js
const assert = require("assert"), fs = require("fs"), path = require("path");
const L = require("../docs/local.js"), lBuildParis = L["lBuildParis"];
L.lConfigure(JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "docs", "data", "config.json"), "utf8")));
const N = JSON.parse(fs.readFileSync(path.join(__dirname, "../docs/data/state.json"), "utf8"));
const C = { code: "75056", nom: "Paris", dep: "75", depNom: "Paris", lat: 48.86, lon: 2.35 };
const now = new Date(), iso = d => d.toISOString(), day = (n) => iso(new Date(Date.now() + n * 864e5)).slice(0, 10);
const days = [...Array(7)].map((_, i) => day(i)), arr = v => days.map(() => v);
function mock(over = {}) {
  global.fetch = async url => {
    url = String(url); let body;
    const hit = Object.keys(over).find(k => url.includes(k));
    if (hit) { if (over[hit] === "fail") return { ok: false, status: 500 }; body = over[hit]; }
    else if (url.includes("open-meteo")) body = { daily: { time: days, temperature_2m_max: arr(20), temperature_2m_min: arr(12), precipitation_sum: arr(0), wind_gusts_10m_max: arr(20) } };
    else if (url.includes("vigilance")) body = { results: [{ product_datetime: iso(now), phenomenon: "Vent violent", echeance: "J", color_id: 1 }] };
    else if (url.includes("vigieau")) body = [];
    else if (url.includes("circulation_evenement")) body = { total_count: 2, results: [{ street: "Bd_Test", description: "Travaux", type: "ROAD_CLOSED", starttime: iso(new Date(now - 36e5)), endtime: iso(new Date(+now + 36e5)) }, { street: "Bd_Old", description: "Fini", type: "X", starttime: iso(new Date(now - 72e5)), endtime: iso(new Date(now - 36e5)) }] };
    else if (url.includes("prix-des-carburants")) body = { total_count: url.includes("rupture_debut") ? 5 : 100 };
    else if (url.includes("hubeau")) body = { data: [{ date_obs: iso(now), resultat_obs: 2000 }, { date_obs: iso(new Date(now - 24 * 36e5)), resultat_obs: 2000 }] };
    else if (url.includes("ecowatt")) body = { results: [{ date: day(0), couleur_du_jour: 1 }] };
    else if (url.includes("eco2mix")) body = { results: [{ date_heure: iso(now), consommation: 40000, prevision_j: 40000 }] };
    else return { ok: false, status: 404 };
    return { ok: true, status: 200, json: async () => body };
  };
}
(async () => {
  // calm live data overrides a stale server state and reads live
  mock(); let S = await lBuildParis(C, N);
  assert.strictEqual(S.paris, true); assert.ok(S.live); assert.strictEqual(S.hazards.heat.level, 0); assert.ok(S.hazards.power.indicators.every(i => i.fetched.slice(0, 13) === iso(now).slice(0, 13)));
  assert.ok(S.hazards.cyber === N.hazards.cyber, "hazards with no live source are untouched");
  // a red heat vigilance published after the last server run shows at once, as an official alert, with the official floor
  mock({ vigilance: { results: [{ product_datetime: iso(now), phenomenon: "Canicule", echeance: "J", color_id: 4 }] } });
  S = await lBuildParis(C, N);
  assert.strictEqual(S.hazards.heat.level, 3); assert.ok(S.alerts.some(a => a.source === "vigilance")); assert.strictEqual(S.headline.level, 3);
  // Seine at 6 m and rising: flood level goes up, server-only sources (Vigicrues) keep their server status
  mock({ hubeau: { data: [{ date_obs: iso(now), resultat_obs: 6000 }, { date_obs: iso(new Date(now - 24 * 36e5)), resultat_obs: 4300 }] } });
  S = await lBuildParis(C, N);
  assert.ok(S.hazards.flood.level >= 2); assert.deepStrictEqual(S.hazards.flood.missing, (N.hazards.flood.missing || []).filter(x => !["seine", "vigilance"].includes(x)));
  // a live source that fails keeps its server value instead of reading as calm or unavailable
  mock({ hubeau: "fail" }); S = await lBuildParis(C, N);
  assert.deepStrictEqual(S.hazards.flood.indicators.map(i => i.id), N.hazards.flood.indicators.filter(i => i.source === "seine").map(i => i.id).concat(S.hazards.flood.indicators.filter(i => i.source !== "seine").map(i => i.id)));
  assert.strictEqual(S.sources.seine.status, N.sources.seine.status);
  // Paris works: read live (only events in progress, closed ones first), and a failed read keeps the server list
  mock(); S = await lBuildParis(C, N);
  assert.deepStrictEqual(S.context.traffic.items.map(x => x.street), ["Bd Test"]); assert.strictEqual(S.context.traffic.closed, 1); assert.strictEqual(S.sources.traffic.status, "current");
  mock({ circulation_evenement: "fail" }); S = await lBuildParis(C, N); assert.strictEqual(S.context.traffic, N.context.traffic);
  // everything down: same hazards as the server state
  mock(Object.fromEntries(["open-meteo", "vigilance", "vigieau", "prix-des", "hubeau", "ecowatt", "eco2mix"].map(k => [k, "fail"])));
  S = await lBuildParis(C, N); assert.deepStrictEqual(Object.fromEntries(Object.entries(S.hazards).map(([k, v]) => [k, v.level])), Object.fromEntries(Object.entries(N.hazards).map(([k, v]) => [k, v.level])));
  console.log("ok");
})().catch(e => { console.error(e); process.exit(1); });
