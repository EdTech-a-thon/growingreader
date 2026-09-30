import { playFrom, speechOffsets, speechOnsets, trimSilence } from './silence';

const RATE = 16000;

function signal(parts: Array<{ seconds: number; amplitude: number }>, noise = 0.002): Float32Array {
  const total = parts.reduce((n, p) => n + Math.round(p.seconds * RATE), 0);
  const out = new Float32Array(total);
  let i = 0;
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (const part of parts) {
    const n = Math.round(part.seconds * RATE);
    for (let k = 0; k < n; k++, i++) {
      out[i] = part.amplitude * Math.sin((2 * Math.PI * 220 * k) / RATE) + noise * rand();
    }
  }
  return out;
}

describe('trimSilence', () => {
  test('finds speech between leading and trailing quiet', () => {
    const samples = signal([
      { seconds: 1.0, amplitude: 0 },
      { seconds: 2.0, amplitude: 0.3 },
      { seconds: 1.5, amplitude: 0 },
    ]);
    const bounds = trimSilence(samples, RATE);
    expect(bounds.start).toBeCloseTo(1.0, 1);
    expect(bounds.end).toBeCloseTo(3.0, 1);
  });

  test('ignores a brief click in the quiet part', () => {
    const samples = signal([
      { seconds: 0.5, amplitude: 0 },
      { seconds: 0.02, amplitude: 0.5 },
      { seconds: 0.98, amplitude: 0 },
      { seconds: 2.0, amplitude: 0.3 },
      { seconds: 1.0, amplitude: 0 },
    ]);
    const bounds = trimSilence(samples, RATE);
    expect(bounds.start).toBeCloseTo(1.5, 1);
    expect(bounds.end).toBeCloseTo(3.5, 1);
  });

  test('keeps a pause inside the reading', () => {
    const samples = signal([
      { seconds: 1.0, amplitude: 0 },
      { seconds: 1.0, amplitude: 0.3 },
      { seconds: 1.0, amplitude: 0 },
      { seconds: 1.0, amplitude: 0.3 },
      { seconds: 1.0, amplitude: 0 },
    ]);
    const bounds = trimSilence(samples, RATE);
    expect(bounds.start).toBeCloseTo(1.0, 1);
    expect(bounds.end).toBeCloseTo(4.0, 1);
  });

  test('a recording with no speech is returned whole', () => {
    const samples = signal([{ seconds: 3, amplitude: 0 }]);
    expect(trimSilence(samples, RATE)).toEqual({ start: 0, end: 3 });
  });

  test('quiet speech over a louder noise floor is still found', () => {
    const samples = signal(
      [
        { seconds: 1.0, amplitude: 0 },
        { seconds: 2.0, amplitude: 0.08 },
        { seconds: 1.0, amplitude: 0 },
      ],
      0.02,
    );
    const bounds = trimSilence(samples, RATE);
    expect(bounds.start).toBeCloseTo(1.0, 1);
    expect(bounds.end).toBeCloseTo(3.0, 1);
  });
});

describe('Where to start playing a word', () => {
  test('speech onsets are the ends of pauses, and offsets their starts', () => {
    const rate = 1000;
    const samples = new Float32Array(3 * rate);
    for (let i = 500; i < 1200; i++) samples[i] = Math.sin(i) * 0.5;
    for (let i = 1800; i < 2600; i++) samples[i] = Math.sin(i) * 0.5;
    expect(speechOnsets(samples, rate).map((s) => Math.round(s * 100) / 100)).toEqual([0.5, 1.8]);
    expect(speechOffsets(samples, rate).map((s) => Math.round(s * 100) / 100)).toEqual([1.2, 2.6]);
  });

  test('a late word start snaps back to the phrase starting just before it, or else starts half a second early', () => {
    expect(playFrom(2.26, [0.1, 1.98, 4.02])).toBeCloseTo(1.93);
    expect(playFrom(3.1, [0.1, 1.98, 4.02])).toBeCloseTo(2.6);
    expect(playFrom(0.2, [])).toBe(0);
  });
});
