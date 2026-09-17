/* Measures whether the extra code in a site does anything.
 * Per site: dead CSS share, accessible-name coverage on interactive elements,
 * icon-only buttons with no name, focusability, and keyboard reachability.
 * Writes ux-study/sealed/quality.json. No model calls.
 * Usage: node quality.mjs [id ...]
 */
import puppeteer from "puppeteer-core";
import { readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HARNESS = dirname(fileURLToPath(import.meta.url));
const STUDY = resolve(HARNESS, "..");
const BASE = "http://127.0.0.1:8731/s";
const CHROME = execFileSync("which", ["google-chrome-stable"], { encoding: "utf8" }).trim();

const ids = (process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(join(STUDY, "sites")).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5))
).sort();

/* Runs in the page. */
function probe() {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity) > 0;
  };

  /* ---- dead CSS: every author style rule, tested against the live DOM ---- */
  let authored = 0, matched = 0, unmatchable = 0;
  const deadSelectors = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    const walk = (list) => {
      for (const rule of list) {
        if (rule.type === CSSRule.STYLE_RULE) {
          authored++;
          /* strip pseudo-elements and dynamic pseudo-classes so we test the base selector */
          const base = rule.selectorText
            .split(",")
            .map((s) => s.replace(/::?(before|after|placeholder|selection|backdrop|first-line|first-letter|marker)\b/g, "")
                         .replace(/:(hover|focus|focus-visible|focus-within|active|disabled|checked|valid|invalid|target|not\([^)]*\)|is\([^)]*\)|where\([^)]*\)|nth-child\([^)]*\)|nth-of-type\([^)]*\)|first-child|last-child|only-child|empty|root)/g, "")
                         .trim())
            .filter(Boolean)
            .join(",");
          if (!base) { unmatchable++; continue; }
          try {
            if (document.querySelector(base)) matched++;
            else deadSelectors.push(rule.selectorText.slice(0, 80));
          } catch { unmatchable++; }
        } else if (rule.cssRules) walk(rule.cssRules);
      }
    };
    walk(rules);
  }

  /* ---- accessible names on interactive elements ---- */
  const INTERACTIVE = "button, a[href], input, select, textarea, [role=button], [role=link], [role=tab], [role=switch], [role=checkbox]";
  const els = [...document.querySelectorAll(INTERACTIVE)].filter(vis);
  const nameOf = (el) => {
    const al = el.getAttribute("aria-label");
    if (al && al.trim()) return al.trim();
    const alb = el.getAttribute("aria-labelledby");
    if (alb) {
      const t = alb.split(/\s+/).map((i) => document.getElementById(i)?.textContent || "").join(" ").trim();
      if (t) return t;
    }
    if (el.id) {
      const lab = document.querySelector(`label[for="${el.id}"]`);
      if (lab?.textContent.trim()) return lab.textContent.trim();
    }
    if (el.closest("label")?.textContent.trim()) return el.closest("label").textContent.trim();
    const txt = (el.textContent || "").trim();
    if (txt) return txt;
    const ttl = el.getAttribute("title");
    if (ttl && ttl.trim()) return ttl.trim();
    if (el.tagName === "INPUT" && el.placeholder) return `[placeholder] ${el.placeholder}`;
    return "";
  };
  let named = 0, unnamed = 0, iconOnlyUnnamed = 0;
  const unnamedSamples = [];
  for (const el of els) {
    const n = nameOf(el);
    if (n) { named++; continue; }
    unnamed++;
    const hasGraphic = !!el.querySelector("svg, img, i[class], span[class*=icon]");
    if (hasGraphic) iconOnlyUnnamed++;
    if (unnamedSamples.length < 5) unnamedSamples.push(`${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""}`);
  }

  /* ---- form inputs with a programmatic label ---- */
  const inputs = [...document.querySelectorAll("input:not([type=hidden]), select, textarea")].filter(vis);
  let labelled = 0;
  for (const el of inputs) {
    const hasFor = el.id && document.querySelector(`label[for="${el.id}"]`);
    if (hasFor || el.closest("label") || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")) labelled++;
  }

  /* ---- keyboard reachability: focusable share of interactive elements ---- */
  let focusable = 0;
  for (const el of els) {
    const ti = el.getAttribute("tabindex");
    const nativelyFocusable = ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"].includes(el.tagName);
    if ((nativelyFocusable && ti !== "-1") || (ti !== null && ti !== "-1")) focusable++;
  }

  /* ---- live-region and status plumbing, the async-announcement path ---- */
  const liveRegions = document.querySelectorAll("[aria-live], [role=status], [role=alert]").length;
  const busyHooks = document.querySelectorAll("[aria-busy]").length;

  return {
    cssAuthored: authored, cssMatched: matched, cssUnmatchable: unmatchable,
    cssDead: authored - matched - unmatchable, deadSample: deadSelectors.slice(0, 6),
    interactive: els.length, named, unnamed, iconOnlyUnnamed, unnamedSamples,
    inputs: inputs.length, inputsLabelled: labelled,
    focusable, liveRegions, busyHooks,
  };
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb"],
});
const out = {};
for (const [i, id] of ids.entries()) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  try {
    await page.goto(`${BASE}/${id}?latency=fast&fail=0&seed=7`, { waitUntil: "load", timeout: 45000 });
    await new Promise((r) => setTimeout(r, 1200));
    out[id] = await page.evaluate(probe);
    const q = out[id];
    const deadPct = q.cssAuthored ? Math.round((100 * q.cssDead) / q.cssAuthored) : 0;
    const namedPct = q.interactive ? Math.round((100 * q.named) / q.interactive) : 0;
    console.log(`[${i + 1}/${ids.length}] ${id} css ${q.cssMatched}/${q.cssAuthored} dead=${deadPct}% | named ${q.named}/${q.interactive}=${namedPct}% iconOnly=${q.iconOnlyUnnamed} | live=${q.liveRegions}`);
  } catch (e) {
    out[id] = { error: String(e).slice(0, 200) };
    console.log(`[${i + 1}/${ids.length}] ${id} FAIL ${out[id].error}`);
  }
  await page.close();
}
await browser.close();
writeFileSync(join(STUDY, "sealed", "quality.json"), JSON.stringify(out, null, 2));
console.log("wrote sealed/quality.json");
