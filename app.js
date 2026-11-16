"use strict";

/* =====================================================================
 * Bestimmungs-Trainer
 *   📖 Schlüssel ansehen · 🧠 Merkmal → Tier · 📷 Prüfung (Auswahl) · ✍️ Prüfung (schriftlich)
 *   ★ Markierte Tiere (je Gruppe und gemischt) · ⚠ Häufig falsch · 📊 Lernfortschritt
 * ===================================================================== */

/* ---------- kleine Helfer ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const txHTML = (tx) => esc(tx || "").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>");
const plain = (tx) => (tx || "").replace(/\*/g, "");
const boldNames = (tx) => [...(tx || "").matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]);
const labelText = (l) => (l ? (l.endsWith(".") ? l : l + ")") : "");
const enc = encodeURIComponent;
const IMG = typeof IMAGES !== "undefined" ? IMAGES : {};

function firstItalic(tx) {
  const m = (tx || "").replace(/\*\*(.+?)\*\*/g, "").match(/\*([^*]+)\*/);
  return m ? m[1] : null;
}
function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function pickWeighted(items, weightFn) {
  const w = items.map(weightFn);
  const sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 0) return items[Math.floor(Math.random() * items.length)];
  let r = Math.random() * sum;
  for (let i = 0; i < items.length; i++) { r -= w[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

/* ---------- Speicher (nur in diesem Browser) ---------- */
const STORE_KEY = "bestimmungstrainer-v2";
function loadDB() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
}
const DB = Object.assign({ learn: {}, exam: {}, write: {}, marked: {}, days: {}, examDate: "", fullName: false }, loadDB());
for (const k of ["learn", "exam", "write", "marked", "days"]) DB[k] = DB[k] || {};
function saveDB() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); } catch (e) { /* privater Modus o. Ä. */ }
}
function countDay() { const t = todayStr(); DB.days[t] = (DB.days[t] || 0) + 1; }
function rec(area, gid, name) {
  DB[area][gid] = DB[area][gid] || {};
  return (DB[area][gid][name] = DB[area][gid][name] || { box: 0, n: 0, ok: 0, last: 0 });
}
const peek = (area, gid, name) => (DB[area][gid] && DB[area][gid][name]) || { box: 0, n: 0, ok: 0, last: 0 };

/* ---------- Lernfortschritt je Tier (über alle Modi zusammen) ---------- */
const EMPTY_STAT = { right: 0, wrong: 0, help: 0, streak: 0, last: 0 };
function statRec(gid, name) {
  DB.stats[gid] = DB.stats[gid] || {};
  return (DB.stats[gid][name] = DB.stats[gid][name] || { ...EMPTY_STAT });
}
const statOf = (gid, name) => (DB.stats[gid] && DB.stats[gid][name]) || EMPTY_STAT;
const attempts = (s) => s.right + s.wrong + s.help;
if (!DB.stats) {
  // einmalige Übernahme des bisherigen Fortschritts: fehlerfreie Durchgänge = richtig, der Rest = mit Hilfe
  DB.stats = {};
  for (const area of ["learn", "exam", "write"]) for (const gid in DB[area]) for (const name in DB[area][gid]) {
    const p = DB[area][gid][name], s = statRec(gid, name);
    s.right += p.ok || 0;
    s.help += Math.max(0, (p.n || 0) - (p.ok || 0));
    s.last = Math.max(s.last, p.last || 0);
  }
  saveDB();
}
/* Ergebnis eines Durchgangs verbuchen: perfect = fehlerfrei, failed = mindestens einmal falsch / aufgedeckt, sonst „mit Hilfe“ */
function updateBox(area, gid, name, perfect, failed) {
  const p = rec(area, gid, name);
  p.n++; p.last = Date.now();
  if (perfect) { p.ok++; p.box = Math.min(5, p.box + 1); } else if (failed) p.box = Math.max(0, p.box - 1);
  const s = statRec(gid, name);
  if (perfect) { s.right++; s.streak++; } else if (failed) { s.wrong++; s.streak = 0; } else { s.help++; s.streak = 0; }
  s.last = Date.now();
  countDay(); saveDB();
}
/* „Häufig falsch“: mehr als 3× falsch – und noch nicht wieder 3× hintereinander richtig */
const ERROR_LIMIT = 3, ERROR_STREAK = 3;
const isErrorAnimal = (gid, name) => { const s = statOf(gid, name); return s.wrong > ERROR_LIMIT && s.streak < ERROR_STREAK; };
function progBadge(gid, name, detail) {
  const s = statOf(gid, name), n = attempts(s);
  if (!n) return `<span class="prog none">noch nicht geübt</span>`;
  const p = Math.round((s.right / n) * 100);
  const cls = p >= 80 ? "hi" : p >= 50 ? "mid" : "lo";
  const title = `${s.right}× richtig · ${s.wrong}× falsch · ${s.help}× mit Hilfe`;
  return `<span class="prog ${cls}" title="${title}">${p} % richtig</span>${detail ? ` <span class="prog-detail">${title}</span>` : ""}`;
}

/* ---------- Markierte Tiere ---------- */
const markedList = (gid) => DB.marked[gid] || [];
const isMarked = (gid, name) => markedList(gid).includes(name);
function toggleMark(gid, name) {
  const list = markedList(gid).slice();
  const i = list.indexOf(name);
  if (i >= 0) list.splice(i, 1); else list.push(name);
  DB.marked[gid] = list;
  saveDB();
}
function markBtn(gid, name, label) {
  const on = isMarked(gid, name);
  return `<button class="mark ${on ? "on" : ""}" data-act="mark" data-g="${esc(gid)}" data-n="${esc(name)}" title="${on ? "Markierung entfernen" : "Zum Lernbereich „Markierte Tiere“ hinzufügen"}">${on ? "★" : "☆"} ${esc(label || (on ? "Markiert" : "Markieren"))}</button>`;
}

/* ---------- Schlüssel vorbereiten ---------- */
(function prepare() {
  function walk(opts, kid, pre) {
    for (const o of opts) {
      o.uid = kid + ":" + pre + o.l;
      o.key = kid;
      o.sib = opts;
      if (o.c) walk(o.c, kid, pre + o.l + "/");
    }
  }
  for (const k of Object.values(KEYS)) if (k.items) walk(k.items, k.id, "");
})();

const groupById = (id) => GROUPS.find((g) => g.id === id);
const keyOfScope = (scopeId) => KEYS[(scopeId || "").split("#")[0]];

function findNode(key, path) {
  let opts = key.items, node = null;
  for (const lab of path.split("/")) {
    node = (opts || []).find((o) => o.l === lab);
    if (!node) throw new Error("Pfad nicht gefunden: " + key.id + "#" + path);
    opts = node.c;
  }
  return node;
}
function scopesFor(gid) {
  const out = [];
  for (const k of Object.values(KEYS)) {
    if (k.group !== gid || k.hidden) continue;
    out.push({ id: k.id, title: k.title, page: k.page, main: !!k.main });
    if (k.main) for (const e of SCOPES_EXTRA.filter((s) => s.id.startsWith(k.id + "#"))) out.push({ id: e.id, title: e.title, page: k.page, part: true });
  }
  return out;
}
function getAsks(o, isLeaf) {
  if (o.ask) return o.ask;
  const b = boldNames(o.tx);
  if (b.length) return b.map((x) => [x]);
  if (isLeaf && o.tx) return [[plain(o.tx).split(/[;,:]/)[0].trim()]];
  return [];
}

/* ---------- alle Wege (Pfade) durch einen Schlüssel ---------- */
const leafCache = {};
function buildLeaves(scopeId) {
  if (leafCache[scopeId]) return leafCache[scopeId];
  const [kid, entry] = scopeId.split("#");
  const leaves = [];
  function explore(options, steps) {
    for (const o of options) afterChosen(o, [...steps, { type: "choice", node: o }]);
  }
  function afterChosen(o, steps) {
    const isEnd = !o.c && !o.go;
    const s = o.tx ? [...steps, { type: "res", node: o }] : steps;
    if (isEnd) { leaves.push(makeLeaf(o, s)); return; }
    if (o.c) explore(o.c, s); else enter(o.go, s);
  }
  function enter(goStr, steps) {
    const [gk, p] = goStr.split("#");
    const k = KEYS[gk];
    const s = [...steps, { type: "enter", key: gk }];
    if (k.single) afterChosen(singleNode(k), s);
    else if (!p) explore(k.items, s);
    else afterChosen(findNode(k, p), s);
  }
  const key = KEYS[kid];
  if (entry) explore(findNode(key, entry).c, []); else explore(key.items, []);

  // gleiche Namen über mehrere Wege: für die Auswahl nur einmal, alle Wege bleiben in .all erhalten
  const seen = new Set();
  const result = leaves.filter((l) => (seen.has(l.name) ? false : (seen.add(l.name), true)));
  result.all = leaves;
  leafCache[scopeId] = result;
  return result;
}
const singleCache = {};
function singleNode(k) {
  return (singleCache[k.id] = singleCache[k.id] || { l: "", t: "", tx: k.single, n: k.n, ask: k.ask, uid: k.id + ":single", key: k.id });
}
function makeLeaf(o, steps) {
  const asks = getAsks(o, true);
  const name = asks.length ? asks[asks.length - 1][0] : plain(o.tx);
  return { node: o, steps, name, accept: asks.length ? asks[asks.length - 1] : [name], tx: o.tx, de: o.de, sci: firstItalic(o.tx) };
}
const imagesOf = (gid, name) => IMG[gid + "/" + name] || [];
const leafByName = (gid, name) => buildLeaves(groupById(gid).main).find((l) => l.name === name);
/* Alle fett gedruckten Namen entlang des Weges, z. B. Carnivora → Canidae → Haushund (für „Mit Familie bestimmen“) */
function chainOf(leaf) {
  const out = [];
  for (const s of leaf.steps) if (s.type === "res") for (const a of getAsks(s.node, s.node === leaf.node)) out.push(a);
  return out.length ? out : [leaf.accept];
}

/* Von welcher Alternative aus ist welche Art erreichbar? (manche Arten haben mehrere gültige Wege) */
const reachCache = {};
function reachMap(gid) {
  if (reachCache[gid]) return reachCache[gid];
  const map = new Map();
  // Nur bei Insekten führen mehrere Wege legitim zur selben Ordnung (z. B. Phasmida mit/ohne Flügel).
  // Bei den anderen Gruppen zählt nur der im Schlüssel vorgesehene erste Weg (z. B. Bläßhuhn unter AAAA).
  const g = groupById(gid);
  const leaves = g.keepDuplicates ? buildLeaves(g.main).all : buildLeaves(g.main);
  for (const l of leaves) {
    for (const s of l.steps) {
      if (s.type !== "choice") continue;
      if (!map.has(s.node)) map.set(s.node, new Set());
      map.get(s.node).add(l.name);
    }
  }
  return (reachCache[gid] = map);
}
function validFor(gid, name, o) {
  const set = reachMap(gid).get(o);
  return !!(set && set.has(name));
}

/* Nach einer Wahl weitergehen: Ergebnisse sammeln, Teilschlüssel öffnen – bis zur nächsten Verzweigung oder zum Ende */
function expand(o) {
  const trail = [];
  let cur = o;
  for (let guard = 0; guard < 20; guard++) {
    if (cur.tx) trail.push({ type: "res", node: cur });
    if (cur.c) return { trail, opts: cur.c };
    if (!cur.go) return { trail, leaf: cur };
    const [gk, p] = cur.go.split("#");
    const k = KEYS[gk];
    if (k.single) { const leaf = singleNode(k); trail.push({ type: "res", node: leaf }); return { trail, leaf }; }
    trail.push({ type: "enter", key: gk, entry: p });
    if (!p) return { trail, opts: k.items };
    cur = findNode(k, p);
  }
  return { trail, leaf: cur };
}

/* ---------- Textvergleich (Merkmale: grob, nicht wortwörtlich) ---------- */
function norm(s) {
  return (s || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[¹₁]/g, "1").replace(/[²₂]/g, "2").replace(/[³₃]/g, "3")
    .replace(/[^a-z0-9]+/g, " ").trim();
}
const STOP = new Set("der die das den dem des ein eine einer eines einem einen und als ist sind wird werden im in am an auf zu zum zur bis vom von bei etwa sich so wie i d r s u z t l p c m je".split(" "));
const tokens = (s) => norm(s).split(" ").filter((w) => w && !STOP.has(w));
const tw = (w) => (/^\d+$/.test(w) ? 1 : w.length <= 3 ? 0.5 : 1);
function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
function wordMatch(a, b) {
  if (a === b) return true;
  if (a === "un" + b || b === "un" + a) return false;
  const m = Math.min(a.length, b.length);
  if (m < 4) return false;
  let p = 0;
  while (p < m && a[p] === b[p]) p++;
  if (p >= Math.max(5, Math.ceil(0.75 * m))) return true;
  const tol = m >= 9 ? 2 : m >= 5 ? 1 : 0;
  return tol > 0 && Math.abs(a.length - b.length) <= tol && lev(a, b) <= tol;
}
const NEG = new Set(["nicht", "ohne", "kein", "keine", "keinen", "nie", "weder"]);
/* Anteil der Wörter einer Alternative, die in der Eingabe vorkommen (Gleichstand-Entscheid) */
function coverage(inTok, text) {
  const at = tokens(text);
  return at.length ? at.filter((u) => inTok.some((t) => wordMatch(t, u))).length / at.length : 0;
}
function scoreAlt(inTok, text) {
  const at = tokens(text);
  let m = 0;
  for (const t of inTok) if (!NEG.has(t) && at.some((u) => wordMatch(t, u))) m += tw(t);
  // Verneinungen entscheiden oft zwischen zwei Alternativen („hakenförmig“ vs. „nicht hakenförmig“)
  for (const n of NEG) {
    const inIn = inTok.includes(n), inAlt = at.includes(n);
    if (inIn && inAlt) m += 1;
    else if (inIn !== inAlt) m -= 1;
  }
  return m;
}
/* Welche Alternative meint die Eingabe? → { v: ok | part | bad, opt, msg } */
function judgeChoice(input, opts, isValid) {
  let text = input.trim(), label = null;
  const lm = text.match(/^([A-Za-z]{1,5}|\d)\s*[).:]?(?:\s+|$)(.*)$/s);
  if (lm && opts.some((o) => o.l.replace(".", "").toUpperCase() === lm[1].toUpperCase())) { label = lm[1].toUpperCase(); text = lm[2]; }
  const byLabel = label ? opts.find((o) => o.l.replace(".", "").toUpperCase() === label) : null;
  const inTok = tokens(text);
  if (!inTok.length) {
    if (byLabel && isValid(byLabel)) return { v: "part", msg: "Die Alternative stimmt – nenne zusätzlich das Merkmal." };
    return { v: "bad", msg: byLabel ? "Diese Alternative trifft nicht zu." : "Bitte ein Merkmal eintippen." };
  }
  const scores = opts.map((o) => scoreAlt(inTok, o.t));
  const best = Math.max(...scores);
  if (best === 0) return { v: "bad", msg: "Das passt zu keiner Alternative an dieser Stelle." };
  let top = opts.filter((_, i) => scores[i] === best);
  if (top.length > 1) {
    // Gleichstand: die Alternative, deren Merkmal deutlich vollständiger getroffen wurde
    const cov = top.map((o) => coverage(inTok, o.t)).sort((a, b) => b - a);
    const bestCov = Math.max(...top.map((o) => coverage(inTok, o.t)));
    if (bestCov - cov[1] >= 0.25) top = top.filter((o) => coverage(inTok, o.t) === bestCov);
  }
  if (top.length === 1) {
    const o = top[0];
    if (isValid(o)) return { v: "ok", opt: o };
    return { v: "bad", msg: `Das passt zu ${labelText(o.l)} – trifft auf dieses Tier aber nicht zu.` };
  }
  if (byLabel && top.includes(byLabel)) return isValid(byLabel) ? { v: "ok", opt: byLabel } : { v: "bad", msg: "Diese Alternative trifft nicht zu." };
  return { v: "part", msg: "Nicht eindeutig – das passt zu mehreren Alternativen. Formuliere etwas genauer." };
}

/* ---------- Namensvergleich mit Rechtschreibprüfung ----------
 * Kleine Fehler (Tippfehler, Groß-/Kleinschreibung, ae statt ä …) werden erkannt, aber als Schreibfehler
 * gemeldet und zählen nicht als fehlerfrei. → { v: ok | bad, spell, right, msg } */
function judgeName(input, accepts, sci) {
  const raw = (input || "").trim().replace(/\s+/g, " ");
  const n = norm(raw).replace(/ /g, "");
  if (!n) return null;
  let hit = null;
  for (const a of accepts) {
    const an = norm(a).replace(/ /g, "");
    const tol = an.length <= 5 ? 0 : an.length <= 9 ? 1 : 2;
    if (n === an || (an.length >= 3 && n.includes(an)) || lev(n, an) <= tol) { hit = a; break; }
  }
  let viaSci = false;
  if (!hit && sci) {
    const sn = norm(sci).replace(/ /g, "");
    if (n === sn || lev(n, sn) <= 2) { hit = sci; viaSci = true; }
  }
  if (!hit) return { v: "bad" };
  const exact = raw.includes(hit) || (!viaSci && accepts.some((a) => raw.includes(a)));
  const msgs = [];
  if (!exact) msgs.push(`Achte auf die Rechtschreibung: richtig ist „${hit}“ – du hast „${raw}“ geschrieben.`);
  if (viaSci) msgs.push(`Der wissenschaftliche Name stimmt – fett gedruckt im Schlüssel ist „${accepts[0]}“.`);
  return { v: "ok", spell: !exact, right: hit, msg: msgs.join(" ") };
}
const spellHTML = (res) => (res && res.msg ? `<div class="fb ${res.spell ? "spell" : "info"}">${res.spell ? "✎ " : ""}${esc(res.msg)}</div>` : "");

/* Mehrere fett gedruckte Namen auf einmal, z. B. „Carnivora; Canidae; Haushund“ (Reihenfolge egal) */
function judgeChain(input, leaf) {
  const chain = chainOf(leaf);
  const parts = input.split(/\s*(?:[;,\n/→>|]|\s-\s)\s*/).map((p) => p.trim()).filter(Boolean);
  const used = new Set();
  const rows = chain.map((acc, i) => {
    const sci = i === chain.length - 1 ? leaf.sci : null;
    for (let j = 0; j < parts.length; j++) {
      if (used.has(j)) continue;
      const r = judgeName(parts[j], acc, sci);
      if (r && r.v === "ok") { used.add(j); return { found: true, part: parts[j], res: r }; }
    }
    return { found: false };
  });
  // weitere erlaubte Namen derselben Stelle (z. B. „Waldmaus / Gelbhalsmaus“) zählen nicht als überzählig
  const extra = parts.filter((p, j) => !used.has(j) && !chain.some((acc, i) => rows[i].found && judgeName(p, acc)?.v === "ok"));
  const ok = rows.every((r) => r.found) && !extra.length;
  const spell = rows.some((r) => r.found && r.res.spell);
  return { v: ok ? "ok" : "bad", spell, rows, extra, chain };
}
function chainHTML(jc) {
  const items = jc.rows.map((r) => r.found
    ? `<li class="${r.res.spell ? "spell" : "ok"}">${r.res.spell ? "✎" : "✓"} ${esc(r.res.right)}${r.res.spell ? ` <span class="muted">(du: „${esc(r.part)}“)</span>` : ""}</li>`
    : `<li class="miss">✗ hier fehlt noch ein fett gedruckter Name</li>`).join("");
  const extra = jc.extra.map((p) => `<li class="miss">✗ „${esc(p)}“ passt an keiner Stelle</li>`).join("");
  return `<ul class="chain-res">${items}${extra}</ul>`;
}

/* Wörter, die eine Alternative von ihren Geschwistern unterscheiden (für Tipps) */
function keyWords(o) {
  const others = o.sib.filter((x) => x !== o).flatMap((x) => tokens(x.t));
  const seen = new Set();
  return tokens(o.t).filter((w) => w.length > 3 && !others.some((u) => wordMatch(w, u)) && !seen.has(w) && seen.add(w));
}

/* =====================================================================
 * Seitenbausteine
 * ===================================================================== */
function crumbs(parts) {
  return `<nav class="crumbs">${parts.map(([href, text]) => (href ? `<a href="${href}">${esc(text)}</a>` : `<span>${esc(text)}</span>`)).join('<span class="sep">/</span>')}</nav>`;
}
function setPage(html) { $("#app").innerHTML = html; }
function photoHTML(imgs, idx, opts = {}) {
  if (!imgs.length) return `<div class="photo empty">Kein Foto vorhanden</div>`;
  const im = imgs[idx % imgs.length];
  return `<figure class="photo ${opts.small ? "small" : ""}">
    <img src="${esc(im.src)}" alt="Foto des zu bestimmenden Tieres" data-act="zoom">
    <button class="photo-zoom" data-act="zoom" aria-label="Foto vergrößern">⤢</button>
    ${imgs.length > 1 ? `<div class="photo-nav">${imgs.map((_, i) => `<button class="${i === idx % imgs.length ? "on" : ""}" data-act="photo" data-i="${i}">${i + 1}</button>`).join("")}</div>` : ""}
    ${opts.credit ? `<figcaption>${creditHTML(im)}</figcaption>` : ""}
  </figure>`;
}
function creditHTML(im) {
  return `Foto: ${esc(im.artist || "unbekannt")} · <a href="${esc(im.page)}" target="_blank" rel="noopener">${esc(im.license || "Wikimedia Commons")}</a>`;
}
const unitOf = (gid, n) => (gid === "insekten" ? (n === 1 ? "Ordnung" : "Ordnungen") : n === 1 ? "Art" : "Arten");
const tiere = (n) => `${n} ${n === 1 ? "Tier" : "Tiere"}`;
const pct = (a, b) => Math.round((a / Math.max(1, b)) * 100);
const barHTML = (a, b) => `<span class="bar"><span style="width:${pct(a, b)}%"></span></span>`;

/* ---------- Übungs-Kontext: eine Gruppe, deren markierte Tiere oder gemischt über alle Gruppen ---------- */
const MIX = {
  m: { title: "Alle markierten Tiere", short: "alle markierten", icon: "★" },
  f: { title: "Häufig falsch", short: "häufig falsch", icon: "⚠" },
};
function mixItems(mix, needImg) {
  const out = [];
  for (const g of GROUPS) for (const l of buildLeaves(g.main)) {
    const inMix = mix === "m" ? isMarked(g.id, l.name) : isErrorAnimal(g.id, l.name);
    if (inMix && (!needImg || imagesOf(g.id, l.name).length)) out.push({ gid: g.id, leaf: l });
  }
  return out;
}
function learnItems(ctx) {
  if (ctx.mix) return mixItems(ctx.mix, false);
  const gid = keyOfScope(ctx.scopeId).group;
  let p = buildLeaves(ctx.scopeId);
  if (ctx.marked) p = p.filter((l) => isMarked(gid, l.name));
  return p.map((leaf) => ({ gid, leaf }));
}
function examItems(ctx) {
  if (ctx.mix) return mixItems(ctx.mix, true);
  let p = buildLeaves(groupById(ctx.gid).main).filter((l) => imagesOf(ctx.gid, l.name).length);
  if (ctx.marked) p = p.filter((l) => isMarked(ctx.gid, l.name));
  return p.map((leaf) => ({ gid: ctx.gid, leaf }));
}
const ctxKey = (c) => JSON.stringify([c.scopeId || c.gid || "", !!c.marked, c.mix || ""]);
/* Tier-Auswahl: schwache Tiere öfter, nicht dasselbe zweimal hintereinander */
function pickItem(area, items, prev) {
  const now = Date.now();
  return pickWeighted(items, (it) => {
    if (prev && prev.gid === it.gid && prev.name === it.leaf.name && items.length > 1) return 0;
    const p = peek(area, it.gid, it.leaf.name);
    let w = p.n ? Math.pow(6 - p.box, 2) : 16;
    if (p.last && now - p.last < 4 * 60000) w *= 0.3;
    return w;
  });
}
function ctxCrumbs(state, title) {
  const c = state.ctx;
  if (c.mix) return crumbs([["#/", "Start"], ["#/mix/" + c.mix, MIX[c.mix].title], [null, title]]);
  const g = groupById(state.gid);
  return crumbs([["#/", "Start"], ["#/g/" + g.id, g.name], c.marked ? ["#/m/" + g.id, "Markiert"] : null, [null, title]].filter(Boolean));
}
function poolText(state) {
  const c = state.ctx, n = state.poolSize;
  const unit = c.mix ? (n === 1 ? "Tier" : "Tiere") : unitOf(state.gid, n);
  return `${n} ${unit} im Pool${c.marked ? " (markiert)" : c.mix ? ` (${MIX[c.mix].short})` : ""}`;
}
const sessionFor = (prev, ctx) => (prev && ctxKey(prev.ctx) === ctxKey(ctx) ? prev.session : { n: 0, perfect: 0, skipped: 0 });
function emptyPool(ctx, title) {
  const msg = ctx.mix === "m" ? "Unter deinen markierten Tieren ist keines mit Foto."
    : ctx.mix === "f" ? "Gerade gibt es keine Tiere, die öfter als 3× falsch waren. 🎉"
    : ctx.marked ? "Unter deinen markierten Tieren ist keines mit Foto." : "Für diese Gruppe sind keine Fotos hinterlegt.";
  const fake = { ctx, gid: ctx.gid };
  setPage(`${ctxCrumbs(fake, title)}<div class="card empty-state">${msg}</div>`);
}

/* ---------- Startseite ---------- */
function renderHome() {
  const t = todayStr();
  let countdown = "";
  if (DB.examDate) {
    const diff = Math.round((new Date(DB.examDate + "T00:00:00") - new Date(t + "T00:00:00")) / 86400000);
    countdown = diff > 0 ? `noch <b>${diff}</b> Tag${diff === 1 ? "" : "e"}` : diff === 0 ? "<b>heute – viel Erfolg!</b>" : "vorbei";
  }
  let h = `<section class="hero">
    <h1>Bestimmungs-Trainer</h1>
    <p>Wähle eine Tiergruppe. Dort kannst du den Schlüssel ansehen, Merkmale lernen und die Prüfung mit echten Fotos üben.</p>
    <div class="hero-row">
      <label class="exam">Testat am <input type="date" data-act="exam" value="${esc(DB.examDate)}"></label>
      ${countdown ? `<span class="countdown">${countdown}</span>` : ""}
      <span class="muted small">Heute geübt: ${DB.days[t] || 0}</span>
    </div>
  </section>
  <div class="groups">`;
  for (const g of GROUPS) {
    const leaves = buildLeaves(g.main);
    const sure = leaves.filter((l) => Math.max(peek("exam", g.id, l.name).box, peek("write", g.id, l.name).box) >= 2).length;
    const marked = markedList(g.id).length;
    h += `<a class="group-tile" href="#/g/${g.id}">
      <span class="g-icon">${g.icon}</span>
      <span class="g-name">${esc(g.name)}</span>
      <span class="g-sub">${leaves.length} ${unitOf(g.id, leaves.length)}${marked ? ` · ${marked} markiert` : ""}</span>
      ${barHTML(sure, leaves.length)}
      <span class="g-sub">${sure} sicher bestimmt</span>
    </a>`;
  }
  const nMarked = mixItems("m", false).length, nErr = mixItems("f", false).length;
  h += `</div>
  <h2 class="section-title">Gemischt über alle Gruppen</h2>
  <div class="mix-tiles">
    <a class="mix-tile" href="#/mix/m"><span class="m-icon">★</span><span><span class="m-title">Alle markierten Tiere</span>
      <span class="m-text">${nMarked ? `${tiere(nMarked)} aus allen Gruppen gemischt abfragen` : "Noch keine Tiere markiert"}</span></span></a>
    <a class="mix-tile warn" href="#/mix/f"><span class="m-icon">⚠</span><span><span class="m-title">Häufig falsch</span>
      <span class="m-text">${nErr ? `${tiere(nErr)} ${nErr === 1 ? "war" : "waren"} öfter als 3× falsch` : "Kein Tier war öfter als 3× falsch"}</span></span></a>
  </div>`;
  setPage(h);
}

/* ---------- Gruppenseite ---------- */
function renderGroup(gid) {
  const g = groupById(gid);
  if (!g) return renderHome();
  const leaves = buildLeaves(g.main);
  const withImg = leaves.filter((l) => imagesOf(gid, l.name).length).length;
  const count = (area) => leaves.filter((l) => peek(area, gid, l.name).box >= 2).length;
  const marked = markedList(gid).length;
  const tried = leaves.filter((l) => attempts(statOf(gid, l.name))).length;
  const u = unitOf(gid, 2);
  const card = (href, icon, title, text, prog, extra = "") => `<a class="mode-card ${extra}" href="${href}">
      <span class="m-icon">${icon}</span>
      <span class="m-title">${title}</span>
      <span class="m-text">${text}</span>
      ${prog || ""}
    </a>`;
  const prog = (a, b, word) => `<span class="m-prog">${barHTML(a, b)}${a}/${b} ${u} ${word}</span>`;
  setPage(`${crumbs([["#/", "Start"], [null, g.name]])}
  <h1 class="g-title">${esc(g.name)}</h1>
  <div class="modes">
    ${card(`#/k/${g.main}`, "📖", "Schlüssel ansehen", "Der komplette Bestimmungsschlüssel wie im Skript – alle Teilschlüssel zum Durchklicken.")}
    ${card(`#/l/${g.main}`, "🧠", "Lernen: Merkmal → Tier", "Du bekommst die Merkmale eines Weges durch den Schlüssel und nennst das Tier.", prog(count("learn"), leaves.length, "gelernt"))}
    ${card(`#/x/${gid}`, "📷", "Prüfung mit Auswahl", "Echtes Foto – du wählst bei jedem Schritt die zutreffende Alternative aus.", prog(count("exam"), withImg, "sicher"))}
    ${card(`#/w/${gid}`, "✍️", "Prüfung schriftlich", "Wie im Testat: echtes Foto, du schreibst jedes Merkmal und jeden fett gedruckten Namen selbst auf. Mit Tipps und Aufdecken.", prog(count("write"), withImg, "sicher"), "accent")}
    ${card(`#/m/${gid}`, "★", "Markierte Tiere", marked ? `${marked} ${unitOf(gid, marked)} gemerkt – gezielt wiederholen.` : "Noch nichts markiert. Markiere schwierige Tiere mit ☆, dann landen sie hier.", "", "marked")}
    ${card(`#/p/${gid}`, "📊", "Lernfortschritt", "Für jedes Tier: wie oft richtig und falsch – in Prozent.", `<span class="m-prog">${barHTML(tried, leaves.length)}${tried}/${leaves.length} ${u} schon geübt</span>`)}
  </div>`);
}

/* =====================================================================
 * 📖 Schlüssel ansehen
 * ===================================================================== */
function renderKey(kid) {
  const k = KEYS[kid];
  if (!k) return renderHome();
  const g = groupById(k.group);
  const leafNames = new Set(buildLeaves(g.main).map((l) => l.name));
  const star = (node) => {
    const name = makeLeaf(node, []).name;
    if (!leafNames.has(name)) return "";
    return markBtn(g.id, name, " ") + (attempts(statOf(g.id, name)) ? " " + progBadge(g.id, name) : "");
  };
  function opts(list) {
    return `<ol class="couplet">${list.map((o) => {
      let go = "";
      if (o.go) {
        const [gk, p] = o.go.split("#");
        const target = KEYS[gk];
        go = target.single
          ? `<div class="kv-res single">→ ${txHTML(target.single)} ${star(singleNode(target))}${target.n ? `<div class="note">${esc(target.n)}</div>` : ""}</div>`
          : `<a class="kv-go" href="#/k/${enc(gk)}">weiter im Teilschlüssel <b>${esc(target.title.split(",")[0])}</b>${p ? " ab " + esc(labelText(p.split("/").pop())) : ""} →</a>`;
      }
      const terminal = o.tx && !o.c && !o.go;
      return `<li><div class="kv-row"><span class="lab">${esc(labelText(o.l))}</span><span class="kv-t">${esc(o.t)}</span></div>
        ${o.tx ? `<div class="kv-res">${txHTML(o.tx)}${o.de ? ` <span class="muted small">(${esc(o.de)})</span>` : ""}${terminal ? " " + star(o) : ""}</div>` : ""}
        ${o.n ? `<div class="note">${esc(o.n)}</div>` : ""}
        ${go}
        ${o.c ? opts(o.c) : ""}</li>`;
    }).join("")}</ol>`;
  }
  const subs = scopesFor(k.group).filter((s) => !s.part);
  const sheet = k.group === "fische" && k.main
    ? `<details class="card sheet"><summary>Merkmalsblatt Fische – Begriffe wie endständig, kehlständig, Fettflosse</summary>
        <img src="${esc(typeof FISH_SHEET !== "undefined" ? FISH_SHEET : "")}" alt="Merkmalsblatt Süßwasserfische" data-act="zoom"></details>` : "";
  setPage(`${crumbs([["#/", "Start"], ["#/g/" + g.id, g.name], [null, "Schlüssel"]])}
  <div class="key-nav" aria-label="Teilschlüssel">${subs.map((s) => `<a href="#/k/${enc(s.id)}" class="${s.id === kid ? "on" : ""}">${esc(s.main ? "Hauptschlüssel" : s.title.split(",")[0].split(" (")[0])}</a>`).join("")}</div>
  <h1 class="key-title">${esc(k.title)} <span class="muted small">${esc(k.page || "")}</span></h1>
  ${sheet}
  <div class="card key-card">${k.single ? `<div class="kv-res">${txHTML(k.single)} ${star(singleNode(k))}</div>` : opts(k.items)}</div>
  <p class="muted small legend"><b>Fett</b> = dicke Markierung im Schlüssel · ☆ = Tier markieren · % = Anteil richtiger Bestimmungen.${k.group === "insekten" ? " Deutsche Namen in Klammern sind eine Zusatzhilfe und stehen nicht im Original." : ""}</p>`);
  const on = $(".key-nav .on");
  if (on) on.scrollIntoView({ inline: "center", block: "nearest" });
}

/* =====================================================================
 * ★ Markierte Tiere / gemischte Bereiche
 * ===================================================================== */
function animalCard(gid, leaf, foot) {
  const im = imagesOf(gid, leaf.name)[0];
  return `<div class="marked-item">
      ${im ? `<img src="${esc(im.src)}" alt="" data-act="zoom">` : `<div class="noimg">kein Foto</div>`}
      <div class="mi-body"><div class="mi-name">${txHTML(leaf.tx)}${leaf.de ? ` <span class="muted small">(${esc(leaf.de)})</span>` : ""}</div>
      <div class="mi-prog">${progBadge(gid, leaf.name, true)}</div>
      <div class="mi-foot">${foot}</div></div>
    </div>`;
}
function renderMarked(gid) {
  const g = groupById(gid);
  if (!g) return renderHome();
  const names = markedList(gid).filter((n) => leafByName(gid, n));
  const withImg = names.filter((n) => imagesOf(gid, n).length).length;
  let h = `${crumbs([["#/", "Start"], ["#/g/" + gid, g.name], [null, "Markierte Tiere"]])}
  <h1>★ Markierte Tiere</h1>`;
  if (!names.length) {
    setPage(h + `<div class="card empty-state">
      <p>Hier sammeln sich Tiere, die du gezielt wiederholen willst.</p>
      <p class="muted">Markieren kannst du mit <b>☆ Markieren</b> – im Schlüssel neben jeder Art, beim Lernen und in beiden Prüfungsmodi (auch mitten in der Bestimmung, ohne dass der Name verraten wird).</p>
      <a class="btn" href="#/k/${g.main}">Zum Schlüssel</a></div>`);
    return;
  }
  h += `<div class="marked-actions">
    <a class="btn primary" href="#/l/${g.main}/m">🧠 Merkmal → Tier</a>
    ${withImg ? `<a class="btn" href="#/x/${gid}/m">📷 Prüfung mit Auswahl</a><a class="btn" href="#/w/${gid}/m">✍️ Prüfung schriftlich</a>` : ""}
  </div>
  <p class="muted small">Diese Übungen verwenden nur deine ${names.length} markierten ${unitOf(gid, names.length)}.${withImg < names.length ? ` Für die Prüfungen zählen nur Tiere mit Foto (${withImg}).` : ""} Alle markierten Tiere aus allen Gruppen gemischt findest du auf der <a href="#/mix/m">Startseite</a>.</p>
  <div class="marked-grid">${names.map((n) => animalCard(gid, leafByName(gid, n), markBtn(gid, n, "Entfernen"))).join("")}</div>`;
  setPage(h);
}
function renderMix(mix) {
  const M = MIX[mix];
  if (!M) return renderHome();
  const items = mixItems(mix, false);
  const withImg = items.filter((it) => imagesOf(it.gid, it.leaf.name).length).length;
  const intro = mix === "m"
    ? "Alle Tiere, die du in irgendeiner Gruppe mit ☆ markiert hast – Vögel, Säugerschädel, Insekten und Fische gemischt."
    : `Alle Tiere, die öfter als ${ERROR_LIMIT}× falsch bestimmt wurden (in irgendeinem Modus). Ein Tier verlässt diese Liste, sobald du es ${ERROR_STREAK}× hintereinander richtig hast – bei einem neuen Fehler kommt es zurück.`;
  let h = `${crumbs([["#/", "Start"], [null, M.title]])}
  <h1>${M.icon} ${M.title}</h1>
  <p class="muted">${intro}</p>`;
  if (!items.length) {
    setPage(h + `<div class="card empty-state">${mix === "m" ? "Noch keine Tiere markiert. Markieren kannst du mit ☆ im Schlüssel, beim Lernen und in den Prüfungen." : "Gerade gibt es keine Tiere, die öfter als 3× falsch waren. 🎉"}</div>`);
    return;
  }
  if (mix === "f") items.sort((a, b) => { const sa = statOf(a.gid, a.leaf.name), sb = statOf(b.gid, b.leaf.name); return sa.right / attempts(sa) - sb.right / attempts(sb); });
  h += `<div class="marked-actions">
    <a class="btn primary" href="#/l/alle/${mix}">🧠 Merkmal → Tier</a>
    ${withImg ? `<a class="btn" href="#/x/alle/${mix}">📷 Prüfung mit Auswahl</a><a class="btn" href="#/w/alle/${mix}">✍️ Prüfung schriftlich</a>` : ""}
  </div>
  <p class="muted small">${tiere(items.length)}${withImg < items.length ? ` · für die Prüfungen zählen nur Tiere mit Foto (${withImg})` : ""}.</p>`;
  for (const g of GROUPS) {
    const mine = items.filter((it) => it.gid === g.id);
    if (!mine.length) continue;
    h += `<h2 class="section-title">${g.icon} ${esc(g.name)} <span class="muted small">${mine.length}</span></h2>
    <div class="marked-grid">${mine.map((it) => {
      const s = statOf(it.gid, it.leaf.name);
      const foot = mix === "m" ? markBtn(it.gid, it.leaf.name, "Entfernen")
        : `<span class="muted small">${s.streak ? `${s.streak}/${ERROR_STREAK} in Folge richtig` : `${s.wrong}× falsch`}</span>${markBtn(it.gid, it.leaf.name)}`;
      return animalCard(it.gid, it.leaf, foot);
    }).join("")}</div>`;
  }
  setPage(h);
}

/* =====================================================================
 * 📊 Lernfortschritt je Tier
 * ===================================================================== */
function renderProgress(gid) {
  const g = groupById(gid);
  if (!g) return renderHome();
  const leaves = buildLeaves(g.main).slice();
  const score = (l) => { const s = statOf(gid, l.name), n = attempts(s); return n ? s.right / n : 2; };
  leaves.sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name, "de"));
  const tried = leaves.filter((l) => attempts(statOf(gid, l.name)));
  const sum = tried.reduce((acc, l) => { const s = statOf(gid, l.name); acc.r += s.right; acc.n += attempts(s); return acc; }, { r: 0, n: 0 });
  const nErr = leaves.filter((l) => isErrorAnimal(gid, l.name)).length;
  setPage(`${crumbs([["#/", "Start"], ["#/g/" + gid, g.name], [null, "Lernfortschritt"]])}
  <h1>📊 Lernfortschritt</h1>
  <p class="muted">Alle Modi zusammen gezählt. Die Prozentzahl ist der Anteil der fehlerfreien Bestimmungen. „Mit Hilfe“ (Tipp, Zwischengruppe, Schreibfehler) zählt nicht als richtig, aber auch nicht als falsch.</p>
  <div class="prog-summary">
    <span><b>${tried.length}</b>/${leaves.length} ${unitOf(gid, 2)} geübt</span>
    <span><b>${sum.n ? Math.round((sum.r / sum.n) * 100) : 0} %</b> richtig insgesamt</span>
    <span><a href="#/mix/f">⚠ <b>${nErr}</b> häufig falsch</a></span>
  </div>
  <div class="card prog-table">
    ${leaves.map((l) => {
      const s = statOf(gid, l.name), n = attempts(s);
      const p = n ? Math.round((s.right / n) * 100) : 0;
      return `<div class="prog-row ${isErrorAnimal(gid, l.name) ? "err" : ""}">
        <div class="pr-name">${txHTML(l.tx)}${l.de ? ` <span class="muted small">(${esc(l.de)})</span>` : ""}</div>
        <div class="pr-bar">${n ? `<span class="bar ${p >= 80 ? "hi" : p >= 50 ? "mid" : "lo"}"><span style="width:${p}%"></span></span>` : ""}</div>
        <div class="pr-val">${progBadge(gid, l.name)}<span class="prog-detail">${n ? `${s.right} richtig · ${s.wrong} falsch${s.help ? ` · ${s.help} mit Hilfe` : ""}` : ""}</span></div>
        <div class="pr-mark">${markBtn(gid, l.name, " ")}</div>
      </div>`;
    }).join("")}
  </div>`);
}

/* =====================================================================
 * 🧠 Lernen: Merkmal → Tier
 * ===================================================================== */
let L = null;
function startLearn(ctx) {
  const items = learnItems(ctx);
  if (!items.length) return ctx.mix ? renderMix(ctx.mix) : renderMarked(keyOfScope(ctx.scopeId).group);
  const it = pickItem("learn", items, L && L.leaf && { gid: L.gid, name: L.leaf.name });
  L = { ctx, gid: it.gid, leaf: it.leaf, help: false, failed: false, showMid: false, choices: null, input: "", fb: null, done: false, session: sessionFor(L, ctx), photo: 0, poolSize: items.length };
  renderLearn();
}
function finishLearn(ok) {
  const perfect = ok && !L.help && !L.failed;
  updateBox("learn", L.gid, L.leaf.name, perfect, !ok || L.failed);
  L.session.n++; if (perfect) L.session.perfect++;
  L.done = true; L.ok = ok;
  renderLearn();
}
function learnCheck(value) {
  if (L.done) return;
  const res = judgeName(value, L.leaf.accept, L.leaf.sci);
  if (!res) return;
  if (res.v === "ok") { if (res.spell) L.help = true; L.fb = res; return finishLearn(true); }
  L.failed = true;
  L.fb = { v: "bad", pick: value };
  renderLearn();
}
function renderLearn() {
  const leaf = L.leaf, c = L.ctx;
  const feats = leaf.steps.filter((s) => s.type === "choice");
  const mids = leaf.steps.filter((s) => s.type === "res" && s.node !== leaf.node && boldNames(s.node.tx).length).map((s) => getAsks(s.node)[0][0]);
  const g = groupById(L.gid);
  const scopeSel = c.mix ? `<span class="pill">${MIX[c.mix].icon} ${MIX[c.mix].short} (${L.poolSize})</span>`
    : c.marked ? `<span class="pill">★ nur markierte (${L.poolSize})</span>`
    : `<select data-act="scope" aria-label="Schlüssel wählen">${scopesFor(L.gid).map((s) => `<option value="${esc(s.id)}" ${s.id === c.scopeId ? "selected" : ""}>${esc(s.main ? "Ganzer Schlüssel" : s.title)}</option>`).join("")}</select>`;
  let h = `${ctxCrumbs(L, "Merkmal → Tier")}
  <div class="toolbar"><h1>Merkmal → Tier</h1>${scopeSel}</div>
  <section class="card learn-card">
    <div class="card-head"><div class="eyebrow">${c.mix ? `${g.icon} ${esc(g.name)} · ` : ""}Welches Tier hat diese Merkmale?</div>${markBtn(L.gid, leaf.name)}</div>
    <ol class="feat">${feats.map((s) => `<li>${esc(s.node.t)}</li>`).join("")}</ol>`;
  if (!L.done) {
    if (L.showMid) h += `<div class="hintbox">${mids.length ? `Der Weg führt über: <b>${mids.map(esc).join(" → ")}</b>` : "Auf diesem Weg gibt es keine Zwischengruppe."}</div>`;
    if (L.choices) {
      h += `<div class="choices">${L.choices.map((n) => `<button class="choice ${L.fb && L.fb.pick === n ? "wrong" : ""}" data-act="lchoice" data-v="${esc(n)}" ${L.fb && L.fb.pick === n ? "disabled" : ""}>${esc(n)}</button>`).join("")}</div>`;
    } else {
      h += `<div class="answer-row"><input id="ans" class="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Name (fett gedruckt im Schlüssel)" value="${esc(L.input)}">
        <button class="btn primary" data-act="lcheck">Prüfen</button></div>`;
    }
    if (L.fb && L.fb.v === "bad") h += `<div class="fb bad">„${esc(L.fb.pick)}“ ist es nicht – versuch es nochmal oder hol dir Hilfe.</div>`;
    h += `<div class="btns">
      ${!L.showMid ? `<button class="btn" data-act="lmid">Zwischengruppe zeigen</button>` : ""}
      ${!L.choices ? `<button class="btn" data-act="lchoices">4 Antworten zeigen</button>` : ""}
      <button class="btn ghost" data-act="lreveal">Auflösen</button>
      <button class="btn ghost" data-act="skip" title="Ohne Wertung zum nächsten Tier">Überspringen →</button>
    </div>`;
  }
  h += `</section>`;
  if (L.done) {
    const imgs = imagesOf(L.gid, leaf.name);
    const perfect = L.ok && !L.help && !L.failed;
    h += `<section class="card result ${perfect ? "good" : L.ok ? "meh" : "bad"}">
      <div class="eyebrow">${!L.ok ? "Auflösung" : perfect ? "Richtig!" : L.failed ? "Richtig – im zweiten Anlauf" : "Richtig – mit Hilfe"}</div>
      <div class="result-name">${txHTML(leaf.tx)}${leaf.de ? ` <span class="muted">(${esc(leaf.de)})</span>` : ""}</div>
      ${L.ok ? spellHTML(L.fb) : ""}
      <p class="muted small">Lernfortschritt: ${progBadge(L.gid, leaf.name, true)}</p>
      ${leftErrorNote(L)}
      ${imgs.length ? photoHTML(imgs, L.photo, { credit: true, small: true }) : ""}
      <div class="btns"><button class="btn primary" data-act="lnext">Nächstes Tier →</button></div>
    </section>`;
  }
  h += `<p class="session muted small">Diese Runde: ${tiere(L.session.n)}, ${L.session.perfect} fehlerfrei${L.session.skipped ? `, ${L.session.skipped} übersprungen` : ""} · ${poolText(L)}</p>`;
  setPage(h);
  const inp = $("#ans");
  if (inp) inp.focus({ preventScroll: true });
  if (L.done) { $("[data-act=lnext]").focus({ preventScroll: true }); $(".result").scrollIntoView({ behavior: "smooth", block: "nearest" }); }
}
/* Hinweis, wenn ein Tier den Bereich „Häufig falsch“ gerade verlassen hat */
function leftErrorNote(state) {
  const s = statOf(state.gid, state.leaf.name);
  return s.wrong > ERROR_LIMIT && s.streak === ERROR_STREAK
    ? `<div class="fb ok">🎉 ${ERROR_STREAK}× hintereinander richtig – dieses Tier ist aus „Häufig falsch“ raus.</div>` : "";
}

/* =====================================================================
 * 📷 Prüfung mit Auswahl
 * ===================================================================== */
let X = null;
function startExam(ctx) {
  const items = examItems(ctx);
  if (!items.length) return emptyPool(ctx, "Prüfung mit Auswahl");
  const it = pickItem("exam", items, X && X.leaf && { gid: X.gid, name: X.leaf.name });
  const imgs = imagesOf(it.gid, it.leaf.name);
  X = { ctx, gid: it.gid, leaf: it.leaf, imgs, photo: Math.floor(Math.random() * imgs.length), opts: KEYS[groupById(it.gid).main].items, trail: [], errors: 0, wrong: null, end: null, session: sessionFor(X, ctx), poolSize: items.length };
  renderExam();
}
const examValid = (o) => validFor(X.gid, X.leaf.name, o);
function examPick(i) {
  if (X.wrong || X.end) return;
  const o = X.opts[i];
  if (examValid(o)) return examGo(o, true);
  X.errors++;
  X.wrong = { picked: o, correct: X.opts.find(examValid) };
  renderExam();
}
function examGo(o, ok) {
  X.trail.push({ type: "choice", node: o, ok });
  X.wrong = null;
  const r = expand(o);
  X.trail.push(...r.trail);
  if (r.leaf) {
    X.end = r.leaf;
    const wrongGuess = (X.guess && X.guess.wrong) || 0;
    const perfect = X.errors === 0 && !wrongGuess;
    updateBox("exam", X.gid, X.leaf.name, perfect, !perfect);
    X.session.n++; if (perfect) X.session.perfect++;
  } else X.opts = r.opts;
  renderExam();
}
function trailHTML(trail) {
  return trail.map((t) => {
    if (t.type === "choice") {
      const st = t.ok === true ? "ok" : t.ok === false ? "bad" : t.ok; // Auswahl: true/false · schriftlich: ok/hint/bad · Lösungsweg: path
      return `<li class="tr ${st}"><span class="ic">${{ ok: "✓", hint: "•", bad: "✗", path: "›" }[st]}</span><span><span class="lab">${esc(labelText(t.node.l))}</span> ${esc(t.node.t)}</span></li>`;
    }
    if (t.type === "res") return `<li class="tr res ${t.ok || ""}"><span class="ic">→</span><span>${txHTML(t.node.tx)}</span></li>`;
    if (t.type === "enter") return `<li class="tr enter"><span class="ic">↪</span><span>Teilschlüssel ${esc(KEYS[t.key].title)}${t.entry ? " ab " + esc(labelText(t.entry.split("/").pop())) : ""}</span></li>`;
    return "";
  }).join("");
}

/* ---------- Direkt bestimmen: Namen gleich beim Foto eingeben (beide Prüfungsmodi) ---------- */
const curState = () => (view() === "x" ? X : view() === "w" ? W : null);
const chainMode = (state) => state === W && DB.fullName && chainOf(state.leaf).length > 1;
function guessBox(state) {
  if (state.end) return "";
  const g = state.guess || {};
  const chainOpt = state === W
    ? `<label class="chain-toggle"><input type="checkbox" data-act="chain" ${DB.fullName ? "checked" : ""}> Mit Ordnung/Familie bestimmen <span class="muted">(z. B. „Carnivora; Canidae; Haushund“)</span></label>` : "";
  const chain = chainMode(state);
  return `<section class="card guess-card">
    <div class="eyebrow">Direkt bestimmen</div>
    <p class="muted small">${chain
      ? "Gib <b>alle fett gedruckten Namen</b> auf dem Weg durch den Schlüssel ein, getrennt mit Semikolon – also Ordnung/Gruppe, Familie und Art."
      : "Du erkennst das Tier schon? Gib den fett gedruckten Namen ein – oder bestimme es unten mit dem Schlüssel."}</p>
    ${chainOpt}
    <div class="answer-row"><input id="gans" class="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${chain ? "z. B. Carnivora; Canidae; Haushund" : "Name des Tieres"}" value="${esc(g.input || "")}">
      <button class="btn primary" data-act="guess">Prüfen</button></div>
    ${g.hint ? `<div class="fb part">${esc(g.hint)}</div>` : ""}
    ${g.ask ? `<div class="reveal-ask">
        <div class="fb bad">${g.chain ? "Das ist noch nicht ganz richtig:" : `„${esc(g.last)}“ ist es nicht.`}</div>
        ${g.chain ? chainHTML(g.chain) : ""}
        <p class="reveal-q">Soll die Lösung aufgedeckt werden?</p>
        <div class="btns"><button class="btn" data-act="guess-reveal">Ja, aufdecken</button>
          <button class="btn primary" data-act="guess-retry">Nein, weiter versuchen</button></div>
      </div>`
      : g.last ? `<div class="fb bad">${g.chain ? "Noch nicht ganz richtig – versuch es nochmal oder bestimme mit dem Schlüssel weiter." : `„${esc(g.last)}“ ist es nicht. Versuch es nochmal oder bestimme mit dem Schlüssel weiter.`}</div>${g.chain ? chainHTML(g.chain) : ""}` : ""}
  </section>`;
}
/* Nach einem klaren Fehlversuch: Lösung aufdecken (zählt als falsch) oder weiter versuchen */
function guessReveal() {
  const state = curState();
  if (!state || state.end) return;
  state.guess.ask = false;
  state.direct = { revealed: true };
  state.end = state.leaf.node;
  if (state === W) W.cur = null;
  updateBox(state === X ? "exam" : "write", state.gid, state.leaf.name, false, true);
  state.session.n++;
  return state === X ? renderExam() : renderWrite();
}
function guessRetry() {
  const state = curState();
  if (!state) return;
  state.guess.ask = false;
  state.guess.focus = true;
  return state === X ? renderExam() : renderWrite();
}
function guessCheck() {
  const state = curState();
  if (!state || state.end) return;
  const inp = $("#gans");
  const value = inp ? inp.value : "";
  state.guess = state.guess || { wrong: 0 };
  state.guess.input = value;
  if (!value.trim()) return inp && inp.focus();
  state.guess.hint = null;
  state.guess.ask = false;
  state.guess.chain = null;
  const rerenderState = () => (state === X ? renderExam() : renderWrite());
  let res;
  if (chainMode(state)) {
    const jc = judgeChain(value, state.leaf);
    if (jc.v !== "ok") {
      state.guess.wrong++;
      state.guess.last = value;
      state.guess.chain = jc;
      state.guess.ask = true;
      return rerenderState();
    }
    res = { v: "ok", spell: jc.spell, chain: jc };
  } else {
    res = judgeName(value, state.leaf.accept, state.leaf.sci);
    if (res.v !== "ok" && state.leaf.de && judgeName(value, state.leaf.de.split(/\s*[/(),]\s*/).filter(Boolean))?.v === "ok") {
      // deutscher Zusatzname (Insekten) erkannt – Tier stimmt, gesucht ist aber der fett gedruckte Name
      state.guess.hint = "Das Tier stimmt – gesucht ist aber der fett gedruckte (lateinische) Name aus dem Schlüssel.";
      state.guess.last = null;
      state.guess.focus = true;
      return rerenderState();
    }
    if (res.v !== "ok") {
      // klar falsch (kleine Schreibfehler gelten als erkannt) → erst nachfragen, ob aufgedeckt werden soll
      state.guess.wrong++;
      state.guess.last = value;
      state.guess.ask = true;
      return rerenderState();
    }
  }
  // richtig erkannt → Bestimmung abschließen, der Weg durch den Schlüssel wird zum Nachlernen gezeigt
  state.direct = { res };
  state.end = state.leaf.node;
  if (state === W) W.cur = null;
  const wrong = state.guess.wrong;
  const failed = wrong > 0 || state.errors > 0 || (state === W && W.failed);
  const flawless = !failed && !res.spell && !(state === W && W.hints);
  updateBox(state === X ? "exam" : "write", state.gid, state.leaf.name, flawless, failed);
  state.session.n++; if (flawless) state.session.perfect++;
  return rerenderState();
}
function directResult(state, area, nextAct) {
  const steps = state.trail.filter((t) => t.type === "choice").length;
  const wrong = (state.guess && state.guess.wrong) || 0;
  const path = trailHTML(state.leaf.steps.map((s) => ({ ...s, ok: "path" })));
  const pathBox = `<details class="path-box" open><summary>So führt der Schlüssel zu diesem Tier</summary><ol class="trail">${path}</ol></details>`;
  if (state.direct.revealed) {
    const lastGuess = state.guess && state.guess.last;
    return resultCard(state, "Lösung aufgedeckt", "bad", `${lastGuess ? `Dein Tipp: „${esc(lastGuess)}“ · ` : ""}${wrong}× falsch geraten`, area, nextAct, pathBox);
  }
  const res = state.direct.res;
  const failed = wrong > 0 || state.errors > 0 || (state === W && W.failed);
  const flawless = !failed && !res.spell && !(state === W && W.hints);
  const title = flawless ? (steps ? `Richtig erkannt – nach ${steps} Schritt${steps === 1 ? "" : "en"}` : "Direkt richtig erkannt!")
    : wrong ? "Richtig erkannt – im zweiten Anlauf" : res.spell ? "Richtig erkannt – mit Schreibfehler" : "Richtig erkannt";
  const spell = res.chain ? (res.spell ? `<div class="fb spell">✎ Achte auf die Rechtschreibung:</div>${chainHTML(res.chain)}` : chainHTML(res.chain)) : spellHTML(res);
  const stats = `${wrong ? wrong + "× falsch geraten · " : ""}Direkt bestimmt${res.chain ? " (mit Ordnung/Familie)" : ""}`;
  return resultCard(state, title, flawless ? "good" : "meh", stats, area, nextAct, spell + pathBox);
}

function examFrame(state, title, inner) {
  const g = groupById(state.gid);
  return `${ctxCrumbs(state, title)}
  <div class="exam-layout">
    <div class="exam-photo">${state.ctx.mix ? `<div class="group-pill">${g.icon} ${esc(g.name)}</div>` : ""}${photoHTML(state.imgs, state.photo)}
      <div class="photo-tools">${markBtn(state.gid, state.leaf.name, isMarked(state.gid, state.leaf.name) ? "Markiert" : "Dieses Tier markieren")}
        ${state.end ? "" : `<button class="btn small-btn ghost" data-act="skip" title="Ohne Wertung zum nächsten Tier">Überspringen →</button>`}</div>
      ${guessBox(state)}</div>
    <div class="exam-steps">
      ${state.trail.length ? `<ol class="trail">${trailHTML(state.trail)}</ol>` : `<p class="muted small intro">Bestimme das Tier auf dem Foto mit dem Schlüssel. Tippe auf das Foto, um es zu vergrößern.</p>`}
      ${inner}
      <p class="session muted small">Diese Runde: ${tiere(state.session.n)}, ${state.session.perfect} fehlerfrei${state.session.skipped ? `, ${state.session.skipped} übersprungen` : ""} · ${poolText(state)}</p>
    </div>
  </div>`;
}
function renderExam() {
  const decisions = X.trail.filter((t) => t.type === "choice").length;
  let step;
  if (!X.end) {
    const key = KEYS[X.opts[0].key];
    step = `<section class="card couplet-card">
      <div class="eyebrow">Schritt ${decisions + 1} · ${esc(key.title)}</div>
      <div class="q">Was trifft auf das Tier auf dem Foto zu?</div>
      <div class="alts">${X.opts.map((o, i) => {
        let cls = "";
        if (X.wrong) { if (o === X.wrong.picked) cls = "wrong"; else if (examValid(o)) cls = "right"; }
        return `<button class="alt ${cls}" data-act="xpick" data-i="${i}" ${X.wrong ? "disabled" : ""}>
          <span class="lab">${esc(labelText(o.l))}</span><span class="alt-t">${esc(o.t)}${o.n ? `<span class="note">${esc(o.n)}</span>` : ""}</span></button>`;
      }).join("")}</div>
      ${X.wrong ? `<div class="fb bad">Nicht ganz – richtig ist <b>${esc(labelText(X.wrong.correct.l))}</b>. Vergleiche das Merkmal nochmal mit dem Foto.</div>
        <div class="btns"><button class="btn primary" data-act="xcontinue">Mit ${esc(labelText(X.wrong.correct.l))} weiter →</button></div>` : ""}
    </section>`;
  } else if (X.direct) {
    step = directResult(X, "exam", "xnext");
  } else {
    const wrongGuess = (X.guess && X.guess.wrong) || 0;
    const perfect = X.errors === 0 && !wrongGuess;
    step = resultCard(X, perfect ? "Fehlerfrei bestimmt!" : `Bestimmt – mit ${X.errors + wrongGuess} Fehler${X.errors + wrongGuess === 1 ? "" : "n"}`, perfect ? "good" : "meh", `${decisions} Entscheidungen`, "exam", "xnext");
  }
  setPage(examFrame(X, "Prüfung mit Auswahl", step));
  afterExamRender();
}
function resultCard(state, title, cls, stats, area, nextAct, extra = "") {
  const g = groupById(state.gid);
  const im = state.imgs[state.photo % state.imgs.length];
  return `<section class="card result ${cls}">
    <div class="eyebrow">${esc(title)}</div>
    <div class="result-name">${txHTML(state.end.tx)}${state.end.de ? ` <span class="muted">(${esc(state.end.de)})</span>` : ""}</div>
    <p class="muted small">${stats}</p>
    <p class="muted small">Lernfortschritt: ${progBadge(state.gid, state.leaf.name, true)}</p>
    ${leftErrorNote(state)}
    ${extra}
    <p class="credit small">${creditHTML(im)}</p>
    <div class="btns"><button class="btn primary" data-act="${nextAct}">Nächstes Tier →</button>
      <a class="btn ghost" href="#/k/${enc(g.main)}">Schlüssel</a></div>
  </section>`;
}
function afterExamRender() {
  const f = $("[data-act=xnext]") || $("[data-act=wnext]") || $("[data-act=xcontinue]") || $("[data-act=wcontinue]");
  const inp = $("#wans");
  const state = curState();
  if (state && state.guess && state.guess.focus && $("#gans")) { state.guess.focus = false; $("#gans").focus(); $("#gans").select(); }
  else if (inp && !inp.disabled) inp.focus({ preventScroll: true });
  else if (f) f.focus({ preventScroll: true });
  const target = $(".couplet-card, .result");
  if (target && $(".trail")) target.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* =====================================================================
 * ✍️ Prüfung schriftlich – Merkmale und Namen selbst formulieren
 * ===================================================================== */
let W = null;
function startWrite(ctx) {
  const items = examItems(ctx);
  if (!items.length) return emptyPool(ctx, "Prüfung schriftlich");
  const it = pickItem("write", items, W && W.leaf && { gid: W.gid, name: W.leaf.name });
  const imgs = imagesOf(it.gid, it.leaf.name);
  W = { ctx, gid: it.gid, leaf: it.leaf, imgs, photo: Math.floor(Math.random() * imgs.length), trail: [], queue: [], next: { opts: KEYS[groupById(it.gid).main].items }, cur: null, end: null, errors: 0, hints: 0, failed: false, session: sessionFor(W, ctx), poolSize: items.length };
  writeAdvance();
}
/* Nächsten Schritt bestimmen: erst Ergebnisse/Namen aus der Warteschlange, dann die nächste Verzweigung */
function writeAdvance() {
  while (W.queue.length) {
    const item = W.queue.shift();
    if (item.type === "res") {
      const isLeaf = W.next.leaf === item.node;
      const asks = getAsks(item.node, isLeaf);
      if (asks.length) {
        W.cur = { type: "name", node: item.node, asks, ai: 0, isLeaf, hint: 0, input: "", fb: null, revealed: false, wrong: 0, spell: false };
        return renderWrite();
      }
    }
    W.trail.push(item);
  }
  if (W.next.leaf) return finishWrite();
  W.cur = { type: "choice", opts: W.next.opts, hint: 0, input: "", fb: null, revealed: false, wrong: 0, solved: null };
  renderWrite();
}
function writeStatus(c) { return c.revealed ? "bad" : c.hint || c.wrong || c.spell ? "hint" : "ok"; }
function writeCommit() {
  const c = W.cur;
  const st = writeStatus(c);
  if (st === "bad") W.errors++;
  if (st === "hint") W.hints++;
  if (c.wrong || c.revealed) W.failed = true;
  if (c.type === "choice") {
    const o = c.solved;
    W.trail.push({ type: "choice", node: o, ok: st });
    const r = expand(o);
    W.queue = r.trail;
    W.next = r.leaf ? { leaf: r.leaf } : { opts: r.opts };
    W.cur = null;
    return writeAdvance();
  }
  // Namensschritt: ggf. weitere fett gedruckte Namen desselben Ergebnisses
  c.status = c.status === "bad" || st === "bad" ? "bad" : c.status === "hint" || st === "hint" ? "hint" : "ok";
  if (c.ai + 1 < c.asks.length) {
    Object.assign(c, { ai: c.ai + 1, hint: 0, input: "", fb: null, revealed: false, wrong: 0, spell: false });
    return renderWrite();
  }
  W.trail.push({ type: "res", node: c.node, ok: c.status });
  W.cur = null;
  writeAdvance();
}
function finishWrite() {
  W.end = W.next.leaf;
  W.cur = null;
  const perfect = W.errors === 0 && W.hints === 0 && !W.failed;
  updateBox("write", W.gid, W.leaf.name, perfect, W.failed);
  W.session.n++; if (perfect) W.session.perfect++;
  renderWrite();
}
function writeCheck() {
  const c = W.cur;
  if (!c || c.revealed || (c.fb && c.fb.v === "ok")) return;
  const inp = $("#wans");
  c.input = inp ? inp.value : c.input;
  if (!c.input.trim()) return inp && inp.focus();
  if (c.type === "choice") {
    const res = judgeChoice(c.input, c.opts, (o) => validFor(W.gid, W.leaf.name, o));
    if (res.v === "ok") { c.solved = res.opt; c.fb = { v: "ok" }; }
    else { if (res.v === "bad") c.wrong++; c.fb = res; }
  } else {
    const res = judgeName(c.input, c.asks[c.ai], c.isLeaf && c.ai === c.asks.length - 1 ? firstItalic(c.node.tx) : null);
    if (res.v === "ok") { c.fb = { v: "ok", res }; if (res.spell) c.spell = true; }
    else { c.wrong++; c.fb = { v: "bad", msg: "Leider nicht richtig." }; }
  }
  renderWrite();
}
function writeHint() {
  const c = W.cur;
  const inp = $("#wans"); if (inp) c.input = inp.value;
  c.hint++; c.fb = null;
  renderWrite();
}
function writeReveal() {
  const c = W.cur;
  const inp = $("#wans"); if (inp) c.input = inp.value;
  c.revealed = true;
  if (c.type === "choice") c.solved = c.opts.find((o) => validFor(W.gid, W.leaf.name, o));
  c.fb = { v: "shown" };
  renderWrite();
}
function writeHintsHTML(c) {
  const out = [];
  if (c.type === "choice") {
    const correct = c.opts.find((o) => validFor(W.gid, W.leaf.name, o));
    if (c.hint >= 1) out.push(`Hier gibt es <b>${c.opts.length}</b> Alternativen: ${c.opts.map((o) => esc(labelText(o.l))).join(" · ")}. Gesucht ist <b>${esc(labelText(correct.l))}</b>.`);
    if (c.hint >= 2) out.push(`Beginnt mit „<b>${esc(correct.t.split(" ").slice(0, 3).join(" "))}</b> …“`);
    if (c.hint >= 3) {
      const kw = keyWords(correct);
      out.push(kw.length ? `Entscheidende Stichworte: <b>${kw.slice(0, 4).map(esc).join(", ")}</b>` : `Achte auf das Gegenteil der anderen Alternative(n).`);
    }
  } else {
    const a = c.asks[c.ai][0];
    if (c.hint >= 1) out.push(`Beginnt mit „<b>${esc(a[0])}</b>…“ (${a.replace(/[^\p{L}]/gu, "").length} Buchstaben)`);
    if (c.hint >= 2) out.push(`„<b>${esc(a.slice(0, Math.ceil(a.length / 2)))}</b>…“`);
  }
  return out.map((t) => `<div class="hintbox">💡 ${t}</div>`).join("");
}
function renderWrite() {
  let step;
  if (W.end && W.direct) {
    step = directResult(W, "write", "wnext");
  } else if (W.end) {
    const decisions = W.trail.filter((t) => t.type === "choice").length;
    const perfect = W.errors === 0 && W.hints === 0 && !W.failed;
    step = resultCard(W, perfect ? "Fehlerfrei bestimmt!" : W.errors ? `Bestimmt – ${W.errors}× aufgedeckt` : W.failed ? "Bestimmt – mit Fehlversuchen" : "Bestimmt – mit Tipps/Schreibfehlern", perfect ? "good" : "meh",
      `${decisions} Merkmale · ${W.hints} mit Tipp/Fehlversuch/Schreibfehler · ${W.errors} aufgedeckt`, "write", "wnext");
  } else {
    const c = W.cur;
    const done = c.fb && (c.fb.v === "ok" || c.fb.v === "shown");
    let q, solution = "";
    if (c.type === "choice") {
      const key = KEYS[c.opts[0].key];
      const n = W.trail.filter((t) => t.type === "choice").length + 1;
      q = `<div class="eyebrow">Schritt ${n} · ${esc(key.title)}</div>
        <div class="q">Welches Merkmal trifft als Nächstes zu?</div>`;
      if (done) solution = `<div class="solution"><span class="lab">${esc(labelText(c.solved.l))}</span> ${esc(c.solved.t)}${c.solved.n ? `<span class="note">${esc(c.solved.n)}</span>` : ""}</div>`;
    } else {
      const final = c.isLeaf && c.ai === c.asks.length - 1;
      q = `<div class="eyebrow">${final ? "Ergebnis" : "Zwischenstation"}</div>
        <div class="q">${final ? "Wie heißt das Tier? (fett gedruckter Name)" : "Hier steht ein fett gedrucktes Taxon. Wie heißt es?"}</div>`;
      if (done) solution = `<div class="solution">${txHTML(c.node.tx)}</div>`;
    }
    const fb = c.fb && c.fb.v !== "ok" && c.fb.v !== "shown" ? `<div class="fb ${c.fb.v}">${esc(c.fb.msg)}</div>`
      : c.fb && c.fb.v === "ok" ? `<div class="fb ok">Richtig!</div>${spellHTML(c.fb.res)}`
      : c.fb && c.fb.v === "shown" ? `<div class="fb shown">Aufgedeckt – präg dir das ein.</div>` : "";
    const maxHint = c.type === "choice" ? 3 : 2;
    step = `<section class="card couplet-card write-card">
      ${q}
      ${!done ? writeHintsHTML(c) : ""}
      <div class="answer-row"><input id="wans" class="ans" autocomplete="off" autocapitalize="off" spellcheck="false"
        placeholder="${c.type === "choice" ? "Merkmal in eigenen Worten, z. B. „Schwimmhäute an drei Zehen“" : "Name eintippen"}" value="${esc(c.input)}" ${done ? "disabled" : ""}>
        ${!done ? `<button class="btn primary" data-act="wcheck">Prüfen</button>` : ""}</div>
      ${fb}${solution}
      <div class="btns">${done
        ? `<button class="btn primary" data-act="wcontinue">Weiter →</button>`
        : `${c.hint < maxHint ? `<button class="btn" data-act="whint">💡 Tipp${c.hint ? ` (${c.hint + 1}/${maxHint})` : ""}</button>` : ""}<button class="btn ghost" data-act="wreveal">Aufdecken</button>`}</div>
    </section>`;
  }
  setPage(examFrame(W, "Prüfung schriftlich", step));
  afterExamRender();
}

/* ---------- Hinweise (erscheinen bei jedem Öffnen und müssen bestätigt werden) ---------- */
function showNotice() {
  if ($(".notice-backdrop")) return;
  const ov = document.createElement("div");
  ov.className = "notice-backdrop";
  ov.innerHTML = `<div class="notice" role="dialog" aria-modal="true" aria-labelledby="notice-title">
    <h2 id="notice-title">Bevor du loslegst – wichtige Hinweise</h2>
    <ol class="notice-list">
      <li><b>Das Skript ist maßgeblich.</b> Die Schlüssel wurden aus dem Skript (Dr. E. Weber, BFT 2026) übernommen. Im Zweifel gilt immer das Original.</li>
      <li><b>Abweichungen vom Skript:</b> Die deutschen Namen in Klammern bei den Insekten (z. B. „Zweiflügler“) sind eine Zusatzhilfe und stehen nicht im Original. Zwei Druckfehler sind korrigiert: <i>Mustela putonus</i> heißt hier <i>Mustela putorius</i> (Iltis), und im Schlüssel der Motacillidae ist das erste „A)“ als „AA)“ geführt.</li>
      <li><b>Fotos:</b> Alle Fotos stammen von Wikimedia Commons und wurden einzeln auf die richtige Art geprüft. Die Säugerschädel kommen überwiegend aus Museumssammlungen. Urheber und Lizenz stehen nach jeder Bestimmung unter dem Ergebnis.</li>
      <li><b>Ohne Foto:</b> Für Strepsiptera (Fächerflügler), Haselmaus, Wasserspitzmaus und Zwergspitzmaus gibt es kein geprüftes Foto. Diese vier kommen nur im Schlüssel und im Bereich „Merkmal → Tier“ vor, nicht in den Prüfungen.</li>
      <li><b>Grenzen der Fotos:</b> Manche Merkmale lassen sich auf einem Foto nicht sicher beurteilen, z. B. Flügellänge in mm, eine gezähnte Mittelkralle, die Schädellänge oder Zähne bei sehr kleinen Schädeln. Im Testat hast du das echte Präparat vor dir. Die Fotos ersetzen das Üben am Präparat nicht – an solchen Stellen lernst du hier vor allem den Weg durch den Schlüssel.</li>
      <li><b>Rechtschreibung bei Namen:</b> Kleine Schreibfehler (z. B. „Stokente“, „stockente“, „Carnivore“) werden erkannt, aber deutlich markiert – mit der richtigen Schreibweise. Sie zählen dann nicht als fehlerfrei.</li>
      <li><b>Prüfung schriftlich:</b> Merkmale werden grob mit den Alternativen verglichen – Stichworte reichen. Passt die Eingabe zu mehreren Alternativen, formuliere genauer. Beim Säugerschädel-Schritt „I³ größer als I² und I¹“ ist die Wortwahl fast gleich wie bei der Gegenalternative – nenne dort ausdrücklich, welcher Schneidezahn am größten ist, oder decke auf. Mit „Mit Ordnung/Familie bestimmen“ verlangt das Feld „Direkt bestimmen“ alle fett gedruckten Namen auf dem Weg (z. B. „Carnivora; Canidae; Haushund“).</li>
      <li><b>Lernfortschritt:</b> Bei jedem Tier siehst du, wie viel Prozent deiner Bestimmungen fehlerfrei waren. Tiere, die öfter als 3× falsch waren, landen im Bereich „Häufig falsch“ – bis du sie 3× hintereinander richtig hast.</li>
      <li><b>Fortschritt speichern:</b> Lernstand und markierte Tiere werden nur in diesem Browser auf diesem Gerät gespeichert. Auf einem anderen Gerät, in einem anderen Browser oder nach dem Löschen der Browserdaten fängst du wieder bei null an.</li>
    </ol>
    <div class="btns"><button class="btn primary" data-act="notice-ok">Verstanden – los geht's</button></div>
  </div>`;
  document.body.appendChild(ov);
  document.body.classList.add("no-scroll");
  $(".notice [data-act=notice-ok]").focus();
}
function closeNotice() {
  document.querySelectorAll(".notice-backdrop").forEach((e) => e.remove());
  document.body.classList.remove("no-scroll");
}

/* ---------- Foto-Vergrößerung (Overlay) ---------- */
function openZoom(src) {
  const ov = document.createElement("div");
  ov.className = "lightbox";
  ov.innerHTML = `<img src="${esc(src)}" alt="Vergrößertes Foto"><button class="lb-close" aria-label="Schließen">✕</button>`;
  ov.addEventListener("click", () => ov.remove());
  document.body.appendChild(ov);
}

/* =====================================================================
 * Routing & Ereignisse
 *   #/g/<gruppe> · #/k/<schlüssel> · #/m/<gruppe> · #/p/<gruppe> · #/mix/<m|f>
 *   #/l/<schlüssel>[/m] · #/x/<gruppe>[/m] · #/w/<gruppe>[/m] · #/l|x|w/alle/<m|f>
 * ===================================================================== */
function route() {
  const parts = (location.hash.slice(1) || "/").split("/").filter(Boolean).map(decodeURIComponent);
  window.scrollTo(0, 0);
  document.querySelectorAll(".lightbox").forEach((e) => e.remove());
  if (!parts.length) return renderHome();
  const [v, a, b] = parts;
  const mix = a === "alle" && MIX[b] ? b : null;
  if (v === "g") return renderGroup(a);
  if (v === "k") return renderKey(a);
  if (v === "m" && groupById(a)) return renderMarked(a);
  if (v === "p" && groupById(a)) return renderProgress(a);
  if (v === "mix") return renderMix(a);
  if (v === "l" && (mix || keyOfScope(a))) return startLearn(mix ? { mix } : { scopeId: a, marked: b === "m" });
  if (v === "x" && (mix || groupById(a))) return startExam(mix ? { mix } : { gid: a, marked: b === "m" });
  if (v === "w" && (mix || groupById(a))) return startWrite(mix ? { mix } : { gid: a, marked: b === "m" });
  renderHome();
}
window.addEventListener("hashchange", route);
const view = () => (location.hash.split("/")[1] || "");
function rerender() {
  const v = view();
  if (v === "x" && X) return renderExam();
  if (v === "w" && W) return renderWrite();
  if (v === "l" && L) return renderLearn();
  route();
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  // angefangene Eingabe im Feld „Direkt bestimmen“ bei jedem Neuzeichnen behalten
  const gst = curState();
  if (gst && $("#gans")) { gst.guess = gst.guess || { wrong: 0 }; gst.guess.input = $("#gans").value; }
  switch (el.dataset.act) {
    case "guess": return guessCheck();
    case "guess-reveal": return guessReveal();
    case "guess-retry": return guessRetry();
    case "skip": {
      // ohne Wertung zum nächsten Tier – der Lernstand bleibt unverändert
      const v = view();
      const st = { x: X, w: W, l: L }[v];
      if (!st) return;
      st.session.skipped = (st.session.skipped || 0) + 1;
      if (v === "x") return startExam(X.ctx);
      if (v === "w") return startWrite(W.ctx);
      return startLearn(L.ctx);
    }
    case "notice-ok": return closeNotice();
    case "notice-open": e.preventDefault(); return showNotice();
    case "zoom": return openZoom((el.tagName === "IMG" ? el : el.closest("figure, details").querySelector("img")).getAttribute("src"));
    case "photo": {
      const st = { x: X, w: W, l: L }[view()];
      if (st) { st.photo = +el.dataset.i; rerender(); }
      return;
    }
    case "mark": {
      e.preventDefault();
      if ($("#wans") && W && W.cur) W.cur.input = $("#wans").value;
      if ($("#ans") && L) L.input = $("#ans").value;
      toggleMark(el.dataset.g, el.dataset.n);
      if (["k", "p"].includes(view())) { el.outerHTML = markBtn(el.dataset.g, el.dataset.n, " "); return; }
      return rerender();
    }
    case "lcheck": { const v = $("#ans").value; L.input = v; return learnCheck(v); }
    case "lchoice": return learnCheck(el.dataset.v);
    case "lmid": L.showMid = true; L.help = true; return renderLearn();
    case "lchoices": {
      if ($("#ans")) L.input = $("#ans").value;
      const pool = buildLeaves(L.ctx.scopeId || groupById(L.gid).main).filter((l) => l.name !== L.leaf.name);
      L.choices = shuffle([L.leaf, ...shuffle(pool).slice(0, 3)]).map((l) => l.name);
      L.help = true; L.fb = null;
      return renderLearn();
    }
    case "lreveal": return finishLearn(false);
    case "lnext": return startLearn(L.ctx);
    case "xpick": return examPick(+el.dataset.i);
    case "xcontinue": return examGo(X.wrong.correct, false);
    case "xnext": return startExam(X.ctx);
    case "wcheck": return writeCheck();
    case "whint": return writeHint();
    case "wreveal": return writeReveal();
    case "wcontinue": return writeCommit();
    case "wnext": return startWrite(W.ctx);
  }
});

document.addEventListener("change", (e) => {
  const a = e.target.dataset && e.target.dataset.act;
  if (a === "exam") { DB.examDate = e.target.value; saveDB(); return renderHome(); }
  if (a === "scope") location.hash = "#/l/" + enc(e.target.value);
  if (a === "chain") {
    DB.fullName = e.target.checked; saveDB();
    if (W) { W.guess = W.guess || { wrong: 0 }; W.guess.input = $("#gans") ? $("#gans").value : ""; W.guess.focus = true; renderWrite(); }
  }
});

document.addEventListener("keydown", (e) => {
  if ($(".notice-backdrop")) return; // Hinweise müssen erst bestätigt werden
  if (e.key === "Escape") { document.querySelectorAll(".lightbox").forEach((x) => x.remove()); return; }
  if (e.key !== "Enter" || e.isComposing) return;
  if (e.target.id === "gans") { e.preventDefault(); return guessCheck(); }
  if (e.target.id === "ans") { e.preventDefault(); L.input = e.target.value; return learnCheck(e.target.value); }
  if (e.target.id === "wans") { e.preventDefault(); return writeCheck(); }
  if (view() === "w" && W && W.cur && W.cur.fb && (W.cur.fb.v === "ok" || W.cur.fb.v === "shown") && !e.target.closest("button")) { e.preventDefault(); return writeCommit(); }
});

route();
showNotice();
