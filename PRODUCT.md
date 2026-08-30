# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: adults who read long-form text on a screen and want to get through more of it —
students, researchers, and knowledge workers facing a queue of papers, reports and
articles. They are competent readers, not struggling ones. The recurring situation is a
document they have not read, limited time, and a decision to make about it: *is this worth
my full attention, and if so, which parts?*

Secondary, confirmed by evidence rather than by ambition: **adults with ADHD.** The one
controlled study in which RSVP beat ordinary text found ADHD readers improved 6.96% while
neurotypical controls got 5.82% worse, at ~240 wpm. This is a citable finding, not a
marketing claim — see Brand Commitments.

The owner is also a user, on a MacBook, reading academic PDFs.

## Users' devices

Large desktop monitor, laptop, and phone. Not tablet-first. The phone case is the one where
the product's genuine advantage lives: one word at a time needs almost no screen.

## Product Purpose

Turn a document into something you can get through — either by reading it at a controlled
pace, or by seeing its structure and deciding what to read. Success is a reader who
finishes documents they would otherwise have left unopened, and who trusts what they took
from them.

## Positioning

Two mechanisms a neighbouring product could not truthfully copy, because almost every
competitor gets both wrong:

1. **An honest pacer.** Every surveyed RSVP reader misreports its own speed by 20–25%
   because it multiplies per-word delays without renormalising. This one solves for the
   scale factor so the number on screen is the number delivered. "300 wpm" means 300 wpm.
2. **Numeric and structural fidelity.** Every shipped RSVP reader corrupts numbers in its
   tokenizer — `3.14` split across two frames, `Table 2, 15` merged into `2,15`, `±` and
   `=` silently deleted — and none detects multi-column layout, so every one of them reads
   running headers and page numbers into the word stream. Ours does not.

The positioning is **accuracy, not speed.** The research is unambiguous that RSVP does not
make people read faster, and the honest pitch is a paced reading surface that fits
anywhere, not a speed multiplier.

## Operating Context

A reader has a queue of unread documents. They add one, and either read it at a set pace or
skim its structure first. Reading happens in sessions that get interrupted, so position is
always preserved to the exact word. The reading device may be a 32-inch monitor or a phone
on a train.

Extraction of PDFs may involve a separate GPU machine over HTTP, but **reading never blocks
on it** and the reader works fully offline once a document is loaded.

## Capabilities and Constraints

**Built (Phase 2):** tokenizer preserving numerics and abbreviations; timing model with
duration normalization; pivot-stable renderer; play/pause, speed, rewind by word and
sentence and paragraph.

**Specified, not yet built:** PDF ingestion, per-page escalation to a vision model,
structural labelling (body / heading / caption / footnote / equation / table / …), library
and persistence, structure-based Skim.

**Hard constraints — all three are functional, not stylistic:**
- The pivot glyph must not move a single pixel between words. Layout shift is the one thing
  that makes these apps feel broken.
- **Nothing may render near the fixation point during playback.** The format depends on the
  eye never leaving one spot; a toast or tooltip beside the word forces exactly the saccade
  the design exists to remove. Status belongs at the screen edges.
- Rewind must be one keystroke and prominent. Removing regressions costs comprehension
  84% → 71%, and readers stop attempting repairs without noticing, so rewind is an
  accessibility affordance rather than a convenience.

**Technical:** Vite + TypeScript, no UI framework. Three devDependencies. Runs with
`npm install && npm run dev` on macOS with no toolchain beyond Node.

**Rate:** default 300 wpm delivered; slider 150–1000; above 400 the UI must say **Skim**,
not present it as a reading rate.

## Brand Commitments

**Claims are legally constrained and the constraint is binding on all copy.** The FTC has
litigated this exact claim class (the 1998 Berg "Mega Reading" order; the 2016 Lumosity
order, whose complaint names ADHD explicitly). The supportable and unsupportable claim
lists live in `docs/research/reading-speed-mechanisms.md` §7 and govern every word of UI
copy and marketing.

Never ship: "removes subvocalization", "2× faster with the same comprehension", "better for
skimming", "helps with ADHD" as a benefit, or any speed-multiplier claim.

Supportable: a **space** claim ("a whole article in almost no screen"), a **pacer** claim,
and a bounded-rate claim ("up to 300 wpm — above the 238 wpm adult average").

Voice: precise, unhyped, quietly confident. The product's whole differentiator is that it
tells the truth about itself where competitors do not, so overclaiming anywhere in the UI
would undercut the thing that makes it worth using.

## Evidence on Hand

Five research dossiers, ~50,000 words, ~470 verified primary sources, in `docs/research/`
— every claim link-checked by an adversarial audit pass. This is real and unusually strong
evidence for a product of this size, and it is quotable.

**Absences that must not be fabricated:** no user testimonials, no customers, no usage
data, no in-house comprehension study, no benchmark of our own. There is no evidence that
*this* app makes anyone read faster, and none can be implied.

## Product Principles

1. **Tell the truth about the number.** Displayed rate equals delivered rate. This is the
   product in miniature.
2. **The word is the interface.** Everything else recedes; nothing competes with the
   fixation point while reading.
3. **Reading survives interruption.** Position, always, to the exact word.
4. **Never silently corrupt content.** A wrong digit that looks plausible is worse than a
   visible failure. Flag what has not been verified.
5. **Claim only what the evidence supports.** Accuracy is the positioning; overclaiming
   destroys it.

## Accessibility & Inclusion

- **WCAG 2.2 SC 2.2.2 "Pause, Stop, Hide" is Level A and applies by construction** — this
  is auto-updating text that starts on a timer. A visible pause control is mandatory, not
  optional.
- Honour `prefers-reduced-motion`: start paused, default to a lower rate.
- Rewind is an accessibility affordance (see Constraints).
- ADHD readers are a real, evidenced audience; the interface should suit them without the
  product making a health claim.
