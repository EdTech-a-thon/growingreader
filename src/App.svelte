<script lang="ts">
  import { onMount } from 'svelte';
  import { App, type AppDeps } from './app/store.svelte';
  import { provideApp } from './app/context';
  import TopBar from './ui/TopBar.svelte';
  import Roster from './ui/screens/Roster.svelte';
  import StudentScreen from './ui/screens/Student.svelte';
  import Progress from './ui/screens/Progress.svelte';
  import Start from './ui/screens/Start.svelte';
  import Recording from './ui/screens/Recording.svelte';
  import Done from './ui/screens/Done.svelte';
  import Review from './ui/screens/Review.svelte';
  import Passages from './ui/screens/Passages.svelte';
  import Settings from './ui/screens/Settings.svelte';

  let { deps }: { deps: AppDeps } = $props();

  // svelte-ignore state_referenced_locally
  const app = new App(deps);
  provideApp(app);
  onMount(() => {
    void app.init();
  });

  const studentFacing = $derived(['start', 'recording', 'done', 'progress'].includes(app.screen.name));
</script>

{#if !app.ready}
  <p class="page muted">Loading…</p>
{:else}
  {#if !studentFacing}
    <TopBar />
  {/if}
  {#if app.screen.name === 'roster'}
    <Roster />
  {:else if app.screen.name === 'student'}
    <StudentScreen studentId={app.screen.studentId} />
  {:else if app.screen.name === 'progress'}
    <Progress studentId={app.screen.studentId} />
  {:else if app.screen.name === 'start'}
    <Start studentId={app.screen.studentId} passageId={app.screen.passageId} />
  {:else if app.screen.name === 'recording'}
    <Recording />
  {:else if app.screen.name === 'done'}
    <Done readingId={app.screen.readingId} />
  {:else if app.screen.name === 'review'}
    <Review readingId={app.screen.readingId} />
  {:else if app.screen.name === 'passages'}
    <Passages />
  {:else if app.screen.name === 'settings'}
    <Settings />
  {/if}
{/if}
