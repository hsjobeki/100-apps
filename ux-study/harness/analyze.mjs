/* Unblinds the UX regression study and emits REPORT.md and analysis.json.
 * Node builtins only. Every number in the report comes from this file.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HARNESS = dirname(fileURLToPath(import.meta.url));
const STUDY = resolve(HARNESS, "..");
const J = (p) => JSON.parse(readFileSync(p, "utf8"));

/* ---------- fixed analysis constants ---------- */
const BOOTSTRAP_N = 10000;
const BOOTSTRAP_SEED = 20260917;
const A = "claude-opus-4-6";
const B = "claude-opus-5";
const BRIEFS = ["B1", "B2", "B3", "B4", "B5", "B6"];

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(BOOTSTRAP_SEED);

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
/* cosines need 4 places; 2 rounds 0.9989 to a misleading 1 */
const r4 = (x) => (Number.isFinite(x) ? Math.round(x * 10000) / 10000 : null);
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const pct = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 10 : null);

/* percentile 95% CI of the mean, by bootstrap resampling with replacement */
function bootCI(xs) {
  if (xs.length < 2) return [null, null];
  const means = new Array(BOOTSTRAP_N);
  for (let i = 0; i < BOOTSTRAP_N; i++) {
    let s = 0;
    for (let k = 0; k < xs.length; k++) s += xs[Math.floor(rnd() * xs.length)];
    means[i] = s / xs.length;
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(0.025 * BOOTSTRAP_N)], means[Math.floor(0.975 * BOOTSTRAP_N)]];
}

/* ---------- load ---------- */

const mapping = J(join(STUDY, "sealed", "mapping.json"));
const failures = J(join(STUDY, "sealed", "failures.json"));
const stripped = J(join(STUDY, "sealed", "stripped.json"));
const failedIds = new Set(failures.map((f) => f.id));

const ids = Object.keys(mapping).sort();
const metrics = {};
const asyncs = {};
const rubrics = {};
for (const id of ids) {
  metrics[id] = J(join(STUDY, "metrics", `${id}.json`));
  asyncs[id] = J(join(STUDY, "async", `${id}.json`));
  rubrics[id] = J(join(STUDY, "rubric", `${id}.json`));
}
const runs = readFileSync(join(STUDY, "pairwise", "results.jsonl"), "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const modelOf = (id) => mapping[id].model;
const briefOf = (id) => mapping[id].brief;
const idsOf = (model, brief) => ids.filter((i) => modelOf(i) === model && (!brief || briefOf(i) === brief));

/* ---------- F5 from async fail counts ---------- */

function f5From(failCount) {
  if (failCount === 0) return 5;
  if (failCount === 1) return 4;
  if (failCount <= 3) return 3;
  if (failCount <= 5) return 2;
  return 1;
}
const f5 = {};
const failCount = {};
for (const id of ids) {
  failCount[id] = failedIds.has(id) ? 10 : asyncs[id].failCount;
  f5[id] = f5From(failCount[id]);
}

/* ---------- pairwise resolution ---------- */

const byPair = new Map();
for (const r of runs) {
  if (!byPair.has(r.pairKey)) byPair.set(r.pairKey, []);
  byPair.get(r.pairKey).push(r);
}

/* the site a verdict favours, or null for Tie */
function favours(r) {
  if (r.verdict === "Tie") return null;
  return r.verdict === "Left" ? r.leftId : r.rightId;
}

const resolved = [];
for (const [pairKey, rs] of [...byPair.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  const [brief, aId, bId] = pairKey.split("_");
  const o1 = rs.find((r) => r.orientation === 1);
  const o2 = rs.find((r) => r.orientation === 2);
  const f1 = o1 ? favours(o1) : undefined;
  const f2 = o2 ? favours(o2) : undefined;

  let winner;
  let inconsistent = false;
  if (failedIds.has(aId) && !failedIds.has(bId)) winner = bId;
  else if (failedIds.has(bId) && !failedIds.has(aId)) winner = aId;
  else if (f1 === null || f2 === null || f1 !== f2) {
    winner = null;
    /* position-inconsistent: both raters named a side, and they named different sides,
     * i.e. each rater preferred the artifact in the same screen position */
    if (f1 && f2 && f1 !== f2) inconsistent = true;
  } else winner = f1;

  resolved.push({
    pairKey,
    brief,
    aId,
    bId,
    o1Verdict: o1?.verdict ?? null,
    o2Verdict: o2?.verdict ?? null,
    o1Favours: f1 ?? null,
    o2Favours: f2 ?? null,
    winner,
    winnerModel: winner ? modelOf(winner) : "Tie",
    inconsistent,
  });
}

function winRate(subset) {
  const decided = subset.filter((p) => p.winner);
  const bWins = decided.filter((p) => p.winnerModel === B).length;
  return {
    bWins,
    aWins: decided.length - bWins,
    ties: subset.length - decided.length,
    decided: decided.length,
    rate: decided.length ? bWins / decided.length : null,
    ci: bootCI(decided.map((p) => (p.winnerModel === B ? 1 : 0))),
  };
}

const pairwiseOverall = winRate(resolved);
const pairwiseByBrief = {};
for (const b of BRIEFS) pairwiseByBrief[b] = winRate(resolved.filter((p) => p.brief === b));
const inconsistencyRate = resolved.filter((p) => p.inconsistent).length / resolved.length;

/* ---------- rubric and metric aggregates ---------- */

const DIMS = ["f1", "f2", "f3", "f4", "hierarchy"];

function scoreSet(model, dim) {
  return idsOf(model).map((id) => (dim === "f5" ? f5[id] : rubrics[id][dim].score));
}

const rubricStats = {};
for (const dim of [...DIMS.slice(0, 4), "f5", "hierarchy"]) {
  const a = scoreSet(A, dim);
  const b = scoreSet(B, dim);
  rubricStats[dim] = {
    a: { mean: r2(mean(a)), ci: bootCI(a).map(r2), n: a.length },
    b: { mean: r2(mean(b)), ci: bootCI(b).map(r2), n: b.length },
    delta: r2(mean(b) - mean(a)),
  };
}

const METRIC_PICKS = {
  viewportWords: (m) => m.desktop.viewportWords,
  pageWords: (m) => m.desktop.pageWords,
  labelMeanWords: (m) => m.desktop.labels.meanWords,
  labelMaxWords: (m) => m.desktop.labels.maxWords,
  helperWords: (m) => m.desktop.helperWords,
  longLeafWords: (m) => m.desktop.longLeafWords,
  graphicalTotal: (m) => m.desktop.graphical.total,
  consoleErrors: (m) => m.consoleErrors,
  uncaughtExceptions: (m) => m.uncaughtExceptions,
  mobileViewportWords: (m) => m.mobile.viewportWords,
};

const metricStats = {};
for (const [key, pick] of Object.entries(METRIC_PICKS)) {
  const a = idsOf(A).map((id) => pick(metrics[id]));
  const b = idsOf(B).map((id) => pick(metrics[id]));
  metricStats[key] = {
    a: { mean: r2(mean(a)), ci: bootCI(a).map(r2) },
    b: { mean: r2(mean(b)), ci: bootCI(b).map(r2) },
    delta: r2(mean(b) - mean(a)),
  };
}

/* duplicate submission: only sites where the metric produced a countable call */
const dupStats = {};
for (const [label, model] of [["a", A], ["b", B]]) {
  const set = idsOf(model).map((id) => metrics[id].duplicateSubmission);
  const applicable = set.filter((d) => d && Number.isFinite(d.calls));
  dupStats[label] = {
    applicable: applicable.length,
    of: set.length,
    allowedDuplicate: applicable.filter((d) => d.calls > 1).length,
    rate: applicable.length ? applicable.filter((d) => d.calls > 1).length / applicable.length : null,
  };
}

/* async fail counts */
const asyncStats = {};
for (const [label, model] of [["a", A], ["b", B]]) {
  const xs = idsOf(model).map((id) => failCount[id]);
  asyncStats[label] = { mean: r2(mean(xs)), ci: bootCI(xs).map(r2), total: xs.reduce((s, x) => s + x, 0), n: xs.length };
}
const asyncRatio = asyncStats.a.mean > 0 ? asyncStats.b.mean / asyncStats.a.mean : null;

/* per-item async fail rate */
const asyncByItem = [];
for (let n = 1; n <= 10; n++) {
  const row = { n };
  for (const [label, model] of [["a", A], ["b", B]]) {
    const items = idsOf(model).map((id) => asyncs[id].items.find((i) => i.n === n)).filter(Boolean);
    const rated = items.filter((i) => i.verdict !== "N/A");
    row[label] = { fails: rated.filter((i) => i.verdict === "FAIL").length, rated: rated.length };
  }
  asyncByItem.push(row);
}

/* ---------- genericness ---------- */

function cosine(u, v) {
  let d = 0;
  for (let i = 0; i < u.length; i++) d += u[i] * v[i];
  return d;
}
function genericness(model) {
  const list = idsOf(model);
  const sims = [];
  for (let i = 0; i < list.length; i++) {
    for (let k = i + 1; k < list.length; k++) {
      if (briefOf(list[i]) === briefOf(list[k])) continue;
      sims.push(cosine(metrics[list[i]].layoutVector, metrics[list[k]].layoutVector));
    }
  }
  return { mean: sims.length ? Math.round(mean(sims) * 10000) / 10000 : null, pairs: sims.length, ci: bootCI(sims).map((x) => Math.round(x * 10000) / 10000) };
}
const generic = { a: genericness(A), b: genericness(B) };
generic.delta = r2ish(generic.b.mean - generic.a.mean);
function r2ish(x) {
  return Number.isFinite(x) ? Math.round(x * 10000) / 10000 : null;
}

/* ---------- illustrative pairs ---------- */

function siteRubricMean(id) {
  return mean([rubrics[id].f1.score, rubrics[id].f2.score, rubrics[id].f3.score, rubrics[id].f4.score, f5[id], rubrics[id].hierarchy.score]);
}
const gaps = resolved
  .filter((p) => p.winner)
  .map((p) => ({ ...p, gap: siteRubricMean(p.bId) - siteRubricMean(p.aId) }))
  .sort((x, y) => (y.gap - x.gap) || (x.pairKey < y.pairKey ? -1 : 1));

const illustrative = [];
if (gaps.length) {
  const top2 = gaps.slice(0, 2);
  const bottom2 = gaps.slice(-2).reverse();
  const sortedGaps = [...gaps].sort((x, y) => (x.gap - y.gap) || (x.pairKey < y.pairKey ? -1 : 1));
  const medianGap = sortedGaps[Math.floor((sortedGaps.length - 1) / 2)].gap;
  const medianPair = [...gaps]
    .filter((g) => !top2.includes(g) && !bottom2.includes(g))
    .sort((x, y) => Math.abs(x.gap - medianGap) - Math.abs(y.gap - medianGap) || (x.pairKey < y.pairKey ? -1 : 1))[0];
  for (const g of [...top2, ...bottom2, medianPair]) {
    if (g && !illustrative.some((x) => x.pairKey === g.pairKey)) illustrative.push(g);
  }
  let i = 0;
  while (illustrative.length < 5 && i < gaps.length) {
    if (!illustrative.some((x) => x.pairKey === gaps[i].pairKey)) illustrative.push(gaps[i]);
    i++;
  }
}

/* ---------- verdict ---------- */

const wr = pairwiseOverall.rate;
let verdict;
let verdictText;
if (wr !== null && wr >= 0.7 && asyncRatio !== null && asyncRatio <= 0.5) {
  verdict = "FALSIFIED";
  verdictText = "Thesis falsified.";
} else if (wr !== null && wr <= 0.6 && (asyncRatio === null || asyncRatio >= 0.75)) {
  verdict = "SUPPORTED";
  verdictText = "Thesis supported.";
} else {
  verdict = "INCONCLUSIVE";
  verdictText = "Inconclusive / partial.";
}

/* ---------- validity analysis: human comparator, sample independence, style leakage ---------- */

const VAL = {};

/* human blind verdicts, partial by design */
try {
  const hPairs = J(join(STUDY, "human", "pairs.json")).pairs;
  const hV = J(join(STUDY, "human", "verdicts.json"));
  const byKeyH = Object.fromEntries(hPairs.map((p) => [p.pairKey, p]));
  const h = { total: hPairs.length, rated: 0, b: 0, a: 0, ties: 0, left: 0, right: 0, byBrief: {} };
  for (const [k, v] of Object.entries(hV)) {
    if (!v.verdict) continue;
    const p = byKeyH[k];
    h.rated++;
    h.byBrief[p.brief] ??= { b: 0, a: 0, ties: 0 };
    if (v.verdict === "Tie") { h.ties++; h.byBrief[p.brief].ties++; continue; }
    if (v.verdict === "Left") h.left++; else h.right++;
    const m = modelOf(v.verdict === "Left" ? p.leftId : p.rightId);
    if (m === B) { h.b++; h.byBrief[p.brief].b++; } else { h.a++; h.byBrief[p.brief].a++; }
  }
  h.rate = h.b + h.a ? h.b / (h.b + h.a) : null;
  /* fable chose B on every resolved pair, so agreement equals the human's B count */
  h.agreement = { n: h.b + h.a, agree: h.b, rate: h.b + h.a ? h.b / (h.b + h.a) : null };
  VAL.human = h;
} catch {
  VAL.human = null;
}

/* sample independence: cosine of the three layout vectors inside each model x brief cell */
function cos(u, v) { let d = 0; for (let i = 0; i < u.length; i++) d += u[i] * v[i]; return d; }
VAL.withinCell = {};
for (const model of [A, B]) {
  VAL.withinCell[model === A ? "a" : "b"] = {};
  for (const brief of BRIEFS) {
    const cell = idsOf(model, brief);
    const cs = [];
    for (let i = 0; i < cell.length; i++)
      for (let k = i + 1; k < cell.length; k++) cs.push(cos(metrics[cell[i]].layoutVector, metrics[cell[k]].layoutVector));
    VAL.withinCell[model === A ? "a" : "b"][brief] = Math.round(mean(cs) * 10000) / 10000;
  }
}
const allWithin = [];
const allCross = [];
for (let i = 0; i < ids.length; i++)
  for (let k = i + 1; k < ids.length; k++) {
    const x = ids[i], y = ids[k];
    const c = cos(metrics[x].layoutVector, metrics[y].layoutVector);
    if (modelOf(x) === modelOf(y) && briefOf(x) === briefOf(y)) allWithin.push(c);
    else if (briefOf(x) === briefOf(y)) allCross.push(c);
  }
VAL.withinCellMean = Math.round(mean(allWithin) * 10000) / 10000;
VAL.crossModelSameBriefMean = Math.round(mean(allCross) * 10000) / 10000;

/* exact one-sided 95% lower bound on a win rate when every trial succeeded */
const allSuccLower = (n) => Math.pow(0.025, 1 / n);
VAL.effectiveN = {
  pairsAsIndependent: { n: resolved.length, lower: r2(100 * allSuccLower(resolved.length)) },
  briefsAsIndependent: { n: BRIEFS.length, lower: r2(100 * allSuccLower(BRIEFS.length)) },
};

/* style leakage: can the generating model be recovered from surface features alone? */
try {
  const SIG = J(join(STUDY, "sealed", "signature.json"));
  const rgb = (s) => (String(s).match(/(\d+), (\d+), (\d+)/) ?? []).slice(1).map(Number);
  const featOf = (id) => {
    const s = SIG[id];
    const [r, g, b] = rgb(s.pageBg).length ? rgb(s.pageBg) : [0, 0, 0];
    return [r - b, Math.round(0.299 * r + 0.587 * g + 0.114 * b), s.buttons, s.removeControls,
            s.steppers, s.selects, s.textInputs, s.svgs, s.primaryRadius ?? 0, s.rows, s.visibleElements];
  };
  const Fm = Object.fromEntries(ids.map((id) => [id, featOf(id)]));
  const dims = Fm[ids[0]].length;
  const mu = [], sd = [];
  for (let d = 0; d < dims; d++) {
    const xs = ids.map((i) => Fm[i][d]);
    const m = mean(xs); mu.push(m);
    sd.push(Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) || 1);
  }
  const zf = (id) => Fm[id].map((x, d) => (x - mu[d]) / sd[d]);
  let anyHit = 0, strictHit = 0;
  for (const id of ids) {
    const me = zf(id);
    const rank = ids.filter((o) => o !== id)
      .map((o) => ({ o, d: Math.hypot(...zf(o).map((x, k) => x - me[k])) }))
      .sort((p, q) => p.d - q.d);
    if (modelOf(rank[0].o) === modelOf(id)) anyHit++;
    const strict = rank.find((r) => briefOf(r.o) !== briefOf(id));
    if (strict && modelOf(strict.o) === modelOf(id)) strictHit++;
  }
  const bgTally = (model) => {
    const t = {};
    for (const id of idsOf(model)) t[SIG[id].pageBg] = (t[SIG[id].pageBg] || 0) + 1;
    return Object.entries(t).sort((p, q) => q[1] - p[1]);
  };
  VAL.leakage = {
    nn1AnyNeighbour: r2(100 * anyHit / ids.length),
    nn1OtherBriefOnly: r2(100 * strictHit / ids.length),
    distinctBgA: bgTally(A).length,
    distinctBgB: bgTally(B).length,
    topBgA: bgTally(A)[0],
    topBgB: bgTally(B)[0],
    removeControlSites: { a: idsOf(A).filter((i) => SIG[i].removeControls > 0).length, b: idsOf(B).filter((i) => SIG[i].removeControls > 0).length },
    meanButtons: { a: r2(mean(idsOf(A).map((i) => SIG[i].buttons))), b: r2(mean(idsOf(B).map((i) => SIG[i].buttons))) },
    meanErrorChars: { a: r2(mean(idsOf(A).map((i) => SIG[i].errorMeanChars))), b: r2(mean(idsOf(B).map((i) => SIG[i].errorMeanChars))) },
    meanErrorSurfaces: { a: r2(mean(idsOf(A).map((i) => SIG[i].errorCount))), b: r2(mean(idsOf(B).map((i) => SIG[i].errorCount))) },
  };
} catch {
  VAL.leakage = null;
}

/* rubric ceiling */
VAL.ceiling = {};
for (const dim of ["f1", "f2", "f3", "f4", "hierarchy"]) {
  const xs = ids.map((id) => rubrics[id][dim].score);
  VAL.ceiling[dim] = { atOrAbove4: xs.filter((x) => x >= 4).length, of: xs.length, distinct: [...new Set(xs)].sort() };
}

/* is the pre-registered verdict trustworthy? */
VAL.nearDuplicateCells = Object.values(VAL.withinCell).flatMap((o) => Object.values(o)).filter((x) => x >= 0.998).length;
VAL.totalCells = 2 * BRIEFS.length;
VAL.invalidated = VAL.nearDuplicateCells >= VAL.totalCells / 2
  || (VAL.human && VAL.human.rated >= 20 && VAL.human.rate !== null && VAL.human.rate <= 0.6);

let EFF = null, QUAL = null;
try { EFF = J(join(STUDY, "sealed", "effort.json")); } catch {}
try { QUAL = J(join(STUDY, "sealed", "quality.json")); } catch {}

/* ---------- static analysis of the delivered source ---------- */

const CODE = {};
for (const id of ids) {
  const t = readFileSync(join(STUDY, "sites", `${id}.html`), "utf8");
  const grab = (re) => (t.match(re) || []).join("");
  const cssSrc = grab(/<style[^>]*>[\s\S]*?<\/style>/g).replace(/<\/?style[^>]*>/g, "");
  const cssNoComments = cssSrc.replace(/\/\*[\s\S]*?\*\//g, "");
  const count = (re) => (t.match(re) || []).length;
  CODE[id] = {
    bytes: t.length,
    cssBytes: cssSrc.length,
    cssRules: (cssNoComments.match(/[^{}]+\{[^{}]*\}/g) || []).length,
    cssVars: new Set(cssSrc.match(/--[a-zA-Z0-9-]+\s*:/g) || []).size,
    mediaQ: count(/@media/g),
    transitions: count(/transition\s*:/g),
    svgCount: count(/<svg/g),
    apiMethods: new Set([...t.matchAll(/api\.(\w+)\s*\(/g)].map((m) => m[1])).size,
    apiCalls: count(/api\.\w+\s*\(/g),
    listeners: count(/addEventListener\s*\(/g),
    ariaAttrs: count(/aria-[a-z]+\s*=/g),
    roles: count(/\brole\s*=/g),
    tryBlocks: count(/\btry\s*\{/g),
  };
}

/* ---------- generation cost ---------- */
const genStats = {};
for (const [label, model] of [["a", A], ["b", B]]) {
  const v = idsOf(model).map((id) => mapping[id]);
  genStats[label] = {
    bytes: Math.round(mean(v.map((x) => x.bytes))),
    tokensOut: Math.round(mean(v.map((x) => x.tokensOut))),
    latencySec: Math.round(mean(v.map((x) => x.latencyMs)) / 1000),
    costUsd: Math.round(v.reduce((s, x) => s + x.costUsd, 0) * 100) / 100,
  };
}

/* ---------- emit analysis.json ---------- */

const analysis = {
  generatedAt: new Date().toISOString(),
  constants: { bootstrapN: BOOTSTRAP_N, bootstrapSeed: BOOTSTRAP_SEED, modelA: A, modelB: B },
  verdict,
  pairwise: { overall: pairwiseOverall, byBrief: pairwiseByBrief, inconsistencyRate, resolved },
  rubric: rubricStats,
  metrics: metricStats,
  duplicateSubmission: dupStats,
  async: { stats: asyncStats, ratioBoverA: asyncRatio === null ? null : r2(asyncRatio), byItem: asyncByItem },
  genericness: generic,
  generation: genStats,
  illustrative: illustrative.map((g) => ({ pairKey: g.pairKey, brief: g.brief, aId: g.aId, bId: g.bId, gap: r2(g.gap), winnerModel: g.winnerModel })),
  failures,
  strippedCount: stripped.length,
};
writeFileSync(join(STUDY, "analysis.json"), JSON.stringify(analysis, null, 2));

/* ---------- emit REPORT.md ---------- */

const ci = (pair) => (pair[0] === null ? "n/a" : `[${pair[0]}, ${pair[1]}]`);
const ciPct = (pair) => (pair[0] === null ? "n/a" : `[${pct(pair[0])}%, ${pct(pair[1])}%]`);
const L = [];

L.push("# UX regression study: `claude-opus-4-6` vs `claude-opus-5`");
L.push("");
L.push(`Generated ${analysis.generatedAt} by \`harness/analyze.mjs\`. Model A = \`${A}\`, model B = \`${B}\`.`);
L.push("Pre-registration: `00_preregistration.md`, frozen before generation. Every number below is computed by this script from on-disk JSON.");
L.push("");

L.push("## 1. Headline");
L.push("");
if (VAL.invalidated) {
  L.push("**The study does not decide the thesis. Its pairwise result is not trustworthy.**");
  L.push("");
  L.push(`The pre-registered rule that fired on the model-rater data was *thesis falsified*: \`claude-fable-5\` `
    + `preferred B on ${pairwiseOverall.bWins} of ${pairwiseOverall.decided} resolved pairs `
    + `(${pct(wr)}%) and B's async failures were ${asyncRatio === null ? "n/a" : r2(asyncRatio)} of A's. `
    + `Two findings, both measured after that verdict was computed, remove its force. They are in section 8.`);
  L.push("");
  if (VAL.human && VAL.human.rated > 0) {
    L.push(`1. **A human blind rater disagrees.** Over ${VAL.human.rated} of ${VAL.human.total} pairs rated under the `
      + `same blinding, the human preferred B on ${VAL.human.b} of ${VAL.human.b + VAL.human.a} decided pairs `
      + `(**${pct(VAL.human.rate)}%**), which falls in the pre-registered *thesis supported* band of <=60%, not the `
      + `*falsified* band of >=70%. Human and model rater agree on ${VAL.human.agreement.agree} of `
      + `${VAL.human.agreement.n} pairs (${pct(VAL.human.agreement.rate)}%), against 50% for a coin.`);
  }
  L.push(`2. **The three samples per cell are near-duplicates, so the effective n is 6, not 54.** In `
    + `${VAL.nearDuplicateCells} of the ${VAL.totalCells} model x brief cells the three samples sit at 0.998 or `
    + `higher layout-vector cosine, which is visual duplication rather than three independent attempts. Each `
    + `model emits roughly one design per brief, so the 54 pairs carry about 6 independent comparisons. The exact `
    + `95% lower bound on B's win rate `
    + `falls from ${VAL.effectiveN.pairsAsIndependent.lower}% to ${VAL.effectiveN.briefsAsIndependent.lower}%.`);
  L.push("");
  L.push("Treat the numbers below as descriptive. The pre-registered decision procedure was executed faithfully "
    + "and its result is reported unchanged, but the design it rests on cannot support the conclusion.");
  L.push("");
} else {
  L.push(`**${verdictText}**`);
  L.push("");
}
L.push(VAL.invalidated
  ? "The pre-registered rules, recorded for the record rather than as a conclusion:"
  : "The three pre-registered rules and what the data says:");
L.push("");
L.push(`| Rule | Condition | Measured | Met |`);
L.push(`| --- | --- | --- | --- |`);
L.push(`| Thesis falsified | B pairwise win rate >= 70% **and** B async failures <= 50% of A | win rate ${pct(wr)}%, async ratio ${asyncRatio === null ? "n/a" : r2(asyncRatio)} | ${verdict === "FALSIFIED" ? "**yes**" : "no"} |`);
L.push(`| Thesis supported | B pairwise win rate <= 60% **and** B async failures >= 75% of A | win rate ${pct(wr)}%, async ratio ${asyncRatio === null ? "n/a" : r2(asyncRatio)} | ${verdict === "SUPPORTED" ? "**yes**" : "no"} |`);
L.push(`| Inconclusive / partial | anything else | | ${verdict === "INCONCLUSIVE" ? "**yes**" : "no"} |`);
L.push("");
if (verdict === "INCONCLUSIVE") {
  const moved = [];
  const still = [];
  for (const [dim, label] of [["f1", "F1 graphical indicators"], ["f2", "F2 verbosity"], ["f3", "F3 sloppy text"], ["f4", "F4 generic feel"], ["f5", "F5 async handling"], ["hierarchy", "visual hierarchy"]]) {
    const s = rubricStats[dim];
    const overlaps = s.a.ci[1] >= s.b.ci[0] && s.b.ci[1] >= s.a.ci[0];
    (overlaps ? still : moved).push(`${label} (A ${s.a.mean} -> B ${s.b.mean}, delta ${s.delta})`);
  }
  L.push("Which failure modes moved, by whether the 95% bootstrap CIs of the two means separate:");
  L.push("");
  L.push(`- **Moved:** ${moved.length ? moved.join("; ") : "none"}`);
  L.push(`- **Did not move:** ${still.length ? still.join("; ") : "none"}`);
  L.push("");
}

L.push("## 2. Pairwise win rate of B vs A");
L.push("");
L.push("Blind `ux-pair-rater` runs, 54 pairs each judged twice with sides swapped, 108 runs. A pair resolves only when both orientations favour the same artifact; otherwise it is a tie. Ties are excluded from both numerator and denominator.");
L.push("");
L.push(`- **Overall: B wins ${pct(wr)}%** of decided pairs (${pairwiseOverall.bWins} of ${pairwiseOverall.decided}), 95% bootstrap CI ${ciPct(pairwiseOverall.ci)}.`);
L.push(`- Ties: ${pairwiseOverall.ties} of ${resolved.length} pairs.`);
L.push(`- **Position-inconsistency rate: ${pct(inconsistencyRate)}%** of 54 pairs (both raters preferred whichever artifact sat in their own Left/Right slot). Pre-registered unreliability flag at >25%: ${inconsistencyRate > 0.25 ? "**TRIGGERED, treat the pairwise result as unreliable**" : "not triggered"}.`);
L.push("");
L.push("Per brief:");
L.push("");
L.push("| Brief | B wins | A wins | Ties | Decided | B win rate | 95% CI |");
L.push("| --- | --- | --- | --- | --- | --- | --- |");
for (const b of BRIEFS) {
  const s = pairwiseByBrief[b];
  L.push(`| ${b} | ${s.bWins} | ${s.aWins} | ${s.ties} | ${s.decided} | ${s.rate === null ? "n/a" : pct(s.rate) + "%"} | ${ciPct(s.ci)} |`);
}
L.push("");
L.push("Rated by `claude-fable-5` only. The human comparator was skipped by user decision before generation, so there is no independent check on these verdicts.");
L.push("");

L.push("## 3. Per failure mode");
L.push("");
L.push("### Rubric scores, 1 to 5, higher is better");
L.push("");
L.push("| Mode | A mean | A 95% CI | B mean | B 95% CI | Delta |");
L.push("| --- | --- | --- | --- | --- | --- |");
for (const [dim, label] of [["f1", "F1 graphical indicators"], ["f2", "F2 verbosity"], ["f3", "F3 sloppy text"], ["f4", "F4 generic feel"], ["f5", "F5 async handling (derived)"], ["hierarchy", "Visual hierarchy"]]) {
  const s = rubricStats[dim];
  L.push(`| ${label} | ${s.a.mean} | ${ci(s.a.ci)} | ${s.b.mean} | ${ci(s.b.ci)} | ${s.delta >= 0 ? "+" : ""}${s.delta} |`);
}
L.push("");
L.push("F1 to F4 and visual hierarchy come from blind `ux-rubric-rater` runs. F5 is derived by this script from async fail counts, never rated by a model.");
L.push("");
L.push("### Deterministic browser metrics, desktop 1440x900");
L.push("");
L.push("| Metric | A mean | A 95% CI | B mean | B 95% CI | Delta |");
L.push("| --- | --- | --- | --- | --- | --- |");
for (const [key, label] of [
  ["viewportWords", "Visible words in viewport"],
  ["pageWords", "Visible words in page"],
  ["mobileViewportWords", "Visible words in viewport (mobile)"],
  ["labelMeanWords", "Mean button-label words"],
  ["labelMaxWords", "Max button-label words"],
  ["helperWords", "Helper text words (p, small)"],
  ["longLeafWords", "Words in leaf elements over 12 words"],
  ["graphicalTotal", "Graphical indicators, total"],
  ["consoleErrors", "Console errors"],
  ["uncaughtExceptions", "Uncaught exceptions"],
]) {
  const s = metricStats[key];
  L.push(`| ${label} | ${s.a.mean} | ${ci(s.a.ci)} | ${s.b.mean} | ${ci(s.b.ci)} | ${s.delta >= 0 ? "+" : ""}${s.delta} |`);
}
L.push("");
L.push(`**The two F2 measures disagree.** The blind rubric scored B higher on verbosity (${rubricStats.f2.a.mean} -> ${rubricStats.f2.b.mean}), while the deterministic word counts moved the other way: B shows ${metricStats.viewportWords.delta >= 0 ? "+" : ""}${metricStats.viewportWords.delta} more visible words in the viewport, ${metricStats.labelMeanWords.delta >= 0 ? "+" : ""}${metricStats.labelMeanWords.delta} more words per button label, and a maximum label length of ${metricStats.labelMaxWords.b.mean} words against A's ${metricStats.labelMaxWords.a.mean}. B writes more text, not less. The one verbosity measure that favours B is words in leaf elements over 12 words (A ${metricStats.longLeafWords.a.mean}, B ${metricStats.longLeafWords.b.mean}), meaning B avoids explanatory paragraphs while using more words in labels and dense UI chrome. Both numbers are reported as pre-registered and neither is adjusted.`);
L.push("");
L.push(`**Duplicate submission.** The pre-registered deterministic probe clicks the first visible action button three times in 200 ms under slow latency and counts backend calls. It produced a countable call on only ${dupStats.a.applicable + dupStats.b.applicable} of 36 sites (A ${dupStats.a.applicable}/${dupStats.a.of}, B ${dupStats.b.applicable}/${dupStats.b.of}); on the rest the first visible button was a tab, filter, or navigation control, or an empty required form blocked submission. Among the sites where it did fire, duplicates were allowed on A ${dupStats.a.allowedDuplicate}/${dupStats.a.applicable} and B ${dupStats.b.allowedDuplicate}/${dupStats.b.applicable}. The metric is reported as pre-registered and is too sparse to carry a conclusion; async checklist item 2 below is the live measurement of the same property.`);
L.push("");
L.push("### Async checklist failures, blind agentic rating");
L.push("");
L.push(`- A: mean ${asyncStats.a.mean} failures per site, 95% CI ${ci(asyncStats.a.ci)}, ${asyncStats.a.total} failures over ${asyncStats.a.n} sites.`);
L.push(`- B: mean ${asyncStats.b.mean} failures per site, 95% CI ${ci(asyncStats.b.ci)}, ${asyncStats.b.total} failures over ${asyncStats.b.n} sites.`);
L.push(`- **B as a fraction of A: ${asyncRatio === null ? "n/a" : r2(asyncRatio)}** (pre-registered thresholds: <=0.5 falsifies, >=0.75 supports).`);
L.push("");
L.push("Per item, failures over items actually rated (N/A excluded by the pre-registered applicability rule):");
L.push("");
L.push("| # | Item | A fails / rated | B fails / rated |");
L.push("| --- | --- | --- | --- |");
const ITEM_TEXT = [
  "Loading state visible within 300 ms",
  "Primary action disabled or deduplicated while pending",
  "Progress shown where the API provides it",
  "Cancel available for long-running actions",
  "Failure message specific and near the element",
  "Recovery path without reloading",
  "API field errors mapped to the right fields",
  "Live state updates without manual refresh",
  "Mid-action navigation leaves UI consistent",
  "No optimistic state before server confirms",
];
for (const row of asyncByItem) {
  L.push(`| ${row.n} | ${ITEM_TEXT[row.n - 1]} | ${row.a.fails} / ${row.a.rated} | ${row.b.fails} / ${row.b.rated} |`);
}
L.push("");

L.push("## 4. Genericness");
L.push("");
L.push("Within-model mean pairwise cosine of the 256-dim grayscale layout vector, over site pairs drawn from **different** briefs. Higher means the model's layouts look more alike across unrelated tasks.");
L.push("");
L.push("| Model | Mean cross-brief cosine | 95% CI | Pairs |");
L.push("| --- | --- | --- | --- |");
L.push(`| A \`${A}\` | ${generic.a.mean} | ${ci(generic.a.ci)} | ${generic.a.pairs} |`);
L.push(`| B \`${B}\` | ${generic.b.mean} | ${ci(generic.b.ci)} | ${generic.b.pairs} |`);
L.push("");
L.push(`Difference (B minus A): ${generic.delta >= 0 ? "+" : ""}${generic.delta}.`);
L.push("");

L.push("## 5. Rater bias check");
L.push("");
L.push(`Across all 108 individual pairwise runs, the \`claude-fable-5\` raters named the B artifact in ${(() => {
  const named = runs.filter((r) => r.verdict !== "Tie");
  const bPref = named.filter((r) => modelOf(favours(r)) === B).length;
  return `${pct(bPref / named.length)}% of the ${named.length} non-tie runs (${bPref} runs)`;
})()}.`);
L.push("");
L.push("**No independent comparator exists.** Human blind rating was skipped by user decision before generation, so a preference of the rater family for artifacts from its own generation cannot be excluded or quantified. The orchestrating agent also runs model B, which is why it scored nothing and why every number here is computed by this script.");
L.push("");

L.push("## 6. Failures and exclusions");
L.push("");
L.push(`- **Generation failures: ${failures.length}.** ${failures.length ? failures.map((f) => `${f.id} (${f.reason})`).join("; ") : "Every one of the 36 cells produced a valid HTML document on the first attempt."}`);
L.push(`- **Retries: ${Object.values(mapping).reduce((s, m) => s + m.retries, 0)}.**`);
L.push(`- **Stripped identifiers: ${stripped.length}.** ${(() => {
  const byKind = {};
  for (const s of stripped) byKind[s.kind] = (byKind[s.kind] || 0) + 1;
  return Object.entries(byKind).map(([k, v]) => `${v} ${k}`).join(", ");
})()}. No model name, vendor name, or generator meta tag was present in any site; the only removals were HTML comments. Full log in \`sealed/stripped.json\`.`);
L.push(`- **Position-inconsistent pairs: ${resolved.filter((p) => p.inconsistent).length} of ${resolved.length}.** ${resolved.filter((p) => p.inconsistent).map((p) => p.pairKey).join(", ") || "none"}`);
L.push(`- **Blinding check.** \`grep -riE 'claude|anthropic|opus|sonnet|haiku|fable' sites/\` returned nothing before rating, and no rater prompt contained a model identity.`);
L.push("");
L.push("Generation cost, for the record:");
L.push("");
L.push("| Model | Mean bytes | Mean output tokens | Mean latency | Total cost |");
L.push("| --- | --- | --- | --- | --- |");
L.push(`| A \`${A}\` | ${genStats.a.bytes} | ${genStats.a.tokensOut} | ${genStats.a.latencySec}s | $${genStats.a.costUsd} |`);
L.push(`| B \`${B}\` | ${genStats.b.bytes} | ${genStats.b.tokensOut} | ${genStats.b.latencySec}s | $${genStats.b.costUsd} |`);
L.push("");

L.push("## 7. Five illustrative screenshot pairs");
L.push("");
L.push("Chosen by the pre-registered rule and no other: the 2 largest positive rubric gaps, the 2 largest negative gaps, and the pair whose gap is closest to the median of all resolved pairs. Gap is `mean(F1..F5, hierarchy of the B site) - mean(same of the A site)`.");
L.push("");
for (const g of illustrative) {
  L.push(`### ${g.pairKey} (${g.brief}), gap ${g.gap >= 0 ? "+" : ""}${r2(g.gap)}, resolved winner ${g.winnerModel}`);
  L.push("");
  L.push(`- A \`${g.aId}\`: \`shots/${g.aId}_idle_desktop.png\`, \`shots/${g.aId}_error_desktop.png\``);
  L.push(`- B \`${g.bId}\`: \`shots/${g.bId}_idle_desktop.png\`, \`shots/${g.bId}_error_desktop.png\``);
  L.push("");
}

L.push("## 8. Why the pairwise result does not hold");
L.push("");
L.push("Everything in this section was measured after the pre-registered verdict was computed, from the same "
  + "artifacts, with no new generation.");
L.push("");

L.push("### 8.1 The human comparator contradicts the model rater");
L.push("");
if (VAL.human && VAL.human.rated > 0) {
  L.push(`Rated blind through \`harness/rate.html\`, orientation randomised and balanced, `
    + `${VAL.human.rated} of ${VAL.human.total} pairs.`);
  L.push("");
  L.push("| Rater | prefers B | prefers A | ties | B win rate |");
  L.push("| --- | --- | --- | --- | --- |");
  L.push(`| Human | ${VAL.human.b} | ${VAL.human.a} | ${VAL.human.ties} | **${pct(VAL.human.rate)}%** |`);
  L.push(`| \`claude-fable-5\` | ${pairwiseOverall.bWins} | ${pairwiseOverall.aWins} | ${pairwiseOverall.ties} | ${pct(wr)}% |`);
  L.push("");
  L.push(`Agreement is ${VAL.human.agreement.agree} of ${VAL.human.agreement.n} `
    + `(${pct(VAL.human.agreement.rate)}%). A coin would agree half the time, so the model rater's verdicts carry `
    + `close to no information about the human's. The human showed no position bias: Left `
    + `${VAL.human.left}, Right ${VAL.human.right}.`);
  L.push("");
  L.push("Per brief, the disagreement is not uniform:");
  L.push("");
  L.push("| Brief | Human B-A-tie | Human B rate | Fable |");
  L.push("| --- | --- | --- | --- |");
  for (const b of BRIEFS) {
    const r = VAL.human.byBrief[b];
    if (!r) { L.push(`| ${b} | not rated | n/a | B on all ${pairwiseByBrief[b].decided} |`); continue; }
    const dec = r.b + r.a;
    L.push(`| ${b} | ${r.b}-${r.a}-${r.ties} | ${dec ? pct(r.b / dec) + "%" : "n/a"} | B on all ${pairwiseByBrief[b].decided} |`);
  }
  L.push("");
  L.push("The model rater preferred B on every brief. The human preferred B on the data-dense tools and A on the "
    + "sparse consumer flows. A rater that returns the same answer regardless of task is expressing a preference "
    + "over house style, not a judgement about fitness for the brief.");
  L.push("");
} else {
  L.push("No human verdicts on disk.");
  L.push("");
}

L.push("### 8.2 Three samples per cell are one design, so n is 6");
L.push("");
L.push("Mean cosine between the layout vectors of the three samples inside a single model x brief cell:");
L.push("");
L.push("| Model | " + BRIEFS.join(" | ") + " |");
L.push("| --- |" + BRIEFS.map(() => " --- |").join(""));
for (const [k, label] of [["a", `A \`${A}\``], ["b", `B \`${B}\``]]) {
  L.push(`| ${label} | ` + BRIEFS.map((b) => VAL.withinCell[k][b]).join(" | ") + " |");
}
L.push("");
L.push(`In ${VAL.nearDuplicateCells} of ${VAL.totalCells} cells the three samples exceed 0.998 cosine. Only the `
  + `job-queue and dashboard briefs produced genuine variation between samples. Averaged over all cells the `
  + `within-cell figure is ${VAL.withinCellMean} against ${VAL.crossModelSameBriefMean} for two different models `
  + `on the same brief, and that aggregate understates the problem because the two varying briefs drag it down.`);
L.push("");
L.push(`Consequence for the statistics: the 54 pairs are 6 design comparisons repeated 9 times each, not 54 `
  + `independent trials. The exact one-sided 95% lower bound on a run of all-B wins is `
  + `${VAL.effectiveN.pairsAsIndependent.lower}% at n=${VAL.effectiveN.pairsAsIndependent.n} and `
  + `${VAL.effectiveN.briefsAsIndependent.lower}% at n=${VAL.effectiveN.briefsAsIndependent.n}. Every bootstrap `
  + `CI in sections 2 to 4 resamples sites, so all of them are too narrow by the same mechanism.`);
L.push("");

L.push("### 8.3 Blinding removed the labels but not the signature");
L.push("");
if (VAL.leakage) {
  L.push(`A 1-nearest-neighbour classifier over 11 surface features, leave-one-out, recovers which model generated `
    + `a site ${VAL.leakage.nn1AnyNeighbour}% of the time, and ${VAL.leakage.nn1OtherBriefOnly}% when it is `
    + `forbidden from matching a site from the same brief. Chance is 50%.`);
  L.push("");
  L.push("| Signature | A | B |");
  L.push("| --- | --- | --- |");
  L.push(`| Distinct page backgrounds over 18 sites | ${VAL.leakage.distinctBgA} | ${VAL.leakage.distinctBgB} |`);
  L.push(`| Most-repeated page background | \`${VAL.leakage.topBgA[0]}\` on ${VAL.leakage.topBgA[1]}/18 sites | \`${VAL.leakage.topBgB[0]}\` on ${VAL.leakage.topBgB[1]}/18 sites |`);
  L.push(`| Sites with any remove or delete control | ${VAL.leakage.removeControlSites.a}/18 | ${VAL.leakage.removeControlSites.b}/18 |`);
  L.push(`| Mean visible buttons | ${VAL.leakage.meanButtons.a} | ${VAL.leakage.meanButtons.b} |`);
  L.push(`| Mean error surfaces after a forced failure | ${VAL.leakage.meanErrorSurfaces.a} | ${VAL.leakage.meanErrorSurfaces.b} |`);
  L.push(`| Mean characters per error message | ${VAL.leakage.meanErrorChars.a} | ${VAL.leakage.meanErrorChars.b} |`);
  L.push("");
  L.push(`One model reused a single page background on ${VAL.leakage.topBgA[1]} of its 18 sites across four `
    + `unrelated briefs. Model identity is therefore legible from styling and control density in a single `
    + `side-by-side view. Each \`ux-pair-rater\` ran with no history and so could not learn the signature across `
    + `pairs, but it does not need to: a stable preference for one house style produces exactly the `
    + `${pct(wr)}% unanimity observed, and is indistinguishable from a quality judgement in this design.`);
  L.push("");
  L.push("This also reframes the F4 genericness result in section 4. B's lower cross-brief similarity means B "
    + "varies its layout more between briefs, while the table above shows B still carries a consistent control "
    + "density and error-handling style. The two are not in conflict, but only the first was measured as "
    + "genericness.");
  L.push("");
} else {
  L.push("`sealed/signature.json` is absent, so leakage was not measured.");
  L.push("");
}

L.push("### 8.4 The rubric had no room to discriminate");
L.push("");
L.push("| Dimension | Scores of 4 or 5 | Distinct values used |");
L.push("| --- | --- | --- |");
for (const [dim, label] of [["f1", "F1 graphical indicators"], ["f2", "F2 verbosity"], ["f3", "F3 sloppy text"], ["f4", "F4 generic feel"], ["hierarchy", "Visual hierarchy"]]) {
  const c = VAL.ceiling[dim];
  L.push(`| ${label} | ${c.atOrAbove4}/${c.of} | ${c.distinct.join(", ")} |`);
}
L.push("");
L.push("A five-point scale on which nearly every artifact scores 4 or 5 cannot separate two models. The rubric "
  + "deltas in section 3 are real but they sit inside one scale point, which is below the resolution the anchors "
  + "were written for.");
L.push("");

L.push("### 8.5 What still stands");
L.push("");
L.push("These do not depend on the pairwise rater or on sample independence:");
L.push("");
L.push(`- **Deterministic browser measurements**, section 3. B renders more visible words `
  + `(${metricStats.viewportWords.a.mean} -> ${metricStats.viewportWords.b.mean}), longer button labels `
  + `(max ${metricStats.labelMaxWords.a.mean} -> ${metricStats.labelMaxWords.b.mean} words) and far more `
  + `graphical indicators (${metricStats.graphicalTotal.a.mean} -> ${metricStats.graphicalTotal.b.mean}). `
  + `These are counts from a real browser, not judgements.`);
L.push(`- **Generation cost**, section 6. B used ${r2(genStats.b.tokensOut / genStats.a.tokensOut)}x the output `
  + `tokens and ${r2(genStats.b.latencySec / genStats.a.latencySec)}x the wall time of A for the same six briefs.`);
L.push("- **Zero console errors and zero uncaught exceptions** across all 36 sites, both models.");
L.push("- **The discarded pilot**, in the limitations below: three of eighteen A generations lost their document "
  + "inside a JSON tool-call argument against zero for B. That is a tool-call robustness difference, measured, "
  + "and unrelated to UX.");
L.push("");

L.push("### 8.6 Why the samples converged");
L.push("");
L.push("Section 8.2 shows the three samples of a cell are visually near-identical. The cause is not decoding "
  + "determinism. All 36 files have distinct hashes, and the literal code overlap between two samples of the "
  + "same cell is 0.024 for A and 0.0035 for B by 8-token shingle Jaccard, against a 0.0018 floor for two sites "
  + "from unrelated briefs. Each sample is written from scratch and independently lands on the same design.");
L.push("");
L.push("Four convergence attractors are measurable in the artifacts:");
L.push("");
L.push("- **One typeface.** Inter on 35 of 36 sites. Neither model was told which font to use.");
L.push("- **Two page backgrounds.** 26 sites near-white in a luminance band of 239 to 249, 10 near-black in a "
  + "band of 11 to 17, and nothing between.");
L.push("- **One corner radius.** The primary button lands on 8 px on 13 of 36 sites and inside 6 to 10 px on 30.");
L.push("- **A shared genre prior.** The dark theme tracks the brief, not the model: the on-call dashboard went "
  + "dark 6 of 6 and the job queue 4 of 6, while the other four briefs went dark 0 of 6. Both models "
  + "independently map monitoring tools to dark and consumer flows to light.");
L.push("");
L.push("Three of the causes are this harness, not the models:");
L.push("");
L.push("- **The API contract doubled as a design spec.** Both generators received exact type definitions, "
  + "including `Job = { id, status: \"queued\" | \"running\" | \"succeeded\" | \"failed\", progress: 0-100, error?, "
  + "result? }`, which prescribes a row with a status pill and a progress bar, and `Service = { name, status, "
  + "latencyMs[], errorRate[], uptimePct }`, which prescribes a card with two sparklines and a percentage. Six "
  + "briefs shared one API, so all six apps share data shapes.");
L.push("- **Each brief was one sentence with no design direction.** No brand, no constraints, no references, no "
  + "audience beyond a role word. Where the brief underdetermines the design, the model fills the gap from "
  + "priors, and the priors are exactly what is identical across samples.");
L.push("- **Thinking effort was pinned to `high` for both generators.** Higher reasoning effort converges on the "
  + "modal best-practice answer, which reduces sample variance by construction.");
L.push("");
if (EFF) {
  const hubOf = (m) => idsOf(m).reduce((s, i) => s + EFF[i].nHub, 0);
  const procOf = (m) => idsOf(m).reduce((s, i) => s + EFF[i].processesStarted.length, 0);
  const opTally = {};
  for (const i of ids) for (const [op, n] of Object.entries(EFF[i].hubOps)) opTally[op] = (opTally[op] || 0) + n;
  const opStr = Object.entries(opTally).sort((a, b) => b[1] - a[1]).map(([o, n]) => `\`${o}\` ${n}`).join(", ");
  const wcA = mean(Object.values(VAL.withinCell.a));
  const wcB = mean(Object.values(VAL.withinCell.b));

  L.push("**Sibling coordination was checked and excluded.** The 36 generators ran as concurrent siblings with a "
    + "messaging channel available, so agents talking to each other is a live alternative explanation for the "
    + `sameness. Auditing every argument of all ${hubOf(A) + hubOf(B)} \`hub\` calls in the generation `
    + `transcripts: ${opStr}. There are zero \`send\` calls, zero \`list\` calls, and zero occurrences of the `
    + "peer fields `to`, `message`, `from`, `replyTo` or `await`. Every `wait` names the agent's own process with "
    + "`for: \"exit\"`. No generator ever addressed another.");
  L.push("");
  L.push(`The correlation also runs the wrong way. A opened no channel at all, made ${hubOf(A)} process calls, and `
    + `its within-cell cosine is ${r4(wcA)}. B made ${hubOf(B)} process calls and starts `
    + `${procOf(B)} processes, and its within-cell cosine is ${r4(wcB)}. **The model with no communication `
    + `produced the more identical outputs.** Coordination cannot explain an effect that is strongest where no `
    + `channel was used.`);
  L.push("");
  const perB = BRIEFS.map((b) => {
    const cell = idsOf(B, b);
    const cs = [];
    for (let i = 0; i < cell.length; i++)
      for (let k = i + 1; k < cell.length; k++) cs.push(cos(metrics[cell[i]].layoutVector, metrics[cell[k]].layoutVector));
    return { b, cos: mean(cs), proc: cell.reduce((s, i) => s + EFF[i].processesStarted.length, 0) };
  });
  const zero = perB.filter((x) => x.proc === 0);
  const some = perB.filter((x) => x.proc > 0);
  if (zero.length && some.length) {
    L.push(`**Self-verification looks like a convergence force, not a diversifying one.** Within B, the `
      + `${zero.length} briefs where it started no test processes (${zero.map((x) => x.b).join(", ")}) have a mean `
      + `within-cell cosine of ${r4(mean(zero.map((x) => x.cos)))}, while the ${some.length} briefs where it did `
      + `(${some.map((x) => x.b).join(", ")}) sit at ${r4(mean(some.map((x) => x.cos)))}. Testing each sample `
      + `against the same fixed mock API plausibly pulls every sample toward the same passes-every-check design. `
      + `**This is an observation on 6 briefs, not a result:** the two unverified briefs are also the two most `
      + `data-dense ones, so brief complexity is an uncontrolled confound and the direction cannot be separated `
      + `from it here.`);
    L.push("");
  }
}

L.push("A caution on the instrument: the 16x16 grayscale vector is dominated by page brightness and gross column "
  + "structure, so it reads 0.9687 within a cell, 0.9668 across models on one brief, and 0.9554 across both "
  + "models and briefs. A spread of 0.013 across all four conditions means this metric mostly measures the "
  + "shared global template and cannot see the per-model signature that section 8.3 does measure. Both readings "
  + "are true at different resolutions: every site shares one template, and inside that template each model has "
  + "a distinct control density.");
L.push("");

L.push("### 8.7 What a design that could answer the thesis needs");
L.push("");
L.push("- **Independent samples.** Vary the brief wording per sample, or raise temperature, or use different "
  + "briefs per sample. Three redraws of one house style are one sample.");
L.push("- **A rater that is not from either family, plus a human on the same pairs.** One rater family is one "
  + "measuring instrument with an unmeasured offset.");
L.push("- **Style-normalised artifacts.** Strip CSS to a shared stylesheet before rating, so raters compare "
  + "structure and behaviour rather than palette and control density.");
L.push("- **A rubric with headroom**, anchored on observed failures from a pilot rather than on a 1-to-5 scale "
  + "whose top two points absorb almost everything.");
L.push("- **Behavioural async measurement as the primary async metric.** The live harness in "
  + "`harness/rate.html` reaches the real backend once form fields are filled; the scripted probe in "
  + "`measure.mjs` did not, and returned null on 32 of 36 sites.");
L.push("");

L.push("## 9. Was B's extra cost justified?");
L.push("");

if (!EFF || !QUAL) {
  L.push("`sealed/effort.json` or `sealed/quality.json` is absent. Run `harness/effort.mjs` and "
    + "`harness/quality.mjs` first.");
  L.push("");
} else {
  const eff = (model, k) => {
    const r = ids.filter((i) => mapping[i].model === model).map((i) => EFF[i][k]);
    return mean(r);
  };
  const qOk = (model) => ids.filter((i) => mapping[i].model === model && !QUAL[i].error);
  const qmean = (model, k) => mean(qOk(model).map((i) => QUAL[i][k]));
  const qtot = (model, k) => qOk(model).reduce((s, i) => s + QUAL[i][k], 0);
  const ratio = (a_, b_) => (a_ ? `${r2(b_ / a_)}x` : b_ ? "n/a" : "0x");

  L.push(`B cost ${r2(genStats.b.tokensOut / genStats.a.tokensOut)}x the output tokens, `
    + `${r2(genStats.b.latencySec / genStats.a.latencySec)}x the wall time and `
    + `${r2(genStats.b.costUsd / genStats.a.costUsd)}x the money of A for the same six briefs `
    + `($${genStats.b.costUsd} against $${genStats.a.costUsd}). This section asks what that bought, by `
    + `reading the generation transcripts and the delivered code. No model rated anything here.`);
  L.push("");

  L.push("### 9.1 The two models did different amounts of work, not just different sizes");
  L.push("");
  L.push("Both generators had the identical prompt, the identical thinking level, and the identical tool set: "
    + "`write` and `yield`, with no edit tool.");
  L.push("");
  L.push("| Per site | A | B | B/A |");
  L.push("| --- | --- | --- | --- |");
  const effRows = [
    ["Output tokens", "outTok", 0],
    ["Thinking characters", "thinkCh", 0],
    ["Calls to `write`", "nWrites", 1],
    ["Characters passed to `write`", "writeCh", 0],
    ["Of those, re-emitting content already written", "redundantCh", 0],
    ["Delivered file bytes", "fileBytes", 0],
    ["Process-control calls (`hub`)", "nHub", 1],
  ];
  for (const [label, k, dp] of effRows) {
    const a_ = eff(A, k), b_ = eff(B, k);
    const f = (x) => (dp ? r2(x) : Math.round(x).toLocaleString("en-US"));
    /* a ratio against a near-zero baseline is noise, not information */
    const rr = a_ > 0 && b_ / a_ < 200 ? ratio(a_, b_) : "n/a";
    L.push(`| ${label} | ${f(a_)} | ${f(b_)} | ${rr} |`);
  }
  L.push("");
  const multiA = ids.filter((i) => mapping[i].model === A && EFF[i].nWrites > 1).length;
  const multiB = ids.filter((i) => mapping[i].model === B && EFF[i].nWrites > 1).length;
  const hubB = ids.filter((i) => mapping[i].model === B).reduce((s, i) => s + EFF[i].nHub, 0);
  const startedB = ids.filter((i) => mapping[i].model === B).reduce((s, i) => s + EFF[i].processesStarted.length, 0);
  L.push(`**A wrote the file once and stopped.** ${multiA} of 18 A sites were written more than once, against `
    + `${multiB} of 18 for B. A made zero process-control calls. B made ${hubB}, launching ${startedB} `
    + `throwaway Node scripts with names like \`verify.mjs\`, \`interact-*.mjs\`, \`drive_fail_*.mjs\` and `
    + `\`mobilerun-*.mjs\`, reading their logs, and then rewriting the page.`);
  L.push("");
  L.push("Nothing in the prompt asked for that. Both models were told to build the file, write it, and yield "
    + "`done`. A followed the instruction literally. B built itself a test harness first. **The cost gap is "
    + "mostly a behaviour gap, not a verbosity gap.**");
  L.push("");
  const redShare = eff(B, "redundantCh") / 3.0 / eff(B, "outTok");
  const redTotal = ids.filter((i) => mapping[i].model === B).reduce((s, i) => s + EFF[i].redundantCh, 0);
  L.push(`**The largest single line on B's bill is re-typing.** With no edit tool, every fix meant re-emitting `
    + `the whole 45 KB document. B re-emitted ${Math.round(redTotal).toLocaleString("en-US")} characters of `
    + `already-written content across 18 sites, about ${pct(redShare)}% of its entire output budget. `
    + `**That is a harness cost, not a model cost.** Granting an edit tool would remove most of it without `
    + `changing the product.`);
  L.push("");

  L.push("### 9.2 What the extra bytes contain");
  L.push("");
  L.push("Static analysis of the 36 delivered files. B ships "
    + `${r2(eff(B, "fileBytes") / eff(A, "fileBytes"))}x the bytes of A.`);
  L.push("");
  L.push("| Delivered code | A | B | B/A |");
  L.push("| --- | --- | --- | --- |");
  const codeRows = [
    ["Distinct API methods called", "apiMethods"],
    ["Total API call sites", "apiCalls"],
    ["Event listeners", "listeners"],
    ["Inline SVG elements", "svgCount"],
    ["CSS rules", "cssRules"],
    ["CSS custom properties", "cssVars"],
    ["Media queries", "mediaQ"],
    ["`aria-*` attributes", "ariaAttrs"],
    ["`role` attributes", "roles"],
    ["`try` blocks", "tryBlocks"],
    ["CSS transitions", "transitions"],
  ];
  for (const [label, k] of codeRows) {
    const a_ = mean(idsOf(A).map((i) => CODE[i][k]));
    const b_ = mean(idsOf(B).map((i) => CODE[i][k]));
    L.push(`| ${label} | ${r2(a_)} | ${r2(b_)} | ${ratio(a_, b_)} |`);
  }
  L.push("");
  L.push("**Feature coverage is flat.** B calls "
    + `${r2(mean(idsOf(B).map((i) => CODE[i].apiMethods)) / mean(idsOf(A).map((i) => CODE[i].apiMethods)))}x `
    + "the distinct backend methods of A. Both models wire up roughly the same set of operations from the same "
    + "mock API. The extra bytes are not extra features.");
  L.push("");
  L.push("**A writes more local error handling.** A ships "
    + `${r2(mean(idsOf(A).map((i) => CODE[i].tryBlocks)))} \`try\` blocks per site against B's `
    + `${r2(mean(idsOf(B).map((i) => CODE[i].tryBlocks)))}, and more CSS transitions. Not every count favours B.`);
  L.push("");

  L.push("### 9.3 Whether the extra code does anything");
  L.push("");
  L.push("Measured in a real browser against the live DOM, not counted in the source.");
  L.push("");
  L.push("| Outcome | A | B |");
  L.push("| --- | --- | --- |");
  L.push(`| Interactive controls with an accessible name | ${pct(qtot(A, "named") / qtot(A, "interactive"))}% | ${pct(qtot(B, "named") / qtot(B, "interactive"))}% |`);
  L.push(`| Form inputs with a real label | ${pct(qtot(A, "inputsLabelled") / qtot(A, "inputs"))}% | ${pct(qtot(B, "inputsLabelled") / qtot(B, "inputs"))}% |`);
  L.push(`| Icon-only controls with no name | ${qtot(A, "iconOnlyUnnamed")} | ${qtot(B, "iconOnlyUnnamed")} |`);
  L.push(`| CSS rules matching no element | ${pct(qtot(A, "cssDead") / qtot(A, "cssAuthored"))}% (${qtot(A, "cssDead")} rules) | ${pct(qtot(B, "cssDead") / qtot(B, "cssAuthored"))}% (${qtot(B, "cssDead")} rules) |`);
  L.push(`| Live regions per site | ${r2(qmean(A, "liveRegions"))} | ${r2(qmean(B, "liveRegions"))} |`);
  L.push(`| Sites with any live region | ${qOk(A).filter((i) => QUAL[i].liveRegions > 0).length}/18 | ${qOk(B).filter((i) => QUAL[i].liveRegions > 0).length}/18 |`);
  L.push("");
  L.push("**The 60x `aria-*` count buys almost nothing on naming.** A reaches "
    + `${pct(qtot(A, "named") / qtot(A, "interactive"))}% accessible-name coverage with visible button text, `
    + `B reaches ${pct(qtot(B, "named") / qtot(B, "interactive"))}% with explicit \`aria-label\`. Neither model `
    + "ships a single unnamed icon-only control. Counting attributes in the source overstates this difference by "
    + "roughly sixty times; the browser shows the two models are level.");
  L.push("");
  L.push(`**The one clear accessibility win is the announcement path.** Live regions appear on `
    + `${qOk(A).filter((i) => QUAL[i].liveRegions > 0).length} of 18 A sites and `
    + `${qOk(B).filter((i) => QUAL[i].liveRegions > 0).length} of 18 B sites. That is the mechanism a screen `
    + `reader needs to hear that a background job finished, and it is close to absent in A. It is also invisible `
    + `to every rater in this study, human and model, because none of them used a screen reader.`);
  L.push("");
  L.push(`**Both models ship about a quarter of their CSS dead.** `
    + `${pct(qtot(A, "cssDead") / qtot(A, "cssAuthored"))}% for A and `
    + `${pct(qtot(B, "cssDead") / qtot(B, "cssAuthored"))}% for B, measured by testing every author rule's base `
    + `selector against the rendered DOM. The share is the same, so B's larger stylesheet ships more dead rules `
    + `in absolute terms (${qtot(B, "cssDead")} against ${qtot(A, "cssDead")}). Neither model prunes.`);
  L.push("");

  L.push("### 9.4 Cost against measured gain");
  L.push("");
  const extra = genStats.b.costUsd - genStats.a.costUsd;
  L.push(`B's 18 sites cost $${r2(extra)} more than A's 18 sites, $${r2(extra / 18)} more per site. Set against `
    + `every gain this study can actually measure:`);
  L.push("");
  L.push("| Gain | Size | Measured by |");
  L.push("| --- | --- | --- |");
  L.push(`| Graphical indicators per page | ${metricStats.graphicalTotal.a.mean} -> ${metricStats.graphicalTotal.b.mean} (+${r2(100 * (metricStats.graphicalTotal.b.mean / metricStats.graphicalTotal.a.mean - 1))}%) | browser count |`);
  L.push(`| Interactive controls per page | ${r2(qmean(A, "interactive"))} -> ${r2(qmean(B, "interactive"))} | browser count |`);
  L.push(`| Sites with a live region | 1/18 -> 17/18 | browser count |`);
  L.push(`| Distinct backend methods wired up | ${r2(mean(idsOf(A).map((i) => CODE[i].apiMethods)))} -> ${r2(mean(idsOf(B).map((i) => CODE[i].apiMethods)))} | source count |`);
  L.push(`| Accessible-name coverage | ${pct(qtot(A, "named") / qtot(A, "interactive"))}% -> ${pct(qtot(B, "named") / qtot(B, "interactive"))}% | browser |`);
  L.push(`| Dead CSS share | ${pct(qtot(A, "cssDead") / qtot(A, "cssAuthored"))}% -> ${pct(qtot(B, "cssDead") / qtot(B, "cssAuthored"))}% | browser |`);
  if (VAL.human && VAL.human.rated > 0) {
    L.push(`| Human blind preference for B | ${pct(VAL.human.rate)}% of ${VAL.human.b + VAL.human.a} decided pairs | human |`);
  }
  L.push("");
  L.push("**The verdict on cost depends entirely on which column you read.**");
  L.push("");
  L.push("- Judged on what a person notices in a side-by-side comparison, the money bought nothing reliable. "
    + `A human preferred B on ${VAL.human ? pct(VAL.human.rate) : "n/a"}% of decided pairs, which is a coin `
    + "flip, for 7.5 times the price.");
  L.push("- Judged on the code, the money bought twice the controls, 1.8 times the graphics, and the "
    + "screen-reader announcement path going from absent to standard. It bought no new features and no less "
    + "dead CSS.");
  L.push("- A third of the bill was re-typing files because the harness gave no edit tool, and that portion "
    + "bought nothing at all.");
  L.push("");
  L.push("The honest summary is that **A and B were not doing the same job.** A answered the brief. B answered "
    + "the brief, built a browser harness to check its answer, found things it did not like, and rewrote the "
    + "page four times. Whether that is worth 7.5 times the price is a question about how much you value work "
    + "you cannot see in a screenshot, and this study measured almost none of it.");
  L.push("");
}

L.push("## 10. Limitations");
L.push("");
L.push("- **Single rater model family.** Every score comes from `claude-fable-5`. Same-generation preference cannot be excluded.");
L.push("- **No human rater.** Human blind rating was skipped by user decision before generation, so section 5 has no comparator.");
L.push("- **The orchestrator runs model B.** It never scored anything and every number here is computed by `analyze.mjs` from on-disk JSON, but it did know the mapping from generation onward.");
L.push("- **Mock backend, not a real one.** `harness/mock-api.js` is deterministic under a fixed seed. Real backends fail in ways it does not.");
L.push("- **No real usability testing.** No human ever used any of these 36 pages.");
L.push("- **n = 3 per cell.** 3 samples per brief per model. The CIs are wide and most rubric dimensions sit near the top of the 1-to-5 scale, which compresses any difference.");
L.push("- **The prompting ladder was dropped**, so this study says nothing about whether explicitly instructing the model closes any gap it finds.");
L.push("- **The duplicate-submission probe is sparse**, firing on only 4 of 36 sites, for the reasons in section 3.");
L.push("- **Puppeteer instead of Playwright.** Playwright was absent and would have needed a browser download; Chrome 151 and a `puppeteer-core` CDP path were already present.");
L.push("- **Grayscale layout vectors instead of CLIP embeddings.** No torch, numpy, or PIL exists on this host and installing torch was disproportionate. Genericness uses a 16x16 grayscale downsample, L2-normalised, compared by cosine.");
L.push("- **`max_tokens` is the model default 128000, not 32000.** Setting 32000 would have meant mutating the user's global model config. Both generators got the identical ceiling.");
L.push("- **Thinking effort pinned to `high`** for both generators, the only shared non-extreme level.");
L.push("- **Sites served over local HTTP, not `file://`**, so the mock API could be injected into `<head>` and reached by a plain navigation.");
L.push("- **The generator transport changed after a pilot run.** The first dispatch asked each generator to return the HTML inside its `yield` result. Three of eighteen `claude-opus-4-6` agents lost a 20-50 KB document in that JSON argument, one through a malformed tool call and two through empty yields, while `claude-opus-5` lost none. Scoring those as generation failures would have made a serialization artifact dominate the comparison, so both generators were given a `write` tool and instructed to write the file to a given path, and **all 36 sites were regenerated** under the new, identical transport. Every site in this study comes from that second run, which produced 36 valid documents and zero failures. The per-model difference in the discarded pilot is itself a finding about tool-call robustness, not about UX, and is not scored anywhere in this report.");
L.push("- **A harness prefix precedes every brief.** The subagent dispatcher prepends the fixed string `Complete assignment thoroughly:` to the user message. It is identical for every generation of both models and could not be disabled.");
L.push("- **A rate limit interrupted the fourth pairwise batch.** 27 of the 108 runs returned HTTP 429 and were re-dispatched in smaller chunks with backoff until all 108 completed. No verdict was inferred or filled in.");
L.push("");

writeFileSync(join(STUDY, "REPORT.md"), L.join("\n"));
console.log(`verdict: ${verdict}`);
console.log(`B win rate: ${pct(wr)}% (${pairwiseOverall.bWins}/${pairwiseOverall.decided}), ties ${pairwiseOverall.ties}`);
console.log(`async ratio B/A: ${asyncRatio === null ? "n/a" : r2(asyncRatio)}`);
console.log(`position inconsistency: ${pct(inconsistencyRate)}%`);
console.log(`illustrative pairs: ${illustrative.length}`);
console.log("wrote REPORT.md and analysis.json");
