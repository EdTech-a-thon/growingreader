# Word timing and passage alignment for the marking screen

Research date: 2026-09-30. Scope: on the Mark reading screen (ADR-0008), give the teacher (a) a transcript or passage she can click to seek the recording, and possibly (b) a "diff" between what was heard and the passage. Recordings are 1–3 min, 16 kHz mono, a 6–11-year-old reading a known passage, processed in the browser on Chromebooks/iPads. Builds on `docs/research/in-browser-asr-for-orf.md` (model sizes, tiny.en WER on children, Whisper's habit of dropping misread attempts, transcript-to-passage alignment as standard practice); none of that is repeated here except where a number is needed.

Sourcing: every claim is traced to a paper, model card, library source or official doc. **Measured here** marks numbers from a throwaway prototype I ran for this note (one clip, see §3.3); those are not published results and the clip is adult text-to-speech, not a child. **Inferred** marks my reasoning. **Secondary** marks issue threads.

## Bottom line for Growing Reader

- **Yes, timing is an easier problem than recognition, but only once you know the words.** Aligning a *known* text to audio is a constrained search (Viterbi through a fixed token sequence), and aligners put word boundaries within tens of milliseconds on adult speech: mean word-boundary error 23–48 ms (TIMIT) and 41–89 ms (Buckeye) for MFA, MMS and wav2vec2-base CTC aligners (Huang et al. 2024). Finding word boundaries *without* the text is much harder: the best unsupervised systems reach word-boundary F1 of about 36% on conversational English (Kamper, arXiv:2202.11929). Energy/VAD finds pauses, not words.
- **Pause-based segmentation won't find word boundaries in connected reading.** Silero VAD's defaults (100 ms minimum silence, 250 ms minimum speech) are built to find speech segments. Fluent children make fewer "pausal intrusions" (Miller & Schwanenflugel 2006, 2008), so pauses line up with words only for the slowest, word-by-word readers. Measured here: pauses of 150 ms or more fell at 12 of 83 word boundaries in an 84-word read.
- **Plain forced alignment assumes the reader read the text, and children don't.** Project LISTEN rejected it for that reason ("children often jump back to the beginning of the phrase or sentence and reread, or skip hard words"; Tam et al. 2003) and used a recogniser whose language model came from the sentence, plus truncated-word "distracters". MMS adds a `<star>` wildcard token for audio that isn't in the text (Pratap et al. 2023). Reading-tutor aligners add filler/garbage models and skip transitions. With those additions, forced alignment still works when the child skips, repeats or misreads.
- **Whisper's cross-attention DTW timestamps are the weakest option.** WhisperX: Whisper large-v2 DTW gets word-segmentation precision/recall 78.9/52.1 (AMI) and 85.4/62.8 (Switchboard) at a 200 ms collar. Swapping in wav2vec2-base-960h forced alignment raises that to 84.1/60.3 and 93.2/65.4 (Bain et al. 2023). An external aligner is not always better, though: under noise, WhisperX fell below plain Whisper DTW (F1 59.0 vs 68.3; CrisperWhisper). **Measured here with the app's exact tiny.en setup:** word onsets came out a consistent 330–640 ms late (mean 444 ms). The last word was stamped as ending 3.8 s after the audio ended, and a word before a 3.9 s pause was stretched across the pause. CTC forced alignment of the passage on the same clip landed within 70 ms (mean absolute 36 ms) of energy onsets.
- **In-browser CTC forced alignment works, and it isn't hard.** transformers.js `AutoModelForCTC` returns frame logits (the ASR pipeline hides them). `onnx-community/wav2vec2-base-960h-ONNX` q8 is 95 MB and Apache-2.0. The only MMS aligner export (`onnx-community/mms-300m-1130-forced-aligner-ONNX`) is 317 MB q8 and **CC-BY-NC-4.0**, so it isn't usable in a product. The Viterbi with garbage and skip states is about 100 lines of JS and took 35 ms for 24 s of audio (0.8 s for 2 min unbanded). **Measured here on an M1 Pro:** wav2vec2 emissions at real-time factor (RTF) 0.46 on single-thread WASM and 0.14 on 4 threads. **Inferred for a 2-core Celeron:** RTF around 1.5–2, i.e. 2–4 extra minutes for a 2-minute reading, roughly as costly as the Whisper pass itself.
- **Don't show a word-level heard-vs-passage diff from tiny.en.** On children's read speech, untuned tiny.en plus alignment classifies *correctly read* words as correct with recall of only .61 (Xc) and .42 (CMU Kids). Inferred: on a 100-word passage read 90% correctly, the diff would flag roughly 35–50 correct words, burying the ~10 real errors. Substitution F1 is .10–.18 (Smith et al. 2025). Every shipped product that shows a diff (Reading Progress, Amira) runs server-side models and has a person review the output. Automation bias makes reviewers commit errors of both omission and commission, and training or instructions don't prevent it (Parasuraman & Manzey 2010). ADR-0008 already rules out "hints on words the transcript thinks were missed", and a diff is that hint.
- **Recommendation:** prototype passage forced alignment as a **seek/follow-along index only**: no diff, no error hints, and no confidence shown to the teacher. It's worth prototyping because the aligner is small code, the timing gain over tiny.en DTW is large on the one clip measured, and a passage-anchored index is what the marking UI needs anyway (click a passage word, hear that word). Before paying the extra 95 MB and minutes of CPU, do two cheap things: (1) seek to Whisper start minus about 0.5 s, and seek only through words that `align.ts` matched to the passage; (2) hand-mark word onsets in 5–10 real child recordings and measure both methods. Only ship the aligner if Whisper is off by more than about 300 ms on child speech.

## 1. Is finding word boundaries easier than recognising words?

### 1.1 Without the text: energy/VAD and unsupervised segmentation

- **VAD finds speech regions, not words.** Silero VAD `get_speech_timestamps` defaults are `threshold=0.5`, `min_speech_duration_ms=250`, `min_silence_duration_ms=100`, `speech_pad_ms=30`, `window_size_samples=512`. https://github.com/snakers4/silero-vad/blob/master/src/silero_vad/utils_vad.py. Model about 2 MB, "less than 1ms" per 30+ ms chunk on one CPU thread, ONNX and browser ports listed. https://github.com/snakers4/silero-vad. Any inter-word gap under 100 ms is by design part of one speech segment.
- **Children's pauses track fluency, not word boundaries.** Miller & Schwanenflugel (2008, 92 children, grades 1–2): fewer "pausal intrusions" in grade 1 predicted later adult-like intonation, and "decreases in the number of pausal intrusions between the first and second grades" predicted comprehension. https://doi.org/10.1598/rrq.43.4.2. Their 2006 study (80 third graders, 29 adults): "children who had quick and accurate oral reading had shorter and more adultlike pause structures". https://doi.org/10.1037/0022-0663.98.4.839. Inferred: pause-based word segmentation works best for the dysfluent, word-by-word readers and worst for fluent ones, so its error depends on reading level. That is a bad property for a tool used across levels.
- **Measured here** (energy RMS in 10 ms frames, threshold 0.01, gaps of at least 150 ms, on the 84-word, 23.8 s TTS clip in §3.3): 12 of 83 word boundaries had such a pause, nearly all at punctuation or at inserted hesitations.
- **Unsupervised word segmentation from audio** (no text, no ASR) is an open research problem. Best word-boundary F1 on Buckeye English test data at a 20 ms tolerance is 36.4% (DPDP AE-RNN), against 32.8–35.1% for CPC-based systems. Kamper, "Word segmentation on discovered phone units with dynamic programming and self-supervised scoring", Table III, https://arxiv.org/abs/2202.11929. Buckeye is conversational adult speech; nothing comparable exists for child read speech.

### 1.2 With the text: forced alignment

Forced alignment searches only over time placements of a given token sequence, so it doesn't have to *recognise* anything. "Forced alignment determines which parts of the audio correspond to which parts of the text … finds the most likely path in the posterior probabilities … computed using the Viterbi algorithm", memory O(T×L). Pratap et al., *Scaling Speech Technology to 1,000+ Languages* (MMS), §3.1.3 and App. A, https://arxiv.org/abs/2305.13516.

**Word-boundary accuracy on adult English (published):**

| Aligner | TIMIT (read) mean word-boundary error | Buckeye (conversational) | Source |
|---|---|---|---|
| wav2vec2-base-960h CTC (torchaudio tutorial) | 48 ms | 89 ms | Huang et al. 2024, Table 1 |
| MMS CTC aligner | 37 ms | 53 ms | same |
| MFA (GMM-HMM) | 23 ms | 41 ms | same |
| CTC with label priors (theirs) | 28–29 ms | 34–43 ms | same |

Huang et al., "Less peaky and more accurate CTC forced alignment by label priors", ICASSP 2024, https://arxiv.org/abs/2406.02560. Standard CTC is "peaky": non-blank tokens "fire for just one frame" (predicted phone duration 21 ms, i.e. one 20 ms frame), and "the standard CTC makes more errors on onset prediction than offset prediction". The torchaudio tutorial also warns about CTC's "peaky behavior". https://docs.pytorch.org/audio/stable/tutorials/ctc_forced_alignment_api_tutorial.html

Rousso et al. 2024, "Tradition or Innovation" (https://arxiv.org/abs/2406.19363), scored on words each system recognised correctly. TIMIT, % of word boundaries within 10/25/50/100 ms:

| System | 10 ms | 25 ms | 50 ms | 100 ms |
|---|---|---|---|---|
| MFA | 41.6 | 72.8 | 89.4 | 97.4 |
| MMS | 18.6 | 43.5 | 75.7 | 94.7 |
| WhisperX | 22.4 | 52.7 | 82.4 | 94.2 |

Median error was 12.5 ms (MFA), 29.3 ms (MMS) and 23.5 ms (WhisperX). On Buckeye's long (≈9 min) inputs, MFA's mean error hit 976 ms and WhisperX's 11,685 ms, "due to drift". They attribute this to unsegmented long input. Inferred: chunk the audio before aligning, or use the anchors from `align.ts`.

MFA 3.0 paper (2026): mean word-boundary error 12.1–12.4 ms TIMIT, 13.9–15.0 ms Buckeye; no child data. "Violating this assumption in small ways (e.g., a word missing from the dictionary, wrong pronunciations, missing words in the transcript, etc) often only has local effects." https://arxiv.org/abs/2606.18466

**Children:**
- Mahr et al. 2021, JSLHR (42 children aged 3–6, phone level, five aligners). MFA with speaker-adaptive training was best, but "the best-performing aligner fell just short of human-level reliability". It is usable "for certain classes of sounds (vowels, fricatives for older children), especially as part of a semi-automated workflow where alignments are later inspected for gross errors." https://doi.org/10.1044/2020_jslhr-20-00268
- Kadambi et al. 2025, JSLHR (Wav2TextGrid, trainable wav2vec2 aligner, same 3–6-year-old corpus): "Accuracy for plosives and affricates in children's speech improved more than 40% over baseline". It "matched existing methods using approximately 13 min of labeled data", and "approximately 45-60 min of labeled alignments yielded significant improvement." https://doi.org/10.1044/2024_jslhr-24-00347, code https://github.com/pkadambi/Wav2TextGrid
- **Gap:** I found no published *word*-boundary error in ms for any aligner on 6–11-year-olds reading aloud. The abstracts above give no millisecond figures.

**MFA in the browser:** MFA wraps Kaldi GMM-HMM, trains through EM stages (monophone → triphone → LDA+MLLT → SAT) and needs a pronunciation lexicon (Rousso et al. §2.1). Installation is via conda. https://montreal-forced-aligner.readthedocs.io. I found no WASM build. Treat it as a server/offline tool.

### 1.3 How forced alignment behaves when the reader deviates

- **Plain forced alignment breaks.** MMS Fig. 5: when the audio contains speech not in the text, "the word *some* is aligned incorrectly". Their fix is "a star token (⟨∗⟩) to which audio segments can be mapped if there is no good alternative in the text", with posterior "set to one", inserted at the start of each chapter and in place of digits (§3.1.3). torchaudio's MMS_FA model includes the `<star>` dimension by default. https://docs.pytorch.org/audio/stable/tutorials/forced_alignment_for_multilingual_data_tutorial.html. MMS also scores alignment quality as the length-normalised gap between the forced path's probability and greedy decoding's (§3.1.5). That gap is a usable "this segment doesn't match the text" signal.
- **Reading tutors didn't force-align; they used text-constrained recognition.** Project LISTEN (Tam, Mostow, Beck, Banerjee, Eurospeech 2003): "using forced alignment with children's reading is inappropriate because children often jump back to the beginning of the phrase or sentence and reread, or skip hard words … Instead, we use a constrained language model generated from the sentence." Baseline miscue detection was 56.33% at a 3.94% false-alarm rate. A confidence classifier cut false alarms to 2.92% at the same detection rate. https://www.ri.cmu.edu/pub_files/pub4/tam_y_c_2003_1/tam_y_c_2003_1.pdf
- Mostow's 2012 overview adds detail. The lexicon holds the sentence's words plus "distracters … phonetic truncations of the sentence words" (first 2 to n−2 phonemes). "The resulting ASR detected about half the miscues rated by a human judge as serious … The ASR rejected about 4% of correctly read words." "We prioritize accepting correct reading over detecting miscues, because children read 90% of words correctly." Other distracters "increased the miscue detection rate significantly only by also increasing the false alarm rate … In short, distracters detract." http://www.cs.cmu.edu/~listen2/pdfs/2012-05-05%20ISADEPT2012%20keynote%20final.pdf
- **Position tracking** (which text word the child is on; closest to our click-to-seek): Li & Mostow 2012, 80 children, 2.95 h. Exact accuracy was 58.1% in real time and 75.6% on the final hypothesis. "Near" accuracy (±1 word) was 81.6% and 87.3%, and on-task speech final 83.3% exact / 92.8% near. https://www.cs.cmu.edu/~listen/pdfs/FLAIRS2012%20Real-time%20Tracking%20accuracy.pdf. Even a purpose-built children's reading recogniser put the reader on the exact word only about three-quarters of the time.
- Colorado Literacy Tutor (Lee, Hagen, Romanyshyn, Martin, Pellom, COLING 2004): n-gram LMs of the story, then a DP aligner that "allow[s] for skipping of words or even skipping to a different place within the text". Words were accepted if at least 75% of their phonemes matched. Result: "67% of reading miscues can be detected at a false alarm rate of 3%", system WER 8.0% on children's read stories. https://aclanthology.org/C04-1182.pdf
- Kouzelis et al. 2023, "Weakly-supervised forced alignment of disfluent speech using phoneme-level modeling" (Interspeech), https://arxiv.org/abs/2306.00996. They change the CTC alignment graph (WFST) so repetitions and omissions need no verbatim transcript, and report a "23-25% relative improvement over our baselines" on corrupted TIMIT and UCLASS stuttered speech. This is the closest published analogue of a garbage/skip CTC aligner.
- Behaviour on each deviation type, from the sources above plus §3.3 (inferred where not stated):
  - *Skips*: need an explicit skip transition. Without one, the aligner must place every passage word and squeezes skipped words into a few frames of neighbouring speech.
  - *Repetitions and restarts*: absorbed by a garbage/star state before the word, if one exists. Otherwise one copy is aligned and the other smeared into neighbours.
  - *Substitutions*: aligned to the expected word anyway, usually with low posterior. Timing stays roughly right, which is what seeking needs.
  - *Insertions*: garbage or star state.

## 2. Whisper word timestamps

- **Mechanism.** openai/whisper: "Extract word-level timestamps using the cross-attention pattern and dynamic time warping". https://github.com/openai/whisper/blob/main/whisper/transcribe.py. transformers.js `_extract_token_timestamps` applies DTW to the `alignment_heads` cross-attentions, a median filter (`median_filter_width`, default 7) and `time_precision = 0.02`. https://github.com/huggingface/transformers.js/blob/main/packages/transformers/src/models/whisper/modeling_whisper.js. `onnx-community/whisper-tiny.en_timestamped` uses 8 alignment heads across 4 decoder layers, with `median_filter_width` 7 (its `generation_config.json` and `config.json`).
- **Published accuracy (large-v2; nothing published for tiny).**
  - WhisperX paper (Bain et al., Interspeech 2023), Table 2, 200 ms collar. Precision/recall need an exact word match *and* timing, so recognition errors count against them.

    | System | AMI P/R | Switchboard P/R |
    |---|---|---|
    | wav2vec2 | 81.8/45.5 | 92.9/54.3 |
    | Whisper DTW | 78.9/52.1 | 85.4/62.8 |
    | WhisperX | 84.1/60.3 | 93.2/65.4 |

    WhisperX with base.en as the recogniser still gets 83.7/58.9 and 93.1/64.5 (Table 4). "Solely using Whisper for word-level timestamps extraction significantly underperforms … even falling short of wav2vec2.0." Cross-attention methods "are prone to timestamp inaccuracies" (§2.7). Alignment overhead is "approx. <10% in speed" on GPU. https://arxiv.org/abs/2303.00747
  - CrisperWhisper (Zusag et al., Interspeech 2024), 0.2 s collar, synthetic speech with pauses. F1/mIoU: Whisper DTW 74.7/51.4, WhisperX 76.7/61.5. With added noise: Whisper DTW 68.3/49.8, WhisperX 59.0/44.3, "attributable to Wav2Vec2.0's lesser noise resilience". WhisperX's alignment also suffers because "discrepancies between model transcripts can further degrade timestamp precision". https://arxiv.org/abs/2408.16589
  - Rousso et al.: WhisperX (Whisper + wav2vec2 alignment) placed 82.4% of TIMIT word boundaries within 50 ms, vs MFA's 89.4% (table in §1.2).
- **How much does WhisperX-style alignment help?** From the numbers above: +5 to +8 points precision and +3 to +8 points recall at a 200 ms collar on AMI/Switchboard, and +2 F1 / +10 mIoU on clean synthetic speech. On noisy audio it lost 9 F1. Inferred: the gain is real but modest at a coarse collar and bigger at fine collars (mIoU). Noisy classrooms are where it can backfire.
- **transformers.js issues (secondary).** #805: word timestamps are "inaccurately extended … particularly when there are pauses". https://github.com/huggingface/transformers.js/issues/805. #1358: all-equal timestamps with `chunk_length_s: 30` (noted in the earlier doc).
- **Measured here (§3.3), tiny.en_timestamped q8, the app's exact options:** all 13 onsets checked were late by 330–640 ms (mean 444 ms). "the." before a 3.9 s pause was stretched to 1.16 s. "yet." was stamped 24.56–27.50 on a 23.8 s clip. The transcript itself was good on this adult TTS voice ("wrought" for the misread "rod", repetition "did not. Did not" kept, skipped line correctly absent).

## 3. Browser feasibility

### 3.1 Models (HF hub file listings `/api/models/<repo>/tree/main/onnx`, licences from the hub's `license:` tags)

| Repo | q8 / int8 | q4 | fp16 | Licence | Notes |
|---|---|---|---|---|---|
| `onnx-community/wav2vec2-base-960h-ONNX` (also `Xenova/wav2vec2-base-960h`) | **95.2 MB** | 89.9 MB (q4f16 66.4) | 189 MB | Apache-2.0 (from `facebook/wav2vec2-base-960h`) | Character CTC (A–Z, `'`, `\|`); the WhisperX default aligner |
| `onnx-community/mms-300m-1130-forced-aligner-ONNX` | 317 MB | 241.5 MB (bnb4 222.6) | 632 MB | **CC-BY-NC-4.0** | torchaudio MMS_FA converted to HF by MahmoudAshraf; romanised characters |
| `onnx-community/wav2vec2-base-10k-voxpopuli-ft-en-ONNX` | — | 89.7 MB | 189 MB | CC-BY-NC-4.0 | WhisperX's best AMI aligner; licence rules it out |
| `onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX` | 317.7 MB | 241.7 MB | 632 MB | Apache-2.0 | Phoneme CTC; would need a G2P step |
| `onnx-community/hubert-base-english-ipa-ONNX` | — | 89.7 MB | 189 MB | (not checked) | IPA phoneme CTC |
| Silero VAD | ≈2 MB | | | MIT | Pause finding only |

- transformers.js: `_call_wav2vec2` in the ASR pipeline returns `{ text }` only (earlier doc). But `AutoModelForCTC.from_pretrained(id, { dtype: 'q8' })` followed by `model(await processor(audio))` returns `logits` of shape [1, frames, vocab]. I used exactly this (§3.3). Frame rate is 50/s (20 ms).
- onnxruntime-web WASM runs the same `model_quantized.onnx` directly (`InferenceSession.create(bytes, { executionProviders: ['wasm'] })`). Threads need cross-origin isolation (earlier doc).

### 3.2 Is the Viterbi simple in JS?

Yes. The CTC forced-alignment recursion is standard. For target length L, build S = 2L+1 states (blank, token, blank, …). Each state takes the max over itself, the previous state, and the state two back if the tokens differ. Then backtrack. MMS App. A gives pseudocode. torchaudio's `forced_align` requires "T >= L + repeats", and it "[was] deprecated in 2.8 and ha[s] been removed in 2.9". https://docs.pytorch.org/audio/stable/tutorials/ctc_forced_alignment_api_tutorial.html. MMS reports CPU implementations as the slow part only for very long audio (43-min chapters, Fig. 4). For our 1–3 min, the cost is T × S ≈ 6,000 frames × 3,500 states.

To handle deviations I added three things to the plain recursion:
1. A garbage state between every pair of words and at both ends. It scores each frame as max(blank, word-separator, best other token − 1.0).
2. Non-emitting skip edges between consecutive garbage states, costing 8 per skipped word. Because all garbage states share one emission, skips resolve as a forward sweep per frame.
3. Word timing read only from token frames, so leading and trailing blanks don't stretch a word across a pause.

My first version made skips emitting transitions. It then needed one frame per skipped word and misaligned a skipped line. That's the one subtle bug to avoid.

### 3.3 Measured here

Throwaway scripts, kept outside the repo. Clip: `src/dev/demo-audio/ada-camp-2.wav` (macOS `say` Samantha, 140 wpm, 16 kHz, 23.8 s), a deliberate misreading of the 84-word Camp passage with:
- "rod … red" self-correction
- the whole third line skipped (22 words)
- "did not, did not" repetition
- a 3.5 s hesitation before "pond"

Machine: Apple M1 Pro, Node 24, transformers.js 4.2.0 (the repo's `node_modules`).

- **Speed.**
  - wav2vec2-base-960h q8 emissions, 20 s windows with 1 s context: RTF 0.058–0.065 on onnxruntime-node CPU (multithreaded native). Whisper tiny.en_timestamped q8 on the same backend and clip: RTF 0.054. So the aligner model costs about as much as the recogniser.
  - onnxruntime-web **WASM** in Node, 20 s window: 9.1 s single-thread (RTF 0.46), 2.8 s with 4 threads (RTF 0.14).
  - Viterbi: 35 ms for 24 s and 84 words (711 states). 0.8 s for 119 s and 420 words (3,551 states), unbanded, with an Int32 backpointer array of about 85 MB. Inferred: banding around the `align.ts` anchors, or 16-bit backpointers, cuts the memory.
  - **Inferred for a Celeron N4000:** single-core throughput several times below an M1 Pro core, and 1 WASM thread there by default. Expect RTF around 1.5–2 for the aligner alone, i.e. 2–4 min for a 2-min reading, on top of the Whisper pass. Must be measured.
- **Behaviour.**
  - The skipped line came back as exactly words 40–61 skipped.
  - The "did not" repetition and the "rod" attempt landed in garbage before "did" and "red".
  - The 3.5 s hesitation shows as a 3.9 s gap between "the" (ends 17.02) and "pond" (starts 20.95). That gap is exactly what the DIBELS 3-second rule needs.
  - One false "omission": wav2vec2 heard the TTS "camp" as "TEN" (greedy output), so word 5 was skipped into garbage. Forced alignment inherits the acoustic model's mistakes as spurious skips.
  - Low token posteriors fell on "the"/"and" around the garbled "pond" (0.05, 0.04), so posteriors hint at trouble but aren't calibrated.
- **Timing against energy onsets.** 13 words that follow a pause, where the onset is unambiguous from RMS:

  | Method | Onset error | Mean | Mean absolute | Max |
  |---|---|---|---|---|
  | CTC forced alignment | −20 to +70 ms | +32 ms | 36 ms | 70 ms |
  | Whisper tiny.en DTW (transformers.js) | +330 to +640 ms | +444 ms | 444 ms | 640 ms |

  Last speech offset was 23.71 s. CTC placed "yet." ending at 23.67 s; Whisper placed it at 27.50 s.
- **Caveats.** One clip, adult synthetic voice, clean audio, and energy onsets are only a proxy for hand labels. This shows the method works and the Whisper lag exists in our pipeline. It says nothing about accuracy on children.

## 4. Showing a heard-vs-passage diff

### 4.1 Prior art

- **Microsoft Reading Progress** (Teams). Auto-detect "evaluates student recordings to identify likely mispronunciations and other reading errors", framed as "Estimate student errors to save time", and "Educators can always adjust the errors". Categories: omission, insertion, mispronunciation, repetition, self-correction. There is a pronunciation-sensitivity setting and a warning that detection "may not recognize accents and dialects well … Use your discretion to mark errors manually". Teachers can "select it in the passage and choose Jump to word", so seek is passage-anchored. https://support.microsoft.com/en-us/education/getting-started-with-reading-progress-in-teams. It runs on Azure Pronunciation Assessment with `EnableMiscue` (omission/insertion/repetition against reference text; a model "trained with 100,000+ hours of speech data from native speakers"). The transparency note says: "Include a human-in-the-loop for any formal examination scenarios", and "the grading method for children's learning might not be as strict as that for adult learning". https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/pronunciation-assessment/transparency-note-pronunciation-assessment
- **Google Read Along** runs on-device ("voice data is analyzed on-device without being sent to any Google servers"). It deliberately biases toward accepting words: "the Read Along team decided to optimize for recall, thereby increasing the number of false positives", where a false positive means "the child has misread a word, though the system fails to recognize this". https://android-developers.googleblog.com/2020/06/on-device-ML-design-insights.html. Project LISTEN made the same choice ("We prioritize accepting correct reading over detecting miscues").
- **CORE (University of Oregon, IES-funded ORF system):** ASR-vs-human kappa on word scoring about .88 on average. Most disagreement variance sat at the student and recording levels, and demographics explained 13% of student-level variance. Nese, Kahn & Kamata, NCME 2017 poster, https://files.eric.ed.gov/fulltext/ED607987.pdf
- **Amira**: I found no primary technical report with word-level agreement figures; only marketing and state-guidance PDFs. **Gap.**
- **Research systems** all align the ASR output to the reference (earlier doc §4: sclite, ADAPT, JiWER, FLORA). With a small model on children, measured quality is low. Smith et al. 2025 (https://arxiv.org/abs/2505.23627, Table 2) report speaker-level F1 (recall) for untuned, unprompted **tiny.en** plus alignment:

  | Class | Xc (ages 5–9) | CMU Kids (ages 6–11) |
  |---|---|---|
  | `<CORRECT>` | **.752 (.606)** | **.529 (.424)** |
  | `<SUBSTITUTE>` | .100 | .178 |
  | `<OMIT>` | .247 | .306 |
  | `<INSERT>` | .287 | .317 |

  The "naive" baseline, which calls every word correct, scores `<CORRECT>` F1 .978 and .943. So on correctly-read words the diff does worse than showing nothing. Fine-tuning plus prompting with the passage brings tiny.en to about .96 CORRECT and .30–.47 substitution, but that needs training data we don't have.
- Gao et al. 2024 (large-v2, Dutch): Whisper "tries to just ignore the incorrectly read word" in 73% of cases (earlier doc §3). A Whisper diff under-reports real errors while over-reporting ASR errors on correct words.

### 4.2 Teacher-trust and anchoring risk

- Automation bias: "results in making both omission and commission errors when decision aids are imperfect … occurs in both naive and expert participants, cannot be prevented by training or instructions". Parasuraman & Manzey 2010, *Human Factors*, https://doi.org/10.1177/0018720810376055
- Goddard et al. 2012 systematic review (74 studies): mediators include "trust and confidence", "workload, task complexity, and time constraint". Mitigators include "the position of advice on the screen, updated confidence levels attached to DSS output, and the provision of information versus recommendation". https://doi.org/10.1136/amiajnl-2011-000089
- A recent expert study (28 pathologists) found a "7% automation bias rate" (correct independent judgements overturned by wrong AI advice) and "moderate anchoring" that "increased under time pressure". https://arxiv.org/abs/2603.11821. Teachers marking between lessons are under time pressure.
- Inferred for Growing Reader:
  - With `<CORRECT>` recall at .42–.61, a diff would put dozens of false flags on the passage. That produces commission errors if she trusts them, or trains her to ignore the diff, which then hides the few real hits.
  - Whisper's systematic omission of misread attempts means a missing flag reads as "fine", so she makes omission errors.
  - Both push the teacher's marks toward the model's, which would silently corrupt the marks ADR-0008 treats as ground truth.
  - A seek index that shows *where* a word was read, not *whether* it was right, carries much less of this risk. It is closer to "information" than "recommendation" in Goddard's terms.
- ADR-0008 already records the decision: "hints on words the transcript thinks were missed are out, since they are the transcript scoring the student by another name". A diff reverses ADR-0002/0008 and should go through a new ADR.

## 5. Teacher-verified labels as training data; privacy (brief)

- **Value.** Teacher marks give per-word correct/error labels on real children, and the aligner gives candidate word-to-audio segments that a teacher implicitly checks by clicking. Human-verified labels matter: "automatically labeled data did not help; in fact, it actually hurt ASR accuracy … quality trumps quantity" (Mostow 2012, above). Small amounts go far for alignment: 13 min of labelled child alignments matched existing aligners, and 45–60 min improved on them (Kadambi 2025). Fine-tuning plus prompting tiny.en on children's read speech cut WER from 19.5 to 6.9 (Smith et al. 2025, earlier doc). Caveat: DIBELS marks aren't verbatim transcripts; insertions and repetitions go unlabelled by design (ADR-0008).
- **COPPA** (applies to operators collecting from under-13s):
  - The FTC treats audio files containing a child's voice as personal information. The amended rule (published 22 April 2025) adds an audio-file exception at § 312.5(c)(9) that requires the operator to delete the file "immediately after responding to the request for which [it was] collected". It adds a separate verifiable parental consent for disclosure to third parties, and requires a written data-retention policy. https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule
  - Schools may consent for parents only when data is collected "solely for the benefit of students and the school system" with no other commercial purpose. https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions (FAQ sections N and F; paraphrased by a fetch tool, so check the wording before relying on it).
  - FTC/DOJ v. Amazon (2023, $25M): "COPPA does not allow companies to keep children's data forever for any reason, and certainly not to train their algorithms". The order prohibits using children's voice information subject to deletion requests "for the creation or improvement of any data product". https://www.ftc.gov/news-events/news/press-releases/2023/05/ftc-doj-charge-amazon-violating-childrens-privacy-law-keeping-kids-alexa-voice-recordings-forever
- **FERPA.** Under the school-official exception the provider must be "under the direct control of the school or district" and use records "only for authorized purposes". Properly de-identified data, or metadata stripped of identifiers, may be used "to create new products". PTAC 2014, https://studentprivacy.ed.gov/sites/default/files/resource_document/file/Student%20Privacy%20and%20Online%20Educational%20Services%20(February%202014)_0.pdf. Inferred: a child's voice recording is hard to de-identify, so treat audio as PII.
- Inferred for this local-first app: nothing leaves the device today, which keeps it outside most of this. Any "donate corrected readings" feature would need a school agreement naming training as an authorised purpose, parental consent for disclosure, a retention limit, deletion on request, and legal review. Treat it as a separate project.

## Gaps / could not verify

- No published word-boundary error (ms) for any forced aligner, or for Whisper DTW, on 6–11-year-olds reading aloud. Child aligner results found are phone-level for ages 3–6.
- No published accuracy for Whisper **tiny/base** word timestamps at all; published comparisons use large-v2. The 444 ms lag is from one adult TTS clip in our pipeline. It may be specific to transformers.js or this export, and needs checking on real recordings (and against openai/whisper's own `word_timestamps`).
- wav2vec2-base-960h WER on English children's read speech not found. Its errors become spurious skips in the aligner (§3.3 "camp").
- No browser (Chrome WASM) timing on a Chromebook for wav2vec2; the Celeron figure is inferred from M1 Pro WASM timings.
- Amira: no primary technical documentation on its miscue-detection accuracy.
- The FTC COPPA FAQ wording was read through a summarising fetch tool; the Federal Register text is the authority.
