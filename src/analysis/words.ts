const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/** Whitespace-separated tokens with edge punctuation stripped; empty tokens dropped. */
function wordTokens(text: string): string[] {
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
  return wordTokens(text).length;
}

/** Normalised tokens for transcript/passage alignment: lowercase, hyphens split, inner apostrophes kept. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-–—]+/)
    .map((t) => t.replace(EDGE_PUNCTUATION, '').replace(/[’‘]/g, "'"))
    .filter((t) => t.length > 0);
}
