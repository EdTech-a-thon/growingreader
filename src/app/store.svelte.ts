import type { Storage } from '../adapters/storage/Storage';
import type { Backup } from '../domain/backup';
import type { Microphone, MicrophoneHandle } from '../adapters/microphone/Microphone';
import type { Transcriber } from '../adapters/transcriber/Transcriber';
import type { DocumentImporter, ImportedDocument } from '../adapters/documents/DocumentImporter';
import { isAnalysing, isDiscarded, newId, type Bounds, type CompletionState, type Id, type Passage, type PassageSource, type Reading, type ReadingInProgress, type ReviewedTranscript, type Settings, type StorageUsage, type Student } from '../domain/types';
import type { BrokerClient, DriveConnection } from '../adapters/sheets/broker';
import { BrokerError } from '../adapters/sheets/broker';
import type { SheetsClient, SyncData } from '../adapters/sheets/sheets-client';
import { clampBounds } from '../domain/rate';
import { latestVersion, passageParagraphs, revisePassage, versionOf, versionReadBy, type PassageLine } from '../domain/passage';
import { canMark, canReview } from '../domain/marks';
import { alignHeard, deriveMarks, draftReview, isFullyReviewed } from '../domain/review';
import type { Emissions } from '../analysis/ctc';
import type { AlignPhase, Aligner } from '../adapters/aligner/Aligner';
import { parseName, parseRoster, type ParsedName } from '../domain/roster';
import { alignToPassage, assessCompletion, countWords, identifyPassage, passageSimilarity, refineTiming, tokenize, trimSilence } from '../analysis';

export interface AppDeps {
  storage: Storage;
  microphone: Microphone;
  transcriber: Transcriber;
  documents: DocumentImporter;
  /** Forced alignment for marking; optional, as marking works on the recogniser's times without it. */
  aligner?: Aligner;
  now?: () => number;
  /** How long the teacher holds to unlock the Done screen. */
  longPressMs?: number;
  /** How long a silent open microphone waits before the Start screen offers help. */
  micHintMs?: number;
  /** Optional in tests; production supplies the Google Sheets and auth adapters. */
  sheets?: SheetsClient;
  broker?: BrokerClient;
  clearSheetAuthorization?: () => void;
}

/** What a change to a review may need: the passage it is against, the model's frames if to hand, and the recording's length. */
export interface ReviewContext {
  text: string;
  sections: PassageLine[];
  em?: Emissions;
  duration: number;
}

export type AlignmentState =
  /**
   * `reading`: the recording is read from this device. `download`: the timing model is fetched
   * (fraction > 0) or loaded from the device. `timing`: it runs over the recording. `matching`:
   * the words are placed and matched to the passage, and saved.
   */
  | { state: 'running'; phase: 'reading' | AlignPhase | 'matching'; fraction: number; startedAt?: number; expectedSeconds?: number }
  | { state: 'done' }
  | { state: 'failed'; message: string };

const ALIGNER_SPEED_KEY = 'reading-fluency.aligner-seconds-per-second';

/** Seconds this device took to time each second of the last recording; a guess for the next. */
function alignerSpeed(): number | undefined {
  try {
    const v = Number(localStorage.getItem(ALIGNER_SPEED_KEY));
    return v > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

function rememberAlignerSpeed(secondsPerSecond: number) {
  try {
    localStorage.setItem(ALIGNER_SPEED_KEY, String(secondsPerSecond));
  } catch {
    // No storage (a private window, say): the next estimate waits for the model's first report.
  }
}

export type Screen =
  | { name: 'roster' }
  | { name: 'student'; studentId: Id }
  | { name: 'start'; studentId: Id; passageId?: Id }
  | { name: 'recording' }
  | { name: 'done'; readingId: Id }
  | { name: 'review'; readingId: Id }
  | { name: 'mark'; readingId: Id }
  | { name: 'passages' }
  | { name: 'settings' };

export type ModelStatus = { state: 'loading'; progress: number } | { state: 'ready' } | { state: 'failed'; message: string };
export type SyncStatus = 'not-synced' | 'saved' | 'saving' | 'offline' | 'reconnect';

/**
 * Why the microphone is not giving us a voice, in the teacher's terms. `quiet` is the
 * common one: permission was granted, but the microphone Chrome picked hears nothing,
 * so Start never turns green.
 */
export type MicTrouble = 'quiet' | 'blocked' | 'notfound' | 'busy' | 'other';

/** Level the meter must see before Start is offered; a guess until tried on a Chromebook. */
export const START_LEVEL_THRESHOLD = 0.05;
export const NEAR_DUPLICATE_THRESHOLD = 0.8;
export const BACKUP_REMINDER_DAYS = 14;

/**
 * Everything the screens read and every action they take. Persists through Storage,
 * records through Microphone, and analyses through Transcriber, one reading at a time.
 */
export class App {
  students = $state<Student[]>([]);
  passages = $state<Passage[]>([]);
  readings = $state<Reading[]>([]);
  settings = $state<Settings>({});
  screen = $state<Screen>({ name: 'roster' });
  ready = $state(false);
  model = $state<ModelStatus>({ state: 'loading', progress: 0 });
  /** A reading whose tab closed before Done; reported once on the roster. */
  lostReading = $state<ReadingInProgress | undefined>(undefined);
  micLevel = $state(0);
  micOpen = $state(false);
  micHeardSound = $state(false);
  micError = $state<string | undefined>(undefined);
  micTrouble = $state<MicTrouble | undefined>(undefined);
  storageUsage = $state<StorageUsage | undefined>(undefined);
  syncDialogOpen = $state(false);
  syncStatus = $state<SyncStatus>('not-synced');
  syncError = $state('');
  driveConnection = $state<DriveConnection | null>(null);

  readonly longPressMs: number;
  readonly micHintMs: number;
  private readonly now: () => number;
  private mic: MicrophoneHandle | undefined;
  private micHintTimer: ReturnType<typeof setTimeout> | undefined;
  private modelReady: Promise<boolean> = Promise.resolve(false);
  private queue = $state<Id[]>([]);
  private draining = false;
  private dataRevision = 0;
  private syncPending = false;
  private syncTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryDelay = 2_000;

  constructor(private readonly deps: AppDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.longPressMs = deps.longPressMs ?? 1500;
    this.micHintMs = deps.micHintMs ?? 6_000;
  }

  // ---- lifecycle -------------------------------------------------------

  async init() {
    const { storage } = this.deps;
    [this.students, this.passages, this.readings, this.settings] = await Promise.all([
      storage.listStudents(),
      storage.listPassages(),
      storage.listReadings(),
      storage.getSettings(),
    ]);
    await this.pinReadingsToVersions();
    if (this.settings.readingInProgress) {
      this.lostReading = this.settings.readingInProgress;
      await this.saveSettings({ ...this.settings, readingInProgress: undefined });
    }
    this.syncStatus = this.settings.googleSheets ? 'saved' : 'not-synced';
    this.ready = true;
    this.loadModel();
    for (const r of this.readings) {
      if (!isDiscarded(r) && isAnalysing(r)) this.enqueue(r.id);
    }
    void this.refreshStorageUsage();
    if (this.settings.googleSheets && this.deps.sheets) void this.syncNow();
  }

  dispose() {
    clearTimeout(this.syncTimer);
    clearTimeout(this.retryTimer);
    this.closeMicrophone();
  }

  loadModel() {
    this.model = { state: 'loading', progress: 0 };
    this.modelReady = this.deps.transcriber
      .load((fraction) => {
        if (this.model.state === 'loading') this.model = { state: 'loading', progress: fraction };
      })
      .then(() => {
        this.model = { state: 'ready' };
        // Readings analysed while the model was unavailable can now be transcribed.
        for (const r of this.readings) {
          if (r.analysis === 'done' && !r.transcript && r.hasAudio && !isDiscarded(r)) this.enqueue(r.id, { retranscribe: true });
        }
        return true;
      })
      .catch((e: unknown) => {
        this.model = { state: 'failed', message: e instanceof Error ? e.message : String(e) };
        return false;
      });
  }

  dismissLostReading() {
    this.lostReading = undefined;
  }

  async refreshStorageUsage() {
    this.storageUsage = await this.deps.storage.estimateUsage();
  }

  // ---- navigation ------------------------------------------------------

  go(screen: Screen) {
    const leavingStart = this.screen.name === 'start' && screen.name !== 'start' && screen.name !== 'recording';
    if (leavingStart) this.closeMicrophone();
    this.screen = screen;
  }

  // ---- lookups ---------------------------------------------------------

  student(id: Id) {
    return this.students.find((s) => s.id === id);
  }
  passage(id: Id | undefined) {
    return id === undefined ? undefined : this.passages.find((p) => p.id === id);
  }
  reading(id: Id) {
    return this.readings.find((r) => r.id === id);
  }
  get activeStudents() {
    return this.students.filter((s) => !s.archived).sort(byName);
  }
  readingsFor(studentId: Id) {
    return this.readings.filter((r) => r.studentId === studentId && !isDiscarded(r)).sort((a, b) => b.recordedAt - a.recordedAt);
  }
  lastReadingFor(studentId: Id) {
    return this.readingsFor(studentId)[0];
  }
  /** Readings still being analysed, oldest first. */
  get processing() {
    return this.readings.filter((r) => this.queue.includes(r.id)).sort((a, b) => a.recordedAt - b.recordedAt);
  }
  get backupDue() {
    const cutoff = this.now() - BACKUP_REMINDER_DAYS * 86_400_000;
    const since = this.settings.lastBackupAt ?? 0;
    const unbackedUp = this.readings.filter((r) => r.recordedAt > since);
    if (unbackedUp.length === 0) return false;
    return since < cutoff && Math.min(...unbackedUp.map((r) => r.recordedAt)) < cutoff;
  }

  // ---- roster ----------------------------------------------------------

  async addStudents(pasted: string) {
    for (const name of parseRoster(pasted)) await this.createStudent(name);
  }

  async addStudent(line: string) {
    if (line.trim()) await this.createStudent(parseName(line));
  }

  private async createStudent(name: ParsedName) {
    const student: Student = { id: newId(), ...name, archived: false, createdAt: this.now() };
    await this.deps.storage.putStudent(plain(student));
    this.students = [...this.students, student];
    this.dataChanged();
  }

  async archiveStudent(id: Id) {
    const s = this.student(id);
    if (!s) return;
    await this.saveStudent({ ...s, archived: true });
  }

  private async saveStudent(student: Student) {
    await this.deps.storage.putStudent(plain(student));
    this.students = this.students.map((s) => (s.id === student.id ? student : s));
    this.dataChanged();
  }

  // ---- passages --------------------------------------------------------

  nearDuplicatesOf(text: string, excludeId?: Id) {
    if (!text.trim()) return [];
    return this.passages.filter((p) => p.id !== excludeId && passageSimilarity(p.text, text) >= NEAR_DUPLICATE_THRESHOLD);
  }

  /** Read a passage out of a file the teacher chose. Throws DocumentImportError with a message for her. */
  importDocument(file: File): Promise<ImportedDocument> {
    return this.deps.documents.extract(file);
  }

  /** File types the file input offers. */
  get importAccept() {
    return this.deps.documents.accept;
  }

  async addPassage(title: string, text: string, source?: PassageSource): Promise<Passage> {
    const [passage] = await this.addPassages([{ title, text, source }]);
    return passage;
  }

  /**
   * Save a batch as one change, so a dropped folder of files is a single sync push
   * rather than one full-workbook rewrite per file.
   */
  async addPassages(batch: { title: string; text: string; source?: PassageSource }[]): Promise<Passage[]> {
    const created = batch.map(({ title, text, source }) => ({
      id: newId(),
      title: title.trim(),
      text,
      wordCount: countWords(text),
      createdAt: this.now(),
      ...(source ? { source } : {}),
    }));
    for (const passage of created) await this.deps.storage.putPassage(plain(passage));
    this.passages = [...this.passages, ...created];
    this.dataChanged();
    return created;
  }

  /** Readings that were read against the passage's latest version. */
  private readingsOfLatest(passage: Passage) {
    return this.readings.filter((r) => !isDiscarded(r) && r.passageId === passage.id && r.passageVersion === latestVersion(passage));
  }

  /** Words nobody has read yet change in place; words some reading used become a new passage version (ADR-0007). */
  async updatePassage(id: Id, title: string, text: string, source?: PassageSource) {
    const existing = this.passage(id);
    if (!existing) return;
    const inUse = this.readingsOfLatest(existing);
    const passage = revisePassage(existing, { title, text, source, at: this.now() }, inUse.length > 0);
    await this.deps.storage.putPassage(plain(passage));
    this.passages = this.passages.map((p) => (p.id === id ? passage : p));
    this.dataChanged();
    // A new version leaves every reading on the words it was read against; an in-place edit may move where they ended.
    if (latestVersion(passage) === latestVersion(existing)) for (const r of inUse) await this.realign(r.id);
  }

  /** Bring an older passage version's words back as the latest. */
  async restorePassageVersion(id: Id, version: number) {
    const passage = this.passage(id);
    const old = passage && versionOf(passage, version);
    if (passage && old) await this.updatePassage(id, passage.title, old.text, old.source);
  }

  async deletePassage(id: Id) {
    await this.deps.storage.deletePassage(id);
    this.passages = this.passages.filter((p) => p.id !== id);
    this.dataChanged();
    for (const r of this.readings) {
      if (r.passageId === id) await this.saveReading(withPassage(r, undefined));
    }
  }

  /** Readings saved before passage versions existed were read against what is now each passage's latest version. */
  private async pinReadingsToVersions() {
    for (const r of this.readings) {
      const passage = this.passage(r.passageId);
      if (passage && r.passageVersion === undefined) await this.saveReading({ ...r, passageVersion: latestVersion(passage) });
    }
  }

  // ---- recording -------------------------------------------------------

  /** Called by the Start screen: asks for the microphone and feeds the level meter. */
  async openMicrophone() {
    this.closeMicrophone();
    this.micLevel = 0;
    this.micHeardSound = false;
    this.micError = undefined;
    this.micTrouble = undefined;
    try {
      this.mic = await this.deps.microphone.open((level) => {
        this.micLevel = level;
        if (level >= START_LEVEL_THRESHOLD) this.heardSound();
      });
      this.micOpen = true;
      // Permission alone is no promise of sound: Chrome may have picked a microphone that
      // hears nothing. Say so on screen rather than leaving Start grey with no explanation.
      this.micHintTimer = setTimeout(() => {
        this.micHintTimer = undefined;
        if (this.micOpen && !this.micHeardSound) this.micTrouble = 'quiet';
      }, this.micHintMs);
    } catch (e) {
      this.micError = micMessage(e);
      this.micTrouble = micTroubleFrom(e);
    }
  }

  private heardSound() {
    this.micHeardSound = true;
    if (this.micTrouble === 'quiet') this.micTrouble = undefined;
    this.clearMicHint();
  }

  /** The teacher closed the help: say no more unless the microphone goes quiet again. */
  dismissMicTrouble() {
    this.micTrouble = undefined;
    this.clearMicHint();
  }

  private clearMicHint() {
    clearTimeout(this.micHintTimer);
    this.micHintTimer = undefined;
  }

  closeMicrophone() {
    this.clearMicHint();
    this.mic?.close();
    this.mic = undefined;
    this.micOpen = false;
  }

  get canStart() {
    return this.micHeardSound && this.micOpen;
  }

  async startReading() {
    if (this.screen.name !== 'start' || !this.mic) return;
    const { studentId } = this.screen;
    await this.saveSettings({ ...this.settings, readingInProgress: { studentId, startedAt: this.now() } });
    this.mic.start();
    this.pendingStart = { studentId, passageId: this.screen.passageId };
    this.screen = { name: 'recording' };
  }

  private pendingStart: { studentId: Id; passageId?: Id } | undefined;

  async finishReading() {
    if (!this.mic || !this.pendingStart) return;
    const { studentId, passageId } = this.pendingStart;
    const capture = await this.mic.stop();
    this.closeMicrophone();
    this.pendingStart = undefined;
    const duration = capture.samples.length / capture.sampleRate;
    const passage = this.passage(passageId);
    const reading: Reading = {
      id: newId(),
      studentId,
      passageId: passage?.id,
      ...(passage ? { passageVersion: latestVersion(passage) } : {}),
      recordedAt: this.now(),
      hasAudio: true,
      sampleRate: capture.sampleRate,
      sampleCount: capture.samples.length,
      tapBounds: { start: 0, end: duration },
      timing: 'auto',
      // Complete until the analysis suggests otherwise or the teacher says so (ADR-0001).
      completion: 'complete',
      analysis: 'queued',
    };
    await this.deps.storage.putAudio(reading.id, capture.samples);
    await this.deps.storage.putReading(plain(reading));
    this.readings = [...this.readings, reading];
    this.dataChanged();
    await this.saveSettings({ ...this.settings, readingInProgress: undefined });
    this.screen = { name: 'done', readingId: reading.id };
    this.enqueue(reading.id);
    void this.refreshStorageUsage();
  }

  // ---- review ----------------------------------------------------------

  audioFor(readingId: Id) {
    return this.deps.storage.getAudio(readingId);
  }

  async setPassage(readingId: Id, passageId: Id | undefined) {
    const r = this.reading(readingId);
    if (!r) return;
    // Picking the passage it already has keeps the version the student read.
    if (passageId !== r.passageId) await this.saveReading(withPassage(r, this.passage(passageId)));
    await this.realign(readingId);
  }

  async pasteNewPassageFor(readingId: Id, title: string, text: string, source?: PassageSource) {
    const passage = await this.addPassage(title, text, source);
    await this.setPassage(readingId, passage.id);
    return passage;
  }

  async setCompletion(readingId: Id, completion: CompletionState) {
    const r = this.reading(readingId);
    if (r) await this.saveReading({ ...r, completion, completionConfirmed: true });
  }

  async setErrors(readingId: Id, errors: number | undefined) {
    const r = this.reading(readingId);
    if (r) await this.saveReading({ ...r, errors });
  }

  // ---- marking: reviewing the transcript (ADR-0010) --------------------

  /** Start reviewing: a draft from the recogniser's words, unless there is already a review of this version. */
  async openReview(readingId: Id) {
    const r = this.reading(readingId);
    const version = r && versionReadBy(r, this.passage(r.passageId));
    if (!r || !version || !canReview(r)) return;
    if (r.reviewedTranscript?.passageVersion !== version.version || r.reviewedTranscript.formatVersion !== 2) {
      const review = draftReview(r.transcript!, version.text, version.version);
      // With words still to place in the audio the spots may change, so it waits for that;
      // without, a draft with nothing to check is marked as it stands.
      if (this.canAlign) await this.saveReading({ ...r, reviewedTranscript: review, marks: deriveMarks(review), markedAt: undefined });
      else await this.saveReviewed({ ...r, markedAt: undefined }, review);
    } else if (r.markedAt === undefined && isFullyReviewed(r.reviewedTranscript)) {
      // Settled before marking stopped waiting on every paragraph being listened to.
      await this.saveReviewed(r, r.reviewedTranscript);
    }
    if (!this.reading(readingId)?.reviewedTranscript?.alignedBy) void this.alignReview(readingId);
  }

  /**
   * Apply one change to the review. The marks are re-derived from it, and the reading is
   * marked exactly while nothing is left undecided and every paragraph has been heard; that
   * replaces any older count.
   */
  changeReview(readingId: Id, change: (review: ReviewedTranscript, ctx: ReviewContext) => ReviewedTranscript) {
    // One after another: a tick and the next paragraph's "heard" can land together, and each must see the other.
    this.reviewQueue = this.reviewQueue.then(() => this.applyReviewChange(readingId, change));
    return this.reviewQueue;
  }

  private reviewQueue: Promise<void> = Promise.resolve();

  private async applyReviewChange(readingId: Id, change: (review: ReviewedTranscript, ctx: ReviewContext) => ReviewedTranscript) {
    const r = this.reading(readingId);
    const version = r && versionReadBy(r, this.passage(r.passageId));
    if (!r || !version || !r.reviewedTranscript || !canReview(r)) return;
    const review = change(r.reviewedTranscript, { text: version.text, sections: passageParagraphs(version.text), em: this.emissionsCache.get(readingId), duration: r.sampleCount / r.sampleRate });
    if (review === r.reviewedTranscript) return;
    await this.saveReviewed(r, review);
  }

  private async saveReviewed(r: Reading, review: ReviewedTranscript) {
    const reviewed = isFullyReviewed(review);
    await this.saveReading({
      ...r,
      reviewedTranscript: review,
      marks: deriveMarks(review),
      markedAt: reviewed ? (r.markedAt ?? this.now()) : undefined,
      errors: reviewed ? undefined : r.errors,
    });
  }

  // ---- forced alignment (ADR-0010) --------------------------------------

  /**
   * Per reading being timed: how far the model has got, or why it could not. While timing,
   * when it started and (from how fast this device timed the last recording) how long it
   * should take, so progress can move between the model's reports.
   */
  alignment = $state<Record<Id, AlignmentState>>({});

  /** Whether words can be placed in the audio at all: without a model, marking starts on the recogniser's times. */
  get canAlign(): boolean {
    return !!this.deps.aligner;
  }
  /** The model's frames for a recording, kept for this session so a paragraph realigns at once. */
  private emissionsCache = new Map<Id, Emissions>();

  /** Place what was heard in the audio. Never fails the review: without the model, the recogniser's own times stand. */
  async alignReview(readingId: Id) {
    const aligner = this.deps.aligner;
    const r = this.reading(readingId);
    if (!aligner || !r?.hasAudio || !r.reviewedTranscript) return;
    let em = this.emissionsCache.get(readingId);
    if (!em) {
      if (this.alignment[readingId]?.state === 'running') return;
      this.alignment = { ...this.alignment, [readingId]: { state: 'running', phase: 'reading', fraction: 0 } };
      try {
        const samples = await this.deps.storage.getAudio(readingId);
        if (!samples) throw new Error('no audio');
        this.alignment = { ...this.alignment, [readingId]: { state: 'running', phase: 'download', fraction: 0 } };
        const audioSeconds = samples.length / r.sampleRate;
        const speed = alignerSpeed();
        let startedAt: number | undefined;
        em = await aligner.emissions(samples, r.sampleRate, (phase, fraction) => {
          if (phase === 'timing' && startedAt === undefined) startedAt = this.now();
          const timing = phase === 'timing' && startedAt !== undefined ? { startedAt, expectedSeconds: speed === undefined ? undefined : speed * audioSeconds } : {};
          this.alignment = { ...this.alignment, [readingId]: { state: 'running', phase, fraction, ...timing } };
        });
        if (startedAt !== undefined && audioSeconds > 0) rememberAlignerSpeed((this.now() - startedAt) / 1000 / audioSeconds);
        this.emissionsCache.set(readingId, em);
      } catch (e) {
        this.alignment = { ...this.alignment, [readingId]: { state: 'failed', message: e instanceof Error ? e.message : String(e) } };
        return;
      }
    }
    const found = em;
    this.alignment = { ...this.alignment, [readingId]: { state: 'running', phase: 'matching', fraction: 0 } };
    await this.changeReview(readingId, (review, { text }) => alignHeard(review, text, found));
    this.alignment = { ...this.alignment, [readingId]: { state: 'done' } };
  }

  async setNote(readingId: Id, note: string) {
    const r = this.reading(readingId);
    if (r) await this.saveReading({ ...r, note: note.trim() || undefined });
  }

  /** The teacher dragged a handle: from here on her bounds stand, whatever the analysis later finds. */
  async setBounds(readingId: Id, bounds: Bounds) {
    const r = this.reading(readingId);
    if (r) await this.saveReading({ ...r, timing: 'manual', manualBounds: clampBounds(bounds, r.sampleCount / r.sampleRate) });
  }

  async resetTiming(readingId: Id) {
    const r = this.reading(readingId);
    if (r) await this.saveReading({ ...r, timing: 'auto', manualBounds: undefined });
  }

  async discardReading(readingId: Id) {
    const r = this.reading(readingId);
    if (!r) return;
    this.queue = this.queue.filter((id) => id !== readingId);
    await this.deps.storage.deleteAudio(readingId);
    await this.saveReading(tombstone(r));
    void this.refreshStorageUsage();
  }

  async deleteAudio(readingId: Id) {
    const r = this.reading(readingId);
    if (!r) return;
    await this.deps.storage.deleteAudio(readingId);
    await this.saveReading({ ...r, hasAudio: false });
    void this.refreshStorageUsage();
  }

  private async saveReading(reading: Reading) {
    await this.deps.storage.putReading(plain(reading));
    this.readings = this.readings.map((r) => (r.id === reading.id ? reading : r));
    this.dataChanged();
  }

  private async saveSettings(settings: Settings) {
    await this.deps.storage.putSettings(plain(settings));
    this.settings = settings;
  }

  // ---- analysis queue --------------------------------------------------

  private enqueue(readingId: Id, opts: { retranscribe?: boolean } = {}) {
    if (opts.retranscribe) {
      // Pick the analysis up again from wherever it can: after trimming if that was done, else from the start.
      this.readings = this.readings.map((x) => (x.id === readingId ? { ...x, analysis: x.silenceBounds ? 'trimmed' : 'queued' } : x));
    }
    if (!this.queue.includes(readingId)) this.queue = [...this.queue, readingId];
    void this.drain();
  }

  private async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const id = this.queue[0];
        try {
          await this.analyse(id);
        } catch (e) {
          const r = this.reading(id);
          if (r) await this.saveReading({ ...r, analysis: 'failed' });
          console.error('analysis failed', e);
        }
        this.queue = this.queue.filter((q) => q !== id);
      }
    } finally {
      this.draining = false;
    }
  }

  /** Three stages, each persisted as it completes so the review screen shows partial results. */
  private async analyse(readingId: Id) {
    let r = this.reading(readingId);
    if (!r || isDiscarded(r)) return;
    const samples = await this.deps.storage.getAudio(readingId);
    r = this.reading(readingId);
    if (!r || isDiscarded(r)) return;
    if (!samples) {
      await this.saveReading({ ...r, analysis: 'done' });
      return;
    }
    if (r.analysis === 'queued') {
      r = { ...r, silenceBounds: trimSilence(samples, r.sampleRate), analysis: 'trimmed' };
      await this.saveReading(r);
    }
    if (r.analysis === 'trimmed') {
      // The model may take minutes to arrive; the teacher may edit the reading meanwhile, so re-read after every await.
      const modelAvailable = await this.modelReady;
      r = this.reading(readingId);
      if (!r || isDiscarded(r)) return;
      if (!modelAvailable) {
        await this.saveReading({ ...r, analysis: 'done' });
        return;
      }
      const transcript = await this.deps.transcriber.transcribe(samples, r.sampleRate);
      r = this.reading(readingId);
      if (!r || isDiscarded(r)) return;
      r = { ...r, transcript, analysis: 'transcribed' };
      await this.saveReading(r);
    }
    if (r.analysis === 'transcribed') {
      if (r.transcript && this.passages.length > 0 && !r.passageId) {
        const identification = identifyPassage(tokenize(r.transcript.text), this.passages);
        const identified = identification.autoAssigned ? this.passage(identification.candidates[0].passageId) : undefined;
        r = { ...r, identification, passageId: identified?.id, passageVersion: identified && latestVersion(identified) };
      }
      r = { ...r, analysis: 'done' };
      await this.saveReading(r);
      await this.realign(readingId);
    }
  }

  /** Re-run only the alignment stage: completion assessment and transcript-refined bounds. */
  private async realign(readingId: Id) {
    const r = this.reading(readingId);
    if (!r?.transcript) return;
    const version = versionReadBy(r, this.passage(r.passageId));
    if (!version) {
      if (r.completionAssessment || r.transcriptBounds) await this.saveReading(withPassage(r, undefined));
      return;
    }
    const completionAssessment = assessCompletion(r.transcript.words, version.text);
    const transcriptBounds = refineTiming(alignToPassage(r.transcript.words, version.text), r.transcript.words);
    // Until the teacher has chosen, a reading that probably stopped early loses its default Complete and waits for her.
    const completion = r.completionConfirmed || r.completion === 'discarded' ? r.completion : completionAssessment.probablyIncomplete ? 'pending' : 'complete';
    await this.saveReading({ ...r, completionAssessment, transcriptBounds, completion });
  }

  // ---- data ownership --------------------------------------------------

  async exportBackup(): Promise<Backup> {
    const audio = new Map<Id, Float32Array>();
    for (const r of this.readings) {
      const samples = r.hasAudio ? await this.deps.storage.getAudio(r.id) : undefined;
      if (samples) audio.set(r.id, samples);
    }
    const readings = this.readings.map((r) => ({ ...r, hasAudio: audio.has(r.id) }));
    await this.saveSettings({ ...this.settings, lastBackupAt: this.now() });
    return { students: this.students, passages: this.passages, readings, settings: { lastBackupAt: this.settings.lastBackupAt }, audio };
  }

  async importBackup(snapshot: Backup) {
    if (!Array.isArray(snapshot.students) || !Array.isArray(snapshot.passages) || !Array.isArray(snapshot.readings)) {
      throw new Error('Not a Growing Reader backup');
    }
    const readings = snapshot.readings.map((r) => ({ ...r, hasAudio: snapshot.audio.has(r.id) }));
    // A backup is portable data, not authority to connect another browser to a Drive file.
    const settings: Settings = snapshot.settings?.lastBackupAt !== undefined ? { lastBackupAt: snapshot.settings.lastBackupAt } : {};
    await this.deps.storage.replaceAll(plain({ students: snapshot.students, passages: snapshot.passages, readings, settings }));
    for (const r of readings) if (r.hasAudio) await this.deps.storage.putAudio(r.id, snapshot.audio.get(r.id)!);
    this.students = snapshot.students;
    this.passages = snapshot.passages;
    this.readings = readings;
    this.settings = settings;
    await this.pinReadingsToVersions();
    // A reading the backup caught mid-analysis carries on here, as it would after a reload.
    this.queue = [];
    for (const r of readings) if (!isDiscarded(r) && isAnalysing(r)) this.enqueue(r.id);
    this.syncStatus = 'not-synced';
    this.dataChanged();
    void this.refreshStorageUsage();
  }

  // ---- Google Sheets ---------------------------------------------------

  get syncLink() {
    return this.settings.googleSheets;
  }

  get syncLabel(): string {
    if (!this.syncLink) return 'Sync';
    if (this.syncStatus === 'saving') return 'Saving…';
    if (this.syncStatus === 'offline') return 'Offline · retrying';
    if (this.syncStatus === 'reconnect') return 'Reconnect';
    return 'Saved';
  }

  async openSyncDialog() {
    this.syncDialogOpen = true;
    this.syncError = '';
    if (!this.syncLink) this.syncStatus = 'not-synced';
    if (!this.deps.broker) return;
    try {
      this.driveConnection = await this.deps.broker.getConnection();
    } catch (caught) {
      this.syncError = caught instanceof Error ? caught.message : 'Could not reach the sign-in service.';
    }
  }

  closeSyncDialog() {
    this.syncDialogOpen = false;
  }

  private syncData(): SyncData {
    return { students: this.students, passages: this.passages, readings: this.readings };
  }

  private async ensureDrive(): Promise<DriveConnection | null> {
    if (!this.deps.broker) throw new Error('Google Sheets sync is not configured.');
    const current = await this.deps.broker.getConnection();
    this.driveConnection = current;
    if (!current) {
      await this.deps.broker.signIn();
      return null;
    }
    if (!current.connected || current.status === 'invalid') {
      await this.deps.broker.connectDrive();
      return null;
    }
    return current;
  }

  async createGoogleSheet() {
    if (!this.deps.sheets) throw new Error('Google Sheets sync is not configured.');
    this.syncError = '';
    try {
      const account = await this.ensureDrive();
      if (!account) return;
      this.syncStatus = 'saving';
      const revision = this.dataRevision;
      const created = await this.deps.sheets.create('Growing Reader data', this.syncData());
      await this.saveSettings({
        ...this.settings,
        googleSheets: {
          spreadsheetId: created.spreadsheetId,
          spreadsheetUrl: created.spreadsheetUrl,
          googleEmail: account.googleEmail ?? '',
          lastSyncedAt: this.now(),
        },
      });
      this.syncStatus = 'saved';
      window.open(created.spreadsheetUrl, '_blank', 'noopener');
      if (this.dataRevision !== revision) this.scheduleSync();
    } catch (caught) {
      this.handleSyncError(caught);
    }
  }

  async syncNow() {
    const link = this.syncLink;
    if (!link || !this.deps.sheets) return;
    if (this.syncStatus === 'saving') {
      this.syncPending = true;
      return;
    }
    clearTimeout(this.syncTimer);
    this.syncPending = false;
    this.syncStatus = 'saving';
    this.syncError = '';
    const revision = this.dataRevision;
    try {
      await this.deps.sheets.push(link.spreadsheetId, this.syncData());
      // An import or disconnect may have removed the link while the network request was in flight.
      if (this.syncLink?.spreadsheetId !== link.spreadsheetId) return;
      await this.saveSettings({ ...this.settings, googleSheets: { ...link, lastSyncedAt: this.now() } });
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
      this.retryDelay = 2_000;
      this.syncStatus = 'saved';
      if (this.syncPending || this.dataRevision !== revision) this.scheduleSync();
    } catch (caught) {
      this.handleSyncError(caught, true);
    }
  }

  async reconnectDrive() {
    if (!this.deps.broker) return;
    try {
      await this.deps.broker.connectDrive();
    } catch (caught) {
      this.handleSyncError(caught);
    }
  }

  async disconnectGoogleSheets() {
    if (this.syncStatus === 'saving') return;
    clearTimeout(this.syncTimer);
    clearTimeout(this.retryTimer);
    await this.saveSettings({ ...this.settings, googleSheets: undefined });
    this.syncStatus = 'not-synced';
    this.syncError = '';
  }

  async signOutGoogle() {
    if (!this.deps.broker) return;
    await this.deps.broker.signOut();
    this.deps.clearSheetAuthorization?.();
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.driveConnection = null;
    if (this.syncLink) this.syncStatus = 'reconnect';
    this.syncDialogOpen = false;
  }

  retrySync() {
    if (this.syncLink) void this.syncNow();
  }

  private dataChanged() {
    this.dataRevision += 1;
    this.syncPending = true;
    this.scheduleSync();
  }

  private scheduleSync() {
    if (!this.syncLink || !this.deps.sheets) return;
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => void this.syncNow(), 900);
  }

  private handleSyncError(caught: unknown, retry = false) {
    this.syncError = caught instanceof Error ? caught.message : 'Google Sheets could not be saved.';
    this.syncStatus = caught instanceof BrokerError && caught.needsConnection ? 'reconnect' : 'offline';
    if (!retry || this.syncStatus === 'reconnect' || this.retryTimer || !this.syncLink) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(delay * 2, 60_000);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.syncNow();
    }, delay);
  }
}

/** getUserMedia rejects with a DOMException, so read `name` and `message` by shape rather than by class. */
function errorField(e: unknown, field: 'name' | 'message'): string {
  const value = (e as Record<string, unknown> | null | undefined)?.[field];
  return typeof value === 'string' ? value : '';
}

function micMessage(e: unknown): string {
  return errorField(e, 'message') || errorField(e, 'name') || 'Microphone unavailable';
}

/**
 * getUserMedia's DOMException names, turned into the one thing the teacher can act on.
 * An unfamiliar name (an older browser, or our own worklet failure) falls through to
 * `other`, which offers the same Chrome permission steps as a block.
 */
function micTroubleFrom(e: unknown): MicTrouble {
  switch (errorField(e, 'name')) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return 'blocked';
    case 'NotFoundError':
    case 'OverconstrainedError':
    case 'DevicesNotFoundError':
      return 'notfound';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy';
    default:
      return 'other';
  }
}

/** Storage structured-clones what it is given, which a $state proxy cannot survive. */
function plain<T>(value: T): T {
  return $state.snapshot(value) as T;
}

/**
 * A reading with its passage changed is read against that passage's latest version, and
 * forgets everything that was aligned against the old one, including a doubt it raised.
 */
function withPassage(reading: Reading, passage: Passage | undefined): Reading {
  const completion = !reading.completionConfirmed && reading.completion === 'pending' ? 'complete' : reading.completion;
  return {
    ...reading,
    passageId: passage?.id,
    passageVersion: passage && latestVersion(passage),
    // Marks, and the review they come from, point at the old passage's words.
    reviewedTranscript: undefined,
    marks: undefined,
    markedAt: undefined,
    completion,
    completionAssessment: undefined,
    transcriptBounds: undefined,
  };
}

/** What a discarded reading leaves behind: enough to keep lists and the queue consistent, nothing else. */
function tombstone(reading: Reading): Reading {
  const { id, studentId, recordedAt, sampleRate, sampleCount, tapBounds } = reading;
  return { id, studentId, recordedAt, sampleRate, sampleCount, tapBounds, hasAudio: false, timing: 'auto', completion: 'discarded', analysis: 'done' };
}

function byName(a: Student, b: Student) {
  return (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName);
}
