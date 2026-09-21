import { countWords } from '../analysis';
import { DocumentImportError, splitLeadingHeading, type ImportFailure } from '../adapters/documents/DocumentImporter';
import { MAX_PASSAGE_WORDS, type PassageSource } from '../domain/types';
import type { App } from '../app/store.svelte';

export interface ReadPassage {
  fileName: string;
  title: string;
  text: string;
  source: PassageSource;
}

export interface ReadFailure {
  fileName: string;
  reason: string;
  kind: ImportFailure;
}

/**
 * Turn chosen files into passages-in-waiting. One pass for one file and for twenty,
 * so the single-file form and the batch list agree about what counts as a failure.
 */
export async function readPassageFiles(app: App, files: File[]): Promise<{ passages: ReadPassage[]; failures: ReadFailure[] }> {
  const passages: ReadPassage[] = [];
  const failures: ReadFailure[] = [];
  for (const file of files) {
    try {
      const doc = await app.importDocument(file);
      // A converted file carries its own title on the first line; the file name is the fallback.
      const { heading, body } = splitLeadingHeading(doc.text);
      const title = heading ?? doc.title;
      const text = body;
      const words = countWords(text);
      if (words === 0) throw new DocumentImportError('No words came out of this one.', 'no-text');
      if (words > MAX_PASSAGE_WORDS) {
        throw new DocumentImportError(
          `About ${words.toLocaleString()} words — too long for one passage, and too long to reach the Google Sheet.`,
          'too-long',
        );
      }
      passages.push({ fileName: file.name, title, text, source: sourceOf(file) });
    } catch (e) {
      const error = e instanceof DocumentImportError ? e : undefined;
      failures.push({ fileName: file.name, reason: error?.message ?? 'This file could not be read.', kind: error?.kind ?? 'unreadable' });
    }
  }
  return { passages, failures };
}

function sourceOf(file: File): PassageSource {
  const kind: PassageSource['kind'] = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'text';
  return { kind, fileName: file.name, importedAt: Date.now() };
}
