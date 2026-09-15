<script lang="ts">
  import type { Snippet } from 'svelte';

  let { ms, onlongpress, label, children }: { ms: number; onlongpress: () => void; label: string; children: Snippet } = $props();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let holding = $state(false);

  function down(e: Event) {
    e.preventDefault();
    holding = true;
    timer = setTimeout(() => {
      holding = false;
      onlongpress();
    }, ms);
  }
  function up() {
    holding = false;
    if (timer) clearTimeout(timer);
    timer = undefined;
  }
</script>

<button
  class="unlock"
  class:holding
  aria-label={label}
  onpointerdown={down}
  onpointerup={up}
  onpointerleave={up}
  onpointercancel={up}
  oncontextmenu={(e) => e.preventDefault()}
>
  {@render children()}
</button>
