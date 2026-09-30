// Dev-only: the demo data as a backup file, for testing on a device by importing it
// (drop it anywhere in the app). Built by scripts/make-demo-backup.mjs.
import { MemoryStorage } from '../adapters/storage/MemoryStorage';
import type { Id } from '../domain/types';
import { writeBackupFile } from '../ui/backup-file';
import { seedDemo } from './demo-data';

export async function demoBackup(now = Date.now()): Promise<Uint8Array> {
  const storage = new MemoryStorage();
  await seedDemo(storage, now);
  const readings = await storage.listReadings();
  const audio = new Map<Id, Float32Array>();
  for (const r of readings) {
    const samples = await storage.getAudio(r.id);
    if (samples) audio.set(r.id, samples);
  }
  const file = await writeBackupFile({ students: await storage.listStudents(), passages: await storage.listPassages(), readings, settings: {}, audio });
  return new Uint8Array(await file.arrayBuffer());
}
