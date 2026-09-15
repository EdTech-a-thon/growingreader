import type { Storage, Snapshot } from '../adapters/storage/Storage';
import type { Microphone, MicrophoneSession } from '../adapters/microphone/Microphone';
import type { Transcriber } from '../adapters/transcriber/Transcriber';
import { newId, type CompletionState, type Id, type Passage, type Reading, type Settings, type Student, type TimingChoice } from '../domain/types';
import { parseName, parseRoster } from '../domain/roster';
import { alignToPassage, assessCompletion, countWords, identifyPassage, passageSimilarity, refineTiming, tokenize, trimSilence } from '../analysis';

export interface AppDeps {
  storage: Storage;
  microphone: Microphone;
  transcriber: Transcriber;
  now?: () => number;
  /** How long the teacher holds to unlock the Done screen. */
  longPressMs?: number;
}

export type Screen =
  | { name: 'roster' }
  | { name: 'student'; studentId: Id }
  | { name: 'progress'; studentId: Id }
  | { name: 'start'; studentId: Id; passageId?: Id }
  | { name: 'recording' }
  | { name: 'done'; readingId: Id }
  | { name: 'review'; readingId: Id }
  | { name: 'passages' }
  | { name: 'settings' };

export type ModelStatus = { state: 'loading'; progress: number } | { state: 'ready' } | { state: 'failed'; message: string };

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
  lostReading = $state<{ studentId: Id; startedAt: number } | undefined>(undefined);
  micLevel = $state(0);
  micOpen = $state(false);
  micHeardSound = $state(false);
  micError = $state<string | undefined>(undefined);
  storageUsage = $state<{ usage: number; quota: number } | undefined>(undefined);

  readonly longPressMs: number;
  private readonly now: () => number;
  private session: MicrophoneSession | undefined;
  private modelReady: Promise<boolean> = Promise.resolve(false);
  private queue = $state<Id[]>([]);
  private draining = false;

  constructor(private readonly deps: AppDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.longPressMs = deps.longPressMs ?? 1500;
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
    this.ready = true;
    this.loadModel();
    for (const r of this.readings) {
      if (r.completion !== 'discarded' && r.analysis !== 'done' && r.analysis !== 'failed') this.enqueue(r.id);
    }
    void this.refreshStorageUsage();
  }

  loadModel() {
    this.model = { state: 'loading', progress: 0 };
    this.modelReady = this.deps.transcriber
      .load((fraction) => {
        if (this.model.state === 'loading') this.model = { state: 'loading', progress: fraction };
      })
      .then(() => {
        this.model = { state: 'ready' };
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
    if (this.screen.name === 'start' && screen.name !== 'recording') this.closeMicrophone();
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
    return this.readings.filter((r) => r.studentId === studentId && r.completion !== 'discarded').sort((a, b) => b.recordedAt - a.recordedAt);
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
    for (const name of parseRoster(pasted)) {
      const student: Student = { id: newId(), ...name, archived: false, createdAt: this.now() };
      await this.deps.storage.putStudent(plain(student));
      this.students = [...this.students, student];
    }
  }

  async addStudent(line: string) {
    if (!line.trim()) return;
    const student: Student = { id: newId(), ...parseName(line), archived: false, createdAt: this.now() };
    await this.deps.storage.putStudent(plain(student));
    this.students = [...this.students, student];
  }

  async archiveStudent(id: Id) {
    const s = this.student(id);
    if (!s) return;
    await this.saveStudent({ ...s, archived: true });
  }

  private async saveStudent(student: Student) {
    await this.deps.storage.putStudent(plain(student));
    this.students = this.students.map((s) => (s.id === student.id ? student : s));
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
    return passage;
  }

  async updatePassage(id: Id, title: string, text: string) {
    const existing = this.passage(id);
    if (!existing) return;
    const passage: Passage = { ...existing, title: title.trim(), text, wordCount: countWords(text) };
    await this.deps.storage.putPassage(plain(passage));
    this.passages = this.passages.map((p) => (p.id === id ? passage : p));
    for (const r of this.readings) if (r.passageId === id) await this.realign(r.id);
  }

  async deletePassage(id: Id) {
    await this.deps.storage.deletePassage(id);
    this.passages = this.passages.filter((p) => p.id !== id);
    for (const r of this.readings) {
      if (r.passageId === id) await this.saveReading({ ...r, passageId: undefined, completionAssessment: undefined, transcriptBounds: undefined });
    }
  }

  // ---- recording -------------------------------------------------------

  /** Called by the Start screen: asks for the microphone and feeds the level meter. */
  async openMicrophone() {
    this.closeMicrophone();
    this.micLevel = 0;
    this.micHeardSound = false;
    this.micError = undefined;
    try {
      this.session = await this.deps.microphone.open((level) => {
        this.micLevel = level;
        if (level >= START_LEVEL_THRESHOLD) this.micHeardSound = true;
      });
      this.micOpen = true;
    } catch (e) {
      this.micError = e instanceof Error ? e.message : 'Microphone unavailable';
    }
  }

  closeMicrophone() {
    this.session?.close();
    this.session = undefined;
    this.micOpen = false;
  }

  get canStart() {
    return this.micHeardSound && this.micOpen;
  }

  async startReading() {
    if (this.screen.name !== 'start' || !this.session) return;
    const { studentId } = this.screen;
    await this.saveSettings({ ...this.settings, readingInProgress: { studentId, startedAt: this.now() } });
    this.session.start();
    this.pendingStart = { studentId, passageId: this.screen.passageId };
    this.screen = { name: 'recording' };
  }

  private pendingStart: { studentId: Id; passageId?: Id } | undefined;

  async finishReading() {
    if (!this.session || !this.pendingStart) return;
    const { studentId, passageId } = this.pendingStart;
    const capture = await this.session.stop();
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
      completion: 'pending',
      analysis: 'queued',
    };
    await this.deps.storage.putAudio(reading.id, capture.samples);
    await this.deps.storage.putReading(plain(reading));
    this.readings = [...this.readings, reading];
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
    await this.saveReading({ ...r, passageId, completionAssessment: undefined, transcriptBounds: undefined });
    await this.realign(readingId);
  }

  async pasteNewPassageFor(readingId: Id, title: string, text: string) {
    const passage = await this.addPassage(title, text);
    await this.setPassage(readingId, passage.id);
    return passage;
  }

  async setCompletion(readingId: Id, completion: CompletionState) {
    const r = this.reading(readingId);
    if (r) await this.saveReading({ ...r, completion });
  }

  async setErrors(readingId: Id, errors: number | undefined) {
    const r = this.reading(readingId);
    if (r) await this.saveReading({ ...r, errors });
  }

  async setNote(readingId: Id, note: string) {
    const r = this.reading(readingId);
    if (r) await this.saveReading({ ...r, note: note.trim() || undefined });
  }

  async setTiming(readingId: Id, timing: TimingChoice) {
    const r = this.reading(readingId);
    if (r) await this.saveReading({ ...r, timing });
  }

  async discardReading(readingId: Id) {
    const r = this.reading(readingId);
    if (!r) return;
    this.queue = this.queue.filter((id) => id !== readingId);
    await this.deps.storage.deleteAudio(readingId);
    await this.saveReading({ ...r, completion: 'discarded', hasAudio: false, transcript: undefined });
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
  }

  private async saveSettings(settings: Settings) {
    await this.deps.storage.putSettings(plain(settings));
    this.settings = settings;
  }

  // ---- analysis queue --------------------------------------------------

  private enqueue(readingId: Id) {
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
    if (!r || r.completion === 'discarded') return;
    const samples = await this.deps.storage.getAudio(readingId);
    if (!samples) {
      await this.saveReading({ ...r, analysis: 'done' });
      return;
    }
    if (r.analysis === 'queued') {
      r = { ...r, silenceBounds: trimSilence(samples, r.sampleRate), analysis: 'trimmed' };
      await this.saveReading(r);
    }
    if (r.analysis === 'trimmed') {
      const modelAvailable = await this.modelReady;
      if (!modelAvailable) {
        await this.saveReading({ ...r, analysis: 'done' });
        return;
      }
      const transcript = await this.deps.transcriber.transcribe(samples, r.sampleRate);
      r = this.reading(readingId);
      if (!r || r.completion === 'discarded') return;
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
      if (r.completionAssessment || r.transcriptBounds) await this.saveReading({ ...r, completionAssessment: undefined, transcriptBounds: undefined });
      return;
    }
    const completionAssessment = assessCompletion(r.transcript.words, passage.text);
    const transcriptBounds = refineTiming(alignToPassage(r.transcript.words, passage.text), r.transcript.words);
    await this.saveReading({ ...r, completionAssessment, transcriptBounds });
  }

  // ---- data ownership --------------------------------------------------

  async exportBackup(): Promise<Snapshot> {
    const readings = this.readings.map((r) => ({ ...r, hasAudio: false }));
    await this.saveSettings({ ...this.settings, lastBackupAt: this.now() });
    return { students: this.students, passages: this.passages, readings, settings: { lastBackupAt: this.settings.lastBackupAt } };
  }

  async importBackup(snapshot: Snapshot) {
    if (!Array.isArray(snapshot.students) || !Array.isArray(snapshot.passages) || !Array.isArray(snapshot.readings)) {
      throw new Error('Not a Reading Fluency backup');
    }
    const readings = snapshot.readings.map((r) => ({ ...r, hasAudio: false }));
    await this.deps.storage.replaceAll(plain({ ...snapshot, readings, settings: snapshot.settings ?? {} }));
    this.students = snapshot.students;
    this.passages = snapshot.passages;
    this.readings = readings;
    this.settings = snapshot.settings ?? {};
    void this.refreshStorageUsage();
  }
}

/** Storage structured-clones what it is given, which a $state proxy cannot survive. */
function plain<T>(value: T): T {
  return $state.snapshot(value) as T;
}

function byName(a: Student, b: Student) {
  return (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName);
}
