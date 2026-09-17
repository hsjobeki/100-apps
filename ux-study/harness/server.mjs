/* Static server for the UX regression study.
 * Serves ux-study/sites/<id>.html at /s/<id> with the mock API injected into <head>,
 * plus the blind human pairwise rater at /rate.
 * Node builtins only.
 */
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HARNESS = dirname(fileURLToPath(import.meta.url));
const STUDY = resolve(HARNESS, "..");
const PORT = 8731;
const HOST = "127.0.0.1";

const ID_RE = /^[A-Za-z0-9_-]+$/;
const SHOT_RE = /^[A-Za-z0-9_-]+\.png$/;

const A_MODEL = "claude-opus-4-6";
const B_MODEL = "claude-opus-5";

const BRIEF_TEXT = {
  B1: "Build a tool where users upload a CSV, it gets processed on the server, and they can download the result.",
  B2: "Build an admin page for a background job queue. Admins need to see what's happening and deal with failed jobs.",
  B3: "Build a service health dashboard for an on-call engineer who needs to know at a glance whether something is wrong.",
  B4: "Build the first-run experience for a new user of a project management app who has no projects yet.",
  B5: "Build a checkout form for a small online shop.",
  B6: "Build an account settings page including deleting projects and deleting the account.",
};

const readJson = async (...p) => JSON.parse(await readFile(join(STUDY, ...p), "utf8"));

async function briefFor(id) {
  try {
    return (await readJson("sealed", "mapping.json"))?.[id]?.brief ?? "B1";
  } catch {
    return "B1";
  }
}

function inject(html, tag) {
  const head = /<head[^>]*>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + tag + html.slice(head.index + head[0].length);
  const htmlTag = /<html[^>]*>/i.exec(html);
  if (htmlTag)
    return html.slice(0, htmlTag.index + htmlTag[0].length) + tag + html.slice(htmlTag.index + htmlTag[0].length);
  return tag + html;
}

const send = (res, code, type, body) => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
};
const json = (res, obj) => send(res, 200, "application/json; charset=utf-8", JSON.stringify(obj));
const text = (res, code, body) => send(res, code, "text/plain; charset=utf-8", body);

/* ---------- results, computed only when asked ---------- */

async function computeResults() {
  const mapping = await readJson("sealed", "mapping.json");
  const { pairs } = await readJson("human", "pairs.json");
  const verdicts = await readJson("human", "verdicts.json");
  const runs = (await readFile(join(STUDY, "pairwise", "results.jsonl"), "utf8"))
    .trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

  const modelOf = (id) => mapping[id].model;
  const blank = () => ({ b: 0, a: 0, ties: 0, rate: null });
  const rate = (t) => {
    const dec = t.b + t.a;
    t.rate = dec ? Math.round((1000 * t.b) / dec) / 10 : null;
    return t;
  };

  /* human, overall */
  const human = { total: pairs.length, rated: 0, leftPicks: 0, rightPicks: 0, tally: blank(), decided: {} };
  for (const p of pairs) {
    const v = verdicts[p.pairKey];
    if (!v?.verdict) continue;
    human.rated++;
    if (v.verdict === "Tie") { human.tally.ties++; continue; }
    if (v.verdict === "Left") human.leftPicks++; else human.rightPicks++;
    const favoured = v.verdict === "Left" ? p.leftId : p.rightId;
    const m = modelOf(favoured);
    if (m === B_MODEL) human.tally.b++; else human.tally.a++;
    human.decided[p.pairKey] = m;
  }
  rate(human.tally);

  /* human, async handling */
  const humanAsync = { rated: 0, notExercised: 0, tally: blank(), decided: {} };
  for (const p of pairs) {
    const av = verdicts[p.pairKey]?.asyncVerdict;
    if (!av) continue;
    humanAsync.rated++;
    if (av === "NotExercised") { humanAsync.notExercised++; continue; }
    if (av === "Tie") { humanAsync.tally.ties++; continue; }
    const favoured = av === "Left" ? p.leftId : p.rightId;
    const m = modelOf(favoured);
    if (m === B_MODEL) humanAsync.tally.b++; else humanAsync.tally.a++;
    humanAsync.decided[p.pairKey] = m;
  }
  rate(humanAsync.tally);

  /* fable's async side, resolved from checklist fail counts per pair */
  const fableAsync = { tally: blank(), decided: {}, meanFailsA: null, meanFailsB: null };
  const failCounts = {};
  for (const id of Object.keys(mapping)) {
    try {
      failCounts[id] = (await readJson("async", `${id}.json`)).failCount;
    } catch {
      failCounts[id] = null;
    }
  }
  for (const p of pairs) {
    const [, aId, bId] = p.pairKey.split("_");
    const fa = failCounts[aId], fb = failCounts[bId];
    if (fa === null || fb === null) continue;
    if (fa === fb) { fableAsync.tally.ties++; continue; }
    const m = fb < fa ? B_MODEL : A_MODEL;
    if (m === B_MODEL) fableAsync.tally.b++; else fableAsync.tally.a++;
    fableAsync.decided[p.pairKey] = m;
  }
  rate(fableAsync.tally);
  const avg = (model) => {
    const xs = Object.keys(mapping).filter((id) => mapping[id].model === model)
      .map((id) => failCounts[id]).filter((x) => x !== null);
    return xs.length ? Math.round((100 * xs.reduce((s, x) => s + x, 0)) / xs.length) / 100 : null;
  };
  fableAsync.meanFailsA = avg(A_MODEL);
  fableAsync.meanFailsB = avg(B_MODEL);

  /* fable, resolved the same way analyze.mjs does: both orientations must agree */
  const byPair = new Map();
  for (const r of runs) {
    if (!byPair.has(r.pairKey)) byPair.set(r.pairKey, []);
    byPair.get(r.pairKey).push(r);
  }
  const fable = { tally: blank(), decided: {} };
  for (const [pairKey, rs] of byPair) {
    const fav = (r) => (r.verdict === "Tie" ? null : r.verdict === "Left" ? r.leftId : r.rightId);
    const o1 = fav(rs.find((r) => r.orientation === 1) ?? {});
    const o2 = fav(rs.find((r) => r.orientation === 2) ?? {});
    if (!o1 || !o2 || o1 !== o2) { fable.tally.ties++; continue; }
    const m = modelOf(o1);
    if (m === B_MODEL) fable.tally.b++; else fable.tally.a++;
    fable.decided[pairKey] = m;
  }
  rate(fable.tally);

  /* agreement on pairs both decided */
  let agree = 0, n = 0;
  for (const [k, m] of Object.entries(human.decided)) {
    if (!(k in fable.decided)) continue;
    n++;
    if (fable.decided[k] === m) agree++;
  }

  return {
    models: { a: A_MODEL, b: B_MODEL },
    human,
    humanAsync,
    fable,
    fableAsync,
    agreement: { n, agree, rate: n ? Math.round((1000 * agree) / n) / 10 : null },
    orientation: { aLeft: pairs.filter((p) => p.orientation === 1).length },
  };
}

/* ---------- routes ---------- */

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const path = url.pathname;

  if (req.method === "POST" && path === "/api/verdict") {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const { pairKey, verdict, asyncVerdict } = JSON.parse(body);
      if (verdict !== undefined && !["Left", "Right", "Tie"].includes(verdict))
        return text(res, 400, "bad verdict");
      if (asyncVerdict !== undefined && !["Left", "Right", "Tie", "NotExercised"].includes(asyncVerdict))
        return text(res, 400, "bad async verdict");
      if (verdict === undefined && asyncVerdict === undefined) return text(res, 400, "nothing to record");
      const file = join(STUDY, "human", "verdicts.json");
      const current = JSON.parse(await readFile(file, "utf8"));
      const entry = { ...(current[pairKey] ?? {}) };
      if (verdict !== undefined) entry.verdict = verdict;
      if (asyncVerdict !== undefined) entry.asyncVerdict = asyncVerdict;
      entry.at = new Date().toISOString();
      current[pairKey] = entry;
      await writeFile(file, JSON.stringify(current, null, 2));
      return json(res, { ok: true, rated: Object.keys(current).length });
    } catch (e) {
      return text(res, 400, String(e));
    }
  }

  if (req.method !== "GET" && req.method !== "HEAD") return text(res, 405, "method not allowed");

  if (path === "/" || path === "/rate") {
    try {
      return send(res, 200, "text/html; charset=utf-8", await readFile(join(HARNESS, "rate.html")));
    } catch (e) {
      return text(res, 500, String(e));
    }
  }

  if (path === "/api/pairs") {
    try {
      const { pairs } = await readJson("human", "pairs.json");
      /* orientation is deliberately withheld from the client */
      return json(res, {
        pairs: pairs.map((p) => ({
          pairKey: p.pairKey,
          leftId: p.leftId,
          rightId: p.rightId,
          briefText: BRIEF_TEXT[p.brief],
        })),
      });
    } catch (e) {
      return text(res, 500, String(e));
    }
  }

  if (path === "/api/verdicts") {
    try {
      return json(res, await readJson("human", "verdicts.json"));
    } catch {
      return json(res, {});
    }
  }

  if (path === "/api/results") {
    try {
      return json(res, await computeResults());
    } catch (e) {
      return text(res, 500, String(e));
    }
  }

  if (path.startsWith("/shots/")) {
    const name = decodeURIComponent(path.slice(7));
    if (!SHOT_RE.test(name)) return text(res, 400, "bad name");
    try {
      return send(res, 200, "image/png", await readFile(join(STUDY, "shots", name)));
    } catch {
      return text(res, 404, "no such screenshot");
    }
  }

  if (path === "/harness/mock-api.js") {
    try {
      return send(res, 200, "application/javascript; charset=utf-8", await readFile(join(HARNESS, "mock-api.js")));
    } catch (e) {
      return text(res, 500, String(e));
    }
  }

  if (path.startsWith("/s/")) {
    const id = decodeURIComponent(path.slice(3));
    if (!ID_RE.test(id)) return text(res, 400, "bad id");
    let html;
    try {
      html = await readFile(join(STUDY, "sites", `${id}.html`), "utf8");
    } catch {
      return text(res, 404, "no such site");
    }
    const brief = await briefFor(id);
    const tag = `<script src="/harness/mock-api.js?brief=${encodeURIComponent(brief)}"></script>`;
    return send(res, 200, "text/html; charset=utf-8", inject(html, tag));
  }

  return text(res, 404, "not found");
});

server.listen(PORT, HOST, () => {
  console.log(`listening on http://${HOST}:${PORT}  (rate at http://${HOST}:${PORT}/rate)`);
});
