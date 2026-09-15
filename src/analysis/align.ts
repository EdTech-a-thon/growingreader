import type { Bounds, CompletionAssessment, TranscriptWord } from '../domain/types';
import { countWords, tokenize } from './words';

// Guesses until tuned on real recordings.
const MATCH = 1.0;
/** Cost of a transcript token that matches nothing (sounding-out, ASR noise). */
const SKIP_TRANSCRIPT = 0.4;
/** Cost per passage word skipped when moving forward. */
const FORWARD_GAP = 0.3;
/** Cost of jumping backward (a restart), plus a little per word jumped. */
const RESTART = 1.5;
const BACK_PER_WORD = 0.05;
/** Fraction of the passage that must be reached before a reading looks complete. */
export const COMPLETION_COVERAGE = 0.9;

export interface AlignedPair {
  /** Index into the transcript words. */
  word: number;
  /** Index into the passage's words, counted the way the word count counts them. */
  passageWord: number;
}

export interface Alignment {
  pairs: AlignedPair[];
  passageWordCount: number;
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  return a.length >= 4 && b.length >= 4 && editDistanceAtMostOne(a, b);
}

/**
 * Dynamic-programming alignment of transcript words onto the passage that forgives
 * restarts: a transcript token may match a passage position behind the last match
 * for a modest cost, so "Sam and Pam went to — Sam and Pam went to camp" still lands on camp.
 */
export function alignToPassage(words: TranscriptWord[], passageText: string): Alignment {
  // A hyphenated passage word is one word to the teacher but may be several tokens to the aligner.
  const passageWords = passageText.split(/\s+/).filter((w) => countWords(w) > 0);
  const passage: string[] = [];
  const passageWordOf: number[] = [];
  passageWords.forEach((w, i) => tokenize(w).forEach((t) => (passage.push(t), passageWordOf.push(i))));
  const P = passage.length;
  const tokens: Array<{ text: string; word: number }> = [];
  words.forEach((w, word) => tokenize(w.text).forEach((text) => tokens.push({ text, word })));
  const T = tokens.length;
  if (P === 0 || T === 0) return { pairs: [], passageWordCount: passageWords.length };

  // score[i][j+1]: best score after i transcript tokens with last match at passage j (j = -1 → none yet).
  const W = P + 1;
  const NEG = -Infinity;
  let prev = new Float64Array(W).fill(NEG);
  prev[0] = 0;
  const back = new Int32Array((T + 1) * W).fill(-2); // -2 unreachable, -1 skip, else previous j+1
  const positionOf = (j: number) => j + 1;

  for (let i = 0; i < T; i++) {
    const cur = new Float64Array(W).fill(NEG);
    // Skipping the transcript token keeps the position.
    for (let s = 0; s < W; s++) {
      if (prev[s] === NEG) continue;
      cur[s] = prev[s] - SKIP_TRANSCRIPT;
      back[(i + 1) * W + s] = -1;
    }
    // Forward moves: best over s < k+1 of prev[s] - FORWARD_GAP * (k - s) ; s is j+1 so gap = k - j - 1 = k - s.
    const prefixBest = new Float64Array(W).fill(NEG);
    const prefixArg = new Int32Array(W).fill(-2);
    for (let s = 0; s < W; s++) {
      const v = prev[s] === NEG ? NEG : prev[s] + FORWARD_GAP * s;
      if (s > 0 && prefixBest[s - 1] >= v) {
        prefixBest[s] = prefixBest[s - 1];
        prefixArg[s] = prefixArg[s - 1];
      } else {
        prefixBest[s] = v;
        prefixArg[s] = s;
      }
    }
    // Backward moves (restart): best over s >= k+1 of prev[s] - RESTART - BACK_PER_WORD * (s - 1 - k).
    const suffixBest = new Float64Array(W).fill(NEG);
    const suffixArg = new Int32Array(W).fill(-2);
    for (let s = W - 1; s >= 0; s--) {
      const v = prev[s] === NEG ? NEG : prev[s] - BACK_PER_WORD * s;
      if (s < W - 1 && suffixBest[s + 1] > v) {
        suffixBest[s] = suffixBest[s + 1];
        suffixArg[s] = suffixArg[s + 1];
      } else {
        suffixBest[s] = v;
        suffixArg[s] = s;
      }
    }
    const token = tokens[i].text;
    for (let k = 0; k < P; k++) {
      if (!tokensMatch(token, passage[k])) continue;
      const pos = positionOf(k);
      let best = NEG;
      let arg = -2;
      if (prefixBest[pos - 1] !== NEG) {
        best = prefixBest[pos - 1] - FORWARD_GAP * k + MATCH;
        arg = prefixArg[pos - 1];
      }
      if (suffixBest[pos] !== NEG) {
        const v = suffixBest[pos] - RESTART + BACK_PER_WORD * pos + MATCH;
        if (v > best) {
          best = v;
          arg = suffixArg[pos];
        }
      }
      if (best > cur[pos]) {
        cur[pos] = best;
        back[(i + 1) * W + pos] = arg;
      }
    }
    prev = cur;
  }

  let s = 0;
  for (let k = 1; k < W; k++) if (prev[k] > prev[s]) s = k;
  const pairs: AlignedPair[] = [];
  for (let i = T; i > 0; i--) {
    const b = back[i * W + s];
    if (b === -1) continue;
    pairs.push({ word: tokens[i - 1].word, passageWord: passageWordOf[s - 1] });
    s = b;
  }
  pairs.reverse();
  return { pairs, passageWordCount: passageWords.length };
}

/** "Reached word N of M" from the furthest aligned passage token; flags probable incompletion below the coverage floor. */
export function assessCompletion(words: TranscriptWord[], passageText: string): CompletionAssessment {
  const alignment = alignToPassage(words, passageText);
  const ofWords = alignment.passageWordCount;
  const reachedWord = alignment.pairs.reduce((max, p) => Math.max(max, p.passageWord + 1), 0);
  return { reachedWord, ofWords, probablyIncomplete: ofWords === 0 || reachedWord / ofWords < COMPLETION_COVERAGE };
}

/** Start of the first aligned word to end of the last aligned word, or nothing if nothing aligned. */
export function refineTiming(alignment: Alignment, words: TranscriptWord[]): Bounds | undefined {
  if (alignment.pairs.length === 0) return undefined;
  const first = words[alignment.pairs[0].word];
  const last = words[alignment.pairs[alignment.pairs.length - 1].word];
  return { start: first.start, end: last.end };
}
