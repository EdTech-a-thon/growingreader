/**
 * Reading a passage out of a file the teacher chose. Best effort by design: the
 * words and their order come through, the layout does not, so the word count is
 * an estimate the teacher checks against the paper copy before saving.
 */
export interface DocumentImporter {
  /** For the file input's `accept`; also what the teacher is told is allowed. */
  readonly accept: string;
  /** Text and a suggested title, or a rejection the teacher can act on. */
  extract(file: File): Promise<ImportedDocument>;
}

export interface ImportedDocument {
  /** The file name without its extension; the form uses it when no title is typed yet. */
  title: string;
  /** Best-effort plain text, paragraphs separated by blank lines. */
  text: string;
  /** Pages the text came from, when the format has pages. */
  pageCount?: number;
}

/**
 * Why a file could not become a passage.
 * - `no-text`: a PDF with no text layer — a scan or a photo of the page. pdf.js reads
 *   text, it does not do OCR, so there is nothing in the file to take.
 * - `unsupported`: a format we do not open at all (.docx, .pages, an image).
 * - `too-long`: more words than a passage should hold.
 * - `unreadable`: damaged, encrypted, or it threw on the way in.
 * - `empty`: no bytes.
 * Everything but `empty` is fixable by having an assistant convert the file to text.
 */
export type ImportFailure = 'no-text' | 'unsupported' | 'too-long' | 'unreadable' | 'empty';

/** A rejection with a message written for the teacher, not the console. */
export class DocumentImportError extends Error {
  constructor(
    message: string,
    readonly kind: ImportFailure = 'unreadable',
  ) {
    super(message);
  }
}

/**
 * A converted file names its own passage: the first line is `# Passage title`, because an
 * assistant cannot always choose the file's name. The heading is the title, not part of the
 * passage, so it is taken out before anything counts the words.
 */
export function splitLeadingHeading(text: string): { heading?: string; body: string } {
  const match = text.match(/^\s*#[ \t]+(.+?)[ \t]*(?:\n|$)/);
  if (!match) return { body: text };
  const heading = match[1].trim();
  if (!heading) return { body: text };
  return { heading, body: text.slice(match[0].length).replace(/^\n+/, '') };
}

/** Whether converting the file elsewhere would get the teacher a passage. */
export function worthConverting(kind: ImportFailure): boolean {
  return kind !== 'empty';
}

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

/** What the file picker offers. Wider than what we can parse: a format we cannot read gets an explanation, not a greyed-out file. */
export const CHOOSABLE_TYPES =
  'application/pdf,.pdf,.txt,.text,.md,.markdown,text/plain,text/markdown,.doc,.docx,.rtf,.odt,.pages,.png,.jpg,.jpeg,.heic,.webp,image/*';
