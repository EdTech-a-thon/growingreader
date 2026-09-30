import { screen, waitFor, within } from '@testing-library/svelte';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { writeBackupFile } from './backup-file';
import type { Reading, Student } from '../domain/types';
import { renderApp, pasteRoster, pastePassage, goTo, recordReading, setCompletion } from '../test/harness';
import { MemoryStorage } from '../adapters/storage/MemoryStorage';
import { CAMP_TEXT } from '../test/fixtures/passages';
import { createFakeSheetTransport } from '../adapters/sheets/fake-google';
import { createSheetsClient } from '../adapters/sheets/sheets-client';
import type { BrokerClient } from '../adapters/sheets/broker';

const DAY = 86_400_000;
const GRACE: Student = { id: 's2', firstName: 'Grace', lastName: 'Hopper', archived: false, createdAt: 0 };
const GRACE_READING: Reading = {
  id: 'r2', studentId: 's2', recordedAt: 0, hasAudio: true, sampleRate: 16000, sampleCount: 4,
  tapBounds: { start: 0, end: 1 }, timing: 'auto', completion: 'complete', analysis: 'done',
};

/** jsdom has no DataTransfer; a drop event carrying a file list is what our handlers read. */
function drop(target: Element, files: File[]) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files } });
  target.dispatchEvent(event);
}

/** Capture what the page offers as a file download. */
function captureDownloads() {
  const files: Array<{ name: string; blob: Blob }> = [];
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as Blob;
    files.push({ name: this.download, blob });
  });
  return files;
}

async function seededWithReading() {
  const h = await renderApp();
  await goTo(h, 'Passages');
  await pastePassage(h, 'Camp', CAMP_TEXT);
  await goTo(h, 'Roster');
  await pasteRoster(h, 'Ada Lovelace');
  await recordReading(h, 'Ada Lovelace', { seconds: 60, passage: 'Camp' });
  await setCompletion(h, 'Complete');
  return h;
}

describe('Data ownership', () => {
  afterEach(() => vi.restoreAllMocks());

  test('a backup is a zip of the records and a WAV per recording, and imports on another device', async () => {
    const files = captureDownloads();
    const h = await seededWithReading();
    await goTo(h, 'Settings');
    await h.user.click(screen.getByRole('button', { name: /export backup/i }));
    expect(files[0].name).toMatch(/growingreader-backup-.*\.zip/);
    const entries = unzipSync(new Uint8Array(await files[0].blob.arrayBuffer()));
    const records = JSON.parse(strFromU8(entries['backup.json']));
    expect(records.students).toMatchObject([{ firstName: 'Ada' }]);
    expect(records.passages).toMatchObject([{ title: 'Camp' }]);
    expect(records.readings).toMatchObject([{ completion: 'complete', hasAudio: true }]);
    const readingId = records.readings[0].id;
    expect(Object.keys(entries).sort()).toEqual([`audio/${readingId}.wav`, 'backup.json']);
    expect(entries[`audio/${readingId}.wav`]).toHaveLength(44 + 60 * 16000 * 2);
    expect(screen.getByText(/last backup: /i)).toBeInTheDocument();

    // Another device: a fresh app.
    document.body.innerHTML = '';
    const other = await renderApp({ storage: new MemoryStorage() });
    await goTo(other, 'Settings');
    await other.user.upload(screen.getByLabelText(/import backup/i), new File([files[0].blob], files[0].name, { type: 'application/zip' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/imported 1 students, 1 passages and 1 readings/i);
    await goTo(other, 'Roster');
    expect(screen.getByRole('button', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(await other.storage.getAudio(readingId)).toHaveLength(60 * 16000);
  });

  test('an older backup, a bare JSON file, imports with no recordings', async () => {
    const other = await renderApp({ storage: new MemoryStorage() });
    await goTo(other, 'Settings');
    const records = { students: [GRACE], passages: [], readings: [{ ...GRACE_READING, hasAudio: false }], settings: {} };
    await other.user.upload(screen.getByLabelText(/import backup/i), new File([JSON.stringify(records)], 'backup.json', { type: 'application/json' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/imported 1 students/i);
    expect((await other.storage.listReadings())[0].hasAudio).toBe(false);
  });

  test('a backup dropped anywhere in the app is imported once the teacher confirms', async () => {
    const storage = new MemoryStorage();
    await storage.putStudent({ id: 's1', firstName: 'Ada', lastName: 'L', archived: false, createdAt: 0 });
    const h = await renderApp({ storage });
    const zip = await writeBackupFile({
      students: [GRACE],
      passages: [],
      readings: [GRACE_READING],
      settings: {},
      audio: new Map([['r2', new Float32Array([0, 0.5, -0.5, 0])]]),
    });

    drop(document.body, [new File([zip], 'demo-backup.zip', { type: 'application/zip' })]);
    const dialog = await screen.findByRole('dialog', { name: /import this backup/i });
    expect(dialog).toHaveTextContent(/1 students, 0 passages and 1 readings, 1 with audio/i);
    await h.user.click(within(dialog).getByRole('button', { name: /replace and import/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/imported 1 students/i);
    expect(screen.getByRole('button', { name: 'Grace Hopper' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ada L' })).not.toBeInTheDocument();
    const samples = await h.storage.getAudio('r2');
    expect([...samples!].map((s) => Math.round(s * 100) / 100)).toEqual([0, 0.5, -0.5, 0]);
  });

  test('a file that is not a backup is refused without touching anything', async () => {
    const storage = new MemoryStorage();
    await storage.putStudent({ id: 's1', firstName: 'Ada', lastName: 'L', archived: false, createdAt: 0 });
    await renderApp({ storage });
    drop(document.body, [new File([zipSync({ 'notes.txt': strToU8('hi') })], 'photos.zip', { type: 'application/zip' })]);
    expect(await screen.findByRole('status')).toHaveTextContent(/could not import photos\.zip: not a growing reader backup/i);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await storage.listStudents()).toHaveLength(1);
  });

  test('a CSV export has one row per reading with the numbers the teacher uses', async () => {
    const files = captureDownloads();
    const h = await seededWithReading();
    await goTo(h, 'Settings');
    await h.user.click(screen.getByRole('button', { name: /export csv/i }));
    const csv = await files[0].blob.text();
    const [header, row] = csv.split('\n');
    expect(header).toBe('student,date,passage,passage_words,seconds,words_per_minute,errors,words_correct_per_minute,completion,note,passage_version,marked,accuracy');
    expect(row).toMatch(/^Ada Lovelace,2026-09-15T15:00:00.000Z,Camp,\d+,58\.\d,\d+\.\d,,,complete,,1,unmarked,$/);
  });

  test('a single reading’s audio can be exported as a WAV file', async () => {
    const files = captureDownloads();
    const h = await seededWithReading();
    await h.user.click(screen.getByRole('button', { name: /export audio/i }));
    expect(files[0].name).toBe('Ada-Lovelace-2026-09-15.wav');
    expect(files[0].blob.type).toBe('audio/wav');
    expect(files[0].blob.size).toBe(44 + 60 * 16000 * 2);
  });

  test('storage usage is shown', async () => {
    const storage = new MemoryStorage();
    storage.usage = { usage: 12 * 1024 * 1024, quota: 2 * 1024 * 1024 * 1024 };
    const h = await renderApp({ storage });
    await goTo(h, 'Settings');
    expect(screen.getByText(/using 12\.0 MB of about 2\.00 GB available/i)).toBeInTheDocument();
  });

  test('the teacher is reminded to back up once readings are two weeks old and unbacked-up', async () => {
    const storage = new MemoryStorage();
    await storage.putStudent({ id: 's1', firstName: 'Ada', lastName: 'L', archived: false, createdAt: 0 });
    const now = Date.UTC(2026, 8, 15);
    await storage.putReading({
      id: 'r1', studentId: 's1', recordedAt: now - 20 * DAY, hasAudio: false, sampleRate: 16000, sampleCount: 16000,
      tapBounds: { start: 0, end: 1 }, timing: 'auto', completion: 'complete', analysis: 'done',
    });
    await renderApp({ storage, now });
    expect(screen.getByText(/been a while since your last backup/i)).toBeInTheDocument();
  });

  test('no reminder when the backup is recent', async () => {
    const storage = new MemoryStorage();
    await storage.putStudent({ id: 's1', firstName: 'Ada', lastName: 'L', archived: false, createdAt: 0 });
    const now = Date.UTC(2026, 8, 15);
    await storage.putReading({
      id: 'r1', studentId: 's1', recordedAt: now - 20 * DAY, hasAudio: false, sampleRate: 16000, sampleCount: 16000,
      tapBounds: { start: 0, end: 1 }, timing: 'auto', completion: 'complete', analysis: 'done',
    });
    await storage.putSettings({ lastBackupAt: now - 2 * DAY });
    await renderApp({ storage, now });
    expect(screen.queryByText(/been a while since your last backup/i)).not.toBeInTheDocument();
  });
});

// Hidden until it works (src/app/features.ts); switch these back on with the feature.
describe.skip('Google Sheets sync', () => {
  afterEach(() => vi.restoreAllMocks());

  test('the cloud button creates a sheet and later roster changes save automatically', async () => {
    const transport = createFakeSheetTransport();
    const broker: BrokerClient = {
      getConnection: vi.fn(async () => ({ connected: true, status: 'active' as const, googleEmail: 'teacher@example.org' })),
      signIn: vi.fn(async () => undefined),
      connectDrive: vi.fn(async () => undefined),
      signOut: vi.fn(async () => undefined),
    };
    vi.spyOn(window, 'open').mockImplementation(() => null);
    const h = await renderApp({ sheets: createSheetsClient(transport), broker });
    await pasteRoster(h, 'Ada Lovelace');

    await h.user.click(screen.getByRole('button', { name: /google sheets sync/i }));
    expect(screen.getByRole('dialog', { name: /sync to google sheets/i })).toHaveTextContent(/recordings/i);
    await h.user.click(screen.getByRole('button', { name: /continue with google/i }));
    await screen.findByRole('link', { name: /open spreadsheet/i });

    const book = transport.inspect('fake-sheet-1');
    expect(book.values.Students[1]).toContain('Ada');
    expect(book.values.Readings[0]).toContain('transcript');
    expect(await h.storage.getSettings()).toMatchObject({ googleSheets: { spreadsheetId: 'fake-sheet-1', googleEmail: 'teacher@example.org' } });

    await h.user.click(screen.getByRole('button', { name: /^close$/i }));
    await pasteRoster(h, 'Grace Hopper');
    await waitFor(() => expect(transport.inspect('fake-sheet-1').values.Students).toHaveLength(3), { timeout: 2_000 });

    await goTo(h, 'Settings');
    expect(screen.getByRole('button', { name: /sync details/i })).toBeInTheDocument();
  });
});

describe('Speech model', () => {
  test('the model downloads in the background; the roster says nothing and Settings shows progress', async () => {
    const { FakeTranscriber } = await import('../adapters/transcriber/FakeTranscriber');
    const transcriber = new FakeTranscriber();
    let release!: () => void;
    transcriber.loadDelay = new Promise<void>((r) => (release = r));
    const h = await renderApp({ transcriber });
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText(/speech model/i)).not.toBeInTheDocument();
    await goTo(h, 'Settings');
    expect(screen.getByRole('progressbar', { name: /speech model download/i })).toBeInTheDocument();
    release();
    await screen.findByText(/^Ready\./);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  test('a failed download is the only model news the teacher gets, and can be retried, after which waiting readings are transcribed', async () => {
    const { FakeTranscriber } = await import('../adapters/transcriber/FakeTranscriber');
    const { CAMP_CLEAN } = await import('../test/fixtures/passages');
    const transcriber = new FakeTranscriber();
    transcriber.loadError = new Error('offline');
    transcriber.hears(CAMP_CLEAN);
    const h = await renderApp({ transcriber });
    expect(screen.getByRole('alert')).toHaveTextContent(/speech model isn't available on this device \(offline\)/i);
    await h.user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await goTo(h, 'Passages');
    await pastePassage(h, 'Camp', CAMP_TEXT);
    await goTo(h, 'Roster');
    await pasteRoster(h, 'Ada Lovelace');
    await recordReading(h, 'Ada Lovelace');
    await vi.waitFor(async () => expect((await h.storage.listReadings())[0].analysis).toBe('done'));
    expect(screen.queryByText('Camp', { selector: 'strong' })).not.toBeInTheDocument();

    transcriber.loadError = undefined;
    await goTo(h, 'Settings');
    await h.user.click(screen.getByRole('button', { name: /try downloading again/i }));
    await screen.findByText(/^Ready\./);
    await vi.waitFor(async () => expect((await h.storage.listReadings())[0].passageId).toBeDefined());
  });
});
