// Dev-only example data, written out as an importable backup by scripts/make-demo-backup.mjs.
// Nothing in the app imports it. Recordings come from scripts/make-demo-audio.sh; without
// them the readings have no audio. Transcripts are what the app's recogniser heard in them.
import type { Storage } from '../adapters/storage/Storage';
import { countWords, passageWords } from '../analysis/words';
import { confirmHeard, deriveMarks, draftReview, heardIn, markHeard, openSpots } from '../domain/review';
import { CAMP_TEXT, SHIP_TEXT } from '../test/fixtures/passages';
import { SAMPLE_RATE, type Passage, type Reading, type Student, type Transcript } from '../domain/types';
import { decodeWav } from '../ui/wav';
import { demoTranscript } from './demo-transcripts';

const audioUrls = import.meta.glob<string>('./demo-audio/*.wav', { query: '?url', import: 'default', eager: true });

const DAY = 86_400_000;
/** The fixtures' passages in two paragraphs each (same words), so a review can be part done. */
const inParagraphs = (text: string) => text.split('\n').map((line, i) => (i === 2 ? `\n${line}` : line)).join('\n');
const CAMP_V1 = inParagraphs(CAMP_TEXT);
const CAMP_V2 = CAMP_V1.replace('lake', 'pond');
const SHIP = inParagraphs(SHIP_TEXT);

async function loadAudio(name: string): Promise<Float32Array | undefined> {
  const url = audioUrls[`./demo-audio/${name}.wav`];
  if (!url) return undefined;
  return decodeWav(await (await fetch(url)).arrayBuffer());
}

/** A word said wrong, never the word itself: "tent" as "tents", "ships" as "ship". */
const misread = (word: string) => (/s$/i.test(word) ? word.slice(0, -1) : `${word}s`);

/**
 * A past reading, already marked: `text` read at `wpm` words a minute, with the words at
 * `wrong` misread (and settled as said), every paragraph heard. No recording is kept, as if
 * its audio had been deleted, so these are history for the chart and the table.
 */
function markedReading(text: string, version: number, wpm: number, wrong: number[], at: number) {
  const words = passageWords(text);
  const step = 60 / wpm;
  const transcript: Transcript = {
    text: '',
    words: words.map((w, i) => ({ text: wrong.includes(i) ? misread(w) : w, start: 0.5 + i * step, end: 0.5 + i * step + step * 0.8 })),
  };
  transcript.text = transcript.words.map((w) => w.text).join(' ');
  let review = draftReview(transcript, text, version);
  for (const spot of openSpots(review)) review = confirmHeard(review, heardIn(review, spot));
  review.paragraphs.forEach((_, p) => (review = markHeard(review, p)));
  const seconds = 1 + words.length * step;
  return { transcript, reviewedTranscript: review, marks: deriveMarks(review), markedAt: at + 3_600_000, sampleCount: Math.round(seconds * SAMPLE_RATE) };
}

/** `count` word positions out of `total`, spread out and the same every time for the same `seed`. */
function spread(count: number, total: number, seed: number): number[] {
  const out = new Set<number>();
  let x = seed * 9301 + 49297;
  while (out.size < Math.min(count, total)) {
    x = (x * 9301 + 49297) % 233280;
    out.add(Math.floor((x / 233280) * total));
  }
  return [...out];
}

/** Write (or reset) the demo students, passages and readings, leaving anything else alone. */
export async function seedDemo(storage: Storage, now = Date.now()) {
  const students: Student[] = [
    { id: 'demo-ada', firstName: 'Ada', lastName: 'Lovelace', archived: false, createdAt: now - 40 * DAY },
    { id: 'demo-marcus', firstName: 'Marcus', lastName: 'Reyes', archived: false, createdAt: now - 40 * DAY },
    { id: 'demo-priya', firstName: 'Priya', lastName: 'Shah', archived: false, createdAt: now - 100 * DAY },
    { id: 'demo-jonah', firstName: 'Jonah', lastName: 'Kim', archived: false, createdAt: now - 100 * DAY },
    { id: 'demo-lena', firstName: 'Lena', lastName: 'Ortiz', archived: false, createdAt: now - 100 * DAY },
    { id: 'demo-theo', firstName: 'Theo', lastName: 'Brooks', archived: false, createdAt: now - 100 * DAY },
  ];
  const passages: Passage[] = [
    {
      id: 'demo-camp',
      title: 'Camp',
      text: CAMP_V2,
      wordCount: countWords(CAMP_V2),
      createdAt: now - 35 * DAY,
      version: 2,
      versionCreatedAt: now - 10 * DAY,
      history: [{ version: 1, text: CAMP_V1, wordCount: countWords(CAMP_V1), createdAt: now - 35 * DAY }],
    },
    { id: 'demo-ship', title: 'Ship', text: SHIP, wordCount: countWords(SHIP), createdAt: now - 35 * DAY },
  ];

  const reading = async (r: Omit<Reading, 'hasAudio' | 'sampleRate' | 'sampleCount' | 'tapBounds' | 'timing' | 'analysis'> & { sampleCount?: number; analysis?: Reading['analysis'] }, audio?: string) => {
    const samples = audio ? await loadAudio(audio) : undefined;
    const sampleCount = samples?.length ?? r.sampleCount ?? 75 * SAMPLE_RATE;
    if (samples) await storage.putAudio(r.id, samples);
    else await storage.deleteAudio(r.id);
    const full: Reading = {
      ...r,
      hasAudio: !!samples,
      sampleRate: SAMPLE_RATE,
      sampleCount,
      tapBounds: { start: 0, end: sampleCount / SAMPLE_RATE },
      timing: 'auto',
      analysis: r.analysis ?? 'done',
    };
    await storage.putReading(full);
  };

  for (const s of students) await storage.putStudent(s);
  for (const p of passages) await storage.putPassage(p);

  // Ada: an incomplete try, a reading of version 1 three weeks ago ("a" read as "the",
  // "flip… flap", "sleep" read as "bed"), and one of version 2. Neither is marked yet.
  await reading({ id: 'demo-ada-0', studentId: 'demo-ada', passageId: 'demo-ship', passageVersion: 1, recordedAt: now - 28 * DAY, completion: 'incomplete', completionConfirmed: true });
  const ada1 = demoTranscript('ada-camp-1')!;
  await reading(
    {
      id: 'demo-ada-1', studentId: 'demo-ada', passageId: 'demo-camp', passageVersion: 1, recordedAt: now - 21 * DAY, completion: 'complete', completionConfirmed: true, transcript: ada1, note: 'Ready to mark.',
    },
    'ada-camp-1',
  );
  await reading(
    { id: 'demo-ada-2', studentId: 'demo-ada', passageId: 'demo-camp', passageVersion: 2, recordedAt: now - 2 * DAY, completion: 'complete', completionConfirmed: true, transcript: demoTranscript('ada-camp-2'), note: 'Ready to mark.' },
    'ada-camp-2',
  );

  // A recording made in the app today (demo-audio/ada-recorded.wav): no transcript yet, so the
  // app listens to it once the backup is imported, works out which passage it was and whether
  // it was finished, and it is ready to mark after that.
  await reading(
    { id: 'demo-ada-3', studentId: 'demo-ada', recordedAt: now - 2 * 3_600_000, completion: 'complete', completionConfirmed: false, analysis: 'queued', note: 'Ready to mark.' },
    'ada-recorded',
  );

  // Marcus: an older reading with a typed-in count from before marking, and one not marked yet:
  // the recogniser wrote the passage's "dock" and "captain" where he said "duck" and "cap tin",
  // and has its own slips ("ships lit" for "ship slid", "gulls").
  // About 170 words a minute, in line with the rest of his term.
  await reading({ id: 'demo-marcus-1', studentId: 'demo-marcus', passageId: 'demo-ship', passageVersion: 1, recordedAt: now - 20 * DAY, completion: 'complete', completionConfirmed: true, errors: 4, sampleCount: Math.round((countWords(SHIP) / 170) * 60 * SAMPLE_RATE) });
  const ship = demoTranscript('marcus-ship')!;
  await reading(
    { id: 'demo-marcus-2', studentId: 'demo-marcus', passageId: 'demo-ship', passageVersion: 1, recordedAt: now - 1 * DAY, completion: 'complete', completionConfirmed: true, transcript: ship, note: 'Ready to mark.' },
    'marcus-ship',
  );
  // A second one of his to mark, of the same passage (the demo has only so many recordings).
  await reading(
    { id: 'demo-marcus-3', studentId: 'demo-marcus', passageId: 'demo-ship', passageVersion: 1, recordedAt: now - 12 * DAY, completion: 'complete', completionConfirmed: true, transcript: ship, note: 'Ready to mark.' },
    'marcus-ship',
  );

  // A school term of weekly, marked readings for everyone, getting quicker and more accurate:
  // history for the chart and the table. Camp was edited ten days ago, so the newest Camp
  // readings are of version 2.
  const history: Array<{ student: string; from: [number, number]; to: [number, number]; weeks: number }> = [
    // [words per minute, errors] at the start of term and now.
    { student: 'demo-ada', from: [150, 9], to: [200, 3], weeks: 9 },
    { student: 'demo-marcus', from: [150, 11], to: [195, 4], weeks: 9 },
    { student: 'demo-priya', from: [92, 6], to: [128, 1], weeks: 12 },
    { student: 'demo-jonah', from: [44, 15], to: [61, 9], weeks: 12 },
    { student: 'demo-lena', from: [71, 9], to: [102, 3], weeks: 12 },
    { student: 'demo-theo', from: [63, 10], to: [70, 8], weeks: 12 },
  ];
  for (const [n, h] of history.entries()) {
    for (let w = 0; w < h.weeks; w++) {
      const f = h.weeks === 1 ? 1 : w / (h.weeks - 1);
      // Weekly, most recent a few days before the demo's own readings; a little wobble week to week.
      const at = now - (h.weeks - w) * 7 * DAY - 3 * DAY + (n % 3) * 3_600_000;
      const wobble = ((w * 7 + n * 3) % 5) - 2;
      const wpm = Math.round(h.from[0] + (h.to[0] - h.from[0]) * f + wobble * 2);
      const errors = Math.max(0, Math.round(h.from[1] + (h.to[1] - h.from[1]) * f + (wobble > 1 ? 1 : 0)));
      // One passage for the first half of term, the other after: one change on the chart.
      const camp = (w < h.weeks / 2) === (n % 2 === 1);
      const version = camp && at >= now - 10 * DAY ? 2 : 1;
      const text = camp ? (version === 2 ? CAMP_V2 : CAMP_V1) : SHIP;
      const marked = markedReading(text, version, wpm, spread(errors, passageWords(text).length, n * 31 + w), at);
      await reading({
        id: `demo-${h.student.slice(5)}-w${w}`,
        studentId: h.student,
        passageId: camp ? 'demo-camp' : 'demo-ship',
        passageVersion: version,
        recordedAt: at,
        completion: 'complete',
        completionConfirmed: true,
        ...marked,
      });
    }
  }
}
