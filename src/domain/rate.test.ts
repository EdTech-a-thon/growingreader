import { activeBounds, clampBounds, rate, wordsCorrectPerMinute } from './rate';
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

  test('uses the most refined automatic bounds by default and the teacher’s handles once dragged', () => {
    const refined: Reading = { ...base, silenceBounds: { start: 5, end: 85 }, transcriptBounds: { start: 10, end: 70 } };
    expect(activeBounds(refined)).toEqual({ start: 10, end: 70 });
    expect(rate(refined, passage)).toBe(120);
    expect(rate({ ...refined, timing: 'manual', manualBounds: { start: 10, end: 90 } }, passage)).toBe(90);
    // 'manual' without handles (a backup from before they existed) falls back to auto.
    expect(rate({ ...refined, timing: 'manual' }, passage)).toBe(120);
  });

  test('handles stay inside the recording and never cross', () => {
    expect(clampBounds({ start: -1, end: 95 }, 90)).toEqual({ start: 0, end: 90 });
    expect(clampBounds({ start: 50, end: 40 }, 90)).toEqual({ start: 50, end: 50.2 });
    expect(clampBounds({ start: 90, end: 90 }, 90)).toEqual({ start: 89.8, end: 90 });
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
