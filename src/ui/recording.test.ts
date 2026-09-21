import { screen, waitFor, within } from '@testing-library/svelte';
import { renderApp, pasteRoster, pastePassage, goTo, speechCapture, recordReading, unlockDoneScreen, tapStart, openStart } from '../test/harness';
import { FakeMicrophone } from '../adapters/microphone/FakeMicrophone';
import { MemoryStorage } from '../adapters/storage/MemoryStorage';
import { CAMP_TEXT } from '../test/fixtures/passages';

describe('Handing the device to a student', () => {
  test('tapping a student opens their page; New reading lands on the start screen with their name and a level meter', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace');
    await h.user.click(screen.getByRole('button', { name: 'Ada Lovelace' }));
    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(h.microphone.opened).toBe(false);
    await h.user.click(screen.getByRole('button', { name: /new reading/i }));
    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: /microphone level/i })).toBeInTheDocument();
    expect(h.microphone.opened).toBe(true);
  });

  test('Start is disabled until the microphone hears sound', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace');
    await openStart(h, 'Ada Lovelace');
    await screen.findByText(/waiting for sound/i);
    expect(screen.getByRole('button', { name: /^start$/i })).toBeDisabled();
    h.microphone.emitLevel(0.01);
    expect(screen.getByRole('button', { name: /^start$/i })).toBeDisabled();
    h.microphone.emitLevel(0.5);
    await waitFor(() => expect(screen.getByRole('button', { name: /^start$/i })).toBeEnabled());
  });

  test('a broken microphone is reported on the start screen', async () => {
    const microphone = new FakeMicrophone();
    microphone.failWith = new Error('Permission denied');
    const h = await renderApp({ microphone });
    await pasteRoster(h, 'Ada Lovelace');
    await openStart(h, 'Ada Lovelace');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Permission denied/);
  });

  test('a microphone that hears nothing says where Chrome keeps the microphone settings, and gets out of the way once it hears a voice', async () => {
    const h = await renderApp({ micHintMs: 20 });
    await pasteRoster(h, 'Ada Lovelace');
    await openStart(h, 'Ada Lovelace');
    const help = await screen.findByRole('status', { name: /not hearing anything/i });
    expect(help).toHaveTextContent(/sliders icon at the left of the address bar/i);
    expect(help).toHaveTextContent(/pick a different one/i);
    expect(help).toHaveTextContent(/reset permissions/i);
    // The arrow that points past the page at Chrome's own address bar.
    expect(screen.getByText(/microphone settings live up here/i)).toBeInTheDocument();

    h.microphone.emitLevel(0.4);
    await waitFor(() => expect(screen.getByRole('button', { name: /^start$/i })).toBeEnabled());
    expect(screen.queryByRole('status', { name: /not hearing anything/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/microphone settings live up here/i)).not.toBeInTheDocument();
  });

  test('the teacher can open the microphone help straight away, and hide it again', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace');
    await openStart(h, 'Ada Lovelace');
    await screen.findByText(/waiting for sound/i);
    await h.user.click(screen.getByRole('button', { name: /start button stuck grey/i }));
    expect(await screen.findByRole('status', { name: /not hearing anything/i })).toBeInTheDocument();

    await h.user.click(screen.getByRole('button', { name: /hide microphone help/i }));
    expect(screen.queryByRole('status', { name: /not hearing anything/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start button stuck grey/i })).toBeInTheDocument();
  });

  test('a blocked microphone tells the teacher to allow it from the address bar, and Try again reopens it', async () => {
    const microphone = new FakeMicrophone();
    microphone.failWith = new DOMException('Permission denied', 'NotAllowedError');
    const h = await renderApp({ microphone });
    await pasteRoster(h, 'Ada Lovelace');
    await openStart(h, 'Ada Lovelace');
    const alert = await screen.findByRole('alert', { name: /chrome is blocking the microphone/i });
    expect(alert).toHaveTextContent(/sliders icon at the left of the address bar/i);
    expect(alert).toHaveTextContent(/set Microphone to Allow/i);
    expect(alert).toHaveTextContent(/Permission denied/);
    expect(screen.getByText(/microphone settings live up here/i)).toBeInTheDocument();

    microphone.failWith = undefined;
    await h.user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('meter', { name: /microphone level/i })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('a missing microphone and a microphone another app holds each get their own advice, with no arrow at Chrome', async () => {
    const microphone = new FakeMicrophone();
    microphone.failWith = new DOMException('Requested device not found', 'NotFoundError');
    const h = await renderApp({ microphone });
    await pasteRoster(h, 'Ada Lovelace');
    await openStart(h, 'Ada Lovelace');
    expect(await screen.findByRole('alert', { name: /no microphone found/i })).toHaveTextContent(/plug it back in/i);
    // Nothing to point at in the address bar: permission is not the problem here.
    expect(screen.queryByText(/microphone settings live up here/i)).not.toBeInTheDocument();

    microphone.failWith = new DOMException('Could not start audio source', 'NotReadableError');
    await h.user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('alert', { name: /another app has the microphone/i })).toHaveTextContent(/Meet, Zoom, Teams/);
  });

  test('the recording screen shows an indicator and Done, with no timer', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace');
    await openStart(h, 'Ada Lovelace');
    await tapStart(h);
    expect(screen.getByText(/recording/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^done$/i })).toBeInTheDocument();
    expect(h.microphone.recording).toBe(true);
    expect(document.body.textContent).not.toMatch(/\d+:\d\d/);
  });

  test('Done shows a friendly screen with no numbers and nothing else reachable', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace');
    h.microphone.capture = speechCapture(45);
    await openStart(h, 'Ada Lovelace');
    await tapStart(h);
    await h.user.click(screen.getByRole('button', { name: /^done$/i }));
    expect(await screen.findByText(/nice work/i)).toBeInTheDocument();
    expect(screen.getByText(/hand the device back/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d/);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(h.microphone.opened).toBe(false);
  });

  test('a short tap does not unlock the Done screen; a long press does', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace');
    await openStart(h, 'Ada Lovelace');
    await tapStart(h);
    await h.user.click(screen.getByRole('button', { name: /^done$/i }));
    const unlock = await screen.findByRole('button', { name: /hold to unlock/i });
    await h.user.click(unlock);
    expect(screen.getByText(/nice work/i)).toBeInTheDocument();
    await unlockDoneScreen(h);
    expect(screen.getByRole('heading', { name: /review/i })).toBeInTheDocument();
  });

  test('the reading is stored with its tap-to-tap time from the sample count the moment Done is tapped', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace');
    await recordReading(h, 'Ada Lovelace', { seconds: 45 });
    const [reading] = await h.storage.listReadings();
    expect(reading).toMatchObject({ tapBounds: { start: 0, end: 45 }, completion: 'complete', hasAudio: true });
    expect(await h.storage.getAudio(reading.id)).toHaveLength(45 * 16000);
    // Silence trimming may already have landed, so only the shape of the timing line is fixed here.
    expect(screen.getByRole('group', { name: /^timing$/i })).toHaveTextContent(/\d\.\d s → 4[45]\.\d s/);
  });

  test('New reading first asks which passage, as step one of two', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await pastePassage(h, 'Camp', CAMP_TEXT);
    await goTo(h, 'Roster');
    await pasteRoster(h, 'Ada Lovelace');
    await h.user.click(screen.getByRole('button', { name: 'Ada Lovelace' }));
    await h.user.click(screen.getByRole('button', { name: /new reading/i }));
    const step = screen.getByRole('dialog', { name: /which passage/i });
    expect(step).toHaveTextContent(/step 1 of 2/i);
    expect(within(step).getByRole('button', { name: /^Camp/ })).toBeInTheDocument();
    expect(within(step).getByRole('button', { name: /skip for now/i })).toBeInTheDocument();
    await h.user.click(within(step).getByRole('button', { name: /skip for now/i }));
    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.getByText(/no passage chosen/i)).toBeInTheDocument();
  });

  test('with no passages stored, New reading goes straight to the start screen', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace');
    await h.user.click(screen.getByRole('button', { name: 'Ada Lovelace' }));
    await h.user.click(screen.getByRole('button', { name: /new reading/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
  });

  test('a passage chosen before handing over is already on the reading', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await pastePassage(h, 'Camp', CAMP_TEXT);
    await goTo(h, 'Roster');
    await pasteRoster(h, 'Ada Lovelace');
    await openStart(h, 'Ada Lovelace', 'Camp');
    expect(screen.getByText(/^Camp/)).toBeInTheDocument();
    await tapStart(h);
    await h.user.click(screen.getByRole('button', { name: /^done$/i }));
    await unlockDoneScreen(h);
    expect(screen.getByRole('button', { name: /^Camp ·/ })).toBeInTheDocument();
  });

  test('a reading whose tab closed before Done is reported as lost on next open', async () => {
    const storage = new MemoryStorage();
    await storage.putStudent({ id: 's1', firstName: 'Ada', lastName: 'Lovelace', archived: false, createdAt: 0 });
    await storage.putSettings({ readingInProgress: { studentId: 's1', startedAt: Date.UTC(2026, 8, 14) } });
    await renderApp({ storage });
    expect(screen.getByRole('alert')).toHaveTextContent(/reading for Ada Lovelace .* was lost because the tab closed before Done/i);
    expect(await storage.getSettings()).toEqual({});
  });

  test('re-record from review returns to the start screen for the same student', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace');
    await recordReading(h, 'Ada Lovelace');
    await h.user.click(screen.getByRole('button', { name: /record again/i }));
    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^start$/i })).toBeInTheDocument();
  });

  test('discarding a reading deletes its audio and removes it from the list', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace');
    await recordReading(h, 'Ada Lovelace');
    await h.user.click(screen.getByRole('button', { name: /discard reading/i }));
    await h.user.click(screen.getByRole('button', { name: /yes, discard/i }));
    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.getByText(/no readings yet/i)).toBeInTheDocument();
    const [reading] = await h.storage.listReadings();
    expect(reading.completion).toBe('discarded');
    expect(await h.storage.getAudio(reading.id)).toBeUndefined();
  });
});
