<script lang="ts">
  import { useApp } from '../../app/context';
  import { displayName } from '../../domain/roster';
  import { activeDuration, formatRate, formatSeconds, rate } from '../../domain/rate';
  import { formatDateTime } from '../format';
  import { isAnalysing, type CompletionState } from '../../domain/types';
  import Chart from '../Chart.svelte';

  let { studentId }: { studentId: string } = $props();
  const app = useApp();
  const student = $derived(app.student(studentId));
  const readings = $derived(app.readingsFor(studentId));
  const completionLabel: Record<CompletionState, string> = { pending: 'Awaiting review', complete: 'Complete', incomplete: 'Incomplete', discarded: 'Discarded' };

  async function archive() {
    await app.archiveStudent(studentId);
    app.go({ name: 'roster' });
  }
</script>

<main class="page">
  {#if !student}
    <p>Student not found.</p>
  {:else}
    <div class="row spread">
      <h1>{displayName(student)}</h1>
      <div class="row">
        <button onclick={() => app.go({ name: 'progress', studentId })}>Show progress</button>
        <button class="danger" onclick={archive}>Archive student</button>
      </div>
    </div>

    <div class="card">
      <button class="primary" onclick={() => app.go({ name: 'start', studentId })}>New reading</button>
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
                <td>{formatSeconds(activeDuration(r))}</td>
                <td>{formatRate(rate(r, passage))}</td>
                <td>{completionLabel[r.completion]}{#if isAnalysing(r)}<span class="small muted"> · analysing</span>{/if}</td>
                <td><button class="link" onclick={() => app.go({ name: 'review', readingId: r.id })}>Open</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
  {/if}
</main>
