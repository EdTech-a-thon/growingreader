import type { Bounds, Passage, Reading, TimingSource } from './types';
import { countWords } from '../analysis/words';

export function durationOf(bounds: Bounds): number {
  return Math.max(0, bounds.end - bounds.start);
}

export function boundsFor(reading: Reading, source: TimingSource): Bounds | undefined {
  switch (source) {
    case 'tap':
      return reading.tapBounds;
    case 'silence':
      return reading.silenceBounds;
    case 'transcript':
      return reading.transcriptBounds;
  }
}

/** The most refined automatic bounds available: transcript > silence-trim > tap-to-tap. */
export function autoSource(reading: Reading): TimingSource {
  if (reading.transcriptBounds) return 'transcript';
  if (reading.silenceBounds) return 'silence';
  return 'tap';
}

export function autoBounds(reading: Reading): Bounds {
  return boundsFor(reading, autoSource(reading)) ?? reading.tapBounds;
}

/** The bounds in force: the teacher's handles if she dragged them, otherwise the most refined automatic ones. */
export function activeBounds(reading: Reading): Bounds {
  if (reading.timing === 'manual' && reading.manualBounds) return reading.manualBounds;
  return autoBounds(reading);
}

/** Handles cannot cross, leave the recording, or pinch closer than this. */
export const MIN_BOUNDS_GAP = 0.2;

export function clampBounds(bounds: Bounds, duration: number): Bounds {
  const start = Math.max(0, Math.min(bounds.start, duration - MIN_BOUNDS_GAP));
  const end = Math.min(duration, Math.max(bounds.end, start + MIN_BOUNDS_GAP));
  return { start, end };
}

export function activeDuration(reading: Reading): number {
  return durationOf(activeBounds(reading));
}

/** Words per minute. Only exists once the passage is known and the reading is complete (ADR-0001). */
export function rate(reading: Reading, passage: Passage | undefined): number | undefined {
  if (!passage || reading.passageId !== passage.id) return undefined;
  if (reading.completion !== 'complete') return undefined;
  const seconds = activeDuration(reading);
  if (seconds <= 0) return undefined;
  return (passage.wordCount / seconds) * 60;
}

/** (Word count minus errors) per minute. Only exists when the teacher has entered errors. */
export function wordsCorrectPerMinute(reading: Reading, passage: Passage | undefined): number | undefined {
  if (reading.errors === undefined) return undefined;
  const r = rate(reading, passage);
  if (r === undefined || !passage) return undefined;
  const seconds = activeDuration(reading);
  return (Math.max(0, passage.wordCount - reading.errors) / seconds) * 60;
}

export function formatRate(value: number | undefined): string {
  return value === undefined ? '—' : `${Math.round(value)}`;
}

export function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return m > 0 ? `${m}:${s.toFixed(1).padStart(4, '0')}` : `${s.toFixed(1)} s`;
}

/**
 * Words per minute from what the app heard: transcript word count over the active duration.
 * An estimate with an unknown error bound (see ADR-0003); shown only while no exact rate exists.
 */
export function estimatedRate(reading: Reading): number | undefined {
  if (!reading.transcript) return undefined;
  const words = countWords(reading.transcript.text);
  const seconds = activeDuration(reading);
  if (words === 0 || seconds <= 0) return undefined;
  return (words / seconds) * 60;
}
