import { alignWords, type Emissions } from './ctc';

const FRAME = 0.02;
const VOCAB = ['<pad>', '|', 'A', 'B', 'C', 'D'];

/**
 * Emissions that say `letter` at the given frames and blank everywhere else, like a CTC
 * model's peaky output. `noise` frames look like speech that is none of the letters' words.
 */
function emissions(frames: number, said: Record<number, string>, noise: number[] = []): Emissions {
  const V = VOCAB.length;
  const logProbs = new Float32Array(frames * V).fill(Math.log(1e-6));
  for (let t = 0; t < frames; t++) {
    const top = said[t] ? VOCAB.indexOf(said[t]) : noise.includes(t) ? VOCAB.indexOf('D') : 0;
    logProbs[t * V + top] = Math.log(0.95);
  }
  return { model: 'test', frameSeconds: FRAME, frames, vocabSize: V, logProbs, blank: 0, space: 1, letters: { A: 2, B: 3, C: 4, D: 5 } };
}

const seconds = (r: { start: number; end: number } | undefined) => r && [Math.round(r.start / FRAME), Math.round(r.end / FRAME)];

test('each word lands on the frames where its letters were said', () => {
  const em = emissions(60, { 10: 'A', 11: 'A', 13: 'B', 30: 'C', 31: 'C' });
  expect(alignWords(em, ['ab', 'c'], 0, 60 * FRAME).map(seconds)).toEqual([
    [10, 14],
    [30, 32],
  ]);
});

test('speech that is none of the words is passed over, not stretched into them', () => {
  const em = emissions(80, { 10: 'A', 12: 'B', 50: 'C' }, [20, 21, 22, 23, 24, 25]);
  expect(alignWords(em, ['ab', 'c'], 0, 80 * FRAME).map(seconds)).toEqual([
    [10, 13],
    [50, 51],
  ]);
});

test('only the window asked for is searched', () => {
  const em = emissions(80, { 10: 'C', 60: 'C' });
  expect(alignWords(em, ['c'], 40 * FRAME, 80 * FRAME).map(seconds)).toEqual([[60, 61]]);
});

test('a word the model cannot spell, or cannot find, comes back without a time', () => {
  const em = emissions(60, { 10: 'A', 30: 'C' });
  const [a, digits, b, c] = alignWords(em, ['a', '42', 'b', 'c'], 0, 60 * FRAME);
  expect(seconds(a)).toEqual([10, 11]);
  expect(digits).toBeUndefined();
  expect(b).toBeUndefined();
  expect(seconds(c)).toEqual([30, 31]);
});
