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
