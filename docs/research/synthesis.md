# Phase 0 Synthesis — Gate 0

*Orchestrator, 2026-08-29. Written after reading all four dossiers in full. Everything
here traces to `docs/research/{rsvp-perception,prior-art,extraction-tier1,extraction-tier2}.md`;
where I reason beyond what a dossier states, it says so.*

---

## What Phase 0 actually bought

Four dossiers, ~42,000 words, ~470 verified source links. Each was adversarially
audited by an agent that re-fetched cited URLs and checked the source said what the
document claimed. The audits found real defects, which is the evidence the process
worked: R1 was suppressing the strongest pro-RSVP result in the field; R2's stated
reason for trusting its keystone source was false; R3 asserted marker had replaced a
heuristic it still runs on master; R4 had ParseBench's corpus size wrong by 4× and
cited a benchmark result that does not exist.

Two workers also ran their own measurements rather than only citing. R3 built the
escalation classifier and calibrated it on 414–432 real academic pages; that is where
the single most important finding in this phase comes from.

---

## The 5 hardest problems, ranked

Ranked by: probability of sinking the project × cost of finding out late.

### 1. The architecture cannot detect its own worst failure mode

**This is a composition problem. Neither R3 nor R4 states it, because each saw one half.**

- R3 **measured** it: randomising 100% of digits across 414 real academic pages flagged
  **zero** additional pages under the full stage-A + stage-B rule set. Digit substitution
  preserves token length, whitespace structure, alphanumeric ratio, word-length
  distribution and dictionary hit rate *exactly*. No text statistic can see it, and R3's
  §8 says so outright: "Numeric fidelity is not defended by any of this."
- R4 has the only working numeric detector: **digit-multiset comparison**
  (`bag_of_digit_percent`, shipped and published in ParseBench), order-invariant, so it
  survives dehyphenation, column reordering and header stripping — the legitimate
  differences that make naive edit distance useless (rejected by two independent
  benchmark teams).
- **But that detector requires tier 2 to have already run, and the classifier decides
  whether tier 2 runs.**

So: a page with a wrong `/ToUnicode` CMap on its digit glyphs extracts as fluent,
plausible text; scores clean on every classifier term; never escalates; is never diffed.
The reader displays a wrong number with full confidence. R3 records the mechanism —
a CMap "can map a character code to any arbitrary Unicode string regardless of what
glyph the font program draws" — and that **no intrinsic signal exists**.

Cross-*engine* diffing does not save it, and this is the subtle part: a wrong CMap is a
property of the file, so every engine that reads the CMap reads the same wrong answer.
The only detector that works is an **independent visual path** — render the page, read
the pixels, compare digits. That is tier 2 by another name.

**Consequence, and it contradicts the plan's own acceptance criteria.** These two cannot
both hold:

> - 40-page paper with 3 scanned pages escalates exactly 3 pages.
> - Numerals in extracted tables match source exactly across all golden files.

Verifying numerals requires a second visual read of every numeral-bearing page. In an
academic paper that is most of them.

**The cheap resolution, which is a synthesis-level finding neither dossier reached.**
The independent visual path does not have to be the 1B VLM. R4 found that
**PP-OCRv6_medium — a 34.5M-parameter CTC+NRTR recognizer — scores 93.20 on the only
published hallucination benchmark, beating a 235B VLM by 12.6 points**, because CTC
decoding is grounded in visual features rather than autoregressive language priors. A
tiny CTC head that only has to read *digit spans* inside detected table and numeric
regions is orders of magnitude cheaper than full-page VLM escalation, and is
structurally less able to invent a number. This makes numeric verification a
**third, always-on cheap tier**, not an escalation.

Phase 1 must decide this. It is not a later refactor.

### 2. The premise: RSVP costs exactly what an academic paper is made of

The most replicated finding in R1, across three labs, two languages and two independent
implementations: **RSVP degrades literal/verbatim comprehension while leaving inferential
gist intact.** Benedetto (N=60): literal 60% vs 72%, ηp²=.12, with inferential null — **at
zero speed gain** (209 vs 200 wpm, p=.160). Boo & Conklin: detail 82% → 53% at 500 wpm.
Acklin & Papesh: static text beat RSVP at both 700 and 1000 wpm.

Worse, two silent-failure mechanisms sit on top: readers substitute context-plausible
words for what was actually shown **26–40% of the time at 600 wpm despite explicit
instructions to report verbatim** (Potter et al. 1993), and repetition blindness drops
~24–30% of repeated words producing ungrammatical output the reader does not notice.
Both fail silently — no signal to the reader that anything went wrong.

**Compose that with problem 1 and the picture is uncomfortable:** the extraction stack's
worst failure mode is silent numeric corruption, and the reading format's worst failure
mode is silent loss of verbatim numeric detail. They target the same content and neither
announces itself.

R1's own design conclusion is the honest one: default to **≤300 wpm delivered**, label
the number as delivered not nominal, and ship 500+ as *skimming*, saying so. R1 also
found the one population where RSVP wins — ADHD readers, +6.96% vs −5.82% for
neurotypical controls in the same experiment, at ~240 wpm. **The positive case for this
product points at low rates, not high ones.**

This is a product decision, not an engineering one, which is why it belongs at Gate 0.
Three coherent products are available and they want different builds:

| Product | Speed | What the timing model optimises | Numeric handling |
|---|---|---|---|
| **Skimmer** | 400–800 | throughput | route numerics out entirely |
| **Comprehension reader** | 200–300 delivered | boundary pauses, rewind | inline, slowed |
| **ADHD-first reader** | ~240 | steady rhythm, low variance | inline, slowed |

I recommend the **comprehension reader**, with skim as an explicit labelled mode. It is
the only one consistent with "arbitrary academic PDF → readable stream" as a goal, and
it makes the expensive numeric-fidelity work in problem 1 worth doing. If the target is
really the skimmer, problem 1 mostly evaporates and so does half of Phase 3.

### 3. Every timing coefficient is uncalibrated, and the only direct test is null

Castelhano & Muter 2001 remains the **only** direct test of variable dwell against
constant dwell. It found punctuation pauses were *preferred*, delivered **no comprehension
gain**, and **cost speed**. Nothing in 25 years has compared variable to constant dwell at
a matched mean delivered rate with a comprehension outcome. Di Nocera et al. name this as
the open question; it is still open.

Meanwhile R1 extracted the empirical targets that shipped implementations mostly miss:

- Length: **1.11× (gaze) to 1.36× (adjusted gaze)** for an 11- vs 5-letter word. The
  Spritz patent's 1.0/1.3/1.6 is the only shipped scheme in range. tspreed is 2.75×,
  Sprint Reader 2.20×, speedread 1.04× (a no-op).
- Frequency/surprisal: **2–4 ms per bit**. Sprint Reader uses 12.3 ms/bit — 3–6× too
  steep, and in that mode the user's WPM control does nothing at all.
- Do **not** shorten dwell on common function words: tested, disliked, suspected harmful,
  and the real effect is ~5 ms per decade of frequency, not the 115 ms implementations use.
- Put slack **between** sentences, never inside them — slowing the within-sentence rate
  re-invites the eye movements RSVP exists to remove.
- Cap per-word dwell at **~300–350 ms**; above that you are inside the 200–330 ms
  temporal-crowding window.
- Mechanism note that changes how to think about it: the extra time a long word needs in
  normal reading is **not a longer fixation** (first-fixation duration is flat) — it is a
  *second fixation*. RSVP dwell extension substitutes for a refixation the reader can no
  longer make. Calibrate against gaze duration, never first-fixation.

**Consequence for Phase 3 W3:** the brief says "full timing model per spec, all
coefficients in config/timing.json." That is right, and `config/timing.json` is now
load-bearing for a different reason than convenience — it is the only way to run the
experiment nobody has run. The spec should require a delivered-WPM measurement harness
alongside it, because **every shipped reader surveyed lies about its rate by 20–25%**
(nominal vs delivered), and R2 found the fix: Spritz's *duration normalization* — divide
the WPM budget by the passage's summed relative duration. Patented, published, copied by
nobody.

### 4. The classifier is unsourced as a whole and calibrated against synthetic damage

R3's stage A/B classifier is the best-grounded artifact in Phase 0 — every constant traces
to retrieved source (ocrmypdf, docling, marker, unstructured, pdf-inspector, CCpdf, Cuper)
— and R3 is candid that **no published work combines per-page signals this way, and the
combination has no published calibration.** Its constituent sources disagree with each
other: 0.65 vs 0.75 image coverage, 4.15–6.25 vs 4.8–7.5 word length, 0.3 vs 0.80
alphanumeric ratio.

More importantly, the measured 4.6–6.0% false-positive rate comes from applying *synthetic
uniform-random* corruption to already-clean pages. Real ToUnicode failures are
**correlated** — a whole font breaks, so whole runs break together. R3 calls its own
numbers "optimistic upper bounds on separability."

The highest-value unassigned task in the project: **collect 30–50 genuinely broken
academic pages with known-correct text.** Nobody owns this. It is not in the Phase 3
briefs, and W1's five golden PDFs are healthy-document regression tests, not broken ones.
Without it, the escalation rate — and therefore the GPU cost, and therefore whether the
two-tier design is even necessary — is unknown.

One free win R3 found: restricting the dictionary check to **lowercase-initial** tokens
(dropping proper nouns, acronyms, sentence-initial words and citation surnames) moves the
false-positive rate from **22.7% → 6.0%** at the same threshold with detection unchanged.

### 5. Tier-2 model choice is unresolvable from published sources, and the disagreement sits exactly on our failure mode

R4's primary pick, PaddleOCR-VL-1.6, leads OmniDocBench v1.6 at 96.33 and posts the top
ArXiv score on olmOCR-Bench. The independent French harness ranks its immediate
predecessor **7th of 12 (0.381), below olmOCR-2-FP8 (0.461) and LightOnOCR-2-1B (0.542)**,
with **`long_table` at 0.125** — the category closest to "dense numeric academic table" —
and **4.056 s/page against olmOCR-2's 1.107**, destroying the assumption that a 0.96B model
must be fast.

R4 states the problem against its own recommendation plainly: both benchmarks it leads are
published by its own lab or a partner, and OmniDocBench's headline composite **excludes
reading order by construction and cannot see a single flipped digit in a long table**. Two
of the three strongest arguments for the model are measured by metrics blind to the
failure mode we care about.

Three further constraints worth carrying into Phase 1:

- **Use FP8, never INT4.** FP8 is free on OCR quality (82.4±1.1 vs 82.3±1.1, same pipeline,
  same bench). INT4 preserves glyph reading (DocVQA 99.85% recovery) but degrades *number
  handling* disproportionately (MathVista 96.69%, MGSM 92.04%). Transcribing glyphs
  survives INT4; carrying a number through the language model is where the loss lands —
  which is precisely what "re-emit this table cell-by-cell" does.
- **Resolution cuts against the model defaults.** olmOCR renders at 1288 px ≈ 110–117 ppi;
  a controlled single-character study finds MLLMs deteriorate significantly below 150 ppi.
  Language priors carry running prose at low DPI and cannot carry isolated numerals — but
  rendering higher is off-distribution for a narrowly fine-tuned model. **Unresolved and
  directly on the critical path.**
- **Licence, not quality, blocks the accuracy-optimal choice.** Chandra tops both harnesses
  it appears on and is blocked by an AI Pubs Open RAIL-M non-compete plus a share-alike
  that extends **to the Output** — i.e. to the extracted text itself. That is a legal
  question, not a technical one, and it is the user's to answer.

---

## Where the dossiers disagree

### Cross-dossier

| # | Disagreement | Resolution |
|---|---|---|
| 1 | **R1 and R2 give different ORP rules for the same file.** R1 (audit, re-fetched source): `pasky/speedread` carries `$ORPloc = 0.35; $ORPmax = 0.2` — a proportional rule, a *third* kind. R2's table lists speedread as "same as patent". | R1 re-read the file during its audit pass and R2 did not. Trust R1. Cheap to settle: one fetch. Low stakes — we are not copying speedread's rule — but it is the kind of error that propagates. |
| 2 | **R3 says numeric corruption is undetectable; R4 says digit-multiset diffing detects it.** | Both correct, different scopes. R3 means *within tier 1*; R4 means *across tiers*. The gap between the two scopes is problem 1 above, and it is the most consequential thing in this synthesis. |
| 3 | **R3 recommends per-page escalation; R4's error rates are per-page but its throughput case assumes batch.** R4's "roughly one page in ten materially wrong" is a rule pass rate over 169,011 rules, not a page pass rate — R4 flags this as an inference, not a measurement. | Do not build a cost model on it. The escalation base rate is unknown (problem 4) and the tier-2 page error rate is unmeasured on our corpus. Two unknowns, not one. |
| 4 | **R2 recommends stealing the patent's sentence-length-scaled pause (×1.0/2.2/3.3); R1 says no variable-dwell scheme has ever demonstrated a comprehension benefit.** | Not a contradiction — R2 offers an engineering pattern, R1 says it is unvalidated. Ship it, expose it in `config/timing.json`, and label its justification as *comfort and working-memory load*, not comprehension. R1 independently supports the *shape*: sentence-final elevation is real (+48 ms gaze, +121 ms regression-path) and a boundary pause buys back a regression RSVP forbids. |

### Within-dossier, unresolved, and decision-relevant

- **R1:** whether the comprehension literature conflicts at all. With Hester 2016
  downgraded to UNVERIFIED (bibliographic record confirmed, quoted finding unretrievable),
  R1's "the literature disagrees" framing rests on one paper the auditor could not read.
  If Hester does not say what was claimed, Benedetto and Acklin & Papesh agree and **the
  case against high-speed RSVP is stronger, not weaker.**
- **R1:** zero evidence exists — after four independent sweeps — on how numerals,
  equations, tables or citation strings behave under RSVP. The only proxy is a ~2×
  multiplier derived from **six Italians reading random word lists aloud with no
  comprehension measure**. For a numeric-fidelity reader this is the central question and
  the literature does not touch it.
- **R3:** tagged-PDF prevalence in academic PDFs. The mechanism is confirmed in both stacks
  (`includeMarkedContent` in pdf.js, per-object `mcid`/`tag` in pdfplumber); if prevalence
  is high, reading order is a *lookup* rather than a heuristic and a large part of the
  pipeline gets simpler. Nobody has measured it. Cheap to settle on our own corpus.
- **R4:** whether FP8 tensor cores are reachable on a 5090 under WSL2. Both the FP8
  warning and the "~30% WSL2 tax" trace to **one closed, un-triaged comment by one person**,
  contradicting a merged CUTLASS kernel validated on a 5090. Must be benchmarked on this
  box, not researched further.

---

## What Phase 0 settled — and what it moves earlier

Several things are now cheap that the plan scheduled as hard, and several Phase 3 concerns
turn out to belong in Phase 2.

**Gate 2's first question is already answered.** "Does the pivot column sit still" is
`grid-template-columns: 1fr auto 1fr` with `min-width:0` on the side tracks and
`flex-shrink:0` on the pivot — zero measurement, zero forced layout, proportional fonts,
and immune to the canvas-`measureText`-vs-DOM-shaping mismatch that makes the two
measured implementations subtly wrong. Do not build the measured-metrics approach the
plan contemplated.

**Do not spend design budget on the pivot at all.** ORP alignment vs plain centring is
**ω² = 0.00** on comprehension, workload, alpha power and theta power in the only
controlled test — a design that detected large *speed* effects on the same measures.
Independently, the OVP effect **inverts** in three large reading corpora (fixation duration
is *greatest* at word centre), from O'Regan's own lab, the source the whole ORP story is
built on. Centre the word, colour the pivot as a UI affordance, move on.

**Four Phase-3 items belong in the Phase 2 vertical slice**, because they are cheap and
because they are what every competitor got wrong:

1. **Numeric tokenization.** *Every* shipped RSVP reader surveyed corrupts numbers in the
   tokenizer: Squirt splits `3.14` into two slides; Sprint Reader merges `Table 2, 15` into
   `2,15`; zotero-rsvp deletes `±` and `=` while keeping the operands; jetzt splits
   `doi:10.1038/nature12373` into three tokens. The shared property of the worst cases is
   that **the output looks plausible.** If the slice's tokenizer is wrong here, every later
   test is built on sand. Rejoin numeric and abbreviation tokens *before* sentence
   segmentation, or a decimal point fires a 450 ms "sentence end".
2. **Duration normalization**, so the displayed WPM is the delivered WPM. Otherwise Gate 2
   asks a human to judge pacing at a rate the app is lying about by 20–25%.
3. **Pause on `visibilitychange`.** Zero of the surveyed projects do it; alt-tab away and
   they silently burn your position. Two lines.
4. **Rewind as a first-class control, not a convenience.** Removing regressions costs
   84% → 71% comprehension *globally* — and readers stop attempting repairs rather than
   failing at them, so the loss is silent. RSVP is also auto-updating text under
   **WCAG 2.2 SC 2.2.2, a Level A criterion**. jetzt's semantic rewind (back 5 words, then
   walk to the sentence start) is the pattern.

**One data-model decision buys five features.** R2 and R3 point at the same field
independently: carry `(page, charStart, charEnd)` into the page's extracted text on every
token. Reedy preserves exactly this and gets context strip, progress and click-to-seek for
free; zotero-rsvp's `pageOffsets[]` gives page-aligned seek. Combined with a tier tag it
also satisfies "every token carries tier provenance" and "resume returns to the exact
word" with no extra machinery. This should be in the frozen contract.

**Scheduling has a floor nobody can design past.** At 800 WPM a word is 75 ms = 4.5 frames
on 60 Hz, so consecutive words alternate 66.7/83.3 ms — **±11% regardless of timer
quality**. Frame-exact rates on 60 Hz are 3600/k: 300, 400, 450, 600, 720, 900. On a
120 Hz ProMotion MacBook panel 800 WPM is exactly 9 frames and clean — but dirty on an
attached 60 Hz monitor. Worth knowing before someone spends a week on a drift compensator.

---

## Recommended amendments to the plan

1. **Add a third always-on cheap tier for numeric verification** (a small CTC recognizer
   over digit spans in detected numeric/table regions), rather than treating numeric
   fidelity as a property of the escalation classifier. Phase 1 decides this.
2. **Reconcile the two acceptance criteria in conflict** (escalate-exactly-3-pages vs
   numerals-match-exactly). As written they cannot both hold.
3. **Assign the broken-page collection task** (30–50 real broken academic pages with known
   correct text). It is currently nobody's, and W1's golden set does not cover it.
4. **Move numeric tokenization, duration normalization, `visibilitychange` and rewind into
   Phase 2**, and make the Gate 2 check include a numeric passage, not only prose.
5. **Add a delivered-WPM measurement harness** to Phase 2, so Gate 2's pacing judgement is
   made against a true rate.

---

## Gate 0 decision needed from you

**Which product?** (problem 2) — comprehension reader at ≤300 delivered wpm, skimmer at
400–800, or ADHD-first at ~240. My recommendation is the comprehension reader with an
explicit skim mode. This changes what Phase 1 specs and roughly halves Phase 3 if the
answer is "skimmer".

**Is a share-alike-on-output licence acceptable?** (problem 5) — if yes, Chandra is the
accuracy-optimal tier-2 model and R4's recommendation changes. If no, the pick is between
PaddleOCR-VL-1.6 and LightOnOCR-2-1B and must be settled by a local harness run, not by
more reading.

**Does the numeric-verification tier get built?** (problem 1) — it is the difference
between "numerals match exactly" being an acceptance criterion and being an aspiration.
