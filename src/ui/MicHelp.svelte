<script lang="ts">
  import type { MicTrouble } from '../app/store.svelte';
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import X from '@lucide/svelte/icons/x';

  /**
   * What to do when the Start button will not turn green. The arrow is the point of this
   * component: the fix lives in Chrome's own address bar, outside the page, and a teacher
   * with a class waiting has no reason to guess that. So we point at it and name the icon.
   */
  let {
    trouble,
    detail,
    onretry,
    ondismiss,
  }: {
    trouble: MicTrouble;
    detail?: string;
    onretry: () => void;
    ondismiss?: () => void;
  } = $props();

  interface Guidance {
    title: string;
    lead: string;
    steps: string[];
    /** Whether the fix is in Chrome's address bar, and so worth pointing at. */
    pointAtChrome: boolean;
  }

  const CHROME_ICON = 'the sliders icon at the left of the address bar, at the very top of this window';

  const guidance: Record<MicTrouble, Guidance> = {
    quiet: {
      title: 'The microphone is not hearing anything yet',
      lead: 'Start turns green as soon as a voice reaches the microphone. If the bars stay flat while you talk, Chrome is probably listening to the wrong microphone.',
      steps: [
        `Click ${CHROME_ICON}.`,
        'Open the microphone dropdown and pick a different one. Talk while it is open: the bar beside it moves when that microphone hears you.',
        'Close the pop-up and talk again. Still flat? Click Site settings, press Reset permissions, then reload this page.',
      ],
      pointAtChrome: true,
    },
    blocked: {
      title: 'Chrome is blocking the microphone',
      lead: 'This page cannot record until Chrome lets it listen.',
      steps: [
        `Click ${CHROME_ICON}.`,
        'Set Microphone to Allow. If there is no microphone row, click Site settings and press Reset permissions.',
        'Reload this page, then tap Try again.',
      ],
      pointAtChrome: true,
    },
    notfound: {
      title: 'No microphone found',
      lead: 'Chrome cannot see a microphone on this device.',
      steps: [
        'If you are using a headset or USB microphone, plug it back in.',
        'Check that the microphone is not switched off or muted in the device settings.',
        'Tap Try again.',
      ],
      pointAtChrome: false,
    },
    busy: {
      title: 'Another app has the microphone',
      lead: 'Something else on this device is using the microphone, so this page cannot.',
      steps: [
        'Close any other tab or app that records or calls: Meet, Zoom, Teams, a voice recorder.',
        'Tap Try again.',
      ],
      pointAtChrome: false,
    },
    other: {
      title: 'Microphone not available',
      lead: 'Chrome would not hand over the microphone. It is usually a permission that needs resetting.',
      steps: [
        `Click ${CHROME_ICON}.`,
        'Click Site settings, then press Reset permissions.',
        'Reload this page. Chrome will ask for the microphone again: choose Allow.',
      ],
      pointAtChrome: true,
    },
  };

  const g = $derived(guidance[trouble]);
  const isError = $derived(trouble !== 'quiet');
</script>

{#if g.pointAtChrome}
  <div class="chrome-pointer" aria-hidden="true">
    <svg viewBox="0 0 210 130" preserveAspectRatio="xMinYMin meet">
      <path class="shaft" d="M182 122 C 156 96 141 66 138 22" />
      <path class="head" d="M124 40 L137 16 L152 36" />
    </svg>
    <p class="chrome-pointer-label"><SlidersHorizontal size={18} aria-hidden="true" />Microphone settings live up here</p>
  </div>
{/if}

<section class="mic-help" class:error={isError} role={isError ? 'alert' : 'status'} aria-labelledby="mic-help-title">
  <header>
    <h2 id="mic-help-title">{g.title}</h2>
    {#if ondismiss}
      <button type="button" class="mic-help-close" aria-label="Hide microphone help" onclick={ondismiss}><X size={18} aria-hidden="true" /></button>
    {/if}
  </header>
  <p class="mic-help-lead">{g.lead}</p>
  <ol>
    {#each g.steps as step, i (i)}
      <li>{step}</li>
    {/each}
  </ol>
  {#if detail}
    <p class="mic-help-detail">Chrome reported: {detail}</p>
  {/if}
  <div class="mic-help-actions">
    <button type="button" class="button secondary" onclick={onretry}><RotateCcw size={18} aria-hidden="true" />Try again</button>
    <button type="button" class="button secondary" onclick={() => location.reload()}><RefreshCw size={18} aria-hidden="true" />Reload page</button>
  </div>
</section>

<style>
  /* Points past the top-left of the page at Chrome's site-settings icon, which sits just
     inside the address bar. Its exact x shifts with the window, so the arrow leans that
     way and the label names the icon rather than relying on pixel accuracy. */
  .chrome-pointer {
    position: fixed;
    z-index: 26;
    top: 0;
    left: 0;
    width: 210px;
    height: 130px;
    pointer-events: none;
    animation: pointer-nudge 2.4s ease-in-out infinite;
  }

  .chrome-pointer svg {
    position: absolute;
    top: 0;
    left: 0;
    width: 210px;
    height: 130px;
    overflow: visible;
  }

  .chrome-pointer .shaft,
  .chrome-pointer .head {
    fill: none;
    stroke: var(--coral);
    stroke-width: 5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .chrome-pointer .shaft {
    stroke-dasharray: 11 9;
  }

  /* Clear of the shaft, which passes x 170-182 at this height. */
  .chrome-pointer-label {
    position: absolute;
    top: 94px;
    left: 196px;
    margin: 0;
    padding: 7px 12px;
    border: 1px solid #f3cec8;
    border-radius: 999px;
    background: var(--coral-soft);
    color: #a2453a;
    font-size: 0.82rem;
    font-weight: 750;
    line-height: 1.2;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  @keyframes pointer-nudge {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(7px);
    }
  }

  .mic-help {
    width: min(34rem, 100%);
    padding: 16px 18px;
    border: 1px solid #cfe2d1;
    border-radius: 14px;
    background: var(--paper);
    box-shadow: var(--card-shadow);
    text-align: left;
  }

  .mic-help.error {
    border-color: #f0cbd0;
    background: var(--danger-soft);
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  h2 {
    margin: 0 0 6px;
    font-size: 1.05rem;
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  .mic-help.error h2 {
    color: var(--danger);
  }

  .mic-help-close {
    flex: none;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .mic-help-close:hover,
  .mic-help-close:focus-visible {
    color: var(--blue-dark);
    background: var(--blue-soft);
  }

  .mic-help-lead {
    margin: 0 0 10px;
    color: var(--ink);
    font-size: 0.92rem;
    font-weight: 600;
    line-height: 1.5;
  }

  ol {
    margin: 0;
    padding-left: 1.35rem;
    color: var(--ink);
    font-size: 0.92rem;
    line-height: 1.55;
  }

  li + li {
    margin-top: 7px;
  }

  li::marker {
    font-weight: 800;
    color: var(--blue);
  }

  .mic-help-detail {
    margin: 12px 0 0;
    color: var(--muted);
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .mic-help-actions {
    margin-top: 14px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  /* Phone and narrow Chromebook windows: the address bar icon sits much further left,
     and there is no room beside the arrow, so the label goes underneath it. */
  @media (max-width: 680px) {
    .chrome-pointer {
      left: -22px;
      width: 120px;
      height: 96px;
    }

    .chrome-pointer svg {
      width: 120px;
      height: 96px;
    }

    .chrome-pointer-label {
      top: 100px;
      left: 34px;
      white-space: normal;
      max-width: 12rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .chrome-pointer {
      animation: none;
    }
  }
</style>
