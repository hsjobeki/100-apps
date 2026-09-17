/* Second verification pass for the contested items.
 * - B6 settings: clicks through every sidebar section before probing, then
 *   opens the delete-account flow and screenshots the confirmation state.
 * - B2 queue: dumps header controls and re-checks retry-all/bulk/ratio claims.
 * - B3 dashboard: dumps the summary region text and per-word presence.
 * Writes ux-study/sealed/marks2.json and /tmp/delete_<id>.png screenshots.
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
const cell = (brief, model) => Object.keys(mapping).filter((i) => mapping[i].brief === brief && mapping[i].model.endsWith(model)).sort();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const out = {};

/* ---------- B6 settings, exhaustive ---------- */
for (const model of ["4-6", "5"]) {
  for (const id of cell("B6", model)) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    let nativeDialog = null;
    page.on("dialog", async (d) => { nativeDialog = { type: d.type(), msg: d.message().slice(0, 160) }; await d.dismiss().catch(() => {}); });
    await page.goto(`${BASE}/${id}?latency=fast&fail=0&seed=7`, { waitUntil: "load", timeout: 45000 });
    await sleep(1200);
    /* click every nav-ish element once to reveal hidden sections, accumulating text */
    const acc = await page.evaluate(async () => {
      const texts = new Set([document.body.innerText]);
      const navs = [...document.querySelectorAll("a, button, [role=tab], [role=button], li")]
        .filter((el) => /profile|preference|notification|project|danger|security|account|billing|advanced|general/i.test(el.innerText || ""))
        .slice(0, 12);
      for (const n of navs) {
        try { n.click(); } catch {}
        await new Promise((r) => setTimeout(r, 350));
        texts.add(document.body.innerText);
      }
      const full = [...texts].join("\n---\n");
      return {
        navLabels: navs.map((n) => (n.innerText || "").trim().slice(0, 30)),
        password: /password/i.test(full) || !!document.querySelector("input[type=password]"),
        billing: /billing|invoice|payment method|manage (plan|subscription)|cancel (plan|subscription)/i.test(full),
        exportData: /export/i.test(full),
        sessions: /\bsessions?\b|sign out (all|other)|log ?out (all|other)|devices/i.test(full),
        toggles: document.querySelectorAll("[role=switch], input[type=checkbox]").length >= 2,
        themeControl: [...document.querySelectorAll("select")].some((s) => /dark|light|system/i.test(s.innerText)) || /theme/i.test(full),
        deleteBtnText: ([...document.querySelectorAll("button, [role=button], a")].find((b) => /delete/i.test(b.innerText || "") && /account/i.test(b.innerText || "")) || {}).innerText || null,
        permanenceAnywhere: /permanent|cannot be undone|irreversib|this will delete/i.test(full),
      };
    });
    /* open the delete flow from wherever it lives and capture the confirmation state */
    const del = await page.evaluate(async () => {
      const find = () => [...document.querySelectorAll("button, [role=button], a")].find((b) => /delete/i.test(b.innerText || "") && /account/i.test(b.innerText || ""));
      let btn = find();
      if (!btn) {
        const danger = [...document.querySelectorAll("a, button, [role=tab], li")].find((el) => /danger/i.test(el.innerText || ""));
        if (danger) { danger.click(); await new Promise((r) => setTimeout(r, 400)); btn = find(); }
      }
      if (!btn) return { deleteBtn: false };
      const inputsBefore = [...document.querySelectorAll("input")].filter((i) => i.offsetParent !== null).length;
      btn.click();
      await new Promise((r) => setTimeout(r, 800));
      const visInputs = [...document.querySelectorAll("input")].filter((i) => i.offsetParent !== null);
      const dlg = document.querySelector("dialog[open], [role=dialog], [role=alertdialog], [class*=modal i]:not([hidden])");
      const scope = dlg || document.body;
      return {
        deleteBtn: true,
        confirmUi: visInputs.length > inputsBefore || !!dlg,
        newInput: visInputs.length > inputsBefore,
        dialogText: (scope.innerText || "").slice(0, 500),
        typeInstruction: /type\b.{0,60}(confirm|delete|below|e-?mail)/is.test(scope.innerText || "") || [...scope.querySelectorAll("input")].some((i) => /delete|confirm|e-?mail/i.test(i.placeholder || "")),
        permanence: /permanent|cannot be undone|irreversib/i.test(scope.innerText || ""),
      };
    });
    await page.screenshot({ path: `/tmp/delete_${id}.png` });
    out[`B6_${model}_${id}`] = { ...acc, ...del, nativeDialog };
    await page.close();
    console.log(`B6 ${model} ${id} done`);
  }
}

/* ---------- B2 queue re-check ---------- */
for (const model of ["4-6", "5"]) {
  for (const id of cell("B2", model)) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${BASE}/${id}?latency=fast&fail=0&seed=7`, { waitUntil: "load", timeout: 45000 });
    await sleep(1500);
    out[`B2_${model}_${id}`] = await page.evaluate(() => {
      const t = document.body.innerText;
      const btns = [...document.querySelectorAll("button, [role=button]")].map((b) => (b.innerText || "").trim().replace(/\s+/g, " ")).filter(Boolean);
      return {
        buttons: [...new Set(btns)].slice(0, 25),
        retryAllFailed: /retry (all|failed)|retry all failed/i.test(btns.join("|")),
        checkboxes: document.querySelectorAll("input[type=checkbox]").length,
        segmentedBar: [...document.querySelectorAll("*")].some((el) => {
          const ch = [...el.children];
          if (ch.length < 2 || ch.length > 10) return false;
          const r = el.getBoundingClientRect();
          if (r.width < 150 || r.height > 24 || r.height < 3) return false;
          const colors = new Set(ch.map((c) => getComputedStyle(c).backgroundColor).filter((c) => c !== "rgba(0, 0, 0, 0)"));
          return colors.size >= 2 && ch.every((c) => c.getBoundingClientRect().height <= 24);
        }),
        hasTextRatio: /\d+ jobs\b/i.test(t),
      };
    });
    await page.close();
    console.log(`B2 ${model} ${id} done`);
  }
}

/* ---------- B3 dashboard re-check ---------- */
for (const model of ["4-6", "5"]) {
  for (const id of cell("B3", model)) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${BASE}/${id}?latency=fast&fail=0&seed=7`, { waitUntil: "load", timeout: 45000 });
    await sleep(1500);
    out[`B3_${model}_${id}`] = await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        head: t.slice(0, 350).replace(/\n+/g, " | "),
        downWord: /\bdown\b/i.test(t), degradedWord: /degraded/i.test(t), healthyWord: /healthy/i.test(t),
        summaryCounts: /\b\d+\s*(\||\n| )?\s*(down|degraded|healthy|unhealthy)\b/i.test(t) || /\b(down|degraded|healthy)\s*(\||\n| )?\s*\d+\b/i.test(t),
        uptime: /uptime/i.test(t), slo: /\bSLO\b|target/i.test(t),
        deltaChars: (t.match(/[\u25b2\u25bc\u2191\u2193\u2206]|[+\-]\d+(\.\d+)?%/g) || []).slice(0, 6),
        pills: [...document.querySelectorAll("button, [role=button], [role=tab]")].map((b) => (b.innerText || "").trim()).filter((x) => /^(1h|6h|24h|7d|30d|live|auto|paused?)$/i.test(x)),
      };
    });
    await page.close();
    console.log(`B3 ${model} ${id} done`);
  }
}

await browser.close();
writeFileSync(join(STUDY, "sealed", "marks2.json"), JSON.stringify(out, null, 2));
console.log("wrote sealed/marks2.json");
