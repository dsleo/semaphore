// Browser-side scoring port: shared fixtures with the Python tests, plus link safety. Run: node tests/local.test.js
const assert = require("assert"), fs = require("fs"), path = require("path");
const L = require("../docs/local.js");
const fix = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "scoring.json"), "utf8"));

// rules come from the published config; without it nothing is scored (unknown, never calm)
assert.strictEqual(L.lLevel(80), null);
L.lConfigure(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "docs", "data", "config.json"), "utf8")));
assert.strictEqual(L.lLevel(24.9), 0); assert.strictEqual(L.lLevel(25), 1); assert.strictEqual(L.lLevel(75), 3);

// shared fixtures (same file as tests/test_parity.py)
for (const c of fix.cases) {
  const cfg = { ...c.cfg, cap: !!c.cfg.demand_sensitive };
  const st = L.lScore(cfg, c.inds.map(i => ({ official: false, floor: 0, ...i })));
  assert.strictEqual(st.level, c.level, c.name + " level");
  assert.strictEqual(st.R, c.R, c.name + " R");
  assert.strictEqual(st.H, c.H, c.name + " H");
  assert.strictEqual(!!st.capped, !!c.capped, c.name + " capped");
}
for (const [dep, thr] of Object.entries(fix.heat_thr)) assert.deepStrictEqual(L.lHeatThr({ dep }), thr, "heat threshold " + dep);

// only web links reach an href
assert.strictEqual(L.safeUrl("https://x.fr/a"), "https://x.fr/a");
for (const bad of ["javascript:alert(1)", "data:text/html,x", "//evil.com", " https://x.fr", ""]) assert.strictEqual(L.safeUrl(bad), "#", bad);
console.log("ok");
