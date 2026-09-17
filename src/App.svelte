<script lang="ts">
  import { onMount } from 'svelte';
  import { App, type AppDeps } from './app/store.svelte';
  import { provideApp } from './app/context';
  import TopBar from './ui/TopBar.svelte';
  import BottomNav from './ui/BottomNav.svelte';
  import Roster from './ui/screens/Roster.svelte';
  import StudentScreen from './ui/screens/Student.svelte';
  import Start from './ui/screens/Start.svelte';
  import Recording from './ui/screens/Recording.svelte';
  import Done from './ui/screens/Done.svelte';
  import Review from './ui/screens/Review.svelte';
  import Passages from './ui/screens/Passages.svelte';
  import Settings from './ui/screens/Settings.svelte';
  import SyncDialog from './ui/SyncDialog.svelte';
  import Welcome from './ui/Welcome.svelte';
  import AboutPage from './ui/AboutPage.svelte';
  import PrivacyPage from './ui/PrivacyPage.svelte';
  import Help from './ui/Help.svelte';
  import { consumeArrivalError, describeArrivalError } from './adapters/sheets/broker';
  import { hasBeenWelcomed, markWelcomed } from './app/welcomed';

  let { deps }: { deps: AppDeps } = $props();

  // svelte-ignore state_referenced_locally
  const app = new App(deps);
  provideApp(app);
  let welcomeChecked = $state(false);
  let showWelcome = $state(false);
  let path = $state(typeof window === 'undefined' ? '/' : window.location.pathname);

  function navigate(to: string) {
    path = to;
    window.history.pushState({}, '', to);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  onMount(() => {
    const arrivalError = consumeArrivalError();
    const online = () => app.retrySync();
    const popstate = () => (path = window.location.pathname);
    const click = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest('a[data-app-link]') as HTMLAnchorElement | null;
      if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const url = new URL(anchor.href);
      if (url.origin !== window.location.origin) return;
      event.preventDefault();
      navigate(url.pathname);
    };
    window.addEventListener('online', online);
    window.addEventListener('popstate', popstate);
    document.addEventListener('click', click);
    void app.init().then(async () => {
      const hasLocalWork = app.students.length > 0 || app.passages.length > 0 || app.readings.length > 0;
      showWelcome = !arrivalError && !hasLocalWork && !hasBeenWelcomed();
      if (hasLocalWork) markWelcomed();
      welcomeChecked = true;
      if (arrivalError) {
        markWelcomed();
        await app.openSyncDialog();
        app.syncError = describeArrivalError(arrivalError);
      }
    });
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('popstate', popstate);
      document.removeEventListener('click', click);
      app.dispose();
    };
  });

  function enterApp() {
    markWelcomed();
    showWelcome = false;
  }

  const studentFacing = $derived(['start', 'recording', 'done'].includes(app.screen.name));

  // The speech model loads silently; the teacher only hears about it if it fails.
  let dismissedModelFailure = $state(false);
  const modelToast = $derived(app.model.state === 'failed' && !dismissedModelFailure && !studentFacing);
</script>

<div class="app-shell">
  {#if path === '/about'}
    <AboutPage />
  {:else if path === '/privacy'}
    <PrivacyPage />
  {:else if !app.ready || !welcomeChecked}
    <p class="view muted">Loading…</p>
  {:else if showWelcome}
    <Welcome onstart={enterApp} />
  {:else}
    {#if !studentFacing}
      <TopBar />
    {/if}
    {#if app.screen.name === 'roster'}
      <Roster />
    {:else if app.screen.name === 'student'}
      <StudentScreen studentId={app.screen.studentId} />
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
    {#if !studentFacing}
      <BottomNav />
    {/if}
    {#if app.syncDialogOpen}
      <SyncDialog />
    {/if}
    {#if modelToast && app.model.state === 'failed'}
      <div class="toast" role="alert">
        <span class="toast-icon">!</span>
        <span class="toast-text">The speech model isn't available on this device ({app.model.message}). Everything still works: you choose the passage yourself on review.</span>
        <button class="text-button" onclick={() => app.loadModel()}>Try again</button>
        <button class="toast-dismiss" onclick={() => (dismissedModelFailure = true)} aria-label="Dismiss">×</button>
      </div>
    {/if}
  {/if}
  <Help />
</div>
