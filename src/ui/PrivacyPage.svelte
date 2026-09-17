<script lang="ts">
  import Footer from './Footer.svelte';
</script>

<div class="legal-page">
  <header class="legal-header">
    <a class="legal-brand" href="/" data-app-link><span class="legal-logo"><img src="/logo.svg" alt="" /></span><span>Growing Reader</span></a>
    <a class="text-button" href="/" data-app-link>← Back to app</a>
  </header>

  <main class="legal-main">
    <h1>Privacy</h1>
    <p class="legal-lede">What we collect, what we do not, and why.</p>

    <section class="legal-card">
      <p>
        Growing Reader is designed to be private by default. Student names, passages, readings, notes, transcripts, and audio recordings are stored in your browser on this device.
        Audio recordings and speech analysis do not leave the device.
      </p>
      <p>
        Google Sheets sync is optional. If you connect a sheet, Growing Reader sends the roster, passages, reading results, notes, and transcript text needed to keep your classroom records in sync. It does not sync audio recordings.
      </p>
      <p>
        Growing Reader does not sell visitor data, show ads, or track students across websites. Clearing this browser's site data will remove locally stored Growing Reader data from this device.
      </p>
      <p>
        Questions or concerns? Visit <a href="https://teacher.dev" target="_blank" rel="noopener noreferrer">teacher.dev</a>.
      </p>
    </section>
  </main>

  <Footer />
</div>
