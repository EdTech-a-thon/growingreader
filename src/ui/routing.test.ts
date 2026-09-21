import { screen, within } from '@testing-library/svelte';
import { renderApp, pasteRoster, pastePassage, goTo, recordReading, openStart, tapStart, importFiles } from '../test/harness';
import { MemoryStorage } from '../adapters/storage/MemoryStorage';
import { CAMP_TEXT } from '../test/fixtures/passages';
import { pathForScreen, screenForPath } from '../app/routes';

describe('Addresses', () => {
  test('the teacher screens each have one, and the student-facing ones do not', () => {
    expect(pathForScreen({ name: 'roster' })).toBe('/');
    expect(pathForScreen({ name: 'student', studentId: 's1' })).toBe('/students/s1');
    expect(pathForScreen({ name: 'review', readingId: 'r1' })).toBe('/readings/r1');
    expect(pathForScreen({ name: 'passages' })).toBe('/passages');
    expect(pathForScreen({ name: 'settings' })).toBe('/settings');
    // A reading in progress has no address of its own: the URL stays on the student.
    expect(pathForScreen({ name: 'start', studentId: 's1' })).toBeUndefined();
    expect(pathForScreen({ name: 'recording' })).toBeUndefined();
    expect(pathForScreen({ name: 'done', readingId: 'r1' })).toBeUndefined();
  });

  test('an address maps back to its screen, and an unknown one does not pretend to', () => {
    expect(screenForPath('/')).toEqual({ name: 'roster' });
    expect(screenForPath('/passages/')).toEqual({ name: 'passages' });
    expect(screenForPath('/students/abc')).toEqual({ name: 'student', studentId: 'abc' });
    expect(screenForPath('/readings/r1')).toEqual({ name: 'review', readingId: 'r1' });
    expect(screenForPath('/about')).toBeUndefined();
    expect(screenForPath('/nope/deeper')).toBeUndefined();
  });
});

describe('Navigating with real URLs', () => {
  test('moving around the app changes the address', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    expect(window.location.pathname).toBe('/passages');
    await goTo(h, 'Settings');
    expect(window.location.pathname).toBe('/settings');
  });

  test('a refresh on a student page comes back to that student, not the roster', async () => {
    const storage = new MemoryStorage();
    const h = await renderApp({ storage });
    await pasteRoster(h, 'Ada Lovelace');
    await h.user.click(screen.getByRole('button', { name: 'Ada Lovelace' }));
    const url = window.location.pathname;
    expect(url).toMatch(/^\/students\//);

    // The reload: same storage, same address, a fresh app.
    document.body.innerHTML = '';
    await renderApp({ storage, path: url });
    expect(await screen.findByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
  });

  test('the browser back button returns to the previous screen', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    await goTo(h, 'Settings');
    window.history.back();
    await new Promise((r) => setTimeout(r, 0));
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(await screen.findByRole('heading', { level: 1, name: /passages/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/passages');
  });

  test('an address for a student who is gone says so instead of breaking', async () => {
    await renderApp({ path: '/students/missing' });
    expect(await screen.findByText(/student not found/i)).toBeInTheDocument();
  });

  test('handing the device over does not put the reading in the address bar', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace');
    await goTo(h, 'Passages');
    await pastePassage(h, 'Camp', CAMP_TEXT);
    await goTo(h, 'Roster');
    await recordReading(h, 'Ada Lovelace', { passage: 'Camp' });
    // Review is reached by unlocking, and only then does the address change.
    expect(window.location.pathname).toMatch(/^\/readings\//);
  });
});

describe('A reload during a reading', () => {
  test('reports the lost reading where the teacher lands, not only on the roster', async () => {
    const storage = new MemoryStorage();
    const h = await renderApp({ storage });
    await pasteRoster(h, 'Ada Lovelace');
    await goTo(h, 'Passages');
    await pastePassage(h, 'Camp', CAMP_TEXT);
    await goTo(h, 'Roster');
    await openStart(h, 'Ada Lovelace', 'Camp');
    await tapStart(h);
    const studentPath = window.location.pathname;
    expect(studentPath).toMatch(/^\/students\//);

    // The tab closes mid-reading and the teacher reloads where she was.
    document.body.innerHTML = '';
    await renderApp({ storage, path: studentPath });
    expect(await screen.findByRole('alert')).toHaveTextContent(/was lost because the tab closed/i);
  });
});

describe('A dialog holds the page still', () => {
  test('the page behind cannot be scrolled while a modal is open, and can again after', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    expect(document.body.classList.contains('modal-open')).toBe(false);
    await h.user.click(screen.getByRole('button', { name: /type it out/i }));
    expect(document.body.classList.contains('modal-open')).toBe(true);
    await h.user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });

  test('a dialog opened over another keeps the page held until both are gone', async () => {
    const h = await renderApp();
    await goTo(h, 'Passages');
    h.documents.willReject('Scan.pdf', 'There is no text inside that PDF — it is a scan.');
    await importFiles(h, [
      { name: 'Camp.pdf', text: CAMP_TEXT },
      { name: 'Scan.pdf', text: '' },
    ]);
    await h.user.click(await screen.findByRole('button', { name: /show me how/i }));
    expect(document.body.classList.contains('modal-open')).toBe(true);
    // Closing the instructions leaves the list behind it, so the page stays held.
    const help = screen.getByRole('dialog', { name: /could not be read/i });
    await h.user.click(within(help).getByRole('button', { name: /close instructions/i }));
    expect(document.body.classList.contains('modal-open')).toBe(true);
    await h.user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });
});
