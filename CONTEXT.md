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
One recording of one student reading one passage aloud.
_Avoid_: Session, test, recording, attempt, run

**Roster**:
The teacher's list of students, pasted in one name per line.
_Avoid_: Class, group, student list

**Transcript**:
The app's rough text of what it heard during a reading. Used to identify the passage, confirm completion, tighten start/stop, and give an estimated rate on review; never a score.
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
Words per minute for a complete reading: the passage's word count over the time spent reading. Only exists once the passage is known and the reading is complete.
_Avoid_: WPM (in prose), speed, fluency score

**Estimated rate**:
A rough words-per-minute from the transcript's word count over the time spent reading. Shown only on the review screen, marked as an estimate, while no rate exists; never stored or charted.
_Avoid_: Rate (unqualified), approximate WPM, transcript rate

**Complete**:
A reading in which the student read the whole passage. Every reading is complete by default; one the app heard stop early waits for the teacher to decide. Incomplete readings are kept for playback but have no rate and stay off the chart until the teacher marks them complete or discards them.
_Avoid_: Finished, valid, scored

**Errors**:
The number of misread words the teacher counted while listening to a reading. Kept on older readings and backups; no longer entered on review.
_Avoid_: Miscues, mistakes, accuracy (as a count)

**Words correct per minute**:
(Passage word count minus errors) over the time spent reading. Only exists when the teacher has entered errors.
_Avoid_: Accuracy, adjusted rate
