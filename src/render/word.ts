import { graphemes } from '../stream/graphemes.ts';

/**
 * Three spans in one grid: `1fr auto 1fr`. The pivot column's position is a property of
 * the layout, so the pivot glyph cannot move between words. ZERO measurement — no
 * canvas measureText, which mis-measures a shaped prefix against per-span DOM advances.
 */
export function createWordView(host: HTMLElement): (text: string, pivot: number) => void {
  host.replaceChildren();
  const before = document.createElement('span');
  const pivot = document.createElement('span');
  const after = document.createElement('span');
  before.className = 'before';
  pivot.className = 'pivot';
  after.className = 'after';
  host.append(before, pivot, after);

  return (text, p) => {
    const g = graphemes(text);
    const i = Math.min(Math.max(p, 0), Math.max(g.length - 1, 0));
    before.textContent = g.slice(0, i).join('');
    pivot.textContent = g[i] ?? '';
    after.textContent = g.slice(i + 1).join('');
  };
}
