<script lang="ts">
  import { useApp } from '../app/context';
  import { countWords } from '../analysis';

  let {
    initialTitle = '',
    initialText = '',
    excludeId,
    submitLabel = 'Save passage',
    onsubmit,
    oncancel,
  }: {
    initialTitle?: string;
    initialText?: string;
    excludeId?: string;
    submitLabel?: string;
    onsubmit: (title: string, text: string) => Promise<void> | void;
    oncancel?: () => void;
  } = $props();

  const app = useApp();
  // svelte-ignore state_referenced_locally
  let title = $state(initialTitle);
  // svelte-ignore state_referenced_locally
  let text = $state(initialText);
  const wordCount = $derived(countWords(text));
  const duplicates = $derived(app.nearDuplicatesOf(text, excludeId));
</script>

<form class="card" onsubmit={(e) => (e.preventDefault(), onsubmit(title, text))}>
  <div class="field">
    <label for="passage-title">Title</label>
    <input id="passage-title" bind:value={title} required />
  </div>
  <div class="field">
    <label for="passage-text">Text</label>
    <textarea id="passage-text" bind:value={text} required></textarea>
    <p class="small muted">
      {wordCount} {wordCount === 1 ? 'word' : 'words'}. Counted like the paper copy: the title is not counted, and a hyphenated word such as “well-known” counts once.
    </p>
  </div>
  {#if duplicates.length > 0}
    <div class="notice" role="alert">
      This looks nearly identical to {duplicates.map((d) => `“${d.title}”`).join(' and ')}. Two near-copies make identification unreliable; edit the existing passage instead if this is a fix.
    </div>
  {/if}
  <div class="row">
    <button class="primary" type="submit" disabled={!title.trim() || wordCount === 0}>{submitLabel}</button>
    {#if oncancel}
      <button type="button" onclick={oncancel}>Cancel</button>
    {/if}
  </div>
</form>
