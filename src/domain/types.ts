// Domain vocabulary follows CONTEXT.md exactly: Student, Teacher, Passage,
// Reading, Roster, Transcript, Rate, Complete, Passage version, Mark, Errors,
// Accuracy, Words correct per minute.

export type Id = string;

export interface Student {
  id: Id;
  firstName: string;
  lastName: string;
  archived: boolean;
  createdAt: number;
}

export interface Passage {
  id: Id;
  title: string;
  /** Kept verbatim as pasted, or as read out of an imported file and corrected by the teacher. */
  text: string;
  /** Excludes the title; hyphenated tokens count once. */
  wordCount: number;
  createdAt: number;
  /** Set when the text was read out of a file rather than pasted. */
  source?: PassageSource;
  /** The passage version `text` and `wordCount` hold; 1 when absent. */
  version?: number;
  /** When the latest version was made; the passage's `createdAt` for version 1. */
  versionCreatedAt?: number;
  /** Earlier passage versions, oldest first. Never changed once written (ADR-0007). */
  history?: PassageVersion[];
}

/** One wording of a passage. The latest lives on the Passage itself; older ones in its history. */
export interface PassageVersion {
  version: number;
  text: string;
  wordCount: number;
  createdAt: number;
  source?: PassageSource;
}

/**
 * Where an imported passage's text came from. The file itself is not kept: the extracted
 * text is the passage (ADR-0005), and the word count it produced is an estimate.
 */
export interface PassageSource {
  kind: 'pdf' | 'text';
  fileName: string;
  importedAt: number;
}


/** Seconds from the start of the recording. */
export interface Bounds {
  start: number;
  end: number;
}

/** Where a reading's automatic bounds came from: tap-to-tap, silence trimming, or the transcript's first and last word. */
export type TimingSource = 'tap' | 'silence' | 'transcript';
/** 'auto' takes the most refined bounds available; 'manual' is the teacher's own handles, seeded from the auto bounds. */
export type TimingChoice = 'auto' | 'manual';

export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
}

export interface Transcript {
  text: string;
  words: TranscriptWord[];
}

export interface PassageCandidate {
  passageId: Id;
  /** 0..1, normalised alignment similarity. */
  score: number;
}

export interface Identification {
  candidates: PassageCandidate[];
  /** Set when the top candidate cleared the floor and margin. */
  autoAssigned: boolean;
}

/** The app's opinion; the teacher's completion state is authoritative. */
export interface CompletionAssessment {
  reachedWord: number;
  ofWords: number;
  probablyIncomplete: boolean;
}

/** An error mark is DIBELS's slash; a self-correction counts as read correctly (ADR-0008). */
export type MarkKind = 'error' | 'self-correction';
/** Optional on an error mark; never changes the count. */
export type ErrorType = 'substitution' | 'omission' | 'hesitation';

/** One judgement against one word of the passage version read. `word` indexes `passageWords(text)`. */
export interface Mark {
  word: number;
  kind: MarkKind;
  errorType?: ErrorType;
}

/**
 * Where a heard word's time came from, best last: the recogniser's own timestamp, forced
 * alignment to the audio, a share of a gap (no model to hand), or the teacher dragging it
 * (never moved by the app after).
 */
export type HeardTiming = 'asr' | 'aligned' | 'estimated' | 'manual';

/**
 * One word of what was said, as the teacher settles it (ADR-0010): the recogniser's word, or
 * one the teacher typed, at the time it was said.
 */
export interface HeardWord {
  text: string;
  start: number;
  end: number;
  timing: HeardTiming;
  /** Written by the recogniser, or by the teacher (a correction, a split, a word it missed). */
  origin: 'asr' | 'teacher';
  /** The teacher said this is what was said. A word the teacher wrote is confirmed. */
  confirmed?: boolean;
}

/** Where in the recording a passage word was read: its heard word's time, or a share of a gap. */
export interface WordSpan {
  start: number;
  end: number;
  timing: 'heard' | 'estimated';
}

/** One passage word, as the reading is reconstructed against it (ADR-0010). Derived from `heard`, except `omitted`. */
export interface WordReview {
  span?: WordSpan;
  /** The heard word that is exactly this passage word, in order: it was read correctly. */
  heard?: number;
  /** The teacher listened and nothing was read here. */
  omitted?: boolean;
}

/** One paragraph of the passage version, as the teacher reviews it. */
export interface ReviewParagraph {
  /** Played through (most of it) at least once; a paragraph cannot be done unheard. */
  heard: boolean;
}

/**
 * The reading reconstructed against the passage (ADR-0010): what was said, as the teacher
 * settled it, placed in the audio, and each passage word matched to it or not. Marks are
 * derived from it. Also a labelled example: audio, the recogniser's untouched words, and the
 * corrected, timed transcript.
 */
export interface ReviewedTranscript {
  formatVersion: 2;
  passageVersion: number;
  source: { model: string; words: TranscriptWord[] };
  /** What was said, in order. */
  heard: HeardWord[];
  /** One per word of the passage version, in `passageWords` order. */
  words: WordReview[];
  /** One per paragraph of the passage version. */
  paragraphs: ReviewParagraph[];
  /** The aligner that placed the heard words, once one has. */
  alignedBy?: string;
}

export type CompletionState ='pending' | 'complete' | 'incomplete' | 'discarded';

export type AnalysisStage = 'queued' | 'trimmed' | 'transcribed' | 'done' | 'failed';

export interface Reading {
  id: Id;
  studentId: Id;
  passageId?: Id;
  /** The passage version the student read; set whenever `passageId` is. */
  passageVersion?: number;
  recordedAt: number;
  hasAudio: boolean;
  sampleRate: number;
  sampleCount: number;
  /** Tap-to-tap: always 0..duration. */
  tapBounds: Bounds;
  silenceBounds?: Bounds;
  transcriptBounds?: Bounds;
  /** Where the teacher dragged the handles to; in force while `timing` is 'manual'. */
  manualBounds?: Bounds;
  timing: TimingChoice;
  transcript?: Transcript;
  identification?: Identification;
  completionAssessment?: CompletionAssessment;
  /** Complete by default; the app's assessment may move it to 'pending' until the teacher has chosen. */
  completion: CompletionState;
  /** Set once the teacher taps Complete or Incomplete; from then on the assessment never changes `completion`. */
  completionConfirmed?: boolean;
  /** A bare count the teacher entered before marking existed; superseded once the reading is marked. */
  errors?: number;
  /** The teacher's review of the transcript against the passage version read; the source of `marks`. */
  reviewedTranscript?: ReviewedTranscript;
  /** Derived from `reviewedTranscript` (domain/review.ts) and cached here for everything that counts; never edited directly. */
  marks?: Mark[];
  /** Set once every line of the reviewed transcript is reviewed; cleared again by any change to it. */
  markedAt?: number;
  note?: string;
  analysis: AnalysisStage;
}

/** Set when a student tapped Start; cleared on Done. Survives a closed tab so the loss can be reported. */
export interface ReadingInProgress {
  studentId: Id;
  startedAt: number;
}

export interface SheetSyncLink {
  spreadsheetId: string;
  spreadsheetUrl: string;
  googleEmail: string;
  lastSyncedAt?: number;
}

export interface Settings {
  lastBackupAt?: number;
  readingInProgress?: ReadingInProgress;
  googleSheets?: SheetSyncLink;
}

export interface StorageUsage {
  usage: number;
  quota: number;
}

export function isDiscarded(reading: Reading): boolean {
  return reading.completion === 'discarded';
}

export function isAnalysing(reading: Reading): boolean {
  return reading.analysis !== 'done' && reading.analysis !== 'failed';
}

export const SAMPLE_RATE = 16000;

/**
 * A passage is a page or two. The ceiling exists because a passage's text travels to the
 * Google Sheet in a single cell, and a cell holds 50,000 characters — past that, sync fails
 * with a generic error and retries forever behind an "Offline" label. 5,000 words is roughly
 * ten times the longest plausible passage and well under the cell's limit.
 */
export const MAX_PASSAGE_WORDS = 5000;

export function newId(): Id {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
