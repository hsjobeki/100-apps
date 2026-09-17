/* Deterministic metrics for the UX regression study.
 * Launches Chrome once, iterates every site, writes ux-study/metrics/<id>.json
 * and four screenshots per site into ux-study/shots/.
 * Usage: node measure.mjs [id ...]
 */
import puppeteer from "puppeteer-core";
import { readdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HARNESS = dirname(fileURLToPath(import.meta.url));
const STUDY = resolve(HARNESS, "..");
const SHOTS = join(STUDY, "shots");
const METRICS = join(STUDY, "metrics");
const BASE = "http://127.0.0.1:8731/s";
const CHROME = execFileSync("which", ["google-chrome-stable"], { encoding: "utf8" }).trim();

const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 1 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const argIds = process.argv.slice(2);
const ids = (argIds.length
  ? argIds
  : readdirSync(join(STUDY, "sites")).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5))
).sort();

/* ---------- page-side collectors ---------- */

const PRIMARY_SELECTORS =
  "button[type=submit], input[type=submit], form button:not([type=button]), [role=button]";

/* Runs in the page. Returns the word/label/helper/graphical block. */
function collect(viewportName) {
  const visible = (el) => {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return false;
    if (parseFloat(cs.opacity) <= 0) return false;
    return true;
  };
  const wordsOf = (s) => (s || "").match(/\S+/g)?.length ?? 0;
  const vw = innerWidth;
  const vh = innerHeight;

  /* visible words */
  let viewportWords = 0;
  let pageWords = 0;
  const walker = document.createTreeWalker(document.body || document, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (!parent) continue;
    if (parent.closest("script, style, noscript, template")) continue;
    if (!visible(parent)) continue;
    const w = wordsOf(n.nodeValue);
    if (!w) continue;
    pageWords += w;
    const r = parent.getBoundingClientRect();
    if (r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw) viewportWords += w;
  }

  /* labels */
  const labelEls = [...document.querySelectorAll("button, a[role=button], [role=button], input[type=submit]")];
  const labels = labelEls
    .filter(visible)
    .map((el) => {
      const text = el.tagName === "INPUT" ? (el.value || "").trim() : (el.innerText || "").trim();
      return { text: text.slice(0, 120), words: wordsOf(text) };
    })
    .filter((l) => l.words > 0);
  const labelWords = labels.map((l) => l.words);

  /* helper text */
  let helperWords = 0;
  for (const el of document.querySelectorAll("p, small")) {
    if (!visible(el)) continue;
    helperWords += wordsOf(el.innerText);
  }
  let longLeafWords = 0;
  const longLeaves = [];
  for (const el of document.querySelectorAll("*")) {
    if (el.children.length) continue;
    if (el.closest("script, style, noscript, template")) continue;
    if (!visible(el)) continue;
    const w = wordsOf(el.innerText || el.textContent);
    if (w > 12) {
      longLeafWords += w;
      if (longLeaves.length < 20) longLeaves.push((el.innerText || el.textContent).trim().slice(0, 120));
    }
  }

  /* graphical indicators */
  const g = {
    svg: document.querySelectorAll("svg").length,
    canvas: document.querySelectorAll("canvas").length,
    progress: document.querySelectorAll("progress").length,
    meter: document.querySelectorAll("meter").length,
    roleProgressbar: document.querySelectorAll("[role=progressbar]").length,
    badges: 0,
  };
  for (const el of document.querySelectorAll("*")) {
    if (!visible(el)) continue;
    const parent = el.parentElement;
    if (!parent) continue;
    const cs = getComputedStyle(el);
    const ps = getComputedStyle(parent);
    if (cs.backgroundColor === ps.backgroundColor) continue;
    const w = wordsOf(el.innerText);
    if (w < 1 || w > 2) continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height > 8000) continue;
    g.badges++;
  }
  g.total = g.svg + g.canvas + g.progress + g.meter + g.roleProgressbar + g.badges;

  return {
    viewport: viewportName,
    viewportWords,
    pageWords,
    labels: {
      count: labels.length,
      meanWords: labels.length ? Math.round((labelWords.reduce((s, x) => s + x, 0) / labels.length) * 100) / 100 : 0,
      maxWords: labels.length ? Math.max(...labelWords) : 0,
      longLabels: labels.filter((l) => l.words > 3),
    },
    helperWords,
    longLeafWords,
    longLeaves,
    graphical: g,
  };
}

/* Finds the primary action in the page and returns a stable unique path. */
function findPrimary(sel) {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity) > 0;
  };
  let el = [...document.querySelectorAll(sel)].find(visible);
  if (!el) el = [...document.querySelectorAll("button")].find(visible);
  if (!el) return null;
  window.__primary = el;
  return { tag: el.tagName, text: (el.innerText || el.value || "").trim().slice(0, 80) };
}

/* ---------- helpers ---------- */

async function gotoIdle(page, url, budget = 3000) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
  } catch {
    /* keep going, measure whatever rendered */
  }
  await sleep(budget);
}

async function clickPrimary(page) {
  const found = await page.evaluate(findPrimary, PRIMARY_SELECTORS);
  if (!found) return null;
  try {
    await page.evaluate(() => window.__primary.click());
  } catch {
    /* ignore */
  }
  return found;
}

/* ---------- per-site measurement ---------- */

async function measure(browser, id) {
  const out = { id, measuredAt: new Date().toISOString() };
  const url = (q) => `${BASE}/${id}?${q}`;
  const FAST = "latency=fast&fail=0&seed=7";
  const SLOW = "latency=slow&fail=0&seed=7";
  const ERR = "latency=fast&fail=1&seed=7";

  /* --- desktop idle: collectors + screenshot --- */
  {
    const page = await browser.newPage();
    await page.setViewport(DESKTOP);
    await gotoIdle(page, url(FAST));
    out.desktop = await page.evaluate(collect, "desktop");
    await page.screenshot({ path: join(SHOTS, `${id}_idle_desktop.png`) });
    await page.close();
  }

  /* --- mobile idle: collectors + screenshot --- */
  {
    const page = await browser.newPage();
    await page.setViewport(MOBILE);
    await gotoIdle(page, url(FAST));
    out.mobile = await page.evaluate(collect, "mobile");
    await page.screenshot({ path: join(SHOTS, `${id}_idle_mobile.png`) });
    await page.close();
  }

  /* --- duplicate submission + loading screenshot, slow latency --- */
  {
    const page = await browser.newPage();
    await page.setViewport(DESKTOP);
    await gotoIdle(page, url(SLOW), 2000);
    const found = await page.evaluate(findPrimary, PRIMARY_SELECTORS);
    if (!found) {
      out.duplicateSubmission = null;
      out.primaryAction = null;
      await sleep(1000);
      await page.screenshot({ path: join(SHOTS, `${id}_loading_desktop.png`) });
    } else {
      out.primaryAction = found;
      const logBefore = await page.evaluate(() => (window.__apiLog || []).length);
      await page.evaluate(() => window.__primary.click());
      await sleep(100);
      await page.evaluate(() => window.__primary?.click());
      await sleep(100);
      await page.evaluate(() => window.__primary?.click());
      await sleep(800);
      await page.screenshot({ path: join(SHOTS, `${id}_loading_desktop.png`) });
      await sleep(700);
      const counts = await page.evaluate((from) => {
        const skip = new Set(["getJob", "listJobs", "getUser", "getMetrics"]);
        const tally = {};
        for (const e of (window.__apiLog || []).slice(from)) {
          if (skip.has(e.method)) continue;
          tally[e.method] = (tally[e.method] || 0) + 1;
        }
        return tally;
      }, logBefore);
      const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      out.duplicateSubmission = entries.length ? { method: entries[0][0], calls: entries[0][1] } : null;
      out.apiTally = counts;
    }
    await page.close();
  }

  /* --- error screenshot + console/pageerror sequence --- */
  {
    const page = await browser.newPage();
    await page.setViewport(DESKTOP);
    const consoleErrors = [];
    const uncaught = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
    });
    page.on("pageerror", (e) => uncaught.push(String(e.message ?? e).slice(0, 300)));

    await gotoIdle(page, url(FAST));
    await clickPrimary(page);
    await sleep(2000);

    await gotoIdle(page, url(ERR), 2000);
    await clickPrimary(page);
    await sleep(1500);
    await page.screenshot({ path: join(SHOTS, `${id}_error_desktop.png`) });
    await sleep(500);

    out.consoleErrors = consoleErrors.length;
    out.consoleErrorMessages = consoleErrors.slice(0, 5);
    out.uncaughtExceptions = uncaught.length;
    out.uncaughtExceptionMessages = uncaught.slice(0, 5);
    await page.close();
  }

  /* --- layout vector from the desktop idle screenshot --- */
  {
    const shot = join(SHOTS, `${id}_idle_desktop.png`);
    const b64 = readFileSync(shot).toString("base64");
    const page = await browser.newPage();
    await page.goto("about:blank");
    out.layoutVector = await page.evaluate(async (data) => {
      const img = new Image();
      img.src = "data:image/png;base64," + data;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = 16;
      c.height = 16;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, 16, 16);
      const px = ctx.getImageData(0, 0, 16, 16).data;
      const v = [];
      for (let i = 0; i < px.length; i += 4) {
        v.push(Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]));
      }
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      return v.map((x) => x / norm);
    }, b64);
    await page.close();
  }

  /* --- screenshot bookkeeping --- */
  out.shots = {};
  for (const state of ["idle_desktop", "loading_desktop", "error_desktop", "idle_mobile"]) {
    const p = join(SHOTS, `${id}_${state}.png`);
    out.shots[state] = existsSync(p) ? { path: p, bytes: readFileSync(p).length } : null;
  }

  return out;
}

/* ---------- main ---------- */

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--force-color-profile=srgb", "--font-render-hinting=none", "--hide-scrollbars"],
});

let n = 0;
for (const id of ids) {
  const t0 = Date.now();
  try {
    const m = await measure(browser, id);
    writeFileSync(join(METRICS, `${id}.json`), JSON.stringify(m, null, 2));
    n++;
    console.log(`[${n}/${ids.length}] ${id} ${Math.round((Date.now() - t0) / 1000)}s words=${m.desktop.viewportWords} g=${m.desktop.graphical.total} dup=${m.duplicateSubmission ? m.duplicateSubmission.calls : "null"} errs=${m.consoleErrors}/${m.uncaughtExceptions}`);
  } catch (e) {
    console.log(`[FAIL] ${id}: ${String(e).slice(0, 300)}`);
  }
}

await browser.close();
console.log(`done: ${n}/${ids.length}`);
