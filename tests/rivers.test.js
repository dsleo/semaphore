// Hub'Eau gauges near a commune, mocked network: node tests/rivers.test.js
const assert = require("assert");
const { lRivers } = require("../docs/local.js");
const now = Date.now(), iso = ms => new Date(ms).toISOString();
const ob = (code, lvls, ageH = 0) => lvls.map((v, i) => ({ code_station: code, date_obs: iso(now - (ageH + i * 4) * 36e5), resultat_obs: v }));  // newest first, 4 h apart
const stations = { data: [
  { code_station: "A", libelle_station: "La Seine à X", libelle_cours_eau: "La Seine", latitude_station: 48.86, longitude_station: 2.36 },
  { code_station: "B", libelle_station: "Le Ru à Y", libelle_cours_eau: "Le Ru", latitude_station: 48.90, longitude_station: 2.40 },
  { code_station: "C", libelle_station: "Vieille station", libelle_cours_eau: "L'Ancienne", latitude_station: 48.87, longitude_station: 2.35 },
  { code_station: "A2", libelle_station: "La Seine à X (autre capteur)", libelle_cours_eau: "La Seine", latitude_station: 48.86, longitude_station: 2.36 },
  { code_station: "D", libelle_station: "Sans mesure", libelle_cours_eau: "Le Vide", latitude_station: 48.86, longitude_station: 2.35 }] };
const mock = (st, obs) => { global.fetch = async u => ({ ok: true, status: 200, json: async () => String(u).includes("referentiel") ? st : { data: obs } }); };
(async () => {
  const c = { lat: 48.86, lon: 2.35 };
  mock(stations, [...ob("A", [2500, 2400, 2300, 2200, 2100, 2000, 1900]), ...ob("B", [500, 400, 300, 250, 200, 150, 100]), ...ob("C", [900, 900], 5), ...ob("A2", [2500, 2400, 2300, 2200, 2100, 2000, 1900])]);
  const r = await lRivers(c);
  assert.deepStrictEqual(r.map(x => x.river), ["La Seine", "Le Ru"]);              // nearest first; stale station C, station D with no reading and the twin gauge A2 dropped
  assert.ok(Math.abs(r[0].lvl - 2.5) < 1e-9 && Math.abs(r[0].d24 - 0.6) < 1e-9);   // mm -> m, change over the 24 h window
  assert.ok(r[0].km < r[1].km);
  mock(stations, ob("A", [2500, 2400], 0));                                          // under 12 h of readings: level only, no 24 h change
  assert.strictEqual((await lRivers(c))[0].d24, null);
  mock({ data: [] }, []); assert.deepStrictEqual(await lRivers(c), []);              // no gauge nearby is an empty list, not an error
  global.fetch = async () => ({ ok: false, status: 500 }); await assert.rejects(lRivers(c));
  console.log("ok");
})().catch(e => { console.error(e); process.exit(1); });
