import { IndexedDbStorage } from './IndexedDbStorage';
import { MemoryStorage } from './MemoryStorage';
import type { Storage } from './Storage';
import type { Reading, Student, Passage } from '../../domain/types';

const student: Student = { id: 's1', firstName: 'Ada', lastName: 'L', archived: false, createdAt: 1 };
const passage: Passage = { id: 'p1', title: 'Cat', text: 'The cat sat', wordCount: 3, createdAt: 1 };
const reading: Reading = {
  id: 'r1',
  studentId: 's1',
  recordedAt: 5,
  hasAudio: true,
  sampleRate: 16000,
  sampleCount: 32000,
  tapBounds: { start: 0, end: 2 },
  timing: 'tap',
  completion: 'pending',
  analysis: 'queued',
};

let n = 0;
const adapters: Array<[string, () => Storage]> = [
  ['MemoryStorage', () => new MemoryStorage()],
  ['IndexedDbStorage', () => new IndexedDbStorage(`test-${++n}-${Date.now()}`)],
];

describe.each(adapters)('%s contract', (_name, make) => {
  let storage: Storage;
  beforeEach(() => {
    storage = make();
  });

  test('a put student is listed', async () => {
    await storage.putStudent(student);
    expect(await storage.listStudents()).toEqual([student]);
  });

  test('putting the same id again replaces the record', async () => {
    await storage.putStudent(student);
    await storage.putStudent({ ...student, archived: true });
    expect(await storage.listStudents()).toEqual([{ ...student, archived: true }]);
  });

  test('passages can be put, listed and deleted', async () => {
    await storage.putPassage(passage);
    expect(await storage.listPassages()).toEqual([passage]);
    await storage.deletePassage('p1');
    expect(await storage.listPassages()).toEqual([]);
  });

  test('readings round-trip with nested fields', async () => {
    const full: Reading = {
      ...reading,
      transcript: { text: 'the cat', words: [{ text: 'the', start: 0.1, end: 0.3 }] },
      identification: { candidates: [{ passageId: 'p1', score: 0.9 }], autoAssigned: true },
    };
    await storage.putReading(full);
    expect(await storage.listReadings()).toEqual([full]);
  });

  test('audio round-trips as Float32 samples and can be deleted', async () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1]);
    await storage.putAudio('r1', samples);
    expect(await storage.getAudio('r1')).toEqual(samples);
    await storage.deleteAudio('r1');
    expect(await storage.getAudio('r1')).toBeUndefined();
  });

  test('settings default to empty and round-trip', async () => {
    expect(await storage.getSettings()).toEqual({});
    await storage.putSettings({ lastBackupAt: 42 });
    expect(await storage.getSettings()).toEqual({ lastBackupAt: 42 });
  });

  test('replaceAll swaps every record and drops audio', async () => {
    await storage.putStudent({ ...student, id: 'old' });
    await storage.putAudio('r1', new Float32Array([1]));
    await storage.replaceAll({ students: [student], passages: [passage], readings: [reading], settings: { lastBackupAt: 7 } });
    expect(await storage.listStudents()).toEqual([student]);
    expect(await storage.listPassages()).toEqual([passage]);
    expect(await storage.listReadings()).toEqual([reading]);
    expect(await storage.getSettings()).toEqual({ lastBackupAt: 7 });
    expect(await storage.getAudio('r1')).toBeUndefined();
  });
});
