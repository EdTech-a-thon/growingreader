<script lang="ts">
  import { useApp } from '../app/context';
  const app = useApp();

  const items = [
    { name: 'Roster', screen: { name: 'roster' } as const, matches: ['roster', 'student', 'review'] },
    { name: 'Passages', screen: { name: 'passages' } as const, matches: ['passages'] },
    { name: 'Settings', screen: { name: 'settings' } as const, matches: ['settings'] },
  ];

  function nav(e: Event, screen: (typeof items)[number]['screen']) {
    e.preventDefault();
    app.go(screen);
  }
</script>

<nav class="topbar" aria-label="Main">
  {#each items as item (item.name)}
    <a href="#{item.name.toLowerCase()}" aria-current={item.matches.includes(app.screen.name) ? 'page' : undefined} onclick={(e) => nav(e, item.screen)}>{item.name}</a>
  {/each}
  <span class="grow"></span>
  {#if app.processing.length > 0}
    <span class="small muted" role="status">Analysing {app.processing.length} {app.processing.length === 1 ? 'reading' : 'readings'}…</span>
  {/if}
  {#if app.model.state === 'loading'}
    <span class="small muted">Speech model {Math.round(app.model.progress * 100)}%</span>
  {/if}
</nav>
