<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { useApp } from '../../app/context';
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
  <div class="row" aria-live="polite">
    <span class="pulse" aria-hidden="true"></span>
    <h1>Recording — read the whole passage</h1>
  </div>
  <p class="muted">When you reach the end, tap Done.</p>
  <button class="big-button stop" onclick={() => app.finishReading()}>Done</button>
</main>
