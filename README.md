# Growing Reader

A local-first web app a reading interventionist hands to a student on a Chromebook. The student reads a printed passage aloud; the app records, works out the reading rate (passage words ÷ time), and tracks each student's rate over time. Vocabulary is in `CONTEXT.md`; the two load-bearing decisions are in `docs/adr/`; the spec is `.scratch/reading-fluency/spec.md`.

## Develop

```sh
npm install
npm run dev        # Vite dev server
npm test           # Vitest: whole app through the UI with fake adapters + analysis unit tests
npm run check      # svelte-check
npm run build      # static site in dist/
```

## Passages from a file

A passage can be typed out or read out of a file — PDF or plain text. On the Passages screen, **Add passage** offers both, dropping files anywhere on the page works, and the empty state is itself a drop target. Several files at once open a list to check in one pass: each row carries an editable title and its estimated count, files that could not be read say why, and one button saves the batch. A single file opens the full editor, where a heading can be taken out of the text. Review's passage picker offers the same two ways in — type one out, or import one — so the choice is always made before the form opens rather than inside it.

Extraction is best effort and local: the words and their order come across, the layout does not, so the word count is labelled an estimate to check against the paper copy. Headings, page numbers and worksheet instructions come in as words, and the word count is what divides into the time to give the rate, so the check matters. The text is also what identifies a reading and confirms the student reached the end (ADR-0002), which extracted text is good enough for.

The extracted text *is* the passage (ADR-0005): the file itself is not stored, only its name, and **View text** shows what the app read. A file over 5,000 words is refused — a passage's text travels to the Google Sheet in a single cell, and a cell holds 50,000 characters.

pdf.js reads a PDF's text layer; it does not do OCR, so a scan or a photograph of a page holds nothing to take. Rather than refusing, the app says so and offers the way round: copy the instructions in `public/extract-passage.md`, paste them into ChatGPT, Claude or Gemini with the file attached, and drop the Markdown that comes back onto the instructions themselves — while they are open they take a drop anywhere on the window. The instructions ask for a `.md` whose first line is `# Passage title`, because an assistant cannot always name a file: that heading becomes the passage's title and is kept out of the word count, so the file can be called anything. They also tell an assistant that cannot attach files (Gemini) to return one Markdown code block and say so, rather than promising a download that never arrives. The same route is offered for formats the app does not open (`.docx`, `.pages`, images), which is why the file picker offers them at all — a teacher with a `.docx` gets an explanation rather than a greyed-out file. Those instructions are strict about what to leave out (headings, page numbers, name and date lines, comprehension questions), because every stray word changes the rate.

## Google Sheets sync

The cloud button in the top bar, or **Settings → Google Sheets**, creates a spreadsheet with Summary, Students, Readings, and Passages tabs. The browser remains the editor and pushes changes automatically. The sheet includes roster details, passage text, reading statistics, notes, and transcript text; audio recordings never leave the device.

Sign-in and Drive authorization use the broker at `https://auth.teacher.dev`. The broker keeps the refresh token and gives the browser short-lived access tokens; the browser writes directly to the Sheets API with the narrow `drive.file` scope. Set `VITE_AUTH_BROKER_URL` to use another broker. `VITE_CF_BEACON` is an optional Cloudflare Web Analytics token and should be configured in the production deployment only.

For a local click-through without Google, run these in separate terminals:

```sh
npm run mock-broker
VITE_AUTH_BROKER_URL=http://localhost:8787 VITE_FAKE_GOOGLE=true npm run dev
```

The local broker opens a fake Google consent screen and the fake Sheets adapter keeps created sheets in memory.

## Layout

- `src/domain/` — types and derivations (rate, words correct per minute, roster parsing).
- `src/analysis/` — pure functions: word counting, silence trimming, passage identification, restart-forgiving alignment for completion and timing. Unit-tested with fixtures; every threshold is a guess until tuned on real recordings.
- `src/adapters/` — the device and network seams, each with a real adapter and a fake:
  - `storage/` IndexedDB (audio stored as raw Float32) / in-memory
  - `microphone/` getUserMedia + AudioWorklet at 16 kHz / scripted fake
  - `transcriber/` Web Worker running whisper-tiny.en (timestamped export, q8, WASM) via transformers.js / canned fake
  - `documents/` reading a passage out of a file the teacher chose: PDF through pdf.js (lazy chunk, bundled worker) and plain text / canned fake
  - `sheets/` auth-broker client, Google Sheets transport, report serializer / in-memory fake
- `src/app/store.svelte.ts` — the App: state, actions, microphone session, analysis queue.
- `src/app/routes.ts` — the path ↔ screen mapping; the teacher's screens have addresses, the student-facing three do not (ADR-0006).
- `src/ui/` — screens, plus the shared pieces: `PassageImportList` (checking a batch of files before saving), `PassagePreview` (the extracted text, read-only), `LostReadingBanner`, `Waveform` (review: peaks with the start and end handles the teacher drags over them), `LiveWaveform` (start/recording: the microphone level scrolling by), `PassagePicker` (step one of handing over), `Modal`, `BottomNav`. Student-facing screens (Start, Recording, Done) have no navigation; everything else, including a student's page, is the teacher's.
- `src/test/harness.ts` — renders the whole app with fakes; the primary test seam.

## Deploying (not done here)

The build is a static site. Things whoever deploys should know:

- Add the production site origin to the auth broker's app-origin allowlist before enabling Google Sheets sync.
- The speech model (~41 MB) is fetched from the Hugging Face Hub on first launch and cached by transformers.js in the Cache API; the ONNX runtime WASM (~23 MB) ships in `dist/`. `public/sw.js` caches the app shell for offline use. The app otherwise makes network calls only when optional Google Sheets sync is connected.
- Multithreaded WASM needs cross-origin isolation headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`). That roughly halves transcription time on a 4-core device and does nothing on a 2-core Celeron. Transcription time on the target Chromebook is unmeasured (estimate 1–3 min per 90 s reading); the UI never waits on it.
- pdf.js is a lazy chunk (~430 kB) plus its worker (~1.3 MB). `public/sw.js` caches on use, not on install, so the first PDF import has to happen online; precache those two assets if teachers need to import offline on day one.
- `vercel.json` rewrites every path to `/index.html`. The app's screens are real URLs (ADR-0006), so without that rewrite — or its equivalent on another host — a hard load of anything but `/` is a 404.
- Managed-Chromebook storage policy (ephemeral mode, per-student profiles) may wipe IndexedDB; that is what the backup export is for and it must be checked on the real device.

## Manual smoke check (the real model)

The automated suite never runs the real model. On a real device: open the app (the model downloads silently; Settings shows its progress, and only a failure is announced on the roster), record a reading, unlock, and confirm the "What the app heard" card on the review screen fills in and the timing line under the waveform switches to "first word to last word".
