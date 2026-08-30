const SEG = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Grapheme clusters, not UTF-16 code units. Surrogate pairs and combining marks stay whole. */
export function graphemes(s: string): string[] {
  return Array.from(SEG.segment(s), (g) => g.segment);
}

export function graphemeLength(s: string): number {
  return graphemes(s).length;
}
