import { unzipSync, zipSync } from 'fflate';
import type { Backup } from '../domain/backup';
import type { Id } from '../domain/types';
import { decodeWav, encodeWav } from './wav';

/**
 * A backup file is a zip: `backup.json` holds the records, and `audio/<reading id>.wav`
 * holds each recording as the same 16-bit WAV the per-reading export gives. Stored, not
 * deflated: WAV barely compresses and the file is already the size of its audio.
 * Older backups are a bare JSON file of the records; they restore with no audio.
 */
const RECORDS = 'backup.json';
const AUDIO = /^audio\/(.+)\.wav$/;

export function isBackupFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.zip') || name.endsWith('.json') || file.type === 'application/zip' || file.type === 'application/json';
}

export async function writeBackupFile(backup: Backup): Promise<Blob> {
  const { audio, ...records } = backup;
  const entries: Record<string, Uint8Array> = { [RECORDS]: new TextEncoder().encode(JSON.stringify(records, null, 2)) };
  for (const r of backup.readings) {
    const samples = audio.get(r.id);
    if (samples) entries[`audio/${r.id}.wav`] = new Uint8Array(await encodeWav(samples, r.sampleRate).arrayBuffer());
  }
  return new Blob([zipSync(entries, { level: 0 })], { type: 'application/zip' });
}

export async function readBackupFile(file: Blob): Promise<Backup> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
  if (!isZip) return { ...parseRecords(new TextDecoder().decode(bytes)), audio: new Map() };

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error('Not a Growing Reader backup');
  }
  // Tolerate the zip having been re-made with everything inside a folder.
  const prefix = Object.keys(entries).find((name) => name === RECORDS || name.endsWith(`/${RECORDS}`))?.slice(0, -RECORDS.length);
  if (prefix === undefined) throw new Error('Not a Growing Reader backup');
  const audio = new Map<Id, Float32Array>();
  for (const [name, data] of Object.entries(entries)) {
    const match = name.startsWith(prefix) && AUDIO.exec(name.slice(prefix.length));
    if (match) audio.set(match[1], decodeWav(data.slice().buffer));
  }
  return { ...parseRecords(new TextDecoder().decode(entries[prefix + RECORDS])), audio };
}

function parseRecords(text: string): Omit<Backup, 'audio'> {
  let data: Partial<Backup> | null;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Not a Growing Reader backup');
  }
  if (!data || !Array.isArray(data.students) || !Array.isArray(data.passages) || !Array.isArray(data.readings)) {
    throw new Error('Not a Growing Reader backup');
  }
  return { students: data.students, passages: data.passages, readings: data.readings, settings: data.settings ?? {} };
}
