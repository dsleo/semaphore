// No framework, no tracking, no LLM. Renders docs/data/*.json.
const UI = {
  fr: {
    title: "Vigie", tag: "Service citoyen indépendant, non officiel",
    tToday: "Aujourd'hui", tPrep: "Se préparer", tTrend: "Tendances", tMore: "Détails",
    ok: "Aucune alerte prioritaire détectée", lede0: t => `Dans les sources que nous surveillons, à ${t}.`, calm: n => `${n} jours calmes d'affilée.`,
    ledeN: n => n === 1 ? "Un point demande votre attention aujourd'hui." : `${n} points demandent votre attention aujourd'hui.`,
    unknown: "Statut inconnu", staleMsg: m => `Les dernières données datent d'il y a ${m}. Ne vous fiez pas à une ancienne absence d'alerte.`,
    updated: m => `Mis à jour il y a ${m}`, err: "Impossible de charger les données.",
    risks: "Risques surveillés", tapRisk: "Touchez un risque pour voir le détail.", score: "Score",
    todo: min => min ? `À faire (environ ${min} min)` : "À faire", dont: "À éviter", why: "Pourquoi, sources et références", refs: "Références officielles",
    lvDef: ["", "À surveiller : un signal sort de la normale. Aucune action n'est demandée, restez informé.", "Préparez-vous : un risque est confirmé ou probable. Vérifiez votre kit et suivez les consignes.", "Agissez maintenant : un danger est en cours. Suivez les consignes officielles."],
    nothing: "Aucun signal inhabituel : toutes les mesures sont dans la normale.", seeMeas: "Voir les mesures",
    missing: n => `Non vérifié actuellement : ${n}.`, capped: "Niveau volontairement plafonné pour ne pas provoquer de ruée : aucune source officielle ne le confirme.",
    held: "Niveau maintenu pour éviter les fausses alertes : le changement doit être confirmé.", systemic: "Plusieurs domaines sont touchés en même temps.", shadow: "Version d'essai : les niveaux viennent de règles simples, pas encore ajustées. En cas de doute, suivez les sources officielles.",
    cov: c => `${c.ok} source${c.ok > 1 ? "s" : ""} sur ${c.total} à jour` + (c.late ? `, ${c.late} en retard` : "") + (c.down ? `, ${c.down} indisponible${c.down > 1 ? "s" : ""}` : ""),
    sAlerts: "Alertes officielles en cours", noAlerts: "Aucune alerte officielle détectée dans les sources surveillées (Météo-France, Vigicrues, Écowatt, VigiEau). Les alertes FR-Alert et celles de la préfecture ne sont pas lisibles automatiquement : consultez-les directement.",
    sLocal: "Perturbations locales à Paris", localNone: "Aucune perturbation de circulation en cours dans les données de la Ville de Paris.", localN: (n, k) => `${n} chantiers ou événements en cours, dont ${k} avec fermeture de voie.`, localNote: "Données de la Ville de Paris, mises à jour toutes les 5 minutes. Ce sont surtout des travaux et des événements prévus, pas des incidents. Aucune carte pour l'instant : liste par rue.", until: "jusqu'au", closed: "voie fermée", moreTraffic: "Voir plus", noTransit: "Les perturbations de transports (RATP, SNCF) ne sont pas encore lues : consultez les sites des exploitants.",
    sRisks: "Indices de risque", riskNote: "Indice calculé par des règles publiques à partir des mesures ci-dessous. Ce n'est ni une probabilité, ni une alerte officielle, ni une prévision de danger personnel.",
    sCtx: "Se préparer et contexte", goPrep: "Votre kit d'urgence, FR-Alert, numéros utiles", goCool: "Où se rafraîchir et boire à Paris",
    partial: "données partielles", kinds: { observed: "Mesuré", official: "Alerte officielle", forecast: "Prévision", reported: "Rapporté, non confirmé", context: "Contexte, non noté" }, areas: { paris: "Paris", idf: "Île-de-France", france: "France", world: "Monde", single: "un seul point de mesure" }, pubd: "publié", fetchd: "", ctxBadge: "Contexte",
    howLink: "Comment ce niveau est décidé",
    names: { meteo: "Météo et climat", power: "Électricité", fuel: "Carburant", cyber: "Cyberattaques", digital: "Réseaux et paiements", supply: "Alimentation" },
    hnames: { heat: "Chaleur", weather: "Vent, pluie, orages, froid", flood: "Crue de la Seine", drought: "Sécheresse", power: "Électricité", fuel: "Carburant", cyber: "Cyberattaques", digital: "Réseaux et paiements", supply: "Alimentation" },
    dMethod: "Comment le niveau est décidé", dNews: "Actualité surveillée", dSrc: "Sources de données", dHist: "Historique des changements",
    howIntro: "Le niveau vient de règles publiques, sans intelligence artificielle. Chaque risque a un score de 0 à 100 :",
    lv: ["Aucune mesure ne sort de la normale, ou un seul signe isolé et faible.", "Quelque chose sort de l'ordinaire. Aucune action requise : restez informé, vérifiez votre kit.", "Plusieurs signes concordants, ou une alerte officielle orange. Faites les petites actions conseillées.", "Situation grave confirmée, ou alerte officielle rouge. Suivez les consignes officielles."],
    lvRange: ["moins de 25", "25 à 49", "50 à 74", "75 et plus"],
    rules: ["Chaque mesure (stocks, météo, niveau de la Seine, failles, pannes…) reçoit une note selon une règle publique.", "Les mesures d'un même risque se combinent : plus elles concordent, plus le score monte. Il est pondéré par la gravité potentielle du risque.", "Les mesures qui reprennent le même signal (une prévision et l'alerte qui en découle, deux relevés d'un même flux) ne comptent qu'une fois : seule la plus forte est retenue, pour ne pas gonfler le score.", "Une alerte officielle (Météo-France ou Vigicrues orange ou rouge, Écowatt) impose un niveau minimum. Elle reste affichée comme alerte officielle, à part. La presse seule ne compte que pour les cyberattaques, par événement distinct (plusieurs médias qui reprennent la même histoire = un seul événement), avec un poids limité.", "Les failles et rançongiciels publiés dans le monde (CISA, CERT-FR, RansomLook) sont du contexte : affichés, jamais notés.", "Plusieurs domaines touchés en même temps est affiché comme un fait, sans bonus ajouté au score.", "Contre les fausses alertes : une hausse doit être confirmée sur deux mesures de suite (sauf alerte officielle) ; une baisse ne descend que d'un niveau toutes les 6 h.", "Carburant et alimentation sont plafonnés à « Préparez-vous » sans source officielle, pour ne pas provoquer de ruée.", "Pas de donnée = « inconnu », jamais « aucune alerte ». Chaque source a son propre délai de mise à jour attendu ; une source en retard réduit la confiance et est signalée."],
    meas: ["Mesure", "Valeur", "État", "Source"], st: ["Normal", "Un peu inhabituel", "Inhabituel", "Très inhabituel"],
    newsNote: "Titres de presse repérés par mot-clé, tels que publiés. Non vérifiés par nous et sans effet sur le niveau, sauf pour les cyberattaques confirmées par plusieurs médias. Fenêtre : 36 h, Paris ou France.", newsNone: "Aucun titre de crise concernant Paris ou la France ces dernières 36 h.", trigger: "mot repéré", feeds: "Flux lus", inParis: "Paris", inFrance: "France",
    srcCols: ["Source", "Nature et zone", "État", "Dernier succès", "Mise à jour attendue", "Licence"], srcOk: "à jour", srcLate: "en retard", srcKo: "indisponible", every: m => m >= 1440 ? `${Math.round(m / 1440)} j` : m >= 60 ? `${Math.round(m / 60)} h` : `${m} min`, histNone: "Aucun changement de niveau enregistré.", histCols: ["Date", "Risque", "Changement"],
    ctx: "Contexte (non noté)", enso: e => `ENSO : ${e.phase} ${e.strength} (indice ONI ${e.anom > 0 ? "+" : ""}${e.anom}, ${e.season}). Influence lente sur les prix alimentaires et le climat mondial, pas un danger direct à Paris.`,
    repo: "Code et historique",
    emerg: "Urgence :",
    disclaimer: "Ce site est un outil citoyen indépendant. Il n'émet pas d'alerte officielle : en cas d'urgence, suivez FR-Alert, la radio et la préfecture.",
    trPage: "Tendances sur 2 semaines", trHelp: "Touchez, survolez ou sélectionnez au clavier une barre pour voir le détail du jour.", trTable: "Voir les valeurs jour par jour", trUp: "En hausse", trDown: "En baisse", trSame: "Stable", trNo: "Pas assez de données",
    trCalm: n => `${n} jours calmes d'affilée`, unusual: "inhabituel par rapport à l'historique", baseNote: n => `La mention « inhabituel » demande 60 jours d'historique (${n} pour l'instant).`, trNote: "Barres pâles : jours reconstitués à partir d'archives publiques (estimation prudente, jamais plus rassurante que le réel). Barres pleines : mesurées en direct. Point gris : pas de donnée.", noData: "pas de donnée", recon: "reconstitué",
    kitT: "Votre kit d'urgence 72 h", prepIntro: "Le gouvernement recommande à chaque foyer de préparer à l'avance un kit pour tenir 72 heures sans électricité, ni eau courante, ni magasins, placé dans un endroit facile d'accès. Ce n'est pas une obligation, mais les secours se concentreront sur les personnes en grande difficulté.",
    home: "Mon foyer", persons: "personnes", needWater: n => `Eau à stocker : ${6 * n} litres (6 L × ${n})`, items: (a, b) => `${a} sur ${b} éléments prêts`,
    coolT: "Où se rafraîchir et boire à Paris", coolIntro: "Lieux climatisés ou frais ouverts au public et fontaines à boire. Les horaires et la disponibilité changent : vérifiez avant de vous déplacer.", arr: "Arrondissement", arrAll: "Tous", arrN: n => n === 1 ? "1er" : `${n}e`, coolPlaces: "Lieux frais", coolFount: "Fontaines à boire", checked: "Liste vérifiée le", paid: "payant", noPlaces: "Aucun lieu listé pour cet arrondissement.", fountN: n => `${n} fontaines en service`, skip: "Aller au contenu", 
    verified: "Dernière vérification du kit", verifyNow: "J'ai vérifié mon kit aujourd'hui", verifyDue: "À refaire deux fois par an : péremptions des médicaments et aliments, piles.", never: "jamais", print: "Imprimer ma liste",
    local: "Vos cases sont enregistrées uniquement sur cet appareil.", optional: "si besoin", pn: "Sources officielles", srcGuide: "Source"
  },
  en: {
    title: "Vigie", tag: "Independent citizen service, not official",
    tToday: "Today", tPrep: "Get ready", tTrend: "Trends", tMore: "Details",
    ok: "No priority alert detected", lede0: t => `In the sources we monitor, as of ${t}.`, calm: n => `${n} calm days in a row.`,
    ledeN: n => n === 1 ? "One thing needs your attention today." : `${n} things need your attention today.`,
    unknown: "Status unknown", staleMsg: m => `The latest data is ${m} old. Do not rely on an earlier “no alert”.`,
    updated: m => `Updated ${m} ago`, err: "Could not load data.",
    risks: "Monitored risks", tapRisk: "Tap a risk to see details.", score: "Score",
    todo: min => min ? `What to do (about ${min} min)` : "What to do", dont: "What to avoid", why: "Why, sources and references", refs: "Official references",
    lvDef: ["", "Be aware: a signal is outside the normal range. No action is asked, stay informed.", "Prepare: a risk is confirmed or likely. Check your kit and follow the guidance.", "Act now: a danger is under way. Follow the official guidance."],
    nothing: "No unusual signal: all measurements are within normal range.", seeMeas: "See the measurements",
    missing: n => `Not currently verified: ${n}.`, capped: "Level deliberately capped to avoid triggering a rush: no official source confirms it.",
    held: "Level held to avoid false alarms: the change must be confirmed.", systemic: "Several areas are affected at the same time.", shadow: "Trial version: levels come from simple rules that are not yet tuned. When in doubt, follow the official sources.",
    cov: c => `${c.ok} of ${c.total} sources current` + (c.late ? `, ${c.late} late` : "") + (c.down ? `, ${c.down} unavailable` : ""),
    sAlerts: "Official alerts now", noAlerts: "No official alert detected in the monitored sources (Météo-France, Vigicrues, Ecowatt, VigiEau). FR-Alert and préfecture alerts cannot be read automatically: check them directly.",
    sLocal: "Local disruptions in Paris", localNone: "No traffic disruption currently listed in the City of Paris data.", localN: (n, k) => `${n} works or events under way, ${k} with a road closed.`, localNote: "City of Paris data, updated every 5 minutes. Mostly planned works and events, not incidents. No map yet: a street list.", until: "until", closed: "road closed", moreTraffic: "Show more", noTransit: "Transit disruptions (RATP, SNCF) are not read yet: check the operators' sites.",
    sRisks: "Risk indices", riskNote: "An index computed by public rules from the measurements below. It is not a probability, an official alert, or a forecast of personal danger.",
    sCtx: "Get ready and context", goPrep: "Your emergency kit, FR-Alert, useful numbers", goCool: "Where to cool down and drink in Paris",
    partial: "partial data", kinds: { observed: "Measured", official: "Official alert", forecast: "Forecast", reported: "Reported, unconfirmed", context: "Context, not scored" }, areas: { paris: "Paris", idf: "Île-de-France", france: "France", world: "World", single: "single vantage point" }, pubd: "published", fetchd: "", ctxBadge: "Context",
    howLink: "How this level is decided",
    names: { meteo: "Weather and climate", power: "Power", fuel: "Fuel", cyber: "Cyberattacks", digital: "Networks and payments", supply: "Food" },
    hnames: { heat: "Heat", weather: "Wind, rain, storms, cold", flood: "Seine flood", drought: "Drought", power: "Power", fuel: "Fuel", cyber: "Cyberattacks", digital: "Networks and payments", supply: "Food" },
    dMethod: "How the level is decided", dNews: "Monitored news", dSrc: "Data sources", dHist: "Change history",
    howIntro: "The level comes from public rules, with no artificial intelligence. Each risk has a score from 0 to 100:",
    lv: ["No measurement is outside normal, or one isolated weak sign.", "Something is unusual. No action required: stay informed, check your kit.", "Several signs agree, or an official orange alert. Do the small recommended actions.", "Serious situation confirmed, or an official red alert. Follow official instructions."],
    lvRange: ["below 25", "25 to 49", "50 to 74", "75 and above"],
    rules: ["Each measurement (stocks, weather, Seine level, vulnerabilities, outages…) gets a mark from a public rule.", "Measurements for one risk combine: the more they agree, the higher the score. It is weighted by the risk's potential severity.", "Measurements that restate the same signal (a forecast and the warning built on it, two readings of one feed) count once: only the strongest is kept, so the score is not inflated.", "An official alert (Météo-France or Vigicrues orange or red, Ecowatt) sets a minimum level. It is also shown apart as an official alert. The press counts only for cyberattacks, per distinct event (several outlets repeating one story = one event), with a limited weight.", "Vulnerabilities and ransomware published worldwide (CISA, CERT-FR, RansomLook) are context: shown, never scored.", "Several areas affected at once is shown as a fact, with no bonus added to the score.", "Against false alarms: a rise must be confirmed over two runs (unless official); a fall drops only one level every 6 h.", "Fuel and food are capped at “Prepare” without an official source, to avoid triggering a rush.", "No data = “unknown”, never “no alert”. Each source has its own expected refresh time; a late source lowers confidence and is flagged."],
    meas: ["Measurement", "Value", "Status", "Source"], st: ["Normal", "Slightly unusual", "Unusual", "Very unusual"],
    newsNote: "Press headlines picked up by keyword, as published. Not verified by us and with no effect on the level, except cyberattacks confirmed by several outlets. Window: 36 h, Paris or France.", newsNone: "No crisis headline about Paris or France in the last 36 h.", trigger: "trigger word", feeds: "Feeds read", inParis: "Paris", inFrance: "France",
    srcCols: ["Source", "Nature and area", "Status", "Last success", "Expected refresh", "Licence"], srcOk: "current", srcLate: "late", srcKo: "unavailable", every: m => m >= 1440 ? `${Math.round(m / 1440)} d` : m >= 60 ? `${Math.round(m / 60)} h` : `${m} min`, histNone: "No level change recorded.", histCols: ["Date", "Risk", "Change"],
    ctx: "Context (not scored)", enso: e => `ENSO: ${e.phase} ${e.strength} (ONI ${e.anom > 0 ? "+" : ""}${e.anom}, ${e.season}). Slow influence on food prices and global climate, not a direct danger in Paris.`,
    repo: "Code and history",
    emerg: "Emergency:",
    disclaimer: "This is an independent citizen tool. It issues no official alert: in an emergency follow FR-Alert, the radio and the préfecture.",
    trPage: "Trends over 2 weeks", trHelp: "Tap, hover or select a bar with the keyboard to see that day.", trTable: "Show day-by-day values", trUp: "Rising", trDown: "Easing", trSame: "Stable", trNo: "Not enough data",
    trCalm: n => `${n} calm days in a row`, unusual: "unusual compared with history", baseNote: n => `The “unusual” label needs 60 days of history (${n} so far).`, trNote: "Pale bars: days reconstructed from public archives (a cautious estimate, never more reassuring than reality). Solid bars: measured live. Grey dot: no data.", noData: "no data", recon: "reconstructed",
    kitT: "Your 72 h emergency kit", prepIntro: "The government recommends every household prepare in advance a kit to last 72 hours without power, running water or shops, kept somewhere easy to reach. It is not mandatory, but rescue services will focus on people in greatest difficulty.",
    home: "My household", persons: "people", needWater: n => `Water to store: ${6 * n} litres (6 L × ${n})`, items: (a, b) => `${a} of ${b} items ready`,
    coolT: "Where to cool down and drink in Paris", coolIntro: "Cool or air-conditioned public places and drinking fountains. Opening hours and availability change: check before going.", arr: "Arrondissement", arrAll: "All", arrN: n => n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`, coolPlaces: "Cool places", coolFount: "Drinking fountains", checked: "List checked on", paid: "paid", noPlaces: "No place listed for this arrondissement.", fountN: n => `${n} fountains in service`, skip: "Skip to content", 
    verified: "Kit last checked", verifyNow: "I checked my kit today", verifyDue: "Repeat twice a year: medication and food expiry dates, batteries.", never: "never", print: "Print my list",
    local: "Your ticks are saved on this device only.", optional: "if needed", pn: "Official sources", srcGuide: "Source"
  }
};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let lang = (() => { try { return localStorage.getItem("lang"); } catch { return null; } })() || ((navigator.language || "fr").slice(0, 2) === "en" ? "en" : "fr");
if (!["fr", "en"].includes(lang)) lang = "fr";
let S, M, H, P, tab = "today", sel = null, sec = null;
const u = () => UI[lang];
const loc = () => lang === "fr" ? "fr-FR" : "en-GB";
const tx = v => (v && typeof v === "object") ? (v[lang] || v.en) : v;
const fmt = iso => iso ? new Date(iso).toLocaleString(loc(), { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" }) : "—";
const fmtDay = d => new Date(d + "T12:00:00").toLocaleDateString(loc(), { weekday: "short", day: "numeric", month: "short" });
const age = iso => { const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 6e4)); return m < 1 ? (lang === "fr" ? "à l'instant" : "just now") : m < 90 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} ${lang === "fr" ? "j" : "d"}`; };
const ageMin = iso => (Date.now() - new Date(iso)) / 6e4;
const lvName = l => M.levels[lang][l];
const dom = d => M.domains[d][lang];
const msg = id => M.hazards[id][lang];
const link = (t, h) => /^https?:\/\//.test(h) ? `<a href="${esc(h)}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t);
const badge = l => l === 0 ? "" : l == null ? `<span class="badge bu">${u().unknown}</span>` : `<span class="badge b${l}">${esc(lvName(l))}</span>`;
const stBadge = s => { const k = s <= 0 ? 0 : s < 0.4 ? 1 : s < 0.7 ? 2 : 3; return `<span class="badge b${k}">${u().st[k]}</span>`; };

// ---- clusters: what the citizen sees (6 tiles) -> hazards computed underneath
const CL = [["meteo", ["heat", "weather", "flood", "drought"]], ["power", ["power"]], ["fuel", ["fuel"]], ["cyber", ["cyber"]], ["digital", ["digital"]], ["supply", ["supply"]]];
const ICON = {
  meteo: '<path d="M7 17a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 8.5a3.5 3.5 0 0 1 .5 7"/><path d="M12 11l-2 4h3l-2 5"/>',
  power: '<path d="M13 2L5 14h6l-1 8 9-12h-6z"/>',
  fuel: '<path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h14M5 10h10M15 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V9l-3-3"/>',
  cyber: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  digital: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/>',
  supply: '<path d="M3 9h18l-2 11H5zM8 9l3-6M16 9l-3-6"/>'
};
const icon = id => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[id]}</svg>`;
const clState = ([id, hs]) => { const lv = hs.map(h => S.hazards[h].level).filter(l => l != null), rs = hs.map(h => S.hazards[h].R).filter(r => r != null); return { id, hs, level: lv.length ? Math.max(...lv) : null, R: rs.length ? Math.round(Math.max(...rs)) : null }; };
const partial = c => c.hs.some(h => S.hazards[h].missing.length);
const tile = c => `<button class="tile t${c.level == null ? "u" : c.level}" data-h="${c.id}" aria-pressed="${sel === c.id}" aria-label="${esc(u().names[c.id])}, ${c.level == null ? u().unknown : esc(lvName(c.level))}, ${u().score} ${c.R ?? "?"}">${icon(c.id)}<span class="tn">${esc(u().names[c.id])}</span><span class="ts">${c.R ?? "?"}<small> / 100</small></span>${badge(c.level)}${partial(c) ? `<span class="muted">${u().partial}</span>` : ""}</button>`;

// ---- measurements
const meta = i => `${u().kinds[i.kind] || ""} · ${u().areas[i.area] || ""}`;
function mtable(inds) {  // stacked list: readable on a phone, no cramped columns
  return `<ul class="meas">${inds.map(i => `<li><div class="mh"><b>${esc(tx(i.label))}</b>${i.kind === "context" ? `<span class="badge bn">${u().ctxBadge}</span>` : stBadge(i.s)}</div><div>${esc(tx(i.value))}</div>
    <div class="muted">${esc(meta(i))}</div>
    <div class="muted" title="${esc(i.sha)}">${link(S.sources[i.source].name, i.link)} · ${i.pub ? `${u().pubd} ${esc(String(i.pub).length > 10 ? fmt(i.pub) : i.pub)} · ` : ""}${u().fetchd} ${fmt(i.fetched)}</div></li>`).join("")}</ul>`;
}

// ---- a risk that needs attention
function hzBlock(id) {
  const h = S.hazards[id], m = msg(id), l = h.level;
  if (l == null) return `<div class="row"><span>${esc(u().hnames[id])}</span>${badge(null)}</div>`;
  if (l === 0) return `<div class="row"><span>${esc(u().hnames[id])}</span>${badge(0)}</div>`;
  const hot = h.indicators.filter(i => i.s > 0);
  const notes = [h.capped && u().capped, h.held && u().held, h.missing.length && u().missing(h.missing.map(s => S.sources[s].name).join(", "))].filter(Boolean).map(t => `<p class="muted">${esc(t)}</p>`).join("");
  return `<section class="hz">${badge(l)} <span class="muted">${u().score} ${Math.round(h.R)} / 100</span><h3>${esc(m.title)}</h3><p>${esc(m.what)}</p>
  <div class="lab">${u().todo(M.minutes[l])}</div><ol class="todo">${(m.do[l] || m.do[3]).map(x => `<li>${esc(x)}</li>`).join("")}</ol>
  ${l >= 2 ? `<div class="lab">${u().dont}</div><ul class="avoid">${m.dont.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}${notes}
  <details class="plain"><summary>${u().why}</summary>
  <div class="lab">${u().refs}</div><ul class="links">${m.refs.map(r => `<li>${link(r.t, r.u)}</li>`).join("")}</ul>
  ${mtable(hot.length ? hot : h.indicators)}</details></section>`;
}

function detailPanel(c) {
  const hs = c.hs.slice().sort((a, b) => (S.hazards[b].level ?? -1) - (S.hazards[a].level ?? -1) || (S.hazards[b].R ?? 0) - (S.hazards[a].R ?? 0));
  const calm = hs.every(h => S.hazards[h].level === 0);
  const all = hs.flatMap(h => S.hazards[h].indicators);
  const body = calm ? `<p>${u().nothing}</p><details class="plain"><summary>${u().seeMeas}</summary>${mtable(all)}</details>` : hs.map(hzBlock).join("");
  const heat = c.id === "meteo" && S.hazards.heat.level >= 1 ? `<p><a href="#" data-go="prep" data-sec="cool">${u().goCool} →</a></p>` : "";
  return col(esc(u().names[c.id]), body + heat, "detail");
}

// ---- Today: official alerts -> local disruptions -> risk indices -> context
let tmore = false;
function alertsBlock() {
  const A = S.alerts || [];
  const body = A.length ? `<ul class="meas">${A.map(a => `<li><div class="mh"><b>${esc(tx(a.label))}</b>${stBadge(a.s)}</div><div>${esc(tx(a.value))}</div><div class="muted">${link(S.sources[a.source].name, a.link)} · ${u().areas[a.area]} · ${a.pub ? `${u().pubd} ${esc(String(a.pub).length > 10 ? fmt(a.pub) : a.pub)}` : `${u().fetchd} ${fmt(a.fetched)}`}</div></li>`).join("")}</ul>` : `<p>${u().noAlerts}</p>`;
  return col(u().sAlerts, body);
}
function localBlock() {
  const T = S.context && S.context.traffic;
  if (!T) return col(u().sLocal, `<p class="muted">${u().noTransit}</p>`);
  const rows = (tmore ? T.items : T.items.slice(0, 6)).map(x => `<li><b>${esc(x.street)}</b>${x.closed ? ` <span class="badge b1">${u().closed}</span>` : ""}<br><span class="muted">${esc(x.what)} · ${u().until} ${fmt(x.until)}</span></li>`).join("");
  return col(u().sLocal, `${T.n ? `<p>${u().localN(T.n, T.closed)}</p><ul class="meas">${rows}</ul>${T.items.length > 6 ? `<p><button class="btn sec" id="moreT" aria-expanded="${tmore}">${tmore ? "−" : u().moreTraffic}</button></p>` : ""}` : `<p>${u().localNone}</p>`}
    <p class="muted">${u().localNote} ${link(S.sources.traffic.name, T.link)}</p><p class="muted">${u().noTransit}</p>`);
}
const why = id => { const i = S.hazards[id].indicators.filter(x => x.kind !== "context").sort((a, b) => b.s - a.s)[0]; return i ? `${tx(i.label)} : ${tx(i.value)}` : ""; };
function today() {
  const a = ageMin(S.generated), stale = a > 180, hd = S.headline;
  if (stale || hd.level == null) return `<div class="alert au"><h1>${u().unknown}</h1><p>${stale ? u().staleMsg(age(S.generated)) : u().err}</p></div>`;
  const banners = (S.shadow ? `<div class="notice">${u().shadow}</div>` : "") + (hd.systemic ? `<div class="notice">${u().systemic}</div>` : "");
  const cls = CL.map(clState);
  const bad = cls.filter(c => c.level >= 1).sort((x, y) => y.level - x.level || y.R - x.R);
  if (sel === null) sel = bad[0] ? bad[0].id : "";
  const n = Object.values(S.hazards).filter(h => h.level >= 1).length, T = S.trends || {};
  const clock = new Date(S.generated).toLocaleTimeString(loc(), { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
  const lede = n ? u().ledeN(n) : u().lede0(clock) + (T.all && T.all.calm >= 2 ? " " + u().calm(T.all.calm) : "");
  const unk = Object.keys(S.hazards).filter(id => S.hazards[id].level == null).map(id => u().hnames[id]);
  const cur = n ? hd.level : 0, cc = cls.find(c => c.id === sel);
  const cv = S.coverage;
  return banners + `<div class="alert a${cur}"><div class="eyebrow">Paris</div><h1>${esc(n ? lvName(hd.level) : u().ok)}</h1>${n ? "" : `<p>${esc(lede)}</p>`}
    ${n ? `<ul class="plainl">${Object.keys(S.hazards).filter(id => S.hazards[id].level >= 1).sort((a, b) => S.hazards[b].level - S.hazards[a].level).map(id => `<li><b>${esc(u().hnames[id])}</b> : ${esc(why(id))}</li>`).join("")}</ul>` : ""}
    ${cv.late || cv.down ? `<p class="muted">${esc(u().cov(cv))} · <a href="#" data-go="more" data-sec="src">${u().dSrc}</a></p>` : ""}
    <ol class="scale" aria-hidden="true">${M.levels[lang].map((x, i) => `<li class="${i === cur ? "on" : ""}${n && i === 0 ? " off" : ""}">${esc(x)}</li>`).join("")}</ol></div>
    ${alertsBlock()}${localBlock()}${newsBlock()}
    ${col(u().sRisks, `<p class="muted">${u().riskNote}</p><div class="grid">${cls.map(tile).join("")}</div>`)}
    ${cc ? detailPanel(cc) : ""}
    ${unk.length ? `<p class="muted">${esc(u().missing(unk.join(", ")))}</p>` : ""}`;
}

// ---- Se préparer
const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch { return null; } };
let kit = store("kit") || { n: 2, on: {}, at: null };
const saveKit = () => store("kit", kit);
const kitItems = () => P.groups.flatMap(g => g.items);
const kitDone = () => kitItems().filter(i => kit.on[i.id]).length;

function prepare() {
  const t = kitItems().filter(i => !i.opt).length, d = kitDone();
  const groups = P.groups.map(g => col(esc(tx(g.t)), `${g.items.map(i => {
    const label = i.water ? `${tx(i.t)} : ${6 * kit.n} L` : tx(i.t);
    return `<label class="chk"><input type="checkbox" data-id="${i.id}" ${kit.on[i.id] ? "checked" : ""}><span>${esc(label)}${i.opt ? ` <span class="muted">(${u().optional})</span>` : ""}${i.why ? `<small>${esc(tx(i.why))}</small>` : ""}</span></label>`;
  }).join("")}`)).join("");
  return `<h1>${u().kitT}</h1><p>${u().prepIntro}</p><p class="muted">${u().srcGuide} : ${link(tx(P.source.t), P.source.u)}</p>
  ${col(u().home, `<div class="persons"><button data-n="-1" aria-label="−">−</button><output>${kit.n}</output><button data-n="1" aria-label="+">+</button><span>${u().persons}</span></div>
  <div class="need">${u().needWater(kit.n)}</div>
  <div class="bar"><b style="width:${Math.min(100, Math.round(100 * d / t))}%"></b></div><p class="muted" style="margin:0">${u().items(d, t)}</p>
  <p class="muted">${u().verified} : <b>${esc(kit.at ? fmt(kit.at) : u().never)}</b>. ${u().verifyDue}</p>
  <p><button class="btn" id="verify">${u().verifyNow}</button> <button class="btn sec" onclick="print()">${u().print}</button></p><p class="muted">${u().local}</p>`)}
  ${groups}
  ${col(esc(tx(P.know.t)), `<ul class="plainl">${P.know.items.map(x => `<li>${esc(tx(x))}</li>`).join("")}</ul>`)}
  <div class="accs">${coolBlock()}</div><h2>${u().pn}</h2><ul class="links">${P.links.map(l => `<li>${link(tx(l.t), l.u)}</li>`).join("")}</ul>`;
}
let PL = null, arr = "";
function coolList() {
  if (!PL) return "";
  const f = x => !arr || x.a === +arr, eq = PL.equipments.filter(f), fo = PL.fountains.filter(f);
  return `<h3>${u().coolPlaces}</h3>${eq.length ? `<ul class="meas">${eq.slice(0, 40).map(x => `<li><b>${esc(x.n)}</b>${x.p === "Oui" ? ` <span class="badge bn">${u().paid}</span>` : ""}<br><span class="muted">${esc(x.t || "")} · ${esc((x.ad || "").replace(/\s+/g, " "))}${x.a ? ", " + x.a + "e" : ""}</span></li>`).join("")}</ul>` : `<p>${u().noPlaces}</p>`}
  <h3>${u().coolFount}</h3><p>${u().fountN(fo.length)}${arr ? "" : ""}</p>${arr ? `<ul class="plainl">${fo.slice(0, 25).map(x => `<li>${esc(x.ad)}</li>`).join("")}</ul>` : ""}`;
}
function coolBlock() {
  if (!PL) return "";
  return `<details class="acc" data-k="cool" id="s-cool" ${sec === "cool" || OP.has("cool") ? "open" : ""}><summary>${u().coolT}</summary><div class="in"><p>${u().coolIntro}</p>
    <label for="arr"><b>${u().arr}</b></label> <select id="arr"><option value="">${u().arrAll}</option>${Array.from({ length: 20 }, (_, k) => `<option value="${k + 1}" ${+arr === k + 1 ? "selected" : ""}>${u().arrN(k + 1)}</option>`).join("")}</select>
    <div id="coolList">${coolList()}</div><p class="muted">${u().checked} ${fmt(PL.checked)} · ${link("Paris Data : " + u().coolPlaces, PL.links.equipments)} · ${link("Paris Data : " + u().coolFount, PL.links.fountains)}</p></div></details>`;
}

// ---- Tendances
const trWord = t => ({ rising: u().trUp, easing: u().trDown, stable: u().trSame })[t.trend] || u().trNo;
function spark(ser) {
  ser = ser.slice(-14); const w = 300 / ser.length, Hh = 56;
  const bars = ser.map((r, i) => {
    const tip = `${fmtDay(r[0])} · ` + (r[1] == null ? u().noData : `${lvName(r[2])} · ${u().score.toLowerCase()} ${Math.round(r[1])}${r[3] === "recon" ? " · " + u().recon : ""}`);
    const hgt = r[1] == null ? 0 : Math.max(3, Math.min(52, r[1] * 0.9));
    return `<rect class="col" x="${i * w}" y="0" width="${w}" height="${Hh}" tabindex="0" role="img" aria-label="${esc(tip)}" data-tip="${esc(tip)}"><title>${esc(tip)}</title></rect>` + (r[1] == null
      ? `<rect class="gap" x="${i * w + w / 2 - 3}" y="${Hh - 4}" width="6" height="3"/>`
      : `<rect class="bar${r[2]}${r[3] === "recon" ? " recon" : ""}" x="${i * w + 3}" y="${Hh - hgt}" width="${w - 6}" height="${hgt}"/>`);
  }).join("");
  return `<svg class="spark" viewBox="0 0 300 ${Hh}" preserveAspectRatio="none" role="img" aria-label="${esc(u().trHelp)}">${bars}</svg><div class="tip" aria-live="polite">&nbsp;</div><div class="axis"><span>${fmtDay(ser[0][0])}</span><span>${fmtDay(ser[ser.length - 1][0])}</span></div>
  <details class="plain"><summary>${u().trTable}</summary><table><tbody>${ser.map(r => `<tr><td>${fmtDay(r[0])}</td><td>${r[1] == null ? u().noData : esc(lvName(r[2])) + " · " + Math.round(r[1]) + (r[3] === "recon" ? " · " + u().recon : "")}</td></tr>`).join("")}</tbody></table></details>`;
}
function trends() {
  const T = S.trends || {};
  const rows = Object.entries(T).filter(([k]) => k !== "all").map(([k, t]) => {
    const cls = t.trend === "rising" ? "b2" : t.trend === "easing" ? "b0" : t.trend === "stable" ? "bn" : "bu";
    return `<div class="tr"><div class="trh"><b>${esc(dom(k))}</b><span class="badge ${cls}">${trWord(t)}</span></div>
      <p class="muted" style="margin:.2em 0">${t.calm >= 2 ? esc(u().trCalm(t.calm)) : ""}${t.unusual ? (t.calm >= 2 ? " · " : "") + esc(u().unusual) : ""}</p>${spark(t.series)}</div>`;
  }).join("");
  return `<h1>${u().trPage}</h1><p class="muted">${u().trHelp}</p><section class="panel">${rows}<p class="muted">${u().trNote} ${(T.all && T.all.base < 60) ? u().baseNote(T.all.base) : ""}</p></section>`;
}

// ---- Détails: collapsible sections
const OP = new Set();
const col = (title, body, id = "") => `<details class="acc sep" data-k="${esc(title)}" ${OP.has(title) ? "open" : ""}${id ? ` id="${id}"` : ""}><summary>${title}</summary><div class="in">${body}</div></details>`;
const acc = (id, title, body) => `<details class="acc" data-k="${id}" id="s-${id}" ${sec === id || OP.has(id) ? "open" : ""}><summary>${title}</summary><div class="in">${body}</div></details>`;
function methodBody() {
  return `<p>${u().howIntro}</p><ol class="lvls">${[0, 1, 2, 3].map(i => `<li>${badge(i)} <b>${u().lvRange[i]}</b><br>${esc(u().lv[i])}</li>`).join("")}</ol>
  <ul class="plainl">${u().rules.map(r => `<li>${esc(r)}</li>`).join("")}</ul>`;
}
function newsBlock() {
  const N = S.context && S.context.news; if (!N) return "";
  return col(`${u().dNews} (${N.items.length})`, newsBody());
}
function newsBody() {
  const N = S.context && S.context.news; if (!N) return "";
  const items = N.items.length ? `<ul class="links">${N.items.map(i => `<li><span class="muted">${esc(tx(N.themes[i.theme]))} · ${i.scope === "paris" ? u().inParis : u().inFrance}</span><br><a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.title)}</a><br><span class="muted">${esc(i.source)} · ${fmt(i.published)} · ${u().trigger} : « ${esc(i.kw)} »</span></li>`).join("")}</ul>` : `<p>${u().newsNone}</p>`;
  return `<p class="muted">${u().newsNote}</p>${items}<p class="muted">${u().feeds} : ${N.feeds.map(f => link(f.name, f.link)).join(", ")}</p>`;
}
function srcBody() {
  const st = s => s.status === "current" ? `<span class="badge b0">${u().srcOk}</span>` : s.status === "late" ? `<span class="badge b1">${u().srcLate}</span>` : `<span class="badge b3">${u().srcKo}</span>`;
  const rows = Object.values(S.sources).map(s => `<tr><td>${link(s.name, s.link)}</td><td>${esc(u().kinds[s.kind])}<br><span class="muted">${esc(u().areas[s.area])}</span></td><td>${st(s)}</td><td>${fmt(s.last_ok)}</td><td>${u().every(s.every)}</td><td>${esc(s.lic)}</td></tr>`).join("");
  const e = S.context && S.context.enso;
  return `<div class="tw"><table><thead><tr>${u().srcCols.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>${e ? `<h3>${u().ctx}</h3><p>${esc(u().enso(e))} ${link("NOAA CPC", e.link)}</p>` : ""}${S.repo ? `<p>${link(u().repo, S.repo)}</p>` : ""}`;
}
function histBody() {
  if (!H.length) return `<p>${u().histNone}</p>`;
  return `<div class="tw"><table><thead><tr>${u().histCols.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${[...H].reverse().slice(0, 60).map(e => `<tr><td>${fmt(e.ts)}</td><td>${esc(msg(e.hazard).title)}</td><td>${esc(lvName(e.from))} → ${esc(lvName(e.to))}<br><span class="muted">${e.why.map(w => esc(tx(w.label)) + " : " + esc(tx(w.value))).join(" · ")}</span></td></tr>`).join("")}</tbody></table></div>`;
}
function more() {
  return `<h1>${u().tMore}</h1><div class="accs">${acc("method", u().dMethod, methodBody())}${acc("src", u().dSrc, srcBody())}${acc("hist", u().dHist, histBody())}</div>`;
}

// ---- shell
function render() {
  document.documentElement.lang = lang; document.title = u().title; $("#title").textContent = u().title; $("#lang").textContent = lang === "fr" ? "EN" : "FR"; $(".skip").textContent = u().skip;
  if (!S || !M || !P) { $("#view").innerHTML = `<p>${u().err}</p>`; return; }
  $("#view").innerHTML = tab === "today" ? today() : tab === "prep" ? prepare() : tab === "trend" ? trends() : more();
  const t = (k, l) => `<button class="tab" ${tab === k ? 'aria-current="page"' : ""} data-t="${k}">${l}</button>`;
  $("#nav").innerHTML = t("today", u().tToday) + t("prep", u().tPrep) + t("trend", u().tTrend) + t("more", u().tMore);
  $("#foot").innerHTML = `<details class="emerg"><summary>${u().emerg} 112 · 15 · 17 · 18</summary><p>${u().disclaimer}</p></details><p class="upd">${u().updated(age(S.generated))}</p>`;
  const go = (k, s) => { tab = k; sec = s || null; render(); window.scrollTo(0, 0); if (s) document.getElementById("s-" + s)?.scrollIntoView(); else { const h = document.querySelector("#view h1"); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } } };
  document.querySelectorAll("[data-t]").forEach(b => b.onclick = () => go(b.dataset.t));
  document.querySelectorAll("[data-go]").forEach(b => b.onclick = e => { e.preventDefault(); go(b.dataset.go, b.dataset.sec); });
  document.querySelectorAll(".chk input").forEach(c => c.onchange = () => { kit.on[c.dataset.id] = c.checked; saveKit(); const y = scrollY; render(); scrollTo(0, y); });
  document.querySelectorAll("[data-n]").forEach(b => b.onclick = () => { kit.n = Math.min(12, Math.max(1, kit.n + +b.dataset.n)); saveKit(); const y = scrollY; render(); scrollTo(0, y); });
  document.querySelectorAll(".tile").forEach(b => b.onclick = () => { sel = sel === b.dataset.h ? "" : b.dataset.h; if (sel) OP.add(esc(u().names[sel])); render(); document.getElementById("detail")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); });
  const ar = $("#arr"); if (ar) ar.onchange = () => { arr = ar.value; $("#coolList").innerHTML = coolList(); };
  const mt = $("#moreT"); if (mt) mt.onclick = () => { tmore = !tmore; const y = scrollY; render(); scrollTo(0, y); };
  const v = $("#verify"); if (v) v.onclick = () => { kit.at = new Date().toISOString(); saveKit(); const y = scrollY; render(); scrollTo(0, y); };
}
// trend tooltips: hover on desktop, tap on phones
const showTip = e => { const c = e.target.closest && e.target.closest("[data-tip]"); if (!c) return; const row = c.closest(".tr"); row.querySelector(".tip").textContent = c.dataset.tip; row.querySelectorAll(".col").forEach(x => x.classList.toggle("hot", x === c)); };
$("#view").addEventListener("toggle", e => { const k = e.target.dataset && e.target.dataset.k; if (k != null) e.target.open ? OP.add(k) : OP.delete(k); }, true);
$("#view").addEventListener("pointerover", showTip); $("#view").addEventListener("click", showTip); $("#view").addEventListener("focusin", showTip);

$("#lang").onclick = () => { lang = lang === "fr" ? "en" : "fr"; try { localStorage.setItem("lang", lang); } catch { } const y = scrollY; render(); scrollTo(0, y); };
const j = f => fetch(`data/${f}?t=${Date.now()}`, { cache: "no-store" }).then(r => { if (!r.ok) throw 0; return r.json(); });
Promise.all([j("state.json"), j("messages.json"), j("prepare.json"), j("history.json").catch(() => []), j("places.json").catch(() => null)]).then(([s, m, p, h, pl]) => { S = s; M = m; P = p; H = h; PL = pl; render(); }).catch(() => { $("#view").innerHTML = `<p>${u().err}</p>`; });
// every 5 min: fetch fresh data and redraw only if it changed; otherwise just update the "updated ... ago" line
setInterval(() => {
  if (!S) return;
  j("state.json").then(n => { if (n.generated !== S.generated) { S = n; const y = scrollY; render(); scrollTo(0, y); } }).catch(() => { });
}, 3e5);
setInterval(() => { if (S && M) { const f = $("#foot .upd"); if (f) f.textContent = u().updated(age(S.generated)); } }, 6e4);
