import { passageWords } from '../analysis/words';
import { versionReadBy } from './passage';
import type { ErrorType, Mark, Passage, Reading } from './types';

/**
 * Where a reading stands with marking. `counted` is an older reading carrying a bare error
 * count from before marking existed; it stays that way until the teacher marks it.
 */
export type MarkingState = 'marked' | 'counted' | 'unmarked';

export function markingState(reading: Reading): MarkingState {
  if (reading.markedAt !== undefined) return 'marked';
  if (reading.errors !== undefined) return 'counted';
  return 'unmarked';
}

/** Only a complete reading can be marked: accuracy assumes every word was attempted (ADR-0001, ADR-0008). */
export function canMark(reading: Reading): boolean {
  return reading.completion === 'complete';
}

/**
 * Marking is reviewing the transcript line by line, by ear (ADR-0010): it needs a complete
 * reading, the recogniser's words to start from, and the audio to check them against.
 */
export function canReview(reading: Reading): boolean {
  return canMark(reading) && reading.hasAudio && (reading.transcript?.words.length ?? 0) > 0;
}

/** Passage words the marks count against the student: error marks only; a self-correction is read correctly. */
export function errorsOf(reading: Reading): number | undefined {
  switch (markingState(reading)) {
    case 'marked':
      return (reading.marks ?? []).filter((m) => m.kind === 'error').length;
    case 'counted':
      return reading.errors;
    default:
      return undefined;
  }
}

/** (Word count minus errors) over word count, for a complete marked reading. Not for counted ones. */
export function accuracy(reading: Reading, passage: Passage | undefined): number | undefined {
  const version = versionReadBy(reading, passage);
  const errors = errorsOf(reading);
  if (!version || version.wordCount === 0 || !canMark(reading) || markingState(reading) !== 'marked' || errors === undefined) return undefined;
  return Math.max(0, version.wordCount - errors) / version.wordCount;
}

export function markOn(marks: Mark[] | undefined, word: number): Mark | undefined {
  return marks?.find((m) => m.word === word);
}

/** The words a marked reading's error marks point at, in passage order, for people reading the Sheet. */
export function errorWords(reading: Reading, passage: Passage | undefined): { word: string; errorType?: ErrorType }[] {
  const version = versionReadBy(reading, passage);
  if (!version || markingState(reading) !== 'marked') return [];
  const words = passageWords(version.text);
  return (reading.marks ?? [])
    .filter((m) => m.kind === 'error' && m.word < words.length)
    .map((m) => ({ word: words[m.word], ...(m.errorType ? { errorType: m.errorType } : {}) }));
}
