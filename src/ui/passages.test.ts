import { screen, within } from '@testing-library/svelte';
import { renderApp, pastePassage, importPassage, importFiles, openPassageForm, goTo } from '../test/harness';
import { CAMP_TEXT, CAMP_TEXT_VARIANT, SHIP_TEXT } from '../test/fixtures/passages';
import { countWords } from '../analysis';

describe('Passages', () => {
  test('teacher pastes a passage and sees its word count', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await pastePassage(h, 'Camp', CAMP_TEXT);
    const card = screen.getByRole('article', { name: 'Camp' });
    expect(within(card).getByText(`${countWords(CAMP_TEXT)} words`)).toBeInTheDocument();
  });

  test('word count excludes the title and counts hyphenated tokens once', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await pastePassage(h, 'Three Word Title', 'a well-known short-cut');
    expect(within(screen.getByRole('article', { name: 'Three Word Title' })).getByText('3 words')).toBeInTheDocument();
  });

  test('the count is shown live while pasting, with how it is counted', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await openPassageForm(h);
    await h.user.click(screen.getByLabelText(/^text$/i));
    await h.user.paste('one two three');
    expect(screen.getByText(/^3 words\./)).toBeInTheDocument();
    expect(screen.getByText(/title is not counted/i)).toBeInTheDocument();
  });

  test('teacher edits a passage and the word count updates', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await pastePassage(h, 'Camp', 'one two');
    await h.user.click(screen.getByRole('button', { name: /^edit$/i }));
    const text = screen.getByLabelText(/^text$/i);
    await h.user.clear(text);
    await h.user.type(text, 'one two three four');
    await h.user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(within(screen.getByRole('article', { name: 'Camp' })).getByText('4 words')).toBeInTheDocument();
  });

  test('teacher deletes a passage after confirming', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await pastePassage(h, 'Camp', CAMP_TEXT);
    await h.user.click(screen.getByRole('button', { name: /^delete$/i }));
    await h.user.click(screen.getByRole('button', { name: /yes, delete/i }));
    expect(screen.queryByRole('article', { name: 'Camp' })).not.toBeInTheDocument();
    expect(await h.storage.listPassages()).toEqual([]);
  });

  test('pasting a near-identical passage warns before saving', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await pastePassage(h, 'Camp', CAMP_TEXT);
    await openPassageForm(h);
    await h.user.click(screen.getByLabelText(/^text$/i));
    await h.user.paste(CAMP_TEXT_VARIANT);
    expect(screen.getByRole('alert')).toHaveTextContent(/nearly identical to “Camp”/);
  });

  test('a different passage does not warn', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await pastePassage(h, 'Camp', CAMP_TEXT);
    await openPassageForm(h);
    await h.user.click(screen.getByLabelText(/^text$/i));
    await h.user.paste(SHIP_TEXT);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('with zero passages the teacher is told recording still works', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    expect(screen.getByText(/record readings now and add passages later/i)).toBeInTheDocument();
  });
});

describe('Importing a passage from a file', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
  });

  test('teacher chooses a PDF and gets its words, a title and an estimated count', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await importPassage(h, 'Camp Day 3.pdf', CAMP_TEXT);
    const card = screen.getByRole('article', { name: 'Camp Day 3' });
    expect(within(card).getByText(`${countWords(CAMP_TEXT)} words, estimated`)).toBeInTheDocument();
    expect(within(card).getByText(/from Camp Day 3\.pdf/i)).toBeInTheDocument();
  });

  test('the count is marked as an estimate to check against the paper copy', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await importPassage(h, 'Camp.pdf', CAMP_TEXT, { save: false });
    expect(screen.getByText(/estimated from Camp\.pdf/i)).toBeInTheDocument();
    expect(screen.getByText(/page numbers and instructions come across as words/i)).toBeInTheDocument();
  });

  test('the imported text is editable, so a header the teacher does not want counted can go', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await importPassage(h, 'Camp.pdf', 'Name Date Page 1\none two three', { save: false });
    const text = screen.getByLabelText(/^text$/i);
    await h.user.clear(text);
    await h.user.type(text, 'one two three');
    await h.user.click(screen.getByRole('button', { name: /save passage/i }));
    expect(within(screen.getByRole('article', { name: 'Camp' })).getByText('3 words, estimated')).toBeInTheDocument();
  });

  test('a scanned PDF explains the way out instead of opening an empty form', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    h.documents.willReject('Scan.pdf', 'There is no text inside that PDF — it is a scan or a photograph of the page.');
    await importFiles(h, [{ name: 'Scan.pdf', text: '' }]);
    const dialog = await screen.findByRole('dialog', { name: /Scan\.pdf could not be read/i });
    expect(within(dialog).getByText(/no text inside that PDF/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /copy instructions/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /chatgpt/i })).toBeInTheDocument();
    // Nothing was saved and no editor was opened on empty text.
    expect(screen.queryByLabelText(/^text$/i)).not.toBeInTheDocument();
    expect(await h.storage.listPassages()).toEqual([]);
  });

  test('the instructions the teacher copies say what to leave out of the passage', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    h.documents.willReject('Scan.pdf', 'There is no text inside that PDF.');
    await importFiles(h, [{ name: 'Scan.pdf', text: '' }]);
    await h.user.click(await screen.findByRole('button', { name: /copy instructions/i }));
    const copied = await navigator.clipboard.readText();
    expect(copied).toMatch(/page numbers, headers and footers/i);
    expect(copied).toMatch(/do not correct, simplify, rewrite/i);
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument();
  });

  test('a format the app cannot open is explained the same way', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    h.documents.willReject('Camp.docx', 'Growing Reader cannot open .docx files — it reads PDFs and plain text.', 'unsupported');
    await importFiles(h, [{ name: 'Camp.docx', text: '' }]);
    expect(await screen.findByRole('dialog', { name: /Camp\.docx could not be read/i })).toBeInTheDocument();
    expect(screen.getByText(/cannot open \.docx files/i)).toBeInTheDocument();
  });

  test('the extracted text is what is shown back, marked with the file it came from', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await importPassage(h, 'Camp.pdf', CAMP_TEXT);
    await h.user.click(screen.getByRole('button', { name: /view text/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Sam and Pam ran to the lake and had a swim/)).toBeInTheDocument();
    expect(within(dialog).getByText(/estimated from Camp\.pdf/i)).toBeInTheDocument();
  });

  test('nothing from the file itself is stored: the text is the passage', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await importPassage(h, 'Camp.pdf', CAMP_TEXT);
    const [passage] = await h.storage.listPassages();
    expect(passage.text).toBe(CAMP_TEXT);
    expect(passage.source).toMatchObject({ kind: 'pdf', fileName: 'Camp.pdf' });
    expect(Object.keys(passage)).not.toContain('bytes');
  });

  test('a file longer than a passage is refused, with what to do about it', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await importFiles(h, [{ name: 'Novel.pdf', text: 'word '.repeat(5001) }]);
    const dialog = await screen.findByRole('dialog', { name: /Novel\.pdf could not be read/i });
    expect(within(dialog).getByText(/too long for one passage/i)).toBeInTheDocument();
    expect(await h.storage.listPassages()).toEqual([]);
  });

  test('a pasted passage is still counted the plain way, with no estimate wording', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await pastePassage(h, 'Camp', CAMP_TEXT);
    const card = screen.getByRole('article', { name: 'Camp' });
    expect(within(card).getByText(`${countWords(CAMP_TEXT)} words`)).toBeInTheDocument();
    expect(within(card).queryByText(/estimated/i)).not.toBeInTheDocument();
  });
});

describe('Importing several files at once', () => {
  test('dropping three files shows one list to check, then saves them together', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await importFiles(h, [
      { name: 'Camp.pdf', text: CAMP_TEXT },
      { name: 'Ship.pdf', text: SHIP_TEXT },
      { name: 'Trip.txt', text: 'one two three' },
    ]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Title for Camp.pdf')).toHaveValue('Camp');
    expect(within(dialog).getByText(`${countWords(SHIP_TEXT)} words, estimated · Ship.pdf`)).toBeInTheDocument();
    await h.user.click(within(dialog).getByRole('button', { name: /save 3 passages/i }));
    expect(await h.storage.listPassages()).toHaveLength(3);
    expect(screen.getByRole('article', { name: 'Camp' })).toBeInTheDocument();
  });

  test('a title can be corrected in the list before saving', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await importFiles(h, [
      { name: 'camp_day_3.pdf', text: CAMP_TEXT },
      { name: 'Ship.pdf', text: SHIP_TEXT },
    ]);
    const title = await screen.findByLabelText('Title for camp_day_3.pdf');
    await h.user.clear(title);
    await h.user.type(title, 'Camp Day Three');
    await h.user.click(screen.getByRole('button', { name: /save 2 passages/i }));
    expect(screen.getByRole('article', { name: 'Camp Day Three' })).toBeInTheDocument();
  });

  test('a file can be left out of the batch', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await importFiles(h, [
      { name: 'Camp.pdf', text: CAMP_TEXT },
      { name: 'Ship.pdf', text: SHIP_TEXT },
    ]);
    await h.user.click(await screen.findByLabelText('Import Ship.pdf'));
    await h.user.click(screen.getByRole('button', { name: /save 1 passage/i }));
    expect(await h.storage.listPassages()).toHaveLength(1);
    expect(screen.queryByRole('article', { name: 'Ship' })).not.toBeInTheDocument();
  });

  test('a scan among good files is reported by name and the rest still save', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    h.documents.willReject('Scan.pdf', 'There is no text inside that PDF — it is a scan.');
    await importFiles(h, [
      { name: 'Camp.pdf', text: CAMP_TEXT },
      { name: 'Scan.pdf', text: '' },
      { name: 'Ship.pdf', text: SHIP_TEXT },
    ]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/no text inside that PDF/i)).toBeInTheDocument();
    expect(within(dialog).getByText('Scan.pdf')).toBeInTheDocument();
    await h.user.click(within(dialog).getByRole('button', { name: /save 2 passages/i }));
    expect(await h.storage.listPassages()).toHaveLength(2);
  });

  test('the batch offers the conversion route for the files it could not read', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    h.documents.willReject('Scan.pdf', 'There is no text inside that PDF — it is a scan.');
    await importFiles(h, [
      { name: 'Camp.pdf', text: CAMP_TEXT },
      { name: 'Scan.pdf', text: '' },
    ]);
    await h.user.click(await screen.findByRole('button', { name: /show me how/i }));
    expect(await screen.findByRole('dialog', { name: /could not be read/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy instructions/i })).toBeInTheDocument();
  });

  test('a file too long for one passage is refused in the batch, not saved silently', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await importFiles(h, [
      { name: 'Camp.pdf', text: CAMP_TEXT },
      { name: 'Novel.pdf', text: 'word '.repeat(5001) },
    ]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/too long for one passage/i)).toBeInTheDocument();
    await h.user.click(within(dialog).getByRole('button', { name: /save 1 passage/i }));
    expect(await h.storage.listPassages()).toHaveLength(1);
  });
});

/** jsdom has no DataTransfer; a drop event carrying a file list is what our handlers read. */
function drop(target: Element, files: File[]) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files } });
  target.dispatchEvent(event);
}

describe('Coming back with a converted file', () => {
  test('the drop is taken wherever it lands while the instructions are open', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    h.documents.willReject('Scan.pdf', 'There is no text inside that PDF — it is a scan.');
    await importFiles(h, [{ name: 'Scan.pdf', text: '' }]);
    await screen.findByRole('dialog', { name: /could not be read/i });

    // Released over the dimmed area around the panel, not on a step.
    h.documents.willRead('camp.txt', CAMP_TEXT);
    drop(document.body, [new File([CAMP_TEXT], 'camp.txt', { type: 'text/plain' })]);

    await screen.findByLabelText(/^text$/i);
    expect(screen.queryByRole('dialog', { name: /could not be read/i })).not.toBeInTheDocument();
    await h.user.click(screen.getByRole('button', { name: /save passage/i }));
    expect(screen.getByRole('article', { name: 'camp' })).toBeInTheDocument();
  });

  test('the converted text can be dropped straight onto the instructions', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    h.documents.willReject('Scan.pdf', 'There is no text inside that PDF — it is a scan.');
    await importFiles(h, [{ name: 'Scan.pdf', text: '' }]);
    const help = await screen.findByRole('dialog', { name: /could not be read/i });

    // Back from the assistant with a .txt: it goes in here, not somewhere else.
    h.documents.willRead('camp.txt', CAMP_TEXT);
    await h.user.upload(within(help).getByLabelText(/choose the converted file/i), new File([CAMP_TEXT], 'camp.txt', { type: 'text/plain' }));

    await screen.findByLabelText(/^text$/i);
    expect(screen.queryByRole('dialog', { name: /could not be read/i })).not.toBeInTheDocument();
    await h.user.click(screen.getByRole('button', { name: /save passage/i }));
    const card = screen.getByRole('article', { name: 'camp' });
    expect(within(card).getByText(`${countWords(CAMP_TEXT)} words, estimated`)).toBeInTheDocument();
  });

  test('a file that still cannot be read leaves the instructions up', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    h.documents.willReject('Scan.pdf', 'There is no text inside that PDF — it is a scan.');
    await importFiles(h, [{ name: 'Scan.pdf', text: '' }]);
    const help = await screen.findByRole('dialog', { name: /could not be read/i });

    h.documents.willReject('Scan2.pdf', 'There is no text inside that PDF — it is a scan.');
    await h.user.upload(within(help).getByLabelText(/choose the converted file/i), new File(['x'], 'Scan2.pdf', { type: 'application/pdf' }));

    expect(await screen.findByRole('dialog', { name: /Scan2\.pdf could not be read/i })).toBeInTheDocument();
    expect(await h.storage.listPassages()).toEqual([]);
  });
});

describe('A converted Markdown file', () => {
  test('names the passage from its first line, not from the file name', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await importFiles(h, [{ name: 'gemini-export-3891.md', text: `# Camp Day Three\n\n${CAMP_TEXT}` }]);
    await screen.findByLabelText(/^text$/i);
    expect(screen.getByLabelText(/^title$/i)).toHaveValue('Camp Day Three');
    await h.user.click(screen.getByRole('button', { name: /save passage/i }));
    expect(screen.getByRole('article', { name: 'Camp Day Three' })).toBeInTheDocument();
  });

  test('the title line is not counted in the word count the rate uses', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await importFiles(h, [{ name: 'export.md', text: '# Three Word Title\n\none two three' }]);
    await screen.findByLabelText(/^text$/i);
    await h.user.click(screen.getByRole('button', { name: /save passage/i }));
    const card = screen.getByRole('article', { name: 'Three Word Title' });
    expect(within(card).getByText('3 words, estimated')).toBeInTheDocument();
    const [passage] = await h.storage.listPassages();
    expect(passage.text).toBe('one two three');
  });

  test('a file with no heading still falls back to its name', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await importFiles(h, [{ name: 'Camp Day Three.md', text: CAMP_TEXT }]);
    await screen.findByLabelText(/^text$/i);
    expect(screen.getByLabelText(/^title$/i)).toHaveValue('Camp Day Three');
  });

  test('the instructions ask for Markdown and tell an assistant that cannot attach files what to do', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    h.documents.willReject('Scan.pdf', 'There is no text inside that PDF.');
    await importFiles(h, [{ name: 'Scan.pdf', text: '' }]);
    await h.user.click(await screen.findByRole('button', { name: /copy instructions/i }));
    const copied = await navigator.clipboard.readText();
    expect(copied).toMatch(/One Markdown file \(`\.md`/);
    expect(copied).toMatch(/first line is the passage's title/i);
    expect(copied).toMatch(/If you are Gemini, or any assistant that cannot attach files/i);
    expect(copied).toMatch(/single Markdown code block/i);
  });
});
