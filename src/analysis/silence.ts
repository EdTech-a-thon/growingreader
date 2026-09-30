import type { Bounds } from '../domain/types';

// All of these are guesses until tuned on real classroom recordings.
const FRAME_SECONDS = 0.02;
/** Low: a 90 s reading may have only a few seconds of true quiet at each end. */
const FLOOR_PERCENTILE = 0.02;
const LOUD_PERCENTILE = 0.9;
/** Fraction of the floor→loud range a frame must exceed to open speech. */
const ONSET_FRACTION = 0.25;
/** Fraction below which speech is considered to have closed (hysteresis). */
const RELEASE_FRACTION = 0.12;
/** Frames of sustained signal before an onset counts (rejects clicks). */
const MIN_ONSET_FRAMES = 3;
/** Minimum dynamic range to believe the recording contains speech at all. */
const MIN_RANGE = 0.005;

function frameRms(samples: Float32Array, frameLength: number): Float32Array {
  const frames = Math.floor(samples.length / frameLength);
  const rms = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const base = f * frameLength;
    for (let i = 0; i < frameLength; i++) sum += samples[base + i] * samples[base + i];
    rms[f] = Math.sqrt(sum / frameLength);
  }
  return rms;
}

function percentile(sorted: Float32Array, p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/**
 * Speech bounds from the whole recording's amplitude distribution. Calibrated globally
 * (nothing realtime), with hysteresis so a pause mid-reading does not end it.
 * Returns the whole recording when it cannot find speech.
 */
export function trimSilence(samples: Float32Array, sampleRate: number): Bounds {
  const whole: Bounds = { start: 0, end: samples.length / sampleRate };
  const frameLength = Math.max(1, Math.round(FRAME_SECONDS * sampleRate));
  const rms = frameRms(samples, frameLength);
  if (rms.length < MIN_ONSET_FRAMES) return whole;

  const sorted = Float32Array.from(rms).sort();
  const floor = percentile(sorted, FLOOR_PERCENTILE);
  const loud = percentile(sorted, LOUD_PERCENTILE);
  const range = loud - floor;
  if (range < MIN_RANGE) return whole;

  const onset = floor + ONSET_FRACTION * range;
  const release = floor + RELEASE_FRACTION * range;

  let first = -1;
  let last = -1;
  let speaking = false;
  let run = 0;
  for (let f = 0; f < rms.length; f++) {
    const level = rms[f];
    if (!speaking) {
      run = level > onset ? run + 1 : 0;
      if (run >= MIN_ONSET_FRAMES) {
        speaking = true;
        if (first === -1) first = f - MIN_ONSET_FRAMES + 1;
        last = f;
      }
    } else if (level > release) {
      last = f;
    } else {
      speaking = false;
      run = 0;
    }
  }
  if (first === -1) return whole;

  const frameSeconds = frameLength / sampleRate;
  return { start: first * frameSeconds, end: Math.min(whole.end, (last + 1) * frameSeconds) };
}

/** Quiet this long before sound counts as a place speech starts, rather than a gap inside a word. */
const ONSET_QUIET_SECONDS = 0.15;

/**
 * The moments speech starts again after a pause, in seconds, calibrated like `trimSilence`.
 * These find the starts of phrases, not of words inside one.
 */
export function speechOnsets(samples: Float32Array, sampleRate: number): number[] {
  const frameLength = Math.max(1, Math.round(FRAME_SECONDS * sampleRate));
  const rms = frameRms(samples, frameLength);
  const sorted = Float32Array.from(rms).sort();
  const floor = percentile(sorted, FLOOR_PERCENTILE);
  const range = percentile(sorted, LOUD_PERCENTILE) - floor;
  if (rms.length === 0 || range < MIN_RANGE) return [];
  const threshold = floor + ONSET_FRACTION * range;
  const quietFrames = Math.round(ONSET_QUIET_SECONDS / FRAME_SECONDS);
  const onsets: number[] = [];
  let quiet = quietFrames;
  for (let f = 0; f < rms.length; f++) {
    if (rms[f] >= threshold) {
      if (quiet >= quietFrames) onsets.push(f * FRAME_SECONDS);
      quiet = 0;
    } else quiet++;
  }
  return onsets;
}

/**
 * Where speech stops before a pause, in seconds: the other edge to `speechOnsets`, for
 * snapping a word's end when the teacher drags it.
 */
export function speechOffsets(samples: Float32Array, sampleRate: number): number[] {
  const frameLength = Math.max(1, Math.round(FRAME_SECONDS * sampleRate));
  const rms = frameRms(samples, frameLength);
  const sorted = Float32Array.from(rms).sort();
  const floor = percentile(sorted, FLOOR_PERCENTILE);
  const range = percentile(sorted, LOUD_PERCENTILE) - floor;
  if (rms.length === 0 || range < MIN_RANGE) return [];
  const threshold = floor + ONSET_FRACTION * range;
  const quietFrames = Math.round(ONSET_QUIET_SECONDS / FRAME_SECONDS);
  const offsets: number[] = [];
  let lastLoud = -1;
  let quiet = 0;
  for (let f = 0; f < rms.length; f++) {
    if (rms[f] >= threshold) {
      lastLoud = f;
      quiet = 0;
    } else if (lastLoud >= 0 && ++quiet === quietFrames) offsets.push((lastLoud + 1) * FRAME_SECONDS);
  }
  return offsets;
}

/** How far back from the recogniser's time to look for where the word's sound really starts. */
const SNAP_BACK_SECONDS = 0.8;
/** Without a pause to snap to, how much earlier than the recogniser's time to start. */
const PRE_ROLL_SECONDS = 0.5;

/**
 * Where to start playing a word the recogniser timed at `start`. Its word starts run late
 * (docs/research/word-timing-and-passage-alignment.md), so: the start of the phrase just
 * before, when there is one close by, or else a little early.
 */
export function playFrom(start: number, onsets: number[]): number {
  let snapped: number | undefined;
  for (const o of onsets) if (o <= start + 0.05 && o >= start - SNAP_BACK_SECONDS) snapped = o;
  return Math.max(0, snapped !== undefined ? snapped - 0.05 : start - PRE_ROLL_SECONDS);
}
