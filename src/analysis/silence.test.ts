import { trimSilence } from './silence';

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
