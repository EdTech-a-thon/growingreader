<script lang="ts">
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import ChartNoAxesCombined from '@lucide/svelte/icons/chart-no-axes-combined';
  import Mic from '@lucide/svelte/icons/mic';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import BrandMark from './BrandMark.svelte';
  import Footer from './Footer.svelte';

  let { onstart }: { onstart: () => void } = $props();
</script>

<div class="welcome-page">
  <header class="welcome-header">
    <div class="welcome-wordmark"><span class="welcome-logo"><BrandMark size={27} /></span><span>Growing Reader</span></div>
    <a href="https://teacher.dev" target="_blank" rel="noreferrer">Built by teacher.dev</a>
  </header>

  <main>
    <section class="welcome-hero">
      <div class="welcome-copy">
        <p class="welcome-eyebrow">Reading growth, made visible</p>
        <h1>See every reader grow.</h1>
        <p class="welcome-lede">Hand over the Chromebook, let a student read, and get a clear reading rate you can follow over time.</p>
        <button class="welcome-cta" onclick={onstart}>Start with your roster <ArrowRight size={19} aria-hidden="true" /></button>
        <p class="welcome-fineprint">No account required. Works offline after the first load.</p>
      </div>

      <div class="growth-art" role="img" aria-label="A student's reading-rate card climbing from 48 to 82 words per minute over the year">
        <svg viewBox="0 0 600 500" font-family="Inter, ui-sans-serif, system-ui, sans-serif">
          <defs>
            <filter id="art-card-shadow" x="-15%" y="-15%" width="130%" height="135%">
              <feDropShadow dx="0" dy="10" stdDeviation="11" flood-color="#31543a" flood-opacity=".1" />
            </filter>
            <filter id="art-chip-shadow" x="-15%" y="-30%" width="130%" height="180%">
              <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#31543a" flood-opacity=".1" />
            </filter>
            <!-- One leaf, pointing up-left with its base at the origin; mirror it for the right side. -->
            <path id="art-leaf" d="M0 0c-4.5 0-7.5-3-8-7.5 4.5 0 7.5 3 8 7.5Z" />
            <g id="art-sprout" fill="currentColor" stroke="currentColor" stroke-linecap="round">
              <path d="M12 21v-8" stroke-width="2.4" fill="none" />
              <use href="#art-leaf" transform="translate(12 14) scale(1.1)" stroke="none" />
              <use href="#art-leaf" transform="translate(12 14) scale(-1.1 1.1)" stroke="none" />
            </g>
            <g id="art-plant" fill="currentColor" stroke="currentColor" stroke-linecap="round">
              <path d="M12 22V8" stroke-width="2.4" fill="none" />
              <use href="#art-leaf" transform="translate(12 17) scale(.85)" stroke="none" />
              <use href="#art-leaf" transform="translate(12 17) scale(-.85 .85)" stroke="none" />
              <use href="#art-leaf" transform="translate(12 11) scale(.7)" stroke="none" />
              <use href="#art-leaf" transform="translate(12 11) scale(-.7 .7)" stroke="none" />
            </g>
            <g id="art-tree" fill="currentColor" stroke="currentColor" stroke-linecap="round">
              <path d="M12 22V4" stroke-width="2.4" fill="none" />
              <use href="#art-leaf" transform="translate(12 18) scale(.85)" stroke="none" />
              <use href="#art-leaf" transform="translate(12 18) scale(-.85 .85)" stroke="none" />
              <use href="#art-leaf" transform="translate(12 13) scale(.78)" stroke="none" />
              <use href="#art-leaf" transform="translate(12 13) scale(-.78 .78)" stroke="none" />
              <use href="#art-leaf" transform="translate(12 8) scale(.65)" stroke="none" />
              <use href="#art-leaf" transform="translate(12 8) scale(-.65 .65)" stroke="none" />
            </g>
          </defs>

          <!-- Progress card -->
          <g filter="url(#art-card-shadow)">
            <rect x="150" y="90" width="300" height="384" rx="16" fill="#fff" stroke="#e1eadd" />
          </g>
          <g transform="translate(176 110)" color="#437b50"><use href="#art-plant" /></g>
          <text x="208" y="129" font-size="17" font-weight="800" fill="#294033" letter-spacing="-.01em">Maya R.</text>
          <text x="176" y="154" font-size="12" font-weight="600" fill="#728477">Reading rate · words per minute</text>
          <path d="M176 170h248" stroke="#edf2ea" stroke-width="1.5" />

          <path d="M176 200h248M176 245h248M176 290h248M176 335h248M176 380h248" stroke="#eef3ec" stroke-width="1.5" />
          <path d="M196 362C240 356 266 320 300 296S364 236 404 214V380H196Z" fill="#437b50" opacity=".08" />
          <path d="M196 362C240 356 266 320 300 296S364 236 404 214" fill="none" stroke="#437b50" stroke-width="4" stroke-linecap="round" />
          <g fill="#fff" stroke="#437b50" stroke-width="4">
            <circle cx="196" cy="362" r="7" />
            <circle cx="300" cy="296" r="7" />
            <circle cx="404" cy="214" r="7" fill="#437b50" />
          </g>
          <g font-size="11" font-weight="700" fill="#728477" text-anchor="middle" letter-spacing=".1em">
            <text x="196" y="410">SEPT</text><text x="300" y="410">DEC</text><text x="404" y="410">MAR</text>
          </g>
          <rect x="176" y="432" width="156" height="26" rx="13" fill="#e8f5e9" />
          <text x="254" y="449" font-size="12" font-weight="800" fill="#3e7549" text-anchor="middle">▲ 34 WPM this year</text>

          <!-- Callout chips -->
          <path d="M384 64v24" stroke="#b9cdb3" stroke-width="2" stroke-dasharray="4 6" stroke-linecap="round" />

          <g transform="translate(0 348) rotate(-5)" filter="url(#art-chip-shadow)">
            <rect width="168" height="44" rx="13" fill="#fff" stroke="#e1eadd" />
            <g transform="translate(14 10)" color="#5f9364"><use href="#art-sprout" /></g>
            <text x="48" y="28" font-size="15" font-weight="800" fill="#294033">Sept · 48 WPM</text>
          </g>
          <g transform="translate(432 276) rotate(4)" filter="url(#art-chip-shadow)">
            <rect width="160" height="44" rx="13" fill="#fff" stroke="#e1eadd" />
            <g transform="translate(14 10)" color="#4f8a5b"><use href="#art-plant" /></g>
            <text x="48" y="28" font-size="15" font-weight="800" fill="#294033">Dec · 67 WPM</text>
          </g>
          <g transform="translate(290 22) rotate(-3)" filter="url(#art-chip-shadow)">
            <rect width="184" height="44" rx="13" fill="#356b42" />
            <g transform="translate(14 10)" color="#dff0db"><use href="#art-tree" /></g>
            <text x="48" y="28" font-size="15" font-weight="800" fill="#fff">March · 82 WPM</text>
          </g>
        </svg>
      </div>
    </section>

    <section class="welcome-how" aria-labelledby="welcome-how-title">
      <p class="welcome-eyebrow">Simple from the first reading</p>
      <h2 id="welcome-how-title">You already know how it works.</h2>
      <div class="welcome-steps">
        <article><span><BookOpen size={22} /></span><h3>Add your roster and passages</h3><p>Paste student names and the texts they read. Set it up once, then reuse it.</p></article>
        <article><span><Mic size={22} /></span><h3>Let the student read</h3><p>Choose a student and passage, then hand over the device. One tap starts the reading.</p></article>
        <article><span><ChartNoAxesCombined size={22} /></span><h3>Watch progress take shape</h3><p>Review the reading, make any correction, and see growth across days and passages.</p></article>
      </div>
    </section>

    <section class="welcome-privacy" aria-labelledby="welcome-privacy-title">
      <span class="privacy-sprout"><ShieldCheck size={30} aria-hidden="true" /></span>
      <div><p class="welcome-eyebrow">Private by default</p><h2 id="welcome-privacy-title">Student voices stay with you.</h2><p>Recordings and speech analysis stay on this device. Google Sheets sync is optional and sends only the roster, passages, results, notes, and transcript text—never the audio.</p></div>
      <button class="welcome-cta secondary" onclick={onstart}>Get started <ArrowRight size={18} aria-hidden="true" /></button>
    </section>
  </main>

  <Footer />
</div>
