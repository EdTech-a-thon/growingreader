<script lang="ts">
  import { useApp } from '../app/context';
  import Lock from '@lucide/svelte/icons/lock';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import Cloud from '@lucide/svelte/icons/cloud';
  import CloudCheck from '@lucide/svelte/icons/cloud-check';
  import CloudOff from '@lucide/svelte/icons/cloud-off';
  import BrandMark from './BrandMark.svelte';
  const app = useApp();
</script>

<header class="topbar">
  <div class="brand"><span class="brand-mark"><BrandMark size={25} /></span><span>Growing Reader</span></div>
  <div class="topbar-actions">
    <div class="topbar-status">
      {#if app.processing.length > 0}
        <span role="status"><LoaderCircle size={16} class="spin" aria-hidden="true" style="vertical-align:-3px;margin-right:6px" />Analysing {app.processing.length} {app.processing.length === 1 ? 'reading' : 'readings'}…</span>
      {:else}
        <span class="privacy-note"><Lock size={14} aria-hidden="true" />Recordings stay on this device</span>
      {/if}
    </div>
    <button class:warning={app.syncStatus === 'offline' || app.syncStatus === 'reconnect'} class="sync-button" onclick={() => app.openSyncDialog()} aria-label="Google Sheets sync">
      {#if !app.syncLink}<CloudOff size={18} />{:else if app.syncStatus === 'saved'}<CloudCheck size={18} />{:else if app.syncStatus === 'saving'}<LoaderCircle size={18} class="spin" />{:else}<Cloud size={18} />{/if}
      <span>{app.syncLabel}</span>
    </button>
  </div>
</header>
