import type { Transcript } from '../../domain/types';

export type ToWorker = { type: 'load' } | { type: 'transcribe'; id: number; samples: Float32Array; sampleRate: number };

export type FromWorker =
  | { type: 'progress'; fraction: number }
  | { type: 'loaded' }
  | { type: 'load-error'; message: string }
  | { type: 'transcript'; id: number; transcript: Transcript }
  | { type: 'transcribe-error'; id: number; message: string };
