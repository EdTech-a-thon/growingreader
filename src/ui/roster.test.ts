import { screen, within } from '@testing-library/svelte';
import { renderApp, pasteRoster } from '../test/harness';

describe('Roster', () => {
  test('teacher pastes a roster and each line becomes a student', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace\nGrace Hopper\n\nCher');
    expect(screen.getByRole('button', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grace Hopper' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cher' })).toBeInTheDocument();
  });

  test('the roster survives reopening the app', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace');
    expect(await h.storage.listStudents()).toMatchObject([{ firstName: 'Ada', lastName: 'Lovelace' }]);
  });

  test('teacher adds a single student later', async () => {
    const h = await renderApp();
    await h.user.click(screen.getByRole('button', { name: /add one student/i }));
    await h.user.type(screen.getByLabelText(/student name/i), 'Mary Anne Evans{Enter}');
    expect(screen.getByRole('button', { name: 'Mary Anne Evans' })).toBeInTheDocument();
  });

  test('archiving a student removes them from the pick list but keeps them in storage', async () => {
    const h = await renderApp();
    await pasteRoster(h, 'Ada Lovelace\nGrace Hopper');
    await h.user.click(screen.getByRole('button', { name: /history for Ada Lovelace/i }));
    await h.user.click(screen.getByRole('button', { name: /archive student/i }));
    expect(screen.getByRole('heading', { name: /roster/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ada Lovelace' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grace Hopper' })).toBeInTheDocument();
    expect(await h.storage.listStudents()).toMatchObject([{ firstName: 'Ada', archived: true }, { firstName: 'Grace', archived: false }]);
  });

  test('an empty roster explains what to do', async () => {
    await renderApp();
    expect(screen.getByText(/paste your roster to get started/i)).toBeInTheDocument();
  });
});
