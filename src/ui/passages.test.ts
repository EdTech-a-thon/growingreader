import { screen, within } from '@testing-library/svelte';
import { renderApp, pastePassage, goTo } from '../test/harness';
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
    await h.user.click(screen.getByRole('button', { name: /^add passage$/i }));
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
    await h.user.click(screen.getByRole('button', { name: /^add passage$/i }));
    await h.user.click(screen.getByLabelText(/^text$/i));
    await h.user.paste(CAMP_TEXT_VARIANT);
    expect(screen.getByRole('alert')).toHaveTextContent(/nearly identical to “Camp”/);
  });

  test('a different passage does not warn', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await pastePassage(h, 'Camp', CAMP_TEXT);
    await h.user.click(screen.getByRole('button', { name: /^add passage$/i }));
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
