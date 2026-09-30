// Writes the demo data (src/dev/demo-data.ts), recordings included, as a backup file to import on any device
// (Settings → Import backup). Run scripts/make-demo-audio.sh first for the recordings;
// without them the readings have no audio.
// Usage: node scripts/make-demo-backup.mjs [out.zip]
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = process.argv[2] ?? 'src/dev/demo-backup.zip';

// The demo loader fetches its WAVs by dev-server URL; answer those from disk.
globalThis.fetch = async (url) => new Response(await readFile(root + String(url).replace(/^\//, '').replace(/\?.*$/, '')));

const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { demoBackup } = await server.ssrLoadModule('/src/dev/demo-backup.ts');
  const zip = await demoBackup();
  await writeFile(out, zip);
  console.log(`wrote ${out} (${(zip.length / 1024 / 1024).toFixed(1)} MB)`);
} finally {
  await server.close();
}
