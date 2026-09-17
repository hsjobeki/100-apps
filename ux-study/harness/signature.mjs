/* Extracts per-site design and functional signatures to test whether each model
 * emits one house style per brief rather than three independent samples.
 * Browser only, no model calls. Writes ux-study/sealed/signature.json
 */
import puppeteer from "puppeteer-core";
import { readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HARNESS = dirname(fileURLToPath(import.meta.url));
const STUDY = resolve(HARNESS, "..");
const CHROME = execFileSync("which", ["google-chrome-stable"], { encoding: "utf8" }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ids = readdirSync(join(STUDY, "sites"))
  .filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5)).sort();

/* ---------- page-side ---------- */

function structure() {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity) > 0;
  };
  const txt = (el) => (el.innerText || el.value || "").trim();
  const all = [...document.querySelectorAll("*")];
  const visible = all.filter(vis);

  /* effective page background: body, else the largest painted block */
  const bodyCs = getComputedStyle(document.body);
  let bg = bodyCs.backgroundColor;
  if (bg === "rgba(0, 0, 0, 0)" || bg === "transparent") bg = getComputedStyle(document.documentElement).backgroundColor;

  /* the biggest element whose background differs from the page: the main surface */
  let surface = null, surfaceArea = 0;
  for (const el of visible) {
    const cs = getComputedStyle(el);
    const c = cs.backgroundColor;
    if (c === "rgba(0, 0, 0, 0)" || c === bg) continue;
    const r = el.getBoundingClientRect();
    const a = r.width * r.height;
    if (a > surfaceArea && a < 1440 * 900 * 0.95) { surfaceArea = a; surface = c; }
  }

  const buttons = visible.filter((el) =>
    el.tagName === "BUTTON" || el.getAttribute("role") === "button" ||
    (el.tagName === "INPUT" && (el.type === "submit" || el.type === "button")));

  const stepperish = buttons.filter((el) => {
    const t = txt(el);
    const lab = (el.getAttribute("aria-label") || "") + " " + (el.title || "");
    return /^[-+\u2212\u2013]$/.test(t) || /increment|decrement|increase|decrease|plus|minus|quantity/i.test(lab);
  });

  const removeish = buttons.filter((el) => {
    const t = txt(el) + " " + (el.getAttribute("aria-label") || "") + " " + (el.title || "");
    return /\b(remove|delete|discard|clear|trash|\u00d7|x)\b/i.test(t) && t.length < 40;
  });

  const numberInputs = visible.filter((el) => el.tagName === "INPUT" && el.type === "number");
  const qtyInputs = numberInputs.filter((el) => {
    const hay = [el.name, el.id, el.getAttribute("aria-label"), el.labels?.[0]?.textContent].filter(Boolean).join(" ");
    return /qty|quantity|amount|count/i.test(hay);
  });

  const selects = visible.filter((el) => el.tagName === "SELECT");
  const countrySelect = selects.some((el) => {
    const hay = [el.name, el.id, el.getAttribute("aria-label")].filter(Boolean).join(" ");
    return /country|region/i.test(hay);
  });

  /* radius and shadow of the most prominent button */
  const primary = buttons
    .filter((el) => /\b(pay|submit|order|checkout|process|upload|save|continue|confirm|start|get started|create)\b/i.test(txt(el)))
    .sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return rb.width * rb.height - ra.width * ra.height;
    })[0] ?? buttons[0] ?? null;

  const pcs = primary ? getComputedStyle(primary) : null;

  /* shipping: is a money amount next to the word shipping, and does a country control exist */
  const bodyText = (document.body.innerText || "");
  const shippingLine = (bodyText.match(/shipping[^\n]{0,40}/i) ?? [""])[0];

  return {
    pageBg: bg,
    surfaceBg: surface,
    bodyFont: bodyCs.fontFamily.split(",")[0].replace(/["']/g, "").trim(),
    cssVars: [...document.styleSheets].reduce((n, s) => {
      try { return n + [...s.cssRules].filter((r) => r.cssText && r.cssText.includes("--")).length; }
      catch { return n; }
    }, 0),
    elements: all.length,
    visibleElements: visible.length,
    buttons: buttons.length,
    steppers: stepperish.length,
    removeControls: removeish.length,
    numberInputs: numberInputs.length,
    qtyInputs: qtyInputs.length,
    selects: selects.length,
    countrySelect,
    textInputs: visible.filter((el) => el.tagName === "INPUT" && ["text", "email", "tel", "password", ""].includes(el.type)).length,
    tables: document.querySelectorAll("table").length,
    rows: document.querySelectorAll("tr").length,
    svgs: document.querySelectorAll("svg").length,
    primaryRadius: pcs ? parseFloat(pcs.borderTopLeftRadius) || 0 : null,
    primaryShadow: pcs ? pcs.boxShadow !== "none" : null,
    primaryText: primary ? txt(primary).slice(0, 40) : null,
    maxRadius: Math.max(0, ...visible.map((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0)),
    shippingLine: shippingLine.trim().slice(0, 60),
  };
}

/* fill every visible field so validation stops blocking the submit path */
function fillForm() {
  const VALS = [
    [/mail/i, "alex@example.com"],
    [/(full.?name|^name$|cardholder|holder)/i, "Alex Rivera"],
    [/(address|street|line1)/i, "123 Main St"],
    [/city|town/i, "San Francisco"],
    [/(postal|zip|post.?code)/i, "94107"],
    [/(card.?number|cc.?num|pan)/i, "4242424242424242"],
    [/(expiry|exp|valid)/i, "12/30"],
    [/(cvc|cvv|security)/i, "123"],
    [/(phone|tel|mobile)/i, "+1 415 555 0132"],
  ];
  let n = 0;
  for (const el of document.querySelectorAll("input, textarea, select")) {
    if (el.disabled || el.readOnly) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (el.tagName === "SELECT") {
      const o = [...el.options].find((x) => x.value && !x.disabled);
      if (o) { el.value = o.value; n++; }
    } else if (el.type === "checkbox") { if (!el.checked) { el.checked = true; n++; } }
    else if (el.type === "radio") {
      if (!document.querySelector(`input[type=radio][name="${el.name}"]:checked`)) { el.checked = true; n++; }
    } else if (el.type === "file") {
      try {
        const dt = new DataTransfer();
        dt.items.add(new File(["id,amount\n1,100\n"], "sample.csv", { type: "text/csv" }));
        el.files = dt.files; n++;
      } catch { /* ignore */ }
    } else if (["hidden", "submit", "button"].includes(el.type)) { continue; }
    else if (!el.value) { 
      const hay = [el.name, el.id, el.placeholder, el.getAttribute("autocomplete")].filter(Boolean).join(" ");
      el.value = (VALS.find(([re]) => re.test(hay)) ?? [null, "Alex Rivera"])[1];
      n++;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  return n;
}

function clickPrimary() {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity) > 0;
  };
  const RE = /\b(pay|submit|order|checkout|process|upload|save|continue|confirm|start|run|retry|create|finish|get started|next)\b/i;
  const c = [...document.querySelectorAll("button, input[type=submit], [role=button]")].filter(vis);
  const el = c.find((x) => RE.test(x.innerText || x.value || "")) ?? c.find((x) => x.type === "submit") ?? c[0];
  if (!el) return null;
  el.click();
  return (el.innerText || el.value || "").trim().slice(0, 40);
}

/* error surfaces after a forced failure */
function errors() {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity) > 0;
  };
  const sel = '[role=alert], [aria-invalid="true"], [class*="error" i], [class*="invalid" i], [class*="danger" i], [id*="error" i]';
  const seen = new Set();
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    if (!vis(el)) continue;
    const t = (el.innerText || "").trim().replace(/\s+/g, " ");
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t.slice(0, 200));
  }
  /* also catch reddish visible leaf text not caught by class names */
  for (const el of document.querySelectorAll("*")) {
    if (el.children.length || !vis(el)) continue;
    const cs = getComputedStyle(el);
    const m = cs.color.match(/rgba?\((\d+), (\d+), (\d+)/);
    if (!m) continue;
    const [r, g, b] = [ +m[1], +m[2], +m[3] ];
    if (!(r > 130 && r > g * 1.6 && r > b * 1.6)) continue;
    const t = (el.innerText || "").trim().replace(/\s+/g, " ");
    if (!t || t.length < 8 || seen.has(t)) continue;
    seen.add(t);
    out.push(t.slice(0, 200));
  }
  return out;
}

/* ---------- main ---------- */

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--force-color-profile=srgb", "--font-render-hinting=none", "--hide-scrollbars"],
});

const out = {};
let k = 0;
for (const id of ids) {
  const rec = { id };
  /* structure, clean load */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    try {
      await page.goto(`http://127.0.0.1:8731/s/${id}?latency=fast&fail=0&seed=7`, { waitUntil: "domcontentloaded", timeout: 20000 });
      await sleep(2500);
      Object.assign(rec, await page.evaluate(structure));
    } catch (e) { rec.structureError = String(e).slice(0, 160); }
    await page.close();
  }
  /* forced-failure error surfaces */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    try {
      await page.goto(`http://127.0.0.1:8731/s/${id}?latency=fast&fail=1&seed=7`, { waitUntil: "domcontentloaded", timeout: 20000 });
      await sleep(2000);
      rec.filled = await page.evaluate(fillForm);
      rec.clicked = await page.evaluate(clickPrimary);
      await sleep(3000);
      const errs = await page.evaluate(errors);
      rec.errorCount = errs.length;
      rec.errorChars = errs.reduce((s, x) => s + x.length, 0);
      rec.errorMeanChars = errs.length ? Math.round(rec.errorChars / errs.length) : 0;
      rec.errorSamples = errs.slice(0, 4);
    } catch (e) { rec.errorError = String(e).slice(0, 160); }
    await page.close();
  }
  out[id] = rec;
  console.log(`[${++k}/${ids.length}] ${id} bg=${rec.pageBg} font=${rec.bodyFont} steppers=${rec.steppers} remove=${rec.removeControls} qty=${rec.qtyInputs} errs=${rec.errorCount}/${rec.errorMeanChars}ch`);
}

await browser.close();
writeFileSync(join(STUDY, "sealed", "signature.json"), JSON.stringify(out, null, 2));
console.log("wrote sealed/signature.json");
