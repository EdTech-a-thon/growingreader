---
status: accepted
---

# The extracted text is the passage; the imported file is not kept

A passage can be read out of a PDF or a text file. The first version kept the original PDF on the device so the teacher could preview the page the student is holding. We now keep only the extracted text and the file's name: the text is what the app uses (word count, identification, completion, timing — ADR-0002), it is what reaches the Google Sheet, and it is the only part that survives a backup restore. Keeping bytes that nothing reads costs quota on the one device that is short of it.

## Considered options

- **Keep the file for preview**: the teacher can see the real page, but the bytes are device-only, absent after a restore, and useless to every other part of the app.
- **Keep the text only** (chosen): one artifact, the same one everywhere.

## Consequences

- Extraction is a one-way door at import time: if the text came out wrong, the fix is editing it or re-importing the file, not re-parsing a stored copy.
- The review modal shows extracted text, not a rendered page, so "does this match the paper copy?" is a reading task rather than a visual comparison.
- Nothing binary can reach the Sheets payload, which a cell (50,000 characters) could not hold anyway.
