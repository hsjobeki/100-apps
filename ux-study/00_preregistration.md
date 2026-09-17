# Pre-registration: UX regression study, `claude-opus-4-6` vs `claude-opus-5`

**Registered at:** 2026-09-17T12:22:37+02:00

**Frozen at this timestamp.** Nothing below is edited after generation begins.

## Thesis under test

Verbatim:

> Claude-generated website UX did not improve substantially between February and September 2026, and the same five
> failure modes persist: F1 text instead of graphical indicators, F2 verbose text, F3 sloppy text, F4 generic feel,
> F5 poor async handling.

## Design

- **Generators.** Model A = `anthropic/claude-opus-4-6`, model B = `anthropic/claude-opus-5`. Both are pinned
  through `.omp/agents/gen-a.md` and `.omp/agents/gen-b.md`, whose bodies are byte-identical and whose only
  differing frontmatter key is `model:`. Both run `thinking-level: high`, the only shared non-extreme level, and the
  model default ceiling `maxTokens: 128000`.
- **Briefs.** Six, used verbatim as the sole user message, never mentioning failure modes, the rubric, or the study:
  - B1 `Build a tool where users upload a CSV, it gets processed on the server, and they can download the result.`
  - B2 `Build an admin page for a background job queue. Admins need to see what's happening and deal with failed jobs.`
  - B3 `Build a service health dashboard for an on-call engineer who needs to know at a glance whether something is wrong.`
  - B4 `Build the first-run experience for a new user of a project management app who has no projects yet.`
  - B5 `Build a checkout form for a small online shop.`
  - B6 `Build an account settings page including deleting projects and deleting the account.`
- **Matrix.** 6 briefs x 2 models x 3 samples = 36 sites. Site ids are random 4-byte hex assigned in a shuffled
  order, so id ordering encodes nothing.
- **Raters.** `anthropic/claude-fable-5`, `thinking-level: high`, no conversation history, blind to model identity.
  Three rater roles: async checklist (agentic, drives the page), rubric, pairwise.
- **Blinding.** Model identity lives only in `ux-study/sealed/mapping.json`, which is not read or passed to any
  rater between generation and analysis. Every site is stripped of HTML comments, `<meta name="generator">`, and the
  case-insensitive tokens `claude-*`, `claude`, `anthropic`, `opus`, `sonnet`, `haiku`, `fable`, each replacement
  logged in `ux-study/sealed/stripped.json`.

## Decision rules

Verbatim, fixed before any generation:

- **Thesis falsified** if model B wins >=70% of blind pairwise comparisons (ties excluded) **and** B's mean
  async-checklist failures are <=50% of A's.
- **Thesis supported** if B's pairwise win rate is <=60% **and** B's async failures are >=75% of A's.
- Anything else is **inconclusive / partial**; report which failure modes moved and which didn't.

## Metrics

### Deterministic metrics (Step 7, `harness/measure.mjs`)

Measured over Chrome 151 headless via `puppeteer-core`, desktop `1440x900` and mobile `390x844`, both
`deviceScaleFactor: 1`. Unless stated, the page is loaded at `?latency=fast&fail=0&seed=7`.

- **Visible words.** Text nodes whose parent element has a non-zero client rect, `visibility !== "hidden"`,
  `display !== "none"`, `opacity > 0`. Words are `match(/\S+/g)`. Reported as `viewportWords` (parent rect
  intersects the initial viewport) and `pageWords` (all), per viewport.
- **Label length.** Over `button, a[role=button], [role=button], input[type=submit]`; label is `innerText.trim()`
  or `value` for inputs. Reported: `count`, `meanWords`, `maxWords`, and every `{ text, words }` above 3 words.
- **Helper text.** Sum of words in `p` and `small`. Separately, every element with no element children whose own
  word count exceeds 12, summed as `longLeafWords`, offending strings truncated to 120 chars.
- **Graphical indicators.** Counts of `svg`, `canvas`, `progress`, `meter`, `[role=progressbar]`, plus a badge
  heuristic: computed `background-color` differs from the parent's, text is 1 or 2 words, rect area <= 8000 px^2.
  Each count and the total.
- **Duplicate submission.** At `?latency=slow&fail=0&seed=7`. Primary action is the first visible match of
  `button[type=submit], input[type=submit], form button:not([type=button]), [role=button]`, falling back to the
  first visible `button`. Clicked 3 times at 0, 100, 200 ms, then 1500 ms wait. From `window.__apiLog`, the most
  frequent method that is not `getJob`, `listJobs`, `getUser`, or `getMetrics`, reported as `{ method, calls }`.
  `calls > 1` means the page allowed a double submission. `null` when no primary action exists.
- **Console errors.** `console` and `pageerror` listeners attached before navigation. Sequence: load, wait for
  network idle or 3 s, click primary action, wait 2 s, reload at `?fail=1&seed=7`, click primary action, wait 2 s.
  Reported as `consoleErrors` and `uncaughtExceptions` counts plus the first 5 messages of each.
- **Screenshots**, all non-`fullPage`, to `ux-study/shots/<id>_<state>_<viewport>.png`:
  `idle_desktop` (`?latency=fast&fail=0&seed=7`, after network idle or 3 s), `loading_desktop`
  (`?latency=slow&fail=0&seed=7`, 1000 ms after clicking the primary action), `error_desktop`
  (`?latency=fast&fail=1&seed=7`, 1500 ms after clicking the primary action), `idle_mobile`
  (`?latency=fast&fail=0&seed=7`, mobile viewport).
- **Layout vector.** `<id>_idle_desktop.png` drawn into a 16x16 canvas, each pixel converted with
  `0.299R + 0.587G + 0.114B`, rounded, then the 256-value array L2-normalised. Stored as `layoutVector`.

### Async checklist (Step 8, blind, agentic)

Ten items, verbatim:

1. Loading state is visible within 300 ms of starting an async action.
2. Primary action is disabled or deduplicated while pending.
3. Progress is shown where the API provides it (upload %, job progress).
4. User can cancel a long-running action where it makes sense (upload, processing).
5. On failure, the error message is specific and visible near the relevant element.
6. On failure, a recovery path exists (retry, fix field, re-upload) without reloading.
7. Field-level validation errors from the API are mapped to the right fields.
8. Polling or live state updates reflect server state changes without manual refresh.
9. Navigating to another view or closing a dialog mid-action doesn't leave the UI in a broken or inconsistent state.
10. Optimistic or completed state is not shown before the server confirms success.

Applicability is fixed, not a rater judgment: item 7 applies only to B5; item 8 only to B1, B2, B3; items 3 and 4
only to B1 and B2. Every other item applies to every brief. Each item returns `PASS`, `FAIL`, or `N/A` with a
reason and evidence (a saved screenshot path or a DOM excerpt of at most 300 characters). `failCount` is the number
of `FAIL` verdicts.

### Rubric (Step 9, blind)

Anchors, verbatim:

- **F1 Graphical indicators.** Classify every inventory item as `graphical+text`, `graphical only`, `text only`, or
  `missing`. 5 = all inventory items graphical with text supporting; 3 = about half text-only; 1 = nearly all
  text-only or missing. Also report the raw ratio.
- **F2 Verbosity.** 5 = every sentence earns its place, no text restates what the UI already shows, labels
  <=3 words; 3 = some redundant headings or helper text, a few long labels; 1 = explanatory paragraphs everywhere,
  the UI narrates itself. List every redundant sentence found.
- **F3 Sloppy text.** 5 = consistent terminology, no filler, copy matches behavior; 3 = 2 to 4 issues; 1 = 5 or
  more issues. Issues are inconsistent naming for the same thing, filler, marketing tone in a tool UI, copy
  promising behavior that does not happen, and placeholder text. List every issue.
- **F4 Generic feel.** 5 = layout, type, and color choices are clearly driven by this task and user; 3 = competent
  but template-like; 1 = interchangeable with any other brief's output. Name the specific choices that are
  task-driven and the ones that are template.
- **Visual hierarchy.** Answer from the desktop idle screenshot alone, before reading the HTML: what is the page
  for, what is the primary action, what needs attention. Then check the answers against the brief. 5 = all correct
  and obvious; 1 = unclear.

State inventories, given to raters only:

- B1: upload progress, processing status, success/failure
- B2: job status per row, job progress, queue-level counts, failure reason
- B3: per-service health, latency trend, error-rate trend, uptime
- B4: onboarding progress, empty state
- B5: field validation state, submission state, order success/failure
- B6: save state, destructive-action danger level, confirmation state

**F5 is not rated by any model.** `analyze.mjs` derives it from `failCount`: 0 fails = 5, 1 = 4, 2 to 3 = 3,
4 to 5 = 2, 6 or more = 1.

### Pairwise (Step 10, blind)

Per brief, each of the 3 model-A samples is paired with each of the 3 model-B samples: 9 pairs per brief, 54 pairs.
Each pair is run twice with sides swapped: 108 rater runs. The question is verbatim:

> For the user described in the brief, which design is better to use? Answer Left, Right, or Tie, then give the
> three most decisive reasons.

Resolution, in `analyze.mjs`: each orientation's verdict maps to the site id it favours. If the two orientations
favour different ids, or either is `Tie`, the pair resolves to `Tie`, and it is counted position-inconsistent when
the two verdicts name different sides in the same direction. The position-inconsistency rate over the 54 pairs is
reported, and **the pairwise result is flagged unreliable if it exceeds 25%**.

## Fixed analysis constants

- Bootstrap: 10000 resamples, percentile 95% CI, PRNG `mulberry32(20260917)`.
- Pairwise win rate of B excludes ties from both numerator and denominator.
- Genericness: for each model, the mean pairwise cosine of `layoutVector` over all site pairs drawn from
  **different** briefs. Higher means more generic. Both models and the difference are reported.
- Illustrative pairs, five, chosen by this rule and no other: each resolved pair's rubric gap is
  `mean(F1..F5, hierarchy of B site) - mean(same of A site)`; take the 2 largest positive gaps, the 2 largest
  negative gaps, and the pair whose gap is the median of all resolved pairs. Ties broken by lexicographic
  `pairKey`.
- A site recorded in `sealed/failures.json` as a generation failure counts as a pairwise loss and as the maximum 10
  async failures, without dispatching a rater.

## Removed before generation

Both by explicit user decision, taken before any site was generated:

- **The prompting ladder (L1, L2, L3) is dropped entirely.** Only the main L1 condition runs. Consequently there is
  no L2/L3 generation, no ladder rubric comparison, the pre-registered rule *"knowledge exists but isn't
  activated"* is removed, and the corresponding `REPORT.md` item is removed. The study therefore says nothing about
  whether explicit instruction closes any gap it finds.
- **Human blind rating is skipped.** There is no `human/rate.html`. The Fable-versus-human agreement item is
  removed, and the rater-bias item reports only Fable's B-preference rate with an explicit note that no independent
  comparator exists.

## Deviations from the original spec

- **Puppeteer instead of Playwright.** Playwright is absent and would need a browser download; Chrome 151 and a
  `puppeteer-core` CDP path are already present. Viewport control, screenshots, request-level state, and console
  and `pageerror` capture are all covered.
- **Deterministic grayscale layout vectors instead of CLIP embeddings.** No torch, numpy, or PIL exists and
  installing torch is disproportionate. Genericness uses the 16x16 grayscale downsample described above, computed
  in-browser via canvas, so it needs no image library and is exactly reproducible.
- **`max_tokens` is the model default 128000, not 32000.** Setting 32000 would require mutating the user's global
  `~/.omp/agent/models.yml`. Both generators get the identical 128000 ceiling, so the fairness requirement holds.
- **Thinking effort pinned to `high` for both generators**, the only shared non-extreme level.
- **The orchestrator runs `claude-opus-5`, which is model B.** Mitigation: the orchestrator never scores anything.
  Every score comes from a `claude-fable-5` rater with no conversation history, and every number in `REPORT.md` is
  computed by `analyze.mjs` from on-disk JSON, not by orchestrator judgment.
- **Sites are served over local HTTP, not `file://`.** The server injects the mock API as the first element of
  `<head>`, so a plain navigation is enough for any consumer to get `window.api`. This also avoids `file://`
  query-string and origin problems.

## Mock backend notes

`harness/mock-api.js` is deterministic under a fixed seed and a fixed call order: one `mulberry32(seed)` stream
feeds fixture construction and every method. Two implementation points the spec left open, fixed here before
generation:

- **Fixture job lifecycle length.** A `processFile` job uses the specified `x` (6000 ms fast, 25000 ms slow).
  Fixture jobs use `x * (3 + rnd() * 5)` so that queued and running states remain observable across a rating
  session rather than terminating within seconds. Start offsets are chosen so at least two fixture jobs are
  `failed` and at least two are `running` at load.
- **`retryJob` on a terminal job.** The spec says both `retryJob` and `cancelJob` are no-ops on a terminal job,
  which would make retry unobservable and checklist item 6 untestable. Resolved functionally: `cancelJob` is a
  no-op on a terminal job and returns the snapshot; `retryJob` always resets the job to `queued` with a fresh
  start time.
- **Failed-job progress.** A terminal `failed` job freezes `progress` at a per-job value drawn from the seeded
  stream in `[20, 89]` rather than reporting 100.

## Verification gates already passed at registration time

1. **Model pinning.** `gen-a` and `gen-b` both returned; resolved model ids read `claude-opus-4-6` and
   `claude-opus-5`.
2. **Mock injection.** `/s/__probe?seed=7` reported all 12 contract methods present; `getUser().projects` was `[]`
   for `brief: "B4"` and length 3 (`proj_1..3`) for `brief: "B1"`.
3. **Mock determinism.** Two loads at `?latency=fast&fail=0.5&seed=7` returned identical job ids and statuses and
   identical first three `__rnd()` draws; `seed=8` differed in both.
4. **Abort works.** `uploadFile` under `latency=slow`, aborted at 300 ms, rejected with `name === "AbortError"` at
   348 ms.
5. **Validation shape.** `submitOrder` at `fail=0` rejected on attempt 5 with `code === "VALIDATION"` and every key
   of `fields` a member of the documented `OrderPayload` key set.
