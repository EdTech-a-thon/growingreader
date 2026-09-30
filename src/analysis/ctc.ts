/**
 * Forced alignment of known words to a character-CTC model's frame log-probabilities
 * (wav2vec2-base-960h: A–Z, apostrophe, "|" between words). Given what was said, find when.
 * docs/research/word-timing-and-passage-alignment.md for why and how well.
 *
 * States run G0, [word 0], G1, [word 1], … Gn. A word is the usual CTC chain (blank, letter,
 * blank, letter, …, blank). A G state between words absorbs silence and any speech that is
 * not one of the words (a cough, a mumble the teacher left out), at a small cost per frame
 * for speech. A word can be skipped at a large cost, so one the model cannot find does not
 * drag its neighbours out of place; it comes back without a time.
 *
 * Aligning what a recogniser heard is stricter (`strict`): it heard every word it wrote, so
 * none is skipped, and the speech between them is theirs, so a G state holds only silence.
 * A misheard word ("Salmon" over "Sam and") then stretches over the speech it was heard in.
 */

export interface Emissions {
  /** The model that made them, for the record kept with the timings. */
  model: string;
  frameSeconds: number;
  frames: number;
  vocabSize: number;
  /** frames × vocabSize log-probabilities, row by row. */
  logProbs: Float32Array;
  blank: number;
  /** The word separator, "|". */
  space: number;
  /** Vocabulary id of each letter the model spells with (upper case, and "'"). */
  letters: Record<string, number>;
}

/** Cost per frame of speech in a G state: talk that is none of the words. */
const GARBAGE_PENALTY = 1;
/** Cost of leaving a word out altogether. */
const SKIP_PENALTY = 8;

type State = { kind: 'g'; word: number } | { kind: 'blank'; word: number } | { kind: 'letter'; word: number; id: number };

/** What the model can spell of a word; empty for one it cannot (digits, symbols). */
export function spell(word: string, em: Emissions): number[] {
  return [...word.toUpperCase().replace(/[’‘]/g, "'")].flatMap((c) => (em.letters[c] !== undefined ? [em.letters[c]] : []));
}

/**
 * When each of `words` was said, between `from` and `to` seconds. A word the model cannot
 * spell, or that alignment skips, comes back undefined.
 */
export function alignWords(em: Emissions, words: string[], from: number, to: number, strict = false): Array<{ start: number; end: number } | undefined> {
  const garbagePenalty = strict ? Infinity : GARBAGE_PENALTY;
  const f0 = Math.max(0, Math.floor(from / em.frameSeconds));
  const f1 = Math.min(em.frames, Math.ceil(to / em.frameSeconds));
  const spelled = words.map((w) => spell(w, em));
  const out: Array<{ start: number; end: number } | undefined> = words.map(() => undefined);
  const aligned = spelled.flatMap((s, i) => (s.length > 0 ? [i] : []));
  if (aligned.length === 0 || f1 - f0 < 2) return out;

  const states: State[] = [];
  const gIndex: number[] = [];
  const wordStart: number[] = [];
  const wordEnd: number[] = [];
  aligned.forEach((w, k) => {
    gIndex.push(states.length);
    states.push({ kind: 'g', word: k });
    wordStart.push(states.length);
    for (const id of spelled[w]) states.push({ kind: 'blank', word: k }, { kind: 'letter', word: k, id });
    states.push({ kind: 'blank', word: k });
    wordEnd.push(states.length - 1);
  });
  gIndex.push(states.length);
  states.push({ kind: 'g', word: aligned.length });
  const S = states.length;

  const preds: number[][] = states.map(() => []);
  aligned.forEach((_, k) => {
    const a = wordStart[k];
    const e = wordEnd[k];
    for (let i = a; i <= e; i++) {
      preds[i].push(i);
      if (i > a) preds[i].push(i - 1);
      const s = states[i];
      const two = states[i - 2];
      if (s.kind === 'letter' && i - 2 >= a && two.kind === 'letter' && two.id !== s.id) preds[i].push(i - 2);
    }
    preds[a].push(gIndex[k]);
    preds[a + 1].push(gIndex[k]);
    preds[gIndex[k + 1]].push(e, e - 1);
  });
  for (const g of gIndex) preds[g].push(g);

  const V = em.vocabSize;
  const lp = em.logProbs;
  const emit = (t: number, s: number): number => {
    const x = states[s];
    const row = t * V;
    if (x.kind === 'blank') return lp[row + em.blank];
    if (x.kind === 'letter') return lp[row + x.id];
    let speech = -Infinity;
    for (let k = 0; k < V; k++) if (k !== em.blank && k !== em.space) speech = Math.max(speech, lp[row + k]);
    return Math.max(lp[row + em.blank], lp[row + em.space], speech - garbagePenalty);
  };

  const T = f1 - f0;
  let prev = new Float64Array(S).fill(-Infinity);
  let cur = new Float64Array(S);
  const back = new Int32Array(T * S).fill(-1);
  prev[gIndex[0]] = emit(f0, gIndex[0]);
  prev[wordStart[0]] = emit(f0, wordStart[0]);
  prev[wordStart[0] + 1] = emit(f0, wordStart[0] + 1);
  for (let t = 1; t < T; t++) {
    for (let s = 0; s < S; s++) {
      let best = -Infinity;
      let arg = -1;
      for (const p of preds[s]) if (prev[p] > best) ((best = prev[p]), (arg = p));
      cur[s] = best === -Infinity ? -Infinity : best + emit(f0 + t, s);
      back[t * S + s] = arg;
    }
    // Skipping a word: one G state straight to the next, within the same frame.
    for (let k = 0; !strict && k < aligned.length; k++) {
      const g = gIndex[k];
      const gn = gIndex[k + 1];
      if (cur[g] - SKIP_PENALTY > cur[gn]) {
        cur[gn] = cur[g] - SKIP_PENALTY;
        back[t * S + gn] = back[t * S + g];
      }
    }
    [prev, cur] = [cur, prev];
  }

  // End in the last G state, or in the last word's final states if the window cut it short.
  let s = gIndex[aligned.length];
  for (const c of [wordEnd[aligned.length - 1], wordEnd[aligned.length - 1] - 1]) if (prev[c] > prev[s]) s = c;
  if (prev[s] === -Infinity) return out;
  const firstFrame = aligned.map(() => -1);
  const lastFrame = aligned.map(() => -1);
  for (let t = T - 1; t >= 0; t--) {
    const x = states[s];
    if (x.kind === 'letter') {
      if (lastFrame[x.word] < 0) lastFrame[x.word] = t;
      firstFrame[x.word] = t;
    }
    if (t > 0) s = back[t * S + s];
    if (s < 0) break;
  }
  aligned.forEach((w, k) => {
    if (firstFrame[k] < 0) return;
    out[w] = { start: (f0 + firstFrame[k]) * em.frameSeconds, end: (f0 + lastFrame[k] + 1) * em.frameSeconds };
  });
  return out;
}
