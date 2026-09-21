<script lang="ts">
  import { useApp } from '../app/context';
  import Modal from './Modal.svelte';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import Check from '@lucide/svelte/icons/check';
  import SkipForward from '@lucide/svelte/icons/skip-forward';
  import ClipboardPaste from '@lucide/svelte/icons/clipboard-paste';
  import FileUp from '@lucide/svelte/icons/file-up';

  let {
    title,
    eyebrow,
    groupLabel,
    selectedId,
    skipLabel = 'Skip for now',
    skipHint = 'Choose it on review instead',
    onpick,
    onpaste,
    onimport,
    onclose,
  }: {
    title: string;
    eyebrow?: string;
    /** Accessible name of the card group; screens name it for what the choice means to them. */
    groupLabel: string;
    selectedId?: string;
    skipLabel?: string;
    skipHint?: string;
    onpick: (passageId: string | undefined) => void;
    /** When given, a card offers to type in a passage that is not stored yet. */
    onpaste?: () => void;
    /** When given, a card offers to read one out of a file instead. */
    onimport?: () => void;
    onclose: () => void;
  } = $props();
  const app = useApp();
</script>

<Modal {title} {eyebrow} wide {onclose}>
  <div class="passage-cards" role="group" aria-label={groupLabel}>
    {#each app.passages as p (p.id)}
      <button class="passage-pick" aria-pressed={p.id === selectedId} onclick={() => onpick(p.id)}>
        <span class="passage-pick-mark"><BookOpen size={20} /></span>
        <span class="passage-pick-text">
          <span class="passage-pick-title">{p.title}</span>
          <small>{p.wordCount} words</small>
        </span>
        <span class="passage-pick-check"><Check size={16} /></span>
      </button>
    {/each}
    {#if onpaste}
      <button class="passage-pick skip" onclick={onpaste}>
        <span class="passage-pick-mark"><ClipboardPaste size={20} /></span>
        <span class="passage-pick-text">
          <span class="passage-pick-title">Type out a new passage</span>
          <small>Stored for next time too</small>
        </span>
      </button>
    {/if}
    {#if onimport}
      <button class="passage-pick skip" onclick={onimport}>
        <span class="passage-pick-mark"><FileUp size={20} /></span>
        <span class="passage-pick-text">
          <span class="passage-pick-title">Import a passage from a file</span>
          <small>PDF or plain text; stored for next time too</small>
        </span>
      </button>
    {/if}
    <button class="passage-pick skip" onclick={() => onpick(undefined)}>
      <span class="passage-pick-mark"><SkipForward size={20} /></span>
      <span class="passage-pick-text">
        <span class="passage-pick-title">{skipLabel}</span>
        <small>{skipHint}</small>
      </span>
    </button>
  </div>
</Modal>
