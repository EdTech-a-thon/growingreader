<script lang="ts">
  import { useApp } from '../../app/context';
  import PassageForm from '../PassageForm.svelte';
  import PassagePreview from '../PassagePreview.svelte';
  import PassageImportList from '../PassageImportList.svelte';
  import ConvertFileHelp from '../ConvertFileHelp.svelte';
  import { readPassageFiles, type ReadFailure, type ReadPassage } from '../read-files';
  import Modal from '../Modal.svelte';
  import { isDiscarded } from '../../domain/types';
  import Plus from '@lucide/svelte/icons/plus';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import FileText from '@lucide/svelte/icons/file-text';
  import FileUp from '@lucide/svelte/icons/file-up';
  import Keyboard from '@lucide/svelte/icons/keyboard';

  const app = useApp();
  let adding = $state(false);
  let editingId = $state<string | undefined>(undefined);
  let confirmDeleteId = $state<string | undefined>(undefined);
  let previewingId = $state<string | undefined>(undefined);
  /** Read out of dropped or chosen files: one goes to the full form, several to the list. */
  let read = $state<ReadPassage[]>([]);
  let failures = $state<ReadFailure[]>([]);
  let reading = $state(false);
  let showingHelp = $state(false);
  let menuOpen = $state(false);
  /** Depth counter: dragging over a child fires dragleave on the parent. */
  let dragDepth = $state(0);
  let fileInput = $state<HTMLInputElement | undefined>(undefined);

  const readingsUsing = (passageId: string) => app.readings.filter((r) => r.passageId === passageId && !isDiscarded(r)).length;
  const editing = $derived(app.passage(editingId));
  const previewing = $derived(app.passage(previewingId));
  const dragging = $derived(dragDepth > 0);
  const single = $derived(read.length === 1 && failures.length === 0 ? read[0] : undefined);

  async function take(files: FileList | File[] | null | undefined) {
    const list = [...(files ?? [])];
    if (list.length === 0) return;
    reading = true;
    const result = await readPassageFiles(app, list);
    reading = false;
    // Files arriving while rows are already up are added to them, not swapped for them:
    // a converted file comes back to a list the teacher is part-way through checking.
    read = [...read, ...result.passages];
    failures = result.failures;
    // The instructions stay up only while nothing readable has come back; a converted
    // file dropped onto them takes their place with the form.
    showingHelp = result.passages.length === 0 && result.failures.length > 0;
  }

  function clearImport() {
    read = [];
    failures = [];
    showingHelp = false;
  }

  function ondrop(e: DragEvent) {
    e.preventDefault();
    dragDepth = 0;
    void take(e.dataTransfer?.files);
  }
</script>

<svelte:window onclick={() => (menuOpen = false)} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="drop-page"
  ondragenter={(e) => (e.preventDefault(), dragDepth++)}
  ondragover={(e) => e.preventDefault()}
  ondragleave={() => dragDepth && dragDepth--}
  {ondrop}
>
  <main class="view">
    <div class="page-heading">
      <div class="heading-text">
        <p class="eyebrow">Library</p>
        <h1>Passages</h1>
        <p class="subtext">What a student reads from paper. Word counts exclude the title and count hyphenated words once.</p>
      </div>
      {#if app.passages.length > 0}
        <div class="heading-actions">
          <div class="menu-wrap">
            <button
              class="button primary"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onclick={(e) => (e.stopPropagation(), (menuOpen = !menuOpen))}
            >
              <Plus size={18} aria-hidden="true" />Add passage
            </button>
            {#if menuOpen}
              <div class="menu" role="menu">
                <button role="menuitem" onclick={() => ((adding = true), (menuOpen = false))}>
                  <Keyboard size={16} aria-hidden="true" />Type it out
                </button>
                <button role="menuitem" onclick={() => (fileInput?.click(), (menuOpen = false))}>
                  <FileUp size={16} aria-hidden="true" />Import from a file…
                </button>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <input
      bind:this={fileInput}
      class="visually-hidden"
      type="file"
      multiple
      accept={app.importAccept}
      aria-label="Import passages from files"
      onchange={(e) => {
        const input = e.currentTarget;
        void take(input.files);
        input.value = '';
      }}
    />

    {#if app.passages.length === 0}
      <section class="empty-state drop-target" class:dragging>
        <div class="empty-icon">📖</div>
        <h2>No passages yet</h2>
        <p>Drag PDFs or text files here — several at once is fine — or type one out. You can also record readings now and add passages later.</p>
        <div class="empty-actions">
          <button class="button primary" onclick={() => fileInput?.click()}><FileUp size={18} aria-hidden="true" />Import from a file</button>
          <button class="button secondary" onclick={() => (adding = true)}><Keyboard size={18} aria-hidden="true" />Type it out</button>
        </div>
      </section>
    {:else}
      <div class="passage-list">
        {#each app.passages as passage (passage.id)}
          <article class="card passage-card" aria-label={passage.title}>
            <div class="card-head">
              <h2>{passage.title}</h2>
              <span class="word-count">{passage.wordCount} words{passage.source ? ', estimated' : ''}</span>
            </div>
            {#if passage.source}
              <p class="field-help">Read from {passage.source.fileName}. Word count estimated — check it against the paper copy.</p>
            {/if}
            <p class="passage-excerpt">{passage.text.length > 240 ? passage.text.slice(0, 240) + '…' : passage.text}</p>
            <div class="inline-actions">
              {#if confirmDeleteId === passage.id}
                <span class="confirm-line">
                  {readingsUsing(passage.id) > 0 ? `${readingsUsing(passage.id)} reading(s) use this passage and will lose their rate.` : 'Delete this passage?'}
                </span>
                <button class="button danger" onclick={() => (app.deletePassage(passage.id), (confirmDeleteId = undefined))}>Yes, delete</button>
                <button class="button secondary" onclick={() => (confirmDeleteId = undefined)}>Keep</button>
              {:else}
                <button class="button secondary small" onclick={() => (previewingId = passage.id)}><FileText size={16} aria-hidden="true" />View text</button>
                <button class="button secondary small" onclick={() => (editingId = passage.id)}><Pencil size={16} aria-hidden="true" />Edit</button>
                <button class="button danger small" onclick={() => (confirmDeleteId = passage.id)}><Trash2 size={16} aria-hidden="true" />Delete</button>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </main>

  {#if dragging}
    <div class="drop-overlay" aria-hidden="true">
      <div class="drop-overlay-card">
        <FileUp size={28} />
        <strong>Drop to import</strong>
        <span>PDF or plain text. Several files at once is fine.</span>
      </div>
    </div>
  {/if}
</div>

{#if adding || single}
  <Modal title={single ? 'Check this passage' : 'Add a passage'} eyebrow="Passages" wide tall onclose={() => ((adding = false), clearImport())}>
    <PassageForm
      initialTitle={single?.title ?? ''}
      initialText={single?.text ?? ''}
      initialSource={single?.source}
      onsubmit={async (title, text, source) => {
        await app.addPassage(title, text, source);
        adding = false;
        clearImport();
      }}
      oncancel={() => ((adding = false), clearImport())}
    />
  </Modal>
{/if}

{#if !single && (read.length > 0 || (failures.length > 0 && !showingHelp))}
  <PassageImportList passages={read} {failures} onhelp={() => (showingHelp = true)} onclose={clearImport} />
{/if}

{#if showingHelp && failures.length > 0}
  <ConvertFileHelp
    {failures}
    onfiles={(files) => void take(files)}
    onclose={() => (read.length > 0 ? (showingHelp = false) : clearImport())}
  />
{/if}

{#if reading}
  <p class="visually-hidden" aria-live="polite">Reading files…</p>
{/if}

{#if editing}
  <Modal title="Edit passage" eyebrow="Passages" wide tall onclose={() => (editingId = undefined)}>
    <PassageForm
      initialTitle={editing.title}
      initialText={editing.text}
      initialSource={editing.source}
      excludeId={editing.id}
      submitLabel="Save changes"
      onsubmit={async (title, text, source) => {
        await app.updatePassage(editing.id, title, text, source);
        editingId = undefined;
      }}
      oncancel={() => (editingId = undefined)}
    />
  </Modal>
{/if}

{#if previewing}
  <PassagePreview passage={previewing} onclose={() => (previewingId = undefined)} />
{/if}
