// Domain vocabulary follows CONTEXT.md exactly: Student, Teacher, Passage,
// Reading, Roster, Transcript, Rate, Complete, Errors, Words correct per minute.

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

export type CompletionState = 'pending' | 'complete' | 'incomplete' | 'discarded';

export type AnalysisStage = 'queued' | 'trimmed' | 'transcribed' | 'done' | 'failed';

export interface Reading {
  id: Id;
  studentId: Id;
  passageId?: Id;
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
  errors?: number;
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
