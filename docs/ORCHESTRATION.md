# Orchestration log

Roles, rules and repo layout: see the plan in the session brief. This file tracks
gate status and task accounting only.

## Decisions taken before Phase 0

- **This machine (`X:\AI\RSVP`, Windows 11, RTX 5090) is the GPU rig, not the reader.**
  Real development and all reading happen on the MacBook. Consequence: everything
  written here must be cross-platform, and Gate 2 (does the pivot sit still at 800
  WPM) can only be judged by the human, on the Mac. The vertical slice must be
  trivially runnable on macOS with no Windows-only step.
- **Run scope this session:** Phase 0 → Gate 0 → Phase 1 → Gate 2. Stop at Gate 2.
- **Git initialized.** Every phase lands as reviewable commits; path-ownership
  violations are caught in the diff, not in a worker's self-report.

## Gate status

| Gate | Contents | Status |
|------|----------|--------|
| 0 | 4 research dossiers + synthesis | **complete** — awaiting your read |
| 1 | docs/spec.md + src/contracts/ frozen | **complete** |
| 2 | vertical slice, human reads at 400/800 WPM | **complete** — awaiting your read. STOP |
| 3 | full pipeline on 5 golden PDFs | not started |

## Task accounting

| Phase | Task | Attempts | Outcome |
|-------|------|----------|---------|
| 0 | R1 rsvp-perception | 1 | done — audit found selective citation of the strongest counter-result; fixed |
| 0 | R2 prior-art | 1 | done — audit found the keystone-source justification was false; fixed. Orchestrator corrected one ORP-table row by direct fetch |
| 0 | R3 extraction-tier1 | 1 | done — audit reversed a load-bearing claim about marker; classifier calibrated on 414 real pages |
| 0 | R4 extraction-tier2 | 1 | done — audit corrected ParseBench corpus size 4x and withdrew a non-existent benchmark result |

## Phase 0 accounting

24 agents (16 researchers, 4 writers, 4 adversarial auditors), 0 errors, 0 retries,
0 reassignments. ~3.9M subagent tokens. No brief needed rewriting.

Two workers hit the session WebSearch quota (200/200) mid-pass and completed on direct
WebFetch only; both recorded the constraint in their audit notes rather than hiding it.
R4's auditor notes this means an unknown-unknown missing model could not be searched for.

## Assumption carried into Phase 1

Phase 0 surfaced a product-level fork (synthesis.md, problem 2): the replicated finding
is that RSVP costs literal/verbatim detail and preserves gist, which is close to the
opposite of what an academic-paper reader needs. Three coherent products follow.

**Proceeding on: comprehension reader — default 250 wpm delivered, skim mode explicit
and labelled.** The Phase 2 vertical slice is identical under all three options (the
fork changes default rate and numeric routing, not the code), so this does not block.
The decision lands at Gate 2, where it can be made from reading rather than from
argument.

### RESOLVED at Gate 2 by the owner

> "My main target is that I would like to be able to read faster. Right now, the main
> issue is that we speak the word that I read in our head... We could make this app just
> to help people read faster and skim through information much more easily. We could
> advertise it in that way **if it's accurate enough**."

**Product: faster reading + skimming, publicly pitched as such.** That is closer to
option B (skimmer) than to the comprehension reader assumed in Phase 1.

Two consequences, and one open question that must settle before the defaults move.

1. **Numeric-fidelity work drops in priority.** If the job is triage — "is this paper
   worth opening properly" — then perfect digits are not the acceptance criterion they
   were. `docs/spec.md` section 5 stays as written (measure the base rate before building
   anything), but the CTC verification tier is now clearly out of scope for v1.
2. **The honest-claim condition is load-bearing.** The owner attached "if it's accurate
   enough" to the marketing pitch, which makes the accuracy of the claim a requirement,
   not a nicety.

**Open, and blocking the default-rate change:** the owner's stated mechanism is
subvocalization — the inner voice as the thing slowing reading down. **Phase 0 never
researched it.** It covered saccades, fixations, regressions and parafoveal preview, but
not inner speech. That is a real gap, and it decides whether "read faster" is a
supportable claim or a marketing one. A focused research pass
(`docs/research/reading-speed-mechanisms.md`) is running on: whether subvocalization is a
bottleneck or is load-bearing for comprehension; what actually caps reading rate; whether
RSVP reduces inner speech at all; and whether RSVP beats ordinary skimming.

That last one is already flagged in `docs/research/rsvp-perception.md`: **Masson 1983
reportedly found RSVP WORSE than skimming at equal duration** — currently held only
SECONDHAND via the Rayner 2016 review. If it survives primary verification it aims
directly at the skimming half of the pitch, so it is being checked against the source.

**Defaults are not being changed until that lands.** Changing `target_wpm` twice is worse
than changing it once.

## Phase 2 accounting

| Task | Attempts | Outcome |
|---|---|---|
| Implement slice | 1 | done. Claimed duration normalization worked; it did not |
| Independent verify | 1 | done. Caught the ~10% overshoot **and** two tests written around the bug |
| Gate 2 amendments | 1 | done. Also caught a false claim in spec section 10 |
| Wire wpm clamp | 1 | done |

4 agents, 0 errors, 0 retries, 0 reassignments, no brief rewritten.

**Orchestrator-verified, not accepted on report:** build clean; 34/34 tests; delivered
rate exact at 150-1000 wpm; boundary ordering 1218 > 784 > 308 > 202 ms at 250 wpm;
every token `tier: 'plaintext'`; longest dwell 1.46s at 250 / 8.78s at 100; dev server
serves `/`, `/sample.txt`, `/src/app/main.ts`, `/src/app/style.css` all 200; path
ownership clean (workers touched nothing under `src/contracts/`, `config/`, `docs/spec.md`
or `docs/research/`).

**Process note worth keeping.** The independent-verify stage paid for itself twice. The
implementer's 24/24 green was real but load-bearing on a test that asserted
`deliveredWpm > target` — it had pinned the defect as intended behaviour. A self-reporting
worker would have shipped it. Keep the separate verifier for every phase.

## Contract amendments made at Gate 2

Per the plan, amendments land here or not at all. Three landed, all found by the slice
hitting reality rather than by review:

1. `word_dwell_ceiling_ms` clamps the word, never the boundary pause.
2. `boundary: 'paragraph'` implies a sentence end; takes both pauses.
3. `Tier` gains `'plaintext'`.

Plus `min_wpm` / `max_wpm` added to config, and two corrections to `docs/spec.md`.

## Known gap, deliberately left open

`Boundary` cannot express "a paragraph break that is not a sentence end" — a heading.
5 tokens in 467 on plain text; conspicuous on a PDF with short headings. The fix belongs
with the structural pass, which is the component that knows what a heading is. W3 and the
Phase 4 labeller own it jointly. Recorded in `docs/spec.md` section 7.

## Unassigned task that gates Phase 3

**Collect 30-50 genuinely broken academic pages with known-correct text.** Every classifier
number in `docs/research/extraction-tier1.md` was measured against *synthetic* corruption
of clean pages, which the dossier itself calls an optimistic upper bound. W1's five golden
PDFs are healthy-document regression tests and do not cover this. Nobody owns it.
