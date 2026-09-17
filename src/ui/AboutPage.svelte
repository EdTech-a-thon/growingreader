<script lang="ts">
  import Footer from './Footer.svelte';
</script>

<div class="legal-page">
  <header class="legal-header">
    <a class="legal-brand" href="/" data-app-link><span class="legal-logo"><img src="/logo.svg" alt="" /></span><span>Growing Reader</span></a>
    <a class="text-button" href="/" data-app-link>← Back to app</a>
  </header>

  <main class="legal-main">
    <h1>About</h1>
    <p class="legal-lede">A classroom-friendly reading fluency tool built for teachers and their students.</p>

    <section class="legal-card">
      <div class="legal-card-title">
        <img src="/logo.svg" alt="" />
        <h2>From teacher.dev</h2>
      </div>
      <p>
        Growing Reader is a free classroom tool from <a href="https://teacher.dev" target="_blank" rel="noopener noreferrer">teacher.dev</a>,
        a home for practical, teacher-first software. It helps teachers capture oral readings, review them quickly, and watch student reading growth over time.
      </p>

      <figure class="polaroid">
        <img src="/2026participants.jpg" alt="Participants of the 2026 EdTech-a-thon" />
        <figcaption>Built with the EdTech-a-thon spirit</figcaption>
      </figure>
    </section>

    <section class="legal-card">
      <h2>Our promise</h2>
      <ul class="promise-list">
        <li><strong>Zero paywalls.</strong></li>
        <li><strong>Zero ads.</strong></li>
        <li><strong>Private by default.</strong> Student recordings stay on the device unless you choose what to sync elsewhere.</li>
      </ul>
    </section>

    <section class="legal-card">
      <h2>Feedback & ideas</h2>
      <p>Tell us what is working, what is not, or what would make Growing Reader more useful in your classroom.</p>
      <a class="button primary" href="https://teacher.dev" target="_blank" rel="noopener noreferrer">Visit teacher.dev</a>
    </section>
  </main>

  <Footer />
</div>
