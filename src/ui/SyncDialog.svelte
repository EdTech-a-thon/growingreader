<script lang="ts">
  import { useApp } from '../app/context';
  import { formatDateTime } from './format';
  import Modal from './Modal.svelte';
  import CloudUpload from '@lucide/svelte/icons/cloud-upload';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';

  const app = useApp();
</script>

<Modal title={app.syncLink ? app.syncLabel : 'Sync to Google Sheets'} eyebrow="Google Sheets" onclose={() => app.closeSyncDialog()}>
  {#if app.syncError}
    <div class="error-banner banner" role="alert"><span class="banner-mark">!</span><span>{app.syncError}</span></div>
  {/if}

  {#if app.syncLink}
    <p class="sync-copy">The browser remains the editor. Roster changes, passages, reading statistics, notes, and transcripts save automatically. <strong>Recordings never upload.</strong></p>
    <dl class="sync-details">
      <dt>Account</dt><dd>{app.syncLink.googleEmail || 'Connected Google account'}</dd>
      <dt>Sheet</dt><dd><a href={app.syncLink.spreadsheetUrl} target="_blank" rel="noreferrer">Open spreadsheet <ExternalLink size={14} aria-hidden="true" /></a></dd>
      {#if app.syncLink.lastSyncedAt}<dt>Last saved</dt><dd>{formatDateTime(app.syncLink.lastSyncedAt)}</dd>{/if}
    </dl>
    <div class="modal-actions sync-actions">
      <button class="button primary" disabled={app.syncStatus === 'saving'} onclick={() => app.syncNow()}><RefreshCw size={18} class={app.syncStatus === 'saving' ? 'spin' : ''} aria-hidden="true" />Save now</button>
      {#if app.syncStatus === 'reconnect'}
        <button class="button secondary" onclick={() => app.reconnectDrive()}>Reconnect Drive</button>
      {/if}
      <button class="button secondary" disabled={app.syncStatus === 'saving'} onclick={() => app.disconnectGoogleSheets()}>Disconnect</button>
    </div>
  {:else}
    <p class="sync-copy">Create a spreadsheet with Summary, Students, Readings, and Passages tabs. It includes reading statistics and transcript text, but <strong>never the audio recordings</strong>. Your local copy keeps working offline.</p>
    <button class="button primary sync-continue" disabled={app.syncStatus === 'saving'} onclick={() => app.createGoogleSheet()}>
      {#if app.syncStatus === 'saving'}<RefreshCw size={18} class="spin" aria-hidden="true" />Creating…{:else}<CloudUpload size={18} aria-hidden="true" />Continue with Google{/if}
    </button>
  {/if}

  {#if app.driveConnection}
    <div class="sync-account">Signed in as {app.driveConnection.googleEmail ?? 'Google user'} <button class="link-button" onclick={() => app.signOutGoogle()}>Sign out</button></div>
  {/if}
</Modal>
