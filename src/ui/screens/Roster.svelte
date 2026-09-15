<script lang="ts">
  import { useApp } from '../../app/context';
  import { displayName } from '../../domain/roster';
  import { rate, formatRate } from '../../domain/rate';
  import { formatDate } from '../format';

  const app = useApp();
  let pasting = $state(false);
  let addingOne = $state(false);
  let pasted = $state('');
  let single = $state('');

  async function addStudents() {
    await app.addStudents(pasted);
    pasted = '';
    pasting = false;
  }

  async function addOne() {
    await app.addStudent(single);
    single = '';
    addingOne = false;
  }

  function summary(studentId: string) {
    const last = app.lastReadingFor(studentId);
    if (!last) return 'No readings yet';
    const r = rate(last, app.passage(last.passageId));
    const when = formatDate(last.recordedAt);
    if (last.completion === 'pending') return `${when} · awaiting review`;
    return r === undefined ? when : `${when} · ${formatRate(r)} words per minute`;
  }
</script>

<main class="page">
  <h1>Roster</h1>

  {#if app.lostReading}
    <div class="notice" role="alert">
      A reading for <strong>{app.student(app.lostReading.studentId) ? displayName(app.student(app.lostReading.studentId)!) : 'a student'}</strong>
      started {formatDate(app.lostReading.startedAt)} was lost because the tab closed before Done was tapped. Please redo it.
      <button class="link" onclick={() => app.dismissLostReading()}>Dismiss</button>
    </div>
  {/if}

  {#if app.backupDue}
    <div class="notice">
      It has been a while since your last backup. <button class="link" onclick={() => app.go({ name: 'settings' })}>Export a backup</button>
    </div>
  {/if}

  {#if app.model.state === 'failed'}
    <p class="small muted">The speech model isn't available on this device ({app.model.message}). Everything still works: you choose the passage yourself on review.</p>
  {/if}

  <div class="row" style="margin-bottom:1rem">
    <button onclick={() => ((pasting = !pasting), (addingOne = false))}>Paste roster</button>
    <button onclick={() => ((addingOne = !addingOne), (pasting = false))}>Add one student</button>
  </div>

  {#if pasting}
    <form class="card" onsubmit={(e) => (e.preventDefault(), addStudents())}>
      <div class="field">
        <label for="roster-paste">One student per line (first name, then last name)</label>
        <textarea id="roster-paste" bind:value={pasted} placeholder={'Ada Lovelace\nGrace Hopper'}></textarea>
      </div>
      <button class="primary" type="submit">Add students</button>
    </form>
  {/if}

  {#if addingOne}
    <form class="card" onsubmit={(e) => (e.preventDefault(), addOne())}>
      <div class="field">
        <label for="single-name">Student name</label>
        <input id="single-name" bind:value={single} placeholder="First Last" />
      </div>
      <button class="primary" type="submit">Add student</button>
    </form>
  {/if}

  {#if app.activeStudents.length === 0}
    <p class="muted">Paste your roster to get started. Tap a student's name to hand them the device.</p>
  {:else}
    <ul class="student-list">
      {#each app.activeStudents as student (student.id)}
        <li>
          <button aria-labelledby="student-{student.id}" aria-describedby="summary-{student.id}" onclick={() => app.go({ name: 'student', studentId: student.id })}>
            <span class="name" id="student-{student.id}">{displayName(student)}</span>
            <span class="small muted" id="summary-{student.id}">{summary(student.id)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</main>
