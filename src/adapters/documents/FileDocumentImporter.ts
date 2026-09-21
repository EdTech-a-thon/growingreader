import { CHOOSABLE_TYPES, DocumentImportError, MAX_IMPORT_BYTES, type DocumentImporter, type ImportedDocument } from './DocumentImporter';

const PDF_TYPE = 'application/pdf';
const TEXT_EXTENSIONS = ['.txt', '.text', '.md', '.markdown'];
/** Below this many words a page, the PDF is a picture of a page rather than a page. */
const WORDS_PER_PAGE_FLOOR = 5;

/** A new line starts when the next piece of text sits this far off the last one's baseline. */
const LINE_BREAK_Y = 3;

/** Reads PDFs (through pdf.js, loaded on first use) and plain text files in the browser. */
export class FileDocumentImporter implements DocumentImporter {
  readonly accept = CHOOSABLE_TYPES;

  async extract(file: File): Promise<ImportedDocument> {
    if (file.size === 0) throw new DocumentImportError('That file is empty.', 'empty');
    if (file.size > MAX_IMPORT_BYTES) {
      throw new DocumentImportError('That file is too big to read here. A passage is a page or two; this looks like a whole book.', 'too-long');
    }
    const title = titleFromFileName(file.name);
    if (isPdf(file)) return { title, ...(await extractPdf(file)) };
    if (isPlainText(file)) return { title, text: normalise(await file.text()) };
    throw new DocumentImportError(`Growing Reader cannot open ${extensionOf(file.name)} files — it reads PDFs and plain text.`, 'unsupported');
  }
}

/** The extension as the teacher would say it, for a message about her own file. */
function extensionOf(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? `.${match[1]}` : 'those';
}

function isPdf(file: File): boolean {
  return file.type === PDF_TYPE || file.name.toLowerCase().endsWith('.pdf');
}

function isPlainText(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type.startsWith('text/') || TEXT_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/** The file name, less its extension, tidied enough to stand as a title. */
export function titleFromFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Line endings normalised and runs of blank lines collapsed; the words are left alone. */
export function normalise(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractPdf(file: File): Promise<{ text: string; pageCount: number }> {
  const pdfjs = await import('pdfjs-dist');
  // Bundled, not fetched: the app has to import a passage on a Chromebook that is offline.
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    const message = e instanceof Error && /password/i.test(e.message) ? 'That PDF is password-protected.' : 'That PDF could not be opened.';
    throw new DocumentImportError(message, 'unreadable');
  }

  try {
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(pageText(content.items));
      page.cleanup();
    }
    const text = normalise(pages.join('\n\n'));
    if (countRoughWords(text) < doc.numPages * WORDS_PER_PAGE_FLOOR) {
      // pdf.js reads a PDF's text layer; it does not do OCR. A scan has no layer to read.
      throw new DocumentImportError('There is no text inside that PDF — it is a scan or a photograph of the page.', 'no-text');
    }
    return { text, pageCount: doc.numPages };
  } finally {
    // Frees the worker; the text has already been copied out.
    void task.destroy();
  }
}

/**
 * The page's text pieces put back in reading order: pieces on one baseline join with
 * a space, a drop to a new baseline starts a line. Columns and text boxes are not
 * untangled — that is the "best effort" the teacher is asked to check.
 */
function pageText(items: readonly unknown[]): string {
  const lines: string[] = [];
  let line = '';
  let lastY: number | undefined;
  for (const item of items) {
    const piece = item as { str?: string; transform?: number[]; hasEOL?: boolean };
    if (typeof piece.str !== 'string') continue;
    const y = piece.transform?.[5];
    if (lastY !== undefined && y !== undefined && Math.abs(y - lastY) > LINE_BREAK_Y) {
      lines.push(line);
      line = '';
    }
    line += piece.str;
    if (piece.hasEOL) {
      lines.push(line);
      line = '';
    }
    lastY = y;
  }
  lines.push(line);
  return lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 0).join('\n');
}

function countRoughWords(text: string): number {
  return text.split(/\s+/).filter((t) => t.length > 0).length;
}
