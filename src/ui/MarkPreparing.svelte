<script lang="ts">
  import type { AlignmentState } from '../app/store.svelte';
  import Check from '@lucide/svelte/icons/check';

  /**
   * What marking waits for, step by step, before it shows anything. Each step is one real stage
   * (see STEPS), so a teacher's "stuck on step 3" says what to look into; the words are for
   * teachers. The bars follow the stages' own reports; between reports, timing moves at the pace
   * this device managed last time (or, the first time, the pace so far), so it never sits still.
   */
  let { analysing, alignment }: { analysing: boolean; alignment: AlignmentState | undefined } = $props();

  /** The size of the word-timing download, for the progress line. */
  const MODEL_MB = 95;

  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 200);
    return () => clearInterval(timer);
  });

  const running = $derived(alignment?.state === 'running' ? alignment : undefined);
  /** The step under way. Each is one real stage, so "stuck on step 3" names what to look into. */
  const phase = $derived(
    analysing ? 'transcribe' : alignment?.state === 'done' || running?.phase === 'timing' || running?.phase === 'matching' ? 'timing' : 'setup',
  );

  // When placing started, and when the model last said how far it had got, as this screen saw them.
  let timingFrom: number | undefined;
  let lastFraction = 0;
  let lastAt = 0;
  $effect(() => {
    if (running?.phase !== 'timing') return;
    const t = Date.now();
    timingFrom ??= t;
    if (running.fraction !== lastFraction) ((lastFraction = running.fraction), (lastAt = t));
  });

  /** How far placing has got, moving between reports; undefined until there is a pace to go on. */
  const placing = $derived.by((): { fraction: number; secondsLeft?: number } | undefined => {
    // Read the clock first: the start and last report are plain values, so the ticking clock is what keeps this moving.
    const at = now;
    if (!running || running.phase !== 'timing' || timingFrom === undefined) return undefined;
    const elapsed = (at - timingFrom) / 1000;
    if (running.expectedSeconds) {
      const fraction = Math.max(running.fraction, Math.min(0.97, elapsed / running.expectedSeconds));
      return { fraction, secondsLeft: Math.max(0, running.expectedSeconds - elapsed) };
    }
    const soFar = (lastAt - timingFrom) / 1000;
    if (running.fraction <= 0 || soFar <= 0) return undefined;
    const rate = running.fraction / soFar;
    const fraction = Math.min(0.97, running.fraction + ((at - lastAt) / 1000) * rate);
    return { fraction, secondsLeft: (1 - fraction) / rate };
  });

  const loading = $derived(running?.phase === 'download' && running.fraction > 0 ? running.fraction : undefined);

  function left(seconds: number | undefined): string {
    if (seconds === undefined) return '';
    if (seconds < 5) return 'almost done';
    return `about ${seconds < 60 ? `${Math.round(seconds / 5) * 5} seconds` : `${Math.round(seconds / 60)} min`} left`;
  }

  const STEPS = [
    // The speech recogniser (Whisper), run when the recording was made.
    { key: 'transcribe', title: 'Writing down what was said', detail: 'Listening to the whole recording and writing down each word.' },
    // Reading the recording from this device, then fetching or loading the word-timing model (wav2vec2).
    { key: 'setup', title: 'Getting word timing ready', detail: 'The first time on this device it downloads about 95 MB; after that it is quick.' },
    // wav2vec2 run over the recording, in chunks; then alignHeard, matching to the passage and saving ("Finishing up…").
    { key: 'timing', title: 'Finding when each word was said', detail: 'Listening again, closely, for where each word starts and ends.' },
  ] as const;
  const order = (key: string) => STEPS.findIndex((s) => s.key === key);
</script>

<section class="card mark-preparing" aria-label="Getting the reading ready" aria-live="polite">
  <h2>Getting the reading ready to mark</h2>
  <ol>
    {#each STEPS as step (step.key)}
      {@const state = order(step.key) < order(phase) ? 'done' : step.key === phase ? 'active' : 'waiting'}
      <li data-state={state}>
        <span class="step-mark" aria-hidden="true">{#if state === 'done'}<Check size={14} />{:else}{order(step.key) + 1}{/if}</span>
        <div class="step-body">
          <strong>{step.title}</strong>
          {#if state === 'active'}
            <span class="subtext">{step.detail}</span>
            {@const fraction = step.key === 'timing' ? (running?.phase === 'matching' || alignment?.state === 'done' ? 1 : placing?.fraction) : step.key === 'setup' ? loading : undefined}
            <div
              class="progress"
              class:indeterminate={fraction === undefined}
              role="progressbar"
              aria-label={step.title}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={fraction === undefined ? undefined : Math.round(fraction * 100)}
            >
              <span style:width={fraction === undefined ? undefined : `${fraction * 100}%`}></span>
            </div>
            <span class="subtext progress-note">
              {#if step.key === 'setup' && running?.phase === 'reading'}
                Opening the recording…
              {:else if step.key === 'setup' && loading !== undefined && loading >= 1}
                Starting it up on this device…
              {:else if step.key === 'setup' && loading !== undefined}
                Downloading: {Math.round(loading * MODEL_MB)} of {MODEL_MB} MB
              {:else if step.key === 'setup'}
                Loading from this device…
              {:else if step.key === 'timing' && (running?.phase === 'matching' || alignment?.state === 'done')}
                Finishing up…
              {:else if step.key === 'timing' && placing}
                {Math.round(placing.fraction * 100)}% · {left(placing.secondsLeft)}
              {:else if step.key === 'timing'}
                Working out how long this takes on this device…
              {/if}
            </span>
          {/if}
        </div>
      </li>
    {/each}
  </ol>
</section>

<style>
  .mark-preparing {
    max-width: 560px;
    margin: 40px auto;
  }

  h2 {
    margin: 0 0 16px;
    font-size: 1.1rem;
  }

  ol {
    display: grid;
    gap: 14px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  li[data-state='waiting'] {
    color: var(--muted);
  }

  .step-mark {
    display: grid;
    flex: none;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 1.5px solid currentColor;
    font-size: 0.8rem;
    font-weight: 800;
  }

  li[data-state='done'] .step-mark {
    border-color: var(--green);
    background: var(--green);
    color: white;
  }

  li[data-state='active'] .step-mark {
    border-color: var(--blue);
    color: var(--blue);
  }

  .step-body {
    display: grid;
    flex: 1;
    gap: 4px;
  }

  .progress {
    position: relative;
    height: 8px;
    margin-top: 4px;
    overflow: hidden;
    border-radius: 4px;
    background: var(--line);
  }

  .progress span {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 4px;
    background: var(--blue);
    transition: width 0.2s linear;
  }

  /* No pace to go on yet: a band sweeping across, not a made-up number. */
  .progress.indeterminate span {
    width: 30%;
    animation: sweep 1.4s ease-in-out infinite;
  }

  @keyframes sweep {
    from {
      left: -30%;
    }
    to {
      left: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .progress.indeterminate span {
      animation: none;
      width: 100%;
      opacity: 0.4;
    }
  }

  .progress-note {
    font-variant-numeric: tabular-nums;
  }
</style>
