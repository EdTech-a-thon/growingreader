<script lang="ts">
  import { useApp } from '../../app/context';
  import { readingsCsv } from '../../domain/csv';
  import { formatBytes, formatDate } from '../format';
  import { downloadBlob } from '../download';
  import Download from '@lucide/svelte/icons/download';
  import Upload from '@lucide/svelte/icons/upload';
  import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import Lock from '@lucide/svelte/icons/lock';
  import CloudUpload from '@lucide/svelte/icons/cloud-upload';

  const app = useApp();
  let importMessage = $state<string | undefined>(undefined);

  async function exportBackup() {
    const snapshot = await app.exportBackup();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `growingreader-backup-${new Date().toISOString().slice(0, 10)}.json`);
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
    downloadBlob(new Blob([csv], { type: 'text/csv' }), `growingreader-readings-${new Date().toISOString().slice(0, 10)}.csv`);
  }
</script>

<main class="view">
  <div class="page-heading">
    <div class="heading-text">
      <p class="eyebrow">This device</p>
      <h1>Settings</h1>
      <p class="subtext"><Lock size={14} aria-hidden="true" style="vertical-align:-2px" /> Your data starts in this browser. If you choose Google Sheets sync, roster details and reading results are copied there; audio recordings always stay on this device unless you export one.</p>
    </div>
  </div>

  <div class="settings-grid">
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
      <div class="inline-actions">
        <button class="button primary" onclick={exportBackup}><Download size={18} aria-hidden="true" />Export backup</button>
        <label class="button secondary file-button">
          <Upload size={18} aria-hidden="true" />Import backup
          <input type="file" accept="application/json,.json" onchange={importBackup} aria-label="Import backup" />
        </label>
      </div>
      {#if importMessage}
        <p role="status" style="margin:12px 0 0">{importMessage}</p>
      {/if}
    </section>

    <section class="card">
      <h2>Spreadsheet</h2>
      <p>Every reading as a CSV row: student, date, passage, time, rate, errors, completion, note.</p>
      <button class="button secondary" onclick={exportCsv}><FileSpreadsheet size={18} aria-hidden="true" />Export CSV</button>
    </section>

    <section class="card">
      <h2>Google Sheets</h2>
      <p>{app.syncLink ? `Synced as ${app.syncLink.googleEmail || 'your Google account'}. Changes save automatically.` : 'Create a live spreadsheet for the roster, passages, reading stats, notes, and transcripts. Recordings are never included.'}</p>
      <button class="button secondary" onclick={() => app.openSyncDialog()}><CloudUpload size={18} aria-hidden="true" />{app.syncLink ? 'Sync details' : 'Sync to Google Sheets'}</button>
    </section>

    <section class="card">
      <h2>Storage</h2>
      {#if app.storageUsage}
        <p>Using {formatBytes(app.storageUsage.usage)}{app.storageUsage.quota ? ` of about ${formatBytes(app.storageUsage.quota)} available` : ''}.</p>
      {:else}
        <p class="muted">Storage usage isn't reported by this browser.</p>
      {/if}
      <p class="field-help">Recordings are the bulk of it. Delete a reading's audio from its review screen to free space; the rate stays.</p>
    </section>

    <section class="card">
      <h2>Speech model</h2>
      {#if app.model.state === 'loading'}
        <p>Downloading in the background ({Math.round(app.model.progress * 100)}%). This happens once; later launches are instant.</p>
        <div class="progress-track" role="progressbar" aria-label="Speech model download" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(app.model.progress * 100)}>
          <span style="width:{app.model.progress * 100}%"></span>
        </div>
      {:else if app.model.state === 'ready'}
        <p>Ready. Recordings are matched to passages on this device; nothing is uploaded.</p>
      {:else}
        <p class="error" style="color:var(--danger)">Not available: {app.model.message}</p>
        <p class="field-help" style="margin-bottom:12px">Every screen still works. You pick the passage yourself when reviewing a reading.</p>
        <button class="button secondary" onclick={() => app.loadModel()}><RefreshCw size={18} aria-hidden="true" />Try downloading again</button>
      {/if}
    </section>

    <section class="card settings-brand-card">
      <img src="/logo.svg" alt="" width="42" height="42" />
      <div>
        <h2>teacher.dev</h2>
        <p>Growing Reader is built by <a href="https://teacher.dev" target="_blank" rel="noopener noreferrer">teacher.dev</a>.</p>
        <div class="inline-actions">
          <a href="/about" data-app-link>About</a>
          <a href="/privacy" data-app-link>Privacy</a>
        </div>
      </div>
    </section>
  </div>
</main>
