import type { Storage, Snapshot } from '../adapters/storage/Storage';
import type { Microphone, MicrophoneHandle } from '../adapters/microphone/Microphone';
import type { Transcriber } from '../adapters/transcriber/Transcriber';
import { isAnalysing, isDiscarded, newId, type Bounds, type CompletionState, type Id, type Passage, type Reading, type ReadingInProgress, type Settings, type StorageUsage, type Student } from '../domain/types';
import type { BrokerClient, DriveConnection } from '../adapters/sheets/broker';
import { BrokerError } from '../adapters/sheets/broker';
import type { SheetsClient, SyncData } from '../adapters/sheets/sheets-client';
import { clampBounds } from '../domain/rate';
import { parseName, parseRoster, type ParsedName } from '../domain/roster';
import { alignToPassage, assessCompletion, countWords, identifyPassage, passageSimilarity, refineTiming, tokenize, trimSilence } from '../analysis';

export interface AppDeps {
  storage: Storage;
  microphone: Microphone;
  transcriber: Transcriber;
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

export type Screen =
  | { name: 'roster' }
  | { name: 'student'; studentId: Id }
  | { name: 'start'; studentId: Id; passageId?: Id }
  | { name: 'recording' }
  | { name: 'done'; readingId: Id }
  | { name: 'review'; readingId: Id }
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

  async addPassage(title: string, text: string): Promise<Passage> {
    const passage: Passage = { id: newId(), title: title.trim(), text, wordCount: countWords(text), createdAt: this.now() };
    await this.deps.storage.putPassage(plain(passage));
    this.passages = [...this.passages, passage];
    this.dataChanged();
    return passage;
  }

  async updatePassage(id: Id, title: string, text: string) {
    const existing = this.passage(id);
    if (!existing) return;
    const passage: Passage = { ...existing, title: title.trim(), text, wordCount: countWords(text) };
    await this.deps.storage.putPassage(plain(passage));
    this.passages = this.passages.map((p) => (p.id === id ? passage : p));
    this.dataChanged();
    for (const r of this.readings) if (r.passageId === id) await this.realign(r.id);
  }

  async deletePassage(id: Id) {
    await this.deps.storage.deletePassage(id);
    this.passages = this.passages.filter((p) => p.id !== id);
    this.dataChanged();
    for (const r of this.readings) {
      if (r.passageId === id) await this.saveReading(withPassage(r, undefined));
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
    const reading: Reading = {
      id: newId(),
      studentId,
      passageId,
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
    await this.saveReading(withPassage(r, passageId));
    await this.realign(readingId);
  }

  async pasteNewPassageFor(readingId: Id, title: string, text: string) {
    const passage = await this.addPassage(title, text);
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
        r = { ...r, identification, passageId: identification.autoAssigned ? identification.candidates[0].passageId : undefined };
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
    const passage = this.passage(r.passageId);
    if (!passage) {
      if (r.completionAssessment || r.transcriptBounds) await this.saveReading(withPassage(r, undefined));
      return;
    }
    const completionAssessment = assessCompletion(r.transcript.words, passage.text);
    const transcriptBounds = refineTiming(alignToPassage(r.transcript.words, passage.text), r.transcript.words);
    // Until the teacher has chosen, a reading that probably stopped early loses its default Complete and waits for her.
    const completion = r.completionConfirmed || r.completion === 'discarded' ? r.completion : completionAssessment.probablyIncomplete ? 'pending' : 'complete';
    await this.saveReading({ ...r, completionAssessment, transcriptBounds, completion });
  }

  // ---- data ownership --------------------------------------------------

  async exportBackup(): Promise<Snapshot> {
    const readings = this.readings.map((r) => ({ ...r, hasAudio: false }));
    await this.saveSettings({ ...this.settings, lastBackupAt: this.now() });
    return { students: this.students, passages: this.passages, readings, settings: { lastBackupAt: this.settings.lastBackupAt } };
  }

  async importBackup(snapshot: Snapshot) {
    if (!Array.isArray(snapshot.students) || !Array.isArray(snapshot.passages) || !Array.isArray(snapshot.readings)) {
      throw new Error('Not a Growing Reader backup');
    }
    const readings = snapshot.readings.map((r) => ({ ...r, hasAudio: false }));
    // A backup is portable data, not authority to connect another browser to a Drive file.
    const settings: Settings = snapshot.settings?.lastBackupAt !== undefined ? { lastBackupAt: snapshot.settings.lastBackupAt } : {};
    await this.deps.storage.replaceAll(plain({ ...snapshot, readings, settings }));
    this.students = snapshot.students;
    this.passages = snapshot.passages;
    this.readings = readings;
    this.settings = settings;
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

/** A reading with its passage changed forgets everything that was aligned against the old one, including a doubt it raised. */
function withPassage(reading: Reading, passageId: Id | undefined): Reading {
  const completion = !reading.completionConfirmed && reading.completion === 'pending' ? 'complete' : reading.completion;
  return { ...reading, passageId, completion, completionAssessment: undefined, transcriptBounds: undefined };
}

/** What a discarded reading leaves behind: enough to keep lists and the queue consistent, nothing else. */
function tombstone(reading: Reading): Reading {
  const { id, studentId, recordedAt, sampleRate, sampleCount, tapBounds } = reading;
  return { id, studentId, recordedAt, sampleRate, sampleCount, tapBounds, hasAudio: false, timing: 'auto', completion: 'discarded', analysis: 'done' };
}

function byName(a: Student, b: Student) {
  return (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName);
}
