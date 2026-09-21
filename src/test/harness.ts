import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import App from '../App.svelte';
import { MemoryStorage } from '../adapters/storage/MemoryStorage';
import { FakeMicrophone } from '../adapters/microphone/FakeMicrophone';
import { FakeTranscriber } from '../adapters/transcriber/FakeTranscriber';
import { FakeDocumentImporter } from '../adapters/documents/FakeDocumentImporter';
import type { AppDeps } from '../app/store.svelte';
import { SAMPLE_RATE } from '../domain/types';
import { markWelcomed, resetWelcomeForTest } from '../app/welcomed';
import { resetScrollLockForTest } from '../ui/scroll-lock';

export interface Harness {
  storage: MemoryStorage;
  microphone: FakeMicrophone;
  transcriber: FakeTranscriber;
  documents: FakeDocumentImporter;
  user: ReturnType<typeof userEvent.setup>;
  clock: { now: number };
}

/** Render the whole app the way the teacher sees it, with every device boundary faked. */
export async function renderApp(overrides: Partial<Omit<AppDeps, 'now'>> & { now?: number; firstVisit?: boolean; path?: string } = {}): Promise<Harness> {
  const storage = (overrides.storage as MemoryStorage) ?? new MemoryStorage();
  const microphone = (overrides.microphone as FakeMicrophone) ?? new FakeMicrophone();
  const transcriber = (overrides.transcriber as FakeTranscriber) ?? new FakeTranscriber();
  const documents = (overrides.documents as FakeDocumentImporter) ?? new FakeDocumentImporter();
  const clock = { now: overrides.now ?? Date.UTC(2026, 8, 15, 15, 0, 0) };
  // jsdom keeps one location per file, so every render starts from a known address.
  window.history.replaceState({}, '', overrides.path ?? '/');
  resetScrollLockForTest();
  if (overrides.firstVisit) resetWelcomeForTest();
  else markWelcomed();
  const deps: AppDeps = {
    storage,
    microphone,
    transcriber,
    documents,
    sheets: overrides.sheets,
    broker: overrides.broker,
    clearSheetAuthorization: overrides.clearSheetAuthorization,
    now: () => clock.now,
    longPressMs: overrides.longPressMs ?? 30,
    micHintMs: overrides.micHintMs ?? 30_000,
  };
  render(App, { props: { deps } });
  if (overrides.firstVisit) await screen.findByRole('heading', { name: /see every reader grow/i });
  else if (!overrides.path || overrides.path === '/') await screen.findByRole('heading', { name: /roster/i });
  return { storage, microphone, transcriber, documents, user: userEvent.setup(), clock };
}

/** A capture of `seconds` of quiet-then-speech-then-quiet so silence trimming has something to find. */
export function speechCapture(seconds: number, leadIn = 1, tailOut = 1) {
  const n = Math.round(seconds * SAMPLE_RATE);
  const samples = new Float32Array(n);
  const start = Math.round(leadIn * SAMPLE_RATE);
  const end = n - Math.round(tailOut * SAMPLE_RATE);
  for (let i = start; i < end; i++) samples[i] = 0.3 * Math.sin((2 * Math.PI * 200 * i) / SAMPLE_RATE);
  return { samples, sampleRate: SAMPLE_RATE };
}

/** Paste a roster on the Roster screen. */
export async function pasteRoster(h: Harness, names: string) {
  await h.user.click(screen.getByRole('button', { name: /paste roster/i }));
  await h.user.type(screen.getByLabelText(/one student per line/i), names);
  await h.user.click(screen.getByRole('button', { name: /add students/i }));
}

/** Open the type-it-out form, from either the empty state or the Add passage menu. */
export async function openPassageForm(h: Harness) {
  const menuButton = screen.queryByRole('button', { name: /^add passage$/i });
  if (menuButton) {
    await h.user.click(menuButton);
    await h.user.click(screen.getByRole('menuitem', { name: /type it out/i }));
  } else {
    await h.user.click(screen.getByRole('button', { name: /type it out/i }));
  }
}

/** Paste a passage on the Passages screen. */
export async function pastePassage(h: Harness, title: string, text: string) {
  await openPassageForm(h);
  await h.user.type(screen.getByLabelText(/^title$/i), title);
  const textarea = screen.getByLabelText(/^text$/i) as HTMLTextAreaElement;
  await h.user.click(textarea);
  await h.user.paste(text);
  await h.user.click(screen.getByRole('button', { name: /save passage/i }));
}

const fileOf = (name: string, contents: string) =>
  new File([contents], name, { type: name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'text/plain' });

/**
 * Hand files to the Passages screen the way a drop or the file picker does. The fake
 * importer decides what each file "contains"; the real PDF path is covered in pdf.test.ts.
 */
export async function importFiles(h: Harness, files: { name: string; text: string }[]) {
  for (const f of files) if (!h.documents.contents.has(f.name)) h.documents.willRead(f.name, f.text);
  await h.user.upload(
    screen.getByLabelText(/import passages from files/i),
    files.map((f) => fileOf(f.name, f.text)),
  );
}

/** Import one file, which opens the full form, and save it. */
export async function importPassage(h: Harness, fileName: string, text: string, opts: { title?: string; save?: boolean } = {}) {
  await importFiles(h, [{ name: fileName, text }]);
  await screen.findByLabelText(/^text$/i);
  if (opts.title) await h.user.type(screen.getByLabelText(/^title$/i), opts.title);
  if (opts.save !== false) await h.user.click(screen.getByRole('button', { name: /save passage/i }));
}

/** Import a passage from the review screen's picker, which has its own single-file input. */
export async function importPassageForReading(h: Harness, fileName: string, text: string) {
  h.documents.willRead(fileName, text);
  await h.user.upload(screen.getByLabelText(/import a passage from a file/i), fileOf(fileName, text));
}

export async function goTo(h: Harness, nav: 'Roster' | 'Passages' | 'Settings') {
  await h.user.click(within(screen.getByRole('navigation')).getByRole('button', { name: nav }));
}

/** Reach the Start screen: from the roster tap the student (skipped when already on their page), then New reading and the passage step. */
export async function openStart(h: Harness, studentName: string, passage?: string) {
  const card = screen.queryByRole('button', { name: studentName });
  if (card) await h.user.click(card);
  await h.user.click(screen.getByRole('button', { name: /new reading/i }));
  await pickPassage(h, passage);
}

/** Run a whole reading: reach Start, wait for sound, Start, Done, unlock. */
export async function recordReading(h: Harness, studentName: string, opts: { seconds?: number; passage?: string } = {}) {
  h.microphone.capture = speechCapture(opts.seconds ?? 60);
  await openStart(h, studentName, opts.passage);
  await tapStart(h);
  await h.user.click(screen.getByRole('button', { name: /^done$/i }));
  await unlockDoneScreen(h);
}

/** Step one of handing over, shown only when passages exist: pick one by title, or skip. */
export async function pickPassage(h: Harness, title?: string) {
  const group = screen.queryByRole('group', { name: /^passage$/i });
  if (!group) return;
  await h.user.click(within(group).getByRole('button', { name: title ? new RegExp(`^${title}`) : /skip for now/i }));
}

/** On the Start screen: make the mic hear something, wait for Start to enable, tap it. */
export async function tapStart(h: Harness) {
  await screen.findByText(/waiting for sound/i);
  h.microphone.emitLevel(0.4);
  const start = screen.getByRole('button', { name: /^start$/i });
  await waitFor(() => expect(start).toBeEnabled());
  await h.user.click(start);
}

export async function unlockDoneScreen(h: Harness) {
  const unlock = await screen.findByRole('button', { name: /hold to unlock/i });
  await h.user.pointer({ keys: '[MouseLeft>]', target: unlock });
  await new Promise((r) => setTimeout(r, 60));
  await h.user.pointer({ keys: '[/MouseLeft]', target: unlock });
  await screen.findByRole('heading', { name: /review/i });
}
