// Node self-check for the browser-side scoring port: node tests/local.test.js
const a = require("assert"), { lScore, lH, lLevel, lHeadline, lShown } = require("../docs/local.js");
const ind = (o) => ({ kind: "forecast", fam: "x", w: 1, s: 0, floor: 0, official: false, ...o });
a.strictEqual(lLevel(24.9), 0); a.strictEqual(lLevel(25), 1); a.strictEqual(lLevel(50), 2); a.strictEqual(lLevel(75), 3);
// same family counted once; independent families corroborate (noisy-OR)
a.ok(Math.abs(lH([ind({ s: 0.5, fam: "a" }), ind({ s: 0.5, fam: "a" })]) - 50) < 1e-9);
a.ok(Math.abs(lH([ind({ s: 0.5, fam: "a" }), ind({ s: 0.5, fam: "b" })]) - 75) < 1e-9);
// official floor wins over a low computed score; no scored indicator = unknown, never 0
a.strictEqual(lScore({ impact: 5 }, [ind({ s: 0, floor: 80, official: true, w: 1 })]).level, 3);
a.strictEqual(lScore({ impact: 5 }, []).level, null);
// fuel-style cap: red without an official source is held at orange
a.strictEqual(lScore({ impact: 5, cap: true }, [ind({ s: 1 })]).level, 2);
a.strictEqual(lScore({ impact: 5, cap: true }, [ind({ s: 1, official: true })]).level, 3);
a.deepStrictEqual(lHeadline({ a: { level: null }, b: { level: 2, R: 55, domain: "d" } }).top, ["b"]);
a.ok(lShown({ level: 0, R: 46 }) < 25); a.strictEqual(lShown({ level: 3, R: 91 }), 91);  // same as score.shown_R
console.log("ok");
