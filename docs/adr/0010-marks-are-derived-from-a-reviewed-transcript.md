---
status: accepted (supersedes ADR-0008's "marks never come from the transcript" and ADR-0009; amends ADR-0002)
---

# Marking is reconstructing the reading against the passage; the marks are derived from it

If we knew exactly what was said, and when, every DIBELS 8 mark would follow mechanically. So marking is not the teacher judging errors word by word. It is the teacher settling **what was said** and the app applying the rules.

**What was said** is the heard words: the recogniser's words, placed in the recording by forced alignment (wav2vec2-base-960h, character CTC, 95 MB, Apache-2.0, in a worker), since the recogniser's own timestamps run a quarter-second or more late. Every heard word is placed, with no skipping, so a misheard word ("Salmon") stretches over the speech it was heard in ("Sam and"). They are the gutter under the waveform, and it must always be the most faithful record of the reading we can make. The recogniser's own words and times are kept untouched beside them.

Each passage word is matched to a heard word that is exactly it, only ever moving forward (the restart-tolerant `align.ts`). A matched word was read correctly and is green, and it takes its heard word's time. A short run of matches deep inside unmatched text (fewer than 3, with 5 or more unmatched passage words on both sides) is a coincidence, not the reading. The unmatched passage words form **spots**, highlighted yellow on the passage and in the gutter. A spot's audio runs from the end of the heard word before it to the start of the one after, and that one definition drives the waveform shade, the yellow words, and what plays.

The teacher settles each spot by ear. Tapping a spot plays exactly its stretch and stops, the same every time; tapping a word that was read plays from it to the end of its sentence, and the stretch is shaded so it is plain where it will stop. What to do follows from what the child said against what the recogniser wrote:

| Child said ↓ / recogniser wrote → | the passage word, P | something else, Y | nothing |
|---|---|---|---|
| **P** | Green. Nothing to do. | Misheard ("Salmon" for "Sam and"): **Said the passage**, green. | Missed: **Said the passage**, green. |
| **X, another word** | Hidden: "corrected" to the passage ("dock" for "duck"). Tap the green word, **the pencil** (type what was said), red. | Y is X: **Heard it right**, red. Y is not X: **the pencil** (type what was said), red. | **the pencil** (type what was said), red. |
| **Nothing** | Hidden: made up. Tap the green word, **Nothing was said**, red (omission). | **Nothing was said**, red (omission). | A skip: **Nothing was said**, red (omission). |

The two hidden cells are why a green word can be picked and settled too. A spot partly read ("Sam" read, "and" not) is edited to exactly what was said: what matches turns green, the rest red. Settling never moves on to the next spot by itself; Tab does. The passage is matched again after every change. Heard words between passage words read in order (a repeat, a restart, a self-correction) are grey and count for nothing. The gutter stays for timing: drag a word or its edges to where it was said (the mumble before "the"), which the app never moves after, or tap a gap to add a word.

Nothing is shown until what was heard is placed in the audio, so no word moves after it appears. Meanwhile a checklist shows the real stages: writing down what was said, getting word timing ready, finding when each word was said.

The screen is full width, in two columns, with the marks so far (errors, spots to check) at the top right. On the right are the playback controls with the whole reading in miniature, and under them the whole passage, line breaks as printed; tapping a word picks its sentence and plays it. On the left is the work: the recording (a few seconds scrolling past a playhead a third of the way in, so more of what is coming shows than of what has gone; the sentence bracketed; stretches still to repair striped like roadworks; the gutter of heard words), and under it the sentence card, where the repair happens. The sentence is marked as on the passage; tapping a stretch highlighted yellow plays just it, and dragging across a phrase picks the whole phrase to settle together. Two choices, "Said the passage" and "Heard it right" (or "Nothing was said" where nothing was heard), and a pencil to type what was said, settle it; hovering a choice previews its marking on the waveform and the passage. A label in the gutter never gets cut off: it shrinks to fit its box, and goes above a box too narrow for that.

## Rules (`src/domain/review.ts`, pinned by its tests)

- A passage word in a settled spot is an error: an omission if nothing was heard over the spot, otherwise a substitution.
- Three seconds or more between the word before and a word read correctly is a hesitation error. DIBELS has the examiner supply the word after three seconds; nobody is here to. It is drawn as the pause itself, between the words ("paused 4.0 s"), not as a slash on the word, which was read as printed.
- A reading is **marked** once no spot is left to settle. It used to also wait until every paragraph had been played through (nine-tenths of it), so a word the recogniser wrote as the passage's word where the child said something close ("dock" for "duck") would not slip past; teachers settled every spot and still saw no accuracy, with nothing on screen saying why, so that condition is dropped for now. Which paragraphs were played is still recorded. The teacher fixes such a word in the gutter.
- Self-corrections are read correctly, and are not recorded separately for now.

## Considered options

- **Tap marks on the passage, transcript for navigation only** (ADR-0008, ADR-0009): the teacher judges every word, and there's no record of where anything was said.
- **Correct the transcript token by token, marks derived** (an earlier version of this ADR): the teacher worked through the whole transcript line by line. The chosen option keeps the editing but points the teacher only at the spots, with the words placed in the audio.
- **Accept the recogniser's diff as marks**: research estimates 35–50 false flags per passage on child speech (docs/research/word-timing-and-passage-alignment.md), and reviewers follow such flags.
- **Reconstruct against the passage, teacher says right or wrong for each doubtful word** (an earlier version of this ADR): the verdicts said nothing about what was said, so the record was no better for it, and a mishearing like "Salmon" for "Sam and" could not be put right.
- **Reconstruct against the passage, teacher settles what was said by ear** (chosen).

## Consequences

- Marking needs a transcript and the audio. A reading without either cannot be marked.
- `reading.marks` is a cached output of `deriveMarks`, so accuracy, the CSV, the Sheet and the chart are unchanged.
- The stored review is also a training label: the audio, the recogniser's untouched words, and the corrected, timed heard words (each with where its time came from, `asr`, `aligned`, `estimated` or `manual`, and whether the recogniser or the teacher wrote it).
- Forced alignment is best-effort. Without the model, heard words keep the recogniser's rough times, and the teacher can drag them. Its cost on a Chromebook is unmeasured.
