import { createFakeSheetTransport } from './fake-google';
import { createSheetsClient, sheetValues, type SyncData } from './sheets-client';

const data: SyncData = {
  students: [{ id: 's1', firstName: 'Ada', lastName: 'Lovelace', archived: false, createdAt: Date.UTC(2026, 8, 1) }],
  passages: [{ id: 'p1', title: 'The Camp', text: 'One two three four.', wordCount: 4, createdAt: Date.UTC(2026, 8, 2) }],
  readings: [{
    id: 'r1',
    studentId: 's1',
    passageId: 'p1',
    recordedAt: Date.UTC(2026, 8, 15, 15),
    hasAudio: true,
    sampleRate: 16_000,
    sampleCount: 640_000,
    tapBounds: { start: 0, end: 40 },
    timing: 'auto',
    transcript: { text: 'one two three four', words: [{ text: 'one', start: 0.2, end: 0.4 }] },
    completion: 'complete',
    errors: 1,
    note: 'Strong finish',
    analysis: 'done',
  }],
};

describe('Google Sheets report', () => {
  test('includes the roster, passages, results, transcript, and summary, but no recording data', () => {
    const values = sheetValues(data);

    expect(values.Students[1]).toEqual(['s1', 'Ada', 'Lovelace', 'active', '2026-09-01T00:00:00.000Z']);
    expect(values.Passages[1]).toContain('The Camp');
    expect(values.Readings[0]).toContain('transcript');
    expect(values.Readings[1]).toContain('one two three four');
    expect(values.Summary[1].slice(0, 6)).toEqual(['s1', 'Ada Lovelace', 'active', 1, 1, 0]);

    const serialized = JSON.stringify(values);
    expect(serialized).not.toContain('hasAudio');
    expect(serialized).not.toContain('sampleRate');
    expect(serialized).not.toContain('sampleCount');
    expect(serialized).not.toContain('transcriptBounds');
  });

  test('creates the four report tabs and rewrites them on later pushes', async () => {
    const transport = createFakeSheetTransport();
    const client = createSheetsClient(transport);
    const created = await client.create('Growing Reader data', data);

    expect(transport.inspect(created.spreadsheetId).tabs).toEqual(['Summary', 'Students', 'Readings', 'Passages']);
    expect(transport.inspect(created.spreadsheetId).values.Readings).toHaveLength(2);

    await client.push(created.spreadsheetId, { ...data, readings: [] });
    expect(transport.inspect(created.spreadsheetId).values.Readings).toHaveLength(1);
    expect(transport.operations).toEqual(['CREATE fake-sheet-1', 'WRITE fake-sheet-1', 'WRITE fake-sheet-1']);
  });
});

test('a passage too long for a Sheets cell is truncated rather than failing the whole push', () => {
  const passage = { id: 'p1', title: 'Long', text: 'x'.repeat(60_000), wordCount: 1, createdAt: 0 };
  const values = sheetValues({ students: [], passages: [passage], readings: [] });
  const cell = values.Passages[1][3] as string;
  expect(cell.length).toBeLessThanOrEqual(50_000);
  expect(cell).toMatch(/truncated: too long for one cell\]$/);
});
