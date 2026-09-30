import type { Emissions } from '../../analysis/ctc';
import type { AlignPhase, Aligner } from './Aligner';

/**
 * Test aligner: answers with whatever emissions the test gives it, or fails like a model that
 * will not load. `hold()` keeps it working (halfway through) until the release it returns is called.
 */
export class FakeAligner implements Aligner {
  constructor(private result: Emissions | Error = new Error('no aligner in this test')) {}
  calls = 0;
  private gate: Promise<void> | undefined;

  hold(): () => void {
    let release!: () => void;
    this.gate = new Promise((resolve) => (release = resolve));
    return release;
  }

  async emissions(_samples: Float32Array, _sampleRate: number, onProgress?: (phase: AlignPhase, fraction: number) => void): Promise<Emissions> {
    this.calls++;
    onProgress?.('timing', 0.5);
    await this.gate;
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}
