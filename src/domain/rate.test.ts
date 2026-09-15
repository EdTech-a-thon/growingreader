import { activeBounds, rate, wordsCorrectPerMinute } from './rate';
import type { Passage, Reading } from './types';

const passage: Passage = { id: 'p1', title: 'T', text: '', wordCount: 120, createdAt: 0 };
const base: Reading = {
  id: 'r1',
  studentId: 's1',
  passageId: 'p1',
  recordedAt: 0,
  hasAudio: true,
  sampleRate: 16000,
  sampleCount: 16000 * 90,
  tapBounds: { start: 0, end: 90 },
  timing: 'auto',
  completion: 'complete',
  analysis: 'done',
};

describe('rate', () => {
  test('passage words over active duration, in words per minute', () => {
    expect(rate(base, passage)).toBe(80);
  });

  test('has no value without a passage', () => {
    expect(rate({ ...base, passageId: undefined }, undefined)).toBeUndefined();
  });

  test('has no value unless the teacher marked the reading complete', () => {
    expect(rate({ ...base, completion: 'pending' }, passage)).toBeUndefined();
    expect(rate({ ...base, completion: 'incomplete' }, passage)).toBeUndefined();
  });

  test('uses the most refined bounds by default and the chosen bounds when the teacher picks', () => {
    const refined: Reading = { ...base, silenceBounds: { start: 5, end: 85 }, transcriptBounds: { start: 10, end: 70 } };
    expect(activeBounds(refined)).toEqual({ start: 10, end: 70 });
    expect(rate(refined, passage)).toBe(120);
    expect(rate({ ...refined, timing: 'silence' }, passage)).toBe(90);
    expect(rate({ ...refined, timing: 'tap' }, passage)).toBe(80);
  });
});

describe('wordsCorrectPerMinute', () => {
  test('subtracts errors from the word count', () => {
    expect(wordsCorrectPerMinute({ ...base, errors: 30 }, passage)).toBe(60);
  });

  test('has no value until errors are entered', () => {
    expect(wordsCorrectPerMinute(base, passage)).toBeUndefined();
  });
});
