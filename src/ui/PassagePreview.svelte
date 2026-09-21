<script lang="ts">
  import Modal from './Modal.svelte';
  import type { Passage } from '../domain/types';

  let { passage, onclose }: { passage: Passage; onclose: () => void } = $props();
</script>

<!--
  Read-only on purpose: this is the teacher checking the words against the paper copy
  in her hand, which is a different act from editing them. Edit is one tap away.
-->
<Modal title={passage.title} eyebrow="What the app read" wide tall {onclose}>
  <div class="passage-view">
    <p class="count-line">
      {passage.wordCount} {passage.wordCount === 1 ? 'word' : 'words'}{passage.source ? `, estimated from ${passage.source.fileName}` : ''}.
      <span class="field-help" style="display:inline;font-weight:600">This is the text the rate is counted from. Edit the passage if it does not match the paper copy.</span>
    </p>
    <div class="passage-text">{passage.text}</div>
  </div>
</Modal>
