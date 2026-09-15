import type { Bounds, Passage, Reading, TimingSource } from './types';

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

/** The most refined bounds available: transcript > silence-trim > tap-to-tap. */
export function mostRefinedSource(reading: Reading): TimingSource {
  if (reading.transcriptBounds) return 'transcript';
  if (reading.silenceBounds) return 'silence';
  return 'tap';
}

/** The source in force: the teacher's choice if she made one, otherwise the most refined available. */
export function activeSource(reading: Reading): TimingSource {
  if (reading.timing === 'auto') return mostRefinedSource(reading);
  return boundsFor(reading, reading.timing) ? reading.timing : 'tap';
}

export function activeBounds(reading: Reading): Bounds {
  return boundsFor(reading, activeSource(reading)) ?? reading.tapBounds;
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
