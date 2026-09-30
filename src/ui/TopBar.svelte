<script lang="ts">
  import { useApp } from '../app/context';
  import Lock from '@lucide/svelte/icons/lock';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import Cloud from '@lucide/svelte/icons/cloud';
  import CloudCheck from '@lucide/svelte/icons/cloud-check';
  import CloudOff from '@lucide/svelte/icons/cloud-off';
  import BrandMark from './BrandMark.svelte';
  import { SHEETS_SYNC } from '../app/features';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { displayName } from '../domain/roster';
  import { formatDate } from './format';
  import type { Screen } from '../app/store.svelte';
  const app = useApp();

  /** Where this screen sits: Roster › student › reading › marking. Each step but the last goes there. */
  const crumbs = $derived.by((): Array<{ label: string; to?: Screen }> => {
    const screen = app.screen;
    if (screen.name === 'passages') return [{ label: 'Passages' }];
    if (screen.name === 'settings') return [{ label: 'Settings' }];
    const roster = { label: 'Roster', to: { name: 'roster' } as Screen };
    if (screen.name === 'roster') return [{ label: 'Roster' }];
    const reading = 'readingId' in screen ? app.reading(screen.readingId) : undefined;
    const studentId = screen.name === 'student' ? screen.studentId : reading?.studentId;
    const student = studentId ? app.student(studentId) : undefined;
    if (!student) return [roster];
    const studentCrumb = { label: displayName(student), to: { name: 'student', studentId: student.id } as Screen };
    if (screen.name === 'student') return [roster, { label: studentCrumb.label }];
    if (!reading) return [roster, studentCrumb];
    const readingLabel = `Reading · ${formatDate(reading.recordedAt)}`;
    if (screen.name === 'review') return [roster, studentCrumb, { label: readingLabel }];
    if (screen.name === 'mark') return [roster, studentCrumb, { label: readingLabel, to: { name: 'review', readingId: reading.id } }, { label: 'Marking' }];
    return [roster, studentCrumb];
  });
</script>

<header class="topbar">
  <div class="topbar-start">
    <div class="brand"><span class="brand-mark"><BrandMark size={25} /></span><span>Growing Reader</span></div>
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {#each crumbs as crumb, i (i)}
          <li>
            {#if i > 0}<ChevronRight size={14} aria-hidden="true" />{/if}
            {#if crumb.to && i < crumbs.length - 1}
              <button class="crumb" onclick={() => app.go(crumb.to!)}>{crumb.label}</button>
            {:else}
              <span class="crumb current" aria-current="page">{crumb.label}</span>
            {/if}
          </li>
        {/each}
      </ol>
    </nav>
  </div>
  <div class="topbar-actions">
    <div class="topbar-status">
      {#if app.processing.length > 0}
        <span role="status"><LoaderCircle size={16} class="spin" aria-hidden="true" style="vertical-align:-3px;margin-right:6px" />Analysing {app.processing.length} {app.processing.length === 1 ? 'reading' : 'readings'}…</span>
      {:else}
        <span class="privacy-note"><Lock size={14} aria-hidden="true" />Recordings stay on this device</span>
      {/if}
    </div>
    {#if SHEETS_SYNC}
    <button class:warning={app.syncStatus === 'offline' || app.syncStatus === 'reconnect'} class="sync-button" onclick={() => app.openSyncDialog()} aria-label="Google Sheets sync">
      {#if !app.syncLink}<CloudOff size={18} />{:else if app.syncStatus === 'saved'}<CloudCheck size={18} />{:else if app.syncStatus === 'saving'}<LoaderCircle size={18} class="spin" />{:else}<Cloud size={18} />{/if}
      <span>{app.syncLabel}</span>
    </button>
    {/if}
  </div>
</header>
