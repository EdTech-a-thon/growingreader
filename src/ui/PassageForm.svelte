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

<form onsubmit={(e) => (e.preventDefault(), onsubmit(title, text))}>
  <div class="field">
    <label for="passage-title">Title</label>
    <input id="passage-title" bind:value={title} required />
  </div>
  <div class="field">
    <label for="passage-text">Text</label>
    <textarea id="passage-text" bind:value={text} required></textarea>
    <p class="count-line">
      {wordCount} {wordCount === 1 ? 'word' : 'words'}. <span class="field-help" style="display:inline;font-weight:600">Counted like the paper copy: the title is not counted, and a hyphenated word such as “well-known” counts once.</span>
    </p>
  </div>
  {#if duplicates.length > 0}
    <div class="banner warn-banner" role="alert">
      <span class="banner-mark">!</span>
      <span class="grow">This looks nearly identical to {duplicates.map((d) => `“${d.title}”`).join(' and ')}. Two near-copies make identification unreliable; edit the existing passage instead if this is a fix.</span>
    </div>
  {/if}
  <footer class="modal-actions" class:single={!oncancel}>
    {#if oncancel}
      <button class="button secondary" type="button" onclick={oncancel}>Cancel</button>
    {/if}
    <button class="button primary" type="submit" disabled={!title.trim() || wordCount === 0}>{submitLabel}</button>
  </footer>
</form>
