import { SHEET_TABS, type SheetTab, type SheetTransport, type SheetValues } from './sheets-client';

export const FAKE_GOOGLE = import.meta.env.VITE_FAKE_GOOGLE === 'true';

export interface FakeBook {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  tabs: SheetTab[];
  values: SheetValues;
}

function emptyValues(): SheetValues {
  return { Summary: [], Students: [], Readings: [], Passages: [] };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createFakeSheetTransport(): SheetTransport & {
  operations: string[];
  inspect(id: string): FakeBook;
} {
  const books = new Map<string, FakeBook>();
  const operations: string[] = [];
  let nextId = 0;

  return {
    operations,
    async create(title, tabs) {
      const spreadsheetId = `fake-sheet-${++nextId}`;
      const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
      operations.push(`CREATE ${spreadsheetId}`);
      books.set(spreadsheetId, { spreadsheetId, spreadsheetUrl, title, tabs: [...tabs], values: emptyValues() });
      return { spreadsheetId, spreadsheetUrl };
    },
    async write(spreadsheetId, values) {
      operations.push(`WRITE ${spreadsheetId}`);
      const book = books.get(spreadsheetId);
      if (!book) throw new Error('No such spreadsheet in fake Google.');
      book.values = clone(values);
    },
    inspect(spreadsheetId) {
      const book = books.get(spreadsheetId);
      if (!book) throw new Error('No such spreadsheet in fake Google.');
      return clone(book);
    },
  };
}

const runtimeFake = createFakeSheetTransport();

export function fakeSheetTransport(): SheetTransport {
  return runtimeFake;
}

export { SHEET_TABS };
