<script lang="ts">
  import { formatSeconds } from '../domain/rate';
  import type { HeardStatus } from '../domain/review';
  import type { HeardWord } from '../domain/types';
  import { PLAYHEAD_LEAD as LEAD, peaksOf } from './peaks';
  import Check from '@lucide/svelte/icons/check';
  import ZoomIn from '@lucide/svelte/icons/zoom-in';
  import ZoomOut from '@lucide/svelte/icons/zoom-out';

  /**
   * The recording (ADR-0010): a few seconds scrolling past a playhead a third of the way in, so more of
   * what is coming shows than of what has gone; the sentence being worked on is bracketed, and
   * stretches still to repair are striped like roadworks. Under the
   * waveform, what was said: each heard word a box over the stretch of audio it was said in,
   * green where it is the passage word, yellow where it is still to settle, red where it was
   * settled as something else, grey where it is extra (a repeat, a restart). Tap a word to hear
   * it and settle it in the sentence card; drag it, or its edges, to where it was said; tap a gap to
   * add a word that was missed. A label never gets cut off: it shrinks to fit its box, and goes
   * above a box too narrow even for that.
   */
  let {
    samples,
    duration,
    playhead,
    heard,
    statuses,
    edges,
    selected,
    shade,
    sentence,
    repairs,
    windowSeconds = $bindable(4),
    onseek,
    onscrub,
    onselect,
    onretime,
    oninsert,
  }: {
    samples: Float32Array | undefined;
    duration: number;
    playhead: number;
    /** What was said, placed where it was said. */
    heard: HeardWord[];
    statuses: HeardStatus[];
    /** Where speech starts and stops, sorted: what dragged edges snap to. */
    edges: number[];
    /** The heard word tapped. */
    selected: number | undefined;
    /** The stretch of audio the selected spot covers, shaded on the waveform. */
    shade: { start: number; end: number } | undefined;
    /** The sentence being worked on, bracketed. */
    sentence: { start: number; end: number } | undefined;
    /** Stretches still to repair: the spots not yet settled. */
    repairs: Array<{ start: number; end: number }>;
    /** How many seconds are in view, as zoomed: what the overview boxes. */
    windowSeconds: number;
    onseek: (seconds: number) => void;
    onscrub: (scrubbing: boolean) => void;
    onselect: (index: number | undefined) => void;
    onretime: (index: number, start: number, end: number) => void;
    oninsert: (seconds: number, text: string) => void;
  } = $props();

  const ZOOMS = [4, 6, 8, 12, 16];
  let zoom = $state(0);
  $effect(() => {
    windowSeconds = ZOOMS[zoom];
  });
  const BARS_PER_SECOND = 40;
  const WAVE_H = 110;
  /** An edge dragged this close to where speech starts or stops lands on it. */
  const SNAP_SECONDS = 0.06;
  const EDGE_GRAB_PX = 7;
  /** A label's font, in px: full size, and the smallest it shrinks to before it moves above its box. */
  const LABEL_PX = 17;
  const LABEL_MIN_PX = 13;

  let width = $state(0);
  const W = $derived(width || 800);
  const pxPerSecond = $derived(W / windowSeconds);
  const behind = $derived(windowSeconds * LEAD);
  const ahead = $derived(windowSeconds * (1 - LEAD));
  const x = (t: number) => W * LEAD + (t - playhead) * pxPerSecond;
  const inView = (start: number, end: number) => end > playhead - behind - 0.5 && start < playhead + ahead + 0.5;

  const bars = $derived(peaksOf(samples, Math.ceil(duration * BARS_PER_SECOND)));

  const visibleBars = $derived.by(() => {
    const first = Math.max(0, Math.floor((playhead - behind) * BARS_PER_SECOND) - 1);
    const last = Math.min(bars.length - 1, Math.ceil((playhead + ahead) * BARS_PER_SECOND) + 1);
    const out: { x: number; h: number; played: boolean }[] = [];
    for (let b = first; b <= last; b++) {
      const t = b / BARS_PER_SECOND;
      out.push({ x: x(t), h: Math.max(2, bars[b] * (WAVE_H - 10)), played: t < playhead });
    }
    return out;
  });
  const barWidth = $derived(Math.max(1, (pxPerSecond / BARS_PER_SECOND) * 0.7));

  const ticks = $derived.by(() => {
    const out: { x: number; label: string }[] = [];
    const every = windowSeconds > 8 ? 2 : 1;
    for (let s = Math.ceil(playhead - behind); s <= playhead + ahead; s++) {
      if (s < 0 || s > duration || s % every !== 0) continue;
      out.push({ x: x(s), label: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` });
    }
    return out;
  });

  // ---- scrubbing the waveform ----------------------------------------------

  let scrub: { x: number; t: number; moved: boolean } | undefined;

  function scrubDown(e: PointerEvent) {
    if (e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    scrub = { x: e.clientX, t: playhead, moved: false };
    onscrub(true);
  }
  function scrubMove(e: PointerEvent) {
    if (!scrub) return;
    const dx = e.clientX - scrub.x;
    if (Math.abs(dx) > 3) scrub.moved = true;
    if (scrub.moved) onseek(scrub.t - dx / pxPerSecond);
  }
  function scrubUp(e: PointerEvent) {
    if (!scrub) return;
    // A tap without a drag goes to the moment under the pointer.
    if (!scrub.moved) {
      const rect = (e.currentTarget as Element).getBoundingClientRect();
      onseek(scrub.t + (e.clientX - rect.left - rect.width * LEAD) / pxPerSecond);
    }
    scrub = undefined;
    onscrub(false);
  }

  // ---- what was said: fitting, dragging, editing ------------------------------------

  /** How a label fits its box: inside at some size, or (too narrow even at the smallest) above it. */
  function fit(text: string, widthPx: number): { px: number; above: boolean } {
    // An estimate of the label's width (about 0.56 em a character), less the box's padding.
    const room = widthPx - 10;
    const px = Math.min(LABEL_PX, room / (Math.max(1, text.length) * 0.56));
    return px >= LABEL_MIN_PX ? { px, above: false } : { px: 15, above: true };
  }

  type Mode = 'move' | 'start' | 'end';
  let drag = $state<{ index: number; mode: Mode; x0: number; start0: number; end0: number; moved: boolean; start: number; end: number } | undefined>(undefined);

  function snap(t: number, free: boolean): number {
    if (free) return t;
    let best = t;
    let distance = SNAP_SECONDS;
    for (const edge of edges) {
      const d = Math.abs(edge - t);
      if (d < distance) ((distance = d), (best = edge));
    }
    return best;
  }

  function wordDown(e: PointerEvent, index: number) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture?.(e.pointerId);
    const rect = el.getBoundingClientRect();
    const mode: Mode = e.clientX - rect.left < EDGE_GRAB_PX ? 'start' : rect.right - e.clientX < EDGE_GRAB_PX ? 'end' : 'move';
    const w = heard[index];
    drag = { index, mode, x0: e.clientX, start0: w.start, end0: w.end, moved: false, start: w.start, end: w.end };
  }

  function wordMove(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.x0;
    if (!drag.moved && Math.abs(dx) < 3) return;
    const dt = dx / pxPerSecond;
    const free = e.altKey;
    if (drag.mode === 'move') {
      const start = snap(drag.start0 + dt, free);
      drag = { ...drag, moved: true, start, end: start + (drag.end0 - drag.start0) };
    } else if (drag.mode === 'start') drag = { ...drag, moved: true, start: Math.min(snap(drag.start0 + dt, free), drag.end0 - 0.04) };
    else drag = { ...drag, moved: true, end: Math.max(snap(drag.end0 + dt, free), drag.start0 + 0.04) };
  }

  function wordUp() {
    if (!drag) return;
    const d = drag;
    drag = undefined;
    if (d.moved) onretime(d.index, d.start, d.end);
    else {
      adding = undefined;
      onselect(d.index);
    }
  }

  const timeOf = (i: number) => (drag?.index === i ? { start: drag.start, end: drag.end } : heard[i]);

  /** Tapping a gap in the gutter: add a word there. */
  let adding = $state<number | undefined>(undefined);
  function gutterDown(e: PointerEvent) {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    const rect = (e.currentTarget as Element).getBoundingClientRect();
    adding = Math.max(0, Math.min(duration, playhead + (e.clientX - rect.left - W * LEAD) / pxPerSecond));
    onselect(undefined);
    draft = '';
  }

  let draft = $state('');
  let editor = $state<HTMLInputElement | undefined>(undefined);
  $effect(() => {
    if (adding !== undefined) editor?.focus();
  });

  function save() {
    if (adding === undefined) return;
    const at = adding;
    adding = undefined;
    if (draft.trim()) oninsert(at, draft);
  }

  const STATUS_LABEL: Record<HeardStatus, string> = { match: '', open: ', to check', wrong: ', not the passage word', extra: ', extra' };
</script>

<svelte:window onpointermove={wordMove} onpointerup={wordUp} onpointercancel={wordUp} />

<div class="timeline">
  <div class="timeline-zoom">
    <button class="icon-button" onclick={() => (zoom = Math.max(0, zoom - 1))} disabled={zoom === 0} aria-label="Zoom in"><ZoomIn size={16} /></button>
    <span class="timeline-window">{windowSeconds} s</span>
    <button class="icon-button" onclick={() => (zoom = Math.min(ZOOMS.length - 1, zoom + 1))} disabled={zoom === ZOOMS.length - 1} aria-label="Zoom out"><ZoomOut size={16} /></button>
  </div>

  <div class="timeline-main" bind:clientWidth={width}>
    <div
      class="timeline-wave"
      data-tour="waveform"
      role="slider"
      tabindex="-1"
      aria-label="Position in the recording"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(playhead)}
      aria-valuetext={`${formatSeconds(playhead)} of ${formatSeconds(duration)}`}
      onpointerdown={scrubDown}
      onpointermove={scrubMove}
      onpointerup={scrubUp}
      onpointercancel={scrubUp}
    >
      <svg viewBox={`0 0 ${W} ${WAVE_H + 16}`} aria-hidden="true">
        <defs>
          <pattern id="roadworks" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="10" height="10" class="roadworks-base" />
            <rect width="4" height="10" class="roadworks-stripe" />
          </pattern>
        </defs>
        {#each repairs as r, i (i)}
          {#if inView(r.start, r.end)}
            <rect class="repair" x={x(r.start)} width={Math.max(3, (r.end - r.start) * pxPerSecond)} y="0" height={WAVE_H} fill="url(#roadworks)" />
          {/if}
        {/each}
        {#if sentence && inView(sentence.start, sentence.end)}
          <rect class="sentence-band" x={x(sentence.start)} width={Math.max(2, (sentence.end - sentence.start) * pxPerSecond)} y="0" height={WAVE_H} />
          <path class="sentence-edge" d={`M ${x(sentence.start) + 6} 2 H ${x(sentence.start)} V ${WAVE_H - 2} H ${x(sentence.start) + 6}`} />
          <path class="sentence-edge" d={`M ${x(sentence.end) - 6} 2 H ${x(sentence.end)} V ${WAVE_H - 2} H ${x(sentence.end) - 6}`} />
        {/if}
        {#if shade && inView(shade.start, shade.end)}
          <rect class="shade" x={x(shade.start)} width={Math.max(2, (shade.end - shade.start) * pxPerSecond)} y="0" height={WAVE_H} />
        {/if}
        {#each ticks as tick (tick.label)}
          <line class="tick" x1={tick.x} x2={tick.x} y1={WAVE_H + 1} y2={WAVE_H + 5} />
          <text class="tick-label" x={tick.x} y={WAVE_H + 14}>{tick.label}</text>
        {/each}
        {#each visibleBars as bar, i (i)}
          <rect class="bar" class:played={bar.played} x={bar.x - barWidth / 2} width={barWidth} y={(WAVE_H - bar.h) / 2} height={bar.h} rx={barWidth / 2} />
        {/each}
      </svg>
    </div>

    <div class="timeline-gutter" role="group" aria-label="What was said" data-tour="gutter" onpointerdown={gutterDown}>
      {#each heard as w, i (i)}
        {@const t = timeOf(i)}
        {#if inView(t.start, t.end)}
          {@const width = Math.max(6, (t.end - t.start) * pxPerSecond)}
          {@const label = fit(w.text, width)}
          <button
            class="gutter-word"
            data-status={statuses[i]}
            class:selected={selected === i}
            class:dragging={drag?.index === i}
            class:manual={w.timing === 'manual'}
            style:left="{x(t.start)}px"
            style:width="{width}px"
            aria-label={`${w.text}${STATUS_LABEL[statuses[i]]}`}
            onpointerdown={(e) => wordDown(e, i)}
          >{#if !label.above}<span style:font-size="{label.px}px">{w.text}</span>{/if}</button>
          {#if label.above}
            <span class="gutter-label" data-status={statuses[i]} style:left="{x(t.start) + width / 2}px" aria-hidden="true">{w.text}</span>
          {/if}
        {/if}
      {/each}
      {#if adding !== undefined && inView(adding, adding)}
        <span class="gutter-adding" style:left="{x(adding)}px" aria-hidden="true"></span>
      {/if}
    </div>

    <div class="timeline-playhead" style:left="{W * LEAD}px" aria-hidden="true"></div>
  </div>

  {#if adding !== undefined}
    <form
      class="gutter-edit"
      onsubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label>
        <span>Add what was said here</span>
        <input bind:this={editor} bind:value={draft} onkeydown={(e) => e.key === 'Escape' && (adding = undefined)} autocomplete="off" spellcheck="false" />
      </label>
      <button class="button small" type="submit"><Check size={14} aria-hidden="true" />Add</button>
      <button class="text-button" type="button" onclick={() => (adding = undefined)}>Cancel</button>
    </form>
  {/if}
</div>

<style>
  .timeline {
    display: grid;
    gap: 8px;
  }

  .timeline svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  .timeline-zoom {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 4px;
  }

  .timeline-window {
    min-width: 2.6em;
    color: var(--muted);
    font-size: 0.8rem;
    text-align: center;
  }

  .timeline-main {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--bg);
  }

  .timeline-wave {
    height: 126px;
    cursor: grab;
    touch-action: none;
  }

  .timeline-wave:active {
    cursor: grabbing;
  }

  .bar {
    fill: #c3d3c6;
  }

  .bar.played {
    fill: var(--blue);
  }

  .tick {
    stroke: var(--muted);
  }

  .tick-label {
    fill: var(--muted);
    font-size: 11px;
    text-anchor: middle;
  }

  /* Room above the boxes for labels too long for theirs. */
  .timeline-gutter {
    position: relative;
    height: 76px;
    border-top: 1px solid var(--line);
    background: var(--paper);
    cursor: copy;
  }

  .gutter-label {
    position: absolute;
    top: 3px;
    transform: translateX(-50%);
    padding: 0 3px;
    border-radius: 4px;
    background: var(--paper);
    color: var(--ink);
    font-size: 15px;
    line-height: 20px;
    white-space: nowrap;
    pointer-events: none;
  }

  .gutter-label[data-status='open'] {
    color: var(--amber);
  }

  .gutter-label[data-status='wrong'] {
    color: var(--danger);
  }

  .gutter-adding {
    position: absolute;
    top: 28px;
    height: 42px;
    width: 2px;
    background: var(--blue);
  }

  .gutter-edit {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 8px;
  }

  .gutter-edit label {
    display: grid;
    gap: 2px;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--muted);
  }

  .gutter-edit input {
    min-width: 14em;
    font: inherit;
    font-size: 1rem;
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: 8px;
  }

  .gutter-word {
    position: absolute;
    top: 26px;
    height: 44px;
    padding: 0 4px;
    border: 1px solid #9cc0a3;
    border-radius: 6px;
    background: var(--green-soft);
    color: var(--ink);
    font: inherit;
    font-size: 0.85rem;
    cursor: grab;
    touch-action: none;
    overflow: hidden;
    white-space: nowrap;
    text-align: left;
  }

  /* The edges are where the word is fitted to the audio. */
  .gutter-word::before,
  .gutter-word::after {
    content: '';
    position: absolute;
    top: 4px;
    bottom: 4px;
    width: 3px;
    border-radius: 2px;
    background: currentColor;
    opacity: 0.3;
    cursor: ew-resize;
  }

  .gutter-word::before {
    left: 1px;
  }

  .gutter-word::after {
    right: 1px;
  }

  .gutter-word span {
    display: block;
    pointer-events: none;
    padding: 0 2px;
    text-align: center;
    white-space: nowrap;
  }

  .gutter-word.manual {
    border-style: dashed;
  }

  .gutter-word[data-status='open'] {
    border-color: #e0b04c;
    background: var(--yellow-soft);
  }

  .gutter-word[data-status='wrong'] {
    border-color: #f2c7cd;
    background: var(--danger-soft);
    color: var(--danger);
  }

  .gutter-word[data-status='extra'] {
    border-color: var(--line);
    background: var(--bg);
    color: var(--muted);
  }

  .roadworks-base {
    fill: rgba(224, 176, 76, 0.1);
  }

  .roadworks-stripe {
    fill: rgba(224, 176, 76, 0.28);
  }

  .sentence-band {
    fill: rgba(47, 111, 179, 0.05);
  }

  .sentence-edge {
    fill: none;
    stroke: var(--blue);
    stroke-width: 2;
  }

  .shade {
    fill: rgba(224, 176, 76, 0.18);
  }

  .gutter-word.selected {
    border-color: var(--blue);
    box-shadow: 0 0 0 2px var(--blue-soft);
  }

  .gutter-word.dragging {
    cursor: grabbing;
    opacity: 0.85;
  }

  .timeline-playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: var(--danger);
    pointer-events: none;
    z-index: 2;
  }
</style>
