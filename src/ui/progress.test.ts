import { screen, within } from '@testing-library/svelte';
import { renderApp } from '../test/harness';
import { MemoryStorage } from '../adapters/storage/MemoryStorage';
import type { Reading } from '../domain/types';

const DAY = 86_400_000;
const day = (n: number) => new Date(2026, 8, 1, 12).getTime() + n * DAY;

function reading(id: string, at: number, seconds: number, extra: Partial<Reading> = {}): Reading {
  return {
    id,
    studentId: 's1',
    passageId: 'camp',
    recordedAt: at,
    hasAudio: false,
    sampleRate: 16000,
    sampleCount: seconds * 16000,
    tapBounds: { start: 0, end: seconds },
    timing: 'auto',
    completion: 'complete',
    analysis: 'done',
    ...extra,
  };
}

async function seeded() {
  const storage = new MemoryStorage();
  await storage.putStudent({ id: 's1', firstName: 'Ada', lastName: 'Lovelace', archived: false, createdAt: 0 });
  await storage.putPassage({ id: 'camp', title: 'Camp', text: 'x', wordCount: 100, createdAt: 0 });
  await storage.putPassage({ id: 'ship', title: 'Ship', text: 'y', wordCount: 120, createdAt: 0 });
  await storage.putReading(reading('r1', day(0), 100)); // 60 words per minute
  await storage.putReading(reading('r2', day(7), 80)); // 75 words per minute
  await storage.putReading(reading('r3', day(7) + 3_600_000, 75, { errors: 5 })); // 80 words per minute, 76 words correct per minute, same day
  await storage.putReading(reading('r4', day(14), 120, { passageId: 'ship' })); // 60 words per minute on the harder passage
  await storage.putReading(reading('r5', day(21), 50, { completion: 'incomplete' }));
  await storage.putReading(reading('r6', day(22), 50, { completion: 'pending' }));
  const h = await renderApp({ storage });
  await h.user.click(screen.getByRole('button', { name: 'Ada Lovelace' }));
  return h;
}

describe('Progress over time', () => {
  // The chart is a canvas; the list beside it carries every point for screen readers, keyboards and this suite.
  const chartPoints = () => within(screen.getByRole('list', { name: /readings on the chart/i })).getAllByRole('button');

  test('one point per complete reading, same-day readings kept separate; incomplete and unreviewed readings stay off', async () => {
    await seeded();
    expect(screen.getByRole('img', { name: /rate over time: 4 readings/i })).toBeInTheDocument();
    expect(chartPoints().map((p) => p.textContent)).toEqual([
      'Sep 1, 2026: 60 words per minute',
      'Sep 8, 2026: 75 words per minute',
      'Sep 8, 2026: 80 words per minute, 76 words correct per minute',
      'Sep 15, 2026: 60 words per minute, new passage: Ship',
    ]);
  });

  test('tapping a chart point opens that reading', async () => {
    const h = await seeded();
    await h.user.click(screen.getByRole('button', { name: /Sep 15, 2026: 60 words per minute/ }));
    expect(screen.getByRole('heading', { name: /review/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Ship ·/ })).toBeInTheDocument();
  });

  test('the readings table lists date, passage, time, rate and completion state', async () => {
    await seeded();
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toHaveTextContent(/Sep 2[23].*Awaiting review/);
    expect(rows[1]).toHaveTextContent(/Incomplete/);
    expect(rows[1]).toHaveTextContent('—');
    expect(rows[2]).toHaveTextContent(/Ship.*2:00\.0.*60.*Complete/);
  });

  test('the student page is a teacher view: back to the roster top-left, New reading, no navigation lost', async () => {
    const h = await seeded();
    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new reading/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    await h.user.click(screen.getByRole('button', { name: /back to roster/i }));
    expect(screen.getByRole('heading', { name: /roster/i })).toBeInTheDocument();
  });

  test('the roster shows each student’s latest reading', async () => {
    const h = await seeded();
    await h.user.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Roster' }));
    expect(screen.getByRole('button', { name: 'Ada Lovelace' })).toHaveAccessibleDescription(/awaiting review/i);
  });
});
