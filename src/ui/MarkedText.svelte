<script lang="ts">
  import type { PassageLine } from '../domain/passage';
  import { markOn } from '../domain/marks';
  import type { WordStatus } from '../domain/review';
  import type { Mark } from '../domain/types';
  import { lineBands, type LayoutToken } from './passage-layout';

  /**
   * Passage text marked as the teacher marks it (ADR-0008, ADR-0010): errors slashed, words
   * still to settle highlighted yellow, the word being read outlined. A hesitation is not the word's fault
   * but the pause's, so it shows as the pause between the words ("paused 3.4 s"), not a slash.
   * The passage card and the sentence card both draw with this, so a word looks the same in
   * both. Given `onrange`, a press dragged across words picks them all.
   */
  let {
    lines,
    label,
    statuses,
    marks,
    reading,
    focus,
    shaded,
    sentences,
    pauses,
    onpick,
    onrange,
  }: {
    /** The tokens to draw, line by line (`passage-layout`). */
    lines: LayoutToken[][];
    label: string;
    statuses: WordStatus[];
    marks: Mark[];
    /** The passage word being read as the recording plays. */
    reading: number | undefined;
    /** The words picked, outlined. */
    focus: PassageLine | undefined;
    /** A stretch shaded as one band: the sentence being worked on. */
    shaded: PassageLine | undefined;
    /** When given, hovering a word underlines its sentence: what a tap picks. */
    sentences?: PassageLine[];
    /** Hesitations, by the word after the pause: how long the pause was, in seconds. */
    pauses: Map<number, number>;
    onpick: (word: number) => void;
    /** Words dragged across, first and last. */
    onrange?: (first: number, last: number) => void;
  } = $props();

  // ---- dragging across words ------------------------------------------------
  let dragFrom = $state<number | undefined>(undefined);
  let dragTo = $state<number | undefined>(undefined);
  let swallowClick = false;
  const dragged = $derived(
    dragFrom !== undefined && dragTo !== undefined && dragFrom !== dragTo ? { first: Math.min(dragFrom, dragTo), last: Math.max(dragFrom, dragTo) } : undefined,
  );

  function down(e: PointerEvent, word: number) {
    if (!onrange || e.button !== 0) return;
    // A touch pointer is captured by the word it started on; release it so the words it crosses see it.
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    dragFrom = dragTo = word;
  }

  function up() {
    const range = dragged;
    dragFrom = dragTo = undefined;
    if (!range || !onrange) return;
    onrange(range.first, range.last);
    // The click that may follow this pointerup must not also pick one word.
    swallowClick = true;
    setTimeout(() => (swallowClick = false), 0);
  }

  function click(word: number) {
    if (swallowClick) return (swallowClick = false);
    onpick(word);
  }

  let hovered = $state<number | undefined>(undefined);
  const hoveredSentence = $derived(hovered === undefined || !sentences ? undefined : sentences.find((s) => hovered! >= s.first && hovered! <= s.last));
  const within = (range: PassageLine | undefined, word: number | undefined) => !!range && word !== undefined && word >= range.first && word <= range.last;

  /** The word a token belongs to: its own, else the word it follows (or, at a line's start, the one it leads into). */
  function ownerOf(line: LayoutToken[], t: number): number | undefined {
    for (let k = t; k >= 0; k--) if (line[k].word !== undefined) return line[k].word;
    return line.find((token) => token.word !== undefined)?.word;
  }
  /** A gap is in a stretch when the words on both sides of it are. */
  const gapIn = (range: PassageLine | undefined, line: LayoutToken[], t: number) => within(range, ownerOf(line, t - 1)) && within(range, line[t].word ?? ownerOf(line, t));
  /** A word's own mark: a hesitation belongs to the pause before it, not the word. */
  const ownMark = (word: number) => {
    const mark = markOn(marks, word);
    return mark?.errorType === 'hesitation' ? undefined : mark;
  };
  const kindOf = (word: number) => ownMark(word)?.kind;
  const seconds = (s: number) => `${s.toFixed(1)} s`;
</script>

<svelte:window onpointerup={up} onpointercancel={up} />

<div class="mark-passage marked-text" role="group" aria-label={label}>
  {#each lines as line, l (l)}
    {#if l > 0}<br />{/if}
    {@const bands = lineBands(line, kindOf)}
    <!-- No whitespace between tokens: the only spaces are the gaps, which a band fills. -->
    {#each line as token, t (t)}{#if t > 0}<span class="mark-gap" data-band={bands[t].joinsPrev ? bands[t].kind : undefined} class:in-sentence={gapIn(shaded, line, t)} class:hover-sentence={gapIn(hoveredSentence, line, t)}> </span>{/if}{#if token.word !== undefined}
        {@const word = token.word}
        {@const status = statuses[word]}
        {@const mark = ownMark(word)}{#if pauses.has(word)}<span class="pause-mark" role="img" aria-label={`paused ${seconds(pauses.get(word)!)}: a hesitation error`} title="Three seconds or more: a hesitation error">⏸ paused {seconds(pauses.get(word)!)}</span><span class="mark-gap"> </span>{/if}<button
          class="mark-word"
          data-mark={bands[t].kind}
          data-status={status}
          class:joins-prev={bands[t].joinsPrev}
          class:joins-next={bands[t].joinsNext}
          class:reading={reading === word}
          class:selected={within(dragged ?? focus, word)}
          class:in-sentence={within(shaded, word)}
          class:sentence-first={shaded?.first === word}
          class:sentence-last={shaded?.last === word}
          class:hover-sentence={within(hoveredSentence, word)}
          title={mark?.errorType}
          aria-label={status === 'open' ? `${token.text}, to check` : mark ? `${token.text}, error (${mark.errorType})` : token.text}
          onpointerdown={(e) => down(e, word)}
          onpointerenter={() => ((hovered = word), dragFrom !== undefined && (dragTo = word))}
          onpointerleave={() => hovered === word && (hovered = undefined)}
          onclick={() => click(word)}>{token.text}</button
        >{:else}<span class="mark-punct" data-band={bands[t].kind} class:in-sentence={within(shaded, ownerOf(line, t))} class:hover-sentence={within(hoveredSentence, ownerOf(line, t))} class:joins-prev={bands[t].joinsPrev} class:joins-next={bands[t].joinsNext}>{token.text}</span>{/if}{/each}
  {/each}
</div>

<style>
  .marked-text {
    overflow: visible;
    padding: 0;
  }

  /* The sentence being worked on: shaded, gaps and all, so it reads as one stretch. */
  .marked-text :global(.in-sentence:not([data-mark]):not([data-band])) {
    background-color: var(--sky-soft);
  }

  /* Square inside the sentence, rounded only at its two ends, so it reads as one band. */
  .marked-text :global(.mark-word.in-sentence) {
    border-radius: 0;
  }

  .marked-text :global(.mark-word.sentence-first) {
    border-top-left-radius: 6px;
    border-bottom-left-radius: 6px;
  }

  .marked-text :global(.mark-word.sentence-last) {
    border-top-right-radius: 6px;
    border-bottom-right-radius: 6px;
  }

  /* The sentence a tap would pick: underlined as one line. */
  .marked-text :global(.hover-sentence) {
    background-image: linear-gradient(var(--blue), var(--blue));
    background-size: 100% 2px;
    background-position: 0 100%;
    background-repeat: no-repeat;
  }

  /* Still to settle: the teacher checks it by ear. */
  .marked-text :global(.mark-word[data-status='open']) {
    background-color: var(--yellow-soft);
    box-shadow: inset 0 -2px 0 #e0b04c;
  }

  .marked-text :global(.mark-word.reading) {
    outline: 2px solid var(--green);
    outline-offset: 1px;
  }

  /* A hesitation: the pause itself, between the words. */
  .pause-mark {
    display: inline-block;
    padding: 0 6px;
    border: 1px dashed #f2c7cd;
    border-radius: 999px;
    background: var(--danger-soft);
    color: var(--danger);
    font-size: 0.7em;
    font-weight: 700;
    line-height: 1.6;
    vertical-align: middle;
    white-space: nowrap;
  }

  .marked-text :global(.mark-word.selected) {
    outline: 2px solid var(--blue);
    outline-offset: 2px;
  }
</style>
