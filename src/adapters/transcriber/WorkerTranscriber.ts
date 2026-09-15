import type { Transcript } from '../../domain/types';
import type { Transcriber } from './Transcriber';

/** Placeholder until the worker lands: the model is unavailable. */
export class WorkerTranscriber implements Transcriber {
  async load() {
    throw new Error('speech model not yet available');
  }
  async transcribe(): Promise<Transcript> {
    throw new Error('speech model not yet available');
  }
}
