<script lang="ts">
  import { useApp } from '../../app/context';
  import { displayName } from '../../domain/roster';
  import { activeDuration, activeSource, boundsFor, durationOf, formatRate, formatSeconds, rate, wordsCorrectPerMinute } from '../../domain/rate';
  import type { TimingSource } from '../../domain/types';
  import { formatDateTime } from '../format';
  import { encodeWav, downloadBlob } from '../wav';
  import PassageForm from '../PassageForm.svelte';

  let { readingId }: { readingId: string } = $props();
  const app = useApp();
  const reading = $derived(app.reading(readingId));
  const student = $derived(reading ? app.student(reading.studentId) : undefined);
  const passage = $derived(app.passage(reading?.passageId));
  const currentRate = $derived(reading ? rate(reading, passage) : undefined);
  const wcpm = $derived(reading ? wordsCorrectPerMinute(reading, passage) : undefined);

  let audioUrl = $state<string | undefined>(undefined);
  let audioSamples: Float32Array | undefined;
  let changingPassage = $state(false);
  let pastingPassage = $state(false);
  let confirmingDiscard = $state(false);
  let errorsText = $state('');
  let noteText = $state('');

  $effect(() => {
    errorsText = reading?.errors === undefined ? '' : String(reading.errors);
    noteText = reading?.note ?? '';
  });

  $effect(() => {
    if (!reading?.hasAudio) {
      audioUrl = undefined;
      return;
    }
    let cancelled = false;
    void app.audioFor(readingId).then((samples) => {
      if (cancelled || !samples || !reading) return;
      audioSamples = samples;
      if (typeof URL.createObjectURL === 'function') audioUrl = URL.createObjectURL(encodeWav(samples, reading.sampleRate));
    });
    return () => {
      cancelled = true;
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  });

  const timingOptions: Array<{ source: TimingSource; label: string }> = [
    { source: 'tap', label: 'Tap to tap' },
    { source: 'silence', label: 'Trimmed silence' },
    { source: 'transcript', label: 'First to last word' },
  ];

  const analysisLabel = $derived.by(() => {
    if (!reading) return '';
    switch (reading.analysis) {
      case 'queued':
        return 'Waiting to analyse…';
      case 'trimmed':
        return app.model.state === 'loading' ? 'Waiting for the speech model…' : 'Listening to the recording…';
      case 'transcribed':
        return 'Matching against passages…';
      case 'failed':
        return 'Analysis failed; everything here still works by hand.';
      default:
        return '';
    }
  });

  async function saveErrors() {
    const n = errorsText.trim() === '' ? undefined : Math.max(0, Math.floor(Number(errorsText)));
    await app.setErrors(readingId, Number.isNaN(n) ? undefined : n);
  }

  function exportAudio() {
    if (!audioSamples || !reading || !student) return;
    const name = `${displayName(student)} ${new Date(reading.recordedAt).toISOString().slice(0, 10)}.wav`.replace(/\s+/g, '-');
    downloadBlob(encodeWav(audioSamples, reading.sampleRate), name);
  }

  async function discard() {
    await app.discardReading(readingId);
    if (reading) app.go({ name: 'student', studentId: reading.studentId });
  }
</script>

<main class="page">
  {#if !reading || !student}
    <p>Reading not found.</p>
  {:else}
    <div class="row spread">
      <div>
        <h1>Review</h1>
        <p class="muted">{displayName(student)} · {formatDateTime(reading.recordedAt)}</p>
      </div>
      <button onclick={() => app.go({ name: 'student', studentId: reading.studentId })}>Back to {student.firstName}</button>
    </div>

    {#if reading.completion === 'discarded'}
      <div class="notice">This reading was discarded.</div>
    {/if}

    {#if analysisLabel}
      <p class="small muted" role="status">{analysisLabel}</p>
    {/if}

    <section class="card">
      <h2>Rate</h2>
      {#if currentRate !== undefined}
        <p class="rate">{formatRate(currentRate)} <small>words per minute</small></p>
        {#if wcpm !== undefined}
          <p class="rate" style="font-size:2rem">{formatRate(wcpm)} <small>words correct per minute</small></p>
        {/if}
      {:else if !passage}
        <p class="muted">Choose a passage to get a rate.</p>
      {:else if reading.completion !== 'complete'}
        <p class="muted">Mark the reading complete to get a rate.</p>
      {/if}
    </section>

    <section class="card">
      <h2>Recording</h2>
      {#if reading.hasAudio}
        {#if audioUrl}
          <audio controls src={audioUrl} style="width:100%"></audio>
        {:else}
          <p class="muted small">Loading audio…</p>
        {/if}
        <div class="row" style="margin-top:0.5rem">
          <button onclick={exportAudio}>Export audio</button>
          <button class="danger" onclick={() => app.deleteAudio(readingId)}>Delete audio</button>
        </div>
      {:else}
        <p class="muted">Audio deleted; the timing and rate are kept.</p>
      {/if}
    </section>

    <section class="card">
      <h2>Timing</h2>
      <p>Time spent reading: <strong>{formatSeconds(activeDuration(reading))}</strong></p>
      <div class="choices" role="group" aria-label="Timing">
        {#each timingOptions as option (option.source)}
          {@const bounds = boundsFor(reading, option.source)}
          <button
            aria-pressed={activeSource(reading) === option.source}
            disabled={!bounds}
            onclick={() => app.setTiming(readingId, option.source)}
            title={bounds ? `${bounds.start.toFixed(1)} s → ${bounds.end.toFixed(1)} s` : 'Not available yet'}
          >
            {option.label}{bounds ? `: ${formatSeconds(durationOf(bounds))}` : ''}
          </button>
        {/each}
      </div>
      {#if activeSource(reading) !== 'tap'}
        <button class="link" onclick={() => app.setTiming(readingId, 'tap')}>Reset to tap-to-tap</button>
      {/if}
    </section>

    <section class="card">
      <h2>Passage</h2>
      {#if passage}
        <p><strong>{passage.title}</strong> <span class="muted">· {passage.wordCount} words</span>{#if reading.identification?.autoAssigned && !changingPassage}<span class="small muted"> · identified from the recording</span>{/if}</p>
      {:else if reading.identification && !reading.identification.autoAssigned && reading.identification.candidates.length > 0}
        <p>Not sure which passage this was. Was it one of these?</p>
        <div class="choices">
          {#each reading.identification.candidates as c (c.passageId)}
            {@const candidate = app.passage(c.passageId)}
            {#if candidate}
              <button onclick={() => app.setPassage(readingId, candidate.id)}>{candidate.title}</button>
            {/if}
          {/each}
        </div>
      {:else if app.passages.length === 0}
        <p class="muted">No passages stored yet.</p>
      {:else}
        <p class="muted">No passage chosen.</p>
      {/if}

      <div class="row" style="margin-top:0.5rem">
        {#if app.passages.length > 0}
          <button onclick={() => ((changingPassage = !changingPassage), (pastingPassage = false))}>{passage ? 'Change passage' : 'Choose passage'}</button>
        {/if}
        <button onclick={() => ((pastingPassage = !pastingPassage), (changingPassage = false))}>Paste new passage</button>
      </div>

      {#if changingPassage}
        <div class="choices" style="margin-top:0.75rem" role="group" aria-label="Choose passage">
          {#each app.passages as p (p.id)}
            <button aria-pressed={p.id === reading.passageId} onclick={() => (app.setPassage(readingId, p.id), (changingPassage = false))}>{p.title}</button>
          {/each}
        </div>
      {/if}

      {#if pastingPassage}
        <PassageForm
          submitLabel="Save and use for this reading"
          onsubmit={async (title, text) => {
            await app.pasteNewPassageFor(readingId, title, text);
            pastingPassage = false;
          }}
          oncancel={() => (pastingPassage = false)}
        />
      {/if}
    </section>

    <section class="card">
      <h2>Completion</h2>
      {#if reading.completionAssessment}
        {#if reading.completionAssessment.probablyIncomplete}
          <div class="notice">
            The student may not have reached the end: the app heard up to word {reading.completionAssessment.reachedWord} of {reading.completionAssessment.ofWords}. Listen and decide.
          </div>
        {:else}
          <p class="small muted">The app heard the student reach word {reading.completionAssessment.reachedWord} of {reading.completionAssessment.ofWords}.</p>
        {/if}
      {:else if reading.completion === 'pending'}
        <p class="small muted">Did they read the whole passage?</p>
      {/if}
      <div class="choices" role="group" aria-label="Completion">
        <button aria-pressed={reading.completion === 'complete'} onclick={() => app.setCompletion(readingId, 'complete')}>Complete</button>
        <button aria-pressed={reading.completion === 'incomplete'} onclick={() => app.setCompletion(readingId, 'incomplete')}>Incomplete</button>
      </div>
    </section>

    <section class="card">
      <h2>Errors</h2>
      <div class="field">
        <label for="errors">Misread words you heard (optional)</label>
        <input id="errors" type="number" min="0" step="1" inputmode="numeric" bind:value={errorsText} onblur={saveErrors} onchange={saveErrors} style="max-width:10rem" />
      </div>
      <div class="field">
        <label for="note">Note</label>
        <textarea id="note" bind:value={noteText} onblur={() => app.setNote(readingId, noteText)} style="min-height:4rem" placeholder="e.g. new glasses today"></textarea>
      </div>
    </section>

    {#if reading.transcript}
      <details class="card">
        <summary class="muted">What the app heard (rough; used only to match the passage)</summary>
        <pre class="transcript">{reading.transcript.text}</pre>
      </details>
    {/if}

    <section class="card">
      <div class="row">
        <button class="primary" onclick={() => app.go({ name: 'start', studentId: reading.studentId, passageId: reading.passageId })}>Record again</button>
        {#if reading.completion !== 'discarded'}
          {#if confirmingDiscard}
            <span>Discard this reading? The audio is deleted and it leaves the record.</span>
            <button class="danger" onclick={discard}>Yes, discard</button>
            <button onclick={() => (confirmingDiscard = false)}>Keep</button>
          {:else}
            <button class="danger" onclick={() => (confirmingDiscard = true)}>Discard reading</button>
          {/if}
        {/if}
      </div>
    </section>
  {/if}
</main>
