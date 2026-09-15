# Reading Fluency — local-first oral reading rate tracker

Status: ready-for-agent

Glossary: `CONTEXT.md`. Decisions: `docs/adr/0001`, `docs/adr/0002`. Research: `docs/research/in-browser-asr-for-orf.md`.

## Problem Statement

A reading interventionist works with dyslexic students using phonics-based printed passages. She wants to track each student's oral reading rate over time so she and the student can see improvement. Today she does this by hand with a stopwatch and a pencil, listening to every reading live. She wants to hand a student a Chromebook and a sheet of paper, let them read on their own, and get a rate back — with as little setup on her side as possible, ideally none per reading. She has explicitly said an approximate rate is fine and accuracy scoring is optional; progress over time is what matters. Student recordings must not leave the device.

## Solution

A local-first web app installed on the teacher's Chromebook. The teacher taps a student's name (and optionally a passage), hands the device over. The student taps Start, reads the printed passage aloud, taps Done, and hands the device back. The app records the audio, measures how long the reading took, and — in the background — produces a rough transcript that it uses only to work out which of the teacher's stored passages was read, whether the student reached the end, and where speech actually started and stopped. The rate is always the known passage word count divided by the reading time (ADR-0001); the transcript never produces a number (ADR-0002). On handback the teacher reviews the reading: plays it back, confirms or changes the passage, marks it complete or discards it, optionally enters an error count. Each student has a chart of rate over time. All data stays in the browser's storage on that device, with export/import for backup.

## User Stories

### Setup
1. As a teacher, I want to paste my roster one name per line, so that I don't type students in one at a time.
2. As a teacher, I want the app to split each pasted line into first and last name on the first space, so that names display consistently without extra fields.
3. As a teacher, I want to add a single student later, so that a mid-year arrival doesn't require re-pasting.
4. As a teacher, I want to archive a student, so that a student who left disappears from the pick list without losing their readings.
5. As a teacher, I want to paste a passage's title and text and have the app count its words, so that I never count words by hand.
6. As a teacher, I want to see the computed word count next to each passage, so that I can sanity-check it against the paper.
7. As a teacher, I want to edit or delete a passage, so that a paste mistake is fixable.
8. As a teacher, I want the app to warn me when a pasted passage is near-identical to one I already have, so that I don't create duplicates that confuse identification.
9. As a teacher, I want the app to work with zero passages stored, so that I can start recording on day one and set passages up later.
10. As a teacher, I want the app to download its speech model once, with a progress bar, so that I know the first launch is doing something and later launches are instant.
11. As a teacher, I want every screen to work if the speech model never loads, so that a failed download or an unsupported device never blocks a reading.
12. As a teacher, I want the app installable and usable offline after first load, so that a wifi outage in the classroom doesn't matter.

### Handing the device to a student
13. As a teacher, I want to tap a student's name and immediately be on the start screen, so that handing over takes two seconds.
14. As a teacher, I want to optionally tap the passage before handing over, so that when I know what they're reading the review is already done.
15. As a student, I want to tap my own name if the teacher hasn't, so that I can start without waiting for her.
16. As a teacher, I want the start screen to show a live microphone level meter, so that a muted or broken mic is obvious before the student starts.
17. As a student, I want the Start button to be disabled until the mic has picked up sound, so that I can't record ninety seconds of silence by accident.
18. As a student, I want a large, obvious Start button and a large, obvious Done button, so that I don't have to search the screen while holding my paper.
19. As a student, I want to see that recording is happening (a simple indicator, no timer), so that I know it's working without being distracted by a clock.
20. As a student, I want tapping Done to show a friendly "Nice work — hand it back" screen with no numbers, so that I'm not judged by a provisional result.
21. As a student, I want nothing else reachable from the Done screen, so that I can't accidentally open other students' data.
22. As a teacher, I want to unlock the Done screen with a long-press, so that a student can't casually get past it but I don't have to remember a PIN.
23. As a teacher, I want the app to keep the recording if the tab is backgrounded or the screen dims during a reading, so that a Chromebook power-saving nap doesn't lose the reading.
24. As a teacher, I want the app to treat a reading whose tab was closed before Done as lost with a clear message on next open, so that I know to redo it rather than wonder.

### Reviewing a reading
25. As a teacher, I want to see the recording's playback and elapsed time the instant I unlock, so that I never wait on processing.
26. As a teacher, I want the app to identify which of my passages was read, so that the common case needs no input from me.
27. As a teacher, I want the app to show me its top two or three candidates when it isn't sure, so that resolving ambiguity is one tap.
28. As a teacher, I want to change the identified passage to any stored passage, so that a wrong identification is a one-tap fix.
29. As a teacher, I want to paste a new passage directly from the review screen and have it assigned to this reading, so that a first-time passage doesn't send me to a settings page.
30. As a teacher, I want a reading with no passage to show "choose a passage to get a rate" and no number, so that I'm never shown a rate that isn't real.
31. As a teacher, I want the app to tell me when it thinks the student didn't reach the end of the passage, so that I can check instead of trusting a short time.
32. As a teacher, I want to mark a reading complete or incomplete myself, overriding the app, so that my ear wins over the transcript.
33. As a teacher, I want incomplete readings to have no rate and stay off the chart by default, so that partial reads never look like regressions or improvements.
34. As a teacher, I want to discard a reading, so that a false start or a wrong student doesn't pollute the record.
35. As a teacher, I want to re-record immediately from the review screen for the same student and passage, so that a discarded reading costs one tap to redo.
36. As a teacher, I want to see the rate in words per minute once the passage is known and the reading is complete, so that I have the number I actually came for.
37. As a teacher, I want to optionally enter the number of errors I heard, so that I get words correct per minute without a second tool.
38. As a teacher, I want the errors field to be optional and blank by default, so that skipping accuracy costs nothing.
39. As a teacher, I want to see the reading's transcript-refined start and stop alongside the raw tap-to-tap time, so that I can tell when the refinement is wrong.
40. As a teacher, I want to reset the timing to tap-to-tap if the refinement looks wrong, so that a bad trim is reversible.
41. As a teacher, I want the review screen to update itself when background processing finishes, so that I don't have to refresh or re-open it.
42. As a teacher, I want a queue of readings still being processed, so that I can hand the device to the next student while the last reading is still being analysed.
43. As a teacher, I want to add a short note to a reading, so that "was sick today" or "new glasses" travels with the number.

### Progress over time
44. As a teacher, I want each student to have a chart of rate against date, one point per complete reading, so that I can see the trend at a glance.
45. As a teacher, I want passage changes marked on the chart, so that a drop after moving to a harder passage isn't read as regression.
46. As a teacher, I want same-day readings to appear as separate points, so that repeated reading within a session is visible.
47. As a teacher, I want to tap a chart point to open that reading, so that the chart is a way into the recordings.
48. As a teacher, I want to show a student their own chart from my screen when I choose to, so that they can see they are improving at a moment I pick.
49. As a teacher, I want a list of all readings for a student with date, passage, time, rate, and completion state, so that I can review the record in a table when a chart isn't enough.
50. As a teacher, I want words correct per minute shown as a second series when I've entered errors, so that accuracy trends sit next to rate.

### Data ownership
51. As a teacher, I want every recording to stay on this device and never be uploaded anywhere, so that I don't need a data-sharing conversation with my district.
52. As a teacher, I want to delete the audio of any reading while keeping its rate, so that I can drop recordings I no longer need to hear.
53. As a teacher, I want to export a backup of roster, passages, and readings (without audio) as a single file, so that a re-imaged Chromebook doesn't erase the year.
54. As a teacher, I want to import that backup on another device, so that moving machines is possible.
55. As a teacher, I want to export readings as a CSV, so that I can put them in the spreadsheet I already use.
56. As a teacher, I want to export a single reading's audio on demand, so that I can share one recording with a parent or colleague deliberately.
57. As a teacher, I want the app to remind me to export a backup when it's been a while, so that I don't discover I needed one too late.
58. As a teacher, I want to see how much storage the app is using, so that I know when to delete old audio.

## Implementation Decisions

### Stack
- Svelte 5 with Vite as a plain single-page app (no SvelteKit). Deployment is out of scope; the build output is a static site.
- Data in IndexedDB via a thin repository interface; audio stored as raw PCM blobs alongside reading records.
- Speech model: whisper-tiny.en, the timestamped ONNX export, q8 weights, run through transformers.js on the WASM backend inside a Web Worker. WebGPU is feature-detected and used opportunistically only if the timestamped q8 decoder is confirmed to run on it; WASM is the design target. Model files cached via the Cache API on first launch.
- Audio capture: an AudioWorklet buffers raw 16 kHz mono Float32 samples for the whole reading (about 6 MB for 90 s). No MediaRecorder, no Opus, no WebM. Elapsed times are derived from sample counts, never from wall-clock.

### Domain model
- Student: display name, first/last split from the pasted line on the first space, archived flag.
- Passage: title, text, word count. Word count excludes the title, splits on whitespace, strips punctuation, and counts a hyphenated token as one word. Stored text is kept verbatim as pasted.
- Reading: student, optional passage, recorded date-time, raw audio, tap-to-tap duration, silence-trimmed bounds, transcript-refined bounds (each stored separately), active timing choice, transcript with word timestamps (if produced), passage identification result (candidates with scores), completion assessment (app's) and completion state (teacher's: pending / complete / incomplete / discarded), optional error count, optional note.
- Rate is derived, never stored: passage word count / active duration, only when passage is set and completion state is complete. Words correct per minute likewise, only when errors is set.

### Reading lifecycle
- Start screen requires a selected student. Start is enabled only after the level meter observes signal above the noise floor.
- Tap Start begins buffering; tap Done stops buffering, persists the reading immediately with tap-to-tap duration, shows the locked Done screen, and enqueues analysis.
- Analysis runs in the worker, one reading at a time, in three stages, each persisted as it completes so the review screen can show partial results: (1) silence trimming from the raw amplitude distribution of the whole recording (global calibration, hysteresis, no realtime constraint); (2) transcription with word timestamps; (3) if any passages are stored, identification and alignment.
- Identification: transcript scored against every stored passage. The score is a normalised alignment similarity (Levenshtein-style over word tokens). Auto-assign when the top score clears an absolute floor and beats the runner-up by a margin; otherwise present the top three as candidates. Thresholds are constants tuned against real recordings and expected to change.
- Completion assessment: the transcript is aligned against the assigned passage with a dynamic-programming aligner that forgives restarts (backward matching, per the ORF literature). The last aligned reference word gives "reached word N of M". Below a coverage threshold the app flags the reading as probably incomplete. The teacher's completion state is authoritative and defaults to pending until she reviews.
- Timing refinement: when alignment succeeds, first-aligned-word start and last-aligned-word end become the transcript-refined bounds. The active timing defaults to the most refined available (transcript > silence-trim > tap-to-tap); the teacher can switch to any of them.
- The passage can be set at any time: before recording (pre-selected), by identification, or on review. Setting it after analysis re-runs only the alignment stage.
- Discard keeps nothing but a tombstone so the queue and lists stay consistent.

### Screens
- Roster (teacher home): student list with last-reading summary; tap to open student; paste/add/archive.
- Student: chart and readings list; "Show progress" full-screen mode intended to be turned toward the student.
- Start (student-facing): student name, optional passage, level meter, Start.
- Recording (student-facing): indicator and Done.
- Done (student-facing): friendly message; long-press to unlock to review.
- Review: playback, timing (with the three candidate bounds), passage (auto / candidates / choose / paste new), completion, errors, note, discard, re-record.
- Passages: list, paste, edit, delete, near-duplicate warning.
- Settings: model status and re-download, storage usage, export/import backup, CSV export, backup reminder.

### Boundaries
- No network calls after the model is cached. No analytics, no auth, no server.
- Audio never leaves the device except by explicit per-reading export.
- The transcript is never shown as a headline and never yields a displayed word count (ADR-0002). It may be shown in a collapsed "what the app heard" panel on review for debugging identification; this is optional and can be removed.

## Testing Decisions

A good test drives the app the way the teacher or student would and asserts on what they'd see or on what ends up in storage, with the device boundaries faked. Tests must not assert on internal state, worker messages, or component structure.

### Seams (proposed — confirm)
The app has three device boundaries, each behind an injected adapter: **Microphone** (level meter and sample buffering), **Transcriber** (the worker running the model), and **Storage** (IndexedDB). The primary seam is the whole app driven through its UI with all three faked: a Microphone fake that plays a fixture sample buffer, a Transcriber fake that returns a canned transcript with timestamps, and an in-memory Storage. This one seam covers every user story above.

One secondary seam, justified because the logic is algorithmic and needs many cases: the **analysis module** (silence trimming, word counting, passage identification scoring, alignment/completion, timing refinement) is pure functions from data to data and gets direct unit tests with fixture transcripts and hand-labelled expected outcomes. Fixtures should include: clean read, read with restarts and sounding-out, read that stops at 70%, transcript at ~50% WER, two near-identical passages, empty passage list.

The real Transcriber is exercised by a single manual smoke check on a real Chromebook with a real recording, not by the automated suite; the model's output is not deterministic enough to assert on.

### Prior art
None; the repo is empty. The suite establishes the convention: Vitest, Svelte component testing through the DOM, fake-indexeddb for the Storage adapter's own contract tests.

## Out of Scope

- Any transcript-derived word count, labelled or not (ADR-0002).
- The 60-second timed protocol and grade-level norm comparisons (ADR-0001).
- Automatic error/miscue detection; accuracy is a hand-entered count.
- Pause/hesitation metrics (available as a byproduct of silence detection; not surfaced in v1).
- Shipping any passages with the app (copyright unknown); the teacher pastes her own.
- Cloud sync, multi-device, accounts, sharing between teachers.
- Student-facing results at Done time; the student sees a chart only when the teacher shows it.
- On-screen passage display for the student (she reads from paper).
- Deployment, hosting, domain.
- iPad support beyond "not deliberately broken".
- Managed-Chromebook storage policy (ephemeral mode, per-student profiles); to be debugged with the teacher on a real device.

## Further Notes

- Every threshold in identification, completion, and silence trimming is a guess until tuned on this teacher's real recordings. The first milestone after a working recording loop should be collecting a handful of real readings (with her consent) and tuning against them.
- Transcription time on a 2-core Celeron in single-threaded WASM is unmeasured; the research estimate is 1–3 minutes per 90 s reading. The review screen is designed so that this latency is never on the critical path. If it turns out to be much worse, the model can be swapped for moonshine-tiny (no timestamps, so timing refinement would be lost) without touching anything above the Transcriber adapter.
- Multithreaded WASM needs cross-origin isolation headers; whoever deploys should know that setting them roughly halves transcription time on a 4-core device and does nothing on a 2-core one.
- Passage word count semantics (title excluded, hyphens as one word) should be stated on the passage screen so the teacher's paper count and the app's agree.
