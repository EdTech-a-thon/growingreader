---
status: accepted (builds on ADR-0002 and ADR-0005); superseded by ADR-0010 in how marks are made — the DIBELS rules stand, now applied to a reviewed transcript
---

# The teacher marks errors on the passage's words, by DIBELS 8 rules; the app never detects them

Teachers asked for accuracy and words correct per minute more than anything else. Our research (`docs/research/error-rate-accuracy-fillers.md`) found a browser-sized model detects substitution miscues at F1 .178 with most real errors missed, and the commercial products that automate it rely on server-side models trained on proprietary child speech and still have a person review the result. So the numbers come from **marking**: after the reading, the teacher listens back and taps the passage's own words, following the DIBELS 8 ORF scoring rules (Administration and Scoring Guide, 2023, pp. 76–80), which interventionists already use on paper. An error mark is DIBELS's slash, whatever went wrong; a self-correction within three seconds counts as correct; insertions and repetitions are not marked because DIBELS ignores them; a skipped line is an error on every word in it. Accuracy is (word count minus errors) over word count, and words correct per minute is (word count minus errors) over the time spent reading.

## Considered options

- **Mark on the transcript, correcting the app's draft** (Microsoft Reading Progress's model): turns the teacher's job into fixing a transcript ADR-0002 already judged too unreliable to count from, and anchors the teacher to its mistakes.
- **Mark on a rendered PDF of the student's page**: looks like the paper, but reverses ADR-0005, exists only for PDF imports, and needs pdf.js positions mapped back to passage words that everything else counts from.
- **Running-record rules** (insertions counted, error types required, cueing analysis): more detail, but slower per error, not what the timed-fluency teachers asking for this use, and the cueing analysis is contested.
- **Passage words, DIBELS rules** (chosen): works for typed, pasted and imported passages alike, keeps the stored line breaks as the layout, and matches the paper practice mark for mark.

## Consequences

- Marking is optional; rate needs none. A reading is **marked** only when the teacher finishes marking, so a marked reading with no marks (no errors) differs from an unmarked one. Only complete readings can be marked, because accuracy assumes every word was attempted (ADR-0001); skipped words on the way to the end are errors, stopping early is incompleteness.
- An error type (substitution, omission, hesitation) may be added to an error mark but is never required and never changes the count, so marking stays one tap per error as on paper.
- The rules are DIBELS's, the format is not: readings are whole passages, not 60 seconds (ADR-0001), so words correct per minute is not a DIBELS score and must not be compared to DIBELS benchmarks.
- Marking gets only playback while listening. A follow-along highlight from transcript timestamps is a possible later experiment; hints on words the transcript thinks were missed are out, since they are the transcript scoring the student by another name, and reversing that reverses ADR-0002.
- Marks point at word positions in one passage version, which is why passages became immutable versions (ADR-0007).
