/**
 * Absolute-timeline scheduler.
 *
 * A target timestamp is carried forward and advanced by dwellMs[i]; each rAF advances the
 * index while now >= nextAt. Chained setTimeout re-arms from the callback's own start, so
 * lateness accumulates instead of cancelling — this does not, and it survives frame drops.
 */
export interface PlayerHooks {
  /** Current dwell for index i. Read fresh every beat so a speed change applies immediately. */
  dwellMs: (i: number) => number;
  count: () => number;
  /** Called whenever index or play state changes. */
  render: () => void;
}

export function createPlayer(hooks: PlayerHooks) {
  let index = 0;
  let playing = false;
  let nextAt = 0;
  let frame = 0;

  function tick(): void {
    if (!playing) return;
    const now = performance.now();
    let moved = false;
    while (playing && now >= nextAt) {
      if (index + 1 >= hooks.count()) {
        playing = false;
        break;
      }
      index++;
      nextAt += hooks.dwellMs(index);
      moved = true;
    }
    if (moved || !playing) hooks.render();
    if (playing) frame = requestAnimationFrame(tick);
  }

  const api = {
    get index() {
      return index;
    },
    get playing() {
      return playing;
    },
    play(rampMs = 0): void {
      if (playing || hooks.count() === 0) return;
      playing = true;
      // resume_ramp_ms: comfort on the first word after unpause, labelled as comfort.
      nextAt = performance.now() + hooks.dwellMs(index) + rampMs;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
      hooks.render();
    },
    pause(): void {
      if (!playing) return;
      playing = false;
      cancelAnimationFrame(frame);
      hooks.render();
    },
    /** Seek. Does NOT resume; the in-flight dwell is restarted because the word changed. */
    seek(i: number): void {
      index = Math.min(Math.max(i, 0), Math.max(hooks.count() - 1, 0));
      if (playing) nextAt = performance.now() + hooks.dwellMs(index);
      hooks.render();
    },
  };
  return api;
}
