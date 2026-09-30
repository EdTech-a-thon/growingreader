<script lang="ts">
  import { PLAYHEAD_LEAD, peaksOf } from './peaks';

  /** The whole reading in miniature, with the stretch the waveform shows boxed. Tap or drag to go there. */
  let {
    samples,
    duration,
    playhead,
    windowSeconds,
    onseek,
  }: {
    samples: Float32Array | undefined;
    duration: number;
    playhead: number;
    /** How many seconds the waveform shows. */
    windowSeconds: number;
    onseek: (seconds: number) => void;
  } = $props();

  const BARS = 240;
  const peaks = $derived(peaksOf(samples, BARS));

  let dragging = false;
  function seekTo(e: PointerEvent) {
    const rect = (e.currentTarget as Element).getBoundingClientRect();
    onseek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration);
  }
</script>

<div
  class="wave-overview"
  role="presentation"
  onpointerdown={(e) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragging = true;
    seekTo(e);
  }}
  onpointermove={(e) => dragging && seekTo(e)}
  onpointerup={() => (dragging = false)}
  onpointercancel={() => (dragging = false)}
>
  <svg viewBox={`0 0 ${BARS} 24`} preserveAspectRatio="none" aria-hidden="true">
    {#each peaks as p, i (i)}
      <rect class="bar" x={i + 0.15} width="0.7" y={12 - Math.max(0.5, p * 11)} height={Math.max(1, p * 22)} />
    {/each}
    {#if duration > 0}
      <rect class="window" x={((playhead - windowSeconds * PLAYHEAD_LEAD) / duration) * BARS} width={(windowSeconds / duration) * BARS} y="0.5" height="23" rx="2" />
    {/if}
  </svg>
</div>

<style>
  .wave-overview {
    height: 28px;
    cursor: pointer;
    touch-action: none;
  }

  svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  .bar {
    fill: #d3dfd5;
  }

  .window {
    fill: rgba(67, 123, 80, 0.14);
    stroke: var(--blue);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }
</style>
