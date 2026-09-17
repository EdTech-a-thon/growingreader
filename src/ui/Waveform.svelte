<script lang="ts">
  import type { Bounds } from '../domain/types';
  import { clampBounds, MIN_BOUNDS_GAP } from '../domain/rate';

  /**
   * The whole recording as peaks with the reading's bounds drawn over it: a start and an end
   * handle the teacher drags (or nudges with the arrow keys), the outside shaded. Tap to seek.
   */
  let {
    samples,
    duration,
    bounds,
    auto,
    playhead = 0,
    onseek,
    onchange,
  }: {
    samples: Float32Array | undefined;
    duration: number;
    /** The bounds in force. */
    bounds: Bounds;
    /** The automatic bounds, drawn faintly when the handles have moved away from them. */
    auto?: Bounds;
    playhead?: number;
    onseek?: (seconds: number) => void;
    /** Called once per drag or key press with the new bounds. */
    onchange?: (bounds: Bounds) => void;
  } = $props();

  const EDGES = ['start', 'end'] as const;
  const W = 1000;
  const H = 150;
  const BUCKETS = 500;
  const slot = W / BUCKETS;

  /** Peak amplitude per bucket, normalised so the loudest bucket fills the height. */
  const peaks = $derived.by(() => {
    if (!samples || samples.length === 0) return [];
    const per = samples.length / BUCKETS;
    const out = new Array<number>(BUCKETS);
    let max = 0;
    for (let b = 0; b < BUCKETS; b++) {
      const start = Math.floor(b * per);
      const end = Math.min(samples.length, Math.floor((b + 1) * per));
      let peak = 0;
      for (let i = start; i < end; i++) {
        const a = Math.abs(samples[i]);
        if (a > peak) peak = a;
      }
      out[b] = peak;
      if (peak > max) max = peak;
    }
    return max > 0 ? out.map((p) => p / max) : out;
  });

  // While a handle is being dragged the waveform follows the pointer; the reading is only told on release.
  let dragging = $state<{ edge: 'start' | 'end'; bounds: Bounds } | undefined>(undefined);
  const shown = $derived(dragging?.bounds ?? bounds);
  const autoDiffers = $derived(!!auto && (Math.abs(auto.start - shown.start) > 0.05 || Math.abs(auto.end - shown.end) > 0.05));

  const fraction = (seconds: number) => (duration > 0 ? Math.max(0, Math.min(1, seconds / duration)) : 0);
  const x = (seconds: number) => fraction(seconds) * W;
  const inside = (b: number) => {
    const t = ((b + 0.5) / BUCKETS) * duration;
    return t >= shown.start && t <= shown.end;
  };

  let el: HTMLDivElement | undefined;
  function secondsAt(clientX: number): number | undefined {
    if (!el || duration <= 0) return undefined;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return undefined;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration;
  }

  function seek(e: PointerEvent) {
    const seconds = secondsAt(e.clientX);
    if (seconds !== undefined) onseek?.(seconds);
  }

  function moved(edge: 'start' | 'end', seconds: number): Bounds {
    const next = edge === 'start' ? { start: Math.min(seconds, shown.end - MIN_BOUNDS_GAP), end: shown.end } : { start: shown.start, end: Math.max(seconds, shown.start + MIN_BOUNDS_GAP) };
    return clampBounds(next, duration);
  }

  function grab(edge: 'start' | 'end', e: PointerEvent) {
    e.stopPropagation();
    if (!onchange) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging = { edge, bounds: shown };
  }

  function drag(e: PointerEvent) {
    if (!dragging) return;
    const seconds = secondsAt(e.clientX);
    if (seconds !== undefined) dragging = { edge: dragging.edge, bounds: moved(dragging.edge, seconds) };
  }

  function release() {
    if (!dragging) return;
    const next = dragging.bounds;
    dragging = undefined;
    onchange?.(next);
  }

  function nudge(edge: 'start' | 'end', e: KeyboardEvent) {
    if (!onchange) return;
    const step = e.shiftKey ? 1 : 0.1;
    const current = edge === 'start' ? shown.start : shown.end;
    let target: number | undefined;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') target = current - step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') target = current + step;
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = duration;
    if (target === undefined) return;
    e.preventDefault();
    onchange(moved(edge, Math.round(target * 10) / 10));
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="waveform" class:draggable={!!onchange} bind:this={el} onpointerdown={seek}>
  {#if peaks.length === 0}
    <div class="waveform-empty">{samples ? '' : 'Waveform appears once the audio loads.'}</div>
  {:else}
    <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true">
      {#each peaks as peak, i (i)}
        {@const h = Math.max(2, peak * (H - 16))}
        <rect class="bar" class:inside={inside(i)} x={i * slot + slot * 0.15} y={(H - h) / 2} width={slot * 0.7} height={h} />
      {/each}
      <rect class="shade" x="0" y="0" width={x(shown.start)} height={H} />
      <rect class="shade" x={x(shown.end)} y="0" width={W - x(shown.end)} height={H} />
      {#if auto && autoDiffers}
        <line class="marker faint" x1={x(auto.start)} x2={x(auto.start)} y1="0" y2={H} />
        <line class="marker faint" x1={x(auto.end)} x2={x(auto.end)} y1="0" y2={H} />
      {/if}
      {#if playhead > 0}
        <line class="playhead" x1={x(playhead)} x2={x(playhead)} y1="0" y2={H} />
      {/if}
    </svg>
  {/if}
  {#each EDGES as edge (edge)}
    {@const seconds = edge === 'start' ? shown.start : shown.end}
    <div
      class="handle {edge}"
      class:active={dragging?.edge === edge}
      style="left:{fraction(seconds) * 100}%"
      role="slider"
      tabindex={onchange ? 0 : -1}
      aria-label={edge === 'start' ? 'Start of reading' : 'End of reading'}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration * 10) / 10}
      aria-valuenow={Math.round(seconds * 10) / 10}
      aria-valuetext="{seconds.toFixed(1)} s"
      aria-disabled={!onchange}
      onpointerdown={(e) => grab(edge, e)}
      onpointermove={drag}
      onpointerup={release}
      onpointercancel={release}
      onkeydown={(e) => nudge(edge, e)}
    >
      <span class="handle-line"></span>
      <span class="handle-grip"></span>
      <span class="handle-time">{seconds.toFixed(1)} s</span>
    </div>
  {/each}
</div>
