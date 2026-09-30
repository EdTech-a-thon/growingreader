<script lang="ts">
  import { Chart, LineController, LineElement, PointElement, LinearScale, Tooltip, Legend, type ChartConfiguration, type Plugin } from 'chart.js';
  import type { Passage, Reading } from '../domain/types';
  import { rate, wordsCorrectPerMinute } from '../domain/rate';
  import { accuracy } from '../domain/marks';
  import { formatDate, formatDateTime } from './format';

  Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, Legend);

  let { readings, passages, onselect }: { readings: Reading[]; passages: Passage[]; onselect?: (readingId: string) => void } = $props();

  const passageOf = (id: string | undefined) => passages.find((p) => p.id === id);

  /** One point per complete reading with a rate, oldest first. Same-day readings stay separate. */
  const points = $derived(
    readings
      .filter((r) => r.completion === 'complete')
      .map((r) => ({ reading: r, rate: rate(r, passageOf(r.passageId)), wcpm: wordsCorrectPerMinute(r, passageOf(r.passageId)), accuracy: accuracy(r, passageOf(r.passageId)) }))
      .filter((p): p is typeof p & { rate: number } => p.rate !== undefined)
      .sort((a, b) => a.reading.recordedAt - b.reading.recordedAt),
  );
  const completeWithoutPassage = $derived(readings.some((r) => r.completion === 'complete' && !passageOf(r.passageId)));

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

  // A new passage version is marked like a new passage: the app cannot tell a typo fix from a rewrite (ADR-0007).
  const passageChanges = $derived(
    points.flatMap((p, i) => {
      if (i === 0) return [];
      const before = points[i - 1].reading;
      const title = passageOf(p.reading.passageId)?.title ?? 'Passage';
      if (p.reading.passageId !== before.passageId) return [{ i, title, edited: false, label: `New passage: ${title}` }];
      if (p.reading.passageVersion !== before.passageVersion) return [{ i, title, edited: true, label: `Passage edited: ${title}` }];
      return [];
    }),
  );
  const describe = (i: number) => {
    const p = points[i];
    const change = passageChanges.find((c) => c.i === i);
    const parts = [`${formatDate(p.reading.recordedAt)}: ${Math.round(p.rate)} words per minute`];
    if (p.wcpm !== undefined) parts.push(`${Math.round(p.wcpm)} words correct per minute`);
    if (p.accuracy !== undefined) parts.push(`${Math.round(p.accuracy * 100)}% accuracy`);
    if (change) parts.push(`${change.edited ? 'passage edited' : 'new passage'}: ${change.title}`);
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
    // Three lines that must be told apart at a glance: each its own colour and its own marker.
    const rateColor = token('--blue', '#437b50');
    const wcpmColor = '#2f6fb3';
    const changeColor = token('--amber', '#b7791f');
    const accuracyColor = '#8a4fb8';
    const hasAccuracy = points.some((p) => p.accuracy !== undefined);
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

    /**
     * A dashed line and label wherever the passage changes, because difficulty changes the
     * number (ADR-0001). The labels sit in a band above the plot, in as many rows as they need
     * so none overlaps another; one that fits no row is left to the tooltip.
     */
    const LABEL_ROWS = 3;
    const ROW_HEIGHT = 15;
    const passageMarks: Plugin<'line'> = {
      id: 'passageMarks',
      beforeDatasetsDraw(chart) {
        if (changes.length === 0) return;
        const { ctx, chartArea, scales } = chart;
        ctx.save();
        ctx.font = `700 11px ${font.family}`;
        ctx.fillStyle = changeColor;
        ctx.strokeStyle = changeColor;
        const rowEnds: number[] = [];
        for (const change of changes) {
          const x = scales.x.getPixelForValue(positions[change.i]) - 12;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.moveTo(x, chartArea.top);
          ctx.lineTo(x, chartArea.bottom);
          ctx.stroke();
          const width = ctx.measureText(change.label).width;
          // Left of the line near the right edge, else right of it.
          const left = x + 6 + width > chartArea.right ? x - 6 - width : x + 6;
          const row = [...Array(LABEL_ROWS).keys()].find((r) => (rowEnds[r] ?? -Infinity) + 10 <= left);
          if (row === undefined) continue;
          rowEnds[row] = left + width;
          const y = chartArea.top - 6 - row * ROW_HEIGHT;
          ctx.textAlign = 'left';
          ctx.fillText(change.label, left, y);
          // A tick from the label down to its line, so a raised label still points at it.
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(x, y + 3);
          ctx.lineTo(x, chartArea.top);
          ctx.stroke();
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
            pointStyle: 'circle' as const,
          },
          ...(snapshot.some((p) => p.wcpm !== undefined)
            ? [
                {
                  label: 'Words correct per minute',
                  data: snapshot.map((p, i) => ({ x: positions[i], y: p.wcpm ?? NaN })),
                  spanGaps: true,
                  borderDash: [5, 4],
                  ...pointStyle(wcpmColor),
                  pointRadius: 4,
                  pointStyle: 'rect' as const,
                },
              ]
            : []),
          // Accuracy is a share, not a rate: its own 0–100% scale on the right.
          ...(hasAccuracy
            ? [
                {
                  label: 'Accuracy',
                  data: snapshot.map((p, i) => ({ x: positions[i], y: p.accuracy === undefined ? NaN : p.accuracy * 100 })),
                  yAxisID: 'accuracy',
                  spanGaps: true,
                  borderDash: [2, 3],
                  ...pointStyle(accuracyColor),
                  pointRadius: 4.5,
                  pointStyle: 'triangle' as const,
                },
              ]
            : []),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        // Room above the plot for the passage labels' rows.
        layout: { padding: { top: changes.length > 0 ? 8 + LABEL_ROWS * ROW_HEIGHT : 8, right: 16 } },
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
          accuracy: {
            display: hasAccuracy,
            position: 'right',
            min: 0,
            max: 100,
            grid: { display: false },
            border: { display: false },
            ticks: { color: muted, font, maxTicksLimit: 6, padding: 8, callback: (value) => `${value}%` },
            title: { display: true, text: 'accuracy', color: muted, font: { ...font, weight: 'bold' } },
          },
        },
        plugins: {
          legend: {
            display: snapshot.some((p) => p.wcpm !== undefined) || hasAccuracy,
            position: 'bottom',
            // Each line's own marker and colour, as drawn.
            labels: { color: ink, font, usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 16 },
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
            boxWidth: 9,
            boxHeight: 9,
            boxPadding: 6,
            // Otherwise each marker sits on a white square and reads as white.
            multiKeyBackground: 'transparent',
            callbacks: {
              title: (items) => {
                const p = snapshot[items[0].dataIndex];
                return formatDateTime(p.reading.recordedAt);
              },
              label: (item) => (item.dataset.yAxisID === 'accuracy' ? ` ${Math.round(item.parsed.y ?? 0)}% accuracy` : ` ${Math.round(item.parsed.y ?? 0)} ${item.dataset.label?.toLowerCase()}`),
              afterBody: (items) => {
                const p = snapshot[items[0].dataIndex];
                const title = passageOf(p.reading.passageId)?.title;
                return title ? [``, title, onselect ? 'Tap to open' : ''] : [];
              },
              // The same marker and colour as the line, so a number is easy to match to it.
              labelPointStyle: (item) => ({ pointStyle: ((item.dataset as { pointStyle?: 'circle' | 'rect' | 'triangle' }).pointStyle ?? 'circle'), rotation: 0 }),
              labelColor: (item) => {
                const color = String(item.dataset.borderColor);
                return { borderColor: color, backgroundColor: color, borderWidth: 1 };
              },
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
  {#if completeWithoutPassage}
    <p class="subtext">No rates yet. A complete reading still needs a passage. Open it and choose the passage to calculate a rate.</p>
  {:else}
    <p class="subtext">No rates yet. Open a reading, choose its passage, and mark it complete to add its rate here.</p>
  {/if}
{:else}
  <div class="chart" role="img" aria-label="Rate and accuracy over time: {points.length} readings">
    <canvas bind:this={canvas}></canvas>
  </div>
  <ul class="sr-only" aria-label="Readings on the chart">
    {#each points as p, i (p.reading.id)}
      <li><button type="button" onclick={() => onselect?.(p.reading.id)}>{describe(i)}</button></li>
    {/each}
  </ul>
{/if}
