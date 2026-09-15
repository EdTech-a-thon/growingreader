# Reading Fluency

A local-first web app a reading interventionist hands to a student on a Chromebook. The student reads a printed passage aloud; the app records, works out the reading rate, and tracks each student's rate over time.

## Language

**Student**:
A child on the teacher's roster whose readings are tracked over time.
_Avoid_: Kid, user, reader

**Teacher**:
The adult who owns the device and roster, hands it to students, and reviews readings.
_Avoid_: Interventionist, admin, user

**Passage**:
A fixed printed text a student reads aloud. Has a known word count.
_Avoid_: Text, story, prompt, test

**Reading**:
One recording of one student reading one passage aloud.
_Avoid_: Session, test, recording, attempt, run

**Roster**:
The teacher's list of students, pasted in one name per line.
_Avoid_: Class, group, student list

**Transcript**:
The app's rough text of what it heard during a reading. Used to identify the passage, confirm completion, and tighten start/stop; never a score.
_Avoid_: Estimate, recognition result, ASR output

**Rate**:
Words per minute for a complete reading: the passage's word count over the time spent reading. Only exists once the passage is known and the reading is complete.
_Avoid_: WPM (in prose), speed, fluency score

**Complete**:
A reading in which the student read the whole passage. Incomplete readings are kept for playback but have no rate and stay off the chart until the teacher marks them complete or discards them.
_Avoid_: Finished, valid, scored

**Errors**:
The number of misread words the teacher counted while listening to a reading. Optional; entered by hand.
_Avoid_: Miscues, mistakes, accuracy (as a count)

**Words correct per minute**:
(Passage word count minus errors) over the time spent reading. Only exists when the teacher has entered errors.
_Avoid_: Accuracy, adjusted rate
