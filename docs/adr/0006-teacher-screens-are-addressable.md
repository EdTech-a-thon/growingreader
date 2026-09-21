---
status: accepted
---

# The teacher's screens have URLs; the student-facing ones do not

Screen state lived only in memory, so a refresh always returned to the roster — losing the teacher's place, which matters most when she is mid-task on a student. The five teacher screens (roster, student, passages, settings, review) now have real paths. Start, Recording and Done deliberately have none: the URL stays on the student's page while the device is handed over.

## Considered options

- **Route everything**: uniform, but `/recording` cannot survive a cold load (the capture target lives in memory and `finishReading` returns early without it, leaving a Done button that silently does nothing), `/start/:id` would prompt for the microphone with no teacher action behind it, and an address bar on a student-held device is a way back into the teacher's app.
- **Route the teacher's screens only** (chosen): fixes the refresh complaint without inventing addresses for screens that cannot be entered cold.

## Consequences

- A reload during a reading lands on the student's page, so the lost-reading notice is rendered there as well as on the roster; `init()` consumes and clears `readingInProgress`, so a landing place that cannot report it loses the notice entirely.
- Deep links need a host rewrite to `/index.html` (`vercel.json`), and the service worker must not cache a failed navigation. Without both, every screen becomes a potential 404 on a hard load — previously only `/about` and `/privacy` were exposed to this.
- Modals stay component state. Routing them would make the back button destroy unsaved input (a half-typed roster, an unsaved note).
