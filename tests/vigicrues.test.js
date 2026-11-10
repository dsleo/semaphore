// Vigicrues layer, mocked network: node tests/vigicrues.test.js
const assert = require("assert");
const L = require("../docs/local.js"), lVigicrues = L["lVigicrues"];
L.lConfigure(JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "docs", "data", "config.json"), "utf8")));
const file = (items, ageH = 0) => ({ generated: new Date(Date.now() - ageH * 36e5).toISOString(), pub: "x", items });
const mock = o => { global.fetch = async () => o === "fail" ? { ok: false, status: 404 } : { ok: true, status: 200, json: async () => o }; };
const seine = { n: "Seine à Paris", l: 3, p: [[2.30, 48.84], [2.35, 48.85], [2.40, 48.84]] }, lyon = { n: "Rhône aval", l: 4, p: [[4.83, 45.76]] };
(async () => {
  const paris = { lat: 48.86, lon: 2.35 };
  mock(file([seine, lyon]));
  let i = (await lVigicrues(paris))[0];
  assert.strictEqual(i.s, 0.6); assert.strictEqual(i.floor, 50); assert.strictEqual(i.official, true); assert.ok(i.value.fr.includes("Seine à Paris") && !i.value.fr.includes("Rhône"));
  i = (await lVigicrues({ lat: 43.3, lon: 5.4 }))[0];                       // Marseille: far from both sections -> green, no floor
  assert.strictEqual(i.s, 0); assert.strictEqual(i.floor, 0);
  i = (await lVigicrues({ lat: 45.76, lon: 4.84 }))[0]; assert.strictEqual(i.floor, 80);   // red section next door
  mock(file([], 13)); await assert.rejects(lVigicrues(paris), /older than 12 h/);          // stale file is unavailable, never green
  mock("fail"); await assert.rejects(lVigicrues(paris));
  console.log("ok");
})().catch(e => { console.error(e); process.exit(1); });
