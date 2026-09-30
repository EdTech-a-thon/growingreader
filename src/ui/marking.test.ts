import { fireEvent, screen, waitFor, within } from '@testing-library/svelte';
import { renderApp, pasteRoster, pastePassage, goTo, recordReading, setCompletion, type Harness } from '../test/harness';
import { FakeTranscriber } from '../adapters/transcriber/FakeTranscriber';
import { FakeAligner } from '../adapters/aligner/FakeAligner';
import { CAMP_CLEAN, CAMP_TEXT, SHIP_TEXT } from '../test/fixtures/passages';
import { rate } from '../domain/rate';
import type { Emissions } from '../analysis/ctc';
import type { Transcript } from '../domain/types';

/**
 * jsdom plays nothing. Give the marking screen an audio element whose play, pause and seek
 * behave, and remember where each play started.
 */
function fakePlayback() {
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const times = new WeakMap<HTMLMediaElement, number>();
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return times.get(this) ?? 0;
    },
    set(this: HTMLMediaElement, seconds: number) {
      times.set(this, seconds);
    },
  });
  const playedFrom: number[] = [];
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    playedFrom.push(this.currentTime);
    Object.defineProperty(this, 'paused', { value: false, configurable: true });
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: true, configurable: true });
    this.dispatchEvent(new Event('pause'));
  });
  return playedFrom;
}

/** Play the recording from `from` to `to` seconds, as the browser would report it. */
async function playThrough(from: number, to: number) {
  const audio = document.querySelector('audio')!;
  await audio.play();
  for (let t = from; t <= to; t += 0.1) {
    audio.currentTime = t;
    await fireEvent(audio, new Event('timeupdate'));
  }
  audio.pause();
}

/** A complete reading of Camp, heard as `heard`, on its review screen. */
async function reviewCampReading(heard: string | Transcript = CAMP_CLEAN, aligner?: FakeAligner) {
  const playedFrom = fakePlayback();
  const transcriber = new FakeTranscriber();
  transcriber.hears(heard);
  const h = await renderApp({ transcriber, aligner });
  await goTo(h, 'Passages');
  await pastePassage(h, 'Camp', CAMP_TEXT);
  await pastePassage(h, 'Ship', SHIP_TEXT);
  await goTo(h, 'Roster');
  await pasteRoster(h, 'Ada Lovelace');
  await recordReading(h, 'Ada Lovelace', { seconds: 60, passage: 'Camp' });
  await waitFor(() => expect(screen.getByText(/heard the student reach the end|stopped before the end/i)).toBeInTheDocument());
  return { h, playedFrom };
}

async function openMarking(h: Harness) {
  await h.user.click(screen.getByRole('button', { name: /^mark accuracy$/i }));
  await screen.findByRole('heading', { name: /mark reading · ada lovelace/i });
  await screen.findByRole('group', { name: 'Paragraph 1' });
  // The recording loads a moment after the screen.
  await waitFor(() => expect(screen.getByRole('button', { name: /^play$/i })).toBeEnabled());
  // The first time on this device, a welcome; these tests are about the screen behind it.
  const welcome = screen.queryByRole('dialog', { name: 'Marking a reading' });
  if (welcome) await h.user.click(within(welcome).getByRole('button', { name: /not now/i }));
}

const passageWord = (name: string | RegExp) => within(screen.getByRole('group', { name: 'Paragraph 1' })).getAllByRole('button', { name })[0];
const status = () => screen.getByRole('status', { name: 'Marks' });
const rateSection = () => screen.getByRole('heading', { name: /^rate$/i }).parentElement!;
const storedReading = async (h: Harness) => (await h.storage.listReadings())[0];

afterEach(() => vi.restoreAllMocks());

const gutter = () => within(screen.getByRole('group', { name: /what was said/i }));
const heardWord = (name: string | RegExp) => gutter().getAllByRole('button', { name })[0];
const card = () => within(screen.getByRole('region', { name: 'Sentence' }));
const sentenceWord = (name: string | RegExp) => within(screen.getByRole('group', { name: 'The sentence' })).getAllByRole('button', { name })[0];
const choice = (name: RegExp) => card().getByRole('button', { name });

/** Let sound play up to `seconds`: the stop set for it lands. */
async function soundReaches(seconds: number) {
  const audio = document.querySelector('audio')!;
  audio.currentTime = seconds;
  await fireEvent(audio, new Event('playing'));
  await waitFor(() => expect(audio.paused).toBe(true));
  return audio;
}

describe('Marking is reconstructing the reading against the passage', () => {
  test('the recording and the sentence on the left, the whole passage on the right', async () => {
    const { h } = await reviewCampReading();
    await openMarking(h);
    expect(window.location.pathname).toMatch(/^\/readings\/[^/]+\/mark$/);
    expect(screen.getByRole('region', { name: 'Passage' })).toBeInTheDocument();
    expect(card().getByText(/no sentence selected/i)).toBeInTheDocument();
    expect(heardWord(/^Sam$/)).toHaveAttribute('data-status', 'match');
    expect(status()).toHaveTextContent('Marked · 0 errors');
  });

  test('tapping a passage word picks its sentence and plays all of it', async () => {
    const { h, playedFrom } = await reviewCampReading();
    await openMarking(h);
    await h.user.click(passageWord('went'));
    const review = (await storedReading(h)).reviewedTranscript!;
    expect(playedFrom.at(-1)).toBeCloseTo(review.words[0].span!.start);
    expect(card().getByText(/sentence 1 of/i)).toBeInTheDocument();
    expect(sentenceWord('camp.')).toBeInTheDocument();
    // The sentence is shaded on the passage.
    expect(passageWord('camp.')).toHaveClass('in-sentence');
    expect(passageWord('At')).not.toHaveClass('in-sentence');
    const audio = await soundReaches(review.words[5].span!.end);
    expect(audio.currentTime).toBeCloseTo(review.words[5].span!.end);
    // On to the next sentence, and it plays.
    await h.user.click(card().getByRole('button', { name: /next sentence/i }));
    expect(playedFrom.at(-1)).toBeCloseTo(review.words[6].span!.start);
    expect(card().getByText(/sentence 2 of/i)).toBeInTheDocument();
  });

  test('a misheard word is highlighted yellow in both places; "said the passage" settles it, and the words stay picked', async () => {
    const { h, playedFrom } = await reviewCampReading(CAMP_CLEAN.replace('Sam and Pam went', 'Salmon Pam went'));
    await openMarking(h);
    expect(status()).toHaveTextContent('1 spot to check');
    expect(heardWord(/^Salmon/)).toHaveAttribute('data-status', 'open');
    await h.user.click(passageWord('Sam, to check'));
    expect(playedFrom.at(-1)).toBeCloseTo(0);
    expect(card().getByText((_, el) => !!el?.classList.contains('repair-heard'))).toHaveTextContent('Heard Salmon for Sam and');
    await h.user.click(choice(/said the passage/i));
    await waitFor(() => expect(status()).toHaveTextContent('Marked · 0 errors'));
    expect(heardWord(/^and$/)).toHaveAttribute('data-status', 'match');
    const review = (await storedReading(h)).reviewedTranscript!;
    expect(review.heard.slice(0, 2).map((w) => [w.text, w.origin])).toEqual([['Sam', 'teacher'], ['and', 'teacher']]);
    expect(review.source.words[0].text).toBe('Salmon');
    expect(card().getByText((_, el) => !!el?.classList.contains('repair-heard'))).toHaveTextContent('Heard Sam and for Sam and');
    expect(card().getByText(/^read as printed$/i)).toBeInTheDocument();
  });

  test('hovering a choice previews its marking on the passage and the waveform, and letting go puts it back', async () => {
    const { h } = await reviewCampReading(CAMP_CLEAN.replace('Sam and Pam went', 'Salmon Pam went'));
    await openMarking(h);
    await h.user.click(passageWord('Sam, to check'));
    await h.user.hover(choice(/said the passage/i));
    expect(passageWord(/^Sam/)).toHaveAttribute('data-status', 'right');
    expect(heardWord(/^and$/)).toBeInTheDocument();
    await h.user.hover(choice(/heard it right/i));
    expect(passageWord(/^Sam/)).toHaveAttribute('data-status', 'wrong');
    await h.user.unhover(choice(/heard it right/i));
    expect(passageWord(/^Sam/)).toHaveAttribute('data-status', 'open');
    expect((await storedReading(h)).reviewedTranscript!.heard[0].text).toBe('Salmon');
  });

  test('the pencil: type what was said; what matches is right, the rest wrong', async () => {
    const { h } = await reviewCampReading(CAMP_CLEAN.replace('Sam and Pam went', 'Salmon Pam went'));
    await openMarking(h);
    await h.user.click(heardWord(/^Salmon/));
    await h.user.click(choice(/edit what was said/i));
    const box = card().getByRole('textbox', { name: /what was said/i });
    expect(box).toHaveValue('Salmon');
    await h.user.clear(box);
    await h.user.type(box, 'Sam{Enter}');
    await waitFor(() => expect(status()).toHaveTextContent('Marked · 1 error'));
  });

  test('tapping a spot plays exactly that spot, the same every time; settling it stays put', async () => {
    const { h, playedFrom } = await reviewCampReading(CAMP_CLEAN.replace('The tent was red', 'The tint was red'));
    await openMarking(h);
    const review = (await storedReading(h)).reviewedTranscript!;
    await h.user.click(passageWord('tent, to check'));
    for (let tap = 0; tap < 2; tap++) {
      if (tap > 0) await h.user.click(sentenceWord('tent, to check'));
      expect(playedFrom.at(-1)).toBeCloseTo(review.heard[13].end);
      const audio = await soundReaches(review.heard[15].start);
      expect(audio.currentTime).toBeCloseTo(review.heard[15].start);
    }
    const plays = playedFrom.length;
    await h.user.click(choice(/heard it right/i));
    await waitFor(() => expect(card().getByText(/an error: substitution/i)).toBeInTheDocument());
    expect(playedFrom).toHaveLength(plays);
    expect(status()).toHaveTextContent('Marked · 1 error');
    expect(heardWord(/^tint/)).toHaveAttribute('data-status', 'wrong');
  });

  test('a skipped line is one spot, settled as not read in one tap', async () => {
    const { h } = await reviewCampReading(CAMP_CLEAN.replace('At night the wind hit the flap. Flap flap flap went the tent. Sam did not like the sound. ', ''));
    await openMarking(h);
    await h.user.click(passageWord('At, to check'));
    expect(card().getByText((_, el) => !!el?.classList.contains('repair-heard'))).toHaveTextContent('Heard nothing for At night');
    await h.user.click(choice(/nothing was said/i));
    await waitFor(() => expect(status()).toHaveTextContent('Marked · 19 errors'));
  });

  test('tapping a heard word plays from it to the end of its sentence', async () => {
    const { h, playedFrom } = await reviewCampReading();
    await openMarking(h);
    const review = (await storedReading(h)).reviewedTranscript!;
    await h.user.click(heardWord(/^Pam$/));
    expect(playedFrom.at(-1)).toBeCloseTo(review.heard[2].start);
    expect(passageWord('camp.')).toHaveClass('in-sentence');
    expect(passageWord('At')).not.toHaveClass('in-sentence');
  });

  test('a green word the recogniser "corrected" can be edited to what was said, or said to be not said at all', async () => {
    const { h } = await reviewCampReading();
    await openMarking(h);
    await h.user.click(passageWord('went'));
    await h.user.click(sentenceWord('went'));
    expect(choice(/said the passage/i)).toHaveAttribute('data-current', 'true');
    await h.user.click(choice(/edit what was said/i));
    const box = card().getByRole('textbox', { name: /what was said/i });
    await h.user.clear(box);
    await h.user.type(box, 'want{Enter}');
    await waitFor(() => expect(status()).toHaveTextContent('Marked · 1 error'));
    await h.user.click(sentenceWord('to'));
    await h.user.click(choice(/nothing was said/i));
    await waitFor(() => expect(status()).toHaveTextContent('Marked · 2 errors'));
  });

  test('a heard word dragged along the recording is placed there by hand', async () => {
    const { h } = await reviewCampReading();
    await openMarking(h);
    const before = (await storedReading(h)).reviewedTranscript!.heard[1];
    const word = heardWord(/^and$/);
    // jsdom lays nothing out; give the word a width so the drag grabs its middle, not an edge.
    vi.spyOn(word, 'getBoundingClientRect').mockReturnValue({ left: 30, right: 70, top: 0, bottom: 28, width: 40, height: 28, x: 30, y: 0, toJSON: () => ({}) });
    await fireEvent.pointerDown(word, { button: 0, clientX: 50, pointerId: 1 });
    await fireEvent.pointerMove(window, { clientX: 45, pointerId: 1, altKey: true });
    await fireEvent.pointerUp(window, { pointerId: 1 });
    await waitFor(async () => expect((await storedReading(h)).reviewedTranscript!.heard[1].timing).toBe('manual'));
    expect((await storedReading(h)).reviewedTranscript!.heard[1].start).toBeLessThan(before.start);
  });

  test('the reading is marked once nothing is left to check, whether or not it was all listened to', async () => {
    const { h } = await reviewCampReading(CAMP_CLEAN.replace('The tent was red', 'The tint was red'));
    await openMarking(h);
    await h.user.click(heardWord(/^tint/));
    await h.user.click(choice(/said the passage/i));
    await waitFor(async () => expect((await storedReading(h)).markedAt).toBeDefined());
    expect(status()).toHaveTextContent('Marked · 0 errors · 100% accuracy');

    const reading = await storedReading(h);
    await h.user.click(screen.getByRole('button', { name: /back to review/i }));
    const [passage] = await h.storage.listPassages();
    expect(rateSection()).toHaveTextContent('100% accuracy');
    expect(rateSection()).toHaveTextContent(`${Math.round(rate(reading, passage)!)} words correct per minute`);
    // And it goes on the student's chart, accuracy with the rates.
    await h.user.click(screen.getByRole('button', { name: /back to ada/i }));
    expect(within(screen.getByRole('list', { name: /readings on the chart/i })).getByRole('button')).toHaveTextContent(/100% accuracy/);
  });

  test('a long pause shows as the pause, between the words, and counts as a hesitation', async () => {
    // Read clean, but four seconds went by before "The tent was red".
    let at = 0.5;
    const words = CAMP_CLEAN.split(' ').map((text, i) => {
      if (i === 12) at += 4;
      const w = { text, start: at, end: at + 0.3 };
      at += 0.4;
      return w;
    });
    const { h } = await reviewCampReading({ text: CAMP_CLEAN, words });
    await openMarking(h);
    expect(within(screen.getByRole('group', { name: 'Paragraph 1' })).getByRole('img', { name: /paused 4\.\d s: a hesitation error/i })).toBeInTheDocument();
    expect(passageWord(/^The$/)).not.toHaveAttribute('data-mark');
    expect(status()).toHaveTextContent('Marked · 1 error');
  });

  test('dragging across a phrase in the sentence picks it, to hear and settle together', async () => {
    const { h, playedFrom } = await reviewCampReading();
    await openMarking(h);
    await h.user.click(passageWord('went'));
    await h.user.pointer([{ keys: '[MouseLeft>]', target: sentenceWord('Sam') }, { target: sentenceWord('and') }, { target: sentenceWord('Pam') }, { keys: '[/MouseLeft]' }]);
    const review = (await storedReading(h)).reviewedTranscript!;
    expect(playedFrom.at(-1)).toBeCloseTo(review.words[0].span!.start);
    expect(card().getByText((_, el) => !!el?.classList.contains('repair-heard'))).toHaveTextContent('Heard Sam and Pam for Sam and Pam');
    await h.user.click(choice(/edit what was said/i));
    const box = card().getByRole('textbox', { name: /what was said/i });
    await h.user.clear(box);
    await h.user.type(box, 'Sam an Pam{Enter}');
    await waitFor(() => expect(status()).toHaveTextContent('Marked · 1 error'));
  });

  test('the first time, a welcome says marking is new and offers a tour of each part; after that, only when asked', async () => {
    localStorage.removeItem('reading-fluency.marking-tour-seen');
    const { h } = await reviewCampReading();
    await h.user.click(screen.getByRole('button', { name: /^mark accuracy$/i }));
    const welcome = await screen.findByRole('dialog', { name: 'Marking a reading' });
    expect(welcome).toHaveTextContent(/beta/i);
    expect(within(welcome).getByRole('link', { name: 'support@teacher.dev' })).toHaveAttribute('href', 'mailto:support@teacher.dev');
    await h.user.click(within(welcome).getByRole('button', { name: /show me around/i }));
    const titles: string[] = [];
    for (;;) {
      const step = screen.getByRole('dialog', { name: /./ });
      titles.push(step.getAttribute('aria-label')!);
      const next = within(step).queryByRole('button', { name: /^next$/i });
      if (!next) {
        await h.user.click(within(step).getByRole('button', { name: /^done$/i }));
        break;
      }
      await h.user.click(next);
    }
    expect(titles).toEqual(['The passage', 'Playback', 'The recording', 'What the app heard', 'Repair here', 'Your marks']);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The beta note stays, with the way to write and the tour again.
    expect(screen.getByRole('link', { name: 'support@teacher.dev' })).toBeInTheDocument();
    await h.user.click(screen.getByRole('button', { name: /take the tour/i }));
    expect(screen.getByRole('dialog', { name: 'The passage' })).toBeInTheDocument();
    await h.user.click(screen.getByRole('button', { name: /skip the tour/i }));
    await h.user.click(screen.getByRole('button', { name: /back to review/i }));
    await h.user.click(screen.getByRole('button', { name: /^change marks$/i }));
    await screen.findByRole('heading', { name: /mark reading · ada lovelace/i });
    expect(screen.queryByRole('dialog', { name: 'Marking a reading' })).not.toBeInTheDocument();
  });

  test('breadcrumbs show where marking sits, and lead back', async () => {
    const { h } = await reviewCampReading();
    await openMarking(h);
    const crumbs = within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
    expect(crumbs.getByText('Marking')).toHaveAttribute('aria-current', 'page');
    await h.user.click(crumbs.getByRole('button', { name: /^reading ·/i }));
    expect(await screen.findByRole('heading', { name: /review · ada lovelace/i })).toBeInTheDocument();
    await h.user.click(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('button', { name: 'Ada Lovelace' }));
    expect(window.location.pathname).toMatch(/^\/students\//);
  });

  test('marking uses the whole window: no bottom navigation', async () => {
    const { h } = await reviewCampReading();
    expect(screen.getByRole('navigation', { name: /main/i })).toBeInTheDocument();
    await openMarking(h);
    expect(screen.queryByRole('navigation', { name: /main/i })).not.toBeInTheDocument();
  });
});

describe('Placing what was heard in the audio', () => {
  test('when the aligner finds the words, their places replace the recogniser\'s rough ones', async () => {
    const letters: Record<string, number> = {};
    [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].forEach((c, i) => (letters[c] = i + 2));
    const frames = 3000;
    const V = 28;
    const logProbs = new Float32Array(frames * V).fill(Math.log(1e-6));
    const said = new Map([[15, letters.S], [17, letters.A], [19, letters.M]]);
    for (let t = 0; t < frames; t++) logProbs[t * V + (said.get(t) ?? 0)] = Math.log(0.95);
    const em: Emissions = { model: 'fake-ctc', frameSeconds: 0.02, frames, vocabSize: V, logProbs, blank: 0, space: 1, letters };
    const { h } = await reviewCampReading(CAMP_CLEAN, new FakeAligner(em));
    await openMarking(h);
    await waitFor(async () => expect((await storedReading(h)).reviewedTranscript!.alignedBy).toBe('fake-ctc'));
    const review = (await storedReading(h)).reviewedTranscript!;
    expect(review.heard[0].timing).toBe('aligned');
    expect(review.heard[0].start).toBeCloseTo(0.3);
    expect(review.words[0].span!.start).toBeCloseTo(0.3);
    expect(await screen.findByRole('group', { name: /what was said/i })).toBeInTheDocument();
    expect(screen.queryByText(/couldn't place the words/i)).not.toBeInTheDocument();
  });

  test('nothing is shown until the words are placed; meanwhile the steps and a progress bar are', async () => {
    const aligner = new FakeAligner(new Error('offline'));
    const release = aligner.hold();
    const { h } = await reviewCampReading(CAMP_CLEAN, aligner);
    await h.user.click(screen.getByRole('button', { name: /^mark accuracy$/i }));
    expect(await screen.findByText(/finding when each word was said/i)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /finding when each word was said/i })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Paragraph 1' })).not.toBeInTheDocument();
    release();
    expect(await screen.findByRole('group', { name: 'Paragraph 1' })).toBeInTheDocument();
  });

  test('when the aligner cannot load, marking carries on with the rough places', async () => {
    const { h } = await reviewCampReading(CAMP_CLEAN, new FakeAligner(new Error('offline')));
    await openMarking(h);
    expect(await screen.findByText(/couldn't place the words in the audio/i)).toBeInTheDocument();
    expect((await storedReading(h)).reviewedTranscript!.heard[0].timing).toBe('asr');
  });
});

describe('When there is nothing to review', () => {
  test('a reading with no transcript cannot be marked', async () => {
    fakePlayback();
    const transcriber = new FakeTranscriber();
    transcriber.hears('');
    const h = await renderApp({ transcriber });
    await goTo(h, 'Passages');
    await pastePassage(h, 'Camp', CAMP_TEXT);
    await goTo(h, 'Roster');
    await pasteRoster(h, 'Ada Lovelace');
    await recordReading(h, 'Ada Lovelace', { seconds: 60, passage: 'Camp' });
    // Hearing nothing, the app doubts the reading was complete; the teacher says it was.
    await setCompletion(h, 'Complete');
    expect(await screen.findByText(/marking starts from the app's transcript, and there isn't one/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^mark accuracy$/i })).not.toBeInTheDocument();
  });

  test('an incomplete reading cannot be marked', async () => {
    const { h } = await reviewCampReading();
    await setCompletion(h, 'Incomplete');
    expect(screen.getByText(/only a complete reading can be marked/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^mark accuracy$/i })).not.toBeInTheDocument();
  });

  test('choosing a different passage throws away the review made against the old one', async () => {
    const { h } = await reviewCampReading();
    await openMarking(h);
    expect((await storedReading(h)).reviewedTranscript).toBeDefined();
    await h.user.click(screen.getByRole('button', { name: /back to review/i }));
    await h.user.click(screen.getByRole('button', { name: /^camp ·/i }));
    await h.user.click(within(screen.getByRole('group', { name: /choose passage/i })).getByRole('button', { name: /^ship/i }));
    await waitFor(async () => expect((await storedReading(h)).reviewedTranscript).toBeUndefined());
    const reading = await storedReading(h);
    expect(reading.marks).toBeUndefined();
    expect(reading.markedAt).toBeUndefined();
  });
});
