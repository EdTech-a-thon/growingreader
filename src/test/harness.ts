import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import App from '../App.svelte';
import { MemoryStorage } from '../adapters/storage/MemoryStorage';
import { FakeMicrophone } from '../adapters/microphone/FakeMicrophone';
import { FakeTranscriber } from '../adapters/transcriber/FakeTranscriber';
import type { AppDeps } from '../app/store.svelte';
import { SAMPLE_RATE } from '../domain/types';
import { markWelcomed, resetWelcomeForTest } from '../app/welcomed';

export interface Harness {
  storage: MemoryStorage;
  microphone: FakeMicrophone;
  transcriber: FakeTranscriber;
  user: ReturnType<typeof userEvent.setup>;
  clock: { now: number };
}

/** Render the whole app the way the teacher sees it, with every device boundary faked. */
export async function renderApp(overrides: Partial<Omit<AppDeps, 'now'>> & { now?: number; firstVisit?: boolean } = {}): Promise<Harness> {
  const storage = (overrides.storage as MemoryStorage) ?? new MemoryStorage();
  const microphone = (overrides.microphone as FakeMicrophone) ?? new FakeMicrophone();
  const transcriber = (overrides.transcriber as FakeTranscriber) ?? new FakeTranscriber();
  const clock = { now: overrides.now ?? Date.UTC(2026, 8, 15, 15, 0, 0) };
  if (overrides.firstVisit) resetWelcomeForTest();
  else markWelcomed();
  const deps: AppDeps = {
    storage,
    microphone,
    transcriber,
    sheets: overrides.sheets,
    broker: overrides.broker,
    clearSheetAuthorization: overrides.clearSheetAuthorization,
    now: () => clock.now,
    longPressMs: overrides.longPressMs ?? 30,
  };
  render(App, { props: { deps } });
  if (overrides.firstVisit) await screen.findByRole('heading', { name: /see every reader grow/i });
  else await screen.findByRole('heading', { name: /roster/i });
  return { storage, microphone, transcriber, user: userEvent.setup(), clock };
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

/** Paste a passage on the Passages screen. */
export async function pastePassage(h: Harness, title: string, text: string) {
  await h.user.click(screen.getByRole('button', { name: /^add passage$/i }));
  await h.user.type(screen.getByLabelText(/^title$/i), title);
  const textarea = screen.getByLabelText(/^text$/i) as HTMLTextAreaElement;
  await h.user.click(textarea);
  await h.user.paste(text);
  await h.user.click(screen.getByRole('button', { name: /save passage/i }));
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
