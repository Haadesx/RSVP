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
| 1 | docs/spec.md + src/contracts/ frozen | in progress |
| 2 | vertical slice, human reads at 400/800 WPM | not started |
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
