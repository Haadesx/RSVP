import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Boundary, TimingConfig, Token } from '../src/contracts/types.ts';
import { tokenize } from '../src/stream/tokenize.ts';
import { clampWpm, computeTiming, rawDwellsMs } from '../src/stream/timing.ts';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const BASE = JSON.parse(read('../config/timing.json')) as TimingConfig;
const fixture = read('../fixtures/sample.txt');
const tokens = tokenize(fixture);

/**
 * The same stream with every clamp trigger and every boundary pause removed. Pause-free is
 * now load-bearing: the word ceiling is the ONLY thing bounding such a stream, so this is
 * where "a target below 60000/word_dwell_ceiling_ms is unreachable" is still true.
 */
const clampFree: Token[] = tokens
  .filter((t) => !t.numeric)
  .map((t) => ({ ...t, boundary: 'none' as const }));

const at = (target_wpm: number): TimingConfig => ({ ...BASE, target_wpm });
/** Same config with sentence_len_scale flattened to a single no-op row. */
const flattened = (target_wpm: number): TimingConfig => ({
  ...at(target_wpm),
  sentence_len_scale: [{ max_words: 9999, mult: 1.0 }],
});

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => sum(xs) / xs.length;
/** Word clamping is only observable where there is no pause riding on top of it. */
const clampedCount = (ts: Token[], dwells: number[], cfg: TimingConfig) =>
  dwells.filter((d, i) => ts[i]!.boundary === 'none' && d >= cfg.word_dwell_ceiling_ms - 1e-9)
    .length;
const byBoundary = (dwells: number[], b: Boundary) =>
  dwells.filter((_, i) => tokens[i]!.boundary === b);

test('the fixture tokenizes into something worth timing', () => {
  assert.ok(tokens.length > 400, `only ${tokens.length} tokens`);
  assert.ok(tokens.some((t) => t.numeric), 'fixture must contain numerics');
  assert.ok(tokens.some((t) => t.boundary === 'paragraph'), 'fixture must contain paragraphs');
});

test('sentence_len_scale demonstrably changes the schedule', () => {
  // THE Gate 2 guard. Under the old total-clamp this was 0 of 467 differing dwells at every
  // rate in the reading band: the whole table was inert and nobody could tell.
  for (const target of [250, 400]) {
    const real = computeTiming({ tokens, config: at(target) }).dwellMs;
    const flat = computeTiming({ tokens, config: flattened(target) }).dwellMs;
    const differing = real.filter((d, i) => Math.abs(d - flat[i]!) > 1e-9).length;
    assert.ok(differing > 0, `flattening sentence_len_scale changed nothing at ${target} wpm`);
    assert.ok(
      differing > tokens.length / 4,
      `only ${differing} of ${tokens.length} dwells moved at ${target} wpm`,
    );
  }
});

test('boundary ordering holds: paragraph > sentence > comma > none', () => {
  const { dwellMs } = computeTiming({ tokens, config: at(250) });
  const m = {
    none: mean(byBoundary(dwellMs, 'none')),
    comma: mean(byBoundary(dwellMs, 'comma')),
    sentence: mean(byBoundary(dwellMs, 'sentence')),
    paragraph: mean(byBoundary(dwellMs, 'paragraph')),
  };
  const label = JSON.stringify(m);
  assert.ok(m.paragraph > m.sentence, `paragraph must out-pause sentence: ${label}`);
  assert.ok(m.sentence > m.comma, `sentence must out-pause comma: ${label}`);
  assert.ok(m.comma > m.none, `comma must out-pause no boundary: ${label}`);
});

test('a long sentence gets a materially longer end-pause than a short one', () => {
  // Identical words, identical everything but sentence length: 5 words vs 30.
  const stream = (words: number) => tokenize(`${'word '.repeat(words - 1)}end. tail`);
  const shortDwell = computeTiming({ tokens: stream(5), config: at(250) }).dwellMs[4]!;
  const longDwell = computeTiming({ tokens: stream(30), config: at(250) }).dwellMs[29]!;
  const ratio = longDwell / shortDwell;
  // sentence_len_scale is 1.0 at <=7 words and 3.3 above 22; normalization moves it a little.
  assert.ok(ratio > 2.5, `long/short sentence-final dwell ratio only ${ratio.toFixed(2)}`);
  assert.ok(ratio < 4.5, `ratio ${ratio.toFixed(2)} is larger than the table can explain`);
});

test('a paragraph break costs strictly more than the sentence end it contains', () => {
  const para = computeTiming({ tokens: tokenize('one two three end.\n\nnext'), config: at(250) });
  const sent = computeTiming({ tokens: tokenize('one two three end. next'), config: at(250) });
  // Same four words, same sentence length; the only difference is the blank line.
  assert.ok(
    para.dwellMs[3]! > sent.dwellMs[3]!,
    `paragraph ${para.dwellMs[3]} must exceed sentence ${sent.dwellMs[3]}`,
  );
});

test('duration normalization delivers the requested rate on the REAL stream, clamp and all', () => {
  // The contract's whole reason for `deliveredWpm`: it must equal target_wpm to within
  // rounding. Testing this only on a synthetic clamp-free stream would let a ~10% overshoot
  // ship — scale-then-clamp removes time, so a naive implementation always runs fast.
  for (const target of [250, 400, 600, 800, 1000]) {
    const { deliveredWpm } = computeTiming({ tokens, config: at(target) });
    const err = Math.abs(deliveredWpm - target) / target;
    assert.ok(err < 0.001, `delivered ${deliveredWpm.toFixed(2)} vs target ${target}`);
  }
  // ...and the word ceiling really is still biting at the default rate, so that is not free.
  const cfg = at(250);
  assert.ok(clampedCount(tokens, computeTiming({ tokens, config: cfg }).dwellMs, cfg) > 0);
});

test('and on a clamp-free stream too', () => {
  for (const target of [250, 400]) {
    const cfg = at(target);
    const { dwellMs, deliveredWpm } = computeTiming({ tokens: clampFree, config: cfg });
    assert.equal(clampedCount(clampFree, dwellMs, cfg), 0, `clamp bit at ${target} — invalid`);
    assert.ok(Math.abs(deliveredWpm - target) / target < 0.001, `delivered ${deliveredWpm}`);
  }
});

test('a target the word ceiling cannot reach is reported honestly, not faked', () => {
  // On a stream with NO boundary pauses the word ceiling bounds the whole schedule: below
  // 60000/350 = 171.4 wpm every dwell clamps and the stream cannot run slower. Say so.
  const cfg = at(100);
  const { dwellMs, deliveredWpm } = computeTiming({ tokens: clampFree, config: cfg });
  assert.equal(
    clampedCount(clampFree, dwellMs, cfg),
    clampFree.length,
    'every dwell should be at the ceiling',
  );
  assert.ok(Math.abs(deliveredWpm - 60000 / cfg.word_dwell_ceiling_ms) < 0.01, `${deliveredWpm}`);
});

test('but real prose CAN reach a slow target, because pauses are not clamped', () => {
  // Consequence of Gate 2, and a change from Phase 2: the pause term is unbounded in the
  // normalization scale, so 150 wpm is now delivered exactly instead of reported as 171.4.
  const { deliveredWpm } = computeTiming({ tokens, config: at(150) });
  assert.ok(Math.abs(deliveredWpm - 150) / 150 < 0.001, `delivered ${deliveredWpm}`);
});

test('WITHOUT normalization the naive schedule is 18-25% slow', () => {
  for (const target of [250, 400]) {
    const cfg = at(target);
    const naiveWpm = tokens.length / (sum(rawDwellsMs(tokens, cfg)) / 60000);
    const shortfall = (target - naiveWpm) / target;
    // This is the number every shipped reader surveyed puts on its speed control.
    assert.ok(
      shortfall > 0.15,
      `naive shortfall only ${(shortfall * 100).toFixed(1)}% at ${target} wpm`,
    );
    // And on the clamp-free stream, normalization removes essentially all of it.
    const naiveFree = clampFree.length / (sum(rawDwellsMs(clampFree, cfg)) / 60000);
    const { deliveredWpm } = computeTiming({ tokens: clampFree, config: cfg });
    assert.ok(
      Math.abs(deliveredWpm - target) < Math.abs(naiveFree - target) / 10,
      `normalization must close the gap: naive ${naiveFree.toFixed(1)}, delivered ${deliveredWpm.toFixed(1)}`,
    );
  }
});

test('the ceiling clamps the WORD and only the word — and there is still no floor', () => {
  for (const target of [150, 250, 400, 1000]) {
    const cfg = at(target);
    const { dwellMs } = computeTiming({ tokens, config: cfg });
    for (let i = 0; i < tokens.length; i++) {
      // A boundary-free token has no pause riding along, so its dwell IS the word component.
      if (tokens[i]!.boundary !== 'none') continue;
      assert.ok(
        dwellMs[i]! <= cfg.word_dwell_ceiling_ms + 1e-9,
        `word dwell ${dwellMs[i]} breached the ceiling at ${target} wpm`,
      );
    }
    // Anything above the ceiling must be carrying a boundary pause. That is now the point.
    const over = dwellMs.flatMap((d, i) =>
      d > cfg.word_dwell_ceiling_ms + 1e-9 ? [tokens[i]!] : [],
    );
    assert.ok(over.length > 0, `no dwell exceeded the ceiling at ${target} wpm — test is weak`);
    assert.ok(over.every((t) => t.boundary !== 'none'), 'a boundary-free token exceeded it');
  }
  // No floor clamp: high rates produce genuinely short dwells.
  const { dwellMs } = computeTiming({ tokens, config: at(1000) });
  assert.ok(Math.min(...dwellMs) < 60, `shortest dwell ${Math.min(...dwellMs)}ms looks floored`);
});

test('numeric_mult and the comma pause move the raw schedule', () => {
  const cfg = at(250);
  const plain = rawDwellsMs(tokenize('alpha beta gamma delta'), cfg);
  const withNum = rawDwellsMs(tokenize('alpha 3.14 gamma delta'), cfg);
  assert.ok(withNum[1]! > plain[1]! * 1.9, 'a numeric token should cost ~2x');
  const comma = rawDwellsMs(tokenize('alpha, beta gamma delta'), cfg);
  assert.equal(comma[0]! - plain[0]!, cfg.pause_comma_ms);
});

test('sentence pause scales with the length of the sentence just ended', () => {
  const cfg = at(250);
  const shortPause = rawDwellsMs(tokenize('one two three end. next'), cfg)[3]!;
  const longPause = rawDwellsMs(tokenize(`${'word '.repeat(25)}end. next`), cfg)[25]!;
  assert.ok(longPause > shortPause, 'a 26-word sentence must out-pause a 4-word one');
});

test('an empty stream is not a crash', () => {
  assert.deepEqual(computeTiming({ tokens: [], config: at(250) }), { dwellMs: [], deliveredWpm: 0 });
});

// ── UI speed clamp (Gate 2: floor 150, not 100) ──────────────────────────────
// The keydown handler steps by 25; a step that would overshoot must be clamped, not
// rejected, or the floor is only reachable from rates that happen to divide by the step.
const STEP = 25;

test('stepping down from the default stops exactly at min_wpm', () => {
  for (const step of [STEP, 35]) {
    let wpm = BASE.target_wpm;
    for (let i = 0; i < 100; i++) {
      wpm = clampWpm(wpm - step, BASE);
      assert.ok(wpm >= BASE.min_wpm, `step ${step} fell to ${wpm}, below ${BASE.min_wpm}`);
    }
    assert.equal(wpm, BASE.min_wpm, `step ${step} never landed on the floor exactly`);
  }
});

test('stepping up from the default stops exactly at max_wpm', () => {
  for (const step of [STEP, 35]) {
    let wpm = BASE.target_wpm;
    for (let i = 0; i < 100; i++) {
      wpm = clampWpm(wpm + step, BASE);
      assert.ok(wpm <= BASE.max_wpm, `step ${step} rose to ${wpm}, above ${BASE.max_wpm}`);
    }
    assert.equal(wpm, BASE.max_wpm, `step ${step} never landed on the ceiling exactly`);
  }
});

test('the bounds come from the config, not from literals in the source', () => {
  // If 100/1000 were still hardcoded anywhere in the clamp, this fails.
  const odd: TimingConfig = { ...BASE, min_wpm: 210, max_wpm: 640 };
  assert.equal(clampWpm(100, odd), 210);
  assert.equal(clampWpm(1000, odd), 640);
  assert.equal(clampWpm(100, BASE), BASE.min_wpm);
  assert.equal(clampWpm(1000, BASE), BASE.max_wpm);
  assert.equal(clampWpm(BASE.target_wpm, BASE), BASE.target_wpm);
});

test('the floor is where the fixture is still readable and 100 wpm is not', () => {
  // The reason min_wpm is 150: the word ceiling forbids slowing by holding words longer,
  // so the whole remaining budget lands in the boundary pauses.
  const longest = (target: number) =>
    Math.max(...computeTiming({ tokens, config: at(target) }).dwellMs);
  assert.ok(longest(BASE.min_wpm) < 2500, `${longest(BASE.min_wpm)}ms at the floor`);
  assert.ok(longest(100) > 5000, `${longest(100)}ms at 100 wpm — the guard has nothing to guard`);
});
