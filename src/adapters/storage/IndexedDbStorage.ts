import type { Id, Passage, Reading, Settings, Student } from '../../domain/types';
import type { Snapshot, Storage } from './Storage';

const DB_NAME = 'reading-fluency';
const DB_VERSION = 2;
const STORES = ['students', 'passages', 'readings', 'audio', 'settings'] as const;
type StoreName = (typeof STORES)[number];

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Storage backed by the browser's IndexedDB. Audio is stored as the raw Float32 buffer. */
export class IndexedDbStorage implements Storage {
  private dbPromise: Promise<IDBDatabase> | undefined;

  constructor(private readonly name: string = DB_NAME) {}

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      const req = indexedDB.open(this.name, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const store of STORES) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
        }
        // Version 2 briefly kept imported PDFs; the extracted text is the passage now (ADR-0005).
        if (db.objectStoreNames.contains('passageFiles')) db.deleteObjectStore('passageFiles');
      };
      this.dbPromise = request(req);
    }
    return this.dbPromise;
  }

  private async getAll<T>(store: StoreName): Promise<T[]> {
    const db = await this.db();
    return request(db.transaction(store, 'readonly').objectStore(store).getAll() as IDBRequest<T[]>);
  }

  private async get<T>(store: StoreName, key: Id): Promise<T | undefined> {
    const db = await this.db();
    return request(db.transaction(store, 'readonly').objectStore(store).get(key) as IDBRequest<T | undefined>);
  }

  private async put(store: StoreName, key: Id, value: unknown): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    await done(tx);
  }

  private async remove(store: StoreName, key: Id): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    await done(tx);
  }

  listStudents = () => this.getAll<Student>('students');
  putStudent = (s: Student) => this.put('students', s.id, s);
  listPassages = () => this.getAll<Passage>('passages');
  putPassage = (p: Passage) => this.put('passages', p.id, p);
  deletePassage = (id: Id) => this.remove('passages', id);
  listReadings = () => this.getAll<Reading>('readings');
  putReading = (r: Reading) => this.put('readings', r.id, r);

  putAudio = (id: Id, samples: Float32Array) => this.put('audio', id, samples.buffer.slice(samples.byteOffset, samples.byteOffset + samples.byteLength));
  async getAudio(id: Id) {
    const buf = await this.get<ArrayBuffer>('audio', id);
    return buf ? new Float32Array(buf) : undefined;
  }
  deleteAudio = (id: Id) => this.remove('audio', id);

  async getSettings() {
    return (await this.get<Settings>('settings', 'settings')) ?? {};
  }
  putSettings = (s: Settings) => this.put('settings', 'settings', s);

  async replaceAll(snapshot: Snapshot) {
    const db = await this.db();
    const tx = db.transaction([...STORES], 'readwrite');
    for (const store of STORES) tx.objectStore(store).clear();
    for (const s of snapshot.students) tx.objectStore('students').put(s, s.id);
    for (const p of snapshot.passages) tx.objectStore('passages').put(p, p.id);
    for (const r of snapshot.readings) tx.objectStore('readings').put(r, r.id);
    tx.objectStore('settings').put(snapshot.settings, 'settings');
    await done(tx);
  }

  async estimateUsage() {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return undefined;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  }
}
