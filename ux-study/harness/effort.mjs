/* Extracts the generation effort profile from the final-run subagent transcripts.
 * Splits each generator's output-token budget into thinking, delivered file,
 * and redundant re-writes, and counts the verification work it did.
 * Writes ux-study/sealed/effort.json. No model calls.
 *
 * Only G1_<id>.jsonl and G2_<id>.jsonl are read. The discarded pilot transcripts
 * are named Gen_<id>.jsonl and are deliberately excluded.
 */
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HARNESS = dirname(fileURLToPath(import.meta.url));
const STUDY = resolve(HARNESS, "..");
const SESS = process.argv[2];
if (!SESS) {
  console.error("usage: node effort.mjs <session-transcript-dir>");
  process.exit(2);
}

const mapping = JSON.parse(readFileSync(join(STUDY, "sealed", "mapping.json"), "utf8"));
const CHARS_PER_TOKEN = 3.0; /* code and dense prose; used only for share estimates */

const out = {};
for (const id of Object.keys(mapping)) {
  const cands = [join(SESS, `G1_${id}.jsonl`), join(SESS, `G2_${id}.jsonl`)].filter(existsSync);
  if (cands.length !== 1) throw new Error(`expected exactly one final-run transcript for ${id}, got ${cands.length}`);

  let outTok = 0, thinkCh = 0, textCh = 0;
  const writes = [];
  const hubOps = {};
  const started = [];
  for (const line of readFileSync(cands[0], "utf8").split("\n")) {
    if (!line) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const m = o.message;
    if (!m) continue;
    if (m.usage && typeof m.usage.output === "number") outTok += m.usage.output;
    if (!Array.isArray(m.content)) continue;
    for (const it of m.content) {
      if (!it || typeof it !== "object") continue;
      if (it.type === "thinking") thinkCh += (it.thinking || "").length;
      else if (it.type === "text") textCh += (it.text || "").length;
      else if (it.type === "toolCall") {
        const a = it.arguments || {};
        if (it.name === "write" && typeof a.content === "string") writes.push(a.content.length);
        else if (it.name === "hub") {
          hubOps[a.op] = (hubOps[a.op] || 0) + 1;
          if (a.application) started.push(`${a.application} ${(a.args || []).join(" ")}`.trim());
        }
      }
    }
  }

  const fileBytes = statSync(join(STUDY, "sites", `${id}.html`)).size;
  const writeCh = writes.reduce((s, x) => s + x, 0);
  out[id] = {
    model: mapping[id].model,
    brief: mapping[id].brief,
    outTok,
    thinkCh,
    textCh,
    writeCh,
    nWrites: writes.length,
    writeSizes: writes,
    redundantCh: Math.max(0, writeCh - fileBytes),
    fileBytes,
    hubOps,
    nHub: Object.values(hubOps).reduce((s, x) => s + x, 0),
    processesStarted: started,
    /* share of the output budget, estimated at CHARS_PER_TOKEN */
    thinkShare: outTok ? thinkCh / CHARS_PER_TOKEN / outTok : null,
    redundantShare: outTok ? Math.max(0, writeCh - fileBytes) / CHARS_PER_TOKEN / outTok : null,
  };

  if (outTok !== mapping[id].tokensOut) {
    console.warn(`  warn ${id}: recomputed ${outTok} tokens, mapping says ${mapping[id].tokensOut}`);
  }
}

writeFileSync(join(STUDY, "sealed", "effort.json"), JSON.stringify(out, null, 2));

const models = [...new Set(Object.values(out).map((v) => v.model))].sort();
for (const model of models) {
  const r = Object.values(out).filter((v) => v.model === model);
  const mean = (k) => r.reduce((s, x) => s + x[k], 0) / r.length;
  console.log(
    `${model}: outTok ${mean("outTok").toFixed(0)} | think ${mean("thinkCh").toFixed(0)}ch | ` +
    `writes ${mean("nWrites").toFixed(1)} | redundant ${mean("redundantCh").toFixed(0)}ch | ` +
    `hub ${mean("nHub").toFixed(1)} | file ${mean("fileBytes").toFixed(0)}B`
  );
}
console.log("wrote sealed/effort.json");
