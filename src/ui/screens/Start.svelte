<script lang="ts">
  import { onMount } from 'svelte';
  import { useApp } from '../../app/context';
  import { displayName } from '../../domain/roster';
  import LiveWaveform from '../LiveWaveform.svelte';
  import MicHelp from '../MicHelp.svelte';
  import PassagePicker from '../PassagePicker.svelte';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Play from '@lucide/svelte/icons/play';

  let { studentId, passageId }: { studentId: string; passageId?: string } = $props();
  const app = useApp();
  const student = $derived(app.student(studentId));
  const passage = $derived(app.passage(passageId));
  let choosingPassage = $state(false);
  /** The teacher asked for the microphone help before the app offered it. */
  let helpAsked = $state(false);
  // Once a voice reaches the microphone the help has served its purpose, so it gets out of the way.
  const showHelp = $derived(!app.canStart && (app.micTrouble !== undefined || helpAsked));

  function choose(id: string | undefined) {
    choosingPassage = false;
    app.go({ name: 'start', studentId, passageId: id });
  }

  function retry() {
    helpAsked = false;
    void app.openMicrophone();
  }

  function hideHelp() {
    helpAsked = false;
    app.dismissMicTrouble();
  }

  // The store owns the microphone session: go() releases it when leaving this screen.
  onMount(() => {
    void app.openMicrophone();
  });
</script>

<main class="stage">
  <button class="button secondary stage-back" onclick={() => app.go({ name: 'student', studentId })}><ArrowLeft size={18} aria-hidden="true" />Back</button>

  <div class="stage-top">
    <p class="eyebrow">Ready to read</p>
    <h1>{student ? displayName(student) : 'Student'}</h1>
    {#if app.passages.length > 0}
      <p class="lead">
        {passage ? passage.title : 'No passage chosen'}
        <button class="text-button" onclick={() => (choosingPassage = true)}>{passage ? 'Change passage' : 'Choose passage'}</button>
      </p>
    {/if}
  </div>

  {#if app.micError}
    <MicHelp trouble={app.micTrouble ?? 'other'} detail={app.micError} onretry={retry} />
  {:else}
    <LiveWaveform meter />
    {#if app.canStart}
      <p class="lead">Ready when you are. Tap Start, then read the whole passage.</p>
    {:else}
      <p class="lead">Waiting for sound… say hello to the microphone.</p>
      {#if !showHelp}
        <button class="text-button" onclick={() => (helpAsked = true)}>Start button stuck grey? Fix the microphone</button>
      {/if}
    {/if}
    {#if showHelp}
      <MicHelp trouble={app.micTrouble ?? 'quiet'} onretry={retry} ondismiss={hideHelp} />
    {/if}
  {/if}

  <button class="big-button go" disabled={!app.canStart} onclick={() => app.startReading()}><Play size={44} aria-hidden="true" fill="currentColor" />Start</button>
</main>

{#if choosingPassage}
  <PassagePicker
    eyebrow={student ? displayName(student) : 'Student'}
    title="Which passage are they reading?"
    groupLabel="Passage"
    selectedId={passageId}
    skipLabel={passage ? 'No passage' : 'Skip for now'}
    skipHint="You can still pick it on review"
    onpick={choose}
    onclose={() => (choosingPassage = false)}
  />
{/if}
