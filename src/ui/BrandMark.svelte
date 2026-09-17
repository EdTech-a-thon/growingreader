<script lang="ts">
  let { size = 24 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <path d="M32 52V27" stroke="currentColor" stroke-width="5" stroke-linecap="round" />
  <path d="M31.4 31.2C20.8 31.4 14.3 25.9 13 15.8c10.7-.9 17.6 4.6 18.4 15.4Z" fill="currentColor" opacity=".72" />
  <path d="M32.6 38c10.8-.2 17.3-5.8 18.5-16-10.8-.8-17.6 4.9-18.5 16Z" fill="currentColor" />
  <path d="M20 53h24" stroke="currentColor" stroke-width="5" stroke-linecap="round" opacity=".45" />
</svg>
