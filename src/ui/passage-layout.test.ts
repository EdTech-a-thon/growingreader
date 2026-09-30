import type { MarkKind } from '../domain/types';
import { layoutPassage, lineBands } from './passage-layout';

const bands = (line: string, marks: Record<number, MarkKind>) =>
  lineBands(layoutPassage(line)[0][0], (w) => marks[w]).map((b) => [b.kind ?? '-', b.joinsPrev, b.joinsNext]);

test('neighbouring marks of one kind join; a lone mark does not', () => {
  expect(bands('Sam and Pam went', { 0: 'error', 1: 'error', 3: 'error' })).toEqual([
    ['error', false, true],
    ['error', true, false],
    ['-', false, false],
    ['error', false, false],
  ]);
});

test('an error and a self-correction side by side stay separate', () => {
  expect(bands('Sam and', { 0: 'error', 1: 'self-correction' })).toEqual([
    ['error', false, false],
    ['self-correction', false, false],
  ]);
});

test('punctuation between two joined words is inside the band', () => {
  expect(bands('tent — flap', { 0: 'error', 1: 'error' })).toEqual([
    ['error', false, true],
    ['error', true, true],
    ['error', true, false],
  ]);
  expect(bands('tent — flap', { 0: 'error' })[1]).toEqual(['-', false, false]);
});
