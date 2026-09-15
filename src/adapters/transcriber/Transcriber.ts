import type { Transcript } from '../../domain/types';

/**
 * The speech model. `load` fetches or restores the model (may reject: the app must
 * keep working); `transcribe` returns a rough transcript with word timestamps in
 * seconds from the start of the samples.
 */
export interface Transcriber {
  load(onProgress: (fraction: number) => void): Promise<void>;
  transcribe(samples: Float32Array, sampleRate: number): Promise<Transcript>;
}
