import { screen, waitFor, within } from '@testing-library/svelte';
import { renderApp, pasteRoster, pastePassage, goTo, speechCapture, recordReading, unlockDoneScreen, tapStart } from '../test/harness';
import { FakeMicrophone } from '../adapters/microphone/FakeMicrophone';
import { MemoryStorage } from '../adapters/storage/MemoryStorage';
import { CAMP_TEXT } from '../test/fixtures/passages';

describe('Handing the device to a student', () => {
  test('tapping a student lands straight on the start screen with their name and a level meter', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace');
    await h.user.click(screen.getByRole('button', { name: 'Ada Lovelace' }));
    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: /microphone level/i })).toBeInTheDocument();
    expect(h.microphone.opened).toBe(true);
  });

  test('Start is disabled until the microphone hears sound', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace');
    await h.user.click(screen.getByRole('button', { name: 'Ada Lovelace' }));
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
    await h.user.click(screen.getByRole('button', { name: 'Ada Lovelace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Permission denied/);
  });

  test('the recording screen shows an indicator and Done, with no timer', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace');
    await h.user.click(screen.getByRole('button', { name: 'Ada Lovelace' }));
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
    await h.user.click(screen.getByRole('button', { name: 'Ada Lovelace' }));
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
    await h.user.click(screen.getByRole('button', { name: 'Ada Lovelace' }));
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
    expect(reading).toMatchObject({ tapBounds: { start: 0, end: 45 }, completion: 'pending', hasAudio: true });
    expect(await h.storage.getAudio(reading.id)).toHaveLength(45 * 16000);
    expect(screen.getByText(/time spent reading/i).parentElement).toHaveTextContent(/45\.0 s|44\.\d s/);
  });

  test('a passage chosen before handing over is already on the reading', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await pastePassage(h, 'Camp', CAMP_TEXT);
    await goTo(h, 'Roster');
    await pasteRoster(h, 'Ada Lovelace');
    await h.user.click(screen.getByRole('button', { name: 'Ada Lovelace' }));
    await h.user.click(screen.getByRole('button', { name: /choose passage/i }));
    await h.user.click(within(screen.getByRole('group', { name: /^passage$/i })).getByRole('button', { name: 'Camp' }));
    expect(screen.getByText(/^Camp/)).toBeInTheDocument();
    await tapStart(h);
    await h.user.click(screen.getByRole('button', { name: /^done$/i }));
    await unlockDoneScreen(h);
    expect(screen.getByText('Camp', { selector: 'strong' })).toBeInTheDocument();
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
