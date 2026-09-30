import { countWords } from '../analysis/words';
import type { MarkKind } from '../domain/types';

/** A piece of passage text as printed. `word` is its position in `passageWords`, absent for bare punctuation. */
export interface LayoutToken {
  text: string;
  word?: number;
}

/**
 * The passage version's text as the teacher sees it on paper: paragraphs of lines of tokens,
 * keeping the line breaks the import or the teacher gave it. Numbering follows `passageWords`,
 * so the word a teacher taps is the word a mark points at.
 */
export function layoutPassage(text: string): LayoutToken[][][] {
  let next = 0;
  return text
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split('\n')
        .map((line) =>
          line
            .split(/\s+/)
            .filter((t) => t.length > 0)
            .map((t) => (countWords(t) > 0 ? { text: t, word: next++ } : { text: t })),
        )
        .filter((line) => line.length > 0),
    )
    .filter((paragraph) => paragraph.length > 0);
}

/** How one token of a line is drawn when marks sit next to each other. */
export interface TokenBand {
  kind?: MarkKind;
  /** The band carries on from the token before, across the gap between them. */
  joinsPrev: boolean;
  joinsNext: boolean;
}

/**
 * Marks of one kind on neighbouring words of a printed line draw as one band, so a skipped
 * phrase reads as one stretch; punctuation between two of them is inside it. A band ends
 * at the end of the line.
 */
export function lineBands(line: LayoutToken[], kindOf: (word: number) => MarkKind | undefined): TokenBand[] {
  const kinds = line.map((t) => (t.word !== undefined ? kindOf(t.word) : undefined));
  const nearest = (from: number, step: 1 | -1) => {
    for (let i = from; i >= 0 && i < line.length; i += step) if (line[i].word !== undefined) return kinds[i];
    return undefined;
  };
  const band = line.map((t, i) => {
    if (t.word !== undefined) return kinds[i];
    const before = nearest(i - 1, -1);
    return before && before === nearest(i + 1, 1) ? before : undefined;
  });
  return band.map((kind, i) => ({
    kind,
    joinsPrev: !!kind && band[i - 1] === kind,
    joinsNext: !!kind && band[i + 1] === kind,
  }));
}
