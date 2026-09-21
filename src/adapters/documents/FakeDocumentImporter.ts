import { DocumentImportError, type DocumentImporter, type ImportedDocument, type ImportFailure } from './DocumentImporter';
import { titleFromFileName } from './FileDocumentImporter';

/**
 * Stands in for pdf.js under test: whatever the test says a file contains comes back,
 * so the screens can be driven through a real file input without a real PDF.
 */
export class FakeDocumentImporter implements DocumentImporter {
  readonly accept = 'application/pdf,.pdf,.txt,.md,text/plain';
  /** Keyed by file name; plain text files fall back to their own contents. */
  readonly contents = new Map<string, string | DocumentImportError>();
  pageCount = 1;

  /** `text` is what the importer will say it found in a file of that name. */
  willRead(fileName: string, text: string) {
    this.contents.set(fileName, text);
  }

  willReject(fileName: string, message: string, kind: ImportFailure = 'no-text') {
    this.contents.set(fileName, new DocumentImportError(message, kind));
  }

  async extract(file: File): Promise<ImportedDocument> {
    const canned = this.contents.get(file.name);
    if (canned instanceof DocumentImportError) throw canned;
    const text = canned ?? (await file.text());
    return { title: titleFromFileName(file.name), text, pageCount: this.pageCount };
  }
}
