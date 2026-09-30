<script lang="ts">
  import { onMount } from 'svelte';
  import Modal from './Modal.svelte';

  /**
   * The first time a teacher opens marking: a welcome that says it is new, then (if they want
   * it) a short tour, one part of the screen at a time. Each step points at an element marked
   * `data-tour="…"` on the marking screen. Whether it has been seen is kept on this device.
   */
  const SEEN_KEY = 'reading-fluency.marking-tour-seen';
  const STEPS = [
    { target: 'passage', title: 'The passage', body: 'The whole passage, as printed. Words highlighted yellow need a listen. Tap any word to work on its sentence.' },
    { target: 'transport', title: 'Playback', body: 'Play and pause, or skip 3 seconds back or forward. Tap the strip to jump anywhere in the recording.' },
    { target: 'waveform', title: 'The recording', body: 'The recording scrolls past the red line. The bracket marks the sentence you are on; striped stretches still need a repair.' },
    { target: 'gutter', title: 'What the app heard', body: 'Each word the app heard, placed where it was said. Drag a word or its edges if it is off, or tap a gap to add a word it missed.' },
    { target: 'sentence', title: 'Repair here', body: 'Tap a stretch highlighted yellow to hear just that bit, or drag across a phrase. Then choose Said the passage or Heard it right, or type what was said with the pencil. Hover a choice to preview it.' },
    { target: 'summary', title: 'Your marks', body: 'Errors so far, and what is left to check. The reading counts once nothing is left and every paragraph has been heard.' },
  ];

  let welcoming = $state(false);
  let step = $state<number | undefined>(undefined);
  let rect = $state<{ top: number; left: number; width: number; height: number } | undefined>(undefined);

  function seen(): boolean {
    try {
      return localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      return false;
    }
  }

  function remember() {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // No storage (a private window, say): the welcome shows again next time.
    }
  }

  onMount(() => {
    if (!seen()) welcoming = true;
  });

  /** Start the tour from the first step. */
  export function start() {
    welcoming = false;
    step = 0;
  }

  function finish() {
    welcoming = false;
    step = undefined;
    remember();
  }

  function measure() {
    if (step === undefined) return;
    const el = document.querySelector(`[data-tour="${STEPS[step].target}"]`);
    if (!el) return (rect = undefined);
    el.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    const r = el.getBoundingClientRect();
    rect = { top: r.top, left: r.left, width: r.width, height: r.height };
  }

  $effect(() => {
    void step;
    measure();
    if (step === undefined) return;
    const again = () => measure();
    window.addEventListener('resize', again);
    window.addEventListener('scroll', again, true);
    // Scrolling into view is smooth; measure once it has settled.
    const timer = setTimeout(again, 350);
    return () => {
      window.removeEventListener('resize', again);
      window.removeEventListener('scroll', again, true);
      clearTimeout(timer);
    };
  });

  const PAD = 6;
  const CARD_W = 340;
  /** The card goes under the part shown if there is room, else above it; never off the side. */
  const card = $derived.by(() => {
    if (!rect) return { top: 120, left: 24 };
    const below = rect.top + rect.height + PAD + 12;
    const top = below + 200 < window.innerHeight ? below : Math.max(12, rect.top - PAD - 12 - 200);
    const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - CARD_W - 12));
    return { top, left };
  });
</script>

<svelte:window onkeydown={(e) => step !== undefined && e.key === 'Escape' && finish()} />

{#if welcoming}
  <Modal title="Marking a reading" eyebrow="New · Beta" onclose={finish}>
    <div class="tour-welcome">
      <p>Marking works out accuracy and words correct per minute by checking what the student said against the passage.</p>
      <p>The app listens first and matches most words for you. Your job is the ones highlighted yellow: hear each one, then say what was said.</p>
      <p class="subtext">This is new, and we are working hard to make it an easy way to mark your students' accuracy. Confused, or have ideas? Write to <a href="mailto:support@teacher.dev">support@teacher.dev</a>. We'd love to hear from you.</p>
      <div class="tour-actions">
        <button class="button primary" onclick={start}>Show me around</button>
        <button class="button secondary" onclick={finish}>Not now</button>
      </div>
    </div>
  </Modal>
{/if}

{#if step !== undefined}
  <div class="tour-veil" role="presentation" onclick={finish}></div>
  {#if rect}
    <div class="tour-spot" style:top="{rect.top - PAD}px" style:left="{rect.left - PAD}px" style:width="{rect.width + PAD * 2}px" style:height="{rect.height + PAD * 2}px" aria-hidden="true"></div>
  {/if}
  <div class="tour-card" role="dialog" aria-modal="true" aria-label={STEPS[step].title} style:top="{card.top}px" style:left="{card.left}px" style:width="{CARD_W}px">
    <p class="tour-count">{step + 1} of {STEPS.length}</p>
    <h2>{STEPS[step].title}</h2>
    <p>{STEPS[step].body}</p>
    <div class="tour-actions">
      {#if step > 0}<button class="button secondary small" onclick={() => (step = step! - 1)}>Back</button>{/if}
      {#if step < STEPS.length - 1}
        <button class="button primary small" onclick={() => (step = step! + 1)}>Next</button>
      {:else}
        <button class="button primary small" onclick={finish}>Done</button>
      {/if}
      <button class="text-button" onclick={finish}>Skip the tour</button>
    </div>
  </div>
{/if}

<style>
  .tour-welcome {
    display: grid;
    gap: 12px;
  }

  .tour-welcome p {
    margin: 0;
  }

  .tour-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .tour-veil {
    position: fixed;
    inset: 0;
    z-index: 60;
  }

  /* The part being shown: a clear window in a dimmed page. */
  .tour-spot {
    position: fixed;
    z-index: 61;
    border-radius: 14px;
    box-shadow: 0 0 0 9999px rgba(20, 32, 24, 0.45);
    outline: 2px solid var(--blue);
    pointer-events: none;
    transition: all 0.2s ease;
  }

  .tour-card {
    position: fixed;
    z-index: 62;
    display: grid;
    gap: 8px;
    padding: 16px 18px;
    border-radius: 14px;
    background: var(--paper);
    box-shadow: 0 16px 40px rgba(20, 32, 24, 0.25);
  }

  .tour-card h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .tour-card p {
    margin: 0;
  }

  .tour-count {
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  @media (max-width: 480px) {
    .tour-card {
      left: 12px !important;
      width: calc(100vw - 24px) !important;
    }
  }
</style>
