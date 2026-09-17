# What we tested, and what went wrong

Plain-language version of `REPORT.md`. No prior knowledge needed.

## The thesis

Someone claimed:

> **Claude got no better at building website interfaces between February and September 2026.**
> The same five problems are still there:
>
> 1. It writes the word "Loading..." instead of drawing a spinner or a progress bar.
> 2. It writes too much text.
> 3. Its text is sloppy: wrong words, inconsistent names, filler.
> 4. Everything it builds looks the same, whatever you asked for.
> 5. It handles waiting badly. Click a button, and nothing tells you the app is working.

We built an experiment to check whether that is true.

## The setup

Two versions of Claude. The old one, `opus-4-6`, from February. The new one, `opus-5`, from
September. We call them **A** and **B**.

We gave each of them the same six jobs:

1. A tool to upload a spreadsheet and download the processed result
2. An admin page for a queue of background jobs
3. A health dashboard for an engineer on call
4. A welcome screen for a new user with nothing in their account
5. A checkout form for a small shop
6. An account settings page, including deleting the account

Each model built each job three times. **36 websites in total.**

Then we hid which model built what and asked a third Claude, `fable-5`, to compare them. It saw
two websites side by side and picked the better one. It did this 108 times. We wrote down the
rules for what counts as a pass or a fail **before** we started, so we could not move the goalposts
later.

## The first answer

**`fable-5` picked the new model every single time. 54 out of 54. A clean sweep.**

By the rules we wrote in advance, that means the thesis is wrong and the new model is much better.

We did not believe it. Here is why.

## Problem 1: a human disagreed

The person running the study rated 32 of the same pairs, under the same blinding. They could not see
which model built what.

| Who rated | Picked B | Picked A | Couldn't decide | B's win rate |
| --- | --- | --- | --- | --- |
| **Human** | 14 | 11 | 7 | **56%** |
| **`fable-5`** | 54 | 0 | 0 | **100%** |

**56% is a coin flip. 100% is not a judgement, it is a reflex.**

The two raters agreed on 14 of the 25 pairs the human decided. That is 56% agreement. **A coin would
agree 50% of the time.** So `fable-5`'s opinion told us almost nothing about what a person thinks.

Worse, the human's answer landed in the *opposite* band of our pre-written rules. `fable-5`'s 100%
said "thesis is wrong". The human's 56% said "thesis holds up".

### Why might `fable-5` be wrong?

**`fable-5` and `opus-5` are from the same family and the same generation.** The name says it:
both are `-5`. A model may prefer work that looks like its own. We could not measure this, because
we had no rater from a different company to compare against. So we cannot prove bias. **We also
cannot rule it out, and a 100% sweep is exactly what bias looks like.**

### The most interesting part

The human did not disagree evenly. Look at *where* they disagreed:

| The job | Human's pick | `fable-5`'s pick |
| --- | --- | --- |
| Spreadsheet tool | B, 3-0 | B |
| Job queue admin | B, 4-0 | B |
| Health dashboard | B, 3-0 | B |
| **Welcome screen** | **A, 0-6** | **B** |
| **Checkout form** | **A, 2-3** | **B** |
| Settings page | tied 2-2 | B |

**The human preferred the new model for dense tools and the old model for simple screens.**

The new model puts more on the page: 13 buttons on average against the old model's 5.5. That helps
when the user is an engineer staring at 200 jobs. It hurts on a welcome screen, where the job is to
show one thing clearly. On the welcome screen the new model added no extra function at all, just
warmer colours, and the human rejected it 6 times out of 6.

`fable-5` said "new model is better" for all six jobs. **A rater that gives the same answer no
matter what the job is, is rating style, not fitness for purpose.**

## Problem 2: we thought we had 54 samples, we had 6

Each model built each job three times. We treated those as three independent tries. **They were
not.**

We compared the three versions of each app pixel by pixel. In 8 of the 12 model-and-job groups, the
three versions were **99.8% identical**. Not similar. Basically the same page.

**So each model really produced one design per job, not three.** That means our 54 comparisons were
6 real comparisons repeated 9 times each.

This matters a lot for how confident we can be:

- Treating it as 54 independent wins: we can say B's true win rate is **at least 93%**.
- Treating it as 6: we can only say B's true win rate is **at least 54%**.

**54% is barely better than a coin flip.** Same data. The confident-sounding number came from
counting the same result nine times.

## Problem 3: hiding the names did not hide the handwriting

We removed every model name from the files. That was not enough.

Each model has a **house style**, and it is obvious:

| | Old model (A) | New model (B) |
| --- | --- | --- |
| Different background colours used across 18 sites | 5 | 16 |
| Reused its single favourite background | **10 of 18 sites** | 2 of 18 sites |
| Sites where you can delete an item | **0 of 18** | 5 of 18 |
| Buttons on the page, average | 5.5 | 13.1 |

The old model used the exact same off-white background, `rgb(248, 249, 251)`, on **10 of its 18
sites** — across four completely unrelated jobs. A spreadsheet tool and an account settings page got
the same background.

We then wrote a dumb program that guesses which model built a site, using only surface details like
colour and button count. **It guesses right 69% of the time. Chance is 50%.**

So the labels were hidden but the handwriting was not. A rater comparing two sites can see which
family each belongs to, without being told. **If it simply likes one house style, it will pick that
style every time — and that looks exactly like a 54-out-of-54 sweep.**

## Problem 4: our scoring scale was too blunt

We scored each site 1 to 5 on things like "does it use graphics instead of text".

| What we scored | Sites that got a 4 or 5 |
| --- | --- |
| Graphics instead of text | 36 of 36 |
| Not too wordy | 36 of 36 |
| Generic feel | 36 of 36 |
| Clear layout | 36 of 36 |

**Every site scored 4 or 5 on almost everything.** A scale where nothing ever scores below 4 cannot
tell two things apart. We measured differences of 0.2 and 0.5 points on a scale with two usable
values.

## Why did every app look the same?

This one surprised us. The obvious answer would be that the model just repeated itself, or that we
accidentally turned off randomness.

**Wrong. We checked.** All 36 files are different files. We compared the actual code of the three
versions of each app, and they share **almost no lines**. Two versions of the same app overlap about
as much as two completely unrelated apps do.

**So the model wrote each one from scratch, and freely chose the same design every time.**

**A second obvious answer is also wrong: they did not talk to each other.** All 36 builders ran at
the same time and *could* have sent each other messages. We audited every one of the 95 calls they
made to that system. **All 95 were "start a program", "read its output", or "wait for it to
finish". Zero were messages to another builder.**

And the numbers point the other way: the old model opened **no channel at all** and its three
versions were **more** identical (0.9873) than the new model's (0.9501). **The model that could not
communicate produced the more identical work.**

Four things they kept choosing:

- **One font.** Inter, on 35 of 36 sites. Nobody told them which font to use.
- **Two background colours.** 26 sites near-white, 10 sites near-black, and **nothing in between**.
- **One corner roundness.** The main button had 8px rounded corners on 13 of 36 sites, and 6–10px
  on 30 of them.
- **A shared sense of genre.** Both models made the on-call dashboard dark, 6 times out of 6, and
  the job queue dark 4 times out of 6. Everything else they made light, 0 times out of 6. Nothing in
  the instructions said so. **They agree that monitoring tools are dark and shops are light.**

### Three of the causes were our fault, not the models'

**1. We handed them the design without realising it.** We gave both models the exact shape of the
data, like this:

```
Job = { id, status: "queued" | "running" | "succeeded" | "failed", progress: 0-100 }
```

**2. Our instructions were one sentence long.** "Build a checkout form for a small online shop."
No brand, no colours, no audience, no constraints, no examples. **When you do not say what you want,
the model fills the gap with its defaults — and its defaults are identical every time.** That is the
single biggest mistake we made.

**3. We asked both models to think hard.** We set reasoning effort to "high" for fairness. Thinking
harder pushes a model toward the one textbook answer. **We asked for the safest answer and then acted
surprised when we got the same safe answer three times.**

## What we can still trust

These are counted by a browser, not judged by anyone. They stand:

- **The new model writes more, not less.** More words on screen, 70.7 → 80.4. Longest button label
  1.7 words → 4.6 words. This directly contradicts the "too wordy" complaint being fixed. It got
  wordier.
- **The new model draws far more graphics.** Spinners, charts, progress bars, badges: 28.3 → 49.2
  per page. This is real progress on complaint 1.
- **No site crashed.** Zero errors across all 36, both models.
- **The new model is much more expensive.** For the same six jobs it used **8.25x the output** and
  took **6.9x as long**. $57.24 against $7.58.

## The verdict

**We cannot say whether the thesis is right or wrong.**

The pre-written rule did fire, and it said "thesis is wrong". We are reporting that honestly. But the
experiment underneath it has three faults big enough to produce that result on their own: the
samples were duplicates, the rater could see the handwriting, and the scoring scale was too blunt.
The one human who looked at the same pairs got a coin flip.

**What we actually learned is about measurement, not about the models.** Specifically: asking one
Claude to grade another Claude's work produced a 100% sweep that a single human could not reproduce.
That is worth knowing on its own.

## Was the new model worth 7.5x the price?

We asked this second, after the study above. It needed no new websites — just a careful read of the
generation logs and the code itself.

**The new model cost 7.5x as much money, 8.25x the tokens, and took 6.9x as long.** $57.24 against
$7.58 for the same six jobs.

### The two models did not do the same job

This is the thing nobody expected. Both got the same instruction: *build the file, save it, say
done.* Both got the same two tools.

**The old model saved the file once and stopped.** 0 of its 18 sites were saved more than once.

**The new model built itself a test lab.** It wrote throwaway programs with names like `verify.mjs`,
`interact.mjs`, `drive_fail.mjs` and `mobilerun.mjs`, launched them 38 times, read their output, then
went back and fixed the page. **It saved 16 of its 18 sites more than once, 4.2 times on average.**

Nobody asked it to test its work. It decided to.

**So the cost gap is mostly a behaviour gap, not a "writes too much" gap.**

### A third of the bill was pure waste, and that was our fault

We gave both models a "save file" tool and **no "edit file" tool.** So every time the new model
wanted to change one line, it had to retype the entire 45,000-character page.

**It retyped 1.4 million characters of text it had already written. That is about 34% of everything
we paid for.**

**That is our bug, not the model's.** Give it an edit tool and a third of the bill disappears with no
change to the product.

### What the extra code actually contains

The new model's files are 1.79x bigger. Here is what is in the extra bytes.

| | Old | New | Change |
| --- | --- | --- | --- |
| **Backend features wired up** | 3.4 | 3.8 | **1.13x — basically the same** |
| Clickable controls | 6.4 | 13.8 | 2.17x |
| Drawn graphics (icons, charts) | 8.9 | 16.5 | 1.84x |
| Styling rules | 89 | 151 | 1.69x |
| `try`/`catch` error handling | 3.1 | **1.1** | **0.34x — the old model does more** |

**The extra bytes are not extra features.** Both models connect to almost exactly the same number of
backend operations. The new model spends its extra bytes on more buttons, more icons, and more
styling for the same underlying app.

### We checked whether the extra code does anything

We loaded all 36 sites in a real browser and measured the result, instead of counting words in the
source.

| | Old | New |
| --- | --- | --- |
| Buttons a screen reader can name | 98.7% | 99.7% |
| Form fields with a proper label | 97.3% | 98.1% |
| Icon buttons with no name (a real bug) | **0** | **0** |
| Styling rules that match nothing on the page | **28.6%** | **26.5%** |
| **Sites that announce updates to a screen reader** | **1 of 18** | **17 of 18** |

**One finding here is a trap.** In the raw source, the new model has **60x** more accessibility
attributes. That sounds enormous. In the browser it is worth **one percentage point**, because the old
model already labels its buttons — it just uses visible text instead of a hidden attribute.
**Counting attributes in the source overstated this by sixty times.**

**One finding is real.** Screen readers need a special region on the page to announce "your upload
finished". The old model includes one on **1 site out of 18.** The new model includes one on **17 out
of 18.** That is a genuine, large improvement — **and no rater in this study could see it, because
nobody used a screen reader.**

**One finding is unflattering to both.** Both models ship roughly **a quarter of their styling rules
dead** — rules that match nothing on the page. The new model's stylesheet is bigger, so it ships
*more* dead rules: 686 against 435. Neither model cleans up.

### So was it worth it?

**It depends which column you read, and we will not pretend otherwise.**

**No, if you judge by what a person notices.** A human comparing the two side by side preferred the
new model **56% of the time. That is a coin flip, for 7.5x the price.**

**Yes, if you judge by the code.** Twice the controls. 1.8x the graphics. Screen-reader announcements
going from basically absent to standard.

**No, for a third of the bill regardless.** The retyping bought nothing at all.

The fairest summary: **the old model answered the brief. The new model answered the brief, built a
test harness to check itself, found problems, and rewrote the page four times.** Whether that is
worth 7.5x the price depends on how much you value work you cannot see in a screenshot. **This study
measured almost none of it.**

## How to do it properly next time

- **Make the samples actually different.** Change the wording per attempt, or use different briefs.
  Three redraws of one house style is one sample, not three.
- **Use a rater from another company, and a human on the same pairs.** One rater family is one
  instrument with an error you cannot see.
- **Strip the styling before rating.** Force both sites onto the same stylesheet, so the rater has to
  compare structure and behaviour instead of colour palette.
- **Write a scoring scale with room at the top.** Base it on failures found in a pilot run, not on a
  1-to-5 guess.
- **Test waiting behaviour by clicking, not by reading.** Our automated click test failed on 32 of
  36 sites because it did not fill in the forms first, so the buttons did nothing.
- **Say what you want in the brief.** Most of the sameness we blamed on the models came from us
  giving them a one-line instruction and no direction.

