import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tokenize, pivotIndex, isNumeric } from '../src/stream/tokenize.ts';
import { graphemes } from '../src/stream/graphemes.ts';

const texts = (s: string) => tokenize(s).map((t) => t.text);
const find = (s: string, text: string) => tokenize(s).find((t) => t.text === text);

test('3.14 is one numeric token and does not end a sentence', () => {
  const tokens = tokenize('The value 3.14 appears twice here.');
  assert.deepEqual(
    texts('The value 3.14 appears twice here.'),
    ['The', 'value', '3.14', 'appears', 'twice', 'here.'],
  );
  const pi = tokens.find((t) => t.text === '3.14')!;
  assert.equal(pi.numeric, true);
  assert.notEqual(pi.boundary, 'sentence');
  assert.equal(pi.boundary, 'none');
});

test('thousands separators, DOIs and percentages survive as single tokens', () => {
  for (const s of ['1,234.56', '10.1038/nature12373', '91.4%', 'p<0.001', '5-10', '2.5x', '1e-9']) {
    const tokens = tokenize(`a ${s} b`);
    assert.deepEqual(tokens.map((t) => t.text), ['a', s, 'b'], s);
    assert.equal(tokens[1]!.numeric, true, `${s} should be numeric`);
  }
});

test('Table 2, 15 of 20 never collapses into 2,15', () => {
  assert.deepEqual(texts('Table 2, 15 of 20'), ['Table', '2,', '15', 'of', '20']);
});

test('abbreviations do not end sentences', () => {
  const sentences = (s: string) => tokenize(s).filter((t) => t.boundary === 'sentence').length;
  assert.equal(sentences('Dr. Smith arrived late. He left.'), 1);
  assert.equal(find('Dr. Smith arrived', 'Dr.')!.boundary, 'none');
  assert.equal(find('see e.g. the note', 'e.g.')!.boundary, 'none');
  assert.equal(find('Mikolov et al. showed this', 'al.')!.boundary, 'none');
  assert.equal(find('the U.S. economy grew', 'U.S.')!.boundary, 'none');
  assert.equal(find('J. R. Firth said', 'J.')!.boundary, 'none');
  assert.equal(find('see Fig. 3 below', 'Fig.')!.boundary, 'none');
  assert.equal(find('compare vs. the baseline', 'vs.')!.boundary, 'none');
  assert.equal(sentences('J. R. Firth wrote it in 1957. Harris did too.'), 1);
});

test('bracketed citations stay whole and are not stripped', () => {
  assert.deepEqual(texts('as shown [12] and [3,4] and [1-5] here'),
    ['as', 'shown', '[12]', 'and', '[3,4]', 'and', '[1-5]', 'here']);
});

test('boundaries: comma, sentence, paragraph', () => {
  const t = tokenize('One, two; three: four. Five.\n\nSix.');
  const byText = Object.fromEntries(t.map((x) => [x.text, x.boundary]));
  assert.equal(byText['One,'], 'comma');
  assert.equal(byText['two;'], 'comma');
  assert.equal(byText['three:'], 'comma');
  assert.equal(byText['four.'], 'sentence');
  assert.equal(byText['Five.'], 'paragraph'); // blank line wins over sentence
  assert.equal(byText['Six.'], 'paragraph');  // end of input closes the paragraph
});

test('a 20-character word splits into <= 8-grapheme fragments with connector hyphens', () => {
  const word = 'abcdefghijklmnopqrst'; // 20
  const t = tokenize(word);
  assert.ok(t.length > 1, 'should split');
  for (const f of t) assert.ok(graphemes(f.text).length <= 8, `${f.text} too long`);
  for (const f of t.slice(0, -1)) {
    assert.equal(f.continuation, true);
    assert.ok(f.text.endsWith('-'), `${f.text} needs a connector hyphen`);
  }
  assert.equal(t.at(-1)!.continuation, undefined);
  assert.ok(!t.at(-1)!.text.endsWith('-'));
  assert.equal(t.map((f) => f.text.replace(/-$/, '')).join(''), word);
});

test('a 20-character NUMERIC token does not split', () => {
  const doi = '10.1038/nature12373x'; // 20 graphemes
  assert.equal(graphemes(doi).length, 20);
  const t = tokenize(doi);
  assert.equal(t.length, 1);
  assert.equal(t[0]!.numeric, true);
  assert.equal(t[0]!.continuation, undefined);
});

test('charStart/charEnd round-trip against the source string', () => {
  const input =
    'Firth (1957) argued that 1,234.56 and 91.4% and [12] belong together.\n\n' +
    'A supercalifragilistic claim, e.g. doi:10.1038/nature12373 at p<0.001.';
  for (const t of tokenize(input)) {
    if (t.continuation) continue;
    const slice = input.slice(t.charStart, t.charEnd);
    const core = t.text.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}%]+$/u, '');
    assert.ok(slice.includes(core), `slice ${JSON.stringify(slice)} lacks ${JSON.stringify(core)}`);
  }
});

test('pivot index follows ceil((L-1)/4) capped at 4', () => {
  const cases: [number, number][] = [[1, 0], [3, 1], [5, 1], [9, 2], [13, 3], [20, 4]];
  for (const [len, expected] of cases) {
    assert.equal(pivotIndex('a'.repeat(len)), expected, `L=${len}`);
  }
});

test('pivot is a GRAPHEME index, not a UTF-16 code-unit index', () => {
  // 5 graphemes, 7 UTF-16 code units: the emoji is a surrogate pair.
  const emoji = 'ab🙂cd';
  assert.equal(graphemes(emoji).length, 5);
  assert.equal(emoji.length, 6);
  assert.equal(pivotIndex(emoji), 1);

  // Combining diacritic: 'e' + U+0301 is ONE grapheme, TWO code units.
  const combining = 'caféteria'; // 9 graphemes, 10 code units
  assert.equal(graphemes(combining).length, 9);
  assert.equal(combining.length, 10);
  assert.equal(pivotIndex(combining), 2);

  // The pivot must index into the grapheme array without splitting the pair.
  const g = graphemes(emoji);
  assert.equal(g[pivotIndex(emoji)], 'b');
});

test('pivot is offset past leading punctuation but sized on the stripped core', () => {
  assert.equal(pivotIndex('[12]'), 1 + 1); // core '12' -> 1, plus one leading '['
  assert.equal(pivotIndex('"quoted"'), 1 + 2); // core 'quoted' (6) -> 2
  assert.equal(isNumeric('[12]'), true);
  assert.equal(isNumeric('word'), false);
});

test('every token from a .txt source is stamped plaintext, never tier1', () => {
  // Provenance, not cosmetics: a later phase reads `tier` to decide whether to offer the
  // numeric-fidelity affordance, and no PDF extractor ever touched this text.
  const fixture = readFileSync(
    fileURLToPath(new URL('../fixtures/sample.txt', import.meta.url)),
    'utf8',
  );
  const fixtureTokens = tokenize(fixture);
  assert.ok(fixtureTokens.length > 400, `only ${fixtureTokens.length} tokens`);
  assert.ok(fixtureTokens.every((t) => t.tier === 'plaintext'), 'a token was not plaintext');
  assert.equal(tokenize('hello world')[0]!.tier, 'plaintext');
});
