import type { Emissions } from '../../analysis/ctc';
import type { AlignPhase, Aligner } from './Aligner';
import type { FromAlignerWorker, ToAlignerWorker } from './aligner.worker';

/** The Aligner adapter for the real model: its own Web Worker, so it never holds up transcription. */
export class WorkerAligner implements Aligner {
  private worker: Worker | undefined;
  private nextId = 1;
  private pending = new Map<number, { resolve: (e: Emissions) => void; reject: (e: Error) => void; onProgress?: (phase: AlignPhase, fraction: number) => void }>();

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./aligner.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<FromAlignerWorker>) => {
        const msg = e.data;
        const p = this.pending.get(msg.id);
        if (!p) return;
        if (msg.type === 'progress') return p.onProgress?.(msg.phase, msg.fraction);
        this.pending.delete(msg.id);
        if (msg.type === 'emissions') p.resolve(msg.emissions);
        else p.reject(new Error(msg.message));
      };
      this.worker.onerror = (e) => {
        const error = new Error(e.message || 'alignment worker failed');
        for (const p of this.pending.values()) p.reject(error);
        this.pending.clear();
      };
    }
    return this.worker;
  }

  emissions(samples: Float32Array, sampleRate: number, onProgress?: (phase: AlignPhase, fraction: number) => void): Promise<Emissions> {
    const id = this.nextId++;
    const copy = new Float32Array(samples);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      const msg: ToAlignerWorker = { type: 'emissions', id, samples: copy, sampleRate };
      this.ensureWorker().postMessage(msg, [copy.buffer]);
    });
  }
}
