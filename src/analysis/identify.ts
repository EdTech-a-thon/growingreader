import type { Id, Identification } from '../domain/types';
import { tokenize } from './words';

// Guesses until tuned on real recordings.
/** Lowest similarity at which the top passage may be auto-assigned. */
export const IDENTIFY_FLOOR = 0.35;
/** How far the top passage must beat the runner-up to be auto-assigned. */
export const IDENTIFY_MARGIN = 0.1;
const MAX_CANDIDATES = 3;

/** Length of the longest common subsequence of two token lists. */
export function lcsLength(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  let prev = new Uint16Array(b.length + 1);
  let cur = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** 0..1: twice the common subsequence over the combined length (Levenshtein-style over word tokens). */
export function similarity(a: string[], b: string[]): number {
  if (a.length + b.length === 0) return 0;
  return (2 * lcsLength(a, b)) / (a.length + b.length);
}

export function passageSimilarity(textA: string, textB: string): number {
  return similarity(tokenize(textA), tokenize(textB));
}

/**
 * Score the transcript against every stored passage. Auto-assign only when the best
 * clears the floor and beats the runner-up by the margin; otherwise offer the top few.
 */
export function identifyPassage(transcriptTokens: string[], passages: Array<{ id: Id; text: string }>): Identification {
  const scored = passages
    .map((p) => ({ passageId: p.id, score: similarity(transcriptTokens, tokenize(p.text)) }))
    .sort((x, y) => y.score - x.score);
  const candidates = scored.slice(0, MAX_CANDIDATES);
  const [top, next] = candidates;
  const autoAssigned = !!top && top.score >= IDENTIFY_FLOOR && (next === undefined || top.score - next.score >= IDENTIFY_MARGIN);
  return { candidates, autoAssigned };
}
