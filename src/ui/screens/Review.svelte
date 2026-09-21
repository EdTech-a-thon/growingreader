<script lang="ts">
  import { untrack } from 'svelte';
  import { useApp } from '../../app/context';
  import { displayName } from '../../domain/roster';
  import { activeBounds, activeDuration, autoBounds, autoSource, estimatedRate, formatRate, formatSeconds, rate, wordsCorrectPerMinute } from '../../domain/rate';
  import type { TimingSource } from '../../domain/types';
  import { formatDateTime } from '../format';
  import { encodeWav } from '../wav';
  import { downloadBlob } from '../download';
  import PassageForm from '../PassageForm.svelte';
  import ConvertFileHelp from '../ConvertFileHelp.svelte';
  import { readPassageFiles, type ReadFailure, type ReadPassage } from '../read-files';
  import PassagePicker from '../PassagePicker.svelte';
  import Modal from '../Modal.svelte';
  import Waveform from '../Waveform.svelte';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Play from '@lucide/svelte/icons/play';
  import Pause from '@lucide/svelte/icons/pause';
  import Download from '@lucide/svelte/icons/download';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Mic from '@lucide/svelte/icons/mic';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';

  let { readingId }: { readingId: string } = $props();
  const app = useApp();
  const reading = $derived(app.reading(readingId));
  const student = $derived(reading ? app.student(reading.studentId) : undefined);
  const passage = $derived(app.passage(reading?.passageId));
  const currentRate = $derived(reading ? rate(reading, passage) : undefined);
  const wcpm = $derived(reading ? wordsCorrectPerMinute(reading, passage) : undefined);
  // An estimate stands in only while the exact rate is out of reach; an incomplete reading gets no number at all (ADR-0001).
  const estimate = $derived(reading && currentRate === undefined && (reading.completion === 'pending' || reading.completion === 'complete') ? estimatedRate(reading) : undefined);
  const totalSeconds = $derived(reading ? reading.sampleCount / reading.sampleRate : 0);

  let audioUrl = $state<string | undefined>(undefined);
  let audioSamples = $state<Float32Array | undefined>(undefined);
  let audioEl = $state<HTMLAudioElement | undefined>(undefined);
  let playing = $state(false);
  let playhead = $state(0);
  let changingPassage = $state(false);
  let pastingPassage = $state(false);
  let passageFileInput = $state<HTMLInputElement | undefined>(undefined);
  let importedPassage = $state<ReadPassage | undefined>(undefined);
  let importFailures = $state<ReadFailure[]>([]);

  /** One file becomes this reading's passage, or explains why it could not. */
  async function takePassageFile(file: File | undefined) {
    if (!file) return;
    const { passages, failures } = await readPassageFiles(app, [file]);
    importedPassage = passages[0];
    importFailures = failures;
    if (importedPassage) {
      pastingPassage = true;
      importFailures = [];
    }
  }

  function closePassageForm() {
    pastingPassage = false;
    importedPassage = undefined;
  }
  let confirmingDiscard = $state(false);
  let noteText = $state('');

  // Seed the note once per reading; later background saves must not clobber what the teacher is typing.
  $effect(() => {
    void readingId;
    untrack(() => {
      noteText = reading?.note ?? '';
    });
  });

  // Load audio once per reading (and again if it is deleted), not on every analysis-stage save.
  const hasAudio = $derived(reading?.hasAudio ?? false);
  $effect(() => {
    if (!hasAudio) {
      audioUrl = undefined;
      audioSamples = undefined;
      return;
    }
    let cancelled = false;
    let url: string | undefined;
    void app.audioFor(readingId).then((samples) => {
      const sampleRate = untrack(() => reading?.sampleRate);
      if (cancelled || !samples || !sampleRate) return;
      audioSamples = samples;
      if (typeof URL.createObjectURL === 'function') audioUrl = url = URL.createObjectURL(encodeWav(samples, sampleRate));
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  });

  const bounds = $derived(reading ? activeBounds(reading) : { start: 0, end: 0 });
  const autoLabel: Record<TimingSource, string> = {
    tap: 'Whole recording, tap to tap',
    silence: 'Auto-trimmed: silence cut from both ends',
    transcript: 'Auto-trimmed: first word to last word',
  };
  const timingLabel = $derived(reading ? (reading.timing === 'manual' && reading.manualBounds ? 'Adjusted by hand' : autoLabel[autoSource(reading)]) : '');

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

  function togglePlay() {
    if (!audioEl) return;
    if (audioEl.paused) {
      // From rest, play from where the reading starts rather than the lead-in silence.
      if (audioEl.currentTime === 0 || audioEl.ended) audioEl.currentTime = bounds.start;
      void audioEl.play();
    } else audioEl.pause();
  }

  function seek(seconds: number) {
    playhead = seconds;
    if (audioEl) audioEl.currentTime = seconds;
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

<main class="view">
  {#if !reading || !student}
    <p>Reading not found.</p>
  {:else}
    <div class="back-row">
      <button class="button secondary" onclick={() => app.go({ name: 'student', studentId: reading.studentId })}><ArrowLeft size={18} aria-hidden="true" />Back to {student.firstName}</button>
    </div>
    <div class="page-heading">
      <div class="heading-text">
        <p class="eyebrow">{formatDateTime(reading.recordedAt)}</p>
        <h1>Review · {displayName(student)}</h1>
        {#if analysisLabel}
          <p class="subtext" role="status"><LoaderCircle size={14} class="spin" aria-hidden="true" style="vertical-align:-2px;margin-right:4px" />{analysisLabel}</p>
        {/if}
      </div>
      <div class="heading-actions">
        <button class="button primary" onclick={() => app.go({ name: 'start', studentId: reading.studentId, passageId: reading.passageId })}><Mic size={18} aria-hidden="true" />Record again</button>
      </div>
    </div>

    {#if reading.completion === 'discarded'}
      <div class="banner warn-banner"><span class="banner-mark">!</span>This reading was discarded.</div>
    {/if}

    <section class="review-hero">
      <div class="passage-row">
        <button class="passage-select" aria-haspopup="dialog" onclick={() => (changingPassage = true)}>
          <BookOpen size={18} aria-hidden="true" />
          {#if passage}
            <span class="passage-select-title">{passage.title}</span>
            <span class="muted">· {passage.wordCount} words</span>
          {:else}
            <span class="passage-select-title">Choose passage</span>
          {/if}
          <ChevronDown size={18} aria-hidden="true" />
        </button>
        {#if passage && reading.identification?.autoAssigned}
          <span class="small muted">identified from the recording</span>
        {:else if !passage && reading.identification && reading.identification.candidates.length > 0}
          <span class="candidates" role="group" aria-label="Passage candidates">
            <span class="small muted">Not sure which passage. Was it</span>
            {#each reading.identification.candidates as c, i (c.passageId)}
              {@const candidate = app.passage(c.passageId)}
              {#if candidate}
                <button class="link-button" onclick={() => app.setPassage(readingId, candidate.id)}>{candidate.title}</button>{i < reading.identification.candidates.length - 1 ? ' or' : '?'}
              {/if}
            {/each}
          </span>
        {/if}
      </div>

      <div class="rate-row">
        <div>
          <h2 class="card-title">Rate</h2>
          {#if currentRate !== undefined}
            <div class="rate-block">
              <p class="rate">{formatRate(currentRate)} <small>words per minute</small></p>
              {#if wcpm !== undefined}
                <p class="rate secondary">{formatRate(wcpm)} <small>words correct per minute</small></p>
              {/if}
            </div>
          {:else}
            {#if estimate !== undefined}
              <p class="rate estimate">≈{formatRate(estimate)} <small>words per minute, estimated</small></p>
            {/if}
            {#if !passage}
              <p class={estimate === undefined ? 'rate-prompt' : 'rate-caption'}>Choose a passage to get a rate{estimate !== undefined ? ' from its word count instead of the rough transcript.' : '.'}</p>
            {:else if reading.completion !== 'complete'}
              <p class={estimate === undefined ? 'rate-prompt' : 'rate-caption'}>{reading.completion === 'pending' ? 'The student may have stopped early; mark the reading complete below to get a rate' : 'Mark the reading complete to get a rate'}{estimate !== undefined ? ' from the passage word count.' : '.'}</p>
            {/if}
          {/if}
        </div>
        <div class="time-block">
          <strong>{formatSeconds(activeDuration(reading))}</strong>
          <span>Time spent reading</span>
        </div>
      </div>

      <h2 class="card-title">Recording</h2>
      {#if reading.hasAudio}
        <div class="player">
          <button class="play-button" onclick={togglePlay} disabled={!audioUrl} aria-label={playing ? 'Pause' : 'Play'}>
            {#if playing}<Pause size={22} fill="currentColor" />{:else}<Play size={22} fill="currentColor" style="margin-left:3px" />{/if}
          </button>
          <span class="player-time">{formatSeconds(playhead)} / {formatSeconds(totalSeconds)}</span>
          <span class="grow"></span>
          <button class="button secondary small" onclick={exportAudio} disabled={!audioSamples}><Download size={16} aria-hidden="true" />Export audio</button>
          <button class="button danger small" onclick={() => app.deleteAudio(readingId)}><Trash2 size={16} aria-hidden="true" />Delete audio</button>
        </div>
        {#if audioUrl}
          <audio
            bind:this={audioEl}
            src={audioUrl}
            preload="auto"
            onplay={() => (playing = true)}
            onpause={() => (playing = false)}
            onended={() => ((playing = false), (playhead = 0))}
            ontimeupdate={() => (playhead = audioEl?.currentTime ?? 0)}
          ></audio>
        {/if}
        <Waveform samples={audioSamples} duration={totalSeconds} {bounds} auto={autoBounds(reading)} {playhead} onseek={seek} onchange={(b) => app.setBounds(readingId, b)} />
      {:else}
        <p class="subtext" style="margin-bottom:10px">Audio deleted; the timing and rate are kept.</p>
        <Waveform samples={undefined} duration={totalSeconds} {bounds} auto={autoBounds(reading)} onchange={(b) => app.setBounds(readingId, b)} />
      {/if}

      <div class="timing-line" role="group" aria-label="Timing">
        <span class="timing-text"><strong>{timingLabel}</strong> · {bounds.start.toFixed(1)} s → {bounds.end.toFixed(1)} s · drag the handles to adjust</span>
        {#if reading.timing === 'manual'}
          <button class="text-button" onclick={() => app.resetTiming(readingId)}><RotateCcw size={16} aria-hidden="true" />Reset to auto</button>
        {/if}
      </div>
    </section>

    <div class="review-grid">
      <section class="card">
        <h2>Completion</h2>
        {#if reading.completionAssessment}
          {#if reading.completionAssessment.probablyIncomplete}
            <div class="banner warn-banner"><span class="banner-mark">?</span>The student may not have reached the end of the passage. Listen and decide.</div>
          {:else}
            <p class="subtext" style="margin-bottom:12px">The app heard the student reach the end of the passage.</p>
          {/if}
        {:else}
          <p class="subtext" style="margin-bottom:12px">Counted as complete unless you say otherwise.</p>
        {/if}
        <div class="chips" role="group" aria-label="Completion">
          <button class="chip go" aria-pressed={reading.completion === 'complete'} onclick={() => app.setCompletion(readingId, 'complete')}>Complete</button>
          <button class="chip stop" aria-pressed={reading.completion === 'incomplete'} onclick={() => app.setCompletion(readingId, 'incomplete')}>Incomplete</button>
        </div>
      </section>

      <section class="card">
        <h2>Note</h2>
        <div class="field" style="margin-bottom:0">
          <label for="note" class="sr-only">Note</label>
          <textarea id="note" bind:value={noteText} onblur={() => app.setNote(readingId, noteText)} style="min-height:5rem" placeholder="Anything worth remembering, e.g. new glasses today"></textarea>
        </div>
      </section>

      <section class="card span-2">
        <h2>What the app heard</h2>
        {#if reading.transcript}
          <p class="transcript">{reading.transcript.text}</p>
          <p class="field-help" style="margin-top:10px">A rough transcript, used to match the passage and to estimate a rate when no passage is set.</p>
        {:else}
          <p class="subtext">{analysisLabel || 'No transcript for this reading.'}</p>
        {/if}
      </section>

      {#if reading.completion !== 'discarded'}
        <section class="card span-2">
          <div class="inline-actions">
            {#if confirmingDiscard}
              <span class="confirm-line">Discard this reading? The audio is deleted and it leaves the record.</span>
              <button class="button danger" onclick={discard}>Yes, discard</button>
              <button class="button secondary" onclick={() => (confirmingDiscard = false)}>Keep</button>
            {:else}
              <p class="subtext" style="flex:1 1 240px">A false start or the wrong student? Discarding deletes the audio and drops it from the record.</p>
              <button class="button danger" onclick={() => (confirmingDiscard = true)}><Trash2 size={18} aria-hidden="true" />Discard reading</button>
            {/if}
          </div>
        </section>
      {/if}
    </div>
  {/if}
</main>

{#if changingPassage && reading}
  <PassagePicker
    eyebrow={student ? displayName(student) : 'Reading'}
    title="Which passage was read?"
    groupLabel="Choose passage"
    selectedId={reading.passageId}
    skipLabel="No passage"
    skipHint="Keep the reading without a rate"
    onpick={(id) => {
      changingPassage = false;
      void app.setPassage(readingId, id);
    }}
    onpaste={() => {
      changingPassage = false;
      pastingPassage = true;
    }}
    onimport={() => {
      changingPassage = false;
      passageFileInput?.click();
    }}
    onclose={() => (changingPassage = false)}
  />
{/if}

<!-- The choice of typing or importing happens before the form, as it does on the Passages screen. -->
<input
  bind:this={passageFileInput}
  class="visually-hidden"
  type="file"
  accept={app.importAccept}
  aria-label="Import a passage from a file"
  onchange={(e) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    void takePassageFile(file);
  }}
/>

{#if pastingPassage}
  <Modal title={importedPassage ? 'Check this passage' : 'Type out a passage'} eyebrow="Passage" wide tall onclose={closePassageForm}>
    <PassageForm
      initialTitle={importedPassage?.title ?? ''}
      initialText={importedPassage?.text ?? ''}
      initialSource={importedPassage?.source}
      submitLabel="Save and use for this reading"
      onsubmit={async (title, text, source) => {
        await app.pasteNewPassageFor(readingId, title, text, source);
        closePassageForm();
      }}
      oncancel={closePassageForm}
    />
  </Modal>
{/if}

{#if importFailures.length > 0}
  <ConvertFileHelp
    failures={importFailures}
    onfiles={(files) => void takePassageFile(files[0])}
    onclose={() => (importFailures = [])}
  />
{/if}
