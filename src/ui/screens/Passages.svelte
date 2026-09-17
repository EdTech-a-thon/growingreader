<script lang="ts">
  import { useApp } from '../../app/context';
  import PassageForm from '../PassageForm.svelte';
  import Modal from '../Modal.svelte';
  import { isDiscarded } from '../../domain/types';
  import Plus from '@lucide/svelte/icons/plus';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Trash2 from '@lucide/svelte/icons/trash-2';

  const app = useApp();
  let adding = $state(false);
  let editingId = $state<string | undefined>(undefined);
  let confirmDeleteId = $state<string | undefined>(undefined);

  const readingsUsing = (passageId: string) => app.readings.filter((r) => r.passageId === passageId && !isDiscarded(r)).length;
  const editing = $derived(app.passage(editingId));
</script>

<main class="view">
  <div class="page-heading">
    <div class="heading-text">
      <p class="eyebrow">Library</p>
      <h1>Passages</h1>
      <p class="subtext">What a student reads from paper. Word counts exclude the title and count hyphenated words once.</p>
    </div>
    {#if app.passages.length > 0}
      <div class="heading-actions">
        <button class="button primary" onclick={() => (adding = true)}><Plus size={18} aria-hidden="true" />Add passage</button>
      </div>
    {/if}
  </div>

  {#if app.passages.length === 0}
    <section class="empty-state">
      <div class="empty-icon">📖</div>
      <h2>No passages yet</h2>
      <p>You can record readings now and add passages later; the rate appears once a reading has a passage.</p>
      <div class="empty-actions">
        <button class="button primary" onclick={() => (adding = true)}><Plus size={18} aria-hidden="true" />Add passage</button>
      </div>
    </section>
  {:else}
    <div class="passage-list">
      {#each app.passages as passage (passage.id)}
        <article class="card passage-card" aria-label={passage.title}>
          <div class="card-head">
            <h2>{passage.title}</h2>
            <span class="word-count">{passage.wordCount} words</span>
          </div>
          <p class="passage-excerpt">{passage.text.length > 240 ? passage.text.slice(0, 240) + '…' : passage.text}</p>
          <div class="inline-actions">
            {#if confirmDeleteId === passage.id}
              <span class="confirm-line">
                {readingsUsing(passage.id) > 0 ? `${readingsUsing(passage.id)} reading(s) use this passage and will lose their rate.` : 'Delete this passage?'}
              </span>
              <button class="button danger" onclick={() => (app.deletePassage(passage.id), (confirmDeleteId = undefined))}>Yes, delete</button>
              <button class="button secondary" onclick={() => (confirmDeleteId = undefined)}>Keep</button>
            {:else}
              <button class="button secondary small" onclick={() => (editingId = passage.id)}><Pencil size={16} aria-hidden="true" />Edit</button>
              <button class="button danger small" onclick={() => (confirmDeleteId = passage.id)}><Trash2 size={16} aria-hidden="true" />Delete</button>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  {/if}
</main>

{#if adding}
  <Modal title="Add a passage" eyebrow="Passages" wide onclose={() => (adding = false)}>
    <PassageForm
      onsubmit={async (title, text) => {
        await app.addPassage(title, text);
        adding = false;
      }}
      oncancel={() => (adding = false)}
    />
  </Modal>
{/if}

{#if editing}
  <Modal title="Edit passage" eyebrow="Passages" wide onclose={() => (editingId = undefined)}>
    <PassageForm
      initialTitle={editing.title}
      initialText={editing.text}
      excludeId={editing.id}
      submitLabel="Save changes"
      onsubmit={async (title, text) => {
        await app.updatePassage(editing.id, title, text);
        editingId = undefined;
      }}
      oncancel={() => (editingId = undefined)}
    />
  </Modal>
{/if}
