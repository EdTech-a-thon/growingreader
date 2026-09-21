import { FileDocumentImporter, normalise, titleFromFileName } from './FileDocumentImporter';
import { DocumentImportError, MAX_IMPORT_BYTES, splitLeadingHeading } from './DocumentImporter';

const importer = new FileDocumentImporter();
const file = (name: string, contents: string, type = 'text/plain') => new File([contents], name, { type });

describe('reading a passage out of a file', () => {
  test('a plain text file comes through with its words intact', async () => {
    const doc = await importer.extract(file('camp.txt', 'Sam went to camp.\nIt was fun.'));
    expect(doc.text).toBe('Sam went to camp.\nIt was fun.');
  });

  test('the file name stands in as a title until the teacher types one', async () => {
    expect(titleFromFileName('Camp_Day 3.pdf')).toBe('Camp Day 3');
    expect(titleFromFileName('passage.final.txt')).toBe('passage.final');
    expect((await importer.extract(file('Camp Day 3.txt', 'one two'))).title).toBe('Camp Day 3');
  });

  test('line endings are tidied but the words are left alone', () => {
    expect(normalise('  one\r\ntwo   \n\n\n\nthree  ')).toBe('one\ntwo\n\nthree');
    expect(normalise('a  well-known  short-cut')).toBe('a  well-known  short-cut');
  });

  test('a file type that cannot be read says what to do instead', async () => {
    await expect(importer.extract(file('passage.docx', 'x', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).rejects.toThrow(
      DocumentImportError,
    );
  });

  test('an empty file and a huge one are both refused before any parsing', async () => {
    await expect(importer.extract(file('empty.txt', ''))).rejects.toThrow(/empty/i);
    const huge = new File(['x'], 'book.pdf', { type: 'application/pdf' });
    Object.defineProperty(huge, 'size', { value: MAX_IMPORT_BYTES + 1 });
    await expect(importer.extract(huge)).rejects.toThrow(/too big/i);
  });
});

describe('a converted file naming its own passage', () => {
  test('a leading heading is the title and is not part of the passage', () => {
    expect(splitLeadingHeading('# Camp Day Three\n\nSam and Pam went to camp.')).toEqual({
      heading: 'Camp Day Three',
      body: 'Sam and Pam went to camp.',
    });
  });

  test('text without one is left exactly as it is', () => {
    expect(splitLeadingHeading('Sam and Pam went to camp.')).toEqual({ body: 'Sam and Pam went to camp.' });
    // A hash with no space is not a heading; it could be the passage's own words.
    expect(splitLeadingHeading('#1 in the race')).toEqual({ body: '#1 in the race' });
    expect(splitLeadingHeading('#   \nSam went.')).toEqual({ body: '#   \nSam went.' });
  });

  test('only the first heading goes; later hashes belong to the passage', () => {
    expect(splitLeadingHeading('# Title\n\nOne two.\n# Not a title\nThree.')).toEqual({
      heading: 'Title',
      body: 'One two.\n# Not a title\nThree.',
    });
  });
});
