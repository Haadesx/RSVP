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
| 0 | 4 research dossiers + synthesis | in progress |
| 1 | docs/spec.md + src/contracts/ frozen | not started |
| 2 | vertical slice, human reads at 400/800 WPM | not started |
| 3 | full pipeline on 5 golden PDFs | not started |

## Task accounting

| Phase | Task | Attempts | Outcome |
|-------|------|----------|---------|
| 0 | R1 rsvp-perception | 1 | in progress |
| 0 | R2 prior-art | 1 | in progress |
| 0 | R3 extraction-tier1 | 1 | in progress |
| 0 | R4 extraction-tier2 | 1 | in progress |
