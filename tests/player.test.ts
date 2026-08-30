import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * The scheduler reads `performance.now` and `requestAnimationFrame` off the global.
 * Stub both with a virtual clock so the absolute-timeline claim is actually testable:
 * chained setTimeout accumulates lateness, this must not.
 */
let clock = 0;
const pending: (() => void)[] = [];
globalThis.performance = { now: () => clock } as Performance;
globalThis.requestAnimationFrame = ((cb: () => void) => {
  pending.push(cb);
  return pending.length;
}) as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;

/** Advance the virtual clock and drain exactly one frame callback. */
function frame(ms: number): void {
  clock += ms;
  const cbs = pending.splice(0, pending.length);
  for (const cb of cbs) cb();
}

const { createPlayer } = await import('../src/render/player.ts');

test('index advances on the absolute timeline and does not drift after a stalled frame', () => {
  const dwell = 100;
  const player = createPlayer({ dwellMs: () => dwell, count: () => 100, render: () => {} });

  player.play();               // word 0 is due to leave at t=100
  assert.equal(player.index, 0);

  frame(16); assert.equal(player.index, 0);
  frame(90); assert.equal(player.index, 1); // t=106, past 100

  // A 500 ms stall: five whole words elapsed. An absolute timeline catches all of them.
  frame(500);                                // t=606
  assert.equal(player.index, 6);             // leaves due at 100,200,...,700

  // And it is still on the ORIGINAL timeline, not re-based on the late frame.
  frame(100); assert.equal(player.index, 7); // t=706
});

test('a speed change does not restart the in-flight dwell', () => {
  clock = 0;
  pending.length = 0;
  let dwell = 1000;
  const player = createPlayer({ dwellMs: () => dwell, count: () => 100, render: () => {} });
  player.play();               // word 0 due to leave at t=1000

  frame(500);
  assert.equal(player.index, 0);

  // Speed up hard, repeatedly, the way a held arrow key does at 30 Hz.
  for (let i = 0; i < 30; i++) dwell = 50;
  frame(499);                  // t=999 — still inside the ORIGINAL 1000 ms budget
  assert.equal(player.index, 0, 'the in-flight dwell must not be re-armed');

  frame(5);                    // t=1004 — original budget expires
  assert.equal(player.index, 1);
  frame(60);                   // t=1064 — the new 50 ms budget now applies
  assert.equal(player.index, 2);
});

test('playback stops at the end of the stream', () => {
  clock = 0;
  pending.length = 0;
  const player = createPlayer({ dwellMs: () => 10, count: () => 3, render: () => {} });
  player.play();
  frame(1000);
  assert.equal(player.index, 2);
  assert.equal(player.playing, false);
});
