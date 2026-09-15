# Reading Fluency

A local-first web app a reading interventionist hands to a student on a Chromebook. The student reads a printed passage aloud; the app records, works out the reading rate (passage words ÷ time), and tracks each student's rate over time. Vocabulary is in `CONTEXT.md`; the two load-bearing decisions are in `docs/adr/`; the spec is `.scratch/reading-fluency/spec.md`.

## Develop

```sh
npm install
npm run dev        # Vite dev server
npm test           # Vitest: whole app through the UI with fake adapters + analysis unit tests
npm run check      # svelte-check
npm run build      # static site in dist/
```

## Layout

- `src/domain/` — types and derivations (rate, words correct per minute, roster parsing).
- `src/analysis/` — pure functions: word counting, silence trimming, passage identification, restart-forgiving alignment for completion and timing. Unit-tested with fixtures; every threshold is a guess until tuned on real recordings.
- `src/adapters/` — the three device seams, each with a real adapter and a fake:
  - `storage/` IndexedDB (audio stored as raw Float32) / in-memory
  - `microphone/` getUserMedia + AudioWorklet at 16 kHz / scripted fake
  - `transcriber/` Web Worker running whisper-tiny.en (timestamped export, q8, WASM) via transformers.js / canned fake
- `src/app/store.svelte.ts` — the App: state, actions, microphone session, analysis queue.
- `src/ui/` — screens. Student-facing screens (Start, Recording, Done, Progress) have no navigation.
- `src/test/harness.ts` — renders the whole app with fakes; the primary test seam.

## Deploying (not done here)

The build is a static site. Things whoever deploys should know:

- The speech model (~41 MB) is fetched from the Hugging Face Hub on first launch and cached by transformers.js in the Cache API; the ONNX runtime WASM (~23 MB) ships in `dist/`. After that the app makes no network calls. `public/sw.js` caches the app shell for offline use.
- Multithreaded WASM needs cross-origin isolation headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`). That roughly halves transcription time on a 4-core device and does nothing on a 2-core Celeron. Transcription time on the target Chromebook is unmeasured (estimate 1–3 min per 90 s reading); the UI never waits on it.
- Managed-Chromebook storage policy (ephemeral mode, per-student profiles) may wipe IndexedDB; that is what the backup export is for and it must be checked on the real device.

## Manual smoke check (the real model)

The automated suite never runs the real model. On a real device: open the app, watch the model download on the Roster, record a reading, unlock, and confirm the transcript panel on the review screen fills in and the "First to last word" timing appears.
