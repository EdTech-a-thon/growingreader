<script lang="ts">
  import { onMount } from 'svelte';
  import { useApp } from '../app/context';

  /**
   * A scrolling bar chart of microphone level, sampled on a fixed clock so it keeps moving
   * even when the room is quiet. Gives the student something that visibly reacts to their voice.
   */
  let { recording = false, meter = false }: { recording?: boolean; meter?: boolean } = $props();
  const app = useApp();

  const BARS = 72;
  const TICK_MS = 50;
  const W = 720;
  const H = 100;
  let levels = $state<number[]>(new Array(BARS).fill(0));

  onMount(() => {
    const id = setInterval(() => {
      levels = [...levels.slice(1), app.micLevel];
    }, TICK_MS);
    return () => clearInterval(id);
  });

  const quiet = $derived(levels.every((l) => l < 0.02));
  const slot = W / BARS;
  // Square-root curve: a quiet child's voice (peaks ~0.05) still moves the bars visibly.
  const barHeight = (level: number) => Math.max(4, Math.sqrt(Math.min(1, level)) * H);
</script>

<div
  class="live-wave"
  class:recording
  class:quiet
  role={meter ? 'meter' : undefined}
  aria-label={meter ? 'Microphone level' : undefined}
  aria-valuemin={meter ? 0 : undefined}
  aria-valuemax={meter ? 100 : undefined}
  aria-valuenow={meter ? Math.round(app.micLevel * 100) : undefined}
>
  <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true">
    {#each levels as level, i (i)}
      {@const h = barHeight(level)}
      <rect x={i * slot + slot * 0.2} y={(H - h) / 2} width={slot * 0.6} height={h} rx={slot * 0.3} />
    {/each}
  </svg>
</div>
