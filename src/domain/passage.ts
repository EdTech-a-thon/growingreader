import { countWords, passageWords } from '../analysis/words';
import type { Passage, PassageSource, PassageVersion, Reading } from './types';

/** The passage version a passage's own `text` and `wordCount` hold: the one handed to students. */
export function latestVersion(passage: Passage): number {
  return passage.version ?? 1;
}

function latest(passage: Passage): PassageVersion {
  return {
    version: latestVersion(passage),
    text: passage.text,
    wordCount: passage.wordCount,
    createdAt: passage.versionCreatedAt ?? passage.createdAt,
    ...(passage.source ? { source: passage.source } : {}),
  };
}

/** Every passage version, oldest first. */
export function versionsOf(passage: Passage): PassageVersion[] {
  return [...(passage.history ?? []), latest(passage)];
}

/** One passage version, or the latest when none is named. */
export function versionOf(passage: Passage, version?: number): PassageVersion | undefined {
  if (version === undefined || version === latestVersion(passage)) return latest(passage);
  return passage.history?.find((v) => v.version === version);
}

/** The passage version a reading was read against, when its passage is known. */
export function versionReadBy(reading: Reading, passage: Passage | undefined): PassageVersion | undefined {
  if (!passage || reading.passageId !== passage.id) return undefined;
  return versionOf(passage, reading.passageVersion);
}

/** True when two texts are the same words in the same order, whatever their line breaks and spacing. */
export function sameWords(a: string, b: string): boolean {
  const x = passageWords(a);
  const y = passageWords(b);
  return x.length === y.length && x.every((w, i) => w === y[i]);
}

/**
 * The passage after the teacher saved `title` and `text`. Changing the words of a version
 * some reading already uses makes a new version and keeps the old one in history; anything
 * else — the title, line breaks, spacing, or words nobody has read yet — edits in place,
 * since no reading's word positions or word count can move (ADR-0007).
 */
export function revisePassage(
  passage: Passage,
  edit: { title: string; text: string; source?: PassageSource; at: number },
  latestInUse: boolean,
): Passage {
  const source = edit.source ?? passage.source;
  const edited: Passage = { ...passage, title: edit.title.trim(), text: edit.text, wordCount: countWords(edit.text), ...(source ? { source } : {}) };
  if (!latestInUse || sameWords(passage.text, edit.text)) return edited;
  return { ...edited, version: latestVersion(passage) + 1, versionCreatedAt: edit.at, history: [...(passage.history ?? []), latest(passage)] };
}

/** A printed line of a passage version, by the `passageWords` positions it holds. */
export interface PassageLine {
  first: number;
  last: number;
}

/**
 * The version's printed lines, numbered as `passageWords` numbers words and as the marking
 * screen lays them out. A line with no words (punctuation only) is not a line.
 */
export function passageLines(text: string): PassageLine[] {
  const lines: PassageLine[] = [];
  let next = 0;
  for (const paragraph of text.split(/\n\s*\n/))
    for (const line of paragraph.split('\n')) {
      const count = countWords(line);
      if (count === 0) continue;
      lines.push({ first: next, last: next + count - 1 });
      next += count;
    }
  return lines;
}

/** The line holding passage word `word`. */
export function lineOf(lines: PassageLine[], word: number): number {
  const i = lines.findIndex((l) => word >= l.first && word <= l.last);
  return i < 0 ? Math.max(0, lines.length - 1) : i;
}

/** The version's paragraphs (blank-line separated), by the `passageWords` positions each holds: the units the teacher reviews. */
export function passageParagraphs(text: string): PassageLine[] {
  const paragraphs: PassageLine[] = [];
  let next = 0;
  for (const paragraph of text.split(/\n\s*\n/)) {
    const count = countWords(paragraph);
    if (count === 0) continue;
    paragraphs.push({ first: next, last: next + count - 1 });
    next += count;
  }
  return paragraphs;
}

/**
 * The version's sentences, by the `passageWords` positions each holds. A sentence ends at a
 * word ending in . ! or ? (a closing quote or bracket after it is fine), or at the end of its
 * paragraph.
 */
export function passageSentences(text: string): PassageLine[] {
  const sentences: PassageLine[] = [];
  let next = 0;
  for (const paragraph of text.split(/\n\s*\n/)) {
    let first = next;
    for (const token of paragraph.split(/\s+/)) {
      if (countWords(token) === 0) continue;
      next++;
      if (/[.!?]['"’”)\]]*$/.test(token)) {
        sentences.push({ first, last: next - 1 });
        first = next;
      }
    }
    if (next > first) sentences.push({ first, last: next - 1 });
  }
  return sentences;
}
