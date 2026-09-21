<script lang="ts">
  import { onMount } from 'svelte';
  import Modal from './Modal.svelte';
  import { useApp } from '../app/context';
  import instructions from '../../public/extract-passage.md?raw';
  import type { ReadFailure } from './read-files';
  import Copy from '@lucide/svelte/icons/copy';
  import Check from '@lucide/svelte/icons/check';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import Upload from '@lucide/svelte/icons/upload';

  let {
    failures,
    onfiles,
    onclose,
  }: {
    failures: ReadFailure[];
    /** The converted file, handed back without leaving these instructions. */
    onfiles: (files: File[]) => void;
    onclose: () => void;
  } = $props();

  /**
   * A scan has no text in it to take — reading a PDF gets its text layer, not the picture
   * of the page — and some formats we do not open at all. An assistant can read either and
   * hand back a .txt, so the way out is the five moves below rather than typing it all in.
   */
  const ASSISTANTS = [
    { name: 'ChatGPT', url: 'https://chatgpt.com/' },
    { name: 'Claude', url: 'https://claude.ai/new' },
    { name: 'Gemini', url: 'https://gemini.google.com/app' },
  ];

  const app = useApp();
  let copied = $state(false);
  let copyFailed = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function copy() {
    try {
      await navigator.clipboard.writeText(instructions);
      copied = true;
      copyFailed = false;
      clearTimeout(timer);
      timer = setTimeout(() => (copied = false), 2000);
    } catch {
      // A Chromebook can refuse the clipboard; the instructions are on screen to select by hand.
      copyFailed = true;
    }
  }

  function open(url: string) {
    // The chat that opens is a place to paste, so make sure there is something to paste.
    void copy().finally(() => window.open(url, '_blank', 'noopener'));
  }

  const single = $derived(failures.length === 1 ? failures[0] : undefined);

  // Step 5 is done here, on these instructions: coming back with the .txt and finding
  // nowhere to put it is the moment the teacher gives up.
  let dragDepth = $state(0);
  const dropping = $derived(dragDepth > 0);
  let fileInput = $state<HTMLInputElement | undefined>(undefined);

  function take(files: FileList | File[] | null | undefined) {
    const list = [...(files ?? [])];
    dragDepth = 0;
    if (list.length > 0) onfiles(list);
  }

  /**
   * While these instructions are up they own every drop, wherever it lands — on the panel,
   * on the dimmed area around it, or on the page behind. Aiming at a step is not the job;
   * the teacher has the file and this is the thing asking for it. Capture phase, so the
   * Passages screen's own drop target never sees it first.
   */
  onMount(() => {
    const over = (e: DragEvent) => {
      e.preventDefault();
      if (dragDepth === 0) dragDepth = 1;
    };
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) dragDepth = 0;
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      take(e.dataTransfer?.files);
    };
    window.addEventListener('dragover', over, true);
    window.addEventListener('dragleave', leave, true);
    window.addEventListener('drop', drop, true);
    return () => {
      window.removeEventListener('dragover', over, true);
      window.removeEventListener('dragleave', leave, true);
      window.removeEventListener('drop', drop, true);
    };
  });
</script>

<Modal title={single ? `${single.fileName} could not be read` : `${failures.length} files could not be read`} eyebrow="Passages" wide {onclose}>
<div class="convert-help" class:dropping>
  <div class="banner warn-banner">
    <span class="banner-mark">!</span>
    <span class="grow">
      {#if single}
        {single.reason}
      {:else}
        <ul class="failure-list">
          {#each failures as failure (failure.fileName)}
            <li><strong>{failure.fileName}</strong> — {failure.reason}</li>
          {/each}
        </ul>
      {/if}
    </span>
  </div>

  <p class="field-help">
    Growing Reader reads the text inside a PDF; it cannot read a picture of a page. Any AI assistant can, though — it will hand you back a plain text file to drop
    in here. About a minute.
  </p>

  <ol class="convert-steps">
    <li>
      <span class="convert-step-mark" data-done={copied ? 'true' : undefined}>{#if copied}<Check size={16} aria-hidden="true" />{:else}1{/if}</span>
      <span class="grow">
        <strong>Copy the instructions</strong>
        <small>They tell the assistant exactly what to leave out, so the word count stays right.</small>
      </span>
      <button class="button secondary small" type="button" onclick={copy}>
        {#if copied}<Check size={16} aria-hidden="true" />Copied{:else}<Copy size={16} aria-hidden="true" />Copy instructions{/if}
      </button>
    </li>
    <li>
      <span class="convert-step-mark">2</span>
      <span class="grow">
        <strong>Open the assistant you use</strong>
        <small>Paste the instructions into a new chat.</small>
      </span>
      <span class="assistant-links">
        {#each ASSISTANTS as assistant (assistant.name)}
          <button class="button secondary small" type="button" onclick={() => open(assistant.url)}>
            {assistant.name}<ExternalLink size={14} aria-hidden="true" />
          </button>
        {/each}
      </span>
    </li>
    <li>
      <span class="convert-step-mark">3</span>
      <span class="grow">
        <strong>Attach {single ? single.fileName : 'your files'}</strong>
        <small>In the same message, then send it.</small>
      </span>
    </li>
    <li>
      <span class="convert-step-mark">4</span>
      <span class="grow">
        <strong>Save the .txt it gives back</strong>
        <small>Check the words against the paper copy while you are there.</small>
      </span>
    </li>
    <li class="convert-drop" class:dropping>
      <span class="convert-step-mark">5</span>
      <span class="grow">
        <strong>Drop the file here</strong>
        <small>Anywhere on this window while these instructions are open. You will see the word count before anything is saved.</small>
      </span>
      <button class="button secondary small" type="button" onclick={() => fileInput?.click()}>
        <Upload size={16} aria-hidden="true" />Choose the file
      </button>
      <input
        bind:this={fileInput}
        class="visually-hidden"
        type="file"
        multiple
        accept={app.importAccept}
        aria-label="Choose the converted file"
        onchange={(e) => {
          const input = e.currentTarget;
          take(input.files);
          input.value = '';
        }}
      />
    </li>
  </ol>

  {#if copyFailed}
    <p class="field-help" role="alert">This device would not let the app use the clipboard. Select the instructions below and copy them by hand.</p>
    <div class="passage-text">{instructions}</div>
  {/if}

  <footer class="modal-actions single">
    <button class="button secondary" type="button" onclick={onclose}>Close instructions</button>
  </footer>
</div>
</Modal>
