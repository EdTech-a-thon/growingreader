import { displayName } from '../../domain/roster';
import { activeDuration, rate, wordsCorrectPerMinute } from '../../domain/rate';
import { accuracy, errorsOf, errorWords, markingState } from '../../domain/marks';
import { versionReadBy, versionsOf, latestVersion } from '../../domain/passage';
import { isDiscarded, type Passage, type Reading, type Student } from '../../domain/types';

export const SHEET_TABS = ['Summary', 'Students', 'Readings', 'Passages'] as const;
export type SheetTab = (typeof SHEET_TABS)[number];
export type Cell = string | number | boolean;
export type SheetValues = Record<SheetTab, Cell[][]>;

export interface SyncData {
  students: Student[];
  passages: Passage[];
  readings: Reading[];
}

export interface SheetTransport {
  create(title: string, tabs: readonly SheetTab[]): Promise<{ spreadsheetId: string; spreadsheetUrl: string }>;
  write(spreadsheetId: string, values: SheetValues): Promise<void>;
}

export interface SheetsClient {
  create(title: string, data: SyncData): Promise<{ spreadsheetId: string; spreadsheetUrl: string }>;
  push(spreadsheetId: string, data: SyncData): Promise<void>;
}

function iso(ms: number | undefined): string {
  return ms === undefined ? '' : new Date(ms).toISOString();
}

/** A readable spreadsheet report. It deliberately contains no audio or recording-presence fields. */
export function sheetValues(data: SyncData): SheetValues {
  const students = [...data.students].sort((a, b) => displayName(a).localeCompare(displayName(b)));
  const passages = [...data.passages].sort((a, b) => a.title.localeCompare(b.title));
  const readings = data.readings.filter((reading) => !isDiscarded(reading)).sort((a, b) => a.recordedAt - b.recordedAt);
  const studentById = new Map(students.map((student) => [student.id, student]));
  const passageById = new Map(passages.map((passage) => [passage.id, passage]));

  const summaryRows = students.map((student) => {
    const history = readings.filter((reading) => reading.studentId === student.id);
    const completed = history.filter((reading) => reading.completion === 'complete');
    const rates = completed
      .map((reading) => rate(reading, passageById.get(reading.passageId ?? '')))
      .filter((value): value is number => value !== undefined);
    const latest = history.at(-1);
    const latestRate = latest ? rate(latest, passageById.get(latest.passageId ?? '')) : undefined;
    return [
      student.id,
      displayName(student),
      student.archived ? 'archived' : 'active',
      history.length,
      completed.length,
      history.filter((reading) => reading.completion === 'pending').length,
      iso(latest?.recordedAt),
      latestRate === undefined ? '' : Number(latestRate.toFixed(1)),
      rates.length ? Number((rates.reduce((sum, value) => sum + value, 0) / rates.length).toFixed(1)) : '',
      rates.length ? Number(Math.max(...rates).toFixed(1)) : '',
    ];
  });

  const readingRows = readings.map((reading) => {
    const student = studentById.get(reading.studentId);
    const passage = passageById.get(reading.passageId ?? '');
    const version = versionReadBy(reading, passage);
    const wpm = rate(reading, passage);
    const wcpm = wordsCorrectPerMinute(reading, passage);
    const errors = errorsOf(reading);
    const readAccuracy = accuracy(reading, passage);
    return [
      reading.id,
      reading.studentId,
      student ? displayName(student) : '',
      iso(reading.recordedAt),
      reading.passageId ?? '',
      passage?.title ?? '',
      version?.wordCount ?? '',
      Number(activeDuration(reading).toFixed(1)),
      wpm === undefined ? '' : Number(wpm.toFixed(1)),
      errors ?? '',
      wcpm === undefined ? '' : Number(wcpm.toFixed(1)),
      reading.completion,
      reading.transcript?.text ?? '',
      reading.note ?? '',
      reading.analysis,
      // Added with marking (ADR-0008); appended so existing column positions stay put.
      version?.version ?? '',
      MARKED_LABEL[markingState(reading)],
      readAccuracy === undefined ? '' : Number((readAccuracy * 100).toFixed(1)),
      errorWords(reading, passage).map((e) => (e.errorType ? `${e.word} (${e.errorType})` : e.word)).join('; '),
    ];
  });

  return {
    Summary: [[
      'student id', 'student', 'status', 'readings', 'complete readings', 'awaiting review',
      'latest reading', 'latest WPM', 'average WPM', 'best WPM',
    ], ...summaryRows],
    Students: [['id', 'first name', 'last name', 'status', 'created'], ...students.map((student) => [
      student.id, student.firstName, student.lastName, student.archived ? 'archived' : 'active', iso(student.createdAt),
    ])],
    Readings: [[
      'id', 'student id', 'student', 'recorded', 'passage id', 'passage', 'passage words', 'seconds',
      'words per minute', 'errors', 'words correct per minute', 'completion', 'transcript', 'note', 'analysis',
      'passage version', 'marked', 'accuracy %', 'error words',
    ], ...readingRows],
    // One row per passage version, so the text a student actually read is always here (ADR-0007).
    Passages: [['id', 'title', 'word count', 'text', 'created', 'from file', 'version', 'latest'], ...passages.flatMap((passage) =>
      versionsOf(passage).map((v) => [
        passage.id, passage.title, v.wordCount, forCell(v.text), iso(v.createdAt), v.source?.fileName ?? '', v.version, v.version === latestVersion(passage),
      ]),
    )],
  };
}

const MARKED_LABEL = { marked: 'yes', counted: 'counted', unmarked: 'no' } as const;

/**
 * A Sheets cell holds 50,000 characters. Passages are capped well below that when they are
 * added, so this only catches text that predates the cap; going over would fail the whole
 * push with a generic error that retries forever behind an "Offline" label.
 */
const MAX_CELL_CHARS = 50_000;
const TRUNCATION_NOTE = '… [truncated: too long for one cell]';

function forCell(text: string): string {
  if (text.length <= MAX_CELL_CHARS) return text;
  return text.slice(0, MAX_CELL_CHARS - TRUNCATION_NOTE.length) + TRUNCATION_NOTE;
}

export function createSheetsClient(transport: SheetTransport): SheetsClient {
  return {
    async create(title, data) {
      const created = await transport.create(title, SHEET_TABS);
      await transport.write(created.spreadsheetId, sheetValues(data));
      return created;
    },
    async push(spreadsheetId, data) {
      await transport.write(spreadsheetId, sheetValues(data));
    },
  };
}
