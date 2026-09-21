<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  import { lockScroll } from './scroll-lock';

  let {
    title,
    eyebrow,
    wide = false,
    tall = false,
    onclose,
    children,
  }: { title: string; eyebrow?: string; wide?: boolean; /** Fills the viewport: for reading or editing a whole passage. */ tall?: boolean; onclose: () => void; children: Snippet } =
    $props();

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }

  // The page behind a dialog stays put: scrolling it moves what the teacher is not
  // looking at, and on a trackpad it is easy to do by accident while reading a passage.
  onMount(lockScroll);
</script>

<svelte:window {onkeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="modal-backdrop" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal" class:wide class:tall role="dialog" aria-modal="true" aria-label={title}>
    <button class="modal-close" type="button" onclick={onclose} aria-label="Close"><X size={22} /></button>
    <header class="modal-heading">
      {#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
      <h2>{title}</h2>
    </header>
    {@render children()}
  </div>
</div>
