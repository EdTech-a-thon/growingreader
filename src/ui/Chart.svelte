<script lang="ts">
  import type { Passage, Reading } from '../domain/types';
  import { rate, wordsCorrectPerMinute } from '../domain/rate';
  import { formatDate } from './format';

  let {
    readings,
    passages,
    onselect,
    large = false,
  }: { readings: Reading[]; passages: Passage[]; onselect?: (readingId: string) => void; large?: boolean } = $props();

  const W = 800;
  const H = $derived(large ? 440 : 320);
  const PAD = { left: 56, right: 24, top: 28, bottom: 44 };

  const passageOf = (id: string | undefined) => passages.find((p) => p.id === id);

  /** One point per complete reading with a rate, oldest first. Same-day readings stay separate. */
  const points = $derived(
    readings
      .filter((r) => r.completion === 'complete')
      .map((r) => ({ reading: r, rate: rate(r, passageOf(r.passageId)), wcpm: wordsCorrectPerMinute(r, passageOf(r.passageId)) }))
      .filter((p): p is typeof p & { rate: number } => p.rate !== undefined)
      .sort((a, b) => a.reading.recordedAt - b.reading.recordedAt),
  );

  const yMax = $derived(Math.max(20, ...points.map((p) => p.rate)) * 1.15);

  // Equal spacing per reading rather than by time: repeated same-day readings must stay legible.
  const x = (i: number) => PAD.left + (points.length === 1 ? (W - PAD.left - PAD.right) / 2 : (i / (points.length - 1)) * (W - PAD.left - PAD.right));
  const y = (v: number) => PAD.top + (1 - v / yMax) * (H - PAD.top - PAD.bottom);

  const passageChanges = $derived(
    points.flatMap((p, i) => (i > 0 && p.reading.passageId !== points[i - 1].reading.passageId ? [{ i, title: passageOf(p.reading.passageId)?.title ?? 'Passage' }] : [])),
  );
  const yTicks = $derived([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((yMax * f) / 10) * 10));
  const path = (key: 'rate' | 'wcpm') =>
    points
      .map((p, i) => (p[key] === undefined ? null : `${x(i)},${y(p[key] as number)}`))
      .filter(Boolean)
      .map((s, i) => (i === 0 ? `M${s}` : `L${s}`))
      .join(' ');
</script>

{#if points.length === 0}
  <p class="muted">No complete readings yet. Rates appear here once a reading is reviewed and marked complete.</p>
{:else}
  <svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-label="Rate over time: {points.length} readings">
    {#each yTicks as t (t)}
      <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e6e9ec" />
      <text x={PAD.left - 8} y={y(t) + 4} text-anchor="end" font-size="12" fill="#5b6673">{t}</text>
    {/each}
    <text x={12} y={PAD.top - 10} font-size="12" fill="#5b6673">words per minute</text>

    {#each passageChanges as change (change.i)}
      <line x1={x(change.i) - 14} x2={x(change.i) - 14} y1={PAD.top} y2={H - PAD.bottom} stroke="#b7791f" stroke-dasharray="6 4" />
      <text x={x(change.i) - 10} y={PAD.top + 12} font-size="12" fill="#b7791f">New passage: {change.title}</text>
    {/each}

    <path d={path('rate')} fill="none" stroke="#1f5f8b" stroke-width="2.5" />
    {#if points.some((p) => p.wcpm !== undefined)}
      <path d={path('wcpm')} fill="none" stroke="#2e8b57" stroke-width="2" stroke-dasharray="4 3" />
    {/if}

    {#each points as p, i (p.reading.id)}
      <g class="point" role="button" tabindex="0" aria-label="{formatDate(p.reading.recordedAt)}: {Math.round(p.rate)} words per minute" onclick={() => onselect?.(p.reading.id)} onkeydown={(e) => e.key === 'Enter' && onselect?.(p.reading.id)}>
        <circle cx={x(i)} cy={y(p.rate)} r={large ? 9 : 7} fill="#1f5f8b" />
        {#if p.wcpm !== undefined}
          <circle cx={x(i)} cy={y(p.wcpm)} r={large ? 7 : 5} fill="#2e8b57" />
        {/if}
        <text x={x(i)} y={H - PAD.bottom + 18} text-anchor="middle" font-size="11" fill="#5b6673">{formatDate(p.reading.recordedAt)}</text>
      </g>
    {/each}
  </svg>
  {#if points.some((p) => p.wcpm !== undefined)}
    <p class="small muted">Solid: words per minute. Dashed: words correct per minute (where errors were entered).</p>
  {/if}
{/if}
