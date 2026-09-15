import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import App from '../App.svelte';
import { MemoryStorage } from '../adapters/storage/MemoryStorage';
import { FakeMicrophone } from '../adapters/microphone/FakeMicrophone';
import { FakeTranscriber } from '../adapters/transcriber/FakeTranscriber';
import type { AppDeps } from '../app/store.svelte';
import { SAMPLE_RATE } from '../domain/types';

export interface Harness {
  storage: MemoryStorage;
  microphone: FakeMicrophone;
  transcriber: FakeTranscriber;
  user: ReturnType<typeof userEvent.setup>;
  clock: { now: number };
}

/** Render the whole app the way the teacher sees it, with every device boundary faked. */
export async function renderApp(overrides: Partial<Omit<AppDeps, 'now'>> & { now?: number } = {}): Promise<Harness> {
  const storage = (overrides.storage as MemoryStorage) ?? new MemoryStorage();
  const microphone = (overrides.microphone as FakeMicrophone) ?? new FakeMicrophone();
  const transcriber = (overrides.transcriber as FakeTranscriber) ?? new FakeTranscriber();
  const clock = { now: overrides.now ?? Date.UTC(2026, 8, 15, 15, 0, 0) };
  const deps: AppDeps = { storage, microphone, transcriber, now: () => clock.now, longPressMs: overrides.longPressMs ?? 30 };
  render(App, { props: { deps } });
  await screen.findByRole('heading', { name: /roster/i });
  return { storage, microphone, transcriber, user: userEvent.setup(), clock };
}

/** A capture of `seconds` of quiet-then-speech-then-quiet so silence trimming has something to find. */
export function speechCapture(seconds: number, leadIn = 0.5, tailOut = 0.5) {
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
  await h.user.click(within(screen.getByRole('navigation')).getByRole('link', { name: nav }));
}

/** Run a whole reading: from the roster, tap the student, wait for sound, Start, Done, unlock. */
export async function recordReading(h: Harness, studentName: string, opts: { seconds?: number; passage?: string } = {}) {
  h.microphone.capture = speechCapture(opts.seconds ?? 60);
  await h.user.click(screen.getByRole('button', { name: studentName }));
  await h.user.click(screen.getByRole('button', { name: /new reading/i }));
  if (opts.passage) await h.user.click(screen.getByRole('button', { name: opts.passage }));
  await tapStart(h);
  await h.user.click(screen.getByRole('button', { name: /^done$/i }));
  await unlockDoneScreen(h);
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
