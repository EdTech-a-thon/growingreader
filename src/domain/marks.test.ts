import { accuracy, errorsOf, errorWords, markingState } from './marks';
import { wordsCorrectPerMinute } from './rate';
import type { Passage, Reading } from './types';

// Ten words, read in 60 seconds.
const passage: Passage = { id: 'p1', title: 'Dog', text: 'I have a dog.\nThe dog is red and fast.', wordCount: 10, createdAt: 0 };
const base: Reading = {
  id: 'r1',
  studentId: 's1',
  passageId: 'p1',
  passageVersion: 1,
  recordedAt: 0,
  hasAudio: true,
  sampleRate: 16000,
  sampleCount: 16000 * 60,
  tapBounds: { start: 0, end: 60 },
  timing: 'auto',
  completion: 'complete',
  analysis: 'done',
};

describe('errors, accuracy and words correct per minute', () => {
  const marked: Reading = {
    ...base,
    markedAt: 1,
    marks: [
      { word: 1, kind: 'error', errorType: 'substitution' },
      { word: 4, kind: 'self-correction' },
      { word: 8, kind: 'error' },
    ],
  };

  test('count error marks only; a self-correction is read correctly', () => {
    expect(errorsOf(marked)).toBe(2);
    expect(accuracy(marked, passage)).toBeCloseTo(0.8);
    expect(wordsCorrectPerMinute(marked, passage)).toBe(8);
  });

  test('a marked reading with no marks is a perfect reading, not a missing one', () => {
    const clean = { ...base, markedAt: 1, marks: [] };
    expect(markingState(clean)).toBe('marked');
    expect(errorsOf(clean)).toBe(0);
    expect(accuracy(clean, passage)).toBe(1);
  });

  test('draft marks count for nothing until marking is finished', () => {
    const draft = { ...marked, markedAt: undefined };
    expect(markingState(draft)).toBe('unmarked');
    expect(errorsOf(draft)).toBeUndefined();
    expect(accuracy(draft, passage)).toBeUndefined();
    expect(wordsCorrectPerMinute(draft, passage)).toBeUndefined();
  });

  test('an older reading keeps its counted figure, which gives words correct per minute but no accuracy', () => {
    const counted = { ...base, errors: 3 };
    expect(markingState(counted)).toBe('counted');
    expect(wordsCorrectPerMinute(counted, passage)).toBe(7);
    expect(accuracy(counted, passage)).toBeUndefined();
  });

  test('once marked, the marks replace an older count', () => {
    expect(errorsOf({ ...marked, errors: 9 })).toBe(2);
  });

  test('an incomplete reading has no accuracy', () => {
    expect(accuracy({ ...marked, completion: 'incomplete' }, passage)).toBeUndefined();
  });

  test('the words marked as errors read back from the passage version', () => {
    expect(errorWords(marked, passage)).toEqual([{ word: 'have', errorType: 'substitution' }, { word: 'and' }]);
  });
});
