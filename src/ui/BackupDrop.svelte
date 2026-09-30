<script lang="ts">
  import { onMount } from 'svelte';
  import { useApp } from '../app/context';
  import type { Backup } from '../domain/backup';
  import { isBackupFile, readBackupFile } from './backup-file';
  import Modal from './Modal.svelte';

  /** Off on the student-facing screens: a drop there is ignored, not offered as an import. */
  let { enabled, onimported }: { enabled: boolean; onimported?: () => void } = $props();

  const app = useApp();
  let pending = $state.raw<{ name: string; backup: Backup } | undefined>(undefined);
  let message = $state<string | undefined>(undefined);

  const withAudio = $derived(pending?.backup.audio.size ?? 0);

  /**
   * A backup dropped anywhere in the app is offered for import. Capture phase, and marked
   * handled with preventDefault, so the Passages screen's drop targets leave it alone.
   */
  onMount(() => {
    const drop = async (e: DragEvent) => {
      const file = [...(e.dataTransfer?.files ?? [])].find(isBackupFile);
      if (!enabled || !file) return;
      e.preventDefault();
      try {
        pending = { name: file.name, backup: await readBackupFile(file) };
      } catch (err) {
        message = `Could not import ${file.name}: ${err instanceof Error ? err.message : String(err)}`;
      }
    };
    window.addEventListener('drop', drop, true);
    return () => window.removeEventListener('drop', drop, true);
  });

  async function confirm() {
    if (!pending) return;
    const { backup } = pending;
    pending = undefined;
    try {
      await app.importBackup(backup);
      onimported?.();
      message = `Imported ${app.students.length} students, ${app.passages.length} passages and ${app.readings.length} readings.`;
    } catch (err) {
      message = `Could not import: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
</script>

{#if pending}
  <Modal title="Import this backup?" eyebrow={pending.name} onclose={() => (pending = undefined)}>
    <p>
      It holds {pending.backup.students.length} students, {pending.backup.passages.length} passages and {pending.backup.readings.length} readings,
      {withAudio} with audio. Importing <strong>replaces everything on this device</strong>.
    </p>
    <footer class="modal-actions">
      <button class="button secondary" onclick={() => (pending = undefined)}>Cancel</button>
      <button class="button primary" onclick={confirm}>Replace and import</button>
    </footer>
  </Modal>
{/if}

{#if message}
  <div class="toast" role="status">
    <span class="toast-text">{message}</span>
    <button class="toast-dismiss" onclick={() => (message = undefined)} aria-label="Dismiss">×</button>
  </div>
{/if}
