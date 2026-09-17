<script lang="ts">
  let open = $state(false);
  let trigger = $state<HTMLButtonElement>();
  let closeButton = $state<HTMLButtonElement>();

  function show() {
    open = true;
    requestAnimationFrame(() => closeButton?.focus());
  }

  function close() {
    open = false;
    requestAnimationFrame(() => trigger?.focus());
  }

  function handleKeydown(event: KeyboardEvent) {
    if (open && event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<button
  bind:this={trigger}
  type="button"
  class="help-button no-print"
  aria-label="Help"
  aria-haspopup="dialog"
  title="Help"
  onclick={show}
>
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9a2.6 2.6 0 1 1 4.5 1.75c-.85.85-2 1.3-2 2.75" />
    <path d="M12 16.5h.01" />
  </svg>
</button>

{#if open}
  <div class="help-backdrop" role="presentation" onclick={(event) => event.target === event.currentTarget && close()}>
    <div class="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <header>
        <h2 id="help-title">Need a hand?</h2>
        <button bind:this={closeButton} type="button" class="help-close" aria-label="Close help" onclick={close}>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </header>
      <p>
        If you’re running into trouble or have suggestions, email us at
        <a href="mailto:support@teacher.dev?subject=Growing%20Reader">support@teacher.dev</a>.
      </p>
    </div>
  </div>
{/if}

<style>
  .help-button {
    position: fixed;
    z-index: 25;
    bottom: 1rem;
    left: 1rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--muted);
  }

  .help-button svg {
    width: 22px;
    height: 22px;
  }

  .help-button:hover,
  .help-button:focus-visible {
    color: var(--blue-dark);
    background: var(--blue-soft);
  }

  .help-backdrop {
    position: fixed;
    z-index: 100;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: rgba(34, 43, 64, 0.35);
    backdrop-filter: blur(2px);
  }

  .help-dialog {
    width: min(27.5rem, 100%);
    padding: 1.25rem;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--paper);
    box-shadow: 0 18px 60px rgba(34, 43, 64, 0.24);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.85rem;
  }

  h2 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 800;
  }

  .help-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    flex: none;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--muted);
  }

  .help-close svg {
    width: 1.15rem;
    height: 1.15rem;
  }

  .help-close:hover,
  .help-close:focus-visible {
    color: var(--blue-dark);
    background: var(--blue-soft);
  }

  p {
    margin: 0;
    color: var(--ink);
    font-size: 0.95rem;
    line-height: 1.6;
  }

  a {
    color: var(--blue-dark);
    font-weight: 700;
    text-underline-offset: 4px;
  }

  @media (max-width: 680px) {
    .help-button {
      bottom: calc(92px + env(safe-area-inset-bottom, 0px));
    }
  }
</style>
