<script lang="ts">
  import { useApp } from '../../app/context';
  import { displayName, initials } from '../../domain/roster';
  import { activeDuration, formatRate, formatSeconds, rate } from '../../domain/rate';
  import { formatDateTime } from '../format';
  import { isAnalysing, type CompletionState } from '../../domain/types';
  import Chart from '../Chart.svelte';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Mic from '@lucide/svelte/icons/mic';
  import PassagePicker from '../PassagePicker.svelte';
  import LostReadingBanner from '../LostReadingBanner.svelte';
  import Archive from '@lucide/svelte/icons/archive';

  let { studentId }: { studentId: string } = $props();
  const app = useApp();
  const student = $derived(app.student(studentId));
  const readings = $derived(app.readingsFor(studentId));
  const completionLabel: Record<CompletionState, string> = { pending: 'Awaiting review', complete: 'Complete', incomplete: 'Incomplete', discarded: 'Discarded' };
  let confirmingArchive = $state(false);
  /** Step one of handing over: the passage is being picked; step two is the Start screen. */
  let handingOver = $state(false);

  async function archive() {
    await app.archiveStudent(studentId);
    app.go({ name: 'roster' });
  }
</script>

<main class="view">
  {#if !student}
    <p>Student not found.</p>
  {:else}
    <div class="back-row">
      <button class="button secondary" onclick={() => app.go({ name: 'roster' })}><ArrowLeft size={18} aria-hidden="true" />Back to roster</button>
    </div>
    <LostReadingBanner {studentId} />
    <div class="page-heading">
      <div class="student-hero">
        <span class="initials" aria-hidden="true">{initials(student)}</span>
        <div class="heading-text">
          <p class="eyebrow">Student</p>
          <h1>{displayName(student)}</h1>
          <p class="subtext">{readings.length} {readings.length === 1 ? 'reading' : 'readings'}</p>
        </div>
      </div>
      <div class="heading-actions">
        <button class="button primary" onclick={() => (app.passages.length === 0 ? app.go({ name: 'start', studentId }) : (handingOver = true))}><Mic size={18} aria-hidden="true" />New reading</button>
      </div>
    </div>

    <section class="card">
      <h2>Rate over time</h2>
      <Chart {readings} passages={app.passages} onselect={(readingId) => app.go({ name: 'review', readingId })} />
    </section>

    <section class="card">
      <h2>Readings</h2>
      {#if readings.length === 0}
        <p class="muted">No readings yet.</p>
      {:else}
        <table>
          <thead>
            <tr><th>Date</th><th>Passage</th><th>Time</th><th>Rate</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {#each readings as r (r.id)}
              {@const passage = app.passage(r.passageId)}
              <tr>
                <td>{formatDateTime(r.recordedAt)}</td>
                <td>{passage?.title ?? '—'}</td>
                <td class="num">{formatSeconds(activeDuration(r))}</td>
                <td class="num">{formatRate(rate(r, passage))}</td>
                <td><span class="status-pill {r.completion}">{completionLabel[r.completion]}</span>{#if isAnalysing(r)}<span class="small muted"> · analysing</span>{/if}</td>
                <td><button class="button secondary small" onclick={() => app.go({ name: 'review', readingId: r.id })}>Open</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>

    <section class="card">
      <h2>Archive</h2>
      <div class="inline-actions">
        {#if confirmingArchive}
          <span class="confirm-line">Remove {student.firstName} from the roster? Their readings are kept.</span>
          <button class="button danger" onclick={archive}>Yes, archive</button>
          <button class="button secondary" onclick={() => (confirmingArchive = false)}>Keep</button>
        {:else}
          <p class="subtext" style="flex:1 1 240px">A student who has left disappears from the roster; nothing is deleted.</p>
          <button class="button danger" onclick={() => (confirmingArchive = true)}><Archive size={18} aria-hidden="true" />Archive student</button>
        {/if}
      </div>
    </section>
  {/if}
</main>

{#if handingOver && student}
  <PassagePicker
    eyebrow="Step 1 of 2 · {displayName(student)}"
    title="Which passage are they reading?"
    groupLabel="Passage"
    skipHint="You can still pick it on review"
    onpick={(passageId) => {
      handingOver = false;
      app.go({ name: 'start', studentId, passageId });
    }}
    onclose={() => (handingOver = false)}
  />
{/if}
