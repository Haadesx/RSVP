/**
 * Frozen contracts. Orchestrator-only — workers read this, never edit it.
 * A worker that believes a contract is wrong stops and reports; it does not adapt around it.
 *
 * Rationale for every field is in docs/spec.md. Section references below point there.
 */

/** Bump invalidates cached extractions. Does NOT invalidate reading positions (§13). */
export const PIPELINE_VERSION = 1;

// ─────────────────────────────────────────────────────────────────────────────
// Structure (§7)
// ─────────────────────────────────────────────────────────────────────────────

export type BlockLabel =
  | 'body' | 'heading' | 'list-item'
  | 'page-header' | 'page-footer' | 'page-number'
  | 'caption' | 'footnote' | 'reference-entry'
  | 'equation' | 'table' | 'code';

export type Disposition = 'inline' | 'skip' | 'queue';

/**
 * Frozen so Phase 4 can swap the labeller without touching the stream contract.
 * `skip` is load-bearing: it is what keeps the JSTOR stamp out of the word stream.
 */
export const DISPOSITION: Readonly<Record<BlockLabel, Disposition>> = {
  'body': 'inline',
  'heading': 'inline',
  'list-item': 'inline',
  'page-header': 'skip',
  'page-footer': 'skip',
  'page-number': 'skip',
  'caption': 'queue',
  'footnote': 'queue',
  'reference-entry': 'queue',
  'equation': 'queue',
  'table': 'queue',
  'code': 'queue',
};

// ─────────────────────────────────────────────────────────────────────────────
// Token stream (§9, §13)
// ─────────────────────────────────────────────────────────────────────────────

/** Which extractor produced this token's text. Per-token, per the plan. */
export type Tier = 'tier1' | 'tier2' | 'placeholder';

/** What follows this token. Drives the additive boundary pause (§10). */
export type Boundary = 'none' | 'comma' | 'sentence' | 'paragraph';

/**
 * One beat in the stream.
 *
 * `page` + `charStart` + `charEnd` index into `PageRecord.text`. That triple is the
 * highest-leverage field in the contract: it buys resume-to-exact-word, click-to-seek,
 * the paused context strip, progress, and rewind-by-sentence with no extra machinery.
 */
export interface Token {
  /** Displayed text. For a split long word, the fragment including its connector hyphen. */
  text: string;
  /** Grapheme index of the pivot within `text` (§9). Not a UTF-16 code-unit index. */
  pivot: number;

  /** 1-based. */
  page: number;
  charStart: number;
  charEnd: number;

  tier: Tier;
  boundary: Boundary;

  /** Triggers `numeric_mult`, and suppresses long-word splitting. */
  numeric?: boolean;
  /** Fragment of a word split at >13 chars; its text carries the connector hyphen. */
  continuation?: boolean;

  /**
   * Present only when `tier === 'placeholder'`. A queued block or an unextracted page:
   * one beat that halts playback and renders whole. `content` is null when the page
   * could not be extracted at all.
   */
  placeholder?: {
    kind: BlockLabel | 'unextracted';
    content: string | null;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Extraction (§3–§6)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Raw classifier signal values, not just booleans — re-calibrating thresholds must not
 * require re-parsing every PDF (§4). Keys are the signal names in docs/spec.md §4.
 */
export type ClassifierSignals = Record<string, number | string | boolean | null>;

export interface PageRecord {
  /** 1-based. */
  page: number;
  /** Which tier's text ended up in `text`. */
  tier: Tier;

  escalated: boolean;
  /** Stage-A gate names and stage-B term names that fired. Empty when not escalated. */
  escalationReasons: string[];
  signals: ClassifierSignals;

  /** Divergence check preferred tier 1, or the page could not be escalated (§2, §6). */
  suspect: boolean;

  /** Page contains digits. */
  hasDigits: boolean;
  /**
   * An independent VISUAL read confirmed the digits. False is the honest default and
   * the UI shows it — an admission, not a mitigation (§5).
   */
  numericVerified: boolean;

  /** Present only where both tiers ran (§6). Edit distance is deliberately absent. */
  divergence?: {
    /** Symmetric difference of digit multisets, normalised by tier-1 digit count. */
    digitDelta: number;
    /** len(tier2) / len(tier1). */
    lengthRatio: number;
  };

  /** Normalized page text. Token offsets index into this string. */
  text: string;
}

export interface ExtractionResult {
  pipelineVersion: number;
  /** SHA-256 of the source file bytes. Half of the cache key (§13). */
  contentHash: string;
  sourceName: string;
  /** ISO 8601. */
  extractedAt: string;
  /** e.g. "pdfjs-dist@6.3.289" or "paddleocr-vl-1.6/vllm". */
  extractor: string;

  pages: PageRecord[];
  tokens: Token[];

  /**
   * Pages that need extraction and did not get it — the rig was unreachable, or tier 2
   * failed. Re-running processes only these, never the whole file (§2).
   */
  unresolvedPages: number[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Timing (§10)
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors config/timing.json exactly. Every coefficient is runtime-tunable. */
export interface TimingConfig {
  target_wpm: number;

  /** Step function on token length in graphemes. Applied multiplicatively. */
  length_mult: { max_chars: number; mult: number }[];
  /** Multiplier for tokens flagged `numeric`. */
  numeric_mult: number;

  /** Additive, after the word. */
  pause_comma_ms: number;
  pause_sentence_ms: number;
  pause_paragraph_ms: number;
  /** Multiplies pause_sentence_ms by the length in words of the sentence just ended. */
  sentence_len_scale: { max_words: number; mult: number }[];

  /** Applied AFTER duration normalization. No floor — a floor would ignore the user. */
  dwell_ceiling_ms: number;

  /** Blank interval after each word. Exposed, not hard-coded; justification unverified. */
  interword_gap_ms: number;
  /** First word after unpause. Comfort, not comprehension. */
  resume_ramp_ms: number;
  /** Rewind-by-sentence backs off this many words, then walks to the sentence start. */
  rewind_backoff_words: number;

  /** UI marks rates above this as below the practical recognition floor. */
  skim_threshold_wpm: number;
}

export interface TimingInput {
  tokens: Token[];
  config: TimingConfig;
}

export interface TimingResult {
  /** Parallel to `tokens`. Includes the boundary pause that follows each token. */
  dwellMs: number[];
  /**
   * Actual mean rate over the stream. Duration normalization must make this equal
   * `config.target_wpm` to within rounding — it is the check that the UI is not lying.
   */
  deliveredWpm: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Library (§13)
// ─────────────────────────────────────────────────────────────────────────────

export interface Position {
  tokenIndex: number;
  /** Survives re-extraction under a new pipeline version; tokenIndex does not. */
  page: number;
  charStart: number;
  /** ISO 8601. */
  updatedAt: string;
}

export interface LibraryEntry {
  contentHash: string;
  sourceName: string;
  title: string | null;
  addedAt: string;
  pipelineVersion: number;
  pageCount: number;
  /** Mirrors ExtractionResult.unresolvedPages so the library can badge without loading. */
  unresolvedPageCount: number;
}
