# Design

<!-- impeccable:design-schema 1 -->

**The Instrument.** Written at finish, from the built world, not before it.

Direction chosen by the user from two fully-specified candidates after a concept roll
(`concept-seed.mjs`, scope `direction`, mode `operate`, key `rsvp-reader-2026`, assigned
index 5 of 7). Build path was code-led by declared choice — see `.impeccable/config.json`.

---

## The idea

A machined scientific instrument: a panel, engraved scales, one luminous readout. The
product's positioning is *an instrument that reports its own calibration*, so the world
argues the product rather than decorating it.

**It refuses the category arrangement** — black void, huge word, red letter, grey chrome
— which is what every surveyed RSVP reader ships.

**The one thing it must not become is cold.** That was the user's single stated anti-goal,
and it is the reason the ground is warm graphite at 16.5% lightness rather than the
near-black this world drifts toward on its own. The first build failed this and the finish
reviewer caught it by sampling the shipped pixels.

---

## Color

Dark is the default. Both themes are real; the choice comes from the use scene — reading
happens late at a desk *and* in daylight on a train.

| Token | Dark (graphite) | Light (enamel) | Role |
|---|---|---|---|
| `--panel` | `#2A251E` | `#DFE0DB` | the panel itself |
| `--panel-raised` | `#342E25` | `#E9EAE5` | row hover, lamp pool |
| `--panel-sunk` | `#201C16` | `#CFD1CA` | recessed |
| `--ink` | `#E8E2D6` | `#1C1E1C` | primary text |
| `--ink-dim` | `#A69C8B` | `#52564F` | secondary text, canvas labels |
| `--ink-faint` | `#85806D` | `#74786E` | **non-text only** — separators, hairlines |
| `--rule` | `#453E34` | `#C2C5BD` | structural rules |
| `--rule-strong` | `#5E5648` | `#A4A89D` | control borders, minor ticks |
| `--signal` | `#FFA23D` | `#9A4413` | **amber phosphor** |

**Measured contrast** — dark: ink 11.78:1, dim 5.61:1, faint 3.84:1, signal 7.59:1.
Light: ink 12.64:1, dim 5.65:1, faint 3.40:1, signal 4.93:1. Computed, not eyeballed;
two failures were found this way (`--ink-faint` at 2.63:1 carrying the context strip, and
a light signal at 3.77:1) and fixed.

### Rules the palette lives by

- **The signal is reserved.** Amber marks live readings and the pivot glyph. Nothing else
  is ever amber — that is what makes the pivot findable.
- **The ground is never near-black.** It is anodised metal under a desk lamp. Warmth has
  to be visible on screen, not merely present in the hex: R−B spread is 12.
- **`--ink-faint` is not for text.** It clears 3:1 for hairlines and separators and
  nothing more. Content-bearing text uses `--ink-dim` or better.
- Light mode is **cool grey-green enamel**, deliberately not cream. A warm off-white was
  the first attempt and was flagged as the default "tasteful AI surface".

---

## Typography

Both faces are **self-hosted** (`src/app/fonts/`, SIL OFL 1.1, provenance recorded).
The product is local-first, and a blocked webfont request would hand a first-time visitor
the system stack — the exact anti-goal.

| Face | Use |
|---|---|
| **Archivo** (variable) | all chrome: engraved labels, readouts, controls, canvas ticks |
| **Literata** (variable) | everything read: the word itself, document titles, prose |

**Two static steps: 11px and 15px.** Everything larger is fluid `clamp()` — the word
`clamp(38px, 7.4vw, 76px)`, the masthead `clamp(28px, 3.4vw, 40px)`, the rate readout
`clamp(26px, 3vw, 34px)`, calibration 22px. A seven-size scale was the first attempt and
read as flat.

- **Engraved labels**: 11px, `letter-spacing: 0.16em`, uppercase, `--ink-dim`. This is the
  instrument's voice — cut into the panel, not printed on it.
- **Readouts**: `font-variant-numeric: tabular-nums` everywhere a number changes. A rate
  readout whose digits shift width as it counts is a defect, not a detail.
- **Tracking** never exceeds `-0.03em` tight; wide tracking is for uppercase labels only.

---

## Material and component language

- **Engraved, never filled.** Controls are a hairline cut into the panel (`.engraved`,
  `.key`): 1px border, 2px radius, transparent ground, colour shift on hover. There is
  no filled button anywhere.
- **Quantities are tick scales, never bars.** Progress and rate are drawn on canvas with
  device-pixel-snapped hairlines (`crisp()` in `src/render/scales.ts`), because a 1px CSS
  border on a 2× display is two pixels and stops being a hairline.
- **No cards.** The library is a ruled catalogue: hairline row separators, ledger column
  heads, hover lifting the row's own ground. Nested cards would be worse.
- **Unlit states are drawn.** A disabled control is rendered as unlit, not hidden — the
  rewind keys at index 0, a failed document row, a loading row.
- **Icons are drawn**, 24px grid, 1.5px stroke, one weight. No emoji, no glyph fonts.
- **Elevation is declared once** — a border *or* a shadow, never both.

---

## The signature

The rate scale carries **two index marks**: the rate you set (filled amber, below) and
the rate actually delivered (hollow bone, above, nested around it). They must coincide.

This is the thesis made visible. Every surveyed RSVP reader misstates its own rate by
20–25%, which on this scale would be two visibly separate marks. The caption states the
reading in words — *"set 300 · delivered 300 · marks coincident"*, or *"+N adrift"*.

The scale is also **the rate input**: drag it. Sizing matters here and was got wrong
first — a 7px pointer pair under an 1880px scale is a speck, and the signature failed to
signify until both marks were tripled in size and named.

---

## Non-negotiable behaviour

These are functional constraints from the research, not stylistic preferences. A change
that breaks one is a defect regardless of how it looks.

1. **The pivot glyph must not move a single pixel between words.**
   `grid-template-columns: 1fr auto 1fr`, three spans, zero measurement. Never canvas
   `measureText` — it measures a shaped prefix against per-span DOM advances and is wrong
   in a way no test catches.
2. **Nothing renders near the fixation point during playback.** Status lives at the screen
   edges. The context strip is paused-only. The crosshair ticks are static and never
   change state. Anything that appears beside the word forces the saccade the format
   exists to remove.
3. **Rewind is prominent and one keystroke.** It is an accessibility affordance: removing
   regressions costs comprehension 84% → 71%, and readers stop attempting repairs without
   noticing.
4. **A visible pause control is mandatory** — WCAG 2.2 SC 2.2.2, Level A, applies by
   construction to auto-updating text.
5. **`prefers-reduced-motion`**: start paused, lower the default rate.
6. **Browser surfaces are themed** — selection, focus ring, caret, scrollbars. They ship
   with defaults belonging to no design system.

---

## Motion

Restrained by requirement, not by taste. 140ms colour transitions on controls, a
`cubic-bezier(0.16, 1, 0.3, 1)` ease, and nothing else. The one surface that must never
animate is the one everything else serves: the word swaps, it does not slide.

---

## What is known to be unverified

- **The light theme has never been captured.** Chrome's force-light flag had no effect on
  this build; it is verified by computed contrast only. Capture it before shipping — half
  of cold visitors may land there.
- **Pivot stability across frames** and the reduced-motion render need a human at the
  machine. No screenshot can show them.
- Both are recorded here rather than in a commit message because they outlive the commit.
