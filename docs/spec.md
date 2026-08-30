# RSVP Reader — Specification

*Orchestrator, 2026-08-29. Phase 1. Resolves every architectural decision the
orchestration plan lists, grounded in `docs/research/`. Read `docs/research/synthesis.md`
first — it explains why several of these decisions differ from what the plan assumed.*

Citations here are shorthand into the dossiers: **[R1]** perception, **[R2]** prior art,
**[R3]** tier 1, **[R4]** tier 2. Each dossier carries the primary source links.

---

## 0. What this is

A local-first RSVP reader for academic PDFs. Reader runs on a MacBook. A Windows box
with one RTX 5090 is a separate, optional extraction host reachable over HTTP.

**Product stance — RESOLVED at Gate 2, then revised by [R5].** The owner's goal is to read
faster and skim more easily, pitched publicly as such, *"if it's accurate enough."* That
condition turned out to be load-bearing. A fifth research pass
(`docs/research/reading-speed-mechanisms.md`) tested the premise and it did not survive:

- **Subvocalization is not the bottleneck.** Articulatory suppression is the decisive test
  — occupy the speech machinery and reading comprehension degrades while *speed does not
  move at all*. Silent reading rate correlates ρ = −.03 with maximum articulation speed.
- **The ceiling is amodal language throughput**, not eyes and not mouth: 269 wpm reading
  ≈ 270 wpm listening in the same people on matched texts, breaking down at 315 wpm.
- **RSVP does not remove inner speech anyway**, and nobody has measured it at app rates.
- **RSVP loses to ordinary skimming**, verified from the primary source, and loses worst on
  the find-the-answer task that a skimming tool exists to serve.

**Therefore the product is two features, not one.**

| Feature | Built on | Default | Claim |
|---|---|---|---|
| **Read** | RSVP | **300 wpm delivered** | a *pacer* — above the 238 wpm adult average, inside the tested parity band |
| **Skim** | document **structure** — headings, first sentences, highlights | n/a | information-seeking, *not* RSVP at high speed |

**Skim mode must not be RSVP at 800 wpm.** That is the one configuration measured to be
worse than just looking at the page. Build it on the structural pass in §7, which already
produces the labels it needs.

Marketing claims are constrained by prior FTC action against this exact claim class. The
supportable and unsupportable lists are in `docs/research/reading-speed-mechanisms.md` §7
and are binding on any copy this project ships.

---

## 1. Stack

**Recommendation: TypeScript + Vite, plain web app. No Electron, no Tauri, no Rust, for v1.**

| | **A — Vite + TS web app (chosen)** | **B — Tauri 2** |
|---|---|---|
| Gate 2 on the Mac | `npm i && npm run dev` | install Rust, build, sign |
| Cross-platform | free | per-platform builds |
| PDF path | `pdfjs-dist` in-process, Apache-2.0, zero runtime deps [R3] | same |
| Library on disk | thin Node sidecar in the Vite process | native, better |
| Packaging | none (v1 non-goal) | real app bundle |

The decisive argument is Gate 2. **Only you can judge whether the pivot sits still and
whether the pacing feels right, and you judge it on the Mac.** Anything that puts a
toolchain between you and that judgement is the wrong choice. Option B stays available
later because the frontend is the same code either way — Tauri wraps a web frontend.

Rejected: **Electron** (Tauri strictly better if we ever want a bundle); **React** (the
render surface is one word — a framework's diffing is pure overhead on the hot path);
**File System Access API** for the library (Chromium-only, and Safari is on the target
machine).

**Library on disk without a browser sandbox.** A small Node sidecar runs inside the Vite
dev server and owns `~/RSVP/library`. It serves documents and persists position. It is
*not* in the reading path — once a document is loaded, the reader runs entirely
client-side. Killing the sidecar mid-read must not interrupt playback.

---

## 2. Deployment boundary

**Tier 2 is an HTTP boundary. Decided now, not later.**

```
MacBook (reader)                      Windows box (rig, optional)
  pdf.js tier 1        ── HTTP ──▸    vLLM, OpenAI-compatible
  classifier                          /v1/chat/completions
  normalization                       PaddleOCR-VL-1.6 or LightOnOCR-2-1B
  token stream                        (Linux/WSL2 — vLLM is Linux-only [R4])
  render
```

vLLM under Linux/WSL2 is the only serious option on sm_120: SGLang's own SM120 plan still
lists core kernels unfinished, and llama.cpp has an open fine-grained-OCR regression [R4].

**Reading never blocks on the rig.** Extraction is a pre-reading step whose results are
cached. Three offline behaviours, and they are different:

| Page state | Rig offline | Reader behaviour |
|---|---|---|
| Tier 1 clean | n/a | normal |
| Tier 1 usable, classifier escalated | not escalated | **readable**, tokens carry `suspect: true` + reason, shown as a marker in the UI |
| No text layer at all | cannot extract | **placeholder block** — one beat in the stream that halts playback and says "page N needs extraction" |

The placeholder pattern is khlebobul's `PauseableBlock`, keyed by word index, not by
string match [R2]. On resume it advances *past* the placeholder so Space feels instant.

The document record lists unresolved pages, so re-running when the rig is up processes
only those pages, never the whole file.

**Numeric fidelity does not have a tier-2 answer, and this is the most important
paragraph in the spec.** See §5.

---

## 3. Ingestion pipeline

Per page, in order. Tier 1 always runs first.

```
PDF ─▸ pdf.js getTextContent (per page, includeMarkedContent: true)
    ─▸ geometry pass      : lines, columns, reading order
    ─▸ classifier         : escalate this page? (§4)
    ─▸ [tier 2 if escalated and rig reachable]
    ─▸ divergence check   : where both ran (§6)
    ─▸ structural pass    : label blocks (§7)
    ─▸ normalization      : ligatures, dehyphenation, sentence segmentation (§8)
    ─▸ token stream       : the frozen contract (§9)
```

**Escalation is per page, never per document.** A 40-page paper with 3 image-only pages
escalates 3 pages.

**Extraction runs where the file is.** Tier 1 in the reader via pdf.js — no Python, no
AGPL, and it works with the rig switched off. PyMuPDF/pypdfium2 on the rig are for batch
and for the cross-engine work in §5, never in the interactive path. Note the licence
trap: **PyMuPDF is AGPL-3.0/commercial and Artifex names the client→server shape as the
trigger** [R3]. pypdfium2 (Apache-2.0/BSD-3) is the drop-in if that ever becomes real.

**Two pdf.js behaviours the pipeline must handle** [R3]: item boundaries are unstable
(`"Johns"` can arrive as `"Jo"` + `"hns"`, or a whole line as one item with no spaces), and
`getTextContent` replaces all whitespace with U+0020 — so **tables and columns must be
found geometrically from `transform[4]` and `width`, never from the string**.

---

## 4. The escalation classifier

Adopt R3's design as specified, with its calibration debt intact and visible.

**Stage A — structural hard gates, any-of, no scoring.** `no_text` (<100 interior chars,
12.5% page inset) · `scanned` (bitmap coverage >0.75 AND interior chars <500) ·
`broken_encoding` (Identity-H without ToUnicode, or Type-3 only) · `replacement_chars`
(U+FFFD + `(cid:N)` > 2) · `vector_text` · `too_complex`.

**Stage B — weighted text-quality terms, escalate at score ≥ 2.**

| Term | Rule | Weight |
|---|---|---|
| `dict_low` | dictionary hit rate over **lowercase-initial** alpha tokens (len ≥ 3) < 0.85 | 2 |
| `runtogether` | fraction of whitespace chunks > 15 chars > 0.03 | 2 |
| `oversplit` | fraction of alphabetic chunks len ≤ 2 > 0.23 | 2 |
| `wordlen_odd` | mean alpha-token length outside [4.8, 7.5] | 1 |
| `lowalnum` | alphanumeric ratio < 0.80, after collapsing leader runs | 1 |

Three non-obvious requirements, each of which is a bug if skipped:

1. **`dict_low` must be skipped, not failed, when `/Lang` is absent or non-English.**
   Otherwise every non-English page escalates — a 100% false-positive rate on a document
   class the calibration never touched [R3].
2. **Fold U+017F → `s` before the dictionary lookup.** pdf.js correctly maps `ﬅ` to `ſt`
   (U+017F), which appears in no ASCII wordlist, silently depressing the hit rate [R3].
3. **Collapse leader runs** (`(?:[.·•…_\-]\s*){3,}`) before the alphanumeric ratio, or
   dot-leader tables of contents escalate as garbage [R3].

**Carry raw signal values in the output, not just booleans.** Re-calibrating thresholds
must not require re-parsing every PDF.

**Calibration debt, stated so it is not forgotten.** These thresholds were measured on
414–432 clean academic pages against *synthetic uniform-random* corruption. Real failures
are correlated — a whole font breaks at once. The measured 4.6–6.0% false-positive rate
is an optimistic upper bound [R3]. **Collecting 30–50 genuinely broken academic pages with
known-correct text is the highest-value task in the project and is currently unassigned.**

---

## 5. Numeric fidelity — the honest answer

**The problem.** Digit substitution preserves token length, whitespace structure,
alphanumeric ratio, word-length distribution and dictionary hit rate exactly. R3 measured
it: randomising 100% of digits across 414 real academic pages flagged **zero** additional
pages. The classifier in §4 is structurally blind to this. A wrong `/ToUnicode` CMap emits
plausible text with no artifact, and every engine reading that CMap gets the same wrong
answer — so cross-*engine* diffing does not detect it either. The only detector is an
independent **visual** read.

**What we do NOT do:** commit now to building a CTC verification tier, or escalate every
digit-bearing page to the VLM. Both are expensive answers to a question with **no measured
base rate**. R3 is explicit that no published base rate exists for broken encodings in
modern academic PDFs.

**What we do, in order:**

1. **Ship the honest flag.** Every token derived from a page containing digits, where no
   independent visual read occurred, carries `numericVerified: false`. The UI shows it.
   This is an admission, not a mitigation, and it is labelled as one.
2. **Measure the base rate.** Run the stage-A `broken_encoding` gate across a few thousand
   corpus PDFs. This is cheap, local, and settles the question. **Owner: W2, Phase 3.**
3. **Then decide**, from the number:
   - Base rate ≈ 0 → ship the flag, build nothing. Most likely outcome.
   - Material → escalate digit-bearing pages to tier 2 and diff digits (§6). A policy
     change, zero new components.
   - Material *and* tier-2 cost is prohibitive → then, and only then, a small CTC
     recognizer over digit spans. R4 found **PP-OCRv6_medium, 34.5M params, tops the only
     published hallucination benchmark at 93.20, beating a 235B VLM by 12.6 points**,
     because CTC decoding is grounded in visual features rather than language priors. It
     is the right tool, and it is not needed yet.

**This resolves the conflict between two of the plan's acceptance criteria.** "Escalates
exactly 3 pages" and "numerals match exactly across all golden files" cannot both hold if
numeric verification is folded into escalation. Separating them lets both stand: escalation
stays need-based, numeric verification is its own measured decision, and until it is made
the reader tells the truth about what it has not checked.

---

## 6. Divergence check

Only on pages where both tiers ran.

**Primary metric: digit-multiset delta**, after stripping page numbers and superscript
reference markers. It is the only cross-check with a shipping, published precedent
(ParseBench `bag_of_digit_percent`) and it is **order-invariant**, so it survives
dehyphenation, column reordering and header stripping — the legitimate differences that
dominate tier-1-vs-tier-2 diffs [R4]. Known blind spot, stated by its authors: it cannot
see a swap between equally frequent digits, and it cannot localise which number is wrong.

**Secondary, engineering judgement, unvalidated:** `len(tier2)/len(tier1)` outside an
empirical band (catches truncation and looping in one number); hapax recall from tier 1
into tier 2.

**Do NOT use whole-page edit distance.** Rejected by two independent benchmark teams; a
semantically correct table scored 0.63 TEDS / 0.56 edit distance purely for emitting HTML
instead of LaTeX — a ~44% penalty for zero semantic error [R4].

**Disposition on high divergence with a good tier-1 text layer:** log it, **prefer tier 1**,
mark the page `suspect`. Fabrication is more likely than a tier-1 fault when the text layer
was healthy enough to score clean.

**Mandatory tier-2 guards regardless of model** [R4]: `finish_reason != 'stop'`; trailing
repeated n-gram > 30; non-target-script characters in English output; a blank/near-blank
ink-density gate **upstream** of the model (never send a blank page to a model that was not
trained on them); `--no-enable-prefix-caching --mm-processor-cache-gb 0`; explicit
`--max-model-len`. And **override olmOCR's `max_page_error_rate=0.004`** if reusing that
pipeline — a 250-page book with two bad pages yields nothing, which is right for
corpus-building and exactly wrong for a reader.

**Do not feed tier-1 text into the tier-2 prompt.** Ai2's own ablation puts document
anchoring inside the noise band and *negative* on tables; olmOCR 2's shipped prompt is
image-only. Anchoring a narrowly fine-tuned model is off-distribution input — the exact
condition that produced its blank-page hallucination bug [R4].

---

## 7. Structural pass

Separate from OCR. Text in, label out.

**Label set (frozen):** `body` · `heading` · `page-header` · `page-footer` · `page-number`
· `caption` · `footnote` · `reference-entry` · `equation` · `table` · `list-item` · `code`.

**Disposition in the stream:**

| Label | Disposition |
|---|---|
| `body`, `heading`, `list-item` | **inline** — tokens in the stream |
| `page-header`, `page-footer`, `page-number` | **skip** — never enter the stream |
| `caption`, `footnote`, `reference-entry` | **queue** — placeholder beat, reachable on demand |
| `equation`, `table`, `code` | **queue** — placeholder beat, rendered whole when reached |

The skip set is not cosmetic. The most concrete failure report in the prior art is a
scholar in 2014 watching a reader recite the JSTOR stamp — *"This content downloaded
from … All use subject to JSTOR Terms and Conditions"* — once per page, into the word
stream. Twelve years later no surveyed project has fixed it [R2].

`queue` exists because flattening a table into reading order is, in an implementer's
words, *"worse than useless"*, and because a caption read aloud with no figure in sight is
noise [R2].

**Known gap, surfaced at Gate 2 and deliberately left open.** `Boundary` cannot express
"a paragraph break that is *not* a sentence end" — a heading. The plain-text tokenizer
stamps `'paragraph'` on the last token before a blank line regardless of terminator, so a
heading takes a full scaled sentence pause plus the paragraph pause, and
`sentence_len_scale` counts the heading's own words. On plain text that is 5 tokens in 467
and invisible. **On a PDF with many short headings it will be conspicuous**, and the fix
belongs with the structural pass, which is the thing that knows what a heading is: label
`heading` blocks and let the timing model give them their own pause rather than inferring
one from punctuation. W3 and the Phase 4 labeller own this jointly. Recorded rather than
patched now, because patching it before the labeller exists means guessing.

**v1 uses deterministic labelling, not a model.** Headers and footers are recoverable by
cross-page repetition in the top/bottom bands (normalise, digits → `\d+`, hash, drop lines
recurring on ≥3 pages or ≥60% of same-parity pages). Captions, equations and tables come
from geometry and font signals. The learned classifier is Phase 4, as the plan has it.
**Note the label set and dispositions are frozen now** so Phase 4 swaps the labeller
without touching the stream contract.

---

## 8. Normalization

**Unicode:** NFKC. Safe and unconditional — the presentation-form ligatures exist only for
legacy round-tripping and Unicode's own guidance discourages them [R3]. pdf.js already
does this in the worker unless `disableNormalization` is set.

**Dehyphenation:** a line-final hyphen is a soft break (merge) or a mandatory compound
hyphen (keep). Dictionary lookup gets ~86%; word-level logistic regression 92.38% [R3].
Use the dictionary; **the named trap is merging `sugar-free` into `sugarfree`**, so keep the
hyphen when both fragments are independently in the dictionary. This is a ~90%-solvable
local repair whose residual is a word error, not a numeric one — **it is not an escalation
trigger.**

**Sentence segmentation must survive** `Dr.` · `e.g.` · `i.e.` · `et al.` · `Fig.` · `Eq.` ·
`vs.` · `3.14` · `1,234.56` · `[12]` · `10.1038/nature12373` · `U.S.` · initials `J. R. R.`

**Order matters and is the single most common bug in the prior art: rejoin numeric and
abbreviation tokens BEFORE classifying sentence boundaries.** Otherwise a decimal point
both splits `3.14` into two slides and fires a full sentence-end pause in the middle of a
number. Every shipped reader surveyed gets some version of this wrong — Squirt splits
`3.14`; Sprint Reader merges `Table 2, 15` into `2,15`; zotero-rsvp deletes `±` and `=`
while keeping the operands; jetzt splits a DOI into three tokens. **The shared property of
the worst cases is that the output looks plausible** [R2].

---

## 9. Chunking

**One word per beat. Multi-word chunking is not built in v1.**

No retrieved evidence supports multi-word chunks, single-word makes the pivot-stability
guarantee trivial, and word skipping — which is what multi-word chunking imitates — is
*not* discarding: deleting the words readers normally skip makes comprehension "suffer
rather dramatically" [R1].

**Long words split** at > 13 characters, into fragments of ≤ 8, **with a connector
hyphen** appended to every continued fragment and a `continuation: true` flag. Sprint
Reader does this and jetzt and Reedy do not, so their readers see two apparent words [R2].
**Splitting is suppressed for numeric tokens**, where fragmentation is most dangerous.

**Pivot index:** the patent rule, `ceil((L−1)/4)` capped at 4, computed on the
**punctuation-stripped, grapheme-segmented** token. Grapheme segmentation via
`Intl.Segmenter` — only 2 of 10 surveyed implementations do this; the rest index UTF-16
code units and split surrogate pairs, which is exactly the maths symbols and combining
diacritics academic text is full of [R2].

**Treat the pivot as a UI affordance, not a comprehension feature.** ORP alignment vs
plain centring is **ω² = 0.00** on comprehension, workload, alpha and theta in the only
controlled test — in a design that detected large *speed* effects on the same measures.
Independently, the underlying OVP effect **inverts** in three large reading corpora [R1].
We implement it because it is nearly free and it is a recognisable affordance, not because
it works.

---

## 10. Timing model

Every coefficient below lives in `config/timing.json` and is runtime-tunable. The names
here are the keys there.

```
base_ms   = 60000 / target_wpm

word_i    = base_ms × length_mult(len_i) × numeric_mult(token_i)
pause_i   = boundary_pause_ms(token_i)          ← 0 when boundary === 'none'

dwell_i(s) = min(word_i × s, word_dwell_ceiling_ms) + pause_i × s

solve s such that  Σ dwell_i(s) = n_words × base_ms      ← duration normalization
```

`Σ dwell_i(s)` is monotonic non-decreasing in `s`, so bisection finds it in ~40 iterations.

**Correction, made during the Gate 2 verification:** an earlier draft of this section said
the target becomes physically unreachable below `60000 / word_dwell_ceiling_ms` (≈171 wpm).
That was true of the *old* formula and is false of this one — `pause_i × s` is unbounded in
`s`, so on any punctuated stream an exact solution exists at every rate. The solver must
still report the achievable rate honestly in the one case where the schedule genuinely
saturates: a stream with no boundary pauses at all, every word clamped.

**What actually happens at low rates, and why it is correct.** The word ceiling forbids
slowing RSVP by holding words longer, so the remaining budget lands in the boundary pauses.
That is exactly the published guidance — *"slower reading in RSVP should be achieved by
increasing pauses between sentences or by repeating sentences, not by decreasing the
within-sentence presentation rate"*, because a word left up too long re-invites the eye
movements RSVP exists to remove [R1]. Measured on the Phase 2 fixture, the longest single
dwell is 1.46 s at 250 wpm and 2.04 s at 150 wpm — both fine — and **8.78 s at 100 wpm**,
which is not reading. Hence `min_wpm = 150` in `config/timing.json`. The model degenerating
below that is honest information, not a defect to paper over.

**AMENDED at Gate 2.** The ceiling was previously applied to the *total*. Measured on the
Phase 2 fixture at 250 wpm, that put comma, sentence and paragraph dwells all at exactly
350 ms — the reader got the same pause at a comma as at a paragraph break — and
`sentence_len_scale` changed **0 of 467 dwells** across the whole 100–400 wpm reading band.
The 350 ms grounding is about how long a *static word* may hang before the eye starts
saccading around it; a deliberate between-sentence rest is a different thing and the
evidence wants it longer. Clamp the word, never the pause.

**`boundary === 'paragraph'` implies a sentence end**, so it takes
`pause_sentence_ms × sentence_len_scale(...) + pause_paragraph_ms`. Treating them as
mutually exclusive gave the largest structural break a *shorter* pause than a long
sentence end.

**Duration normalization is not optional.** Without it, "400 wpm" in the UI delivers
~300 wpm, and every shipped implementation surveyed lies by 20–25%. Spritz patented and
described it; nobody copied it [R2]. It also makes Gate 2 meaningful — you cannot judge
pacing at a rate the app misreports.

| Key | Default | Grounding |
|---|---|---|
| `target_wpm` | **250** | costs appear at 230–305 *delivered* wpm in the only dose-response study [R1] |
| `length_mult` | `≤7 → 1.00`, `8–13 → 1.15`, `>13 → 1.30` | empirical target is **1.11× (gaze) to 1.36× (adjusted gaze)** for 11 vs 5 letters [R1]. The Spritz patent's 1.0/1.3/1.6 is the only shipped scheme in range; ours sits mid-band |
| `numeric_mult` | **2.0** | context-free tokens needed ~2× dwell at matched accuracy [R1]. **Weak proxy — n=6, Italian, oral reading, no comprehension measure.** A factor of two, not five |
| `pause_comma_ms` | 120 | additive, after the word |
| `pause_sentence_ms` | 320 | sentence-final elevation is **+48 ms gaze, +121 ms regression-path** [R1]; a boundary pause buys back a regression RSVP forbids |
| `pause_paragraph_ms` | 500 | |
| `sentence_len_scale` | `≤7 words → 1.0`, `8–22 → 2.2`, `>22 → 3.3` | multiplies `pause_sentence_ms`. Patent Fig. 5b — scales with working-memory load rather than punctuation mark. Published, copied by nobody [R2] |
| `word_dwell_ceiling_ms` | **350** | above this you are inside the 200–330 ms temporal-crowding window and past where readers start saccading around a static word [R1]. **Word component only** — see the amendment above |
| `interword_gap_ms` | 0 | exposed, not hard-coded. A blank interval after an attended item is the one manipulation shown to abolish the attentional blink — **letters and a detection task, so transfer to word streams is UNVERIFIED** [R1] |
| `resume_ramp_ms` | 600 | first word after unpause. **No experimental support anywhere.** Ship as comfort, label it as comfort [R1] |
| `rewind_backoff_words` | 5 | jetzt's semantic rewind [R2] |

**Explicitly not built, each with a reason:**

- **No frequency or surprisal term.** The real effect is **2–4 ms per bit**; a 10-bit swing
  — roughly `the` vs a rare technical term — buys 20–40 ms total. Sprint Reader's
  12.3 ms/bit is 3–6× too steep and in that mode the WPM control does nothing at all [R1].
- **No shortened dwell for common function words.** Tested, disliked, suspected harmful by
  its own authors, and the effect size does not support it [R1].
- **No floor clamp on dwell.** A floor would silently ignore the user's speed setting. At
  800 wpm a word is 75 ms, below the practical recognition floor for connected prose
  (~115–223 ms) — that is real, and the UI says so rather than the timing model pretending
  otherwise.

**The calibration debt.** The only direct test of variable dwell against constant dwell
found preference, **no comprehension gain, and a speed loss** — and nothing in 25 years has
compared them at a matched mean delivered rate [R1]. Every coefficient above is therefore
a judgement, which is precisely why they are all in one JSON file: `config/timing.json` is
the apparatus for the experiment nobody has run.

---

## 11. Rendering

**The pivot glyph must not move one pixel between words.** Mechanism:

```css
.word { display: grid; grid-template-columns: 1fr auto 1fr; }
.before, .after { min-width: 0; }
.before { text-align: right; }
.after  { text-align: left; }
.pivot  { flex-shrink: 0; }
```

Three spans, one grid, **zero measurement**. The pivot column is `auto` and centred by two
equal `1fr` tracks, so its position is a property of the layout, not of a computed number.

**Why not measured positioning.** Both surveyed implementations that measure with canvas
`measureText` are subtly wrong: the canvas font string omits weight, style and
letter-spacing, and `measureText` measures the prefix as one shaped run *including internal
kerning* while the DOM renders it as isolated per-span glyph advances. Shaping behaviour is
not specified, so the mismatch is not resolvable from spec [R2]. The grid has no such
failure mode and costs nothing.

**Scheduling.** Absolute-timeline accumulator over `performance.now()`, not chained
`setTimeout` — chained timeouts re-arm from the callback's own start, so lateness
accumulates instead of cancelling [R2]. Paint on `requestAnimationFrame`.

**The floor nobody can design past.** At 800 wpm a word is 75 ms = 4.5 frames on 60 Hz, so
consecutive words alternate 66.7/83.3 ms — **±11% regardless of timer quality**. Frame-exact
rates on 60 Hz are `3600/k`: 300, 400, 450, 600, 720, 900. On a 120 Hz ProMotion panel
75 ms is exactly 9 frames and clean; the same rate is dirty on an attached 60 Hz monitor
[R2]. Do not build a drift compensator before measuring.

**Pause on `visibilitychange`.** Zero of the eighteen surveyed projects do this; alt-tab
away from any of them and the reader silently burns your position [R2]. Two lines.

**Nothing renders near the fixation point during playback.** The whole format rests on the
eye never leaving one spot; a toast or a tooltip beside the word forces exactly the saccade
the design exists to remove [R2]. Context strips are paused-only.

**Honour `prefers-reduced-motion`:** start paused, default to a lower rate. Whether RSVP is
a vestibular trigger is unverified either way, but the query costs two lines and the failure
mode of ignoring it is worse than the failure mode of respecting it [R2].

---

## 12. Controls

| Action | Key | Notes |
|---|---|---|
| Play / pause | `Space` | **WCAG 2.2 SC 2.2.2 is Level A** — auto-updating text must be pausable [R2] |
| Rewind one word | `←` | |
| Rewind one sentence | `Shift+←` | back `rewind_backoff_words`, then walk to the sentence start [R2] |
| Rewind one paragraph | `Alt+←` | |
| Speed ± | `↑` / `↓` | must **not** restart the in-flight dwell — two surveyed implementations do, and a held arrow key freezes the display indefinitely [R2] |
| Skim mode | `S` | jumps to the labelled high-rate preset |

**Rewind is mandatory and it is an accessibility feature, not a convenience.** Removing
regressions costs comprehension **84% → 71%**, *globally* rather than only on hard
sentences, and the failure is silent — readers stop attempting repairs rather than failing
at them [R1]. Rewind is the only replacement RSVP offers, and the literature is clear it is
an inferior one: an existing "go back" button "merely starts the text over from the
beginning" and has never been shown equivalent to eyes with a spatial memory of the page
[R1]. Rewind-by-sentence with surrounding text visible is the closest available.

---

## 13. Data model

```
~/RSVP/library/
  <contentHash>/
    source.pdf
    extraction.json      ← conforms to src/contracts/extraction.schema.json
    position.json        ← { tokenIndex, updatedAt }
  index.json
```

**Cache key: `contentHash` (SHA-256 of file bytes) + `pipelineVersion`.** A pipeline
version bump invalidates the extraction and not the position — position is stored as a
`(page, charStart)` pair as well as a token index, so it survives re-extraction.

**Resume returns to the exact word** because every token carries `(page, charStart,
charEnd)` into that page's extracted text.

**That one field buys five features.** R2 and R3 arrive at it independently. Reedy carries
`startIndex`/`endIndex` through its whole pipeline and gets context strip, progress and
click-to-seek for free; zotero-rsvp's `pageOffsets[]` gives page-aligned seek [R2]. With a
tier tag alongside it, it also satisfies "every token carries tier provenance". This is the
highest-leverage decision in the contract.

**Provenance is per token, not per document:** `tier: 'tier1' | 'tier2' | 'placeholder'`,
plus `suspect` and `numericVerified`.

---

## 14. Rejected alternatives

| Rejected | Why |
|---|---|
| Electron / Tauri for v1 | a toolchain between you and Gate 2. Tauri stays available — same frontend |
| React on the render path | the surface is one word; diffing is overhead |
| Multi-word chunks | no evidence supports them, and skipping is not discarding [R1] |
| Frequency/surprisal dwell term | real effect is 2–4 ms/bit; shipped implementations over-apply by 3–6× [R1] |
| Shortened dwell on function words | tested, disliked, suspected harmful by its authors [R1] |
| Canvas `measureText` pivot positioning | shaping/kerning mismatch, unresolvable from spec; the grid is free [R2] |
| Chained `setTimeout` | structurally late-biased; lateness accumulates [R2] |
| Whole-page edit distance for divergence | rejected by two benchmark teams; punishes legitimate reformatting [R4] |
| Document anchoring into the tier-2 prompt | inside the noise band, negative on tables, off-distribution [R4] |
| INT4 quantization | preserves glyphs, degrades *numbers* — MGSM 92.04% recovery [R4]. Use FP8 |
| Qwen2.5-VL-32B | worse than the 7B on DocVQA and CC-OCR at 2× the VRAM [R4] |
| Chandra / Surya / Marker weights | licence, **not** quality — share-alike extends to the *Output*, i.e. the extracted text. Chandra tops both harnesses it appears on. Reversible if you accept those terms [R4] |
| Building a CTC numeric tier now | answers a question with no measured base rate. Measure first (§5) |
| A learned structural classifier in v1 | deterministic labelling covers the disqualifying failure (headers in the stream); Phase 4 as planned |

---

## 15. Open questions this spec does not close

1. **Which product** (§0) — decided at Gate 2, from reading, not argument.
2. **Numeric base rate** (§5) — W2, Phase 3. Gates whether a verification tier exists.
3. **Tier-2 model** — PaddleOCR-VL-1.6 vs LightOnOCR-2-1B is not settleable from published
   sources; the two harnesses invert the ranking and disagree hardest on long numeric
   tables. **Local harness run, not more reading** [R4].
4. **FP8 on the 5090 under WSL2** — the warning and the "~30% WSL2 tax" trace to one closed,
   un-triaged comment contradicting a merged kernel validated on a 5090 [R4]. Benchmark it.
5. **Tagged-PDF prevalence** on the corpus — if high, reading order is a lookup rather than
   a heuristic and §3 gets simpler. Cheap to measure [R3].
6. **30–50 genuinely broken pages** — unassigned, and every classifier number depends on it.
