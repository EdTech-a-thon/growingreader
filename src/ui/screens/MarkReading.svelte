<script lang="ts">
  import { untrack } from 'svelte';
  import { useApp } from '../../app/context';
  import type { ReviewContext } from '../../app/store.svelte';
  import { displayName } from '../../domain/roster';
  import { formatRate, formatSeconds, wordsCorrectPerMinute } from '../../domain/rate';
  import { passageParagraphs, passageSentences, versionReadBy, type PassageLine } from '../../domain/passage';
  import { accuracy, canMark, canReview, markingState } from '../../domain/marks';
  import {
    confirmHeard,
    deriveMarks,
    heardOver,
    heardStatuses,
    insertHeard,
    markHeard,
    openSpots,
    readAsPrinted,
    retimeHeard,
    setSaid,
    sectionAudio,
    spotAudio,
    spotOf,
    spotOfHeard,
    wordAt,
    wordStatus,
    type Spot,
  } from '../../domain/review';
  import { passageWords, speechOffsets, speechOnsets } from '../../analysis';
  import type { ReviewedTranscript } from '../../domain/types';
  import { formatDateTime } from '../format';
  import { encodeWav } from '../wav';
  import Timeline from '../Timeline.svelte';
  import PassageCard from '../PassageCard.svelte';
  import SentenceCard, { type Choice } from '../SentenceCard.svelte';
  import WaveOverview from '../WaveOverview.svelte';
  import MarkTour from '../MarkTour.svelte';
  import MarkPreparing from '../MarkPreparing.svelte';
  import { isAnalysing } from '../../domain/types';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Play from '@lucide/svelte/icons/play';
  import Pause from '@lucide/svelte/icons/pause';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import RotateCw from '@lucide/svelte/icons/rotate-cw';
  import Check from '@lucide/svelte/icons/check';

  let { readingId }: { readingId: string } = $props();
  const app = useApp();
  const reading = $derived(app.reading(readingId));
  const student = $derived(reading ? app.student(reading.studentId) : undefined);
  const passage = $derived(app.passage(reading?.passageId));
  const version = $derived(reading ? versionReadBy(reading, passage) : undefined);
  const sections = $derived(version ? passageParagraphs(version.text) : []);
  const sentences = $derived(version ? passageSentences(version.text) : []);
  const words = $derived(version ? passageWords(version.text) : []);
  const reviewable = $derived(!!reading && !!version && canReview(reading));
  const review = $derived.by(() => {
    const r = reading?.reviewedTranscript;
    return r && r.formatVersion === 2 && r.passageVersion === version?.version ? r : undefined;
  });
  const markState = $derived(reading ? markingState(reading) : 'unmarked');
  const errorCount = $derived((reading?.marks ?? []).filter((m) => m.kind === 'error').length);
  const open = $derived(review ? openSpots(review) : []);
  const alignment = $derived(app.alignment[readingId]);
  /** Nothing is shown until what was heard is placed in the audio, so no word moves after it appears. Without a model, or if it fails, the recogniser's times will do. */
  const ready = $derived(!!review && (!!review.alignedBy || !app.canAlign || alignment?.state === 'failed'));

  // A draft the first time this reading is marked; placing what was heard in the audio starts after.
  $effect(() => {
    if (reviewable) void untrack(() => app.openReview(readingId));
  });

  function change(fn: (review: ReviewedTranscript, ctx: ReviewContext) => ReviewedTranscript) {
    return app.changeReview(readingId, fn);
  }

  // ---- playback --------------------------------------------------------

  /** A skip back or forward: the DIBELS three seconds. */
  const SKIP = 3;
  /** Heard-through is tracked in slices this long; a paragraph is heard once nine in ten of its slices have played. */
  const SLICE = 0.25;
  const HEARD_SHARE = 0.9;

  let samples = $state.raw<Float32Array | undefined>(undefined);
  let edges = $state.raw<number[]>([]);
  let audioUrl = $state<string | undefined>(undefined);
  let audioEl = $state<HTMLAudioElement | undefined>(undefined);
  let playing = $state(false);
  let playhead = $state(0);
  /** Where playback stops by itself: the end of the sentence asked for. */
  let stopAt: number | undefined;
  const played = new Set<number>();
  /** Bumped whenever a new slice is played, so heard-through is worked out again. */
  let playedCount = $state(0);
  function notePlayed(seconds: number) {
    const slice = Math.floor(seconds / SLICE);
    if (played.has(slice)) return;
    played.add(slice);
    playedCount++;
  }
  const totalSeconds = $derived(reading ? reading.sampleCount / reading.sampleRate : 0);
  const hasAudio = $derived(reading?.hasAudio ?? false);

  $effect(() => {
    if (!hasAudio) {
      audioUrl = undefined;
      samples = undefined;
      return;
    }
    let cancelled = false;
    let url: string | undefined;
    void app.audioFor(readingId).then((loaded) => {
      const sampleRate = untrack(() => reading?.sampleRate);
      if (cancelled || !loaded || !sampleRate) return;
      samples = loaded;
      edges = [...speechOnsets(loaded, sampleRate), ...speechOffsets(loaded, sampleRate)].sort((a, b) => a - b);
      if (typeof URL.createObjectURL === 'function') audioUrl = url = URL.createObjectURL(encodeWav(loaded, sampleRate));
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  });

  // timeupdate fires a few times a second; the scrolling timeline needs every frame.
  $effect(() => {
    if (!playing || !audioEl) return;
    const el = audioEl;
    let frame = requestAnimationFrame(function step() {
      playhead = el.currentTime;
      notePlayed(el.currentTime);
      if (stopAt !== undefined && el.currentTime >= stopAt) {
        el.pause();
        stopAt = undefined;
      }
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  });

  // The word being read, lit on the passage and the sentence.
  const readingWord = $derived(review && playing ? wordAt(review, playhead) : undefined);

  // A paragraph is heard once most of it has played.
  $effect(() => {
    if (!review) return;
    void playedCount;
    untrack(() => {
      sections.forEach((_, p) => {
        if (review.paragraphs[p]?.heard) return;
        const span = sectionAudio(review, sections, p);
        if (!span) return;
        const first = Math.floor(span.start / SLICE);
        const last = Math.max(first, Math.floor(span.end / SLICE));
        let count = 0;
        for (let k = first; k <= last; k++) if (played.has(k)) count++;
        if (count / (last - first + 1) >= HEARD_SHARE) void change((r) => markHeard(r, p));
      });
    });
  });

  function togglePlay() {
    if (!audioEl) return;
    if (!audioEl.paused) {
      stopAt = undefined;
      audioEl.pause();
    } else void audioEl.play();
  }

  function seek(seconds: number) {
    const clamped = Math.max(0, Math.min(totalSeconds, seconds));
    playhead = clamped;
    stopAt = undefined;
    if (audioEl) audioEl.currentTime = clamped;
  }

  /** Play exactly `start`–`end`, and stop there. */
  function playSpan(start: number, end: number) {
    seek(start);
    stopAt = Math.min(totalSeconds, end);
    void audioEl?.play();
  }

  /**
   * Frames can be throttled, so the stop is also timed from the moment sound actually starts
   * (the `playing` event), which lands it within a few milliseconds of the end asked for.
   */
  let stopTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleStop() {
    clearTimeout(stopTimer);
    const el = audioEl;
    if (!el || stopAt === undefined) return;
    const target = stopAt;
    stopTimer = setTimeout(() => {
      if (stopAt !== target || el.paused) return;
      el.pause();
      el.currentTime = playhead = target;
      stopAt = undefined;
    }, Math.max(0, ((target - el.currentTime) / (el.playbackRate || 1)) * 1000));
  }

  /** Playback holds while the waveform is dragged, and carries on after if it was going. */
  let resumeAfterScrub = false;
  function scrub(active: boolean) {
    if (!audioEl) return;
    if (active) {
      resumeAfterScrub = !audioEl.paused;
      audioEl.pause();
    } else if (resumeAfterScrub) void audioEl.play();
  }

  // ---- the sentence being worked on, and the words picked in it -------------

  /** The sentence being worked on, by its index in `sentences`. */
  let sentenceIndex = $state<number | undefined>(undefined);
  const sentence = $derived(sentenceIndex === undefined ? undefined : sentences[sentenceIndex]);
  /**
   * The words picked in the sentence: a spot, or a word alone. Kept as picked while it is
   * settled, so "Sam and" stays "Sam and" once it turns green.
   */
  let focus = $state<Spot | undefined>(undefined);
  /** The heard word tapped in the gutter. */
  let selectedHeard = $state<number | undefined>(undefined);
  /** A choice being hovered: its marking shows on the waveform and the passage until it is made or let go. */
  let preview = $state<Choice | undefined>(undefined);

  const sentenceOf = (word: number) => sentences.findIndex((s) => word >= s.first && word <= s.last);

  function apply(r: ReviewedTranscript, choice: Choice, target: Spot, ctx: Pick<ReviewContext, 'text' | 'duration' | 'em'>): ReviewedTranscript {
    if (choice === 'printed') return readAsPrinted(r, ctx.text, target, ctx.duration, ctx.em);
    if (choice === 'heard') return confirmHeard(r, heardOver(r, target));
    return setSaid(r, ctx.text, target, '', ctx.duration, ctx.em);
  }

  /** What is shown: the review, or what it would be if the choice hovered were made. */
  const shown = $derived.by(() => {
    if (!review || !preview || !focus || !version) return review;
    return apply(review, preview, focus, { text: version.text, duration: totalSeconds });
  });
  const marks = $derived(shown === review ? (reading?.marks ?? []) : shown ? deriveMarks(shown) : []);
  const wordStatuses = $derived(shown ? shown.words.map((_, i) => wordStatus(shown, i)) : []);
  const heardStatusList = $derived(shown ? heardStatuses(shown) : []);
  /** Hesitations, by the word after the pause, and how long the pause was: drawn as the pause, between the words. */
  const pauses = $derived.by(() => {
    const out = new Map<number, number>();
    if (!shown) return out;
    for (const m of marks) {
      if (m.errorType !== 'hesitation') continue;
      const span = shown.words[m.word]?.span;
      let before: number | undefined;
      for (let i = m.word - 1; i >= 0 && before === undefined; i--) before = shown.words[i].span?.end;
      if (span && before !== undefined) out.set(m.word, span.start - before);
    }
    return out;
  });
  /** How many seconds the waveform shows, as zoomed. */
  let windowSeconds = $state(4);
  /** Stretches still to repair, striped on the waveform. */
  const repairs = $derived(shown ? openSpots(shown).map((spot) => spotAudio(shown, spot, totalSeconds)) : []);

  const focusHeard = $derived(focus && review ? heardOver(review, focus) : []);
  const focusStatus = $derived.by(() => {
    if (!focus || !review) return 'right' as const;
    const all = Array.from({ length: focus.last - focus.first + 1 }, (_, k) => wordStatus(review, focus!.first + k));
    return all.includes('open') ? ('open' as const) : all.includes('wrong') ? ('wrong' as const) : ('right' as const);
  });
  /** The picked words while any of them is a spot, open or settled: what plays exactly and is shaded. */
  const focusSpot = $derived(focus && focusStatus !== 'right' ? focus : undefined);
  const focusError = $derived(focus ? (reading?.marks ?? []).find((m) => m.word >= focus!.first && m.word <= focus!.last && m.errorType !== 'hesitation')?.errorType : undefined);
  /** A spot's stretch of audio, shaded on the waveform: from the heard word before it to the one after. */
  const shade = $derived(focusSpot && review ? spotAudio(review, focusSpot, totalSeconds) : undefined);

  /** Where the sentence was read: from its first word (a spot's start) to its last (a spot's end). */
  function audioOf(range: PassageLine) {
    const r = review!;
    const first = spotOf(r, range.first);
    const last = spotOf(r, range.last);
    const start = first ? spotAudio(r, first, totalSeconds).start : (r.words[range.first].span?.start ?? 0);
    const end = last ? spotAudio(r, last, totalSeconds).end : (r.words[range.last].span?.end ?? totalSeconds);
    return { start, end: Math.max(start, end) };
  }
  const sentenceAudio = $derived(sentence && review ? audioOf(sentence) : undefined);

  /** Work on sentence `index`, and hear it. */
  function goToSentence(index: number, spot?: Spot) {
    if (!review || index < 0 || index >= sentences.length) return;
    sentenceIndex = index;
    focus = spot;
    selectedHeard = undefined;
    preview = undefined;
    const span = spot ? spotAudio(review, spot, totalSeconds) : audioOf(sentences[index]);
    if (audioEl) playSpan(span.start, span.end);
  }

  /** A word tapped on the passage: its sentence, with its spot picked if it is in one. */
  function pickInPassage(word: number) {
    if (!review) return;
    goToSentence(sentenceOf(word), spotOf(review, word));
  }

  /** A word tapped in the sentence: a spot plays exactly, the same every time; a word read plays to the sentence's end. */
  function pickInSentence(word: number) {
    if (!review || !sentence) return;
    const spot = spotOf(review, word);
    focus = spot ?? { first: word, last: word };
    selectedHeard = undefined;
    const span = spot ? spotAudio(review, spot, totalSeconds) : { start: review.words[word].span?.start ?? 0, end: audioOf(sentence).end };
    if (audioEl) playSpan(span.start, span.end);
  }

  /** Words dragged across in the sentence: a phrase, heard and settled together. */
  function pickRange(first: number, last: number) {
    if (!review || !sentence) return;
    // Take in the whole of any spot the phrase cuts into, so it is settled as one.
    const a = spotOf(review, first)?.first ?? first;
    const b = spotOf(review, last)?.last ?? last;
    focus = { first: a, last: b };
    selectedHeard = undefined;
    const span = audioOf(focus);
    if (audioEl) playSpan(span.start, span.end);
  }

  /** A heard word tapped in the gutter: the passage words it stands for, in their sentence. */
  function pickHeard(index: number | undefined) {
    selectedHeard = index;
    if (index === undefined || !review) return;
    const r = review;
    const matched = r.words.findIndex((w) => w.heard === index);
    const word = matched >= 0 ? matched : (spotOfHeard(r, index)?.first ?? wordAt(r, r.heard[index].start));
    if (word === undefined) {
      if (audioEl) playSpan(r.heard[index].start, totalSeconds);
      return;
    }
    sentenceIndex = sentenceOf(word);
    pickInSentence(word);
    selectedHeard = index;
  }

  function replay() {
    if (focus && focus.last > focus.first && !spotOf(review!, focus.first)) pickRange(focus.first, focus.last);
    else if (focus && sentence) pickInSentence(focus.first);
    else if (sentenceIndex !== undefined) goToSentence(sentenceIndex);
  }

  // Settling never moves on by itself: the teacher stays where they are, and Tab goes to the next.
  function choose(choice: Choice) {
    const target = focus;
    preview = undefined;
    if (target) void change((r, ctx) => apply(r, choice, target, ctx));
  }

  function say(text: string) {
    const target = focus;
    if (target) void change((r, ctx) => setSaid(r, ctx.text, target, text, ctx.duration, ctx.em));
  }

  let sentenceCard = $state<SentenceCard | undefined>(undefined);
  let tour = $state<MarkTour | undefined>(undefined);

  function onkeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target?.closest('input:not([type="checkbox"]), select, textarea, [contenteditable="true"]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'escape') ((focus = undefined), (selectedHeard = undefined));
    else if (key === ' ') {
      // Also stops Space from pressing whatever button has focus.
      e.preventDefault();
      togglePlay();
    } else if (key === 'arrowleft' || key === 'arrowright') {
      e.preventDefault();
      seek(playhead + (key === 'arrowright' ? SKIP : -SKIP));
    } else if (key === 'tab') {
      const at = focus?.first ?? sentence?.first;
      const spot = e.shiftKey ? [...open].reverse().find((s) => at === undefined || s.last < at) : (open.find((s) => at === undefined || s.first > at) ?? open[0]);
      if (!spot) return;
      e.preventDefault();
      goToSentence(sentenceOf(spot.first), spot);
    } else if (key === 'r') replay();
    else if (!focus) return;
    else if (key === 'p') choose('printed');
    else if (key === 'h' && focusHeard.length > 0 && focusStatus !== 'right') choose('heard');
    else if (key === 'n') choose('nothing');
    else if (key === 'e') {
      e.preventDefault();
      sentenceCard?.edit();
    }
  }
</script>

<svelte:window {onkeydown} />

<main class="mark-view">
  {#if !reading || !student}
    <p>Reading not found.</p>
  {:else}
    <header class="mark-header">
      <button class="back-link" onclick={() => app.go({ name: 'review', readingId })}><ArrowLeft size={14} aria-hidden="true" />Back to review</button>
      <div class="mark-title">
        <h1>Mark reading · {displayName(student)}</h1>
        <p class="eyebrow">{formatDateTime(reading.recordedAt)}{passage ? ` · ${passage.title}` : ''}</p>
      </div>
      {#if review && ready}
        <p class="mark-summary" role="status" aria-label="Marks" data-tour="summary">
          {#if markState === 'marked'}
            {@const acc = accuracy(reading, passage)}
            <Check size={16} aria-hidden="true" />Marked. {acc === undefined ? '' : `${Math.round(acc * 100)}% accuracy, `}{formatRate(wordsCorrectPerMinute(reading, passage))} words correct per minute.
          {:else}
            {errorCount} {errorCount === 1 ? 'error' : 'errors'} · {open.length} {open.length === 1 ? 'spot' : 'spots'} to check
          {/if}
        </p>
      {/if}
    </header>

    {#if !version}
      <div class="banner warn-banner"><span class="banner-mark">!</span>Choose which passage was read on the review screen first; marking checks the reading against its words.</div>
    {:else if isAnalysing(reading) && reading.hasAudio}
      <MarkPreparing analysing={true} {alignment} />
    {:else if !canMark(reading)}
      <div class="banner warn-banner"><span class="banner-mark">!</span>Only a complete reading can be marked. If the student read to the end, confirm it complete on the review screen.</div>
    {:else if !reviewable}
      <div class="banner warn-banner">
        <span class="banner-mark">!</span>
        {reading.hasAudio ? "Marking starts from the app's transcript, and there isn't one for this reading yet." : 'The audio was deleted. Marking means checking the reading by ear, so it needs the recording.'}
      </div>
    {:else if !ready}
      <MarkPreparing analysing={false} {alignment} />
    {:else if review && shown}
      <p class="beta-note">
        <span class="beta-pill">Beta</span>
        <span>Marking accuracy is new, and we're working hard to make it easy. Confused, or have suggestions? We'd love to hear them: <a href="mailto:support@teacher.dev">support@teacher.dev</a></span>
        <button class="text-button" onclick={() => tour?.start()}>Take the tour</button>
      </p>
      <MarkTour bind:this={tour} />

      {#if markState === 'counted'}
        <div class="banner warn-banner"><span class="banner-mark">!</span>This reading has {reading.errors} {reading.errors === 1 ? 'error' : 'errors'} counted before marking existed. Finishing the check replaces that count.</div>
      {/if}

      <div class="mark-grid">
        <div class="mark-work">
          <section class="card mark-listen" aria-label="Recording">
            {#if audioUrl}
              <audio
                bind:this={audioEl}
                src={audioUrl}
                preload="auto"
                onplay={() => (playing = true)}
                onplaying={scheduleStop}
                onpause={() => (clearTimeout(stopTimer), (playing = false), (playhead = audioEl?.currentTime ?? playhead))}
                onended={() => (playing = false)}
                ontimeupdate={() => {
                  const t = audioEl?.currentTime ?? 0;
                  if (playing) notePlayed(t);
                  else playhead = t;
                }}
              ></audio>
            {/if}
            <Timeline
              {samples}
              duration={totalSeconds}
              {playhead}
              heard={shown.heard}
              statuses={heardStatusList}
              {edges}
              selected={preview ? undefined : selectedHeard}
              {shade}
              sentence={sentenceAudio}
              {repairs}
              bind:windowSeconds
              onseek={seek}
              onscrub={scrub}
              onselect={pickHeard}
              onretime={(i, start, end) => change((r, ctx) => retimeHeard(r, ctx.text, i, start, end))}
              oninsert={(at, text) => change((r, ctx) => insertHeard(r, ctx.text, at, text, ctx.duration, ctx.em))}
            />
            {#if alignment?.state === 'failed'}
              <p class="field-help mark-alignment" role="status">Couldn't place the words in the audio on this device; they're at the recogniser's rough times. Drag a word, or its edges, where it's off.</p>
            {/if}
          </section>

          <div data-tour="sentence">
          <SentenceCard
            bind:this={sentenceCard}
            text={version.text}
            {sentence}
            index={sentenceIndex ?? 0}
            count={sentences.length}
            statuses={wordStatuses}
            {marks}
            reading={readingWord}
            {focus}
            passage={focus ? words.slice(focus.first, focus.last + 1) : []}
            heard={focusHeard.map((i) => review.heard[i].text)}
            status={focusStatus}
            errorType={focusError}
            onprev={() => goToSentence((sentenceIndex ?? 0) - 1)}
            onnext={() => goToSentence((sentenceIndex ?? -1) + 1)}
            onplay={() => sentenceIndex !== undefined && goToSentence(sentenceIndex, undefined)}
            onpick={pickInSentence}
            onrange={pickRange}
            {pauses}
            onchoose={choose}
            onsay={say}
            onpreview={(choice) => (preview = choice)}
          />
          </div>

        </div>

        <div class="mark-side">
          <section class="card mark-transport" aria-label="Playback" data-tour="transport">
            <div class="mark-controls">
              <button class="skip-button" onclick={() => seek(playhead - SKIP)} disabled={!audioUrl} aria-label={`Back ${SKIP} seconds`}>
                <RotateCcw size={26} aria-hidden="true" /><span>{SKIP}</span>
              </button>
              <button class="play-button" onclick={togglePlay} disabled={!audioUrl} aria-label={playing ? 'Pause' : 'Play'}>
                {#if playing}<Pause size={22} fill="currentColor" />{:else}<Play size={22} fill="currentColor" style="margin-left:3px" />{/if}
              </button>
              <button class="skip-button" onclick={() => seek(playhead + SKIP)} disabled={!audioUrl} aria-label={`Forward ${SKIP} seconds`}>
                <RotateCw size={26} aria-hidden="true" /><span>{SKIP}</span>
              </button>
              <span class="mark-time">{formatSeconds(playhead)} / {formatSeconds(totalSeconds)}</span>
            </div>
            <WaveOverview {samples} duration={totalSeconds} {playhead} {windowSeconds} onseek={seek} />
            <p class="mark-keys" aria-hidden="true">Space play · Tab next to check · R replay · P / H / N / E choose · Esc</p>
          </section>
          <div data-tour="passage">
          <PassageCard
            text={version.text}
            statuses={wordStatuses}
            {marks}
            toCheck={open.length}
            notHeard={review.paragraphs.filter((p) => !p.heard).length}
            reading={readingWord}
            {sentences}
            {sentence}
            {pauses}
            onpick={pickInPassage}
          />
          </div>
        </div>
      </div>
    {/if}
  {/if}
</main>
