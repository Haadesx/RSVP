import type { Boundary, TimingConfig, Token } from '../contracts/types.ts';
import timingJson from '../../config/timing.json';
import { tokenize } from '../stream/tokenize.ts';
import { clampWpm, computeTiming } from '../stream/timing.ts';
import { createWordView } from '../render/word.ts';
import { createPlayer } from '../render/player.ts';

const cfg = timingJson as unknown as TimingConfig;

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const wordHost = el('word');
const wpmEl = el('wpm');
const skimEl = el('skim');
const deliveredEl = el('delivered');
const progressEl = el('progress');
const stateEl = el('state');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const drawWord = createWordView(wordHost);
let tokens: Token[] = [];
let dwellMs: number[] = [];
let wpm = reducedMotion ? 180 : cfg.target_wpm;
let deliveredWpm = 0;

function retime(): void {
  ({ dwellMs, deliveredWpm } = computeTiming({ tokens, config: { ...cfg, target_wpm: wpm } }));
}

const player = createPlayer({
  dwellMs: (i) => dwellMs[i] ?? 60000 / wpm,
  count: () => tokens.length,
  render,
});

function render(): void {
  const t = tokens[player.index];
  drawWord(t?.text ?? '', t?.pivot ?? 0);
  wpmEl.textContent = `${wpm} wpm`;
  skimEl.hidden = wpm <= cfg.skim_threshold_wpm;
  deliveredEl.textContent = `delivered ${Math.round(deliveredWpm)}`;
  progressEl.textContent = `${tokens.length ? player.index + 1 : 0} / ${tokens.length}`;
  stateEl.textContent = player.playing ? 'playing' : 'paused';
}

/** Back `rewind_backoff_words`, then walk to the token after the previous break. */
function blockStart(from: number, isBreak: (b: Boundary) => boolean): number {
  let i = Math.max(0, from - cfg.rewind_backoff_words);
  while (i > 0 && !isBreak(tokens[i - 1]!.boundary)) i--;
  return i;
}

const SENTENCE_BREAK = (b: Boundary) => b === 'sentence' || b === 'paragraph';
const PARAGRAPH_BREAK = (b: Boundary) => b === 'paragraph';

// Spec 11 lists the frame-exact rates on a 60 Hz panel: 300, 400, 450, 600, 720, 900.
// 450 is the first one above skim_threshold_wpm, so `S` lands on a rate the UI will
// honestly label SKIM and the scheduler can actually hit on the commonest display.
const SKIM_WPM = 450;

function setWpm(next: number): void {
  wpm = clampWpm(next, cfg);
  // Recompute the schedule and KEEP the index. The in-flight dwell is deliberately not
  // restarted: a held arrow key repeating at 20-30 Hz would otherwise freeze the display.
  retime();
  render();
}

addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey) return;
  switch (e.key) {
    case ' ':
      player.playing ? player.pause() : player.play(cfg.resume_ramp_ms);
      break;
    case 'ArrowLeft':
      // Alt = paragraph, Shift = sentence, bare = one word.
      player.seek(
        e.altKey ? blockStart(player.index, PARAGRAPH_BREAK)
          : e.shiftKey ? blockStart(player.index, SENTENCE_BREAK)
            : player.index - 1,
      );
      break;
    case 'ArrowRight':
      player.seek(player.index + 1);
      break;
    case 'ArrowUp':
      setWpm(wpm + 25);
      break;
    case 'ArrowDown':
      setWpm(wpm - 25);
      break;
    case 's':
    case 'S':
      setWpm(wpm === SKIM_WPM ? cfg.target_wpm : SKIM_WPM);
      break;
    default:
      return;
  }
  e.preventDefault();
});

// Alt-tab must not silently burn the reader's position.
addEventListener('visibilitychange', () => {
  if (document.hidden) player.pause();
});

// fixtures/ is Vite's publicDir, so sample.txt is served next to index.html.
const res = await fetch(new URL('sample.txt', document.baseURI));
tokens = tokenize(await res.text());
retime();
render(); // prefers-reduced-motion and everything else: start PAUSED.
