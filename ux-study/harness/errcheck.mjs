/* Loads every site once and records uncaught page errors.
 * Used before and after the blinding pass to detect replacements that broke a page.
 * Usage: node errcheck.mjs <out.json>
 */
import puppeteer from "puppeteer-core";
import { readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HARNESS = dirname(fileURLToPath(import.meta.url));
const STUDY = resolve(HARNESS, "..");
const OUT = process.argv[2] ?? join(STUDY, "sealed", "errcheck.json");
const CHROME = execFileSync("which", ["google-chrome-stable"], { encoding: "utf8" }).trim();

const ids = readdirSync(join(STUDY, "sites"))
  .filter((f) => f.endsWith(".html"))
  .map((f) => f.slice(0, -5))
  .sort();

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--force-color-profile=srgb", "--font-render-hinting=none", "--hide-scrollbars"],
});

const result = {};
for (const id of ids) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message ?? e).slice(0, 300)));
  try {
    await page.goto(`http://127.0.0.1:8731/s/${id}?latency=fast&fail=0&seed=7`, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    await new Promise((r) => setTimeout(r, 2500));
    const shape = await page.evaluate(() => ({
      hasBody: !!document.body,
      nodes: document.querySelectorAll("*").length,
      text: (document.body?.innerText ?? "").trim().length,
    }));
    result[id] = { errors: errs.length, messages: errs.slice(0, 5), ...shape };
  } catch (e) {
    result[id] = { errors: errs.length, messages: errs.slice(0, 5), loadError: String(e).slice(0, 200) };
  }
  await page.close();
}

await browser.close();
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(`wrote ${OUT} for ${ids.length} sites`);
