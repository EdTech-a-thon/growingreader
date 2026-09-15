<script lang="ts">
  import { useApp } from '../../app/context';
  import PassageForm from '../PassageForm.svelte';

  const app = useApp();
  let adding = $state(false);
  let editingId = $state<string | undefined>(undefined);
  let confirmDeleteId = $state<string | undefined>(undefined);

  const readingsUsing = (passageId: string) => app.readings.filter((r) => r.passageId === passageId && r.completion !== 'discarded').length;
</script>

<main class="page">
  <div class="row spread">
    <h1>Passages</h1>
    <button class="primary" onclick={() => ((adding = !adding), (editingId = undefined))}>Add passage</button>
  </div>
  <p class="muted small">Passages are what a student reads from paper. Word counts exclude the title and count hyphenated words once.</p>

  {#if adding}
    <PassageForm
      onsubmit={async (title, text) => {
        await app.addPassage(title, text);
        adding = false;
      }}
      oncancel={() => (adding = false)}
    />
  {/if}

  {#if app.passages.length === 0 && !adding}
    <p class="muted">No passages yet. You can record readings now and add passages later; the rate appears once a reading has a passage.</p>
  {/if}

  {#each app.passages as passage (passage.id)}
    {#if editingId === passage.id}
      <PassageForm
        initialTitle={passage.title}
        initialText={passage.text}
        excludeId={passage.id}
        submitLabel="Save changes"
        onsubmit={async (title, text) => {
          await app.updatePassage(passage.id, title, text);
          editingId = undefined;
        }}
        oncancel={() => (editingId = undefined)}
      />
    {:else}
      <article class="card" aria-label={passage.title}>
        <div class="row spread">
          <h2>{passage.title}</h2>
          <span class="muted">{passage.wordCount} words</span>
        </div>
        <p class="small muted" style="white-space:pre-wrap">{passage.text.length > 240 ? passage.text.slice(0, 240) + '…' : passage.text}</p>
        <div class="row">
          <button onclick={() => ((editingId = passage.id), (adding = false))}>Edit</button>
          {#if confirmDeleteId === passage.id}
            <span class="small">
              {readingsUsing(passage.id) > 0 ? `${readingsUsing(passage.id)} reading(s) use this passage and will lose their rate.` : 'Delete this passage?'}
            </span>
            <button class="danger" onclick={() => (app.deletePassage(passage.id), (confirmDeleteId = undefined))}>Yes, delete</button>
            <button onclick={() => (confirmDeleteId = undefined)}>Keep</button>
          {:else}
            <button class="danger" onclick={() => (confirmDeleteId = passage.id)}>Delete</button>
          {/if}
        </div>
      </article>
    {/if}
  {/each}
</main>
