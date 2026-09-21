<script lang="ts">
  import { useApp } from '../app/context';
  import Modal from './Modal.svelte';
  import { countWords } from '../analysis';
  import { worthConverting } from '../adapters/documents/DocumentImporter';
  import type { ReadFailure, ReadPassage } from './read-files';
  import FileText from '@lucide/svelte/icons/file-text';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Wand from '@lucide/svelte/icons/wand-sparkles';

  let {
    passages,
    failures,
    onhelp,
    onclose,
  }: { passages: ReadPassage[]; failures: ReadFailure[]; onhelp: () => void; onclose: () => void } = $props();

  const app = useApp();

  // svelte-ignore state_referenced_locally
  let rows = $state(passages.map((p) => ({ ...p, include: true })));
  let saving = $state(false);

  const chosen = $derived(rows.filter((r) => r.include));
  const convertible = $derived(failures.filter((f) => worthConverting(f.kind)));

  async function saveAll() {
    saving = true;
    await app.addPassages(chosen.map((r) => ({ title: r.title, text: r.text, source: r.source })));
    onclose();
  }

  const excerpt = (text: string) => (text.length > 160 ? text.slice(0, 160) + '…' : text);
</script>

<Modal title={`Check ${passages.length + failures.length} files`} eyebrow="Passages" wide tall {onclose}>
  <div class="passage-view">
    <p class="field-help">
      Word counts are estimated from each file — headings, page numbers and instructions come across as words. Check them against the paper copies; the count is
      what divides into the time to give the rate. Titles are editable here, the words in Edit afterwards.
    </p>

    <ul class="import-rows">
      {#each rows as row, i (row.fileName + i)}
        <li class="import-row" class:excluded={!row.include}>
          <input type="checkbox" bind:checked={rows[i].include} aria-label={`Import ${row.fileName}`} />
          <span class="import-row-mark"><FileText size={18} aria-hidden="true" /></span>
          <span class="grow">
            <input class="import-row-title" bind:value={rows[i].title} aria-label={`Title for ${row.fileName}`} />
            <small class="import-row-meta">{countWords(row.text)} words, estimated · {row.fileName}</small>
            <small class="import-row-excerpt">{excerpt(row.text)}</small>
          </span>
        </li>
      {/each}

      {#each failures as failure (failure.fileName)}
        <li class="import-row failed">
          <span class="import-row-mark"><TriangleAlert size={18} aria-hidden="true" /></span>
          <span class="grow">
            <strong>{failure.fileName}</strong>
            <small class="import-row-meta">{failure.reason}</small>
          </span>
        </li>
      {/each}
    </ul>

    {#if convertible.length > 0}
      <div class="banner info-banner">
        <span class="banner-mark">i</span>
        <span class="grow">
          {convertible.length === 1 ? 'That file has no text in it to read' : `${convertible.length} of these have no text in them to read`} — a scan is a
          picture of a page. An assistant can turn {convertible.length === 1 ? 'it' : 'them'} into text for you.
        </span>
        <button class="button secondary small" type="button" onclick={onhelp}><Wand size={16} aria-hidden="true" />Show me how</button>
      </div>
    {/if}
  </div>

  <footer class="modal-actions">
    <button class="button secondary" type="button" onclick={onclose}>Cancel</button>
    <button class="button primary" type="button" disabled={saving || chosen.length === 0 || chosen.some((r) => !r.title.trim())} onclick={saveAll}>
      {chosen.length === 1 ? 'Save 1 passage' : `Save ${chosen.length} passages`}
    </button>
  </footer>
</Modal>
