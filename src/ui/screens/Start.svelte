<script lang="ts">
  import { onMount } from 'svelte';
  import { useApp } from '../../app/context';
  import { displayName } from '../../domain/roster';

  let { studentId, passageId }: { studentId: string; passageId?: string } = $props();
  const app = useApp();
  const student = $derived(app.student(studentId));
  const passage = $derived(app.passage(passageId));
  let choosingPassage = $state(false);

  function choose(id: string | undefined) {
    choosingPassage = false;
    app.go({ name: 'start', studentId, passageId: id });
  }

  // The store owns the microphone session: go() releases it when leaving this screen.
  onMount(() => {
    void app.openMicrophone();
  });
</script>

<main class="stage">
  <div>
    <h1>{student ? displayName(student) : 'Student'}</h1>
    {#if app.passages.length > 0}
      <p class="muted">
        {passage ? passage.title : 'No passage chosen (optional)'}
        <button class="link small" onclick={() => (choosingPassage = !choosingPassage)}>{passage ? 'Change passage' : 'Choose passage'}</button>
      </p>
      {#if choosingPassage}
        <div class="choices" role="group" aria-label="Passage" style="justify-content:center">
          {#each app.passages as p (p.id)}
            <button aria-pressed={p.id === passageId} onclick={() => choose(p.id)}>{p.title}</button>
          {/each}
          {#if passage}
            <button onclick={() => choose(undefined)}>None</button>
          {/if}
        </div>
      {/if}
    {/if}
  </div>

  {#if app.micError}
    <p class="error" role="alert">Microphone not available: {app.micError}</p>
    <button onclick={() => app.openMicrophone()}>Try again</button>
  {:else}
    <div class="meter" role="meter" aria-label="Microphone level" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(app.micLevel * 100)}>
      <div style="width: {Math.min(100, app.micLevel * 100)}%"></div>
    </div>
    <p class="muted">{app.canStart ? 'Ready when you are.' : 'Waiting for sound… say hello to the microphone.'}</p>
  {/if}

  <button class="big-button go" disabled={!app.canStart} onclick={() => app.startReading()}>Start</button>

  <button class="link" onclick={() => app.go({ name: 'roster' })}>Back</button>
</main>
