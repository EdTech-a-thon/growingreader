---
status: accepted, amended by ADR-0003 (an estimate is shown on review only)
---

# The transcript identifies the passage and confirms completion; it never produces a number

The app runs whisper-tiny.en in the browser to get a rough transcript of each reading. Published results on child speech (tiny.en WER ≈ 61% on ages 6–11, and Whisper omits a third of misread attempts; see `docs/research/in-browser-asr-for-orf.md`) mean a word count derived from that transcript would carry unquantified error larger than the month-to-month progress the teacher is looking for. So the transcript is used only for jobs that tolerate a bad transcript: matching against the teacher's stored passages to identify which one was read, aligning against that passage to confirm the student reached the end, and tightening the start/stop times from word timestamps. The displayed rate always comes from the identified passage's word count and the measured duration, never from the transcript. When no passage matches, the app shows no number at all rather than an estimate.

## Considered options

- **Passage-agnostic word count from the transcript**: zero configuration, but the number's error bound is unknown and larger than the signal.
- **No speech recognition; teacher always sets the passage**: exact and simple, but adds a per-reading step the teacher must not be forced into.
- **Transcript as helper only** (chosen): same model and download as the first option, but the number is exact whenever a passage is known, and the common case needs no per-reading configuration once passages are pasted in.

## Consequences

- The app must be fully usable when the model fails to load: the teacher can always pick or paste the passage by hand.
- Adding a transcript-derived word count to the UI later, even labelled as an estimate, reverses this decision and should be treated as such.
