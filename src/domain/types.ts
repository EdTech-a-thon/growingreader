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

/** Which of a reading's candidate bounds the teacher chose; 'auto' takes the most refined available. */
export type TimingSource = 'tap' | 'silence' | 'transcript';
export type TimingChoice = TimingSource | 'auto';

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
  timing: TimingChoice;
  transcript?: Transcript;
  identification?: Identification;
  completionAssessment?: CompletionAssessment;
  completion: CompletionState;
  errors?: number;
  note?: string;
  analysis: AnalysisStage;
}

export interface Settings {
  lastBackupAt?: number;
  /** Set when a student tapped Start; cleared on Done. Survives a closed tab so the loss can be reported. */
  readingInProgress?: { studentId: Id; startedAt: number };
}

export const SAMPLE_RATE = 16000;

export function newId(): Id {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
