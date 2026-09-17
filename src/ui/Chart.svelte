<script lang="ts">
  import { Chart, LineController, LineElement, PointElement, LinearScale, Tooltip, Legend, type ChartConfiguration, type Plugin } from 'chart.js';
  import type { Passage, Reading } from '../domain/types';
  import { rate, wordsCorrectPerMinute } from '../domain/rate';
  import { formatDate, formatDateTime } from './format';

  Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, Legend);

  let { readings, passages, onselect }: { readings: Reading[]; passages: Passage[]; onselect?: (readingId: string) => void } = $props();

  const passageOf = (id: string | undefined) => passages.find((p) => p.id === id);

  /** One point per complete reading with a rate, oldest first. Same-day readings stay separate. */
  const points = $derived(
    readings
      .filter((r) => r.completion === 'complete')
      .map((r) => ({ reading: r, rate: rate(r, passageOf(r.passageId)), wcpm: wordsCorrectPerMinute(r, passageOf(r.passageId)) }))
      .filter((p): p is typeof p & { rate: number } => p.rate !== undefined)
      .sort((a, b) => a.reading.recordedAt - b.reading.recordedAt),
  );

  // Rate against date, but two readings minutes apart must still be two visible points:
  // place by time on a 0..1000 axis, then push any point that lands too close to its predecessor right.
  const SPAN = 1000;
  const MIN_GAP = 28;
  const xs = $derived.by(() => {
    if (points.length <= 1) return points.map(() => SPAN / 2);
    const t0 = points[0].reading.recordedAt;
    const t1 = points[points.length - 1].reading.recordedAt;
    const span = Math.max(1, t1 - t0);
    const raw = points.map((p) => ((p.reading.recordedAt - t0) / span) * SPAN);
    for (let i = 1; i < raw.length; i++) raw[i] = Math.max(raw[i], raw[i - 1] + MIN_GAP);
    const overflow = raw[raw.length - 1] - SPAN;
    return overflow > 0 ? raw.map((x) => x * (SPAN / (SPAN + overflow))) : raw;
  });

  const passageChanges = $derived(
    points.flatMap((p, i) => (i > 0 && p.reading.passageId !== points[i - 1].reading.passageId ? [{ i, title: passageOf(p.reading.passageId)?.title ?? 'Passage' }] : [])),
  );
  const describe = (i: number) => {
    const p = points[i];
    const change = passageChanges.find((c) => c.i === i);
    const parts = [`${formatDate(p.reading.recordedAt)}: ${Math.round(p.rate)} words per minute`];
    if (p.wcpm !== undefined) parts.push(`${Math.round(p.wcpm)} words correct per minute`);
    if (change) parts.push(`new passage: ${change.title}`);
    return parts.join(', ');
  };

  let canvas = $state<HTMLCanvasElement | undefined>(undefined);

  function token(name: string, fallback: string) {
    if (typeof getComputedStyle !== 'function') return fallback;
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  $effect(() => {
    // jsdom has no 2d context; the list beside the canvas carries the same data there and for screen readers.
    if (!canvas || points.length === 0 || !canvas.getContext?.('2d')) return;
    const ink = token('--ink', '#26324a');
    const muted = token('--muted', '#6e7890');
    const line = token('--line', '#e3e8f1');
    const paper = token('--paper', '#ffffff');
    const rateColor = token('--blue', '#437b50');
    const wcpmColor = token('--green', '#3f9b77');
    const changeColor = token('--amber', '#b7791f');
    const font = { family: getComputedStyle(document.body).fontFamily, size: 12 };
    const snapshot = points;
    const positions = xs;
    const changes = passageChanges;

    /** A hairline at the hovered reading, so the pointer aims at a date rather than a dot. */
    const crosshair: Plugin<'line'> = {
      id: 'crosshair',
      afterDatasetsDraw(chart) {
        const active = chart.tooltip?.getActiveElements();
        if (!active?.length) return;
        const { ctx, chartArea } = chart;
        const x = active[0].element.x;
        ctx.save();
        ctx.strokeStyle = muted;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.restore();
      },
    };

    /** A dashed line and label wherever the passage changes, because difficulty changes the number (ADR-0001). */
    const passageMarks: Plugin<'line'> = {
      id: 'passageMarks',
      beforeDatasetsDraw(chart) {
        if (changes.length === 0) return;
        const { ctx, chartArea, scales } = chart;
        ctx.save();
        ctx.font = `700 11px ${font.family}`;
        ctx.fillStyle = changeColor;
        ctx.strokeStyle = changeColor;
        ctx.setLineDash([5, 4]);
        for (const change of changes) {
          const x = scales.x.getPixelForValue(positions[change.i]) - 12;
          ctx.beginPath();
          ctx.moveTo(x, chartArea.top);
          ctx.lineTo(x, chartArea.bottom);
          ctx.stroke();
          const nearRightEdge = x > chartArea.left + (chartArea.right - chartArea.left) * 0.66;
          ctx.textAlign = nearRightEdge ? 'right' : 'left';
          ctx.fillText(`New passage: ${change.title}`, x + (nearRightEdge ? -6 : 6), chartArea.top + 12);
        }
        ctx.restore();
      },
    };

    const pointStyle = (color: string) => ({
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointHitRadius: 14,
      pointBorderColor: paper,
      pointBorderWidth: 2,
      pointHoverBorderWidth: 2,
      tension: 0,
    });

    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Words per minute',
            data: snapshot.map((p, i) => ({ x: positions[i], y: p.rate })),
            ...pointStyle(rateColor),
          },
          ...(snapshot.some((p) => p.wcpm !== undefined)
            ? [
                {
                  label: 'Words correct per minute',
                  data: snapshot.map((p, i) => ({ x: positions[i], y: p.wcpm ?? NaN })),
                  spanGaps: true,
                  borderDash: [5, 4],
                  ...pointStyle(wcpmColor),
                  pointRadius: 3.5,
                },
              ]
            : []),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 8, right: 16 } },
        interaction: { mode: 'index', intersect: false, axis: 'x' },
        onClick: (_event, elements) => {
          const hit = elements[0];
          if (hit) onselect?.(snapshot[hit.index].reading.id);
        },
        onHover: (event, elements) => {
          const target = event.native?.target as HTMLElement | null;
          if (target) target.style.cursor = elements.length && onselect ? 'pointer' : 'default';
        },
        scales: {
          x: {
            type: 'linear',
            min: -MIN_GAP,
            max: SPAN + MIN_GAP,
            grid: { display: false },
            border: { color: line },
            afterBuildTicks: (axis) => {
              axis.ticks = positions.map((value) => ({ value }));
            },
            ticks: {
              color: muted,
              font,
              autoSkip: true,
              maxRotation: 0,
              callback: (value) => {
                const i = positions.indexOf(Number(value));
                return i >= 0 ? formatDate(snapshot[i].reading.recordedAt) : '';
              },
            },
          },
          y: {
            beginAtZero: true,
            suggestedMax: Math.max(20, ...snapshot.map((p) => p.rate)) * 1.15,
            grid: { color: line },
            border: { display: false },
            ticks: { color: muted, font, maxTicksLimit: 6, padding: 8 },
            title: { display: true, text: 'words per minute', color: muted, font: { ...font, weight: 'bold' } },
          },
        },
        plugins: {
          legend: {
            display: snapshot.some((p) => p.wcpm !== undefined),
            position: 'bottom',
            labels: { color: ink, font, usePointStyle: true, pointStyle: 'line', boxWidth: 24 },
          },
          tooltip: {
            backgroundColor: ink,
            titleColor: paper,
            bodyColor: paper,
            titleFont: { ...font, weight: 'bold' },
            bodyFont: font,
            padding: 10,
            cornerRadius: 8,
            displayColors: true,
            usePointStyle: true,
            boxPadding: 4,
            callbacks: {
              title: (items) => {
                const p = snapshot[items[0].dataIndex];
                return formatDateTime(p.reading.recordedAt);
              },
              label: (item) => ` ${Math.round(item.parsed.y ?? 0)} ${item.dataset.label?.toLowerCase()}`,
              afterBody: (items) => {
                const p = snapshot[items[0].dataIndex];
                const title = passageOf(p.reading.passageId)?.title;
                return title ? [``, title, onselect ? 'Tap to open' : ''] : [];
              },
              labelPointStyle: () => ({ pointStyle: 'line' as const, rotation: 0 }),
            },
          },
        },
      },
      plugins: [passageMarks, crosshair],
    };

    const chart = new Chart(canvas, config);
    return () => chart.destroy();
  });
</script>

{#if points.length === 0}
  <p class="subtext">No complete readings yet. Rates appear here once a reading is reviewed and marked complete.</p>
{:else}
  <div class="chart" role="img" aria-label="Rate over time: {points.length} readings">
    <canvas bind:this={canvas}></canvas>
  </div>
  <ul class="sr-only" aria-label="Readings on the chart">
    {#each points as p, i (p.reading.id)}
      <li><button type="button" onclick={() => onselect?.(p.reading.id)}>{describe(i)}</button></li>
    {/each}
  </ul>
{/if}
