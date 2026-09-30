# Growing Reader

A local-first web app a reading interventionist hands to a student on a Chromebook. The student reads a printed passage aloud; the app records, works out the reading rate, and tracks each student's rate over time.

## Language

**Student**:
A child on the teacher's roster whose readings are tracked over time.
_Avoid_: Kid, user, reader

**Teacher**:
The adult who owns the device and roster, hands it to students, and reviews readings.
_Avoid_: Interventionist, admin, user

**Passage**:
A fixed printed text a student reads aloud. Has a known word count. Pasted in, or read out of a file the teacher chose.
_Avoid_: Text, story, prompt, test

**Imported passage**:
A passage whose text was read out of a file rather than typed or pasted. The extracted text is the passage; the file itself is not kept, only its name. The word count is an estimate until the teacher has checked it against the paper copy, and that is how it is labelled everywhere it is shown.
_Avoid_: Uploaded passage, attachment, parsed passage, PDF passage

**Reading**:
One recording of one student reading one passage version aloud.
_Avoid_: Session, test, recording, attempt, run

**Roster**:
The teacher's list of students, pasted in one name per line.
_Avoid_: Class, group, student list

**Transcript**:
The app's rough text of what it heard during a reading. Used to identify the passage, confirm completion, tighten start/stop, give an estimated rate on review, and as the first map of the reading onto the passage. Never a score on its own: only what the teacher confirms produces marks.
_Avoid_: Estimate, recognition result, ASR output

**Estimated word count**:
The word count of an imported passage before the teacher has checked it against the paper copy. Headings, page numbers and worksheet instructions come across as words, and the count divides into the time to give the rate, so it is shown as an estimate wherever it appears.
_Avoid_: Approximate count, parsed count

**Unreadable file**:
A file the app cannot turn into a passage: a scanned PDF with no text layer, or a format it does not open. Not an error to dismiss — the teacher is given instructions to have an assistant convert the file, which she then drops back onto those instructions.
_Avoid_: Failed import, bad file, OCR failure

**Title line**:
The `# Passage title` first line of a converted file. It names the passage, so the file's own name does not matter, and it is not part of the passage or its word count.
_Avoid_: Header, markdown heading, filename title

**Rate**:
Words per minute for a complete reading: the word count of the passage version read over the time spent reading. Only exists once the passage is known and the reading is complete.
_Avoid_: WPM (in prose), speed, fluency score

**Estimated rate**:
A rough words-per-minute from the transcript's word count over the time spent reading. Shown only on the review screen, marked as an estimate, while no rate exists; never stored or charted.
_Avoid_: Rate (unqualified), approximate WPM, transcript rate

**Complete**:
A reading in which the student read to the end of the passage. Words or lines skipped on the way are errors, not incompleteness; stopping before the end, including skipping the ending, is incomplete. Every reading is complete by default; one the app heard stop early waits for the teacher to decide. Incomplete readings are kept for playback but have no rate and stay off the chart until the teacher confirms them complete or discards them.
_Avoid_: Finished, valid, scored, marked complete

**Passage version**:
One wording of a passage. Versions are never changed or deleted. Changing the words of a version some reading already uses makes a new version; title, line-break and spacing changes do not. Only the latest version is handed to students; older ones are history that can be restored as a new version.
_Avoid_: Revision, edit, copy, draft

**Marking**:
Reconstructing a reading against the passage: the teacher settles what was said (the heard words, placed in the audio), and each passage word is matched to it or not; the marks follow by DIBELS rules. Optional: a reading has a rate whether or not it has been marked. Needs the transcript and the audio.
_Avoid_: Grading, scoring, annotating

**Spot**:
A run of passage words no heard word matches: something else was heard there, or nothing. Highlighted yellow until settled: the teacher hears just that stretch and, in the sentence card, says the passage was said (green), the app heard it right (errors) or nothing was said (omissions), or types what was said.
_Avoid_: Flag, warning, suspected error, miscue

**Heard words**:
What was said, word by word, each placed where in the recording it was said: the recogniser's words, forced-aligned, as the teacher corrects them (retyped, split, deleted, added, dragged). The most faithful record of the reading the app can make; the recogniser's own output is kept untouched beside it.
_Avoid_: Transcript (for the corrected record), ASR words

**Span**:
Where in the recording a passage word was read: the time of the heard word it matched, or a share of a spot's gap. Spans decide where a tapped word plays from and where hesitations are.
_Avoid_: Timestamp, segment, alignment (for the thing itself)

**Mark**:
One outcome for a specific word of the passage: an error mark or a self-correction. Marks belong to the reading, are against the passage version it read, and are derived from the reconstruction the teacher confirmed, never made directly and never taken from the app's own transcript.
_Avoid_: Annotation, tag, miscue, correction

**Error mark**:
A mark saying the student did not read the word correctly: substituted, mispronounced, skipped, hesitated on, or read out of order. Each counts as one error; a skipped line is an error mark on every word in it.
_Avoid_: Slash, miscue, wrong word

**Error type**:
What went wrong on an error mark: substitution, omission or hesitation, derived with the mark. Never changes the count.
_Avoid_: Miscue type, error category

**Self-correction**:
A mark saying the student misread the word and fixed it within three seconds. The word counts as read correctly.
_Avoid_: SC, fix, correction (unqualified)

**Marked reading**:
A complete reading with no spot left to settle and every paragraph played through at least once. A marked reading with no marks means the student made no errors; an unmarked reading means nobody has finished listening. Only complete readings can be marked.
_Avoid_: Scored reading, graded reading

**Errors**:
The number of passage words a marked reading's error marks count against the student. Older readings may carry a bare count the teacher entered before marking existed, shown as counted rather than marked until the reading is marked.
_Avoid_: Miscues, mistakes, accuracy (as a count)

**Accuracy**:
The share of the passage version's words read correctly in a marked reading: (word count minus errors) over word count. A per-reading figure, not charted.
_Avoid_: Accuracy rate, percent correct, score

**Words correct per minute**:
(Word count minus errors) over the time spent reading. Only exists for a marked reading, or an older reading with a counted error figure.
_Avoid_: WCPM (in prose), adjusted rate, accuracy
