<script lang="ts">
  import type { PassageLine } from '../domain/passage';
  import type { WordStatus } from '../domain/review';
  import type { Mark } from '../domain/types';
  import { layoutPassage } from './passage-layout';
  import MarkedText from './MarkedText.svelte';
  import Check from '@lucide/svelte/icons/check';

  /**
   * The whole passage, as printed, line breaks and all (ADR-0010): errors slashed, words still
   * to settle highlighted yellow, the word being read outlined, the sentence being worked on shaded. Tap a
   * word to pick its sentence; hovering underlines the sentence a tap would pick.
   */
  let {
    text,
    statuses,
    marks,
    toCheck,
    notHeard,
    reading,
    sentences,
    sentence,
    pauses,
    onpick,
  }: {
    text: string;
    statuses: WordStatus[];
    marks: Mark[];
    /** Spots still to settle. */
    toCheck: number;
    /** Paragraphs not yet played through. */
    notHeard: number;
    reading: number | undefined;
    sentences: PassageLine[];
    /** The sentence being worked on. */
    sentence: PassageLine | undefined;
    /** Hesitations, by the word after the pause. */
    pauses: Map<number, number>;
    onpick: (word: number) => void;
  } = $props();

  const layout = $derived(layoutPassage(text));
</script>

<section class="card passage-card" aria-label="Passage">
  <div class="passage-card-head">
    <span class="passage-card-title">Passage</span>
    <span class="passage-card-status" role="status">
      {#if toCheck > 0}
        <span class="to-check">⚠ {toCheck} to check</span>
      {:else if notHeard === 0}
        <Check size={14} aria-hidden="true" /> Done
      {/if}
      {#if notHeard > 0}<span class="not-heard">· {notHeard === 1 ? 'a paragraph' : `${notHeard} paragraphs`} not heard all the way through yet</span>{/if}
    </span>
  </div>
  {#each layout as lines, p (p)}
    <MarkedText {lines} label={`Paragraph ${p + 1}`} {statuses} {marks} {reading} focus={undefined} shaded={sentence} {sentences} {pauses} {onpick} />
  {/each}
</section>

<style>
  .passage-card {
    display: grid;
    gap: 14px;
    align-content: start;
    margin: 0;
  }

  .passage-card-head {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .passage-card-title {
    color: var(--muted);
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .passage-card-status {
    margin-left: auto;
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    color: var(--green-dark);
    font-size: 0.85rem;
    font-weight: 700;
  }

  .to-check {
    color: var(--amber);
  }

  .not-heard {
    color: var(--muted);
    font-weight: 400;
  }
</style>
