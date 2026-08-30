# Phase 2 handoff — vertical slice

Plain text → tokenizer → timing model → renderer → play/pause/speed/rewind.
No PDF, no model, no library, no persistence.

---

## 1. What was built

| Path | What it does |
|---|---|
| `src/stream/graphemes.ts` | `Intl.Segmenter` wrapper. Every length and index in the stream layer is a grapheme count, never a UTF-16 code unit. |
| `src/stream/tokenize.ts` | Plain text → `Token[]`. Whitespace-only cutting, then numeric/abbreviation classification, then sentence boundaries — in that order. Long-word splitting, pivot index. |
| `src/stream/timing.ts` | `computeTiming(TimingInput) → TimingResult` per spec §10, including duration normalization and the ceiling clamp. Also exports `rawDwellsMs` so tests can measure the un-normalized schedule. |
| `src/render/word.ts` | Three spans in a `1fr auto 1fr` grid. Zero measurement. |
| `src/render/player.ts` | Absolute-timeline accumulator over `performance.now()`, painted on `requestAnimationFrame`. |
| `src/app/main.ts` | Loads `sample.txt`, wires keys, HUD, `visibilitychange`. Starts paused. |
| `src/app/style.css` | Dark, serif, ~48px word. All status at the screen edges. |
| `fixtures/sample.txt` | 450 words of real prose on the distributional hypothesis, carrying every hazard in the brief. It is Vite's `publicDir`, so it is served at `/sample.txt` in dev and copied to `dist/` on build. |
| `tests/*.test.ts` | 24 tests, `node --test`. |

```
npm install
npm run dev      # http://localhost:5173
npm test         # 24 passing
npm run build    # tsc --noEmit && vite build
```

Keys: `Space` play/pause · `←` word · `Shift+←` sentence · `→` word forward · `↑`/`↓` ±25 wpm (clamped 100–1000).

`node --test` with native type stripping worked first try on Node v24.18.0. **No `vitest`, no test
dependency.** The dependency list is exactly `vite` and `typescript`.

### Order of operations in the tokenizer

The brief's failure list (Squirt splitting `3.14`, Sprint Reader producing `2,15`, jetzt splitting a
DOI) all come from cutting on punctuation before classifying. The fix here is structural rather than
corrective: **the tokenizer only ever cuts on whitespace.** `3.14`, `1,234.56`,
`10.1038/nature12373`, `91.4%`, `p<0.001`, `5-10`, `2.5x`, `1e-9`, `[3,4]` are therefore never split
apart in the first place, and there is nothing to rejoin. Numeric and abbreviation classification run
on the whole chunk; only then is a trailing period read as a sentence terminator or not.

Verified on the fixture: `Table 2, 15 of 20` → `Table` `2,` `15` `of` `20`. `2,15` is not
constructible by this design.

---

## 2. What was assumed

Judgement calls the brief did not settle.

1. **"Numeric" means the punctuation-stripped core contains a digit.** The brief says "contains a
   digit and is not a plain word", and no plain word contains a digit, so the second clause is
   inert. Consequence: `mid-1990s`, `[12]`, `1957:` and `2.5x` are all numeric, and all get
   `numeric_mult` 2.0 and split suppression. That is clearly right for `[12]` (it must not split)
   and arguable for `mid-1990s`.
2. **Fragment length 8 *includes* the connector hyphen**, so fragments carry 7 body graphemes plus
   `-`. A 20-grapheme word becomes 8 + 8 + 6. This satisfies both readings of "fragments of at most
   8 graphemes … plus a connector hyphen"; the other reading yields 9-grapheme slides.
3. **Paragraph beats sentence** when a token both ends a sentence and precedes a blank line.
   `Boundary` is a single value and cannot hold both. See §4.4 — this loses time at the largest
   structural break in the text.
4. **The last token of the input gets `boundary: 'paragraph'`.** End of text closes a paragraph.
5. **Every fragment of a split word carries the *source word's* `charStart`/`charEnd`.** Resume and
   click-to-seek should land on the word, not on a fragment, and the round-trip test still holds for
   the final fragment. Fragment spans are therefore identical, not disjoint.
6. **Pivot offsetting.** `ceil((L−1)/4)` capped at 4 is computed on the stripped core, then shifted
   right by the number of leading punctuation graphemes, so `[12]` pivots on `1`, not on `[`.
   Stripping uses `\p{P}\p{S}` and is skipped entirely if it would empty the token.
7. **The sentence word count feeding `sentence_len_scale` excludes continuation fragments.** One long
   word rendered over three beats is one word, not three.
8. **`tier: 'tier1'` on every token.** See §4.3 — it is the closest available lie.
9. **`@types/node` was deliberately not installed**, to keep dependencies at `vite` + `typescript`.
   `tsconfig.json` therefore has `include: ["src"]`: the tests are type-*stripped* by Node but not
   type-*checked* by `tsc`. `npm run build` type-checks `src/` only.
10. **`→` (forward one word) was added.** Not in the brief's table; it is needed to undo an
    over-rewind and it is one line.
11. **`prefers-reduced-motion` defaults the rate to 180 wpm.** The app starts paused regardless.
12. **`package-lock.json` exists.** It is a byproduct of the required `npm install` and is not in the
    owned-path list. Delete it if the orchestrator would rather not carry one.

---

## 3. What was left undone

- **`Alt+←` paragraph rewind and the `S` skim preset.** Both are in spec §12 but not in the Phase 2
  control table. Deliberately out of scope; each is about four lines when wanted.
- **`interword_gap_ms`.** Its default is 0, and honouring it properly means blanking the display
  between words, not merely adding delay. Adding delay alone would silently break the delivered-rate
  guarantee, so the field is left unread rather than half-implemented.
- **Dehyphenation and NFKC (spec §8).** They belong to ingest, which owns the text before the
  tokenizer sees it. The tokenizer takes what it is given.
- **Drift compensator.** Spec §11 says do not build one before measuring. Not built.
- **Click-to-seek, the paused context strip, position persistence, library, PDF, escalation.** Later
  phases.
- **No browser render test.** The scheduler is tested against a virtual clock
  (`tests/player.test.ts` stubs `performance.now` and `requestAnimationFrame`). The *pixel* stability
  of the pivot is a Gate 2 human check: the grid guarantee is a CSS layout property, and asserting it
  in jsdom would test nothing real.

---

## 4. What surprised me — did the frozen contracts survive contact with reality?

Mostly yes. Four things did not.

### 4.1 `dwell_ceiling_ms` silently deletes `sentence_len_scale`. This is the big one.

The clamp is applied **after** normalization, per spec §10. On the fixture, a sentence-final token's
raw dwell is 944 ms at 250 wpm and 854 ms at 400 wpm; after normalization those become 767 ms and
645 ms; both are clamped to 350 ms.

**Consequence: the `sentence_len_scale` table is inert at every rate from 100 to 1000 wpm.** A
7-word sentence and a 30-word sentence produce an identical 350 ms pause, because both raw values
overshoot the ceiling by 2–3× before the clamp sees them. The 1.0 / 2.2 / 3.3 coefficients — the
Spritz Fig. 5b rule the spec is proud of copying when nobody else did — cannot express themselves
through a 350 ms ceiling. Set them all to 1.0 and the rendered output is byte-identical. The test
`at 400 wpm every clamped token is a sentence or paragraph boundary` pins this: *nothing else clamps.*

I implemented the spec formula exactly and did not work around it. But `config/timing.json` currently
ships a coefficient with no observable effect, and Gate 2 will be judging pacing that the
sentence-length rule is not actually contributing to.

The fix is a design decision, not a bug fix. Three options: exempt the boundary pause from the
ceiling (clamp the word dwell, then add the pause); raise `dwell_ceiling_ms`; or apply the ceiling
before normalization. The first is the one I would take — the ceiling's own justification ("past
where readers start saccading around a static word") is about how long **one word** hangs there,
which is a different quantity from a deliberate inter-sentence rest.

### 4.2 Normalization and the ceiling fight each other, and the app still misreports its rate

`deliveredWpm` on the fixture: **250 → 274.7, 400 → 438.4, 1000 → 1106.** Clamping only ever removes
time, so the error is always an overshoot: 8–11% on real prose.

Normalization is unambiguously doing its job. The naive un-normalized schedule delivers 203 wpm for a
250 setting (18.7% slow) and 302 for a 400 setting (24.5% slow) — which reproduces the surveyed
failure almost exactly, and the tests assert it. On a clamp-free stream, delivered equals target to
better than 0.1%. The residual error on real prose is entirely §4.1's clamp. So the surveyed readers
lie by 20–25% *slow*; this one lies by ~10% *fast*.

`TimingResult` has nowhere to say so. It carries `dwellMs` and `deliveredWpm` and no clamp count, so
the UI can display "delivered 275" beside "250 wpm" but cannot explain it. **Suggested amendment: add
`clampedCount: number` to `TimingResult`.** One field, and it turns a confusing number into an honest
one. The Phase 2 HUD shows both rates today and a Gate 2 reader will notice the gap.

### 4.3 `Tier` has no member for text that came from neither extractor

Every token in this slice is stamped `tier: 'tier1'`. That is false — there is no pdf.js here, the
input is a `.txt` file. `'placeholder'` is worse (it has documented semantics: halts playback,
renders whole). The field is not optional, so there is no honest value available.

**Suggested amendment: add `'plaintext'` to `Tier`.** It costs nothing, and it matters later: the
numeric-fidelity affordance (§5, "an admission, not a mitigation") reads tier per token, and pasted
plain text being indistinguishable from a tier-1 PDF extraction is exactly the plausible-looking
wrongness §8 warns about.

### 4.4 `Boundary` cannot represent "sentence AND paragraph", which is the common case

Almost every paragraph's last token also ends a sentence. `Boundary` is a single enum value, so one
signal is discarded. I made paragraph win, which means that at the *largest* structural break in the
text the reader gets `pause_paragraph_ms` (500 ms raw) instead of `pause_sentence_ms ×
sentence_len_scale` (up to 1056 ms raw). The pause gets **shorter** exactly where it should be
longest. Choosing sentence instead is equally wrong in the other direction, and it would also discard
the paragraph signal a later phase's context strip will want.

**Suggested amendment: make the paragraph pause additive on top of the sentence pause** — a
paragraph-final token stays `boundary: 'sentence'` and gains a separate `paragraphEnd?: true` — or
make `boundary` a small set. Either is a one-line contract change. Neither is expressible today.

(Under §4.1's clamp both values currently collapse to 350 ms anyway, so today this bug is invisible.
Fixing 4.1 without fixing 4.4 will make it visible.)

### 4.5 Smaller notes

- **Two index spaces in one struct.** `Token.pivot` is a grapheme index into `text`;
  `charStart`/`charEnd` are UTF-16 offsets into the source. Both are correct and both are documented,
  and together they are a standing trap for anyone who reaches for `text[pivot]`. Worth a louder
  comment in the contract than it has.
- **`boundary` on a non-final fragment must be `'none'`, and the contract does not say so.** Putting
  the parent's boundary on every fragment would fire N sentence pauses inside one word. Same for
  `continuation` being `true`-or-absent rather than a boolean.
- **Unused by this slice, as expected:** `interword_gap_ms`, `PIPELINE_VERSION`, `DISPOSITION`,
  `PageRecord`, `ExtractionResult`, `Position`, `LibraryEntry`. `resume_ramp_ms` and
  `rewind_backoff_words` are both used and both behaved as documented — the 5-word backoff landing
  you in the *previous* sentence when you tap back early is noticeably the right behaviour once you
  actually read with it, which I did not expect from reading the rule.
- **The `1fr auto 1fr` grid works exactly as advertised.** No measurement, no jitter, no special case
  for a pivot at index 0, no font-loading race. Nine lines of CSS. Whatever the two surveyed
  `measureText` implementations spent on this problem was spent for nothing.
- **Node 24's native type stripping was a non-event.** The only accommodation it needed was explicit
  `.ts` extensions on relative imports and `import type` for type-only imports — both of which Vite
  accepts unchanged. That is the whole reason there is no test framework in this repo.

---

## Verification

An independent pass over the slice by a second agent. Everything below was executed, not
inferred from the implementer's report.

### The commands

```
$ npm install
up to date, audited 16 packages in 452ms
5 packages are looking for funding
found 0 vulnerabilities
```

Direct dependencies in `package-lock.json`: **`typescript` and `vite`, and nothing else.**
No `vitest`, no test framework, no runtime dependencies. The other 14 packages are
transitive (esbuild, rollup, postcss, nanoid, picocolors, picomatch, fdir, tinyglobby,
source-map-js, @types/estree and platform binaries). Clean.

npm warns that `esbuild@0.28.2` has an unapproved install script. That is vite's own
transitive dependency, not a choice this repo made.

```
$ npm run build          # tsc --noEmit && vite build
OK 10 modules transformed.
dist/index.html                 1.17 kB
dist/assets/index-2KZjcUsl.css  1.26 kB
dist/assets/index-XX_DeIuM.js   9.36 kB
built in 64ms                                      exit 0

$ npx tsc --noEmit                                 exit 0, no output
```

```
$ npm test               # BEFORE any change by this pass
tests 24  pass 24  fail 0                          exit 0

$ npm test               # AFTER the fixes below
tests 26  pass 26  fail 0                          exit 0
```

```
$ npm run dev
/ 200   /sample.txt 200   /src/app/main.ts 200   /src/app/style.css 200
```

**The implementer's report matched reality on all of these.** 24/24 was the real number,
the build was really clean, and the dependency set is really just vite and typescript.

### What the audit found

**(a) Duration normalization â€” BROKEN, now fixed.** This is the one thing the slice exists
to get right, and it was wrong. Recomputed from scratch (load fixture, tokenize, time):

| target | delivered, as shipped | delivered, after fix | naive, no normalization |
|---|---|---|---|
| 250 | 274.7 (**+9.9%**) | 250.0 (+0.00%) | 203.3 |
| 400 | 438.4 (**+9.6%**) | 400.0 (-0.00%) | 301.9 |
| 600 | 663.0 (**+10.5%**) | 600.0 (+0.00%) | 413.5 |
| 1000 | 1106.3 (**+10.6%**) | 1000.0 (-0.00%) | 586.8 |

The frozen contract is not ambiguous about this: *"Duration normalization must make this
equal `config.target_wpm` to within rounding â€” it is the check that the UI is not lying."*
Shipping a UI that says 250 and delivers 275 fails the contract, and it fails the reason
Gate 2's pacing judgement is worth anything.

Section 4.2 above files this as a contract limitation needing an amendment. It is not. It
is fixable inside `src/stream/timing.ts` with the ceiling fully intact. `sum of
min(raw_i * s, C)` is non-decreasing in `s`, so instead of computing `s` once and letting
the clamp eat time afterwards, solve for the `s` whose *post-clamp* total is the target
total. One bisection, about ten lines, no new contract field. Done in `solveScale()`.

Two consequences worth knowing:

- Below `60000 / dwell_ceiling_ms` = **171.4 wpm** the target is unreachable â€” every dwell
  is at the 350 ms ceiling and the schedule physically cannot run slower. `deliveredWpm`
  now reports 171.4 for a 100 wpm request rather than a fabricated number, and the HUD
  already displays delivered beside target, so the app tells the truth in that band too.
  The UI clamps the speed control to a 100 wpm minimum, so a reader *can* reach it.
- `clampedCount` on `TimingResult` (the section 4.2 amendment request) is no longer needed
  to explain a rate mismatch, because there is no mismatch. It would still be useful
  diagnostics. Downgraded from "needed" to "nice".

**(a-bis) Section 4.1 confirmed, and sharpened.** Independently reproduced: flattening
`sentence_len_scale` to a single `1.0` row produces a **byte-identical** schedule at 150,
250 and 400 wpm â€” 0 of 467 dwells differ. The clamp really does delete the coefficient. The
fix above does not change this, and cannot: every sentence-final dwell is pinned at the
ceiling in both configurations, so the solved scale is identical too.

One correction to 4.1's wording: it is inert "at every rate from 100 to 1000". After the
normalization fix it comes alive at **600 wpm and above** (461/467 dwells differ at 600,
max delta 24.5 ms), because the higher solved scale lifts short-sentence pauses off the
ceiling. It remains fully inert across 100-400 wpm, which is the entire band Gate 2 will
read in. The design decision 4.1 asks for is still open and still the right question.

**(b) Numeric tokenization â€” correct.** Ran the tokenizer over each string and printed the
token list (`#` = numeric, `/x` = boundary):

```
"3.14"                -> "3.14"#
"1,234.56"            -> "1,234.56"#
"10.1038/nature12373" -> "10.1038/nature12373"#
"91.4%"               -> "91.4%"#
"p<0.001"             -> "p<0.001"#
"5-10"                -> "5-10"#
"x = 3.14 +/- 0.02"   -> "x"  "="  "3.14"#  "+/-"  "0.02"#
"Table 2, 15 of 20"   -> "Table"  "2,"#/comma  "15"#  "of"  "20"#
"Dr. Smith arrived."  -> "Dr."  "Smith"  "arrived."/sentence
"See Fig. 3 and [12]."-> "See"  "Fig."  "3"#  "and"  "[12]."#/sentence
```

Not one corruption. `2,15` is not constructible, `Dr.` and `Fig.` do not end sentences,
`[12].` does, the DOI survives whole (19 graphemes, unsplit because numeric suppresses
splitting). The real test string used a Unicode plus-minus sign; it becomes its own beat,
which is whitespace-only cutting behaving as designed, not a defect.

**(c) Pivot is a grapheme index â€” correct.** `pivotIndex` runs on `Intl.Segmenter` output
throughout:

```
family-ZWJ-emoji + "abcdef"   7 graphemes (17 UTF-16 units)  pivot 3 -> "c"
"na" + combining diaeresis    5 graphemes ( 6 UTF-16 units)  pivot 1 -> the combined glyph
astral fraktur a-g            7 graphemes (14 UTF-16 units)  pivot 2 -> fraktur c
```

A UTF-16 implementation would land mid-ZWJ-sequence on the first and mid-surrogate on the
third. `src/render/word.ts` re-segments before slicing, so the render path agrees with the
tokenizer.

**(d) charStart/charEnd â€” correct, all 467 tokens.** Every non-fragment token satisfies
`src.slice(charStart, charEnd) === token.text` exactly (0 failures). Every one of the 17
continuation fragments carries its *source word's* span, so `slice()` returns the whole
word â€” deliberate, documented, and the right choice for resume. No out-of-bounds spans.

**(e) Scheduler â€” correct.** `src/render/player.ts` carries a `nextAt` timestamp forward
(`nextAt += dwellMs(index)`) and drains it in a `while (now >= nextAt)` loop inside a rAF
callback. No `setTimeout` anywhere in `src/`. The virtual-clock test genuinely proves the
absolute-timeline claim: after a 500 ms stalled frame the index catches up to 6 and the
*next* transition still fires on the original 700 ms mark, which chained timeouts cannot do.

**(f) Speed change â€” correct.** `setWpm` recomputes `dwellMs[]` and calls `render()`. It
never touches `nextAt`, and `player.dwellMs(i)` is only read when the index advances, so
the in-flight dwell survives a held arrow key. Verified by test, not just by reading.

**(g) `visibilitychange` â€” present**, in `src/app/main.ts`, pauses on `document.hidden`.

**(h) Nothing near the fixation point â€” correct.** `.stage` is `position: fixed; inset: 0`
with the word grid centred; both HUDs are `position: fixed` pinned to `top: 0` / `bottom: 0`
and are `pointer-events: none`. The only element inside `.stage` besides the word is a
static 1px `.rule` hairline, `aria-hidden`, which never changes during playback and so
cannot attract a saccade. (Its comment claimed "two short ticks aligned to the pivot
column"; it is one full-width line. Comment corrected to match the code.)

**(i) Pivot stability â€” correct.** `grid-template-columns: 1fr auto 1fr` with `min-width: 0`
on `.before`/`.after`, exactly as spec section 11 prescribes. `grep` over `src/` and
`index.html` finds no `measureText`, no canvas, no monospace padding, no `ch` units.

**(j) Clamps â€” correct.** Ceiling applies (max dwell is exactly 350.00 at every rate
tested); no floor (at 1000 wpm the shortest dwell is 39.75 ms, well under any plausible
floor).

**(k) Fixture â€” exercises every named hazard.** 450 words / 467 tokens. Decimals (`0.60`,
`0.28`, `2.5x`), thousands separator (`1,234,000`), DOI (`doi:10.1038/nature12373`),
citations (`[12]`, `[3,4]`), `et al.,`, `Fig. 3`, `Eq. 7`, `e.g.,`, initials (`J. R.
Firth`), `p<0.001`, `91.4%`, `mid-1990s`. 13+ character words: `Distributional` (14),
`incompressible` (14), `representational` (16), `counterarguments` (16) â€” 17 continuation
fragments result. Sentences from 2 words (`Somewhere pragmatic.`) to well over 22, so all
three `sentence_len_scale` rows are reached in the raw schedule.

### What was fixed

1. **`src/stream/timing.ts`** â€” added `solveScale()`; `computeTiming` now solves for the
   normalization scale whose post-clamp total hits the target, restoring the contract's
   `deliveredWpm === target_wpm` invariant. Ceiling unchanged, still no floor.
2. **`src/app/main.ts`** â€” added the two spec section 12 controls listed as undone in
   section 3, because an incomplete control table is not something Gate 2 can judge pacing
   through:
   - `Alt+left` rewinds one paragraph. `sentenceStart()` generalised to `blockStart(from,
     isBreak)`; the modifier guard no longer swallows `altKey`.
   - `S` toggles the skim preset at **450 wpm** and back to `target_wpm`. 450 is the first
     frame-exact 60 Hz rate (spec section 11: 300/400/450/600/720/900) above
     `skim_threshold_wpm`, so the SKIM badge is honest and the scheduler can actually hit
     the rate.
   - `index.html` key legend updated.
3. **`tests/timing.test.ts`** â€” the old suite tested around the normalization bug rather
   than at it: `duration normalization delivers the requested rate...when no clamp bites`
   measured a synthetic clamp-free stream, and `the dwell ceiling clamps...` positively
   *asserted* `deliveredWpm > target`, pinning the defect as intended behaviour. Replaced
   with three tests that assert the contract on the real stream (<0.1% error at 250, 300,
   400, 600, 1000 with the clamp biting), keep the clamp-free case as a secondary check,
   and pin the honest report of an unreachable sub-171.4 wpm target. The "every clamped
   token is a boundary" test was rewritten for 400 and 1000 wpm â€” after the fix commas
   clamp at 400 too, so the assertion is now "nothing with `boundary: 'none'` clamps",
   which is the property that actually matters.
4. **`src/app/style.css`** â€” corrected the `.rule` comment (see (h)).

### Still broken, or unverified

- **Section 4.1 stands and is a design decision, not a bug.** `sentence_len_scale` has no
  effect anywhere in the 100-400 wpm band. Left for Gate 2 exactly as 4.1 argues.
- **Sections 4.3 (`Tier` has no `'plaintext'`) and 4.4 (`Boundary` cannot say "sentence AND
  paragraph") both confirmed on inspection.** Frozen contract, not touched. 4.4 will start
  producing a visibly *short* pause at paragraph ends as soon as 4.1 is addressed.
- **Tests are not type-checked.** `tsconfig.json` has `"include": ["src"]`, so
  `tsc --noEmit` never sees `tests/`. Node's type stripping catches syntax, not types, so a
  type error in a test ships silently. Fixing it means adding `@types/node` â€” a third
  devDependency â€” so it is recorded here rather than done unilaterally.
- **`interword_gap_ms` is still unread** (section 3), and with the normalization fix in
  place that is now more clearly correct: adding it as delay without blanking the display
  would break the delivered-rate invariant that is now actually enforced.
- **Pixel stability of the pivot is unverified by machine**, as section 3 says. The CSS is
  right by inspection; nobody has watched it. Gate 2 human check.
- **`prefers-reduced-motion` path unverified at runtime** â€” the code reads the query and
  starts at 180 wpm paused; not exercised in a browser with the setting on.
- **Working tree left uncommitted**, as instructed. `git status` shows only the untracked
  Phase 2 paths (`docs/handoff/`, `fixtures/`, `index.html`, `package.json`,
  `package-lock.json`, `src/app|render|stream/`, `tests/`, `tsconfig.json`,
  `vite.config.ts`). `dist/` and `node_modules/` are gitignored. Nothing under
  `src/contracts/`, `config/`, `docs/spec.md` or `docs/research/` was modified.
- Two `vite` dev servers were still running from the implementation session, holding port
  5173. Killed.


---

## Gate 2 amendments

The orchestrator amended `src/contracts/types.ts`, `config/timing.json` and `docs/spec.md`
section 10. Sections 1-4 above are left exactly as they were: they are the record of what
Phase 2 found, and 4.1, 4.3 and 4.4 are the findings these three amendments answer.

### What changed in the code

Only three files carry logic changes, plus config for the build.

1. **`src/stream/timing.ts` — the ceiling clamps the WORD, never the pause.**
   The word component and the boundary pause are now computed separately (`rawParts`,
   returning `{ word[], pause[] }`), and the schedule is

       dwell_i(s) = min(word_i * s, word_dwell_ceiling_ms) + pause_i * s

   `rawDwellsMs` is kept as `word + pause` so the existing "naive schedule is 18-25% slow"
   test still measures the same thing. Bisection is unchanged in shape; only the function
   being solved changed. `dwell_ceiling_ms` -> `word_dwell_ceiling_ms` throughout.

2. **`src/stream/timing.ts` — `'paragraph'` implies a sentence end.**
   `boundaryPauseMs` now returns `pause_sentence_ms * sentence_len_scale(words) +
   pause_paragraph_ms` for `'paragraph'`. `sentenceWordCounts` already keyed both
   `'sentence'` and `'paragraph'`, so the word count feeding the scale needed no change.

3. **`src/stream/tokenize.ts` — `tier: 'plaintext'`.** One line. The .txt path no longer
   claims a PDF extractor produced its text.

4. **`tsconfig.json` — `"include": ["src", "tests"]` and `"types": ["node"]`,
   `@types/node` added as a devDependency.** `"types": []` was the second half of the
   problem: adding `tests` to `include` alone leaves `node:test`, `node:fs` and
   `import.meta` unresolvable. Verified the check is real by planting
   `const _bad: number = "x";` in `tests/tokenize.test.ts` and watching
   `npx tsc --noEmit` fail with TS2322 at `tests/tokenize.test.ts(143,7)`.

### Before and after, real fixture (`fixtures/sample.txt`, 467 tokens), 250 wpm

BEFORE (as measured by the orchestrator):

    boundary     n     mean dwell    max
    none        419      228 ms      350
    comma        26      335 ms      350
    sentence     17      350 ms      350
    paragraph     5      350 ms      350

AFTER:

    boundary     n     mean dwell    max
    none        419      202 ms      350
    comma        26      308 ms      446
    sentence     17      784 ms     1191
    paragraph     5     1218 ms     1459

Ordering is now strict: 1218 > 784 > 308 > 202. The word ceiling still binds - `none`
tops out at exactly 350 ms - and the ordinary-word mean fell from 228 to 202 ms because
the structural pauses now take their real share of the fixed duration budget. That is the
trade the model is supposed to make and it was invisible before.

`sentence_len_scale` flattened to a single `{max_words: 9999, mult: 1.0}` row, count of
dwells that differ from the shipped config:

    250 wpm: 454 of 467   (was 0 of 467)
    400 wpm: 467 of 467   (was 0 of 467)

`deliveredWpm` on the fixture: 150 -> 150.000, 250 -> 250.000, 400 -> 400.000,
600 -> 600.000, 800 -> 800.000, 1000 -> 1000.000.

Word clamping across the band (tokens with `boundary: 'none'` sitting at the ceiling):
419 at 100 and 150 wpm, 13 at 250, 0 at 400 and above. Dwells that exceed the ceiling -
all of them boundary-bearing, which is now the intended behaviour - run 48 / 48 / 24 / 21 /
15 / 15 / 15 at 100 / 150 / 250 / 400 / 600 / 800 / 1000.

### Tests

`tests/timing.test.ts` gained the five required guards; `tests/tokenize.test.ts` gained the
`tier === 'plaintext'` assertion over the whole fixture. 26 -> 30 tests, all passing.

Three existing timing tests had to be rewritten because the amendment made their premise
false, not because they were wrong:

- **`clampedCount`** counted any dwell at the ceiling. A dwell at the ceiling no longer
  means the ceiling bit - it can be a small word plus a pause. It now counts only tokens
  with `boundary: 'none'`, where the dwell IS the word component.
- **"what clamps is boundary pauses first"** asserted that every clamped dwell carries a
  boundary. That was a symptom of the bug. Its replacement asserts the opposite structure:
  every dwell ABOVE the ceiling carries a boundary, and no boundary-free dwell exceeds it.
- **"a target the ceiling cannot reach"** ran at 100 wpm on the real fixture. See below.

### What still surprises me about the contracts

**The ~171 wpm floor is now only true for pause-free streams, and spec 10 still states it
unconditionally.** This is the one place where the amended spec and the amended formula
disagree, so it is flagged rather than quietly resolved.

`min(word_i * s, ceiling) + pause_i * s` is unbounded in `s` as long as one pause is
non-zero, so on any stream with punctuation the normalization equation has an exact
solution at *any* target rate. Measured: the fixture delivers 150.000 wpm at a 150 wpm
target. Spec 10 and `config/timing.json` both still say "below `60000 /
word_dwell_ceiling_ms` (about 171 wpm) the target is physically unreachable and
`deliveredWpm` must report the truth" - which was true when the ceiling clamped the total
and is now true only for a stream containing no boundary pause at all.

What was implemented: solve the equation when it has a solution; when the schedule
saturates (no pauses, every word clamped) report the achievable rate honestly, exactly as
before. Both branches are tested - the honest-reporting test now runs at 100 wpm on the
pause-free stream, where it is still a real constraint, and a second test pins the new
150 wpm behaviour so nobody "fixes" it back by accident.

The reason this is worth a look rather than a shrug: at 150 wpm on the fixture the solver
pushes every word to the 350 ms ceiling and dumps *all* remaining budget into pauses, so a
sentence end runs to several seconds. It is arithmetically honest and perceptually odd. If
the intent is that slow targets should stretch pauses without limit, this is correct as
built; if the intent is that `deliveredWpm` stops at 171.4 regardless, the timing model
needs an explicit "unreachable below X" rule rather than one that falls out of the clamp.

**`Boundary` still cannot represent "paragraph break that is not a sentence end"** (4.4).
Amendment 2 fixes the pause arithmetic, not the type. The tokenizer stamps `'paragraph'`
on the last chunk before a blank line whether or not it ends with a terminator, and on the
very last token of the input - so a heading, a list item, or a truncated final line gets a
full scaled sentence pause plus 500 ms. On this fixture that is 5 tokens and reads fine.
On a PDF with short headings it will be conspicuous. `sentence_len_scale` also counts the
heading's own words as "the sentence just ended", which is meaningless but harmless at
these lengths.

**`interword_gap_ms` is still unread**, unchanged from section 3, and the amendment makes
that more clearly right: adding it as delay without blanking the display would break the
delivered-rate invariant the tests now check at five rates.

### Commands, actually run

    npm run build   ->  tsc --noEmit clean (now covering src + tests), vite built in 69ms
    npm test        ->  tests 30, pass 30, fail 0

Nothing under `src/contracts/`, `config/`, `docs/spec.md` or `docs/research/` was touched.
Nothing was committed.

5. **`src/app/main.ts` — the UI speed clamp reads `min_wpm`/`max_wpm` from config.**
   `Math.min(1000, Math.max(100, next))` became `clampWpm(next, cfg)`, a two-line export
   added to `src/stream/timing.ts`; the floor is now 150 for the reason the contract gives
   (at 100 wpm the fixture's longest dwell is 8.78 s — that is not reading). `setWpm`
   already clamped rather than rejected, so a ±25 step from an off-boundary rate lands
   exactly on the floor or ceiling. Four tests added to `tests/timing.test.ts`; no wpm-bound
   literal remains in `src/`. The section 1 key line above ("clamped 100–1000") is superseded
   by this: the range is 150–1000. `index.html` states no range, so it needed no change.
   `npm run build` -> tsc clean, vite built in 66ms. `npm test` -> tests 34, pass 34, fail 0.
