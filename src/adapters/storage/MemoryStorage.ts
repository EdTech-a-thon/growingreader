import type { Id, Passage, Reading, Settings, Student } from '../../domain/types';
import type { Snapshot, Storage } from './Storage';

const clone = <T>(v: T): T => structuredClone(v);

/** In-memory Storage for tests; same contract as IndexedDbStorage. */
export class MemoryStorage implements Storage {
  private students = new Map<Id, Student>();
  private passages = new Map<Id, Passage>();
  private readings = new Map<Id, Reading>();
  private audio = new Map<Id, Float32Array>();
  private settings: Settings = {};
  usage: { usage: number; quota: number } | undefined = undefined;

  async listStudents() {
    return [...this.students.values()].map(clone);
  }
  async putStudent(s: Student) {
    this.students.set(s.id, clone(s));
  }
  async listPassages() {
    return [...this.passages.values()].map(clone);
  }
  async putPassage(p: Passage) {
    this.passages.set(p.id, clone(p));
  }
  async deletePassage(id: Id) {
    this.passages.delete(id);
  }
  async listReadings() {
    return [...this.readings.values()].map(clone);
  }
  async putReading(r: Reading) {
    this.readings.set(r.id, clone(r));
  }
  async putAudio(id: Id, samples: Float32Array) {
    this.audio.set(id, new Float32Array(samples));
  }
  async getAudio(id: Id) {
    const s = this.audio.get(id);
    return s ? new Float32Array(s) : undefined;
  }
  async deleteAudio(id: Id) {
    this.audio.delete(id);
  }
  async getSettings() {
    return clone(this.settings);
  }
  async putSettings(s: Settings) {
    this.settings = clone(s);
  }
  async replaceAll(snapshot: Snapshot) {
    this.students = new Map(snapshot.students.map((s) => [s.id, clone(s)]));
    this.passages = new Map(snapshot.passages.map((p) => [p.id, clone(p)]));
    this.readings = new Map(snapshot.readings.map((r) => [r.id, clone(r)]));
    this.audio.clear();
    this.settings = clone(snapshot.settings);
  }
  async estimateUsage() {
    return this.usage;
  }
}
