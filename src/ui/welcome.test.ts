import { screen } from '@testing-library/svelte';
import { hasBeenWelcomed } from '../app/welcomed';
import { renderApp } from '../test/harness';

describe('first visit', () => {
  test('explains the product and privacy before taking the teacher straight to the roster', async () => {
    const h = await renderApp({ firstVisit: true });

    expect(screen.getByRole('img', { name: /reading-rate card climbing from 48 to 82/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /see every reader grow/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /you already know how it works/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /student voices stay with you/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /built by teacher\.dev/i })).toHaveAttribute('href', 'https://teacher.dev');
    expect(screen.queryByRole('heading', { name: /^roster$/i })).not.toBeInTheDocument();

    await h.user.click(screen.getByRole('button', { name: /start with your roster/i }));

    expect(await screen.findByRole('heading', { name: /^roster$/i })).toBeInTheDocument();
    expect(hasBeenWelcomed()).toBe(true);
  });
});
