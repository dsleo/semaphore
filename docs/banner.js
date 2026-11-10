// One-question card (👍 👎 ✕), shown inline at the bottom of a commune's "Aujourd'hui" tab: app.js calls askHTML(lang).
// Any click (vote or close) removes it at once and, remembered in localStorage (this device only), it never comes back.
// With several asks it shows the next unanswered one, rotating by day.
// A vote is one GoatCounter event pixel (no cookie): path /ask/<id>/<up|down>, plus /ask/<id>/<up|down>/<INSEE> from ?c=.
// GoatCounter dedupes visitors itself (daily hash of IP + user agent); read counts under "Events" in the dashboard.
// ponytail: one-ask array today; add entries to rotate. A demand signal, not a poll: the same person can vote again another day.
const GC = "https://dsleo.goatcounter.com/count";
const ASKS = [{
  id: "digest",
  fr: "Recevoir chaque matin la situation de votre commune par e-mail ?",
  en: "Get your commune's situation by email every morning?"
}];
const askSt = (k, v) => { try { return v === undefined ? localStorage.getItem("ask:" + k) : localStorage.setItem("ask:" + k, v); } catch { return null; } };
function askHTML(l) {
  const left = ASKS.filter(a => !askSt(a.id));
  if (!left.length) return "";
  const a = left[Math.floor(Date.now() / 864e5) % left.length], t = (fr, en) => l === "fr" ? fr : en;
  return `<aside class="ask" data-ask="${a.id}" aria-label="Feedback"><p>${a[l]}</p><span class="ask-b">` +
    `<button type="button" data-v="up" aria-label="${t("Oui", "Yes")}" title="${t("Oui", "Yes")}">👍</button>` +
    `<button type="button" data-v="down" aria-label="${t("Non", "No")}" title="${t("Non", "No")}">👎</button>` +
    `<button type="button" data-v="x" aria-label="${t("Fermer", "Close")}" title="${t("Fermer", "Close")}">✕</button></span></aside>`;
}
document.getElementById("view")?.addEventListener("click", e => {
  const v = e.target.closest(".ask [data-v]"); if (!v) return;
  const box = v.closest(".ask"), id = box.dataset.ask, c = new URLSearchParams(location.search).get("c") || "-";
  askSt(id, v.dataset.v); box.remove();
  if (v.dataset.v === "x") return;
  for (const p of [`/ask/${id}/${v.dataset.v}`, ...(/^\d[0-9AB]\d{3}$/.test(c) ? [`/ask/${id}/${v.dataset.v}/${c}`] : [])])
    new Image().src = `${GC}?e=true&p=${encodeURIComponent(p)}&t=${encodeURIComponent("Ask " + id)}`;
});
