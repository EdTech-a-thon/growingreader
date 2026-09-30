/**
 * The loudest sample in each of `count` equal slices of `samples`, scaled 0–1 for drawing a
 * waveform. Scaled to the 98th percentile rather than the maximum, so one bump or click does
 * not flatten the rest.
 */
export function peaksOf(samples: Float32Array | undefined, count: number): number[] {
  if (!samples || samples.length === 0 || count <= 0) return [];
  const per = samples.length / count;
  const out = new Array<number>(count);
  for (let b = 0; b < count; b++) {
    let peak = 0;
    const end = Math.min(samples.length, Math.floor((b + 1) * per));
    for (let i = Math.floor(b * per); i < end; i++) peak = Math.max(peak, Math.abs(samples[i]));
    out[b] = peak;
  }
  const sorted = [...out].sort((a, b) => a - b);
  const ceiling = sorted[Math.floor(sorted.length * 0.98)] || 1;
  return out.map((p) => Math.min(1, p / ceiling));
}

/** The share of the waveform's width left of the playhead: a third, so two thirds of the view is what is coming. */
export const PLAYHEAD_LEAD = 1 / 3;
