import { displayName } from './roster';
import { activeDuration, rate, wordsCorrectPerMinute } from './rate';
import { accuracy, errorsOf, markingState } from './marks';
import { versionReadBy } from './passage';
import { isDiscarded, type Passage, type Reading, type Student } from './types';

const HEADER = ['student', 'date', 'passage', 'passage_words', 'seconds', 'words_per_minute', 'errors', 'words_correct_per_minute', 'completion', 'note', 'passage_version', 'marked', 'accuracy'];

function cell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per reading (discarded ones excluded), oldest first, with the numbers the teacher's spreadsheet uses. */
export function readingsCsv(students: Student[], passages: Passage[], readings: Reading[]): string {
  const rows = readings
    .filter((r) => !isDiscarded(r))
    .sort((a, b) => a.recordedAt - b.recordedAt)
    .map((r) => {
      const student = students.find((s) => s.id === r.studentId);
      const passage = passages.find((p) => p.id === r.passageId);
      const wpm = rate(r, passage);
      const wcpm = wordsCorrectPerMinute(r, passage);
      const version = versionReadBy(r, passage);
      const readAccuracy = accuracy(r, passage);
      return [
        student ? displayName(student) : '',
        new Date(r.recordedAt).toISOString(),
        passage?.title ?? '',
        version?.wordCount ?? '',
        activeDuration(r).toFixed(1),
        wpm === undefined ? '' : wpm.toFixed(1),
        errorsOf(r) ?? '',
        wcpm === undefined ? '' : wcpm.toFixed(1),
        r.completion,
        r.note ?? '',
        version?.version ?? '',
        markingState(r),
        readAccuracy === undefined ? '' : (readAccuracy * 100).toFixed(1),
      ];
    });
  return [HEADER, ...rows].map((row) => row.map(cell).join(',')).join('\n');
}
