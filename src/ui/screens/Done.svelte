<script lang="ts">
  import { useApp } from '../../app/context';
  import LongPress from '../LongPress.svelte';

  let { readingId }: { readingId: string } = $props();
  const app = useApp();
</script>

<main class="stage">
  <h1>Nice work!</h1>
  <p style="font-size:1.4rem">Hand the device back to your teacher.</p>

  <LongPress ms={app.longPressMs} label="Hold to unlock" onlongpress={() => app.go({ name: 'review', readingId })}>Teacher: hold to unlock</LongPress>
</main>
