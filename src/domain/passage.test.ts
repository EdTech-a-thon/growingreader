import { latestVersion, passageSentences, revisePassage, sameWords, versionOf, versionReadBy, versionsOf } from './passage';
import type { Passage, Reading } from './types';

const passage: Passage = { id: 'p1', title: 'Camp', text: 'We went to camp.', wordCount: 4, createdAt: 100 };
const reading = { id: 'r1', passageId: 'p1', passageVersion: 1 } as Reading;

describe('passage versions', () => {
  test('a passage saved before versions existed is version 1', () => {
    expect(latestVersion(passage)).toBe(1);
    expect(versionsOf(passage)).toEqual([{ version: 1, text: 'We went to camp.', wordCount: 4, createdAt: 100 }]);
  });

  test('changing words nobody has read edits the latest version in place', () => {
    const edited = revisePassage(passage, { title: 'Camp', text: 'We went to day camp.', at: 200 }, false);
    expect(latestVersion(edited)).toBe(1);
    expect(edited.history).toBeUndefined();
    expect(edited.wordCount).toBe(5);
  });

  test('changing words a reading used makes a new version and keeps the old one unchanged', () => {
    const edited = revisePassage(passage, { title: 'Camp', text: 'We went to day camp.', at: 200 }, true);
    expect(latestVersion(edited)).toBe(2);
    expect(versionOf(edited, 1)).toEqual({ version: 1, text: 'We went to camp.', wordCount: 4, createdAt: 100 });
    expect(versionOf(edited, 2)).toMatchObject({ text: 'We went to day camp.', wordCount: 5, createdAt: 200 });
    expect(edited.createdAt).toBe(100);
  });

  test('title, line-break and spacing changes never make a new version', () => {
    const edited = revisePassage(passage, { title: 'Summer camp', text: 'We went\nto   camp.', at: 200 }, true);
    expect(latestVersion(edited)).toBe(1);
    expect(edited.title).toBe('Summer camp');
    expect(edited.text).toBe('We went\nto   camp.');
  });

  test('punctuation that changes a word counts as a change of words', () => {
    expect(sameWords('We went to camp.', 'We went to camp!')).toBe(true);
    expect(sameWords("We went to camp.", "We won't go to camp.")).toBe(false);
  });

  test('a reading is read against the version it names, not the latest', () => {
    const edited = revisePassage(passage, { title: 'Camp', text: 'We went to day camp.', at: 200 }, true);
    expect(versionReadBy(reading, edited)?.wordCount).toBe(4);
    expect(versionReadBy({ ...reading, passageVersion: 2 }, edited)?.wordCount).toBe(5);
    expect(versionReadBy({ ...reading, passageId: 'other' }, edited)).toBeUndefined();
  });
});

describe('passageSentences', () => {
  test('a sentence ends at its stop, closing quotes and all, or at the end of its paragraph', () => {
    expect(passageSentences('Sam ran. Pam said, "Go to sleep." So\nthey slept\n\nThe end')).toEqual([
      { first: 0, last: 1 },
      { first: 2, last: 6 },
      { first: 7, last: 9 },
      { first: 10, last: 11 },
    ]);
  });
});
