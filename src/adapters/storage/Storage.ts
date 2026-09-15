import type { Id, Passage, Reading, Settings, StorageUsage, Student } from '../../domain/types';

/** Everything the app persists, minus audio: the shape of a backup file. */
export interface Snapshot {
  students: Student[];
  passages: Passage[];
  readings: Reading[];
  settings: Settings;
}

/**
 * The device's persistent store. Records are whole-document puts keyed by id;
 * audio is stored separately so lists never load it.
 */
export interface Storage {
  listStudents(): Promise<Student[]>;
  putStudent(student: Student): Promise<void>;

  listPassages(): Promise<Passage[]>;
  putPassage(passage: Passage): Promise<void>;
  deletePassage(id: Id): Promise<void>;

  listReadings(): Promise<Reading[]>;
  putReading(reading: Reading): Promise<void>;

  putAudio(readingId: Id, samples: Float32Array): Promise<void>;
  getAudio(readingId: Id): Promise<Float32Array | undefined>;
  deleteAudio(readingId: Id): Promise<void>;

  getSettings(): Promise<Settings>;
  putSettings(settings: Settings): Promise<void>;

  /** Replace every record with the snapshot and drop all audio (a backup carries none); used by import. */
  replaceAll(snapshot: Snapshot): Promise<void>;

  /** Bytes in use and available, when the platform can say. */
  estimateUsage(): Promise<StorageUsage | undefined>;
}
