<script lang="ts">
  import { useApp } from '../../app/context';
  import { readingsCsv } from '../../domain/csv';
  import { formatBytes, formatDate } from '../format';
  import { downloadBlob } from '../download';

  const app = useApp();
  let importMessage = $state<string | undefined>(undefined);

  async function exportBackup() {
    const snapshot = await app.exportBackup();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `reading-fluency-backup-${new Date().toISOString().slice(0, 10)}.json`);
  }

  async function importBackup(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      await app.importBackup(JSON.parse(await file.text()));
      importMessage = `Imported ${app.students.length} students, ${app.passages.length} passages and ${app.readings.length} readings.`;
    } catch (err) {
      importMessage = `Could not import: ${err instanceof Error ? err.message : String(err)}`;
    }
    input.value = '';
  }

  function exportCsv() {
    const csv = readingsCsv(app.students, app.passages, app.readings);
    downloadBlob(new Blob([csv], { type: 'text/csv' }), `reading-fluency-readings-${new Date().toISOString().slice(0, 10)}.csv`);
  }
</script>

<main class="page">
  <h1>Settings</h1>

  <section class="card">
    <h2>Speech model</h2>
    {#if app.model.state === 'loading'}
      <p>Downloading the speech model ({Math.round(app.model.progress * 100)}%). This happens once; later launches are instant.</p>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(app.model.progress * 100)}>
        <div style="width:{app.model.progress * 100}%"></div>
      </div>
    {:else if app.model.state === 'ready'}
      <p>Ready. Recordings are matched to passages on this device; nothing is uploaded.</p>
    {:else}
      <p class="error">Not available: {app.model.message}</p>
      <p class="small muted">Every screen still works. You pick the passage yourself when reviewing a reading.</p>
      <button onclick={() => app.loadModel()}>Try downloading again</button>
    {/if}
  </section>

  <section class="card">
    <h2>Storage</h2>
    {#if app.storageUsage}
      <p>Using {formatBytes(app.storageUsage.usage)}{app.storageUsage.quota ? ` of about ${formatBytes(app.storageUsage.quota)} available` : ''}.</p>
    {:else}
      <p class="muted">Storage usage isn't reported by this browser.</p>
    {/if}
    <p class="small muted">Recordings are the bulk of it. Delete a reading's audio from its review screen to free space; the rate stays.</p>
  </section>

  <section class="card">
    <h2>Backup</h2>
    <p>
      {#if app.settings.lastBackupAt}
        Last backup: {formatDate(app.settings.lastBackupAt)}.
      {:else}
        No backup yet.
      {/if}
      A backup holds the roster, passages and readings (times, rates, notes) but not audio.
    </p>
    <div class="row">
      <button class="primary" onclick={exportBackup}>Export backup</button>
      <label style="margin:0">
        <span class="small">Import backup</span>
        <input type="file" accept="application/json,.json" onchange={importBackup} aria-label="Import backup" />
      </label>
    </div>
    {#if importMessage}
      <p role="status">{importMessage}</p>
    {/if}
  </section>

  <section class="card">
    <h2>Spreadsheet</h2>
    <p>Every reading as a CSV row: student, date, passage, time, rate, errors, completion, note.</p>
    <button onclick={exportCsv}>Export CSV</button>
  </section>

  <section class="card">
    <h2>Privacy</h2>
    <p class="small muted">Everything stays in this browser on this device. There is no account, no server and no upload. Audio leaves the device only when you export a single reading.</p>
  </section>
</main>
