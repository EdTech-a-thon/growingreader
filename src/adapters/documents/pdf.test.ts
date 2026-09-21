// The real pdf.js path over real PDFs. The browser build cannot run under jsdom, so
// pdf.js is swapped for its Node ("legacy") build; everything else is the shipping code.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

vi.mock('pdfjs-dist', async () => await import('pdfjs-dist/legacy/build/pdf.mjs'));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: pathToFileURL(resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href,
}));

import { FileDocumentImporter } from './FileDocumentImporter';
import { countWords } from '../../analysis';

const fixture = (name: string) => {
  const bytes = readFileSync(resolve(process.cwd(), 'src/adapters/documents/fixtures', name));
  return new File([bytes], name, { type: 'application/pdf' });
};

describe('reading a passage out of a PDF', () => {
  test('the words come across in reading order, one line per printed line', async () => {
    const doc = await new FileDocumentImporter().extract(fixture('camp-passage.pdf'));
    expect(doc.pageCount).toBe(1);
    expect(doc.text.split('\n')[0]).toBe('Camp Day Three');
    expect(doc.text).toContain('Sam and Pam went to camp. At camp they slept in a tent.');
    expect(doc.text).toContain('Sam and Pam ran to the lake and had a swim. It was the best trip yet.');
  }, 30000);

  test('the heading comes in with the rest, which is why the count is an estimate to check', async () => {
    const doc = await new FileDocumentImporter().extract(fixture('camp-passage.pdf'));
    // "Camp Day Three" is counted until the teacher deletes it: three words of difference in the rate.
    expect(countWords(doc.text) - countWords(doc.text.split('\n').slice(1).join('\n'))).toBe(3);
  }, 30000);

  test('a scan has no text to read and says so instead of saving an empty passage', async () => {
    await expect(new FileDocumentImporter().extract(fixture('scanned-page.pdf'))).rejects.toThrow(/no text inside that PDF/i);
  }, 30000);
});
