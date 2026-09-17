---
status: accepted (amends ADR-0002)
---

# The review screen shows an estimated rate from the transcript when no exact rate exists

ADR-0002 kept every transcript-derived number off the screen because whisper-tiny.en's error on child speech is unquantified. In use, a reading with no passage assigned yet (the common first-day case, or a passage the teacher has not pasted) showed nothing at all, and the teacher asked for the rough number back. So the review screen now shows `≈N words per minute, estimated` — transcript word count over the active duration — but only while no exact rate exists: no passage, or a passage but not yet marked complete. The estimate is visibly marked, sits next to the prompt for getting the exact rate, and goes nowhere else: the roster summary, the chart, the readings table and the CSV still use only the passage-backed rate, and an incomplete reading still shows no number (ADR-0001).

## Consequences

- `rate()` is unchanged; the estimate is a separate derivation (`estimatedRate`) that the review screen alone calls. Anything that persists or charts a transcript-derived number reverses this decision, not ADR-0002.
- The exact rate must remain one tap away on the same screen (choose passage, mark complete), so the estimate never becomes the number the teacher settles for.
