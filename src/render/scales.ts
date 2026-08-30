/**
 * Engraved tick scales.
 *
 * Quantities in this interface are read off a scale, never off a filled bar. The
 * rate scale is the product's thesis made visible: the rate you asked for and the
 * rate actually delivered are two index marks on one scale, and they must coincide.
 * Every shipped RSVP reader surveyed misses by 20-25%, which on this scale would be
 * two visibly separate marks.
 *
 * Canvas rather than DOM because a hairline has to stay one device pixel at any
 * devicePixelRatio; a 1px CSS border on a 2x display is two.
 */

/** Snap to a device-pixel grid so a 1px line is one crisp pixel, not two soft ones. */
const crisp = (v: number, dpr: number) => Math.round(v * dpr) + 0.5;

function ctxOf(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx || !canvas.width) return null;
  const dpr = canvas.width / canvas.getBoundingClientRect().width || 1;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 1;
  return { ctx, dpr, w: canvas.width, h: canvas.height };
}

function line(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, color: string) {
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.stroke();
}

export interface RateScaleOptions {
  min: number;
  max: number;
  /** The rate the reader asked for. */
  set: number;
  /** The rate the timing model actually delivers over the document. */
  delivered: number;
  /** Frame-exact rates on a 60 Hz panel — these get a long tick and a label. */
  majors: number[];
  /** Above this the scale is engraved differently: it is not a reading rate. */
  skimFrom: number;
  ink: string;
  rule: string;
  signal: string;
}

export function drawRateScale(canvas: HTMLCanvasElement, o: RateScaleOptions): void {
  const c = ctxOf(canvas);
  if (!c) return;
  const { ctx, dpr, w, h } = c;

  const padX = 2 * dpr;
  const span = w - padX * 2;
  const at = (v: number) => padX + ((v - o.min) / (o.max - o.min)) * span;

  const baseline = crisp(20, dpr);
  const minorEnd = crisp(26, dpr);
  const majorEnd = crisp(32, dpr);

  // Baseline. Past the skim threshold it becomes a broken rule - the scale itself
  // says that region is not a reading rate.
  ctx.strokeStyle = o.rule;
  ctx.beginPath();
  ctx.moveTo(padX, baseline);
  ctx.lineTo(at(o.skimFrom), baseline);
  ctx.stroke();
  ctx.save();
  ctx.setLineDash([2 * dpr, 3 * dpr]);
  ctx.beginPath();
  ctx.moveTo(at(o.skimFrom), baseline);
  ctx.lineTo(w - padX, baseline);
  ctx.stroke();
  ctx.restore();

  // Minor ticks every 50 wpm, majors at the frame-exact rates.
  for (let v = Math.ceil(o.min / 50) * 50; v <= o.max; v += 50) {
    line(ctx, crisp(at(v) / dpr, dpr), baseline, minorEnd, o.rule);
  }
  // Labels at 11px in --ink-dim. They were 9px in --ink-faint (3.68:1), which failed
  // both WCAG 1.4.3 and this build's own 11px floor; the detector cannot parse canvas,
  // so the size sweep never reached them.
  ctx.fillStyle = o.ink;
  ctx.font = `${Math.round(11 * dpr)}px Archivo, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const v of o.majors) {
    if (v < o.min || v > o.max) continue;
    const x = crisp(at(v) / dpr, dpr);
    line(ctx, x, baseline, majorEnd, o.ink);
    ctx.fillText(String(v), x, majorEnd + 4 * dpr);
  }

  // ── THE SIGNATURE. Two index marks: DELIVERED as a hollow bone pointer, SET as a
  //    filled amber pointer nested inside it. Sized to be read, not squinted at - the
  //    earlier 7px pair vanished under an 1880px scale, so the thesis never showed.
  //    Coincidence reads as amber inside a bone collar; drift separates them visibly,
  //    and drift is the 20-25% error every other RSVP reader ships in silence.
  const tip = crisp(1, dpr);
  const xd = crisp(at(o.delivered) / dpr, dpr);
  ctx.strokeStyle = o.ink;
  ctx.lineWidth = Math.max(1.5, Math.round(1.5 * dpr));
  ctx.beginPath();
  ctx.moveTo(xd, baseline - 1 * dpr);
  ctx.lineTo(xd - 11 * dpr, tip);
  ctx.lineTo(xd + 11 * dpr, tip);
  ctx.closePath();
  ctx.stroke();
  ctx.lineWidth = 1;

  const xs = crisp(at(o.set) / dpr, dpr);
  ctx.fillStyle = o.signal;
  ctx.beginPath();
  ctx.moveTo(xs, baseline - 3 * dpr);
  ctx.lineTo(xs - 6 * dpr, tip + 5 * dpr);
  ctx.lineTo(xs + 6 * dpr, tip + 5 * dpr);
  ctx.closePath();
  ctx.fill();

  void h;
}

export interface ProgressScaleOptions {
  index: number;
  total: number;
  /** Parallel to the token stream: true where a paragraph ends. */
  breaks: boolean[];
  rule: string;
  ruleStrong: string;
  signal: string;
}

export function drawProgressScale(canvas: HTMLCanvasElement, o: ProgressScaleOptions): void {
  const c = ctxOf(canvas);
  if (!c || !o.total) return;
  const { ctx, dpr, w } = c;

  const padX = 2 * dpr;
  const span = w - padX * 2;
  const baseline = crisp(16, dpr);
  const at = (i: number) => padX + (i / Math.max(o.total - 1, 1)) * span;

  // Unread baseline, then the read portion over it in signal. A hairline, not a bar.
  ctx.strokeStyle = o.rule;
  ctx.beginPath();
  ctx.moveTo(padX, baseline);
  ctx.lineTo(w - padX, baseline);
  ctx.stroke();

  const xi = crisp(at(o.index) / dpr, dpr);
  ctx.strokeStyle = o.signal;
  ctx.beginPath();
  ctx.moveTo(padX, baseline);
  ctx.lineTo(xi, baseline);
  ctx.stroke();

  // Paragraph boundaries: the document's own structure, engraved. Capped so a very
  // long document does not turn the rule into a solid block of ticks.
  const marks: number[] = [];
  for (let i = 0; i < o.breaks.length; i++) if (o.breaks[i]) marks.push(i);
  const step = Math.ceil(marks.length / 120) || 1;
  for (let k = 0; k < marks.length; k += step) {
    const x = crisp(at(marks[k]!) / dpr, dpr);
    line(ctx, x, baseline - 5 * dpr, baseline, x <= xi ? o.signal : o.ruleStrong);
  }

  // Current position.
  ctx.fillStyle = o.signal;
  ctx.beginPath();
  ctx.moveTo(xi, baseline);
  ctx.lineTo(xi - 3.5 * dpr, baseline - 7 * dpr);
  ctx.lineTo(xi + 3.5 * dpr, baseline - 7 * dpr);
  ctx.closePath();
  ctx.fill();
}
