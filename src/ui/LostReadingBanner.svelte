<script lang="ts">
  import { useApp } from '../app/context';
  import { displayName } from '../domain/roster';
  import { formatDate } from './format';

  /** When set, only a loss for this student is reported here. */
  let { studentId }: { studentId?: string } = $props();

  const app = useApp();
  const lost = $derived(app.lostReading && (!studentId || app.lostReading.studentId === studentId) ? app.lostReading : undefined);
</script>

<!--
  init() consumes readingInProgress and clears it from storage, so wherever the teacher
  lands after a mid-reading reload has to be able to report it or the loss goes unseen.
-->
{#if lost}
  {@const lostStudent = app.student(lost.studentId)}
  <div class="banner warn-banner" role="alert">
    <span class="banner-mark">!</span>
    <span class="grow">
      A reading for <strong>{lostStudent ? displayName(lostStudent) : 'a student'}</strong>
      started {formatDate(lost.startedAt)} was lost because the tab closed before Done was tapped. Please redo it.
    </span>
    <button class="text-button" onclick={() => app.dismissLostReading()}>Dismiss</button>
  </div>
{/if}
