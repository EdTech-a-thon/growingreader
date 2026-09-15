import { screen } from '@testing-library/svelte';
import { renderApp, pasteRoster, pastePassage, goTo, recordReading } from '../test/harness';
import { MemoryStorage } from '../adapters/storage/MemoryStorage';
import { CAMP_TEXT } from '../test/fixtures/passages';

const DAY = 86_400_000;

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
  await h.user.click(screen.getByRole('button', { name: /^complete$/i }));
  return h;
}

describe('Data ownership', () => {
  afterEach(() => vi.restoreAllMocks());

  test('a backup holds roster, passages and readings but no audio, and imports on another device', async () => {
    const files = captureDownloads();
    const h = await seededWithReading();
    await goTo(h, 'Settings');
    await h.user.click(screen.getByRole('button', { name: /export backup/i }));
    expect(files[0].name).toMatch(/reading-fluency-backup-.*\.json/);
    const backup = JSON.parse(await files[0].blob.text());
    expect(backup.students).toMatchObject([{ firstName: 'Ada' }]);
    expect(backup.passages).toMatchObject([{ title: 'Camp' }]);
    expect(backup.readings).toMatchObject([{ completion: 'complete', hasAudio: false }]);
    expect(JSON.stringify(backup)).not.toMatch(/samples/);
    expect(screen.getByText(/last backup: /i)).toBeInTheDocument();

    // Another device: a fresh app.
    document.body.innerHTML = '';
    const other = await renderApp({ storage: new MemoryStorage() });
    await goTo(other, 'Settings');
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });
    await other.user.upload(screen.getByLabelText(/import backup/i), file);
    expect(await screen.findByRole('status')).toHaveTextContent(/imported 1 students, 1 passages and 1 readings/i);
    await goTo(other, 'Roster');
    expect(screen.getByRole('button', { name: 'Ada Lovelace' })).toBeInTheDocument();
  });

  test('a CSV export has one row per reading with the numbers the teacher uses', async () => {
    const files = captureDownloads();
    const h = await seededWithReading();
    await goTo(h, 'Settings');
    await h.user.click(screen.getByRole('button', { name: /export csv/i }));
    const csv = await files[0].blob.text();
    const [header, row] = csv.split('\n');
    expect(header).toBe('student,date,passage,passage_words,seconds,words_per_minute,errors,words_correct_per_minute,completion,note');
    expect(row).toMatch(/^Ada Lovelace,2026-09-15T15:00:00.000Z,Camp,\d+,58\.\d,\d+\.\d,,,complete,$/);
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

describe('Speech model', () => {
  test('the first launch shows a download progress bar until the model is ready', async () => {
    const { FakeTranscriber } = await import('../adapters/transcriber/FakeTranscriber');
    const transcriber = new FakeTranscriber();
    let release!: () => void;
    transcriber.loadDelay = new Promise<void>((r) => (release = r));
    const h = await renderApp({ transcriber });
    expect(screen.getByRole('progressbar', { name: /speech model download/i })).toBeInTheDocument();
    release();
    await screen.findByText(/paste your roster/i);
    await vi.waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
    void h;
  });

  test('a failed download is explained and can be retried from Settings, after which waiting readings are transcribed', async () => {
    const { FakeTranscriber } = await import('../adapters/transcriber/FakeTranscriber');
    const { CAMP_CLEAN } = await import('../test/fixtures/passages');
    const transcriber = new FakeTranscriber();
    transcriber.loadError = new Error('offline');
    transcriber.hears(CAMP_CLEAN);
    const h = await renderApp({ transcriber });
    expect(screen.getByText(/speech model isn't available on this device \(offline\)/i)).toBeInTheDocument();
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
