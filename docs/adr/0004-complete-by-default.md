---
status: accepted (amends ADR-0001)
---

# A reading is complete by default; the app withdraws that only when it heard the student stop early

ADR-0001 left every reading "pending" until the teacher marked it complete, so no rate existed and nothing reached the chart without a review tap. In use that tap was the same for almost every reading, and the teacher asked for Complete to be checked unless there was a reason not to. So a reading now starts complete: with a passage chosen at hand-over it has a rate the moment Done is tapped. When the transcript alignment later says the student probably stopped early, the app withdraws the default — the reading goes to "pending", the rate disappears and the review screen asks her to listen and decide — but only while she has not touched the completion herself; once she taps Complete or Incomplete her choice stands whatever the analysis says.

## Consequences

- A rate can be stored and charted for a reading nobody has reviewed. The trade accepted here is that a false-complete slips through only when the transcript failed to notice a short reading, whereas the previous rule cost a tap per reading for every teacher every time.
- "Pending" now means "the app doubts this one and the teacher has not said", so the roster's "awaiting review" is a real to-do, not the default state of every new reading.
- The teacher's choice is recorded separately from the state itself (`completionConfirmed`) so a late-arriving analysis, or a change of passage, never overrides her.
