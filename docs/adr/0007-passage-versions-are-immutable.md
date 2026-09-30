---
status: accepted
---

# Passages keep an immutable history of versions; a reading belongs to the version it read

Marking (ADR-0008) pins the teacher's judgements to word positions in the passage, so editing a passage's words in place would leave every mark after the edit pointing at the wrong word. In-place edits were already wrong for the rate: `rate()` divides by the passage's current word count, so fixing a stray heading in an imported passage silently rewrote the rate of every earlier reading of it. We now treat a passage as a series of passage versions that are never changed or deleted. A reading records the version the student read, and its rate, errors, accuracy and marks all come from that version's words and word count.

## Considered options

- **Lock a passage's words once any reading of it is marked**: simple, but the teacher has to save a copy as a new passage to fix a typo, which splits one passage's history in two on the chart.
- **Edit in place and remap marks**: keeps one passage, but remapping is fragile exactly where it matters (repeated words, reordered sentences) and still leaves past rates rewritten.
- **Edit in place and drop affected marks**: loses the teacher's work.
- **Immutable versions** (chosen): the teacher edits freely; history protects the readings.

## Consequences

- A new version is made only when the sequence of words changes *and* some reading already uses the current version. Title, line-break and spacing edits apply in place, since they move no word positions; fixing an imported passage's extracted text before its first reading does not pile up versions.
- Only the latest version is identified, picked and handed to students. An older version can be restored, which makes a new latest version with its words.
- The progress chart marks a version change the way it marks a change of passage (ADR-0001), since the app cannot tell a typo fix from a rewrite.
- Backups carry every version. The Google Sheet's Passages tab has one row per version, and each Readings row names the version read.
- Existing readings migrate onto a first version holding their passage's current text, so no displayed rate changes at migration. A reading whose passage was edited after it was recorded keeps the already-rewritten rate; the words it was actually read against were never stored and cannot be recovered.
