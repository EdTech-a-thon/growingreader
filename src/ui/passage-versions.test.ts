import { screen, within } from '@testing-library/svelte';
import { renderApp, pasteRoster, pastePassage, goTo, recordReading } from '../test/harness';
import { CAMP_TEXT } from '../test/fixtures/passages';
import { countWords } from '../analysis';
import { rate } from '../domain/rate';
import { MemoryStorage } from '../adapters/storage/MemoryStorage';
import type { Harness } from '../test/harness';

const CAMP_WORDS = countWords(CAMP_TEXT);

async function readCamp(h: Harness) {
  await goTo(h, 'Passages');
  await pastePassage(h, 'Camp', CAMP_TEXT);
  await goTo(h, 'Roster');
  await pasteRoster(h, 'Ada Lovelace');
  await recordReading(h, 'Ada Lovelace', { seconds: 60, passage: 'Camp' });
}

async function editCampText(h: Harness, text: string) {
  await goTo(h, 'Passages');
  await h.user.click(screen.getByRole('button', { name: /^edit$/i }));
  const field = screen.getByLabelText(/^text$/i);
  await h.user.clear(field);
  await h.user.click(field);
  await h.user.paste(text);
  await h.user.click(screen.getByRole('button', { name: /save changes/i }));
}

describe('Editing a passage that has been read', () => {
  test('an earlier reading keeps the word count and rate of the words the student read', async () => {
    const h = await renderApp();
    await readCamp(h);
    const [before] = await h.storage.listReadings();
    const [original] = await h.storage.listPassages();
    const rateBefore = rate(before, original);

    await editCampText(h, `${CAMP_TEXT} The end of the day came.`);

    const [passage] = await h.storage.listPassages();
    const [after] = await h.storage.listReadings();
    expect(passage.version).toBe(2);
    expect(passage.wordCount).toBe(CAMP_WORDS + 6);
    expect(after.passageVersion).toBe(1);
    expect(rate(after, passage)).toBe(rateBefore);
  });

  test('a new reading of the edited passage is read against the new version', async () => {
    const h = await renderApp();
    await readCamp(h);
    await editCampText(h, `${CAMP_TEXT} The end of the day came.`);
    await goTo(h, 'Roster');
    await recordReading(h, 'Ada Lovelace', { seconds: 60, passage: 'Camp' });
    const versions = (await h.storage.listReadings()).map((r) => r.passageVersion).sort();
    expect(versions).toEqual([1, 2]);
  });

  test('reflowing the lines of a passage that has been read keeps one version', async () => {
    const h = await renderApp();
    await readCamp(h);
    await editCampText(h, CAMP_TEXT.split(/\s+/).join('\n'));
    const [passage] = await h.storage.listPassages();
    expect(passage.version ?? 1).toBe(1);
    expect(passage.history).toBeUndefined();
  });

  test('fixing a passage before anyone has read it keeps one version', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await pastePassage(h, 'Camp', CAMP_TEXT);
    await editCampText(h, `Page 1 ${CAMP_TEXT}`);
    const [passage] = await h.storage.listPassages();
    expect(passage.version ?? 1).toBe(1);
    expect(passage.wordCount).toBe(CAMP_WORDS + 2);
  });
});

describe('Passage version history', () => {
  test('editing a read passage warns that the readings keep their words', async () => {
    const h = await renderApp();
    await readCamp(h);
    await goTo(h, 'Passages');
    await h.user.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(screen.getByText(/readings already use these words/i)).toBeInTheDocument();
  });

  test('an edited passage shows its version, and earlier words can be viewed and restored', async () => {
    const h = await renderApp();
    await readCamp(h);
    await editCampText(h, `${CAMP_TEXT} The end of the day came.`);
    const card = screen.getByRole('article', { name: 'Camp' });
    expect(within(card).getByText(/version 2, edited/i)).toBeInTheDocument();

    await h.user.click(within(card).getByRole('button', { name: /versions/i }));
    const first = screen.getByRole('listitem', { name: 'Version 1' });
    expect(within(first).getByText(`${CAMP_WORDS} words`)).toBeInTheDocument();
    expect(within(first).getByText(/1 reading$/)).toBeInTheDocument();
    await h.user.click(within(first).getByRole('button', { name: /view text/i }));
    expect(within(first).getByText(/Sam and Pam went to camp/)).toBeInTheDocument();
    expect(within(screen.getByRole('listitem', { name: 'Version 2' })).queryByRole('button', { name: /restore/i })).not.toBeInTheDocument();

    await h.user.click(within(first).getByRole('button', { name: /restore these words/i }));
    const [passage] = await h.storage.listPassages();
    expect(passage.text).toBe(CAMP_TEXT);
    expect(passage.wordCount).toBe(CAMP_WORDS);
  });
});

describe('The progress chart', () => {
  test('marks the reading where the passage was edited, like a change of passage', async () => {
    const storage = new MemoryStorage();
    await storage.putPassage({
      id: 'p1', title: 'Camp', text: `${CAMP_TEXT} The end.`, wordCount: CAMP_WORDS + 2, createdAt: 0, version: 2, versionCreatedAt: 1,
      history: [{ version: 1, text: CAMP_TEXT, wordCount: CAMP_WORDS, createdAt: 0 }],
    });
    await storage.putStudent({ id: 's1', firstName: 'Ada', lastName: 'Lovelace', archived: false, createdAt: 0 });
    const reading = { studentId: 's1', passageId: 'p1', hasAudio: false, sampleRate: 16000, sampleCount: 16000 * 60,
      tapBounds: { start: 0, end: 60 }, timing: 'auto' as const, completion: 'complete' as const, analysis: 'done' as const };
    await storage.putReading({ ...reading, id: 'r1', passageVersion: 1, recordedAt: Date.UTC(2026, 8, 1, 15) });
    await storage.putReading({ ...reading, id: 'r2', passageVersion: 2, recordedAt: Date.UTC(2026, 8, 8, 15) });
    await renderApp({ storage, path: '/students/s1' });
    expect(await screen.findByRole('button', { name: `Sep 8, 2026: ${CAMP_WORDS + 2} words per minute, passage edited: Camp` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Sep 1, 2026: ${CAMP_WORDS} words per minute` })).toBeInTheDocument();
  });
});

describe('Readings saved before passage versions', () => {
  test('are pinned to their passage as it stands when the app opens', async () => {
    const storage = new MemoryStorage();
    await storage.putPassage({ id: 'p1', title: 'Camp', text: CAMP_TEXT, wordCount: CAMP_WORDS, createdAt: 0 });
    await storage.putStudent({ id: 's1', firstName: 'Ada', lastName: 'Lovelace', archived: false, createdAt: 0 });
    await storage.putReading({
      id: 'r1', studentId: 's1', passageId: 'p1', recordedAt: 0, hasAudio: false, sampleRate: 16000, sampleCount: 16000 * 60,
      tapBounds: { start: 0, end: 60 }, timing: 'auto', completion: 'complete', analysis: 'done',
    });
    await renderApp({ storage });
    const [reading] = await storage.listReadings();
    expect(reading.passageVersion).toBe(1);
  });
});
