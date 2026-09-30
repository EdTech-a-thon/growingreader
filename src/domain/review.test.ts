import type { Emissions } from '../analysis/ctc';
import {
  alignHeard,
  confirmHeard,
  deriveMarks,
  draftReview,
  heardIn,
  heardStatuses,
  insertHeard,
  isFullyReviewed,
  markHeard,
  openSpots,
  readAsPrinted,
  retimeHeard,
  setSaid,
  spotAudio,
  spotsOf,
  wordAt,
  wordStatus,
} from './review';
import type { ReviewedTranscript, Transcript } from './types';

// Words 0–5 in paragraph 0, 6–9 in paragraph 1.
const TEXT = 'Sam and Pam went to camp.\n\nThe tent was red.';

/** Words said one after another, 0.4 s each, with `gaps` seconds of extra silence before the words at those indexes. */
function heard(said: string, gaps: Record<number, number> = {}): Transcript {
  let at = 0.5;
  const words = said.split(' ').map((text, i) => {
    at += gaps[i] ?? 0;
    const w = { text, start: at, end: at + 0.3 };
    at += 0.4;
    return w;
  });
  return { text: said, words };
}

const draft = (said: string, gaps?: Record<number, number>, text = TEXT) => draftReview(heard(said, gaps), text, 1);
const statuses = (r: ReviewedTranscript) => r.words.map((_, i) => wordStatus(r, i)).join(' ');

describe('Matching what was heard to the passage', () => {
  test('every word heard exactly, in order, was read correctly', () => {
    const review = draft('Sam and Pam went to camp. The tent was red.');
    expect(statuses(review)).toBe('right right right right right right right right right right');
    expect(review.words[2].span).toMatchObject({ start: 1.3, timing: 'heard' });
    expect(spotsOf(review)).toEqual([]);
    expect(deriveMarks(review)).toEqual([]);
  });

  test('words heard as something else are a spot, with what was heard over it', () => {
    const review = draft('Salmon Pam went to camp. The tent was red.');
    expect(statuses(review)).toMatch(/^open open right/);
    expect(spotsOf(review)).toEqual([{ first: 0, last: 1 }]);
    expect(heardIn(review, spotsOf(review)[0])).toEqual([0]);
    expect(heardStatuses(review).slice(0, 2)).toEqual(['open', 'match']);
    expect(review.words[1].span!.end).toBeCloseTo(review.words[2].span!.start);
  });

  test('a spot plays from the end of the heard word before it to the start of the one after', () => {
    const review = draft('Sam and Pam went tint camp. The tent was red.');
    const [spot] = spotsOf(review);
    expect(spotAudio(review, spot, 10)).toEqual({ start: review.heard[3].end, end: review.heard[5].start });
  });

  test('a false start or repeat is extra: in no word, and no spot', () => {
    const review = draft('Sam and Pam went to camp. The tent was rod red.');
    expect(statuses(review)).toBe('right right right right right right right right right right');
    expect(heardStatuses(review)[9]).toBe('extra');
  });

  test('a few words matched deep inside a skipped stretch are not trusted', () => {
    const text = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty';
    // Skipped from "three" to "eighteen", but "nine ten" turned up in the middle.
    const review = draft('one two x nine ten y nineteen twenty', {}, text);
    expect(review.words[8].heard).toBeUndefined();
    expect(spotsOf(review)).toEqual([{ first: 2, last: 17 }]);
  });
});

/**
 * ADR-0010's matrix: what the child said against what the recogniser wrote, and the one thing
 * the teacher does in each case. P is the passage word.
 */
describe('The teacher settles what was said', () => {
  test('said P, heard something else ("Salmon" for "Sam and"): read as printed, and it is right', () => {
    let review = draft('Salmon Pam went to camp. The tent was red.');
    review = readAsPrinted(review, TEXT, { first: 0, last: 1 }, 10);
    expect(review.heard.slice(0, 2).map((w) => [w.text, w.origin])).toEqual([['Sam', 'teacher'], ['and', 'teacher']]);
    expect(review.heard[1].end).toBeLessThanOrEqual(review.heard[2].start);
    expect(spotsOf(review)).toEqual([]);
    expect(review.source.words[0].text).toBe('Salmon');
  });

  test('said P, heard nothing: read as printed puts it in the gap, and it is right', () => {
    let review = draft('Sam and Pam went camp. The tent was red.');
    expect(openSpots(review)).toEqual([{ first: 4, last: 4 }]);
    review = readAsPrinted(review, TEXT, { first: 4, last: 4 }, 10);
    expect(review.heard[4]).toMatchObject({ text: 'to', origin: 'teacher' });
    expect(review.heard[4].start).toBeGreaterThanOrEqual(review.heard[3].end);
    expect(spotsOf(review)).toEqual([]);
  });

  test('said X, heard X: confirming what was said makes it a substitution', () => {
    let review = draft('Sam and Pam went to camp. The tint was red.');
    review = confirmHeard(review, heardIn(review, openSpots(review)[0]));
    expect(openSpots(review)).toEqual([]);
    expect(heardStatuses(review)[7]).toBe('wrong');
    expect(deriveMarks(review)).toEqual([{ word: 7, kind: 'error', errorType: 'substitution' }]);
    // Typing the same words is the same thing.
    expect(deriveMarks(setSaid(draft('Sam and Pam went to camp. The tint was red.'), TEXT, { first: 7, last: 7 }, 'tint', 10))).toEqual(deriveMarks(review));
  });

  test('said X, heard Y (or nothing): editing to what was said makes it a substitution', () => {
    const edited = setSaid(draft('Sam and Pam went to camp. The tint was red.'), TEXT, { first: 7, last: 7 }, 'tant', 10);
    expect(edited.heard[7]).toMatchObject({ text: 'tant', origin: 'teacher' });
    expect(deriveMarks(edited)).toEqual([{ word: 7, kind: 'error', errorType: 'substitution' }]);
    const missed = setSaid(draft('Sam and Pam went camp. The tent was red.'), TEXT, { first: 4, last: 4 }, 'at', 10);
    expect(deriveMarks(missed)).toEqual([{ word: 4, kind: 'error', errorType: 'substitution' }]);
  });

  test('said X, heard P (the recogniser "corrected" it): editing the green word makes it a substitution', () => {
    const review = setSaid(draft('Sam and Pam went to camp. The tent was red.'), TEXT, { first: 7, last: 7 }, 'tint', 10);
    expect(deriveMarks(review)).toEqual([{ word: 7, kind: 'error', errorType: 'substitution' }]);
    expect(openSpots(review)).toEqual([]);
  });

  test('said nothing, whatever was heard: nothing was said makes it an omission', () => {
    // Heard P (made up), heard Y, heard nothing.
    for (const said of ['Sam and Pam went to camp. The tent was red.', 'Sam and Pam went to camp. The tint was red.', 'Sam and Pam went to camp. The was red.']) {
      const review = setSaid(draft(said), TEXT, { first: 7, last: 7 }, '', 10);
      expect(deriveMarks(review)).toEqual([{ word: 7, kind: 'error', errorType: 'omission' }]);
      expect(openSpots(review)).toEqual([]);
    }
  });

  test('a skipped paragraph is omitted in one go', () => {
    const review = setSaid(draft('Sam and Pam went to camp.'), TEXT, { first: 6, last: 9 }, '', 10);
    expect(deriveMarks(review).map((m) => m.errorType)).toEqual(['omission', 'omission', 'omission', 'omission']);
  });

  test('a mixed spot: what matches is right, the rest wrong', () => {
    // "Sam" was read, "and" was not: the recogniser wrote "Salmon" over both.
    const review = setSaid(draft('Salmon Pam went to camp. The tent was red.'), TEXT, { first: 0, last: 1 }, 'Sam', 10);
    expect(wordStatus(review, 0)).toBe('right');
    expect(deriveMarks(review)).toEqual([{ word: 1, kind: 'error', errorType: 'omission' }]);
  });

  test('repeats and restarts are extra, and count for nothing', () => {
    const review = draft('Sam and Pam went to camp. The tent was rod red.');
    expect(heardStatuses(review)[9]).toBe('extra');
    expect(deriveMarks(review)).toEqual([]);
  });

  test('a word the recogniser missed can be added from the gutter, and matches', () => {
    let review = draft('Sam and Pam went camp. The tent was red.');
    review = insertHeard(review, TEXT, review.heard[3].end + 0.02, 'to', 10);
    expect(spotsOf(review)).toEqual([]);
  });

  test('confirming leaves the words as they were', () => {
    const review = confirmHeard(draft('Salmon Pam went to camp. The tent was red.'), [0]);
    expect(review.heard[0]).toMatchObject({ text: 'Salmon', confirmed: true });
    expect(openSpots(review)).toEqual([]);
  });

  test('marked once every spot is settled and every paragraph heard', () => {
    let review = draft('Sam and Pam went to camp. The tint was red.');
    review = confirmHeard(review, heardIn(review, openSpots(review)[0]));
    expect(isFullyReviewed(review)).toBe(false);
    review = markHeard(markHeard(review, 0), 1);
    expect(isFullyReviewed(review)).toBe(true);
  });

  test('three seconds between words is a hesitation, even on a word read right', () => {
    const review = draft('Sam and Pam went to camp. The tent was red.', { 9: 3.2 });
    expect(deriveMarks(review)).toEqual([{ word: 9, kind: 'error', errorType: 'hesitation' }]);
  });
});

describe('Placing what was heard in the audio', () => {
  test('a heard word dragged to where it was said stays there, between its neighbours, and its passage word follows', () => {
    const review = draft('Sam and Pam went to camp. The tent was red.');
    const moved = retimeHeard(review, TEXT, 1, 0.1, 5);
    expect(moved.heard[1]).toMatchObject({ start: review.heard[0].end, end: review.heard[2].start, timing: 'manual' });
    expect(moved.words[1].span!.start).toBeCloseTo(review.heard[0].end);
  });

  test('dragging a word past a long mumble takes the mumble out of it, and a hesitation shows', () => {
    // "The" was said at 12.9 s, but the recogniser gave it the ten seconds of mumbling before.
    const transcript = heard('Sam and Pam went to camp. The tent was red.', { 6: 10 });
    transcript.words[6] = { ...transcript.words[6], start: 2.9 };
    let review = draftReview(transcript, TEXT, 1);
    expect(deriveMarks(review)).toEqual([]);
    review = retimeHeard(review, TEXT, 6, 12.9, 13.2);
    expect(deriveMarks(review)).toEqual([{ word: 6, kind: 'error', errorType: 'hesitation' }]);
  });

  test('the word being read is the one whose span holds the moment, or the last one started', () => {
    const review = draft('Sam and Pam went to camp. The tent was red.');
    expect(wordAt(review, 0.2)).toBeUndefined();
    expect(wordAt(review, 1.35)).toBe(2);
    expect(wordAt(review, 1.65)).toBe(2);
  });
});

describe('Forced alignment of what was heard', () => {
  /** Peaky CTC-like emissions: each word's letters said from `at[word]` seconds, blank elsewhere. */
  function saidAt(at: Array<[string, number]>, seconds = 8): Emissions {
    const letters: Record<string, number> = {};
    ['<pad>', '|', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].forEach((c, i) => (letters[c] = i));
    const V = 28;
    const frames = Math.round(seconds / 0.02);
    const logProbs = new Float32Array(frames * V).fill(Math.log(1e-6));
    const said = new Map<number, number>();
    for (const [word, start] of at) [...word.toUpperCase()].forEach((c, k) => said.set(Math.round(start / 0.02) + k * 2, letters[c]));
    for (let t = 0; t < frames; t++) logProbs[t * V + (said.get(t) ?? 0)] = Math.log(0.95);
    return { model: 'test', frameSeconds: 0.02, frames, vocabSize: V, logProbs, blank: 0, space: 1, letters };
  }

  test("the recogniser's words are placed where they were said, leaving what it heard untouched", () => {
    // heard() times them late: Salmon at 0.5, Pam at 0.9. They were said at 0.3 and 0.8.
    const review = draftReview(heard('Salmon Pam 10'), 'Sam and Pam', 1);
    const placed = alignHeard(review, 'Sam and Pam', saidAt([['salmon', 0.3], ['pam', 0.8]]));
    expect(placed.heard[0]).toMatchObject({ timing: 'aligned' });
    expect(placed.heard[0].start).toBeCloseTo(0.3);
    expect(placed.heard[1].start).toBeCloseTo(0.8);
    // "10" cannot be spelled: it keeps its rough time, after the words that were found.
    expect(placed.heard[2].start).toBeGreaterThanOrEqual(placed.heard[1].end);
    expect(placed.source.words[0].start).toBe(0.5);
    expect(placed.words[2].span!.start).toBeCloseTo(0.8);
    expect(placed.alignedBy).toBe('test');
  });

  test('a misheard word spans the speech it was heard in, not a sliver of it', () => {
    const review = draftReview(heard('Salmon Pam'), 'Sam and Pam', 1);
    const placed = alignHeard(review, 'Sam and Pam', saidAt([['sam', 0.3], ['and', 0.7], ['pam', 1.2]]));
    expect(placed.heard[0].start).toBeCloseTo(0.3);
    expect(placed.heard[0].end).toBeGreaterThan(0.7);
    expect(placed.heard[1].start).toBeCloseTo(1.2);
  });

  test('words the teacher gives are placed where the old ones were said, by the model', () => {
    const text = 'Sam and Pam';
    const em = saidAt([['sam', 0.3], ['and', 0.7], ['pam', 1.2]]);
    const review = alignHeard(draftReview(heard('Salmon Pam'), text, 1), text, em);
    const split = readAsPrinted(review, text, { first: 0, last: 1 }, 8, em);
    expect(split.heard[0]).toMatchObject({ text: 'Sam', timing: 'aligned' });
    expect(split.heard[0].start).toBeCloseTo(0.3);
    expect(split.heard[1].start).toBeCloseTo(0.7);
    expect(spotsOf(split)).toEqual([]);
  });
});
