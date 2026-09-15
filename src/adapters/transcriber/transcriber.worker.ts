/// <reference lib="webworker" />
// Runs whisper-tiny.en (timestamped ONNX export, q8, WASM) off the main thread.
// See docs/research/in-browser-asr-for-orf.md for why these exact choices.
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import type { FromWorker, ToWorker } from './protocol';
import { SAMPLE_RATE, type Transcript } from '../../domain/types';

/** Only the `_timestamped` export exposes the cross-attentions word timestamps need. */
const MODEL = 'onnx-community/whisper-tiny.en_timestamped';
const CHUNK_LENGTH_S = 30;
const STRIDE_LENGTH_S = 5;

// Never look for models on our own origin; everything comes from the Hub and is cached via the Cache API.
env.allowLocalModels = false;
env.useBrowserCache = true;

const post = (m: FromWorker, transfer?: Transferable[]) => (self as unknown as Worker).postMessage(m, transfer ?? []);

let loading: Promise<AutomaticSpeechRecognitionPipeline> | undefined;

function load(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!loading) {
    loading = pipeline('automatic-speech-recognition', MODEL, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (info: { status: string; progress?: number }) => {
        if (info.status === 'progress_total' && typeof info.progress === 'number') post({ type: 'progress', fraction: info.progress / 100 });
      },
    }).catch((e) => {
      loading = undefined;
      throw e;
    });
  }
  return loading;
}

/** Linear resample to the model's rate when the capture came in at something else. */
function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const j = Math.floor(pos);
    const t = pos - j;
    out[i] = samples[j] * (1 - t) + (samples[Math.min(j + 1, samples.length - 1)] ?? 0) * t;
  }
  return out;
}

async function transcribe(samples: Float32Array, sampleRate: number): Promise<Transcript> {
  const asr = await load();
  const audio = resample(samples, sampleRate, SAMPLE_RATE);
  const output = (await asr(audio, {
    return_timestamps: 'word',
    chunk_length_s: CHUNK_LENGTH_S,
    stride_length_s: STRIDE_LENGTH_S,
  })) as { text: string; chunks?: Array<{ text: string; timestamp: [number, number | null] }> };
  const words = (output.chunks ?? [])
    .map((c) => ({ text: c.text.trim(), start: c.timestamp[0], end: c.timestamp[1] ?? c.timestamp[0] }))
    .filter((w) => w.text.length > 0);
  return { text: output.text.trim(), words };
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'load') {
    try {
      await load();
      post({ type: 'loaded' });
    } catch (err) {
      post({ type: 'load-error', message: err instanceof Error ? err.message : String(err) });
    }
  } else if (msg.type === 'transcribe') {
    try {
      const transcript = await transcribe(msg.samples, msg.sampleRate);
      post({ type: 'transcript', id: msg.id, transcript });
    } catch (err) {
      post({ type: 'transcribe-error', id: msg.id, message: err instanceof Error ? err.message : String(err) });
    }
  }
};
