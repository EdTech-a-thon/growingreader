const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/**
 * The passage's words as the teacher counts them on paper, in order: whitespace-separated,
 * edge punctuation stripped, empty tokens dropped. A mark points at a position in this list.
 */
export function passageWords(text: string): string[] {
  return text
    .split(/\s+/)
    .map((t) => t.replace(EDGE_PUNCTUATION, ''))
    .filter((t) => t.length > 0);
}

/**
 * Passage word count as the teacher would count it on paper: split on whitespace,
 * strip punctuation, a hyphenated token is one word. The title is not part of `text`.
 */
export function countWords(text: string): number {
  return passageWords(text).length;
}

/** Normalised tokens for transcript/passage alignment: lowercase, hyphens split, inner apostrophes kept. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-–—]+/)
    .map((t) => t.replace(EDGE_PUNCTUATION, '').replace(/[’‘]/g, "'"))
    .filter((t) => t.length > 0);
}
