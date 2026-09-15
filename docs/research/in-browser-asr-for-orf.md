# In-browser ASR for counting words in a child's oral-reading recording

Research date: 2026-09-15. Scope: asynchronous (post-recording) transcription of a 60–120 s, 16 kHz mono clip of a 6–10-year-old reading a known passage, in Chrome on low-end Chromebooks (Celeron N4xxx / MediaTek MT81xx, 4 GB RAM), using `@huggingface/transformers` (transformers.js, currently v4.2.0 on `main`).

Everything below is traced to a primary source (library source code, HF hub file listings, Chromium source, arXiv papers). Where a claim comes from a GitHub issue comment or a third-party README it is labelled **secondary**. Where a number could not be found it is stated as a gap rather than estimated, except in the "Bottom line" where estimates are explicitly marked.

## Bottom line

- **Best bet for word counting: Whisper `tiny.en` via `onnx-community/whisper-tiny.en_timestamped`, `dtype: 'q8'`, `device: 'wasm'`, with `chunk_length_s` set so the 90 s clip is windowed.** Moonshine tiny is cheaper per second of audio, but in transformers.js it has no chunking, no timestamps, and its paper trains on 4–30 s instances; a 90 s clip would have to be VAD-split by the app first. wav2vec2 CTC is the most "verbatim" (keeps repetitions and partial words, which matters for miscues) but the smallest published ONNX export is 95 MB q8 and the transformers.js pipeline runs the whole clip in one forward pass with no chunking.
- **Download size (q8, what transformers.js loads by default on WASM):** whisper-tiny.en ≈ 41 MB (encoder 10.1 MB + merged decoder 30.7 MB); whisper-base.en ≈ 77 MB; moonshine-tiny ≈ 28 MB; moonshine-base ≈ 63 MB; wav2vec2-base-960h ≈ 95 MB. Plus tokenizer/config JSON (a few MB) and the onnxruntime-web WASM binary.
- **Processing time for a 90 s clip on a Celeron N4xxx: no primary measurement exists.** Anchors: whisper-base_timestamped q8 on WASM transcribes 60 s in ≈5 s on an Apple M2 (issue report, secondary); whisper.cpp's WASM docs say tiny/base reach "x2 or x3 real-time … on a modern CPU"; fine-tuned tiny.en in native PyTorch on a Raspberry Pi 5 shows RTF 0.23–0.39 and base.en 0.41–0.61. **Estimate (mine, unverified): tiny.en q8 on a 2-core Celeron N4000 in WASM is plausibly RTF 0.7–2, i.e. 1–3 minutes for 90 s; base.en roughly double. This must be measured on the target hardware.** Note that WASM multithreading only engages when the page is cross-origin isolated (COOP/COEP headers), and the default thread count is min(hardwareConcurrency/2, 4) = 1 on a 2-core Celeron.
- **Expected count accuracy on 6–10-year-old readers: no paper evaluates tiny/base Whisper for WCPM.** Nearest primary numbers: zero-shot Whisper tiny.en WER is 61.0% on CSLU Kids scripted (ages 6–11) and base.en 33.2%; on a 5–9-year-old read-sentence corpus untuned tiny.en gets 19.5% WER when the miscue rate itself is 6.5%; on CMU Kids (6–11) tiny.en gets 33.4%. With Whisper large-v2 (not runnable in-browser) automated WCPM correlated r = 0.964 with human scorers (mean absolute difference 5 WCPM) on grade 3–5 readers. Expect tiny/base to be materially worse than that, and worst on the struggling readers this app targets.
- **Behaviour on disfluencies (large-v2, Dutch 6–13-year-olds):** Whisper omitted the child's attempt in 202 of 586 incorrectly-read words (34%), "rectified" the misreading to the correct word in 24, and predicted only 0.58× as many reading errors as actually occurred; wav2vec2 predicted 1.85× and kept partial words / restarts. Whisper recognised correctly-read words with 0.93 accuracy vs 0.90 for wav2vec2. For pure "how far did they get / how many words correct", Whisper's habit of silently dropping failed attempts is less damaging than for miscue classification, but it will over-credit self-corrected and "rectified" words.
- **Word timestamps:** available for Whisper only, via `return_timestamps: 'word'`, and only from the `_timestamped` ONNX exports (their decoder exposes `cross_attentions.*` outputs; the plain `onnx-community/whisper-tiny.en` decoder does not, verified by inspecting both files). They are DTW estimates over cross-attention, not forced alignment. Moonshine and wav2vec2 paths in the transformers.js pipeline ignore `return_timestamps` entirely.
- **WebGPU on ChromeOS:** enabled by default since Chrome 113 "on ChromeOS devices with Vulkan support", but Google publishes no per-chipset list; whether Gemini Lake UHD 600 or MediaTek Mali Chromebooks expose an adapter could not be verified from a primary source. Also, transformers.js q8 decoders do not run on WebGPU (issue #1317) and one M2 report found WASM faster than WebGPU for Whisper. Design for WASM; treat WebGPU as opportunistic with `navigator.gpu.requestAdapter()` feature detection.
- **Aligning the free transcript to the reference passage is the standard method** in the ORF literature: sclite/SCTK alignment (Gao et al. 2024), the ADAPT dynamic-programming aligner with backward matching to forgive restarts (Molenaar et al. 2023, after Bai et al.), JiWER Levenshtein WER against the story text to compute WCPM (Henkel et al. 2023), and the FLORA system (Bolaños et al. 2011/2013) whose ASR-derived WCPM was within 3–4 words of human scorers on 783 one-minute recordings.

## 1. transformers.js options (v3+/v4)

### Pipeline behaviour (from source)

Source: `packages/transformers/src/pipelines/automatic-speech-recognition.js` on `main` (v4.2.0), https://github.com/huggingface/transformers.js/blob/main/packages/transformers/src/pipelines/automatic-speech-recognition.js

- Dispatch by `model.config.model_type`: `whisper`/`lite-whisper` → `_call_whisper`; `wav2vec2`, `wav2vec2-bert`, `unispeech`, `unispeech-sat`, `hubert`, `parakeet_ctc` → `_call_wav2vec2`; `moonshine` → `_call_moonshine`; `cohere_asr` → `_call_cohere_asr`.
- `return_timestamps` is typed `boolean|'word'` and is only read inside `_call_whisper`. `_call_wav2vec2` is marked `// TODO use kwargs`, does a single forward pass over the whole clip, argmax-decodes, and returns `{ text }` only. `_call_moonshine` runs one `generate` over the whole clip with `max_new_tokens = floor(seconds) * 6` (the paper's "6 output tokens per second" heuristic) and returns `{ text }` only. Neither chunks long audio.
- Whisper: `chunk_length_s` (default 0 = no chunking) and `stride_length_s` (default `chunk_length_s / 6`); chunks are generated sequentially ("NOTE: doing sequentially for now"). With `return_timestamps: 'word'`, it sets `return_token_timestamps: true` and `return_timestamps: true`, then merges chunks via `tokenizer._decode_asr`.
- Word timestamps require `alignment_heads` in `generation_config.json` and a decoder that outputs cross-attentions; `modeling_whisper.js` throws `Model generation config has no 'alignment_heads', token-level timestamps not available` and `Model outputs must contain cross attentions to extract timestamps. This is most likely because the model was not exported with 'output_attentions=True'` otherwise. https://github.com/huggingface/transformers.js/blob/main/packages/transformers/src/models/whisper/modeling_whisper.js
- Default dtype: `fp32` for every device except `wasm`, where it is `q8` (file suffix `_quantized`). https://github.com/huggingface/transformers.js/blob/main/packages/transformers/src/utils/dtypes.js
- Device: "By default, when running in the browser, the model will be run on your CPU (via WASM). If you would like to run the model on your GPU (via WebGPU), you can do this by setting `device: 'webgpu'`." README, https://github.com/huggingface/transformers.js/blob/main/README.md. The WebGPU guide labels WebGPU support "experimental". https://huggingface.co/docs/transformers.js/guides/webgpu
- Official word-timestamp example uses `onnx-community/whisper-base_timestamped`, `return_timestamps: "word"`, `chunk_length_s: 30`, with `dtype: 'q8'` on WASM and `{encoder_model:'fp32', decoder_model_merged:'q4'}` on WebGPU. https://github.com/huggingface/transformers.js-examples/blob/main/whisper-word-timestamps/src/worker.js
- Official Moonshine example uses `onnx-community/moonshine-base-ONNX` with `{encoder_model:'fp32', decoder_model_merged:'q8'}` on WASM, fed by Silero VAD segments (i.e. it never sends long audio to the model). https://github.com/huggingface/transformers.js-examples/blob/main/moonshine-web/src/worker.js
- Known bug: `chunk_length_s: 30` with `whisper-base_timestamped` produced timestamps all `29.98 -> 29.98` on v3.6.1; `29` worked; a fix PR (#1594) is linked. https://github.com/huggingface/transformers.js/issues/1358 (**secondary**: issue report; verify on current version before relying on 30 s chunks).
- onnxruntime-web pinned by transformers.js `main`: `1.31.0-dev.20260914-8d85527a0`. https://github.com/huggingface/transformers.js/blob/main/packages/transformers/package.json
- ORT Web threading: "The default value is `0`, which means it will be determined by ONNX Runtime Web based on the environment. In browsers, it will be set to half of `navigator.hardwareConcurrency` or `4`, whichever is smaller." and "Only when the browser supports WebAssembly multi-threading and `crossOriginIsolated` mode is enabled, multi-threading will be enabled." https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html

### Model download sizes (from HF hub file listings, `/api/models/<repo>/tree/main/onnx`)

All are transformers.js-compatible repos. transformers.js loads `encoder_model*.onnx` + `decoder_model_merged*.onnx` for encoder-decoder models and `model*.onnx` for CTC models. Sizes in MB (10^6 bytes).

| Repo | fp32 | fp16 | q8 (`_quantized`) | q4 | q4f16 |
|---|---|---|---|---|---|
| `onnx-community/whisper-tiny.en_timestamped` (enc + dec_merged) | 32.9 + 118.7 = 151.6 | 16.5 + 59.6 = 76.1 | 10.1 + 30.7 = **40.8** | 9.0 + 86.8 = 95.8 | (enc none) + 46.0 |
| `onnx-community/whisper-tiny.en` (no cross-attn outputs) | 32.9 + 119 | 16.5 + 59.6 | 10.1 + 30.7 | 9.0 + 86.7 | — |
| `onnx-community/whisper-base.en_timestamped` | 82.5 + 208.7 = 291.2 | 41.3 + 104.7 = 146.0 | 23.2 + 53.7 = **76.9** | 18.8 + 123.7 = 142.5 | (enc none) + 68.5 |
| `onnx-community/moonshine-tiny-ONNX` | 30.9 + 78.2 = 109.1 | 15.5 + 76.3 = 91.8 | 7.9 + 20.2 = **28.1** | 10.7 + 44.7 = 55.4 | 6.9 + 49.1 = 56.0 |
| `onnx-community/moonshine-base-ONNX` | 80.8 + 166.2 = 247.0 | 40.5 + 160.7 = 201.2 | 20.5 + 42.4 = **62.9** | 24.8 + 72.8 = 97.6 | 16.6 + 85.1 = 101.7 |
| `Xenova/wav2vec2-base-960h` / `onnx-community/wav2vec2-base-960h-ONNX` (single `model`) | 377.9 | 189.2 | **95.3** | 89.8 | 66.5 |
| `Xenova/wav2vec2-large-xlsr-53-english` | 1262.5 | 631.7 | 317.5 | 241.4 | 196.8 |
| `Xenova/mms-300m` (pretrained, no CTC head useful for English) | 1262.3 | 631.6 | 318.4 | — | — |
| `Xenova/mms-1b-all` | 3859 (external data) | 1931 | 973 | 667 | 571 |

Sources: https://huggingface.co/onnx-community/whisper-tiny.en_timestamped/tree/main/onnx, https://huggingface.co/onnx-community/whisper-tiny.en/tree/main/onnx, https://huggingface.co/onnx-community/whisper-base.en_timestamped/tree/main/onnx, https://huggingface.co/onnx-community/whisper-base.en/tree/main/onnx, https://huggingface.co/onnx-community/moonshine-tiny-ONNX/tree/main/onnx, https://huggingface.co/onnx-community/moonshine-base-ONNX/tree/main/onnx, https://huggingface.co/Xenova/wav2vec2-base-960h/tree/main/onnx, https://huggingface.co/onnx-community/wav2vec2-base-960h-ONNX/tree/main/onnx, https://huggingface.co/Xenova/wav2vec2-large-xlsr-53-english/tree/main/onnx, https://huggingface.co/Xenova/mms-300m/tree/main/onnx, https://huggingface.co/Xenova/mms-1b-all/tree/main/onnx.

Notes:
- The `_timestamped` and plain whisper repos have near-identical file sizes; the difference is graph outputs, not weights. I downloaded `decoder_model_merged_quantized.onnx` from both `onnx-community/whisper-tiny.en` (30,718,858 bytes) and `onnx-community/whisper-tiny.en_timestamped` (30,729,881 bytes) and listed string tables: only the `_timestamped` decoder contains `cross_attentions.0 … cross_attentions.3` output names. So `return_timestamps: 'word'` with the plain repo will throw the "must contain cross attentions" error. (The transformers.js JSDoc example uses `Xenova/whisper-tiny.en` for word timestamps; I did not verify that older Xenova export.)
- Both whisper repos' `generation_config.json` contain `alignment_heads`.
- No MMS CTC English ONNX export under `onnx-community`/`Xenova` was found; `Xenova/mms-1b-all` is the multilingual adapter model at ~1 GB q8, not viable here.
- Moonshine ONNX repos are MIT-licensed per the HF model card; Whisper ONNX repos inherit Apache-2.0 from openai/whisper.

### Word-level timestamp support

- Whisper: yes (`return_timestamps: 'word'`), via cross-attention DTW using `alignment_heads`; requires the `_timestamped` export (see above). Timestamps are rounded to 0.01 s in the pipeline.
- Moonshine: no. `_call_moonshine` returns `{ text }` only.
- wav2vec2/CTC: no. `_call_wav2vec2` returns `{ text }` only (CTC frame indices are available in principle from `logits`, but the pipeline does not expose them; you would need to call the model directly).

### Runs on WASM / WebGPU

- All of the above run on WASM (the default). WebGPU is supported by the same code path via `device: 'webgpu'` but: "WebGPU does not work with q8 decoders (AutoModelForSeq2SeqLM, WhisperForConditionalGeneration)" https://github.com/huggingface/transformers.js/issues/1317 (**secondary**: issue title; the official examples avoid q8 on WebGPU and use fp32 encoder + q4 decoder, consistent with this). There is also an fp16 encoder precision issue on WebGPU (https://github.com/huggingface/transformers.js/issues/1590, **secondary**) and a WebGPU memory-leak report for long audio (https://github.com/huggingface/transformers.js/issues/860, **secondary**).

### Reported real-time factors on CPU-only WASM

No RTF is published in the transformers.js docs. The only primary-ish data points:

- **secondary (issue report)**: Mac mini M2, Chrome 127, transformers 3.0.0-alpha.6, `onnx-community/whisper-base_timestamped`, `chunk_length_s: 30, stride_length_s: 5, return_timestamps: "word"`, 60 s source: q8+q8 on WASM 5.2 s; fp32+fp32 WASM 4.9 s; fp32+q4 WASM 5.9 s; WebGPU was slower in every configuration (9.5–27 s). https://github.com/huggingface/transformers.js/issues/894 → RTF ≈ 0.09 on M2 for base.en with word timestamps.
- **secondary (third-party README)**: "~30 seconds to transcribe 1 minute of audio" with `Xenova/whisper-tiny.en` q8 in WASM, hardware unspecified. https://github.com/backblaze-b2-samples/b2-whisper-transformersjs-transcriber
- whisper.cpp (not transformers.js, but the same model sizes and also WASM SIMD): "you should be able to achieve x2 or x3 real-time for the `tiny` and `base` models on a modern CPU"; audio input limited to 120 s in that demo. https://github.com/ggml-org/whisper.cpp/blob/master/examples/whisper.wasm/README.md
- Native (not WASM) reference for a weak ARM CPU: fine-tuned whisper tiny.en on a Raspberry Pi 5 in PyTorch, RTF 0.23–0.39 across 9–30 s inputs; base.en 0.41–0.61; small.en 1.05–1.88. Dutta, Chandupatla & Hansen, arXiv:2507.14451, Table 4. https://arxiv.org/abs/2507.14451
- Anecdote for the target CPU class (**secondary**, not browser): a Samsung Chromebook 4 (Celeron N4000) running OpenAI's Python Whisper `base` in the Linux container took "around 30 seconds" to transcribe one English sentence, and the author warns larger models run out of memory. https://github.com/tgraupmann/ChromeOS_Whisper

Moonshine's own compute claims (paper, arXiv:2410.15608): Tiny 27.1 M params, Base 61.5 M; "5x reduction in compute requirements for transcribing a 10-second speech segment" vs Whisper tiny.en; FLOPs normalised to Whisper tiny.en: Moonshine Tiny 0.7×, Base 1.6×; WER on LibriSpeech clean/other: Moonshine Tiny 4.52/11.71 vs Whisper tiny.en 5.66/15.45; Base 3.23/8.18 vs base.en 4.25/10.35; training instances "∈[4,30] seconds"; greedy decoding with a 6 tokens/s cap. https://arxiv.org/abs/2410.15608. The Moonshine model card carries the same hallucination/repetition caveats as Whisper's. https://huggingface.co/moonshine-ai/moonshine-tiny

## 2. WebGPU availability on ChromeOS (2026)

- Chrome Platform Status: WebGPU "Enabled by default", desktop milestone 113. https://chromestatus.com/feature/6213121689518080
- Chrome release post: "This initial release of WebGPU was made available in Chrome 113, on ChromeOS devices with Vulkan support, Windows devices with Direct3D 12 support, and macOS." https://developer.chrome.com/blog/webgpu-release ; overview page adds Android in Chrome 121 (Android 12+, Qualcomm and ARM GPUs). https://developer.chrome.com/docs/web-platform/webgpu/overview
- gpuweb implementation-status wiki: ChromeOS listed as supported from 113; Linux: Intel Gen12+ from 144, NVIDIA (Wayland, driver ≥ 535.183.01) from 147, others behind a flag. https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
- Chromium feature gating (`gpu/config/gpu_util.cc`, `GetWebGPUFeatureStatus`): WebGPU is disabled only if `enable_webgpu` is off, SwiftShader is in use, or the GPU is in the blocklist for `accelerated_webgpu`; the current `software_rendering_list.json` has no `accelerated_webgpu` entry, only a Linux `webgpu_on_vk_via_gl_interop` restriction (exceptions: Intel Gen12+ Mesa ≥ 22.0, NVIDIA ≥ 535.183.01). https://chromium.googlesource.com/chromium/src/+/main/gpu/config/gpu_util.cc , https://chromium.googlesource.com/chromium/src/+/main/gpu/config/software_rendering_list.json
- Troubleshooting page: `requestAdapter()` returns null when "WebGPU is not supported on this platform yet", when the GPU is blocklisted, or when hardware acceleration is off; check `chrome://gpu` for "WebGPU: Hardware accelerated". https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips
- **Gap:** no Google/Chromium primary source lists which ChromeOS boards have Vulkan (and therefore WebGPU) enabled. Nothing found for Intel UHD 600 (Gemini Lake) or MediaTek Mali (MT8183 G72, MT8186 G52, MT8192/8195 G57) specifically. The practical answer is runtime detection (`navigator.gpu?.requestAdapter()`), plus the transformers.js caveats above (q8 decoders fail on WebGPU; WASM may be faster for Whisper anyway).
- Also relevant: many Celeron N4000-era Chromebooks are near their auto-update expiration; Chrome version on the device caps which WebGPU/ORT features exist. https://support.google.com/chrome/a/answer/6220366

## 3. Whisper / wav2vec2 accuracy on children's oral reading

### Zero-shot Whisper by size on English child read speech

Kid-Whisper (Attia et al., arXiv:2309.07927), Table 3, zero-shot WER: https://arxiv.org/abs/2309.07927

| Model | MyST (8–11 y, conversational) | CSLU Kids scripted (6–11 y, read) | CSLU spontaneous | LibriSpeech test-clean |
|---|---|---|---|---|
| tiny | 21.16 | 74.98 | 57.01 | 7.49 |
| tiny.en | 18.34 | **61.04** | 45.29 | 5.59 |
| base | 18.54 | 40.20 | 43.71 | 4.98 |
| base.en | 15.57 | **33.18** | 38.57 | 4.15 |
| small.en | 13.93 | 21.31 | 32.00 | 3.05 |
| medium.en | 13.23 | 18.57 | 31.85 | 3.02 |
| large-v2 | 12.80 | 17.22 | 29.39 | 2.82 |

"The WER for the scripted part of CSLU Kids is between 6 and 10 times that of Librispeech."

Dutta et al. (arXiv:2507.14451), Table 2, zero-shot on MyST (Org / Filtered): tiny.en 28.0 / 18.2; base.en 22.9 / 15.7; small.en 18.8 / 12.9; fine-tuning tiny.en on MyST brought it to 15.9 / 11.8. https://arxiv.org/abs/2507.14451

### Verbatim transcription of children's read-aloud with miscues (English)

Prompting Whisper for Improved Verbatim Transcription and End-to-end Miscue Detection (arXiv:2505.23627), Table 1, speaker-level WER: https://arxiv.org/abs/2505.23627
- Dataset Xc: "over 124,000 utterances from 367 children aged 5 to 9 … sentences read from fictional texts … miscues common in early education that naturally arise due to blending or tracking mistakes, lacking phonics knowledge, or incorrect guesses"; transcribed verbatim. XCMU: CMU Kids, ages 6–11, re-annotated verbatim.
- "Naive" (use the prompt text as the transcript) WER = the miscue rate: Xc 6.5%, XCMU 16.9%.
- Untuned, unprompted: tiny.en 19.5 (Xc) / 33.4 (XCMU); small.en 11.2 / 20.6; medium.en 9.7 / 17.1.
- Fine-tuned + prompted with the reading text: tiny.en 6.9 / 14.3; medium.en 4.0 / 11.1.
- "WERs are much higher than 15% for children and atypical speech using tiny.en models, making it unsuitable for most ASR applications."
- "ASR is typically trained to ignore dysfluencies that MD specifically aims to detect (e.g., filler words and repetitions), so it rarely captures a true verbatim."

### Insertion/deletion behaviour on misreadings (Dutch, ages 6–13, large models)

Gao et al., Interspeech 2024 (arXiv:2406.07060): Jasmin-CGN, 71 pupils aged 6–13, 2.05 h, 14,251 reading attempts (11,322 correct, 615 incorrect words/part-words). Models: Wav2Vec2 Large (Dutch FT), XLSR Large, MMS-NL, Faster-Whisper Large-v2; prompt–ASR alignment with SCTK. https://arxiv.org/abs/2406.07060
- WER (child): Wav2Vec2 Large 13.2, XLSR 17.6, MMS-NL 21.0, Whisper 9.8.
- Error Ratio (predicted errors / true errors): Wav2Vec2 1.85, XLSR 2.14, MMS 1.87, **Whisper 0.58** — "Wav2Vec2 Large tends to produce more errors while Whisper tends to ignores errors."
- Table 7, recognition accuracy: correctly read words Wav2Vec2 0.90 / Whisper 0.93; incorrectly read words 0.60 / 0.53; part-of-word attempts 0.29 / 0.23.
- Table 8, what happens to the 586 incorrectly-read attempts: "ASR omits incorrectly read attempts" Wav2Vec2 22 vs **Whisper 202**; "Rectify incorrect to correct word" 51 vs 24; "Replace with a single word" 112 vs 41; "Replace with 2 or more words" 29 vs 0; "Merge incorrect sounds and subsequent pronunciation" 17 vs 0. "Whisper in 73% of the cases tries to just ignore the incorrectly read word."
- Miscue detection: Wav2Vec2 recall 0.83 / precision 0.29 / F1 0.43; Whisper 0.53 / 0.52 / 0.52. Whisper's insertion-miscue F1 rose from 0.27 (all insertions) to 0.46 once restarts/repetitions were excluded from the insertion class — "Whisper has an advantage in eliminating restart errors", i.e. it drops them from the transcript.

Follow-up (Gao et al. 2025, arXiv:2506.11079, same corpus): baseline Whisper large-v2 WER 9.4, large-v3 9.3; "Whisper Large v3 exhibits significantly more hallucinations"; prompting Whisper with the reading text *raised* WER (13.1) unless the prompt contained many injected mistakes; they added a length-based hallucination check ("hypotheses that are 20% longer or 5% shorter than the read text are flagged as hallucinations"); best pipeline (Whisper + LLM alignment refinement) 5.1 WER, miscue F1 0.39 → 0.73. https://arxiv.org/abs/2506.11079

Lathouwers et al. 2026 (arXiv:2605.28833), Dutch children 7–11, JASMIN/DART: whisper-large-v2 baseline WER 16.94 (JASMIN) / 77.57 (noisy classroom DART); fine-tuned whisper-medium 5.54 / 70.37; Wav2Vec2 (GroNLP) 23.57 / 111.10. They chose large-v2 over v3 "since this was found to suffer less from hallucinations". https://arxiv.org/abs/2605.28833

### Kaldi vs Whisper for reading-accuracy assessment

Molenaar et al., Interspeech 2023 (arXiv:2306.03444): Dutch, 71 children aged 7–11 (JASMIN), 13,180 words; only 2.82% of words read incorrectly. Kaldi with a prompt-constrained LM reached WER 8.3 vs manual transcript; Whisper large-v2 13.4 (15.5 with prompt hints). Best agreement with human error marking MCC = .63 (Kaldi-PM); Whisper's SER vs manual transcript 53.0%. https://arxiv.org/abs/2306.03444. (Kaldi is not an in-browser option; the point is that a constrained-vocabulary decoder outperformed free Whisper for *accuracy* judgement on near-fluent readers.)

### ORF / WCPM with Whisper (older readers, large-v2)

Henkel et al. 2023 (arXiv:2310.17606): Whisper large-v2 zero-shot vs wav2vec2 large. Ghana dataset (ages 13–18, ESL, classroom recordings, 60 files): WER 13.5 vs 25.2. CU Boulder dataset (grades 3–5, ~8–12 y, 45 files): Whisper WER 10.2 (range 0.0–31.0). Fully automated WCPM = words_in_story × (1 − WER) × 60/duration: mean 110 vs human 113, correlation 0.964, mean absolute difference 5 WCPM. Observed: "wav2vec 2.0 preserves reading errors, particularly repetitions, more faithfully (e.g., 'he locked, he looked', 'had head headed'). Whereas Whisper V2 corrects some repetitions and reading errors." https://arxiv.org/abs/2310.17606

### Hallucination (model authors)

OpenAI model card: "the predictions may include texts that are not actually spoken in the audio input (i.e. hallucination) … the sequence-to-sequence architecture of the model makes it prone to generating repetitive texts, which can be mitigated to some degree by beam search and temperature scheduling but not perfectly." https://github.com/openai/whisper/blob/main/model-card.md. Moonshine's card repeats this and adds "this behavior and hallucinations may be worse for short audio segments, or segments where parts of words are cut off at the beginning or the end of the segment." https://huggingface.co/moonshine-ai/moonshine-tiny

**Gap:** no study reports Whisper tiny/base on 6–10-year-old *struggling/dyslexic* readers of *decodable* text, nor insertion/deletion counts for tiny/base. The Dutch omission numbers are for large-v2; smaller models have much higher WER, and the direction of their errors on hesitations/sounding-out is unmeasured.

## 4. Aligning the transcript to the reference passage: is it established?

Yes; it is the default method in every ORF/miscue paper found, and open-source aligners exist.

- **SCTK/sclite alignment** of prompt text vs ASR output to count substitutions/deletions/insertions: Gao et al. 2024 ("we employ prompt-ASR alignment to count the number of reading errors predicted by the ASR") and Gao et al. 2025 ("force alignment with SCTK"). https://arxiv.org/abs/2406.07060 , https://arxiv.org/abs/2506.11079 , https://github.com/usnistgov/SCTK
- **ADAPT** dynamic-programming aligner (grapheme-level edit distance) with the Bai et al. rule for restarts: "the algorithm judges a word as read correctly if it finds a complete instance of that word in the whole utterance. This is done by starting matching at the end of the utterance and working backwards, thus avoiding scoring any restarts or partial words before". Molenaar et al. 2023. https://arxiv.org/abs/2306.03444
- **JiWER (Levenshtein)** WER between story text and transcript, converted to WCPM: Henkel et al. 2023 (r = 0.964 vs humans). https://arxiv.org/abs/2310.17606 , https://github.com/jitsi/jiwer
- **FLORA** (Bolaños, Cole, Ward et al., ACM TSLP 2011; J. Educational Psychology 2013): speech recognition + alignment producing WCPM on 783 one-minute recordings of 313 students reading grade-level passages; abstract (ERIC EJ1054417) describes automatic estimates of "word accuracy, reading rate, and expressiveness" compared with expert human scorers. https://eric.ed.gov/?id=EJ1054417 (the "within 3–4 words" figure is quoted in search-result summaries of the paper; I could not open the full text to verify it — **treat as secondary**).
- Gao et al.'s code for prompt-based miscue detection (alignment included): https://github.com/Lingygao/reading-mistake-detection-with-prompt (linked from arXiv:2506.11079 footnote).
- Practical CBM/DIBELS-style scorers on GitHub using Levenshtein word alignment plus word timestamps for the 60 s window and the 3 s hesitation rule exist (e.g. https://github.com/dungnotnull/ReadPulse-AI-Agent, **secondary**, uses a cloud STT).

Design implications supported by these sources: (a) align against the reference, not against a verbatim transcript, so that Whisper's dropped restarts do not become spurious insertions; (b) use backward matching (Bai/Molenaar) so a self-corrected word counts once; (c) "last word reached" is the last reference word matched in the alignment; (d) apply a length-based hallucination guard (Gao 2025's ±20%/−5% rule) before trusting a transcript.

## Gaps / could not verify

- No measured RTF for any transformers.js model on Celeron N4xxx or MediaTek MT81xx in Chrome; the only WASM timings are on Apple M2 (issue comment) and an unspecified machine (third-party README). The Bottom-line time estimate is mine.
- No primary list of ChromeOS boards/GPUs with Vulkan (hence WebGPU) enabled; nothing specific for Intel UHD 600 or Mali G52/G57/G72.
- No published WER or WCPM error for Whisper tiny/base or Moonshine on 6–10-year-old struggling readers or decodable text; the closest are CSLU Kids scripted (tiny.en 61%, base.en 33%) and a 5–9-year-old sentence corpus (tiny.en 19.5%).
- No Moonshine evaluation on child speech at all was found.
- No published insertion/deletion breakdown for tiny/base Whisper on disfluent child speech; the omission statistics (202/586 attempts dropped) are for Faster-Whisper large-v2 on Dutch.
- transformers.js issue #1358 (30 s chunk bug) and #1317 (q8 on WebGPU) are issue reports; I did not re-test them on v4.2.0.
- The FLORA "within 3–4 WCPM" number could not be confirmed against the full paper text.
- The wav2vec2 pipeline's single-pass design on a 90 s clip (≈4,500 frames of self-attention in 12 layers) is a memory risk on 4 GB devices; this is my inference from the source, not a measured failure.
- Peak memory of Whisper tiny.en q8 in WASM on a 4 GB Chromebook was not found in any source.
