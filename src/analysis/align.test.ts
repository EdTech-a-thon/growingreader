import { alignToPassage, assessCompletion, refineTiming } from './align';
import { wordsEvenlySpaced } from '../adapters/transcriber/FakeTranscriber';
import { countWords } from './words';
import { CAMP_CLEAN, CAMP_HALF_WRONG, CAMP_RESTARTS, CAMP_STOPS_EARLY, CAMP_TEXT } from '../test/fixtures/passages';

const M = countWords(CAMP_TEXT);

describe('assessCompletion', () => {
  test('a clean read reaches the last word', () => {
    const a = assessCompletion(wordsEvenlySpaced(CAMP_CLEAN).words, CAMP_TEXT);
    expect(a).toEqual({ reachedWord: M, ofWords: M, probablyIncomplete: false });
  });

  test('restarts and sounding-out do not stop the reader from reaching the end', () => {
    const a = assessCompletion(wordsEvenlySpaced(CAMP_RESTARTS).words, CAMP_TEXT);
    expect(a.reachedWord).toBe(M);
    expect(a.probablyIncomplete).toBe(false);
  });

  test('a read that stops at 70% is flagged as probably incomplete', () => {
    const a = assessCompletion(wordsEvenlySpaced(CAMP_STOPS_EARLY).words, CAMP_TEXT);
    expect(a.reachedWord).toBe(countWords(CAMP_STOPS_EARLY));
    expect(a.probablyIncomplete).toBe(true);
  });

  test('half the words wrong still counts as reaching the end', () => {
    const a = assessCompletion(wordsEvenlySpaced(CAMP_HALF_WRONG).words, CAMP_TEXT);
    expect(a.reachedWord).toBeGreaterThanOrEqual(M - 3);
    expect(a.probablyIncomplete).toBe(false);
  });

  test('an empty transcript reaches nothing', () => {
    expect(assessCompletion([], CAMP_TEXT)).toEqual({ reachedWord: 0, ofWords: M, probablyIncomplete: true });
  });
});

describe('refineTiming', () => {
  test('bounds run from the first aligned word to the last aligned word', () => {
    // Throat-clearing before and chatter after should be excluded.
    const transcript = wordsEvenlySpaced('um okay ' + CAMP_CLEAN + ' done can I go now', 1.0, 60);
    const alignment = alignToPassage(transcript.words, CAMP_TEXT);
    const bounds = refineTiming(alignment, transcript.words);
    const words = transcript.words;
    expect(bounds).toEqual({ start: words[2].start, end: words[words.length - 6].end });
  });

  test('no aligned words gives no bounds', () => {
    const transcript = wordsEvenlySpaced('zzz qqq');
    expect(refineTiming(alignToPassage(transcript.words, CAMP_TEXT), transcript.words)).toBeUndefined();
  });
});
