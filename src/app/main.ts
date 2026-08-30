import type { Boundary, TimingConfig, Token } from '../contracts/types.ts';
import timingJson from '../../config/timing.json';
import { tokenize } from '../stream/tokenize.ts';
import { clampWpm, computeTiming } from '../stream/timing.ts';
import { createWordView } from '../render/word.ts';
import { createPlayer } from '../render/player.ts';
import { drawProgressScale, drawRateScale } from '../render/scales.ts';

const cfg = timingJson as unknown as TimingConfig;

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const libraryView = el('library');
const readerView = el('reader');
const catList = el<HTMLUListElement>('cat-list');
const catEmpty = el('cat-empty');
const calValue = el('cal-value');
const fileInput = el<HTMLInputElement>('file-input');

const wordHost = el('word');
const wpmEl = el('wpm');
const skimEl = el('skim');
const deliveredEl = el('delivered');
const progressEl = el('progress');
const stateEl = el('state');
const docTitleEl = el('doc-title');
const a11yState = el('a11y-state');
const btnPlay = el<HTMLButtonElement>('btn-play');
const playIcon = btnPlay.querySelector('use') as SVGUseElement;
const contextEl = el('context');
const progressCanvas = el<HTMLCanvasElement>('progress-scale');
const rateCanvas = el<HTMLCanvasElement>('rate-scale');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A document in the library. `tokens` is filled lazily on first open. */
interface Doc {
  id: string;
  title: string;
  meta: string;
  /** Served from fixtures/ (Vite publicDir), or null for a user-added file. */
  src: string | null;
  text?: string;
  tokens?: Token[];
  /** 0..1, how far the reader got. */
  progress: number;
}

const docs: Doc[] = [
  {
    id: 'firth',
    title: 'The Distributional Hypothesis and Its Discontents',
    meta: 'Sample document · computational semantics',
    src: 'sample.txt',
    progress: 0,
  },
  {
    id: 'masson',
    title: 'Why RSVP Loses to Skimming',
    meta: 'Project note · from the research dossiers',
    src: 'masson.txt',
    progress: 0,
  },
  {
    id: 'inner-voice',
    title: 'The Inner Voice Is Not the Bottleneck',
    meta: 'Project note · from the research dossiers',
    src: 'inner-voice.txt',
    progress: 0,
  },
];

const drawWord = createWordView(wordHost);
let current: Doc | null = null;
let tokens: Token[] = [];
let dwellMs: number[] = [];
let wpm = reducedMotion ? 200 : cfg.target_wpm;
let deliveredWpm = 0;

function retime(): void {
  ({ dwellMs, deliveredWpm } = computeTiming({ tokens, config: { ...cfg, target_wpm: wpm } }));
}

const player = createPlayer({
  dwellMs: (i) => dwellMs[i] ?? 60000 / wpm,
  count: () => tokens.length,
  render,
});

/* ── Library ─────────────────────────────────────────────────────────────── */

/** Mark diameter carries document length, so the type does not have to. */
function markSize(words: number): number {
  const t = Math.min(1, Math.log10(Math.max(words, 1)) / 4); // 1 → 10,000 words
  return 5 + Math.round(t * 9);
}

function renderLibrary(): void {
  catList.replaceChildren();
  catEmpty.hidden = docs.length > 0;

  for (const doc of docs) {
    const words = doc.tokens?.length ?? 0;
    const li = document.createElement('li');
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'cat-row';
    row.dataset.read = String(doc.progress >= 0.99);

    const size = markSize(words || 500);
    row.innerHTML = `
      <span class="mark" style="width:${size}px;height:${size}px"></span>
      <span>
        <span class="cat-title"></span>
        <span class="cat-meta"></span>
      </span>
      <span class="cat-extent">${words ? words.toLocaleString() : '—'}</span>
      <span class="cat-read" data-progress="${doc.progress ? 1 : 0}">${
        doc.progress ? `${Math.round(doc.progress * 100)}%` : '—'
      }</span>`;
    // textContent, not innerHTML — titles are content, never markup.
    row.querySelector('.cat-title')!.textContent = doc.title;
    row.querySelector('.cat-meta')!.textContent = doc.meta;

    row.addEventListener('click', () => void open(doc));
    li.append(row);
    catList.append(li);
  }
}

async function loadTokens(doc: Doc): Promise<void> {
  if (doc.tokens) return;
  if (doc.text == null) {
    if (!doc.src) throw new Error('document has no source');
    const res = await fetch(new URL(doc.src, document.baseURI));
    if (!res.ok) throw new Error(`could not load ${doc.src}`);
    doc.text = await res.text();
  }
  doc.tokens = tokenize(doc.text);
}

async function open(doc: Doc): Promise<void> {
  await loadTokens(doc);
  current = doc;
  tokens = doc.tokens!;
  retime();
  libraryView.hidden = true;
  readerView.hidden = false;
  docTitleEl.textContent = doc.title;
  player.seek(Math.floor(doc.progress * Math.max(tokens.length - 1, 0)));
  sizeCanvases();
  render();
}

function toLibrary(): void {
  player.pause();
  if (current && tokens.length) current.progress = player.index / (tokens.length - 1 || 1);
  readerView.hidden = true;
  libraryView.hidden = false;
  renderLibrary();
}

/* ── Reader ──────────────────────────────────────────────────────────────── */

function sizeCanvases(): void {
  for (const c of [progressCanvas, rateCanvas]) {
    const r = c.getBoundingClientRect();
    if (!r.width) continue;
    const dpr = Math.min(devicePixelRatio || 1, 3);
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
  }
}

function render(): void {
  const t = tokens[player.index];
  drawWord(t?.text ?? '', t?.pivot ?? 0);

  wpmEl.textContent = String(wpm);
  skimEl.hidden = wpm <= cfg.skim_threshold_wpm;
  progressEl.textContent = `${tokens.length ? player.index + 1 : 0} / ${tokens.length}`;

  const playing = player.playing;
  stateEl.textContent = playing ? 'playing' : 'paused';
  btnPlay.dataset.playing = String(playing);
  btnPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  playIcon.setAttribute('href', playing ? '#i-pause' : '#i-play');
  a11yState.textContent = playing ? 'Playing.' : 'Paused.';

  // The calibration claim, stated as a measurement rather than a promise.
  const drift = Math.abs(deliveredWpm - wpm);
  deliveredEl.textContent =
    drift < 1
      ? `delivered ${Math.round(deliveredWpm)} · coincident`
      : `delivered ${Math.round(deliveredWpm)} · ${drift > 0 ? '+' : ''}${Math.round(deliveredWpm - wpm)}`;

  renderContext(playing);

  const css = getComputedStyle(document.documentElement);
  drawRateScale(rateCanvas, {
    min: cfg.min_wpm,
    max: cfg.max_wpm,
    set: wpm,
    delivered: deliveredWpm,
    majors: [300, 400, 450, 600, 720, 900],
    skimFrom: cfg.skim_threshold_wpm,
    ink: css.getPropertyValue('--ink-faint').trim(),
    rule: css.getPropertyValue('--rule-strong').trim(),
    signal: css.getPropertyValue('--signal').trim(),
  });
  drawProgressScale(progressCanvas, {
    index: player.index,
    total: tokens.length,
    breaks: tokens.map((tk) => tk.boundary === 'paragraph'),
    rule: css.getPropertyValue('--rule').trim(),
    ruleStrong: css.getPropertyValue('--rule-strong').trim(),
    signal: css.getPropertyValue('--signal').trim(),
  });
}

/**
 * The surrounding sentence, shown ONLY while paused. Sprint Reader's context strip
 * is correct precisely because it defaults to paused-only: anything rendering beside
 * the word during playback forces the saccade RSVP exists to remove.
 */
function renderContext(playing: boolean): void {
  const source = current?.text;
  if (playing || !tokens.length || !source) { contextEl.hidden = true; return; }

  // Read the SOURCE text through the tokens' char offsets rather than re-joining
  // token text. Joining fragments would render a split long word as "Distrib- utional";
  // the (page, charStart, charEnd) triple exists precisely so the original survives.
  const from = Math.max(0, player.index - 13);
  const to = Math.min(tokens.length - 1, player.index + 13);
  const t = tokens[player.index]!;
  const a = tokens[from]!.charStart;
  const b = tokens[to]!.charEnd;

  const tidy = (x: string) => x.replace(/\s+/g, ' ');
  const before = document.createTextNode(tidy(source.slice(a, t.charStart)));
  const focus = document.createElement('b');
  focus.textContent = tidy(source.slice(t.charStart, t.charEnd));
  const after = document.createTextNode(tidy(source.slice(t.charEnd, b)));

  contextEl.replaceChildren(before, focus, after);
  contextEl.hidden = false;
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

const toggle = () => (player.playing ? player.pause() : player.play(cfg.resume_ramp_ms));

addEventListener('keydown', (e) => {
  if (readerView.hidden || e.metaKey || e.ctrlKey) return;
  switch (e.key) {
    case ' ': toggle(); break;
    case 'ArrowLeft':
      // Alt = paragraph, Shift = sentence, bare = one word.
      player.seek(
        e.altKey ? blockStart(player.index, PARAGRAPH_BREAK)
          : e.shiftKey ? blockStart(player.index, SENTENCE_BREAK)
            : player.index - 1,
      );
      break;
    case 'ArrowRight': player.seek(player.index + 1); break;
    case 'ArrowUp': setWpm(wpm + 25); break;
    case 'ArrowDown': setWpm(wpm - 25); break;
    case 'Escape': toLibrary(); break;
    case 's': case 'S': setWpm(wpm === SKIM_WPM ? cfg.target_wpm : SKIM_WPM); break;
    default: return;
  }
  e.preventDefault();
});

btnPlay.addEventListener('click', toggle);
el('btn-word').addEventListener('click', () => player.seek(player.index - 1));
el('btn-sent').addEventListener('click', () => player.seek(blockStart(player.index, SENTENCE_BREAK)));
el('btn-para').addEventListener('click', () => player.seek(blockStart(player.index, PARAGRAPH_BREAK)));
el('to-library').addEventListener('click', toLibrary);

el('add-doc').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const text = await file.text();
  const doc: Doc = {
    id: `user-${docs.length}`,
    title: file.name.replace(/\.[^.]+$/, ''),
    meta: `Added · ${(file.size / 1024).toFixed(0)} KB`,
    src: null,
    text,
    progress: 0,
  };
  doc.tokens = tokenize(text);
  docs.push(doc);
  fileInput.value = '';
  renderLibrary();
});

// Alt-tab must not silently burn the reader's position.
addEventListener('visibilitychange', () => { if (document.hidden) player.pause(); });
addEventListener('resize', () => { if (!readerView.hidden) { sizeCanvases(); render(); } });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!readerView.hidden) render();
});

/* ── Boot. Preload extents so the library's magnitude marks are truthful. ── */
calValue.textContent = `${cfg.target_wpm} set = ${cfg.target_wpm} delivered`;
renderLibrary();
await Promise.all(
  docs.map(async (d) => { try { await loadTokens(d); } catch { /* row shows an em dash */ } }),
);
renderLibrary();

// Deep link: ?open=<id> lands directly in the reader, so a document can be
// linked, bookmarked and resumed without going through the library first.
const wanted = new URLSearchParams(location.search).get('open');
const target = wanted && docs.find((d) => d.id === wanted);
if (target) await open(target);
