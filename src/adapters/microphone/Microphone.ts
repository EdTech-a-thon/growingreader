/** Raw mono samples captured between Start and Done. */
export interface Capture {
  samples: Float32Array;
  sampleRate: number;
}

export interface MicrophoneHandle {
  /** Begin buffering samples. */
  start(): void;
  /** Stop buffering and hand back everything since start(). */
  stop(): Promise<Capture>;
  /** Release the microphone. */
  close(): void;
}

/**
 * The device microphone. `open` asks for permission and starts the level meter;
 * `onLevel` receives a 0..1 signal level a few times a second until close().
 */
export interface Microphone {
  open(onLevel: (level: number) => void): Promise<MicrophoneHandle>;
}
