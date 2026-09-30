/// <reference lib="webworker" />
// Runs wav2vec2-base-960h (character CTC, q8 ONNX, WASM) off the main thread and returns
// its frame log-probabilities. See docs/research/word-timing-and-passage-alignment.md.
import { AutoModelForCTC, AutoProcessor, AutoTokenizer, env, type PreTrainedModel, type PreTrainedTokenizer, type Processor } from '@huggingface/transformers';
import type { Emissions } from '../../analysis/ctc';
import { SAMPLE_RATE } from '../../domain/types';

/** Apache-2.0; the MMS aligner export is CC-BY-NC and cannot be used. */
export const MODEL = 'onnx-community/wav2vec2-base-960h-ONNX';
/** Self-attention cost grows with the square of the input, so the audio goes in 20 s pieces with 1 s of context each side. */
// Short enough that progress moves often; the second of context either side keeps the edges right.
const CHUNK_SECONDS = 10;
const CONTEXT_SECONDS = 1;

env.allowLocalModels = false;
env.useBrowserCache = true;

/** Fetching the model (first time only), then running it over the recording. */
export type AlignPhase = 'download' | 'timing';

export type ToAlignerWorker = { type: 'emissions'; id: number; samples: Float32Array; sampleRate: number };
export type FromAlignerWorker =
  | { type: 'progress'; id: number; phase: AlignPhase; fraction: number }
  | { type: 'emissions'; id: number; emissions: Emissions }
  | { type: 'error'; id: number; message: string };

const post = (m: FromAlignerWorker, transfer?: Transferable[]) => (self as unknown as Worker).postMessage(m, transfer ?? []);

let loading: Promise<{ processor: Processor; tokenizer: PreTrainedTokenizer; model: PreTrainedModel }> | undefined;

function load(onDownload: (fraction: number) => void) {
  const progress_callback = (info: { status: string; progress?: number }) => {
    if (info.status === 'progress_total' && typeof info.progress === 'number') onDownload(info.progress / 100);
  };
  loading ??= Promise.all([
    AutoProcessor.from_pretrained(MODEL),
    AutoTokenizer.from_pretrained(MODEL),
    AutoModelForCTC.from_pretrained(MODEL, { dtype: 'q8', device: 'wasm', progress_callback }),
  ])
    .then(([processor, tokenizer, model]) => ({ processor, tokenizer, model }))
    .catch((e) => {
      loading = undefined;
      throw e;
    });
  return loading;
}

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

async function emissions(id: number, input: Float32Array, sampleRate: number): Promise<Emissions> {
  const { processor, tokenizer, model } = await load((fraction) => post({ type: 'progress', id, phase: 'download', fraction }));
  const samples = resample(input, sampleRate, SAMPLE_RATE);
  const chunk = CHUNK_SECONDS * SAMPLE_RATE;
  const context = CONTEXT_SECONDS * SAMPLE_RATE;
  const rows: Float32Array[] = [];
  post({ type: 'progress', id, phase: 'timing', fraction: 0 });
  let V = 0;
  let framesPerSecond = 50;
  for (let s = 0; s < samples.length; s += chunk) {
    const a = Math.max(0, s - context);
    const b = Math.min(samples.length, s + chunk + context);
    const inputs = await processor(samples.subarray(a, b));
    const { logits } = await model(inputs);
    const [, F, v] = logits.dims as number[];
    V = v;
    const data = logits.data as Float32Array;
    framesPerSecond = F / ((b - a) / SAMPLE_RATE);
    // Keep only this chunk's own frames; the context either side is there to steady them.
    const f0 = Math.round(((s - a) / SAMPLE_RATE) * framesPerSecond);
    const f1 = Math.round(((Math.min(s + chunk, samples.length) - a) / SAMPLE_RATE) * framesPerSecond);
    for (let f = f0; f < f1 && f < F; f++) {
      let max = -Infinity;
      for (let k = 0; k < V; k++) max = Math.max(max, data[f * V + k]);
      let z = 0;
      for (let k = 0; k < V; k++) z += Math.exp(data[f * V + k] - max);
      const row = new Float32Array(V);
      const log = max + Math.log(z);
      for (let k = 0; k < V; k++) row[k] = data[f * V + k] - log;
      rows.push(row);
    }
    post({ type: 'progress', id, phase: 'timing', fraction: Math.min(1, (s + chunk) / samples.length) });
  }
  const logProbs = new Float32Array(rows.length * V);
  rows.forEach((r, i) => logProbs.set(r, i * V));
  const vocab = tokenizer.get_vocab() as Map<string, number> | Record<string, number>;
  const idOf = (c: string) => (vocab instanceof Map ? vocab.get(c) : vocab[c]);
  const letters: Record<string, number> = {};
  for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ'") {
    const i = idOf(c);
    if (i !== undefined) letters[c] = i;
  }
  return {
    model: MODEL,
    frameSeconds: samples.length / SAMPLE_RATE / rows.length,
    frames: rows.length,
    vocabSize: V,
    logProbs,
    blank: idOf('<pad>') ?? 0,
    space: idOf('|') ?? 4,
    letters,
  };
}

self.onmessage = async (e: MessageEvent<ToAlignerWorker>) => {
  const msg = e.data;
  try {
    const result = await emissions(msg.id, msg.samples, msg.sampleRate);
    post({ type: 'emissions', id: msg.id, emissions: result }, [result.logProbs.buffer]);
  } catch (err) {
    post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) });
  }
};
