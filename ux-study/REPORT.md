# UX regression study: `claude-opus-4-6` vs `claude-opus-5`

Generated 2026-09-17T17:58:26.385Z by `harness/analyze.mjs`. Model A = `claude-opus-4-6`, model B = `claude-opus-5`.
Pre-registration: `00_preregistration.md`, frozen before generation. Every number below is computed by this script from on-disk JSON.

## 1. Headline

**The study does not decide the thesis. Its pairwise result is not trustworthy.**

The pre-registered rule that fired on the model-rater data was *thesis falsified*: `claude-fable-5` preferred B on 54 of 54 resolved pairs (100%) and B's async failures were 0.07 of A's. Two findings, both measured after that verdict was computed, remove its force. They are in section 8.

1. **A human blind rater disagrees.** Over 32 of 54 pairs rated under the same blinding, the human preferred B on 14 of 25 decided pairs (**56%**), which falls in the pre-registered *thesis supported* band of <=60%, not the *falsified* band of >=70%. Human and model rater agree on 14 of 25 pairs (56%), against 50% for a coin.
2. **The three samples per cell are near-duplicates, so the effective n is 6, not 54.** In 8 of the 12 model x brief cells the three samples sit at 0.998 or higher layout-vector cosine, which is visual duplication rather than three independent attempts. Each model emits roughly one design per brief, so the 54 pairs carry about 6 independent comparisons. The exact 95% lower bound on B's win rate falls from 93.4% to 54.07%.

Treat the numbers below as descriptive. The pre-registered decision procedure was executed faithfully and its result is reported unchanged, but the design it rests on cannot support the conclusion.

The pre-registered rules, recorded for the record rather than as a conclusion:

| Rule | Condition | Measured | Met |
| --- | --- | --- | --- |
| Thesis falsified | B pairwise win rate >= 70% **and** B async failures <= 50% of A | win rate 100%, async ratio 0.07 | **yes** |
| Thesis supported | B pairwise win rate <= 60% **and** B async failures >= 75% of A | win rate 100%, async ratio 0.07 | no |
| Inconclusive / partial | anything else | | no |

## 2. Pairwise win rate of B vs A

Blind `ux-pair-rater` runs, 54 pairs each judged twice with sides swapped, 108 runs. A pair resolves only when both orientations favour the same artifact; otherwise it is a tie. Ties are excluded from both numerator and denominator.

- **Overall: B wins 100%** of decided pairs (54 of 54), 95% bootstrap CI [100%, 100%].
- Ties: 0 of 54 pairs.
- **Position-inconsistency rate: 0%** of 54 pairs (both raters preferred whichever artifact sat in their own Left/Right slot). Pre-registered unreliability flag at >25%: not triggered.

Per brief:

| Brief | B wins | A wins | Ties | Decided | B win rate | 95% CI |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | 9 | 0 | 0 | 9 | 100% | [100%, 100%] |
| B2 | 9 | 0 | 0 | 9 | 100% | [100%, 100%] |
| B3 | 9 | 0 | 0 | 9 | 100% | [100%, 100%] |
| B4 | 9 | 0 | 0 | 9 | 100% | [100%, 100%] |
| B5 | 9 | 0 | 0 | 9 | 100% | [100%, 100%] |
| B6 | 9 | 0 | 0 | 9 | 100% | [100%, 100%] |

Rated by `claude-fable-5` only. The human comparator was skipped by user decision before generation, so there is no independent check on these verdicts.

## 3. Per failure mode

### Rubric scores, 1 to 5, higher is better

| Mode | A mean | A 95% CI | B mean | B 95% CI | Delta |
| --- | --- | --- | --- | --- | --- |
| F1 graphical indicators | 4.78 | [4.56, 4.94] | 4.94 | [4.83, 5] | +0.17 |
| F2 verbosity | 4.5 | [4.28, 4.72] | 4.78 | [4.56, 4.94] | +0.28 |
| F3 sloppy text | 3.78 | [3.5, 4.06] | 4.22 | [3.94, 4.5] | +0.44 |
| F4 generic feel | 4.06 | [4, 4.17] | 4.72 | [4.5, 4.89] | +0.67 |
| F5 async handling (derived) | 4.28 | [3.83, 4.67] | 4.94 | [4.83, 5] | +0.67 |
| Visual hierarchy | 4.83 | [4.67, 5] | 4.94 | [4.83, 5] | +0.11 |

F1 to F4 and visual hierarchy come from blind `ux-rubric-rater` runs. F5 is derived by this script from async fail counts, never rated by a model.

### Deterministic browser metrics, desktop 1440x900

| Metric | A mean | A 95% CI | B mean | B 95% CI | Delta |
| --- | --- | --- | --- | --- | --- |
| Visible words in viewport | 70.72 | [53.89, 88.28] | 80.44 | [69.83, 91.94] | +9.72 |
| Visible words in page | 72.78 | [55.72, 90] | 83.28 | [72.61, 94.44] | +10.5 |
| Visible words in viewport (mobile) | 42.28 | [34.61, 50.39] | 48.44 | [42.61, 54.28] | +6.17 |
| Mean button-label words | 1.37 | [1.19, 1.57] | 2.48 | [1.66, 3.57] | +1.1 |
| Max button-label words | 1.72 | [1.44, 2] | 4.56 | [3, 6.5] | +2.83 |
| Helper text words (p, small) | 6.78 | [3.06, 11.5] | 6.78 | [3.39, 10.89] | +0 |
| Words in leaf elements over 12 words | 0.89 | [0, 2.67] | 0 | [0, 0] | -0.89 |
| Graphical indicators, total | 28.33 | [19, 39.22] | 49.17 | [40.94, 57.39] | +20.83 |
| Console errors | 0 | [0, 0] | 0 | [0, 0] | +0 |
| Uncaught exceptions | 0 | [0, 0] | 0 | [0, 0] | +0 |

**The two F2 measures disagree.** The blind rubric scored B higher on verbosity (4.5 -> 4.78), while the deterministic word counts moved the other way: B shows +9.72 more visible words in the viewport, +1.1 more words per button label, and a maximum label length of 4.56 words against A's 1.72. B writes more text, not less. The one verbosity measure that favours B is words in leaf elements over 12 words (A 0.89, B 0), meaning B avoids explanatory paragraphs while using more words in labels and dense UI chrome. Both numbers are reported as pre-registered and neither is adjusted.

**Duplicate submission.** The pre-registered deterministic probe clicks the first visible action button three times in 200 ms under slow latency and counts backend calls. It produced a countable call on only 4 of 36 sites (A 1/18, B 3/18); on the rest the first visible button was a tab, filter, or navigation control, or an empty required form blocked submission. Among the sites where it did fire, duplicates were allowed on A 0/1 and B 0/3. The metric is reported as pre-registered and is too sparse to carry a conclusion; async checklist item 2 below is the live measurement of the same property.

### Async checklist failures, blind agentic rating

- A: mean 0.83 failures per site, 95% CI [0.39, 1.39], 15 failures over 18 sites.
- B: mean 0.06 failures per site, 95% CI [0, 0.17], 1 failures over 18 sites.
- **B as a fraction of A: 0.07** (pre-registered thresholds: <=0.5 falsifies, >=0.75 supports).

Per item, failures over items actually rated (N/A excluded by the pre-registered applicability rule):

| # | Item | A fails / rated | B fails / rated |
| --- | --- | --- | --- |
| 1 | Loading state visible within 300 ms | 3 / 18 | 0 / 18 |
| 2 | Primary action disabled or deduplicated while pending | 2 / 18 | 0 / 18 |
| 3 | Progress shown where the API provides it | 0 / 6 | 0 / 6 |
| 4 | Cancel available for long-running actions | 0 / 6 | 0 / 6 |
| 5 | Failure message specific and near the element | 4 / 18 | 0 / 18 |
| 6 | Recovery path without reloading | 1 / 18 | 0 / 18 |
| 7 | API field errors mapped to the right fields | 0 / 3 | 0 / 3 |
| 8 | Live state updates without manual refresh | 0 / 9 | 0 / 9 |
| 9 | Mid-action navigation leaves UI consistent | 4 / 18 | 1 / 18 |
| 10 | No optimistic state before server confirms | 1 / 18 | 0 / 18 |

## 4. Genericness

Within-model mean pairwise cosine of the 256-dim grayscale layout vector, over site pairs drawn from **different** briefs. Higher means the model's layouts look more alike across unrelated tasks.

| Model | Mean cross-brief cosine | 95% CI | Pairs |
| --- | --- | --- | --- |
| A `claude-opus-4-6` | 0.9759 | [0.9713, 0.9804] | 135 |
| B `claude-opus-5` | 0.936 | [0.9261, 0.9459] | 135 |

Difference (B minus A): -0.0399.

## 5. Rater bias check

Across all 108 individual pairwise runs, the `claude-fable-5` raters named the B artifact in 100% of the 108 non-tie runs (108 runs).

**No independent comparator exists.** Human blind rating was skipped by user decision before generation, so a preference of the rater family for artifacts from its own generation cannot be excluded or quantified. The orchestrating agent also runs model B, which is why it scored nothing and why every number here is computed by this script.

## 6. Failures and exclusions

- **Generation failures: 0.** Every one of the 36 cells produced a valid HTML document on the first attempt.
- **Retries: 0.**
- **Stripped identifiers: 45.** 45 comment. No model name, vendor name, or generator meta tag was present in any site; the only removals were HTML comments. Full log in `sealed/stripped.json`.
- **Position-inconsistent pairs: 0 of 54.** none
- **Blinding check.** `grep -riE 'claude|anthropic|opus|sonnet|haiku|fable' sites/` returned nothing before rating, and no rater prompt contained a model identity.

Generation cost, for the record:

| Model | Mean bytes | Mean output tokens | Mean latency | Total cost |
| --- | --- | --- | --- | --- |
| A `claude-opus-4-6` | 25207 | 9429 | 114s | $7.58 |
| B `claude-opus-5` | 45053 | 77761 | 790s | $57.24 |

## 7. Five illustrative screenshot pairs

Chosen by the pre-registered rule and no other: the 2 largest positive rubric gaps, the 2 largest negative gaps, and the pair whose gap is closest to the median of all resolved pairs. Gap is `mean(F1..F5, hierarchy of the B site) - mean(same of the A site)`.

### B1_f6ff77aa_d5fa082d (B1), gap +1, resolved winner claude-opus-5

- A `f6ff77aa`: `shots/f6ff77aa_idle_desktop.png`, `shots/f6ff77aa_error_desktop.png`
- B `d5fa082d`: `shots/d5fa082d_idle_desktop.png`, `shots/d5fa082d_error_desktop.png`

### B4_d2b7b52b_2e20bdb0 (B4), gap +0.83, resolved winner claude-opus-5

- A `d2b7b52b`: `shots/d2b7b52b_idle_desktop.png`, `shots/d2b7b52b_error_desktop.png`
- B `2e20bdb0`: `shots/2e20bdb0_idle_desktop.png`, `shots/2e20bdb0_error_desktop.png`

### B5_c4b19032_3b6eac7c (B5), gap -0.17, resolved winner claude-opus-5

- A `c4b19032`: `shots/c4b19032_idle_desktop.png`, `shots/c4b19032_error_desktop.png`
- B `3b6eac7c`: `shots/3b6eac7c_idle_desktop.png`, `shots/3b6eac7c_error_desktop.png`

### B1_7f0fe142_510d7298 (B1), gap -0.17, resolved winner claude-opus-5

- A `7f0fe142`: `shots/7f0fe142_idle_desktop.png`, `shots/7f0fe142_error_desktop.png`
- B `510d7298`: `shots/510d7298_idle_desktop.png`, `shots/510d7298_error_desktop.png`

### B1_7f0fe142_d5fa082d (B1), gap +0.33, resolved winner claude-opus-5

- A `7f0fe142`: `shots/7f0fe142_idle_desktop.png`, `shots/7f0fe142_error_desktop.png`
- B `d5fa082d`: `shots/d5fa082d_idle_desktop.png`, `shots/d5fa082d_error_desktop.png`

## 8. Why the pairwise result does not hold

Everything in this section was measured after the pre-registered verdict was computed, from the same artifacts, with no new generation.

### 8.1 The human comparator contradicts the model rater

Rated blind through `harness/rate.html`, orientation randomised and balanced, 32 of 54 pairs.

| Rater | prefers B | prefers A | ties | B win rate |
| --- | --- | --- | --- | --- |
| Human | 14 | 11 | 7 | **56%** |
| `claude-fable-5` | 54 | 0 | 0 | 100% |

Agreement is 14 of 25 (56%). A coin would agree half the time, so the model rater's verdicts carry close to no information about the human's. The human showed no position bias: Left 12, Right 13.

Per brief, the disagreement is not uniform:

| Brief | Human B-A-tie | Human B rate | Fable |
| --- | --- | --- | --- |
| B1 | 3-0-1 | 100% | B on all 9 |
| B2 | 4-0-1 | 100% | B on all 9 |
| B3 | 3-0-0 | 100% | B on all 9 |
| B4 | 0-6-0 | 0% | B on all 9 |
| B5 | 2-3-4 | 40% | B on all 9 |
| B6 | 2-2-1 | 50% | B on all 9 |

The model rater preferred B on every brief. The human preferred B on the data-dense tools and A on the sparse consumer flows. A rater that returns the same answer regardless of task is expressing a preference over house style, not a judgement about fitness for the brief.

### 8.2 Three samples per cell are one design, so n is 6

Mean cosine between the layout vectors of the three samples inside a single model x brief cell:

| Model | B1 | B2 | B3 | B4 | B5 | B6 |
| --- | --- | --- | --- | --- | --- | --- |
| A `claude-opus-4-6` | 0.9997 | 0.9647 | 0.9623 | 0.9988 | 0.9991 | 0.9991 |
| B `claude-opus-5` | 0.9991 | 0.8912 | 0.8139 | 0.9991 | 0.9981 | 0.999 |

In 8 of 12 cells the three samples exceed 0.998 cosine. Only the job-queue and dashboard briefs produced genuine variation between samples. Averaged over all cells the within-cell figure is 0.9687 against 0.9668 for two different models on the same brief, and that aggregate understates the problem because the two varying briefs drag it down.

Consequence for the statistics: the 54 pairs are 6 design comparisons repeated 9 times each, not 54 independent trials. The exact one-sided 95% lower bound on a run of all-B wins is 93.4% at n=54 and 54.07% at n=6. Every bootstrap CI in sections 2 to 4 resamples sites, so all of them are too narrow by the same mechanism.

### 8.3 Blinding removed the labels but not the signature

A 1-nearest-neighbour classifier over 11 surface features, leave-one-out, recovers which model generated a site 83.33% of the time, and 69.44% when it is forbidden from matching a site from the same brief. Chance is 50%.

| Signature | A | B |
| --- | --- | --- |
| Distinct page backgrounds over 18 sites | 5 | 16 |
| Most-repeated page background | `rgb(248, 249, 251)` on 10/18 sites | `rgb(8, 11, 16)` on 2/18 sites |
| Sites with any remove or delete control | 0/18 | 5/18 |
| Mean visible buttons | 5.5 | 13.11 |
| Mean error surfaces after a forced failure | 1.67 | 2.28 |
| Mean characters per error message | 28.11 | 18.83 |

One model reused a single page background on 10 of its 18 sites across four unrelated briefs. Model identity is therefore legible from styling and control density in a single side-by-side view. Each `ux-pair-rater` ran with no history and so could not learn the signature across pairs, but it does not need to: a stable preference for one house style produces exactly the 100% unanimity observed, and is indistinguishable from a quality judgement in this design.

This also reframes the F4 genericness result in section 4. B's lower cross-brief similarity means B varies its layout more between briefs, while the table above shows B still carries a consistent control density and error-handling style. The two are not in conflict, but only the first was measured as genericness.

### 8.4 The rubric had no room to discriminate

| Dimension | Scores of 4 or 5 | Distinct values used |
| --- | --- | --- |
| F1 graphical indicators | 36/36 | 4, 5 |
| F2 verbosity | 36/36 | 4, 5 |
| F3 sloppy text | 28/36 | 3, 4, 5 |
| F4 generic feel | 36/36 | 4, 5 |
| Visual hierarchy | 36/36 | 4, 5 |

A five-point scale on which nearly every artifact scores 4 or 5 cannot separate two models. The rubric deltas in section 3 are real but they sit inside one scale point, which is below the resolution the anchors were written for.

### 8.5 What still stands

These do not depend on the pairwise rater or on sample independence:

- **Deterministic browser measurements**, section 3. B renders more visible words (70.72 -> 80.44), longer button labels (max 1.72 -> 4.56 words) and far more graphical indicators (28.33 -> 49.17). These are counts from a real browser, not judgements.
- **Generation cost**, section 6. B used 8.25x the output tokens and 6.93x the wall time of A for the same six briefs.
- **Zero console errors and zero uncaught exceptions** across all 36 sites, both models.
- **The discarded pilot**, in the limitations below: three of eighteen A generations lost their document inside a JSON tool-call argument against zero for B. That is a tool-call robustness difference, measured, and unrelated to UX.

### 8.6 Why the samples converged

Section 8.2 shows the three samples of a cell are visually near-identical. The cause is not decoding determinism. All 36 files have distinct hashes, and the literal code overlap between two samples of the same cell is 0.024 for A and 0.0035 for B by 8-token shingle Jaccard, against a 0.0018 floor for two sites from unrelated briefs. Each sample is written from scratch and independently lands on the same design.

Four convergence attractors are measurable in the artifacts:

- **One typeface.** Inter on 35 of 36 sites. Neither model was told which font to use.
- **Two page backgrounds.** 26 sites near-white in a luminance band of 239 to 249, 10 near-black in a band of 11 to 17, and nothing between.
- **One corner radius.** The primary button lands on 8 px on 13 of 36 sites and inside 6 to 10 px on 30.
- **A shared genre prior.** The dark theme tracks the brief, not the model: the on-call dashboard went dark 6 of 6 and the job queue 4 of 6, while the other four briefs went dark 0 of 6. Both models independently map monitoring tools to dark and consumer flows to light.

Three of the causes are this harness, not the models:

- **The API contract doubled as a design spec.** Both generators received exact type definitions, including `Job = { id, status: "queued" | "running" | "succeeded" | "failed", progress: 0-100, error?, result? }`, which prescribes a row with a status pill and a progress bar, and `Service = { name, status, latencyMs[], errorRate[], uptimePct }`, which prescribes a card with two sparklines and a percentage. Six briefs shared one API, so all six apps share data shapes.
- **Each brief was one sentence with no design direction.** No brand, no constraints, no references, no audience beyond a role word. Where the brief underdetermines the design, the model fills the gap from priors, and the priors are exactly what is identical across samples.
- **Thinking effort was pinned to `high` for both generators.** Higher reasoning effort converges on the modal best-practice answer, which reduces sample variance by construction.

**Sibling coordination was checked and excluded.** The 36 generators ran as concurrent siblings with a messaging channel available, so agents talking to each other is a live alternative explanation for the sameness. Auditing every argument of all 95 `hub` calls in the generation transcripts: `start` 38, `logs` 34, `wait` 23. There are zero `send` calls, zero `list` calls, and zero occurrences of the peer fields `to`, `message`, `from`, `replyTo` or `await`. Every `wait` names the agent's own process with `for: "exit"`. No generator ever addressed another.

The correlation also runs the wrong way. A opened no channel at all, made 0 process calls, and its within-cell cosine is 0.9873. B made 95 process calls and starts 38 processes, and its within-cell cosine is 0.9501. **The model with no communication produced the more identical outputs.** Coordination cannot explain an effect that is strongest where no channel was used.

**Self-verification looks like a convergence force, not a diversifying one.** Within B, the 2 briefs where it started no test processes (B2, B3) have a mean within-cell cosine of 0.8526, while the 4 briefs where it did (B1, B4, B5, B6) sit at 0.9988. Testing each sample against the same fixed mock API plausibly pulls every sample toward the same passes-every-check design. **This is an observation on 6 briefs, not a result:** the two unverified briefs are also the two most data-dense ones, so brief complexity is an uncontrolled confound and the direction cannot be separated from it here.

A caution on the instrument: the 16x16 grayscale vector is dominated by page brightness and gross column structure, so it reads 0.9687 within a cell, 0.9668 across models on one brief, and 0.9554 across both models and briefs. A spread of 0.013 across all four conditions means this metric mostly measures the shared global template and cannot see the per-model signature that section 8.3 does measure. Both readings are true at different resolutions: every site shares one template, and inside that template each model has a distinct control density.

### 8.7 What a design that could answer the thesis needs

- **Independent samples.** Vary the brief wording per sample, or raise temperature, or use different briefs per sample. Three redraws of one house style are one sample.
- **A rater that is not from either family, plus a human on the same pairs.** One rater family is one measuring instrument with an unmeasured offset.
- **Style-normalised artifacts.** Strip CSS to a shared stylesheet before rating, so raters compare structure and behaviour rather than palette and control density.
- **A rubric with headroom**, anchored on observed failures from a pilot rather than on a 1-to-5 scale whose top two points absorb almost everything.
- **Behavioural async measurement as the primary async metric.** The live harness in `harness/rate.html` reaches the real backend once form fields are filled; the scripted probe in `measure.mjs` did not, and returned null on 32 of 36 sites.

## 9. Was B's extra cost justified?

B cost 8.25x the output tokens, 6.93x the wall time and 7.55x the money of A for the same six briefs ($57.24 against $7.58). This section asks what that bought, by reading the generation transcripts and the delivered code. No model rated anything here.

### 9.1 The two models did different amounts of work, not just different sizes

Both generators had the identical prompt, the identical thinking level, and the identical tool set: `write` and `yield`, with no edit tool.

| Per site | A | B | B/A |
| --- | --- | --- | --- |
| Output tokens | 9,429 | 77,761 | 8.25x |
| Thinking characters | 902 | 22,201 | 24.61x |
| Calls to `write` | 1 | 4.22 | 4.22x |
| Characters passed to `write` | 25,190 | 124,369 | 4.94x |
| Of those, re-emitting content already written | 33 | 79,332 | n/a |
| Delivered file bytes | 25,165 | 45,037 | 1.79x |
| Process-control calls (`hub`) | 0 | 5.28 | n/a |

**A wrote the file once and stopped.** 0 of 18 A sites were written more than once, against 16 of 18 for B. A made zero process-control calls. B made 95, launching 38 throwaway Node scripts with names like `verify.mjs`, `interact-*.mjs`, `drive_fail_*.mjs` and `mobilerun-*.mjs`, reading their logs, and then rewriting the page.

Nothing in the prompt asked for that. Both models were told to build the file, write it, and yield `done`. A followed the instruction literally. B built itself a test harness first. **The cost gap is mostly a behaviour gap, not a verbosity gap.**

**The largest single line on B's bill is re-typing.** With no edit tool, every fix meant re-emitting the whole 45 KB document. B re-emitted 1,427,978 characters of already-written content across 18 sites, about 34% of its entire output budget. **That is a harness cost, not a model cost.** Granting an edit tool would remove most of it without changing the product.

### 9.2 What the extra bytes contain

Static analysis of the 36 delivered files. B ships 1.79x the bytes of A.

| Delivered code | A | B | B/A |
| --- | --- | --- | --- |
| Distinct API methods called | 3.39 | 3.83 | 1.13x |
| Total API call sites | 4.17 | 4.44 | 1.07x |
| Event listeners | 6.39 | 13.83 | 2.17x |
| Inline SVG elements | 8.94 | 16.5 | 1.84x |
| CSS rules | 89.39 | 151 | 1.69x |
| CSS custom properties | 17.5 | 16.78 | 0.96x |
| Media queries | 1.33 | 2.22 | 1.67x |
| `aria-*` attributes | 0.5 | 30.17 | 60.33x |
| `role` attributes | 1.5 | 6.22 | 4.15x |
| `try` blocks | 3.11 | 1.06 | 0.34x |
| CSS transitions | 5.83 | 4.72 | 0.81x |

**Feature coverage is flat.** B calls 1.13x the distinct backend methods of A. Both models wire up roughly the same set of operations from the same mock API. The extra bytes are not extra features.

**A writes more local error handling.** A ships 3.11 `try` blocks per site against B's 1.06, and more CSS transitions. Not every count favours B.

### 9.3 Whether the extra code does anything

Measured in a real browser against the live DOM, not counted in the source.

| Outcome | A | B |
| --- | --- | --- |
| Interactive controls with an accessible name | 98.7% | 99.7% |
| Form inputs with a real label | 97.3% | 98.1% |
| Icon-only controls with no name | 0 | 0 |
| CSS rules matching no element | 28.6% (435 rules) | 26.5% (686 rules) |
| Live regions per site | 0.5 | 3.56 |
| Sites with any live region | 1/18 | 17/18 |

**The 60x `aria-*` count buys almost nothing on naming.** A reaches 98.7% accessible-name coverage with visible button text, B reaches 99.7% with explicit `aria-label`. Neither model ships a single unnamed icon-only control. Counting attributes in the source overstates this difference by roughly sixty times; the browser shows the two models are level.

**The one clear accessibility win is the announcement path.** Live regions appear on 1 of 18 A sites and 17 of 18 B sites. That is the mechanism a screen reader needs to hear that a background job finished, and it is close to absent in A. It is also invisible to every rater in this study, human and model, because none of them used a screen reader.

**Both models ship about a quarter of their CSS dead.** 28.6% for A and 26.5% for B, measured by testing every author rule's base selector against the rendered DOM. The share is the same, so B's larger stylesheet ships more dead rules in absolute terms (686 against 435). Neither model prunes.

### 9.4 Cost against measured gain

B's 18 sites cost $49.66 more than A's 18 sites, $2.76 more per site. Set against every gain this study can actually measure:

| Gain | Size | Measured by |
| --- | --- | --- |
| Graphical indicators per page | 28.33 -> 49.17 (+73.56%) | browser count |
| Interactive controls per page | 8.28 -> 17.06 | browser count |
| Sites with a live region | 1/18 -> 17/18 | browser count |
| Distinct backend methods wired up | 3.39 -> 3.83 | source count |
| Accessible-name coverage | 98.7% -> 99.7% | browser |
| Dead CSS share | 28.6% -> 26.5% | browser |
| Human blind preference for B | 56% of 25 decided pairs | human |

**The verdict on cost depends entirely on which column you read.**

- Judged on what a person notices in a side-by-side comparison, the money bought nothing reliable. A human preferred B on 56% of decided pairs, which is a coin flip, for 7.5 times the price.
- Judged on the code, the money bought twice the controls, 1.8 times the graphics, and the screen-reader announcement path going from absent to standard. It bought no new features and no less dead CSS.
- A third of the bill was re-typing files because the harness gave no edit tool, and that portion bought nothing at all.

The honest summary is that **A and B were not doing the same job.** A answered the brief. B answered the brief, built a browser harness to check its answer, found things it did not like, and rewrote the page four times. Whether that is worth 7.5 times the price is a question about how much you value work you cannot see in a screenshot, and this study measured almost none of it.

## 10. Limitations

- **Single rater model family.** Every score comes from `claude-fable-5`. Same-generation preference cannot be excluded.
- **No human rater.** Human blind rating was skipped by user decision before generation, so section 5 has no comparator.
- **The orchestrator runs model B.** It never scored anything and every number here is computed by `analyze.mjs` from on-disk JSON, but it did know the mapping from generation onward.
- **Mock backend, not a real one.** `harness/mock-api.js` is deterministic under a fixed seed. Real backends fail in ways it does not.
- **No real usability testing.** No human ever used any of these 36 pages.
- **n = 3 per cell.** 3 samples per brief per model. The CIs are wide and most rubric dimensions sit near the top of the 1-to-5 scale, which compresses any difference.
- **The prompting ladder was dropped**, so this study says nothing about whether explicitly instructing the model closes any gap it finds.
- **The duplicate-submission probe is sparse**, firing on only 4 of 36 sites, for the reasons in section 3.
- **Puppeteer instead of Playwright.** Playwright was absent and would have needed a browser download; Chrome 151 and a `puppeteer-core` CDP path were already present.
- **Grayscale layout vectors instead of CLIP embeddings.** No torch, numpy, or PIL exists on this host and installing torch was disproportionate. Genericness uses a 16x16 grayscale downsample, L2-normalised, compared by cosine.
- **`max_tokens` is the model default 128000, not 32000.** Setting 32000 would have meant mutating the user's global model config. Both generators got the identical ceiling.
- **Thinking effort pinned to `high`** for both generators, the only shared non-extreme level.
- **Sites served over local HTTP, not `file://`**, so the mock API could be injected into `<head>` and reached by a plain navigation.
- **The generator transport changed after a pilot run.** The first dispatch asked each generator to return the HTML inside its `yield` result. Three of eighteen `claude-opus-4-6` agents lost a 20-50 KB document in that JSON argument, one through a malformed tool call and two through empty yields, while `claude-opus-5` lost none. Scoring those as generation failures would have made a serialization artifact dominate the comparison, so both generators were given a `write` tool and instructed to write the file to a given path, and **all 36 sites were regenerated** under the new, identical transport. Every site in this study comes from that second run, which produced 36 valid documents and zero failures. The per-model difference in the discarded pilot is itself a finding about tool-call robustness, not about UX, and is not scored anywhere in this report.
- **A harness prefix precedes every brief.** The subagent dispatcher prepends the fixed string `Complete assignment thoroughly:` to the user message. It is identical for every generation of both models and could not be disabled.
- **A rate limit interrupted the fourth pairwise batch.** 27 of the 108 runs returned HTTP 429 and were re-dispatched in smaller chunks with backoff until all 108 completed. No verdict was inferred or filled in.
