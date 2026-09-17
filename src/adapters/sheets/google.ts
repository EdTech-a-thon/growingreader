import { mintToken, type DriveToken } from './broker';
import { FAKE_GOOGLE, fakeSheetTransport } from './fake-google';
import type { SheetTransport, SheetValues } from './sheets-client';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

let token: DriveToken | null = null;
let minting: Promise<DriveToken> | null = null;

function isFresh(candidate: DriveToken | null): candidate is DriveToken {
  return !!candidate && Date.now() < Date.parse(candidate.expiresAt) - 60_000;
}

async function currentToken(): Promise<DriveToken> {
  if (isFresh(token)) return token;
  minting ??= mintToken().then((minted) => {
    if (!minted.grantedScopes.includes(DRIVE_FILE_SCOPE)) throw new Error('Reconnect Google Drive and allow file access.');
    token = minted;
    return minted;
  }).finally(() => { minting = null; });
  return minting;
}

export async function authorize(): Promise<string> { return (await currentToken()).accessToken; }
export function clearAuthorization(): void { token = null; }

async function googleFetch(path: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${await authorize()}`, 'Content-Type': 'application/json', ...init.headers },
  });
  if (!response.ok) {
    if (response.status === 401) clearAuthorization();
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Google Sheets returned ${response.status}.`);
  }
  return response.status === 204 ? null : response.json();
}

function quoted(tab: string): string { return `'${tab.replaceAll("'", "''")}'`; }

export function createGoogleSheetTransport(): SheetTransport {
  if (FAKE_GOOGLE) return fakeSheetTransport();
  return {
    async create(title, tabs) {
      const body = { properties: { title }, sheets: tabs.map((tab) => ({ properties: { title: tab } })) };
      const result = await googleFetch(SHEETS, { method: 'POST', body: JSON.stringify(body) });
      return { spreadsheetId: result.spreadsheetId, spreadsheetUrl: result.spreadsheetUrl };
    },
    async write(spreadsheetId, values) {
      const ranges = Object.keys(values).map(quoted);
      await googleFetch(`${SHEETS}/${encodeURIComponent(spreadsheetId)}/values:batchClear`, {
        method: 'POST',
        body: JSON.stringify({ ranges }),
      });
      await googleFetch(`${SHEETS}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({
          // Names, notes, passages, and transcripts are data, never spreadsheet formulas.
          valueInputOption: 'RAW',
          data: Object.entries(values).map(([tab, rows]) => ({ range: `${quoted(tab)}!A1`, majorDimension: 'ROWS', values: rows })),
        }),
      });
    },
  };
}

export type { SheetValues };
