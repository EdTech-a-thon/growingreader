<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { useApp } from '../../app/context';
  import LiveWaveform from '../LiveWaveform.svelte';
  import Square from '@lucide/svelte/icons/square';
  const app = useApp();

  // Keep the screen awake for the reading where the platform allows it.
  let wakeLock: { release(): Promise<void> } | undefined;
  onMount(async () => {
    try {
      wakeLock = await (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen');
    } catch {
      /* optional */
    }
  });
  onDestroy(() => {
    void wakeLock?.release();
  });
</script>

<main class="stage">
  <div class="stage-top" aria-live="polite">
    <span class="rec-badge"><span class="pulse" aria-hidden="true"></span>Recording</span>
    <h1>Read the whole passage</h1>
    <p class="lead">When you reach the end, tap Done.</p>
  </div>
  <LiveWaveform recording />
  <button class="big-button stop" onclick={() => app.finishReading()}><Square size={40} aria-hidden="true" fill="currentColor" />Done</button>
</main>
