<script lang="ts">
  import { useApp } from '../../app/context';
  import { displayName } from '../../domain/roster';
  import Chart from '../Chart.svelte';

  let { studentId }: { studentId: string } = $props();
  const app = useApp();
  const student = $derived(app.student(studentId));
</script>

<main class="fullscreen">
  <div class="row spread">
    <h1>{student ? `${displayName(student)}'s progress` : 'Progress'}</h1>
    <button onclick={() => app.go({ name: 'student', studentId })}>Back</button>
  </div>
  <Chart readings={app.readingsFor(studentId)} passages={app.passages} large />
</main>
