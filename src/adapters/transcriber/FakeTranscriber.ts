import type { Transcript } from '../../domain/types';
import type { Transcriber } from './Transcriber';

/** Test transcriber: returns whatever the test says it heard. */
export class FakeTranscriber implements Transcriber {
  loadError: Error | undefined;
  loadDelay: Promise<void> = Promise.resolve();
  loaded = false;
  private gate: Promise<void> | undefined;
  private release: (() => void) | undefined;

  constructor(private produce: (samples: Float32Array) => Transcript = () => ({ text: '', words: [] })) {}

  hears(transcript: Transcript | string) {
    const t = typeof transcript === 'string' ? wordsEvenlySpaced(transcript) : transcript;
    this.produce = () => t;
  }

  /** Hold every transcription until `finish()` is called, to test the queue. */
  hold() {
    this.gate = new Promise((resolve) => (this.release = resolve));
  }
  finish() {
    this.release?.();
    this.gate = undefined;
  }

  async load(onProgress: (fraction: number) => void) {
    await this.loadDelay;
    if (this.loadError) throw this.loadError;
    onProgress(1);
    this.loaded = true;
  }

  async transcribe(samples: Float32Array) {
    if (this.gate) await this.gate;
    return this.produce(samples);
  }
}

/** Spread words across `seconds` with a small gap, starting at `startAt`. */
export function wordsEvenlySpaced(text: string, startAt = 0.5, seconds = 10): Transcript {
  const tokens = text.split(/\s+/).filter(Boolean);
  const step = seconds / Math.max(1, tokens.length);
  return {
    text,
    words: tokens.map((w, i) => ({ text: w, start: startAt + i * step, end: startAt + i * step + step * 0.8 })),
  };
}
