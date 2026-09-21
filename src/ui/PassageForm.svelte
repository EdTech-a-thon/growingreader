<script lang="ts">
  import { useApp } from '../app/context';
  import { countWords } from '../analysis';
  import { MAX_PASSAGE_WORDS, type PassageSource } from '../domain/types';
  import FileText from '@lucide/svelte/icons/file-text';

  let {
    initialTitle = '',
    initialText = '',
    initialSource,
    excludeId,
    submitLabel = 'Save passage',
    onsubmit,
    oncancel,
  }: {
    initialTitle?: string;
    initialText?: string;
    /** Where the text came from, when it was read out of a file rather than typed. */
    initialSource?: PassageSource;
    excludeId?: string;
    submitLabel?: string;
    onsubmit: (title: string, text: string, source?: PassageSource) => Promise<void> | void;
    oncancel?: () => void;
  } = $props();

  const app = useApp();
  // svelte-ignore state_referenced_locally
  let title = $state(initialTitle);
  // svelte-ignore state_referenced_locally
  let text = $state(initialText);
  const wordCount = $derived(countWords(text));
  const duplicates = $derived(app.nearDuplicatesOf(text, excludeId));
  const tooLong = $derived(wordCount > MAX_PASSAGE_WORDS);

</script>

<form onsubmit={(e) => (e.preventDefault(), onsubmit(title, text, initialSource))}>
  <div class="field">
    <label for="passage-title">Title</label>
    <input id="passage-title" bind:value={title} required />
  </div>
  <div class="field">
    <label for="passage-text">Text</label>
    <textarea id="passage-text" bind:value={text} required></textarea>
    {#if initialSource}
      <p class="count-line">
        {wordCount} {wordCount === 1 ? 'word' : 'words'}, estimated from {initialSource.fileName}.
        <span class="field-help" style="display:inline;font-weight:600">Check it against the paper copy: headings, page numbers and instructions come across as words, and the rate is this count divided by the time.</span>
      </p>
      <p class="import-chip">
        <FileText size={14} aria-hidden="true" />
        <span class="grow">Read from {initialSource.fileName}. The file is not kept; these words are the passage now.</span>
      </p>
    {:else}
      <p class="count-line">
        {wordCount} {wordCount === 1 ? 'word' : 'words'}. <span class="field-help" style="display:inline;font-weight:600">Counted like the paper copy: the title is not counted, and a hyphenated word such as “well-known” counts once.</span>
      </p>
    {/if}
  </div>
  {#if tooLong}
    <div class="banner error-banner" role="alert">
      <span class="banner-mark">!</span>
      <span class="grow">
        That is about {wordCount.toLocaleString()} words — too long for one passage, and too long to reach the Google Sheet. Keep just the part the student
        reads aloud.
      </span>
    </div>
  {/if}
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
    <button class="button primary" type="submit" disabled={!title.trim() || wordCount === 0 || tooLong}>{submitLabel}</button>
  </footer>
</form>
