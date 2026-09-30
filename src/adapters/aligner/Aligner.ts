import type { Emissions } from '../../analysis/ctc';

/** Fetching the model (first time only), then running it over the recording. */
export type AlignPhase = 'download' | 'timing';

/**
 * The forced-alignment model (wav2vec2 character CTC): frame-by-frame letter probabilities
 * for a recording, which `alignWords` turns into word times. Loads its model on first use;
 * may reject, and marking must keep working on the recogniser's times when it does.
 */
export interface Aligner {
  emissions(samples: Float32Array, sampleRate: number, onProgress?: (phase: AlignPhase, fraction: number) => void): Promise<Emissions>;
}
