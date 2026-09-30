---
status: superseded by ADR-0010 (the transcript became what the teacher corrects, not only a way around the recording)
---

# While marking, the transcript is a way around the recording, never a way to mark

ADR-0008 gave marking only playback. In practice, finding "where she stumbled on *at camp*" with a slider and a Back 3 s button is the slow part of marking a two-minute reading. So the marking screen now shows the transcript beside the passage, purely as navigation: tap a transcript word to go to its start, drag across words to play just those and stop, and the word being played is lit. Lines break at pauses of a second or more, and a pause of three seconds or more (the DIBELS hesitation) is labelled with its length.

The transcript stays entirely separate from the passage. Marks are still made only by tapping the passage's words. Nothing on the transcript creates, suggests or changes a mark, and the screen does not line the transcript up against the passage for the teacher. ADR-0002's reasons still hold: the transcript is wrong too often to score from, and showing where it thinks the student went wrong would anchor the teacher to its mistakes.

## Considered options

- **Playback only** (ADR-0008): simplest, but slow to navigate, and the transcript is already there.
- **A transcript-to-passage diff that proposes marks**: faster when the transcript is right, but it is the transcript scoring the student by another name (ADR-0002, ADR-0008). Whether a diff can help without that is an open question, researched in `docs/research/word-timing-and-passage-alignment.md` and prototyped separately if at all.
- **Transcript as navigation only** (chosen).

## Consequences

- The marking screen is an editor that uses the whole window: listening on the left (waveform and transcript), marking on the right (passage and the marks bar), with no bottom navigation.
- Transcript word timings come from Whisper's own timestamps, so a tap may land a little early or late; the waveform and the 3 s skips are there for fine placement.
- Correcting the transcript, and recording what the student said on an error mark, are wanted but wait on a storage format for those labels.
