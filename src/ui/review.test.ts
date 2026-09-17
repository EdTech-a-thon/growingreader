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
const timing = () => screen.getByRole('group', { name: /^timing$/i });
const passageSelect = () => screen.getByRole('button', { name: /^(choose passage|.+ · \d+ words)$/i });
const markComplete = (h: Awaited<ReturnType<typeof renderApp>>) => h.user.click(screen.getByRole('button', { name: /^complete$/i }));

describe('Reviewing a reading', () => {
  test('playback and time are available the instant the teacher unlocks, before any analysis', async () => {
    const transcriber = new FakeTranscriber();
    transcriber.hold();
    const h = await renderApp({ transcriber });
    await pasteRoster(h, 'Ada Lovelace');
    await recordReading(h, 'Ada Lovelace', { seconds: 60 });
    expect(screen.getByText(/time spent reading/i).parentElement).toHaveTextContent(/1:00\.0|5[89]\.\d s/);
    expect(timing()).toHaveTextContent(/tap to tap|silence cut/i);
    expect(screen.getByRole('heading', { name: /recording/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^play$/i })).toBeInTheDocument();
    transcriber.finish();
  });

  test('with no passage the teacher sees no number and a prompt to choose one', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace');
    await recordReading(h, 'Ada Lovelace');
    expect(rateSection()).toHaveTextContent(/choose a passage to get a rate/i);
    expect(rateSection()).not.toHaveTextContent(/\d/);
  });

  test('with no passage but a transcript, the teacher gets an estimated rate, clearly marked', async () => {
    const transcriber = new FakeTranscriber();
    transcriber.hears(CAMP_CLEAN);
    const h = await renderApp({ transcriber });
    await pasteRoster(h, 'Ada Lovelace');
    await recordReading(h, 'Ada Lovelace', { seconds: 60 });
    await waitFor(() => expect(rateSection()).toHaveTextContent(/estimated/i));
    // Silence-trimmed bounds (58 s of tone) are the most refined available without a passage.
    const heard = countWords(CAMP_CLEAN);
    expect(rateSection()).toHaveTextContent(new RegExp(`≈${Math.round((heard / 58) * 60)} words per minute, estimated`));
    expect(rateSection()).toHaveTextContent(/choose a passage to get a rate/i);
    // The estimate is review-only: nothing reaches the readings table, the chart or the roster.
    await h.user.click(screen.getByRole('button', { name: /back to ada/i }));
    expect(screen.queryByRole('img', { name: /rate over time/i })).not.toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByRole('row')[1]).toHaveTextContent(/—.*Complete/);
    await goTo(h, 'Roster');
    expect(screen.getByRole('button', { name: 'Ada Lovelace' })).toHaveAccessibleDescription(/^last read sep 15, 2026$/i);
  });

  test('the app identifies the passage from what it heard and flags completion', async () => {
    const transcriber = new FakeTranscriber();
    transcriber.hears(CAMP_CLEAN);
    const h = await renderApp({ transcriber });
    await setUpCampAndShip(h);
    await recordReading(h, 'Ada Lovelace');
    await waitFor(() => expect(passageSelect()).toHaveTextContent(/^Camp ·/));
    expect(screen.getByText(/identified from the recording/i)).toBeInTheDocument();
    expect(screen.getByText(/heard the student reach the end/i)).toBeInTheDocument();
    // ADR-0002: nothing derived from the transcript is shown as a number.
    expect(screen.getByRole('heading', { name: /^completion$/i }).parentElement).not.toHaveTextContent(/\d/);
  });

  test('a reading is complete by default, so the rate appears as soon as the passage is known', async () => {
    const transcriber = new FakeTranscriber();
    transcriber.hears(CAMP_CLEAN);
    const h = await renderApp({ transcriber });
    await setUpCampAndShip(h);
    await recordReading(h, 'Ada Lovelace', { seconds: 60 });
    expect(screen.getByRole('button', { name: /^complete$/i })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(passageSelect()).toHaveTextContent(/^Camp ·/));
    await waitFor(() => expect(screen.getByText(/heard the student reach the end/i)).toBeInTheDocument());
    // Transcript-refined bounds come from the fake's evenly spaced words: 0.5 s to ~10.3 s.
    const [reading] = await h.storage.listReadings();
    const seconds = reading.transcriptBounds!.end - reading.transcriptBounds!.start;
    expect(rateSection()).toHaveTextContent(`${Math.round((CAMP_WORDS / seconds) * 60)} words per minute`);
    expect(rateSection()).not.toHaveTextContent(/estimated/i);
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
    const candidates = screen.getByRole('group', { name: /passage candidates/i });
    expect(within(candidates).getByRole('button', { name: 'Camp' })).toBeInTheDocument();
    expect(within(candidates).getByRole('button', { name: 'Camp (blue tent)' })).toBeInTheDocument();
    await h.user.click(within(candidates).getByRole('button', { name: 'Camp' }));
    expect(passageSelect()).toHaveTextContent(/^Camp ·/);
  });

  test('the teacher changes the identified passage to any stored passage', async () => {
    const transcriber = new FakeTranscriber();
    transcriber.hears(CAMP_CLEAN);
    const h = await renderApp({ transcriber });
    await setUpCampAndShip(h);
    await recordReading(h, 'Ada Lovelace');
    await waitFor(() => expect(passageSelect()).toHaveTextContent(/^Camp ·/));
    await h.user.click(passageSelect());
    await h.user.click(within(screen.getByRole('group', { name: /choose passage/i })).getByRole('button', { name: /^Ship/ }));
    expect(passageSelect()).toHaveTextContent(/^Ship ·/);
    expect((await h.storage.listReadings())[0].passageId).toBe((await h.storage.listPassages()).find((p) => p.title === 'Ship')!.id);
  });

  test('the teacher pastes a new passage from review and it is assigned to this reading', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace');
    await recordReading(h, 'Ada Lovelace');
    await h.user.click(passageSelect());
    await h.user.click(screen.getByRole('button', { name: /paste a new passage/i }));
    await h.user.type(screen.getByLabelText(/^title$/i), 'Camp');
    await h.user.click(screen.getByLabelText(/^text$/i));
    await h.user.paste(CAMP_TEXT);
    await h.user.click(screen.getByRole('button', { name: /save and use for this reading/i }));
    expect(passageSelect()).toHaveTextContent(/^Camp ·/);
    expect(await h.storage.listPassages()).toHaveLength(1);
  });

  test('a reading that stops early loses its default Complete and waits for the teacher, who can still mark it complete', async () => {
    const transcriber = new FakeTranscriber();
    transcriber.hears(CAMP_STOPS_EARLY);
    const h = await renderApp({ transcriber });
    await setUpCampAndShip(h);
    await recordReading(h, 'Ada Lovelace');
    await screen.findByText(/may not have reached the end/i);
    expect(screen.getByRole('button', { name: /^complete$/i })).toHaveAttribute('aria-pressed', 'false');
    expect(rateSection()).not.toHaveTextContent(/\d words per minute$/);
    expect((await h.storage.listReadings())[0].completion).toBe('pending');
    await markComplete(h);
    expect(screen.getByRole('button', { name: /^complete$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(rateSection()).toHaveTextContent(/words per minute/);
  });

  test('the teacher’s choice stands even when the analysis arrives afterwards', async () => {
    const transcriber = new FakeTranscriber();
    transcriber.hears(CAMP_STOPS_EARLY);
    transcriber.hold();
    const h = await renderApp({ transcriber });
    await setUpCampAndShip(h);
    await recordReading(h, 'Ada Lovelace', { passage: 'Camp' });
    await markComplete(h);
    transcriber.finish();
    await screen.findByText(/may not have reached the end/i);
    expect(screen.getByRole('button', { name: /^complete$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(rateSection()).toHaveTextContent(/words per minute/);
  });

  test('marking incomplete removes the rate', async () => {
    const transcriber = new FakeTranscriber();
    transcriber.hears(CAMP_CLEAN);
    const h = await renderApp({ transcriber });
    await setUpCampAndShip(h);
    await recordReading(h, 'Ada Lovelace');
    await waitFor(() => expect(passageSelect()).toHaveTextContent(/^Camp ·/));
    expect(rateSection()).toHaveTextContent(/words per minute/);
    await h.user.click(screen.getByRole('button', { name: /^incomplete$/i }));
    expect(rateSection()).not.toHaveTextContent(/words per minute/);
  });

  test('the trim is automatic and refines as analysis lands: silence first, then first-to-last word', async () => {
    const transcriber = new FakeTranscriber();
    transcriber.hears(CAMP_CLEAN);
    transcriber.hold();
    const h = await renderApp({ transcriber });
    await setUpCampAndShip(h);
    await recordReading(h, 'Ada Lovelace', { seconds: 60 });
    await waitFor(() => expect(timing()).toHaveTextContent(/auto-trimmed: silence cut from both ends · 1\.0 s → 59\.0 s/i));
    transcriber.finish();
    await waitFor(() => expect(timing()).toHaveTextContent(/auto-trimmed: first word to last word · 0\.5 s → \d+\.\d s/i));
    expect(screen.getByRole('slider', { name: /start of reading/i })).toHaveAttribute('aria-valuenow', '0.5');
    expect(screen.queryByRole('button', { name: /reset to auto/i })).not.toBeInTheDocument();
  });

  test('the teacher drags the handles to adjust the trim; her bounds stand until she resets to auto', async () => {
    const transcriber = new FakeTranscriber();
    transcriber.hears(CAMP_CLEAN);
    transcriber.hold();
    const h = await renderApp({ transcriber });
    await setUpCampAndShip(h);
    await recordReading(h, 'Ada Lovelace', { seconds: 60 });
    await waitFor(() => expect(timing()).toHaveTextContent(/silence cut/i));
    // Handles are sliders: arrow keys nudge by 0.1 s, shift by 1 s (a pointer drag does the same in the browser).
    const start = screen.getByRole('slider', { name: /start of reading/i });
    const end = screen.getByRole('slider', { name: /end of reading/i });
    start.focus();
    await h.user.keyboard('{ArrowRight}{ArrowRight}');
    end.focus();
    await h.user.keyboard('{Shift>}{ArrowLeft}{/Shift}');
    await waitFor(() => expect(timing()).toHaveTextContent(/adjusted by hand · 1\.2 s → 58\.0 s/i));
    expect(screen.getByText(/time spent reading/i).parentElement).toHaveTextContent('56.8 s');
    expect((await h.storage.listReadings())[0]).toMatchObject({ timing: 'manual', manualBounds: { start: 1.2, end: 58 } });
    // The transcript arriving later does not move her handles.
    transcriber.finish();
    await waitFor(async () => expect((await h.storage.listReadings())[0].transcriptBounds).toBeDefined());
    expect(timing()).toHaveTextContent(/adjusted by hand · 1\.2 s → 58\.0 s/i);
    await h.user.click(screen.getByRole('button', { name: /reset to auto/i }));
    expect(timing()).toHaveTextContent(/first word to last word · 0\.5 s/i);
    expect((await h.storage.listReadings())[0].timing).toBe('auto');
  });

  test('handles cannot cross or leave the recording', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace');
    await recordReading(h, 'Ada Lovelace', { seconds: 10 });
    await waitFor(() => expect(timing()).toHaveTextContent(/1\.0 s → 9\.0 s/));
    // End on the start handle: it stops 0.2 s short of the end handle rather than crossing it.
    screen.getByRole('slider', { name: /start of reading/i }).focus();
    await h.user.keyboard('{End}');
    await waitFor(() => expect(timing()).toHaveTextContent(/8\.8 s → 9\.0 s/));
    screen.getByRole('slider', { name: /end of reading/i }).focus();
    await h.user.keyboard('{Home}');
    await waitFor(() => expect(timing()).toHaveTextContent(/8\.8 s → 9\.0 s/));
    await h.user.keyboard('{End}');
    await waitFor(() => expect(timing()).toHaveTextContent(/8\.8 s → 10\.0 s/));
  });

  test('the review screen updates itself when background analysis finishes', async () => {
    const transcriber = new FakeTranscriber();
    transcriber.hears(CAMP_CLEAN);
    transcriber.hold();
    const h = await renderApp({ transcriber });
    await setUpCampAndShip(h);
    await recordReading(h, 'Ada Lovelace');
    expect(within(screen.getByRole('main')).getByRole('status')).toHaveTextContent(/listening to the recording/i);
    expect(passageSelect()).toHaveTextContent(/^choose passage$/i);
    transcriber.finish();
    await waitFor(() => expect(passageSelect()).toHaveTextContent(/^Camp ·/));
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
    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
    await recordReading(h, 'Ada Lovelace');
    expect(within(screen.getByRole('banner')).getByRole('status')).toHaveTextContent(/analysing 2 readings/i);
    await h.user.click(screen.getByRole('button', { name: /back to ada/i }));
    await goTo(h, 'Roster');
    expect(within(screen.getByLabelText(/still being analysed/i)).getAllByRole('listitem')).toHaveLength(2);
    transcriber.finish();
    await waitFor(() => expect(within(screen.getByRole('banner')).queryByRole('status')).not.toBeInTheDocument());
    expect(screen.queryByLabelText(/still being analysed/i)).not.toBeInTheDocument();
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
    expect(timing()).toHaveTextContent(/\d\.\d s → (30\.0|29\.\d) s/);
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
    await h.user.click(passageSelect());
    await h.user.click(within(screen.getByRole('group', { name: /choose passage/i })).getByRole('button', { name: /^Camp/ }));
    // Silence-trimmed bounds (58 s of tone) are the most refined available.
    expect(rateSection()).toHaveTextContent(new RegExp(`${Math.round((CAMP_WORDS / 58) * 60)} words per minute`));
  });
});
