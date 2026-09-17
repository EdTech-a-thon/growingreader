<script lang="ts">
  import { useApp } from '../../app/context';
  import { displayName, initials, parseRoster } from '../../domain/roster';
  import { formatDate, formatDateTime } from '../format';
  import Modal from '../Modal.svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import UserPlus from '@lucide/svelte/icons/user-plus';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';

  const app = useApp();
  let pasting = $state(false);
  let addingOne = $state(false);
  let pasted = $state('');
  let single = $state('');
  const pastedCount = $derived(parseRoster(pasted).length);

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

  /** When they last read; the numbers live on the student's page. */
  function summary(studentId: string): { text: string; tone: 'none' | 'pending' } {
    const last = app.lastReadingFor(studentId);
    if (!last) return { text: 'No readings yet', tone: 'none' };
    const when = formatDate(last.recordedAt);
    if (last.completion === 'pending') return { text: `Last read ${when} · awaiting review`, tone: 'pending' };
    return { text: `Last read ${when}`, tone: 'none' };
  }
</script>

<main class="view">
  <div class="page-heading">
    <div class="heading-text">
      <p class="eyebrow">Students</p>
      <h1>Roster</h1>
      <p class="subtext">Tap a name to see their readings and start a new one.</p>
    </div>
    {#if app.activeStudents.length > 0}
      <div class="heading-actions">
        <button class="button secondary" onclick={() => ((addingOne = true), (pasting = false))}><UserPlus size={18} aria-hidden="true" />Add one student</button>
        <button class="button primary" onclick={() => ((pasting = true), (addingOne = false))}><Plus size={18} aria-hidden="true" />Paste roster</button>
      </div>
    {/if}
  </div>

  {#if app.lostReading}
    {@const lostStudent = app.student(app.lostReading.studentId)}
    <div class="banner warn-banner" role="alert">
      <span class="banner-mark">!</span>
      <span class="grow">
        A reading for <strong>{lostStudent ? displayName(lostStudent) : 'a student'}</strong>
        started {formatDate(app.lostReading.startedAt)} was lost because the tab closed before Done was tapped. Please redo it.
      </span>
      <button class="text-button" onclick={() => app.dismissLostReading()}>Dismiss</button>
    </div>
  {/if}

  {#if app.backupDue}
    <div class="banner warn-banner">
      <span class="banner-mark">!</span>
      <span class="grow">It has been a while since your last backup.</span>
      <button class="text-button" onclick={() => app.go({ name: 'settings' })}>Export a backup</button>
    </div>
  {/if}

  {#if app.processing.length > 0}
    <div class="banner info-banner" aria-label="Still being analysed">
      <span class="banner-mark">…</span>
      <span class="grow">
        <strong>Still being analysed</strong>
        <ul>
          {#each app.processing as r (r.id)}
            {@const s = app.student(r.studentId)}
            <li>{s ? displayName(s) : 'Student'} · {formatDateTime(r.recordedAt)} <button class="link-button" onclick={() => app.go({ name: 'review', readingId: r.id })}>Open</button></li>
          {/each}
        </ul>
      </span>
    </div>
  {/if}

  {#if app.activeStudents.length === 0}
    <section class="empty-state">
      <div class="empty-icon">👋</div>
      <h2>Add your students</h2>
      <p>Paste your roster to get started. Tap a student's name to see their readings and start a new one.</p>
      <div class="empty-actions">
        <button class="button primary" onclick={() => (pasting = true)}><Plus size={18} aria-hidden="true" />Paste roster</button>
        <button class="button secondary" onclick={() => (addingOne = true)}><UserPlus size={18} aria-hidden="true" />Add one student</button>
      </div>
    </section>
  {:else}
    <section class="student-grid" aria-label="Students">
      {#each app.activeStudents as student, index (student.id)}
        {@const s = summary(student.id)}
        <button class="student-card" aria-labelledby="student-{student.id}" aria-describedby="summary-{student.id}" onclick={() => app.go({ name: 'student', studentId: student.id })}>
            <span class={'initials color-' + ((index % 5) + 1)} aria-hidden="true">{initials(student)}</span>
            <span class="student-details">
              <span class="student-name" id="student-{student.id}">{displayName(student)}</span>
              <span class="student-status {s.tone}" id="summary-{student.id}">{s.text}</span>
            </span>
          <span class="chevron" aria-hidden="true"><ChevronRight size={22} /></span>
        </button>
      {/each}
    </section>
  {/if}
</main>

{#if pasting}
  <Modal title="Add your students" eyebrow="Roster" onclose={() => (pasting = false)}>
    <form onsubmit={(e) => (e.preventDefault(), addStudents())}>
      <div class="field">
        <label for="roster-paste">One student per line (first name, then last name)</label>
        <textarea id="roster-paste" bind:value={pasted} placeholder={'Ada Lovelace\nGrace Hopper'}></textarea>
      </div>
      <p class="count-line">{pastedCount ? `${pastedCount} ${pastedCount === 1 ? 'student' : 'students'} ready to add` : ''}</p>
      <footer class="modal-actions">
        <button class="button secondary" type="button" onclick={() => (pasting = false)}>Cancel</button>
        <button class="button primary" type="submit" disabled={pastedCount === 0}>Add students</button>
      </footer>
    </form>
  </Modal>
{/if}

{#if addingOne}
  <Modal title="Add one student" eyebrow="Roster" onclose={() => (addingOne = false)}>
    <form onsubmit={(e) => (e.preventDefault(), addOne())}>
      <div class="field">
        <label for="single-name">Student name</label>
        <input id="single-name" bind:value={single} placeholder="First Last" />
      </div>
      <footer class="modal-actions">
        <button class="button secondary" type="button" onclick={() => (addingOne = false)}>Cancel</button>
        <button class="button primary" type="submit" disabled={!single.trim()}>Add student</button>
      </footer>
    </form>
  </Modal>
{/if}
