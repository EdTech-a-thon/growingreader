import { alignToPassage } from '../analysis/align';
import { alignWords, type Emissions } from '../analysis/ctc';
import { passageWords, tokenize } from '../analysis/words';
import { passageParagraphs, type PassageLine } from './passage';
import type { HeardWord, Mark, ReviewedTranscript, Transcript, WordReview, WordSpan } from './types';

/**
 * Reconstructing the reading against the passage (ADR-0010). `heard` is what was said: the
 * recogniser's words, placed in the audio by forced alignment, and corrected by the teacher
 * where it misheard. Each passage word is matched to a heard word that is exactly it, only
 * ever moving forward; a matched word was read correctly. The rest form spots, which the
 * teacher settles by fixing what was heard there (or saying nothing was read), after which
 * they are errors. The marks follow by DIBELS 8 rules. Pure: the store saves the results.
 */

export const RECOGNISER = 'whisper-tiny.en_timestamped';
/** DIBELS: after three seconds of hesitation the examiner supplies the word, and it is an error. */
export const HESITATION_SECONDS = 3;
/** The shortest a word can be. */
export const MIN_SPAN_SECONDS = 0.04;
/** A run of fewer matches than this, with at least `STRAY_GAP` unmatched passage words on both sides, is a coincidence, not the reading. */
const STRAY_RUN = 3;
const STRAY_GAP = 5;

type Sections = PassageLine[];

/** Two spellings of one word: the same once case and edge punctuation are gone. */
export function sameWord(a: string, b: string): boolean {
  return tokenize(a).join(' ') === tokenize(b).join(' ');
}

// ---- matching what was heard to the passage ---------------------------------------------

/**
 * Match `heard` to the passage again, after any change to it. A passage word is matched to the
 * heard word the restart-tolerant aligner paired with it (the last, if it was said more than
 * once) when that word is exactly the passage word and the matches stay in order. A short
 * run of matches deep inside unmatched text (a stray "the wind was" in a skipped line) is
 * not trusted unless the teacher wrote it. Matched words take their heard word's time; the
 * rest share the gap between. "Nothing read here" stays on words still unmatched.
 */
export function remap(review: ReviewedTranscript, passageText: string): ReviewedTranscript {
  const words = passageWords(passageText);
  const heard = review.heard;
  const pairedWith = new Map<number, number>();
  for (const pair of alignToPassage(heard, passageText).pairs) {
    if (sameWord(heard[pair.word].text, words[pair.passageWord] ?? '')) pairedWith.set(pair.passageWord, pair.word);
  }
  const match: Array<number | undefined> = words.map(() => undefined);
  let last = -1;
  words.forEach((_, w) => {
    const h = pairedWith.get(w);
    if (h === undefined || h <= last) return;
    match[w] = h;
    last = h;
  });
  dropStrays(match, heard);

  const reviews: WordReview[] = words.map((_, w) => {
    const h = match[w];
    if (h !== undefined) return { heard: h, span: { start: heard[h].start, end: Math.max(heard[h].end, heard[h].start + MIN_SPAN_SECONDS), timing: 'heard' } };
    return review.words[w]?.omitted ? { omitted: true } : {};
  });
  // Each unmatched run shares the time between its matched neighbours.
  const audioEnd = heard.length > 0 ? Math.max(...heard.map((x) => x.end)) : 0;
  for (const spot of runs(reviews)) {
    const from = spot.first > 0 ? (reviews[spot.first - 1].span?.end ?? 0) : 0;
    const to = spot.last + 1 < words.length ? (reviews[spot.last + 1].span?.start ?? audioEnd) : Math.max(audioEnd, from);
    if (to - from < MIN_SPAN_SECONDS) continue;
    const step = (to - from) / (spot.last - spot.first + 1);
    for (let k = spot.first; k <= spot.last; k++) reviews[k] = { ...reviews[k], span: { start: from + step * (k - spot.first), end: from + step * (k - spot.first + 1), timing: 'estimated' } };
  }
  return { ...review, words: reviews };
}

function dropStrays(match: Array<number | undefined>, heard: HeardWord[]) {
  let i = 0;
  while (i < match.length) {
    if (match[i] === undefined) {
      i++;
      continue;
    }
    let end = i;
    while (end + 1 < match.length && match[end + 1] !== undefined) end++;
    let before = 0;
    for (let k = i - 1; k >= 0 && match[k] === undefined; k--) before++;
    let after = 0;
    for (let k = end + 1; k < match.length && match[k] === undefined; k++) after++;
    const byTeacher = match.slice(i, end + 1).some((h) => heard[h!].origin === 'teacher');
    if (end - i + 1 < STRAY_RUN && before >= STRAY_GAP && after >= STRAY_GAP && !byTeacher) for (let k = i; k <= end; k++) match[k] = undefined;
    i = end + 1;
  }
}

/** The first map: the recogniser's words as heard, matched to the passage. */
export function draftReview(transcript: Transcript, passageText: string, passageVersion: number): ReviewedTranscript {
  const heard: HeardWord[] = transcript.words
    .map((w) => ({ text: w.text.trim(), start: w.start, end: Math.max(w.end, w.start + MIN_SPAN_SECONDS), timing: 'asr' as const, origin: 'asr' as const }))
    .filter((w) => w.text.length > 0);
  return remap(
    {
      formatVersion: 2,
      passageVersion,
      source: { model: RECOGNISER, words: transcript.words.map((x) => ({ ...x })) },
      heard,
      words: [],
      paragraphs: passageParagraphs(passageText).map(() => ({ heard: false })),
    },
    passageText,
  );
}

// ---- spots ---------------------------------------------------------------------------

/** A run of passage words no heard word matched: what the teacher settles. */
export interface Spot {
  first: number;
  last: number;
}

function runs(words: WordReview[]): Spot[] {
  const out: Spot[] = [];
  words.forEach((w, i) => {
    if (w.heard !== undefined) return;
    const open = out.at(-1);
    if (open && open.last === i - 1) open.last = i;
    else out.push({ first: i, last: i });
  });
  return out;
}

export function spotsOf(review: ReviewedTranscript): Spot[] {
  return runs(review.words);
}

/** The spot holding passage word `word`, if it is in one. */
export function spotOf(review: ReviewedTranscript, word: number): Spot | undefined {
  return spotsOf(review).find((s) => word >= s.first && word <= s.last);
}

/** The heard words said over a spot: those between the heard words its neighbours matched. */
export function heardIn(review: ReviewedTranscript, spot: Spot): number[] {
  const before = spot.first > 0 ? review.words[spot.first - 1].heard : undefined;
  const after = spot.last + 1 < review.words.length ? review.words[spot.last + 1].heard : undefined;
  const out: number[] = [];
  for (let i = (before ?? -1) + 1; i < (after ?? review.heard.length); i++) out.push(i);
  return out;
}

/** The stretch of audio a spot covers: from the end of the heard word before it to the start of the one after. */
export function spotAudio(review: ReviewedTranscript, spot: Spot, duration: number): { start: number; end: number } {
  const before = spot.first > 0 ? review.words[spot.first - 1].heard : undefined;
  const after = spot.last + 1 < review.words.length ? review.words[spot.last + 1].heard : undefined;
  const start = before !== undefined ? review.heard[before].end : 0;
  const end = after !== undefined ? review.heard[after].start : duration;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

/** Settled: the teacher confirmed (or wrote) every word heard over it, or said nothing was read there. */
export function isSettled(review: ReviewedTranscript, spot: Spot): boolean {
  const heard = heardIn(review, spot);
  if (heard.length > 0) return heard.every((i) => review.heard[i].confirmed || review.heard[i].origin === 'teacher');
  return review.words.slice(spot.first, spot.last + 1).every((w) => w.omitted);
}

/** Spots still to settle. */
export function openSpots(review: ReviewedTranscript): Spot[] {
  return spotsOf(review).filter((s) => !isSettled(review, s));
}

/** Where a passage word stands: read correctly, read wrong, or still to settle. */
export type WordStatus = 'right' | 'wrong' | 'open';

export function wordStatus(review: ReviewedTranscript, word: number): WordStatus {
  if (review.words[word]?.heard !== undefined) return 'right';
  const spot = spotOf(review, word);
  return spot && isSettled(review, spot) ? 'wrong' : 'open';
}

/**
 * How each heard word stands: it is a passage word read (`match`), something said over a
 * spot still to settle (`open`) or settled, so wrong (`wrong`), or said between passage words
 * read in order, which counts for nothing (`extra`: a repeat, a restart, a self-correction).
 */
export type HeardStatus = 'match' | 'open' | 'wrong' | 'extra';

export function heardStatuses(review: ReviewedTranscript): HeardStatus[] {
  const out: HeardStatus[] = review.heard.map(() => 'extra');
  review.words.forEach((w) => w.heard !== undefined && (out[w.heard] = 'match'));
  for (const spot of spotsOf(review)) {
    const settled = isSettled(review, spot);
    for (const i of heardIn(review, spot)) out[i] = settled ? 'wrong' : 'open';
  }
  return out;
}

/** The spot the heard word `index` was said over, if any. */
export function spotOfHeard(review: ReviewedTranscript, index: number): Spot | undefined {
  return spotsOf(review).find((s) => heardIn(review, s).includes(index));
}

// ---- settling spots --------------------------------------------------------------------

/** The teacher says these heard words are what was said. */
export function confirmHeard(review: ReviewedTranscript, indexes: number[]): ReviewedTranscript {
  const set = new Set(indexes);
  return { ...review, heard: review.heard.map((w, i) => (set.has(i) ? { ...w, confirmed: true } : w)) };
}

/**
 * Words placed in `from`–`to`: by forced alignment when the model's frames are to hand,
 * else sharing the stretch by length. `strict` when the stretch is all theirs (a word
 * retyped in its own box); not when it may hold silence or other talk (a word added to a gap).
 */
function place(texts: string[], from: number, to: number, em: Emissions | undefined, strict: boolean): HeardWord[] {
  const found = em ? alignWords(em, texts, from, to, strict) : [];
  const total = texts.reduce((n, t) => n + Math.max(1, t.length), 0);
  let at = from;
  return texts.map((text, k) => {
    const share = ((to - from) * Math.max(1, text.length)) / total;
    const guess = { start: at, end: at + Math.max(MIN_SPAN_SECONDS, share) };
    at += share;
    const t = found[k];
    return { text, ...(t ?? guess), timing: t ? 'aligned' : 'estimated', origin: 'teacher', confirmed: true } as HeardWord;
  });
}

const tokensOf = (text: string) => text.trim().split(/\s+/).filter((t) => t.length > 0);

/** The heard words said over passage words `target`: those they matched, and those over any spot among them. */
export function heardOver(review: ReviewedTranscript, target: Spot): number[] {
  const out = new Set<number>();
  for (let w = target.first; w <= target.last; w++) {
    const h = review.words[w]?.heard;
    if (h !== undefined) out.add(h);
    else {
      const spot = spotOf(review, w);
      if (spot) heardIn(review, spot).forEach((i) => out.add(i));
    }
  }
  return [...out].sort((x, y) => x - y);
}

/**
 * What was said over passage words `target`, as the teacher heard it (ADR-0010's matrix): the
 * heard words there become `text`. The same words confirm them as said; other words replace
 * them, placed where the old ones were said (or, where nothing was heard, in the gap), and
 * whatever now matches the passage is read correctly; a passage word left with nothing said
 * over it (no words at all, say) is omitted.
 */
export function setSaid(review: ReviewedTranscript, passageText: string, target: Spot, text: string, duration: number, em?: Emissions): ReviewedTranscript {
  const indexes = heardOver(review, target);
  const texts = tokensOf(text);
  if (indexes.length > 0 && texts.join(' ') === indexes.map((i) => review.heard[i].text).join(' ')) return confirmHeard(review, indexes);
  let at: number;
  let placed: HeardWord[] = [];
  if (indexes.length > 0) {
    at = indexes[0];
    const from = review.heard[at].start;
    const to = review.heard[indexes[indexes.length - 1]].end;
    if (texts.length > 0) placed = place(texts, from, Math.max(to, from + MIN_SPAN_SECONDS), em, true);
  } else {
    const gap = spotAudio(review, target, duration);
    const next = review.heard.findIndex((w) => w.start >= gap.start);
    at = next < 0 ? review.heard.length : next;
    if (texts.length > 0) placed = place(texts, gap.start, Math.max(gap.end, gap.start + MIN_SPAN_SECONDS), em, false);
  }
  const removed = indexes.length > 0 ? indexes[indexes.length - 1] - indexes[0] + 1 : 0;
  const next = remap({ ...review, heard: [...review.heard.slice(0, at), ...placed, ...review.heard.slice(at + removed)] }, passageText);
  // The teacher has said what was said here, so a passage word still unmatched with nothing over it was not read.
  return { ...next, words: next.words.map((w, i) => (i >= target.first && i <= target.last && w.heard === undefined ? { ...w, omitted: true } : w)) };
}

/** They read `target` as printed: the heard words there become the passage's. */
export function readAsPrinted(review: ReviewedTranscript, passageText: string, target: Spot, duration: number, em?: Emissions): ReviewedTranscript {
  return setSaid(review, passageText, target, passageWords(passageText).slice(target.first, target.last + 1).join(' '), duration, em);
}

/** Words the recogniser missed, said around `at` seconds: added in the gap there. */
export function insertHeard(review: ReviewedTranscript, passageText: string, at: number, text: string, duration: number, em?: Emissions): ReviewedTranscript {
  const texts = tokensOf(text);
  if (texts.length === 0) return review;
  const next = review.heard.findIndex((w) => w.start >= at);
  const index = next < 0 ? review.heard.length : next;
  const lo = review.heard[index - 1]?.end ?? 0;
  const hi = review.heard[index]?.start ?? duration;
  // Without the model, a word's worth of time from where the teacher tapped.
  const from = em ? lo : Math.max(lo, Math.min(at, hi - 0.4 * texts.length));
  const to = em ? hi : Math.min(hi, from + 0.4 * texts.length);
  const placed = place(texts, from, Math.max(to, from + MIN_SPAN_SECONDS), em, false);
  return remap({ ...review, heard: [...review.heard.slice(0, index), ...placed, ...review.heard.slice(index)] }, passageText);
}

/** The teacher dragged heard word `index` to where it was said. It stays between its neighbours, and the app never moves it after. */
export function retimeHeard(review: ReviewedTranscript, passageText: string, index: number, start: number, end: number): ReviewedTranscript {
  const w = review.heard[index];
  if (!w) return review;
  const floor = review.heard[index - 1]?.end ?? 0;
  const ceiling = review.heard[index + 1]?.start ?? Infinity;
  const s = Math.max(floor, Math.min(start, ceiling - MIN_SPAN_SECONDS));
  const e = Math.min(ceiling, Math.max(end, s + MIN_SPAN_SECONDS));
  const heard = review.heard.map((x, i) => (i === index ? { ...x, start: s, end: e, timing: 'manual' as const, confirmed: true } : x));
  return remap({ ...review, heard }, passageText);
}

// ---- the recording ------------------------------------------------------------------

/** The passage word being read at `seconds`: the one whose span holds it, or else the last one started. */
export function wordAt(review: ReviewedTranscript, seconds: number): number | undefined {
  let found: number | undefined;
  review.words.forEach((w, i) => {
    if (w.span && w.span.start <= seconds + 0.01) found = i;
  });
  return found;
}

function spanBefore(review: ReviewedTranscript, word: number): WordSpan | undefined {
  for (let i = word - 1; i >= 0; i--) if (review.words[i].span) return review.words[i].span;
  return undefined;
}

export function markHeard(review: ReviewedTranscript, section: number): ReviewedTranscript {
  if (!review.paragraphs[section] || review.paragraphs[section].heard) return review;
  return { ...review, paragraphs: review.paragraphs.map((p, i) => (i === section ? { heard: true } : p)) };
}

/** The stretch of audio a paragraph's words cover. */
export function sectionAudio(review: ReviewedTranscript, sections: Sections, section: number): { start: number; end: number } | undefined {
  const s = sections[section];
  if (!s) return undefined;
  const spans = review.words.slice(s.first, s.last + 1).flatMap((w) => (w.span ? [w.span] : []));
  if (spans.length === 0) return undefined;
  return { start: spans[0].start, end: Math.max(...spans.map((x) => x.end)) };
}

/**
 * Done: every spot settled. Which paragraphs have been listened to is still recorded
 * (`paragraphs[].heard`) but no longer holds marking back.
 */
export function isFullyReviewed(review: ReviewedTranscript): boolean {
  return openSpots(review).length === 0;
}

// ---- forced alignment of what was heard ---------------------------------------------

/** Words placed in one search; the window follows the recogniser's times for them. */
const ALIGN_CHUNK = 30;
/** How far outside the recogniser's times for a chunk its words are looked for. */
const ALIGN_MARGIN_SECONDS = 1.5;

/**
 * The heard words placed where they were said, the recogniser's timestamps running late.
 * Every word is placed (it was heard), so a misheard one stretches over the speech it was
 * heard in; one the model cannot spell keeps its rough time, fitted between the others.
 * Words the teacher dragged stay put.
 */
export function alignHeard(review: ReviewedTranscript, passageText: string, em: Emissions): ReviewedTranscript {
  const heard = review.heard;
  const duration = em.frames * em.frameSeconds;
  const found: Array<{ start: number; end: number } | undefined> = heard.map((w) => (w.timing === 'manual' ? { start: w.start, end: w.end } : undefined));
  let floor = 0;
  let i = 0;
  while (i < heard.length) {
    if (heard[i].timing === 'manual') {
      floor = Math.max(floor, heard[i].end);
      i++;
      continue;
    }
    const chunk: number[] = [];
    while (i < heard.length && chunk.length < ALIGN_CHUNK && heard[i].timing !== 'manual') chunk.push(i++);
    const ceiling = heard[i]?.timing === 'manual' ? heard[i].start : duration;
    const from = Math.max(floor, heard[chunk[0]].start - ALIGN_MARGIN_SECONDS);
    const to = Math.min(ceiling, heard[chunk[chunk.length - 1]].end + ALIGN_MARGIN_SECONDS);
    const times = alignWords(em, chunk.map((k) => heard[k].text), from, to, true);
    times.forEach((t, k) => (found[chunk[k]] = t));
    floor = Math.max(floor, [...times].reverse().find((t) => t !== undefined)?.end ?? floor);
  }
  const placed = heard.map((w, k): HeardWord => {
    if (w.timing === 'manual') return w;
    if (found[k]) return { ...w, ...found[k]!, timing: 'aligned' };
    const before = found.slice(0, k).reverse().find((t) => t !== undefined);
    const after = found.slice(k + 1).find((t) => t !== undefined);
    const lo = before?.end ?? 0;
    const hi = after?.start ?? duration;
    const start = Math.min(Math.max(w.start, lo), hi);
    return { ...w, start, end: Math.max(start, Math.min(w.end, hi)) };
  });
  return { ...remap({ ...review, heard: placed }, passageText), alignedBy: em.model };
}

// ---- marks -----------------------------------------------------------------------

/**
 * The marks the review implies, by DIBELS 8 rules (ADR-0008, ADR-0010):
 * - a passage word in a settled spot is an error: an omission if nothing was said there,
 *   else a substitution;
 * - three seconds or more between the word before and a word read correctly is a hesitation error;
 * - a spot still to settle counts for nothing yet (the reading is not marked until none are).
 */
export function deriveMarks(review: ReviewedTranscript): Mark[] {
  const marks: Mark[] = [];
  for (const spot of spotsOf(review)) {
    if (!isSettled(review, spot)) continue;
    const errorType = heardIn(review, spot).length === 0 ? 'omission' : 'substitution';
    for (let word = spot.first; word <= spot.last; word++) marks.push({ word, kind: 'error', errorType });
  }
  review.words.forEach((w, word) => {
    if (w.heard === undefined || !w.span) return;
    const before = spanBefore(review, word);
    if (before && w.span.start - before.end >= HESITATION_SECONDS) marks.push({ word, kind: 'error', errorType: 'hesitation' });
  });
  return marks.sort((a, b) => a.word - b.word);
}
