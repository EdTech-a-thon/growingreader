import { screen, waitFor, within } from '@testing-library/svelte';
import { renderApp, pasteRoster, pastePassage, goTo, recordReading } from '../test/harness';
import { FakeTranscriber } from '../adapters/transcriber/FakeTranscriber';
import { CAMP_CLEAN, CAMP_STOPS_EARLY, CAMP_TEXT, CAMP_TEXT_VARIANT, SHIP_TEXT } from '../test/fixtures/passages';
import { countWords } from '../analysis';

const CAMP_WORDS = countWords(CAMP_TEXT);

async function setUpCampAndShip(h: Awaited<ReturnType<typeof renderApp>>) {
  await goTo(h, 'Passages');
  await pastePassage(h, 'Camp', CAMP_TEXT);
  await pastePassage(h, 'Ship', SHIP_TEXT);
  await goTo(h, 'Roster');
  await pasteRoster(h, 'Ada Lovelace');
}

const rateSection = () => screen.getByRole('heading', { name: /^rate$/i }).parentElement!;

describe('Reviewing a reading', () => {
  test('playback and time are available the instant the teacher unlocks, before any analysis', async () => {
    const transcriber = new FakeTranscriber();
    transcriber.hold();
    const h = await renderApp({ transcriber });
    await pasteRoster(h, 'Ada Lovelace');
    await recordReading(h, 'Ada Lovelace', { seconds: 60 });
    expect(screen.getByText(/time spent reading/i).parentElement).toHaveTextContent(/1:00\.0|59\.\d s/);
    expect(screen.getByRole('heading', { name: /recording/i })).toBeInTheDocument();
    transcriber.finish();
  });

  test('with no passage the teacher sees no number and a prompt to choose one', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace');
    await recordReading(h, 'Ada Lovelace');
    expect(rateSection()).toHaveTextContent(/choose a passage to get a rate/i);
    expect(rateSection()).not.toHaveTextContent(/\d/);
  });

  test('the app identifies the passage from what it heard and flags completion', async () => {
    const transcriber = new FakeTranscriber();
    transcriber.hears(CAMP_CLEAN);
    const h = await renderApp({ transcriber });
    await setUpCampAndShip(h);
    await recordReading(h, 'Ada Lovelace');
    await waitFor(() => expect(screen.getByText('Camp', { selector: 'strong' })).toBeInTheDocument());
    expect(screen.getByText(/identified from the recording/i)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`reach word ${CAMP_WORDS} of ${CAMP_WORDS}`))).toBeInTheDocument();
  });

  test('the rate appears only after the teacher marks the reading complete, then from the passage word count', async () => {
    const transcriber = new FakeTranscriber();
    transcriber.hears(CAMP_CLEAN);
    const h = await renderApp({ transcriber });
    await setUpCampAndShip(h);
    await recordReading(h, 'Ada Lovelace', { seconds: 60 });
    await waitFor(() => expect(screen.getByText('Camp', { selector: 'strong' })).toBeInTheDocument());
    expect(rateSection()).toHaveTextContent(/mark the reading complete to get a rate/i);
    await h.user.click(screen.getByRole('button', { name: /^complete$/i }));
    // Transcript-refined bounds come from the fake's evenly spaced words: 0.5 s to ~10.3 s.
    const [reading] = await h.storage.listReadings();
    const seconds = reading.transcriptBounds!.end - reading.transcriptBounds!.start;
    expect(rateSection()).toHaveTextContent(`${Math.round((CAMP_WORDS / seconds) * 60)} words per minute`);
  });

  test('when unsure, the app offers candidates and one tap resolves it', async () => {
    const transcriber = new FakeTranscriber();
    transcriber.hears(CAMP_CLEAN);
    const h = await renderApp({ transcriber });
    await setUpCampAndShip(h);
    await goTo(h, 'Passages');
    await pastePassage(h, 'Camp (blue tent)', CAMP_TEXT_VARIANT);
    await goTo(h, 'Roster');
    await recordReading(h, 'Ada Lovelace');
    await screen.findByText(/not sure which passage/i);
    const passageSection = screen.getByRole('heading', { name: /^passage$/i }).parentElement!;
    expect(within(passageSection).getByRole('button', { name: 'Camp' })).toBeInTheDocument();
    expect(within(passageSection).getByRole('button', { name: 'Camp (blue tent)' })).toBeInTheDocument();
    await h.user.click(within(passageSection).getByRole('button', { name: 'Camp' }));
    expect(screen.getByText('Camp', { selector: 'strong' })).toBeInTheDocument();
  });

  test('the teacher changes the identified passage to any stored passage', async () => {
    const transcriber = new FakeTranscriber();
    transcriber.hears(CAMP_CLEAN);
    const h = await renderApp({ transcriber });
    await setUpCampAndShip(h);
    await recordReading(h, 'Ada Lovelace');
    await waitFor(() => expect(screen.getByText('Camp', { selector: 'strong' })).toBeInTheDocument());
    await h.user.click(screen.getByRole('button', { name: /change passage/i }));
    await h.user.click(within(screen.getByRole('group', { name: /choose passage/i })).getByRole('button', { name: 'Ship' }));
    expect(screen.getByText('Ship', { selector: 'strong' })).toBeInTheDocument();
    expect((await h.storage.listReadings())[0].passageId).toBe((await h.storage.listPassages()).find((p) => p.title === 'Ship')!.id);
  });

  test('the teacher pastes a new passage from review and it is assigned to this reading', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace');
    await recordReading(h, 'Ada Lovelace');
    await h.user.click(screen.getByRole('button', { name: /paste new passage/i }));
    await h.user.type(screen.getByLabelText(/^title$/i), 'Camp');
    await h.user.click(screen.getByLabelText(/^text$/i));
    await h.user.paste(CAMP_TEXT);
    await h.user.click(screen.getByRole('button', { name: /save and use for this reading/i }));
    expect(screen.getByText('Camp', { selector: 'strong' })).toBeInTheDocument();
    expect(await h.storage.listPassages()).toHaveLength(1);
  });

  test('a reading that stops early is flagged, and the teacher can still mark it complete', async () => {
    const transcriber = new FakeTranscriber();
    transcriber.hears(CAMP_STOPS_EARLY);
    const h = await renderApp({ transcriber });
    await setUpCampAndShip(h);
    await recordReading(h, 'Ada Lovelace');
    await screen.findByText(/may not have reached the end/i);
    await h.user.click(screen.getByRole('button', { name: /^complete$/i }));
    expect(screen.getByRole('button', { name: /^complete$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(rateSection()).toHaveTextContent(/words per minute/);
  });

  test('marking incomplete removes the rate', async () => {
    const transcriber = new FakeTranscriber();
    transcriber.hears(CAMP_CLEAN);
    const h = await renderApp({ transcriber });
    await setUpCampAndShip(h);
    await recordReading(h, 'Ada Lovelace');
    await waitFor(() => expect(screen.getByText('Camp', { selector: 'strong' })).toBeInTheDocument());
    await h.user.click(screen.getByRole('button', { name: /^complete$/i }));
    expect(rateSection()).toHaveTextContent(/words per minute/);
    await h.user.click(screen.getByRole('button', { name: /^incomplete$/i }));
    expect(rateSection()).not.toHaveTextContent(/words per minute/);
  });

  test('errors are blank by default and give words correct per minute when entered', async () => {
    const transcriber = new FakeTranscriber();
    transcriber.hears(CAMP_CLEAN);
    const h = await renderApp({ transcriber });
    await setUpCampAndShip(h);
    await recordReading(h, 'Ada Lovelace');
    await waitFor(() => expect(screen.getByText('Camp', { selector: 'strong' })).toBeInTheDocument());
    await h.user.click(screen.getByRole('button', { name: /^complete$/i }));
    const errors = screen.getByLabelText(/misread words/i);
    expect(errors).toHaveValue(null);
    expect(rateSection()).not.toHaveTextContent(/words correct per minute/);
    await h.user.type(errors, '10');
    await h.user.tab();
    await waitFor(() => expect(rateSection()).toHaveTextContent(/words correct per minute/));
    expect((await h.storage.listReadings())[0].errors).toBe(10);
  });

  test('the three timings are shown and the teacher can reset to tap-to-tap', async () => {
    const transcriber = new FakeTranscriber();
    transcriber.hears(CAMP_CLEAN);
    const h = await renderApp({ transcriber });
    await setUpCampAndShip(h);
    await recordReading(h, 'Ada Lovelace', { seconds: 60 });
    const timing = () => screen.getByRole('group', { name: /^timing$/i });
    await waitFor(() => expect(within(timing()).getByRole('button', { name: /first to last word/i })).toBeEnabled());
    expect(within(timing()).getByRole('button', { name: /tap to tap: 1:00\.0/i })).toBeInTheDocument();
    expect(within(timing()).getByRole('button', { name: /trimmed silence: 58\.\d s/i })).toBeInTheDocument();
    expect(within(timing()).getByRole('button', { name: /first to last word/i })).toHaveAttribute('aria-pressed', 'true');
    await h.user.click(screen.getByRole('button', { name: /reset to tap-to-tap/i }));
    expect(within(timing()).getByRole('button', { name: /tap to tap/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/time spent reading/i).parentElement).toHaveTextContent('1:00.0');
  });

  test('the review screen updates itself when background analysis finishes', async () => {
    const transcriber = new FakeTranscriber();
    transcriber.hears(CAMP_CLEAN);
    transcriber.hold();
    const h = await renderApp({ transcriber });
    await setUpCampAndShip(h);
    await recordReading(h, 'Ada Lovelace');
    expect(within(screen.getByRole('main')).getByRole('status')).toHaveTextContent(/listening to the recording/i);
    expect(screen.queryByText('Camp', { selector: 'strong' })).not.toBeInTheDocument();
    transcriber.finish();
    await waitFor(() => expect(screen.getByText('Camp', { selector: 'strong' })).toBeInTheDocument());
  });

  test('readings queue up while the previous one is still being analysed', async () => {
    const transcriber = new FakeTranscriber();
    transcriber.hears(CAMP_CLEAN);
    transcriber.hold();
    const h = await renderApp({ transcriber });
    await setUpCampAndShip(h);
    await recordReading(h, 'Ada Lovelace');
    await h.user.click(screen.getByRole('button', { name: /record again/i }));
    await h.user.click(screen.getByRole('button', { name: /^back$/i }));
    await goTo(h, 'Roster');
    await recordReading(h, 'Ada Lovelace');
    expect(within(screen.getByRole('navigation')).getByRole('status')).toHaveTextContent(/analysing 2 readings/i);
    transcriber.finish();
    await waitFor(() => expect(within(screen.getByRole('navigation')).queryByRole('status')).not.toBeInTheDocument());
    const readings = await h.storage.listReadings();
    expect(readings.map((r) => r.analysis)).toEqual(['done', 'done']);
  });

  test('a note travels with the reading', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace');
    await recordReading(h, 'Ada Lovelace');
    await h.user.type(screen.getByLabelText(/^note$/i), 'new glasses');
    await h.user.tab();
    await waitFor(async () => expect((await h.storage.listReadings())[0].note).toBe('new glasses'));
  });

  test('deleting audio keeps the timing', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace');
    await recordReading(h, 'Ada Lovelace', { seconds: 30 });
    await h.user.click(screen.getByRole('button', { name: /delete audio/i }));
    expect(await screen.findByText(/audio deleted; the timing and rate are kept/i)).toBeInTheDocument();
    expect(screen.getByText(/time spent reading/i).parentElement).toHaveTextContent(/30\.0 s|29\.\d s/);
    const [reading] = await h.storage.listReadings();
    expect(await h.storage.getAudio(reading.id)).toBeUndefined();
  });

  test('everything works when the speech model never loads', async () => {
    const transcriber = new FakeTranscriber();
    transcriber.loadError = new Error('no WebAssembly');
    const h = await renderApp({ transcriber });
    await setUpCampAndShip(h);
    await recordReading(h, 'Ada Lovelace', { seconds: 60 });
    await waitFor(async () => expect((await h.storage.listReadings())[0].analysis).toBe('done'));
    await h.user.click(screen.getByRole('button', { name: /choose passage/i }));
    await h.user.click(within(screen.getByRole('group', { name: /choose passage/i })).getByRole('button', { name: 'Camp' }));
    await h.user.click(screen.getByRole('button', { name: /^complete$/i }));
    // Silence-trimmed bounds (58 s of tone) are the most refined available.
    expect(rateSection()).toHaveTextContent(new RegExp(`${Math.round((CAMP_WORDS / 58) * 60)} words per minute`));
  });
});
