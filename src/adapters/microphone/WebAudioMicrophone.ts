import type { Capture, Microphone, MicrophoneSession } from './Microphone';
import { SAMPLE_RATE } from '../../domain/types';
import workletUrl from './recorder.worklet.ts?worker&url';

/**
 * getUserMedia + AudioWorklet. Asks for a 16 kHz context so samples come out at the
 * model's rate; if the browser refuses, the capture reports the rate it actually used.
 */
export class WebAudioMicrophone implements Microphone {
  async open(onLevel: (level: number) => void): Promise<MicrophoneSession> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true },
    });
    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    await context.audioWorklet.addModule(workletUrl);
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, 'recorder');
    let resolveCapture: ((c: Capture) => void) | undefined;
    node.port.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'level') onLevel(Math.min(1, e.data.level));
      else if (e.data.type === 'capture') resolveCapture?.({ samples: e.data.samples, sampleRate: e.data.sampleRate });
    };
    source.connect(node);
    // A worklet with no downstream connection is still processed, so nothing is routed to the speakers.
    if (context.state === 'suspended') await context.resume();

    return {
      start: () => node.port.postMessage('start'),
      stop: () =>
        new Promise<Capture>((resolve) => {
          resolveCapture = resolve;
          node.port.postMessage('stop');
        }),
      close: () => {
        node.port.onmessage = null;
        source.disconnect();
        node.disconnect();
        for (const track of stream.getTracks()) track.stop();
        void context.close();
      },
    };
  }
}
