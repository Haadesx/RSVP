import type { TimingConfig, TimingInput, TimingResult, Token } from '../contracts/types.ts';
import { graphemeLength } from './graphemes.ts';

/** First table row whose threshold is >= the value; the last row is the catch-all. */
const lengthMult = (cfg: TimingConfig, g: number) =>
  (cfg.length_mult.find((r) => g <= r.max_chars) ?? cfg.length_mult.at(-1)!).mult;

const sentenceScale = (cfg: TimingConfig, w: number) =>
  (cfg.sentence_len_scale.find((r) => w <= r.max_words) ?? cfg.sentence_len_scale.at(-1)!).mult;

/** Words in each sentence, indexed by the token that ENDS that sentence. */
function sentenceWordCounts(tokens: Token[]): Map<number, number> {
  const counts = new Map<number, number>();
  let words = 0;
  for (let i = 0; i < tokens.length; i++) {
    // Continuation fragments are one word rendered over several beats, not several words.
    if (!tokens[i]!.continuation) words++;
    const b = tokens[i]!.boundary;
    if (b === 'sentence' || b === 'paragraph') {
      counts.set(i, words);
      words = 0;
    }
  }
  return counts;
}

/**
 * `'paragraph'` IMPLIES a sentence end (contract, spec 10): it takes the scaled sentence
 * pause AND the paragraph pause. Treating them as exclusive gave the largest structural
 * break a shorter pause (500 ms) than a long sentence end (320 x 3.3 = 1056 ms).
 */
function boundaryPauseMs(token: Token, sentenceWords: number, cfg: TimingConfig): number {
  const sentence = cfg.pause_sentence_ms * sentenceScale(cfg, sentenceWords);
  switch (token.boundary) {
    case 'comma':
      return cfg.pause_comma_ms;
    case 'sentence':
      return sentence;
    case 'paragraph':
      return sentence + cfg.pause_paragraph_ms;
    default:
      return 0;
  }
}

/**
 * The word component and the boundary pause, kept apart on purpose: the ceiling clamps the
 * WORD and never the pause. Pre-normalization, so tests can prove duration normalization is
 * doing real work — the naive sum is what every surveyed reader ships, and it is 20-25% slow.
 */
export interface DwellParts {
  word: number[];
  pause: number[];
}

export function rawParts(tokens: Token[], cfg: TimingConfig): DwellParts {
  const base = 60000 / cfg.target_wpm;
  const words = sentenceWordCounts(tokens);
  const word: number[] = [];
  const pause: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    word.push(base * lengthMult(cfg, graphemeLength(t.text)) * (t.numeric ? cfg.numeric_mult : 1));
    pause.push(boundaryPauseMs(t, words.get(i) ?? 0, cfg));
  }
  return { word, pause };
}

/** Unclamped word + pause. */
export function rawDwellsMs(tokens: Token[], cfg: TimingConfig): number[] {
  const { word, pause } = rawParts(tokens, cfg);
  return word.map((w, i) => w + pause[i]!);
}

/**
 * Solve for the normalization scale that makes the CLAMPED total equal the target total:
 *
 *   dwell_i(s) = min(word_i * s, ceiling) + pause_i * s
 *
 * Scaling and then clamping the total (the pre-Gate-2 reading) overshoots and also flattens
 * every boundary onto the ceiling. `Σ dwell_i(s)` is non-decreasing in s, so one bisection
 * recovers the duration invariant with the word ceiling intact.
 *
 * The pause term is unbounded in s, so a stream that contains boundary pauses can reach a
 * target below 60000/word_dwell_ceiling_ms (~171 wpm) by stretching its pauses. A stream
 * with NO pauses saturates at n*ceiling; there `deliveredWpm` honestly reports the slowest
 * rate the ceiling permits rather than a number the schedule cannot deliver.
 *
 * ponytail: O(60n) bisection per retime, fine to book length; swap for the sorted
 * prefix-sum closed form if a speed change ever feels laggy.
 */
function solveScale({ word, pause }: DwellParts, targetTotal: number, ceiling: number): number {
  const total = (s: number) =>
    word.reduce((a, w, i) => a + Math.min(w * s, ceiling) + pause[i]! * s, 0);
  const smallest = word.reduce((m, w) => Math.min(m, w), Infinity);
  if (!(smallest > 0)) return 1;

  let hi = ceiling / smallest; // at this scale every WORD is clamped
  if (pause.some((p) => p > 0)) {
    for (let k = 0; k < 80 && total(hi) < targetTotal; k++) hi *= 2;
  }
  if (total(hi) <= targetTotal) return hi; // saturated: unreachable, report it honestly

  let lo = 0;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (total(mid) < targetTotal) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function computeTiming({ tokens, config }: TimingInput): TimingResult {
  if (tokens.length === 0) return { dwellMs: [], deliveredWpm: 0 };

  const base = 60000 / config.target_wpm;
  const parts = rawParts(tokens, config);

  // Duration normalization. Without it "400 wpm" delivers ~300 and the UI lies.
  const scale = solveScale(parts, tokens.length * base, config.word_dwell_ceiling_ms);

  // Ceiling on the word only, and no floor anywhere: a floor would silently ignore the
  // user's speed setting, and a ceiling on the pause flattens the boundary structure.
  const dwellMs = parts.word.map(
    (w, i) => Math.min(w * scale, config.word_dwell_ceiling_ms) + parts.pause[i]! * scale,
  );

  const total = dwellMs.reduce((a, b) => a + b, 0);
  return { dwellMs, deliveredWpm: total > 0 ? tokens.length / (total / 60000) : 0 };
}

/**
 * UI speed clamp, read from config — the bounds are `min_wpm`/`max_wpm`, never literals.
 *
 * The floor is 150 and not 100 for a measured reason (contract, spec 10): the word ceiling
 * forbids slowing RSVP by holding words longer, so below ~150 wpm all the remaining budget
 * lands in the boundary pauses — 2.0 s at 150 on the fixture, 8.8 s at 100.
 *
 * Clamps rather than rejects, so a step that would overshoot (160 - 25) lands exactly on
 * the boundary instead of leaving the floor unreachable.
 */
export const clampWpm = (wpm: number, cfg: TimingConfig): number =>
  Math.min(cfg.max_wpm, Math.max(cfg.min_wpm, wpm));
