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
  /** Kept verbatim as pasted. */
  text: string;
  /** Excludes the title; hyphenated tokens count once. */
  wordCount: number;
  createdAt: number;
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

export function newId(): Id {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
