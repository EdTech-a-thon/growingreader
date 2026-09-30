<script lang="ts" module>
  /** What the teacher says was said over the picked words. */
  export type Choice = 'printed' | 'heard' | 'nothing';
</script>

<script lang="ts">
  import type { PassageLine } from '../domain/passage';
  import type { WordStatus } from '../domain/review';
  import type { Mark } from '../domain/types';
  import { layoutPassage, type LayoutToken } from './passage-layout';
  import MarkedText from './MarkedText.svelte';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Check from '@lucide/svelte/icons/check';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Play from '@lucide/svelte/icons/play';

  /**
   * Where the repair happens (ADR-0010): the sentence being worked on, marked as on the passage.
   * Tap a stretch highlighted yellow to hear just it (a word read, from it to the sentence's end), or drag
   * across a phrase to hear and settle it together; then say
   * what was said. Each choice previews its marking on the waveform and the passage while it is
   * hovered:
   * - Said the passage: the child read it; the recogniser misheard or missed it.
   * - Heard it right: the recogniser heard what was said, so it was read wrong. Where nothing
   *   was heard, or a word read is in doubt, this is "Nothing was said": an omission.
   * - The pencil: neither; type what was said, and what matches is right, the rest wrong.
   */
  let {
    text,
    sentence,
    index,
    count,
    statuses,
    marks,
    reading,
    focus,
    passage,
    heard,
    status,
    errorType,
    onprev,
    onnext,
    onplay,
    onpick,
    onrange,
    pauses,
    onchoose,
    onsay,
    onpreview,
  }: {
    text: string;
    sentence: PassageLine | undefined;
    /** Which sentence, counting from 0, and of how many. */
    index: number;
    count: number;
    statuses: WordStatus[];
    marks: Mark[];
    reading: number | undefined;
    /** The words picked in the sentence. */
    focus: PassageLine | undefined;
    /** The picked words as printed, and what was heard over them. */
    passage: string[];
    heard: string[];
    /** How the picked words stand: still to settle, read as printed, or settled as an error. */
    status: 'open' | 'right' | 'wrong';
    errorType?: string;
    onprev: () => void;
    onnext: () => void;
    onplay: () => void;
    onpick: (word: number) => void;
    /** Words dragged across: a phrase to settle together. */
    onrange: (first: number, last: number) => void;
    pauses: Map<number, number>;
    onchoose: (choice: Choice) => void;
    onsay: (text: string) => void;
    onpreview: (choice: Choice | undefined) => void;
  } = $props();

  /** The sentence's tokens, punctuation with the word it follows, on one line. */
  const lines = $derived.by((): LayoutToken[][] => {
    if (!sentence) return [];
    const out: LayoutToken[] = [];
    let owner: number | undefined;
    for (const paragraph of layoutPassage(text))
      for (const line of paragraph)
        line.forEach((token, t) => {
          owner = token.word ?? (t === 0 ? line.find((x) => x.word !== undefined)?.word : owner);
          if (owner !== undefined && owner >= sentence.first && owner <= sentence.last) out.push(token);
        });
    return [out];
  });

  let editing = $state(false);
  let draft = $state('');
  let input = $state<HTMLInputElement | undefined>(undefined);

  /** Start typing what was said, from what was heard. */
  export function edit() {
    if (!focus) return;
    draft = heard.join(' ');
    editing = true;
  }

  $effect(() => {
    if (editing) input?.focus();
  });
  // Different words picked: start again.
  $effect(() => {
    void focus?.first;
    void focus?.last;
    editing = false;
  });

  function save() {
    editing = false;
    if (draft.trim()) onsay(draft);
    else onchoose('nothing');
  }

  /** The second choice: the recogniser was right, or (nothing heard, or a word read in doubt) nothing was said. */
  const second = $derived<Choice>(heard.length > 0 && status !== 'right' ? 'heard' : 'nothing');
  const statusLine = $derived(status === 'open' ? 'Not settled yet' : status === 'right' ? 'Read as printed' : `An error${errorType ? `: ${errorType}` : ''}`);

  const hover = (choice: Choice) => ({
    onpointerenter: () => onpreview(choice),
    onpointerleave: () => onpreview(undefined),
    onfocus: () => onpreview(choice),
    onblur: () => onpreview(undefined),
  });
</script>

<section class="card sentence-card" aria-label="Sentence">
  {#if !sentence}
    <p class="muted sentence-empty">No sentence selected. Tap a word in the passage to work on its sentence.</p>
  {:else}
    <div class="sentence-head">
      <button class="icon-button" onclick={onprev} disabled={index === 0} aria-label="Previous sentence"><ChevronLeft size={18} /></button>
      <span class="sentence-title">Sentence {index + 1} of {count}</span>
      <button class="icon-button" onclick={onnext} disabled={index >= count - 1} aria-label="Next sentence"><ChevronRight size={18} /></button>
      <button class="text-button" onclick={onplay}><Play size={14} aria-hidden="true" /> Play sentence</button>
    </div>

    <div class="sentence-text">
      <MarkedText {lines} label="The sentence" {statuses} {marks} {reading} {focus} shaded={undefined} {pauses} {onpick} {onrange} />
    </div>

    <div class="sentence-repair">
      {#if !focus}
        <p class="field-help">Tap a word or a stretch highlighted yellow, or drag across a phrase, to hear it and say what was said.</p>
      {:else}
        <div class="repair-head">
          <span class="repair-status" data-status={status}>{statusLine}</span>
          <span class="subtext repair-heard">Heard <strong>{heard.length > 0 ? heard.join(' ') : 'nothing'}</strong> for <strong>{passage.join(' ')}</strong></span>
        </div>
        {#if editing}
          <form
            class="repair-edit"
            onsubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <input bind:this={input} bind:value={draft} aria-label="What was said" placeholder="Nothing" autocomplete="off" spellcheck="false" onkeydown={(e) => e.key === 'Escape' && (editing = false)} />
            <button class="button small" type="submit"><Check size={14} aria-hidden="true" />Save</button>
            <button class="text-button" type="button" onclick={() => (editing = false)}>Cancel</button>
          </form>
        {:else}
          <div class="repair-choices">
            <button class="choice" data-current={status === 'right'} onclick={() => onchoose('printed')} {...hover('printed')}>
              <span class="choice-title">Said the passage <kbd>P</kbd></span>
              <span class="choice-preview" data-status="right">{passage.join(' ')}</span>
              <span class="choice-note">{status === 'right' ? 'As it stands' : 'The app misheard'}</span>
            </button>
            <button class="choice" data-current={status === 'wrong' && (second === 'heard' || heard.length === 0)} onclick={() => onchoose(second)} {...hover(second)}>
              <span class="choice-title">{second === 'heard' ? 'Heard it right' : 'Nothing was said'} <kbd>{second === 'heard' ? 'H' : 'N'}</kbd></span>
              <span class="choice-preview" data-status="wrong">{second === 'heard' ? heard.join(' ') : '—'}</span>
              <span class="choice-note">{second === 'heard' ? 'So it was read wrong' : status === 'right' ? 'The app made it up: omitted' : 'Skipped: omitted'}</span>
            </button>
            <button class="choice choice-edit" onclick={edit} aria-label="Edit what was said">
              <Pencil size={18} aria-hidden="true" />
              <span class="choice-note">Type it <kbd>E</kbd></span>
            </button>
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</section>

<style>
  .sentence-card {
    display: grid;
    gap: 14px;
    margin: 0;
  }

  .sentence-empty {
    margin: 8px 0;
  }

  .sentence-head {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sentence-head .text-button {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .sentence-title {
    color: var(--muted);
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .sentence-text :global(.mark-passage) {
    font-size: 1.5rem;
  }

  .sentence-repair {
    display: grid;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }

  .repair-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 10px;
  }

  .repair-status {
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .repair-status[data-status='open'] {
    color: var(--amber);
  }

  .repair-status[data-status='right'] {
    color: var(--green-dark);
  }

  .repair-status[data-status='wrong'] {
    color: var(--danger);
  }

  .repair-choices {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 10px;
  }

  .choice {
    display: grid;
    gap: 4px;
    align-content: start;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--paper);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .choice:hover,
  .choice:focus-visible {
    border-color: var(--blue);
    box-shadow: 0 0 0 2px var(--blue-soft);
  }

  .choice[data-current='true'] {
    border-color: var(--green);
  }

  .choice-title {
    font-weight: 800;
  }

  .choice-preview {
    padding: 2px 6px;
    border-radius: 6px;
    font-size: 1.15rem;
  }

  .choice-preview[data-status='right'] {
    background: var(--green-soft);
  }

  .choice-preview[data-status='wrong'] {
    background: var(--danger-soft);
    color: var(--danger);
  }

  .choice-note {
    color: var(--muted);
    font-size: 0.8rem;
  }

  .choice-edit {
    place-items: center;
    align-content: center;
    min-width: 88px;
  }

  .repair-edit {
    display: flex;
    gap: 8px;
  }

  .repair-edit input {
    flex: 1;
    min-width: 0;
    font: inherit;
    font-size: 1.15rem;
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: 8px;
  }

  kbd {
    margin-left: 4px;
    padding: 0 4px;
    border: 1px solid currentColor;
    border-radius: 4px;
    font: inherit;
    font-size: 0.7rem;
    font-weight: 400;
    opacity: 0.6;
  }

  @media (max-width: 700px) {
    .repair-choices {
      grid-template-columns: 1fr;
    }
  }
</style>
