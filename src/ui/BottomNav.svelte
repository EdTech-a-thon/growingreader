<script lang="ts">
  import { useApp } from '../app/context';
  import Users from '@lucide/svelte/icons/users';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import Settings2 from '@lucide/svelte/icons/settings-2';
  const app = useApp();

  const items = [
    { name: 'Roster', icon: Users, screen: { name: 'roster' } as const, matches: ['roster', 'student', 'review'] },
    { name: 'Passages', icon: BookOpen, screen: { name: 'passages' } as const, matches: ['passages'] },
    { name: 'Settings', icon: Settings2, screen: { name: 'settings' } as const, matches: ['settings'] },
  ];
</script>

<nav class="bottom-nav" aria-label="Main">
  {#each items as item (item.name)}
    <button aria-current={item.matches.includes(app.screen.name) ? 'page' : undefined} onclick={() => app.go(item.screen)}>
      <item.icon size={23} aria-hidden="true" />
      <span>{item.name}</span>
    </button>
  {/each}
</nav>
