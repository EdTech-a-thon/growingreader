import type { Capture, Microphone, MicrophoneHandle } from './Microphone';
import { SAMPLE_RATE } from '../../domain/types';

/** Test microphone: the test pushes levels and decides what the recording contains. */
export class FakeMicrophone implements Microphone {
  private onLevel: ((level: number) => void) | undefined;
  capture: Capture = { samples: new Float32Array(SAMPLE_RATE * 2), sampleRate: SAMPLE_RATE };
  failWith: Error | undefined;
  recording = false;
  opened = false;

  async open(onLevel: (level: number) => void): Promise<MicrophoneHandle> {
    if (this.failWith) throw this.failWith;
    this.onLevel = onLevel;
    this.opened = true;
    return {
      start: () => {
        this.recording = true;
      },
      stop: async () => {
        this.recording = false;
        return this.capture;
      },
      close: () => {
        this.opened = false;
        this.onLevel = undefined;
      },
    };
  }

  emitLevel(level: number) {
    this.onLevel?.(level);
  }
}
