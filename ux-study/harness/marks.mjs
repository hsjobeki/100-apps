/* Verifies every has/missing claim of the blogpost feature lists against
 * BOTH models' apps, in a real browser, with interaction where the claim
 * is behavioural. Writes ux-study/sealed/marks.json and prints the tally.
 * Usage: node marks.mjs
 */
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HARNESS = dirname(fileURLToPath(import.meta.url));
const STUDY = resolve(HARNESS, "..");
const BASE = "http://127.0.0.1:8731/s";
const CHROME = execFileSync("which", ["google-chrome-stable"], { encoding: "utf8" }).trim();
const mapping = JSON.parse(readFileSync(join(STUDY, "sealed", "mapping.json"), "utf8"));

const CELLS = {};
for (const [id, m] of Object.entries(mapping)) {
  if (!["B1", "B2", "B3", "B6"].includes(m.brief)) continue;
  const key = `${m.brief}_${m.model.endsWith("5") ? "B" : "A"}`;
  (CELLS[key] ??= []).push(id);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- page-side probe helpers, serialised into every evaluate ---------- */
const HELPERS = `
  const vis = (el) => { if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el); return cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity) > 0; };
  const all = (sel) => [...document.querySelectorAll(sel)].filter(vis);
  const bodyText = document.body.innerText;
  const hasText = (re) => re.test(bodyText);
  const clickables = all("button, [role=button], a, [role=tab], [role=menuitem], summary, label");
  const clickText = (re) => clickables.filter((el) => re.test(el.innerText || el.getAttribute("aria-label") || ""));
  const inputs = all("input, select, textarea");
  const progressEls = all("progress, [role=progressbar], [class*=progress i]");
`;

async function probe(page, code) {
  return page.evaluate(`(() => { ${HELPERS}\n${code} })()`);
}

/* ---------- per-brief probes ---------- */

async function probeB1(page, url) {
  await page.goto(url, { waitUntil: "load", timeout: 45000 });
  await sleep(1500);
  const idle = await probe(page, `
    const procBtns = clickText(/process|upload|start|convert|run/i).filter((el) => el.tagName === "BUTTON" || el.getAttribute("role") === "button");
    const tabWords = clickables.map((el) => (el.innerText || "").trim()).filter((t) => /^(All|Active|Failed|Done|Running|Queued|Succeeded|Completed|Processing)\\s*\\(?\\d+\\)?$/s.test(t.replace(/\\n/g, " ")));
    return {
      dropzone: all("input[type=file]").length > 0 || hasText(/drop .{0,20}(csv|file)|drag/i),
      processBtnFound: procBtns.length > 0,
      processDisabledIdle: procBtns.length > 0 && procBtns.every((b) => b.disabled || b.getAttribute("aria-disabled") === "true"),
      tabsWithCounts: new Set(tabWords).size >= 2,
      progressBars: progressEls.length >= 1,
      cancelBtn: clickText(/^\\s*cancel/i).length > 0,
      retryBtn: clickText(/retry/i).length > 0,
      errorSpecific: hasText(/out of memory|timeout after|invalid utf|unsupported/i),
      rowCounts: hasText(/\\d[\\d,]*\\s*rows/i),
      downloadBtn: clickText(/download/i).length > 0,
      search: inputs.some((i) => i.type === "search" || /search|find|filter/i.test(i.placeholder || "")),
      pagination: clickText(/next|prev|newer|older|load more|page \\d/i).length > 0 || hasText(/page \\d+ of/i),
      limitsText: hasText(/\\bMB\\b|max(imum)? .{0,20}size|only .{0,10}\\.?csv|\\.csv (file|up to)/i),
    };
  `);
  /* inject a CSV via the file input AND a drop event, then look for a preview */
  const after = await page.evaluate(async () => {
    const mk = () => {
      const dt = new DataTransfer();
      dt.items.add(new File(["name,age\nzz_alice_zz,30\nzz_bob_zz,31\n"], "probe.csv", { type: "text/csv" }));
      return dt;
    };
    const inp = document.querySelector("input[type=file]");
    if (inp) {
      inp.files = mk().files;
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const zones = [...document.querySelectorAll("*")].filter((el) => /drop .{0,20}(csv|file)|drag/i.test(el.textContent || "") && el.children.length < 8).slice(0, 3);
    for (const z of zones) {
      try { z.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: mk() })); } catch {}
    }
    await new Promise((r) => setTimeout(r, 1200));
    const procBtns = [...document.querySelectorAll("button, [role=button]")].filter((el) => /process|upload|start|convert|run/i.test(el.innerText || ""));
    return {
      fileAccepted: /probe\.csv/i.test(document.body.innerText),
      previewBeforeProcess: /zz_alice_zz|zz_bob_zz/.test(document.body.innerText),
      processEnabledAfterFile: procBtns.some((b) => !b.disabled && b.getAttribute("aria-disabled") !== "true"),
    };
  });
  /* run the processing and look for a validation report */
  let validation = { validationReport: false, processed: false };
  try {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button, [role=button]")].find((el) => /process|upload|start|convert|run/i.test(el.innerText || "") && !el.disabled);
      if (b) b.click();
    });
    for (let i = 0; i < 16 && !validation.validationReport; i++) {
      await sleep(500);
      validation = await page.evaluate(() => ({
        validationReport: /skipped|malformed|invalid row|rows? (dropped|rejected|failed validation)/i.test(document.body.innerText),
        processed: /succeeded|done|complete/i.test(document.body.innerText),
      }));
    }
  } catch {}
  return { ...idle, ...after, ...validation };
}

async function probeB2(page, url) {
  await page.goto(url, { waitUntil: "load", timeout: 45000 });
  await sleep(1500);
  return probe(page, `
    const tileWords = ["Failed", "Running", "Queued", "Succeeded"];
    const tiles = tileWords.filter((w) => new RegExp(w + "\\\\s*\\\\n?\\\\s*\\\\d+", "i").test(bodyText) || new RegExp("\\\\d+\\\\s*\\\\n?\\\\s*" + w, "i").test(bodyText)).length;
    const seg = all("div, span").some((el) => {
      const ch = [...el.children];
      if (ch.length < 2 || ch.length > 8) return false;
      const rects = ch.map((c) => c.getBoundingClientRect());
      if (!rects.every((r) => r.height > 2 && r.height <= 16 && r.width > 4)) return false;
      const colors = new Set(ch.map((c) => getComputedStyle(c).backgroundColor));
      colors.delete("rgba(0, 0, 0, 0)");
      return colors.size >= 2 && el.getBoundingClientRect().width > 180;
    });
    return {
      statTiles: tiles >= 3,
      ratioBar: seg,
      tabFilters: clickables.filter((el) => /^(All|Failed|Running|Queued|Succeeded)\\s*\\(?\\d*\\)?$/s.test((el.innerText || "").trim().replace(/\\n/g, " "))).length >= 2,
      search: inputs.some((i) => i.type === "search" || /search|find/i.test(i.placeholder || "")),
      bulkCheckboxes: all("input[type=checkbox]").length >= 4,
      retryFailedBtn: clickText(/retry (all|failed)/i).length > 0,
      pauseBtn: clickText(/pause|resume/i).length > 0,
      refreshBtn: clickText(/refresh|reload/i).length > 0,
      perRowProgress: progressEls.length >= 3,
      errorSpecific: hasText(/out of memory|timeout after/i),
      downloadLinks: clickText(/download/i).length > 0,
      logs: clickText(/\\blogs?\\b/i).length > 0 || hasText(/view logs?|show logs?/i),
      retrySemantics: hasText(/attempt \\d|max(imum)? (retries|attempts)|dead.?letter|retr(y|ied) \\d+ of/i),
      depthOverTime: hasText(/throughput|jobs?\\s*(\\/|per)\\s*(min|sec|hour)|queue depth/i),
      pagination: clickText(/next|prev|newer|older|load more|page \\d/i).length > 0 || hasText(/page \\d+ of/i),
    };
  `);
}

async function probeB3(page, url) {
  await page.goto(url, { waitUntil: "load", timeout: 45000 });
  await sleep(1500);
  return probe(page, `
    const anchors = all("a[href]").filter((a) => { const h = a.getAttribute("href"); return h && h !== "#" && !h.startsWith("javascript"); });
    return {
      statusBanner: hasText(/\\d+ (down|degraded|unhealthy)|all (systems|services) (operational|healthy)/i),
      sparklineCards: all("svg").filter((s) => s.querySelector("path, polyline")).length >= 4,
      uptimeSLO: hasText(/uptime/i) && hasText(/SLO|target/i),
      trendDeltas: /[\\u25b2\\u25bc\\u2191\\u2193]|[+\\-]\\s?\\d+(\\.\\d+)?\\s?%/.test(bodyText),
      rangePills: clickText(/^\\s*(1h|24h|7d|30d)\\s*$/i).length >= 2,
      liveToggle: clickText(/^\\s*(live|auto|paused?)\\s*$/i).length > 0,
      anyLinksOut: anchors.length > 0,
      deployMarkers: hasText(/deploy|release|rolled out/i),
      ackMute: clickText(/acknowledge|\\back\\b|mute|silence|snooze/i).length > 0,
      incidents: hasText(/incident|outage history|past (outages|incidents)/i),
      escalation: hasText(/escalat|pager|page (the )?on.?call|on.?call/i),
    };
  `);
}

async function probeB6(page, url) {
  await page.goto(url, { waitUntil: "load", timeout: 45000 });
  await sleep(1500);
  let nativeDialog = null;
  const onDialog = async (d) => { nativeDialog = { type: d.type(), msg: d.message().slice(0, 120) }; await d.dismiss().catch(() => {}); };
  page.on("dialog", onDialog);
  const base = await probe(page, `
    const avatar = all("div, span").some((el) => /^[A-Z]{2}$/.test((el.textContent || "").trim()) && el.children.length === 0 && el.getBoundingClientRect().width < 90);
    return {
      planBadge: hasText(/\\b(pro|free|team|premium) plan\\b/i),
      avatar,
      nameEmailSave: inputs.some((i) => (i.value || "").includes("@")) && clickText(/save/i).length > 0,
      toggles: (all("[role=switch]").length + all("input[type=checkbox]").length) >= 2,
      themeControl: all("select").some((s) => /dark|light|system/i.test(s.innerText)) || clickText(/^\\s*(dark|light|system)\\s*$/i).length >= 2,
      projectsList: hasText(/project/i) && clickText(/delete|remove/i).length >= 2,
      dangerZone: hasText(/danger zone|danger/i),
      permanenceWarning: hasText(/permanent|cannot be undone|irreversib|this will delete/i),
      passwordSection: hasText(/password/i) || all("input[type=password]").length > 0,
      billing: hasText(/billing|invoice|payment method|manage (plan|subscription)|cancel (plan|subscription)|upgrade|downgrade/i),
      exportData: hasText(/export/i),
      sessions: hasText(/\\bsessions?\\b|sign out (all|other)|log ?out (all|other)|devices/i),
    };
  `);
  /* change the email and save: does anything mention verification? */
  const emailVerify = await page.evaluate(async () => {
    const inp = [...document.querySelectorAll("input")].find((i) => (i.value || "").includes("@"));
    if (!inp) return { emailChanged: false, verificationMentioned: false };
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(inp, "probe-new-mail@example.com");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    const save = [...document.querySelectorAll("button, [role=button]")].find((b) => /save/i.test(b.innerText || ""));
    if (save) save.click();
    await new Promise((r) => setTimeout(r, 1500));
    return {
      emailChanged: true,
      verificationMentioned: /verif|confirm(ation)? (e-?mail|link)|sent .{0,30}(link|mail)|check your (inbox|e-?mail)/i.test(document.body.innerText),
    };
  });
  /* click the delete-account button: what kind of confirmation appears? */
  const del = await page.evaluate(async () => {
    const before = [...document.querySelectorAll("input")].filter((i) => i.offsetParent !== null).length;
    const btn = [...document.querySelectorAll("button, [role=button]")].find((b) => /delete (my )?account/i.test(b.innerText || ""));
    if (!btn) return { deleteBtn: false };
    btn.click();
    await new Promise((r) => setTimeout(r, 700));
    const after = [...document.querySelectorAll("input")].filter((i) => i.offsetParent !== null);
    const typeInstruction = /type .{0,40}(to confirm|below|delete|your (e-?mail|address))|to confirm, type/i.test(document.body.innerText);
    return {
      deleteBtn: true,
      confirmUiAppeared: after.length > before || !!document.querySelector("dialog[open], [role=dialog], [role=alertdialog], [class*=modal i]:not([hidden])"),
      typeToConfirm: typeInstruction && after.length > before,
      permanenceInDialog: /permanent|cannot be undone|irreversib/i.test(document.body.innerText),
    };
  });
  page.off("dialog", onDialog);
  return { ...base, ...emailVerify, ...del, nativeDialog };
}

/* ---------- run ---------- */
const PROBES = { B1: probeB1, B2: probeB2, B3: probeB3, B6: probeB6 };
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const out = {};
for (const [key, ids] of Object.entries(CELLS)) {
  const brief = key.split("_")[0];
  for (const id of ids.sort()) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    try {
      out[`${key}_${id}`] = await PROBES[brief](page, `${BASE}/${id}?latency=fast&fail=0&seed=7`);
    } catch (e) {
      out[`${key}_${id}`] = { error: String(e).slice(0, 160) };
    }
    await page.close();
    console.log(`${key} ${id} done`);
  }
}
await browser.close();
writeFileSync(join(STUDY, "sealed", "marks.json"), JSON.stringify(out, null, 2));

/* ---------- tally ---------- */
for (const brief of ["B1", "B2", "B3", "B6"]) {
  console.log(`\n=== ${brief}`);
  const aKeys = Object.keys(out).filter((k) => k.startsWith(`${brief}_A`));
  const bKeys = Object.keys(out).filter((k) => k.startsWith(`${brief}_B`));
  const items = new Set(aKeys.concat(bKeys).flatMap((k) => Object.keys(out[k]).filter((x) => typeof out[k][x] === "boolean")));
  for (const item of [...items].sort()) {
    const na = aKeys.filter((k) => out[k][item]).length;
    const nb = bKeys.filter((k) => out[k][item]).length;
    const mark = nb >= 2 && na >= 2 ? "*" : nb >= 2 ? "5" : na >= 2 ? "4.6" : "-";
    console.log(`  ${item.padEnd(26)} A ${na}/3  B ${nb}/3   (${mark})`);
  }
}
console.log("\nwrote sealed/marks.json");
