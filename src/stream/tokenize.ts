import type { Boundary, Token } from '../contracts/types.ts';
import { graphemes, graphemeLength } from './graphemes.ts';

/**
 * Plain-text tokenizer for the Phase 2 slice. One word per beat.
 *
 * ORDER OF OPERATIONS — the whole point of this file:
 *   1. cut on WHITESPACE ONLY, so `3.14`, `1,234.56`, `10.1038/nature12373`, `91.4%`,
 *      `p<0.001`, `[3,4]` are never split apart in the first place;
 *   2. classify numeric / abbreviation on the resulting chunk;
 *   3. ONLY THEN decide sentence boundaries.
 * Every prior-art failure surveyed (Squirt splitting `3.14`, Sprint Reader merging
 * `2, 15` into `2,15`, jetzt splitting a DOI) comes from doing 3 before 1 and 2.
 */

const MAX_WORD_GRAPHEMES = 13;
const FRAGMENT_GRAPHEMES = 8; // including the connector hyphen
const PIVOT_CAP = 4;

/** Abbreviations whose trailing period does not end a sentence. Lower-cased, period kept. */
const ABBREVIATIONS = new Set([
  'dr.', 'prof.', 'mr.', 'mrs.', 'ms.', 'st.', 'jr.', 'sr.',
  'e.g.', 'i.e.', 'et', 'al.', 'etc.', 'cf.', 'viz.',
  'fig.', 'figs.', 'eq.', 'eqs.', 'ref.', 'refs.', 'ch.', 'sec.', 'no.', 'pp.', 'p.',
  'vs.', 'approx.', 'ca.', 'inc.', 'ltd.', 'co.', 'corp.',
]);

/** `J.`, `U.S.`, `J.R.R.` — a run of single capitals each followed by a period. */
const INITIALS = /^(\p{Lu}\.)+$/u;

/** Closing marks that sit outside the sentence terminator: `end."` `end.)` `end.]` */
const TRAILING_CLOSERS = /["'’”»)\]}]+$/u;

const SENTENCE_ENDERS = /[.!?…]$/u;
const CLAUSE_ENDERS = /[,;:]$/u;

/** Leading/trailing punctuation & symbols, stripped only for classification and pivot maths. */
const LEADING_PUNCT = /^[\p{P}\p{S}]+/u;
const TRAILING_PUNCT = /[\p{P}\p{S}]+$/u;

export interface StrippedCore {
  core: string;
  /** Number of GRAPHEMES removed from the front. The pivot is offset by this. */
  leadingGraphemes: number;
}

/** Strip surrounding punctuation. If that would empty the token, keep it whole. */
export function stripPunctuation(text: string): StrippedCore {
  const lead = text.match(LEADING_PUNCT)?.[0] ?? '';
  let core = text.slice(lead.length);
  core = core.replace(TRAILING_PUNCT, '');
  if (core === '') return { core: text, leadingGraphemes: 0 };
  return { core, leadingGraphemes: graphemeLength(lead) };
}

/**
 * Patent rule `ceil((L-1)/4)` capped at 4, where L is the grapheme length of the
 * punctuation-stripped token. Returned as a grapheme index into the UNSTRIPPED text.
 */
export function pivotIndex(text: string): number {
  const { core, leadingGraphemes } = stripPunctuation(text);
  const l = graphemeLength(core);
  const p = Math.min(Math.ceil((l - 1) / 4), PIVOT_CAP);
  return leadingGraphemes + Math.max(p, 0);
}

/** A token is numeric if its core carries a digit. Numerics never split and get numeric_mult. */
export function isNumeric(text: string): boolean {
  const { core } = stripPunctuation(text);
  return /\p{Nd}/u.test(core);
}

/** Does this chunk's trailing period belong to an abbreviation rather than a sentence? */
export function isAbbreviation(chunk: string): boolean {
  const bare = chunk.replace(TRAILING_CLOSERS, '');
  return ABBREVIATIONS.has(bare.toLowerCase()) || INITIALS.test(bare);
}

function classify(chunk: string): Boundary {
  const bare = chunk.replace(TRAILING_CLOSERS, '');
  if (SENTENCE_ENDERS.test(bare)) return isAbbreviation(chunk) ? 'none' : 'sentence';
  if (CLAUSE_ENDERS.test(bare)) return 'comma';
  return 'none';
}

/** Split a long word into fragments of <= 8 graphemes, connector hyphen included in the count. */
function fragments(text: string): string[] {
  const g = graphemes(text);
  if (g.length <= MAX_WORD_GRAPHEMES) return [text];
  const out: string[] = [];
  const body = FRAGMENT_GRAPHEMES - 1; // leave room for the connector hyphen
  let i = 0;
  while (i < g.length) {
    const remaining = g.length - i;
    if (remaining <= FRAGMENT_GRAPHEMES) {
      out.push(g.slice(i).join(''));
      break;
    }
    out.push(g.slice(i, i + body).join('') + '-');
    i += body;
  }
  return out;
}

export function tokenize(input: string, page = 1): Token[] {
  const tokens: Token[] = [];
  const chunks: { text: string; start: number; end: number }[] = [];

  for (const m of input.matchAll(/\S+/gu)) {
    chunks.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }

  for (let c = 0; c < chunks.length; c++) {
    const { text, start, end } = chunks[c]!;
    const next = chunks[c + 1];
    // A blank line between this chunk and the next ends a paragraph.
    const gap = next ? input.slice(end, next.start) : '';
    const paragraphBreak = !next || /\n[^\S\n]*\n/.test(gap);

    // Numeric and abbreviation classification happen BEFORE the boundary decision.
    const numeric = isNumeric(text);
    const boundary: Boundary = paragraphBreak ? 'paragraph' : classify(text);

    const parts = numeric ? [text] : fragments(text);
    for (let f = 0; f < parts.length; f++) {
      const last = f === parts.length - 1;
      const t: Token = {
        text: parts[f]!,
        pivot: pivotIndex(parts[f]!),
        page,
        // Every fragment carries the SOURCE WORD's span: resume lands on the word,
        // and the round-trip `input.slice(charStart, charEnd)` still holds.
        charStart: start,
        charEnd: end,
        tier: 'plaintext',
        boundary: last ? boundary : 'none',
      };
      if (numeric) t.numeric = true;
      if (!last) t.continuation = true;
      tokens.push(t);
    }
  }

  return tokens;
}
