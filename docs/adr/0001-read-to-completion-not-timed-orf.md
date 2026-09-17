---
status: accepted, amended by ADR-0004 (readings are complete by default)
---

# Read-to-completion instead of the 60-second timed read

Standard oral reading fluency assessment stops the student at 60 seconds and counts the words reached, which requires knowing where in the passage the student was when time ran out — a speech-recognition and alignment problem that is unreliable on young struggling readers (zero-shot Whisper tiny.en WER ≈ 61% on ages 6–11; see `docs/research/in-browser-asr-for-orf.md`). We instead have the student read the whole passage and measure how long it took; rate = passage words / time. The passage word count is known, so the only measurement is a duration.

## Considered options

- **60-second timed read**: norm-referenced (comparable to published grade-level benchmarks) but the headline number depends on ASR accuracy.
- **Read-to-completion** (chosen): not comparable to published norms, but the teacher's stated goal is each student's progress over time, for which a consistent number matters more than a norm-referenced one.

## Consequences

- Every stored rate assumes the whole passage was read. An incomplete reading has no rate; it is either marked complete by the teacher or discarded. (ADR-0004: readings start out complete and are only thrown into doubt when the app heard the student stop early.)
- Rates are comparable across readings of the same passage; a change of passage is marked on the chart because difficulty changes the number.
- Switching to the timed protocol later would make previously stored rates incomparable with new ones.
