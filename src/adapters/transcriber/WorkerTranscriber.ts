import type { Transcript } from '../../domain/types';
import type { Transcriber } from './Transcriber';
import type { FromWorker, ToWorker } from './protocol';

/**
 * The Transcriber adapter for the real model: a Web Worker running transformers.js.
 * Requests are answered one at a time in order; the worker itself is single-threaded.
 */
export class WorkerTranscriber implements Transcriber {
  private worker: Worker | undefined;
  private nextId = 1;
  private pending = new Map<number, { resolve: (t: Transcript) => void; reject: (e: Error) => void }>();
  private loadWaiters: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];
  private onProgress: ((fraction: number) => void) | undefined;

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./transcriber.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.receive(e.data);
      this.worker.onerror = (e) => {
        const error = new Error(e.message || 'speech worker failed');
        for (const w of this.loadWaiters) w.reject(error);
        this.loadWaiters = [];
        for (const p of this.pending.values()) p.reject(error);
        this.pending.clear();
      };
    }
    return this.worker;
  }

  private send(msg: ToWorker, transfer?: Transferable[]) {
    this.ensureWorker().postMessage(msg, transfer ?? []);
  }

  private receive(msg: FromWorker) {
    switch (msg.type) {
      case 'progress':
        this.onProgress?.(msg.fraction);
        break;
      case 'loaded':
        for (const w of this.loadWaiters) w.resolve();
        this.loadWaiters = [];
        break;
      case 'load-error':
        for (const w of this.loadWaiters) w.reject(new Error(msg.message));
        this.loadWaiters = [];
        break;
      case 'transcript':
        this.pending.get(msg.id)?.resolve(msg.transcript);
        this.pending.delete(msg.id);
        break;
      case 'transcribe-error':
        this.pending.get(msg.id)?.reject(new Error(msg.message));
        this.pending.delete(msg.id);
        break;
    }
  }

  load(onProgress: (fraction: number) => void): Promise<void> {
    this.onProgress = onProgress;
    return new Promise((resolve, reject) => {
      this.loadWaiters.push({ resolve, reject });
      this.send({ type: 'load' });
    });
  }

  transcribe(samples: Float32Array, sampleRate: number): Promise<Transcript> {
    const id = this.nextId++;
    // Copy so the caller's buffer survives the transfer.
    const copy = new Float32Array(samples);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ type: 'transcribe', id, samples: copy, sampleRate }, [copy.buffer]);
    });
  }
}
