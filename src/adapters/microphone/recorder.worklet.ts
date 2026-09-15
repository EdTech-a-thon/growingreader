/// <reference lib="webworker" />
// AudioWorklet processor: buffers raw Float32 samples for a whole reading and reports level.
// Runs on the audio rendering thread, so it keeps recording when the tab is backgrounded.

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}

const LEVEL_INTERVAL_SECONDS = 0.05;

class RecorderProcessor extends AudioWorkletProcessor {
  private recording = false;
  private chunks: Float32Array[] = [];
  private sinceLevel = 0;
  private peak = 0;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      if (e.data === 'start') {
        this.chunks = [];
        this.recording = true;
      } else if (e.data === 'stop') {
        this.recording = false;
        const total = this.chunks.reduce((n, c) => n + c.length, 0);
        const out = new Float32Array(total);
        let offset = 0;
        for (const c of this.chunks) {
          out.set(c, offset);
          offset += c.length;
        }
        this.chunks = [];
        this.port.postMessage({ type: 'capture', samples: out, sampleRate }, [out.buffer]);
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    if (!input) return true;
    if (this.recording) this.chunks.push(new Float32Array(input));
    for (let i = 0; i < input.length; i++) {
      const a = Math.abs(input[i]);
      if (a > this.peak) this.peak = a;
    }
    this.sinceLevel += input.length;
    if (this.sinceLevel >= sampleRate * LEVEL_INTERVAL_SECONDS) {
      this.port.postMessage({ type: 'level', level: this.peak });
      this.sinceLevel = 0;
      this.peak = 0;
    }
    return true;
  }
}

registerProcessor('recorder', RecorderProcessor);
