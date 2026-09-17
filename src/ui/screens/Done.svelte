<script lang="ts">
  import { useApp } from '../../app/context';
  import LongPress from '../LongPress.svelte';

  let { readingId }: { readingId: string } = $props();
  const app = useApp();
</script>

<main class="stage">
  <div class="stage-top">
    <div class="empty-icon" style="background:var(--green-soft)">🎉</div>
    <h1>Nice work!</h1>
    <p class="lead" style="font-size:1.4rem">Hand the device back to your teacher.</p>
  </div>

  <LongPress ms={app.longPressMs} label="Hold to unlock" onlongpress={() => app.go({ name: 'review', readingId })}>Teacher: hold to unlock</LongPress>
</main>
